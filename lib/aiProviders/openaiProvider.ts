import { AnalysisResult, DrillResult } from "../../types";
import { AIProvider } from "./provider";
import {
  ANALYSIS_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  DRILL_RESPONSE_SCHEMA,
  PROBLEM_EXTRACTION_PROMPT,
  PROBLEM_EXTRACTION_SCHEMA,
  ANALYSIS_PLAN_SCHEMA,
  ANALYSIS_STEPS_CHUNK_SCHEMA,
  ANALYSIS_HEADER_SCHEMA,
  createControlledAnalysisPrompt,
  createDrillPrompt,
  createAnalysisPlanPrompt,
  createStepsChunkPrompt,
  createAnalysisHeaderPrompt,
} from "./prompts";
import {
  createProblemId,
  normalizeStepOrders,
  verifyAnalysis,
  verifySteps,
} from "./analysisUtils";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5-mini-2025-08-07";
const OPENAI_PRO_MODEL = process.env.OPENAI_PRO_MODEL || OPENAI_MODEL;
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? "0") || undefined;

const TIMEOUT_PLAN_MS = 10_000;
const TIMEOUT_HEADER_MS = 25_000;
const TIMEOUT_STEPS_MS = 40_000;
const TIMEOUT_STEPS_TOTAL_MS = 25_000;
const TIMEOUT_FULL_MS = 30_000;
const MAX_RETRIES = 2;

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  constructor(private apiKey: string) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
  }

  private async request(
    prompt: string,
    schema: object,
    imageDataUrl?: string,
    options?: { timeoutMs?: number; model?: string }
  ): Promise<string> {
    const content: any[] = [{ type: "input_text", text: prompt }];

    // 画像がある場合は "image_url" として渡す（data:image/...;base64,... のままOK）
    if (imageDataUrl) {
      content.push({
        type: "input_image",
        image_url: imageDataUrl,
      });
    }

    const payload: any = {
      model: options?.model || OPENAI_MODEL,
      input: [
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "result",
          strict: true,
          schema,
        },
      },
      ...(OPENAI_MAX_OUTPUT_TOKENS ? { max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS } : {}),
      // gpt-5-mini は temperature 非対応なので入れない
    };

    const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timeoutMs = options?.timeoutMs ?? 0;
    const timeoutId =
      controller && timeoutMs
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${body}`);
    }

    const body = await response.json();

    // ★ここ重要：いまは「レスポンス全体JSON」を raw として返してしまってるので、output_text を抜く
    const outText =
      body?.output
        ?.flatMap((o: any) => o?.content ?? [])
        ?.find((c: any) => typeof c?.text === "string")?.text;

    // 念のためフォールバック
    return outText ?? JSON.stringify(body);
  }


  private parseJson<T>(raw: string, context: string): T {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      console.error(`[${this.name}] Non-JSON ${context}:`, raw.slice(0, 300));
      console.error(`[${this.name}] Non-JSON ${context} tail:`, raw.slice(-300));
      throw new Error("AIの出力がJSON形式になりませんでした。もう一度試してね。");
    }

    const candidate = raw.slice(start, end + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      console.error(`[${this.name}] JSON parse failed. length:`, candidate.length);
      console.error(`[${this.name}] JSON head:`, candidate.slice(0, 300));
      console.error(`[${this.name}] JSON tail:`, candidate.slice(-300));
      throw new Error("AIの出力が途中で崩れました。もう一度撮って試してね。");
    }
  }

  async analyze(imageBase64: string): Promise<AnalysisResult> {
    const raw = await this.request(ANALYSIS_PROMPT, ANALYSIS_RESPONSE_SCHEMA, imageBase64);
    console.log(`[${this.name}] raw model text (analyze)`, raw);
    const parsed = this.parseJson<AnalysisResult>(raw, "openai analyze");
    console.log(`[${this.name}] parsed result method_hint`, parsed?.problems?.[0]?.method_hint);
    if (!parsed?.problems?.[0]?.method_hint?.pitch) {
      console.warn(`[${this.name}] method_hint missing in parsed response`);
    }
    return parsed;
  }

  async extractProblemText(imageBase64: string): Promise<string> {
    const raw = await this.request(PROBLEM_EXTRACTION_PROMPT, PROBLEM_EXTRACTION_SCHEMA, imageBase64);
    console.log(`[${this.name}] raw model text (extract problem text)`, raw);
    const parsed = this.parseJson<{ problem_text: string }>(raw, "openai extract problem text");
    if (!parsed?.problem_text) {
      throw new Error("問題文の抽出に失敗しました。もう一度試してね。");
    }
    return parsed.problem_text.trim();
  }

  private async analyzeFromTextInternal(args: {
    problemText: string;
    difficulty: "easy" | "normal" | "hard";
    imageBase64?: string;
  }): Promise<AnalysisResult> {
    const totalStart = Date.now();
    const debugInfo: Record<string, unknown> = {
      provider: this.name,
      headerTimeoutMs: TIMEOUT_HEADER_MS,
      headerAttempts: 0,
      stepsTimeoutMs: TIMEOUT_STEPS_MS,
      stepsChunkInputSize: 0,
      stepsChunkHistory: [] as number[],
      chunkHistory: [] as number[],
      modelsTried: [] as string[],
      stepsEscalated: false,
    };
    const pushModelTried = (model: string) => {
      const list = debugInfo.modelsTried as string[];
      if (list.length === 0 || list[list.length - 1] !== model) {
        list.push(model);
      }
    };
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const wantsEscalation = args.difficulty === "hard" || attempt > 0;
      const modelToUse = wantsEscalation ? OPENAI_PRO_MODEL : OPENAI_MODEL;
      const escalated = modelToUse !== OPENAI_MODEL;
      debugInfo.escalated = escalated;
      debugInfo.retries = attempt;
      debugInfo.model = modelToUse;
      pushModelTried(modelToUse);

      try {
        const planPrompt = createAnalysisPlanPrompt(args.problemText, args.difficulty);
        const planRaw = await this.request(planPrompt, ANALYSIS_PLAN_SCHEMA, undefined, {
          timeoutMs: TIMEOUT_PLAN_MS,
          model: modelToUse,
        });
        const planResult = this.parseJson<{ step_count: number; step_titles: string[] }>(
          planRaw,
          "openai analysis plan"
        );

        const stepCount = Math.max(1, Number(planResult?.step_count || 0));
        const stepTitlesRaw = Array.isArray(planResult?.step_titles) ? planResult.step_titles : [];
        const stepTitles = stepTitlesRaw.filter((title) => typeof title === "string");
        const normalizedCount = Math.min(stepCount, stepTitles.length || stepCount);
        const effectiveTitles =
          stepTitles.length >= normalizedCount
            ? stepTitles.slice(0, normalizedCount)
            : Array.from({ length: normalizedCount }, (_, idx) => `ステップ${idx + 1}`);

        let headerResult:
          | { method_hint: { label: string; pitch: string }; final_answer: string }
          | null = null;
        try {
          debugInfo.headerAttempts = Number(debugInfo.headerAttempts) + 1;
          const headerPrompt = createAnalysisHeaderPrompt({
            problemText: args.problemText,
            difficulty: args.difficulty,
            stepTitles: effectiveTitles,
          });
          debugInfo.headerInputChars = headerPrompt.length;
          pushModelTried(modelToUse);
          const headerRaw = await this.request(headerPrompt, ANALYSIS_HEADER_SCHEMA, undefined, {
            timeoutMs: TIMEOUT_HEADER_MS,
            model: modelToUse,
          });
          headerResult = this.parseJson<{
            method_hint: { label: string; pitch: string };
            final_answer: string;
          }>(headerRaw, "openai analysis header");
        } catch (headerError) {
          console.warn(`[${this.name}] header generation failed, fallback to single-shot`, headerError);
          headerResult = null;
        }

        let chunkSize = 4;
        const stepsStart = Date.now();
        let stepsModelOverride: string | null = null;
        let stepsEscalated = false;
        let steps: AnalysisResult["problems"][number]["steps"] = [];
        const totalSteps = effectiveTitles.length;
        let stepsRetryUsed = false;
        let judgementRetryUsed = false;
        let forceJudgementStep = false;
        const buildStepsOnce = async (): Promise<AnalysisResult["problems"][number]["steps"] | null> => {
          chunkSize = 4;
          while (chunkSize >= 1) {
            try {
              const elapsedSteps = Date.now() - stepsStart;
              if (elapsedSteps > TIMEOUT_STEPS_TOTAL_MS) {
                (debugInfo as any).fallbackReason = "steps_total_timeout";
                return null;
              }
              (debugInfo.stepsChunkHistory as number[]).push(chunkSize);
              (debugInfo.chunkHistory as number[]).push(chunkSize);
              const collected: AnalysisResult["problems"][number]["steps"] = [];
              for (let i = 0; i < totalSteps; i += chunkSize) {
                const slice = effectiveTitles.slice(i, i + chunkSize);
                const startOrder = i + 1;
                const endOrder = startOrder + slice.length - 1;
                const chunkPrompt = createStepsChunkPrompt({
                  problemText: args.problemText,
                  difficulty: args.difficulty,
                  stepTitles: slice,
                  startOrder,
                  endOrder,
                  forceJudgementStep: forceJudgementStep && endOrder === totalSteps,
                });
                debugInfo.stepsChunkInputSize = chunkPrompt.length;
                const stepsModelToUse = stepsModelOverride ?? modelToUse;
                pushModelTried(stepsModelToUse);

                const chunkRaw = await this.request(chunkPrompt, ANALYSIS_STEPS_CHUNK_SCHEMA, undefined, {
                  timeoutMs: TIMEOUT_STEPS_MS,
                  model: stepsModelToUse,
                });
                const chunkResult = this.parseJson<{ steps: AnalysisResult["problems"][number]["steps"] }>(
                  chunkRaw,
                  `openai steps ${startOrder}-${endOrder}`
                );
                const chunkSteps = Array.isArray(chunkResult?.steps) ? chunkResult.steps : [];
                const verification = verifySteps(chunkSteps, { skipFinalStepCheck: true });
                if (!verification.ok) {
                  (debugInfo as any).fallbackReason = "verify_failed";
                  (debugInfo as any).verifyIssuesCount = verification.issues.length;
                  (debugInfo as any).verifyIssuesTop3 = verification.issues.slice(0, 3);
                  const err = new Error(`chunk_verify_failed:${verification.issues.join(",")}`);
                  throw err;
                }
                collected.push(...chunkSteps);
              }
              normalizeStepOrders(collected, 1);
              const fullVerification = verifySteps(collected);
              if (!fullVerification.ok) {
                (debugInfo as any).fallbackReason = "verify_failed";
                (debugInfo as any).verifyIssuesCount = fullVerification.issues.length;
                (debugInfo as any).verifyIssuesTop3 = fullVerification.issues.slice(0, 3);
                if (!judgementRetryUsed && fullVerification.issues.includes("missing_judgement_step")) {
                  judgementRetryUsed = true;
                  forceJudgementStep = true;
                  return null;
                }
                if (!stepsRetryUsed && fullVerification.issues.includes("duplicate_step_similarity")) {
                  stepsRetryUsed = true;
                  return null;
                }
                return null;
              }
              debugInfo.chunkSize = chunkSize;
              debugInfo.stepsEscalated = stepsEscalated;
              debugInfo.stepsModelFinal = stepsModelOverride ?? modelToUse;
              return collected;
            } catch (chunkError) {
              const msg = String((chunkError as Error)?.message || "");
              const isStepsTimeout = msg.includes("Timeout:") && msg.includes("analysis steps");
              if (isStepsTimeout) {
                (debugInfo as any).fallbackReason = "steps_chunk_timeout";
              } else if (msg.includes("JSON") || msg.includes("parse")) {
                (debugInfo as any).fallbackReason = "json_parse_failed";
              } else if (!(debugInfo as any).fallbackReason) {
                (debugInfo as any).fallbackReason = "steps_chunk_failed";
              }
              if (chunkSize === 1 && isStepsTimeout && !stepsEscalated) {
                stepsEscalated = true;
                stepsModelOverride = OPENAI_PRO_MODEL;
                (debugInfo as any).stepsEscalated = true;
                console.warn(`[${this.name}] steps chunk timeout at size=1; retrying with steps escalated model`);
                continue;
              }
              console.warn(`[${this.name}] chunk generation failed, retrying with smaller chunk`, chunkError);
              chunkSize = chunkSize === 4 ? 2 : chunkSize === 2 ? 1 : 0;
            }
          }
          return null;
        };
        const stepsFirst = await buildStepsOnce();
        steps = stepsFirst ?? [];
        if (!steps.length && (stepsRetryUsed || judgementRetryUsed)) {
          steps = (await buildStepsOnce()) ?? [];
        }

        debugInfo.stepsTotalMs = Date.now() - stepsStart;

        if (!steps.length || !headerResult) {
          if (!steps.length && !(debugInfo as any).fallbackReason) {
            (debugInfo as any).fallbackReason = "steps_chunk_failed";
          }
          debugInfo.pipelinePath = "fallback_single_shot";
          const prompt = createControlledAnalysisPrompt(args.problemText, args.difficulty);
          const raw = await this.request(prompt, ANALYSIS_RESPONSE_SCHEMA, args.imageBase64, {
            timeoutMs: TIMEOUT_FULL_MS,
            model: modelToUse,
          });
          console.log(`[${this.name}] raw model text (controlled analysis)`, raw);
          const parsed = this.parseJson<AnalysisResult>(raw, "openai controlled analysis");
          const verification = verifyAnalysis(parsed);
          if (!verification.ok) {
            (debugInfo as any).verifyIssuesCount = verification.issues.length;
            (debugInfo as any).verifyIssuesTop3 = verification.issues.slice(0, 3);
            throw new Error(`analysis_verify_failed:${verification.issues.join(",")}`);
          }
          if ((debugInfo as any).verifyIssuesCount === undefined) {
            (debugInfo as any).verifyIssuesCount = 0;
            (debugInfo as any).verifyIssuesTop3 = [];
          }
          debugInfo.modelFinal = modelToUse;
          debugInfo.totalMs = Date.now() - totalStart;
          parsed._debug = { ...(parsed._debug ?? {}), ...debugInfo };
          return parsed;
        }

        debugInfo.pipelinePath = "chunked";
        debugInfo.modelFinal = modelToUse;
        if ((debugInfo as any).fallbackReason) {
          delete (debugInfo as any).fallbackReason;
        }
        const assembled: AnalysisResult = {
          status: "success",
          problems: [
            {
              id: createProblemId(),
              problem_text: args.problemText,
              steps,
              final_answer: headerResult?.final_answer ?? "",
              method_hint: headerResult?.method_hint ?? { label: "", pitch: "" },
            },
          ],
          _debug: { ...debugInfo },
        };

        const verification = verifyAnalysis(assembled);
        if (!verification.ok) {
          (debugInfo as any).verifyIssuesCount = verification.issues.length;
          (debugInfo as any).verifyIssuesTop3 = verification.issues.slice(0, 3);
          throw new Error(`analysis_verify_failed:${verification.issues.join(",")}`);
        }
        if ((debugInfo as any).verifyIssuesCount === undefined) {
          (debugInfo as any).verifyIssuesCount = 0;
          (debugInfo as any).verifyIssuesTop3 = [];
        }

        debugInfo.totalMs = Date.now() - totalStart;
        return assembled;
      } catch (error) {
        lastError = error;
        console.warn(`[${this.name}] controlled analysis failed attempt=${attempt}`, error);
      }
    }

    throw lastError ?? new Error("AIの出力が途中で崩れました。もう一度撮って試してね。");
  }

  async analyzeFromText(problemText: string, difficulty: "easy" | "normal" | "hard") {
    return this.analyzeFromTextInternal({ problemText, difficulty });
  }

  async analyzeWithControls(args: {
    imageBase64: string;
    problemText: string;
    difficulty: "easy" | "normal" | "hard";
  }): Promise<AnalysisResult> {
    return this.analyzeFromTextInternal(args);
  }

  async generateDrill(originalProblem: string): Promise<DrillResult> {
    const prompt = createDrillPrompt(originalProblem);
    const raw = await this.request(prompt, DRILL_RESPONSE_SCHEMA);
    console.log(`[${this.name}] raw model text (drill)`, raw);
    const parsed = this.parseJson<DrillResult>(raw, "openai drill");
    console.log(`[${this.name}] parsed drill result`, parsed);
    return parsed;
  }
}

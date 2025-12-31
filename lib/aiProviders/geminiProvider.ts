import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, DrillResult } from "../../types";
import { AIProvider } from "./provider";
import {
  ANALYSIS_PROMPT,
  DRILL_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  DRILL_RESPONSE_SCHEMA,
  PROBLEM_EXTRACTION_PROMPT,
  PROBLEM_EXTRACTION_SCHEMA,
  ANALYSIS_PLAN_SCHEMA,
  ANALYSIS_STEPS_CHUNK_SCHEMA,
  createControlledAnalysisPrompt,
  createDrillPrompt,
  createAnalysisPlanPrompt,
  createStepsChunkPrompt,
  createFinalAnswerPrompt,
  FINAL_ANSWER_SCHEMA,
} from "./prompts";
import {
  createProblemId,
  normalizeStepOrders,
  verifyAnalysis,
  verifySteps,
} from "./analysisUtils";

/**
 * モデル切替ポリシー
 * simple: gemini-2.5-flash
 * complex: gemini-3-flash-preview
 * router: gemini-2.5-flash
 *
 * 環境変数があればそちらを優先
 */
const GEMINI_SIMPLE_MODEL = process.env.GEMINI_SIMPLE_MODEL || "gemini-2.5-flash";
const GEMINI_COMPLEX_MODEL =
  process.env.GEMINI_COMPLEX_MODEL || "gemini-3-flash-preview";
const GEMINI_ROUTER_MODEL = process.env.GEMINI_ROUTER_MODEL || "gemini-2.5-flash";
const GEMINI_PRO_MODEL = process.env.GEMINI_PRO_MODEL || GEMINI_COMPLEX_MODEL;
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? "0") || undefined;

const TIMEOUT_PLAN_MS = 10_000;
const TIMEOUT_HEADER_MS = 25_000;
const TIMEOUT_STEPS_MS = 40_000;
const TIMEOUT_STEPS_TOTAL_MS = 25_000;
const TIMEOUT_TOTAL_MS = 35_000;
const TIMEOUT_FULL_MS = 30_000;
const MAX_RETRIES = 2;
const STEPS_EASY = 3;
const STEPS_NORMAL = 4;

// ルーティング用の超小さいスキーマ
const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    route: { type: "string", enum: ["simple", "complex"] },
    confidence: { type: "number" },
    signals: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["route", "confidence", "signals"],
  additionalProperties: false,
} as const;

type RouteResult = {
  route: "simple" | "complex";
  confidence: number;
  signals: string[];
};

const ROUTER_PROMPT = `
あなたは算数問題の難易度ルーターです。
入力画像にある算数の問題を見て、simple か complex に分類してください。

simple の目安
計算が1回から2回程度
条件が少ない
図表やグラフがない もしくは補助程度

complex の目安
図形
表やグラフ
割合 速さ 単位換算
条件が多い
場合分けが必要
推論が必要

出力は JSON のみ
余計な文章は禁止

{
  "route": "simple" | "complex",
  "confidence": 0 から 1,
  "signals": ["根拠を短く最大5つ"]
}
`.trim();

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  constructor(private apiKey?: string) {}

  private ensureKey() {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
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
    } catch (error) {
      console.error(`[${this.name}] JSON parse failed. length:`, candidate.length);
      console.error(`[${this.name}] JSON head:`, candidate.slice(0, 300));
      console.error(`[${this.name}] JSON tail:`, candidate.slice(-300));
      throw new Error("AIの出力が途中で崩れました。もう一度撮って試してね。");
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
    if (!timeoutMs) return promise;
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout: ${context}`)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private buildMethodHint(problemText: string): { label: string; pitch: string } {
    const text = problemText ?? "";
    const lower = text.toLowerCase();

    const unitRateKeywords = ["あたり", "1人あたり", "一人あたり", "こんでいる", "みっしり"];
    if (unitRateKeywords.some((k) => lower.includes(k))) {
      return {
        label: "分配算",
        pitch: "比べたいときは、ちがう量をそのまま見くらべないで、同じ単位にそろえて考えると分かりやすいよ。",
      };
    }

    if (lower.includes("%") || lower.includes("割合") || lower.includes("パーセント")) {
      return {
        label: "割合をそろえる",
        pitch: "割合は基準をそろえると比べやすいよ。何を100%にするかを先に決めると進めやすい。",
      };
    }

    if (lower.includes("比") || lower.includes("比例") || lower.includes("反比例")) {
      return {
        label: "くらべ方をそろえる",
        pitch: "比べるときは、同じものさしにそろえてから見ると違いが分かりやすいよ。",
      };
    }

    if (lower.includes("平均") || lower.includes("ならす")) {
      return {
        label: "平均の考え方",
        pitch: "平均はみんなを同じにそろえる中心だよ。平均との差を考えると整理しやすい。",
      };
    }

    return {
      label: "情報を整理して、同じものさしで比べよう",
      pitch: "比べたいときは、ちがう量をそのまま見くらべないで、同じ単位にそろえて考えると分かりやすいよ。",
    };
  }

  private async generateFinalAnswer(
    problemText: string,
    pushModelTried: (model: string) => void
  ): Promise<string> {
    const prompt = createFinalAnswerPrompt(problemText);
    const models = [GEMINI_SIMPLE_MODEL, GEMINI_COMPLEX_MODEL];
    for (const model of models) {
      try {
        pushModelTried(model);
        const result = await this.generateContent<{ final_answer: string }>({
          contents: [{ text: prompt }],
          schema: FINAL_ANSWER_SCHEMA,
          context: "final answer",
          model,
          timeoutMs: TIMEOUT_HEADER_MS,
        });
        if (result?.final_answer) {
          return result.final_answer;
        }
      } catch (error) {
        if (model === GEMINI_COMPLEX_MODEL) {
          throw error;
        }
      }
    }
    return "";
  }

  private async generateContent<T>(args: {
    contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];
    schema: Parameters<
      GoogleGenAI["models"]["generateContent"]
    >[0]["config"]["responseSchema"];
    context: string;
    model?: string;
    timeoutMs?: number;
  }): Promise<T> {
    this.ensureKey();

    const ai = new GoogleGenAI({ apiKey: this.apiKey! });
    const response = await this.withTimeout(
      ai.models.generateContent({
        model: args.model || GEMINI_COMPLEX_MODEL,
        contents: args.contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: args.schema,
          ...(GEMINI_MAX_OUTPUT_TOKENS ? { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS } : {}),
        },
      }),
      args.timeoutMs ?? 0,
      args.context
    );

    const rawText = response.text ?? "";
    console.log(`[${this.name}] raw model text (${args.context})`, rawText);
    return this.parseJson<T>(rawText, args.context);
  }

  private detectMimeType(imageBase64: string): string {
    // data:image/png;base64,.... のような入力もあるので推定
    const m = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    return m?.[1] || "image/jpeg";
  }

  private async routeProblem(imageBase64: string): Promise<RouteResult> {
    const inlineImage = imageBase64.split(",")[1] || imageBase64;
    const mimeType = this.detectMimeType(imageBase64);

    try {
      const routed = await this.generateContent<RouteResult>({
        contents: [
          { text: ROUTER_PROMPT },
          {
            inlineData: {
              mimeType,
              data: inlineImage,
            },
          },
        ],
        schema: ROUTE_SCHEMA as any,
        context: "route",
        model: GEMINI_ROUTER_MODEL,
      });

      // 念のため変な値は complex に倒す
      if (routed?.route !== "simple" && routed?.route !== "complex") {
        return { route: "complex", confidence: 0, signals: ["invalid_route_value"] };
      }
      return routed;
    } catch (e) {
      console.warn(`[${this.name}] route failed, fallback complex`, e);
      return { route: "complex", confidence: 0, signals: ["route_failed"] };
    }
  }

  async extractProblemText(imageBase64: string): Promise<string> {
    this.ensureKey();
    const inlineImage = imageBase64.split(",")[1] || imageBase64;
    const mimeType = this.detectMimeType(imageBase64);
    const extracted = await this.generateContent<{ problem_text: string }>({
      contents: [
        { text: PROBLEM_EXTRACTION_PROMPT },
        {
          inlineData: {
            mimeType,
            data: inlineImage,
          },
        },
      ],
      schema: PROBLEM_EXTRACTION_SCHEMA as any,
      context: "extract problem text",
      model: GEMINI_COMPLEX_MODEL,
    });

    if (!extracted?.problem_text) {
      throw new Error("問題文の抽出に失敗しました。もう一度試してね。");
    }

    return extracted.problem_text.trim();
  }

  private async analyzeFromTextInternal(args: {
    problemText: string;
    difficulty: "easy" | "normal" | "hard";
    imageBase64?: string;
  }): Promise<AnalysisResult> {
    this.ensureKey();
    const totalStart = Date.now();
    const hasImage =
      typeof args.imageBase64 === "string" && args.imageBase64.trim() !== "";
    const inlineImage = hasImage
      ? args.imageBase64.split(",")[1] || args.imageBase64
      : "";
    const mimeType = hasImage ? this.detectMimeType(args.imageBase64) : "";
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
      const modelToUse = wantsEscalation ? GEMINI_PRO_MODEL : GEMINI_COMPLEX_MODEL;
      const escalated = modelToUse !== GEMINI_COMPLEX_MODEL;
      debugInfo.escalated = escalated;
      debugInfo.retries = attempt;
      debugInfo.model = modelToUse;
      pushModelTried(modelToUse);

      try {
        const totalElapsed = () => Date.now() - totalStart;
        const checkTotalTimeout = () => {
          if (totalElapsed() > TIMEOUT_TOTAL_MS) {
            (debugInfo as any).fallbackReason = "total_timeout";
            return true;
          }
          return false;
        };

        let effectiveTitles: string[] = [];
        if (args.difficulty === "hard") {
          if (checkTotalTimeout()) {
            effectiveTitles = [];
          } else {
            const planPrompt = createAnalysisPlanPrompt(args.problemText, args.difficulty);
            const planResult = await this.generateContent<{ step_count: number; step_titles: string[] }>({
              contents: [{ text: planPrompt }],
              schema: ANALYSIS_PLAN_SCHEMA,
              context: "analysis plan",
              model: modelToUse,
              timeoutMs: TIMEOUT_PLAN_MS,
            });

            const stepCount = Math.max(1, Number(planResult?.step_count || 0));
            const stepTitlesRaw = Array.isArray(planResult?.step_titles) ? planResult.step_titles : [];
            const stepTitles = stepTitlesRaw.filter((title) => typeof title === "string");
            const normalizedCount = Math.min(stepCount, stepTitles.length || stepCount);
            effectiveTitles =
              stepTitles.length >= normalizedCount
                ? stepTitles.slice(0, normalizedCount)
                : Array.from({ length: normalizedCount }, (_, idx) => `ステップ${idx + 1}`);
          }
        } else {
          effectiveTitles = [];
        }

        const methodHint = this.buildMethodHint(args.problemText);

        let chunkSize = 4;
        const stepsStart = Date.now();
        const stepsModelInitial = GEMINI_SIMPLE_MODEL;
        let stepsModelOverride: string | null = null;
        let stepsEscalated = false;
        let steps: AnalysisResult["problems"][number]["steps"] = [];
        debugInfo.stepsModelInitial = stepsModelInitial;
        const totalSteps =
          effectiveTitles.length > 0
            ? effectiveTitles.length
            : args.difficulty === "easy"
              ? STEPS_EASY
              : STEPS_NORMAL;
        const verifyOptions =
          args.difficulty === "hard" ? undefined : { ignoreDuplicateSimilarity: true };
        const chunkVerifyOptions = { ...(verifyOptions ?? {}), skipFinalStepCheck: true };
        let stepsRetryUsed = false;
        let judgementRetryUsed = false;
        let forceJudgementStep = false;
        const buildStepsOnce = async (): Promise<AnalysisResult["problems"][number]["steps"] | null> => {
          chunkSize = args.difficulty === "hard" ? 4 : 2;
          while (chunkSize >= 1) {
            try {
              if (checkTotalTimeout()) {
                return null;
              }
              const elapsedSteps = Date.now() - stepsStart;
              if (elapsedSteps > TIMEOUT_STEPS_TOTAL_MS) {
                (debugInfo as any).fallbackReason = "steps_total_timeout";
                return null;
              }
              (debugInfo.stepsChunkHistory as number[]).push(chunkSize);
              (debugInfo.chunkHistory as number[]).push(chunkSize);
              const collected: AnalysisResult["problems"][number]["steps"] = [];
              for (let i = 0; i < totalSteps; i += chunkSize) {
                const slice =
                  effectiveTitles.length > 0
                    ? effectiveTitles.slice(i, i + chunkSize)
                    : [];
                const startOrder = i + 1;
                const currentCount = Math.min(chunkSize, totalSteps - i);
                const endOrder = startOrder + currentCount - 1;
                const chunkPrompt = createStepsChunkPrompt({
                  problemText: args.problemText,
                  difficulty: args.difficulty,
                  stepTitles: slice,
                  startOrder,
                  endOrder,
                  forceJudgementStep: forceJudgementStep && endOrder === totalSteps,
                });
                debugInfo.stepsChunkInputSize = chunkPrompt.length;
                const stepsModelToUse = stepsModelOverride ?? stepsModelInitial;
                pushModelTried(stepsModelToUse);

                const chunkResult = await this.generateContent<{ steps: AnalysisResult["problems"][number]["steps"] }>({
                  contents: [{ text: chunkPrompt }],
                  schema: ANALYSIS_STEPS_CHUNK_SCHEMA,
                  context: `analysis steps ${startOrder}-${endOrder}`,
                  model: stepsModelToUse,
                  timeoutMs: TIMEOUT_STEPS_MS,
                });

                const chunkSteps = Array.isArray(chunkResult?.steps) ? chunkResult.steps : [];
                const verification = verifySteps(chunkSteps, chunkVerifyOptions);
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
              const fullVerification = verifySteps(collected, verifyOptions);
              if (!fullVerification.ok) {
                (debugInfo as any).fallbackReason = "verify_failed";
                (debugInfo as any).verifyIssuesCount = fullVerification.issues.length;
                (debugInfo as any).verifyIssuesTop3 = fullVerification.issues.slice(0, 3);
                if (!judgementRetryUsed && fullVerification.issues.includes("missing_judgement_step")) {
                  judgementRetryUsed = true;
                  forceJudgementStep = true;
                  return null;
                }
                if (!verifyOptions && !stepsRetryUsed && fullVerification.issues.includes("duplicate_step_similarity")) {
                  stepsRetryUsed = true;
                  return null;
                }
                return null;
              }
              debugInfo.chunkSize = chunkSize;
              debugInfo.stepsEscalated = stepsEscalated;
              debugInfo.stepsModelFinal = stepsModelOverride ?? stepsModelInitial;
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
                stepsModelOverride = GEMINI_COMPLEX_MODEL;
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
        const buildNonHardSteps = async (): Promise<AnalysisResult["problems"][number]["steps"] | null> => {
          const attempts = 2;
          for (let i = 0; i < attempts; i += 1) {
            if (checkTotalTimeout()) {
              return null;
            }
            const elapsedSteps = Date.now() - stepsStart;
            if (elapsedSteps > TIMEOUT_STEPS_TOTAL_MS) {
              (debugInfo as any).fallbackReason = "steps_total_timeout";
              return null;
            }
            (debugInfo.stepsChunkHistory as number[]).push(totalSteps);
            (debugInfo.chunkHistory as number[]).push(totalSteps);
            const chunkPrompt = createStepsChunkPrompt({
              problemText: args.problemText,
              difficulty: args.difficulty,
              stepTitles: [],
              startOrder: 1,
              endOrder: totalSteps,
              forceJudgementStep,
            });
            debugInfo.stepsChunkInputSize = chunkPrompt.length;
            pushModelTried(stepsModelInitial);

            try {
              const chunkResult = await this.generateContent<{ steps: AnalysisResult["problems"][number]["steps"] }>({
                contents: [{ text: chunkPrompt }],
                schema: ANALYSIS_STEPS_CHUNK_SCHEMA,
                context: `analysis steps 1-${totalSteps}`,
                model: stepsModelInitial,
                timeoutMs: TIMEOUT_STEPS_MS,
              });
              const chunkSteps = Array.isArray(chunkResult?.steps) ? chunkResult.steps : [];
              const verification = verifySteps(chunkSteps, chunkVerifyOptions);
              if (!verification.ok) {
                (debugInfo as any).fallbackReason = "verify_failed";
                (debugInfo as any).verifyIssuesCount = verification.issues.length;
                (debugInfo as any).verifyIssuesTop3 = verification.issues.slice(0, 3);
                if (!judgementRetryUsed && verification.issues.includes("missing_judgement_step")) {
                  judgementRetryUsed = true;
                  forceJudgementStep = true;
                  continue;
                }
                continue;
              }
              normalizeStepOrders(chunkSteps, 1);
              debugInfo.chunkSize = totalSteps;
              debugInfo.stepsEscalated = false;
              debugInfo.stepsModelFinal = stepsModelInitial;
              return chunkSteps;
            } catch (err) {
              const msg = String((err as Error)?.message || "");
              if (msg.includes("Timeout:") && msg.includes("analysis steps")) {
                (debugInfo as any).fallbackReason = "steps_chunk_timeout";
              } else if (msg.includes("JSON") || msg.includes("parse")) {
                (debugInfo as any).fallbackReason = "json_parse_failed";
              } else if (!(debugInfo as any).fallbackReason) {
                (debugInfo as any).fallbackReason = "steps_chunk_failed";
              }
            }
          }
          return null;
        };
        if (args.difficulty === "hard") {
          const stepsFirst = await buildStepsOnce();
          steps = stepsFirst ?? [];
          if (!steps.length && (stepsRetryUsed || judgementRetryUsed) && checkTotalTimeout() === false) {
            steps = (await buildStepsOnce()) ?? [];
          }
        } else {
          steps = (await buildNonHardSteps()) ?? [];
        }

        debugInfo.stepsTotalMs = Date.now() - stepsStart;

        if ((debugInfo as any).fallbackReason === "total_timeout") {
          const shortStepsPrompt = createStepsChunkPrompt({
            problemText: args.problemText,
            difficulty: args.difficulty,
            stepTitles: [],
            startOrder: 1,
            endOrder: 3,
          });
          const shortStepsTimeout = Math.min(TIMEOUT_STEPS_MS, 8_000);
          try {
            pushModelTried(stepsModelInitial);
            const shortStepsResult = await this.generateContent<{ steps: AnalysisResult["problems"][number]["steps"] }>({
              contents: [{ text: shortStepsPrompt }],
              schema: ANALYSIS_STEPS_CHUNK_SCHEMA,
              context: "analysis steps short",
              model: stepsModelInitial,
              timeoutMs: shortStepsTimeout,
            });

            const shortSteps = Array.isArray(shortStepsResult?.steps) ? shortStepsResult.steps : [];
            normalizeStepOrders(shortSteps, 1);
            const shortStepsCheck = verifySteps(shortSteps);
            if (!shortStepsCheck.ok) {
              throw new Error(`short_steps_verify_failed:${shortStepsCheck.issues.join(",")}`);
            }

            let finalAnswer = "";
            if (!checkTotalTimeout()) {
              debugInfo.headerAttempts = Number(debugInfo.headerAttempts) + 1;
              debugInfo.headerInputChars = createFinalAnswerPrompt(args.problemText).length;
              finalAnswer = await this.generateFinalAnswer(args.problemText, pushModelTried);
            }
            if (!finalAnswer) {
              throw new Error("final_answer_missing");
            }

            debugInfo.pipelinePath = "total_timeout_short";
            debugInfo.modelFinal = stepsModelInitial;
            (debugInfo as any).fallbackReason = "total_timeout_short";
            debugInfo.totalMs = Date.now() - totalStart;

            const assembled: AnalysisResult = {
              status: "success",
              problems: [
                {
                  id: createProblemId(),
                  problem_text: args.problemText,
                  steps: shortSteps,
                  final_answer: finalAnswer,
                  method_hint: methodHint,
                },
              ],
              _debug: { ...debugInfo },
            };
            return assembled;
          } catch (shortError) {
            console.warn(`[${this.name}] total timeout short path failed, fallback single-shot`, shortError);
          }
        }

        const finalAnswer =
          !checkTotalTimeout()
            ? await this.generateFinalAnswer(args.problemText, pushModelTried)
            : "";

        if (!steps.length || !finalAnswer) {
          if (!steps.length && !(debugInfo as any).fallbackReason) {
            (debugInfo as any).fallbackReason = "steps_chunk_failed";
          }
          debugInfo.pipelinePath = "fallback_single_shot";
          const prompt = createControlledAnalysisPrompt(args.problemText, args.difficulty);
          const contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"] = [
            { text: prompt },
          ];
          if (hasImage) {
            contents.push({
              inlineData: {
                mimeType,
                data: inlineImage,
              },
            });
          }
          const rawResult = await this.generateContent<AnalysisResult>({
            contents,
            schema: ANALYSIS_RESPONSE_SCHEMA,
            context: `controlled analysis difficulty=${args.difficulty}`,
            model: modelToUse,
            timeoutMs: TIMEOUT_FULL_MS,
          });

          const verification = verifyAnalysis(rawResult);
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

          rawResult._debug = { ...(rawResult._debug ?? {}), ...debugInfo };
          return rawResult;
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
              final_answer: finalAnswer,
              method_hint: methodHint,
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

  async analyze(imageBase64: string): Promise<AnalysisResult> {
    // 1 ルーティング判定
    const route = await this.routeProblem(imageBase64);

    // 2 モデル選択
    const modelToUse = route.route === "simple" ? GEMINI_SIMPLE_MODEL : GEMINI_COMPLEX_MODEL;

    const inlineImage = imageBase64.split(",")[1] || imageBase64;
    const mimeType = this.detectMimeType(imageBase64);

    // 3 本解析
    const rawResult = await this.generateContent<AnalysisResult>({
      contents: [
        { text: ANALYSIS_PROMPT },
        {
          inlineData: {
            mimeType,
            data: inlineImage,
          },
        },
      ],
      schema: ANALYSIS_RESPONSE_SCHEMA,
      context: `analysis model=${modelToUse} route=${route.route} conf=${route.confidence}`,
      model: modelToUse,
    });

    console.log(`[${this.name}] route result`, route);
    console.log(`[${this.name}] model used`, modelToUse);
    console.log(`[${this.name}] parsed result method_hint`, rawResult?.problems?.[0]?.method_hint);

    if (!rawResult?.problems?.[0]?.method_hint?.pitch) {
      console.warn(`[${this.name}] method_hint missing in parsed response`);
    }
    return rawResult;
  }

  async generateDrill(originalProblem: string): Promise<DrillResult> {
    const prompt = createDrillPrompt(originalProblem);
    const result = await this.generateContent<DrillResult>({
      contents: [{ parts: [{ text: prompt }] }] as any,
      schema: DRILL_RESPONSE_SCHEMA,
      context: "drill",
      model: GEMINI_SIMPLE_MODEL,
    });
    console.log(`[${this.name}] parsed drill result`, result);
    return result;
  }
}

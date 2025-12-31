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
const TIMEOUT_STEPS_MS = 25_000;
const TIMEOUT_FULL_MS = 30_000;
const MAX_RETRIES = 2;

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

  async analyzeWithControls(args: {
    imageBase64: string;
    problemText: string;
    difficulty: "easy" | "normal" | "hard";
  }): Promise<AnalysisResult> {
    this.ensureKey();
    const inlineImage = args.imageBase64.split(",")[1] || args.imageBase64;
    const mimeType = this.detectMimeType(args.imageBase64);
    const debugInfo: Record<string, unknown> = {
      headerTimeoutMs: TIMEOUT_HEADER_MS,
      headerAttempts: 0,
      stepsTimeoutMs: TIMEOUT_STEPS_MS,
      stepsChunkInputSize: 0,
      stepsChunkHistory: [] as number[],
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const escalated = args.difficulty === "hard" || attempt > 0;
      const modelToUse = escalated ? GEMINI_PRO_MODEL : GEMINI_COMPLEX_MODEL;
      debugInfo.escalated = escalated;
      debugInfo.retries = attempt;
      debugInfo.model = modelToUse;

      try {
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
          headerResult = await this.generateContent<{
            method_hint: { label: string; pitch: string };
            final_answer: string;
          }>({
            contents: [{ text: headerPrompt }],
            schema: ANALYSIS_HEADER_SCHEMA,
            context: "analysis header",
            model: modelToUse,
            timeoutMs: TIMEOUT_HEADER_MS,
          });
        } catch (headerError) {
          console.warn(`[${this.name}] header generation failed, fallback to single-shot`, headerError);
          headerResult = null;
        }

        let chunkSize = 4;
        let steps: AnalysisResult["problems"][number]["steps"] = [];
        while (chunkSize >= 1) {
          try {
            (debugInfo.stepsChunkHistory as number[]).push(chunkSize);
            const collected: AnalysisResult["problems"][number]["steps"] = [];
            for (let i = 0; i < effectiveTitles.length; i += chunkSize) {
              const slice = effectiveTitles.slice(i, i + chunkSize);
              const startOrder = i + 1;
              const endOrder = startOrder + slice.length - 1;
              const chunkPrompt = createStepsChunkPrompt({
                problemText: args.problemText,
                difficulty: args.difficulty,
                stepTitles: slice,
                startOrder,
                endOrder,
              });
              debugInfo.stepsChunkInputSize = chunkPrompt.length;

              const chunkResult = await this.generateContent<{ steps: AnalysisResult["problems"][number]["steps"] }>({
                contents: [{ text: chunkPrompt }],
                schema: ANALYSIS_STEPS_CHUNK_SCHEMA,
                context: `analysis steps ${startOrder}-${endOrder}`,
                model: modelToUse,
                timeoutMs: TIMEOUT_STEPS_MS,
              });

              const chunkSteps = Array.isArray(chunkResult?.steps) ? chunkResult.steps : [];
              const verification = verifySteps(chunkSteps);
              if (!verification.ok) {
                const err = new Error(`chunk_verify_failed:${verification.issues.join(",")}`);
                (debugInfo as any).fallbackReason = "verify_failed";
                throw err;
              }
              collected.push(...chunkSteps);
            }
            normalizeStepOrders(collected, 1);
            steps = collected;
            debugInfo.chunkSize = chunkSize;
            break;
          } catch (chunkError) {
            const msg = String((chunkError as Error)?.message || "");
            if (msg.includes("Timeout")) {
              (debugInfo as any).fallbackReason = "steps_chunk_timeout";
            } else if (msg.includes("JSON") || msg.includes("parse")) {
              (debugInfo as any).fallbackReason = "json_parse_failed";
            } else if (!(debugInfo as any).fallbackReason) {
              (debugInfo as any).fallbackReason = "steps_chunk_failed";
            }
            console.warn(`[${this.name}] chunk generation failed, retrying with smaller chunk`, chunkError);
            chunkSize = chunkSize === 4 ? 2 : chunkSize === 2 ? 1 : 0;
          }
        }

        if (!steps.length || !headerResult) {
          if (!steps.length && !(debugInfo as any).fallbackReason) {
            (debugInfo as any).fallbackReason = "steps_chunk_failed";
          }
          const prompt = createControlledAnalysisPrompt(args.problemText, args.difficulty);
          const rawResult = await this.generateContent<AnalysisResult>({
            contents: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: inlineImage,
                },
              },
            ],
            schema: ANALYSIS_RESPONSE_SCHEMA,
            context: `controlled analysis difficulty=${args.difficulty}`,
            model: modelToUse,
            timeoutMs: TIMEOUT_FULL_MS,
          });

          const verification = verifyAnalysis(rawResult);
          if (!verification.ok) {
            throw new Error(`analysis_verify_failed:${verification.issues.join(",")}`);
          }

          rawResult._debug = { ...(rawResult._debug ?? {}), ...debugInfo };
          return rawResult;
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
          throw new Error(`analysis_verify_failed:${verification.issues.join(",")}`);
        }

        return assembled;
      } catch (error) {
        lastError = error;
        console.warn(`[${this.name}] controlled analysis failed attempt=${attempt}`, error);
      }
    }

    throw lastError ?? new Error("AIの出力が途中で崩れました。もう一度撮って試してね。");
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

import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, DrillResult } from "../../types";
import { AIProvider } from "./provider";
import {
  ANALYSIS_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  DRILL_RESPONSE_SCHEMA,
  PROBLEM_EXTRACTION_PROMPT,
  PROBLEM_EXTRACTION_SCHEMA,
  createAnalysisPrompt,
  createDrillPrompt,
} from "./prompts";

/**
 * モデル切替ポリシー
 * simple: gemini-2.5-flash
 * complex: gemini-3-flash-preview
 * router: gemini-2.5-flash
 *
 * 環境変数があればそちらを優先
 */
const GEMINI_SIMPLE_MODEL = process.env.GEMINI_SIMPLE_MODEL || "gemini-3-flash-preview";
const GEMINI_COMPLEX_MODEL =
  process.env.GEMINI_COMPLEX_MODEL || "gemini-3-flash-preview";
const GEMINI_ROUTER_MODEL = process.env.GEMINI_ROUTER_MODEL || "gemini-2.5-flash";
const GEMINI_PRO_MODEL = process.env.GEMINI_PRO_MODEL || GEMINI_COMPLEX_MODEL;
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? "0") || undefined;
const TIMEOUT_FULL_MS = 30_000;

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

  private async withTimeout<T>(
    run: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    context: string
  ): Promise<T> {
    const controller = new AbortController();
    if (!timeoutMs) {
      return run(controller.signal);
    }
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        const err = new Error(`Timeout: ${context}`);
        (err as any).name = "AbortError";
        reject(err);
      }, timeoutMs);
    });
    try {
      return await Promise.race([run(controller.signal), timeoutPromise]);
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

  private isTimeoutAbort(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const name = (error as { name?: string }).name;
    const message = (error as { message?: string }).message ?? "";
    return name === "AbortError" && message.startsWith("Timeout:");
  }

  private async generateContent<T>(args: {
    contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];
    schema: Parameters<
      GoogleGenAI["models"]["generateContent"]
    >[0]["config"]["responseSchema"];
    context: string;
    model?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
  }): Promise<T> {
    this.ensureKey();

    const ai = new GoogleGenAI({ apiKey: this.apiKey! });
    const maxTokens = args.maxOutputTokens ?? GEMINI_MAX_OUTPUT_TOKENS;
    const response = await this.withTimeout(
      (signal) => {
        const request: any = {
          model: args.model || GEMINI_COMPLEX_MODEL,
          contents: args.contents,
          config: {
            responseMimeType: "application/json",
            responseSchema: args.schema,
            ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
          },
          signal,
        };
        return ai.models.generateContent(request);
      },
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
    metaTags?: string[];
    debug?: boolean;
  }): Promise<AnalysisResult> {
    this.ensureKey();
    const totalStart = Date.now();
    const debugInfo: Record<string, unknown> = {
      provider: this.name,
    };

    const isGeometry = Array.isArray(args.metaTags) && args.metaTags.includes("geometry");
    const defaultMaxOutputTokens =
  isGeometry
    ? 3200
    : args.difficulty === "hard"
      ? 3200
      : args.difficulty === "normal"
        ? 2200
        : 1200;

    const maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS ?? defaultMaxOutputTokens;
    const model =
      args.difficulty === "hard" || isGeometry ? GEMINI_COMPLEX_MODEL : GEMINI_SIMPLE_MODEL;

    const prompt = createAnalysisPrompt(args.problemText);

    const isJsonError = (error: unknown) => {
      const message = (error as Error)?.message ?? "";
      return message.includes("JSON");
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.generateContent<AnalysisResult>({
          contents: [{ text: prompt }],
          schema: ANALYSIS_RESPONSE_SCHEMA,
          context: "solve_single_shot",
          model,
          timeoutMs: TIMEOUT_FULL_MS,
          maxOutputTokens: attempt === 0 ? maxOutputTokens : Math.max(maxOutputTokens + 600, Math.round(maxOutputTokens * 1.5)),
        });
        debugInfo.pipelinePath = "single_shot";
        debugInfo.modelFinal = model;
        debugInfo.totalMs = Date.now() - totalStart;
        result._debug = { ...(result._debug ?? {}), ...debugInfo };
        return result;
      } catch (error) {
        if (this.isTimeoutAbort(error)) {
          throw error;
        }
        if (attempt == 0 && isJsonError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("AIの出力が途中で崩れました。もう一度試してね。");
  }

  async analyzeFromText(
    problemText: string,
    difficulty: "easy" | "normal" | "hard",
    meta?: { tags?: string[] },
    options?: { debug?: boolean }
  ) {
    return this.analyzeFromTextInternal({
      problemText,
      difficulty,
      metaTags: meta?.tags,
      debug: options?.debug,
    });
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

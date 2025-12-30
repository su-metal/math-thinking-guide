import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, DrillResult } from "../../types";
import { AIProvider } from "./provider";
import {
  ANALYSIS_PROMPT,
  DRILL_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  DRILL_RESPONSE_SCHEMA,
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
const GEMINI_SIMPLE_MODEL = process.env.GEMINI_SIMPLE_MODEL || "gemini-2.5-flash";
const GEMINI_COMPLEX_MODEL =
  process.env.GEMINI_COMPLEX_MODEL || "gemini-3-flash-preview";
const GEMINI_ROUTER_MODEL = process.env.GEMINI_ROUTER_MODEL || "gemini-2.5-flash";

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

  private async generateContent<T>(args: {
    contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];
    schema: Parameters<
      GoogleGenAI["models"]["generateContent"]
    >[0]["config"]["responseSchema"];
    context: string;
    model?: string;
  }): Promise<T> {
    this.ensureKey();

    const ai = new GoogleGenAI({ apiKey: this.apiKey! });
    const response = await ai.models.generateContent({
      model: args.model || GEMINI_COMPLEX_MODEL,
      contents: args.contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: args.schema,
      },
    });

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

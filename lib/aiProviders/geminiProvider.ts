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

const GEMINI_MODEL = "gemini-3-flash-preview";

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

  private async generateContent<T>(
    contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
    schema: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["config"]["responseSchema"],
    context: string
  ): Promise<T> {
    this.ensureKey();

    const ai = new GoogleGenAI({ apiKey: this.apiKey! });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const rawText = response.text ?? "";
    console.log(`[${this.name}] raw model text (${context})`, rawText);
    return this.parseJson<T>(rawText, context);
  }

  async analyze(imageBase64: string): Promise<AnalysisResult> {
    const inlineImage = imageBase64.split(",")[1] || imageBase64;
    const rawResult = await this.generateContent<AnalysisResult>(
      [
        { text: ANALYSIS_PROMPT },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: inlineImage,
          },
        },
      ],
      ANALYSIS_RESPONSE_SCHEMA,
      "analysis"
    );

    console.log(`[${this.name}] parsed result method_hint`, rawResult?.problems?.[0]?.method_hint);
    if (!rawResult?.problems?.[0]?.method_hint?.pitch) {
      console.warn(`[${this.name}] method_hint missing in parsed response`);
    }
    return rawResult;
  }

  async generateDrill(originalProblem: string): Promise<DrillResult> {
    const prompt = createDrillPrompt(originalProblem);
    const result = await this.generateContent<DrillResult>(
      [{ parts: [{ text: prompt }] }],
      DRILL_RESPONSE_SCHEMA,
      "drill"
    );
    console.log(`[${this.name}] parsed drill result`, result);
    return result;
  }
}

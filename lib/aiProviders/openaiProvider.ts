import { AnalysisResult, DrillResult } from "../../types";
import { AIProvider } from "./provider";
import {
  ANALYSIS_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  DRILL_RESPONSE_SCHEMA,
  appendImageToPrompt,
  createDrillPrompt,
} from "./prompts";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5-mini-2025-08-07";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  constructor(private apiKey: string) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
  }

  private async request(prompt: string, schema: object, imageDataUrl?: string): Promise<string> {
    const content: any[] = [{ type: "input_text", text: prompt }];

    // 画像がある場合は "image_url" として渡す（data:image/...;base64,... のままOK）
    if (imageDataUrl) {
      content.push({
        type: "input_image",
        image_url: imageDataUrl,
      });
    }

    const payload: any = {
      model: OPENAI_MODEL,
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
      // gpt-5-mini は temperature 非対応なので入れない
    };

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

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

  async generateDrill(originalProblem: string): Promise<DrillResult> {
    const prompt = createDrillPrompt(originalProblem);
    const raw = await this.request(prompt, DRILL_RESPONSE_SCHEMA);
    console.log(`[${this.name}] raw model text (drill)`, raw);
    const parsed = this.parseJson<DrillResult>(raw, "openai drill");
    console.log(`[${this.name}] parsed drill result`, parsed);
    return parsed;
  }
}

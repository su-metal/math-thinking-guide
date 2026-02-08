import { GradeLevel } from "@/lib/education/curriculumData";
import { AnalysisResult, DrillResult, ExtractedProblem } from "../../types";
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
import {
  createProblemId,
  ensureFinalCheckStep,
  needsJudgementStep,
  normalizeStepOrders,
  sanitizeAnswerLeakInSteps,
  verifyAnalysis,
  verifySteps,
} from "./analysisUtils";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5-mini-2025-08-07";
const OPENAI_PRO_MODEL = process.env.OPENAI_PRO_MODEL || OPENAI_MODEL;
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? "0") || undefined;
const OPENAI_EASY_SINGLE_MAX_TOKENS = 800;
const OPENAI_FINAL_ANSWER_MAX_TOKENS = 220;

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

  private isTimeoutAbort(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const name = (error as { name?: string }).name;
    const message = (error as { message?: string }).message ?? "";
    return name === "AbortError" || message.startsWith("Timeout:");
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

  private buildTimeoutSteps(difficulty: "easy" | "normal" | "hard") {
    const base = [
      {
        order: 1,
        hint: "問題の中で、数と単位が書いてあるところを見てみよう。",
        solution: "どの数が何を表すか、言葉で整理できそうだね。どうかな？",
      },
      {
        order: 2,
        hint: "同じ1つ分にそろえるなら、どの数を使うとよさそうかな？",
        solution: "そろえる準備ができると、次の計算が見えてくるよ。進めそうかな？",
      },
      {
        order: 3,
        hint: "求めたいものに合わせて、必要な計算を1つ選んでみよう。",
        solution: "計算した数が何を表すか、言葉で確かめられると安心だね。どうかな？",
      },
    ];
    if (difficulty === "easy") {
      return base;
    }
    return [
      ...base,
      {
        order: 4,
        hint: "出てきた数をまとめて確認しよう。",
        solution: "どの数が最後の言い方に近い形か、言葉でたしかめられると安心だね。どうかな？",
      },
    ];
  }

  private buildTimeoutResult(args: {
    problemText: string;
    difficulty: "easy" | "normal" | "hard";
    finalAnswer?: string;
    debug?: boolean;
    debugInfo: Record<string, unknown>;
    timeoutContext: string;
  }): AnalysisResult {
    const steps = this.buildTimeoutSteps(args.difficulty);
    const fallbackThinking =
      "まず情報を整理して、同じ基準で比べられる形を考えてみよう。";
    const first = steps[0];
    const spackyThinking =
      first && typeof first.hint === "string"
        ? [first.hint, first.solution].filter((t) => typeof t === "string" && t.trim() !== "").join(" ")
        : fallbackThinking;
    steps.shift();
    normalizeStepOrders(steps);
    sanitizeAnswerLeakInSteps(steps);
    ensureFinalCheckStep(steps);

    const finalAnswer =
      args.finalAnswer && args.finalAnswer.trim()
        ? args.finalAnswer
        : "答え：条件に合う数になるよ。\n\n【理由】計算の流れを整理できたら、答えの形にまとめられるよ。";

    if (args.debug) {
      (args.debugInfo as any).timeoutAborted = true;
      (args.debugInfo as any).timeoutContext = args.timeoutContext;
    }

    return {
      status: "success",
      problems: [
        {
          id: createProblemId(),
          problem_text: args.problemText,
          spacky_thinking: spackyThinking,
          steps,
          final_answer: finalAnswer,
        },
      ],
      _debug: { ...args.debugInfo },
    };
  }

  private async request(
    prompt: string,
    schema: object,
    imageDataUrl?: string,
    options?: { timeoutMs?: number; model?: string; maxOutputTokens?: number; context?: string }
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
      ...(options?.maxOutputTokens
        ? { max_output_tokens: options.maxOutputTokens }
        : OPENAI_MAX_OUTPUT_TOKENS
          ? { max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS }
          : {}),
      // gpt-5-mini は temperature 非対応なので入れない
    };

    let timedOut = false;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timeoutMs = options?.timeoutMs ?? 0;
    const timeoutId =
      controller && timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;
    const response = await (async () => {
      try {
        const res = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller?.signal,
        });
        return res;
      } catch (error) {
        if (timedOut) {
          const err = new Error(`Timeout: ${options?.context ?? "openai request"}`);
          (err as any).name = "AbortError";
          throw err;
        }
        throw error;
      }
    })();
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
    return parsed;
  }

  async extractProblemText(imageBase64: string): Promise<ExtractedProblem[]> {
    const raw = await this.request(PROBLEM_EXTRACTION_PROMPT, PROBLEM_EXTRACTION_SCHEMA, imageBase64);
    console.log(`[${this.name}] raw model text (extract problem text)`, raw);
    const parsed = this.parseJson<{ problems?: ExtractedProblem[] } & { problem_text?: string }>(
      raw,
      "openai extract problem text"
    );
    const problems =
      Array.isArray(parsed?.problems) && parsed.problems.length > 0
        ? parsed.problems
        : parsed?.problem_text
          ? [
              {
                id: "p1",
                problem_text: parsed.problem_text.trim(),
              },
            ]
          : [];
    if (problems.length === 0) {
      throw new Error("問題文の抽出に失敗しました。もう一度試してね。");
    }
    return problems;
  }

  private applyForcedJudgementStep(steps: AnalysisResult["problems"][number]["steps"]) {
    if (!Array.isArray(steps) || steps.length === 0) return;
    const last = steps[steps.length - 1];
    last.hint = "計算結果を並べて、どんな違いがあるか見てみよう。";
    last.solution =
      "数字が大きい・小さいで、どちらが大きいか判断できそうだね。どうかな？";
    if (last.calculation) {
      delete last.calculation;
    }
  }

  private async analyzeFromTextInternal(args: {
    problemText: string;
    difficulty: "easy" | "normal" | "hard";
    imageBase64?: string;
    metaTags?: string[];
    debug?: boolean;
    promptAppend?: string;
  }): Promise<AnalysisResult> {
    const totalStart = Date.now();
    const debugInfo: Record<string, unknown> = {
      provider: this.name,
    };
    const prompt = createAnalysisPrompt(args.problemText, args.promptAppend);

    try {
      const raw = await this.request(prompt, ANALYSIS_RESPONSE_SCHEMA, undefined, {
        timeoutMs: TIMEOUT_FULL_MS,
        model: OPENAI_MODEL,
        maxOutputTokens: args.difficulty === "easy" ? OPENAI_EASY_SINGLE_MAX_TOKENS : undefined,
        context: "single_shot",
      });
      const parsed = this.parseJson<AnalysisResult>(raw, "openai analysis single_shot");
      debugInfo.pipelinePath = "single_shot";
      debugInfo.modelFinal = OPENAI_MODEL;
      debugInfo.totalMs = Date.now() - totalStart;
      parsed._debug = { ...(parsed._debug ?? {}), ...debugInfo };
      return parsed;
    } catch (error) {
      if (this.isTimeoutAbort(error)) {
        if (args.debug) {
          console.warn(
            `[${this.name}] timeout abort model=${OPENAI_MODEL}`,
            (error as Error)?.message
          );
        }
        return this.buildTimeoutResult({
          problemText: args.problemText,
          difficulty: args.difficulty,
          debug: args.debug,
          debugInfo,
          timeoutContext: "single_shot",
        });
      }
      throw error;
    }
  }

  async analyzeFromText(
    problemText: string,
    difficulty: "easy" | "normal" | "hard",
    meta?: { tags?: string[] },
    options?: { debug?: boolean; promptAppend?: string; grade?: GradeLevel }
  ) {
    return this.analyzeFromTextInternal({
      problemText,
      difficulty,
      metaTags: meta?.tags,
      debug: options?.debug,
      promptAppend: options?.promptAppend,
    });
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

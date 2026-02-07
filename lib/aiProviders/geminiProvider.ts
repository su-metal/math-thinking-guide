import { GoogleGenAI } from "@google/genai";
import { LevelMeta, Difficulty } from "@/lib/levelEstimator";
import { AnalysisResult, DrillResult, ExtractedProblem } from "../../types";
import { AIProvider } from "./provider";
import {
  ANALYSIS_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  DRILL_RESPONSE_SCHEMA,
  PROBLEM_EXTRACTION_PROMPT,
  PROBLEM_EXTRACTION_SCHEMA,
  OUTLINE_SCHEMA,
  createAnalysisPrompt,
  createOutlinePrompt,
  createDrillPrompt,
  createStepsChunkPrompt,
  ANALYSIS_STEPS_CHUNK_SCHEMA,
} from "./prompts";
import { MathStep } from "../../types";

/**
 * モデル切替ポリシー
 * simple: gemini-2.5-flash
 * complex: gemini-3-flash-preview
 * router: gemini-2.5-flash
 *
 * 環境変数があればそちらを優先
 */
const GEMINI_SIMPLE_MODEL = process.env.GEMINI_SIMPLE_MODEL || "gemini-2.5-flash";
const GEMINI_COMPLEX_MODEL = process.env.GEMINI_COMPLEX_MODEL || "gemini-2.5-flash";
const GEMINI_ROUTER_MODEL = process.env.GEMINI_ROUTER_MODEL || "gemini-2.5-flash";
const GEMINI_PRO_MODEL = process.env.GEMINI_PRO_MODEL || "gemini-3-flash-preview";
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? "0") || undefined;
const TIMEOUT_SINGLE_SHOT_MS = 30_000;
const TIMEOUT_OUTLINE_MS = 12_000;
const TIMEOUT_STEPS_MS = 18_000;

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

type OutlineResult = {
  template: string;
  steps_plan: string[];
  notes: string[];
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

  constructor(private apiKey?: string) { }

  private ensureKey() {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
  }

  private parseJson<T>(raw: string, context: string): T {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1) {
      console.error(`[${this.name}] Non-JSON ${context}:`, raw.slice(0, 300));
      console.error(`[${this.name}] Non-JSON ${context} tail:`, raw.slice(-300));
      throw new Error("AIの出力がJSON形式になりませんでした。もう一度試してね。");
    }

    let candidate = "";
    if (start === 0 && end === -1) {
      candidate = raw;
    } else if (end === -1 || end <= start) {
      // 閉じ括弧がない場合は補完を試みるので、とりあえず全部持っていく
      candidate = raw.slice(start);
    } else {
      candidate = raw.slice(start, end + 1);
    }

    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      // 引用符が閉じられていない場合の簡易補完
      let fixed = candidate;
      const quoteCount = (fixed.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        fixed += '"';
      }

      // 末尾のカンマを取り除く
      fixed = fixed.replace(/,\s*$/, "");

      // 括弧のバランスを補完
      const openBrace = (fixed.match(/{/g) || []).length;
      const closeBrace = (fixed.match(/}/g) || []).length;
      const openBracket = (fixed.match(/\[/g) || []).length;
      const closeBracket = (fixed.match(/]/g) || []).length;
      const braceBalance = openBrace - closeBrace;
      const bracketBalance = openBracket - closeBracket;

      if (braceBalance > 0 || bracketBalance > 0) {
        fixed =
          fixed +
          "]".repeat(Math.max(0, bracketBalance)) +
          "}".repeat(Math.max(0, braceBalance));
        try {
          return JSON.parse(fixed) as T;
        } catch {
          // 再度失敗した場合は元のエラーログへ
        }
      }

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

  private isOutlineGenerationFailed(error: unknown): boolean {
    const message = String((error as { message?: string })?.message ?? error ?? "");
    return message.includes("outline_generation_failed");
  }

  private fixForbiddenOperators(result: AnalysisResult): void {
    if (!result || !Array.isArray(result.problems)) return;
    for (const problem of result.problems) {
      if (!problem || !Array.isArray(problem.steps)) continue;
      for (const step of problem.steps) {
        const calc = step?.calculation;
        if (!calc || typeof calc.expression !== "string") continue;
        if (calc.expression.includes("*") || calc.expression.includes("/") || calc.expression.includes(",")) {
          calc.expression = calc.expression
            .replace(/\*/g, "×")
            .replace(/\//g, "÷")
            .replace(/,/g, " "); // カンマはスペースに置換（"3, 4" -> "3 4" になっても後続のバリデーションで弾ける or 修正可能）
        }
      }
    }
  }

  private hasForbiddenOperators(result: AnalysisResult): boolean {
    if (!result || !Array.isArray(result.problems)) return false;
    for (const problem of result.problems) {
      if (!problem || !Array.isArray(problem.steps)) continue;
      for (const step of problem.steps) {
        const expr = step?.calculation?.expression;
        if (typeof expr !== "string") continue;
        if (expr.trim() === "") continue;
        if (expr.includes("*") || expr.includes("/")) return true;
      }
    }
    return false;
  }

  private isHardProblem(args: { problemText: string; difficulty?: string; signals?: any }): boolean {
    if (args.difficulty === "hard") return true;
    if (typeof args.problemText === "string" && args.problemText.length > 220) return true;
    const numConditions = args?.signals?.num_conditions;
    return typeof numConditions === "number" && numConditions >= 2;
  }

  private normalizeTemplate(template: string): string {
    const base = (template ?? "").split("|")[0]?.trim().toLowerCase() ?? "";
    return base.replace(/[-\s]+/g, "_");
  }

  private hasChoices(problemText?: string): boolean {
    if (typeof problemText !== "string" || problemText.trim() === "") return false;
    const text = problemText;
    return (
      text.includes("選択肢") ||
      text.includes("のうち") ||
      text.includes("どれ") ||
      /[アイウエ]/.test(text) ||
      /[①②③④⑤⑥⑦⑧⑨⑩]/.test(text)
    );
  }

  private getStepsPlanByTemplate(
    template: string,
    meta?: { tags?: string[]; signals?: Record<string, unknown> },
    problemText?: string
  ): string[] {
    const normalized = this.normalizeTemplate(template);
    const choices = this.hasChoices(problemText);
    switch (normalized) {
      case "unit_rate_compare":
      case "multi_step_compare":
        return [
          "基準を決める（1あたり/同じ単位）",
          "Aの基準あたりを出す",
          "Bの基準あたりを出す",
          "数が何を表すか確認（意味づけ、計算なし）",
          "比べて判断（計算なし）",
          ...(choices ? ["選択肢照合（計算なし）"] : []),
        ];
      case "lcm_square":
        return [
          "正方形の条件（たて＝横）を整理（計算なし）",
          "たて側（4cm側）で作れる長さの候補を考える（必要なら計算1回）",
          "横側（6cm側）で作れる長さの候補を考える（必要なら計算1回）",
          "初めてそろう長さを決める（最小公倍数）",
          "数が何を表すか確認（意味づけ、計算なし）",
          ...(choices ? ["選択肢照合（計算なし）"] : []),
        ];
      case "single_calc":
        return [
          "何を求めるかと使う数を整理",
          "1回の計算で求める",
          "数が何を表すか確認（意味づけ、計算なし）",
        ];
      case "geometry_property":
        return [
          "図形の性質や条件を整理",
          "必要な関係を使って値を求める",
          "結果が何を表すか確認（意味づけ、計算なし）",
        ];
      case "other":
      default:
        return [];
    }
  }

  private postProcessSteps(result: AnalysisResult, stepsPlan: string[]): void {
    if (!result || !Array.isArray(result.problems)) return;
    const roleKeywords = ["意味づけ", "照合", "特定", "整理"];
    const textKeywords = [
      "表す", "意味", "単位", "選択肢", "見比べ", "照らし合わせ",
      "特定", "見つける", "書き出す", "どれかな", "整理", "準備"
    ];
    for (const problem of result.problems) {
      if (!problem || !Array.isArray(problem.steps)) continue;
      const canUseRole = stepsPlan.length === problem.steps.length;
      for (let index = 0; index < problem.steps.length; index += 1) {
        const step = problem.steps[index];
        const calc = step?.calculation;
        if (!calc || typeof calc.expression !== "string") continue;
        const expr = calc.expression.trim();
        if (!expr.includes("*") && !expr.includes("/") && /^[0-9.]+$/.test(expr)) {
          delete step.calculation;
          continue;
        }
        const text = `${step?.hint ?? ""} ${step?.solution ?? ""}`;
        const roleHit =
          canUseRole && roleKeywords.some((k) => (stepsPlan[index] ?? "").includes(k));
        const textHit = textKeywords.some((k) => text.includes(k));
        const isMeaningOrChoice = roleHit || textHit;
        if (isMeaningOrChoice) {
          delete step.calculation;
        }
      }
    }
  }

  private sanitizeAnalysisResult(result: AnalysisResult, stepsPlan?: string[]): void {
    if (!result || !Array.isArray(result.problems)) return;
    for (const problem of result.problems) {
      if (!problem || !Array.isArray(problem.steps)) continue;
      for (const step of problem.steps) {
        const calc = step?.calculation;
        if (!calc) continue;
        if (typeof calc.expression !== "string" || calc.expression.trim() === "") {
          delete step.calculation;
          continue;
        }
        if (typeof calc.result !== "number" || !Number.isFinite(calc.result)) {
          delete step.calculation;
        }
      }
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
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    candidateCount?: number;
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
            ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
            ...(typeof args.topP === "number" ? { topP: args.topP } : {}),
            ...(typeof args.candidateCount === "number"
              ? { candidateCount: args.candidateCount }
              : {}),
          },
          signal,
        };
        return ai.models.generateContent(request);
      },
      args.timeoutMs ?? 0,
      args.context
    );

    const rawText =
      (typeof (response as any).text === "string" ? (response as any).text : "") ||
      (response as any).response?.candidates?.[0]?.content?.parts
        ?.map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("") ||
      "";

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

  private async generateOutline(args: {
    problemText: string;
    model: string;
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    candidateCount?: number;
  }): Promise<OutlineResult> {
    const prompt = createOutlinePrompt(args.problemText);
    return this.generateContent<OutlineResult>({
      contents: [{ text: prompt }],
      schema: OUTLINE_SCHEMA as any,
      context: "outline",
      model: args.model,
      timeoutMs: args.timeoutMs ?? TIMEOUT_OUTLINE_MS,
      maxOutputTokens: args.maxOutputTokens ?? 2200,
      temperature: args.temperature,
      candidateCount: args.candidateCount,
    });
  }

  private async generateStepsFromOutline(args: {
    problemText: string;
    outline: OutlineResult;
    model: string;
    maxOutputTokens: number;
    temperature?: number;
    timeoutMs?: number;
    candidateCount?: number;
    chunkIndex: number;
    chunkCount: number;
    stepsPlan: string[];
    stepsPlanSlice: string[];
    stepStartIndex: number;
    difficulty?: "easy" | "normal" | "hard";
  }): Promise<{ steps: MathStep[] }> {
    const outlineText = JSON.stringify(args.outline);
    const append = [
      `この出力はチャンク生成（${args.chunkIndex + 1}/${args.chunkCount}）です。`,
      "このOUTLINEに従い、steps_planの順でstepsを作る。",
      "steps_planの各項目を1ステップに対応させ、順番を変えない。",
      "このチャンクでは stepsPlanSlice の分だけ steps を作る。余計な steps は作らない。",
      `全体 steps_plan: ${JSON.stringify(args.stepsPlan)}`,
      `対象 stepsPlanSlice: ${JSON.stringify(args.stepsPlanSlice)}`,
      `steps の id は step_${String(args.stepStartIndex + 1).padStart(2, "0")} から連番にする。`,
      "同じcalculationを重複させない。",
      "* / は絶対に使わず、× ÷ を使う。",
      "spacky_thinking は必須。steps に整理ステップを入れない。",
      `OUTLINE: ${outlineText}`,
    ].join("\n");
    const prompt = createStepsChunkPrompt({
      problemText: args.problemText,
      difficulty: args.difficulty ?? "normal",
      stepTitles: args.stepsPlanSlice,
      startOrder: args.stepStartIndex + 1,
      endOrder: args.stepStartIndex + args.stepsPlanSlice.length,
    });

    console.log(`[${this.name}] generating steps_chunk ${args.chunkIndex + 1}/${args.chunkCount} (orders ${args.stepStartIndex + 1}-${args.stepStartIndex + args.stepsPlanSlice.length})`);

    return this.generateContent<{ steps: MathStep[] }>({
      contents: [{ text: prompt }],
      schema: ANALYSIS_STEPS_CHUNK_SCHEMA as any,
      context: "outline_steps_chunk",
      model: args.model,
      timeoutMs: args.timeoutMs ?? TIMEOUT_STEPS_MS,
      maxOutputTokens: args.maxOutputTokens,
      temperature: args.temperature,
      candidateCount: args.candidateCount,
    });
  }

  async extractProblemText(imageBase64: string): Promise<ExtractedProblem[]> {
    this.ensureKey();
    const inlineImage = imageBase64.split(",")[1] || imageBase64;
    const mimeType = this.detectMimeType(imageBase64);
    const extracted = await this.generateContent<{ problems?: ExtractedProblem[] } & { problem_text?: string }>({
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

    const problems =
      Array.isArray(extracted?.problems) && extracted.problems.length > 0
        ? extracted.problems
        : extracted?.problem_text
          ? [
            {
              id: "p1",
              problem_text: extracted.problem_text.trim(),
            },
          ]
          : [];

    if (problems.length === 0) {
      throw new Error("問題文の抽出に失敗しました。もう一度試してね。");
    }

    return problems;
  }

  private async analyzeFromTextInternal(args: {
    problemText: string;
    difficulty: "easy" | "normal" | "hard";
    imageBase64?: string;
    metaTags?: string[];
    metaSignals?: Record<string, unknown>;
    debug?: boolean;
    promptAppend?: string;
    isPro?: boolean;
  }): Promise<AnalysisResult> {
    this.ensureKey();
    const totalStart = Date.now();
    const debugInfo: Record<string, unknown> = {
      provider: this.name,
    };

    const isGeometry = Array.isArray(args.metaTags) && args.metaTags.includes("geometry");
    // solve は JSON 完走が最優先。3200は不足しやすいので引き上げる。
    const defaultMaxOutputTokens =
      isGeometry
        ? 8192
        : args.difficulty === "hard"
          ? 8192
          : args.difficulty === "normal"
            ? 6144
            : 4096;

    const maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS ?? defaultMaxOutputTokens;
    let model =
      args.difficulty === "hard" || isGeometry ? GEMINI_COMPLEX_MODEL : GEMINI_SIMPLE_MODEL;

    // Pro フラグがある場合は最上位モデルで上書き
    if (args.isPro) {
      model = GEMINI_PRO_MODEL;
    }

    const prompt = createAnalysisPrompt(args.problemText, args.promptAppend);

    const isJsonError = (error: unknown) => {
      const message = (error as Error)?.message ?? "";
      return message.includes("JSON");
    };

    const isHard = this.isHardProblem({
      problemText: args.problemText,
      difficulty: args.difficulty,
      signals: args.metaSignals,
    });

    const runSingleShot = async () => {
      const timeoutMs = 90_000;
      const result = await this.generateContent<AnalysisResult>({
        contents: [{ text: prompt }],
        schema: ANALYSIS_RESPONSE_SCHEMA,
        context: "solve_single_shot",
        model,
        timeoutMs,
        maxOutputTokens,
      });
      this.fixForbiddenOperators(result);
      this.sanitizeAnalysisResult(result);
      const gateOk = !this.hasForbiddenOperators(result);
      if (!gateOk) {
        throw new Error("gate_forbidden_operator");
      }
      debugInfo.pipelinePath = "single_shot";
      debugInfo.modelFinal = model;
      debugInfo.totalMs = Date.now() - totalStart;
      result._debug = { ...(result._debug ?? {}), ...debugInfo };
      return result;
    };

    if (!isHard) {
      try {
        return await runSingleShot();
      } catch (error) {
        if (isJsonError(error)) throw error;
        console.warn(`[${this.name}] Single shot failed or timed out, falling back to outline_steps`, (error as Error).message);
      }
    }

    const runOutlineSteps = async () => {
      console.log(`[${this.name}] outline_steps start`);

      // outlineもリトライする
      let outline: any;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // 1〜2回目は通常、3回目だけトークンを増やして粘る
          const outlineMaxTokens = attempt < 2 ? 2200 : 3200;

          outline = await this.generateOutline({
            problemText: args.problemText,
            model,
            temperature: 0,
            maxOutputTokens: outlineMaxTokens,
            timeoutMs: TIMEOUT_OUTLINE_MS,
            candidateCount: 1,
          });


          console.log(`[${this.name}] outline attempt=${attempt} ok=true`);
          break;
        } catch (error) {
          const timedOut = this.isTimeoutAbort(error);
          const reason = timedOut
            ? "timeout"
            : isJsonError(error)
              ? "json_error"
              : this.isOutlineGenerationFailed(error)
                ? "outline_generation_failed"
                : "unknown";
          console.log(
            `[${this.name}] outline attempt=${attempt} ok=false timeout=${timedOut} reason=${reason}`
          );
          if (attempt === 2) throw error;
        }
      }

      if (!outline) {
        throw new Error("outline_generation_failed");
      }

      const fixedPlan = this.getStepsPlanByTemplate(
        outline.template,
        { tags: args.metaTags, signals: args.metaSignals },
        args.problemText
      );

      const stepsPlan =
        outline.template === "other"
          ? outline.steps_plan
          : fixedPlan.length > 0
            ? fixedPlan
            : outline.steps_plan;

      const normalizedOutline = { ...outline, steps_plan: stepsPlan };

      // steps生成リトライ（ここは今のままでOK）
      try {
        const planLength = stepsPlan.length;
        const baseChunkCount =
          planLength <= 4 ? 2 : planLength <= 8 ? 3 : 4;
        const chunkCount = planLength <= 1 ? 1 : Math.min(baseChunkCount, planLength);
        const sizes: number[] = [];
        const baseSize = Math.floor(planLength / chunkCount);
        const remainder = planLength % chunkCount;
        for (let i = 0; i < chunkCount; i += 1) {
          sizes.push(baseSize + (i < remainder ? 1 : 0));
        }

        const chunkResults: Array<{ steps: MathStep[] } | null> = new Array(chunkCount).fill(null);
        let startIndex = 0;
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
          const size = sizes[chunkIndex];
          const slice = stepsPlan.slice(startIndex, startIndex + size);
          console.log(
            `[${this.name}] steps_chunk start chunk=${chunkIndex + 1}/${chunkCount} range=${startIndex}-${startIndex + size - 1}`
          );
          let chunkResult: { steps: MathStep[] } | null = null;
          for (let chunkAttempt = 0; chunkAttempt < 2; chunkAttempt += 1) {
            try {
              const temperature = chunkAttempt === 0 ? 0.2 : 0;
              const stepsMaxTokens = chunkAttempt === 0 ? 3000 : 4096; // トークンを引き上げ
              const timeoutMs = chunkAttempt === 0 ? 60_000 : 90_000;
              const result = await this.generateStepsFromOutline({
                problemText: args.problemText,
                difficulty: args.difficulty,
                outline: normalizedOutline,
                model,
                maxOutputTokens: stepsMaxTokens,
                temperature,
                timeoutMs,
                candidateCount: 1,
                chunkIndex,
                chunkCount,
                stepsPlan,
                stepsPlanSlice: slice,
                stepStartIndex: startIndex,
              });
              const expectedSteps = slice.length;
              const actualSteps = Array.isArray(result?.steps)
                ? result.steps.length
                : undefined;
              if (actualSteps !== expectedSteps) {
                console.warn(`[${this.name}] steps_count_mismatch: chunk=${chunkIndex+1}, expected=${expectedSteps}, actual=${actualSteps}`);
                throw new Error("steps_count_mismatch");
              }
              console.log(
                `[${this.name}] steps_chunk ok chunk=${chunkIndex + 1}/${chunkCount} attempt=${chunkAttempt}`
              );
              chunkResult = result;
              break;
            } catch (error) {
              const timedOut = this.isTimeoutAbort(error);
              const reason = timedOut
                ? "timeout"
                : isJsonError(error)
                  ? "json_error"
                  : this.isOutlineGenerationFailed(error)
                    ? "outline_generation_failed"
                    : (error as Error)?.message === "steps_count_mismatch"
                      ? "steps_count_mismatch"
                      : "unknown";
              console.log(
                `[${this.name}] steps_chunk fail chunk=${chunkIndex + 1}/${chunkCount} attempt=${chunkAttempt} reason=${reason}`
              );
              if (chunkAttempt === 1) throw error;
            }
          }
          chunkResults[chunkIndex] = chunkResult;
          startIndex += size;
        }

        const baseResultSkeleton: AnalysisResult = {
          status: "success",
          problems: [
            {
              id: "p1",
              problem_text: args.problemText,
              spacky_thinking: outline.notes?.join("\n") || "",
              steps: [] as MathStep[],
              final_answer: "",
            },
          ],
        };

        const mergedProblems = baseResultSkeleton.problems.map((prob) => ({ ...prob }));

        for (const chunkResult of chunkResults) {
          if (!chunkResult || !Array.isArray(chunkResult.steps)) continue;
          // 現状、solveMathProblem は常に1つの問題(p1)を想定
          const mergedProblem = mergedProblems[0];
          mergedProblem.steps.push(...chunkResult.steps);
        }

        const mergedResult: AnalysisResult = {
          ...baseResultSkeleton,
          problems: mergedProblems,
        };

        console.log(`[${this.name}] final mergedResult:`, JSON.stringify(mergedResult, null, 2));

        this.fixForbiddenOperators(mergedResult); // 自動修正を追加
        this.sanitizeAnalysisResult(mergedResult);
        this.postProcessSteps(mergedResult, stepsPlan);
        const gateOk = !this.hasForbiddenOperators(mergedResult);
        const reason = gateOk ? undefined : "forbidden_operator";
        console.log(
          `[${this.name}] outline_steps attempt=0 ok=${gateOk} timeout=false reason=${reason ?? "n/a"}`
        );
        if (!gateOk) {
          throw new Error("gate_forbidden_operator");
        }

        debugInfo.pipelinePath = "outline_steps";
        debugInfo.modelFinal = model;
        debugInfo.totalMs = Date.now() - totalStart;
        mergedResult._debug = { ...(mergedResult._debug ?? {}), ...debugInfo };
        return mergedResult;
      } catch (error) {
        const timedOut = this.isTimeoutAbort(error);
        const reason = timedOut
          ? "timeout"
          : isJsonError(error)
            ? "json_error"
            : this.isOutlineGenerationFailed(error)
              ? "outline_generation_failed"
              : "unknown";
        console.log(
          `[${this.name}] outline_steps attempt=0 ok=false timeout=${timedOut} reason=${reason}`
        );
        throw error;
      }

      throw new Error("AIの出力が途中で崩れました。もう一度試してね。");
    };

    if (!isHard) {
      try {
        return await runSingleShot();
      } catch (error) {
        const shouldFallback =
          this.isTimeoutAbort(error) || isJsonError(error) || (error as Error)?.message?.includes("gate_");
        if (!shouldFallback) {
          throw error;
        }
      }
    } else {
      console.log(`[${this.name}] hard detected -> outline_steps`);
    }

    return runOutlineSteps();

  }

  async analyzeFromText(
    problemText: string,
    difficulty: "easy" | "normal" | "hard",
    meta?: LevelMeta,
    options?: { debug?: boolean; promptAppend?: string; isPro?: boolean }
  ): Promise<AnalysisResult> {
    return this.analyzeFromTextInternal({
      problemText,
      difficulty,
      metaTags: meta?.tags,
      metaSignals: meta?.signals,
      debug: options?.debug,
      promptAppend: options?.promptAppend,
      isPro: options?.isPro,
    });
  }

  async analyzeWithControls(args: {
    imageBase64: string;
    problemText: string;
    difficulty: "easy" | "normal" | "hard";
    isPro?: boolean;
  }): Promise<AnalysisResult> {
    return this.analyzeFromTextInternal({
      problemText: args.problemText,
      difficulty: args.difficulty,
      imageBase64: args.imageBase64,
      isPro: args.isPro,
    });
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

// NOTE:
// This route is kept only for backward compatibility.
// New flow should use /api/read -> /api/solve.


import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/aiProviders/provider";
import { estimateLevel } from "@/lib/levelEstimator";
import { computeExpression } from "@/lib/math/computeExpression";
import { validateCalculations } from "@/lib/routing/qualityGate";
import type { AnalysisResult } from "@/types";

const DEFAULT_ERROR_MESSAGE =
  "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。";

const provider = getAIProvider();

const normalizeCalcExpression = (expression: string) =>
  expression.trim().replace(/\*/g, "×").replace(/\//g, "÷").replace(/\s+/g, " ");

const normalizeCalculationExpressions = (result: AnalysisResult | undefined) => {
  if (!result || !Array.isArray(result.problems)) return;
  for (const problem of result.problems) {
    if (!problem || !Array.isArray(problem.steps)) continue;
    for (const step of problem.steps) {
      const calc = step?.calculation;
      if (!calc || typeof calc.expression !== "string") continue;
      calc.expression = normalizeCalcExpression(calc.expression);
    }
  }
};

const applyCalculationOverrides = (result: AnalysisResult) => {
  if (!result || !Array.isArray(result.problems)) return;
  for (const problem of result.problems) {
    if (!problem || !Array.isArray(problem.steps)) continue;
    for (const step of problem.steps) {
      const calc = step?.calculation;
      if (!calc || typeof calc.expression !== "string") continue;
      const expr = calc.expression;
      if (expr.includes("最小公倍数") || expr.includes("最大公約数")) continue;
      if (!/^[0-9+\-×÷().\s]+$/.test(expr)) continue;
      const computed = computeExpression(expr);
      if (typeof computed === "number") {
        calc.result = computed;
      }
    }
  }
};

const removeMethodHints = (result: AnalysisResult) => {
  if (!result || !Array.isArray(result.problems)) return;
  for (const problem of result.problems) {
    if (problem && "method_hint" in problem) {
      delete (problem as any).method_hint;
    }
  }
};

const FALLBACK_SPACKY_THINKING =
  "まず情報を整理して、同じ基準で比べられる形を考えてみよう。";

const ensureSpackyThinking = (result: AnalysisResult) => {
  if (!result || !Array.isArray(result.problems)) return;
  for (const problem of result.problems) {
    if (!problem) continue;
    const existing =
      typeof problem.spacky_thinking === "string" && problem.spacky_thinking.trim().length > 0;
    if (existing) continue;

    if (Array.isArray(problem.steps) && problem.steps.length > 0) {
      const first = problem.steps[0];
      const parts: string[] = [];
      if (typeof first?.hint === "string") parts.push(first.hint.trim());
      if (typeof first?.solution === "string") parts.push(first.solution.trim());
      const derived = parts.filter(Boolean).join(" ");
      problem.spacky_thinking = derived || FALLBACK_SPACKY_THINKING;
      problem.steps.shift();
      problem.steps.forEach((step, index) => {
        if (step) step.order = index + 1;
      });
    } else {
      problem.spacky_thinking = FALLBACK_SPACKY_THINKING;
    }
  }
};

export async function POST(req: Request) {
  console.log("[/api/analyze] content-type:", req.headers.get("content-type"));

  const rawText = await req.text();
  console.log("[/api/analyze] raw body:", rawText.slice(0, 300));

  let payload: { imageBase64?: string; debug?: boolean } = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    console.error(`[${provider.name}] Failed to parse request body:`, error);
    console.log("[/api/analyze] parsed keys:", null);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  console.log("[/api/analyze] parsed keys:", Object.keys(payload || {}));

  const { imageBase64, debug } = payload;
  if (!imageBase64) {
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  try {
    const extractedProblems = await provider.extractProblemText(imageBase64);
    const problemText = extractedProblems[0]?.problem_text?.trim();
    if (!problemText) {
      return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
    }
    const estimatedMeta = estimateLevel(problemText);

    const retryPromptAppend =
      "前の出力で calculation が壊れていた。calculation を出すのは計算が必要なステップだけ。expression は算数の計算式か「最小公倍数(4と6)」「最大公約数(24と40)」のような日本語だけ、カンマや等号は使わない。最小公倍数/最大公約数の result は定義どおり必ず割り切れる値にする。result は数値のみ。";

    let finalResult: AnalysisResult | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidate = await provider.analyzeFromText(
        problemText,
        estimatedMeta.difficulty,
        estimatedMeta,
        { debug, promptAppend: attempt === 1 ? retryPromptAppend : undefined }
      );

      normalizeCalculationExpressions(candidate as AnalysisResult);
      const validation = validateCalculations(candidate?.problems);
      if (debug) {
        const calcList =
          candidate?.problems?.flatMap((problem) =>
            Array.isArray(problem?.steps)
              ? problem.steps
                  .map((step) => step?.calculation)
                  .filter((calc) => calc && typeof calc.expression === "string")
                  .map((calc) => ({
                    expression: calc!.expression,
                    result: calc!.result,
                  }))
              : []
          ) ?? [];
        const reason = "reason" in validation ? validation.reason : undefined;
        console.log(
          `[${provider.name}] gate check attempt=${attempt} ok=${validation.ok} reason=${reason ?? "n/a"}`,
          calcList
        );
      }
      if (!validation.ok) {
        const reason = "reason" in validation ? validation.reason : "unknown_reason";
        console.warn(
          `[${provider.name}] invalid calculation output, retrying:`,
          reason
        );
        continue;
      }
      finalResult = candidate;
      break;
    }

    if (!finalResult) {
      throw new Error("calculation_validation_failed");
    }

    const existingMeta = finalResult.meta ?? {};
    const mergedMeta = { ...estimatedMeta, ...existingMeta };
    const locale = (mergedMeta as any).locale;
    if (typeof locale !== "string" || locale.trim() === "") {
      (mergedMeta as any).locale = "ja";
    }

    finalResult.meta = mergedMeta;

    ensureSpackyThinking(finalResult as AnalysisResult);
    applyCalculationOverrides(finalResult as AnalysisResult);
    removeMethodHints(finalResult as AnalysisResult);

    // debug=true のときだけ provider名を付与（型を壊さず最低限）
    if (debug) {
      const existingDebug =
        finalResult && typeof finalResult._debug === "object" && finalResult._debug !== null
          ? finalResult._debug
          : {};
      const gate = validateCalculations(finalResult.problems);
      const reason = "reason" in gate ? gate.reason : undefined;
      finalResult._debug = {
        ...existingDebug,
        provider: provider.name,
        gate: gate.ok ? { ok: true } : { ok: false, reason: reason ?? "unknown_reason" },
      } as any;
    } else {
      if (finalResult?._debug) {
        delete finalResult._debug;
      }
    }

    return NextResponse.json(finalResult);
  } catch (error: any) {
    console.error(`[${provider.name}] AI Analysis failed:`, error);
    const message = error?.message;
    const isKeyMissing =
      typeof message === "string" && /API_KEY is not set/i.test(message);

    return NextResponse.json(
      { error: isKeyMissing ? message : DEFAULT_ERROR_MESSAGE },
      { status: isKeyMissing ? 500 : 400 }
    );
  }
}

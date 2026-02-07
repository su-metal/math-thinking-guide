// solve only accepts a single problem_text selected by the user.
// Do NOT re-extract problems from image here.

import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/aiProviders/provider";
import { estimateLevel, type Difficulty, type LevelMeta } from "@/lib/levelEstimator";
import { computeExpression } from "@/lib/math/computeExpression";
import { validateCalculations } from "@/lib/routing/qualityGate";
import type { AnalysisResult } from "@/types";

const DEFAULT_ERROR_MESSAGE =
  "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。";

const provider = getAIProvider();

const normalizeCalcExpression = (expression: string) =>
  expression.trim().replace(/\*/g, "×").replace(/\//g, "÷").replace(/\s+/g, " ");

const normalizeCalculationExpressions = (result: AnalysisResult) => {
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
      const expr = calc.expression.trim();
      if (expr.includes("最小公倍数") || expr.includes("最大公約数")) continue;
      if (!/^[0-9+\-×÷().\s]+$/.test(expr)) {
        delete step.calculation;
        continue;
      }
      const computed = computeExpression(expr);
      if (typeof computed === "number") {
        calc.result = computed;
      } else {
        delete step.calculation;
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
  let payload: {
    problem_text?: string;
    meta?: LevelMeta;
    difficulty?: Difficulty;
    isPro?: boolean;
    debug?: boolean;
  } = {};

  try {
    payload = await req.json();
  } catch (error) {
    console.error(`[${provider.name}] Failed to parse request body:`, error);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  const { problem_text, meta, difficulty, isPro, debug } = payload;
  if (!problem_text) {
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  try {
    const resolvedMeta = meta ?? estimateLevel(problem_text);
    const resolvedDifficulty = (meta?.difficulty ?? difficulty ?? resolvedMeta.difficulty) as Difficulty;
    let finalResult: AnalysisResult | undefined;
    let finalGateReason: string | undefined;
    const gateAttempts: Array<{ attempt: number; ok: boolean; reason?: string }> = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidate = await provider.analyzeFromText(problem_text, resolvedDifficulty, resolvedMeta, {
        debug,
        isPro,
      });
      if (!candidate) {
        const reason = "no_candidate";
        gateAttempts.push({ attempt, ok: false, reason });
        finalGateReason = reason;
        if (debug) {
          console.log(
            `[${provider.name}] solve gate check attempt=${attempt} ok=false reason=${reason}`,
            []
          );
        }
        continue;
      }
      if (!Array.isArray(candidate.problems) || candidate.problems.length === 0) {
        const reason = "no_problems";
        gateAttempts.push({ attempt, ok: false, reason });
        finalGateReason = reason;
        if (debug) {
          console.log(
            `[${provider.name}] solve gate check attempt=${attempt} ok=false reason=${reason}`,
            []
          );
        }
        continue;
      }
      normalizeCalculationExpressions(candidate as AnalysisResult);
      const validation = validateCalculations(candidate.problems);
      const reason = validation.ok
        ? undefined
        : "reason" in validation
          ? validation.reason
          : "unknown_reason";
      gateAttempts.push({ attempt, ok: validation.ok, ...(reason ? { reason } : {}) });
      if (debug) {
        const calcList =
          candidate.problems.flatMap((problem) =>
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
        console.log(
          `[${provider.name}] solve gate check attempt=${attempt} ok=${validation.ok} reason=${reason ?? "n/a"}`,
          calcList
        );
      }
      if (!validation.ok) {
        finalGateReason = reason ?? "unknown_reason";
        continue;
      }
      finalGateReason = undefined;
      finalResult = candidate;
      break;
    }
    if (!finalResult) {
      if (!debug) {
        return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
      }
      return NextResponse.json(
        {
          error: DEFAULT_ERROR_MESSAGE,
          _debug: {
            provider: provider.name,
            route: "/api/solve",
            gate: { ok: false, reason: finalGateReason ?? "unknown_reason" },
            gateAttempts,
          },
        } as any,
        { status: 400 }
      );
    }

    const existingMeta = finalResult.meta ?? {};
    const mergedMeta = { ...resolvedMeta, ...existingMeta };
    const locale = (mergedMeta as any).locale;
    if (typeof locale !== "string" || locale.trim() === "") {
      (mergedMeta as any).locale = "ja";
    }
    finalResult.meta = mergedMeta;

    ensureSpackyThinking(finalResult as AnalysisResult);
    applyCalculationOverrides(finalResult as AnalysisResult);
    removeMethodHints(finalResult as AnalysisResult);

    if (debug) {
      const existingDebug =
        finalResult && typeof (finalResult as any)._debug === "object" && (finalResult as any)._debug !== null
          ? (finalResult as any)._debug
          : {};

      (finalResult as any)._debug = {
        ...existingDebug,
        provider: provider.name,
        route: "/api/solve",
        gate: finalGateReason ? { ok: false, reason: finalGateReason } : { ok: true },
        gateAttempts,
      };
    }
    else {
      if (finalResult?._debug) {
        delete finalResult._debug;
      }
    }

    return NextResponse.json(finalResult);
  } catch (error) {
    console.error(`[${provider.name}] Solve failed:`, error);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }
}

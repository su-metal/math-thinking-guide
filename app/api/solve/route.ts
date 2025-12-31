import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/aiProviders/provider";
import { estimateLevel, type Difficulty, type LevelMeta } from "@/lib/levelEstimator";
import { computeExpression } from "@/lib/math/computeExpression";
import type { AnalysisResult } from "@/types";

const DEFAULT_ERROR_MESSAGE =
  "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。";

const provider = getAIProvider();

const applyCalculationOverrides = (result: AnalysisResult) => {
  if (!result || !Array.isArray(result.problems)) return;
  for (const problem of result.problems) {
    if (!problem || !Array.isArray(problem.steps)) continue;
    for (const step of problem.steps) {
      const calc = step?.calculation;
      if (!calc || typeof calc.expression !== "string") continue;
      const computed = computeExpression(calc.expression);
      if (typeof computed === "number") {
        calc.result = computed;
      } else {
        delete step.calculation;
      }
    }
  }
};

export async function POST(req: Request) {
  let payload: {
    problem_text?: string;
    meta?: LevelMeta;
    difficulty?: Difficulty;
    debug?: boolean;
  } = {};

  try {
    payload = await req.json();
  } catch (error) {
    console.error(`[${provider.name}] Failed to parse request body:`, error);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  const { problem_text, meta, difficulty, debug } = payload;
  if (!problem_text) {
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  try {
    const resolvedMeta = meta ?? estimateLevel(problem_text);
    const resolvedDifficulty = (meta?.difficulty ?? difficulty ?? resolvedMeta.difficulty) as Difficulty;
    const finalResult: any = await provider.analyzeFromText(problem_text, resolvedDifficulty);

    const existingMeta = finalResult.meta ?? {};
    const mergedMeta = { ...resolvedMeta, ...existingMeta };
    const locale = (mergedMeta as any).locale;
    if (typeof locale !== "string" || locale.trim() === "") {
      (mergedMeta as any).locale = "ja";
    }
    finalResult.meta = mergedMeta;

    applyCalculationOverrides(finalResult as AnalysisResult);

    if (debug) {
      const existingDebug =
        finalResult && typeof finalResult._debug === "object" && finalResult._debug !== null
          ? finalResult._debug
          : {};
      finalResult._debug = { ...existingDebug, provider: provider.name };
    } else {
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

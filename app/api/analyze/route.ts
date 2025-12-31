import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/aiProviders/provider";
import { estimateLevel } from "@/lib/levelEstimator";
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
    const problemText = await provider.extractProblemText(imageBase64);
    const estimatedMeta = estimateLevel(problemText);

    const finalResult: any = await provider.analyzeWithControls({
      imageBase64,
      problemText,
      difficulty: estimatedMeta.difficulty,
    });

    const existingMeta = finalResult.meta ?? {};
    const mergedMeta = { ...estimatedMeta, ...existingMeta };
    const locale = (mergedMeta as any).locale;
    if (typeof locale !== "string" || locale.trim() === "") {
      (mergedMeta as any).locale = "ja";
    }

    finalResult.meta = mergedMeta;

    applyCalculationOverrides(finalResult as AnalysisResult);

    // debug=true のときだけ provider名を付与（型を壊さず最低限）
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

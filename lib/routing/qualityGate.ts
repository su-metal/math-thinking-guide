import type { AnalysisResult } from "@/types";

type ValidationResult = { ok: true } | { ok: false; reason: string };

const ALLOWED_EXPRESSION_REGEX = /^[0-9+\-×÷().\s最小公倍数と]+$/;

export function validateCalculations(
  problems: AnalysisResult["problems"]
): ValidationResult {
  if (!Array.isArray(problems)) {
    return { ok: false, reason: "problems_not_array" };
  }

  for (const [problemIndex, problem] of problems.entries()) {
    if (!problem || !Array.isArray(problem.steps)) continue;
    for (const [stepIndex, step] of problem.steps.entries()) {
      const calc = step?.calculation;
      if (!calc) continue;

      if (typeof calc.expression !== "string") {
        return { ok: false, reason: `expression_not_string@${problemIndex}:${stepIndex}` };
      }
      if (typeof calc.result !== "number" || !Number.isFinite(calc.result)) {
        return { ok: false, reason: `result_not_number@${problemIndex}:${stepIndex}` };
      }
      if (calc.expression.includes(",") || calc.expression.includes("=")) {
        return { ok: false, reason: `expression_invalid_token@${problemIndex}:${stepIndex}` };
      }
      if (!ALLOWED_EXPRESSION_REGEX.test(calc.expression)) {
        return { ok: false, reason: `expression_invalid_chars@${problemIndex}:${stepIndex}` };
      }
      if (calc.unit !== undefined && typeof calc.unit !== "string") {
        return { ok: false, reason: `unit_not_string@${problemIndex}:${stepIndex}` };
      }
    }
  }

  return { ok: true };
}

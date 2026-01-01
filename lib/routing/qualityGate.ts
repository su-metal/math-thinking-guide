import type { AnalysisResult } from "@/types";

type ValidationResult = { ok: true } | { ok: false; reason: string };

const ALLOWED_EXPRESSION_REGEX = /^[0-9+\-×÷().\s最小公倍数最大公約数と]+$/;

type SpecialExpression =
  | { kind: "lcm"; a: number; b: number }
  | { kind: "gcd"; a: number; b: number };

const SPECIAL_EXPRESSION_REGEX =
  /^(最小公倍数|最大公約数)\s*\(\s*(\d+)\s*(?:と|,)\s*(\d+)\s*\)$/;

const parseSpecialExpression = (expression: string): SpecialExpression | null => {
  const trimmed = expression.trim();
  const match = trimmed.match(SPECIAL_EXPRESSION_REGEX);
  if (!match) return null;
  const rawType = match[1];
  const a = Number(match[2]);
  const b = Number(match[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (rawType === "最小公倍数") {
    return { kind: "lcm", a, b };
  }
  return { kind: "gcd", a, b };
};

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
      const special = parseSpecialExpression(calc.expression);
      if (calc.expression.includes("=")) {
        return { ok: false, reason: `expression_invalid_token@${problemIndex}:${stepIndex}` };
      }
      if (calc.expression.includes(",") && !special) {
        return { ok: false, reason: `expression_invalid_token@${problemIndex}:${stepIndex}` };
      }
      if (!special && !ALLOWED_EXPRESSION_REGEX.test(calc.expression)) {
        return { ok: false, reason: `expression_invalid_chars@${problemIndex}:${stepIndex}` };
      }
      if (calc.unit !== undefined && typeof calc.unit !== "string") {
        return { ok: false, reason: `unit_not_string@${problemIndex}:${stepIndex}` };
      }

      if (special) {
        if (!Number.isInteger(calc.result) || calc.result <= 0) {
          return { ok: false, reason: `special_result_invalid@${problemIndex}:${stepIndex}` };
        }
        if (special.a <= 0 || special.b <= 0) {
          return { ok: false, reason: `special_input_invalid@${problemIndex}:${stepIndex}` };
        }
        if (special.kind === "lcm") {
          if (calc.result % special.a !== 0 || calc.result % special.b !== 0) {
            return { ok: false, reason: `lcm_not_divisible@${problemIndex}:${stepIndex}` };
          }
          const cap = special.a * special.b;
          if (Number.isSafeInteger(cap) && calc.result > cap) {
            return { ok: false, reason: `lcm_too_large@${problemIndex}:${stepIndex}` };
          }
        } else {
          if (special.a % calc.result !== 0 || special.b % calc.result !== 0) {
            return { ok: false, reason: `gcd_not_divisible@${problemIndex}:${stepIndex}` };
          }
          if (calc.result > Math.min(special.a, special.b)) {
            return { ok: false, reason: `gcd_too_large@${problemIndex}:${stepIndex}` };
          }
        }
      }
    }
  }

  return { ok: true };
}

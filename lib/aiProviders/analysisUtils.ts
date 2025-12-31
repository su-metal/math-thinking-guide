import type { AnalysisResult, MathProblem, MathStep } from "@/types";

export type VerificationResult = {
  ok: boolean;
  issues: string[];
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasRepeatingRun = (items: string[], minRun: number) => {
  let run = 1;
  for (let i = 1; i < items.length; i++) {
    if (items[i] === items[i - 1]) {
      run += 1;
      if (run >= minRun) return true;
    } else {
      run = 1;
    }
  }
  return false;
};

const normalizeForSimilarity = (text: string) =>
  text
    .replace(/[\s\u3000]+/g, "")
    .replace(/[.,!?。、！？「」『』（）()]/g, "")
    .toLowerCase();

const bigrams = (text: string) => {
  const grams = new Set<string>();
  if (text.length < 2) return grams;
  for (let i = 0; i < text.length - 1; i += 1) {
    grams.add(text.slice(i, i + 2));
  }
  return grams;
};

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const hasHighSimilarity = (a: string, b: string, threshold = 0.75) => {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na.length < 4 || nb.length < 4) return false;
  return jaccard(bigrams(na), bigrams(nb)) >= threshold;
};

export function verifySteps(
  steps: MathStep[],
  options?: { ignoreDuplicateSimilarity?: boolean }
): VerificationResult {
  const issues: string[] = [];
  if (!Array.isArray(steps) || steps.length === 0) {
    return { ok: false, issues: ["steps_empty"] };
  }

  const hints: string[] = [];
  const solutions: string[] = [];
  let calculationCount = 0;

  steps.forEach((step, index) => {
    if (typeof step?.order !== "number") {
      issues.push(`step_${index}_order_missing`);
    }
    if (!isNonEmptyString(step?.hint)) {
      issues.push(`step_${index}_hint_missing`);
    } else {
      hints.push(step.hint.trim());
    }
    if (!isNonEmptyString(step?.solution)) {
      issues.push(`step_${index}_solution_missing`);
    } else {
      solutions.push(step.solution.trim());
    }

    if (step?.calculation) {
      calculationCount += 1;
      if (!isNonEmptyString(step.calculation.expression)) {
        issues.push(`step_${index}_calc_expression_missing`);
      }
    }
  });

  if (hints.length > 0 && hasRepeatingRun(hints, 3)) {
    issues.push("repetition_hint");
  }
  if (solutions.length > 0 && hasRepeatingRun(solutions, 3)) {
    issues.push("repetition_solution");
  }
  for (let i = 1; i < hints.length; i += 1) {
    if (hasHighSimilarity(hints[i - 1], hints[i]) || hasHighSimilarity(solutions[i - 1], solutions[i])) {
      issues.push("duplicate_step_similarity");
      break;
    }
  }
  if (steps.length >= 2 && calculationCount >= 2 && steps[steps.length - 1]?.calculation) {
    issues.push("missing_final_summary_step");
  }

  const filteredIssues =
    options?.ignoreDuplicateSimilarity
      ? issues.filter((issue) => issue !== "duplicate_step_similarity")
      : issues;

  return { ok: filteredIssues.length === 0, issues: filteredIssues };
}

export function verifyProblems(problems: MathProblem[]): VerificationResult {
  const issues: string[] = [];
  if (!Array.isArray(problems) || problems.length === 0) {
    return { ok: false, issues: ["problems_empty"] };
  }

  problems.forEach((problem, index) => {
    if (!isNonEmptyString(problem?.id)) {
      issues.push(`problem_${index}_id_missing`);
    }
    if (!isNonEmptyString(problem?.problem_text)) {
      issues.push(`problem_${index}_text_missing`);
    }
    if (!isNonEmptyString(problem?.final_answer)) {
      issues.push(`problem_${index}_final_answer_missing`);
    }
    if (!problem?.method_hint || !isNonEmptyString(problem.method_hint.label) || !isNonEmptyString(problem.method_hint.pitch)) {
      issues.push(`problem_${index}_method_hint_missing`);
    }
    const stepCheck = verifySteps(problem?.steps ?? []);
    if (!stepCheck.ok) {
      issues.push(...stepCheck.issues.map((issue) => `problem_${index}_${issue}`));
    }
  });

  return { ok: issues.length === 0, issues };
}

export function verifyAnalysis(result: AnalysisResult): VerificationResult {
  const issues: string[] = [];
  if (!result || result.status !== "success") {
    issues.push("status_not_success");
  }

  const problemsCheck = verifyProblems(result?.problems ?? []);
  if (!problemsCheck.ok) {
    issues.push(...problemsCheck.issues);
  }

  return { ok: issues.length === 0, issues };
}

export function normalizeStepOrders(steps: MathStep[], startOrder = 1) {
  let order = startOrder;
  steps.forEach((step) => {
    step.order = order;
    order += 1;
  });
}

export function createProblemId(): string {
  return `problem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

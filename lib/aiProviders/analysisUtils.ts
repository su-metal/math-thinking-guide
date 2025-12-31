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

export function verifySteps(steps: MathStep[]): VerificationResult {
  const issues: string[] = [];
  if (!Array.isArray(steps) || steps.length === 0) {
    return { ok: false, issues: ["steps_empty"] };
  }

  const hints: string[] = [];
  const solutions: string[] = [];

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

  return { ok: issues.length === 0, issues };
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

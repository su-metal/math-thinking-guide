
export interface MathStep {
  order: number;
  hint: string;     // そのステップで考えること（ヒント）
  solution: string; // そのステップの具体的な式や計算結果（次のステップで表示）
  hint_icon?: string;
  is_final_answer?: boolean;
}

export interface MathProblem {
  id: string;
  problem_text: string;
  steps: MathStep[];
  final_answer: string;
}

export interface AnalysisResult {
  status: "success" | "error";
  problems: MathProblem[];
}

export interface DrillProblem {
  question: string;
  answer: string;
  explanation: string;
}

export interface DrillResult {
  problems: DrillProblem[];
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  image: string;
  result: AnalysisResult;
}

export enum AppScreen {
  SPLASH = 'SPLASH',
  ONBOARDING = 'ONBOARDING',
  HOME = 'HOME',
  CROP = 'CROP',
  LOADING = 'LOADING',
  PROBLEM_SELECT = 'PROBLEM_SELECT',
  RESULT = 'RESULT',
  DRILL = 'DRILL',
  HISTORY = 'HISTORY',
  PAYWALL = 'PAYWALL',
  SETTINGS = 'SETTINGS',
  PRO_MANAGEMENT = 'PRO_MANAGEMENT'
}

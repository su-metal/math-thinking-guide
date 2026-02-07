
export type StepCalculation = {
  expression: string; // 例: "3600 ÷ 15"
  result: number;     // 例: 240
  unit?: string;      // 例: "人/平方キロメートル"
  note?: string;      // 例: "1平方キロメートルあたりの人数"
};

export interface MathStep {
  order: number;
  hint: string;     // そのステップで考えること（ヒント）

  // そのステップの説明文（会話調）。原則「結論の断定」は避け、意味づけや確認に使う
  solution: string;

  // 任意で見られる途中計算（表示トグル用）
  calculation?: StepCalculation;

  hint_icon?: string;
  is_final_answer?: boolean;
}

export type MethodHint = {
  method_id?: string;  // 任意
  label?: string;      // 辞書のlabelそのまま（任意）
  pitch: string;       // 辞書のpitchそのまま（必須）
  bridge?: string;     // LLMが作る「この問題向けの一文補足」（任意）
  confidence?: number; // 任意
  signals?: string[];  // 任意
};

export interface MathProblem {
  id: string;
  problem_text: string;
  spacky_thinking: string;
  steps: MathStep[];
  final_answer: string;
  method_hint?: MethodHint;
}

export interface AnalysisResult {
  status: "success" | "error";
  problems: MathProblem[];
  meta?: {
    difficulty: "easy" | "normal" | "hard";
    tags: string[];
    confidence: number;
    signals: Record<string, unknown>;
  };
  _debug?: {
    provider?: string;
    escalated?: boolean;
    retries?: number;
    chunkSize?: number;
    chunkHistory?: number[];
    model?: string;
    modelsTried?: string[];
    modelFinal?: string;
    stepsEscalated?: boolean;
    stepsModelInitial?: string;
    stepsModelFinal?: string;
    pipelinePath?: "chunked" | "fallback_single_shot" | "total_timeout_short" | "single_shot";
    routeDecision?: "simple" | "complex";
    fallbackReason?: string;
    stepsTotalMs?: number;
    totalMs?: number;
    verifyIssuesTop3?: string[];
    verifyIssuesCount?: number;
  };
}

export interface ExtractedProblem {
  id: string;
  title?: string;
  problem_text: string;
}

export interface ReadResult {
  status: "success";
  problems: ExtractedProblem[];
  _debug?: {
    provider?: string;
    phase?: string;
  };
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
  allProblems?: ExtractedProblem[];
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

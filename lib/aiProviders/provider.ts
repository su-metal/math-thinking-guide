import { AnalysisResult, DrillResult, ExtractedProblem } from "../../types";
import { GeminiProvider } from "./geminiProvider";
import { OpenAIProvider } from "./openaiProvider";
import type { Difficulty, LevelMeta } from "@/lib/levelEstimator";

export interface AIProvider {
  name: string;
  analyze(imageBase64: string): Promise<AnalysisResult>;
  extractProblemText(imageBase64: string): Promise<ExtractedProblem[]>;
  analyzeFromText(
    problemText: string,
    difficulty: Difficulty,
    meta?: LevelMeta,
    options?: { debug?: boolean }
  ): Promise<AnalysisResult>;
  analyzeWithControls(args: {
    imageBase64: string;
    problemText: string;
    difficulty: Difficulty;
  }): Promise<AnalysisResult>;
  generateDrill(originalProblem: string): Promise<DrillResult>;
}

export function getAIProvider(): AIProvider {
  const requested = (process.env.AI_PROVIDER ?? "gemini").toString().toLowerCase();

  if (requested === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAIProvider(process.env.OPENAI_API_KEY);
  }

  if (requested === "openai") {
    console.warn("AI_PROVIDER=openai but OPENAI_API_KEY is missing; falling back to Gemini.");
  }

  return new GeminiProvider(process.env.GEMINI_API_KEY);
}

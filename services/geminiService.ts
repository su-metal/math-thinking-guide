import { AnalysisResult, DrillResult } from "../types";

async function handleResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.error === "string" ? data.error : fallbackMessage;
    throw new Error(message);
  }
  return data as T;
}

export async function analyzeMathProblem(
  imageBase64: string
): Promise<AnalysisResult> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, debug: true })
  });

  return handleResponse<AnalysisResult>(
    response,
    "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。"
  );
}

export async function generateDrillProblems(
  originalProblem: string
): Promise<DrillResult> {
  const response = await fetch("/api/drill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originalProblem }),
  });

  return handleResponse<DrillResult>(
    response,
    "類題を作ることができませんでした。通信状況を確認してね。"
  );
}

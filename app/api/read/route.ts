import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/aiProviders/provider";
import type { ReadResult } from "@/types";

const DEFAULT_ERROR_MESSAGE =
  "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。";

const provider = getAIProvider();

export async function POST(req: Request) {
  let payload: { imageBase64?: string };
  try {
    payload = await req.json();
  } catch (error) {
    console.error(`[${provider.name}] Failed to parse request body:`, error);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  const { imageBase64 } = payload;
  if (!imageBase64) {
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  try {
    const problems = await provider.extractProblemText(imageBase64);

    const result: ReadResult = {
      status: "success",
      problems,
      _debug: { provider: provider.name, phase: "read" },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[${provider.name}] Problem text extraction failed:`, error);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }
}

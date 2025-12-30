import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/aiProviders/provider";

const DEFAULT_ERROR_MESSAGE = "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。";

const provider = getAIProvider();

export async function POST(req: Request) {
  // --- debug: 何が来ているかを見る（原因特定用） ---
  console.log("[/api/analyze] content-type:", req.headers.get("content-type"));

  const rawText = await req.text();
  console.log("[/api/analyze] raw body:", rawText.slice(0, 300));

  let payload: { imageBase64?: string } = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    console.error(`[${provider.name}] Failed to parse request body:`, error);
    console.log("[/api/analyze] parsed keys:", null);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  console.log("[/api/analyze] parsed keys:", Object.keys(payload || {}));
  // --- debug end ---

  const { imageBase64 } = payload;
  if (!imageBase64) {
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  try {
    const result = await provider.analyze(imageBase64);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[${provider.name}] AI Analysis failed:`, error);
    const message = error?.message;
    const isKeyMissing = typeof message === "string" && /API_KEY is not set/i.test(message);
    return NextResponse.json(
      { error: isKeyMissing ? message : DEFAULT_ERROR_MESSAGE },
      { status: isKeyMissing ? 500 : 400 }
    );
  }
}


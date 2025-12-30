import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/aiProviders/provider";

const DEFAULT_ERROR_MESSAGE =
  "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。";

const provider = getAIProvider();

export async function POST(req: Request) {
  console.log("[/api/analyze] content-type:", req.headers.get("content-type"));

  const rawText = await req.text();
  console.log("[/api/analyze] raw body:", rawText.slice(0, 300));

  let payload: { imageBase64?: string; debug?: boolean } = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    console.error(`[${provider.name}] Failed to parse request body:`, error);
    console.log("[/api/analyze] parsed keys:", null);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  console.log("[/api/analyze] parsed keys:", Object.keys(payload || {}));

  const { imageBase64, debug } = payload;
  if (!imageBase64) {
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  try {
    const result: any = await provider.analyze(imageBase64);

    // debug=true のときだけ provider名を付与（型を壊さず最低限）
    if (debug) {
      result._debug = { provider: provider.name };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[${provider.name}] AI Analysis failed:`, error);
    const message = error?.message;
    const isKeyMissing =
      typeof message === "string" && /API_KEY is not set/i.test(message);

    return NextResponse.json(
      { error: isKeyMissing ? message : DEFAULT_ERROR_MESSAGE },
      { status: isKeyMissing ? 500 : 400 }
    );
  }
}

import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/aiProviders/provider";

const DEFAULT_ERROR_MESSAGE = "類題を作ることができませんでした。通信状況を確認してね。";

const provider = getAIProvider();

export async function POST(req: Request) {
  let payload: { originalProblem?: string };
  try {
    payload = await req.json();
  } catch (error) {
    console.error(`[${provider.name}] Failed to parse request body:`, error);
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  const { originalProblem } = payload;
  if (!originalProblem) {
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 400 });
  }

  try {
    const result = await provider.generateDrill(originalProblem);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[${provider.name}] Drill generation failed:`, error);
    const message = error?.message;
    const isKeyMissing = typeof message === "string" && /API_KEY is not set/i.test(message);
    return NextResponse.json(
      { error: isKeyMissing ? message : DEFAULT_ERROR_MESSAGE },
      { status: isKeyMissing ? 500 : 400 }
    );
  }
}

import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set" },
      { status: 500 }
    );
  }

  let payload: { originalProblem?: string };
  try {
    payload = await req.json();
  } catch (error) {
    console.error("Failed to parse request body:", error);
    return NextResponse.json(
      { error: "類題を作ることができませんでした。通信状況を確認してね。" },
      { status: 400 }
    );
  }

  const { originalProblem } = payload;
  if (!originalProblem) {
    return NextResponse.json(
      { error: "類題を作ることができませんでした。通信状況を確認してね。" },
      { status: 400 }
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    以下の算数の問題と「同じ解き方」で解ける、別の問題を3問作成してください。
    
    元の問題: "${originalProblem}"
    
    【ルール】
    1. 小学4年生が理解できる内容にしてください。
    2. 登場人物や数値、シチュエーション（買い物、お菓子、距離など）を変えてください。
    3. 各問題に対して、「question（問題文）」「answer（答え）」「explanation（なぜその式になるかの短い解説）」を作成してください。
    4. 日本語で返答し、JSON形式にしてください。
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            problems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ["question", "answer", "explanation"],
              },
            },
          },
          required: ["problems"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Drill generation failed:", error);
    return NextResponse.json(
      { error: "類題を作ることができませんでした。通信状況を確認してね。" },
      { status: 400 }
    );
  }
}

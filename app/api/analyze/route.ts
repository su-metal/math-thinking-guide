import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

const prompt = `
あなたは小学校4年生の子供の「考える力」を育てる、一貫性と規律を持ったAIコーチ（先生）です。
画像に写っている算数の問題を読み取り、以下の厳格なルールに従ってJSONデータを作成してください。
出力ごとの情報のバラつき（揺れ）は許されません。常に一定の品質・構成を保ってください。

【問題文の作成ルール】
1. 図形やイラスト内の数値（長さ、個数など）はすべて「言葉」にして問題文に統合してください。
2. 指示語（①、下の図など）は使わず、具体的な名称（長方形、1組など）に置き換えてください。

【ステップ作成の絶対ルール (Strict Rules)】
各ステップは以下の要素で構成し、それぞれの役割を厳守してください。

1. **hint (ヒント・考え方)**
   - 「図のどこを見るべきか」「単位は何か」など、視覚的な注目ポイントを指摘する。
   - 「どういう計算をするか」「どの公式を使うか」という方針を示す。
   - 子供にアクションを促す言葉。「?を計算してみよう」「?と?を比べてみよう」。

2. **solution (答えと解説)**
   - そのステップでの計算結果（数値）を提示する。
   - 例：「10÷4＝2.5 なので、2.5ひき だよ。」

【出力形式】
以下のJSON構造のみを許可します：

{
  "status": "success",
  "problems": [
    {
      "id": "unique_id",
      "problem_text": "...",
      "steps": [
        {
          "order": 1,
          "hint": "まずは、表の右側を見て、1組の人数とメダルの数を確認しよう。",
          "solution": "1組は4人で10個だね。1人あたりは 10 ÷ 4 = 2.5個になるよ。"
        }
      ],
      "final_answer": "答え：2組\n\n【理由】1組は2.5個、2組は3個なので2組の方が多いからです。"
    }
  ]
}
`;

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set" },
      { status: 500 }
    );
  }

  let payload: { imageBase64?: string };
  try {
    payload = await req.json();
  } catch (error) {
    console.error("Failed to parse request body:", error);
    return NextResponse.json(
      { error: "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。" },
      { status: 400 }
    );
  }

  const { imageBase64 } = payload;
  if (!imageBase64) {
    return NextResponse.json(
      { error: "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。" },
      { status: 400 }
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64.split(",")[1] || imageBase64,
          },
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING },
            problems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  problem_text: { type: Type.STRING },
                  final_answer: { type: Type.STRING },
                  steps: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        order: { type: Type.INTEGER },
                        hint: { type: Type.STRING },
                        solution: { type: Type.STRING },
                      },
                      required: ["order", "hint", "solution"],
                    },
                  },
                },
                required: ["id", "problem_text", "steps", "final_answer"],
              },
            },
          },
          required: ["status", "problems"],
        },
      },
    });

    const raw = response.text ?? "";

    // 余計な前後テキストが混ざるケース対策：最初の { 〜 最後の } を抜く
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      console.error("Non-JSON response head:", raw.slice(0, 300));
      console.error("Non-JSON response tail:", raw.slice(-300));
      return NextResponse.json(
        { error: "AIの出力がJSON形式になりませんでした。もう一度試してね。" },
        { status: 502 }
      );
    }

    const jsonCandidate = raw.slice(start, end + 1);

    try {
      const parsed = JSON.parse(jsonCandidate);
      return NextResponse.json(parsed);
    } catch (e) {
      console.error("JSON parse failed. length:", jsonCandidate.length);
      console.error("JSON head:", jsonCandidate.slice(0, 300));
      console.error("JSON tail:", jsonCandidate.slice(-300));
      return NextResponse.json(
        { error: "AIの出力が途中で崩れました。もう一度撮って試してね。" },
        { status: 502 }
      );
    }

  } catch (error) {
    console.error("AI Analysis failed:", error);
    return NextResponse.json(
      { error: "AIが問題を読み取れませんでした。明るい場所でもういちど撮ってみてね。" },
      { status: 400 }
    );
  }
}

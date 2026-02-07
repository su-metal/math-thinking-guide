import type { Difficulty } from "@/lib/levelEstimator";

export const ANALYSIS_PROMPT = `
あなたは小学校4年生の子供の「考える力」を育てる、優しく丁寧なAI先生（スパッキー）です。
画像の問題を解くのではなく、子供が「自分で気づける」ようにガイドしてください。

【出力項目の定義】
1. **strategy (スパッキーの考え方)**
   - 問題全体を貫く「解き方の方針」を100文字程度で説明してください。
   - 例：「共通の数を見つける問題だよ。全部の数を同じ数で割れるかな？」

2. **steps.hint (具体的なヒント)**
   - 各ステップで、子供が今すぐノートに書くべきことや考えるべきことを伝えてください。
   - 答えは教えず、発見を促す問いかけにしてください。

3. **steps.solution (ステップのふりかえり)**
   - そのステップを終えた時に「何がわかったか」を優しくまとめた文章です。
   - 次のステップの「まえのステップのふりかえり」として表示されます。
   - 例：「りんご32個とみかん80個を、あまりなしで分ける人数を考えればいいことが分かったね！」

【出力形式】
以下のJSON構造のみを許可します：

{
  "status": "success",
  "problems": [
    {
      "id": "unique_id",
      "problem_text": "...",
      "spacky_thinking": "...",
      "steps": [
        {
          "order": 1,
          "hint": "...",
          "solution": "...",
          "calculation": {
            "expression": "...",
            "result": 0,
            "unit": "...",
            "note": "..."
          }
        }
      ],
      "final_answer": "答え：...\\n\\n【理由】..."
    }
  ]
}
`;

export const OUTLINE_PROMPT = `
あなたは算数問題の解き方の「骨組み」だけを作ります。
出力は必ずJSONのみ。計算式・計算結果・steps本体・final_answerは絶対に出さないでください。

【出力形式(JSONのみ)】
{
  "template": "unit_rate_compare | lcm_square | single_calc | multi_step_compare | geometry_property | other",
  "steps_plan": ["役割1", "役割2"],
  "notes": ["注意1", "注意2"]
}

【制約】
- steps_plan は短い役割だけを書く（手順や式の具体化は禁止）
- 計算式、計算結果、答えの断定は禁止
- notes は注意点だけ（任意）
`.trim();



export function createAnalysisPrompt(problemText: string, extraInstruction?: string) {
  const extra = extraInstruction ? `\n\n【追加ルール】\n${extraInstruction}\n` : "";
  return `${ANALYSIS_PROMPT}${extra}\n【問題文】\n${problemText}\n`.trim();
}

export function createOutlinePrompt(problemText: string) {
  return `${OUTLINE_PROMPT}\n\n【問題文】\n${problemText}\n`.trim();
}

export const DRILL_PROMPT = `
以下の算数の問題と「同じ解き方」で解ける、別の問題を3問作成してください。

元の問題: "{originalProblem}"

【ルール】
1. 小学4年生が理解できる内容にしてください。
2. 登場人物や数値、シチュエーション（買い物、お菓子、距離など）を変えてください。
3. 各問題に対して、「question（問題文）」「answer（答え）」「explanation（なぜその式になるかの短い解説）」を作成してください。
4. 日本語で返答し、JSON形式にしてください。
`;

export const ANALYSIS_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string" },
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          problem_text: { type: "string" },
          spacky_thinking: { type: "string" },
          final_answer: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                order: { type: "integer" },
                hint: { type: "string" },
                solution: { type: "string" },

                // 任意で見られる途中計算（表示トグル用）
                calculation: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    expression: { type: "string" }, // 例: "3600 ÷ 15"
                    result: { type: "number" },     // 例: 240
                    unit: { type: "string" },       // 例: "人/平方キロメートル"
                    note: { type: "string" },       // 任意: 説明
                  },
                  required: ["expression", "result"],
                },
              },
              required: ["order", "hint", "solution"],
            },

          },
        },
        required: ["id", "problem_text", "spacky_thinking", "steps", "final_answer"],
      },
    },
  },
  required: ["status", "problems"],
};

export const OUTLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    template: { type: "string" },
    steps_plan: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["template", "steps_plan", "notes"],
} as const;

export const ANALYSIS_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    step_count: { type: "integer" },
    step_titles: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["step_count", "step_titles"],
};

export const ANALYSIS_STEPS_CHUNK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          order: { type: "integer" },
          hint: { type: "string" },
          solution: { type: "string" },

          // 任意で見られる途中計算（表示トグル用）
          calculation: {
            type: "object",
            additionalProperties: false,
            properties: {
              expression: { type: "string" }, // 例: "3600 ÷ 15"
              result: { type: "number" },     // 例: 240
              unit: { type: "string" },       // 例: "人/平方キロメートル"
              note: { type: "string" },       // 任意: 説明
            },
            required: ["expression", "result"],
          },
        },
        required: ["order", "hint", "solution"],
      },
    },
  },
  required: ["steps"],
};

export const ANALYSIS_HEADER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    final_answer: { type: "string" },
  },
  required: ["final_answer"],
};


export const DRILL_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["question", "answer", "explanation"],
      },
    },
  },
  required: ["problems"],
};


export function createDrillPrompt(originalProblem: string) {
  const sanitized = originalProblem.replace(/"/g, '\\"');
  return DRILL_PROMPT.replace("{originalProblem}", sanitized);
}

export function appendImageToPrompt(prompt: string, imageBase64: string) {
  if (!imageBase64) return prompt;
  const dataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  return `${prompt}\n\n[画像データ (base64)]\n${dataUrl}`;
}

export const PROBLEM_EXTRACTION_PROMPT = `
画像には算数の問題文が写っています。以下の厳格なルールで、抽出してください。

- 出力は JSON のみ。指定した構造だけを返す。
- 複数の問題（例：大問1、大問2など）が含まれている場合は、必ず個別の問題として分割して抽出してください。
- 出力形式:
{
  "problems": [
    {
      "id": "p1",
      "title": "（あれば）大問の番号など",
      "problem_text": "文章..."
    }
  ]
}
- 図中や文章中の数値・単位・割合・条件をすべて自然な日本語で記述し、指示語や番号（①など）は具体的な語に置き換えてください。
- 文章はやさしい語尾で、問いかけや命令口調を避けて客観的に説明する形にしてください。
`;

export const PROBLEM_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          problem_text: { type: "string" },
        },
        required: ["id", "problem_text"],
      },
    },
  },
  required: ["problems"],
} as const;

const STEP_COUNT_RULES: Record<Difficulty, string> = {
  easy: "ステップ数は2〜3。1ステップは1つの着眼点/計算対象に集中し、途中で余計なノイズを入れない。",
  normal: "ステップ数は3〜5で、前のステップを振り返りながら丁寧に進める。",
  hard: "ステップ数は5〜7。難しさに応じて細かく分割し、1ステップ1つの計算対象を扱う。",
};

const VOCABULARY_RULES: Record<Difficulty, string> = {
  easy: `語彙はやさしく短く。以下の単語は使わない: 最大公約数, 最小公倍数, 比, 割合, 分数, 分母, 分子, 連立, 文字式。`,
  normal: `基本語（公約数, 面積, あたり, 角度など）は使ってOK。計算式のネタバレになる言い回しは避け、考え方を丁寧に説明する。`,
  hard: `専門用語は使ってよいが、初出で簡単な補足（例: 「最大公約数(共通の約数のうちいちばん大きな数)」）を添える。`,
};

export function createControlledAnalysisPrompt(problemText: string, difficulty: Difficulty) {
  return `${ANALYSIS_PROMPT}
【制御情報（以下を必ず守る）】
- 難易度: ${difficulty}
- ${STEP_COUNT_RULES[difficulty]}
- ${VOCABULARY_RULES[difficulty]}
- Separation Rule（1ステップ＝1対象）と前ステップの振り返りルールは継続。
- 「problem_text」の内容を尊重し、画像内の数値・条件・図表を忠実になぞるよう努める。

【問題文】
${problemText}
`;
}

export function createAnalysisPlanPrompt(problemText: string, difficulty: Difficulty) {
  return `
あなたは算数問題のステップ構成だけを考える役割です。
計算の式や答えは書かず、考え方の流れだけを短く整理してください。
ステップ数の上限は固定しません。難しさに応じて必要な数だけ作ってください。

【制御情報】
- 難易度: ${difficulty}
- ${STEP_COUNT_RULES[difficulty]}
- Separation Rule（1ステップ＝1対象）は厳守。

【出力形式(JSONのみ)】
{
  "step_count": 数字,
  "step_titles": ["ステップごとの要点を短く", "..."]
}

【問題文】
${problemText}
`.trim();
}

export function createStepsChunkPrompt(args: {
  problemText: string;
  difficulty: Difficulty;
  stepTitles: string[];
  startOrder: number;
  endOrder: number;
}) {
  const { problemText, difficulty, stepTitles, startOrder, endOrder } = args;
  return `
指定された範囲のステップだけを作成してください。
命令口調や講義口調は避け、やさしい会話調(できたかな？、かんがえてみよう)で書く。
hint は着眼点と作戦だけ、solution は意味づけと短い問いかけだけ。
calculation を出す場合は expression と result を必ず入れます。

【calculation ルール】
- expression は四則演算のみ: + - * / × ÷ ( ) と整数/小数/分数 a/b
- 禁止: 比較(>, <, =, ≥, ≤), 論理(and/or), 判定や結論文
- 比較・判定・結論は solution に文章で書く
- 計算が不要なステップは calculation を出さない
- expression に単位文字を入れない（単位は unit に）

【制御情報】
- 難易度: ${difficulty}
- ${VOCABULARY_RULES[difficulty]}
- Separation Rule（1ステップ＝1対象）は厳守。

【この範囲のステップ要点】
${stepTitles.map((t, idx) => `${startOrder + idx}. ${t}`).join("\n")}

【出力形式(JSONのみ)】
{
  "steps": [
    { "order": ${startOrder} から ${endOrder} の連番, "hint": "...", "solution": "...", "calculation": { "expression": "...", "result": 0 } }
  ]
}

【問題文】
${problemText}
`.trim();
}

export function createAnalysisHeaderPrompt(args: {
  problemText: string;
  difficulty: Difficulty;
  stepTitles?: string[];
}) {
  const { problemText, difficulty, stepTitles } = args;
  const titles = Array.isArray(stepTitles) && stepTitles.length > 0
    ? stepTitles.map((t, idx) => `${idx + 1}. ${t}`).join("\n")
    : "";

  return `
あなたは算数問題の steps と final_answer を作成し、method_hint は作成しません。
final_answer は「答え：」と「【理由】」の形で、会話調で短くまとめてください。

【制御情報】
- 難易度: ${difficulty}
- ${VOCABULARY_RULES[difficulty]}

【ステップの要点（短く）】
${titles}

【出力形式(JSONのみ)】
{
  "final_answer": "答え：...\\n\\n【理由】..."
}

【問題文】
${problemText}
`.trim();
}

export function createSolvePrompt(args: {
  problemText: string;
  meta?: { difficulty?: Difficulty; tags?: string[] };
}) {
  const difficulty = args.meta?.difficulty ?? "normal";
  const tags = Array.isArray(args.meta?.tags) ? args.meta?.tags : [];
  const tagLine = tags.length ? `タグ: ${tags.join(", ")}` : "タグ: なし";

  return `
あなたは算数の問題を解き方まで整理するアシスタントです。
JSONだけを出力し、余計な説明はしません。

【重要】
- spacky_thinking に計算前の整理だけを書く（式・手法名・答えの断定は禁止）
- steps は抽象的にしない。各ステップに具体的な計算や数値を必ず含める。
- steps の hint/solution では「答え」「正解」という語を使わない（final_answer のみ可）。
- steps の order は 1 からの連番。
- steps の solution には数式・数値・計算結果を書いてよい。
- geometry の場合は「角度」「和」「外角/内角」などの具体式と値を必ず書く。
- 出力は次のJSON構造に厳密準拠:
{
  "status": "success",
  "problems": [
    {
      "id": "unique_id",
      "problem_text": "...",
      "spacky_thinking": "...",
      "steps": [
        { "order": 1, "hint": "...", "solution": "...", "calculation": { "expression": "...", "result": 0 } }
      ],
      "final_answer": "...",
    }
  ]
}

【ステップ数】
- easy/normal: 4?6
- hard または geometry タグがある場合: 6?10（冗長にしない）

【問題文】
${args.problemText}

【メタ情報】
難易度: ${difficulty}
${tagLine}
`.trim();
}

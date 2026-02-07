import type { Difficulty } from "@/lib/levelEstimator";

export const ANALYSIS_PROMPT = `
あなたは小学校の算数の「思考力」を育てるAI先生（スパッキー）です。
「答えを教える」のではなく、子供が自分の力で気づけるように「足場かけ（Scaffolding）」でガイドしてください。

【出力項目の定義】
1. **strategy (スパッキーの考え方)**
   - 子供に語り掛ける優しい口調（「〜だよ」「〜かな？」）で、「今日はここに注目してみよう！」というワクワクする方針を100文字程度で伝えてください。
   - 事務的な解説や計算手順の羅列は厳禁です。

2. **steps (解決のステップ)**
   - **reflection (まえのステップのふりかえり)**:
     - 前のステップで「何が解決したか」「何がわかったか」を概念的に要約します（例：「円の大きさを決める大事な『半径』が見つかったね！」）。
     - 単なる数値の繰り返しは避け、その数値の「意味」を確認してください。1ステップ目は導入や励ましを書きます。
   - **hint (着眼点のヒント)**:
     - 次に注目すべき数字や条件を伝えます。答えや式は書きません。
   - **question (考えさせる問いかけ)**:
     - 「〜するとどうなるかな？」「〜の数はいくつ分かな？」と、子供がノートに手を動かしたくなるような質問を投げかけます。
    - **calculation (計算をみる)**:
      - ここにだけ具体的な数式(expression)と結果(result)を格納します。note (補足) を書く場合は、スパッキーの優しい口調（「〜しよう」「〜だよ」）を徹底してください。

【ステップ分割の重要な指針（1ステップ1認知）】
- **情報の特定と抽出を独立させる（必要な場合のみ）**:
  - 図や複数の数値の中から「どれを底辺として使うか」といった**選択・発見**が必要な場合は独立させます。
  - ただし、問題文に数値が1つしかなく役割が明らかな場合は、最初の「考え方/計算」ステップに含めてください。**「157cmと書いてあるね」と確認するだけの冗長なステップは禁止**です。
- **「問いかけ」が実質的な答えにならないように**:
  - \`question\` で立式を問う場合、\`hint\` で使う数字まで指定してしまうと考える余地がなくなります。その場合はステップを分け、まずは数字の特定を優先してください。

【出力形式】
JSON構造のみを許可します：
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
          "reflection": "...",
          "hint": "...",
          "question": "...",
          "calculation": { "expression": "...", "result": 0, "unit": "..." }
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
- 「どの数字を使うか決める」と「計算する」は別の役割として分割する（1ステップ1認知）
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
                reflection: { type: "string" },
                hint: { type: "string" },
                question: { type: "string" },
                solution: { type: "string" }, // 互換性のために残すが、今後は reflection/question を優先

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
              required: ["order", "reflection", "hint", "question"],
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
          reflection: { type: "string" },
          hint: { type: "string" },
          question: { type: "string" },
          calculation: {
            type: "object",
            additionalProperties: false,
            properties: {
              expression: { type: "string" },
              result: { type: "number" },
              unit: { type: "string" },
              note: { type: "string" },
            },
            required: ["expression", "result"],
          },
        },
        required: ["order", "reflection", "hint", "question"],
      },
    },
  },
  required: ["steps"],
} as const;

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

const CALCULATION_RULES = `
【計算式(calculation)の厳格ルール】
- expression に使える文字: [0-9 + - × ÷ ( ) . 最小公倍数 最大公約数 と] のみ。
- カンマ(,)や等号(=)は絶対に入れない。
- 「3, 4」や「3と4」のように、数値を並べるだけのテキストは expression 禁止。
- 「どの数字を使うか決めるだけ」のステップ（計算が発生しないステップ）では、"calculation" ブロック自体を省略（nullではなく、項目ごと削除）すること。
`.trim();

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
あなたは算数問題の「特定のステップ」だけを執筆するライターです。
【重要】JSONのみを出力してください。また、問題文(problem_text)やspacky_thinkingを絶対に再出力しないでください。

指示された範囲のステップだけを作成してください。
命令口調や講義口調は避け、やさしい会話調(できたかな？、かんがえてみよう)で書く。

【記述ルール】
- reflection: 前のステップの概念的な振り返り（1ステップ目は問題の導入）。
- hint: 着眼点と作戦（答えをバラさない）。
- question: 子供に考えさせる問いかけ。
- calculation: 計算が必要な場合は必ず含める。

【制御情報】
- 難易度: ${difficulty}
- ${VOCABULARY_RULES[difficulty]}
- Separation Rule（1ステップ＝1対象）は厳守。
- ${CALCULATION_RULES}

【対象とするステップ】
${stepTitles.map((t, idx) => `${startOrder + idx}. ${t}`).join("\n")}

【問題文（参考）】
${problemText}

【出力形式（厳守）】
{
  "steps": [
    { 
      "order": ${startOrder} 〜 ${endOrder},
      "reflection": "...",
      "hint": "...",
      "question": "...",
      "calculation": { "expression": "...", "result": 0 }
    }
  ]
}
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
- spacky_thinking/reflection/hint/question は、子供に優しく語り掛ける口調（「〜だよ」「〜かな？」）で書く。事務的な状況説明や、大人向けの解説は厳禁。
- reflection には、前のステップで数値的に何がわかったかではなく、概念的にどのような進歩があったかを書く。
- hint/question には、具体的な計算式や答えを絶対に書かない。それらは calculation に入れること。
- spacky_thinking に計算前の整理だけを書く（式・手法名・答えの断定は禁止）。
- calculation の note もスパッキーの優しい会話口調（「〜だよ」「〜しよう」）で短く書く。
- steps は抽象的にしない。各ステップに具体的な「問いかけ」を必ず含める。
- steps の order は 1 からの連番。
- ${CALCULATION_RULES}
- 出力は次のJSON構造に厳密準拠:
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
          "reflection": "...", 
          "hint": "...", 
          "question": "...", 
          "calculation": { "expression": "...", "result": 0 } 
        }
      ],
      "final_answer": "...",
    }
  ]
}

【ステップ数（目安）】
- easy/normal: 3〜5 （短すぎず冗長にせず）
- hard または geometry タグがある場合: 5〜8

【問題文】
${args.problemText}

【メタ情報】
難易度: ${difficulty}
${tagLine}
`.trim();
}

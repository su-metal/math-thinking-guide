import type { Difficulty } from "@/lib/levelEstimator";

export const ANALYSIS_PROMPT = `
あなたは小学校4年生の子供の「考える力」を育てる、一貫性と規律を持ったAIコーチ（先生）です。
画像に写っている算数の問題を読み取り、以下の厳格なルールに従ってJSONデータを作成してください。
出力ごとの情報のバラつき（揺れ）は許されません。常に一定の品質・構成を保ってください。

【共通の語り口ルール（全ステップ共通）】
- すべての文章は、子供に話しかける「やさしい会話調」で書くこと。
- 命令調（?しましょう、?求めましょう、?しなさい）は使用しない。
- 事務的・手順的な言い回し（「同じように」「前と同じで」「次に」など）は使わない。
- 「どうかな？」「考えてみよう」「見てみよう」など、自然な問いかけ表現を用いる。

【表記ルール】
- 文章中の数は必ず半角アラビア数字を使う（例: 3600人, 15平方キロメートル, 1つあたり）
- 漢数字（一、二、三、千、万 など）は絶対に使わない
- 「１」「２」などの全角数字も使わない（半角の 1,2,3 のみ）
- 単位は数字の直後に続けて書く（例: 15km2 や 15平方キロメートル のどちらかに統一。混在禁止）

【前のステップの振り返り表現ルール（全ステップ共通）】
- 前のステップの結果を伝えるときは、数値や式で表さない。
- 文の最後に、文脈に合った短い問いかけを1つ添える。
- 問いかけは確認・安心を与えるものとし、答えを強要しない。
  例：「どうかな？」「ここまで大丈夫そうかな？」「分かったかな？」

【問題文の作成ルール】
1. 図形やイラスト内の数値（長さ、個数など）はすべて「言葉」にして問題文に統合してください。
2. 指示語（①、下の図など）は使わず、具体的な名称（長方形、1組など）に置き換えてください。

【スパッキーの考え方】

問題に書かれている情報を
・どんな種類の情報があるか
・それぞれが何を表しているか
・どう整理すると考えやすくなるか
という視点でまとめる。

具体的な計算方法や手順には触れない。

この内容は、
・この内容は、ステップ1（最初の整理ステップ）にのみ必須とする
・特定の操作や数値に結びつかないこと
を必須条件とする。

【制約】
・特定の問題タイプ（比較・計算・図形など）に依存する表現を使わない
・問題で聞かれている「最終的な答え」を断定してはいけない
・「つまり〇〇人」「これが答えだよ」「人口密度は〇〇だね」などの結論表現は禁止
・最終的な答えは、final_answer フィールドでのみ提示する


【途中計算の出力ルール（重要）】
- 途中計算（式と計算結果）は steps[].calculation にのみ入れる
- 数値そのものの言及は、意味づけの文脈であれば許可する
- steps[].solution は「意味づけ」と「短い問いかけ」だけを書く
- 最終的な答え（問題が聞いている結論）は final_answer にのみ書く
- 小学生が使わない関数表記は禁止（LCM, GCD, gcd, lcm, min, max, sqrt, log など）
- 計算式は「+ - × ÷」または「最小公倍数(4と6)」のような日本語だけを使う
- 記号っぽい省略表現（LCM(4,6) など）は絶対に使わない
- 整理・性質確認・比較/照合だけのステップでは calculation を出力しない
- calculation を出す場合、expression は算数の計算式か「最小公倍数(4と6)」のような日本語表現のみ
- expression にカンマ区切りや「12 = 12」のような等号だけの表現は禁止
- result は必ず数値（number）のみ。46や1212などの連結疑い値が出たら不正

【ステップ作成の絶対ルール (Strict Rules)】
各ステップは以下の要素で構成し、それぞれの役割を厳守してください。

1. **hint (ヒント・考え方)**
   - 「図のどこを見るべきか」「単位は何か」など、視覚的な注目ポイントを指摘する。
   - 「どういう計算をするか」「どの公式を使うか」という方針を示す。
   - **なぜこのステップを今行うのか（この作戦を最初に選ぶ理由）を、子供にも分かる言葉で必ず説明する。**
   - 子供にアクションを促す言葉。「?を計算してみよう」「?を確かめてみよう」。

   【重要】
   - 「まずは◯◯を求めよう。」で終わる文章は禁止する。
   - 「これをすると、何が分かるようになるのか」という理由が書かれていない hint は不正な出力とみなす。

2. solution（会話の説明だけ）
   - このステップで分かったことを、子供に話しかける会話調で説明する
   - steps[].solution には式（+ - × ÷）や =（イコール）や計算結果の数値を書かない
   - 文の最後に短い問いかけを1つ添える（例: ここまで大丈夫そうかな？）

3. calculation（途中計算 任意表示）
   - 途中計算の式と計算結果は、steps[].calculation にのみ入れる
   - calculation が必要ないステップでは省略してよい
   - expression は半角で書く（例: "3600 ÷ 15"）

【最終判断ステップに関する追加ルール】

- 複数の量を比べて結論を出す問題では、計算がすべて終わったあとに、
  「結果を並べて比べ、意味を整理するためのステップ」を必ず1つ設けてください。
- 特定の値を求める問題では、
- このステップでは新しい計算を行ってはいけません。
- 数字の大小関係や意味（どちらが多い・こんでいる等）を言葉で確認し、
  子供が自分で結論にたどり着ける問いかけを含めてください。
- このステップを経てから、final_answer を提示してください。

【目的】
計算で終わらせず、「考えて判断した」という体験を完成させるため。

【思考誘導レベルに関する追加ルール】

- hint（ヒント・考え方）では、計算結果や確定した式（例：「9を3で割る」「〇÷△」など）を直接提示してはいけません。
- hintでは必ず「どんな考え方を使うか」「どの量をそろえたいか」までにとどめ、
  子供自身が「どの数をどう使うか」を考える余地を残してください。
- 計算の具体的な式や数値の操作は、solution（答えと解説）で初めて示してください。
- ただし、前のステップとの対応関係（同じ考え方を使う、同じ単位にそろえる等）は明確に言語化して構いません。

【禁止例（hint内）】
- 「9を3で分けてみよう」
- 「15で割るといいよ」
- 「〇÷△を計算しよう」

【推奨例（hint内）】
- 「1Lあたりにそろえるには、どんな計算が必要だったかな？」
- 「前の組と同じ考え方で、2つの数を使って考えてみよう」
- 「どの数を使えば『1つ分あたり』がわかりそうかな？」

【ステップ設計の共通原則（汎用）】
- いきなり計算を行うステップを作ってはいけない。
- 数値を使った計算の前に、
  「何を求めたいのか」「そのために何をそろえる・分ける・比べるのか」
  を言葉やイメージで考えるステップを必ず1つ入れる。
- 「考え方が見えないまま計算に進んでいる」と判断できる場合は、
  計算前にもう1ステップ追加してよい。
- ステップ数は固定せず、
  子供が考える時間が必要なところでは細かく分けること。

【出力形式】
以下のJSON構造のみを許可します：

{
  "status": "success",
  "problems": [
    {
      "id": "unique_id",
      "problem_text": "...",
      "method_hint": {
  "method_id": "xxx",
  "label": "辞書のlabelそのまま",
  "pitch": "辞書のpitchそのまま",
  "bridge": "この問題向けの1文補足（計算なし）",
  "confidence": 0.00,
  "signals": ["..."]
},
      "steps": [
  {
    "order": 1,
    "hint": "まずは、表の右側を見て、1組の人数とメダルの数を確認しよう。",
    "solution": "1組の人数とメダルの数がそろったね。これで『1人あたり』を考えやすくなったよ。ここまで大丈夫そうかな？",
    "calculation": {
      "expression": "10 ÷ 4",
      "result": 2.5,
      "unit": "個",
      "note": "1人あたりのメダルの数"
    }
  }
],

      "final_answer": "答え：500人\\n\\n【理由】30000人の人口を60平方キロメートルの面積で等しく分ける（30000÷500）と、1平方キロメートルあたり500人になるからです。"
    }
  ]
}
`;

export function createAnalysisPrompt(problemText: string, extraInstruction?: string) {
  const extra = extraInstruction ? `\n\n【追加ルール】\n${extraInstruction}\n` : "";
  return `${ANALYSIS_PROMPT}${extra}\n【問題文】\n${problemText}\n`.trim();
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
          final_answer: { type: "string" },
          method_hint: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              pitch: { type: "string" },
            },
            required: ["label", "pitch"],
          },
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
        required: ["id", "problem_text", "steps", "final_answer"],
      },
    },
  },
  required: ["status", "problems"],
};

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
    method_hint: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string" },
        pitch: { type: "string" },
      },
      required: ["label", "pitch"],
    },
    final_answer: { type: "string" },
  },
  required: ["method_hint", "final_answer"],
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
画像には算数の問題文が写っています。以下の厳格なルールで、問題文だけを抽出してください。

- 出力は JSON のみ。余計な説明や余白を含めず、指定した構造だけを返す。
- 出力形式:
{
  "problem_text": "画像にある問題文を事実どおりに再構成した文章"
}
- 図中や文章中の数値・単位・割合・条件をすべて自然な日本語で記述し、指示語や番号（①など）は具体的な語に置き換えてください。
- 文章はやさしい語尾で、問いかけや命令口調を避けて客観的に説明する形にしてください。
`;

export const PROBLEM_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    problem_text: { type: "string" },
  },
  required: ["problem_text"],
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
あなたは算数問題の「考え方ヒント」と「最終回答」だけを作成します。
method_hint は必須で、label と pitch は辞書の文をそのまま使います。
final_answer は「答え：」と「【理由】」の形で、会話調で短くまとめてください。

【制御情報】
- 難易度: ${difficulty}
- ${VOCABULARY_RULES[difficulty]}

【ステップの要点（短く）】
${titles}

【出力形式(JSONのみ)】
{
  "method_hint": { "label": "辞書のlabelそのまま", "pitch": "辞書のpitchそのまま" },
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

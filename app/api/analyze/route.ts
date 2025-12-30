import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

const METHOD_DICT_V1_1 = `{
  "version": "1.1",
  "language": "ja-JP",
  "purpose": "算数の文章題で『どの考え方（解法パターン）を使うと整理しやすいか』を、子供向けのやさしい言葉で提示するための辞書",
  "notes": [
    "pitchは先生のような指導ではなく、隣にいるパートナーとしての『気づき』の言葉",
    "専門用語を避け、動作やイメージ（分ける、そろえる、ズレを見る）を重視"
  ],
  "entries": [
    {
      "id": "tsurukame",
      "label": "つるかめ算",
      "aliases": ["置き換え算", "仮定法", "差の置き換え"],
      "use_when": [
        "2種類が混ざっていて、合計の『数』と合計の『値（足の本数・金額など）』がある",
        "1つを基準に『全部が同じだったら？』と仮定すると話が単純になる"
      ],
      "pitch": "「もし全部が同じ種類だったら？」って想像してみよう。本当の数との「ズレ」を見ると、答えが見えてくるよ。",
      "signals": ["混ざっている", "合計", "足の数", "料金", "点数", "1つあたりが違う"],
      "disambiguation": ["和差算は合計と差。つるかめは「もし〜なら」の仮定。"]
    },
    {
      "id": "warisoku_tabibito",
      "label": "旅人算 (速さ)",
      "aliases": ["速さ", "距離と時間", "追いつく", "出会う"],
      "use_when": [
        "速さ・時間・距離の関係を扱う",
        "同じ道を進む、反対から出会う、追いかけるなどの動きがある"
      ],
      "pitch": "「速さ」「時間」「道のり」。この3つの関係を使おう。どれが一緒で、どれが変わるかな？図に書いて整理してみよう。",
      "signals": ["時速", "分速", "km", "m", "分", "秒", "出会う", "追いつく", "同時に出発"],
      "disambiguation": ["「はじき」の公式をただ使うより、状況整理を優先させる。"]
    },
    {
      "id": "average",
      "label": "平均の計算",
      "aliases": ["平均", "ならす"],
      "use_when": [
        "平均値が問われる",
        "平均との差や、平均との差を利用して調整する話が出る"
      ],
      "pitch": "平均は「ぜんぶ集めて、みんなに同じ数ずつ配る」イメージだよ。デコボコをならして、平らにしてみよう。",
      "signals": ["平均", "ならす", "平均との差", "合計をそろえる"],
      "disambiguation": ["合計÷個数が基本だが、面積図のイメージも有効。"]
    },
    {
      "id": "fraction_add_sub",
      "label": "分数の足し算・引き算",
      "aliases": ["分数", "通分", "約分"],
      "use_when": [
        "分数同士の足し引きが出る",
        "単位分数や帯分数、異なる分母の比較が出る"
      ],
      "pitch": "分数は「分け方」が違うと、足したり引いたりできないんだ。まずは「同じ分け方（通分）」にそろえてあげよう。",
      "signals": ["分数", "分母", "分子", "何分の何", "帯分数"],
      "disambiguation": ["分母をそろえる＝単位をそろえること。"]
    },
    {
      "id": "circle_area_circumference",
      "label": "円の面積と円周",
      "aliases": ["円", "半径", "直径", "円周率"],
      "use_when": [
        "円の面積または円周（まわりの長さ）が出る",
        "半径・直径・円周率が登場する"
      ],
      "pitch": "円の問題は「半径」が王様だよ！知りたいのは「中身の広さ（面積）」かな？それとも「まわりの長さ（円周）」かな？",
      "signals": ["半径", "直径", "円周", "面積", "π", "3.14"],
      "disambiguation": ["公式の取り違えに注意。"]
    },
    {
      "id": "cylinder_cone_volume",
      "label": "円柱・円錐の体積",
      "aliases": ["体積", "円柱", "円錐", "高さ"],
      "use_when": [
        "円柱や円錐の体積を扱う",
        "底面（円）と高さの関係で考える"
      ],
      "pitch": "体積は「底の広さ」×「高さ」だよ。どれが底で、どれが高さか、図を見て指差してみよう。",
      "signals": ["体積", "円柱", "円錐", "高さ", "底面"],
      "disambiguation": ["円錐は最後に1/3を忘れずに。"]
    },
    {
      "id": "ratio_proportion_inverse",
      "label": "比と比例・反比例",
      "aliases": ["比", "比例", "反比例", "割合の比"],
      "use_when": [
        "比が出る、または『同じ割合で増える』話",
        "片方が増えると片方が減る関係がある"
      ],
      "pitch": "比は「形を変えずに大きさを変える」魔法の道具だよ。「片方が2倍なら、もう片方も2倍」になるかな？関係をチェックしてみよう。",
      "signals": ["比", "比例", "反比例", "同じ割合", "一定"],
      "disambiguation": ["比例（商が一定）か反比例（積が一定）かを見極める。"]
    },
    {
      "id": "gcd_lcm",
      "label": "最大公約数・最小公倍数",
      "aliases": ["GCD", "LCM", "公約数", "公倍数"],
      "use_when": [
        "同じ大きさで分けたい、まとめたい（最大公約数）",
        "同じタイミングにそろえたい、周期を合わせたい（最小公倍数）"
      ],
      "pitch": "同じ数ずつ「分ける（約数）」のかな？それとも、積み重ねて「そろえる（倍数）」のかな？どっちの作業が必要か考えてみよう。",
      "signals": ["等分", "同じ数ずつ", "あまりなく", "周期", "何回目で同時", "最初にそろう"],
      "disambiguation": ["分ける＝約数、そろえる＝倍数。"]
    },
    {
      "id": "salt_solution",
      "label": "食塩水の濃度",
      "aliases": ["濃度", "食塩水", "混ぜる"],
      "use_when": [
        "濃度（％）が出る",
        "食塩水を混ぜる、増やす、薄める"
      ],
      "pitch": "食塩と水を分けて考えると、こんがらがらないよ。「食塩の重さ」と「全体の重さ」、それぞれどう変わったかな？",
      "signals": ["%", "濃度", "食塩", "水", "混ぜる", "薄める"],
      "disambiguation": ["食塩の量に注目すると式が立てやすい。"]
    },
    {
      "id": "excess_deficit",
      "label": "過不足算",
      "aliases": ["過不足", "余る", "足りない", "配る"],
      "use_when": [
        "同じ数ずつ配ると余る／足りない",
        "人数や個数が変わると過不足が変化する"
      ],
      "pitch": "「配り方」を変えると、「余り」や「足りない分」がどう変わるかな？その変化を見れば、人数がわかるよ。",
      "signals": ["余る", "足りない", "配る", "1人あたり", "ずつ"],
      "disambiguation": ["差集め算とも呼ぶ。差の合計÷1つあたりの差。"]
    },
    {
      "id": "congruence_similarity",
      "label": "図形の合同と相似",
      "aliases": ["合同", "相似", "対応", "比"],
      "use_when": [
        "同じ形（合同）か、形は同じで大きさが違う（相似）",
        "対応する辺や角を使って関係を作る"
      ],
      "pitch": "図形は「対応」が大事！どの辺とどの辺がペアかな？同じ印をつけて整理してみよう。",
      "signals": ["合同", "相似", "対応", "辺", "角", "比"],
      "disambiguation": ["向きが変わっている図形に注意。"]
    },
    {
      "id": "integers_prep",
      "label": "正負の数 (準備)",
      "aliases": ["正の数", "負の数", "符号"],
      "use_when": [
        "0より小さい数、増減、差、座標などが出る",
        "上下・前後・収支などのプラスマイナス表現がある"
      ],
      "pitch": "0を基準にして、どっち向きに進むか決めよう。「増える（プラス）」かな？「減る（マイナス）」かな？",
      "signals": ["マイナス", "プラス", "0より", "増える/減る", "収支"],
      "disambiguation": ["言葉を符号に置き換える作業。"]
    },
    {
      "id": "data_organize",
      "label": "データの整理",
      "aliases": ["表", "グラフ", "度数", "代表値"],
      "use_when": [
        "表やグラフを読んで答える",
        "度数分布、平均・中央値・最頻値などを扱う"
      ],
      "pitch": "ごちゃごちゃした数字は、表にまとめるとスッキリするよ。まずは何と何の関係か、項目を決めてみよう。",
      "signals": ["表", "グラフ", "度数", "中央値", "最頻値"],
      "disambiguation": ["軸や単位の読み間違いに注意を促す。"]
    },
    {
      "id": "planting",
      "label": "植木算",
      "aliases": ["間の数", "並べる", "等間隔"],
      "use_when": [
        "等間隔に並べる、間の数、端がある/ない",
        "街灯・木・人・点などを一定間隔で置く"
      ],
      "pitch": "「木の数」と「間の数」はズレることがあるよ。指を使って、簡単な図で数えて確かめてみよう。",
      "signals": ["等間隔", "間", "端", "並べる", "輪"],
      "disambiguation": ["+1するか-1するか、図を描けば忘れない。"]
    },
    {
      "id": "distribution",
      "label": "分配算",
      "aliases": ["分ける", "配る", "わり算の活用"],
      "use_when": [
        "全体を均等に分ける話",
        "1つ分あたりを求めたい"
      ],
      "pitch": "全部の量を、同じ数ずつ平等に分けるイメージだよ。「合計」と「いくつで分けるか」が見つかれば、計算できそうだね。",
      "signals": ["ずつ", "等分", "1人あたり", "1こあたり"],
      "disambiguation": ["基本の割り算の考え方。"]
    },
    {
      "id": "wasas",
      "label": "和差算",
      "aliases": ["合計と差", "2つの数"],
      "use_when": [
        "2つの量の合計と差が与えられる",
        "片方がもう片方よりいくつ多い（少ない）が明確"
      ],
      "pitch": "もし2つの数が同じだったらどうなるかな？「合計」と「ちがい」を使って、長さをそろえてみよう。",
      "signals": ["合計", "差", "多い/少ない", "2つの数"],
      "disambiguation": ["大きい方にそろえるか、小さい方にそろえるか。"]
    },
    {
      "id": "elimination",
      "label": "消去算",
      "aliases": ["差をとる", "そろえる", "連立的"],
      "use_when": [
        "同じものが複数セットあり、差を取ると一部が消える",
        "2種類の組み合わせの比較から中身を出す"
      ],
      "pitch": "形をそろえてから「引き算」をすると、邪魔なものが消えるよ。残ったものを見れば、正体がわかるはず！",
      "signals": ["Aセット", "Bセット", "差", "同じものが含まれる"],
      "disambiguation": ["連立方程式の基礎。代入より加減法（差を取る）を推奨。"]
    },
    {
      "id": "equivalent",
      "label": "相当算",
      "aliases": ["基準量", "相当", "割合で戻す"],
      "use_when": [
        "割合で増減した後の量から、元の量を求めたい",
        "『何%にあたる』が手がかりになる"
      ],
      "pitch": "「もとの量」がわかれば、全部わかるよ。「いまの量」は、「もとの量」の何個分（何％）にあたるかな？",
      "signals": ["何%", "増えた/減った", "元の", "相当"],
      "disambiguation": ["線分図を描いて「1あたり」を見つけるのがコツ。"]
    },
    {
      "id": "work",
      "label": "仕事算",
      "aliases": ["仕事", "能率", "何日で終わる"],
      "use_when": [
        "作業を何人で何日、何時間で終える",
        "一緒にやる、途中参加、交代などがある"
      ],
      "pitch": "仕事全体を「1」として考えよう。1日でどれくらい進むかな？その「進み方」を足し算してみよう。",
      "signals": ["何日", "何時間", "一緒に", "能率", "終わる"],
      "disambiguation": ["全体の仕事量を勝手に数字（最小公倍数など）で置くのもアリだが、基本は1。"]
    }
  ]
}
`;

const prompt = `
あなたは小学校4年生の子供の「考える力」を育てる、一貫性と規律を持ったAIコーチ（先生）です。
画像に写っている算数の問題を読み取り、以下の厳格なルールに従ってJSONデータを作成してください。
出力ごとの情報のバラつき（揺れ）は許されません。常に一定の品質・構成を保ってください。

【共通の語り口ルール（全ステップ共通）】
- すべての文章は、子供に話しかける「やさしい会話調」で書くこと。
- 命令調（〜しましょう、〜求めましょう、〜しなさい）は使用しない。
- 事務的・手順的な言い回し（「同じように」「前と同じで」「次に」など）は使わない。
- 「どうかな？」「考えてみよう」「見てみよう」など、自然な問いかけ表現を用いる。

【前のステップの振り返り表現ルール（全ステップ共通）】
- 前のステップの結果を伝えるときは、数値や式だけで終わらせない。
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
・ステップ1以降すべてに共通して有効であること
・特定の操作や数値に結びつかないこと
を必須条件とする。

【計算法辞書（参照データ）】
以下のJSONは「問題の見立て（考え方の方針）」に使う参照辞書です。

- この辞書を読み取り、最も近い entries[].id を 1つ選びなさい
- 解法名を断定的に教えるためではなく、「考え方の方向性」を示すために使います
- hint や step 内で「〇〇算の出番だね」など、名称を直接教えてはいけません
- UI表示用として、必ず method_hint を problems[0] に含めて返してください
- 該当が曖昧な場合でも、最も近いものを 1つ必ず選んでください

${METHOD_DICT_V1_1}

【method_hint の出力ルール（重要・厳守）】

- method_hint は必須項目です（省略不可）
- 出力形式は以下のみを許可します

"method_hint": {
  "label": "辞書 entries[].label をそのまま使用",
  "pitch": "辞書 entries[].pitch を1文字も変えずにそのまま使用"
}

【禁止事項】
- pitch の要約・言い換え・語尾変更・句読点変更
- 独自に文章を生成すること
- label や pitch を空にすること

※ 辞書の文章をコピーしてそのまま返すこと。
※ 判断に迷っても、最も近いものを必ず1つ選ぶこと。


【制約】
・特定の問題タイプ（比較・計算・図形など）に依存する表現を使わない
・答えに直結する操作や数値の扱いには触れない
・次のステップで何をするかを確定させない


【ステップ作成の絶対ルール (Strict Rules)】
各ステップは以下の要素で構成し、それぞれの役割を厳守してください。

1. **hint (ヒント・考え方)**
   - 「図のどこを見るべきか」「単位は何か」など、視覚的な注目ポイントを指摘する。
   - 「どういう計算をするか」「どの公式を使うか」という方針を示す。
   - **なぜこのステップを今行うのか（この作戦を最初に選ぶ理由）を、子供にも分かる言葉で必ず説明する。**
   - 子供にアクションを促す言葉。「?を計算してみよう」「?を確かめてみよう」。

   【重要】
   - 「まずは◯◯を求めよう。」で終わる文章は禁止する。
   - 「なぜ今それをするのか」という理由が書かれていない hint は不正な出力とみなす。

2. **solution (答えと解説)**
   - そのステップでの計算結果（数値）を提示する。
   - 例：「10÷4＝2.5 なので、2.5ひき だよ。」

【最終判断ステップに関する追加ルール】

- 複数の量を比べて結論を出す問題では、計算がすべて終わったあとに、
  「結果を並べて比べ、意味を整理するためのステップ」を必ず1つ設けてください。
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
  "confidence": 0.00,
  "signals": ["..."]
}
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
                  method_hint: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      pitch: { type: Type.STRING },
                    },
                    required: ["pitch"],
                  },
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
    console.log("[debug] raw model text", raw);

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
      console.log("[debug] parsed result method_hint", parsed?.problems?.[0]?.method_hint);
      if (!parsed?.problems?.[0]?.method_hint?.pitch) {
        console.warn("[warn] method_hint missing in parsed response");
      }
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

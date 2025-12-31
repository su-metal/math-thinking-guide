import type { Difficulty } from "@/lib/levelEstimator";

export const METHOD_DICT_V1_1 = `{
  "version": "1.1",
  "language": "ja-JP",
  "purpose": "算数の文章題で『どの考え方（解法パターン）を使うと整理しやすいか』を、計算手順ではなく方針として短く提示するための辞書",
  "notes": [
    "ここにある名称は『断定』ではなく候補提示用。状況によって複数が当てはまる場合がある",
    "Pitch は計算をしない。判断軸や見方の切り替えだけを言葉で示す",
    "見分けが難しい組は、似ているパターンとの差分（disambiguation）を優先して短く示す"
  ],
  "entries": [
    {
      "id": "tsurukame",
      "label": "つるかめ算",
      "aliases": ["置き換え算", "仮定法", "差の置き換え"],
      "use_when": [
        "2種類が混ざっていて、合計の『数』と合計の『値（足の本数・金額・得点など）』が与えられる",
        "1つを基準に『全部が同じだったら？』と仮定すると話が単純になる"
      ],
      "pitch": "もし全部が同じ種類だったらどうなるかを仮定してみよう。そこから実際とのズレがいくつ分あるかを見ると、2種類の内訳が見えてくるよ。",
      "signals": ["混ざっている", "合計", "足の数", "料金", "点数", "1つあたりが違う"],
      "disambiguation": [
        "和差算は『合計と差』から2つの数を決める発想。つるかめ算は『全部〇〇なら？』の仮定からズレを見る発想。"
      ]
    },
    {
      "id": "warisoku_tabibito",
      "label": "旅人算 (速さ)",
      "aliases": ["速さ", "距離と時間", "追いつく", "出会う"],
      "use_when": [
        "速さ・時間・距離の関係を扱う",
        "同じ道を進む、反対から出会う、追いかける、途中で休むなどの動きがある"
      ],
      "pitch": "動いているものは『速さ』『時間』『道のり』の3つで整理できるよ。まずどれが同じで、どれが変わるかを言葉で分けてみよう。",
      "signals": ["時速", "分速", "km", "m", "分", "秒", "出会う", "追いつく", "同時に出発"],
      "disambiguation": [
        "平均の速さは『全体の道のり ÷ 全体の時間』。区間ごとの平均を単純平均しない。"
      ]
    },
    {
      "id": "average",
      "label": "平均の計算",
      "aliases": ["平均", "ならす"],
      "use_when": [
        "平均値が問われる",
        "平均との差や、平均との差を利用して調整する話が出る"
      ],
      "pitch": "平均は『みんなを同じにそろえる中心』だよ。平均との差で考えると、増やした分と減らした分がつり合う形で整理できる。",
      "signals": ["平均", "ならす", "平均との差", "合計をそろえる"],
      "disambiguation": [
        "平均は『合計 ÷ 個数』の考え方に戻れる。途中の平均同士をそのまま混ぜるとズレやすい。"
      ]
    },
    {
      "id": "fraction_add_sub",
      "label": "分数の足し算・引き算",
      "aliases": ["分数", "通分", "約分"],
      "use_when": [
        "分数同士の足し引きが出る",
        "単位分数や帯分数、異なる分母の比較が出る"
      ],
      "pitch": "分数は『同じ大きさの1を、いくつに分けたか』で決まるよ。比べたり足したりするには、同じ分け方にそろえる見方が大事。",
      "signals": ["分数", "分母", "分子", "何分の何", "帯分数"],
      "disambiguation": [
        "分母が違うままだと足し引きの意味がズレる。まず『同じ分け方』にそろえる。"
      ]
    },
    {
      "id": "circle_area_circumference",
      "label": "円の面積と円周",
      "aliases": ["円", "半径", "直径", "円周率"],
      "use_when": [
        "円の面積または円周（まわりの長さ）が出る",
        "半径・直径・円周率が登場する"
      ],
      "pitch": "円は『中心からの距離（半径）』がカギ。面積とまわりの長さは別物だから、いま求めたいのがどっちかを先に決めよう。",
      "signals": ["半径", "直径", "円周", "面積", "π", "3.14"],
      "disambiguation": [
        "円周は『まわりの長さ』、面積は『中の広さ』。同じ円でも目的が違う。"
      ]
    },
    {
      "id": "cylinder_cone_volume",
      "label": "円柱・円錐の体積",
      "aliases": ["体積", "円柱", "円錐", "高さ"],
      "use_when": [
        "円柱や円錐の体積を扱う",
        "底面（円）と高さの関係で考える"
      ],
      "pitch": "体積は『底の広さ × 高さ』の見方で整理できるよ。まず『底の形』と『高さ』がどれかを言葉で分けよう。",
      "signals": ["体積", "円柱", "円錐", "高さ", "底面"],
      "disambiguation": [
        "同じ高さでも、底の広さが変わると体積が変わる。何が一定かを確認する。"
      ]
    },
    {
      "id": "ratio_proportion_inverse",
      "label": "比と比例・反比例",
      "aliases": ["比", "比例", "反比例", "割合の比"],
      "use_when": [
        "比が出る、または『同じ割合で増える』話",
        "片方が増えると片方が減る関係がある"
      ],
      "pitch": "比は『くらべ方のルール』だよ。増え方が同じなら比例、片方が増えるほどもう片方が減って積が一定なら反比例、という見方で整理しよう。",
      "signals": ["比", "比例", "反比例", "同じ割合", "一定"],
      "disambiguation": [
        "比例は『割り算で一定』になりやすい。反比例は『掛け算で一定』になりやすい。"
      ]
    },
    {
      "id": "gcd_lcm",
      "label": "最大公約数・最小公倍数",
      "aliases": ["GCD", "LCM", "公約数", "公倍数"],
      "use_when": [
        "同じ大きさで分けたい、まとめたい、切り分けたい（最大公約数）",
        "同じタイミングにそろえたい、周期を合わせたい（最小公倍数）"
      ],
      "pitch": "必要なのは『分ける（切る）』作業かな？それとも『積み重ねてそろえる（合わせる）』作業かな？分けるなら約数、そろえるなら倍数の見方が合うよ。",
      "signals": ["等分", "同じ数ずつ", "あまりなく", "周期", "何回目で同時", "最初にそろう"],
      "disambiguation": [
        "GCD は『分ける・切る・まとめる』。LCM は『そろえる・重ねる・同時』。"
      ]
    },
    {
      "id": "salt_solution",
      "label": "食塩水の濃度",
      "aliases": ["濃度", "食塩水", "混ぜる"],
      "use_when": [
        "濃度（％）が出る",
        "食塩水を混ぜる、増やす、薄める、取り出す"
      ],
      "pitch": "濃度は『全体の中の成分の割合』だよ。いま増えるのは水なのか、食塩なのか、全体なのかを分けて考えると整理できる。",
      "signals": ["%", "濃度", "食塩", "混ぜる", "薄める"],
      "disambiguation": [
        "全体量と成分量を別々に追うと混乱が減る。"
      ]
    },
    {
      "id": "excess_deficit",
      "label": "過不足算",
      "aliases": ["過不足", "余る", "足りない", "配る"],
      "use_when": [
        "同じ数ずつ配ると余る／足りない",
        "人数や個数が変わると過不足が変化する"
      ],
      "pitch": "『1人（1つ）あたり』を少し変えると、全体の余りや足りなさがどう変わるかを見てみよう。変化の分から元の数が見えてくるよ。",
      "signals": ["余る", "足りない", "配る", "1人あたり", "ずつ"],
      "disambiguation": [
        "平均と似るが、過不足は『余り／不足』の変化に注目する。"
      ]
    },
    {
      "id": "congruence_similarity",
      "label": "図形の合同と相似",
      "aliases": ["合同", "相似", "対応", "比"],
      "use_when": [
        "同じ形（合同）か、形は同じで大きさが違う（相似）",
        "対応する辺や角を使って関係を作る"
      ],
      "pitch": "図形は『対応』が命だよ。どの辺とどの辺、どの角とどの角が対応しているかを決めると、使える関係が一気に見えてくる。",
      "signals": ["合同", "相似", "対応", "辺", "角", "比"],
      "disambiguation": [
        "合同は大きさも同じ。相似は形は同じで、長さは比例する。"
      ]
    },
    {
      "id": "integers_prep",
      "label": "正負の数 (準備)",
      "aliases": ["正の数", "負の数", "符号"],
      "use_when": [
        "0より小さい数、増減、差、座標などが出る",
        "上下・前後・収支などのプラスマイナス表現がある"
      ],
      "pitch": "正負は『基準からの向き』だよ。どれがプラスで、どれがマイナスかを言葉で決めると式のミスが減る。",
      "signals": ["マイナス", "プラス", "0より", "増える/減る", "収支"],
      "disambiguation": [
        "基準（0）と向きを先に固定する。"
      ]
    },
    {
      "id": "data_organize",
      "label": "データの整理",
      "aliases": ["表", "グラフ", "度数", "代表値"],
      "use_when": [
        "表やグラフを読んで答える",
        "度数分布、平均・中央値・最頻値などを扱う"
      ],
      "pitch": "データ問題は『何を数えているか』を決めるのが先。表の行と列がそれぞれ何を表しているかを言葉で確認しよう。",
      "signals": ["表", "グラフ", "度数", "中央値", "最頻値"],
      "disambiguation": [
        "読み取りミスは『軸』『単位』『区切り』の見落としから起きやすい。"
      ]
    },
    {
      "id": "planting",
      "label": "植木算",
      "aliases": ["間の数", "並べる", "等間隔"],
      "use_when": [
        "等間隔に並べる、間の数、端がある/ない",
        "街灯・木・人・点などを一定間隔で置く"
      ],
      "pitch": "『点の数』と『間の数』は同じじゃないよ。端が両方あるのか、輪になっているのかで数え方が変わるから、まず形を言葉で確認しよう。",
      "signals": ["等間隔", "間", "端", "並べる", "輪"],
      "disambiguation": [
        "直線：点と間は1つずれる。円：点と間が同じ数になりやすい。"
      ]
    },
    {
      "id": "distribution",
      "label": "分配算",
      "aliases": ["分ける", "配る", "わり算の活用"],
      "use_when": [
        "全体を均等に分ける話",
        "1つ分あたりを求めたい"
      ],
      "pitch": "全体を同じ大きさの『1つ分』に分けるイメージで整理しよう。『全体』と『何個に分けるか』がどれかを言葉で決めると進めやすい。",
      "signals": ["ずつ", "等分", "1人あたり", "1こあたり"],
      "disambiguation": [
        "割合問題と似るが、分配は『均等に分ける』ことが中心。"
      ]
    },
    {
      "id": "wasas",
      "label": "和差算",
      "aliases": ["合計と差", "2つの数"],
      "use_when": [
        "2つの量の合計と差が与えられる",
        "片方がもう片方よりいくつ多い（少ない）が明確"
      ],
      "pitch": "合計と差があるなら、まず『同じにしたらどうなるか』を考えてみよう。差を半分ずつ分ける見方で、2つの量が整理できる。",
      "signals": ["合計", "差", "多い/少ない", "2つの数"],
      "disambiguation": [
        "つるかめ算は『仮定してズレを見る』。和差算は『合計と差を分ける』。"
      ]
    },
    {
      "id": "elimination",
      "label": "消去算",
      "aliases": ["差をとる", "そろえる", "連立的"],
      "use_when": [
        "同じものが複数セットあり、差を取ると一部が消える",
        "2種類の組み合わせの比較から中身を出す"
      ],
      "pitch": "比べやすい形にそろえてから、差をとって共通部分を消してみよう。消えると、残った部分の正体が見えるよ。",
      "signals": ["Aセット", "Bセット", "差", "同じものが含まれる"],
      "disambiguation": [
        "和差算は1つの合計と差。消去算は『複数セットを差で消す』構造がある。"
      ]
    },
    {
      "id": "equivalent",
      "label": "相当算",
      "aliases": ["基準量", "相当", "割合で戻す"],
      "use_when": [
        "割合で増減した後の量から、元の量を求めたい",
        "『何%にあたる』が手がかりになる"
      ],
      "pitch": "『いまの量が、元の何%にあたるか』を言葉で固定しよう。割合の基準を決めると、元に戻す道筋が見えてくる。",
      "signals": ["何%", "増えた/減った", "元の", "相当"],
      "disambiguation": [
        "割合の基準（もと）を取り違えると全部ズレる。最初に基準を宣言する。"
      ]
    },
    {
      "id": "work",
      "label": "仕事算",
      "aliases": ["仕事", "能率", "何日で終わる"],
      "use_when": [
        "作業を何人で何日、何時間で終える",
        "一緒にやる、途中参加、交代などがある"
      ],
      "pitch": "仕事算は『仕事の全体を1とみなす』と整理しやすいよ。1人（1台）が1時間でどれだけ進むか、という見方でまとめてみよう。",
      "signals": ["何日", "何時間", "一緒に", "能率", "終わる"],
      "disambiguation": [
        "速さと似るが、対象が『作業量』。単位を『仕事の1』にそろえると混乱が減る。"
      ]
    }
  ]
}
`;

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
・ステップ1以降すべてに共通して有効であること
・特定の操作や数値に結びつかないこと
を必須条件とする。


【制約】
・特定の問題タイプ（比較・計算・図形など）に依存する表現を使わない
・問題で聞かれている「最終的な答え」を断定してはいけない
・「つまり〇〇人」「これが答えだよ」「人口密度は〇〇だね」などの結論表現は禁止
・最終的な答えは、final_answer フィールドでのみ提示する
・次のステップで何をするかを確定させない

【途中計算の出力ルール（重要）】
- 途中計算（式と計算結果）は steps[].calculation にのみ入れる
- steps[].solution には式（+ - × ÷）や =（イコール）や計算結果の数値を書かない
- steps[].solution は「意味づけ」と「短い問いかけ」だけを書く
- 最終的な答え（問題が聞いている結論）は final_answer にのみ書く
- 小学生が使わない関数表記は禁止（LCM, GCD, gcd, lcm, min, max, sqrt, log など）
- 計算式は「+ - × ÷」または「最小公倍数(4と6)」のような日本語だけを使う
- 記号っぽい省略表現（LCM(4,6) など）は絶対に使わない

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
        required: ["id", "problem_text", "steps", "final_answer", "method_hint"],
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
- 図や表、グラフがある場合は、それがあることを必ず problem_text に含めてください。「表」「グラフ」という単語は省略しないでください。
- 問題文中に「右の表」「次の表」「下のグラフ」などがある場合、その存在を消して文章化しないでください。
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
  easy: "ステップ数は3を基本。簡単な問題を引き延ばしてはいけない。分割は最小限にし、同じ内容の繰り返しを作らない。",
  normal: "ステップ数は4を基本（必要なら5まで）。簡単な問題を無理に増やしてはいけない。重複や言い換えで水増ししない。",
  hard: "ステップ数は5-7。必要なら6を超えてよい。難しさに応じて細かく分割し、1ステップ1つの計算対象を扱う。",
};

const VOCABULARY_RULES: Record<Difficulty, string> = {
  easy: `語彙はやさしく短く。以下の単語は使わない: 最大公約数, 最小公倍数, 比, 割合, 分数, 分母, 分子, 連立, 文字式。`,
  normal: `基本語（公約数, 面積, あたり, 角度など）は使ってOK。計算式のネタバレになる言い回しは避け、考え方を丁寧に説明する。`,
  hard: `専門用語は使ってよいが、初出で簡単な補足（例: 「最大公約数(共通の約数のうちいちばん大きな数)」）を添える。`,
};

export function createControlledAnalysisPrompt(problemText: string, difficulty: Difficulty) {
  const easyExtra =
    difficulty === "easy"
      ? "\n- easy は文を短くする。具体例の長い列挙はしない。"
      : "";
  return `${ANALYSIS_PROMPT}
【制御情報（以下を必ず守る）】
- 難易度: ${difficulty}
- ${STEP_COUNT_RULES[difficulty]}
- ${VOCABULARY_RULES[difficulty]}
${easyExtra}
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
  forceJudgementStep?: boolean;
}) {
  const { problemText, difficulty, stepTitles, startOrder, endOrder, forceJudgementStep } = args;

  const nonHardRule =
    difficulty === "hard"
      ? "hard のときは必要なら6ステップを超えてよい。"
      : "easy/normal は概ね3?4ステップ。必要最小限で作り、無理に増やさない。";

  const hasTitles = Array.isArray(stepTitles) && stepTitles.length > 0;

  return `
指定された範囲のステップだけを作成してください。
ステップ数は「必要最小限」。指定レンジの件数ぶんだけ作り、内容の薄い引き延ばしをしない。
命令口調や講義口調は避け、やさしい会話調(できたかな？、かんがえてみよう)で書く。
hint は着眼点と作戦だけ、solution は意味づけと短い問いかけだけ。
calculation を出す場合は expression と result を必ず入れます。

【重要: ステップ数の方針】
- ${nonHardRule}
- このチャンクで作るステップは ${startOrder} から ${endOrder} の ${endOrder - startOrder + 1} 個。
- 指定された order 連番の数だけ作り、余計に増やさない。
- “整理ステップ”は必ず含める（必要最小限 + 整理ステップ1 が基本形）。

【最終確認ステップ ルール（必須）】
- ステップの最後に必ず「まとめ/確認」のステップを1つ入れる。
- そのステップでは新しい計算はしない（calculation は出さない）。
- これまでに出た結果を“ことば”で並べて意味を確認する。
- 子どもが結論に行ける問いかけで終える（断定しない）。
- 答えの断定はしない（断定は final_answer のみ）。
- 最後のステップは、計算結果の意味と単位を言葉で確認して、答えを言う準備をする（結論は言わない）。
- stepsのhint/solutionでは『答え』『正解』という語を使わない。結論はfinal_answerでのみ述べる。
${hasTitles ? "" : "- non-hard の場合、最後のステップは必ず比較/判断/結論準備の役割にする（ただし結論は言わない）。"}
${forceJudgementStep ? "- 最後のステップは「くらべて決める」内容にし、結論の断定はしない。" : ""}

【calculation ルール】
- expression は四則演算のみ: + - * / × ÷ ( ) と整数/小数/分数 a/b
- 禁止: 比較(>, <, =, >=, <=), 論理(and/or), 判定や結論文
- 比較・判定・結論は solution に文章で書く
- 計算が不要なステップは calculation を出さない
- expression に単位文字を入れない（単位は unit に）

【制御情報】
- 難易度: ${difficulty}
- ${VOCABULARY_RULES[difficulty]}
- Separation Rule（1ステップ＝1対象）は厳守。

${hasTitles ? `【この範囲のステップ要点】\n${stepTitles
    .map((t, idx) => `${startOrder + idx}. ${t}`)
    .join("\n")}\n` : ""}

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
「考え方ヒント」と「最終回答」だけを作成します。
method_hint は必須で、短い一般テンプレで作成します（辞書参照は禁止）。
final_answer は「答え：」と「【理由】」の形で、会話調で短くまとめます。

【制御情報】
- 難易度: ${difficulty}
- ${VOCABULARY_RULES[difficulty]}

【ステップ要点】
${titles}

【出力(JSONのみ)】
{ "method_hint": { "label": "短い見出し", "pitch": "やさしい一文ヒント" }, "final_answer": "答え：...\\n\\n【理由】..." }

【問題文】
${problemText}
`.trim();
}

export const FINAL_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    final_answer: { type: "string" },
  },
  required: ["final_answer"],
};

export function createFinalAnswerPrompt(problemText: string) {
  return `
算数の問題の最終回答だけを作成してください。
「答え：」と「【理由】」の形で、会話調で短くまとめます。

【出力(JSONのみ)】
{ "final_answer": "答え：...\\n\\n【理由】..." }

【問題文】
${problemText}
`.trim();
}

export { FINAL_ANSWER_SCHEMA, createFinalAnswerPrompt };

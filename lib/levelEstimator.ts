export type Difficulty = "easy" | "normal" | "hard";

export type LevelSignals = {
  has_fraction: boolean;
  has_ratio: boolean;
  has_percentage: boolean;
  has_area: boolean;
  has_unit_rate: boolean;
  has_gcd: boolean;
  has_lcm: boolean;
  has_geometry: boolean;
  has_graph: boolean;
  num_conditions: number;
};

export interface LevelMeta {
  difficulty: Difficulty;
  tags: string[];
  confidence: number;
  signals: LevelSignals;
}

const conditionKeywords = ["ただし", "もし", "場合", "とき"];

const percentageKeywords = ["%", "パーセント", "百分率", "割合"];
const fractionKeywords = ["分の", "分数"];
const ratioKeywords = ["比", "比例", "反比例"];
const ratioRegex = /\d+倍/;
const fractionRegex = /\d+\/\d+/;
const percentageRegex = /\d+%/;

const areaKeywords = ["面積", "平方", "cm2", "cm²", "cm^2", "m2", "m²", "m^2", "㎠", "㎡"];
const unitRateKeywords = ["あたり", "1人あたり", "一人あたり", "こんでいる", "みっしり"];
const gcdComboBaseKeyword = "あまりなく";
const gcdComboPairKeywords = ["同じ数ずつ", "できるだけ多く"];
const gcdKeywords = [
  "最大公約数",
  "公約数",
  "あまりなく配る",
  "あまりなく分ける",
  "同じ数ずつ配る",
  "花束",
  "配りたい",
  "分けたい",
  gcdComboBaseKeyword,
  ...gcdComboPairKeywords,
];
const gcdKeywordMatchList = gcdKeywords.filter(
  (keyword) => keyword !== gcdComboBaseKeyword && !gcdComboPairKeywords.includes(keyword)
);
const lcmKeywords = ["最小公倍数", "公倍数", "何回目で", "周期", "そろって"];
const geometryKeywords = [
  "三角形",
  "長方形",
  "円",
  "角度",
  "周りの長さ",
  "周囲の長さ",
  "直角",
  "底辺",
  "高さ",
];
const graphKeywords = ["グラフ", "表", "棒グラフ", "折れ線"];

const fallbackSignals: LevelSignals = {
  has_fraction: false,
  has_ratio: false,
  has_percentage: false,
  has_area: false,
  has_unit_rate: false,
  has_gcd: false,
  has_lcm: false,
  has_geometry: false,
  has_graph: false,
  num_conditions: 0,
};

const booleanSignalTagMap: Array<[Exclude<keyof LevelSignals, "num_conditions">, string]> = [
  ["has_fraction", "fraction"],
  ["has_ratio", "ratio"],
  ["has_percentage", "percentage"],
  ["has_area", "area"],
  ["has_unit_rate", "unit_rate"],
  ["has_gcd", "gcd"],
  ["has_lcm", "lcm"],
  ["has_geometry", "geometry"],
  ["has_graph", "graph"],
];

const hardTags = new Set(["ratio", "percentage", "fraction", "lcm"]);
const normalTags = new Set(["gcd", "area", "unit_rate", "geometry"]);

const containsKeyword = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword));
const areaRegex = /(cm\s*\^?\s*2|m\s*\^?\s*2|cm²|m²)/i;

const countOccurrences = (text: string, keyword: string): number => {
  if (!keyword) {
    return 0;
  }
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(keyword, index);
    if (found === -1) {
      break;
    }
    count++;
    index = found + keyword.length;
  }
  return count;
};

const clampConfidence = (value: number): number => Math.max(0, Math.min(1, value));

const createFallbackMeta = (): LevelMeta => ({
  difficulty: "normal",
  tags: [],
  confidence: 0.3,
  signals: { ...fallbackSignals },
});

export function estimateLevel(problemText: string | null | undefined): LevelMeta {
  if (!problemText || typeof problemText !== "string") {
    return createFallbackMeta();
  }

  const normalized = problemText.trim().toLowerCase();
  if (!normalized) {
    return createFallbackMeta();
  }

  const signals: LevelSignals = {
    has_fraction:
      containsKeyword(normalized, fractionKeywords) || fractionRegex.test(normalized),
    has_ratio: containsKeyword(normalized, ratioKeywords) || ratioRegex.test(normalized),
    has_percentage:
      containsKeyword(normalized, percentageKeywords) || percentageRegex.test(normalized),
    has_area: containsKeyword(normalized, areaKeywords) || areaRegex.test(normalized),
    has_unit_rate: containsKeyword(normalized, unitRateKeywords),
    has_gcd: (() => {
      const hasBase = normalized.includes(gcdComboBaseKeyword);
      const hasPair = gcdComboPairKeywords.some((fragment) => normalized.includes(fragment));
      const hasCombo = hasBase && hasPair;
      const hasKeywordMatch = containsKeyword(normalized, gcdKeywordMatchList);
      return hasCombo || hasKeywordMatch;
    })(),
    has_lcm: containsKeyword(normalized, lcmKeywords),
    has_geometry: containsKeyword(normalized, geometryKeywords),
    has_graph: containsKeyword(normalized, graphKeywords),
    num_conditions: conditionKeywords.reduce(
      (total, keyword) => total + countOccurrences(normalized, keyword),
      0
    ),
  };

  const tags = booleanSignalTagMap.reduce<string[]>((acc, [signalKey, tag]) => {
    if (signals[signalKey]) {
      acc.push(tag);
    }
    return acc;
  }, []);

  const signalTrueCount = booleanSignalTagMap.reduce(
    (acc, [signalKey]) => acc + (signals[signalKey] ? 1 : 0),
    0
  );

  const rawConfidence =
    0.35 + 0.12 * signalTrueCount + 0.03 * Math.min(signals.num_conditions, 5);
  const confidence = clampConfidence(rawConfidence);

  const hasHardSignal =
    signals.has_ratio ||
    signals.has_percentage ||
    signals.has_fraction ||
    signals.has_lcm ||
    tags.some((t) => hardTags.has(t));
  const hasNormalSignal =
    signals.has_gcd ||
    signals.has_area ||
    signals.has_unit_rate ||
    signals.has_geometry ||
    tags.some((t) => normalTags.has(t));

  let difficulty: Difficulty = "easy";
  if (hasHardSignal) {
    difficulty = "hard";
  } else if (hasNormalSignal) {
    difficulty = "normal";
  }

  return {
    difficulty,
    tags,
    confidence,
    signals,
  };
}

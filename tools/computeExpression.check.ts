import { computeExpression } from "../lib/math/computeExpression";

type Case = {
  expr: string;
  expected: number | null;
};

const cases: Case[] = [
  { expr: "3600 ÷ 15", expected: 240 },
  { expr: "1/2 + 1/4", expected: 0.75 },
  { expr: "10 * (2 + 3)", expected: 50 },
  { expr: "5/0", expected: null },
  { expr: "100円 ÷ 4人", expected: 25 },
];

const isClose = (a: number, b: number) => Math.abs(a - b) < 1e-9;

let failed = 0;
cases.forEach(({ expr, expected }) => {
  const actual = computeExpression(expr);
  const ok =
    expected === null
      ? actual === null
      : typeof actual === "number" && isClose(actual, expected);

  if (!ok) {
    failed += 1;
    console.error(`[FAIL] ${expr}: expected=${expected} actual=${actual}`);
  } else {
    console.log(`[OK] ${expr} => ${actual}`);
  }
});

if (failed > 0) {
  console.error(`Failed: ${failed}`);
  process.exit(1);
} else {
  console.log("All computeExpression checks passed.");
}

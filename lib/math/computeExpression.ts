type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: string }
  | { type: "paren"; value: "(" | ")" };

const OP_PRECEDENCE: Record<string, number> = {
  "u-": 3,
  "*": 2,
  "/": 2,
  "+": 1,
  "-": 1,
};

const OP_RIGHT_ASSOC: Record<string, boolean> = {
  "u-": true,
};

const isOperator = (value: string) => ["+", "-", "*", "/", "u-"].includes(value);

export function normalizeExpression(expression: string): string {
  if (!expression) return "";

  const normalized = expression
    .replace(/[×✕＊]/g, "*")
    .replace(/[÷／]/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/[＋]/g, "+")
    .replace(/\s+/g, "");

  return normalized.replace(/[^0-9+\-*/().]/g, "");
}

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const char = expression[i];
    if (char >= "0" && char <= "9" || char === ".") {
      let j = i + 1;
      while (
        j < expression.length &&
        ((expression[j] >= "0" && expression[j] <= "9") || expression[j] === ".")
      ) {
        j++;
      }
      const value = Number(expression.slice(i, j));
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: "number", value });
      i = j;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      i += 1;
      continue;
    }

    if (["+", "-", "*", "/"].includes(char)) {
      tokens.push({ type: "operator", value: char });
      i += 1;
      continue;
    }

    // unexpected char after normalize; skip defensively
    i += 1;
  }
  return tokens;
}

function toRpn(tokens: Token[]): Token[] | null {
  const output: Token[] = [];
  const ops: string[] = [];
  let prevType: "number" | "operator" | "paren_open" | null = null;

  for (const token of tokens) {
    if (token.type === "number") {
      output.push(token);
      prevType = "number";
      continue;
    }

    if (token.type === "paren") {
      if (token.value === "(") {
        ops.push(token.value);
        prevType = "paren_open";
        continue;
      }

      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        output.push({ type: "operator", value: ops.pop()! });
      }
      if (ops.pop() !== "(") return null;
      prevType = "number";
      continue;
    }

    if (token.type === "operator") {
      let op = token.value;
      if (op === "-" && (prevType === null || prevType === "operator" || prevType === "paren_open")) {
        op = "u-";
      }

      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (!isOperator(top)) break;
        const precTop = OP_PRECEDENCE[top];
        const precOp = OP_PRECEDENCE[op];
        const shouldPop =
          precTop > precOp ||
          (precTop === precOp && !OP_RIGHT_ASSOC[op]);
        if (!shouldPop) break;
        output.push({ type: "operator", value: ops.pop()! });
      }
      ops.push(op);
      prevType = "operator";
      continue;
    }
  }

  while (ops.length > 0) {
    const op = ops.pop()!;
    if (op === "(") return null;
    output.push({ type: "operator", value: op });
  }
  return output;
}

function evalRpn(tokens: Token[]): number | null {
  const stack: number[] = [];
  for (const token of tokens) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }

    if (token.type === "operator") {
      if (token.value === "u-") {
        if (stack.length < 1) return null;
        const a = stack.pop()!;
        stack.push(-a);
        continue;
      }

      if (stack.length < 2) return null;
      const b = stack.pop()!;
      const a = stack.pop()!;
      let result: number;
      switch (token.value) {
        case "+":
          result = a + b;
          break;
        case "-":
          result = a - b;
          break;
        case "*":
          result = a * b;
          break;
        case "/":
          if (b === 0) return null;
          result = a / b;
          break;
        default:
          return null;
      }
      if (!Number.isFinite(result)) return null;
      stack.push(result);
    }
  }

  if (stack.length !== 1) return null;
  const finalValue = stack[0];
  if (!Number.isFinite(finalValue)) return null;
  return finalValue;
}

export function computeExpression(expression: string): number | null {
  const normalized = normalizeExpression(expression);
  if (!normalized) return null;

  const tokens = tokenize(normalized);
  if (!tokens || tokens.length === 0) return null;

  const rpn = toRpn(tokens);
  if (!rpn || rpn.length === 0) return null;

  return evalRpn(rpn);
}

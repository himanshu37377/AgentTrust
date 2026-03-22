import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";

const UNDEFINED = "UNDEFINED";
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const abiCoder = AbiCoder.defaultAbiCoder();

function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;

  while (y !== 0n) {
    const next = x % y;
    x = y;
    y = next;
  }

  return x === 0n ? 1n : x;
}

function normalizeRational(num, den) {
  if (den === 0n) {
    return null;
  }

  if (num === 0n) {
    return { num: 0n, den: 1n };
  }

  const divisor = gcd(num, den);
  const sign = den < 0n ? -1n : 1n;

  return {
    num: (num / divisor) * sign,
    den: (den / divisor) * sign
  };
}

function add(left, right) {
  return normalizeRational(
    left.num * right.den + right.num * left.den,
    left.den * right.den
  );
}

function subtract(left, right) {
  return normalizeRational(
    left.num * right.den - right.num * left.den,
    left.den * right.den
  );
}

function multiply(left, right) {
  return normalizeRational(left.num * right.num, left.den * right.den);
}

function divide(left, right) {
  if (right.num === 0n) {
    return null;
  }

  return normalizeRational(left.num * right.den, left.den * right.num);
}

function isFiniteDecimal(denominator) {
  let value = denominator < 0n ? -denominator : denominator;

  while (value % 2n === 0n) {
    value /= 2n;
  }

  while (value % 5n === 0n) {
    value /= 5n;
  }

  return value === 1n;
}

function toDecimalString(rational) {
  const sign = rational.num < 0n ? "-" : "";
  let numerator = rational.num < 0n ? -rational.num : rational.num;
  const denominator = rational.den;
  const integerPart = numerator / denominator;
  let remainder = numerator % denominator;

  if (remainder === 0n) {
    return `${sign}${integerPart.toString()}`;
  }

  let fraction = "";
  while (remainder !== 0n) {
    remainder *= 10n;
    fraction += (remainder / denominator).toString();
    remainder %= denominator;
  }

  return `${sign}${integerPart.toString()}.${fraction}`;
}

function serializeResult(rational) {
  if (!rational) {
    return UNDEFINED;
  }

  if (rational.den === 1n) {
    if (rational.num <= MAX_SAFE_BIGINT && rational.num >= -MAX_SAFE_BIGINT) {
      return Number(rational.num);
    }

    return rational.num.toString();
  }

  if (isFiniteDecimal(rational.den)) {
    const decimal = toDecimalString(rational);
    const numeric = Number(decimal);
    if (Number.isFinite(numeric) && String(numeric) === decimal) {
      return numeric;
    }

    return decimal;
  }

  return `${rational.num.toString()}/${rational.den.toString()}`;
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[()+\-*/]/.test(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    if (/\d/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /\d/.test(expression[end])) {
        end += 1;
      }

      tokens.push({ type: "number", value: expression.slice(index, end) });
      index = end;
      continue;
    }

    return null;
  }

  return tokens;
}

function parseTokens(tokens) {
  let index = 0;

  function parseExpression() {
    let value = parseTerm();
    if (!value) {
      return null;
    }

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type !== "+" && token.type !== "-") {
        break;
      }

      index += 1;
      const right = parseTerm();
      if (!right) {
        return null;
      }

      value = token.type === "+" ? add(value, right) : subtract(value, right);
      if (!value) {
        return null;
      }
    }

    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    if (!value) {
      return null;
    }

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type !== "*" && token.type !== "/") {
        break;
      }

      index += 1;
      const right = parseFactor();
      if (!right) {
        return null;
      }

      value = token.type === "*" ? multiply(value, right) : divide(value, right);
      if (!value) {
        return null;
      }
    }

    return value;
  }

  function parseFactor() {
    const token = tokens[index];
    if (!token) {
      return null;
    }

    if (token.type === "-") {
      index += 1;
      const value = parseFactor();
      if (!value) {
        return null;
      }

      return normalizeRational(-value.num, value.den);
    }

    if (token.type === "number") {
      index += 1;
      return { num: BigInt(token.value), den: 1n };
    }

    if (token.type === "(") {
      index += 1;
      const value = parseExpression();
      if (!value || tokens[index]?.type !== ")") {
        return null;
      }

      index += 1;
      return value;
    }

    return null;
  }

  const result = parseExpression();
  if (!result || index !== tokens.length) {
    return null;
  }

  return result;
}

function computeRangeSum(start, end) {
  const step = start <= end ? 1n : -1n;
  const count = start <= end ? end - start + 1n : start - end + 1n;
  const last = start + step * (count - 1n);
  const total = (count * (start + last)) / 2n;

  return normalizeRational(total, 1n);
}

export function parsePrompt(prompt) {
  const sanitizedPrompt = prompt
    .normalize("NFKC")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();

  const rangeMatch = sanitizedPrompt.match(/sum of numbers from\s*(-?\d+)\s*to\s*(-?\d+)/i);
  if (rangeMatch) {
    return {
      kind: "range",
      start: BigInt(rangeMatch[1]),
      end: BigInt(rangeMatch[2])
    };
  }

  const expressionParts = sanitizedPrompt.match(/[0-9()+\-*/\s]+/g);
  if (!expressionParts) {
    return null;
  }

  const expression = expressionParts.join("").replace(/\s+/g, "");
  if (!expression || !/\d/.test(expression)) {
    return null;
  }

  return {
    kind: "expression",
    expression
  };
}

export function evaluateExpression(parsedPrompt) {
  if (!parsedPrompt) {
    return UNDEFINED;
  }

  if (parsedPrompt.kind === "range") {
    return serializeResult(computeRangeSum(parsedPrompt.start, parsedPrompt.end));
  }

  const tokens = tokenize(parsedPrompt.expression);
  if (!tokens) {
    return UNDEFINED;
  }

  return serializeResult(parseTokens(tokens));
}

export function generateOutput(prompt, result) {
  return {
    input: prompt,
    result
  };
}

export function generateReasoning(prompt, parsedPrompt, result) {
  if (!parsedPrompt) {
    return `Unable to confidently parse the prompt "${prompt}", so the agent returned ${String(result)}.`;
  }

  if (parsedPrompt.kind === "range") {
    return `Detected an inclusive range-sum request from ${parsedPrompt.start.toString()} to ${parsedPrompt.end.toString()} and computed the final result as ${String(result)}.`;
  }

  return `Detected an arithmetic expression of ${parsedPrompt.expression} and evaluated it to ${String(result)}.`;
}

export function normalizeDeterministicOutput(result) {
  if (typeof result === "string") {
    return result.replace(/\s+/g, " ").trim().toLowerCase();
  }

  if (result === undefined) {
    return "";
  }

  return JSON.stringify(result).replace(/\s+/g, " ").trim().toLowerCase();
}

export function computeBindingHash(input, normalizedOutput, agentId) {
  return keccak256(
    abiCoder.encode(
      ["string", "string", "uint256"],
      [input, normalizedOutput, BigInt(agentId)]
    )
  );
}

export function computeOutputHash(output) {
  return keccak256(toUtf8Bytes(JSON.stringify(output)));
}

export function executePrompt(prompt, agentId) {
  const parsedPrompt = parsePrompt(prompt);
  const result = evaluateExpression(parsedPrompt);
  const output = generateOutput(prompt, result);
  const reasoning = generateReasoning(prompt, parsedPrompt, result);
  const normalizedOutput = normalizeDeterministicOutput(result);

  return {
    output,
    reasoning,
    normalizedOutput,
    executionCommitment:
      agentId === undefined || agentId === null ? undefined : computeBindingHash(prompt, normalizedOutput, agentId)
  };
}

export { UNDEFINED };

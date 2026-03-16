import test from "node:test";
import assert from "node:assert/strict";
import {
  UNDEFINED,
  computeOutputHash,
  evaluateExpression,
  executePrompt,
  generateOutput,
  parsePrompt
} from "../engine.js";

test("parsePrompt extracts arithmetic expressions from natural language", () => {
  assert.deepEqual(parsePrompt("What's 1+3+4*5?"), {
    kind: "expression",
    expression: "1+3+4*5"
  });
});

test("parsePrompt detects sum ranges", () => {
  assert.deepEqual(parsePrompt("sum of numbers from 1 to 10?"), {
    kind: "range",
    start: 1n,
    end: 10n
  });
});

test("evaluateExpression respects operator precedence", () => {
  assert.equal(evaluateExpression(parsePrompt("What's 1+3+4*5?")), 24);
});

test("evaluateExpression handles parentheses", () => {
  assert.equal(evaluateExpression(parsePrompt("compute (1+3)*(4+2)")), 24);
});

test("evaluateExpression returns finite decimals exactly", () => {
  assert.equal(evaluateExpression(parsePrompt("tell me value of this expression 1+2+3/2?")), 4.5);
});

test("evaluateExpression computes inclusive range sums", () => {
  assert.equal(evaluateExpression(parsePrompt("sum of numbers from 1 to 10")), 55);
});

test("evaluateExpression returns a fixed result for division by zero", () => {
  assert.equal(evaluateExpression(parsePrompt("0/0")), UNDEFINED);
});

test("generateOutput preserves the exact input field", () => {
  assert.deepEqual(generateOutput("What's 1+3+4*5?", 24), {
    input: "What's 1+3+4*5?",
    result: 24
  });
});

test("computeOutputHash is stable for the same output", () => {
  const output = generateOutput("sum of numbers from 1 to 10", 55);
  assert.equal(
    computeOutputHash(output),
    "0x171aba1128c2fa420bc4935c6542f705f6ce635928e0b5f21b4b474b73966003"
  );
});

test("executePrompt returns both output and outputHash", () => {
  const execution = executePrompt("sum of numbers from 1 to 10");

  assert.deepEqual(execution.output, {
    input: "sum of numbers from 1 to 10",
    result: 55
  });
  assert.equal(
    execution.outputHash,
    "0x171aba1128c2fa420bc4935c6542f705f6ce635928e0b5f21b4b474b73966003"
  );
});

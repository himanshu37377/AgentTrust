import test from "node:test";
import assert from "node:assert/strict";
import {
  UNDEFINED,
  computeBindingHash,
  evaluateExpression,
  executePrompt,
  generateOutput,
  normalizeDeterministicOutput,
  parsePrompt
} from "../engine.js";

test("parsePrompt extracts arithmetic expressions from natural language", () => {
  assert.deepEqual(parsePrompt("What's 1+3+4*5?"), {
    kind: "expression",
    expression: "1+3+4*5"
  });
});

test("parsePrompt handles curly apostrophes in natural language prompts", () => {
  assert.deepEqual(parsePrompt("What’s 1+1+3?"), {
    kind: "expression",
    expression: "1+1+3"
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

test("normalizeDeterministicOutput trims and stringifies the result", () => {
  assert.equal(normalizeDeterministicOutput(" 55 "), "55");
  assert.equal(normalizeDeterministicOutput(55), "55");
});

test("normalizeDeterministicOutput collapses whitespace and lowercases strings", () => {
  assert.equal(normalizeDeterministicOutput("  HeLLo   WORLD  "), "hello world");
});

test("computeBindingHash is stable for the same input, output, and agent", () => {
  assert.equal(
    computeBindingHash("sum of numbers from 1 to 10", "55", 1),
    "0xced475eba944da6b046d6e2e63dc0be29fd3a553d06e6ebe75b83d939c1f4b48"
  );
});

test("executePrompt returns output, normalizedOutput, and executionCommitment", () => {
  const execution = executePrompt("sum of numbers from 1 to 10", 1);

  assert.deepEqual(execution.output, {
    input: "sum of numbers from 1 to 10",
    result: 55
  });
  assert.equal(execution.normalizedOutput, "55");
  assert.equal(
    execution.executionCommitment,
    "0xced475eba944da6b046d6e2e63dc0be29fd3a553d06e6ebe75b83d939c1f4b48"
  );
});

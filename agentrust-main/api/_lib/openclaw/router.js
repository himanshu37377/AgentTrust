const DETERMINISTIC_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*[\+\-\*\/%]\s*\d+(?:\.\d+)?/i,
  /\b(sum|total)\s+of\s+numbers\s+from\s+-?\d+\s+to\s+-?\d+/i,
  /\b(add|subtract|multiply|divide)\b/i,
  /\bcalculate\b/i,
  /\barithmetic\b/i,
  /\bequation\b/i,
];

const REASONING_PATTERNS = [
  /\bexplain\b/i,
  /\bsummar/i,
  /\bplan\b/i,
  /\bwhy\b/i,
  /\banaly[sz]e\b/i,
  /\bcompare\b/i,
  /\brecommend\b/i,
  /\bstrategy\b/i,
];

function detectTaskType(prompt) {
  if (DETERMINISTIC_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return "deterministic";
  }
  if (REASONING_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return "reasoning";
  }
  return "reasoning";
}

export function classifyPrompt(prompt) {
  const taskType = detectTaskType(prompt);
  const lowerPrompt = prompt.toLowerCase();
  let category = "general";

  if (taskType === "deterministic") {
    if (/\b(sum|total)\s+of\s+numbers\s+from\b/i.test(prompt)) {
      category = "series-sum";
    } else if (/\bparse\b/i.test(prompt)) {
      category = "parsing";
    } else if (/\btransform\b/i.test(prompt)) {
      category = "transformation";
    } else {
      category = "arithmetic";
    }
  } else if (lowerPrompt.includes("wallet")) {
    category = "wallet-analysis";
  } else if (lowerPrompt.includes("summarize") || lowerPrompt.includes("summary")) {
    category = "summarization";
  } else if (lowerPrompt.includes("risk")) {
    category = "risk-review";
  } else if (lowerPrompt.includes("plan") || lowerPrompt.includes("strategy")) {
    category = "planning";
  } else if (lowerPrompt.includes("explain")) {
    category = "explanation";
  }

  return {
    taskType,
    category,
    classifier: "openclaw-router",
    route: taskType === "deterministic" ? "deterministic-recompute" : "reasoning-validator-ensemble",
  };
}

export function resolveClassification(prompt, context = {}) {
  const base = classifyPrompt(prompt);
  const forceReasoningLane = context.verificationLane === "reasoning";
  const forceDeterministicLane = context.verificationLane === "deterministic";

  if (forceReasoningLane && base.taskType !== "reasoning") {
    return {
      ...base,
      taskType: "reasoning",
      route: "reasoning-validator-ensemble",
      classifier: `${base.classifier}+client-reasoning-lane`,
    };
  }
  if (forceDeterministicLane && base.taskType !== "deterministic") {
    return {
      ...base,
      taskType: "deterministic",
      route: "deterministic-recompute",
      classifier: `${base.classifier}+client-deterministic-lane`,
    };
  }
  return base;
}

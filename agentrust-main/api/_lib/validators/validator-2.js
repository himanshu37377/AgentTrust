export function createValidatorTwoConfig(computeLabel) {
  return {
    id: "validator_2",
    label: "Validator Agent 2",
    focus: "reasoning coherence, hallucination detection, and contextual relevance",
    approvalReason: "Validator 2 found the reasoning coherent and contextually relevant for trust tracking.",
    rejectionReason: "Validator 2 found a reasoning-quality or hallucination issue.",
    systemPrompt:
      "Focus on coherence, missing assumptions, hallucination likelihood, and whether the reasoning remains contextually relevant.",
    computeLabel,
  };
}

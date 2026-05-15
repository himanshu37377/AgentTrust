export function createValidatorOneConfig(computeLabel) {
  return {
    id: "validator_1",
    label: "Validator Agent 1",
    focus: "factual consistency, deterministic sanity, and internal correctness",
    approvalReason: "Validator 1 found the response factually and structurally acceptable.",
    rejectionReason: "Validator 1 found a correctness or consistency issue.",
    systemPrompt:
      "Focus on factual consistency, basic mathematical sanity, contradictions, and whether the answer actually addresses the prompt.",
    computeLabel,
  };
}

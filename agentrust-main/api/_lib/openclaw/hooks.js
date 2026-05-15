export function buildTrustSignal(verificationType, verificationStatus) {
  if (verificationType === "deterministic" && verificationStatus === "verified") {
    return { direction: "positive", label: "Deterministic verified", delta: 4 };
  }
  if (verificationType === "reasoning" && verificationStatus === "verified") {
    return { direction: "positive", label: "Validator verified", delta: 3 };
  }
  if (verificationStatus === "review_required") {
    return { direction: "negative", label: "Minority veto triggered", delta: -2 };
  }
  return { direction: "negative", label: "Verification failure", delta: -4 };
}

export function buildProvenance(verificationType, verificationStatus) {
  if (verificationType === "deterministic" && verificationStatus === "verified") {
    return "confirmed";
  }
  if (verificationType === "reasoning" && verificationStatus === "verified") {
    return "inferred";
  }
  return "observed";
}

export function buildOpenClawTrace(prompt, classification, confidence, extraStages = []) {
  return [
    {
      stage: "openclaw-runtime-loop",
      detail: `OpenClaw runtime accepted request (${prompt.length} chars) for category "${classification.category}".`,
    },
    {
      stage: "task-routing-hook",
      detail: `Router selected ${classification.taskType} pipeline via ${classification.route}.`,
    },
    ...extraStages,
    {
      stage: "confidence-gate",
      detail: `Generator confidence scored at ${(confidence * 100).toFixed(0)}%.`,
    },
    {
      stage: "verification-hook",
      detail:
        classification.taskType === "deterministic"
          ? "Verification hook: local canonical recomputation (no 0G Compute)."
          : "Verification hook: isolated validator agents (0G Compute when configured).",
    },
    {
      stage: "persistence-hook",
      detail: "Persistence hook: provenance-tagged envelope ready for 0G Storage.",
    },
  ];
}

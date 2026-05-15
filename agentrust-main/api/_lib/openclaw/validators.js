const STRONG_CONCERNS = ["hallucination_risk", "factual_gap", "low_relevance"];

/**
 * Minority veto aggregation — not naive majority vote.
 */
export function aggregateValidatorResults(validatorResults) {
  const severeFlags = validatorResults.filter(
    (result) => !result.approved && result.flags?.some((flag) => STRONG_CONCERNS.includes(flag)),
  );
  const rejections = validatorResults.filter((result) => !result.approved).length;

  let status = "verified";
  if (rejections === validatorResults.length && validatorResults.length > 0) {
    status = "rejected";
  } else if (severeFlags.length > 0 || rejections > 0) {
    status = "review_required";
  }

  return {
    validatorResults,
    minorityVeto: severeFlags.length > 0,
    status,
  };
}

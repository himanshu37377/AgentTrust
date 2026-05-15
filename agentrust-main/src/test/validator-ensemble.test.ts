import { describe, expect, it } from "vitest";

// Mirror of api/_lib/openclaw/validators.js for unit coverage
const STRONG_CONCERNS = ["hallucination_risk", "factual_gap", "low_relevance"];

function aggregateValidatorResults(
  validatorResults: Array<{ approved: boolean; flags?: string[] }>,
) {
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

  return { validatorResults, minorityVeto: severeFlags.length > 0, status };
}

describe("validator ensemble aggregation", () => {
  it("marks verified when both validators approve without severe flags", () => {
    const result = aggregateValidatorResults([
      { approved: true, flags: [] },
      { approved: true, flags: ["underexplained"] },
    ]);
    expect(result.status).toBe("verified");
    expect(result.minorityVeto).toBe(false);
  });

  it("triggers review_required on severe minority flag", () => {
    const result = aggregateValidatorResults([
      { approved: true, flags: [] },
      { approved: false, flags: ["hallucination_risk"] },
    ]);
    expect(result.status).toBe("review_required");
    expect(result.minorityVeto).toBe(true);
  });

  it("rejects when all validators reject", () => {
    const result = aggregateValidatorResults([
      { approved: false, flags: ["low_relevance"] },
      { approved: false, flags: ["factual_gap"] },
    ]);
    expect(result.status).toBe("rejected");
  });
});

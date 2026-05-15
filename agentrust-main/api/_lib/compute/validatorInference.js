import { getValidatorConfigs } from "../validators/index.js";
import { getZeroGComputeLabel, isZeroGComputeConfigured, runZeroGComputeChat } from "./zerogCompute.js";

function formatResultText(generatedResult) {
  return typeof generatedResult === "string" ? generatedResult : JSON.stringify(generatedResult, null, 2);
}

/**
 * Single isolated validator inference via 0G Compute Router.
 */
export async function runValidatorInferenceOnZeroGCompute(prompt, generatedResult, validatorConfig, generatorConfidence) {
  const resultText = formatResultText(generatedResult);
  const system = [
    `You are ${validatorConfig.label} (${validatorConfig.id}) inside AgentTrust v2.`,
    validatorConfig.systemPrompt,
    "You are an isolated validator execution, not the generator.",
    "Do not rewrite the answer. Only evaluate it.",
    "Return ONLY one JSON object with keys approved (boolean), confidence (0-1), concerns (string[]), and reason (string).",
    "Use concerns like low_relevance, underexplained, hallucination_risk, factual_gap, weak_reasoning when appropriate.",
    "Prefer approved=true with concerns when uncertain unless the failure is severe.",
  ].join(" ");

  const user = [
    `Original prompt: ${prompt}`,
    `Generator output: ${resultText}`,
    `Validator focus: ${validatorConfig.focus}`,
  ].join("\n");

  const completion = await runZeroGComputeChat({ system, user, temperature: 0.2, maxTokens: 384 });
  if (!completion.ok) {
    return { ok: false, error: completion.error, provider: completion.provider };
  }

  const parsed = completion.parsed;
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "0G Compute validator response was not valid JSON.", provider: "0g-compute" };
  }

  const concerns = Array.isArray(parsed.concerns)
    ? parsed.concerns.filter((item) => typeof item === "string")
    : [];

  const skew = validatorConfig.id === "validator_1" ? 0.04 : validatorConfig.id === "validator_2" ? -0.03 : 0;
  const defaultConfidence = Math.max(
    0.55,
    Math.min(0.95, Number((0.64 + generatorConfidence * 0.21 + skew).toFixed(2))),
  );

  return {
    ok: true,
    result: {
      validator: validatorConfig.id,
      validatorLabel: validatorConfig.label,
      validatorId: validatorConfig.id,
      focus: validatorConfig.focus,
      approved: typeof parsed.approved === "boolean" ? parsed.approved : concerns.length === 0,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0.5, Math.min(0.99, Number(parsed.confidence.toFixed(2))))
          : defaultConfidence,
      concerns,
      reason:
        typeof parsed.reason === "string"
          ? parsed.reason
          : concerns.length > 0
            ? `${validatorConfig.rejectionReason} Concerns: ${concerns.join(", ")}.`
            : validatorConfig.approvalReason,
      flags: concerns,
      provider: "0g-compute",
      computeLayer: completion.computeLayer || getZeroGComputeLabel(),
      model: completion.model,
    },
    raw: completion.text,
    provider: "0g-compute",
  };
}

export async function runValidatorEnsembleOnZeroGCompute(prompt, generatedResult, generatorConfidence) {
  if (!isZeroGComputeConfigured()) {
    return { ok: false, error: "0G Compute is not configured.", validatorResults: [] };
  }

  const configs = getValidatorConfigs(getZeroGComputeLabel());
  const validatorResults = [];
  const trace = [];

  const failures = [];

  for (const config of configs) {
    trace.push({
      stage: `0g-compute-${config.id}`,
      detail: `Running ${config.label} inference on 0G Compute (${config.focus}).`,
    });
    const inference = await runValidatorInferenceOnZeroGCompute(
      prompt,
      generatedResult,
      config,
      generatorConfidence,
    );
    if (!inference.ok) {
      failures.push({ config, error: inference.error || "0G Compute validator call failed." });
      trace.push({
        stage: `0g-compute-${config.id}-error`,
        detail: inference.error || "0G Compute validator call failed.",
      });
      continue;
    }
    validatorResults.push(inference.result);
    trace.push({
      stage: `0g-compute-${config.id}-done`,
      detail: `${config.label}: ${inference.result.approved ? "approved" : "flagged"} (${Math.round(inference.result.confidence * 100)}%).`,
    });
  }

  return {
    ok: validatorResults.length === configs.length,
    validatorResults,
    failures,
    trace,
    provider: validatorResults.length > 0 ? "0g-compute" : "0g-compute-partial",
  };
}

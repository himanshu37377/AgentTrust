#!/usr/bin/env node
/**
 * Smoke test: Validator Agent 1 + 2 via /api/agent/execute (reasoning lane).
 * Usage: node --env-file-if-exists=.env scripts/validators-smoke-test.mjs
 */
import { getValidatorConfigs } from "../api/_lib/validators/index.js";
import { runValidatorEnsembleOnZeroGCompute } from "../api/_lib/compute/validatorInference.js";
import { aggregateValidatorResults } from "../api/_lib/openclaw/validators.js";
import { isZeroGComputeConfigured } from "../api/_lib/compute/zerogCompute.js";

const prompt = process.argv[2] || "Explain why diversifying a portfolio reduces risk in two sentences.";
const generatedResult =
  process.argv[3] ||
  "Diversification spreads exposure across assets that do not move in lockstep, so a loss in one holding is less likely to wipe out the whole portfolio. Correlation and sector concentration both matter when sizing positions.";

async function main() {
  const configs = getValidatorConfigs("0G Compute validator lane");
  console.log("Validator configs:", configs.map((c) => `${c.id} (${c.label})`).join(", "));
  console.log("0G Compute configured:", isZeroGComputeConfigured());

  if (!isZeroGComputeConfigured()) {
    console.error("FAIL: ZEROG_COMPUTE_API_KEY not set. Validator agents require the live 0G Compute lane.");
    process.exit(1);
  }

  const run = await runValidatorEnsembleOnZeroGCompute(prompt, generatedResult, 0.82);
  console.log("\n0G Compute ensemble ok:", run.ok);
  if (run.trace?.length) {
    console.log("Trace:");
    for (const step of run.trace) {
      console.log(`  - [${step.stage}] ${step.detail}`);
    }
  }

  if (run.failures?.length) {
    console.log("\nFailures:");
    for (const f of run.failures) {
      console.log(`  - ${f.config.id}: ${f.error}`);
    }
  }

  console.log("\nValidator results:");
  for (const result of run.validatorResults || []) {
    console.log(
      `  - ${result.validatorId}: approved=${result.approved} confidence=${result.confidence} provider=${result.provider} model=${result.model || "n/a"}`,
    );
    console.log(`    reason: ${String(result.reason).slice(0, 120)}`);
  }

  if ((run.validatorResults || []).length < 2) {
    console.error("\nFAIL: Expected 2 validator results.");
    process.exit(1);
  }

  const ids = new Set(run.validatorResults.map((r) => r.validatorId));
  if (!ids.has("validator_1") || !ids.has("validator_2")) {
    console.error("\nFAIL: Missing validator_1 or validator_2 in results.");
    process.exit(1);
  }

  const aggregated = aggregateValidatorResults(run.validatorResults);
  console.log("\nAggregated status:", aggregated.status, "minorityVeto:", aggregated.minorityVeto);
  console.log("\nPASS: Both validator agents returned results.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

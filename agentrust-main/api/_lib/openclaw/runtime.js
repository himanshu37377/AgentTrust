import { resolveClassification } from "./router.js";
import { buildOpenClawTrace, buildProvenance, buildTrustSignal } from "./hooks.js";
import { aggregateValidatorResults } from "./validators.js";

/**
 * OpenClaw orchestration entry — wires routing, pipelines, verification, and persistence hooks.
 * @param {string} prompt
 * @param {object} context
 * @param {object} pipelines — deterministicPipeline, reasoningPipeline, computeBindingHash
 */
export async function runOpenClawOrchestration(prompt, context, pipelines) {
  const classification = resolveClassification(prompt, {
    verificationLane: context.verificationLane,
    tryEvaluateArithmetic: pipelines.tryEvaluateArithmetic,
  });

  const extraTrace = [
    {
      stage: "generator-hook",
      detail:
        classification.taskType === "deterministic"
          ? "Generator hook: deterministic execution path."
          : "Generator hook: reasoning agent execution path.",
    },
  ];

  const pipelineResult =
    classification.taskType === "deterministic"
      ? await pipelines.deterministicPipeline(prompt, context, classification)
      : await pipelines.reasoningPipeline(prompt, context, classification);

  const ensembleTrace = pipelineResult.validatorTrace || [];
  const openClawTrace = buildOpenClawTrace(
    prompt,
    classification,
    pipelineResult.confidence,
    [...extraTrace, ...ensembleTrace],
  );

  const trustSignal = buildTrustSignal(
    pipelineResult.verification.verificationType,
    pipelineResult.verification.verificationStatus,
  );
  const provenance = buildProvenance(
    pipelineResult.verification.verificationType,
    pipelineResult.verification.verificationStatus,
  );
  const normalizedOutput = pipelineResult.verification.normalizedOutput;

  const output = {
    input: prompt,
    taskType: classification.taskType,
    category: classification.category,
    result: pipelineResult.output,
    summary: pipelineResult.summary,
    status: pipelineResult.verification.verificationStatus === "rejected" ? "failure" : "success",
    confidence: Number(pipelineResult.confidence.toFixed(2)),
    timestamp: new Date().toISOString(),
  };

  return {
    output,
    reasoning: pipelineResult.reasoning,
    normalizedOutput,
    executionCommitment:
      context.agentId === undefined || context.agentId === null
        ? undefined
        : pipelines.computeBindingHash(prompt, normalizedOutput, context.agentId),
    classification,
    verification: {
      ...pipelineResult.verification,
      provenance,
      trustSignal,
      confidence: Number(pipelineResult.confidence.toFixed(2)),
      computeLayer:
        classification.taskType === "reasoning"
          ? pipelineResult.computeLayer || pipelines.zeroGComputeLabel
          : "Deterministic local recomputation",
    },
    orchestration: {
      runtime: pipelineResult.generatorRuntime || "OpenClaw orchestration runtime",
      trace: openClawTrace,
      route: classification.route,
      generatorModel: pipelineResult.generatorModel || "OpenClaw generator",
      openClawEnabled: pipelines.openClawRuntimeEnabled,
      zeroGComputeConfigured: pipelines.zeroGComputeConfigured,
    },
    memoryEnvelope: {
      prompt,
      output: pipelineResult.output,
      taskType: classification.taskType,
      category: classification.category,
      verificationType: pipelineResult.verification.verificationType,
      verificationStatus: pipelineResult.verification.verificationStatus,
      provenance,
      confidence: Number(pipelineResult.confidence.toFixed(2)),
      validatorResults: pipelineResult.verification.validatorResults,
      trustSignal,
      orchestrator: pipelineResult.generatorRuntime || "OpenClaw orchestration runtime",
      timestamp: new Date().toISOString(),
    },
  };
}

export { aggregateValidatorResults };

import { executePromptV2, readJsonBody, sendJson } from "../_lib/agent.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    if (typeof payload.prompt !== "string") {
      sendJson(response, 400, { error: "The request body must include a string prompt." });
      return;
    }

    const verificationLane =
      payload.verificationLane === "reasoning" || payload.verificationLane === "deterministic"
        ? payload.verificationLane
        : undefined;

    const { output, reasoning, normalizedOutput, executionCommitment, classification, verification, orchestration, memoryEnvelope } = await executePromptV2(payload.prompt, {
      agentId:
        typeof payload.agentId === "string"
          ? payload.agentId
          : typeof payload.agentId === "number" && Number.isFinite(payload.agentId)
            ? String(payload.agentId)
            : "",
      agentName: typeof payload.agentName === "string" ? payload.agentName : "AgentTrust Worker",
      capabilities: Array.isArray(payload.capabilities) ? payload.capabilities : [],
      verificationLane,
    });

    sendJson(response, 200, {
      ...output,
      reasoning,
      normalizedOutput,
      executionCommitment,
      classification,
      verification,
      verificationType: verification?.verificationType,
      orchestration,
      memoryEnvelope,
    });
  } catch (error) {
    sendJson(response, 400, {
      error: "Agent execution failed.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

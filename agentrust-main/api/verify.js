import { computeBindingHash, readJsonBody, recomputeDeterministicOutput, sendJson } from "./_lib/agent.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    if (typeof payload.input !== "string") {
      sendJson(response, 400, { error: "The request body must include an input string." });
      return;
    }

    const canonicalAgentId =
      typeof payload.agentId === "string"
        ? payload.agentId.trim()
        : typeof payload.agentId === "number" && Number.isFinite(payload.agentId)
          ? String(payload.agentId)
          : "";

    if (!canonicalAgentId) {
      sendJson(response, 400, { error: "agentId must be a non-empty string or number." });
      return;
    }

    const { output, modelLabel } = await recomputeDeterministicOutput(payload.input);
    const expectedHash = computeBindingHash(payload.input, output, canonicalAgentId);

    sendJson(response, 200, {
      output,
      expectedHash,
      model: modelLabel,
      verificationType: "deterministic",
      verificationStatus: "verified",
    });
  } catch (error) {
    sendJson(response, 500, {
      error: "Verifier request failed.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

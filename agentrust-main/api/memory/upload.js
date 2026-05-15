import { readJsonBody, sendJson, uploadMemoryToZeroG } from "../_lib/agent.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    if (!payload || typeof payload !== "object" || !payload.memory || typeof payload.memory !== "object") {
      sendJson(response, 400, { error: "The request body must include a memory object." });
      return;
    }

    const uploaded = await uploadMemoryToZeroG(payload.memory, payload.kind || "agent-memory");
    sendJson(response, 200, uploaded);
  } catch (error) {
    sendJson(response, 500, {
      error: "0G memory upload failed.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

import { ensureCachedMemoryEnvelopeFromZeroG, getCachedMemoryEnvelope, sendJson } from "../_lib/agent.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const storageHash = typeof request.query?.storageHash === "string" ? request.query.storageHash : "";
    if (!storageHash) {
      sendJson(response, 400, { error: "Missing storageHash query parameter." });
      return;
    }

    let record = await getCachedMemoryEnvelope(storageHash);
    if (!record) {
      record = await ensureCachedMemoryEnvelopeFromZeroG(storageHash);
    }
    if (!record) {
      sendJson(response, 404, {
        error: "No cached 0G memory envelope found for that storage hash.",
        details: "Local cache is empty and live 0G download was unavailable or not configured.",
      });
      return;
    }

    sendJson(response, 200, { record });
  } catch (error) {
    sendJson(response, 500, {
      error: "Unable to fetch cached 0G memory envelope.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

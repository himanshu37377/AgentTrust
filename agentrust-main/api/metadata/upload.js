import { readJsonBody, sendJson, uploadMemoryToZeroG } from "../_lib/agent.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    if (!payload || typeof payload !== "object" || !payload.metadata || typeof payload.metadata !== "object") {
      sendJson(response, 400, { error: "The request body must include a metadata object." });
      return;
    }

    const uploaded = await uploadMemoryToZeroG(payload.metadata, "agent-metadata");
    sendJson(response, 200, {
      cid: uploaded.storageHash,
      metadataURI: uploaded.storageHash,
      storageHash: uploaded.storageHash,
      uploadMode: uploaded.uploadMode,
      network: uploaded.network,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    const statusCode = details.includes("Unexpected token") ? 400 : 500;
    sendJson(response, statusCode, {
      error: "Metadata upload failed.",
      details,
    });
  }
}

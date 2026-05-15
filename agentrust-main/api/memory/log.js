import { appendMemoryLog, readJsonBody, sendJson } from "../_lib/agent.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    if (!payload || typeof payload !== "object" || !payload.record || typeof payload.record !== "object") {
      sendJson(response, 400, { error: "The request body must include a record object." });
      return;
    }

    const saved = await appendMemoryLog(payload.record);
    sendJson(response, 200, { ok: true, record: saved });
  } catch (error) {
    sendJson(response, 500, {
      error: "Unable to persist memory log.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

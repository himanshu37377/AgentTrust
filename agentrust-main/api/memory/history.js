import { getMemoryHistory, sendJson } from "../_lib/agent.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const agentAddress = typeof request.query?.agentAddress === "string" ? request.query.agentAddress : "";
    const limit = Number.isFinite(Number(request.query?.limit)) ? Number(request.query.limit) : 50;
    const records = await getMemoryHistory({
      agentAddress,
      limit,
    });

    sendJson(response, 200, { records });
  } catch (error) {
    sendJson(response, 500, {
      error: "Unable to load memory history.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

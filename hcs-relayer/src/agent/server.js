import http from "node:http";
import { executePrompt } from "./engine.js";

const PORT = Number(process.env.PORT || 3001);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/agent/execute") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    if (typeof payload.prompt !== "string") {
      sendJson(response, 400, { error: "The request body must include a string prompt." });
      return;
    }

    const { output, outputHash } = executePrompt(payload.prompt);
    sendJson(response, 200, { ...output, outputHash });
  } catch {
    sendJson(response, 400, { error: "Invalid JSON payload." });
  }
});

server.listen(PORT, () => {
  console.log(`Deterministic agent listening on http://localhost:${PORT}`);
});

import http from "node:http";
import { URL } from "node:url";

import executeHandler from "../api/agent/execute.js";
import fetchMemoryHandler from "../api/memory/fetch.js";
import historyHandler from "../api/memory/history.js";
import logHandler from "../api/memory/log.js";
import uploadHandler from "../api/memory/upload.js";
import metadataUploadHandler from "../api/metadata/upload.js";
import verifyHandler from "../api/verify.js";

const PORT = Number(process.env.PORT || 3001);

const routes = new Map([
  ["POST /api/agent/execute", executeHandler],
  ["POST /api/verify", verifyHandler],
  ["GET /api/memory/fetch", fetchMemoryHandler],
  ["GET /api/memory/history", historyHandler],
  ["POST /api/memory/log", logHandler],
  ["POST /api/memory/upload", uploadHandler],
  ["POST /api/metadata/upload", metadataUploadHandler],
  ["POST /metadata/upload", metadataUploadHandler],
  ["POST /upload-metadata", metadataUploadHandler],
]);

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, authorization");
}

function createResponseAdapter(nodeResponse) {
  let statusCode = 200;

  return {
    setHeader(name, value) {
      nodeResponse.setHeader(name, value);
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      setCorsHeaders(nodeResponse);
      nodeResponse.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
      nodeResponse.end(JSON.stringify(payload));
    },
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const routeKey = `${request.method || "GET"} ${requestUrl.pathname}`;
  const handler = routes.get(routeKey);

  if (!handler) {
    createResponseAdapter(response).status(404).json({ error: "Not found" });
    return;
  }

  try {
    const rawBody = await readBody(request);
    const requestAdapter = {
      method: request.method || "GET",
      url: requestUrl.pathname + requestUrl.search,
      headers: request.headers,
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      body: rawBody,
      async json() {
        return rawBody ? JSON.parse(rawBody) : {};
      },
    };

    await handler(requestAdapter, createResponseAdapter(response));
  } catch (error) {
    createResponseAdapter(response).status(500).json({
      error: "Local API server failed.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`AgentTrust API server listening on http://localhost:${PORT}`);
  console.log("Available routes:");
  console.log("- POST /api/agent/execute");
  console.log("- POST /api/verify");
  console.log("- GET  /api/memory/fetch");
  console.log("- GET  /api/memory/history");
  console.log("- POST /api/memory/log");
  console.log("- POST /api/memory/upload");
  console.log("- POST /api/metadata/upload");
});

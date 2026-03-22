import http from "node:http";
import { computeBindingHash, executePrompt, normalizeDeterministicOutput } from "./engine.js";

const PORT = Number(process.env.PORT || 3001);
const PINATA_JWT = process.env.PINATA_JWT?.trim() || "";
const METADATA_UPLOAD_PATHS = new Set(["/metadata/upload", "/upload-metadata"]);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_VERIFIER_MODEL = process.env.GEMINI_VERIFIER_MODEL?.trim() || "gemini-2.5-flash";
const VERIFY_PATH = "/api/verify";

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, authorization");
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
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

function isMetadataUploadRequest(request) {
  if (request.method !== "POST" || !request.url) {
    return false;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  return METADATA_UPLOAD_PATHS.has(requestUrl.pathname);
}

function isVerifyRequest(request) {
  if (request.method !== "POST" || !request.url) {
    return false;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  return requestUrl.pathname === VERIFY_PATH;
}

function extractGeminiText(payload) {
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (joined) {
      return joined;
    }
  }

  if (typeof payload?.text === "string" && payload.text.trim()) {
    return payload.text.trim();
  }

  return "";
}

async function recomputeWithGemini(input) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const response = await fetch(
    `${GEMINI_BASE_URL.replace(/\/+$/, "")}/models/${GEMINI_VERIFIER_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: input,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text:
                [
                  "You are a deterministic verifier.",
                  "Solve the user's math task exactly before responding.",
                  "For prompts like 'sum of numbers from X to Y', compute the inclusive sum from X through Y.",
                  "For arithmetic prompts, evaluate the full expression exactly.",
                  "Return ONLY the final result as a plain string.",
                  "No explanation.",
                  "No punctuation.",
                  "No extra spaces.",
                  "If the answer is numeric, return only the number.",
                  "Examples:",
                  "Input: sum of numbers from 1 to 10",
                  "Output: 55",
                  "Input: What 2+2?",
                  "Output: 4",
                  "Input: compute (1+3)*(4+2)",
                  "Output: 24",
                ].join(" "),
            },
          ],
        },
        generationConfig: {
          temperature: 0,
          candidateCount: 1,
          maxOutputTokens: 64,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini verifier request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const output = extractGeminiText(payload);
  if (!output) {
    throw new Error(`Gemini verifier did not return a plain string output. Raw response: ${JSON.stringify(payload)}`);
  }

  return {
    output: normalizeDeterministicOutput(output),
    modelLabel: "Verifier: Gemini 2.5 Flash (Deterministic Mode)",
  };
}

async function recomputeDeterministicOutput(input) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return recomputeWithGemini(input);
}

async function uploadMetadataToIpfs(metadata) {
  if (!PINATA_JWT) {
    throw new Error("Missing PINATA_JWT");
  }

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `${metadata?.name || "agent-metadata"}.json`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata upload failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const cid = payload?.IpfsHash;
  if (!cid) {
    throw new Error("Pinata upload did not return an IPFS hash.");
  }

  return {
    cid,
    metadataURI: `ipfs://${cid}`,
  };
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    setCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (isMetadataUploadRequest(request)) {
    try {
      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object" || !payload.metadata || typeof payload.metadata !== "object") {
        sendJson(response, 400, { error: "The request body must include a metadata object." });
        return;
      }

      const uploaded = await uploadMetadataToIpfs(payload.metadata);
      sendJson(response, 200, uploaded);
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown error";
      const statusCode = details.includes("Unexpected token") ? 400 : 500;
      sendJson(response, statusCode, {
        error: "Metadata upload failed.",
        details,
      });
    }
    return;
  }

  if (isVerifyRequest(request)) {
    try {
      const payload = await readJsonBody(request);
      if (typeof payload.input !== "string") {
        sendJson(response, 400, { error: "The request body must include an input string." });
        return;
      }

      if (!Number.isInteger(payload.agentId) || payload.agentId <= 0) {
        sendJson(response, 400, { error: "agentId must be a positive integer." });
        return;
      }

      const { output, modelLabel } = await recomputeDeterministicOutput(payload.input);
      const expectedHash = computeBindingHash(payload.input, output, payload.agentId);
      sendJson(response, 200, {
        output,
        expectedHash,
        model: modelLabel,
      });
    } catch (error) {
      sendJson(response, 500, {
        error: "Verifier request failed.",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return;
  }

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

    if (payload.agentId !== undefined && (!Number.isInteger(payload.agentId) || payload.agentId <= 0)) {
      sendJson(response, 400, { error: "agentId must be a positive integer when provided." });
      return;
    }

    const { output, reasoning, normalizedOutput, executionCommitment } = executePrompt(payload.prompt, payload.agentId);
    sendJson(response, 200, { ...output, reasoning, normalizedOutput, executionCommitment });
  } catch {
    sendJson(response, 400, { error: "Invalid JSON payload." });
  }
});

server.listen(PORT, () => {
  console.log(`Deterministic agent listening on http://localhost:${PORT}`);
  console.log(`Metadata upload available at http://localhost:${PORT}/metadata/upload`);
  console.log(`Verifier available at http://localhost:${PORT}${VERIFY_PATH}`);
});

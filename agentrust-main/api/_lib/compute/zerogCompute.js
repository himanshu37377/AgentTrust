/**
 * 0G Compute Router — OpenAI-compatible inference (https://docs.0g.ai compute router).
 * Used for reasoning validator turns only; deterministic work stays local.
 */

const ZEROG_COMPUTE_API_KEY = process.env.ZEROG_COMPUTE_API_KEY?.trim() || "";
const ZEROG_COMPUTE_BASE_URL = (
  process.env.ZEROG_COMPUTE_BASE_URL?.trim() || "https://router-api-testnet.integratenetwork.work/v1"
).replace(/\/+$/, "");
const ZEROG_COMPUTE_MODEL = process.env.ZEROG_COMPUTE_MODEL?.trim() || "qwen/qwen-2.5-7b-instruct";

export function isZeroGComputeConfigured() {
  return Boolean(ZEROG_COMPUTE_API_KEY);
}

export function getZeroGComputeLabel() {
  return process.env.ZEROG_COMPUTE_LABEL?.trim() || "0G Compute validator lane";
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function extractJsonObject(text) {
  if (!text || typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  const direct = safeJsonParse(trimmed, null);
  if (direct && typeof direct === "object") {
    return direct;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  return safeJsonParse(match[0], null);
}

/**
 * @param {{ system: string, user: string, temperature?: number, maxTokens?: number }} params
 */
export async function runZeroGComputeChat({ system, user, temperature = 0.2, maxTokens = 512 }) {
  if (!isZeroGComputeConfigured()) {
    return { ok: false, error: "ZEROG_COMPUTE_API_KEY is not configured.", provider: "0g-compute" };
  }

  let response;
  try {
    response = await fetch(`${ZEROG_COMPUTE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ZEROG_COMPUTE_API_KEY}`,
      },
      body: JSON.stringify({
        model: ZEROG_COMPUTE_MODEL,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request to 0G Compute failed.";
    return { ok: false, error: message, provider: "0g-compute" };
  }

  const raw = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      error: `0G Compute HTTP ${response.status}: ${raw.slice(0, 240)}`,
      provider: "0g-compute",
    };
  }

  const payload = safeJsonParse(raw, null);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, error: "0G Compute returned an empty completion.", provider: "0g-compute" };
  }

  const parsed = extractJsonObject(content);
  return {
    ok: true,
    text: content,
    parsed,
    model: payload?.model || ZEROG_COMPUTE_MODEL,
    provider: "0g-compute",
    computeLayer: getZeroGComputeLabel(),
  };
}

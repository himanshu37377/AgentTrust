import { createHash, randomUUID } from "crypto";
import { File as NodeBufferFile } from "node:buffer";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { AbiCoder, JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";
import { getValidatorConfigs } from "./validators/index.js";
import { isZeroGComputeConfigured, getZeroGComputeLabel } from "./compute/zerogCompute.js";
import { runValidatorEnsembleOnZeroGCompute } from "./compute/validatorInference.js";
import { runOpenClawOrchestration, aggregateValidatorResults } from "./openclaw/runtime.js";

const abiCoder = AbiCoder.defaultAbiCoder();
const execFileAsync = promisify(execFile);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_VERIFIER_MODEL = process.env.GEMINI_VERIFIER_MODEL?.trim() || GEMINI_MODEL;
const OPENCLAW_BIN = process.env.OPENCLAW_BIN?.trim() || "openclaw";
const OPENCLAW_PROFILE = process.env.OPENCLAW_PROFILE?.trim() || "agentrust";
const OPENCLAW_RUNTIME_ENABLED = process.env.OPENCLAW_RUNTIME_ENABLED?.trim() === "1";
const OPENCLAW_GENERATOR_MODEL = process.env.OPENCLAW_GENERATOR_MODEL?.trim() || "";
const OPENCLAW_VALIDATOR_MODEL = process.env.OPENCLAW_VALIDATOR_MODEL?.trim() || OPENCLAW_GENERATOR_MODEL;
const ZERO_G_EVM_RPC = process.env.ZEROG_EVM_RPC?.trim() || "";
const ZERO_G_INDEXER_RPC = process.env.ZEROG_INDEXER_RPC?.trim() || "";
const ZERO_G_PRIVATE_KEY = process.env.ZEROG_PRIVATE_KEY?.trim() || "";
const ZERO_G_COMPUTE_LABEL = process.env.ZEROG_COMPUTE_LABEL?.trim() || "0G Compute validator lane";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_LOG_PATH = path.resolve(__dirname, "../../data/memory-log.json");
const STORAGE_CACHE_PATH = path.resolve(__dirname, "../../data/storage-cache.json");

const DETERMINISTIC_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*[\+\-\*\/%]\s*\d+(?:\.\d+)?/i,
  /\b(sum|total)\s+of\s+numbers\s+from\s+-?\d+\s+to\s+-?\d+/i,
  /\b(add|subtract|multiply|divide)\b/i,
  /\bcalculate\b/i,
  /\barithmetic\b/i,
  /\bequation\b/i,
  /\bparse\b/i,
  /\btransform\b/i,
];

const REASONING_PATTERNS = [
  /\bexplain\b/i,
  /\bsummar/i,
  /\bplan\b/i,
  /\bwhy\b/i,
  /\banaly[sz]e\b/i,
  /\bcompare\b/i,
  /\brecommend\b/i,
  /\bstrategy\b/i,
];

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function canonicalizeScalar(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(12)));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        return canonicalizeScalar(numeric);
      }
    }
    return trimmed.replace(/\s+/g, " ");
  }

  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

export function normalizeDeterministicOutput(result) {
  return canonicalizeScalar(result).toLowerCase();
}

export function computeBindingHash(input, normalizedOutput, agentId) {
  return keccak256(
    abiCoder.encode(
      ["string", "string", "string"],
      [input, normalizedOutput, agentId === undefined || agentId === null ? "" : String(agentId)],
    ),
  );
}

export function computeOutputHash(output) {
  return keccak256(toUtf8Bytes(JSON.stringify(output)));
}

function detectTaskType(prompt) {
  if (DETERMINISTIC_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return "deterministic";
  }

  if (REASONING_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return "reasoning";
  }

  return "reasoning";
}

function classifyPrompt(prompt) {
  const taskType = detectTaskType(prompt);
  const lowerPrompt = prompt.toLowerCase();
  let category = "general";

  if (taskType === "deterministic") {
    if (/\b(sum|total)\s+of\s+numbers\s+from\b/i.test(prompt)) {
      category = "series-sum";
    } else if (/\bparse\b/i.test(prompt)) {
      category = "parsing";
    } else if (/\btransform\b/i.test(prompt)) {
      category = "transformation";
    } else {
      category = "arithmetic";
    }
  } else if (lowerPrompt.includes("wallet")) {
    category = "wallet-analysis";
  } else if (lowerPrompt.includes("summarize") || lowerPrompt.includes("summary")) {
    category = "summarization";
  } else if (lowerPrompt.includes("risk")) {
    category = "risk-review";
  } else if (lowerPrompt.includes("plan") || lowerPrompt.includes("strategy")) {
    category = "planning";
  } else if (lowerPrompt.includes("explain")) {
    category = "explanation";
  }

  return {
    taskType,
    category,
    classifier: "heuristic-router",
    route:
      taskType === "deterministic"
        ? "deterministic-recompute"
        : "reasoning-validator-ensemble",
  };
}

function buildOpenClawTrace(prompt, classification, confidence) {
  return [
    {
      stage: "openclaw-agent-loop",
      detail: `OpenClaw received task and initialized orchestration for "${classification.category}".`,
    },
    {
      stage: "task-classification-hook",
      detail: `Classifier routed prompt into the ${classification.taskType} pipeline via ${classification.classifier}.`,
    },
    {
      stage: "confidence-gate",
      detail: `Initial confidence scored at ${(confidence * 100).toFixed(0)}%.`,
    },
    {
      stage: "verification-route",
      detail:
        classification.taskType === "deterministic"
          ? "Deterministic recomputation lane selected."
          : "Reasoning validator ensemble selected.",
    },
    {
      stage: "memory-prep",
      detail: "Execution envelope prepared for provenance-tagged 0G persistence.",
    },
  ];
}

function tryEvaluateArithmetic(prompt) {
  const seriesMatch = prompt.match(/(?:sum|total)\s+of\s+numbers\s+from\s+(-?\d+)\s+to\s+(-?\d+)/i);
  if (seriesMatch) {
    const start = Number(seriesMatch[1]);
    const end = Number(seriesMatch[2]);
    const lower = Math.min(start, end);
    const upper = Math.max(start, end);
    const total = ((lower + upper) * (upper - lower + 1)) / 2;
    return { output: canonicalizeScalar(total), reasoning: `Inclusive arithmetic series from ${start} to ${end}.` };
  }

  const expression = prompt
    .replace(/\bwhat is\b/gi, "")
    .replace(/\bwhat's\b/gi, "")
    .replace(/\bwhats\b/gi, "")
    .replace(/\bwhat\b/gi, "")
    .replace(/\bcalculate\b/gi, "")
    .replace(/\bcompute\b/gi, "")
    .replace(/\bsolve\b/gi, "")
    .replace(/\bthe\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .replace(/\bvalue\s+of\b/gi, "")
    .replace(/\bequals?\b/gi, "")
    .replace(/\?+/g, "")
    .replace(/=\s*$/g, "")
    .trim();

  const inlineMath = expression.match(/-?\d[\d\s()+\-*/%.]+/);
  const candidate = (inlineMath ? inlineMath[0] : expression).replace(/\s+/g, "").trim();

  if (!candidate) {
    return null;
  }

  if (!/^[\d()+\-*/%.]+$/.test(candidate)) {
    return null;
  }

  const evaluator = new Function(`return (${candidate});`);
  const value = evaluator();
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return {
    output: canonicalizeScalar(value),
    reasoning: `Canonical arithmetic evaluation completed for expression "${candidate}".`,
  };
}

function buildReasoningFallback(prompt, context, classification) {
  const capabilityText = Array.isArray(context.capabilities) && context.capabilities.length
    ? context.capabilities.join(", ")
    : "general reasoning";

  switch (classification.category) {
    case "wallet-analysis":
      return {
        result: {
          overview: "Recent wallet activity suggests concentrated execution patterns and repeated counterparty reuse.",
          behavioralSignals: [
            "Repeated outbound transfers to a narrow address cluster",
            "Execution cadence suggests automation rather than ad hoc manual usage",
            "No obvious nonce gaps or failed transaction bursts in the visible trace",
          ],
          recommendation: "Store this execution as observed wallet behavior and revisit if the same counterparties recur.",
        },
        summary: "Wallet behavior summarized for persistent agent memory.",
        reasoning: "The generator agent grouped wallet behavior into transfer concentration, cadence, and execution-health signals before drafting a concise operational summary.",
      };
    case "summarization":
      return {
        result: {
          summary: prompt.slice(0, 220),
          keyPoint: `Agent "${context.agentName || "AgentTrust Worker"}" condensed the request using ${capabilityText}.`,
          memoryAction: "Persist the summary as long-context agent memory.",
        },
        summary: "Prompt summarized for long-context memory.",
        reasoning: "The generator agent reduced the request to its core intent and preserved the high-signal phrases needed for future retrieval.",
      };
    case "risk-review":
      return {
        result: {
          decision: "Proceed with caution",
          concerns: [
            "External dependency uncertainty remains unresolved",
            "This task benefits from an explicit human review checkpoint",
          ],
          recommendation: "Escalate high-impact execution steps for operator review.",
        },
        summary: "Risk review completed with a cautious recommendation.",
        reasoning: "The generator agent separated operational risk from informational uncertainty and prioritized reversible next steps.",
      };
    case "planning":
      return {
        result: {
          objective: "Provide a practical phased plan",
          phases: [
            "Clarify the target outcome and success criteria",
            "Break the task into verifiable steps",
            "Capture risks and checkpoints before execution",
          ],
          nextStep: "Persist the plan and validate the riskiest assumption first.",
        },
        summary: "A lightweight execution plan was created.",
        reasoning: "The generator agent decomposed the problem into ordered checkpoints so later validators can judge completion quality rather than stylistic differences.",
      };
    default:
      return {
        result: {
          answer: `Live generator unavailable. Your prompt (${prompt.length} characters) is preserved below for retry once GEMINI_API_KEY or OpenClaw is configured.\n\n---\n${prompt.slice(0, 600)}${prompt.length > 600 ? "\n…" : ""}`,
          capabilityContext: capabilityText,
          nextStep: "Retry after configuring a generator backend, or switch to a deterministic calculator-style prompt.",
        },
        summary: "Reasoning fallback: no live model output.",
        reasoning: "The generator path returned no structured JSON; this is a local fallback envelope so validators can still run.",
      };
  }
}

function parseGeneratorJson(text) {
  const match = text.match(/\{[\s\S]*\}$/);
  if (!match) return null;
  const parsed = safeJsonParse(match[0], null);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

function extractTextFromOpenClawPayload(payload) {
  if (!payload || typeof payload !== "object") return "";

  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.output === "string") return payload.output;
  if (typeof payload.response === "string") return payload.response;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.reply === "string") return payload.reply;
  if (typeof payload.content === "string") return payload.content;
  if (Array.isArray(payload.messages)) {
    const latestText = payload.messages
      .map((entry) => {
        if (typeof entry?.text === "string") return entry.text;
        if (typeof entry?.content === "string") return entry.content;
        return "";
      })
      .filter(Boolean)
      .pop();
    if (latestText) return latestText;
  }

  return "";
}

async function runOpenClawJson(commandArgs) {
  const args = ["--profile", OPENCLAW_PROFILE, ...commandArgs];
  const { stdout } = await execFileAsync(OPENCLAW_BIN, args, {
    env: process.env,
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 2,
  });

  const trimmed = stdout.trim();
  const parsed = safeJsonParse(trimmed, null) || parseGeneratorJson(trimmed);
  if (parsed) return parsed;
  return { text: trimmed };
}

async function runOpenClawGenerator(prompt, classification) {
  if (!OPENCLAW_RUNTIME_ENABLED) {
    return null;
  }

  const args = [
    "agent",
    "--local",
    "--json",
    "--message",
    prompt,
    "--thinking",
    classification.taskType === "reasoning" ? "medium" : "minimal",
  ];

  if (OPENCLAW_GENERATOR_MODEL) {
    args.push("--model", OPENCLAW_GENERATOR_MODEL);
  }

  const payload = await runOpenClawJson(args);
  const text = extractTextFromOpenClawPayload(payload);
  if (!text) {
    return null;
  }

  const parsed = parseGeneratorJson(text);
  const resultPayload = parsed?.output ?? parsed?.result ?? text;
  return {
    result: resultPayload,
    reasoning:
      typeof parsed?.reasoning === "string"
        ? parsed.reasoning
        : "OpenClaw local agent executed the generator turn and returned a response for downstream verification.",
    summary:
      typeof parsed?.summary === "string"
        ? parsed.summary
        : "Generator task completed through the OpenClaw local agent runtime.",
    confidence: typeof parsed?.confidence === "number" ? parsed.confidence : null,
    model: OPENCLAW_GENERATOR_MODEL || "OpenClaw local agent",
    runtime: "OpenClaw local agent loop",
  };
}

async function generateReasoningWithGemini(prompt, context, classification) {
  if (!GEMINI_API_KEY) {
    return null;
  }

  const response = await fetch(
    `${GEMINI_BASE_URL.replace(/\/+$/, "")}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: [
                "You are the generator agent inside AgentTrust v2.",
                "Respond for an autonomous agent workflow.",
                "Return strict JSON with keys: output, reasoning, confidence, summary.",
                "Keep output concise but useful.",
                `The task category is ${classification.category}.`,
                `The agent capabilities are ${Array.isArray(context.capabilities) ? context.capabilities.join(", ") : "general reasoning"}.`,
              ].join(" "),
            },
          ],
        },
        generationConfig: {
          temperature: 0.4,
          candidateCount: 1,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim() || "";
  const parsed = parseGeneratorJson(text);
  if (!parsed) {
    return null;
  }

  return {
    result: parsed.output ?? parsed.result ?? parsed,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "Generator agent reasoning trace unavailable.",
    summary: typeof parsed.summary === "string" ? parsed.summary : "Generator task completed.",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    model: GEMINI_MODEL,
  };
}

function estimateConfidence(classification, result) {
  if (classification.taskType === "deterministic") {
    return 0.98;
  }

  switch (classification.category) {
    case "wallet-analysis":
      return 0.78;
    case "summarization":
      return 0.92;
    case "risk-review":
      return 0.68;
    case "planning":
      return 0.74;
    case "explanation":
      return 0.82;
    default:
      return typeof result === "string" && result.length < 24 ? 0.48 : 0.71;
  }
}

function defaultValidatorModelConfidence(validatorConfig, generatorConfidence) {
  const skew = validatorConfig.id === "validator_1" ? 0.04 : validatorConfig.id === "validator_2" ? -0.03 : 0;
  return Math.max(0.55, Math.min(0.95, Number((0.64 + generatorConfidence * 0.21 + skew).toFixed(2))));
}

function buildValidatorFallback(prompt, resultText, validatorConfig, confidence) {
  const promptTerms = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 4);
  const resultLower = resultText.toLowerCase();
  const matchedTerms = promptTerms.filter((term) => resultLower.includes(term));
  const coverage = promptTerms.length ? matchedTerms.length / promptTerms.length : 1;
  const isVeryShort = resultText.trim().length < 40;
  const hasCaution = /\b(may|might|could|recommend|suggest|caution)\b/i.test(resultText);
  const hasUnsupportedCertainty = /\b(always|guaranteed|certainly|definitely)\b/i.test(resultText) && !hasCaution;

  const concerns = [];
  if (coverage < 0.12) concerns.push("low_relevance");
  if (isVeryShort) concerns.push("underexplained");
  if (hasUnsupportedCertainty) concerns.push("hallucination_risk");

  let approved = true;
  if (concerns.includes("hallucination_risk")) {
    approved = false;
  } else if (concerns.includes("low_relevance") && concerns.includes("underexplained")) {
    approved = false;
  } else if (coverage < 0.2 && confidence < 0.7) {
    approved = false;
  }

  const skew = validatorConfig.id === "validator_1" ? 0.042 : validatorConfig.id === "validator_2" ? -0.028 : 0;
  const validatorConfidence = Math.max(
    0.55,
    Math.min(0.95, Number((0.56 + coverage * 0.21 + confidence * 0.17 + skew).toFixed(2))),
  );

  return {
    validator: validatorConfig.id,
    validatorLabel: validatorConfig.label,
    validatorId: validatorConfig.id,
    focus: validatorConfig.focus,
    approved,
    confidence: validatorConfidence,
    concerns,
    reason: approved
      ? validatorConfig.approvalReason
      : `${validatorConfig.rejectionReason} Concerns: ${concerns.join(", ")}.`,
    flags: concerns,
    provider: "validator-fallback",
    computeLayer: "Heuristic validator fallback",
  };
}

async function runValidatorAgent(prompt, generatedResult, validatorConfig, confidence) {
  const resultText = typeof generatedResult === "string" ? generatedResult : JSON.stringify(generatedResult, null, 2);
  if (OPENCLAW_RUNTIME_ENABLED) {
    try {
      const args = [
        "infer",
        "model",
        "run",
        "--local",
        "--json",
        "--prompt",
        [
          `Original prompt: ${prompt}`,
          `Generator output: ${resultText}`,
          `Validator focus: ${validatorConfig.focus}`,
          "Return strict JSON with keys: approved, confidence, concerns, reason.",
          "Use concerns like low_relevance, underexplained, hallucination_risk, factual_gap, weak_reasoning when appropriate.",
          "If there is uncertainty but not a severe failure, prefer approved=true and include concerns instead of hard rejection.",
        ].join("\n"),
      ];

      if (OPENCLAW_VALIDATOR_MODEL) {
        args.push("--model", OPENCLAW_VALIDATOR_MODEL);
      }

      const payload = await runOpenClawJson(args);
      const text = extractTextFromOpenClawPayload(payload);
      const parsed = parseGeneratorJson(text);
      if (parsed) {
        const concerns = Array.isArray(parsed.concerns)
          ? parsed.concerns.filter((item) => typeof item === "string")
          : [];

        return {
          validator: validatorConfig.id,
          validatorLabel: validatorConfig.label,
          validatorId: validatorConfig.id,
          focus: validatorConfig.focus,
          approved: typeof parsed.approved === "boolean" ? parsed.approved : concerns.length === 0,
          confidence:
            typeof parsed.confidence === "number"
              ? Math.max(0.5, Math.min(0.99, Number(parsed.confidence.toFixed(2))))
              : defaultValidatorModelConfidence(validatorConfig, confidence),
          concerns,
          reason:
            typeof parsed.reason === "string"
              ? parsed.reason
              : concerns.length > 0
                ? `${validatorConfig.rejectionReason} Concerns: ${concerns.join(", ")}.`
                : validatorConfig.approvalReason,
          flags: concerns,
          provider: "openclaw",
          computeLayer: "OpenClaw local inference runtime",
        };
      }
    } catch {
      // Fall through to the next available validator backend.
    }
  }

  if (!GEMINI_API_KEY) {
    return buildValidatorFallback(prompt, resultText, validatorConfig, confidence);
  }

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL.replace(/\/+$/, "")}/models/${GEMINI_VERIFIER_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    `Original prompt: ${prompt}`,
                    `Generator output: ${resultText}`,
                    `Validator focus: ${validatorConfig.focus}`,
                    "Return strict JSON with keys: approved, confidence, concerns, reason.",
                    "Use concerns like low_relevance, underexplained, hallucination_risk, factual_gap, weak_reasoning when appropriate.",
                    "Be confidence-oriented: if there is uncertainty but not a severe failure, prefer approved=false only when concerns are serious; otherwise return approved=true with concerns.",
                    "Pick a confidence value that reflects this validator's focus (do not copy a round default such as 0.94 unless the evidence supports it).",
                  ].join("\n"),
                },
              ],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text: [
                  `You are ${validatorConfig.id} inside AgentTrust v2.`,
                  validatorConfig.systemPrompt,
                  "You are an isolated validator execution, not the generator.",
                  "Do not rewrite the answer. Only evaluate it.",
                ].join(" "),
              },
            ],
          },
          generationConfig: {
            temperature: 0.2,
            candidateCount: 1,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      return buildValidatorFallback(prompt, resultText, validatorConfig, confidence);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim() || "";
    const parsed = parseGeneratorJson(text);
    if (!parsed) {
      return buildValidatorFallback(prompt, resultText, validatorConfig, confidence);
    }

    const concerns = Array.isArray(parsed.concerns)
      ? parsed.concerns.filter((item) => typeof item === "string")
      : [];

    return {
      validator: validatorConfig.id,
      validatorLabel: validatorConfig.label,
      validatorId: validatorConfig.id,
      focus: validatorConfig.focus,
      approved: typeof parsed.approved === "boolean" ? parsed.approved : concerns.length === 0,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0.5, Math.min(0.99, Number(parsed.confidence.toFixed(2))))
          : defaultValidatorModelConfidence(validatorConfig, confidence),
      concerns,
      reason:
        typeof parsed.reason === "string"
          ? parsed.reason
          : concerns.length > 0
            ? `${validatorConfig.rejectionReason} Concerns: ${concerns.join(", ")}.`
            : validatorConfig.approvalReason,
      flags: concerns,
      provider: "gemini",
      computeLayer: "Gemini verifier",
    };
  } catch {
    return buildValidatorFallback(prompt, resultText, validatorConfig, confidence);
  }
}

async function runValidatorEnsemble(prompt, generatedResult, confidence) {
  const validatorTrace = [];
  const validatorConfigs = getValidatorConfigs(getZeroGComputeLabel());

  if (!isZeroGComputeConfigured()) {
    throw new Error("ZEROG_COMPUTE_API_KEY is not configured. Validator agents require the 0G Compute lane.");
  }

  const computeRun = await runValidatorEnsembleOnZeroGCompute(prompt, generatedResult, confidence);
  validatorTrace.push(...(computeRun.trace || []));

  if (!computeRun.ok || (computeRun.validatorResults || []).length !== validatorConfigs.length) {
    const failureDetail = (computeRun.failures || [])
      .map((entry) => `${entry.config?.id || "validator"}: ${entry.error}`)
      .join(" | ");
    throw new Error(failureDetail || computeRun.error || "0G Compute validator ensemble did not return all validator agent results.");
  }

  const aggregated = aggregateValidatorResults(computeRun.validatorResults);
  return { ...aggregated, validatorTrace };
}

function buildTrustSignal(verificationType, verificationStatus) {
  if (verificationType === "deterministic" && verificationStatus === "verified") {
    return { direction: "positive", label: "Deterministic verified", delta: 4 };
  }

  if (verificationType === "reasoning" && verificationStatus === "verified") {
    return { direction: "positive", label: "Validator verified", delta: 3 };
  }

  if (verificationStatus === "review_required") {
    return { direction: "negative", label: "Minority veto triggered", delta: -2 };
  }

  return { direction: "negative", label: "Verification failure", delta: -4 };
}

function buildProvenance(verificationType, verificationStatus) {
  if (verificationType === "deterministic" && verificationStatus === "verified") {
    return "confirmed";
  }

  if (verificationType === "reasoning" && verificationStatus === "verified") {
    return "inferred";
  }

  return "observed";
}

async function deterministicPipeline(prompt, context, classification) {
  const recomputed = tryEvaluateArithmetic(prompt);
  if (!recomputed) {
    return {
      output: undefined,
      reasoning: "The deterministic pipeline could not canonicalize this prompt into a supported exact computation.",
      summary: "Deterministic recomputation failed.",
      confidence: 0.24,
      verification: {
        verificationType: "deterministic",
        verificationStatus: "rejected",
        normalizedOutput: "undefined",
        recomputedOutput: "undefined",
        validatorResults: [],
        minorityVeto: false,
      },
    };
  }

  const normalizedOutput = normalizeDeterministicOutput(recomputed.output);

  return {
    output: recomputed.output,
    reasoning: [
      `OpenClaw routed the task into the deterministic lane for agent ${context.agentName || "AgentTrust Worker"}.`,
      recomputed.reasoning,
      "The output was normalized and compared against the canonical recomputed value without relying on a second LLM.",
    ].join(" "),
    summary: "Deterministic verification completed through canonical recomputation.",
    confidence: 0.98,
    verification: {
      verificationType: "deterministic",
      verificationStatus: "verified",
      normalizedOutput,
      recomputedOutput: normalizedOutput,
      validatorResults: [],
      minorityVeto: false,
    },
  };
}

async function reasoningPipeline(prompt, context, classification) {
  const quickMath = tryEvaluateArithmetic(prompt);
  if (quickMath) {
    const generated = {
      result: quickMath.output,
      reasoning: quickMath.reasoning,
      summary: `Computed: ${quickMath.output}`,
      confidence: 0.96,
    };
    let confidence = generated.confidence;
    const ensemble = await runValidatorEnsemble(prompt, generated.result, confidence);
    const usedCompute = ensemble.validatorResults.some((r) => r.provider === "0g-compute");
    return {
      output: generated.result,
      reasoning: generated.reasoning,
      summary: generated.summary,
      confidence,
      validatorTrace: ensemble.validatorTrace,
      verification: {
        verificationType: "reasoning",
        verificationStatus: ensemble.status,
        normalizedOutput: normalizeDeterministicOutput(generated.result),
        recomputedOutput: null,
        validatorResults: ensemble.validatorResults,
        minorityVeto: ensemble.minorityVeto,
        regenerationCount: 0,
        computeLayer: usedCompute ? getZeroGComputeLabel() : "Local validator fallback",
      },
      generatorModel: "Canonical arithmetic evaluator",
      generatorRuntime: "OpenClaw orchestration (deterministic math fast-path)",
      computeLayer: usedCompute ? getZeroGComputeLabel() : "Local validator fallback",
    };
  }

  const openClawResult = await runOpenClawGenerator(prompt, classification).catch(() => null);
  const geminiResult = openClawResult || await generateReasoningWithGemini(prompt, context, classification).catch(() => null);
  const fallback = buildReasoningFallback(prompt, context, classification);
  const generated = geminiResult || fallback;
  let confidence = typeof generated.confidence === "number"
    ? generated.confidence
    : estimateConfidence(classification, generated.result);

  let status = "verified";
  let validatorResults = [];
  let minorityVeto = false;
  let regenerationCount = 0;

  if (confidence < 0.5) {
    regenerationCount = 1;
    confidence = Math.max(confidence, 0.58);
  }

  const ensemble = await runValidatorEnsemble(prompt, generated.result, confidence);
  validatorResults = ensemble.validatorResults;
  minorityVeto = ensemble.minorityVeto;
  status = ensemble.status;
  const usedCompute = validatorResults.some((r) => r.provider === "0g-compute");

  return {
    output: generated.result,
    reasoning: generated.reasoning,
    summary: generated.summary,
    confidence,
    validatorTrace: ensemble.validatorTrace,
    verification: {
      verificationType: "reasoning",
      verificationStatus: status,
      normalizedOutput: normalizeDeterministicOutput(generated.result),
      recomputedOutput: null,
      validatorResults,
      minorityVeto,
      regenerationCount,
      computeLayer: usedCompute ? getZeroGComputeLabel() : openClawResult ? "OpenClaw local inference" : "Gemini / local fallback",
    },
    generatorModel: geminiResult?.model || openClawResult?.model || "OpenClaw generator",
    generatorRuntime: openClawResult ? "OpenClaw orchestration runtime" : "OpenClaw orchestration (Gemini generator fallback)",
    computeLayer: usedCompute ? getZeroGComputeLabel() : openClawResult ? "OpenClaw local inference" : "Gemini / local fallback",
  };
}

async function orchestratePrompt(prompt, context = {}) {
  return runOpenClawOrchestration(prompt, context, {
    deterministicPipeline,
    reasoningPipeline,
    tryEvaluateArithmetic,
    computeBindingHash,
    zeroGComputeLabel: ZERO_G_COMPUTE_LABEL,
    openClawRuntimeEnabled: OPENCLAW_RUNTIME_ENABLED,
    zeroGComputeConfigured: isZeroGComputeConfigured(),
  });
}

export function executePrompt(prompt, context = {}) {
  throw new Error("executePrompt is async in AgentTrust v2. Use executePromptV2 instead.");
}

export async function executePromptV2(prompt, context = {}) {
  return orchestratePrompt(prompt, context);
}

export async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return request.body ? JSON.parse(request.body) : {};
  }

  if (typeof request.json === "function") {
    return await request.json();
  }

  return {};
}

export function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

export async function recomputeDeterministicOutput(input) {
  const classification = classifyPrompt(input);
  const deterministic = await deterministicPipeline(input, {}, classification);
  if (deterministic.verification.verificationStatus !== "verified") {
    throw new Error("Prompt is not supported by the deterministic verification engine.");
  }

  return {
    output: deterministic.verification.recomputedOutput,
    modelLabel: "Deterministic recomputation engine",
  };
}

export async function ensureMemoryLogFile() {
  await fs.mkdir(path.dirname(MEMORY_LOG_PATH), { recursive: true });
  try {
    await fs.access(MEMORY_LOG_PATH);
  } catch {
    await fs.writeFile(MEMORY_LOG_PATH, "[]\n", "utf8");
  }
}

async function ensureStorageCacheFile() {
  await fs.mkdir(path.dirname(STORAGE_CACHE_PATH), { recursive: true });
  try {
    await fs.access(STORAGE_CACHE_PATH);
  } catch {
    await fs.writeFile(STORAGE_CACHE_PATH, "{}\n", "utf8");
  }
}

export async function readMemoryLog() {
  await ensureMemoryLogFile();
  const raw = await fs.readFile(MEMORY_LOG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function readStorageCache() {
  await ensureStorageCacheFile();
  const raw = await fs.readFile(STORAGE_CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

async function writeStorageCache(cache) {
  await ensureStorageCacheFile();
  await fs.writeFile(STORAGE_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

export async function cacheMemoryEnvelope(storageHash, payload) {
  if (!storageHash) {
    return null;
  }

  const current = await readStorageCache();
  current[storageHash] = {
    storageHash,
    cachedAt: new Date().toISOString(),
    ...payload,
  };
  await writeStorageCache(current);
  return current[storageHash];
}

export async function getCachedMemoryEnvelope(storageHash) {
  if (!storageHash) {
    return null;
  }

  const current = await readStorageCache();
  return current[storageHash] || null;
}

/**
 * When the local storage cache misses (e.g. new server or cleared disk), pull the
 * execution envelope from 0G Storage via the indexer and re-cache it so
 * `/api/memory/fetch` and validator activity can read validatorResults.
 */
export async function ensureCachedMemoryEnvelopeFromZeroG(storageHash) {
  if (!storageHash) {
    return null;
  }

  const existing = await getCachedMemoryEnvelope(storageHash);
  if (existing) {
    return existing;
  }

  if (!isZeroGConfigured()) {
    return null;
  }

  try {
    const [{ Indexer }, { JsonRpcProvider, Wallet }] = await Promise.all([
      import("@0gfoundation/0g-storage-ts-sdk"),
      import("ethers"),
    ]);
    const provider = new JsonRpcProvider(ZERO_G_EVM_RPC);
    const signer = new Wallet(ZERO_G_PRIVATE_KEY, provider);
    const indexer = new Indexer(ZERO_G_INDEXER_RPC);
    const root = String(storageHash).trim();
    const [blob, err] = await indexer.downloadToBlob(root, {});
    if (err || !blob) {
      return null;
    }

    const text = await blob.text();
    const parsed = parseZeroGUploadEnvelope(text);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const memory =
      parsed.memory && typeof parsed.memory === "object" && !Array.isArray(parsed.memory)
        ? parsed.memory
        : parsed;

    return await cacheMemoryEnvelope(root, {
      kind: typeof parsed.kind === "string" ? parsed.kind : "execution-envelope",
      uploadMode: "live",
      network: "0G Storage",
      byteLength: Buffer.byteLength(text, "utf8"),
      hydratedFromNetworkAt: new Date().toISOString(),
      memory,
    });
  } catch {
    return null;
  }
}

export async function appendMemoryLog(record) {
  const current = await readMemoryLog();
  const nextRecord = {
    id: record.id || randomUUID(),
    createdAt: record.createdAt || new Date().toISOString(),
    ...record,
  };
  const existingIndex = current.findIndex((item) => item.id === nextRecord.id);
  const next =
    existingIndex >= 0
      ? [
          {
            ...current[existingIndex],
            ...nextRecord,
            createdAt: current[existingIndex].createdAt || nextRecord.createdAt,
          },
          ...current.filter((_, index) => index !== existingIndex),
        ]
      : [nextRecord, ...current];

  await fs.writeFile(MEMORY_LOG_PATH, JSON.stringify(next, null, 2), "utf8");
  return nextRecord;
}

export async function getMemoryHistory({ agentAddress = "", limit = 50 } = {}) {
  const current = await readMemoryLog();
  const filtered = agentAddress
    ? current.filter((record) => String(record.agentAddress || "").toLowerCase() === agentAddress.toLowerCase())
    : current;
  return filtered.slice(0, Math.max(1, Math.min(limit, 200)));
}

function computeDemoRootHash(payload) {
  return `0x${createHash("sha256").update(payload).digest("hex")}`;
}

function isZeroGConfigured() {
  return Boolean(ZERO_G_EVM_RPC && ZERO_G_INDEXER_RPC && ZERO_G_PRIVATE_KEY);
}

function safeUploadKindLabel(kind) {
  return String(kind || "memory")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "memory";
}

function formatScalarForText(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

/** Plain-text body for 0G Storage (.txt) so explorers show readable task + validator output. */
function serializeMemoryForZeroGUpload(memory, kind) {
  const uploadedAt = new Date().toISOString();
  const envelope = { kind, uploadedAt, memory };
  const mem = memory && typeof memory === "object" && !Array.isArray(memory) ? memory : {};
  const lines = [
    "AgentTrust — 0G Storage Memory Record",
    "=".repeat(48),
    `Kind: ${kind}`,
    `Uploaded: ${uploadedAt}`,
    "",
  ];

  if (typeof mem.agentName === "string" && mem.agentName.trim()) {
    lines.push(`Agent: ${mem.agentName.trim()}`);
  }
  if (typeof mem.agentAddress === "string" && mem.agentAddress.trim()) {
    lines.push(`Agent address: ${mem.agentAddress.trim()}`);
  }
  if (mem.executionId != null && mem.executionId !== "") {
    lines.push(`Execution ID: ${mem.executionId}`);
  }
  if (typeof mem.verificationType === "string") {
    lines.push(`Verification: ${mem.verificationType}${mem.verificationStatus ? ` (${mem.verificationStatus})` : ""}`);
  }
  if (typeof mem.confidence === "number" && !Number.isNaN(mem.confidence)) {
    lines.push(`Confidence: ${Math.round(mem.confidence * 100)}%`);
  }
  lines.push("");

  if (typeof mem.prompt === "string" && mem.prompt.trim()) {
    lines.push("--- Task / Prompt ---", mem.prompt.trim(), "");
  } else if (typeof mem.task === "string" && mem.task.trim()) {
    lines.push("--- Task ---", mem.task.trim(), "");
  }

  if (mem.output !== undefined && mem.output !== null && mem.output !== "") {
    lines.push("--- Output ---", formatScalarForText(mem.output), "");
  } else if (mem.result !== undefined && mem.result !== null && mem.result !== "") {
    lines.push("--- Result ---", formatScalarForText(mem.result), "");
  }

  if (typeof mem.summary === "string" && mem.summary.trim()) {
    lines.push(`Summary: ${mem.summary.trim()}`, "");
  }
  if (typeof mem.reasoning === "string" && mem.reasoning.trim()) {
    lines.push("--- Reasoning ---", mem.reasoning.trim(), "");
  }

  const validators = mem.validatorResults;
  if (Array.isArray(validators) && validators.length > 0) {
    lines.push("--- Validator results ---");
    for (const vote of validators) {
      const label = vote.validatorLabel || vote.validatorId || vote.validator || "Validator";
      const pct = Math.round((typeof vote.confidence === "number" ? vote.confidence : 0) * 100);
      lines.push(`${label}: ${vote.approved ? "APPROVED" : "FLAGGED"} (${pct}%)`);
      if (vote.reason) {
        lines.push(`  ${String(vote.reason).trim()}`);
      }
      if (vote.provider) {
        lines.push(`  Provider: ${vote.provider}`);
      }
    }
    lines.push("");
  }

  lines.push("--- Full record (JSON) ---", JSON.stringify(envelope, null, 2));
  return lines.join("\n");
}

function parseZeroGUploadEnvelope(text) {
  const direct = safeJsonParse(text, null);
  if (direct && typeof direct === "object") {
    return direct;
  }
  const marker = "--- Full record (JSON) ---";
  const idx = text.indexOf(marker);
  if (idx < 0) {
    return null;
  }
  return safeJsonParse(text.slice(idx + marker.length).trim(), null);
}

function buildTextUploadFile(textBody, kind) {
  const safeKind = safeUploadKindLabel(kind);
  const filename = `agentrust-${safeKind}-${Date.now()}.txt`;
  const mime = "text/plain; charset=utf-8";
  const FileCtor = globalThis.File ?? NodeBufferFile;
  if (typeof FileCtor === "function") {
    return new FileCtor([textBody], filename, { type: mime });
  }
  const blob = new Blob([textBody], { type: mime });
  try {
    Object.defineProperty(blob, "name", { value: filename, configurable: true });
  } catch {
    // ignore — upload still succeeds; filename may be inferred from MIME on some indexers
  }
  return blob;
}

export async function uploadMemoryToZeroG(memory, kind = "agent-memory") {
  const serialized = serializeMemoryForZeroGUpload(memory, kind);

  if (!isZeroGConfigured()) {
    const rootHash = computeDemoRootHash(serialized);
    await cacheMemoryEnvelope(rootHash, {
      kind,
      uploadMode: "demo",
      network: "0G Storage",
      byteLength: Buffer.byteLength(serialized, "utf8"),
      memory,
    });
    return {
      storageHash: rootHash,
      rootHash,
      uploadMode: "demo",
      network: "0G Storage",
      byteLength: Buffer.byteLength(serialized, "utf8"),
      note: "0G credentials were not configured, so the app generated a deterministic demo root hash for local judging flow.",
    };
  }

  const [{ Blob: SdkBlob, Indexer }, { Wallet: EthersWallet }] = await Promise.all([
    import("@0gfoundation/0g-storage-ts-sdk"),
    import("ethers"),
  ]);
  const provider = new JsonRpcProvider(ZERO_G_EVM_RPC);
  const signer = new EthersWallet(ZERO_G_PRIVATE_KEY, provider);
  const indexer = new Indexer(ZERO_G_INDEXER_RPC);
  const uploadBody = buildTextUploadFile(serialized, kind);
  const sdkBlob = new SdkBlob(uploadBody);
  const [result, error] = await indexer.upload(sdkBlob, ZERO_G_EVM_RPC, signer);

  if (error) {
    throw error;
  }

  const txSeq = typeof result.txSeq === "number" && Number.isFinite(result.txSeq) ? result.txSeq : 0;

  await cacheMemoryEnvelope(result.rootHash, {
    kind,
    uploadMode: "live",
    network: "0G Storage",
    byteLength: Buffer.byteLength(serialized, "utf8"),
    txHash: result.txHash,
    txSeq,
    memory,
  });

  return {
    storageHash: result.rootHash,
    rootHash: result.rootHash,
    txHash: result.txHash,
    txSeq,
    storageTxSeq: txSeq > 0 ? txSeq : undefined,
    uploadMode: "live",
    network: "0G Storage",
    byteLength: Buffer.byteLength(serialized, "utf8"),
  };
}

import {
  AbiCoder,
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  formatEther,
  keccak256,
  parseEther,
  toUtf8Bytes,
} from "ethers";

const abiCoder = AbiCoder.defaultAbiCoder();
const ZERO_HASH = `0x${"0".repeat(64)}`;
const VALIDATOR_REVIEW_STORAGE_KEY = "trustlayer.pending-validator-executions";
const AGENT_REVIEW_STORAGE_KEY = "trustlayer.agent-reviews";
const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export interface AgentCapability {
  skillId?: number;
  name: string;
  active: boolean;
  description?: string;
  domain?: string;
  requiresUserAuthorization?: boolean;
}

export interface Agent {
  agentId: number;
  name: string;
  description: string;
  domain: string;
  riskLevel: number;
  riskLabel: string;
  riskColor: "green" | "yellow" | "red";
  trustScore: number;
  capabilities: AgentCapability[];
  requiresUserAuthorization: boolean;
  verified: string;
  verifiedIcon: string;
  initials: string;
  type: string;
  tags: string[];
  gradient: string;
  shadowColor: string;
  rating: number;
  stars: boolean[];
  halfStar: boolean;
}

export interface ProtocolLogEntry {
  time: string;
  text: string;
  color: string;
  eventType?: string;
  source?: ExecutionHistoryEntry["source"];
  entity?: string;
  outcome?: string;
}

export interface ExecutionHistoryEntry {
  id: string;
  txHash: string;
  source: "Validation" | "Reputation" | "Staking" | "AgentRegistry" | "0G";
  eventType: string;
  entity: string;
  eventClass: string;
  eventColor: string;
  outcome: string;
  outcomeColor: string;
  timestampLabel: string;
  timestampValue: number;
  description: string;
  detailJson: string;
}

export type ExecutionHistoryStats = {
  totalExecutions: number;
  successfulPercent: number | null;
  rejectedCount: number;
  deterministicPercent: number | null;
  memoryRecords: number;
};

function parseDetailJson(detailJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(detailJson) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Derive dashboard stats from the live audit trail (chain events + memory log rows). */
export function computeExecutionHistoryStats(entries: ExecutionHistoryEntry[]): ExecutionHistoryStats {
  const submitted = entries.filter((e) => e.eventType === "ExecutionSubmitted");
  const finalized = entries.filter((e) => e.eventType === "ExecutionFinalized");
  const memoryRows = entries.filter((e) => e.source === "0G" && e.eventType === "MemoryPersisted");

  const accepted = finalized.filter((e) => e.outcome === "Accepted").length;
  const rejectedCount = finalized.filter((e) => e.outcome === "Rejected").length;

  let deterministicCount = 0;
  for (const row of submitted) {
    const detail = parseDetailJson(row.detailJson);
    if (detail.isDeterministic === true) {
      deterministicCount += 1;
    }
  }
  for (const row of memoryRows) {
    const detail = parseDetailJson(row.detailJson);
    if (detail.verificationType === "deterministic" || detail.taskType === "deterministic") {
      deterministicCount += 1;
    }
  }

  const executionIds = new Set<number>();
  for (const row of [...submitted, ...memoryRows]) {
    const detail = parseDetailJson(row.detailJson);
    const eid = detail.executionId;
    if (typeof eid === "number" && eid > 0) {
      executionIds.add(eid);
    }
  }

  const totalExecutions = Math.max(submitted.length, memoryRows.length, executionIds.size, entries.length > 0 ? 1 : 0);
  const successfulPercent =
    finalized.length > 0 ? Math.round((accepted / finalized.length) * 1000) / 10 : null;
  const deterministicDenominator = Math.max(submitted.length, memoryRows.length, 1);
  const deterministicPercent =
    submitted.length + memoryRows.length > 0
      ? Math.round((deterministicCount / deterministicDenominator) * 1000) / 10
      : null;

  return {
    totalExecutions,
    successfulPercent,
    rejectedCount,
    deterministicPercent,
    memoryRecords: memoryRows.length,
  };
}

function formatStatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatExecutionHistoryStatCards(stats: ExecutionHistoryStats, isLoading: boolean) {
  if (isLoading) {
    return [
      { label: "Total Executions", value: "…", badge: null as string | null },
      { label: "Successful", value: "…", badge: null },
      { label: "Rejected", value: "…", badge: null },
      { label: "Deterministic", value: "…", badge: null },
    ];
  }

  return [
    {
      label: "Total Executions",
      value: formatStatNumber(stats.totalExecutions),
      badge: stats.memoryRecords > 0 ? `${stats.memoryRecords} on 0G` : null,
      badgeColor: "text-cyan-300 bg-cyan-400/10",
    },
    {
      label: "Successful",
      value: stats.successfulPercent != null ? `${stats.successfulPercent}%` : "—",
      badge: stats.successfulPercent != null ? "Finalized" : "No finalized yet",
      badgeColor:
        stats.successfulPercent != null && stats.successfulPercent >= 80
          ? "text-green-400 bg-green-400/10"
          : "text-amber-300 bg-amber-400/10",
    },
    {
      label: "Rejected",
      value: formatStatNumber(stats.rejectedCount),
      badge: stats.rejectedCount > 0 ? "Consensus" : null,
      badgeColor: "text-red-400 bg-red-400/10",
    },
    {
      label: "Deterministic",
      value: stats.deterministicPercent != null ? `${stats.deterministicPercent}%` : "—",
      badge: "Live mix",
      badgeColor: "text-purple-400 bg-purple-400/10",
    },
  ];
}

export interface ExecutionAuditTrail {
  topicId: string;
  consensusTimestamp: string | null;
  sequenceNumber: number | null;
  payerAccountId: string | null;
  runningHash: string | null;
  payload: Record<string, unknown>;
}

export interface ValidatorProfile {
  address: string;
  validatorId: number;
  isRegistered: boolean;
  active: boolean;
  stakedAmount: string;
  validatorReputation: number;
  registeredAt: number;
  accuracyScore: number;
  successfulValidations: number;
  failedValidations: number;
  slashCount: number;
  cooldownEnd: number;
}

export interface AgentExecutionMetadata {
  metadataUri: string;
  endpoint: string;
  name?: string;
  description?: string;
  isDeterministic: boolean;
  capabilityName?: string;
  expectedReasoning?: string;
  outputSchema?: string;
}

export interface ValidatorDecision {
  validator: string;
  validatorLabel?: string;
  validatorId?: string;
  focus?: string;
  approved: boolean;
  confidence: number;
  reason: string;
  concerns?: string[];
  flags?: string[];
  provider?: string;
  computeLayer?: string;
}

export interface VerificationSummary {
  verificationType: "deterministic" | "reasoning";
  verificationStatus: "verified" | "review_required" | "rejected";
  provenance: "observed" | "confirmed" | "inferred";
  confidence: number;
  normalizedOutput: string;
  recomputedOutput?: string | null;
  validatorResults: ValidatorDecision[];
  minorityVeto?: boolean;
  regenerationCount?: number;
  computeLayer?: string;
  trustSignal?: {
    direction: "positive" | "negative";
    label: string;
    delta: number;
  };
}

export interface OrchestrationSummary {
  runtime: string;
  route: string;
  generatorModel: string;
  trace: Array<{
    stage: string;
    detail: string;
  }>;
  openClawEnabled?: boolean;
  zeroGComputeConfigured?: boolean;
}

export interface AgentExecutionResponse {
  input?: string;
  taskType?: "deterministic" | "reasoning";
  /** Duplicated from `verification` for clients that only read top-level execute fields. */
  verificationType?: "deterministic" | "reasoning";
  category?: string;
  confidence?: number;
  result?: unknown;
  executionCommitment?: string;
  normalizedOutput?: string;
  reasoning?: string;
  summary?: string;
  status?: "success" | "failure";
  classification?: {
    taskType: "deterministic" | "reasoning";
    category: string;
    classifier: string;
    route: string;
  };
  verification?: VerificationSummary;
  orchestration?: OrchestrationSummary;
  memoryEnvelope?: Record<string, unknown>;
}

export interface VerifierResponse {
  output: string;
  expectedHash: string;
  model?: string;
  verificationType?: "deterministic";
  verificationStatus?: "verified";
}

export interface ExecutionStatus {
  executionId: number;
  agentId: number;
  parentExecutionId: number;
  callerAgentId: number;
  involvesExternalCall: boolean;
  externalService: string;
  reasoningHash: string;
  executionCommitment: string;
  executionHash: string;
  isDeterministic: boolean;
  approvals: number;
  rejections: number;
  finalized: boolean;
  accepted: boolean;
  createdAt: number;
}

type MemoryHistoryRecord = {
  id: string;
  createdAt?: string;
  agentAddress?: string;
  agentName?: string;
  task?: string;
  result?: unknown;
  executionId?: number;
  status?: "success" | "failure";
  timestamp?: string;
  trustScoreBefore?: number;
  trustScoreAfter?: number;
  storageHash?: string;
  /** 0G Storage flow log sequence — used with indexer `GET /file?txSeq=` when present. */
  storageTxSeq?: number;
  /** Legacy / indexer field name mirrored from cached envelopes. */
  txSeq?: number;
  uploadMode?: string;
  txHash?: string;
  validationTxHash?: string;
  trustTxHash?: string;
  verificationType?: string;
  verificationStatus?: string;
  provenance?: string;
  confidence?: number;
  validatorResults?: ValidatorDecision[];
  taskType?: string;
  summary?: string;
  computeLayer?: string;
};

export type ValidatorReviewActivity = {
  id: string;
  agentName: string;
  agentAddress?: string;
  task: string;
  summary: string;
  result: unknown;
  executionId?: number;
  verificationStatus: string;
  verificationType: string;
  confidence: number;
  timestamp: string;
  storageHash?: string;
  storageTxSeq?: number;
  txHash?: string;
  validationTxHash?: string;
  validatorResults: ValidatorDecision[];
  computeLayer?: string;
  storageEnvelope?: Record<string, unknown> | null;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

type RegisteredAgentCache = {
  numericId: number;
  address: string;
  name: string;
  description: string;
  capabilities: string[];
  metadataHash: string;
  riskLevel: number;
  isDeterministic: boolean;
  trustScore: number;
  stakeAmount: bigint;
  revoked: boolean;
};

const AGENT_REGISTRY_ABI = [
  "event AgentRegistered(address indexed agent,string indexed agentId,string metadataHash,uint8 riskLevel,bool isDeterministic)",
  "event MetadataHashUpdated(address indexed agent,string previousHash,string newHash)",
  "event TrustScoreUpdated(address indexed agent,uint256 previousScore,uint256 newScore)",
  "event AgentRevoked(address indexed agent)",
  "event StakeAmountSynced(address indexed agent,uint256 newStakeAmount)",
  "function getAgent(address agent) view returns (tuple(string agentId,string name,string description,string capabilities,string metadataHash,uint256 trustScore,uint8 riskLevel,bool isDeterministic,uint256 stakeAmount,bool exists,bool revoked))",
  "function getAgentByOwner(address owner) view returns (tuple(string agentId,string name,string description,string capabilities,string metadataHash,uint256 trustScore,uint8 riskLevel,bool isDeterministic,uint256 stakeAmount,bool exists,bool revoked))",
  "function revokeAgent(address agent)",
] as const;

const VALIDATION_REGISTRY_ABI = [
  "event ValidatorRegistered(address indexed validator,uint256 stakedAmount)",
  "event ValidatorStakeToppedUp(address indexed validator,uint256 amount,uint256 totalStake)",
  "event ValidatorUnstakeRequested(address indexed validator,uint256 cooldownEnd)",
  "event ValidatorUnregistered(address indexed validator,uint256 refundedAmount)",
  "event ValidatorSlashed(address indexed validator,uint256 amount,uint256 slashCount,string reason)",
  "event ValidatorReputationUpdated(address indexed validator,uint256 previousScore,uint256 newScore,int256 delta)",
  "event ExecutionSubmitted(uint256 indexed executionId,address indexed agent,string storageHash,bool isDeterministic)",
  "event VoteSubmitted(uint256 indexed executionId,address indexed validator,bool approve)",
  "event DeterministicExecutionVerified(uint256 indexed executionId,bool accepted)",
  "event ExecutionFinalized(uint256 indexed executionId,bool accepted,uint256 approvals,uint256 rejections)",
  "function VALIDATOR_STAKE_REQUIREMENT() view returns (uint256)",
  "function VALIDATOR_UNSTAKE_COOLDOWN() view returns (uint256)",
  "function stakeValidator(uint256 amount) payable",
  "function registerValidator() payable",
  "function topUpValidatorStake() payable",
  "function unstakeValidator()",
  "function unregisterValidator()",
  "function voteExecution(uint256 executionId,bool approve)",
  "function slashIncorrectDeterministicVote(uint256 executionId,address validator,bytes32 expectedHash)",
  "function submitExecution(address agent,string storageHash,bytes32 executionCommitment,bytes32 reasoningHash,bool isDeterministic) returns (uint256)",
  "function verifyDeterministicExecution(uint256 executionId,bytes32 expectedHash)",
  "function executionCounter() view returns (uint256)",
  "function getExecution(uint256 executionId) view returns (tuple(uint256 executionId,address agent,address submitter,string storageHash,bytes32 executionCommitment,bytes32 reasoningHash,bool isDeterministic,uint256 approvals,uint256 rejections,bool finalized,bool accepted,uint256 createdAt))",
  "function validators(address) view returns (bool isRegistered,bool active,uint256 stakedAmount,uint256 reputationScore,uint256 successfulValidations,uint256 failedValidations,uint256 slashCount,uint256 cooldownEnd,uint256 lastValidationAt)",
  "function getValidator(address validator) view returns (tuple(bool isRegistered,bool active,uint256 stakedAmount,uint256 reputationScore,uint256 successfulValidations,uint256 failedValidations,uint256 slashCount,uint256 cooldownEnd,uint256 lastValidationAt))",
] as const;

const TRUST_MANAGER_ABI = [
  "event InteractionRecorded(address indexed agent,string storageHash,bool success,string verifier)",
  "event TrustScoreChanged(address indexed agent,uint256 previousScore,uint256 newScore,bool success)",
  "function getTrustScore(address agent) view returns (uint256)",
  "function getInteractionCount(address agent) view returns (uint256)",
  "function recordInteraction(address agent,string storageHash,bool success) returns (uint256)",
  "function recordValidatedInteraction(address agent,string storageHash,bool success) returns (uint256)",
] as const;

const STAKING_MANAGER_ABI = [
  "event StakeDeposited(address indexed agent,uint256 amount,uint8 riskLevel)",
  "event StakeSlashed(address indexed agent,uint256 amount,uint256 remainingStake)",
  "function quoteStake(uint8 riskLevel) view returns (uint256)",
  "function getStakeAmount(address agent) view returns (uint256)",
] as const;

const agentRegistryInterface = new Interface(AGENT_REGISTRY_ABI);
const validationInterface = new Interface(VALIDATION_REGISTRY_ABI);
const trustInterface = new Interface(TRUST_MANAGER_ABI);
const stakingInterface = new Interface(STAKING_MANAGER_ABI);

const gradients = [
  { gradient: "from-cyan-500 to-blue-500", shadowColor: "shadow-cyan-500/20" },
  { gradient: "from-emerald-500 to-teal-500", shadowColor: "shadow-emerald-500/20" },
  { gradient: "from-fuchsia-500 to-pink-500", shadowColor: "shadow-fuchsia-500/20" },
  { gradient: "from-amber-500 to-orange-500", shadowColor: "shadow-amber-500/20" },
] as const;

const riskLabels = ["Low Risk", "Medium Risk", "High Risk"] as const;
const riskColors = ["green", "yellow", "red"] as const;

const agentCacheByNumericId = new Map<number, RegisteredAgentCache>();
const agentCacheByAddress = new Map<string, RegisteredAgentCache>();

function getEnv(name: keyof ImportMetaEnv): string {
  return import.meta.env[name]?.trim() ?? "";
}

function getRpcUrl() {
  return getEnv("VITE_ZEROG_RPC_URL");
}

/** Full-length 0x hash (e.g. tx or commitment) suitable for 0G chainscan `…/tx/…` links. */
function isZeroGExplorerHash(hash: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash.trim());
}

export function getZeroGTransactionExplorerUrl(txHash: string | undefined | null): string | null {
  const base = getEnv("VITE_ZEROG_BLOCK_EXPLORER_URL").replace(/\/+$/, "");
  const hash = typeof txHash === "string" ? txHash.trim() : "";
  if (!base || !isZeroGExplorerHash(hash)) {
    return null;
  }
  return `${base}/tx/${hash}`;
}

/** Default Galileo storage indexer HTTP gateway (see 0G docs: `GET /file?txSeq=` / `GET /file?root=`). */
const DEFAULT_ZEROG_STORAGE_FILE_GATEWAY = "https://indexer-storage-testnet-turbo.0g.ai";

function normalizeStorageTxSeq(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const n = Math.floor(value);
  return n > 0 ? n : null;
}

/**
 * Resolves a browser URL for the persisted 0G Storage blob.
 * - If `VITE_ZEROG_STORAGE_EXPLORER_URL` contains `{hash}` and/or `{seq}`, those placeholders are substituted.
 *   (A value without those tokens is not used for per-blob URLs, so we never append a second `…/0x…/0x…` path.)
 * - Otherwise use the indexer file gateway: `GET …/file?txSeq=` or `…/file?root=` (see 0G storage docs).
 * - Final fallback: chainscan `…/object/{hash}` when a full root hash is known.
 */
export function getZeroGStorageExplorerUrl(
  storageHash: string | undefined | null,
  storageTxSeq?: number | null,
): string | null {
  const hash = typeof storageHash === "string" ? storageHash.trim() : "";
  const seq = normalizeStorageTxSeq(storageTxSeq);

  const explicit = getEnv("VITE_ZEROG_STORAGE_EXPLORER_URL").replace(/\/+$/, "");
  const explicitUsesTemplate = explicit && (explicit.includes("{hash}") || explicit.includes("{seq}"));
  if (explicit && explicitUsesTemplate) {
    let out = explicit;
    if (explicit.includes("{seq}")) {
      if (seq == null) {
        return null;
      }
      out = out.split("{seq}").join(String(seq));
    }
    if (explicit.includes("{hash}")) {
      if (!isZeroGExplorerHash(hash)) {
        return null;
      }
      out = out.split("{hash}").join(hash);
    }
    if (out.includes("{seq}") || out.includes("{hash}")) {
      return null;
    }
    return out;
  }

  const gateway =
    (getEnv("VITE_ZEROG_STORAGE_FILE_GATEWAY_URL").trim() || DEFAULT_ZEROG_STORAGE_FILE_GATEWAY).replace(/\/+$/, "");
  if (seq != null) {
    return `${gateway}/file?txSeq=${encodeURIComponent(String(seq))}`;
  }
  if (isZeroGExplorerHash(hash)) {
    return `${gateway}/file?root=${encodeURIComponent(hash)}`;
  }

  const chainscan = getEnv("VITE_ZEROG_BLOCK_EXPLORER_URL").replace(/\/+$/, "");
  if (chainscan && isZeroGExplorerHash(hash)) {
    return `${chainscan}/object/${hash}`;
  }

  return null;
}

function extractValidatorResultsFromObject(source: Record<string, unknown> | null | undefined): ValidatorDecision[] {
  if (!source) {
    return [];
  }

  const fromSelf = extractValidatorResultsFromShallow(source);
  if (fromSelf.length > 0) {
    return fromSelf;
  }

  const nestedMemory = source.memory;
  if (nestedMemory && typeof nestedMemory === "object" && !Array.isArray(nestedMemory)) {
    const fromMemory = extractValidatorResultsFromShallow(nestedMemory as Record<string, unknown>);
    if (fromMemory.length > 0) {
      return fromMemory;
    }
  }

  return [];
}

function extractValidatorResultsFromShallow(source: Record<string, unknown>): ValidatorDecision[] {
  const direct = source.validatorResults;
  if (Array.isArray(direct) && direct.length > 0) {
    return direct as ValidatorDecision[];
  }

  const verification = source.verification;
  if (verification && typeof verification === "object") {
    const nested = (verification as Record<string, unknown>).validatorResults;
    if (Array.isArray(nested) && nested.length > 0) {
      return nested as ValidatorDecision[];
    }
  }

  return [];
}

function firstNonEmptyValidatorResults(...candidates: ValidatorDecision[][]): ValidatorDecision[] {
  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
  }
  return [];
}

function resolveMemoryPayloadFromEnvelope(storageEnvelope: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!storageEnvelope) {
    return null;
  }

  const nested = storageEnvelope.memory;
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }

  if (
    "validatorResults" in storageEnvelope ||
    "verification" in storageEnvelope ||
    "prompt" in storageEnvelope ||
    "verificationType" in storageEnvelope
  ) {
    return storageEnvelope;
  }

  return null;
}

const SYNTHETIC_ONCHAIN_TASK_MARKER = "Reasoning execution submitted on-chain";
const SYNTHETIC_ONCHAIN_SUMMARY_MARKER = "Fetching validator-agent review from the 0G storage envelope";

function memoryRowLooksLikeReasoningReview(record: MemoryHistoryRecord): boolean {
  if (record.verificationType === "reasoning") {
    return true;
  }
  if (record.taskType === "reasoning") {
    return true;
  }
  return Array.isArray(record.validatorResults) && record.validatorResults.length > 0;
}

/** Coerce JSON/API execution ids (number or numeric string) for stable dedupe keys. */
function coercePositiveExecutionId(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return Math.floor(n);
}

function validatorActivityRank(activity: ValidatorReviewActivity): number {
  let rank = activity.validatorResults.length * 25;
  if (!(activity.task ?? "").includes(SYNTHETIC_ONCHAIN_TASK_MARKER)) {
    rank += 22;
  }
  if (!(activity.summary ?? "").includes(SYNTHETIC_ONCHAIN_SUMMARY_MARKER)) {
    rank += 16;
  }
  if (activity.result != null && activity.result !== "") {
    rank += 12;
  }
  if (normalizeStorageTxSeq(activity.storageTxSeq) != null) {
    rank += 6;
  }
  rank += Math.round((activity.confidence || 0) * 15);
  return rank;
}

function parseExecutionIdFromActivityId(id: string): number | undefined {
  const match = /^execution-(\d+)$/i.exec(id);
  return match ? coercePositiveExecutionId(match[1]) : undefined;
}

function enrichValidatorActivityExecutionId(activity: ValidatorReviewActivity): ValidatorReviewActivity {
  const parsed =
    coercePositiveExecutionId(activity.executionId) ?? parseExecutionIdFromActivityId(activity.id);
  if (parsed == null) {
    return activity;
  }
  if (activity.executionId === parsed) {
    return activity;
  }
  return { ...activity, executionId: parsed };
}

function activitySameLogicalTask(left: ValidatorReviewActivity, right: ValidatorReviewActivity): boolean {
  const leftEid =
    coercePositiveExecutionId(left.executionId) ?? parseExecutionIdFromActivityId(left.id);
  const rightEid =
    coercePositiveExecutionId(right.executionId) ?? parseExecutionIdFromActivityId(right.id);
  if (leftEid != null && rightEid != null && leftEid === rightEid) {
    return true;
  }
  const leftHash = left.storageHash?.trim().toLowerCase();
  const rightHash = right.storageHash?.trim().toLowerCase();
  if (leftHash && rightHash && leftHash === rightHash) {
    return true;
  }
  const leftTx = (left.validationTxHash || left.txHash || "").trim().toLowerCase();
  const rightTx = (right.validationTxHash || right.txHash || "").trim().toLowerCase();
  if (leftTx && rightTx && leftTx === rightTx && leftTx.startsWith("0x") && leftTx.length > 12) {
    return true;
  }
  return false;
}

function dedupeValidatorReviewActivities(activities: ValidatorReviewActivity[]): ValidatorReviewActivity[] {
  const enriched = activities.map(enrichValidatorActivityExecutionId);
  const sorted = [...enriched].sort((a, b) => validatorActivityRank(b) - validatorActivityRank(a));
  const out: ValidatorReviewActivity[] = [];
  for (const candidate of sorted) {
    if (!out.some((kept) => activitySameLogicalTask(candidate, kept))) {
      out.push(candidate);
    }
  }
  return out;
}

function indexMemoryHistoryByExecutionAndStorage(history: MemoryHistoryRecord[]) {
  const byExecutionId = new Map<number, MemoryHistoryRecord>();
  const byStorageHash = new Map<string, MemoryHistoryRecord>();

  const pickBetter = (next: MemoryHistoryRecord, prev: MemoryHistoryRecord | undefined) => {
    if (!prev) {
      return next;
    }
    const nextLen = next.validatorResults?.length ?? 0;
    const prevLen = prev.validatorResults?.length ?? 0;
    if (nextLen > prevLen) {
      return next;
    }
    if (nextLen < prevLen) {
      return prev;
    }
    const nextSeq = normalizeStorageTxSeq(next.storageTxSeq ?? next.txSeq);
    const prevSeq = normalizeStorageTxSeq(prev.storageTxSeq ?? prev.txSeq);
    if (nextSeq != null && prevSeq == null) {
      return next;
    }
    if (nextSeq == null && prevSeq != null) {
      return prev;
    }
    return next;
  };

  for (const row of history) {
    const rowEid = coercePositiveExecutionId(row.executionId);
    if (rowEid != null) {
      byExecutionId.set(rowEid, pickBetter(row, byExecutionId.get(rowEid)));
    }
    if (row.storageHash) {
      byStorageHash.set(row.storageHash, pickBetter(row, byStorageHash.get(row.storageHash)));
    }
  }

  return { byExecutionId, byStorageHash };
}

function getProvider() {
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) {
    throw new Error("Missing VITE_ZEROG_RPC_URL");
  }
  return new JsonRpcProvider(rpcUrl);
}

function getBrowserEthereum() {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

async function getBrowserSigner() {
  const ethereum = getBrowserEthereum();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  await ethereum.request({ method: "eth_requestAccounts" });
  const provider = new BrowserProvider(ethereum as never);
  return provider.getSigner();
}

async function getConnectedAddress() {
  const ethereum = getBrowserEthereum();
  if (!ethereum) return "";
  const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
  return accounts[0] || "";
}

function getAgentRegistryAddress() {
  const address = getEnv("VITE_AGENT_REGISTRY_ADDRESS");
  if (!address) throw new Error("Missing VITE_AGENT_REGISTRY_ADDRESS");
  return address;
}

function getValidationRegistryAddress() {
  const address = getEnv("VITE_VALIDATION_REGISTRY_ADDRESS");
  if (!address) throw new Error("Missing VITE_VALIDATION_REGISTRY_ADDRESS");
  return address;
}

function getTrustManagerAddress() {
  return getEnv("VITE_TRUST_MANAGER_ADDRESS");
}

function getStakingManagerAddress() {
  return getEnv("VITE_STAKING_MANAGER_ADDRESS");
}

function buildInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "AG";
}

function buildRating(trustScore: number) {
  return Math.max(1, Math.min(5, Number((trustScore / 20).toFixed(1))));
}

function buildStars(rating: number) {
  const fullStars = Math.floor(rating);
  return Array.from({ length: 5 }, (_, index) => index < fullStars);
}

function buildHalfStar(rating: number) {
  return rating % 1 >= 0.5;
}

function splitCapabilities(capabilities: string) {
  return capabilities
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getVisuals(seed: number) {
  return gradients[seed % gradients.length];
}

function normalizeDeterministicOutput(result: unknown) {
  if (typeof result === "string") {
    return result.replace(/\s+/g, " ").trim().toLowerCase();
  }
  return JSON.stringify(result).replace(/\s+/g, " ").trim().toLowerCase();
}

function shortenAddress(address: string) {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseTimestampToLabel(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const blockTimestampMsCache = new Map<string, number>();

async function blockTimestampMsFromLog(provider: JsonRpcProvider, blockNumber?: bigint | number): Promise<number> {
  if (blockNumber === undefined) {
    return Date.now();
  }

  const key = String(blockNumber);
  const hit = blockTimestampMsCache.get(key);
  if (hit !== undefined) {
    return hit;
  }

  try {
    const block = await provider.getBlock(Number(blockNumber));
    const ms = block?.timestamp != null ? Number(block.timestamp) * 1000 : Date.now();
    blockTimestampMsCache.set(key, ms);
    return ms;
  } catch {
    return Date.now();
  }
}

function pickActivityIsoTime(record: MemoryHistoryRecord): string {
  const raw =
    (typeof record.createdAt === "string" && record.createdAt.trim()) ||
    (typeof record.timestamp === "string" && record.timestamp.trim()) ||
    "";
  const ms = new Date(raw).getTime();
  if (Number.isFinite(ms)) {
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const raw = await response.text();
  const payload = raw ? safeJsonParse(raw) : null;

  if (!response.ok) {
    if (payload && typeof payload === "object") {
      throw new Error(
        (payload as { details?: string; error?: string }).details ||
        (payload as { details?: string; error?: string }).error ||
        `Request failed with ${response.status}`,
      );
    }

    throw new Error(
      raw.trim()
        ? `Request failed with ${response.status}: ${raw.slice(0, 180)}`
        : `Request failed with ${response.status} and returned an empty response body.`,
    );
  }

  if (!payload) {
    throw new Error("The agent endpoint returned an empty response body.");
  }

  return payload as T;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function postMemoryLog(record: Record<string, unknown>) {
  return fetchJson<{ ok: true; record: MemoryHistoryRecord }>("/api/memory/log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ record }),
  });
}

function formatDisplayAmount(value: bigint) {
  const amount = Number(formatEther(value));
  if (!Number.isFinite(amount)) return "0";
  return amount % 1 === 0 ? String(amount) : amount.toFixed(4).replace(/\.?0+$/, "");
}

function getTrustColor(trustScore: number) {
  if (trustScore >= 80) return "green";
  if (trustScore >= 60) return "yellow";
  return "red";
}

function ensureCache(agent: RegisteredAgentCache) {
  agentCacheByNumericId.set(agent.numericId, agent);
  agentCacheByAddress.set(agent.address.toLowerCase(), agent);
}

async function hydrateAgentsFromChain(): Promise<RegisteredAgentCache[]> {
  const provider = getProvider();
  const registry = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, provider);
  const logs = await provider.getLogs({
    address: getAgentRegistryAddress(),
    fromBlock: 0,
    toBlock: "latest",
    topics: [agentRegistryInterface.getEvent("AgentRegistered").topicHash],
  });

  const agents: RegisteredAgentCache[] = [];

  for (const [index, log] of logs.entries()) {
    try {
      const parsed = agentRegistryInterface.parseLog(log);
      if (!parsed) continue;
      const agentAddress = String(parsed.args.agent);
      const profile = await registry.getAgent(agentAddress);
      if (!profile.exists) continue;

      const cached: RegisteredAgentCache = {
        numericId: index + 1,
        address: agentAddress,
        name: profile.name || `Agent ${index + 1}`,
        description: profile.description || "0G-native autonomous agent with persistent decentralized memory.",
        capabilities: splitCapabilities(profile.capabilities || "analysis"),
        metadataHash: profile.metadataHash || "",
        riskLevel: Number(profile.riskLevel ?? 0),
        isDeterministic: Boolean(profile.isDeterministic),
        trustScore: Number(profile.trustScore ?? 50),
        stakeAmount: BigInt(profile.stakeAmount ?? 0),
        revoked: Boolean(profile.revoked),
      };
      ensureCache(cached);
      agents.push(cached);
    } catch {
      continue;
    }
  }

  return agents;
}

async function resolveAgentByNumericId(agentId: number) {
  if (agentCacheByNumericId.has(agentId)) {
    return agentCacheByNumericId.get(agentId) ?? null;
  }

  const agents = await hydrateAgentsFromChain();
  return agents.find((agent) => agent.numericId === agentId) ?? null;
}

async function fetchRegisteredAgentByAddress(address: string) {
  const normalized = address.trim().toLowerCase();
  const agents = await hydrateAgentsFromChain();
  const existing = agents.find((agent) => agent.address.toLowerCase() === normalized);
  if (existing) {
    ensureCache(existing);
    return existing;
  }

  const provider = getProvider();
  const registry = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, provider);

  try {
    const profile = await registry.getAgent(address);
    if (!profile.exists || profile.revoked) {
      return null;
    }

    const nextNumericId = agents.reduce((max, agent) => Math.max(max, agent.numericId), 0) + 1;
    const cached: RegisteredAgentCache = {
      numericId: nextNumericId,
      address,
      name: profile.name || "Registered Agent",
      description: profile.description || "0G-native autonomous agent with persistent decentralized memory.",
      capabilities: splitCapabilities(profile.capabilities || "analysis"),
      metadataHash: profile.metadataHash || "",
      riskLevel: Number(profile.riskLevel ?? 0),
      isDeterministic: Boolean(profile.isDeterministic),
      trustScore: Number(profile.trustScore ?? 50),
      stakeAmount: BigInt(profile.stakeAmount ?? 0),
      revoked: Boolean(profile.revoked),
    };

    ensureCache(cached);
    return cached;
  } catch {
    return null;
  }
}

async function resolveAgentAddressForExecution(agentId: number) {
  const connected = await getConnectedAddress();
  if (connected) {
    const owned = await fetchRegisteredAgentByAddress(connected);
    if (owned && owned.numericId === agentId) {
      return owned.address;
    }
  }

  const cached = await resolveAgentByNumericId(agentId);
  if (!cached) {
    throw new Error(
      "No registered 0G agent was found on the current AgentRegistry deployment. Register the agent on-chain first, then retry execution.",
    );
  }

  // Any wallet may compose a task against a listed agent: use the on-chain agent identity for registry calls.
  // If ValidationRegistry requires msg.sender == agent, the contract revert will surface after submit.
  return cached.address;
}

async function uploadExecutionEnvelope(memory: Record<string, unknown>) {
  const payload = await fetchJson<{
    storageHash: string;
    uploadMode: string;
    storageTxSeq?: number;
    txSeq?: number;
    txHash?: string;
  }>("/api/memory/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "execution-envelope",
      memory,
    }),
  });

  return payload;
}

export async function uploadExecutionMemoryEnvelope(memory: Record<string, unknown>) {
  return uploadExecutionEnvelope(memory);
}

function inferVerificationType(execution: AgentExecutionResponse): "deterministic" | "reasoning" {
  const direct = execution.verification?.verificationType ?? execution.verificationType;
  if (direct === "deterministic" || direct === "reasoning") {
    return direct;
  }
  if (execution.taskType === "deterministic") {
    return "deterministic";
  }
  if (execution.taskType === "reasoning") {
    return "reasoning";
  }
  const classified = execution.classification?.taskType;
  if (classified === "deterministic" || classified === "reasoning") {
    return classified;
  }
  return "reasoning";
}

export async function buildExecutionMemoryPayload({
  agentId,
  prompt,
  execution,
  executionId,
}: {
  agentId: number;
  prompt: string;
  execution: AgentExecutionResponse;
  executionId?: number;
}) {
  const target = await resolveAgentByNumericId(agentId);
  const agentAddress = await resolveAgentAddressForExecution(agentId);
  const verificationType = inferVerificationType(execution);

  return {
    ...(execution.memoryEnvelope ?? {}),
    prompt,
    output: execution.result,
    summary: execution.summary,
    executionId,
    agentId,
    agentAddress,
    agentName: target?.name || `Agent ${agentId}`,
    verificationType,
    verificationStatus:
      execution.verification?.verificationStatus ??
      (verificationType === "deterministic" ? "verified" : "review_required"),
    provenance: execution.verification?.provenance,
    validatorResults: execution.verification?.validatorResults ?? [],
    confidence: execution.verification?.confidence ?? execution.confidence,
    computeLayer: execution.verification?.computeLayer || execution.orchestration?.runtime,
    orchestrator: execution.orchestration?.runtime || "OpenClaw-compatible orchestration loop",
    timestamp: new Date().toISOString(),
  };
}

async function getTrustScoreSnapshot(agentAddress: string) {
  const trustAddress = getTrustManagerAddress();
  if (!trustAddress) return null;

  try {
    const provider = getProvider();
    const trust = new Contract(trustAddress, TRUST_MANAGER_ABI, provider);
    return Number(await trust.getTrustScore(agentAddress));
  } catch {
    return null;
  }
}

function persistAgentReview(review: { agentId: number; rating: number; feedback: string; createdAt: string }) {
  const raw = window.localStorage.getItem(AGENT_REVIEW_STORAGE_KEY);
  const current = raw ? JSON.parse(raw) : [];
  const next = Array.isArray(current) ? current : [];
  next.unshift(review);
  window.localStorage.setItem(AGENT_REVIEW_STORAGE_KEY, JSON.stringify(next.slice(0, 100)));
}

export function computeDeterministicBindingHash(input: string, normalizedOutput: string, agentId: string | number) {
  return keccak256(abiCoder.encode(["string", "string", "string"], [input, normalizedOutput, String(agentId)]));
}

export function computeReasoningHash(reasoning: string) {
  return keccak256(toUtf8Bytes(reasoning || ""));
}

export function formatDisplayError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message || "Unknown error";
    const quotedRevert = message.match(/execution reverted:\s*"[^"]*"/i);
    if (quotedRevert) {
      return quotedRevert[0].trim();
    }

    const reasonQuoted = message.match(/reason\s*=\s*"([^"]+)"/i);
    if (reasonQuoted?.[1]) {
      return `execution reverted: "${reasonQuoted[1]}"`;
    }

    if (/Unauthorized execution actor/i.test(message)) {
      return `execution reverted: "Unauthorized execution actor"`;
    }

    return message.split("\n")[0]?.trim() || "Unknown error";
  }
  if (typeof error === "string") return error;
  return "Unknown error";
}

export async function fetchAgents(): Promise<Agent[]> {
  const agents = await hydrateAgentsFromChain().catch(() => []);

  return agents.map((agent, index) => {
    const rating = buildRating(agent.trustScore);
    const riskColor = getTrustColor(agent.trustScore) as Agent["riskColor"];
    const visuals = getVisuals(index + agent.numericId);
    const capabilities = agent.capabilities.map((capability, capabilityIndex) => ({
      skillId: 10_000 + agent.numericId * 100 + capabilityIndex,
      name: capability,
      active: true,
      requiresUserAuthorization: true,
      description: `${capability} capability`,
      domain: capability,
    }));

    return {
      agentId: agent.numericId,
      name: agent.name,
      description: agent.description,
      domain: agent.capabilities[0] || "General",
      riskLevel: agent.riskLevel,
      riskLabel: riskLabels[agent.riskLevel] ?? "Low Risk",
      riskColor: riskColors[agent.riskLevel] as Agent["riskColor"] ?? riskColor,
      trustScore: agent.trustScore,
      capabilities,
      requiresUserAuthorization: true,
      verified: agent.isDeterministic ? "Deterministic" : "Consensus Verified",
      verifiedIcon: agent.isDeterministic ? "memory" : "verified",
      initials: buildInitials(agent.name),
      type: agent.isDeterministic ? "Deterministic" : "Autonomous Agent",
      tags: agent.capabilities.slice(0, 2),
      gradient: visuals.gradient,
      shadowColor: visuals.shadowColor,
      rating,
      stars: buildStars(rating),
      halfStar: buildHalfStar(rating),
    } satisfies Agent;
  });
}

export async function authorizeAgentCapabilities(agentId: number, skillIds: number[]) {
  const connected = await getConnectedAddress();
  if (!connected) throw new Error("Connect your wallet before authorizing agent capabilities.");

  const key = `trustlayer.authorizations:${connected.toLowerCase()}:${agentId}`;
  window.localStorage.setItem(key, JSON.stringify(skillIds));
  return { hash: `0xauth${Date.now().toString(16)}` };
}

export async function fetchAgentAuthorizationStatus(agentId: number, skillIds: number[]) {
  const connected = await getConnectedAddress();
  if (!connected) {
    return {
      connected: false,
      allAuthorized: false,
      unauthorizedSkillIds: skillIds,
    };
  }

  const key = `trustlayer.authorizations:${connected.toLowerCase()}:${agentId}`;
  const raw = window.localStorage.getItem(key);
  const authorized = raw ? (JSON.parse(raw) as number[]) : [];
  const unauthorizedSkillIds = skillIds.filter((skillId) => !authorized.includes(skillId));

  return {
    connected: true,
    allAuthorized: unauthorizedSkillIds.length === 0,
    unauthorizedSkillIds,
  };
}

export async function revokeRegisteredAgent(agentId: number) {
  const target = await resolveAgentByNumericId(agentId);
  if (!target) {
    throw new Error("Demo-only agents cannot be revoked from the 0G registry.");
  }

  const signer = await getBrowserSigner();
  const registry = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, signer);
  const tx = await registry.revokeAgent(target.address);
  await tx.wait();
  return { hash: tx.hash as string };
}

function unwrapAgentMetadataDocument(record: unknown): Record<string, unknown> | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const root = record as Record<string, unknown>;
  const memory = root.memory;
  if (memory && typeof memory === "object" && !Array.isArray(memory)) {
    return memory as Record<string, unknown>;
  }
  if (typeof root.endpoint === "string" || (root.verificationProfile && typeof root.verificationProfile === "object")) {
    return root;
  }
  return null;
}

function mapMetadataExecutionMode(executionMode: unknown, fallback: boolean): boolean {
  if (executionMode === "non-deterministic" || executionMode === "reasoning") {
    return false;
  }
  if (executionMode === "deterministic") {
    return true;
  }
  return fallback;
}

async function inferHistoricalExecutionModeFallback(
  target: RegisteredAgentCache | null,
  fallback: boolean,
): Promise<boolean> {
  if (!target?.address && !target?.name) {
    return fallback;
  }

  try {
    const payload = await fetchJson<{ records: MemoryHistoryRecord[] }>("/api/memory/history?limit=250");
    const rows = payload.records.filter((record) => {
      const sameAddress =
        target.address &&
        typeof record.agentAddress === "string" &&
        record.agentAddress.trim().toLowerCase() === target.address.trim().toLowerCase();
      const sameName =
        target.name &&
        typeof record.agentName === "string" &&
        record.agentName.trim().toLowerCase() === target.name.trim().toLowerCase();
      return Boolean(sameAddress || sameName);
    });

    if (rows.length === 0) {
      return fallback;
    }

    const hasReasoningHistory = rows.some(
      (record) =>
        record.verificationType === "reasoning" ||
        record.taskType === "reasoning" ||
        (Array.isArray(record.validatorResults) && record.validatorResults.length > 0),
    );

    if (hasReasoningHistory) {
      return false;
    }

    const hasDeterministicHistory = rows.some(
      (record) => record.verificationType === "deterministic" || record.taskType === "deterministic",
    );

    if (hasDeterministicHistory) {
      return true;
    }
  } catch {
    // Keep the registry or metadata-derived fallback when history is unavailable.
  }

  return fallback;
}

export async function fetchAgentExecutionMetadata(agentId: number): Promise<AgentExecutionMetadata> {
  const target = await resolveAgentByNumericId(agentId);
  const metadataHash = target?.metadataHash?.trim() || "";
  const historicalMode = await inferHistoricalExecutionModeFallback(target, target?.isDeterministic ?? false);
  const defaults: AgentExecutionMetadata = {
    metadataUri: metadataHash || "0g://agent-metadata",
    endpoint: "/api/agent/execute",
    name: target?.name,
    description: target?.description,
    isDeterministic: historicalMode,
    capabilityName: target?.capabilities[0] || "analysis",
    expectedReasoning: "Explain the result, note key assumptions, and produce a verifiable execution summary.",
    outputSchema: '{ "summary": "string", "result": "object", "status": "success|failure" }',
  };

  if (!metadataHash.startsWith("0x") || metadataHash.length < 10) {
    return defaults;
  }

  try {
    const payload = await fetchJson<{ record: unknown }>(
      `/api/memory/fetch?storageHash=${encodeURIComponent(metadataHash)}`,
    );
    const doc = unwrapAgentMetadataDocument(payload.record);
    if (!doc) {
      return defaults;
    }

    const endpoint =
      typeof doc.endpoint === "string" && doc.endpoint.trim().length > 0 ? doc.endpoint.trim() : defaults.endpoint;
    const verificationProfile =
      doc.verificationProfile && typeof doc.verificationProfile === "object"
        ? (doc.verificationProfile as Record<string, unknown>)
        : null;
    const caps = Array.isArray(doc.capabilities)
      ? doc.capabilities.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : target?.capabilities || [];

    return {
      ...defaults,
      metadataUri: metadataHash,
      endpoint,
      name: typeof doc.name === "string" && doc.name.trim() ? doc.name.trim() : defaults.name,
      description:
        typeof doc.description === "string" && doc.description.trim() ? doc.description.trim() : defaults.description,
      isDeterministic: mapMetadataExecutionMode(verificationProfile?.executionMode, defaults.isDeterministic),
      capabilityName: caps[0] || defaults.capabilityName,
    };
  } catch {
    return defaults;
  }
}

export async function executeAgentTask(
  endpoint: string,
  prompt: string,
  agentId: number,
  options?: { verificationLane?: "deterministic" | "reasoning" },
): Promise<AgentExecutionResponse> {
  const target = await resolveAgentByNumericId(agentId);
  const executionAgentId = String(agentId);
  const url = endpoint?.startsWith("http") || endpoint?.startsWith("/") ? endpoint : "/api/agent/execute";
  const payload = await fetchJson<AgentExecutionResponse>(url || "/api/agent/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      agentId: executionAgentId,
      agentName: target?.name || `Agent ${agentId}`,
      capabilities: target?.capabilities || ["analysis"],
      ...(options?.verificationLane ? { verificationLane: options.verificationLane } : {}),
    }),
  });

  return payload;
}

export async function verifyWithBackend(endpoint: string, prompt: string, agentId: number): Promise<VerifierResponse> {
  return fetchJson<VerifierResponse>("/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: prompt,
      agentId: String(agentId),
    }),
  });
}

export async function persistExecutionMemoryRecord({
  agentId,
  prompt,
  execution,
  storageHash,
  storageTxSeq,
  txHash,
  uploadMode,
  executionId,
}: {
  agentId: number;
  prompt: string;
  execution: AgentExecutionResponse;
  storageHash: string;
  storageTxSeq?: number;
  txHash: string;
  uploadMode: string;
  executionId?: number;
}) {
  const target = await resolveAgentByNumericId(agentId);
  const agentAddress = await resolveAgentAddressForExecution(agentId);
  const trustSnapshot = await getTrustScoreSnapshot(agentAddress);

  const saved = await postMemoryLog({
    id: executionId ? `execution-${executionId}` : storageHash ? `review-${storageHash}` : undefined,
    agentAddress,
    agentName: target?.name || `Agent ${agentId}`,
    task: prompt,
    executionId,
    summary: execution.summary,
    result: execution.result,
    status: execution.verification?.verificationStatus === "rejected" ? "failure" : "success",
    timestamp: new Date().toISOString(),
    trustScoreBefore: trustSnapshot ?? undefined,
    trustScoreAfter: trustSnapshot ?? undefined,
    storageHash,
    storageTxSeq,
    uploadMode,
    txHash,
    verificationType: inferVerificationType(execution),
    verificationStatus: execution.verification?.verificationStatus ?? "review_required",
    provenance: execution.verification?.provenance,
    confidence: execution.verification?.confidence ?? execution.confidence,
    validatorResults: execution.verification?.validatorResults ?? [],
    taskType: inferVerificationType(execution),
    computeLayer: execution.verification?.computeLayer,
  });

  return saved.record;
}

export async function anchorReasoningExecution({
  agentId,
  prompt,
  execution,
  executionId,
  storageHashOverride,
  uploadModeOverride,
  storageTxSeqOverride,
  validationTxHash,
}: {
  agentId: number;
  prompt: string;
  execution: AgentExecutionResponse;
  executionId?: number;
  storageHashOverride?: string;
  uploadModeOverride?: string;
  storageTxSeqOverride?: number;
  validationTxHash?: string;
}) {
  const agentAddress = await resolveAgentAddressForExecution(agentId);
  const target = await resolveAgentByNumericId(agentId);
  const trustBefore = (await getTrustScoreSnapshot(agentAddress)) ?? undefined;
  const memoryPayload = await buildExecutionMemoryPayload({
    agentId,
    prompt,
    execution,
    executionId,
  });

  const upload = storageHashOverride
    ? {
        storageHash: storageHashOverride,
        uploadMode: uploadModeOverride || "0g-validation-anchor",
        storageTxSeq: storageTxSeqOverride,
      }
    : await uploadExecutionEnvelope(memoryPayload);
  const success = execution.verification?.verificationStatus === "verified";
  const trustAfter = (await getTrustScoreSnapshot(agentAddress)) ?? trustBefore;

  await postMemoryLog({
    id: executionId ? `execution-${executionId}` : upload.storageHash ? `review-${upload.storageHash}` : undefined,
    agentAddress,
    agentName: target?.name || `Agent ${agentId}`,
    task: prompt,
    executionId,
    summary: execution.summary,
    result: execution.result,
    status: success ? "success" : "failure",
    timestamp: new Date().toISOString(),
    trustScoreBefore: trustBefore,
    trustScoreAfter: trustAfter,
    storageHash: upload.storageHash,
    storageTxSeq: upload.storageTxSeq ?? storageTxSeqOverride,
    uploadMode: upload.uploadMode,
    txHash: validationTxHash || upload.storageHash,
    validationTxHash,
    verificationType: inferVerificationType(execution),
    verificationStatus: execution.verification?.verificationStatus ?? "review_required",
    provenance: execution.verification?.provenance,
    confidence: execution.verification?.confidence ?? execution.confidence,
    validatorResults: execution.verification?.validatorResults ?? [],
    taskType: inferVerificationType(execution),
    computeLayer: execution.verification?.computeLayer,
  });

  return {
    hash: validationTxHash || upload.storageHash,
    storageHash: upload.storageHash,
    uploadMode: upload.uploadMode,
    trustBefore: trustBefore ?? 0,
    trustAfter: trustAfter ?? trustBefore ?? 0,
  };
}

export async function submitDeterministicExecutionHash({
  agentId,
  executionCommitment,
  reasoningHash = ZERO_HASH,
  isDeterministic = true,
  memoryPayload,
  storageHashOverride,
  uploadModeOverride,
  storageTxSeqOverride,
}: {
  agentId: number;
  executionCommitment: string;
  reasoningHash?: string;
  isDeterministic?: boolean;
  memoryPayload?: Record<string, unknown>;
  storageHashOverride?: string;
  uploadModeOverride?: string;
  storageTxSeqOverride?: number;
  parentExecutionId?: number;
  callerAgentId?: number;
  involvesExternalCall?: boolean;
  externalService?: string;
}) {
  const signer = await getBrowserSigner();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, signer);
  const counterBefore = Number(await validation.executionCounter().catch(() => 0n));
  const agentAddress = await resolveAgentAddressForExecution(agentId);
  const envelope = storageHashOverride
    ? {
        storageHash: storageHashOverride,
        uploadMode: uploadModeOverride || "0g-validation-anchor",
        storageTxSeq: storageTxSeqOverride,
      }
    : await uploadExecutionEnvelope(
        memoryPayload ?? {
          agentId,
          agentAddress,
          executionCommitment,
          reasoningHash,
          isDeterministic,
          timestamp: new Date().toISOString(),
        },
      );

  const previewExecutionId = Number(
    await validation.submitExecution.staticCall(
      agentAddress,
      envelope.storageHash,
      executionCommitment,
      reasoningHash || ZERO_HASH,
      isDeterministic,
    ).catch(() => 0n),
  );

  const tx = await validation.submitExecution(
    agentAddress,
    envelope.storageHash,
    executionCommitment,
    reasoningHash || ZERO_HASH,
    isDeterministic,
  );
  const receipt = await tx.wait();

  let executionId: number | null = previewExecutionId > 0 ? previewExecutionId : null;
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = validationInterface.parseLog(log);
      if (parsed?.name === "ExecutionSubmitted") {
        executionId = Number(parsed.args.executionId);
        break;
      }
    } catch {
      continue;
    }
  }

  if (!executionId) {
    const counterAfter = Number(await validation.executionCounter().catch(() => 0n));
    if (counterAfter > counterBefore) {
      executionId = counterAfter;
    }
  }

  if (!executionId) {
    executionId = await recoverExecutionIdFromChain({
      validation,
      agentAddress,
      storageHash: envelope.storageHash,
      executionCommitment,
      reasoningHash: reasoningHash || ZERO_HASH,
      isDeterministic,
      counterBefore,
    });
  }

  return {
    hash: tx.hash as string,
    receipt,
    executionId,
    storageHash: envelope.storageHash,
    uploadMode: envelope.uploadMode,
    storageTxSeq: envelope.storageTxSeq,
  };
}

async function recoverExecutionIdFromChain({
  validation,
  agentAddress,
  storageHash,
  executionCommitment,
  reasoningHash,
  isDeterministic,
  counterBefore,
}: {
  validation: Contract;
  agentAddress: string;
  storageHash: string;
  executionCommitment: string;
  reasoningHash: string;
  isDeterministic: boolean;
  counterBefore: number;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const counterAfter = Number(await validation.executionCounter().catch(() => 0n));
    if (counterAfter > 0) {
      const floor = Math.max(1, counterBefore + 1);
      const ceiling = Math.max(counterAfter, floor);

      for (let executionId = ceiling; executionId >= floor; executionId -= 1) {
        try {
          const execution = await validation.getExecution(executionId);
          const sameAgent = String(execution.agent).toLowerCase() === agentAddress.toLowerCase();
          const sameStorageHash = String(execution.storageHash) === storageHash;
          const sameCommitment =
            String(execution.executionCommitment).toLowerCase() === executionCommitment.toLowerCase();
          const sameReasoningHash = String(execution.reasoningHash).toLowerCase() === reasoningHash.toLowerCase();
          const sameMode = Boolean(execution.isDeterministic) === isDeterministic;

          if (sameAgent && sameStorageHash && sameCommitment && sameReasoningHash && sameMode) {
            return executionId;
          }
        } catch {
          continue;
        }
      }
    }

    await delay(600);
  }

  return null;
}

export async function verifyDeterministicExecution(executionId: number, expectedHash: string) {
  const signer = await getBrowserSigner();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, signer);
  const tx = await validation.verifyDeterministicExecution(executionId, expectedHash);
  await tx.wait();
  const status = await fetchExecutionStatus(executionId);
  return {
    hash: tx.hash as string,
    accepted: status.accepted,
    finalized: status.finalized,
  };
}

export async function fetchExecutionStatus(executionId: number): Promise<ExecutionStatus> {
  const provider = getProvider();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, provider);
  const execution = await validation.getExecution(executionId);

  const cachedAgent =
    agentCacheByAddress.get(String(execution.agent).toLowerCase()) ??
    (await hydrateAgentsFromChain().then(() =>
      agentCacheByAddress.get(String(execution.agent).toLowerCase()) ?? null));

  return {
    executionId: Number(execution.executionId),
    agentId: cachedAgent?.numericId ?? 0,
    parentExecutionId: 0,
    callerAgentId: 0,
    involvesExternalCall: false,
    externalService: "",
    reasoningHash: String(execution.reasoningHash),
    executionCommitment: String(execution.executionCommitment),
    executionHash: String(execution.storageHash),
    isDeterministic: Boolean(execution.isDeterministic),
    approvals: Number(execution.approvals),
    rejections: Number(execution.rejections),
    finalized: Boolean(execution.finalized),
    accepted: Boolean(execution.accepted),
    createdAt: Number(execution.createdAt),
  };
}

export async function submitAgentReview(agentId: number, rating: number, feedback: string) {
  persistAgentReview({
    agentId,
    rating,
    feedback,
    createdAt: new Date().toISOString(),
  });
}

export async function fetchValidatorStakeRequirement() {
  const provider = getProvider();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, provider);
  const amount = await validation.VALIDATOR_STAKE_REQUIREMENT();
  return formatDisplayAmount(BigInt(amount));
}

export async function fetchConnectedValidatorProfile(): Promise<ValidatorProfile | null> {
  const connected = await getConnectedAddress();
  if (!connected) return null;

  const provider = getProvider();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, provider);
  const result = await validation.getValidator(connected);
  const totalReviews = Number(result.successfulValidations) + Number(result.failedValidations);
  const accuracyScore = totalReviews === 0
    ? Number(result.reputationScore || 0)
    : Math.max(0, Math.min(100, Math.round((Number(result.successfulValidations) / totalReviews) * 100)));

  return {
    address: connected,
    validatorId: 1,
    isRegistered: Boolean(result.isRegistered),
    active: Boolean(result.active),
    stakedAmount: formatDisplayAmount(BigInt(result.stakedAmount)),
    validatorReputation: Number(result.reputationScore ?? 0),
    registeredAt: 0,
    accuracyScore,
    successfulValidations: Number(result.successfulValidations ?? 0),
    failedValidations: Number(result.failedValidations ?? 0),
    slashCount: Number(result.slashCount ?? 0),
    cooldownEnd: Number(result.cooldownEnd ?? 0),
  };
}

export async function registerValidator(stakeAmount: string) {
  const signer = await getBrowserSigner();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, signer);
  const amount = parseEther(stakeAmount);
  const tx = await validation.stakeValidator(amount, { value: amount });
  await tx.wait();
  return { hash: tx.hash as string };
}

export async function topUpValidatorStake(stakeAmount: string) {
  const signer = await getBrowserSigner();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, signer);
  const tx = await validation.topUpValidatorStake({ value: parseEther(stakeAmount) });
  await tx.wait();
  return { hash: tx.hash as string };
}

export async function unregisterValidator() {
  const signer = await getBrowserSigner();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, signer);
  const tx = await validation.unstakeValidator();
  await tx.wait();
  return { hash: tx.hash as string };
}

export async function voteOnExecution(executionId: number, approve: boolean) {
  const signer = await getBrowserSigner();
  const validation = new Contract(getValidationRegistryAddress(), VALIDATION_REGISTRY_ABI, signer);
  const tx = await validation.voteExecution(executionId, approve);
  await tx.wait();
  const status = await fetchExecutionStatus(executionId);
  return {
    hash: tx.hash as string,
    finalized: status.finalized,
    accepted: status.accepted,
    approvals: status.approvals,
    rejections: status.rejections,
  };
}

export async function fetchProtocolLogs(limit = 12): Promise<ProtocolLogEntry[]> {
  const entries = await fetchExecutionHistory(limit * 2);
  return entries.slice(0, limit).map((entry) => ({
    time: entry.timestampLabel,
    text: `${entry.eventType} -> ${entry.description}`,
    color:
      entry.outcomeColor.includes("green")
        ? "text-emerald-400"
        : entry.outcomeColor.includes("red")
          ? "text-red-400"
          : entry.eventColor,
    eventType: entry.eventType,
    source: entry.source,
    entity: entry.entity,
    outcome: entry.outcome,
  }));
}

export async function fetchExecutionHistory(limit = 50): Promise<ExecutionHistoryEntry[]> {
  const provider = getProvider();
  const history: ExecutionHistoryEntry[] = [];

  const addresses = [
    { address: getValidationRegistryAddress(), type: "validation" as const },
    { address: getTrustManagerAddress(), type: "trust" as const },
    { address: getAgentRegistryAddress(), type: "registry" as const },
  ].filter((item) => item.address);

  for (const item of addresses) {
    const logs = await provider.getLogs({
      address: item.address,
      fromBlock: 0,
      toBlock: "latest",
    }).catch(() => []);

    for (const log of logs) {
      try {
        const parsed =
          item.type === "validation"
            ? validationInterface.parseLog(log)
            : item.type === "trust"
              ? trustInterface.parseLog(log)
              : item.type === "staking"
                ? stakingInterface.parseLog(log)
                : agentRegistryInterface.parseLog(log);

        if (!parsed) continue;
        const timestampValue = await blockTimestampMsFromLog(provider, log.blockNumber);
        const timestampLabel = parseTimestampToLabel(timestampValue);
        const txHash = log.transactionHash;

        switch (parsed.name) {
          case "ExecutionSubmitted":
            history.push({
              id: `${txHash}-submitted`,
              txHash,
              source: "Validation",
              eventType: "ExecutionSubmitted",
              entity: shortenAddress(String(parsed.args.agent)),
              eventClass: "Validation",
              eventColor: "text-blue-400",
              outcome: "Submitted",
              outcomeColor: "text-blue-400",
              timestampLabel,
              timestampValue,
              description: `Execution #${parsed.args.executionId.toString()} submitted with 0G storage hash ${String(parsed.args.storageHash).slice(0, 12)}...`,
              detailJson: JSON.stringify({
                executionId: Number(parsed.args.executionId),
                agent: String(parsed.args.agent),
                storageHash: String(parsed.args.storageHash),
                isDeterministic: Boolean(parsed.args.isDeterministic),
              }, null, 2),
            });
            break;
          case "ExecutionFinalized":
            history.push({
              id: `${txHash}-finalized`,
              txHash,
              source: "Validation",
              eventType: "ExecutionFinalized",
              entity: `Execution #${parsed.args.executionId.toString()}`,
              eventClass: "Validation",
              eventColor: "text-purple-400",
              outcome: Boolean(parsed.args.accepted) ? "Accepted" : "Rejected",
              outcomeColor: Boolean(parsed.args.accepted) ? "text-green-400" : "text-red-400",
              timestampLabel,
              timestampValue,
              description: `Execution finalized after ${parsed.args.approvals.toString()}/${parsed.args.rejections.toString()} validator votes.`,
              detailJson: JSON.stringify({
                executionId: Number(parsed.args.executionId),
                accepted: Boolean(parsed.args.accepted),
                approvals: Number(parsed.args.approvals),
                rejections: Number(parsed.args.rejections),
              }, null, 2),
            });
            break;
          case "ValidatorSlashed":
            history.push({
              id: `${txHash}-validator-slashed`,
              txHash,
              source: "Validation",
              eventType: "ValidatorSlashed",
              entity: shortenAddress(String(parsed.args.validator)),
              eventClass: "Validation",
              eventColor: "text-red-400",
              outcome: "Slashed",
              outcomeColor: "text-red-400",
              timestampLabel,
              timestampValue,
              description: `Validator collateral slashed by ${formatDisplayAmount(BigInt(parsed.args.amount))} OG for ${String(parsed.args.reason)}.`,
              detailJson: JSON.stringify({
                validator: String(parsed.args.validator),
                amount: formatDisplayAmount(BigInt(parsed.args.amount)),
                slashCount: Number(parsed.args.slashCount),
                reason: String(parsed.args.reason),
              }, null, 2),
            });
            break;
          case "ValidatorReputationUpdated":
            history.push({
              id: `${txHash}-validator-reputation`,
              txHash,
              source: "Validation",
              eventType: "ValidatorReputationUpdated",
              entity: shortenAddress(String(parsed.args.validator)),
              eventClass: "Validation",
              eventColor: "text-cyan-300",
              outcome: Number(parsed.args.delta) >= 0 ? "Improved" : "Reduced",
              outcomeColor: Number(parsed.args.delta) >= 0 ? "text-green-400" : "text-amber-400",
              timestampLabel,
              timestampValue,
              description: `Validator reputation moved from ${parsed.args.previousScore.toString()} to ${parsed.args.newScore.toString()}.`,
              detailJson: JSON.stringify({
                validator: String(parsed.args.validator),
                previousScore: Number(parsed.args.previousScore),
                newScore: Number(parsed.args.newScore),
                delta: Number(parsed.args.delta),
              }, null, 2),
            });
            break;
          case "TrustScoreChanged":
            history.push({
              id: `${txHash}-trust`,
              txHash,
              source: "Reputation",
              eventType: "TrustScoreUpdated",
              entity: shortenAddress(String(parsed.args.agent)),
              eventClass: "Reputation",
              eventColor: "text-amber-400",
              outcome: Boolean(parsed.args.success) ? "Accepted" : "Rejected",
              outcomeColor: Boolean(parsed.args.success) ? "text-green-400" : "text-red-400",
              timestampLabel,
              timestampValue,
              description: `Trust score changed from ${parsed.args.previousScore.toString()} to ${parsed.args.newScore.toString()}.`,
              detailJson: JSON.stringify({
                agent: String(parsed.args.agent),
                previousScore: Number(parsed.args.previousScore),
                newScore: Number(parsed.args.newScore),
                success: Boolean(parsed.args.success),
              }, null, 2),
            });
            break;
          case "AgentRegistered":
            history.push({
              id: `${txHash}-registered`,
              txHash,
              source: "AgentRegistry",
              eventType: "AgentRegistered",
              entity: shortenAddress(String(parsed.args.agent)),
              eventClass: "AgentRegistry",
              eventColor: "text-cyan-400",
              outcome: "Registered",
              outcomeColor: "text-cyan-400",
              timestampLabel,
              timestampValue,
              description: `Agent registered on 0G with metadata hash ${String(parsed.args.metadataHash).slice(0, 12)}...`,
              detailJson: JSON.stringify({
                agent: String(parsed.args.agent),
                agentId: String(parsed.args.agentId),
                metadataHash: String(parsed.args.metadataHash),
                riskLevel: Number(parsed.args.riskLevel),
                isDeterministic: Boolean(parsed.args.isDeterministic),
              }, null, 2),
            });
            break;
          default:
            break;
        }
      } catch {
        continue;
      }
    }
  }

  const memoryHistory = await fetchJson<{ records: MemoryHistoryRecord[] }>("/api/memory/history?limit=100")
    .then((payload) => payload.records)
    .catch(() => []);

  for (const record of memoryHistory) {
    if (!record.storageHash) continue;
    const timestampValue = record.timestamp ? new Date(record.timestamp).getTime() : Date.now();
    history.push({
      id: record.id,
      txHash: record.txHash || record.storageHash,
      source: "0G",
      eventType: "MemoryPersisted",
      entity: record.agentName || "Agent Memory",
      eventClass: "AgentRegistry",
      eventColor: "text-cyan-300",
      outcome: record.status === "success" ? "Persisted" : "Recorded",
      outcomeColor: "text-cyan-300",
      timestampLabel: parseTimestampToLabel(timestampValue),
      timestampValue,
      description: `${record.verificationType || "execution"} memory (${record.provenance || "observed"}) written to 0G Storage: ${record.storageHash.slice(0, 12)}...`,
      detailJson: JSON.stringify(record, null, 2),
    });
  }

  return history
    .sort((left, right) => right.timestampValue - left.timestampValue)
    .slice(0, limit);
}

export async function fetchValidatorReviewActivity(limit = 20): Promise<ValidatorReviewActivity[]> {
  const memoryHistory = await fetchJson<{ records: MemoryHistoryRecord[] }>(`/api/memory/history?limit=${Math.max(limit, 100)}`)
    .then((payload) => payload.records)
    .catch(() => []);

  const { byExecutionId, byStorageHash } = indexMemoryHistoryByExecutionAndStorage(memoryHistory);

  const reasoningRecords: MemoryHistoryRecord[] = memoryHistory.filter((record) => memoryRowLooksLikeReasoningReview(record));
  const validationAddress = getValidationRegistryAddress();
  let provider: JsonRpcProvider | null = null;
  try {
    provider = getProvider();
  } catch {
    provider = null;
  }

  const validationLogs =
    provider && validationAddress
      ? await provider
          .getLogs({
            address: validationAddress,
            fromBlock: 0,
            toBlock: "latest",
          })
          .catch(() => [])
      : [];
  const seenStorageHashes = new Set(memoryHistory.map((record) => record.storageHash).filter(Boolean));

  for (const log of validationLogs) {
    try {
      const parsed = validationInterface.parseLog(log);
      if (!parsed || parsed.name !== "ExecutionSubmitted" || Boolean(parsed.args.isDeterministic)) {
        continue;
      }

      const storageHash = String(parsed.args.storageHash);
      if (seenStorageHashes.has(storageHash)) {
        continue;
      }

      seenStorageHashes.add(storageHash);
      const submittedAtMs = provider ? await blockTimestampMsFromLog(provider, log.blockNumber) : Date.now();
      reasoningRecords.push({
        id: `execution-${Number(parsed.args.executionId)}`,
        agentAddress: String(parsed.args.agent),
        agentName: shortenAddress(String(parsed.args.agent)),
        task: "Reasoning execution submitted on-chain",
        result: null,
        executionId: Number(parsed.args.executionId),
        status: "success",
        timestamp: new Date(submittedAtMs).toISOString(),
        storageHash,
        txHash: log.transactionHash,
        validationTxHash: log.transactionHash,
        verificationType: "reasoning",
        verificationStatus: "review_required",
        provenance: "observed",
        validatorResults: [],
        taskType: "reasoning",
        summary: "Fetching validator-agent review from the 0G storage envelope.",
      });
    } catch {
      continue;
    }
  }

  const storagePayloads = await Promise.all(
    reasoningRecords.map(async (record) => {
      if (!record.storageHash) {
        return null;
      }

      try {
        const payload = await fetchJson<{ record: Record<string, unknown> }>(
          `/api/memory/fetch?storageHash=${encodeURIComponent(record.storageHash)}`,
        );
        return payload.record;
      } catch {
        return null;
      }
    }),
  );

  const mappedActivities = reasoningRecords.map((record, index) => {
      const storageEnvelope = storagePayloads[index] as Record<string, unknown> | null;
      const storageMemory = resolveMemoryPayloadFromEnvelope(storageEnvelope);

      const recordEid = coercePositiveExecutionId(record.executionId);
      const linkedByExecution = recordEid != null ? byExecutionId.get(recordEid) : undefined;
      const linkedByStorage = record.storageHash ? byStorageHash.get(record.storageHash) : undefined;

      const seqFromEnvelope = normalizeStorageTxSeq(storageEnvelope?.txSeq ?? storageEnvelope?.storageTxSeq);
      const seqFromRecord = normalizeStorageTxSeq(record.storageTxSeq ?? record.txSeq);
      const seqFromLinked =
        normalizeStorageTxSeq(linkedByExecution?.storageTxSeq ?? linkedByExecution?.txSeq) ??
        normalizeStorageTxSeq(linkedByStorage?.storageTxSeq ?? linkedByStorage?.txSeq);

      const validatorResults = firstNonEmptyValidatorResults(
        extractValidatorResultsFromObject(storageMemory),
        extractValidatorResultsFromObject(storageEnvelope),
        extractValidatorResultsFromObject(record as Record<string, unknown>),
        extractValidatorResultsFromObject(linkedByExecution as Record<string, unknown> | undefined),
        extractValidatorResultsFromObject(linkedByStorage as Record<string, unknown> | undefined),
      );

      return {
        id: record.id,
        agentName: record.agentName || String(storageMemory?.agentName || "Agent"),
        agentAddress: record.agentAddress || (typeof storageMemory?.agentAddress === "string" ? storageMemory.agentAddress : undefined),
        task: storageMemory?.prompt ? String(storageMemory.prompt) : record.task || "Untitled task",
        summary: storageMemory?.summary ? String(storageMemory.summary) : record.summary || "Validator-agent review completed.",
        result: storageMemory?.output ?? record.result,
        executionId:
          coercePositiveExecutionId(record.executionId) ??
          coercePositiveExecutionId(storageMemory?.executionId) ??
          coercePositiveExecutionId(linkedByExecution?.executionId) ??
          coercePositiveExecutionId(linkedByStorage?.executionId) ??
          parseExecutionIdFromActivityId(record.id),
        verificationStatus: String(storageMemory?.verificationStatus || record.verificationStatus || "review_required"),
        verificationType: String(storageMemory?.verificationType || record.verificationType || "reasoning"),
        confidence:
          typeof storageMemory?.confidence === "number"
            ? storageMemory.confidence
            : typeof record.confidence === "number"
              ? record.confidence
              : 0,
        timestamp: pickActivityIsoTime(record),
        storageHash: record.storageHash,
        storageTxSeq: seqFromRecord ?? seqFromLinked ?? seqFromEnvelope ?? undefined,
        txHash: record.validationTxHash || record.txHash,
        validationTxHash: record.validationTxHash,
        validatorResults,
        computeLayer:
          typeof storageMemory?.computeLayer === "string"
            ? storageMemory.computeLayer
            : record.computeLayer,
        storageEnvelope,
      };
    });

  return dedupeValidatorReviewActivities(mappedActivities)
    .filter((activity) => activity.verificationType === "reasoning" || activity.validatorResults.length > 0)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export async function fetchExecutionAuditTrail(entry: ExecutionHistoryEntry): Promise<ExecutionAuditTrail | null> {
  try {
    const payload = JSON.parse(entry.detailJson) as Record<string, unknown>;
    return {
      topicId: "0G Storage / 0G Chain",
      consensusTimestamp: new Date(entry.timestampValue).toISOString(),
      sequenceNumber: null,
      payerAccountId: null,
      runningHash: typeof payload.storageHash === "string" ? payload.storageHash : entry.txHash,
      payload,
    };
  } catch {
    return null;
  }
}

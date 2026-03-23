import {
  AbiCoder,
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  formatUnits,
  keccak256,
  parseUnits,
  toUtf8Bytes,
} from "ethers";

const WEIBAR_PER_TINYBAR = 10_000_000_000n;
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const abiCoder = AbiCoder.defaultAbiCoder();

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
  sequenceNumber?: number | null;
}

export interface ExecutionHistoryEntry {
  id: string;
  txHash: string;
  source: "Validation" | "Reputation" | "Staking" | "AgentRegistry" | "HCS";
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
}

interface AgentMetadata {
  name?: string;
  description?: string;
  domain?: string;
  endpoint?: string;
  services?: Array<{
    name?: string;
    endpoint?: string;
    description?: string;
  }>;
  capabilities?: Array<string | { skillId?: number; name?: string; active?: boolean }>;
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

export interface AgentExecutionResponse {
  input?: string;
  result?: unknown;
  executionCommitment?: string;
  normalizedOutput?: string;
  reasoning?: string;
}

export interface VerifierResponse {
  output: string;
  expectedHash: string;
  model?: string;
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

interface MirrorNodeLogResponse {
  logs?: Array<{
    data: string;
    topics: string[];
    timestamp?: string;
    transaction_hash?: string;
  }>;
  links?: {
    next?: string | null;
  };
}

interface MirrorNodeTopicMessagesResponse {
  messages?: Array<{
    consensus_timestamp?: string;
    message?: string;
    payer_account_id?: string;
    running_hash?: string;
    sequence_number?: number;
  }>;
}

const DEFAULT_MIRROR_NODE_URL = "https://testnet.mirrornode.hedera.com";

const AGENT_REGISTRY_ABI = [
  "event AgentRegistered(uint256 indexed agentId,address indexed owner,uint8 riskLevel,bool isDeterministic,string metadataURI)",
  "event AgentRevoked(uint256 indexed agentId)",
  "event CapabilityChanged(uint256 indexed agentId,uint32 skillId,string capability,uint256 riskLevel)",
  "event TrustScoreUpdated(uint256 indexed agentId,uint256 oldScore,uint256 newScore)",
  "function getAgent(uint256 agentId) view returns (tuple(bool isRegistered,address owner,string metadataURI,uint256 trustScore,uint8 rating,uint8 riskLevel,bool isDeterministic,uint256 stakeAmount,bool revoked,uint256 createdAt))",
  "function getCapabilities(uint256 agentId) view returns (tuple(uint32 skillId,string name,string description,string expectedReasoning,string outputSchema,string domain,bool requiresUserAuthorization,bool active)[])",
  "function revokeAgent(uint256 agentId)",
] as const;

const REPUTATION_REGISTRY_ABI = [
  "event ReviewSubmitted(uint256 indexed agentId,uint8 rating)",
  "event TrustScoreUpdated(uint256 indexed agentId,uint256 previousScore,uint256 newScore,bool accepted)",
  "event RatingReduced(uint256 indexed agentId,uint256 previousRating,uint256 newRating,uint16 reduction)",
  "event StakeSlashRequested(uint256 indexed agentId,uint256 penalty)",
  "function submitReview(uint256 agentId,uint8 rating,string feedback) external",
  "function getTrustScore(uint256 agentId) view returns (uint256)",
] as const;

const VALIDATION_REGISTRY_ABI = [
  "event ExecutionSubmitted(uint256 indexed executionId,uint256 indexed agentId,uint256 parentExecutionId,uint256 callerAgentId,bool involvesExternalCall,string externalService)",
  "event VoteSubmitted(uint256 indexed executionId,address indexed validator,bool approve)",
  "event ExecutionFinalized(uint256 indexed executionId,bool accepted,uint256 approvals,uint256 rejections)",
  "event DeterministicExecutionVerified(uint256 indexed executionId,bool accepted)",
  "event AgentRegistryUpdated(address indexed agentRegistry)",
  "event ReputationRegistryUpdated(address indexed reputationRegistry)",
  "event ValidatorStakeRequirementUpdated(uint256 oldRequirement,uint256 newRequirement)",
  "event ValidatorRegistered(address indexed validator,uint256 indexed validatorId,uint256 stakedAmount)",
  "event ValidatorStakeToppedUp(address indexed validator,uint256 amount,uint256 totalStake)",
  "event ValidatorUnregistered(address indexed validator,uint256 refundedAmount)",
  "event ValidatorReputationUpdated(address indexed validator,uint256 oldReputation,uint256 newReputation)",
  "function registerValidator() external payable",
  "function submitExecution(uint256 agentId,uint256 parentExecutionId,uint256 callerAgentId,bool involvesExternalCall,string externalService,bytes32 executionCommitment,bytes32 reasoningHash,bool isDeterministic) external returns (uint256 executionId, bytes32 executionHash)",
  "function verifyDeterministicExecution(uint256 executionId, bytes32 expectedHash) external",
  "function voteExecution(uint256 executionId, bool approve) external",
  "function topUpValidatorStake() external payable",
  "function unregisterValidator() external",
  "function validatorStakeRequirement() view returns (uint256)",
  "function validators(address) view returns (uint256 validatorId,bool isRegistered,bool active,uint256 stakedAmount,uint256 validatorReputation,uint256 registeredAt,uint256 accuracyScore)",
  "function getExecution(uint256 executionId) view returns (tuple(uint256 executionId,uint256 agentId,uint256 parentExecutionId,uint256 callerAgentId,bool involvesExternalCall,string externalService,bytes32 reasoningHash,bytes32 executionCommitment,bytes32 executionHash,bool isDeterministic,uint256 approvals,uint256 rejections,bool finalized,bool accepted,uint256 createdAt))",
] as const;

const LEGACY_VALIDATION_REGISTRY_ABI = [
  "function validators(address) view returns (bool isRegistered,bool active,uint256 stakedAmount,uint256 validatorReputation,uint256 registeredAt,uint256 accuracyScore)",
] as const;

const STAKING_MANAGER_ABI = [
  "event Staked(uint256 indexed agentId,uint256 amount,address indexed owner)",
  "event Unstaked(uint256 indexed agentId,uint256 amount,address indexed owner)",
  "event Slashed(uint256 indexed agentId,uint256 amount)",
  "event Liquidated(uint256 indexed agentId,address indexed bonusReceiver,uint256 bonusAmount,uint256 seizedAmount)",
] as const;

const AUTHORIZATION_MANAGER_ABI = [
  "function authorizeAgent(uint256 agentId,uint32[] skillIds) external",
  "function checkPermission(address user,uint256 agentId,uint32 skillId) view returns (bool)",
] as const;

const eventInterface = new Interface(AGENT_REGISTRY_ABI);
const validationEventInterface = new Interface(VALIDATION_REGISTRY_ABI);
const reputationEventInterface = new Interface(REPUTATION_REGISTRY_ABI);
const stakingEventInterface = new Interface(STAKING_MANAGER_ABI);

const gradients = [
  { gradient: "from-cyan-500 to-blue-500", shadowColor: "shadow-cyan-500/20" },
  { gradient: "from-emerald-500 to-teal-500", shadowColor: "shadow-emerald-500/20" },
  { gradient: "from-fuchsia-500 to-pink-500", shadowColor: "shadow-fuchsia-500/20" },
  { gradient: "from-amber-500 to-orange-500", shadowColor: "shadow-amber-500/20" },
] as const;

const riskLabels = ["Low Risk", "Medium Risk", "High Risk"] as const;
const riskColors = ["green", "yellow", "red"] as const;

function getEnv(name: keyof ImportMetaEnv): string {
  return import.meta.env[name]?.trim() ?? "";
}

function getProvider() {
  const rpcUrl = getEnv("VITE_HEDERA_RPC_URL");
  if (!rpcUrl) {
    throw new Error("Missing VITE_HEDERA_RPC_URL");
  }
  return new JsonRpcProvider(rpcUrl);
}

function getAgentRegistryAddress() {
  const address = getEnv("VITE_AGENT_REGISTRY_ADDRESS");
  if (!address) {
    throw new Error("Missing VITE_AGENT_REGISTRY_ADDRESS");
  }
  return address;
}

function getReputationRegistryAddress() {
  const address = getEnv("VITE_REPUTATION_REGISTRY_ADDRESS");
  if (!address) {
    throw new Error("Missing VITE_REPUTATION_REGISTRY_ADDRESS");
  }
  return address;
}

function getValidationRegistryAddress() {
  const address = getEnv("VITE_VALIDATION_REGISTRY_ADDRESS");
  if (!address) {
    throw new Error("Missing VITE_VALIDATION_REGISTRY_ADDRESS");
  }
  return address;
}

function getStakingManagerAddress() {
  const address = getEnv("VITE_STAKING_MANAGER_ADDRESS");
  if (!address) {
    throw new Error("Missing VITE_STAKING_MANAGER_ADDRESS");
  }
  return address;
}

function getAuthorizationManagerAddress() {
  const address = getEnv("VITE_AUTHORIZATION_MANAGER_ADDRESS");
  if (!address) {
    throw new Error("Missing VITE_AUTHORIZATION_MANAGER_ADDRESS");
  }
  return address;
}

function getMirrorNodeBaseUrl() {
  return getEnv("VITE_HEDERA_MIRROR_NODE_URL") || DEFAULT_MIRROR_NODE_URL;
}

function getIpfsGatewayBaseUrl() {
  return getEnv("VITE_IPFS_GATEWAY_URL") || "https://ipfs.io";
}

function extractReadableErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      shortMessage?: string;
      reason?: string;
      message?: string;
      revert?: { args?: unknown[] };
      info?: { error?: { message?: string } };
    };

    if (typeof maybeError.reason === "string" && maybeError.reason.trim()) {
      return `execution reverted: "${maybeError.reason.trim()}"`;
    }

    const revertArg = maybeError.revert?.args?.[0];
    if (typeof revertArg === "string" && revertArg.trim()) {
      return `execution reverted: "${revertArg.trim()}"`;
    }

    if (typeof maybeError.shortMessage === "string" && maybeError.shortMessage.trim()) {
      return maybeError.shortMessage.trim();
    }

    const nestedInfoMessage = maybeError.info?.error?.message;
    if (typeof nestedInfoMessage === "string" && nestedInfoMessage.trim()) {
      return extractReadableErrorMessage(nestedInfoMessage);
    }

    if (typeof maybeError.message === "string" && maybeError.message.trim()) {
      const rawMessage = maybeError.message.trim();
      const revertedMatch = rawMessage.match(/execution reverted:\s*"([^"]+)"/i);
      if (revertedMatch?.[1]) {
        return `execution reverted: "${revertedMatch[1]}"`;
      }

      const reasonMatch = rawMessage.match(/reason="([^"]+)"/i);
      if (reasonMatch?.[1]) {
        return `execution reverted: "${reasonMatch[1]}"`;
      }

      return rawMessage;
    }
  }

  if (typeof error === "string" && error.trim()) {
    const rawMessage = error.trim();
    const revertedMatch = rawMessage.match(/execution reverted:\s*"([^"]+)"/i);
    if (revertedMatch?.[1]) {
      return `execution reverted: "${revertedMatch[1]}"`;
    }

    const reasonMatch = rawMessage.match(/reason="([^"]+)"/i);
    if (reasonMatch?.[1]) {
      return `execution reverted: "${reasonMatch[1]}"`;
    }

    return rawMessage;
  }

  return "Unknown error";
}

export function formatDisplayError(error: unknown): string {
  return extractReadableErrorMessage(error);
}

function getValidationTopicId() {
  return getEnv("VITE_HEDERA_VALIDATION_TOPIC_ID");
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

function getEthereumProvider() {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

function decodeBase64Utf8(value: string) {
  if (!value) return "";

  const decoded = atob(value);
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseMirrorNodeMessage(message: MirrorNodeTopicMessagesResponse["messages"][number]) {
  const payloadText = decodeBase64Utf8(message?.message || "");
  const payload = JSON.parse(payloadText) as Record<string, unknown>;

  return {
    consensusTimestamp: message?.consensus_timestamp || null,
    sequenceNumber: message?.sequence_number || null,
    runningHash: message?.running_hash || null,
    payerAccountId: message?.payer_account_id || null,
    payload,
  };
}

function shortenAddress(address: string) {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatConsensusTime(input: string | null) {
  if (!input) return "--:--:--";

  const [secondsPart, nanosPart = "0"] = input.split(".");
  const milliseconds =
    Number(secondsPart) * 1000 + Math.floor(Number(nanosPart.padEnd(9, "0").slice(0, 9)) / 1_000_000);
  const date = new Date(milliseconds);

  if (Number.isNaN(date.getTime())) return "--:--:--";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getProtocolLogColor(type: string) {
  switch (type) {
    case "EXECUTION_SUBMITTED":
      return "text-blue-400";
    case "VOTE_CAST":
      return "text-emerald-400";
    case "EXECUTION_REACHED_CONSENSUS":
      return "text-amber-400";
    case "EXECUTION_FINALIZED":
      return "text-slate-300";
    case "AGENT_REVOKED":
      return "text-red-400";
    default:
      return "text-slate-400";
  }
}

function getProtocolLogSource(type: string): ExecutionHistoryEntry["source"] {
  switch (type) {
    case "EXECUTION_SUBMITTED":
    case "VOTE_CAST":
    case "EXECUTION_REACHED_CONSENSUS":
    case "EXECUTION_FINALIZED":
    case "VALIDATOR_REGISTERED":
      return "Validation";
    case "AGENT_REGISTERED":
    case "AGENT_REVOKED":
      return "AgentRegistry";
    default:
      return "HCS";
  }
}

function getProtocolLogEventType(type: string) {
  switch (type) {
    case "EXECUTION_SUBMITTED":
      return "ExecutionSubmitted";
    case "VOTE_CAST":
      return "VoteSubmitted";
    case "EXECUTION_REACHED_CONSENSUS":
      return "ConsensusReached";
    case "EXECUTION_FINALIZED":
      return "ExecutionFinalized";
    case "VALIDATOR_REGISTERED":
      return "ValidatorRegistered";
    case "AGENT_REGISTERED":
      return "AgentRegistered";
    case "AGENT_REVOKED":
      return "AgentRevoked";
    default:
      return type || "HCS";
  }
}

function getProtocolLogEntity(payload: Record<string, unknown>) {
  switch (payload.type) {
    case "EXECUTION_SUBMITTED":
    case "VOTE_CAST":
    case "EXECUTION_REACHED_CONSENSUS":
    case "EXECUTION_FINALIZED":
      return `Execution #${payload.executionId ?? "?"}`;
    case "VALIDATOR_REGISTERED":
      return `Validator ${shortenAddress(String(payload.validator || ""))}`;
    case "AGENT_REGISTERED":
    case "AGENT_REVOKED":
      return `Agent #${payload.agentId ?? "?"}`;
    default:
      return "Protocol";
  }
}

function getProtocolLogOutcome(payload: Record<string, unknown>) {
  switch (payload.type) {
    case "EXECUTION_SUBMITTED":
      return "Submitted";
    case "VOTE_CAST":
      return String(payload.vote || "").toUpperCase() === "APPROVE" ? "Approved" : "Rejected";
    case "EXECUTION_REACHED_CONSENSUS":
      return String(payload.result || "").toUpperCase() === "APPROVED" ? "Accepted" : "Rejected";
    case "EXECUTION_FINALIZED":
      return String(payload.result || "").toUpperCase() === "APPROVED" ? "Accepted" : "Rejected";
    case "VALIDATOR_REGISTERED":
      return "Registered";
    case "AGENT_REGISTERED":
      return "Registered";
    case "AGENT_REVOKED":
      return "Revoked";
    default:
      return "Logged";
  }
}

function formatProtocolLogMessage(payload: Record<string, unknown>) {
  switch (payload.type) {
    case "EXECUTION_SUBMITTED":
      return `ExecutionSubmitted -> Execution #${payload.executionId} for Agent #${payload.agentId}`;
    case "VOTE_CAST":
      return `VoteCast -> Validator ${shortenAddress(String(payload.validator || ""))} ${String(payload.vote || "").toLowerCase()}d execution`;
    case "EXECUTION_REACHED_CONSENSUS":
      return `ConsensusReached -> Execution #${payload.executionId} ${String(payload.result || "").toLowerCase()}`;
    case "EXECUTION_FINALIZED":
      return `ExecutionFinalized -> Execution #${payload.executionId} ${String(payload.result || "").toLowerCase()}`;
    case "VALIDATOR_REGISTERED":
      return `ValidatorRegistered -> ${shortenAddress(String(payload.validator || ""))} joined validation`;
    case "AGENT_REGISTERED":
      return `AgentRegistered -> Agent #${payload.agentId} created`;
    case "AGENT_REVOKED":
      return `AgentRevoked -> Agent #${payload.agentId} revoked`;
    default:
      return String(payload.type || "Unknown protocol event");
  }
}

function formatMirrorTimestampLabel(timestamp?: string) {
  if (!timestamp) return "--:--:--";
  return formatConsensusTime(timestamp);
}

function mirrorTimestampToMillis(timestamp?: string) {
  if (!timestamp) return 0;
  const [secondsPart, nanosPart = "0"] = timestamp.split(".");
  return Number(secondsPart) * 1000 + Math.floor(Number(nanosPart.padEnd(9, "0").slice(0, 9)) / 1_000_000);
}

function shortTxHash(hash?: string) {
  if (!hash) return "tx";
  return `${hash.slice(0, 10)}...`;
}

async function fetchContractLogs(address: string, limit = 100) {
  const response = await fetch(
    `${getMirrorNodeBaseUrl()}/api/v1/contracts/${address}/results/logs?order=desc&limit=${limit}`,
  );

  if (!response.ok) {
    throw new Error(`Mirror Node request failed with ${response.status}`);
  }

  const payload = (await response.json()) as MirrorNodeLogResponse;
  return payload.logs ?? [];
}

function buildHistoryEntry(params: {
  id: string;
  txHash: string;
  source: ExecutionHistoryEntry["source"];
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
}): ExecutionHistoryEntry {
  return { ...params };
}

function outcomeColors(outcome: string) {
  const normalized = outcome.toLowerCase();
  if (normalized.includes("accepted") || normalized.includes("approved") || normalized.includes("staked")) {
    return "text-emerald-400";
  }
  if (normalized.includes("rejected") || normalized.includes("failed") || normalized.includes("slashed")) {
    return "text-red-400";
  }
  if (normalized.includes("pending") || normalized.includes("submitted") || normalized.includes("review")) {
    return "text-amber-400";
  }
  return "text-slate-300";
}

function normalizeIpfsUri(uri: string) {
  if (!uri.startsWith("ipfs://")) {
    return uri;
  }

  return `${getIpfsGatewayBaseUrl().replace(/\/+$/, "")}/ipfs/${uri.slice("ipfs://".length)}`;
}

async function fetchMetadata(metadataUri: string): Promise<AgentMetadata | null> {
  if (!metadataUri) {
    return null;
  }

  try {
    const response = await fetch(normalizeIpfsUri(metadataUri));
    if (!response.ok) {
      throw new Error(`Metadata fetch failed with ${response.status}`);
    }

    return (await response.json()) as AgentMetadata;
  } catch (error) {
    console.warn("Unable to load agent metadata", { metadataUri, error });
    return null;
  }
}

export async function fetchAgentExecutionMetadata(agentId: number): Promise<AgentExecutionMetadata> {
  const provider = getProvider();
  const agentRegistry = new Contract(
    getAgentRegistryAddress(),
    AGENT_REGISTRY_ABI,
    provider,
  );

  let agentRecord;
  try {
    agentRecord = await agentRegistry.getAgent(agentId);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("not registered")) {
      throw new Error("Agent metadata does not include a valid endpoint.");
    }
    throw new Error("Unable to load endpoint from agent metadata.");
  }
  const metadataUri = String(agentRecord.metadataURI ?? "").trim();

  if (!metadataUri) {
    throw new Error("Agent metadata URI is missing.");
  }

  const metadata = await fetchMetadata(metadataUri);
  let capabilities: Array<{
    name?: string;
    active?: boolean;
    expectedReasoning?: string;
    outputSchema?: string;
  }> = [];

  try {
    capabilities = await agentRegistry.getCapabilities(agentId);
  } catch {
    capabilities = [];
  }

  const primaryCapability = capabilities.find((capability) => capability?.active !== false) ?? capabilities[0];
  const endpoint = metadata?.endpoint?.trim() || metadata?.services?.[0]?.endpoint?.trim();

  if (!endpoint) {
    throw new Error("Agent metadata does not include a valid endpoint.");
  }

  return {
    metadataUri,
    endpoint,
    name: metadata?.name,
    description: metadata?.description,
    isDeterministic: Boolean(agentRecord.isDeterministic),
    capabilityName: primaryCapability?.name,
    expectedReasoning: primaryCapability?.expectedReasoning,
    outputSchema: primaryCapability?.outputSchema,
  };
}

export function normalizeDeterministicOutput(result: unknown): string {
  if (typeof result === "string") {
    return result.replace(/\s+/g, " ").trim().toLowerCase();
  }

  if (result === undefined) {
    return "";
  }

  return JSON.stringify(result).replace(/\s+/g, " ").trim().toLowerCase();
}

export function computeDeterministicBindingHash(
  input: string,
  normalizedOutput: string,
  agentId: number,
): string {
  if (!Number.isInteger(agentId) || agentId <= 0) {
    throw new Error("agentId must be a positive integer");
  }

  return keccak256(
    abiCoder.encode(
      ["string", "string", "uint256"],
      [input, normalizedOutput, BigInt(agentId)],
    ),
  );
}

export function computeReasoningHash(reasoning: string): string {
  const normalizedReasoning = reasoning.trim();
  if (!normalizedReasoning) {
    return ZERO_HASH;
  }

  return keccak256(toUtf8Bytes(normalizedReasoning));
}

function buildAgentBaseUrl(endpoint: string) {
  const normalizedEndpoint = endpoint.replace(/\/+$/, "");
  return normalizedEndpoint.endsWith("/agent/execute")
    ? normalizedEndpoint.slice(0, -"/agent/execute".length)
    : normalizedEndpoint;
}

export async function executeAgentTask(
  endpoint: string,
  prompt: string,
  agentId?: number,
): Promise<AgentExecutionResponse> {
  const baseUrl = buildAgentBaseUrl(endpoint);
  const url = `${baseUrl}/agent/execute`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(agentId ? { prompt, agentId } : { prompt }),
  });

  if (!response.ok) {
    throw new Error(`Agent execution failed with status ${response.status}`);
  }

  return (await response.json()) as AgentExecutionResponse;
}

export async function verifyWithBackend(endpoint: string, input: string, agentId: number): Promise<VerifierResponse> {
  const baseUrl = buildAgentBaseUrl(endpoint);
  const response = await fetch(`${baseUrl}/api/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input, agentId }),
  });

  if (!response.ok) {
    throw new Error(`Verifier request failed with status ${response.status}`);
  }

  return (await response.json()) as VerifierResponse;
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
  return Number(Math.max(1, Math.min(5, trustScore / 20)).toFixed(1));
}

function buildStars(rating: number) {
  const wholeStars = Math.floor(rating);
  return Array.from({ length: 5 }, (_, index) => index < wholeStars);
}

function buildHalfStar(rating: number) {
  return rating % 1 >= 0.5;
}

function getVisuals(agentId: number) {
  return gradients[(agentId - 1) % gradients.length];
}

async function fetchCapabilities(agentRegistry: Contract, agentId: number): Promise<AgentCapability[]> {
  const capabilities = await agentRegistry.getCapabilities(agentId);

  return capabilities.map((capability: {
    skillId?: bigint | number;
    name: string;
    description: string;
    domain: string;
    requiresUserAuthorization: boolean;
    active: boolean;
  }) => ({
    skillId: capability.skillId !== undefined ? Number(capability.skillId) : undefined,
    name: capability.name,
    active: capability.active,
    description: capability.description,
    domain: capability.domain,
    requiresUserAuthorization: capability.requiresUserAuthorization,
  }));
}

function normalizeCapabilityNames(
  metadataCapabilities: AgentMetadata["capabilities"],
  contractCapabilities: AgentCapability[],
) {
  if (metadataCapabilities?.length) {
    return metadataCapabilities.map((capability, index) => {
      if (typeof capability === "string") {
        return {
          skillId: contractCapabilities[index]?.skillId,
          name: capability,
          active: contractCapabilities[index]?.active ?? true,
        };
      }

      return {
        skillId: capability.skillId ?? contractCapabilities[index]?.skillId,
        name: capability.name || contractCapabilities[index]?.name || `Capability ${index + 1}`,
        active: capability.active ?? contractCapabilities[index]?.active ?? true,
      };
    });
  }

  return contractCapabilities;
}

export async function fetchAgentIds(): Promise<number[]> {
  const agentRegistryAddress = getAgentRegistryAddress();
  const logsUrl = `${getMirrorNodeBaseUrl()}/api/v1/contracts/${agentRegistryAddress}/results/logs?order=asc&limit=100`;
  const agentIds = new Set<number>();

  let nextUrl: string | null = logsUrl;

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`Mirror Node request failed with ${response.status}`);
    }

    const data = (await response.json()) as MirrorNodeLogResponse;

    for (const log of data.logs ?? []) {
      try {
        const parsed = eventInterface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (parsed?.name === "AgentRegistered") {
          agentIds.add(Number(parsed.args.agentId));
        }
      } catch {
        continue;
      }
    }

    nextUrl = data.links?.next ? `${getMirrorNodeBaseUrl()}${data.links.next}` : null;
  }

  return [...agentIds].sort((left, right) => left - right);
}

export async function getTrustScore(agentId: number) {
  const provider = getProvider();
  const reputationRegistry = new Contract(
    getReputationRegistryAddress(),
    REPUTATION_REGISTRY_ABI,
    provider,
  );

  const trustScore = await reputationRegistry.getTrustScore(agentId);
  return Number(trustScore);
}

export async function fetchAgents(): Promise<Agent[]> {
  const provider = getProvider();
  const agentRegistry = new Contract(
    getAgentRegistryAddress(),
    AGENT_REGISTRY_ABI,
    provider,
  );
  const reputationRegistry = new Contract(
    getReputationRegistryAddress(),
    REPUTATION_REGISTRY_ABI,
    provider,
  );

  const agentIds = await fetchAgentIds();

  const settledAgents = await Promise.allSettled(
    agentIds.map(async (agentId) => {
      const agentRecord = await agentRegistry.getAgent(agentId);

      const [contractCapabilities, trustScoreValue, metadata] = await Promise.all([
        fetchCapabilities(agentRegistry, agentId).catch(() => [] as AgentCapability[]),
        reputationRegistry.getTrustScore(agentId).catch(() => agentRecord.trustScore),
        fetchMetadata(agentRecord.metadataURI).catch(() => null),
      ]);

      const trustScore = Number(trustScoreValue ?? agentRecord.trustScore ?? 0);
      const riskLevel = Number(agentRecord.riskLevel);
      const normalizedCapabilities = normalizeCapabilityNames(metadata?.capabilities, contractCapabilities);
      const primaryDomain =
        metadata?.domain ||
        contractCapabilities.find((capability) => capability.domain)?.domain ||
        "General";
      const visuals = getVisuals(agentId);
      const rating = buildRating(trustScore);
      const riskColor = riskColors[riskLevel] ?? riskColors[riskColors.length - 1];
      const name =
        metadata?.name ||
        normalizedCapabilities[0]?.name?.replace(/Agent$/i, " Agent") ||
        `Registered Agent ${agentId}`;

      return {
        agentId,
        name,
        description:
          metadata?.description ||
          contractCapabilities[0]?.description ||
          "Registered on Hedera and available for trusted task execution.",
        domain: primaryDomain,
        riskLevel,
        riskLabel: riskLabels[riskLevel] ?? "Unknown Risk",
        riskColor,
        trustScore,
        capabilities: normalizedCapabilities,
        requiresUserAuthorization: contractCapabilities.some(
          (capability) => capability.requiresUserAuthorization,
        ),
        verified: agentRecord.isDeterministic ? "Consensus Verified" : "Live Agent",
        verifiedIcon: agentRecord.isDeterministic ? "verified" : "smart_toy",
        initials: buildInitials(name),
        type: primaryDomain,
        tags: normalizedCapabilities.slice(0, 2).map((capability) => capability.name),
        gradient: visuals.gradient,
        shadowColor: visuals.shadowColor,
        rating,
        stars: buildStars(rating),
        halfStar: buildHalfStar(rating),
      } satisfies Agent;
    }),
  );

  return settledAgents.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }

    console.warn("Unable to hydrate registered agent for Explore page", result.reason);
    return [];
  });
}

export async function voteOnExecution(executionId: number, approve: boolean) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    signer,
  );

  let tx;
  let receipt;
  try {
    tx = await validationRegistry.voteExecution(executionId, approve);
    receipt = await tx.wait();
  } catch (error) {
    throw new Error(formatDisplayError(error));
  }

  const execution = await validationRegistry.getExecution(executionId);

  return {
    hash: tx.hash as string,
    receipt,
    finalized: Boolean(execution.finalized),
    accepted: Boolean(execution.accepted),
    approvals: Number(execution.approvals),
    rejections: Number(execution.rejections),
  };
}

interface SubmitDeterministicExecutionParams {
  agentId: number;
  prompt: string;
  endpoint: string;
  parentExecutionId?: number;
  callerAgentId?: number;
  involvesExternalCall?: boolean;
  externalService?: string;
}

interface SubmitDeterministicExecutionHashParams {
  agentId: number;
  executionCommitment: string;
  reasoningHash?: string;
  isDeterministic?: boolean;
  parentExecutionId?: number;
  callerAgentId?: number;
  involvesExternalCall?: boolean;
  externalService?: string;
}

export async function submitDeterministicExecution({
  agentId,
  prompt,
  endpoint,
  parentExecutionId = 0,
  callerAgentId = 0,
  involvesExternalCall = false,
  externalService = "",
}: SubmitDeterministicExecutionParams) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw new Error("Prompt is required");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const execution = await executeAgentTask(endpoint, normalizedPrompt, agentId);
  const normalizedOutput = execution.normalizedOutput ?? normalizeDeterministicOutput(execution.result);
  const executionCommitment =
    execution.executionCommitment ??
    computeDeterministicBindingHash(normalizedPrompt, normalizedOutput, agentId);

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    signer,
  );

  let tx;
  let receipt;
  try {
    tx = await validationRegistry.submitExecution(
      agentId,
      parentExecutionId,
      callerAgentId,
      involvesExternalCall,
      externalService,
      executionCommitment,
      ZERO_HASH,
      true,
    );
    receipt = await tx.wait();
  } catch (error) {
    throw new Error(formatDisplayError(error));
  }

  let executionId: number | null = null;
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = validationEventInterface.parseLog(log);
      if (parsed?.name === "ExecutionSubmitted") {
        executionId = Number(parsed.args.executionId);
        break;
      }
    } catch {
      continue;
    }
  }

  return {
    hash: tx.hash as string,
    receipt,
    executionId,
    executionCommitment,
    normalizedOutput,
    output: execution.result,
  };
}

export async function submitDeterministicExecutionHash({
  agentId,
  executionCommitment,
  reasoningHash = ZERO_HASH,
  isDeterministic = true,
  parentExecutionId = 0,
  callerAgentId = 0,
  involvesExternalCall = false,
  externalService = "",
}: SubmitDeterministicExecutionHashParams) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  if (!executionCommitment || executionCommitment === ZERO_HASH) {
    throw new Error("Execution commitment is required");
  }

  if (!isDeterministic && (!reasoningHash || reasoningHash === ZERO_HASH)) {
    throw new Error("Reasoning hash is required for non-deterministic executions");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    signer,
  );

  let tx;
  let receipt;
  try {
    tx = await validationRegistry.submitExecution(
      agentId,
      parentExecutionId,
      callerAgentId,
      involvesExternalCall,
      externalService,
      executionCommitment,
      reasoningHash,
      isDeterministic,
    );
    receipt = await tx.wait();
  } catch (error) {
    throw new Error(formatDisplayError(error));
  }

  let executionId: number | null = null;
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = validationEventInterface.parseLog(log);
      if (parsed?.name === "ExecutionSubmitted") {
        executionId = Number(parsed.args.executionId);
        break;
      }
    } catch {
      continue;
    }
  }

  return {
    hash: tx.hash as string,
    receipt,
    executionId,
  };
}

export async function fetchExecutionStatus(executionId: number): Promise<ExecutionStatus> {
  const provider = getProvider();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    provider,
  );

  const execution = await validationRegistry.getExecution(executionId);

  return {
    executionId: Number(execution.executionId),
    agentId: Number(execution.agentId),
    parentExecutionId: Number(execution.parentExecutionId),
    callerAgentId: Number(execution.callerAgentId),
    involvesExternalCall: Boolean(execution.involvesExternalCall),
    externalService: String(execution.externalService ?? ""),
    reasoningHash: String(execution.reasoningHash),
    executionCommitment: String(execution.executionCommitment),
    executionHash: String(execution.executionHash),
    isDeterministic: Boolean(execution.isDeterministic),
    approvals: Number(execution.approvals),
    rejections: Number(execution.rejections),
    finalized: Boolean(execution.finalized),
    accepted: Boolean(execution.accepted),
    createdAt: Number(execution.createdAt),
  };
}

export async function verifyDeterministicExecution(executionId: number, expectedHash: string) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  if (!expectedHash || expectedHash === ZERO_HASH) {
    throw new Error("Expected hash is required");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    signer,
  );

  let tx;
  let receipt;
  try {
    tx = await validationRegistry.verifyDeterministicExecution(executionId, expectedHash);
    receipt = await tx.wait();
  } catch (error) {
    throw new Error(formatDisplayError(error));
  }
  let accepted: boolean | null = null;

  for (const log of receipt.logs ?? []) {
    try {
      const parsed = validationEventInterface.parseLog(log);
      if (parsed?.name === "DeterministicExecutionVerified") {
        accepted = Boolean(parsed.args.accepted);
        break;
      }
    } catch {
      continue;
    }
  }

  return {
    hash: tx.hash as string,
    receipt,
    accepted,
  };
}

export async function fetchConnectedValidatorProfile(): Promise<ValidatorProfile | null> {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    return null;
  }

  const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
  const account = accounts[0];
  if (!account) {
    return null;
  }

  const provider = getProvider();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    provider,
  );

  const normalizeValidatorTimestamps = (registeredAtValue: number, accuracyScoreValue: number) => {
    // Some deployed validator registries expose the final two fields in the opposite order.
    // If accuracy is impossible (>100) and the paired registeredAt looks like a score, swap them.
    if (accuracyScoreValue > 100 && registeredAtValue >= 0 && registeredAtValue <= 100) {
      return {
        registeredAt: accuracyScoreValue,
        accuracyScore: registeredAtValue,
      };
    }

    return {
      registeredAt: registeredAtValue,
      accuracyScore: accuracyScoreValue,
    };
  };

  try {
    const validator = await validationRegistry.validators(account);
    const normalized = normalizeValidatorTimestamps(
      Number(validator.registeredAt),
      Number(validator.accuracyScore),
    );

    return {
      address: account,
      validatorId: Number(validator.validatorId),
      isRegistered: Boolean(validator.isRegistered),
      active: Boolean(validator.active),
      stakedAmount: formatUnits(validator.stakedAmount, 8),
      validatorReputation: Number(validator.validatorReputation),
      registeredAt: normalized.registeredAt,
      accuracyScore: normalized.accuracyScore,
    };
  } catch {
    const legacyValidationRegistry = new Contract(
      getValidationRegistryAddress(),
      LEGACY_VALIDATION_REGISTRY_ABI,
      provider,
    );
    const validator = await legacyValidationRegistry.validators(account);
    const normalized = normalizeValidatorTimestamps(
      Number(validator.registeredAt),
      Number(validator.accuracyScore),
    );

    return {
      address: account,
      validatorId: 0,
      isRegistered: Boolean(validator.isRegistered),
      active: Boolean(validator.active),
      stakedAmount: formatUnits(validator.stakedAmount, 8),
      validatorReputation: Number(validator.validatorReputation),
      registeredAt: normalized.registeredAt,
      accuracyScore: normalized.accuracyScore,
    };
  }
}

export async function fetchValidatorStakeRequirement() {
  const provider = getProvider();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    provider,
  );

  const requirement = await validationRegistry.validatorStakeRequirement();
  return formatUnits(requirement, 8);
}

export async function registerValidator(stakeAmountInHbar: string) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  const normalized = stakeAmountInHbar.trim();
  if (!normalized || Number(normalized) <= 0) {
    throw new Error("Enter a valid HBAR amount");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    signer,
  );

  const requiredStake = await validationRegistry.validatorStakeRequirement();

  const tx = await validationRegistry.registerValidator({
    value: BigInt(requiredStake) * WEIBAR_PER_TINYBAR,
  });
  const receipt = await tx.wait();

  return {
    hash: tx.hash as string,
    receipt,
  };
}

export async function topUpValidatorStake(amountInHbar: string) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  const normalized = amountInHbar.trim();
  if (!normalized || Number(normalized) <= 0) {
    throw new Error("Enter a valid HBAR amount");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    signer,
  );

  const tx = await validationRegistry.topUpValidatorStake({
    value: parseUnits(normalized, 18),
  });
  const receipt = await tx.wait();

  return {
    hash: tx.hash as string,
    receipt,
  };
}

export async function unregisterValidator() {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const validationRegistry = new Contract(
    getValidationRegistryAddress(),
    VALIDATION_REGISTRY_ABI,
    signer,
  );

  const tx = await validationRegistry.unregisterValidator();
  const receipt = await tx.wait();

  return {
    hash: tx.hash as string,
    receipt,
  };
}


export async function authorizeAgentCapabilities(agentId: number, skillIds: number[]) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  const sanitizedSkillIds = skillIds
    .map((skillId) => Number(skillId))
    .filter((skillId) => Number.isInteger(skillId) && skillId >= 0 && (skillId <= 39 || skillId >= 100));

  if (sanitizedSkillIds.length === 0) {
    throw new Error("Select at least one capability");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const authorizationManager = new Contract(
    getAuthorizationManagerAddress(),
    AUTHORIZATION_MANAGER_ABI,
    signer,
  );

  const tx = await authorizationManager.authorizeAgent(agentId, sanitizedSkillIds);
  const receipt = await tx.wait();

  return {
    hash: tx.hash as string,
    receipt,
  };
}

export async function fetchAgentAuthorizationStatus(agentId: number, skillIds: number[]) {
  const requiredSkillIds = Array.from(
    new Set(
      skillIds
        .map((skillId) => Number(skillId))
        .filter((skillId) => Number.isInteger(skillId) && skillId >= 0),
    ),
  );

  if (requiredSkillIds.length === 0) {
    return {
      connected: false,
      account: null as string | null,
      requiredSkillIds: [],
      authorizedSkillIds: [],
      unauthorizedSkillIds: [],
      allAuthorized: true,
    };
  }

  const ethereum = getEthereumProvider();
  if (!ethereum) {
    return {
      connected: false,
      account: null as string | null,
      requiredSkillIds,
      authorizedSkillIds: [],
      unauthorizedSkillIds: requiredSkillIds,
      allAuthorized: false,
    };
  }

  const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
  const account = accounts[0] ?? null;

  if (!account) {
    return {
      connected: false,
      account: null as string | null,
      requiredSkillIds,
      authorizedSkillIds: [],
      unauthorizedSkillIds: requiredSkillIds,
      allAuthorized: false,
    };
  }

  const provider = new BrowserProvider(ethereum as never);
  const authorizationManager = new Contract(
    getAuthorizationManagerAddress(),
    AUTHORIZATION_MANAGER_ABI,
    provider,
  );

  const checks = await Promise.all(
    requiredSkillIds.map(async (skillId) => ({
      skillId,
      allowed: Boolean(await authorizationManager.checkPermission(account, agentId, skillId)),
    })),
  );

  const authorizedSkillIds = checks.filter((item) => item.allowed).map((item) => item.skillId);
  const unauthorizedSkillIds = checks.filter((item) => !item.allowed).map((item) => item.skillId);

  return {
    connected: true,
    account,
    requiredSkillIds,
    authorizedSkillIds,
    unauthorizedSkillIds,
    allAuthorized: unauthorizedSkillIds.length === 0,
  };
}

export async function revokeRegisteredAgent(agentId: number) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not available");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const agentRegistry = new Contract(
    getAgentRegistryAddress(),
    AGENT_REGISTRY_ABI,
    signer,
  );

  const tx = await agentRegistry.revokeAgent(agentId);
  const receipt = await tx.wait();

  return {
    hash: tx.hash as string,
    receipt,
  };
}

export async function submitAgentReview(agentId: number, rating: number, feedback: string) {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("No wallet found. Please install HashPack and refresh.");
  }

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(getReputationRegistryAddress(), REPUTATION_REGISTRY_ABI, signer);
  const tx = await contract.submitReview(agentId, rating, feedback);
  await tx.wait();
  return tx.hash as string;
}

export async function fetchProtocolLogs(limit = 12): Promise<ProtocolLogEntry[]> {
  const topicId = getValidationTopicId();
  const mergedEntries: Array<ProtocolLogEntry & { sortValue: number; dedupeKey: string }> = [];

  try {
    const validationLogs = await fetchContractLogs(getValidationRegistryAddress(), limit * 2);
    for (const [index, log] of validationLogs.entries()) {
      try {
        const parsed = validationEventInterface.parseLog({ topics: log.topics, data: log.data });
        if (!parsed) continue;

        const time = formatMirrorTimestampLabel(log.timestamp);
        const sortValue = mirrorTimestampToMillis(log.timestamp);
        const txHash = shortTxHash(log.transaction_hash);

        switch (parsed.name) {
          case "ExecutionSubmitted":
            mergedEntries.push({
              time,
              text: `ExecutionSubmitted -> Execution #${parsed.args.executionId.toString()} for Agent #${parsed.args.agentId.toString()}`,
              color: "text-blue-400",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "VoteSubmitted":
            mergedEntries.push({
              time,
              text: `VoteSubmitted -> Validator ${shortenAddress(String(parsed.args.validator))} ${parsed.args.approve ? "approved" : "rejected"} execution #${parsed.args.executionId.toString()}`,
              color: parsed.args.approve ? "text-emerald-400" : "text-red-400",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "ExecutionFinalized":
            mergedEntries.push({
              time,
              text: `ExecutionFinalized -> Execution #${parsed.args.executionId.toString()} ${parsed.args.accepted ? "accepted" : "rejected"} (${parsed.args.approvals.toString()}/${parsed.args.rejections.toString()})`,
              color: parsed.args.accepted ? "text-slate-300" : "text-red-300",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "DeterministicExecutionVerified":
            mergedEntries.push({
              time,
              text: `DeterministicExecutionVerified -> Execution #${parsed.args.executionId.toString()} ${parsed.args.accepted ? "accepted" : "rejected"}`,
              color: parsed.args.accepted ? "text-cyan-300" : "text-rose-300",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "ValidatorRegistered":
            mergedEntries.push({
              time,
              text: `ValidatorRegistered -> ${shortenAddress(String(parsed.args.validator))} joined as ${parsed.args.validatorId.toString()} with ${formatUnits(parsed.args.stakedAmount, 8)} HBAR`,
              color: "text-emerald-400",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "ValidatorStakeToppedUp":
            mergedEntries.push({
              time,
              text: `ValidatorStakeToppedUp -> ${shortenAddress(String(parsed.args.validator))} added ${formatUnits(parsed.args.amount, 8)} HBAR (total ${formatUnits(parsed.args.totalStake, 8)})`,
              color: "text-amber-300",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "ValidatorUnregistered":
            mergedEntries.push({
              time,
              text: `ValidatorUnregistered -> ${shortenAddress(String(parsed.args.validator))} refunded ${formatUnits(parsed.args.refundedAmount, 8)} HBAR`,
              color: "text-rose-300",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "ValidatorReputationUpdated":
            mergedEntries.push({
              time,
              text: `ValidatorReputationUpdated -> ${shortenAddress(String(parsed.args.validator))} ${parsed.args.oldReputation.toString()} -> ${parsed.args.newReputation.toString()}`,
              color: "text-violet-300",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "AgentRegistryUpdated":
            mergedEntries.push({
              time,
              text: `AgentRegistryUpdated -> ${shortenAddress(String(parsed.args.agentRegistry))} via ${txHash}`,
              color: "text-slate-400",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "ReputationRegistryUpdated":
            mergedEntries.push({
              time,
              text: `ReputationRegistryUpdated -> ${shortenAddress(String(parsed.args.reputationRegistry))} via ${txHash}`,
              color: "text-slate-400",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          case "ValidatorStakeRequirementUpdated":
            mergedEntries.push({
              time,
              text: `ValidatorStakeRequirementUpdated -> ${formatUnits(parsed.args.oldRequirement, 8)} -> ${formatUnits(parsed.args.newRequirement, 8)} HBAR`,
              color: "text-amber-400",
              sortValue,
              dedupeKey: `${log.transaction_hash ?? "tx"}-${index}-${parsed.name}`,
            });
            break;
          default:
            break;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Keep HCS-backed logs available even if contract log fetch fails.
  }

  if (topicId) {
    try {
      const response = await fetch(
        `${getMirrorNodeBaseUrl()}/api/v1/topics/${topicId}/messages?order=desc&limit=${limit}`,
      );

      if (!response.ok) {
        throw new Error(`Mirror Node topic request failed with ${response.status}`);
      }

      const data = (await response.json()) as MirrorNodeTopicMessagesResponse;
      for (const [index, message] of (data.messages || []).entries()) {
        try {
          const parsed = parseMirrorNodeMessage(message);
          mergedEntries.push({
            time: formatConsensusTime(parsed.consensusTimestamp),
            text: formatProtocolLogMessage(parsed.payload),
            color: getProtocolLogColor(String(parsed.payload.type || "")),
            eventType: getProtocolLogEventType(String(parsed.payload.type || "")),
            source: getProtocolLogSource(String(parsed.payload.type || "")),
            entity: getProtocolLogEntity(parsed.payload),
            outcome: getProtocolLogOutcome(parsed.payload),
            sequenceNumber: typeof parsed.sequenceNumber === "number" ? parsed.sequenceNumber : null,
            sortValue: mirrorTimestampToMillis(parsed.consensusTimestamp ?? undefined),
            dedupeKey: `topic-${parsed.consensusTimestamp ?? index}-${String(parsed.payload.type ?? "unknown")}`,
          });
        } catch {
          continue;
        }
      }
    } catch {
      if (mergedEntries.length === 0) {
        throw new Error("Unable to load protocol logs");
      }
    }
  }

  const seen = new Set<string>();

  return mergedEntries
    .sort((a, b) => b.sortValue - a.sortValue)
    .filter((entry) => {
      if (seen.has(entry.dedupeKey)) {
        return false;
      }
      seen.add(entry.dedupeKey);
      return true;
    })
    .slice(0, limit)
    .map(({ time, text, color }) => ({ time, text, color }));
}

export async function fetchExecutionHistory(limit = 50): Promise<ExecutionHistoryEntry[]> {
  const entries: ExecutionHistoryEntry[] = [];

  const [
    agentRegistryLogs,
    validationRegistryLogs,
    reputationRegistryLogs,
    stakingManagerLogs,
  ] = await Promise.all([
    (async () => {
      try {
        return await fetchContractLogs(getAgentRegistryAddress(), limit);
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        return await fetchContractLogs(getValidationRegistryAddress(), limit);
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        return await fetchContractLogs(getReputationRegistryAddress(), limit);
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        return await fetchContractLogs(getStakingManagerAddress(), limit);
      } catch {
        return [];
      }
    })(),
  ]);

  for (const [index, log] of agentRegistryLogs.entries()) {
    try {
      const parsed = eventInterface.parseLog({ topics: log.topics, data: log.data });
      if (!parsed) continue;

      const timestampLabel = formatMirrorTimestampLabel(log.timestamp);
      const timestampValue = mirrorTimestampToMillis(log.timestamp);
      const txHash = log.transaction_hash ?? "";

      switch (parsed.name) {
        case "AgentRegistered": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-agent-${index}`,
            txHash: shortTxHash(txHash),
            source: "AgentRegistry",
            eventType: "AgentRegistered",
            entity: `Agent #${agentId}`,
            eventClass: "AgentRegistry",
            eventColor: "text-blue-400",
            outcome: "Registered",
            outcomeColor: outcomeColors("registered"),
            timestampLabel,
            timestampValue,
            description: `Agent #${agentId} registered`,
            detailJson: JSON.stringify({ agentId, owner: parsed.args.owner }, null, 2),
          }));
          break;
        }
        case "AgentRevoked": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-revoke-${index}`,
            txHash: shortTxHash(txHash),
            source: "AgentRegistry",
            eventType: "AgentRevoked",
            entity: `Agent #${agentId}`,
            eventClass: "AgentRegistry",
            eventColor: "text-red-400",
            outcome: "Revoked",
            outcomeColor: outcomeColors("revoked"),
            timestampLabel,
            timestampValue,
            description: `Agent #${agentId} revoked`,
            detailJson: JSON.stringify({ agentId }, null, 2),
          }));
          break;
        }
        case "CapabilityChanged": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-cap-${index}`,
            txHash: shortTxHash(txHash),
            source: "AgentRegistry",
            eventType: "CapabilityChanged",
            entity: `Agent #${agentId}`,
            eventClass: "AgentRegistry",
            eventColor: "text-fuchsia-300",
            outcome: "Updated",
            outcomeColor: outcomeColors("updated"),
            timestampLabel,
            timestampValue,
            description: `Capability updated for Agent #${agentId}`,
            detailJson: JSON.stringify({ agentId, capability: parsed.args.capability }, null, 2),
          }));
          break;
        }
        case "TrustScoreUpdated": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-trust-${index}`,
            txHash: shortTxHash(txHash),
            source: "AgentRegistry",
            eventType: "TrustScoreUpdated",
            entity: `Agent #${agentId}`,
            eventClass: "AgentRegistry",
            eventColor: "text-amber-300",
            outcome: "Updated",
            outcomeColor: outcomeColors("updated"),
            timestampLabel,
            timestampValue,
            description: `Trust score updated for Agent #${agentId}`,
            detailJson: JSON.stringify({
              agentId,
              oldScore: parsed.args.oldScore?.toString?.(),
              newScore: parsed.args.newScore?.toString?.(),
            }, null, 2),
          }));
          break;
        }
        default:
          break;
      }
    } catch {
      continue;
    }
  }

  for (const [index, log] of validationRegistryLogs.entries()) {
    try {
      const parsed = validationEventInterface.parseLog({ topics: log.topics, data: log.data });
      if (!parsed) continue;

      const timestampLabel = formatMirrorTimestampLabel(log.timestamp);
      const timestampValue = mirrorTimestampToMillis(log.timestamp);
      const txHash = log.transaction_hash ?? "";

      switch (parsed.name) {
        case "ExecutionSubmitted": {
          const executionId = parsed.args.executionId.toString();
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-exec-${index}`,
            txHash: shortTxHash(txHash),
            source: "Validation",
            eventType: "ExecutionSubmitted",
            entity: `Execution #${executionId}`,
            eventClass: "Validation",
            eventColor: "text-blue-400",
            outcome: "Submitted",
            outcomeColor: outcomeColors("submitted"),
            timestampLabel,
            timestampValue,
            description: `Execution #${executionId} submitted for Agent #${agentId}`,
            detailJson: JSON.stringify({
              executionId,
              agentId,
              parentExecutionId: parsed.args.parentExecutionId?.toString?.(),
              callerAgentId: parsed.args.callerAgentId?.toString?.(),
              externalService: parsed.args.externalService,
            }, null, 2),
          }));
          break;
        }
        case "VoteSubmitted": {
          const executionId = parsed.args.executionId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-vote-${index}`,
            txHash: shortTxHash(txHash),
            source: "Validation",
            eventType: "VoteSubmitted",
            entity: `Execution #${executionId}`,
            eventClass: "Validation",
            eventColor: "text-emerald-400",
            outcome: parsed.args.approve ? "Approved" : "Rejected",
            outcomeColor: outcomeColors(parsed.args.approve ? "approved" : "rejected"),
            timestampLabel,
            timestampValue,
            description: `Validator vote ${parsed.args.approve ? "approved" : "rejected"} execution #${executionId}`,
            detailJson: JSON.stringify({
              executionId,
              validator: parsed.args.validator,
              approve: parsed.args.approve,
            }, null, 2),
          }));
          break;
        }
        case "ExecutionFinalized": {
          const executionId = parsed.args.executionId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-final-${index}`,
            txHash: shortTxHash(txHash),
            source: "Validation",
            eventType: "ExecutionFinalized",
            entity: `Execution #${executionId}`,
            eventClass: "Validation",
            eventColor: "text-amber-400",
            outcome: parsed.args.accepted ? "Accepted" : "Rejected",
            outcomeColor: outcomeColors(parsed.args.accepted ? "accepted" : "rejected"),
            timestampLabel,
            timestampValue,
            description: `Execution #${executionId} ${parsed.args.accepted ? "accepted" : "rejected"} by consensus`,
            detailJson: JSON.stringify({
              executionId,
              approvals: parsed.args.approvals?.toString?.(),
              rejections: parsed.args.rejections?.toString?.(),
            }, null, 2),
          }));
          break;
        }
        case "DeterministicExecutionVerified": {
          const executionId = parsed.args.executionId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-det-${index}`,
            txHash: shortTxHash(txHash),
            source: "Validation",
            eventType: "DeterministicExecutionVerified",
            entity: `Execution #${executionId}`,
            eventClass: "Validation",
            eventColor: "text-sky-300",
            outcome: parsed.args.accepted ? "Accepted" : "Rejected",
            outcomeColor: outcomeColors(parsed.args.accepted ? "accepted" : "rejected"),
            timestampLabel,
            timestampValue,
            description: `Deterministic execution #${executionId} ${parsed.args.accepted ? "accepted" : "rejected"}`,
            detailJson: JSON.stringify({ executionId, accepted: parsed.args.accepted }, null, 2),
          }));
          break;
        }
        case "ValidatorRegistered": {
          entries.push(buildHistoryEntry({
            id: `${txHash}-vreg-${index}`,
            txHash: shortTxHash(txHash),
            source: "Validation",
            eventType: "ValidatorRegistered",
            entity: shortenAddress(parsed.args.validator),
            eventClass: "Validation",
            eventColor: "text-cyan-300",
            outcome: "Registered",
            outcomeColor: outcomeColors("registered"),
            timestampLabel,
            timestampValue,
            description: `Validator ${shortenAddress(parsed.args.validator)} registered`,
            detailJson: JSON.stringify({ validator: parsed.args.validator, stakedAmount: parsed.args.stakedAmount?.toString?.() }, null, 2),
          }));
          break;
        }
        case "ValidatorStakeToppedUp": {
          entries.push(buildHistoryEntry({
            id: `${txHash}-vtop-${index}`,
            txHash: shortTxHash(txHash),
            source: "Validation",
            eventType: "ValidatorStakeToppedUp",
            entity: shortenAddress(parsed.args.validator),
            eventClass: "Validation",
            eventColor: "text-blue-300",
            outcome: "Staked",
            outcomeColor: outcomeColors("staked"),
            timestampLabel,
            timestampValue,
            description: `Validator ${shortenAddress(parsed.args.validator)} topped up stake`,
            detailJson: JSON.stringify({
              validator: parsed.args.validator,
              amount: parsed.args.amount?.toString?.(),
              totalStake: parsed.args.totalStake?.toString?.(),
            }, null, 2),
          }));
          break;
        }
        case "ValidatorUnregistered": {
          entries.push(buildHistoryEntry({
            id: `${txHash}-vunreg-${index}`,
            txHash: shortTxHash(txHash),
            source: "Validation",
            eventType: "ValidatorUnregistered",
            entity: shortenAddress(parsed.args.validator),
            eventClass: "Validation",
            eventColor: "text-rose-300",
            outcome: "Unregistered",
            outcomeColor: outcomeColors("unregistered"),
            timestampLabel,
            timestampValue,
            description: `Validator ${shortenAddress(parsed.args.validator)} unregistered`,
            detailJson: JSON.stringify({
              validator: parsed.args.validator,
              refundedAmount: parsed.args.refundedAmount?.toString?.(),
            }, null, 2),
          }));
          break;
        }
        case "ValidatorReputationUpdated": {
          entries.push(buildHistoryEntry({
            id: `${txHash}-vrep-${index}`,
            txHash: shortTxHash(txHash),
            source: "Validation",
            eventType: "ValidatorReputationUpdated",
            entity: shortenAddress(parsed.args.validator),
            eventClass: "Validation",
            eventColor: "text-fuchsia-300",
            outcome: "Updated",
            outcomeColor: outcomeColors("updated"),
            timestampLabel,
            timestampValue,
            description: `Validator reputation updated for ${shortenAddress(parsed.args.validator)}`,
            detailJson: JSON.stringify({
              validator: parsed.args.validator,
              oldReputation: parsed.args.oldReputation?.toString?.(),
              newReputation: parsed.args.newReputation?.toString?.(),
            }, null, 2),
          }));
          break;
        }
        default:
          break;
      }
    } catch {
      continue;
    }
  }

  for (const [index, log] of reputationRegistryLogs.entries()) {
    try {
      const parsed = reputationEventInterface.parseLog({ topics: log.topics, data: log.data });
      if (!parsed) continue;

      const timestampLabel = formatMirrorTimestampLabel(log.timestamp);
      const timestampValue = mirrorTimestampToMillis(log.timestamp);
      const txHash = log.transaction_hash ?? "";

      switch (parsed.name) {
        case "ReviewSubmitted": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-review-${index}`,
            txHash: shortTxHash(txHash),
            source: "Reputation",
            eventType: "ReviewSubmitted",
            entity: `Agent #${agentId}`,
            eventClass: "Reputation",
            eventColor: "text-cyan-300",
            outcome: "Reviewed",
            outcomeColor: outcomeColors("reviewed"),
            timestampLabel,
            timestampValue,
            description: `Review submitted for Agent #${agentId}`,
            detailJson: JSON.stringify({ agentId, rating: parsed.args.rating?.toString?.() }, null, 2),
          }));
          break;
        }
        case "TrustScoreUpdated": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-trustrep-${index}`,
            txHash: shortTxHash(txHash),
            source: "Reputation",
            eventType: "TrustScoreUpdated",
            entity: `Agent #${agentId}`,
            eventClass: "Reputation",
            eventColor: "text-amber-300",
            outcome: parsed.args.accepted ? "Accepted" : "Rejected",
            outcomeColor: outcomeColors(parsed.args.accepted ? "accepted" : "rejected"),
            timestampLabel,
            timestampValue,
            description: `Agent #${agentId} trust score updated`,
            detailJson: JSON.stringify({
              agentId,
              previousScore: parsed.args.previousScore?.toString?.(),
              newScore: parsed.args.newScore?.toString?.(),
              accepted: parsed.args.accepted,
            }, null, 2),
          }));
          break;
        }
        case "RatingReduced": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-rating-${index}`,
            txHash: shortTxHash(txHash),
            source: "Reputation",
            eventType: "RatingReduced",
            entity: `Agent #${agentId}`,
            eventClass: "Reputation",
            eventColor: "text-rose-300",
            outcome: "Reduced",
            outcomeColor: outcomeColors("reduced"),
            timestampLabel,
            timestampValue,
            description: `Rating reduced for Agent #${agentId}`,
            detailJson: JSON.stringify({
              agentId,
              previousRating: parsed.args.previousRating?.toString?.(),
              newRating: parsed.args.newRating?.toString?.(),
              reduction: parsed.args.reduction?.toString?.(),
            }, null, 2),
          }));
          break;
        }
        case "StakeSlashRequested": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-slash-${index}`,
            txHash: shortTxHash(txHash),
            source: "Reputation",
            eventType: "StakeSlashRequested",
            entity: `Agent #${agentId}`,
            eventClass: "Reputation",
            eventColor: "text-red-400",
            outcome: "Slash Requested",
            outcomeColor: outcomeColors("slashed"),
            timestampLabel,
            timestampValue,
            description: `Stake slashing requested for Agent #${agentId}`,
            detailJson: JSON.stringify({ agentId, penalty: parsed.args.penalty?.toString?.() }, null, 2),
          }));
          break;
        }
        default:
          break;
      }
    } catch {
      continue;
    }
  }

  for (const [index, log] of stakingManagerLogs.entries()) {
    try {
      const parsed = stakingEventInterface.parseLog({ topics: log.topics, data: log.data });
      if (!parsed) continue;

      const timestampLabel = formatMirrorTimestampLabel(log.timestamp);
      const timestampValue = mirrorTimestampToMillis(log.timestamp);
      const txHash = log.transaction_hash ?? "";

      switch (parsed.name) {
        case "Staked": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-stake-${index}`,
            txHash: shortTxHash(txHash),
            source: "Staking",
            eventType: "Staked",
            entity: `Agent #${agentId}`,
            eventClass: "Staking",
            eventColor: "text-emerald-300",
            outcome: "Staked",
            outcomeColor: outcomeColors("staked"),
            timestampLabel,
            timestampValue,
            description: `Stake added for Agent #${agentId}`,
            detailJson: JSON.stringify({
              agentId,
              amount: parsed.args.amount?.toString?.(),
              owner: parsed.args.owner,
            }, null, 2),
          }));
          break;
        }
        case "Unstaked": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-unstake-${index}`,
            txHash: shortTxHash(txHash),
            source: "Staking",
            eventType: "Unstaked",
            entity: `Agent #${agentId}`,
            eventClass: "Staking",
            eventColor: "text-amber-300",
            outcome: "Unstaked",
            outcomeColor: outcomeColors("unstaked"),
            timestampLabel,
            timestampValue,
            description: `Stake withdrawn for Agent #${agentId}`,
            detailJson: JSON.stringify({
              agentId,
              amount: parsed.args.amount?.toString?.(),
              owner: parsed.args.owner,
            }, null, 2),
          }));
          break;
        }
        case "Slashed": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-slash-${index}`,
            txHash: shortTxHash(txHash),
            source: "Staking",
            eventType: "Slashed",
            entity: `Agent #${agentId}`,
            eventClass: "Staking",
            eventColor: "text-red-400",
            outcome: "Slashed",
            outcomeColor: outcomeColors("slashed"),
            timestampLabel,
            timestampValue,
            description: `Stake slashed for Agent #${agentId}`,
            detailJson: JSON.stringify({
              agentId,
              amount: parsed.args.amount?.toString?.(),
            }, null, 2),
          }));
          break;
        }
        case "Liquidated": {
          const agentId = parsed.args.agentId.toString();
          entries.push(buildHistoryEntry({
            id: `${txHash}-liq-${index}`,
            txHash: shortTxHash(txHash),
            source: "Staking",
            eventType: "Liquidated",
            entity: `Agent #${agentId}`,
            eventClass: "Staking",
            eventColor: "text-rose-300",
            outcome: "Liquidated",
            outcomeColor: outcomeColors("liquidated"),
            timestampLabel,
            timestampValue,
            description: `Agent #${agentId} liquidated`,
            detailJson: JSON.stringify({
              agentId,
              bonusReceiver: parsed.args.bonusReceiver,
              bonusAmount: parsed.args.bonusAmount?.toString?.(),
              seizedAmount: parsed.args.seizedAmount?.toString?.(),
            }, null, 2),
          }));
          break;
        }
        default:
          break;
      }
    } catch {
      continue;
    }
  }

  return entries.sort((a, b) => b.timestampValue - a.timestampValue).slice(0, limit);
}

export async function fetchExecutionAuditTrail(entry: ExecutionHistoryEntry): Promise<ExecutionAuditTrail | null> {
  const topicId = getValidationTopicId();
  if (!topicId) {
    return null;
  }

  const response = await fetch(
    `${getMirrorNodeBaseUrl()}/api/v1/topics/${topicId}/messages?order=desc&limit=100`,
  );

  if (!response.ok) {
    throw new Error(`Mirror Node topic request failed with ${response.status}`);
  }

  const data = (await response.json()) as MirrorNodeTopicMessagesResponse;

  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(entry.detailJson) as Record<string, unknown>;
  } catch {
    detail = {};
  }

  const executionId = String(
    detail.executionId ??
    entry.entity.match(/#(\d+)/)?.[1] ??
    "",
  );
  const agentId = String(
    detail.agentId ??
    entry.description.match(/Agent #(\d+)/)?.[1] ??
    entry.entity.match(/#(\d+)/)?.[1] ??
    "",
  );
  const validator = String(detail.validator ?? "");

  const matched = (data.messages || []).find((message) => {
    try {
      const parsed = parseMirrorNodeMessage(message);
      const payload = parsed.payload;
      const payloadType = String(payload.type || "");

      if (executionId && String(payload.executionId ?? "") === executionId) {
        return true;
      }

      if (
        agentId &&
        String(payload.agentId ?? "") === agentId &&
        ["AGENT_REGISTERED", "AGENT_REVOKED"].includes(payloadType)
      ) {
        return true;
      }

      if (
        validator &&
        String(payload.validator ?? "").toLowerCase() === validator.toLowerCase() &&
        payloadType === "VALIDATOR_REGISTERED"
      ) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  });

  if (!matched) {
    return null;
  }

  const parsed = parseMirrorNodeMessage(matched);
  return {
    topicId,
    consensusTimestamp: parsed.consensusTimestamp,
    sequenceNumber: typeof parsed.sequenceNumber === "number" ? parsed.sequenceNumber : null,
    payerAccountId: parsed.payerAccountId,
    runningHash: parsed.runningHash,
    payload: parsed.payload,
  };
}

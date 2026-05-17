import { BrowserProvider, Contract } from "ethers";

export type AgentDashboardData = {
  walletAddress: string;
  name: string;
  description: string;
  capabilities: string[];
  metadataHash: string;
  trustScore: number;
  interactionCount: number;
  exists: boolean;
};

export type MemoryLogRecord = {
  id: string;
  agentAddress: string;
  agentName: string;
  task: string;
  result: unknown;
  status: "success" | "failure";
  timestamp: string;
  trustScoreBefore: number;
  trustScoreAfter: number;
  storageHash: string;
  storageTxSeq?: number;
  uploadMode: string;
  txHash: string;
};

const AGENT_REGISTRY_ABI = [
  "function registerAgent(string agentId,string name,string description,string capabilities,string metadataHash)",
  "function updateMetadataHash(address agent,string metadataHash)",
  "function getAgent(address agent) view returns (tuple(string agentId,string name,string description,string capabilities,string metadataHash,uint256 trustScore,uint8 riskLevel,bool isDeterministic,uint256 stakeAmount,bool exists,bool revoked))",
  "function getAgentByOwner(address owner) view returns (tuple(string agentId,string name,string description,string capabilities,string metadataHash,uint256 trustScore,uint8 riskLevel,bool isDeterministic,uint256 stakeAmount,bool exists,bool revoked))",
] as const;

const TRUST_MANAGER_ABI = [
  "function recordInteraction(address agent,string storageHash,bool success)",
  "function getTrustScore(address agent) view returns (uint256)",
  "function getInteractionCount(address agent) view returns (uint256)",
] as const;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

function getEthereumProvider() {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

function getEnv(name: keyof ImportMetaEnv) {
  return import.meta.env[name]?.trim() ?? "";
}

function parseCapabilities(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function requireWallet() {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error("No injected wallet was found. Install MetaMask or another EVM wallet.");
  }

  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts[0]) {
    throw new Error("No wallet account is connected.");
  }

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();

  return {
    address: accounts[0],
    provider,
    signer,
  };
}

function getAgentRegistryAddress() {
  const address = getEnv("VITE_AGENT_REGISTRY_ADDRESS");
  if (!address) throw new Error("Missing VITE_AGENT_REGISTRY_ADDRESS");
  return address;
}

function getTrustManagerAddress() {
  const address = getEnv("VITE_TRUST_MANAGER_ADDRESS");
  if (!address) throw new Error("Missing VITE_TRUST_MANAGER_ADDRESS");
  return address;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || `Request failed: ${response.status}`);
  }

  return payload as T;
}

export async function registerAgent(input: {
  name: string;
  description: string;
  capabilities: string[];
}) {
  const wallet = await requireWallet();
  const metadata = {
    name: input.name,
    description: input.description,
    capabilities: input.capabilities,
    walletAddress: wallet.address,
    createdAt: new Date().toISOString(),
    framework: "TrustLayer on 0G",
  };

  const upload = await postJson<{
    storageHash: string;
    uploadMode: string;
  }>("/api/memory/upload", {
    kind: "agent-profile",
    memory: metadata,
  });

  const registry = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, wallet.signer);
  const agentId = `${input.name.toLowerCase().replace(/\s+/g, "-")}-${wallet.address.slice(2, 8)}`;
  const tx = await registry.registerAgent(
    agentId,
    input.name,
    input.description,
    input.capabilities.join(","),
    upload.storageHash,
  );
  await tx.wait();

  return {
    metadataHash: upload.storageHash,
    txHash: tx.hash,
    uploadMode: upload.uploadMode,
  };
}

export async function fetchAgentDashboard(): Promise<AgentDashboardData> {
  const wallet = await requireWallet();
  const registry = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, wallet.provider);
  const trust = new Contract(getTrustManagerAddress(), TRUST_MANAGER_ABI, wallet.provider);
  const agent = await registry.getAgentByOwner(wallet.address);
  const interactionCount = agent.exists ? Number(await trust.getInteractionCount(wallet.address)) : 0;
  const trustScore = agent.exists ? Number(await trust.getTrustScore(wallet.address)) : Number(agent.trustScore || 0);

  return {
    walletAddress: wallet.address,
    name: agent.name || "Unregistered Agent",
    description: agent.description || "Register this wallet to initialize the 0G-native agent profile.",
    capabilities: parseCapabilities(agent.capabilities || ""),
    metadataHash: agent.metadataHash || "",
    trustScore,
    interactionCount,
    exists: Boolean(agent.exists),
  };
}

export async function fetchMemoryHistory(agentAddress: string) {
  const url = new URL("/api/memory/history", window.location.origin);
  if (agentAddress) {
    url.searchParams.set("agentAddress", agentAddress);
  }
  const response = await fetch(url.toString());
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || "Unable to load history.");
  }
  return payload.records as MemoryLogRecord[];
}

export async function executeAgentTask({
  prompt,
  agent,
}: {
  prompt: string;
  agent: AgentDashboardData;
}) {
  const wallet = await requireWallet();
  const trust = new Contract(getTrustManagerAddress(), TRUST_MANAGER_ABI, wallet.signer);
  const trustBefore = Number(await trust.getTrustScore(wallet.address));

  const execution = await postJson<{
    result: unknown;
    summary: string;
    status: "success" | "failure";
  }>("/api/agent/execute", {
    prompt,
    agentId: agent.walletAddress,
    agentName: agent.name,
    capabilities: agent.capabilities,
  });

  const projectedTrustAfter = Math.max(0, Math.min(100, trustBefore + (execution.status === "success" ? 5 : -3)));
  const memoryPayload = {
    agentId: agent.walletAddress,
    agentName: agent.name,
    task: prompt,
    result: execution.result,
    summary: execution.summary,
    trustScoreBefore: trustBefore,
    trustScoreAfter: projectedTrustAfter,
    timestamp: Date.now(),
    status: execution.status,
  };

  const upload = await postJson<{
    storageHash: string;
    uploadMode: string;
    storageTxSeq?: number;
    txSeq?: number;
  }>("/api/memory/upload", {
    kind: "execution-memory",
    memory: memoryPayload,
  });

  const tx = await trust.recordInteraction(wallet.address, upload.storageHash, execution.status === "success");
  await tx.wait();
  const trustAfter = Number(await trust.getTrustScore(wallet.address));

  const record = await postJson<{ record: MemoryLogRecord }>("/api/memory/log", {
    record: {
      agentAddress: wallet.address,
      agentName: agent.name,
      task: prompt,
      result: execution.result,
      status: execution.status,
      timestamp: new Date().toISOString(),
      trustScoreBefore: trustBefore,
      trustScoreAfter: trustAfter,
      storageHash: upload.storageHash,
      storageTxSeq: upload.storageTxSeq ?? upload.txSeq,
      uploadMode: upload.uploadMode,
      txHash: tx.hash,
    },
  });

  return record.record;
}

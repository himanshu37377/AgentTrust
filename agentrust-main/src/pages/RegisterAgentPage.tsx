import { BrowserProvider, Contract, JsonRpcProvider, formatEther } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { fetchProtocolLogs } from "@/lib/zerog-runtime";

const AGENT_REGISTRY_ABI = [
  "event AgentRegistered(address indexed agent,string indexed agentId,string metadataHash,uint8 riskLevel,bool isDeterministic)",
  "event MetadataHashUpdated(address indexed agent,string previousHash,string newHash)",
  "event TrustScoreUpdated(address indexed agent,uint256 previousScore,uint256 newScore)",
  "event AgentRevoked(address indexed agent)",
  "function registerAgentWithProfile(string agentId,string name,string description,string capabilities,string metadataHash,uint8 riskLevel,bool isDeterministic) payable",
  "function getAgent(address agent) view returns (tuple(string agentId,string name,string description,string capabilities,string metadataHash,uint256 trustScore,uint8 riskLevel,bool isDeterministic,uint256 stakeAmount,bool exists,bool revoked))",
] as const;

const STAKING_MANAGER_ABI = [
  "function quoteStake(uint8 riskLevel) view returns (uint256)",
] as const;

type RiskLevel = "low" | "medium" | "high";
type ExecutionMode = "deterministic" | "non-deterministic";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

type AgentMetadataDocument = {
  agentId: string;
  wallet: string;
  name: string;
  description: string;
  endpoint: string;
  capabilities: string[];
  verificationProfile: {
    executionMode: ExecutionMode;
    riskLevel: RiskLevel;
    provenanceModel: "observed-confirmed-inferred";
    orchestration: "OpenClaw-compatible";
  };
  economicProfile: {
    stakeRequirement: string;
    trustSource: string[];
  };
  storageProfile: {
    metadataLayer: "0G Storage";
    memoryLayer: "0G Storage";
    trustAnchoring: "0G Chain";
  };
  createdAt: string;
};

type UploadMetadataResponse = {
  cid: string;
  metadataURI: string;
  storageHash?: string;
  uploadMode?: string;
};

type ProtocolLog = {
  id: string;
  time: string;
  label: string;
  description: string;
  colorClass: string;
  sortValue?: number;
};

const riskLevelMap: Record<RiskLevel, 0 | 1 | 2> = {
  low: 0,
  medium: 1,
  high: 2,
};

const riskOptions = [
  { key: "low" as const, label: "Low Risk" },
  { key: "medium" as const, label: "Medium Risk" },
  { key: "high" as const, label: "High Risk" },
];

const execModeOptions = [
  { key: "deterministic" as const, label: "Deterministic" },
  { key: "non-deterministic" as const, label: "Reasoning" },
];

function getEthereumProvider() {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

function getRpcProvider() {
  const rpcUrl = import.meta.env.VITE_ZEROG_RPC_URL?.trim();
  if (!rpcUrl) {
    throw new Error("Missing VITE_ZEROG_RPC_URL");
  }

  return new JsonRpcProvider(rpcUrl);
}

function getAgentRegistryAddress() {
  const address = import.meta.env.VITE_AGENT_REGISTRY_ADDRESS?.trim();
  if (!address) {
    throw new Error("Missing VITE_AGENT_REGISTRY_ADDRESS");
  }

  return address;
}

function getStakingManagerAddress() {
  return import.meta.env.VITE_STAKING_MANAGER_ADDRESS?.trim() || "";
}

function getMetadataUploadUrl() {
  const configuredUrl = import.meta.env.VITE_METADATA_UPLOAD_URL?.trim();
  if (!configuredUrl) {
    return "/metadata/upload";
  }

  return configuredUrl;
}

function formatAmount(value: bigint) {
  const amount = Number(formatEther(value));
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString(undefined, {
    maximumFractionDigits: amount > 0 && amount < 1 ? 4 : 2,
  });
}

function buildAgentId(name: string, wallet: string) {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "agent"}-${wallet.slice(2, 8).toLowerCase()}`;
}

function parseCapabilities(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function switchToZeroGNetwork(ethereum: EthereumProvider) {
  const chainId = import.meta.env.VITE_ZEROG_CHAIN_ID;
  const rpcUrl = import.meta.env.VITE_ZEROG_RPC_URL;
  if (!chainId || !rpcUrl) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (switchError) {
    const errorCode =
      typeof switchError === "object" && switchError && "code" in switchError
        ? Number(switchError.code)
        : 0;

    if (errorCode !== 4902) {
      throw switchError;
    }

    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: import.meta.env.VITE_ZEROG_NETWORK_NAME || "0G Galileo Testnet",
        nativeCurrency: {
          name: "OG",
          symbol: "OG",
          decimals: 18,
        },
        rpcUrls: [rpcUrl],
        blockExplorerUrls: import.meta.env.VITE_ZEROG_BLOCK_EXPLORER_URL
          ? [import.meta.env.VITE_ZEROG_BLOCK_EXPLORER_URL]
          : undefined,
      }],
    });
  }
}

function getReadableError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function RegisterAgentPage() {
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [capabilityName, setCapabilityName] = useState("");
  const [capabilityTags, setCapabilityTags] = useState("analysis, verification");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [execMode, setExecMode] = useState<ExecutionMode>("deterministic");
  const [requiredStake, setRequiredStake] = useState<bigint>(0n);
  const [stakeOptions, setStakeOptions] = useState<Record<RiskLevel, bigint>>({
    low: 0n,
    medium: 0n,
    high: 0n,
  });
  const [isLoadingStake, setIsLoadingStake] = useState(false);
  const [generatedMetadata, setGeneratedMetadata] = useState<AgentMetadataDocument | null>(null);
  const [generatedMetadataHash, setGeneratedMetadataHash] = useState("");
  const [generatedCid, setGeneratedCid] = useState("");
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [protocolLogs, setProtocolLogs] = useState<ProtocolLog[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadStakeRequirements() {
      setIsLoadingStake(true);
      try {
        const provider = getRpcProvider();
        const stakingAddress = getStakingManagerAddress();
        const staking = stakingAddress
          ? new Contract(stakingAddress, STAKING_MANAGER_ABI, provider)
          : null;

        const nextStakeOptions = staking
          ? {
              low: BigInt(await staking.quoteStake(riskLevelMap.low)),
              medium: BigInt(await staking.quoteStake(riskLevelMap.medium)),
              high: BigInt(await staking.quoteStake(riskLevelMap.high)),
            }
          : { low: 0n, medium: 0n, high: 0n };

        if (!cancelled) {
          setStakeOptions(nextStakeOptions);
          setRequiredStake(nextStakeOptions[riskLevel]);
        }
      } catch {
        if (!cancelled) {
          setStakeOptions({ low: 0n, medium: 0n, high: 0n });
          setRequiredStake(0n);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStake(false);
        }
      }
    }

    void loadStakeRequirements();
    return () => {
      cancelled = true;
    };
  }, [riskLevel]);

  useEffect(() => {
    let cancelled = false;

    async function loadProtocolLogs() {
      try {
        const logs = await fetchProtocolLogs(20);
        const mapped = logs.map((log, index) => ({
          id: `${log.eventType || "protocol"}-${log.time}-${index}`,
          time: log.time,
          label: log.eventType || "ProtocolEvent",
          description: log.text,
          colorClass: log.color,
          sortValue: 20 - index,
        }));

        if (!cancelled) {
          setProtocolLogs(mapped);
        }
      } catch {
        if (!cancelled) {
          setProtocolLogs([]);
        }
      }
    }

    void loadProtocolLogs();
    const intervalId = window.setInterval(() => {
      void loadProtocolLogs();
    }, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const metadataReady = generatedMetadataHash.trim().length > 0;
  const registrationReady =
    agentName.trim().length > 0 &&
    agentDescription.trim().length > 0 &&
    parseCapabilities(capabilityTags).length > 0 &&
    capabilityName.trim().length > 0 &&
    metadataReady;

  const requiredStakeLabel = isLoadingStake ? "Loading..." : `${formatAmount(requiredStake)} OG`;

  const buildMetadata = (wallet: string): AgentMetadataDocument => {
    const derivedAgentId = buildAgentId(agentName, wallet);
    return {
      agentId: derivedAgentId,
      wallet,
      name: agentName.trim(),
      description: agentDescription.trim(),
      endpoint: endpoint.trim(),
      capabilities: Array.from(new Set([capabilityName.trim(), ...parseCapabilities(capabilityTags)])),
      verificationProfile: {
        executionMode: execMode,
        riskLevel,
        provenanceModel: "observed-confirmed-inferred",
        orchestration: "OpenClaw-compatible",
      },
      economicProfile: {
        stakeRequirement: requiredStakeLabel,
        trustSource: [
          "behavioral reliability",
          "deterministic correctness",
          "validator accountability",
          "provenance memory",
        ],
      },
      storageProfile: {
        metadataLayer: "0G Storage",
        memoryLayer: "0G Storage",
        trustAnchoring: "0G Chain",
      },
      createdAt: new Date().toISOString(),
    };
  };

  const generateMetadata = async () => {
    if (!agentName.trim() || !agentDescription.trim() || !capabilityName.trim()) {
      toast({
        title: "Incomplete profile",
        description: "Add name, description, and at least one primary capability before generating metadata.",
        variant: "destructive",
      });
      return;
    }

    const ethereum = getEthereumProvider();
    if (!ethereum) {
      toast({
        title: "MetaMask required",
        description: "Install MetaMask to generate a wallet-bound 0G agent profile.",
      });
      return;
    }

    setIsGeneratingMetadata(true);
    try {
      await switchToZeroGNetwork(ethereum);
      await ethereum.request({ method: "eth_requestAccounts" });

      const provider = new BrowserProvider(ethereum as never);
      const signer = await provider.getSigner();
      const wallet = await signer.getAddress();
      const metadata = buildMetadata(wallet);
      setGeneratedMetadata(metadata);

      const response = await fetch(getMetadataUploadUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metadata }),
      });

      const payload = await response.json() as UploadMetadataResponse & { error?: string; details?: string };
      if (!response.ok) {
        throw new Error(payload.details || payload.error || `Metadata upload failed with ${response.status}`);
      }

      const rootHash = payload.storageHash || payload.metadataURI || payload.cid;
      if (!rootHash) {
        throw new Error("0G metadata upload did not return a storage root.");
      }

      setGeneratedMetadataHash(rootHash);
      setGeneratedCid(payload.cid || rootHash);
      toast({
        title: "Metadata stored on 0G",
        description: `0G storage root: ${rootHash.slice(0, 18)}...`,
      });
    } catch (error) {
      toast({
        title: "Metadata generation failed",
        description: getReadableError(error),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingMetadata(false);
    }
  };

  const registerAgent = async () => {
    if (!registrationReady || !generatedMetadata) {
      toast({
        title: "Registration locked",
        description: "Generate the 0G metadata root before registering this wallet as an agent.",
        variant: "destructive",
      });
      return;
    }

    const ethereum = getEthereumProvider();
    if (!ethereum) {
      toast({
        title: "MetaMask required",
        description: "Install MetaMask to sign the 0G agent registration transaction.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await switchToZeroGNetwork(ethereum);
      await ethereum.request({ method: "eth_requestAccounts" });

      const provider = new BrowserProvider(ethereum as never);
      const signer = await provider.getSigner();
      const registry = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, signer);
      const tx = await registry.registerAgentWithProfile(
        generatedMetadata.agentId,
        generatedMetadata.name,
        generatedMetadata.description,
        generatedMetadata.capabilities.join(", "),
        generatedMetadataHash,
        riskLevelMap[riskLevel],
        execMode === "deterministic",
        { value: requiredStake },
      );

      await tx.wait();
      toast({
        title: "Agent registered",
        description: `Wallet-bound 0G agent profile confirmed. Tx: ${tx.hash.slice(0, 10)}...`,
      });
    } catch (error) {
      toast({
        title: "Registration failed",
        description: getReadableError(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 bg-gradient-animate">
      <header className="pt-16 pb-12">
        <h1 className="text-[48px] font-bold tracking-tight leading-tight text-white">
          Register a <span className="bg-clip-text text-transparent bg-gradient-to-r from-trust-blue to-trust-purple">0G Agent Profile</span>
        </h1>
        <p className="max-w-3xl text-lg leading-relaxed mt-4 text-[#c2c5d0]">
          AgentTrust now uses lightweight wallet-based identity. Build an agent profile, store all metadata in 0G Storage, and anchor the resulting root on 0G Chain.
        </p>
      </header>

      {isMetadataModalOpen && generatedMetadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setIsMetadataModalOpen(false)}>
          <div className="absolute inset-0 bg-[rgba(3,7,18,0.72)] backdrop-blur-xl" />
          <section
            className="relative z-10 w-full max-w-4xl overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(8,18,34,0.97),rgba(6,12,25,0.98))] shadow-[0_30px_80px_rgba(14,165,233,0.12)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">0G Metadata Preview</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Wallet-bound Agent Profile</h3>
              </div>
              <button
                onClick={() => setIsMetadataModalOpen(false)}
                className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>
            <div className="max-h-[70vh] overflow-auto p-6">
              <pre className="rounded-[20px] border border-white/10 bg-[#06101d] p-5 text-xs leading-6 text-cyan-200">{JSON.stringify(generatedMetadata, null, 2)}</pre>
            </div>
          </section>
        </div>
      )}

      <main className="pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <section className="lg:col-span-9 space-y-8">
            <div className="glass-effect rounded-[22px] p-7 border border-white/10 shadow-[0_24px_70px_rgba(4,10,25,0.34)]">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-trust-blue flex items-center justify-center font-bold text-sm text-white">1</span>
                <div>
                  <h2 className="text-[20px] font-semibold text-white">Wallet-Based Identity</h2>
                  <p className="text-sm text-slate-500">A lightweight wallet-based 0G agent profile for verification and trust workflows.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Agent Name</label>
                  <input
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-trust-blue outline-none"
                    placeholder="e.g. Trust Router"
                    value={agentName}
                    onChange={(event) => setAgentName(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Description</label>
                <textarea
                  className="h-[84px] w-full resize-none bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-trust-blue outline-none"
                  placeholder="Describe how this agent participates in hybrid verification, trust, or orchestration."
                  value={agentDescription}
                  onChange={(event) => setAgentDescription(event.target.value)}
                />
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Primary Capability</label>
                  <input
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-trust-blue outline-none"
                    placeholder="e.g. reasoning-verification"
                    value={capabilityName}
                    onChange={(event) => setCapabilityName(event.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Endpoint</label>
                  <input
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-trust-blue outline-none"
                    placeholder="/agent/execute"
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Capabilities (comma-separated)</label>
                <input
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-trust-blue outline-none"
                  placeholder="analysis, memory, validator-selection"
                  value={capabilityTags}
                  onChange={(event) => setCapabilityTags(event.target.value)}
                />
              </div>
            </div>

            <div className="glass-effect rounded-[22px] p-7 border border-white/10 shadow-[0_24px_70px_rgba(4,10,25,0.34)]">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-trust-blue flex items-center justify-center font-bold text-sm text-white">2</span>
                <div>
                  <h2 className="text-[20px] font-semibold text-white">Verification Profile</h2>
                  <p className="text-sm text-slate-500">Define how this agent behaves inside the hybrid verification and trust pipeline.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Execution Mode</label>
                <div className="flex bg-black/40 p-1 rounded-[12px] border border-slate-700/50">
                  {execModeOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setExecMode(option.key)}
                      className={`flex-1 py-2 text-xs font-bold rounded-[8px] transition-all ${execMode === option.key ? "bg-gradient-to-r from-trust-blue to-trust-purple text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]" : "text-slate-500 hover:text-slate-300"}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-slate-400 mb-2">Risk Level</label>
                <div className="grid grid-cols-3 gap-3">
                  {riskOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setRiskLevel(option.key)}
                      className={`h-[84px] rounded-xl border text-center transition-all hover:-translate-y-0.5 ${riskLevel === option.key ? "border-trust-blue-glow bg-trust-blue/10 shadow-[0_0_15px_rgba(91,140,255,0.3)]" : "border-slate-700 hover:border-slate-500 bg-transparent"}`}
                    >
                      <p className={`pt-3 text-[11px] font-bold uppercase tracking-wider mb-1 ${riskLevel === option.key ? "text-trust-blue" : "text-slate-400"}`}>{option.label}</p>
                      <p className="text-xs text-slate-300 font-semibold">{formatAmount(stakeOptions[option.key])} OG</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={`glass-effect rounded-[22px] p-7 border transition-all duration-300 ${metadataReady ? "border-emerald-400/35 shadow-[0_0_32px_rgba(16,185,129,0.14)]" : "border-white/10 shadow-[0_24px_70px_rgba(4,10,25,0.34)]"}`}>
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-trust-blue flex items-center justify-center font-bold text-sm text-white">3</span>
                <div>
                  <h2 className="text-[20px] font-semibold text-white">0G Metadata Storage</h2>
                  <p className="text-sm text-slate-500">Agent metadata is stored in 0G Storage and reused as the profile root across the trust system.</p>
                </div>
              </div>

              <div className="rounded-[16px] border border-white/10 bg-slate-950/35 p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {metadataReady ? "Metadata stored on 0G Storage" : "Metadata not generated"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 break-all">
                      {metadataReady ? generatedMetadataHash : "Generate metadata to produce the wallet-bound 0G storage root."}
                    </p>
                  </div>
                  {generatedCid && (
                    <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                      CID / Root: {generatedCid.slice(0, 18)}...
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={generateMetadata}
                    disabled={isGeneratingMetadata}
                    className="h-[48px] rounded-[14px] bg-vibrant-gradient px-6 text-sm font-bold text-white shadow-[0_8px_25px_-5px_rgba(111,140,255,0.4)] disabled:opacity-60"
                  >
                    {isGeneratingMetadata ? "Generating Metadata..." : "Generate 0G Metadata"}
                  </button>
                  <button
                    onClick={() => setIsMetadataModalOpen(true)}
                    disabled={!generatedMetadata}
                    className="h-[48px] rounded-[14px] border border-white/10 px-6 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
                  >
                    Show Metadata
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-effect rounded-[24px] p-8 border border-trust-blue/15 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.22),rgba(9,14,28,0.94)_58%)] shadow-[0_26px_80px_rgba(37,99,235,0.18)]">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div>
                  <p className="text-slate-400 mb-1 text-base">Validator / Agent Collateral</p>
                  <span className="font-bold text-white tracking-tight text-3xl">{requiredStakeLabel}</span>
                </div>
                <p className="max-w-md text-sm text-slate-300">
                  Registration stays disabled until the wallet-based profile is complete and the 0G metadata root has been created.
                </p>
                <button
                  onClick={registerAgent}
                  disabled={!registrationReady || isSubmitting || isLoadingStake}
                  className={`min-w-[220px] h-[60px] rounded-[18px] px-10 text-base font-black tracking-[0.04em] transition-all ${registrationReady && !isSubmitting ? "bg-vibrant-gradient text-white shadow-[0_16px_40px_-10px_rgba(111,140,255,0.72),0_0_0_1px_rgba(255,255,255,0.08)] hover:brightness-110 hover:-translate-y-1" : "bg-slate-800/80 text-slate-500 cursor-not-allowed border border-white/5"}`}
                >
                  {isSubmitting ? "Registering..." : "Register Agent"}
                </button>
              </div>
            </div>
          </section>

          <aside className="lg:col-span-3 flex flex-col gap-8 lg:sticky lg:top-24 self-start">
            <div
              className="glass-effect rounded-[22px] overflow-hidden flex flex-col shadow-[0_24px_70px_rgba(4,10,25,0.34)]"
              style={{ height: 560, minHeight: 560, maxHeight: 560 }}
            >
              <div className="p-5 border-b border-white/5">
                <h3 className="text-[20px] font-bold text-white">Protocol Logs</h3>
                <p className="text-xs text-slate-500">0G-native registration and trust activity stream.</p>
              </div>
              <div className="flex-1 min-h-0 bg-[rgba(8,14,28,0.95)] p-6 font-mono text-[14px] overflow-y-auto custom-scrollbar">
                <div className="space-y-4 break-words">
                  {protocolLogs.length > 0 ? (
                    protocolLogs.map((log) => (
                      <div key={log.id} className="flex gap-3 leading-relaxed">
                        <span className="text-slate-600 shrink-0">[{log.time}]</span>
                        <div className="min-w-0">
                          <p className={`${log.colorClass} font-semibold`}>{log.label}</p>
                          <p className="text-slate-400/90">{log.description}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 opacity-80">No 0G registration activity yet. Generate metadata or register an agent to populate the feed.</p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

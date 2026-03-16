import { BrowserProvider, Contract, Interface, JsonRpcProvider, formatEther } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";

const AGENT_REGISTRY_ABI = [
  "function calculateStakeAmount(uint8 riskLevel) view returns (uint256)",
  "function REVOKE_TRUST_THRESHOLD() view returns (uint256)",
  "function getAgent(uint256 agentId) view returns (tuple(bool isRegistered,address owner,string metadataURI,uint256 trustScore,uint8 rating,uint8 riskLevel,bool isDeterministic,uint256 stakeAmount,bool revoked,uint256 createdAt))",
  "function registerAgent(string metadataURI,(string name,string description,string expectedReasoning,string outputSchema,string domain) capabilityInput,uint8 riskLevel,bool isDeterministic) payable",
  "function revokeAgent(uint256 agentId)",
] as const;

type RiskLevel = "low" | "medium" | "high";
type ExecutionMode = "deterministic" | "non-deterministic";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

const DEFAULT_OUTPUT_SCHEMA = `{
  "status": "success",
  "data": {
    "action": "string",
    "params": "object"
  }
}`;

const riskLevelMap: Record<RiskLevel, 0 | 1 | 2> = {
  low: 0,
  medium: 1,
  high: 2,
};

const domainOptions = [
  "DeFi Strategy",
  "NLP Analysis",
  "Cross-chain Messaging",
  "Autonomous Governance",
];

type ProtocolLog = {
  id: string;
  time: string;
  label: string;
  description: string;
  colorClass: string;
};

type MirrorNodeLogResponse = {
  logs?: Array<{
    timestamp?: string;
    transaction_hash?: string;
    data: string;
    topics: string[];
  }>;
};

const protocolLogInterface = new Interface([
  "event AgentRegistered(uint256 indexed agentId,address indexed owner,uint8 riskLevel,bool isDeterministic,string metadataURI)",
  "event AgentRevoked(uint256 indexed agentId)",
  "event CapabilityChanged(uint256 indexed agentId,string capability,uint256 riskLevel)",
  "event TrustScoreUpdated(uint256 indexed agentId,uint256 oldScore,uint256 newScore)",
]);

function getEthereumProvider() {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

function formatHbarAmount(value: bigint) {
  const amount = Number(formatEther(value));
  return amount.toLocaleString(undefined, {
    maximumFractionDigits: amount > 0 && amount < 1 ? 4 : 2,
  });
}

function getRpcProvider() {
  const rpcUrl = import.meta.env.VITE_HEDERA_RPC_URL?.trim();
  if (!rpcUrl) {
    throw new Error("Missing VITE_HEDERA_RPC_URL");
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

function extractReadableError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const revertMatch = rawMessage.match(/execution reverted:\s*"[^"]+"/i);

  if (revertMatch) {
    return revertMatch[0];
  }

  return rawMessage;
}

function getMirrorNodeBaseUrl() {
  return import.meta.env.VITE_HEDERA_MIRROR_NODE_URL?.trim() || "https://testnet.mirrornode.hedera.com";
}

function formatMirrorTimestamp(timestamp?: string) {
  if (!timestamp) {
    return new Date().toLocaleTimeString("en-US", { hour12: false });
  }

  const [seconds] = timestamp.split(".");
  return new Date(Number(seconds) * 1000).toLocaleTimeString("en-US", {
    hour12: false,
  });
}

async function fetchMirrorProtocolLogs(): Promise<ProtocolLog[]> {
  const response = await fetch(
    `${getMirrorNodeBaseUrl()}/api/v1/contracts/${getAgentRegistryAddress()}/results/logs?order=desc&limit=20`,
  );

  if (!response.ok) {
    throw new Error(`Mirror Node request failed with ${response.status}`);
  }

  const payload = (await response.json()) as MirrorNodeLogResponse;

  return (payload.logs ?? [])
    .map((log, index) => {
      try {
        const parsed = protocolLogInterface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (!parsed) {
          return null;
        }

        const time = formatMirrorTimestamp(log.timestamp);
        const txHash = log.transaction_hash?.slice(0, 10) ?? "tx";

        switch (parsed.name) {
          case "AgentRegistered":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "AgentRegistered",
              description: `Agent #${parsed.args.agentId.toString()} registered on Hedera`,
              colorClass: "text-emerald-400",
            } satisfies ProtocolLog;
          case "CapabilityChanged":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "CapabilityChanged",
              description: `${parsed.args.capability} updated for Agent #${parsed.args.agentId.toString()}`,
              colorClass: "text-blue-400",
            } satisfies ProtocolLog;
          case "AgentRevoked":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "AgentRevoked",
              description: `Agent #${parsed.args.agentId.toString()} revoked`,
              colorClass: "text-red-400",
            } satisfies ProtocolLog;
          case "TrustScoreUpdated":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "TrustScoreUpdated",
              description: `Agent #${parsed.args.agentId.toString()} trust updated to ${parsed.args.newScore.toString()}`,
              colorClass: "text-amber-400",
            } satisfies ProtocolLog;
          default:
            return null;
        }
      } catch {
        return null;
      }
    })
    .filter((entry): entry is ProtocolLog => Boolean(entry));
}

export default function RegisterAgentPage() {
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [execMode, setExecMode] = useState<ExecutionMode>("deterministic");
  const [metadataUri, setMetadataUri] = useState("");
  const [capabilityName, setCapabilityName] = useState("");
  const [domain, setDomain] = useState(domainOptions[0]);
  const [description, setDescription] = useState("");
  const [expectedReasoning, setExpectedReasoning] = useState("");
  const [outputSchema, setOutputSchema] = useState(DEFAULT_OUTPUT_SCHEMA);
  const [stakeOptions, setStakeOptions] = useState<Record<RiskLevel, bigint>>({
    low: 0n,
    medium: 0n,
    high: 0n,
  });
  const [requiredStake, setRequiredStake] = useState<bigint>(0n);
  const [isLoadingStake, setIsLoadingStake] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revokeAgentId, setRevokeAgentId] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);
  const [protocolLogs, setProtocolLogs] = useState<ProtocolLog[]>([]);
  const [feedbackModal, setFeedbackModal] = useState<{
    title: string;
    message: string;
    tone: "warning" | "success" | "error";
  } | null>(null);

  const riskOptions = useMemo(
    () => [
      { key: "low" as const, label: "Low" },
      { key: "medium" as const, label: "Medium" },
      { key: "high" as const, label: "High" },
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStakeRequirement() {
      try {
        setIsLoadingStake(true);
        const provider = getRpcProvider();
        const contract = new Contract(
          getAgentRegistryAddress(),
          AGENT_REGISTRY_ABI,
          provider,
        );
        const [lowStake, mediumStake, highStake] = await Promise.all([
          contract.calculateStakeAmount(riskLevelMap.low),
          contract.calculateStakeAmount(riskLevelMap.medium),
          contract.calculateStakeAmount(riskLevelMap.high),
        ]);

        const nextStakeOptions = {
          low: BigInt(lowStake),
          medium: BigInt(mediumStake),
          high: BigInt(highStake),
        };

        if (!cancelled) {
          setStakeOptions(nextStakeOptions);
          setRequiredStake(nextStakeOptions[riskLevel]);
        }
      } catch (error) {
        console.warn("Unable to fetch stake requirement", error);
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

    void loadStakeRequirement();

    return () => {
      cancelled = true;
    };
  }, [riskLevel]);

  useEffect(() => {
    if (!feedbackModal) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFeedbackModal(null);
    }, 1000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [feedbackModal]);

  const requiredStakeLabel = isLoadingStake ? "Loading..." : `${formatHbarAmount(requiredStake)} HBAR`;

  const prependProtocolLog = (
    label: string,
    description: string,
    colorClass: ProtocolLog["colorClass"],
  ) => {
    setProtocolLogs((current) => [
      {
        id: `${Date.now()}-${label}`,
        time: new Date().toLocaleTimeString("en-US", { hour12: false }),
        label,
        description,
        colorClass,
      },
      ...current,
    ].slice(0, 20));
  };

  useEffect(() => {
    let cancelled = false;

    async function loadProtocolLogs() {
      try {
        const logs = await fetchMirrorProtocolLogs();
        if (!cancelled) {
          setProtocolLogs(logs);
        }
      } catch (error) {
        console.warn("Unable to fetch protocol logs", error);
      }
    }

    void loadProtocolLogs();
    const interval = window.setInterval(() => {
      void loadProtocolLogs();
    }, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const registerAgent = async () => {
    if (!metadataUri.trim() || !capabilityName.trim() || !description.trim() || !expectedReasoning.trim() || !outputSchema.trim()) {
      setFeedbackModal({
        title: "Missing Details",
        message: "Complete all agent metadata and capability fields before registering.",
        tone: "warning",
      });
      return;
    }

    const ethereum = getEthereumProvider();
    if (!ethereum) {
      toast({
        title: "MetaMask required",
        description: "Install MetaMask to sign the AgentRegistry transaction.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      prependProtocolLog("Wallet Signature Requested", "RegisterAgent() awaiting signature", "text-blue-400");

      const chainId = import.meta.env.VITE_HEDERA_CHAIN_ID;
      const rpcUrl = import.meta.env.VITE_HEDERA_RPC_URL;

      if (chainId && rpcUrl) {
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

          if (errorCode === 4902) {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId,
                chainName: import.meta.env.VITE_HEDERA_NETWORK_NAME || "Hedera Testnet",
                nativeCurrency: {
                  name: "HBAR",
                  symbol: "HBAR",
                  decimals: 18,
                },
                rpcUrls: [rpcUrl],
                blockExplorerUrls: import.meta.env.VITE_HEDERA_BLOCK_EXPLORER_URL
                  ? [import.meta.env.VITE_HEDERA_BLOCK_EXPLORER_URL]
                  : undefined,
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      await ethereum.request({ method: "eth_requestAccounts" });

      const provider = new BrowserProvider(ethereum as never);
      const signer = await provider.getSigner();
      const contract = new Contract(
        getAgentRegistryAddress(),
        AGENT_REGISTRY_ABI,
        signer,
      );

      const latestStake = await contract.calculateStakeAmount(riskLevelMap[riskLevel]);
      const tx = await contract.registerAgent(
        metadataUri.trim(),
        {
          name: capabilityName.trim(),
          description: description.trim(),
          expectedReasoning: expectedReasoning.trim(),
          outputSchema: outputSchema.trim(),
          domain,
        },
        riskLevelMap[riskLevel],
        execMode === "deterministic",
        { value: latestStake },
      );

      prependProtocolLog("Transaction Broadcast", "RegisterAgent() sent to Hedera Testnet", "text-blue-400");

      toast({
        title: "Transaction submitted",
        description: `MetaMask submitted the registration transaction: ${tx.hash.slice(0, 10)}...`,
      });

      await tx.wait();
      const logs = await fetchMirrorProtocolLogs();
      setProtocolLogs(logs);

      toast({
        title: "Agent registered",
        description: "The agent registration transaction was confirmed on Hedera.",
      });
    } catch (error) {
      const message = extractReadableError(error);

      toast({
        title: "Registration failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const revokeAgent = async () => {
    const agentId = Number(revokeAgentId.trim());

    if (!Number.isInteger(agentId) || agentId <= 0) {
      setFeedbackModal({
        title: "Invalid Agent ID",
        message: "Enter a numeric agent ID before attempting revocation.",
        tone: "warning",
      });
      return;
    }

    setIsRevoking(true);

    try {
      prependProtocolLog("Revocation Check", `Evaluating revoke criteria for Agent #${agentId}`, "text-amber-400");

      const provider = getRpcProvider();
      const readContract = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, provider);
      const [agent, threshold] = await Promise.all([
        readContract.getAgent(agentId),
        readContract.REVOKE_TRUST_THRESHOLD(),
      ]);

      const trustScore = BigInt(agent.trustScore);
      const revokeThreshold = BigInt(threshold);

      if (agent.revoked) {
        setFeedbackModal({
          title: "Already Revoked",
          message: `Agent #${agentId} has already been revoked from the registry.`,
          tone: "warning",
        });
        return;
      }

      if (trustScore > revokeThreshold) {
        setFeedbackModal({
          title: "Revocation Blocked",
          message: `Agent #${agentId} has trust score ${trustScore.toString()}, which is above the revoke threshold of ${revokeThreshold.toString()}.`,
          tone: "warning",
        });
        return;
      }

      const ethereum = getEthereumProvider();
      if (!ethereum) {
        toast({
          title: "MetaMask required",
          description: "Install MetaMask to sign the AgentRegistry revocation transaction.",
        });
        return;
      }

      const chainId = import.meta.env.VITE_HEDERA_CHAIN_ID;
      const rpcUrl = import.meta.env.VITE_HEDERA_RPC_URL;

      if (chainId && rpcUrl) {
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

          if (errorCode === 4902) {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId,
                chainName: import.meta.env.VITE_HEDERA_NETWORK_NAME || "Hedera Testnet",
                nativeCurrency: {
                  name: "HBAR",
                  symbol: "HBAR",
                  decimals: 18,
                },
                rpcUrls: [rpcUrl],
                blockExplorerUrls: import.meta.env.VITE_HEDERA_BLOCK_EXPLORER_URL
                  ? [import.meta.env.VITE_HEDERA_BLOCK_EXPLORER_URL]
                  : undefined,
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      await ethereum.request({ method: "eth_requestAccounts" });

      const signerProvider = new BrowserProvider(ethereum as never);
      const signer = await signerProvider.getSigner();
      const writeContract = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, signer);
      const tx = await writeContract.revokeAgent(agentId);

      prependProtocolLog("Transaction Broadcast", `revokeAgent(${agentId}) sent to Hedera Testnet`, "text-blue-400");

      toast({
        title: "Revocation submitted",
        description: `MetaMask submitted the revoke transaction: ${tx.hash.slice(0, 10)}...`,
      });

      await tx.wait();
      const logs = await fetchMirrorProtocolLogs();
      setProtocolLogs(logs);

      setFeedbackModal({
        title: "Agent Revoked",
        message: `Agent #${agentId} was successfully revoked on Hedera.`,
        tone: "success",
      });
      setRevokeAgentId("");
    } catch (error) {
      const message = extractReadableError(error);

      setFeedbackModal({
        title: "Revocation Failed",
        message,
        tone: "error",
      });
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 bg-gradient-animate">
      <header className="pt-16 pb-12">
        <h1 className="text-[48px] font-bold tracking-tight leading-tight text-white">
          Register Your <span className="bg-clip-text text-transparent bg-gradient-to-r from-trust-blue to-trust-purple">AI Agent</span>
        </h1>
        <p className="max-w-3xl text-lg leading-relaxed mt-4 text-[#c2c5d0]">
          Deploy your AI agent into the AgentTrust protocol by defining its capabilities, risk level, and execution behavior so it can be validated by the decentralized network of validators.
        </p>
      </header>

      {feedbackModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-24">
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-[20px] border border-amber-400/15 animate-in fade-in zoom-in-95 duration-200"
            style={{
              background:
                feedbackModal.tone === "success"
                  ? "linear-gradient(180deg, rgba(10, 40, 28, 0.96), rgba(11, 26, 21, 0.96))"
                  : feedbackModal.tone === "error"
                    ? "linear-gradient(180deg, rgba(47, 18, 24, 0.96), rgba(28, 13, 18, 0.96))"
                    : "linear-gradient(180deg, rgba(20, 26, 42, 0.96), rgba(14, 19, 34, 0.96))",
              boxShadow:
                feedbackModal.tone === "success"
                  ? "0 0 0 1px rgba(74, 222, 128, 0.05), 0 20px 54px rgba(0, 0, 0, 0.28)"
                  : feedbackModal.tone === "error"
                    ? "0 0 0 1px rgba(248, 113, 113, 0.05), 0 20px 54px rgba(0, 0, 0, 0.28)"
                    : "0 0 0 1px rgba(251, 191, 36, 0.05), 0 20px 54px rgba(0, 0, 0, 0.28)",
            }}
          >
            <div className="flex items-start gap-4 px-5 py-4">
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-[0_0_20px_rgba(251,191,36,0.08)]"
                style={{
                  border:
                    feedbackModal.tone === "success"
                      ? "1px solid rgba(74, 222, 128, 0.2)"
                      : feedbackModal.tone === "error"
                        ? "1px solid rgba(248, 113, 113, 0.2)"
                        : "1px solid rgba(251, 191, 36, 0.2)",
                  background:
                    feedbackModal.tone === "success"
                      ? "rgba(74, 222, 128, 0.1)"
                      : feedbackModal.tone === "error"
                        ? "rgba(248, 113, 113, 0.1)"
                        : "rgba(251, 191, 36, 0.1)",
                  color:
                    feedbackModal.tone === "success"
                      ? "#86efac"
                      : feedbackModal.tone === "error"
                        ? "#fca5a5"
                        : "#fcd34d",
                }}
              >
                <span className="material-symbols-outlined text-[22px]">
                  {feedbackModal.tone === "success" ? "check_circle" : feedbackModal.tone === "error" ? "error" : "warning"}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="inline-flex rounded-full px-3 py-1 shadow-[0_8px_20px_rgba(253,224,71,0.18)]"
                  style={{
                    border:
                      feedbackModal.tone === "success"
                        ? "1px solid rgba(134, 239, 172, 0.6)"
                        : feedbackModal.tone === "error"
                          ? "1px solid rgba(252, 165, 165, 0.55)"
                          : "1px solid rgba(253, 224, 71, 0.6)",
                    background:
                      feedbackModal.tone === "success"
                        ? "#86efac"
                        : feedbackModal.tone === "error"
                          ? "#fca5a5"
                          : "#fde047",
                  }}
                >
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-950">{feedbackModal.title}</p>
                </div>
                <p
                  className="mt-2 text-base font-semibold leading-relaxed"
                  style={{
                    color:
                      feedbackModal.tone === "success"
                        ? "rgba(220, 252, 231, 0.96)"
                        : feedbackModal.tone === "error"
                          ? "rgba(254, 226, 226, 0.96)"
                          : "rgba(255, 251, 235, 0.96)",
                  }}
                >
                  {feedbackModal.message}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
          <section className="lg:col-span-6 space-y-8">
            <div className="glass-effect rounded-[18px] p-6 py-[16px] px-[24px]">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-trust-blue flex items-center justify-center font-bold text-sm text-white">1</span>
                <h2 className="text-[20px] font-semibold text-white">Agent Metadata</h2>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-400 mb-2">Metadata URI (IPFS/Arweave)</label>
                <input
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-trust-blue focus:border-transparent transition-all outline-none"
                  placeholder="ipfs://Qm... or https://arweave.net/..."
                  type="text"
                  value={metadataUri}
                  onChange={(event) => setMetadataUri(event.target.value)}
                />
                <p className="mt-2 text-xs text-slate-500">Metadata will be fetched and validated against protocol standards.</p>
              </div>
            </div>

            <div className="glass-effect rounded-[18px] p-6">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-trust-blue flex items-center justify-center font-bold text-sm text-white">2</span>
                <h2 className="text-[20px] font-semibold text-white">Risk & Execution</h2>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {riskOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setRiskLevel(opt.key)}
                    className={`h-[110px] rounded-xl border-2 text-center transition-all hover:-translate-y-0.5 ${riskLevel === opt.key ? "border-trust-blue-glow bg-trust-blue/10 shadow-[0_0_15px_rgba(91,140,255,0.3)]" : "border-slate-700 hover:border-slate-500 bg-transparent"}`}
                  >
                    <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${riskLevel === opt.key ? "text-trust-blue" : "text-slate-400"}`}>{opt.label}</p>
                    <p className="text-sm text-slate-300 font-semibold">
                      {formatHbarAmount(stakeOptions[opt.key])} HBAR
                    </p>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3 p-4 bg-slate-900/40 rounded-xl border border-slate-800">
                <div>
                  <p className="text-sm font-medium text-slate-200">Execution Mode</p>
                  <p className="text-xs text-slate-500">Forces agent to produce verifiable proofs of logic</p>
                </div>
                <div className="flex bg-black/40 p-1 rounded-[12px] border border-slate-700/50">
                  <button
                    onClick={() => setExecMode("deterministic")}
                    className={`flex-1 py-2 text-xs font-bold rounded-[8px] transition-all ${execMode === "deterministic" ? "bg-gradient-to-r from-trust-blue to-trust-purple text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    DETERMINISTIC
                  </button>
                  <button
                    onClick={() => setExecMode("non-deterministic")}
                    className={`flex-1 py-2 text-xs font-bold rounded-[8px] transition-all ${execMode === "non-deterministic" ? "bg-gradient-to-r from-trust-blue to-trust-purple text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    NON-DETERMINISTIC
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-effect rounded-[18px] p-6">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-trust-blue flex items-center justify-center font-bold text-sm text-white">3</span>
                <h2 className="text-[20px] font-semibold text-white">Agent Capabilities</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Capability Name</label>
                  <input
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                    placeholder="e.g. Asset Swap"
                    value={capabilityName}
                    onChange={(event) => setCapabilityName(event.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Domain</label>
                  <select
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                  >
                    {domainOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Description</label>
                <textarea
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                  placeholder="Describe the specific task behavior..."
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Expected Reasoning</label>
                <textarea
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                  placeholder="The logic steps the agent must follow..."
                  rows={2}
                  value={expectedReasoning}
                  onChange={(event) => setExpectedReasoning(event.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Output Schema (JSON)</label>
                <textarea
                  className="w-full border border-slate-700 rounded-lg p-4 font-mono text-xs text-green-300 overflow-x-auto bg-[#01020e] outline-none focus:ring-1 focus:ring-trust-blue min-h-[130px]"
                  value={outputSchema}
                  onChange={(event) => setOutputSchema(event.target.value)}
                />
              </div>
            </div>

            <div className="glass-effect rounded-[18px] p-8 border-t-2 border-t-trust-purple/30">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-slate-400 mb-1 text-base">Required Security Deposit</p>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white tracking-tight text-3xl">{requiredStakeLabel}</span>
                  </div>
                </div>
                <button
                  onClick={registerAgent}
                  disabled={isSubmitting || isLoadingStake}
                  className="h-[56px] px-10 rounded-[16px] bg-vibrant-gradient text-white font-bold text-lg shadow-[0_8px_25px_-5px_rgba(111,140,255,0.4)] hover:shadow-[0_12px_35px_-5px_rgba(111,140,255,0.6)] hover:brightness-110 transition-all transform hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none"
                >
                  {isSubmitting ? "Submitting..." : "Register Agent"}
                </button>
              </div>
            </div>
          </section>

          <aside className="lg:col-span-4 space-y-8">
            <div className="glass-effect rounded-[18px] overflow-hidden flex flex-col min-h-[480px]">
              <div className="p-5 border-b border-white/5">
                <h3 className="text-[20px] font-bold text-white">Protocol Logs</h3>
                <p className="text-xs text-slate-500">Live protocol events from Hedera Mirror Node</p>
              </div>
              <div className="flex-1 bg-[rgba(8,14,28,0.95)] p-6 font-mono text-[14px] overflow-y-auto custom-scrollbar">
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
                    <p className="text-slate-500 opacity-80">No protocol activity yet. Register or revoke an agent to populate the feed.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="glass-effect rounded-[18px] p-6 text-center">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6">Validation Flow</h3>
              <div className="flex justify-center items-center py-4">
                <svg className="overflow-visible" height="120" viewBox="0 0 280 120" width="280">
                  <g className="node-animate-agent">
                    <rect fill="rgba(59, 130, 246, 0.2)" height="40" rx="8" stroke="#3b82f6" strokeWidth="1.5" width="50" x="0" y="40" />
                    <text fill="white" fontFamily="Inter" fontSize="8" fontWeight="bold" textAnchor="middle" x="25" y="65">AGENT</text>
                  </g>
                  <g className="node-animate-validator">
                    <rect fill="rgba(168, 85, 247, 0.1)" height="80" rx="8" stroke="#a855f7" strokeWidth="1.5" width="60" x="110" y="20" />
                    <text fill="white" fontFamily="Inter" fontSize="8" fontWeight="bold" textAnchor="middle" x="140" y="55">VALIDATORS</text>
                    <text fill="#a855f7" fontFamily="Inter" fontSize="7" fontWeight="600" textAnchor="middle" x="140" y="75">CONSENSUS</text>
                  </g>
                  <g className="node-animate-trust">
                    <circle cx="250" cy="60" fill="rgba(34, 197, 94, 0.1)" r="25" stroke="#22c55e" strokeWidth="1.5" />
                    <text fill="white" fontFamily="Inter" fontSize="8" fontWeight="bold" textAnchor="middle" x="250" y="60">TRUST</text>
                    <text fill="#22c55e" fontFamily="Inter" fontSize="7" fontWeight="600" textAnchor="middle" x="250" y="72">SCORE</text>
                  </g>
                  <path className="flow-line" d="M50 60 H110" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
                  <path className="flow-line" d="M170 60 H225" fill="none" stroke="#a855f7" strokeWidth="1.5" style={{ animationDelay: "1.5s" }} />
                </svg>
              </div>
              <p className="text-xs text-slate-500 italic mt-2">Validators continuously verify agent reasoning against proposed outputs.</p>
            </div>
          </aside>
        </div>

        <section className="mt-12">
          <div className="bg-red-950/40 backdrop-blur-md rounded-[18px] p-6 border border-red-500/30 py-[24px]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-md">
                <h2 className="text-lg font-bold text-red-500 mb-1">Danger Zone</h2>
                <p className="text-sm text-[#ef5d1f]">​Revoke an agent whose trust score falls below the protocol threshold due to malicious or unreliable behavior. The agent’s stake is liquidated and the caller receives a 1% bounty reward.</p>
              </div>
              <div className="flex-1 max-w-lg flex items-center gap-4">
                <input
                  className="flex-1 bg-black/40 border border-red-900/50 rounded-lg px-4 py-3 text-sm text-slate-200 focus:ring-1 focus:ring-red-500 outline-none"
                  placeholder="Enter Agent ID (e.g. 1)"
                  type="text"
                  value={revokeAgentId}
                  onChange={(event) => setRevokeAgentId(event.target.value)}
                />
                <button
                  onClick={revokeAgent}
                  disabled={isRevoking}
                  className="whitespace-nowrap px-6 py-3 bg-gradient-to-r from-red-600 to-red-800 text-white font-bold rounded-lg hover:brightness-110 transition-all text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRevoking ? "Checking..." : "Revoke Agent"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

import { BrowserProvider, Contract, Interface, JsonRpcProvider, formatEther } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { createUaid } from "@hashgraphonline/standards-sdk/hcs14";

const AGENT_REGISTRY_ABI = [
  "function calculateStakeAmount(uint8 riskLevel) view returns (uint256)",
  "function REVOKE_TRUST_THRESHOLD() view returns (uint256)",
  "function getAgent(uint256 agentId) view returns (tuple(bool isRegistered,address owner,string metadataURI,uint256 trustScore,uint8 rating,uint8 riskLevel,bool isDeterministic,uint256 stakeAmount,bool revoked,uint256 createdAt))",
  "function agentNFT() view returns (address)",
  "function registerAgent(string metadataURI,(uint32 skillId,string name,string description,string expectedReasoning,string outputSchema,string domain) capabilityInput,uint8 riskLevel,bool isDeterministic) payable",
  "function revokeAgent(uint256 agentId)",
] as const;

type RiskLevel = "low" | "medium" | "high";
type ExecutionMode = "deterministic" | "non-deterministic";
type UaidProtocol = "rest" | "hcs-10" | "a2a";
type UaidRecipeType = "A2A" | "HEDERA_DID" | "EVM";

type UaidPayload = {
  registry: "hol";
  name: string;
  version: string;
  protocol: string;
  nativeId?: string;
  skills: number[];
};

type UaidRecipeInputs = {
  uaidName: string;
  uaidVersion: string;
  uaidProtocol: UaidProtocol;
  uaidNativeId: string;
  uaidSkillsInput: string;
  didWebValue: string;
  evmChainId: string;
  evmAddress: string;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

type ProtocolLog = {
  id: string;
  time: string;
  label: string;
  description: string;
  colorClass: string;
  sortValue?: number;
};

type MirrorNodeLogResponse = {
  logs?: Array<{
    timestamp?: string;
    transaction_hash?: string;
    data: string;
    topics: string[];
  }>;
};

type UploadMetadataResponse = {
  cid: string;
  metadataURI: string;
};

type AgentMetadataDocument = {
  type: string;
  name: string;
  description: string;
  endpoint: string;
  services: Array<{
    name: string;
    endpoint: string;
    description: string;
  }>;
  capabilities: Array<{
    id: number;
    name: string;
    riskLevel: RiskLevel;
    deterministic: boolean;
  }>;
  agentTrust: {
    uaid: string;
    did: string;
    owner: string;
    capabilities: Array<{
      id: number;
      name: string;
      riskLevel: RiskLevel;
      deterministic: boolean;
    }>;
    execution: {
      mode: ExecutionMode;
      validationModel: "output-hash" | "consensus";
    };
  };
  createdAt: string;
  image?: string;
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

const protocolLogInterface = new Interface([
  "event AgentRegistered(uint256 indexed agentId,address indexed owner,uint8 riskLevel,bool isDeterministic,string metadataURI)",
  "event AgentRevoked(uint256 indexed agentId)",
  "event CapabilityChanged(uint256 indexed agentId,uint32 skillId,string capability,uint256 riskLevel)",
  "event TrustScoreUpdated(uint256 indexed agentId,uint256 oldScore,uint256 newScore)",
  "event AgentMinted(uint256 indexed tokenId,address indexed to,string metadataURI)",
  "event NFTMinted(address indexed to,uint256 indexed tokenId,int64 newTotalSupply)",
  "event NFTBurned(uint256 indexed tokenId,int64 newTotalSupply)",
  "event NFTRevoked(uint256 indexed tokenId,address indexed owner)",
  "event AgentAuthorized(address indexed user,uint256 indexed agentId,uint32 skillId)",
  "event AgentAuthorizedBatch(address indexed user,uint256 indexed agentId,uint256 capabilityCount)",
  "event AuthorizationRevoked(address indexed user,uint256 indexed agentId)",
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

function getAuthorizationManagerAddress() {
  const address = import.meta.env.VITE_AUTHORIZATION_MANAGER_ADDRESS?.trim();
  if (!address) {
    return "";
  }

  return address;
}

function getMetadataUploadUrl() {
  const configuredUrl = import.meta.env.VITE_METADATA_UPLOAD_URL?.trim();
  if (!configuredUrl) {
    return "/metadata/upload";
  }

  try {
    const url = new URL(configuredUrl);
    const hostname = url.hostname.toLowerCase();

    // IPFS gateways are for reading pinned content, not for this app's JSON upload API.
    if (
      hostname.endsWith(".mypinata.cloud") ||
      hostname === "ipfs.io" ||
      hostname === "gateway.pinata.cloud" ||
      url.pathname.includes("/ipfs/")
    ) {
      return "/metadata/upload";
    }

    if (url.pathname === "/" || !url.pathname.trim()) {
      url.pathname = "/metadata/upload";
    }
    return url.toString();
  } catch {
    if (configuredUrl.startsWith("/")) {
      return configuredUrl;
    }

    return configuredUrl.replace(/\/+$/, "");
  }
}

function extractReadableError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const revertMatch = rawMessage.match(/execution reverted:\s*"[^"]+"/i);

  if (revertMatch) {
    return revertMatch[0];
  }

  if (rawMessage.includes("execution reverted (no data present; likely require(false) occurred")) {
    return "Registration preflight failed during gas estimation. This commonly happens on Hedera when the AgentNFT mint path uses HTS precompiles. Retry with the manual gas fallback, and verify the wallet is associated with the AgentNFT collection.";
  }

  return rawMessage;
}

function parseSkillsInput(skillsInput: string) {
  return skillsInput
    .split(",")
    .map((skill) => Number(skill.trim()))
    .filter((skill) => Number.isInteger(skill) && skill >= 0);
}

function generateUid(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

function buildUaidPayload(recipeType: UaidRecipeType, inputs: UaidRecipeInputs): UaidPayload {
  const version = inputs.uaidVersion.trim() || "1.0.0";
  const skills = parseSkillsInput(inputs.uaidSkillsInput);

  switch (recipeType) {
    case "A2A":
      return {
        registry: "hol",
        name: inputs.uaidName.trim(),
        version,
        protocol: inputs.uaidProtocol,
        nativeId: inputs.uaidNativeId.trim() || undefined,
        skills,
      };
    case "HEDERA_DID": {
      const did = inputs.didWebValue.trim();
      return {
        registry: "hol",
        name: did,
        version,
        protocol: "did:hedera",
        nativeId: did,
        skills: [],
      };
    }
    case "EVM":
      return {
        registry: "hol",
        name: inputs.uaidName.trim(),
        version,
        protocol: "eip155",
        nativeId: `${inputs.evmChainId.trim()}:${inputs.evmAddress.trim()}`,
        skills,
      };
    default:
      return {
        registry: "hol",
        name: inputs.uaidName.trim(),
        version,
        protocol: inputs.uaidProtocol,
        nativeId: inputs.uaidNativeId.trim() || undefined,
        skills,
      };
  }
}

function getRecipeBadge(recipeType: UaidRecipeType) {
  switch (recipeType) {
    case "A2A":
      return "Deterministic Identity";
    case "HEDERA_DID":
      return "Hedera DID";
    case "EVM":
      return "On-chain Identity";
  }
}

function isValidDidWeb(value: string) {
  return /^did:hedera:(mainnet|testnet):[A-Za-z0-9]{32,}_\d+\.\d+\.\d+$/.test(value.trim());
}

function isValidEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function isValidSkillId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return false;
  }

  return parsed <= 39 || parsed >= 100;
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

function parseMirrorTimestampValue(timestamp?: string) {
  if (!timestamp) {
    return 0;
  }

  const [seconds, nanos = "0"] = timestamp.split(".");
  return Number(seconds) * 1_000 + Number(nanos.slice(0, 3).padEnd(3, "0"));
}

function getRegisterAgentFallbackGasLimit(riskLevel: RiskLevel) {
  switch (riskLevel) {
    case "low":
      return 1_800_000n;
    case "medium":
      return 2_200_000n;
    case "high":
      return 2_600_000n;
  }
}

async function fetchMirrorProtocolLogs(): Promise<ProtocolLog[]> {
  const provider = getRpcProvider();
  const registryContract = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, provider);
  const mirrorBaseUrl = getMirrorNodeBaseUrl();
  const authorizationManagerAddress = getAuthorizationManagerAddress();
  const agentNftAddress = await registryContract.agentNFT().catch(() => "");

  const contractAddresses = [
    getAgentRegistryAddress(),
    authorizationManagerAddress,
    typeof agentNftAddress === "string" ? agentNftAddress.trim() : "",
  ].filter((address): address is string => Boolean(address));

  const payloads = await Promise.all(
    contractAddresses.map(async (address) => {
      try {
        const response = await fetch(
          `${mirrorBaseUrl}/api/v1/contracts/${address}/results/logs?order=desc&limit=20`,
        );

        if (!response.ok) {
          throw new Error(`Mirror Node request failed with ${response.status}`);
        }

        return (await response.json()) as MirrorNodeLogResponse;
      } catch (error) {
        console.warn(`Unable to fetch protocol logs for contract ${address}`, error);
        return { logs: [] } satisfies MirrorNodeLogResponse;
      }
    }),
  );

  const entries = payloads.flatMap((payload) => payload.logs ?? []);

  return entries
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
        const sortValue = parseMirrorTimestampValue(log.timestamp);

        switch (parsed.name) {
          case "AgentRegistered":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "AgentRegistered",
              description: `Agent #${parsed.args.agentId.toString()} registered on Hedera`,
              colorClass: "text-emerald-400",
              sortValue,
            } satisfies ProtocolLog;
          case "CapabilityChanged":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "CapabilityChanged",
              description: `${parsed.args.capability || `Skill ${parsed.args.skillId.toString()}`} updated for Agent #${parsed.args.agentId.toString()}`,
              colorClass: "text-blue-400",
              sortValue,
            } satisfies ProtocolLog;
          case "AgentRevoked":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "AgentRevoked",
              description: `Agent #${parsed.args.agentId.toString()} revoked`,
              colorClass: "text-red-400",
              sortValue,
            } satisfies ProtocolLog;
          case "TrustScoreUpdated":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "TrustScoreUpdated",
              description: `Agent #${parsed.args.agentId.toString()} trust changed to ${parsed.args.newScore.toString()}`,
              colorClass: "text-amber-300",
              sortValue,
            } satisfies ProtocolLog;
          case "AgentMinted":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "AgentMinted",
              description: `Agent NFT #${parsed.args.tokenId.toString()} minted with metadata URI recorded`,
              colorClass: "text-cyan-300",
              sortValue,
            } satisfies ProtocolLog;
          case "NFTMinted":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "NFTMinted",
              description: `NFT #${parsed.args.tokenId.toString()} minted. Total supply is now ${parsed.args.newTotalSupply.toString()}`,
              colorClass: "text-cyan-400",
              sortValue,
            } satisfies ProtocolLog;
          case "NFTBurned":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "NFTBurned",
              description: `NFT #${parsed.args.tokenId.toString()} burned. Total supply is now ${parsed.args.newTotalSupply.toString()}`,
              colorClass: "text-rose-300",
              sortValue,
            } satisfies ProtocolLog;
          case "NFTRevoked":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "NFTRevoked",
              description: `NFT #${parsed.args.tokenId.toString()} revoked from ${parsed.args.owner}`,
              colorClass: "text-rose-400",
              sortValue,
            } satisfies ProtocolLog;
          case "AgentAuthorized":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "AgentAuthorized",
              description: `Authorization granted for Agent #${parsed.args.agentId.toString()} skill ${parsed.args.skillId.toString()}`,
              colorClass: "text-violet-300",
              sortValue,
            } satisfies ProtocolLog;
          case "AgentAuthorizedBatch":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "AgentAuthorizedBatch",
              description: `${parsed.args.capabilityCount.toString()} capabilities authorized for Agent #${parsed.args.agentId.toString()}`,
              colorClass: "text-violet-400",
              sortValue,
            } satisfies ProtocolLog;
          case "AuthorizationRevoked":
            return {
              id: `${txHash}-${index}`,
              time,
              label: "AuthorizationRevoked",
              description: `Authorization revoked for Agent #${parsed.args.agentId.toString()}`,
              colorClass: "text-orange-300",
              sortValue,
            } satisfies ProtocolLog;
          default:
            return null;
        }
      } catch {
        return null;
      }
    })
    .filter((entry): entry is ProtocolLog => Boolean(entry))
    .sort((a, b) => (b.sortValue ?? 0) - (a.sortValue ?? 0))
    .slice(0, 20);
}

async function switchToHederaNetwork(ethereum: EthereumProvider) {
  const chainId = import.meta.env.VITE_HEDERA_CHAIN_ID;
  const rpcUrl = import.meta.env.VITE_HEDERA_RPC_URL;

  if (!chainId || !rpcUrl) {
    return;
  }

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
  }
}

export default function RegisterAgentPage() {
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [execMode, setExecMode] = useState<ExecutionMode>("deterministic");
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [capabilitySkillId, setCapabilitySkillId] = useState("");
  const [capabilityName, setCapabilityName] = useState("");
  const [domain, setDomain] = useState(domainOptions[0]);
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
  const [protocolLogs, setProtocolLogs] = useState<ProtocolLog[]>([]);
  const [uaidRecipe, setUaidRecipe] = useState<UaidRecipeType>("A2A");
  const [uaidName, setUaidName] = useState("");
  const [uaidVersion, setUaidVersion] = useState("1.0.0");
  const [uaidProtocol, setUaidProtocol] = useState<UaidProtocol>("rest");
  const [uaidNativeId, setUaidNativeId] = useState("");
  const [uaidSkillsInput, setUaidSkillsInput] = useState("");
  const [didWebValue, setDidWebValue] = useState("");
  const [evmChainId, setEvmChainId] = useState("296");
  const [evmAddress, setEvmAddress] = useState("");
  const [generatedUaid, setGeneratedUaid] = useState("");
  const [generatedRecipe, setGeneratedRecipe] = useState<UaidRecipeType | null>(null);
  const [isGeneratingUaid, setIsGeneratingUaid] = useState(false);
  const [generatedMetadata, setGeneratedMetadata] = useState<AgentMetadataDocument | null>(null);
  const [generatedMetadataUri, setGeneratedMetadataUri] = useState("");
  const [generatedCid, setGeneratedCid] = useState("");
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
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

  const metadataDependencies = [
    agentName,
    agentDescription,
    endpoint,
    capabilitySkillId,
    capabilityName,
    domain,
    expectedReasoning,
    outputSchema,
    riskLevel,
    execMode,
    didWebValue,
    generatedUaid,
  ].join("|");

  useEffect(() => {
    let cancelled = false;

    async function loadStakeRequirement() {
      try {
        setIsLoadingStake(true);
        const provider = getRpcProvider();
        const contract = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, provider);
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
          setStakeOptions({ low: 0n, medium: 100n, high: 500n });
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
    }, 1600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [feedbackModal]);

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

  useEffect(() => {
    setGeneratedMetadata(null);
    setGeneratedMetadataUri("");
    setGeneratedCid("");
    setIsMetadataModalOpen(false);
  }, [metadataDependencies]);

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

  const canGenerateMetadata =
    agentName.trim().length > 0
    && agentDescription.trim().length > 0
    && endpoint.trim().length > 0
    && isValidDidWeb(didWebValue)
    && generatedUaid.trim().length > 0
    && isValidSkillId(capabilitySkillId);

  const canRegister =
    isValidDidWeb(didWebValue)
    && generatedUaid.trim().length > 0
    && generatedMetadataUri.trim().length > 0;

  const generateUaid = async () => {
    if (uaidRecipe === "HEDERA_DID") {
      if (!isValidDidWeb(didWebValue)) {
        toast({
          title: "Invalid Hedera DID",
          description: "Enter a valid DID such as did:hedera:testnet:DZv8..._0.0.2666979 before generating.",
          variant: "destructive",
        });
        return;
      }
    } else if (!uaidName.trim()) {
      toast({
        title: "Agent name required",
        description: "Enter a UAID name before generating.",
        variant: "destructive",
      });
      return;
    }

    if (uaidRecipe === "EVM") {
      if (!evmChainId.trim() || Number.isNaN(Number(evmChainId)) || Number(evmChainId) <= 0) {
        toast({
          title: "Invalid chain ID",
          description: "Enter a valid positive EVM chain ID.",
          variant: "destructive",
        });
        return;
      }

      if (!isValidEvmAddress(evmAddress)) {
        toast({
          title: "Invalid EVM address",
          description: "Address must be a 0x-prefixed 40-byte hex value.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsGeneratingUaid(true);

    try {
      const payloadInputs: UaidRecipeInputs = {
        uaidName,
        uaidVersion,
        uaidProtocol,
        uaidNativeId,
        uaidSkillsInput,
        didWebValue,
        evmChainId,
        evmAddress,
      };
      const payload = buildUaidPayload(uaidRecipe, payloadInputs);
      const uaid = await createUaid(payload, {
        uid: generateUid(payload.name),
      });

      setGeneratedUaid(uaid);
      setGeneratedRecipe(uaidRecipe);
      prependProtocolLog("UAID Generated", `Generated ${uaidRecipe} identity payload`, "text-trust-blue");
      toast({
        title: "UAID generated",
        description: "Generated successfully for metadata inclusion and registration.",
      });
    } catch (error) {
      toast({
        title: "UAID generation failed",
        description: extractReadableError(error),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingUaid(false);
    }
  };

  const copyUaid = async () => {
    if (!generatedUaid) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedUaid);
      toast({
        title: "Copied",
        description: "UAID copied to clipboard",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to access clipboard in this environment.",
        variant: "destructive",
      });
    }
  };

  const buildMetadata = (owner: string): AgentMetadataDocument => {
    const capabilityId = Number(capabilitySkillId.trim());
    const capabilityLabel = capabilityName.trim() || `Skill ${capabilityId}`;
    const deterministic = execMode === "deterministic";
    const capability = {
      id: capabilityId,
      name: capabilityLabel,
      riskLevel,
      deterministic,
    };

    return {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: agentName.trim(),
      description: agentDescription.trim(),
      endpoint: endpoint.trim(),
      services: [
        {
          name: "execution",
          endpoint: endpoint.trim(),
          description: "Primary execution interface",
        },
      ],
      capabilities: [capability],
      agentTrust: {
        uaid: generatedUaid.trim(),
        did: didWebValue.trim(),
        owner,
        capabilities: [capability],
        execution: {
          mode: execMode,
          validationModel: deterministic ? "output-hash" : "consensus",
        },
      },
      createdAt: new Date().toISOString(),
    };
  };

  const generateMetadata = async () => {
    if (!canGenerateMetadata) {
      setFeedbackModal({
        title: "Incomplete Metadata Inputs",
        message: "Provide DID, UAID, agent profile, endpoint, and a valid skill ID before generating metadata.",
        tone: "warning",
      });
      return;
    }

    const ethereum = getEthereumProvider();
    if (!ethereum) {
      toast({
        title: "MetaMask required",
        description: "Install MetaMask to generate ownership-aware metadata.",
      });
      return;
    }

    setIsGeneratingMetadata(true);

    try {
      await switchToHederaNetwork(ethereum);
      await ethereum.request({ method: "eth_requestAccounts" });

      const provider = new BrowserProvider(ethereum as never);
      const signer = await provider.getSigner();
      const owner = await signer.getAddress();

      prependProtocolLog("Metadata Built", "Constructing ERC-8004 registration metadata", "text-cyan-400");
      const metadata = buildMetadata(owner);
      setGeneratedMetadata(metadata);

      prependProtocolLog("Uploaded to IPFS", `Submitting metadata payload to ${getMetadataUploadUrl()}`, "text-blue-400");
      const response = await fetch(getMetadataUploadUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ metadata }),
      });

      if (!response.ok) {
        let errorMessage = `Metadata upload failed with ${response.status}`;
        try {
          const errorPayload = await response.json() as { error?: string; details?: string };
          if (errorPayload.error?.trim()) {
            errorMessage = errorPayload.error.trim();
          }
          if (errorPayload.details?.trim()) {
            errorMessage = `${errorMessage}: ${errorPayload.details.trim()}`;
          }
        } catch {
          // Ignore response parse issues and fall back to the status-based message.
        }
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as UploadMetadataResponse;
      if (!payload.metadataURI?.trim()) {
        throw new Error("Metadata upload did not return a valid metadataURI.");
      }

      setGeneratedCid(payload.cid);
      setGeneratedMetadataUri(payload.metadataURI);
      prependProtocolLog("CID Generated", payload.metadataURI, "text-emerald-400");

      toast({
        title: "Metadata uploaded to IPFS successfully",
        description: payload.metadataURI,
      });
    } catch (error) {
      toast({
        title: "Metadata generation failed",
        description: extractReadableError(error),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingMetadata(false);
    }
  };

  const registerAgent = async () => {
    if (!canRegister) {
      setFeedbackModal({
        title: "Registration Locked",
        message: "DID, UAID, and generated metadata are required before the contract call can proceed.",
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
      const trimmedMetadataUri = generatedMetadataUri.trim();
      const parsedSkillId = Number(capabilitySkillId.trim());

      if (!trimmedMetadataUri) {
        throw new Error("Missing metadata URI. Generate metadata again before registering.");
      }

      if (trimmedMetadataUri.length > 100) {
        throw new Error("Metadata URI is too long for the current AgentNFT mint flow. Use a shorter ipfs:// CID URI.");
      }

      if (!Number.isInteger(parsedSkillId) || parsedSkillId < 0) {
        throw new Error("Skill ID must be a non-negative integer.");
      }

      if (parsedSkillId > 39 && parsedSkillId < 100) {
        throw new Error("Skill IDs 40-99 are reserved by the contract. Use 0-39 or 100+.");
      }

      prependProtocolLog("Wallet Signature Requested", "RegisterAgent() awaiting signature", "text-blue-400");
      await switchToHederaNetwork(ethereum);
      await ethereum.request({ method: "eth_requestAccounts" });

      const provider = new BrowserProvider(ethereum as never);
      const signer = await provider.getSigner();
      const contract = new Contract(getAgentRegistryAddress(), AGENT_REGISTRY_ABI, signer);

      const latestStake = await contract.calculateStakeAmount(riskLevelMap[riskLevel]);
      const capabilityInput = {
        skillId: parsedSkillId,
        name: capabilityName.trim() || `Skill ${capabilitySkillId.trim()}`,
        description: agentDescription.trim(),
        expectedReasoning: expectedReasoning.trim(),
        outputSchema: outputSchema.trim(),
        domain,
      };
      const riskLevelValue = riskLevelMap[riskLevel];
      const isDeterministic = execMode === "deterministic";

      let gasLimit: bigint;

      try {
        const estimatedGas = await contract.registerAgent.estimateGas(
          trimmedMetadataUri,
          capabilityInput,
          riskLevelValue,
          isDeterministic,
          { value: latestStake },
        );
        gasLimit = (estimatedGas * 120n) / 100n;
        prependProtocolLog("Gas Estimated", `${estimatedGas.toString()} units`, "text-cyan-300");
      } catch {
        gasLimit = getRegisterAgentFallbackGasLimit(riskLevel);
        prependProtocolLog(
          "Gas Estimation Fallback",
          `Using manual gas limit ${gasLimit.toString()} because estimateGas reverted`,
          "text-amber-300",
        );
      }

      const registerCallData = contract.interface.encodeFunctionData("registerAgent", [
        trimmedMetadataUri,
        capabilityInput,
        riskLevelValue,
        isDeterministic,
      ]);

      prependProtocolLog(
        "Calldata Encoded",
        `registerAgent payload size ${Math.max((registerCallData.length - 2) / 2, 0)} bytes`,
        "text-cyan-300",
      );

      const tx = await signer.sendTransaction({
        to: getAgentRegistryAddress(),
        data: registerCallData,
        value: latestStake,
        gasLimit,
      });

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
      toast({
        title: "Registration failed",
        description: extractReadableError(error),
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
          Register Your <span className="bg-clip-text text-transparent bg-gradient-to-r from-trust-blue to-trust-purple">AI Agent</span>
        </h1>
        <p className="max-w-3xl text-lg leading-relaxed mt-4 text-[#c2c5d0]">
          Identity, configuration, and metadata now flow together. Generate standards-aligned metadata off-chain, store it on IPFS, and register the resulting URI on Hedera.
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
            }}
          >
            <div className="flex items-start gap-4 px-5 py-4">
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
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
                }}
              >
                <span className="material-symbols-outlined text-[22px] text-white">
                  {feedbackModal.tone === "success" ? "check_circle" : feedbackModal.tone === "error" ? "error" : "warning"}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-200">{feedbackModal.title}</p>
                <p className="mt-2 text-base font-semibold leading-relaxed text-slate-100">{feedbackModal.message}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isMetadataModalOpen && generatedMetadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setIsMetadataModalOpen(false)}>
          <div className="absolute inset-0 bg-[rgba(3,7,18,0.72)] backdrop-blur-xl" />
          <section
            className="relative z-10 w-full max-w-4xl overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(8,18,34,0.97),rgba(6,12,25,0.98))] shadow-[0_30px_80px_rgba(14,165,233,0.12)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">Metadata Preview</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Generated Agent Metadata</h3>
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
                  <h2 className="text-[20px] font-semibold text-white">Agent Identity</h2>
                  <p className="text-sm text-slate-500">Owner-controlled DID plus generated UAID.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-[18px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),rgba(15,23,42,0.94)_62%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Hedera DID</p>
                      <p className="text-[11px] text-cyan-200/80">Owner-issued identity reference</p>
                    </div>
                    <div className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isValidDidWeb(didWebValue) ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-slate-300"}`}>
                      {isValidDidWeb(didWebValue) ? "ready" : "pending"}
                    </div>
                  </div>
                  <label className="mt-4 block text-[11px] font-medium text-slate-300 mb-2">DID</label>
                  <input
                    className="w-full bg-slate-950/70 border border-cyan-300/10 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-cyan-400/40 focus:border-transparent outline-none"
                    placeholder="did:hedera:testnet:DZv8..._0.0.2666979"
                    value={didWebValue}
                    onChange={(event) => setDidWebValue(event.target.value)}
                  />
                  <p className="mt-2 text-[11px] leading-5 text-slate-400">Format: `did:hedera:&lt;network&gt;:&lt;identifier&gt;_&lt;topicId&gt;`</p>
                </div>

                <div className="rounded-[18px] border border-fuchsia-400/15 bg-[radial-gradient(circle_at_top_right,rgba(192,132,252,0.16),rgba(15,23,42,0.94)_62%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">UAID</p>
                      <p className="text-[11px] text-fuchsia-200/80">Generated with the HCS-14 SDK</p>
                    </div>
                    <button
                      onClick={copyUaid}
                      disabled={!generatedUaid}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="mt-4 rounded-xl border border-fuchsia-200/10 bg-black/25 p-3 text-xs text-slate-200 break-all min-h-[62px]">
                    {generatedUaid || "No UAID generated yet."}
                  </div>
                  <div className="mt-3 inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-slate-300">
                    {generatedRecipe ? `${getRecipeBadge(generatedRecipe)} ready` : "Generate a UAID to continue"}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,17,31,0.9),rgba(8,12,24,0.76))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex bg-black/40 p-1 rounded-[12px] border border-slate-700/50 gap-1">
                  {([
                    { key: "A2A", label: "A2A / Web2" },
                    { key: "HEDERA_DID", label: "Hedera DID" },
                    { key: "EVM", label: "EVM (EIP-155)" },
                  ] as const).map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setUaidRecipe(option.key)}
                      className={`flex-1 py-2 text-[11px] font-bold rounded-[8px] transition-all ${uaidRecipe === option.key ? "bg-gradient-to-r from-trust-blue to-trust-purple text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]" : "text-slate-500 hover:text-slate-300"}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {uaidRecipe !== "HEDERA_DID" && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">UAID Name</label>
                      <input
                        className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                        placeholder="e.g. AgentTrust Router"
                        value={uaidName}
                        onChange={(event) => setUaidName(event.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Version</label>
                    <input
                      className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                      value={uaidVersion}
                      onChange={(event) => setUaidVersion(event.target.value)}
                    />
                  </div>
                  {uaidRecipe === "A2A" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Protocol</label>
                        <select
                          className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                          value={uaidProtocol}
                          onChange={(event) => setUaidProtocol(event.target.value as UaidProtocol)}
                        >
                          <option value="rest">REST</option>
                          <option value="hcs-10">HCS-10</option>
                          <option value="a2a">A2A</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Native ID</label>
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                          placeholder="service://router"
                          value={uaidNativeId}
                          onChange={(event) => setUaidNativeId(event.target.value)}
                        />
                      </div>
                    </>
                  )}
                  {uaidRecipe === "EVM" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Chain ID</label>
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                          value={evmChainId}
                          onChange={(event) => setEvmChainId(event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Address</label>
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                          placeholder="0x..."
                          value={evmAddress}
                          onChange={(event) => setEvmAddress(event.target.value)}
                        />
                      </div>
                    </>
                  )}
                  {uaidRecipe !== "HEDERA_DID" && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-2">Skills (comma-separated)</label>
                      <input
                        className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                        placeholder="0, 4, 17, 50301"
                        value={uaidSkillsInput}
                        onChange={(event) => setUaidSkillsInput(event.target.value)}
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={generateUaid}
                  disabled={isGeneratingUaid}
                  className="mt-5 h-[48px] rounded-[14px] bg-vibrant-gradient px-6 text-sm font-bold text-white shadow-[0_8px_25px_-5px_rgba(111,140,255,0.4)] disabled:opacity-60"
                >
                  {isGeneratingUaid ? "Generating UAID..." : "Generate UAID"}
                </button>
              </div>
            </div>

            <div className="glass-effect rounded-[22px] p-7 border border-white/10 shadow-[0_24px_70px_rgba(4,10,25,0.34)]">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-trust-blue flex items-center justify-center font-bold text-sm text-white">2</span>
                <div>
                  <h2 className="text-[20px] font-semibold text-white">Agent Configuration</h2>
                  <p className="text-sm text-slate-500">Define what the agent is and how it executes.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Agent Name</label>
                  <input
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-trust-blue outline-none"
                    placeholder="e.g. Multi-Protocol Agent"
                    value={agentName}
                    onChange={(event) => setAgentName(event.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Endpoint</label>
                  <input
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-trust-blue outline-none"
                    placeholder="https://agent.example.com"
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Description</label>
                <textarea
                  className="h-[76px] w-full resize-none bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                  placeholder="Describe the agent and the behavior users should expect..."
                  rows={2}
                  value={agentDescription}
                  onChange={(event) => setAgentDescription(event.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Skill ID</label>
                  <input
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                    placeholder="e.g. 4 or 50301"
                    value={capabilitySkillId}
                    onChange={(event) => setCapabilitySkillId(event.target.value)}
                  />
                  <p className="mt-2 text-[11px] text-slate-500">Accepts HCS-14 `0-39` and OASF `100+`. `40-99` stays reserved.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Capability Name</label>
                  <input
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-1 focus:ring-trust-blue outline-none"
                    placeholder="e.g. API Integration"
                    value={capabilityName}
                    onChange={(event) => setCapabilityName(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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

              <div className="grid grid-cols-3 gap-3 mb-6">
                {riskOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setRiskLevel(opt.key)}
                    className={`h-[84px] rounded-xl border text-center transition-all hover:-translate-y-0.5 ${riskLevel === opt.key ? "border-trust-blue-glow bg-trust-blue/10 shadow-[0_0_15px_rgba(91,140,255,0.3)]" : "border-slate-700 hover:border-slate-500 bg-transparent"}`}
                  >
                    <p className={`pt-3 text-[11px] font-bold uppercase tracking-wider mb-1 ${riskLevel === opt.key ? "text-trust-blue" : "text-slate-400"}`}>{opt.label}</p>
                    <p className="text-xs text-slate-300 font-semibold">{formatHbarAmount(stakeOptions[opt.key])} HBAR</p>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 p-4 bg-slate-900/40 rounded-xl border border-slate-800 mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-200">Execution Mode</p>
                  <p className="text-xs text-slate-500">Used for both metadata and validation strategy.</p>
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

            <div
              className={`glass-effect rounded-[22px] p-7 border transition-all duration-300 ${generatedMetadataUri ? "border-emerald-400/35 shadow-[0_0_32px_rgba(16,185,129,0.14)]" : "border-white/10 shadow-[0_24px_70px_rgba(4,10,25,0.34)]"}`}
            >
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-trust-blue flex items-center justify-center font-bold text-sm text-white">3</span>
                <div>
                  <h2 className="text-[20px] font-semibold text-white">Metadata Generation</h2>
                  <p className="text-sm text-slate-500">Metadata is generated and stored on IPFS automatically based on your configuration.</p>
                </div>
              </div>

              <div className="rounded-[16px] border border-white/10 bg-slate-950/35 p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {generatedMetadataUri ? "Metadata stored on IPFS" : "Metadata not generated"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {generatedMetadataUri ? generatedMetadataUri : "Generate metadata to produce the final contract-ready metadata URI."}
                    </p>
                  </div>
                  {generatedCid && (
                    <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                      CID: {generatedCid}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={generateMetadata}
                    disabled={isGeneratingMetadata}
                    className="h-[48px] rounded-[14px] bg-vibrant-gradient px-6 text-sm font-bold text-white shadow-[0_8px_25px_-5px_rgba(111,140,255,0.4)] disabled:opacity-60"
                  >
                    {isGeneratingMetadata ? "Generating Metadata..." : "Generate Metadata"}
                  </button>
                  <button
                    onClick={() => setIsMetadataModalOpen(true)}
                    disabled={!generatedMetadata}
                    className="h-[48px] rounded-[14px] border border-white/10 px-6 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
                  >
                    Show Metadata
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className={`rounded-xl border px-4 py-3 ${isValidDidWeb(didWebValue) ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
                    DID {isValidDidWeb(didWebValue) ? "ready" : "required"}
                  </div>
                  <div className={`rounded-xl border px-4 py-3 ${generatedUaid ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
                    UAID {generatedUaid ? "generated" : "required"}
                  </div>
                  <div className={`rounded-xl border px-4 py-3 ${generatedMetadataUri ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
                    Metadata {generatedMetadataUri ? "uploaded" : "required"}
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-effect rounded-[24px] p-8 border border-trust-blue/15 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.22),rgba(9,14,28,0.94)_58%)] shadow-[0_26px_80px_rgba(37,99,235,0.18)]">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div>
                  <p className="text-slate-400 mb-1 text-base">Required Security Deposit</p>
                  <span className="font-bold text-white tracking-tight text-3xl">{requiredStakeLabel}</span>
                </div>
                <p className="max-w-md text-sm text-slate-300">
                  Registration stays disabled until the owner DID, generated UAID, and IPFS metadata are all ready.
                </p>
                <button
                  onClick={registerAgent}
                  disabled={!canRegister || isSubmitting || isLoadingStake}
                  className={`min-w-[220px] h-[60px] rounded-[18px] px-10 text-base font-black tracking-[0.04em] transition-all ${canRegister && !isSubmitting ? "bg-vibrant-gradient text-white shadow-[0_16px_40px_-10px_rgba(111,140,255,0.72),0_0_0_1px_rgba(255,255,255,0.08)] hover:brightness-110 hover:-translate-y-1" : "bg-slate-800/80 text-slate-500 cursor-not-allowed border border-white/5"}`}
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
                <p className="text-xs text-slate-500">Pinned side rail for local workflow and on-chain status.</p>
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
                    <p className="text-slate-500 opacity-80">No protocol activity yet. Generate metadata or register an agent to populate the feed.</p>
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

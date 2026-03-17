import { useEffect, useMemo, useState } from "react";
import AgentDetailsModal from "@/components/AgentDetailsModal";
import ComposeTaskModal from "@/components/ComposeTaskModal";
import { authorizeAgentCapabilities, fetchAgents, type Agent } from "@/lib/hedera";
import { toast } from "@/components/ui/sonner";

const staticAgents: Agent[] = [
  {
    name: "Sentience Alpha",
    type: "DeFi Strategy",
    domain: "DeFi Strategy",
    riskLevel: 0,
    riskLabel: "Low Risk",
    riskColor: "green",
    trustScore: 78,
    rating: 4.6,
    stars: [true, true, true, true, false],
    halfStar: true,
    tags: ["DeFi Trading"],
    verified: "Consensus Verified",
    verifiedIcon: "verified",
    gradient: "from-blue-500 to-cyan-500",
    shadowColor: "shadow-blue-500/20",
    agentId: 1,
    initials: "SA",
    description: "Advanced autonomous entity specialized in high-frequency DeFi trading strategies and cross-protocol arbitrage. Optimized for Ethereum and Solana ecosystems with 99.9% uptime.",
    capabilities: [
      { name: "DeFi Trading", active: true },
      { name: "Arbitrage", active: true },
      { name: "Liquidity Farming", active: false },
    ],
    requiresUserAuthorization: true,
  },
  {
    name: "Neural Yield",
    type: "Aggregator",
    domain: "Aggregator",
    riskLevel: 1,
    riskLabel: "Medium Risk",
    riskColor: "yellow",
    trustScore: 62,
    rating: 4.1,
    stars: [true, true, true, true, false],
    halfStar: false,
    tags: ["Liquidity Farming"],
    verified: "Deterministic",
    verifiedIcon: "memory",
    gradient: "from-purple-500 to-pink-500",
    shadowColor: "shadow-purple-500/20",
    agentId: 2,
    initials: "NY",
    description: "Intelligent yield aggregator that automatically routes liquidity across multiple DeFi protocols to maximize returns. Supports multi-chain farming with dynamic rebalancing.",
    capabilities: [
      { name: "Liquidity Farming", active: true },
      { name: "Yield Optimization", active: true },
      { name: "Portfolio Rebalancing", active: false },
    ],
    requiresUserAuthorization: true,
  },
  {
    name: "Omni Arbitrage",
    type: "Cross-chain",
    domain: "Cross-chain",
    riskLevel: 2,
    riskLabel: "High Risk",
    riskColor: "red",
    trustScore: 91,
    rating: 4.9,
    stars: [true, true, true, true, true],
    halfStar: false,
    tags: ["MEV Protection"],
    verified: "Consensus Verified",
    verifiedIcon: "verified",
    gradient: "from-orange-500 to-red-500",
    shadowColor: "shadow-orange-500/20",
    agentId: 3,
    initials: "OA",
    description: "Cross-chain arbitrage engine with built-in MEV protection. Executes atomic swaps across Ethereum, Solana, and Cosmos ecosystems with sub-second latency and advanced slippage control.",
    capabilities: [
      { name: "Cross-chain Swaps", active: true },
      { name: "MEV Protection", active: true },
      { name: "Flash Loans", active: true },
    ],
    requiresUserAuthorization: true,
  },
];

const riskColors: Record<string, string> = {
  green: "bg-green-500/10 text-green-500 border-green-500/20",
  yellow: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  red: "bg-red-500/10 text-red-500 border-red-500/20",
};

const AGENTS_PER_PAGE = 6;

type FilterOption = { value: string; label: string };

function FilterChipSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}) {
  const activeLabel = options.find((option) => option.value === value)?.label ?? options[0].label;

  return (
    <div className="relative group">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="appearance-none h-9 min-w-[160px] pl-4 pr-8 rounded-full border border-white/10 bg-white/5 text-sm font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-trust-accent-blue/40 focus:border-trust-accent-blue/40"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-slate-900">
            {option.label}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] leading-none transition-colors ${
          value === options[0].value ? "text-slate-500" : "text-trust-accent-blue"
        }`}
      >
        expand_more
      </span>
      {value !== options[0].value && (
        <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-trust-accent-blue/25" aria-hidden="true" />
      )}
      <span className="sr-only">{activeLabel}</span>
    </div>
  );
}

export default function ExplorePage() {
  const [mode, setMode] = useState<"user" | "agent">("user");
  const [search, setSearch] = useState("");
  const [selectedCapability, setSelectedCapability] = useState("all");
  const [selectedTrustScore, setSelectedTrustScore] = useState("all");
  const [selectedDomain, setSelectedDomain] = useState("all");
  const [selectedRiskLevel, setSelectedRiskLevel] = useState("all");
  const [selectedExecutionType, setSelectedExecutionType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [detailsAgent, setDetailsAgent] = useState<{
    name: string;
    agentId: string;
    rawAgentId: number;
    description: string;
    securityTier: string;
    riskColor: string;
    capabilities: { name: string; active: boolean }[];
    authorizedCount: number;
  } | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [composeAgent, setComposeAgent] = useState<Agent | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      try {
        const blockchainAgents = await fetchAgents();
        if (!cancelled) {
          setAgents(blockchainAgents);
        }
      } catch (error) {
        console.warn("Unable to load blockchain agents", error);
      }
    }

    loadAgents();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthorizeCapabilities = async (agentId: number, capabilities: string[]) => {
    const selectedCapabilities = capabilities
      .map((capability) => capability.trim())
      .filter(Boolean);

    if (selectedCapabilities.length === 0) {
      toast.error("Select at least one capability to authorize.");
      return;
    }

    setIsAuthorizing(true);

    try {
      const { hash } = await authorizeAgentCapabilities(agentId, selectedCapabilities);
      toast.success("Authorization submitted", {
        description: `Authorized ${selectedCapabilities.length} capabilities. Tx: ${hash.slice(0, 10)}...`,
      });
    } catch (error) {
      toast.error("Authorization failed", {
        description: error instanceof Error ? error.message : "Unable to authorize capabilities",
      });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const allAgents = useMemo(() => [...agents, ...staticAgents], [agents]);

  const capabilityOptions = useMemo(() => {
    const capabilities = new Set<string>();
    allAgents.forEach((agent) => {
      agent.capabilities.forEach((capability) => capabilities.add(capability.name));
    });
    return Array.from(capabilities).sort((a, b) => a.localeCompare(b));
  }, [allAgents]);

  const domainOptions = useMemo(() => {
    const domains = new Set<string>();
    allAgents.forEach((agent) => {
      if (agent.domain) {
        domains.add(agent.domain);
      }
    });
    return Array.from(domains).sort((a, b) => a.localeCompare(b));
  }, [allAgents]);

  const executionTypeOptions = useMemo(() => {
    const executionTypes = new Set<string>();
    allAgents.forEach((agent) => {
      if (agent.type) {
        executionTypes.add(agent.type);
      }
    });
    return Array.from(executionTypes).sort((a, b) => a.localeCompare(b));
  }, [allAgents]);

  const capabilityFilterOptions = useMemo(
    () => [
      { value: "all", label: "Capability" },
      ...capabilityOptions.map((capability) => ({ value: capability, label: capability })),
    ],
    [capabilityOptions],
  );

  const trustScoreFilterOptions: FilterOption[] = [
    { value: "all", label: "Trust Score" },
    { value: "80_plus", label: "80 and above" },
    { value: "60_79", label: "60 - 79" },
    { value: "below_60", label: "Below 60" },
  ];

  const domainFilterOptions = useMemo(
    () => [
      { value: "all", label: "Domain" },
      ...domainOptions.map((domain) => ({ value: domain, label: domain })),
    ],
    [domainOptions],
  );

  const riskLevelFilterOptions: FilterOption[] = [
    { value: "all", label: "Risk Level" },
    { value: "0", label: "Low Risk" },
    { value: "1", label: "Medium Risk" },
    { value: "2", label: "High Risk" },
  ];

  const executionTypeFilterOptions = useMemo(
    () => [
      { value: "all", label: "Execution Type" },
      ...executionTypeOptions.map((executionType) => ({ value: executionType, label: executionType })),
    ],
    [executionTypeOptions],
  );

  const filteredAgents = useMemo(() => {
    return allAgents.filter((agent) => {
      if (search) {
        const query = search.toLowerCase();
        const matchesSearch =
          agent.name.toLowerCase().includes(query) ||
          agent.type.toLowerCase().includes(query) ||
          agent.domain.toLowerCase().includes(query) ||
          agent.capabilities.some((capability) => capability.name.toLowerCase().includes(query));

        if (!matchesSearch) {
          return false;
        }
      }

      if (selectedCapability !== "all" && !agent.capabilities.some((capability) => capability.name === selectedCapability)) {
        return false;
      }

      if (selectedDomain !== "all" && agent.domain !== selectedDomain) {
        return false;
      }

      if (selectedRiskLevel !== "all") {
        const riskValue = Number(selectedRiskLevel);
        if (agent.riskLevel !== riskValue) {
          return false;
        }
      }

      if (selectedExecutionType !== "all" && agent.type !== selectedExecutionType) {
        return false;
      }

      if (selectedTrustScore !== "all") {
        const trustScore = agent.trustScore;
        switch (selectedTrustScore) {
          case "80_plus":
            if (trustScore < 80) return false;
            break;
          case "60_79":
            if (trustScore < 60 || trustScore > 79) return false;
            break;
          case "below_60":
            if (trustScore >= 60) return false;
            break;
          default:
            break;
        }
      }

      return true;
    });
  }, [
    allAgents,
    search,
    selectedCapability,
    selectedDomain,
    selectedExecutionType,
    selectedRiskLevel,
    selectedTrustScore,
  ]);

  const clearAllFilters = () => {
    setSearch("");
    setSelectedCapability("all");
    setSelectedTrustScore("all");
    setSelectedDomain("all");
    setSelectedRiskLevel("all");
    setSelectedExecutionType("all");
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCapability, selectedTrustScore, selectedDomain, selectedRiskLevel, selectedExecutionType]);

  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / AGENTS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const paginatedAgents = useMemo(() => {
    const startIndex = (currentPage - 1) * AGENTS_PER_PAGE;
    return filteredAgents.slice(startIndex, startIndex + AGENTS_PER_PAGE);
  }, [currentPage, filteredAgents]);

  const blockchainAgentsById = useMemo(() => {
    return new Map(agents.map((agent) => [agent.agentId, agent]));
  }, [agents]);

  const buildModalAgentDetails = (agent: Agent) => {
    const onChainAgent = blockchainAgentsById.get(agent.agentId);
    const source = onChainAgent ?? agent;
    const capabilities = (source.capabilities.length ? source.capabilities : agent.capabilities).map((capability) => ({
      name: capability.name,
      active: capability.active,
    }));

    return {
      name: source.name || agent.name,
      agentId: `#${String(source.agentId ?? agent.agentId).padStart(3, "0")}`,
      rawAgentId: source.agentId ?? agent.agentId,
      description: source.description || agent.description,
      securityTier: source.riskLabel || agent.riskLabel,
      riskColor: source.riskColor || agent.riskColor,
      capabilities,
      authorizedCount: capabilities.filter((capability) => capability.active).length,
    };
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full px-6 py-16 space-y-16">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-[50px] font-bold tracking-tight mb-4">
          Discover <span className="text-gradient">AI Agents</span>
        </h1>
        <p className="text-slate-300 text-lg max-w-2xl font-normal">
          Search and discover autonomous agents verified by the AgentTrust protocol.
          High-assurance execution for decentralized workflows.
        </p>
      </div>

      <div className="flex flex-col items-center gap-8">
        {/* Mode Toggle */}
        <div className="inline-flex p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            onClick={() => setMode("user")}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-lg font-medium text-sm transition-all ${mode === "user" ? "btn-gradient text-white" : "text-slate-400 hover:text-white"}`}
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
            User Mode
          </button>
          <button
            onClick={() => setMode("agent")}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-lg font-medium text-sm transition-all ${mode === "agent" ? "btn-gradient text-white" : "text-slate-400 hover:text-white"}`}
          >
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
            Agent Mode
          </button>
        </div>

        {/* Search */}
        <div className="w-full max-w-3xl">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-slate-500 text-xl">search</span>
            </div>
            <input
              className="search-container block w-full h-12 pl-12 pr-28 bg-[rgba(20,28,45,0.9)] border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all"
              placeholder="Search by name, domain, or capability..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="absolute inset-y-0 right-1.5 flex items-center">
              <button className="btn-gradient px-6 h-9 rounded-lg text-white text-sm font-medium">Search</button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <FilterChipSelect value={selectedCapability} onChange={setSelectedCapability} options={capabilityFilterOptions} />
          <FilterChipSelect value={selectedTrustScore} onChange={setSelectedTrustScore} options={trustScoreFilterOptions} />
          <FilterChipSelect value={selectedDomain} onChange={setSelectedDomain} options={domainFilterOptions} />
          <FilterChipSelect value={selectedRiskLevel} onChange={setSelectedRiskLevel} options={riskLevelFilterOptions} />
          <FilterChipSelect value={selectedExecutionType} onChange={setSelectedExecutionType} options={executionTypeFilterOptions} />
          <div className="w-px h-6 bg-white/10 mx-2" />
          <button
            onClick={clearAllFilters}
            className="h-10 px-4 rounded-full border border-trust-accent-blue/30 bg-trust-accent-blue/10 text-trust-accent-blue text-sm font-medium hover:bg-trust-accent-blue/20 transition-all"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedAgents.map((agent) => (
            <div key={`${agent.agentId}-${agent.name}`} className="landing-card rounded-xl p-6 flex flex-col min-h-[420px]">
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-4">
                  <div className={`size-14 rounded-xl bg-gradient-to-br ${agent.gradient} p-0.5 shadow-lg ${agent.shadowColor}`}>
                    <div className="w-full h-full rounded-[10px] bg-[#0a0f14] flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl text-white">smart_toy</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-white">{agent.name}</h3>
                    <p className="text-slate-400/80 text-sm">{agent.type}</p>
                  </div>
                </div>
                <span className={`${riskColors[agent.riskColor]} text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider border`}>{agent.riskLabel}</span>
              </div>
              <div className="mb-6 space-y-4">
                <div>
                  <div className="flex justify-between text-[11px] font-bold mb-1.5 uppercase tracking-wider text-slate-500">
                    <span>Trust Score</span>
                    <span className="text-slate-200">{agent.trustScore} / 100</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full btn-gradient rounded-full" style={{ width: `${agent.trustScore}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex text-yellow-500">
                    {agent.stars.map((filled, i) => (
                      <span key={i} className={`material-symbols-outlined text-[18px] ${filled ? "fill-1" : ""}`}>
                        {filled ? "star" : agent.halfStar && i === agent.stars.length - 1 ? "star_half" : "star_outline"}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-medium text-slate-400/80">{agent.rating} / 5.0</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-8">
                {agent.tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-xs font-medium text-slate-400/80">{tag}</span>
                ))}
                <span className="px-3 py-1 bg-trust-accent-blue/10 border border-trust-accent-blue/10 rounded-lg text-xs font-medium text-trust-accent-blue flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">{agent.verifiedIcon}</span>
                  {agent.verified}
                </span>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-3">
                <button onClick={() => setDetailsAgent(buildModalAgentDetails(agent))} className="h-11 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 font-medium text-sm transition-all text-white">View Details</button>
                <button onClick={() => setComposeAgent(agent)} className="h-11 rounded-lg btn-gradient font-medium text-sm text-white">Compose Task</button>
              </div>
            </div>
          ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-slate-400">
          Showing {paginatedAgents.length} of {filteredAgents.length} agents
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
            disabled={currentPage === 1}
            className="h-10 px-4 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-white transition-all enabled:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm font-medium text-slate-300 min-w-[96px] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((previous) => Math.min(totalPages, previous + 1))}
            disabled={currentPage === totalPages}
            className="h-10 px-4 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-white transition-all enabled:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* Chain-of-Task Builder */}
      <div className="p-8 landing-card rounded-xl border-dashed border-2 border-trust-accent-blue/20 relative overflow-hidden h-auto">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <span className="material-symbols-outlined text-9xl">hub</span>
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-trust-accent-blue/10 text-trust-accent-blue text-[11px] font-bold uppercase tracking-wider mb-4 border border-trust-accent-blue/20">
              <span className="material-symbols-outlined text-[14px]">account_tree</span>
              Chain-of-Task Builder
            </div>
            <h2 className="text-2xl font-semibold mb-3 text-white">Build Multi-Agent Workflows</h2>
            <p className="text-slate-400/80 text-sm leading-relaxed">Combine multiple verified agents into a single atomic operation. Our trust registry ensures data integrity across the entire execution chain.</p>
          </div>
          <button className="whitespace-nowrap flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 px-8 h-12 rounded-lg font-medium transition-all text-white">
            Coming Soon <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
        <div className="mt-8 grid grid-cols-4 gap-4 opacity-40">
          <div className="h-1.5 rounded-full bg-trust-accent-blue/30 relative">
            <div className="absolute -top-1 -left-1 size-3.5 rounded-full bg-trust-accent-blue border-[3px] border-[#0a0f14]" />
          </div>
          <div className="h-1.5 rounded-full bg-white/10" />
          <div className="h-1.5 rounded-full bg-white/10" />
          <div className="h-1.5 rounded-full bg-white/10" />
        </div>
      </div>
      {detailsAgent && (
        <AgentDetailsModal
          agent={detailsAgent}
          isAuthorizing={isAuthorizing}
          onAuthorizeSelectedCapabilities={(capabilities) => handleAuthorizeCapabilities(detailsAgent.rawAgentId, capabilities)}
          onAuthorizeAllCapabilities={(capabilities) => handleAuthorizeCapabilities(detailsAgent.rawAgentId, capabilities)}
          onClose={() => setDetailsAgent(null)}
        />
      )}

      {composeAgent && (
        <ComposeTaskModal
          agentId={composeAgent.agentId}
          agentName={composeAgent.name}
          agentInitials={composeAgent.initials}
          capabilities={composeAgent.capabilities.map((capability) => capability.name)}
          onClose={() => setComposeAgent(null)}
        />
      )}
    </div>
  );
}

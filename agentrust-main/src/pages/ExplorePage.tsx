import { useEffect, useState } from "react";
import AgentDetailsModal from "@/components/AgentDetailsModal";
import ComposeTaskModal from "@/components/ComposeTaskModal";
import { fetchAgents, type Agent } from "@/lib/hedera";

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

export default function ExplorePage() {
  const [mode, setMode] = useState<"user" | "agent">("user");
  const [search, setSearch] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [detailsAgent, setDetailsAgent] = useState<Agent | null>(null);
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

  const allAgents = [...agents, ...staticAgents];

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
          {["Capability", "Trust Score", "Domain", "Risk Level", "Execution Type"].map((f) => (
            <button key={f} className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm font-medium text-slate-300">
              <span>{f}</span>
              <span className="material-symbols-outlined text-sm">expand_more</span>
            </button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-2" />
          <button className="text-trust-accent-blue text-sm font-medium hover:underline">Clear all</button>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allAgents
          .filter((agent) => {
            if (!search) {
              return true;
            }

            const query = search.toLowerCase();
            return (
              agent.name.toLowerCase().includes(query) ||
              agent.type.toLowerCase().includes(query) ||
              agent.domain.toLowerCase().includes(query) ||
              agent.capabilities.some((capability) =>
                capability.name.toLowerCase().includes(query),
              )
            );
          })
          .map((agent) => (
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
                <button onClick={() => setDetailsAgent(agent)} className="h-11 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 font-medium text-sm transition-all text-white">View Details</button>
                <button onClick={() => setComposeAgent(agent)} className="h-11 rounded-lg btn-gradient font-medium text-sm text-white">Compose Task</button>
              </div>
            </div>
          ))}
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
          agent={{
            name: detailsAgent.name,
            agentId: `#${String(detailsAgent.agentId).padStart(3, "0")}`,
            description: detailsAgent.description,
            risk: detailsAgent.riskLabel,
            riskColor: detailsAgent.riskColor,
            capabilities: detailsAgent.capabilities,
            authorizedCount: detailsAgent.capabilities.filter((c) => c.active).length,
          }}
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

import { useEffect, useMemo, useState } from "react";
import { fetchExecutionHistory, type ExecutionHistoryEntry } from "@/lib/hedera";

const fallbackExecutions: ExecutionHistoryEntry[] = [
  {
    id: "fallback-1",
    txHash: "0x4a7e48392f3d2e1",
    source: "Validation",
    eventType: "ExecutionFinalized",
    entity: "Agent AlphaStrategy_v2",
    eventClass: "Validation",
    eventColor: "text-blue-400",
    outcome: "Accepted",
    outcomeColor: "text-green-400",
    timestampLabel: "16:02:10",
    timestampValue: Date.now() - 100000,
    description: "Execution #82910 accepted by consensus",
    detailJson: JSON.stringify({ executionId: 82910, agent: "AlphaStrategy_v2" }, null, 2),
  },
  {
    id: "fallback-2",
    txHash: "0x7c2299a93ef8a2",
    source: "Validation",
    eventType: "ExecutionFinalized",
    entity: "Agent SentimentBot",
    eventClass: "Validation",
    eventColor: "text-purple-400",
    outcome: "Rejected",
    outcomeColor: "text-red-400",
    timestampLabel: "16:01:22",
    timestampValue: Date.now() - 160000,
    description: "Execution #82909 rejected by consensus",
    detailJson: JSON.stringify({ executionId: 82909, agent: "SentimentBot" }, null, 2),
  },
  {
    id: "fallback-3",
    txHash: "0x1b778262ae9c3",
    source: "Reputation",
    eventType: "TrustScoreUpdated",
    entity: "Agent YieldOptimizer",
    eventClass: "Reputation",
    eventColor: "text-amber-400",
    outcome: "Accepted",
    outcomeColor: "text-green-400",
    timestampLabel: "16:00:10",
    timestampValue: Date.now() - 220000,
    description: "Trust score updated after accepted validation",
    detailJson: JSON.stringify({ agent: "YieldOptimizer", outcome: "accepted" }, null, 2),
  },
  {
    id: "fallback-4",
    txHash: "0x2d919929a5b2",
    source: "Staking",
    eventType: "Staked",
    entity: "Agent RiskAnalyzer",
    eventClass: "Staking",
    eventColor: "text-emerald-400",
    outcome: "Staked",
    outcomeColor: "text-emerald-400",
    timestampLabel: "15:59:04",
    timestampValue: Date.now() - 300000,
    description: "Stake deposited for agent",
    detailJson: JSON.stringify({ agent: "RiskAnalyzer", amount: "500 HBAR" }, null, 2),
  },
  {
    id: "fallback-5",
    txHash: "0x9f11a282e1d4",
    source: "HCS",
    eventType: "HCS_EVENT",
    entity: "Protocol",
    eventClass: "HCS",
    eventColor: "text-slate-300",
    outcome: "Logged",
    outcomeColor: "text-slate-300",
    timestampLabel: "15:58:22",
    timestampValue: Date.now() - 340000,
    description: "ExecutionSubmitted -> Execution #82906 for Agent #7",
    detailJson: JSON.stringify({ message: "ExecutionSubmitted -> Execution #82906 for Agent #7" }, null, 2),
  },
];

const filters = ["All", "Validation", "Reputation", "Staking", "AgentRegistry", "HCS", "Accepted", "Rejected"];

export default function ExecutionsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedExecution, setSelectedExecution] = useState<ExecutionHistoryEntry>(fallbackExecutions[0]);
  const [search, setSearch] = useState("");
  const [historyEntries, setHistoryEntries] = useState<ExecutionHistoryEntry[]>(fallbackExecutions);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const events = await fetchExecutionHistory(80);
        if (!isMounted) return;
        setHistoryEntries(events.length ? events : fallbackExecutions);
        setSelectedExecution((current) => events[0] ?? current ?? fallbackExecutions[0]);
      } catch {
        if (!isMounted) return;
        setHistoryEntries(fallbackExecutions);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadHistory();
    const intervalId = window.setInterval(() => void loadHistory(), 20000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const filtered = useMemo(() => {
    return historyEntries.filter((entry) => {
      if (search) {
        const haystack = `${entry.id} ${entry.txHash} ${entry.entity} ${entry.eventType}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (activeFilter === "All") return true;
      if (["Validation", "Reputation", "Staking", "AgentRegistry", "HCS"].includes(activeFilter)) {
        return entry.eventClass === activeFilter;
      }
      if (activeFilter === "Accepted") return entry.outcome.toLowerCase().includes("accepted");
      if (activeFilter === "Rejected") return entry.outcome.toLowerCase().includes("rejected");
      return true;
    });
  }, [activeFilter, historyEntries, search]);

  useEffect(() => {
    if (filtered.length === 0) return;

    const selectedInFiltered = filtered.some((entry) => entry.id === selectedExecution.id);
    if (!selectedInFiltered) {
      setSelectedExecution(filtered[0]);
    }
  }, [filtered, selectedExecution.id]);

  const parsedEventDetail = useMemo(() => {
    try {
      const parsed = JSON.parse(selectedExecution.detailJson) as Record<string, unknown>;
      return parsed;
    } catch {
      return { raw: selectedExecution.detailJson } satisfies Record<string, unknown>;
    }
  }, [selectedExecution.detailJson]);

  const inspectionJson = useMemo(() => {
    return JSON.stringify(
      {
        event: {
          id: selectedExecution.id,
          type: selectedExecution.eventType,
          source: selectedExecution.source,
          class: selectedExecution.eventClass,
          entity: selectedExecution.entity,
          outcome: selectedExecution.outcome,
          txHash: selectedExecution.txHash,
          timestamp: {
            label: selectedExecution.timestampLabel,
            value: selectedExecution.timestampValue,
          },
          description: selectedExecution.description,
        },
        emittedArgs: parsedEventDetail,
      },
      null,
      2,
    );
  }, [parsedEventDetail, selectedExecution]);

  return (
    <div className="relative z-10 max-w-[1280px] mx-auto px-6 py-10">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      {/* Hero */}
      <section className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
          Execution <span className="text-gradient">History</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl leading-relaxed">
          Transparent audit trail of AI agent executions, validator consensus, and protocol verification events. All operations are cryptographically secured.
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: "Total Executions", value: "1,284,092", badge: "+12.5%", badgeColor: "text-green-400 bg-green-400/10" },
          { label: "Successful", value: "99.2%", badge: null },
          { label: "Rejected", value: "432", badge: "Consensus Fail", badgeColor: "text-red-400 bg-red-400/10" },
          { label: "Deterministic", value: "84%", badge: "zk-Proof", badgeColor: "text-purple-400 bg-purple-400/10" },
        ].map((s) => (
          <div key={s.label} className="glass-effect p-6 rounded-twelve hover:translate-y-[-4px] transition-all duration-300 group min-h-[120px]">
            <p className="text-slate-400 text-sm mb-2 font-medium">{s.label}</p>
            <div className="flex items-end justify-between">
              <h3 className="text-3xl font-bold text-white">{s.value}</h3>
              {s.badge && <span className={`${s.badgeColor} text-xs font-mono px-2 py-1 rounded`}>{s.badge}</span>}
            </div>
          </div>
        ))}
      </section>

      {/* Search + Filters */}
      <section className="mb-8 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-slate-500">search</span>
            </div>
            <input
              className="w-full bg-slate-900/50 border border-white/10 rounded-twelve py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none transition-all"
              placeholder="Search by Execution ID, Transaction Hash, or Agent Address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 no-scrollbar">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeFilter === f ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Table + Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[2.15fr_1fr] gap-[28px]" style={{ alignItems: "stretch" }}>
        <div
          className="glass-effect rounded-twelve flex flex-col overflow-hidden border border-white/10 shadow-[0_20px_80px_rgba(76,92,255,0.12)]"
          style={{ minHeight: 760 }}
        >
          <div className="h-1 w-full bg-gradient-to-r from-trust-accent-blue/90 via-brand-primary/80 to-trust-accent-purple/70" />
          <div className="flex-grow overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead
                className="text-slate-300 text-[11px] uppercase tracking-[0.2em] sticky top-0 z-10 backdrop-blur"
                style={{
                  background: "linear-gradient(90deg, rgba(30,42,70,0.85), rgba(18,28,52,0.85))",
                  borderBottom: "1px solid rgba(120,140,255,0.15)",
                }}
              >
                <tr>
                  <th className="px-6 py-4 font-semibold">Event / Tx</th>
                  <th className="px-6 py-4 font-semibold">Entity</th>
                  <th className="px-6 py-4 font-semibold text-center">Source</th>
                  <th className="px-6 py-4 font-semibold">Outcome</th>
                  <th className="px-6 py-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm bg-gradient-to-b from-white/[0.03] to-transparent">
                {filtered.map((ex) => (
                  <tr
                    key={ex.id}
                    className={`transition-all duration-200 cursor-pointer ${
                      selectedExecution.id === ex.id
                        ? "bg-gradient-to-r from-brand-primary/20 via-brand-primary/10 to-transparent shadow-[inset_0_0_0_1px_rgba(120,140,255,0.35)]"
                        : "odd:bg-white/[0.02] even:bg-transparent"
                    } hover:bg-white/5`}
                    onClick={() => setSelectedExecution(ex)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-white font-semibold">{ex.eventType}</span>
                        <span className="text-[10px] text-slate-500 font-mono break-all">{ex.txHash}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${ex.eventColor} bg-current`} />
                        <span className="text-slate-300">{ex.entity}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] ${ex.eventColor} bg-white/5 border border-white/10`}>{ex.eventClass}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 ${ex.outcomeColor}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> {ex.outcome}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        className="text-brand-primary border border-brand-primary/25 px-3 py-1 rounded-full hover:bg-brand-primary hover:text-white hover:shadow-[0_0_20px_rgba(88,113,255,0.45)] transition-all text-xs font-medium"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedExecution(ex);
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-slate-500">
                      No events found for the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between mt-auto">
            <span className="text-xs text-slate-500">
              Showing 1-{Math.min(filtered.length, 15)} of {filtered.length} events
            </span>
            <div className="flex gap-2">
              <button className="p-2 rounded hover:bg-white/5 text-slate-400 transition-colors">
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <button className="p-2 rounded hover:bg-white/5 text-slate-400 transition-colors">
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex flex-col gap-6" style={{ minHeight: 760 }}>
          {/* Inspection */}
          <div className="glass-effect rounded-twelve p-6 bg-gradient-to-br from-brand-primary/10 via-indigo-500/5 to-transparent border-brand-primary/30 shadow-[0_20px_60px_rgba(76,92,255,0.14)] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Inspection: {selectedExecution.eventType}</h4>
                <p className="text-[10px] text-slate-500 font-mono mt-1 break-all">TX: {selectedExecution.txHash}</p>
              </div>
              <span className={`px-2 py-1 rounded text-[10px] font-bold border ${selectedExecution.outcomeColor} border-white/10 bg-white/5`}>
                {selectedExecution.outcome.toUpperCase()}
              </span>
            </div>
            <div className="space-y-6 flex flex-col">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Event Metadata</span>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Agent ID",
                      value:
                        (typeof parsedEventDetail.agentId === "string" || typeof parsedEventDetail.agentId === "number"
                          ? String(parsedEventDetail.agentId)
                          : selectedExecution.entity.match(/#(\d+)/)?.[1]) ?? "N/A",
                    },
                    {
                      label: "Execution ID",
                      value:
                        (typeof parsedEventDetail.executionId === "string" || typeof parsedEventDetail.executionId === "number"
                          ? String(parsedEventDetail.executionId)
                          : selectedExecution.description.match(/#(\d+)/)?.[1]) ?? "N/A",
                    },
                  ].map((meta) => (
                    <div key={meta.label} className="bg-black/40 p-3 rounded-lg border border-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
                      <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">{meta.label}</p>
                      <p className="text-xs text-slate-200 font-mono break-all">{meta.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emitted Event Args</span>
                  <span className="text-[10px] text-slate-500 font-mono">{Object.keys(parsedEventDetail).length} fields</span>
                </div>
                <div className="bg-slate-950/90 rounded-lg border border-white/10 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(parsedEventDetail).map(([key, value]) => (
                      <div key={key} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</p>
                        <p className="text-xs text-slate-200 font-mono break-all">{typeof value === "string" ? value : JSON.stringify(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Event Details</span>
                <div className="bg-slate-950/90 rounded-lg border border-white/10 font-mono text-xs overflow-hidden flex flex-col shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                  <div className="px-3 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase">Inspection JSON</span>
                    <span className="w-2 h-2 rounded-full bg-brand-primary" />
                  </div>
                  <div className="p-4 min-h-[320px] max-h-[420px] overflow-auto">
                    <pre className="leading-relaxed break-words-all"><code className="block w-full">{inspectionJson}</code></pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="glass-effect rounded-twelve overflow-hidden flex flex-col flex-grow border border-white/10 shadow-[0_20px_60px_rgba(46,88,255,0.1)]" style={{ minHeight: 360 }}>
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-white/10 to-transparent">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Timeline
              </h3>
              <span className="text-[10px] font-mono text-slate-500">LIVE FEED</span>
            </div>
            <div className="bg-black/45 p-4 font-mono text-xs space-y-4 relative flex-grow">
              <div className="scanline" />
              {(filtered.length ? filtered : fallbackExecutions)
                .slice(0, 4)
                .map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`w-full flex gap-4 group text-left rounded-lg px-2 py-2 transition-all ${
                      selectedExecution.id === entry.id
                        ? "bg-gradient-to-r from-brand-primary/20 to-transparent shadow-[inset_0_0_0_1px_rgba(120,140,255,0.28)]"
                        : "hover:bg-white/5"
                    }`}
                    onClick={() => setSelectedExecution(entry)}
                  >
                    <span className="text-slate-600 flex-shrink-0">{entry.timestampLabel}</span>
                    <div className="flex flex-col gap-1">
                      <span className={`${entry.eventColor} font-bold`}>{entry.eventType}</span>
                      <span className="text-slate-400">{entry.description}</span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

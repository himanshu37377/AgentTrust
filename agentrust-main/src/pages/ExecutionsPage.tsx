import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import {
  computeExecutionHistoryStats,
  fetchExecutionHistory,
  formatExecutionHistoryStatCards,
  getZeroGStorageExplorerUrl,
  getZeroGTransactionExplorerUrl,
  type ExecutionHistoryEntry,
} from "@/lib/zerog-runtime";

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
    source: "0G",
    eventType: "MemoryPersisted",
    entity: "Agent RiskAnalyzer",
    eventClass: "Memory",
    eventColor: "text-cyan-300",
    outcome: "Persisted",
    outcomeColor: "text-cyan-300",
    timestampLabel: "15:59:04",
    timestampValue: Date.now() - 300000,
    description: "Persistent memory committed to 0G Storage",
    detailJson: JSON.stringify({ agent: "RiskAnalyzer", provenance: "confirmed", storageHash: "0xmem..." }, null, 2),
  },
];

const filters = ["All", "Validation", "Reputation", "0G", "AgentRegistry", "Accepted", "Rejected"];
const PAGE_SIZE = 15;

export default function ExecutionsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedExecution, setSelectedExecution] = useState<ExecutionHistoryEntry>(fallbackExecutions[0]);
  const [search, setSearch] = useState("");
  const [historyEntries, setHistoryEntries] = useState<ExecutionHistoryEntry[]>(fallbackExecutions);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

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
      if (["Validation", "Reputation", "Staking", "AgentRegistry"].includes(activeFilter)) {
        return entry.eventClass === activeFilter;
      }
      if (activeFilter === "Accepted") return entry.outcome.toLowerCase().includes("accepted");
      if (activeFilter === "Rejected") return entry.outcome.toLowerCase().includes("rejected");
      return true;
    });
  }, [activeFilter, historyEntries, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filtered]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (paginatedEntries.length === 0) return;

    const selectedInPage = paginatedEntries.some((entry) => entry.id === selectedExecution.id);
    if (!selectedInPage) {
      setSelectedExecution(paginatedEntries[0]);
    }
  }, [paginatedEntries, selectedExecution.id]);

  const parsedEventDetail = useMemo(() => {
    try {
      const parsed = JSON.parse(selectedExecution.detailJson) as Record<string, unknown>;
      return parsed;
    } catch {
      return { raw: selectedExecution.detailJson } satisfies Record<string, unknown>;
    }
  }, [selectedExecution.detailJson]);

  const selectedTxExplorerUrl = useMemo(
    () => getZeroGTransactionExplorerUrl(selectedExecution.txHash),
    [selectedExecution.txHash],
  );

  const historyStats = useMemo(
    () => computeExecutionHistoryStats(historyEntries),
    [historyEntries],
  );

  const statCards = useMemo(
    () => formatExecutionHistoryStatCards(historyStats, isLoading),
    [historyStats, isLoading],
  );

  const storageHints = useMemo(() => {
    const storageHash =
      typeof parsedEventDetail.storageHash === "string" ? String(parsedEventDetail.storageHash).trim() : "";
    const storageTxSeq =
      typeof parsedEventDetail.storageTxSeq === "number"
        ? parsedEventDetail.storageTxSeq
        : typeof parsedEventDetail.txSeq === "number"
          ? parsedEventDetail.txSeq
          : undefined;
    const url = getZeroGStorageExplorerUrl(storageHash || undefined, storageTxSeq);
    return { storageHash, storageTxSeq, url };
  }, [parsedEventDetail]);

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
          Transparent audit trail of AI agent executions, persistent 0G memory updates, validator consensus, and trust-layer verification events.
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {statCards.map((s) => (
          <div key={s.label} className="glass-effect p-6 rounded-twelve hover:translate-y-[-4px] transition-all duration-300 group min-h-[120px]">
            <p className="text-slate-400 text-sm mb-2 font-medium">{s.label}</p>
            <div className="flex items-end justify-between">
              <h3 className="text-3xl font-bold text-white">{s.value}</h3>
              {s.badge ? (
                <span className={`${s.badgeColor ?? "text-slate-400 bg-white/5"} text-xs font-mono px-2 py-1 rounded`}>
                  {s.badge}
                </span>
              ) : null}
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
      <div className="grid grid-cols-1 gap-[28px] lg:grid-cols-[minmax(0,2.15fr)_minmax(320px,1fr)]" style={{ alignItems: "stretch" }}>
        <div
          className="glass-effect min-w-0 rounded-twelve flex flex-col overflow-hidden border border-white/10 shadow-[0_20px_80px_rgba(76,92,255,0.12)]"
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
                {paginatedEntries.map((ex) => (
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
                      <span className="text-white font-semibold">{ex.eventType}</span>
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
                        type="button"
                        className="text-brand-primary border border-brand-primary/25 px-3 py-1 rounded-full hover:bg-brand-primary hover:text-white hover:shadow-[0_0_20px_rgba(88,113,255,0.45)] transition-all text-xs font-medium"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedExecution(ex);
                          const url = getZeroGTransactionExplorerUrl(ex.txHash);
                          if (url) {
                            window.open(url, "_blank", "noopener,noreferrer");
                          } else {
                            toast({
                              title: "No chain transaction link",
                              description:
                                "This row does not use a full 64-byte 0x hash, so it cannot be opened on 0G Chainscan. Use the inspection panel for raw event details.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
                {paginatedEntries.length === 0 && !isLoading && (
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
              {filtered.length === 0
                ? "Showing 0 of 0 events"
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length} events`}
            </span>
            <div className="flex gap-2">
              <button
                className="p-2 rounded hover:bg-white/5 text-slate-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <button
                className="p-2 rounded hover:bg-white/5 text-slate-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="min-w-0 flex flex-col gap-6" style={{ minHeight: 760 }}>
          {/* Inspection */}
          <div className="glass-effect min-w-0 rounded-twelve p-6 bg-gradient-to-br from-brand-primary/10 via-indigo-500/5 to-transparent border-brand-primary/30 shadow-[0_20px_60px_rgba(76,92,255,0.14)] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider break-words">
                  Inspection: {selectedExecution.eventType}
                </h4>
                {selectedTxExplorerUrl ? (
                  <a
                    href={selectedTxExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex text-[11px] font-semibold text-brand-primary hover:underline"
                  >
                    View transaction on 0G Chainscan
                  </a>
                ) : (
                  <p className="text-[10px] text-slate-500 font-mono mt-1 break-all">Tx / anchor: {selectedExecution.txHash}</p>
                )}
              </div>
              <span className={`px-2 py-1 rounded text-[10px] font-bold border ${selectedExecution.outcomeColor} border-white/10 bg-white/5`}>
                {selectedExecution.outcome.toUpperCase()}
              </span>
            </div>
            <div className="space-y-4 flex flex-col text-sm">
              <p className="text-slate-300 leading-relaxed">{selectedExecution.description}</p>

              {(selectedExecution.eventClass === "0G" || selectedExecution.source === "0G") && storageHints.storageHash ? (
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/90">0G Storage (not on Chainscan)</p>
                  {storageHints.url ? (
                    <a
                      href={storageHints.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-xs font-semibold text-cyan-300 hover:underline"
                    >
                      Open file via indexer (txSeq / root)
                    </a>
                  ) : (
                    <p className="text-[11px] font-mono text-slate-400 break-all">Root: {storageHints.storageHash}</p>
                  )}
                  {typeof storageHints.storageTxSeq === "number" && storageHints.storageTxSeq > 0 ? (
                    <p className="text-[10px] text-slate-500">Indexer txSeq: {storageHints.storageTxSeq}</p>
                  ) : null}
                </div>
              ) : null}

              {(selectedExecution.eventClass === "0G" || selectedExecution.source === "0G") &&
              typeof parsedEventDetail.task === "string" &&
              parsedEventDetail.task.trim() ? (
                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Task (from memory log)</p>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">{String(parsedEventDetail.task)}</p>
                </div>
              ) : null}

              <details className="rounded-lg border border-white/10 bg-slate-950/60">
                <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold text-slate-400 hover:text-slate-200">
                  Raw event payload
                </summary>
                <pre className="max-h-48 overflow-auto border-t border-black bg-black p-3 text-[11px] leading-relaxed font-mono text-[#39ff14] [text-shadow:0_0_1px_rgba(0,0,0,0.9)] selection:bg-lime-400 selection:text-black">
                  {JSON.stringify(parsedEventDetail, null, 2)}
                </pre>
              </details>
            </div>
          </div>

          {/* Timeline */}
          <div
            className="glass-effect rounded-twelve overflow-hidden flex flex-col flex-grow border border-white/10 shadow-[0_20px_60px_rgba(46,88,255,0.1)]"
            style={{ height: 360, minHeight: 360, maxHeight: 360 }}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-white/10 to-transparent">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Timeline
              </h3>
              <span className="text-[10px] font-mono text-slate-500">LIVE FEED</span>
            </div>
            <div className="bg-black/45 p-4 font-mono text-xs space-y-4 relative flex-grow overflow-y-auto">
              <div className="scanline" />
              {(paginatedEntries.length ? paginatedEntries : fallbackExecutions)
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

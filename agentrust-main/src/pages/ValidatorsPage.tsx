import { useEffect, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import {
  fetchConnectedValidatorProfile,
  fetchProtocolLogs,
  fetchValidatorStakeRequirement,
  type ProtocolLogEntry,
  registerValidator as registerValidatorTx,
  topUpValidatorStake,
  type ValidatorProfile,
  unregisterValidator as unregisterValidatorTx,
  voteOnExecution,
} from "@/lib/hedera";

type ExecutionItem = {
  id: number;
  agentId: number;
  agentName: string;
  capability: string;
  deterministic: boolean;
  receivedAt: string;
  trustScore: string;
  riskLevel: string;
  task: string;
  expectedReasoning: string;
  outputSchema: string;
  reasoning: string;
  output: string;
};

const pendingExecutions: ExecutionItem[] = [
  {
    id: 42,
    agentId: 7,
    agentName: "Sentience Alpha",
    capability: "strategy_execution",
    deterministic: false,
    receivedAt: "2m ago",
    trustScore: "54 / 100",
    riskLevel: "2",
    task: "Review treasury rotation options and propose one execution plan for moving 5,000 HBAR into SAUCE while minimizing slippage.",
    expectedReasoning: "Explain market conditions, compare available routes, justify the selected route, and clearly call out risk assumptions before proposing the trade.",
    outputSchema: '{ "route": string, "from": string, "to": string, "amount": string, "slippageBps": number, "riskSummary": string }',
    reasoning: "The agent compared current pool depth across two candidate routes, rejected the thinner route due to estimated slippage above 120 bps, and selected the deeper SAUCE path. It also notes that treasury execution should remain below a 75 bps tolerance because of recent volatility.",
    output: '{ "route": "HBAR->SAUCE", "from": "HBAR", "to": "SAUCE", "amount": "5000", "slippageBps": 72, "riskSummary": "Acceptable under current liquidity, monitor price movement for 60 seconds before execution." }',
  },
  {
    id: 41,
    agentId: 9,
    agentName: "Atlas Planner",
    capability: "report_generation",
    deterministic: false,
    receivedAt: "8m ago",
    trustScore: "61 / 100",
    riskLevel: "1",
    task: "Summarize validator activity over the last day and produce a narrative report for protocol operators.",
    expectedReasoning: "Group events by validator behavior, explain anomalies, and keep the narrative aligned with protocol health rather than raw event repetition.",
    outputSchema: '{ "summary": string, "keyFindings": string[], "recommendedActions": string[] }',
    reasoning: "The agent grouped the last 24 hours into three windows, highlighted one burst of rejections on high-risk executions, and concluded that validator participation stayed healthy because quorum was still reached without delay. It flags one validator with a short inactive period but does not treat it as a systemic issue.",
    output: '{ "summary": "Validator participation remained stable with isolated rejection spikes on high-risk execution reviews.", "keyFindings": ["Quorum maintained across all reviewed executions", "One validator inactivity window lasted 12 minutes", "Non-deterministic reviews generated the most disagreement"], "recommendedActions": ["Track repeat inactivity", "Review heuristic thresholds on risk-heavy flows"] }',
  },
  {
    id: 40,
    agentId: 12,
    agentName: "Orion Delegate",
    capability: "portfolio_rebalancing",
    deterministic: false,
    receivedAt: "14m ago",
    trustScore: "58 / 100",
    riskLevel: "0",
    task: "Prepare a low-risk portfolio rebalance suggestion for stable asset preservation across treasury positions.",
    expectedReasoning: "State the current allocation imbalance, explain why a rebalance is needed, and propose a conservative adjustment path with minimal exposure change.",
    outputSchema: '{ "currentExposure": string, "recommendedShift": string, "targetAllocation": string, "rationale": string }',
    reasoning: "The agent identified drift toward volatile assets beyond the preferred low-risk threshold and recommended shifting a modest portion back into stable exposure. It justified the change by referencing preservation objectives rather than yield maximization.",
    output: '{ "currentExposure": "68% volatile / 32% stable", "recommendedShift": "Move 8% from volatile allocation into stable reserve", "targetAllocation": "60% volatile / 40% stable", "rationale": "Restores low-risk treasury balance while keeping sufficient upside exposure." }',
  },
];

const protocolLogs = [
  { time: "16:02:14", text: "ExecutionSubmitted -> Execution #42", color: "text-blue-400" },
  { time: "16:02:16", text: "VoteCast -> Validator 0xabc...991 approved execution", color: "text-emerald-400" },
  { time: "16:02:22", text: "ExecutionFinalized -> Execution #40 approved", color: "text-slate-300" },
  { time: "16:02:45", text: "ExecutionSubmitted -> Execution #41", color: "text-blue-400" },
  { time: "16:03:01", text: "VoteCast -> Validator 0xdef...221 rejected execution", color: "text-red-400" },
  { time: "16:03:12", text: "ConsensusReached -> Execution #41 under review", color: "text-amber-400" },
  { time: "16:03:45", text: "Sync complete -> Block #2,941,202", color: "text-slate-400" },
];

const riskLevelMeta: Record<string, { label: string; badgeClass: string; cardClass: string; textClass: string }> = {
  "0": {
    label: "Low",
    badgeClass: "bg-emerald-500/12 text-emerald-300 border-emerald-400/20",
    cardClass: "border-emerald-400/10 bg-gradient-to-br from-emerald-500/10 to-transparent",
    textClass: "text-emerald-200",
  },
  "1": {
    label: "Medium",
    badgeClass: "bg-amber-500/12 text-amber-300 border-amber-400/20",
    cardClass: "border-amber-400/10 bg-gradient-to-br from-amber-500/10 to-transparent",
    textClass: "text-amber-200",
  },
  "2": {
    label: "High",
    badgeClass: "bg-rose-500/12 text-rose-300 border-rose-400/20",
    cardClass: "border-rose-400/10 bg-gradient-to-br from-rose-500/10 to-transparent",
    textClass: "text-rose-200",
  },
};

export default function ValidatorsPage() {
  const [showValidatorModal, setShowValidatorModal] = useState(false);
  const [showUnregisterModal, setShowUnregisterModal] = useState(false);
  const [expandedExecutionId, setExpandedExecutionId] = useState<number | null>(pendingExecutions[0]?.id ?? null);
  const [currentValidationPage, setCurrentValidationPage] = useState(0);
  const [voteLoadingState, setVoteLoadingState] = useState<Record<string, boolean>>({});
  const [liveProtocolLogs, setLiveProtocolLogs] = useState<ProtocolLogEntry[]>(protocolLogs);
  const [logsLoading, setLogsLoading] = useState(true);
  const [stakeAmount, setStakeAmount] = useState("");
  const [isToppingUpStake, setIsToppingUpStake] = useState(false);
  const [isUnregisteringValidator, setIsUnregisteringValidator] = useState(false);
  const [isRegisteringValidator, setIsRegisteringValidator] = useState(false);
  const [validatorProfile, setValidatorProfile] = useState<ValidatorProfile | null>(null);
  const [stakeRequirement, setStakeRequirement] = useState("100");
  const validationsPerPage = 3;

  const totalValidationPages = Math.max(1, Math.ceil(pendingExecutions.length / validationsPerPage));
  const currentExecutions = pendingExecutions.slice(
    currentValidationPage * validationsPerPage,
    currentValidationPage * validationsPerPage + validationsPerPage
  );
  const validationStart = currentValidationPage * validationsPerPage + 1;
  const validationEnd = Math.min((currentValidationPage + 1) * validationsPerPage, pendingExecutions.length);

  useEffect(() => {
    let isMounted = true;

    const loadProtocolLogs = async () => {
      setLogsLoading(true);

      try {
        const logs = await fetchProtocolLogs(12);
        if (!isMounted) return;
        setLiveProtocolLogs(logs.length ? logs : protocolLogs);
      } catch {
        if (!isMounted) return;
        setLiveProtocolLogs(protocolLogs);
      } finally {
        if (isMounted) {
          setLogsLoading(false);
        }
      }
    };

    void loadProtocolLogs();
    const intervalId = window.setInterval(() => {
      void loadProtocolLogs();
    }, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadValidatorProfile = async () => {
      try {
        const [profile, requirement] = await Promise.all([
          fetchConnectedValidatorProfile(),
          fetchValidatorStakeRequirement().catch(() => "100"),
        ]);

        if (!isMounted) return;
        setValidatorProfile(profile);
        setStakeRequirement(requirement);
      } catch {
        if (!isMounted) return;
        setValidatorProfile(null);
      }
    };

    void loadValidatorProfile();

    const refreshHandler = () => {
      void loadValidatorProfile();
    };

    window.addEventListener("focus", refreshHandler);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", refreshHandler);
    };
  }, []);

  const handleVote = async (executionId: number, approve: boolean) => {
    const voteKey = `${executionId}:${approve ? "approve" : "reject"}`;
    setVoteLoadingState((current) => ({ ...current, [voteKey]: true }));

    try {
      const { hash } = await voteOnExecution(executionId, approve);
      toast({
        title: approve ? "Execution approved" : "Execution rejected",
        description: `Vote submitted on-chain for execution #${executionId}. Tx: ${hash.slice(0, 10)}...`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit vote";
      toast({
        title: "Vote failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setVoteLoadingState((current) => ({ ...current, [voteKey]: false }));
    }
  };

  const handleTopUpStake = async () => {
    if (!stakeAmount.trim() || Number(stakeAmount) <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter the HBAR amount you want to add before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsToppingUpStake(true);

    try {
      const { hash } = await topUpValidatorStake(stakeAmount);
      toast({
        title: "Stake top up submitted",
        description: `Validator stake top up sent on-chain. Tx: ${hash.slice(0, 10)}...`,
      });
      setStakeAmount("");
      setValidatorProfile(await fetchConnectedValidatorProfile());
    } catch (error) {
      toast({
        title: "Stake top up failed",
        description: error instanceof Error ? error.message : "Unable to top up validator stake",
        variant: "destructive",
      });
    } finally {
      setIsToppingUpStake(false);
    }
  };

  const handleUnregisterValidator = async () => {
    setIsUnregisteringValidator(true);

    try {
      const { hash } = await unregisterValidatorTx();
      toast({
        title: "Validator unregistration submitted",
        description: `Unregister transaction sent on-chain. Tx: ${hash.slice(0, 10)}...`,
      });
      setShowUnregisterModal(false);
      setValidatorProfile(await fetchConnectedValidatorProfile());
    } catch (error) {
      toast({
        title: "Unregister failed",
        description: error instanceof Error ? error.message : "Unable to unregister validator",
        variant: "destructive",
      });
    } finally {
      setIsUnregisteringValidator(false);
    }
  };

  const handleRegisterValidator = async () => {
    setIsRegisteringValidator(true);

    try {
      const { hash } = await registerValidatorTx(stakeRequirement);
      toast({
        title: "Validator registration submitted",
        description: `Register transaction sent on-chain. Tx: ${hash.slice(0, 10)}...`,
      });
      setValidatorProfile(await fetchConnectedValidatorProfile());
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "Unable to register validator",
        variant: "destructive",
      });
    } finally {
      setIsRegisteringValidator(false);
    }
  };

  return (
    <>
      <div className="relative z-10 max-w-[1320px] mx-auto px-6 py-12 flex flex-col gap-10">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute" style={{ top: "10%", left: "20%", width: 2, height: 2, background: "white", borderRadius: "50%", opacity: 0.12, animation: "float 10s ease-in-out infinite" }} />
          <div className="absolute" style={{ top: "40%", left: "80%", width: 2, height: 2, background: "white", borderRadius: "50%", opacity: 0.12, animation: "float 10s ease-in-out infinite 2s" }} />
          <div className="absolute" style={{ top: "70%", left: "30%", width: 2, height: 2, background: "white", borderRadius: "50%", opacity: 0.12, animation: "float 10s ease-in-out infinite 4s" }} />
        </div>

        <header className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="relative">
            <div className="hero-glow" />
            <h1 className="text-5xl font-bold tracking-tight text-white">
              Validator <span className="text-gradient">Network</span>
            </h1>
            <p className="mt-2 text-slate-400 max-w-2xl text-lg">
              Review non-deterministic agent executions, verify reasoning against expected behavior, and keep the audit stream accountable.
            </p>
          </div>
          <button onClick={() => setShowValidatorModal(true)} className="h-[44px] px-6 btn-primary-gradient rounded-[12px] text-sm font-semibold text-white transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">shield_person</span>
            {validatorProfile?.isRegistered ? "Validator Console" : "Become Validator"}
          </button>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Total Validators", value: "27" },
            { label: "Active Validators", value: "24" },
            { label: "Pending Reviews", value: `${pendingExecutions.length}` },
            { label: "Consensus Threshold", value: "66%" },
          ].map((s) => (
            <div key={s.label} className="stat-card-refined p-[22px] rounded-[14px] hover:translate-y-[-4px] transition-all duration-300 min-h-[120px]">
              <p className="text-[13px] font-medium uppercase tracking-[0.8px] mb-3" style={{ color: "rgba(170,190,220,0.75)" }}>{s.label}</p>
              <p className="text-[32px] font-semibold" style={{ color: "#e8ecff" }}>{s.value}</p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.8fr)_360px] gap-[24px]" style={{ alignItems: "start" }}>
          <section className="space-y-6 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 gap-4">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Pending Execution Validations</h2>
                <p className="mt-2 text-sm text-slate-400">Expand a card to inspect reasoning, output, and hashes before opening the final review modal.</p>
              </div>
              <span className="px-3 py-1 bg-white/5 rounded-lg text-[11px] font-semibold text-slate-400 border border-white/10 shrink-0">
                {pendingExecutions.length} Actions Required
              </span>
            </div>

            {currentExecutions.map((execution) => {
              const isExpanded = expandedExecutionId === execution.id;
              const riskMeta = riskLevelMeta[execution.riskLevel] ?? riskLevelMeta["0"];

              return (
                <div
                  key={execution.id}
                  className="glass-card rounded-2xl overflow-hidden execution-card-interactive transition-all border-white/5 shadow-xl"
                  style={{ background: "rgba(18, 24, 38, 0.95)" }}
                >
                  <div className="p-7 md:p-8">
                    <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                      <div className="flex items-center space-x-5">
                        <div className={`p-4 rounded-2xl ring-1 shrink-0 ${execution.deterministic ? "bg-blue-500/10 text-trust-accent-blue ring-blue-500/20" : "bg-purple-500/10 text-trust-accent-purple ring-purple-500/20"}`}>
                          <span className="material-symbols-outlined text-[28px]">{execution.deterministic ? "verified_user" : "policy_alert"}</span>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white">Execution #{execution.id}</h3>
                          <p className="text-sm text-slate-400 mt-1">
                            Agent #{execution.agentId} <span className="text-white/50">•</span> {execution.agentName} <span className="text-white/50">•</span> {execution.capability}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2.5">
                        <span className={`px-3 py-1 text-[10px] font-bold rounded-md border uppercase tracking-widest ${execution.deterministic ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"}`}>
                          {execution.deterministic ? "Deterministic" : "Non-Deterministic"}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">Received {execution.receivedAt}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                      <div className="rounded-xl border border-cyan-400/10 bg-gradient-to-br from-cyan-500/12 to-sky-500/5 px-4 py-3 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Trust Score</p>
                        <p className="text-[16px] font-bold text-cyan-200 break-words tracking-[-0.02em]">{execution.trustScore}</p>
                      </div>
                      <div className={`rounded-xl border px-4 py-3 ${riskMeta.cardClass}`}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Risk Level</p>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${riskMeta.badgeClass}`}>
                          {riskMeta.label}
                        </span>
                      </div>
                      <div className="rounded-xl border border-fuchsia-400/10 bg-gradient-to-br from-fuchsia-500/10 to-transparent px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Capability</p>
                        <p className="text-sm font-semibold text-fuchsia-200 break-words">{execution.capability}</p>
                      </div>
                      <div className="rounded-xl border border-amber-400/10 bg-gradient-to-br from-amber-500/10 to-transparent px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Review Status</p>
                        <p className="text-sm font-semibold text-amber-200 break-words">Pending</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-between items-center gap-3">
                      <button
                        onClick={() => setExpandedExecutionId(isExpanded ? null : execution.id)}
                        className="px-5 py-2.5 rounded-lg border border-sky-400/20 bg-gradient-to-r from-sky-500/12 to-cyan-500/8 text-[11px] font-bold uppercase tracking-widest text-sky-100 transition-all hover:from-sky-500/18 hover:to-cyan-500/14 hover:border-sky-300/30 hover:shadow-[0_0_18px_rgba(56,189,248,0.12)]"
                      >
                        {isExpanded ? "Hide Review Details" : "Expand Review Details"}
                      </button>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => void handleVote(execution.id, false)}
                          disabled={voteLoadingState[`${execution.id}:reject`] || voteLoadingState[`${execution.id}:approve`]}
                          className="px-5 py-2.5 rounded-lg border border-trust-danger/30 text-trust-danger text-[11px] font-bold transition-all uppercase tracking-widest btn-reject-hover disabled:cursor-not-allowed disabled:border-red-400/15 disabled:text-red-300/60"
                        >
                          {voteLoadingState[`${execution.id}:reject`] ? "Rejecting..." : "Reject"}
                        </button>
                        <button
                          onClick={() => void handleVote(execution.id, true)}
                          disabled={voteLoadingState[`${execution.id}:approve`] || voteLoadingState[`${execution.id}:reject`]}
                          className="px-6 py-2.5 btn-approve-gradient rounded-lg text-[11px] font-bold text-white transition-all uppercase tracking-widest shadow-lg btn-approve-hover disabled:cursor-not-allowed disabled:brightness-75"
                        >
                          {voteLoadingState[`${execution.id}:approve`] ? "Approving..." : "Approve"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/5 pt-6">
                        <div className="rounded-xl border border-white/5 bg-slate-950/50 p-5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Expected Reasoning</p>
                          <p className="text-sm leading-relaxed text-slate-300">{execution.expectedReasoning}</p>
                        </div>

                        <div className="rounded-xl border border-white/5 bg-slate-950/50 p-5 overflow-x-auto">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Output Schema</p>
                          <pre className="text-[13px] font-mono text-cyan-300/90 whitespace-pre-wrap break-words">{execution.outputSchema}</pre>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="rounded-xl border border-white/5 bg-slate-950/50 p-5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Reasoning</p>
                            <p className="text-sm leading-relaxed text-slate-300">{execution.reasoning}</p>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-slate-950/50 p-5 overflow-x-auto">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Output</p>
                            <pre className="text-[13px] font-mono text-emerald-300/90 whitespace-pre-wrap break-words">{execution.output}</pre>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="px-1 pt-1 border-t border-white/5 flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-200">
                Showing {validationStart}-{validationEnd} of {pendingExecutions.length} validation requests
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentValidationPage((page) => Math.max(0, page - 1))}
                  disabled={currentValidationPage === 0}
                  className="p-2 rounded border border-white/10 text-slate-200 transition-colors hover:bg-white/5 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <span className="text-[11px] font-semibold text-white min-w-[58px] text-center">
                  {currentValidationPage + 1} / {totalValidationPages}
                </span>
                <button
                  onClick={() => setCurrentValidationPage((page) => Math.min(totalValidationPages - 1, page + 1))}
                  disabled={currentValidationPage >= totalValidationPages - 1}
                  className="p-2 rounded border border-white/10 text-slate-200 transition-colors hover:bg-white/5 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          </section>

          <aside className="flex flex-col self-stretch xl:sticky xl:top-12">
            <div className="hidden xl:block h-[98px] shrink-0" aria-hidden="true" />
            <div className="glass-card rounded-2xl border border-white/5 flex flex-col flex-1" style={{ background: "rgba(10, 14, 23, 0.95)", minHeight: 0 }}>
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Protocol Logs</h3>
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/40" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
                </div>
              </div>
              <div className="p-5 font-mono text-[12px] leading-[1.65] flex-grow overflow-y-auto console-scroll space-y-3 overflow-x-auto">
                {logsLoading && liveProtocolLogs.length === 0 ? (
                  <div className="text-slate-500">Loading protocol logs...</div>
                ) : (
                liveProtocolLogs.map((log, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-slate-600 shrink-0">[{log.time}]</span>
                    <span className={`${log.color} break-words`}>{log.text}</span>
                  </div>
                )))}
              </div>
              <div className="mt-auto p-4 border-t border-white/5 bg-black/20">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{logsLoading ? "Syncing Logs" : "Live Stream Active"}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

      </div>

      {showValidatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-overlay absolute inset-0" onClick={() => setShowValidatorModal(false)} />
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-white/10 shadow-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(18, 24, 46, 0.97), rgba(11, 17, 31, 0.97))",
              boxShadow: "0 30px 80px rgba(0,0,0,0.45), 0 0 30px rgba(88,110,255,0.18)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-trust-accent-blue/70 to-transparent" />
            <div className="p-6 pb-4 border-b border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-trust-accent-blue/20 bg-trust-accent-blue/10 shadow-[0_0_24px_rgba(79,140,255,0.18)]">
                    <span className="material-symbols-outlined text-[24px] text-trust-accent-blue">shield_person</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-trust-accent-blue/90">
                      {validatorProfile?.isRegistered ? "Validator Console" : "Consensus Access"}
                    </p>
                    <h2 className="mt-1 text-[24px] font-bold tracking-tight text-white">
                      {validatorProfile?.isRegistered ? "Manage Validator" : "Become a Validator"}
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
                      {validatorProfile?.isRegistered
                        ? "Review your validator status, top up stake, and manage exit actions from one place."
                        : "Join the network and help verify AI execution traces through decentralized consensus."}
                    </p>
                  </div>
                </div>
                <button className="rounded-full p-2 transition-colors hover:bg-white/5" onClick={() => setShowValidatorModal(false)}>
                  <span className="material-symbols-outlined text-slate-400">close</span>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="rounded-[20px] border border-trust-accent-blue/20 bg-gradient-to-r from-trust-accent-blue/10 to-trust-accent-purple/10 p-5 shadow-inner">
                <div className="flex items-end justify-between gap-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-trust-accent-blue mb-2">
                      {validatorProfile?.isRegistered ? "Current Stake" : "Staking Requirement"}
                    </p>
                    <div className="text-[34px] font-bold tracking-tight text-white">
                      {(validatorProfile?.isRegistered ? validatorProfile.stakedAmount : stakeRequirement).split(".")[0]} HBAR
                    </div>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                    {validatorProfile?.isRegistered ? "Active Validator" : "Validator Tier"}
                  </div>
                </div>
              </div>
              {validatorProfile?.isRegistered ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Validator Wallet</p>
                        <p className="text-sm font-semibold text-slate-200 break-all">{validatorProfile.address}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Reputation</p>
                        <p className="text-sm font-semibold text-cyan-200">{validatorProfile.validatorReputation}</p>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        className="w-full rounded-[12px] px-4 py-3 text-sm text-white transition-all outline-none stake-input"
                        placeholder="Amount to add"
                        type="number"
                        min="0"
                        step="0.01"
                        value={stakeAmount}
                        onChange={(event) => setStakeAmount(event.target.value)}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">HBAR</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => void handleTopUpStake()}
                      disabled={isToppingUpStake}
                      className="w-full py-3 stake-btn rounded-[12px] text-[11px] font-bold text-white uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:brightness-75"
                      style={{ background: "linear-gradient(90deg, #4f8cff, #7a6cff)", boxShadow: "0 0 14px rgba(120,140,255,0.35)" }}
                    >
                      {isToppingUpStake ? "Adding Stake..." : "Top Up Stake"}
                    </button>
                    <button
                      onClick={() => setShowUnregisterModal(true)}
                      className="w-full py-3 rounded-[12px] text-[11px] font-bold uppercase tracking-widest transition-all"
                      style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.45)", color: "#ef4444" }}
                    >
                      Unregister Validator
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Responsibilities</h3>
                  <ul className="space-y-3">
                    {[
                      "Maintain 99.9% node uptime and consensus synchronization.",
                      "Review non-deterministic agent outputs against expected reasoning and schema.",
                      "Vote only after confirming the displayed reasoning and output match the committed hashes.",
                    ].map((r, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                        <span className="material-symbols-outlined text-emerald-400 text-[20px] mt-0.5">check_circle</span>
                        <span className="text-[13px] text-slate-300 leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => void handleRegisterValidator()}
                    disabled={isRegisteringValidator}
                    className="w-full py-3 btn-primary-gradient rounded-xl text-white font-bold transition-all uppercase tracking-widest text-xs shadow-xl disabled:cursor-not-allowed disabled:brightness-75"
                  >
                    {isRegisteringValidator ? "Registering..." : `Stake ${stakeRequirement.split(".")[0]} HBAR & Register`}
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowValidatorModal(false)}
                className="w-full py-3 rounded-xl border border-white/10 bg-white/5 text-slate-300 font-bold transition-all uppercase tracking-widest text-xs hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showUnregisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-overlay absolute inset-0" onClick={() => setShowUnregisterModal(false)} />
          <div className="glass-card relative w-full max-w-md rounded-[24px] overflow-hidden shadow-2xl border-red-500/20">
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-8 ring-4 ring-red-500/5">
                <span className="material-symbols-outlined text-4xl">warning</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Confirm Unregistration</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-10">Are you sure you want to unregister? This action is reversible, but requires a 7-day cooldown period before your stake can be claimed.</p>
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => void handleUnregisterValidator()}
                  disabled={isUnregisteringValidator}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-red-500/20 disabled:cursor-not-allowed disabled:bg-red-500/70"
                >
                  {isUnregisteringValidator ? "Unregistering..." : "Yes, Unregister Node"}
                </button>
                <button onClick={() => setShowUnregisterModal(false)} className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-xs uppercase tracking-widest transition-all">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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
  parentExecutionId: number;
  callerAgentId: number;
  involvesExternalCall: boolean;
  externalService: string;
  deterministic: boolean;
  receivedAt: string;
  trustScore: string;
  riskLevel: string;
  task: string;
  expectedReasoning: string;
  outputSchema: string;
  reasoning: string;
  output: string;
  createdAt?: number;
  expiresAt?: number;
};

const pendingExecutions: ExecutionItem[] = [
  {
    id: 42,
    agentId: 7,
    agentName: "Sentience Alpha",
    capability: "strategy_execution",
    parentExecutionId: 0,
    callerAgentId: 0,
    involvesExternalCall: false,
    externalService: "None",
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
    parentExecutionId: 0,
    callerAgentId: 0,
    involvesExternalCall: false,
    externalService: "None",
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
    parentExecutionId: 0,
    callerAgentId: 0,
    involvesExternalCall: false,
    externalService: "None",
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
const VALIDATOR_REVIEW_STORAGE_KEY = "agentrust.pending-validator-executions";

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

function getAccuracyMeta(score: number) {
  if (score >= 80) {
    return {
      label: "High accuracy",
      insight: "Reliable validator",
      badgeClass: "border-emerald-400/30 bg-emerald-500/12 text-emerald-200",
      panelClass: "border-emerald-400/15 bg-gradient-to-br from-emerald-500/12 to-transparent",
      valueClass: "text-emerald-200",
      progressClass: "from-emerald-400 via-teal-300 to-cyan-300",
    };
  }

  if (score >= 50) {
    return {
      label: "Watch accuracy",
      insight: "Mixed validator reliability",
      badgeClass: "border-amber-400/30 bg-amber-500/12 text-amber-200",
      panelClass: "border-amber-400/15 bg-gradient-to-br from-amber-500/12 to-transparent",
      valueClass: "text-amber-200",
      progressClass: "from-amber-300 via-yellow-200 to-orange-300",
    };
  }

  return {
    label: "Low accuracy",
    insight: "Risky validator",
    badgeClass: "border-rose-400/30 bg-rose-500/12 text-rose-200",
    panelClass: "border-rose-400/15 bg-gradient-to-br from-rose-500/12 to-transparent",
    valueClass: "text-rose-200",
    progressClass: "from-rose-400 via-red-300 to-orange-300",
  };
}

function formatHbarLabel(value: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return value;
  }

  if (amount === 0) {
    return "0";
  }

  if (amount >= 1) {
    return amount % 1 === 0 ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
  }

  return amount.toFixed(6).replace(/\.?0+$/, "");
}

function formatValidatorId(validatorId?: number) {
  if (!validatorId) {
    return "VAL-0000";
  }

  return `VAL-${String(validatorId).padStart(4, "0")}`;
}

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
  const [isValidatorProfileLoading, setIsValidatorProfileLoading] = useState(true);
  const [stakeRequirement, setStakeRequirement] = useState<string | null>(null);
  const [runtimeExecutions, setRuntimeExecutions] = useState<ExecutionItem[]>([]);
  const validationsPerPage = 3;
  const isWalletConnected = Boolean(validatorProfile?.address);
  const hasValidatorAccess = Boolean(validatorProfile?.isRegistered && isWalletConnected);
  const allPendingExecutions = [...runtimeExecutions, ...pendingExecutions];

  const totalValidationPages = Math.max(1, Math.ceil(allPendingExecutions.length / validationsPerPage));
  const currentExecutions = allPendingExecutions.slice(
    currentValidationPage * validationsPerPage,
    currentValidationPage * validationsPerPage + validationsPerPage
  );
  const validationStart = currentValidationPage * validationsPerPage + 1;
  const validationEnd = Math.min((currentValidationPage + 1) * validationsPerPage, allPendingExecutions.length);
  const accuracyScore = validatorProfile?.accuracyScore ?? 0;
  const accuracyMeta = getAccuracyMeta(accuracyScore);
  const displayedStakeRequirement = stakeRequirement ?? "0";

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
    const syncRuntimeExecutions = () => {
      try {
        const raw = window.localStorage.getItem(VALIDATOR_REVIEW_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) {
          setRuntimeExecutions([]);
          return;
        }

        const now = Date.now();
        const activeExecutions = parsed.filter((execution) => {
          if (!execution || typeof execution !== "object") {
            return false;
          }

          if (typeof execution.expiresAt !== "number") {
            return true;
          }

          return execution.expiresAt > now;
        });

        if (activeExecutions.length !== parsed.length) {
          window.localStorage.setItem(VALIDATOR_REVIEW_STORAGE_KEY, JSON.stringify(activeExecutions));
        }

        setRuntimeExecutions(activeExecutions);
      } catch {
        setRuntimeExecutions([]);
      }
    };

    syncRuntimeExecutions();
    window.addEventListener("storage", syncRuntimeExecutions);
    window.addEventListener("focus", syncRuntimeExecutions);

    return () => {
      window.removeEventListener("storage", syncRuntimeExecutions);
      window.removeEventListener("focus", syncRuntimeExecutions);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadValidatorProfile = async () => {
      setIsValidatorProfileLoading(true);

      const [profileResult, requirementResult] = await Promise.allSettled([
        fetchConnectedValidatorProfile(),
        fetchValidatorStakeRequirement(),
      ]);

      if (!isMounted) return;

      if (profileResult.status === "fulfilled") {
        setValidatorProfile(profileResult.value);
      } else {
        setValidatorProfile(null);
      }

      if (requirementResult.status === "fulfilled") {
        setStakeRequirement(requirementResult.value);
      } else {
        setStakeRequirement(null);
      }

      setIsValidatorProfileLoading(false);
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
      const { hash, finalized, accepted } = await voteOnExecution(executionId, approve);
      toast({
        title: finalized ? "Execution finalized" : approve ? "Execution approved" : "Execution rejected",
        description: finalized
          ? `Execution #${executionId} finalized as ${accepted ? "accepted" : "rejected"}. Tx: ${hash.slice(0, 10)}...`
          : `Vote submitted on-chain for execution #${executionId}. Tx: ${hash.slice(0, 10)}...`,
      });
      if (finalized) {
        setRuntimeExecutions((current) => {
          const next = current.filter((execution) => execution.id !== executionId);
          window.localStorage.setItem(VALIDATOR_REVIEW_STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      }
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
    if (!stakeRequirement) {
      toast({
        title: "Stake requirement unavailable",
        description: "Unable to load the current validator stake requirement from the contract.",
        variant: "destructive",
      });
      return;
    }

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

        {hasValidatorAccess ? (
          <>
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Total Validators", value: "27" },
            { label: "Active Validators", value: "24" },
            { label: "Pending Reviews", value: `${allPendingExecutions.length}` },
            { label: "Your Accuracy", value: `${accuracyScore} / 100`, valueClass: accuracyMeta.valueClass },
          ].map((s) => (
            <div key={s.label} className="stat-card-refined p-[22px] rounded-[14px] hover:translate-y-[-4px] transition-all duration-300 min-h-[120px]">
              <p className="text-[13px] font-medium uppercase tracking-[0.8px] mb-3" style={{ color: "rgba(170,190,220,0.75)" }}>{s.label}</p>
              <p className={`text-[32px] font-semibold ${s.valueClass ?? ""}`} style={{ color: s.valueClass ? undefined : "#e8ecff" }}>{s.value}</p>
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
                {allPendingExecutions.length} Actions Required
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
                        <div className="rounded-xl border border-white/5 bg-slate-950/50 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Expected Reasoning</p>
                          <div className="max-h-[3.2rem] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                            <p className="text-sm leading-relaxed text-slate-300">{execution.expectedReasoning}</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/5 bg-slate-950/50 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Output Schema</p>
                          <div className="max-h-[3.2rem] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                            <pre className="text-[13px] font-mono text-cyan-300/90 whitespace-pre-wrap break-words">{execution.outputSchema}</pre>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                          <div
                            className="rounded-xl border pt-4 pb-2 px-3.5 h-full"
                            style={{
                              background:
                                "radial-gradient(circle at top right, rgba(56,189,248,0.12), transparent 34%), linear-gradient(180deg, rgba(10,15,27,0.92), rgba(6,10,20,0.96))",
                              borderColor: "rgba(56, 189, 248, 0.18)",
                              boxShadow: "0 0 26px rgba(14, 165, 233, 0.08)",
                            }}
                          >
                            <div className="mb-2.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/85">Execution Context</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-0.5">Parent Execution</p>
                                <p className="text-base font-semibold text-white">{execution.parentExecutionId}</p>
                              </div>
                              <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-0.5">Caller Agent</p>
                                <p className="text-base font-semibold text-white">{execution.callerAgentId}</p>
                              </div>
                              <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-0.5">External Call</p>
                                <p className={`text-sm font-semibold ${execution.involvesExternalCall ? "text-amber-200" : "text-emerald-200"}`}>
                                  {execution.involvesExternalCall ? "Yes" : "No"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-0.5">External Service</p>
                                <p className="text-sm font-semibold text-white break-words">
                                  {execution.externalService || "None"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3.5 h-full flex flex-col">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Reasoning</p>
                            <div className="max-h-[7.0rem] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                              <p className="text-sm leading-relaxed text-slate-300">{execution.reasoning}</p>
                            </div>
                          </div>

                          <div className="lg:col-span-2 rounded-xl border border-emerald-400/10 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent px-4 py-3 shadow-[0_0_28px_rgba(16,185,129,0.08)]">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Output</p>
                            <div className="max-h-[2.5rem] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                              <pre className="text-[13px] font-mono text-emerald-300/90 whitespace-pre-wrap break-words">{execution.output}</pre>
                            </div>
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
                Showing {validationStart}-{validationEnd} of {allPendingExecutions.length} validation requests
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
            <div
              className="glass-card rounded-2xl border border-white/5 flex flex-col flex-1"
              style={{ background: "rgba(10, 14, 23, 0.95)", height: 560, minHeight: 560, maxHeight: 560 }}
            >
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Protocol Logs</h3>
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/40" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
                </div>
              </div>
              <div className="p-5 font-mono text-[12px] leading-[1.65] flex-grow min-h-0 overflow-y-auto console-scroll space-y-3 overflow-x-auto">
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
        </>
        ) : (
          <section className="glass-card rounded-2xl border border-white/10 p-8 md:p-10" style={{ background: "radial-gradient(circle at top right, rgba(79,140,255,0.14), rgba(12, 18, 32, 0.94) 52%)" }}>
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-start">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-trust-accent-blue/30 bg-trust-accent-blue/10 px-3 py-1">
                  <span className="material-symbols-outlined text-trust-accent-blue text-sm">shield_lock</span>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-trust-accent-blue/90">Validator Access</p>
                </div>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">
                  {isValidatorProfileLoading
                    ? "Checking validator permissions..."
                    : isWalletConnected
                      ? "Validator registration required"
                      : "Connect your wallet to continue"}
                </h2>
                <p className="mt-3 text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl">
                  {isValidatorProfileLoading
                    ? "We are verifying your connected account and validator registration status against the protocol."
                    : isWalletConnected
                      ? "Only registered validators can access execution review workflows. Use the Become Validator action in the page header to complete staking and registration."
                      : "This section is restricted to validator accounts. Connect your wallet from the top navigation, then register that wallet as a validator to unlock this dashboard."}
                </p>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      icon: "account_balance_wallet",
                      title: "Wallet Connected",
                      value: isValidatorProfileLoading ? "Checking" : isWalletConnected ? "Yes" : "No",
                    },
                    {
                      icon: "verified_user",
                      title: "Validator Registered",
                      value: isValidatorProfileLoading ? "Checking" : validatorProfile?.isRegistered ? "Yes" : "No",
                    },
                    {
                      icon: "lock_open_right",
                      title: "Dashboard Access",
                      value: isValidatorProfileLoading ? "Pending" : hasValidatorAccess ? "Granted" : "Locked",
                    },
                  ].map((item) => (
                    <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-[0.18em] font-bold">
                        <span className="material-symbols-outlined text-base text-trust-accent-blue">{item.icon}</span>
                        {item.title}
                      </div>
                      <p className="mt-3 text-lg font-semibold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Unlock Steps</p>
                <div className="mt-4 space-y-3">
                  {[
                    "Connect your Hedera wallet in the navigation bar.",
                    `Stake at least ${formatHbarLabel(displayedStakeRequirement)} HBAR and register as validator.`,
                    "Return to this page to review and vote on pending executions.",
                  ].map((step, index) => (
                    <div key={step} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-trust-accent-blue/20 text-[11px] font-bold text-trust-accent-blue">{index + 1}</span>
                      <p className="text-sm leading-relaxed text-slate-300">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

      </div>

      {showValidatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-overlay absolute inset-0" onClick={() => setShowValidatorModal(false)} />
          <div
            className="relative w-full max-w-[520px] overflow-hidden rounded-[24px] border border-white/10 shadow-2xl max-h-[calc(100vh-2rem)]"
            style={{
              background: "linear-gradient(180deg, rgba(18, 24, 46, 0.97), rgba(11, 17, 31, 0.97))",
              boxShadow: "0 30px 80px rgba(0,0,0,0.45), 0 0 30px rgba(88,110,255,0.18)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-trust-accent-blue/70 to-transparent" />
            <div className="p-5 pb-4 border-b border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-trust-accent-blue/20 bg-trust-accent-blue/10 shadow-[0_0_20px_rgba(79,140,255,0.16)]">
                    <span className="material-symbols-outlined text-[22px] text-trust-accent-blue">shield_person</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-trust-accent-blue/90">
                      {validatorProfile?.isRegistered ? "Validator Console" : "Consensus Access"}
                    </p>
                    <h2 className="mt-1 text-[22px] font-bold tracking-tight text-white">
                      {validatorProfile?.isRegistered ? "Manage Validator" : "Become a Validator"}
                    </h2>
                  </div>
                </div>
                <button className="rounded-full p-2 transition-colors hover:bg-white/5" onClick={() => setShowValidatorModal(false)}>
                  <span className="material-symbols-outlined text-slate-400">close</span>
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(100vh-9rem)]">
              <div className="rounded-[18px] border border-trust-accent-blue/20 bg-gradient-to-r from-trust-accent-blue/10 to-trust-accent-purple/10 px-4 py-4 shadow-inner">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-trust-accent-blue mb-1.5">
                      {validatorProfile?.isRegistered ? "Current Stake" : "Staking Requirement"}
                    </p>
                    <div className="text-[28px] leading-none font-bold tracking-tight text-white">
                      {formatHbarLabel(validatorProfile?.isRegistered ? validatorProfile.stakedAmount : displayedStakeRequirement)} HBAR
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                    {validatorProfile?.isRegistered ? "Active Validator" : "Validator Tier"}
                  </div>
                </div>
              </div>
              {validatorProfile?.isRegistered ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] items-start gap-4 mb-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Validator Wallet</p>
                        <p className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-slate-100">
                          {validatorProfile.address}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Validator ID</p>
                        <p className="text-sm font-semibold text-cyan-200">{formatValidatorId(validatorProfile.validatorId)}</p>
                      </div>
                    </div>
                    <div className={`rounded-[18px] border px-4 py-3.5 ${accuracyMeta.panelClass}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1.5">Accuracy Score</p>
                          <p className={`text-[22px] font-bold leading-none ${accuracyMeta.valueClass}`}>{accuracyScore} / 100</p>
                        </div>
                        <div className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] ${accuracyMeta.badgeClass}`}>
                          {accuracyMeta.label}
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${accuracyMeta.progressClass}`}
                          style={{ width: `${accuracyScore}%` }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm">
                        <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/8 px-3 py-2.5">
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">Correct Vote</p>
                          <p className="mt-1.5 font-semibold text-emerald-200">+1 accuracy</p>
                        </div>
                        <div className="rounded-xl border border-rose-400/15 bg-rose-500/8 px-3 py-2.5">
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-rose-300/80">Wrong Vote</p>
                          <p className="mt-1.5 font-semibold text-rose-200">-2 penalty</p>
                        </div>
                      </div>
                      <p className="mt-3 text-[13px] text-slate-300">{accuracyMeta.insight}</p>
                    </div>
                    <div className="relative mt-4">
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
                    {isRegisteringValidator ? "Registering..." : `Stake ${formatHbarLabel(displayedStakeRequirement)} HBAR & Register`}
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

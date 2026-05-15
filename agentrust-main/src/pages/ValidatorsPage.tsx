import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import {
  fetchConnectedValidatorProfile,
  fetchProtocolLogs,
  fetchValidatorReviewActivity,
  fetchValidatorStakeRequirement,
  getZeroGStorageExplorerUrl,
  getZeroGTransactionExplorerUrl,
  type ProtocolLogEntry,
  registerValidator as registerValidatorTx,
  topUpValidatorStake,
  type ValidatorReviewActivity,
  type ValidatorProfile,
  unregisterValidator as unregisterValidatorTx,
} from "@/lib/zerog-runtime";

type RaisedIssue = {
  id: string;
  activityId: string;
  agentName: string;
  task: string;
  summary: string;
  raisedAt: number;
  status: "open" | "resolved";
  supportVotes: number;
  dismissVotes: number;
  reviewerDecision?: "support" | "dismiss";
  validatorResults: ValidatorReviewActivity["validatorResults"];
  txHash?: string;
  storageHash?: string;
  storageTxSeq?: number;
};

const VALIDATOR_ISSUE_STORAGE_KEY = "agentrust.validator-raised-issues";

function consensusConfidencePercent(activity: ValidatorReviewActivity): number {
  if (activity.validatorResults.length > 0) {
    const sum = activity.validatorResults.reduce((acc, r) => {
      const c = typeof r.confidence === "number" && !Number.isNaN(r.confidence) ? r.confidence : 0;
      return acc + c;
    }, 0);
    return Math.round((sum / activity.validatorResults.length) * 100);
  }
  return Math.round((activity.confidence || 0) * 100);
}

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

function formatOgLabel(value: string) {
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

function formatActivityDateTime(iso: string | number | Date) {
  const d =
    typeof iso === "number"
      ? new Date(iso)
      : typeof iso === "string"
        ? new Date(iso)
        : iso;
  if (!Number.isFinite(d.getTime())) {
    return "—";
  }
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const ACTIVITY_PAGE_SIZE = 8;

export default function ValidatorsPage() {
  const [showValidatorModal, setShowValidatorModal] = useState(false);
  const [showUnregisterModal, setShowUnregisterModal] = useState(false);
  const [showRaiseIssueModal, setShowRaiseIssueModal] = useState(false);
  const [selectedIssueActivityId, setSelectedIssueActivityId] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [liveProtocolLogs, setLiveProtocolLogs] = useState<ProtocolLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [stakeAmount, setStakeAmount] = useState("");
  const [isToppingUpStake, setIsToppingUpStake] = useState(false);
  const [isUnregisteringValidator, setIsUnregisteringValidator] = useState(false);
  const [isRegisteringValidator, setIsRegisteringValidator] = useState(false);
  const [validatorProfile, setValidatorProfile] = useState<ValidatorProfile | null>(null);
  const [stakeRequirement, setStakeRequirement] = useState<string | null>(null);
  const [validatorActivities, setValidatorActivities] = useState<ValidatorReviewActivity[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [raisedIssues, setRaisedIssues] = useState<RaisedIssue[]>([]);
  const accuracyScore = validatorProfile?.accuracyScore ?? 0;
  const accuracyMeta = getAccuracyMeta(accuracyScore);
  const displayedStakeRequirement = stakeRequirement ?? "0";

  const activityTotalPages = Math.max(1, Math.ceil(validatorActivities.length / ACTIVITY_PAGE_SIZE));
  const paginatedActivities = useMemo(() => {
    const start = (activityPage - 1) * ACTIVITY_PAGE_SIZE;
    return validatorActivities.slice(start, start + ACTIVITY_PAGE_SIZE);
  }, [activityPage, validatorActivities]);

  useEffect(() => {
    setActivityPage((p) => Math.min(p, activityTotalPages));
  }, [activityTotalPages]);

  useEffect(() => {
    let isMounted = true;

    const loadProtocolLogs = async () => {
      setLogsLoading(true);

      try {
        const logs = await fetchProtocolLogs(12);
        if (!isMounted) return;
        setLiveProtocolLogs(logs);
      } catch {
        if (!isMounted) return;
        setLiveProtocolLogs([]);
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

  const persistRaisedIssues = (next: RaisedIssue[]) => {
    setRaisedIssues(next);
    window.localStorage.setItem(VALIDATOR_ISSUE_STORAGE_KEY, JSON.stringify(next));
  };

  const handleRaiseIssue = (activity: ValidatorReviewActivity) => {
    const existing = raisedIssues.find((issue) => issue.activityId === activity.id && issue.status === "open");
    if (existing) {
      toast({
        title: "Issue already open",
        description: "This validator-agent review has already been escalated for human validation.",
      });
      return;
    }

    const issue: RaisedIssue = {
      id: `issue-${activity.id}`,
      activityId: activity.id,
      agentName: activity.agentName,
      task: activity.task,
      summary: activity.summary,
      raisedAt: Date.now(),
      status: "open",
      supportVotes: 0,
      dismissVotes: 0,
      validatorResults: activity.validatorResults,
      txHash: activity.txHash,
      storageHash: activity.storageHash,
      storageTxSeq: activity.storageTxSeq,
    };

    persistRaisedIssues([issue, ...raisedIssues].slice(0, 20));
    toast({
      title: "Issue raised",
      description: `Human validator review opened for ${activity.agentName}.`,
    });
  };

  const openRaiseIssueModal = (activityId?: string) => {
    setSelectedIssueActivityId(activityId || validatorActivities[0]?.id || "");
    setIssueNote("");
    setShowRaiseIssueModal(true);
  };

  const submitRaisedIssueFromModal = () => {
    const activity = validatorActivities.find((item) => item.id === selectedIssueActivityId);
    if (!activity) {
      toast({
        title: "No validator review selected",
        description: "Choose a validator-agent review before raising an issue.",
        variant: "destructive",
      });
      return;
    }

    const existing = raisedIssues.find((issue) => issue.activityId === activity.id && issue.status === "open");
    if (existing) {
      toast({
        title: "Issue already open",
        description: "This validator-agent review has already been escalated for human validation.",
      });
      return;
    }

    const summary = issueNote.trim()
      ? `${activity.summary} Reviewer note: ${issueNote.trim()}`
      : activity.summary;

    const issue: RaisedIssue = {
      id: `issue-${activity.id}`,
      activityId: activity.id,
      agentName: activity.agentName,
      task: activity.task,
      summary,
      raisedAt: Date.now(),
      status: "open",
      supportVotes: 0,
      dismissVotes: 0,
      validatorResults: activity.validatorResults,
      txHash: activity.txHash,
      storageHash: activity.storageHash,
      storageTxSeq: activity.storageTxSeq,
    };

    persistRaisedIssues([issue, ...raisedIssues].slice(0, 20));
    setShowRaiseIssueModal(false);
    setIssueNote("");
    toast({
      title: "Issue raised",
      description: `Human validator review opened for ${activity.agentName}.`,
    });
  };

  const handleIssueVote = (issueId: string, decision: "support" | "dismiss") => {
    const next = raisedIssues.map((issue) => {
      if (issue.id !== issueId) {
        return issue;
      }

      const previousDecision = issue.reviewerDecision;
      let supportVotes = issue.supportVotes;
      let dismissVotes = issue.dismissVotes;

      if (previousDecision === "support") supportVotes = Math.max(0, supportVotes - 1);
      if (previousDecision === "dismiss") dismissVotes = Math.max(0, dismissVotes - 1);

      if (decision === "support") supportVotes += 1;
      if (decision === "dismiss") dismissVotes += 1;

      return {
        ...issue,
        reviewerDecision: decision,
        supportVotes,
        dismissVotes,
        status: supportVotes > dismissVotes ? "open" : decision === "dismiss" ? "resolved" : "open",
      };
    });

    persistRaisedIssues(next);
    toast({
      title: "Human vote recorded",
      description: decision === "support" ? "Issue kept open for deeper investigation." : "Issue marked as dismissed.",
    });
  };

  useEffect(() => {
    let isMounted = true;

    const syncValidatorState = async () => {
      try {
        const [activities, issuesRaw] = await Promise.all([
          fetchValidatorReviewActivity(80),
          Promise.resolve(window.localStorage.getItem(VALIDATOR_ISSUE_STORAGE_KEY)),
        ]);

        if (!isMounted) {
          return;
        }

        setValidatorActivities(activities);
        setExpandedActivityId((current) =>
          current && activities.some((a) => a.id === current) ? current : null,
        );

        const parsedIssues = issuesRaw ? JSON.parse(issuesRaw) : [];
        setRaisedIssues(Array.isArray(parsedIssues) ? parsedIssues : []);
      } catch {
        if (!isMounted) {
          return;
        }

        setValidatorActivities([]);
        setRaisedIssues([]);
      }
    };

    void syncValidatorState();
    const intervalId = window.setInterval(() => {
      void syncValidatorState();
    }, 10000);
    window.addEventListener("storage", syncValidatorState);
    window.addEventListener("focus", syncValidatorState);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("storage", syncValidatorState);
      window.removeEventListener("focus", syncValidatorState);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadValidatorProfile = async () => {
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

  const handleTopUpStake = async () => {
    if (!stakeAmount.trim() || Number(stakeAmount) <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter the OG amount you want to add before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsToppingUpStake(true);

    try {
      const { hash } = await topUpValidatorStake(stakeAmount);
      toast({
        title: "Collateral updated",
        description: `Collateral update sent on-chain. Tx: ${hash.slice(0, 10)}...`,
      });
      setStakeAmount("");
      setValidatorProfile(await fetchConnectedValidatorProfile());
    } catch (error) {
      toast({
        title: "Collateral update failed",
        description: error instanceof Error ? error.message : "Unable to update validator collateral",
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
        title: "Validator activation unavailable",
        description: "Unable to load the current validator collateral requirement from the contract.",
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
              Verification <span className="text-gradient">Network</span>
            </h1>
            <p className="mt-2 text-slate-400 max-w-2xl text-lg">
              Review reasoning-heavy agent executions, inspect validator-ensemble outcomes, and enforce economically accountable verification.
            </p>
          </div>
          <button onClick={() => openRaiseIssueModal()} className="h-[44px] px-6 btn-primary-gradient rounded-[12px] text-sm font-semibold text-white transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">report_problem</span>
            Raise Issue
          </button>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Validator Stake", value: `${validatorProfile?.stakedAmount ?? "0"} OG` },
            { label: "Validator Reviews", value: `${validatorActivities.length}` },
            { label: "Slash Count", value: `${validatorProfile?.slashCount ?? 0}`, valueClass: (validatorProfile?.slashCount ?? 0) > 0 ? "text-rose-200" : "text-emerald-200" },
            { label: "Open Issues", value: `${raisedIssues.filter((issue) => issue.status === "open").length}` },
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
                <h2 className="text-3xl font-bold text-white tracking-tight">Validator Agent Activity</h2>
                <p className="mt-2 text-sm text-slate-400">Inspect isolated validator-agent reviews, backend compute traces, and escalation candidates before inviting human validators into the loop.</p>
              </div>
              <span className="px-3 py-1 bg-white/5 rounded-lg text-[11px] font-semibold text-slate-400 border border-white/10 shrink-0">
                {validatorActivities.length} Reviews Synced
              </span>
            </div>

            {validatorActivities.length === 0 ? (
              <div className="glass-card rounded-2xl border border-white/5 p-8 text-sm text-slate-400">
                No validator-agent review activity has been recorded yet. Run a non-deterministic task to populate backend validator reviews here.
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
                  {paginatedActivities.map((activity) => {
                    const isExpanded = expandedActivityId === activity.id;
                    const confidenceValue = consensusConfidencePercent(activity);
                    const issueOpen = raisedIssues.some((issue) => issue.activityId === activity.id && issue.status === "open");
                    const approvals = activity.validatorResults.filter((r) => r.approved).length;
                    const flags = activity.validatorResults.length - approvals;
                    const storageUrl = getZeroGStorageExplorerUrl(activity.storageHash, activity.storageTxSeq);
                    const txUrl = getZeroGTransactionExplorerUrl(activity.validationTxHash || activity.txHash);

                    return (
                      <div
                        key={`${activity.executionId ?? "no-eid"}-${activity.storageHash ?? activity.id}`}
                        className="rounded-xl border border-white/[0.07] bg-gradient-to-br from-[rgb(20,24,36)] via-[rgb(16,20,32)] to-[rgb(12,15,24)] p-3 shadow-sm transition-all hover:border-white/12 hover:shadow-md"
                      >
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-2.5">
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/12 text-violet-300 ring-1 ring-purple-500/25"
                              aria-hidden
                            >
                              <span className="material-symbols-outlined text-[20px]">group_search</span>
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <h3 className="truncate text-sm font-semibold tracking-tight text-white">{activity.agentName}</h3>
                                <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-400">
                                  {formatActivityDateTime(activity.timestamp)}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] leading-tight text-slate-400">
                                <span className="inline-flex items-baseline gap-1">
                                  <span className="text-base font-bold leading-none text-cyan-200 tabular-nums">{confidenceValue}%</span>
                                  <span className="uppercase tracking-wider text-slate-500">confidence</span>
                                </span>
                                <span className="hidden h-3 w-px bg-white/15 sm:inline" aria-hidden />
                                <span className="text-fuchsia-200/85">{activity.validatorResults.length} supervised validators</span>
                                {activity.validatorResults.length > 0 ? (
                                  <span>
                                    <span className="text-emerald-300/90">{approvals} approve</span>
                                    <span className="text-slate-500"> · </span>
                                    <span className="text-amber-300/90">{flags} flagged</span>
                                  </span>
                                ) : (
                                  <span className="text-amber-300/90">No votes in cache</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                if (storageUrl) {
                                  window.open(storageUrl, "_blank", "noopener,noreferrer");
                                } else {
                                  toast({
                                    title: "0G Storage file link unavailable",
                                    description:
                                      "Set VITE_ZEROG_STORAGE_FILE_GATEWAY_URL (indexer base, e.g. Galileo turbo indexer) or VITE_ZEROG_STORAGE_EXPLORER_URL. Live uploads should include txSeq or a full storage root hash.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-100 transition-colors hover:bg-sky-500/20"
                            >
                            Open file
                          </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (txUrl) {
                                  window.open(txUrl, "_blank", "noopener,noreferrer");
                                } else {
                                  toast({
                                    title: "Transaction link unavailable",
                                    description: "This row does not have a full-length chain transaction hash for 0G Chainscan.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-200 transition-colors hover:bg-white/8"
                            >
                              Inspect tx
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedActivityId(isExpanded ? null : activity.id)}
                              className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition-colors hover:bg-white/8"
                            >
                              {isExpanded ? "Less" : "Details"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openRaiseIssueModal(activity.id)}
                              disabled={issueOpen}
                              className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white btn-approve-gradient disabled:cursor-not-allowed disabled:opacity-50 sm:ml-1"
                            >
                              {issueOpen ? "Issue open" : "Raise issue"}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-2.5 space-y-2.5 border-t border-white/[0.06] pt-2.5">
                            <div>
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Full task</p>
                              <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-2 text-xs leading-relaxed text-slate-300 custom-scrollbar">
                                {activity.task}
                              </p>
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                              <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2">
                                <p className="mb-0.5 text-[10px] uppercase text-slate-300">Execution ID</p>
                                <p className="font-mono text-sm font-medium text-white">
                                  {activity.executionId != null ? `#${activity.executionId}` : "—"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2">
                                <p className="mb-0.5 text-[10px] uppercase text-slate-300">Indexer tx sequence</p>
                                <p className="font-mono text-sm font-medium text-white">
                                  {activity.storageTxSeq != null && activity.storageTxSeq > 0 ? `#${activity.storageTxSeq}` : "—"}
                                </p>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
                                <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2">
                                  <p className="mb-0.5 text-[10px] uppercase text-slate-300">Agent address</p>
                                  <p className="break-all font-mono text-[11px] leading-snug text-white">{activity.agentAddress ?? "—"}</p>
                                </div>
                                <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2">
                                  <p className="mb-0.5 text-[10px] uppercase text-slate-300">Storage root</p>
                                  <p className="break-all font-mono text-[11px] leading-snug text-white">{activity.storageHash ?? "—"}</p>
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Supervised validator votes
                              </p>
                              <div className="max-h-40 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                                {activity.validatorResults.length === 0 ? (
                                  <p className="text-xs text-slate-400">
                                    No validator JSON in the local cache. Open the 0G indexer file link for the envelope, or run a non-deterministic task so the ensemble is written to storage.
                                  </p>
                                ) : (
                                  activity.validatorResults.map((result) => (
                                    <div
                                      key={`${activity.id}-${result.validatorId || result.validator}`}
                                      className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-semibold text-slate-100">
                                          {result.validatorLabel || result.validatorId || result.validator}
                                        </span>
                                        <span className={`text-[11px] font-semibold ${result.approved ? "text-emerald-300" : "text-amber-300"}`}>
                                          {result.approved ? "approved" : "flagged"} · {Math.round((result.confidence || 0) * 100)}%
                                        </span>
                                      </div>
                                      <p className="mt-1 text-[11px] leading-snug text-slate-100">
                                        {result.reason}
                                        {result.provider ? (
                                          <span className="text-slate-400"> · {result.provider}</span>
                                        ) : null}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {validatorActivities.length > ACTIVITY_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <span className="text-xs text-slate-500">
                      {(activityPage - 1) * ACTIVITY_PAGE_SIZE + 1}–{Math.min(activityPage * ACTIVITY_PAGE_SIZE, validatorActivities.length)} of{" "}
                      {validatorActivities.length}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="p-2 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={activityPage <= 1}
                        onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <span className="material-symbols-outlined text-sm">chevron_left</span>
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={activityPage >= activityTotalPages}
                        onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <span className="material-symbols-outlined text-sm">chevron_right</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between pb-4 border-b border-white/10 gap-4 pt-4">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Raised Issues & Human Validator Vote</h2>
                <p className="mt-2 text-sm text-slate-400">Human validators only step in after an issue is raised against a validator-agent review outcome.</p>
              </div>
              <span className="px-3 py-1 bg-white/5 rounded-lg text-[11px] font-semibold text-slate-400 border border-white/10 shrink-0">
                {raisedIssues.filter((issue) => issue.status === "open").length} Open Issues
              </span>
            </div>

            {raisedIssues.length === 0 ? (
              <div className="glass-card rounded-2xl border border-white/5 p-8 text-sm text-slate-400">
                No issues have been raised yet. Human validator voting becomes available only after someone escalates a validator-agent review.
              </div>
            ) : raisedIssues.map((issue) => (
              <div key={issue.id} className="glass-card rounded-2xl overflow-hidden transition-all border-white/5 shadow-xl" style={{ background: "rgba(18, 24, 38, 0.95)" }}>
                <div className="p-7 md:p-8">
                  <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
                    <div>
                      <h3 className="text-xl font-bold text-white">{issue.agentName}</h3>
                      <p className="text-sm text-slate-400 mt-1">Issue raised {formatActivityDateTime(issue.raisedAt)}</p>
                    </div>
                    <span className={`px-3 py-1 text-[10px] font-bold rounded-md border uppercase tracking-widest ${issue.status === "open" ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}`}>
                      {issue.status === "open" ? "Open Issue" : "Resolved"}
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-slate-950/50 p-4 mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Issue Summary</p>
                    <p className="text-sm leading-relaxed text-slate-300">{issue.summary}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                    <div className="rounded-xl border border-emerald-400/10 bg-gradient-to-br from-emerald-500/10 to-transparent px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Support Votes</p>
                      <p className="text-lg font-semibold text-emerald-200">{issue.supportVotes}</p>
                    </div>
                    <div className="rounded-xl border border-rose-400/10 bg-gradient-to-br from-rose-500/10 to-transparent px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Dismiss Votes</p>
                      <p className="text-lg font-semibold text-rose-200">{issue.dismissVotes}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => handleIssueVote(issue.id, "support")}
                      className="px-6 py-2.5 btn-approve-gradient rounded-lg text-[11px] font-bold text-white transition-all uppercase tracking-widest shadow-lg btn-approve-hover"
                    >
                      Support Issue
                    </button>
                    <button
                      onClick={() => handleIssueVote(issue.id, "dismiss")}
                      className="px-5 py-2.5 rounded-lg border border-trust-danger/30 text-trust-danger text-[11px] font-bold transition-all uppercase tracking-widest btn-reject-hover"
                    >
                      Dismiss Issue
                    </button>
                    {issue.reviewerDecision && (
                      <span className="text-xs text-slate-400 uppercase tracking-[0.16em]">
                        Your vote: {issue.reviewerDecision}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
                ) : liveProtocolLogs.length === 0 ? (
                  <div className="text-slate-500">
                    No on-chain protocol events yet. Run a compose task to populate ValidationRegistry activity.
                  </div>
                ) : (
                  liveProtocolLogs.map((log, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-slate-600 shrink-0">[{log.time}]</span>
                      <span className={`${log.color} break-words`}>{log.text}</span>
                    </div>
                  ))
                )}
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
                      {validatorProfile?.isRegistered ? "Manage Validator" : "Become Validator"}
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
                      {validatorProfile?.isRegistered ? "Locked Collateral" : "Minimum Collateral"}
                    </p>
                    <div className="text-[28px] leading-none font-bold tracking-tight text-white">
                      {validatorProfile?.isRegistered ? `${formatOgLabel(validatorProfile.stakedAmount)} OG` : `${formatOgLabel(displayedStakeRequirement)} OG`}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                    {validatorProfile?.isRegistered ? "Economic Security Active" : "Collateral Required"}
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
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">Successful Validations</p>
                          <p className="mt-1.5 font-semibold text-emerald-200">{validatorProfile.successfulValidations}</p>
                        </div>
                        <div className="rounded-xl border border-rose-400/15 bg-rose-500/8 px-3 py-2.5">
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-rose-300/80">Slash Events</p>
                          <p className="mt-1.5 font-semibold text-rose-200">{validatorProfile.slashCount}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-[13px] text-slate-300">
                        Reputation {validatorProfile.validatorReputation} • Failed validations {validatorProfile.failedValidations}
                      </p>
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
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">OG</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => void handleTopUpStake()}
                      disabled={isToppingUpStake}
                      className="w-full py-3 stake-btn rounded-[12px] text-[11px] font-bold text-white uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:brightness-75"
                      style={{ background: "linear-gradient(90deg, #4f8cff, #7a6cff)", boxShadow: "0 0 14px rgba(120,140,255,0.35)" }}
                    >
                      {isToppingUpStake ? "Adding Collateral..." : "Top Up Collateral"}
                    </button>
                    <button
                      onClick={() => setShowUnregisterModal(true)}
                      className="w-full py-3 rounded-[12px] text-[11px] font-bold uppercase tracking-widest transition-all"
                      style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.45)", color: "#ef4444" }}
                    >
                      Begin Unstake Cooldown
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Responsibilities</h3>
                  <ul className="space-y-3">
                    {[
                      "Lock collateral before joining the validator set.",
                      "Review non-deterministic agent outputs against expected reasoning and schema.",
                      "Objectively incorrect deterministic validation can trigger slashing.",
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
                    {isRegisteringValidator ? "Activating..." : `Stake ${formatOgLabel(displayedStakeRequirement)} OG & Register`}
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

      {showRaiseIssueModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-3xl border border-white/10 max-w-xl w-full p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">Human Escalation</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Raise Issue</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Select a validator-agent review and open a human validation issue linked to its 0G-backed execution record.
                </p>
              </div>
              <button
                onClick={() => setShowRaiseIssueModal(false)}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            {validatorActivities.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                No validator-agent reviews are available yet. Run a reasoning task first, then raise an issue from its review record.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Validator Review
                  </label>
                  <select
                    value={selectedIssueActivityId}
                    onChange={(event) => setSelectedIssueActivityId(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                  >
                    {validatorActivities.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.agentName} • {activity.verificationStatus.replace(/_/g, " ")} • {activity.task.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Issue Note
                  </label>
                  <textarea
                    value={issueNote}
                    onChange={(event) => setIssueNote(event.target.value)}
                    rows={4}
                    placeholder="Add the concern a human validator should inspect."
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none resize-none"
                  />
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowRaiseIssueModal(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={submitRaisedIssueFromModal}
                disabled={validatorActivities.length === 0}
                className="rounded-xl btn-primary-gradient px-5 py-3 text-xs font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:brightness-75"
              >
                Create Issue
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
              <p className="text-slate-400 text-sm leading-relaxed mb-10">This starts the unstake cooldown. After the cooldown ends, call the same action again to withdraw collateral.</p>
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => void handleUnregisterValidator()}
                  disabled={isUnregisteringValidator}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-red-500/20 disabled:cursor-not-allowed disabled:bg-red-500/70"
                >
                  {isUnregisteringValidator ? "Updating..." : "Start Cooldown / Withdraw"}
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

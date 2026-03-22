import { useEffect, useMemo, useState } from "react";
import {
  computeDeterministicBindingHash,
  computeReasoningHash,
  executeAgentTask,
  fetchAgentAuthorizationStatus,
  fetchExecutionStatus,
  fetchAgentExecutionMetadata,
  formatDisplayError,
  submitDeterministicExecutionHash,
  submitAgentReview,
  type AgentExecutionResponse,
  verifyWithBackend,
  verifyDeterministicExecution,
} from "@/lib/hedera";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ComposeTaskModalProps {
  agentId: number;
  agentName: string;
  agentInitials: string;
  capabilities: string[];
  requiredAuthorizationSkillIds?: number[];
  onClose: () => void;
}

type ModalMessage = {
  from: "agent" | "user";
  text: string;
  verified?: boolean;
};

type VerificationStepStatus = "idle" | "running" | "success" | "error";

type VerificationStep = {
  key: string;
  label: string;
  detail: string;
  status: VerificationStepStatus;
};

type VerificationMode = "deterministic" | "non-deterministic";

const starOptions = [1, 2, 3, 4, 5] as const;
const verifierModelLabel = "Verifier: Gemini 2.5 Flash (Deterministic Mode)";
const VALIDATOR_REVIEW_STORAGE_KEY = "agentrust.pending-validator-executions";
const NON_DETERMINISTIC_STATUS_STORAGE_KEY = "agentrust.pending-nondeterministic-status";
const NON_DETERMINISTIC_REVIEW_TTL_MS = 4 * 60 * 1000;
const INVALID_QUERY_GUIDANCE = "Please enter a valid calculator query, like 3+4 or sum of numbers from 1 to 10.";

const initialVerificationSteps = (mode: VerificationMode): VerificationStep[] =>
  mode === "deterministic"
    ? [
        {
          key: "agent-run",
          label: "1. Run Agent",
          detail: "Submit the prompt to the deterministic agent endpoint and capture its output.",
          status: "idle",
        },
        {
          key: "binding-hash",
          label: "2. Hash Commit",
          detail: "Normalize the output and compute keccak256(abi.encode(input, output, agentId)).",
          status: "idle",
        },
        {
          key: "submit",
          label: "3. On-chain Submit",
          detail: "Store the execution commitment in ValidationRegistry as the deterministic execution proof.",
          status: "idle",
        },
        {
          key: "review",
          label: "4. Off-chain Compute",
          detail: "Run the same prompt again through the verifier backend to compute the expected hash.",
          status: "idle",
        },
        {
          key: "verify",
          label: "5. Final Verify",
          detail: "Call verifyDeterministicExecution(executionId, expectedHash) and read the verdict.",
          status: "idle",
        },
      ]
    : [
        {
          key: "agent-run",
          label: "1. Run Agent",
          detail: "Submit the prompt to the agent endpoint and capture both output and reasoning.",
          status: "idle",
        },
        {
          key: "binding-hash",
          label: "2. Hash Commit",
          detail: "Compute the execution commitment from output and the reasoning hash from the returned reasoning trace.",
          status: "idle",
        },
        {
          key: "submit",
          label: "3. On-chain Submit",
          detail: "Submit execution commitment, reasoning hash, and execution context to ValidationRegistry.",
          status: "idle",
        },
        {
          key: "review",
          label: "4. Validator Vote",
          detail: "Publish a validator review card with expected reasoning, output schema, execution context, reasoning, and output.",
          status: "idle",
        },
        {
          key: "verify",
          label: "5. Final Verify",
          detail: "Check execution finalization status after validator votes and read accepted/rejected from the contract.",
          status: "idle",
        },
      ];

export default function ComposeTaskModal({
  agentId,
  agentName,
  agentInitials,
  capabilities,
  requiredAuthorizationSkillIds = [],
  onClose,
}: ComposeTaskModalProps) {
  const [messages, setMessages] = useState<ModalMessage[]>([
    {
      from: "agent",
      text: `Agent #${String(agentId).padStart(3, "0")} ready to receive tasks. Supported capabilities: ${capabilities.join(", ") || "General execution"}.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [isFetchingEndpoint, setIsFetchingEndpoint] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showExitRating, setShowExitRating] = useState(false);
  const [hasHandledRating, setHasHandledRating] = useState(false);
  const [selectedRating, setSelectedRating] = useState<(typeof starOptions)[number]>(5);
  const [feedback, setFeedback] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingStatus, setRatingStatus] = useState<string>("");
  const [verificationSteps, setVerificationSteps] = useState<VerificationStep[]>(
    initialVerificationSteps("deterministic")
  );
  const [verificationSummary, setVerificationSummary] = useState<string>("Run a task to see the deterministic verification pipeline.");
  const [verificationAccepted, setVerificationAccepted] = useState<boolean | null>(null);
  const [executionCommitment, setExecutionCommitment] = useState<string>("");
  const [expectedHash, setExpectedHash] = useState<string>("");
  const [normalizedOutput, setNormalizedOutput] = useState<string>("");
  const [recomputedOutput, setRecomputedOutput] = useState<string>("");
  const [executionId, setExecutionId] = useState<number | null>(null);
  const [verifierModel, setVerifierModel] = useState<string>(verifierModelLabel);
  const [showVerificationPanel, setShowVerificationPanel] = useState(false);
  const [verificationMode, setVerificationMode] = useState<VerificationMode>("deterministic");
  const [expectedReasoningTemplate, setExpectedReasoningTemplate] = useState("");
  const [outputSchemaTemplate, setOutputSchemaTemplate] = useState("");
  const [capabilityName, setCapabilityName] = useState<string>(capabilities[0] || "calculator");
  const [allowExternalCalls, setAllowExternalCalls] = useState(false);

  const canSubmitRating = useMemo(() => !isSubmittingRating && Boolean(selectedRating), [isSubmittingRating, selectedRating]);
  const hasConversation = useMemo(() => messages.some((message) => message.from === "user"), [messages]);
  const activeVerificationIndex = useMemo(() => getActiveVerificationIndex(verificationSteps), [verificationSteps]);
  const activeVerificationStep = useMemo(
    () => (activeVerificationIndex >= 0 ? verificationSteps[activeVerificationIndex] : verificationSteps[0]),
    [activeVerificationIndex, verificationSteps],
  );
  const chatHeight = showVerificationPanel ? "h-[270px]" : "h-[360px]";
  const liveStepDetail = useMemo(
    () => splitTxDetail(activeVerificationStep?.detail ?? verificationSummary),
    [activeVerificationStep, verificationSummary],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadEndpoint() {
      setIsFetchingEndpoint(true);
      try {
        const metadata = await fetchAgentExecutionMetadata(agentId);
        if (cancelled) {
          return;
        }

        setEndpoint(metadata.endpoint);
        setVerificationMode(metadata.isDeterministic ? "deterministic" : "non-deterministic");
        setExpectedReasoningTemplate(metadata.expectedReasoning || "");
        setOutputSchemaTemplate(metadata.outputSchema || "");
        setCapabilityName(metadata.capabilityName || capabilities[0] || "calculator");
        setVerificationSteps(initialVerificationSteps(metadata.isDeterministic ? "deterministic" : "non-deterministic"));
        setMessages((prev) => [
          ...prev,
          {
            from: "agent",
            text: `Connected to agent endpoint from IPFS metadata (${metadata.metadataUri}). Verification mode: ${metadata.isDeterministic ? "Deterministic" : "Non-deterministic"}.`,
          },
        ]);
        if (!metadata.isDeterministic) {
          const persistedStatus = readPersistedNonDeterministicStatus(agentId);
          if (persistedStatus) {
            const refreshedExecution = await fetchExecutionStatus(persistedStatus.executionId);
            const nextAccepted = refreshedExecution.finalized ? refreshedExecution.accepted : null;
            setVerificationSteps(
              refreshedExecution.finalized
                ? persistedStatus.steps.map((step) =>
                    step.key === "verify"
                      ? {
                          ...step,
                          status: refreshedExecution.accepted ? "success" : "error",
                          detail: refreshedExecution.accepted
                            ? "Execution finalized and accepted after validator consensus."
                            : "Execution finalized and rejected after validator consensus.",
                        }
                      : step
                  )
                : persistedStatus.steps
            );
            setVerificationSummary(
              refreshedExecution.finalized
                ? refreshedExecution.accepted
                  ? "Validator consensus finalized this non-deterministic execution as accepted."
                  : "Validator consensus finalized this non-deterministic execution as rejected."
                : persistedStatus.summary
            );
            setVerificationAccepted(nextAccepted);
            setExecutionId(persistedStatus.executionId);
            setShowVerificationPanel(!refreshedExecution.finalized);
            if (refreshedExecution.finalized) {
              persistNonDeterministicStatus({
                agentId,
                executionId: persistedStatus.executionId,
                steps: persistedStatus.steps.map((step) =>
                  step.key === "verify"
                    ? {
                        ...step,
                        status: refreshedExecution.accepted ? "success" : "error",
                        detail: refreshedExecution.accepted
                          ? "Execution finalized and accepted after validator consensus."
                          : "Execution finalized and rejected after validator consensus.",
                      }
                    : step
                ),
                summary: refreshedExecution.accepted
                  ? "Validator consensus finalized this non-deterministic execution as accepted."
                  : "Validator consensus finalized this non-deterministic execution as rejected.",
                accepted: refreshedExecution.accepted,
                messages: updatePersistedMessagesVerification(
                  persistedStatus.messages ?? [],
                  refreshedExecution.accepted
                ),
              });
            }
            if ((persistedStatus.messages ?? []).length > 0) {
              setMessages(updatePersistedMessagesVerification(persistedStatus.messages ?? [], nextAccepted));
            }
          }
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            from: "agent",
            text: `Unable to load endpoint from agent metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ]);
      } finally {
        if (!cancelled) {
          setIsFetchingEndpoint(false);
        }
      }
    }

    loadEndpoint();

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const resetVerificationState = () => {
    setVerificationSteps(initialVerificationSteps(verificationMode));
    setVerificationSummary(
      verificationMode === "deterministic"
        ? "Running deterministic verification flow..."
        : "Running non-deterministic validation flow..."
    );
    setVerificationAccepted(null);
    setExecutionCommitment("");
    setExpectedHash("");
    setNormalizedOutput("");
    setRecomputedOutput("");
    setExecutionId(null);
    setVerifierModel(verifierModelLabel);
    setShowVerificationPanel(false);
  };

  const updateStep = (key: string, status: VerificationStepStatus, detail?: string) => {
    setVerificationSteps((current) =>
      current.map((step) =>
        step.key === key
          ? {
              ...step,
              status,
              detail: detail ?? step.detail,
            }
          : step,
      ),
    );
  };

  const sendTask = async () => {
    const prompt = input;
    if (!prompt.trim() || isFetchingEndpoint || isExecuting) return;

    if (!endpoint) {
      setMessages((prev) => [
        ...prev,
        { from: "user", text: prompt },
        { from: "agent", text: "This agent endpoint is not available. Please try again later." },
      ]);
      setInput("");
      return;
    }

    if (requiredAuthorizationSkillIds.length > 0) {
      try {
        const authorizationStatus = await fetchAgentAuthorizationStatus(agentId, requiredAuthorizationSkillIds);
        if (!authorizationStatus.allAuthorized) {
          const guidance = authorizationStatus.connected
            ? `Execution blocked: authorize this agent's protected capabilities before running the task. Missing permissions for skill IDs ${authorizationStatus.unauthorizedSkillIds.join(", ")}.`
            : "Execution blocked: connect your wallet and authorize this agent's protected capabilities before running the task.";
          setMessages((prev) => [
            ...prev,
            { from: "user", text: prompt },
            { from: "agent", text: guidance },
          ]);
          setInput("");
          setShowVerificationPanel(false);
          return;
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          { from: "user", text: prompt },
          {
            from: "agent",
            text: `Execution blocked: unable to verify authorization status. ${formatDisplayError(error)}`,
          },
        ]);
        setInput("");
        setShowVerificationPanel(false);
        return;
      }
    }

    setRatingStatus("");
    setInput("");
    setIsExecuting(true);
    resetVerificationState();
    setShowVerificationPanel(true);
    setMessages((prev) => [...prev, { from: "user", text: prompt }, { from: "agent", text: "Executing task..." }]);

    try {
      updateStep("agent-run", "running");
      const execution = await executeAgentTask(endpoint, prompt, agentId);
      const formattedExecution = formatExecution(prompt, execution);
      const firstNormalizedOutput = execution.normalizedOutput ?? normalizeExecutionResult(execution);
      const firstExecutionCommitment =
        execution.executionCommitment ??
        computeDeterministicBindingHash(prompt, firstNormalizedOutput, agentId);

      await delay(1000);

      setMessages((prev) => {
        const withoutPlaceholder = [...prev];
        withoutPlaceholder.pop();
        return [
          ...withoutPlaceholder,
          {
            from: "agent",
            text: formattedExecution,
            verified: false,
          },
        ];
      });

      updateStep("agent-run", "success", `Agent output captured: ${truncateValue(formattedExecution, 92)}`);
      if (isUndefinedExecution(execution)) {
        setShowVerificationPanel(false);
        setVerificationAccepted(null);
        setVerificationSummary("Verification skipped because the agent returned an invalid calculator result.");
        setMessages((prev) => [
          ...prev,
          {
            from: "agent",
            text: INVALID_QUERY_GUIDANCE,
          },
        ]);
        return;
      }

      updateStep("binding-hash", "running");
      await delay(1000);
      updateStep("binding-hash", "success", `Execution commitment generated: ${truncateHash(firstExecutionCommitment)}`);
      setNormalizedOutput(firstNormalizedOutput);
      setExecutionCommitment(firstExecutionCommitment);

      updateStep("submit", "running");
      const reasoningHash =
        verificationMode === "deterministic"
          ? undefined
          : computeReasoningHash(typeof execution.reasoning === "string" ? execution.reasoning : "");
      const submitted = await submitDeterministicExecutionHash({
        agentId,
        executionCommitment: firstExecutionCommitment,
        reasoningHash,
        isDeterministic: verificationMode === "deterministic",
      });
      if (!submitted.executionId) {
        throw new Error("Execution ID was not returned from ValidationRegistry.");
      }

      setExecutionId(submitted.executionId);
      updateStep(
        "submit",
        "success",
        verificationMode === "deterministic"
          ? `Execution #${submitted.executionId} anchored on-chain. Tx ${truncateHash(submitted.hash)}`
          : `Execution #${submitted.executionId} submitted with reasoning hash and execution commitment. Tx ${truncateHash(submitted.hash)}`
      );

      if (verificationMode === "deterministic") {
        updateStep("review", "running");
        const verificationPreview = await verifyWithBackend(endpoint, prompt, agentId);
        const recomputedNormalizedOutput = verificationPreview.output;
        const recomputedBindingHash = verificationPreview.expectedHash;

        setRecomputedOutput(recomputedNormalizedOutput);
        setExpectedHash(recomputedBindingHash);
        setVerifierModel(verificationPreview.model || verifierModelLabel);
        updateStep(
          "review",
          "success",
          `${verificationPreview.model || verifierModelLabel}: ${truncateValue(recomputedNormalizedOutput || "No output", 92)}`,
        );

        updateStep("verify", "running");
        const verification = await verifyDeterministicExecution(submitted.executionId, recomputedBindingHash);
        const accepted = verification.accepted ?? firstExecutionCommitment === recomputedBindingHash;
        setVerificationAccepted(accepted);
        updateStep(
          "verify",
          accepted ? "success" : "error",
          accepted
            ? `Execution accepted by ValidationRegistry. Tx ${truncateHash(verification.hash)}`
            : `Execution rejected by ValidationRegistry. Tx ${truncateHash(verification.hash)}`,
        );
        setVerificationSummary(
          accepted
            ? "Deterministic verification accepted: submitted execution commitment matched the recomputed expected hash."
            : "Deterministic verification rejected: recomputed expected hash did not match the submitted execution commitment.",
        );

        setMessages((prev) => {
          const updated = [...prev];
          for (let index = updated.length - 1; index >= 0; index -= 1) {
            if (updated[index]?.from === "agent") {
              updated[index] = {
                ...updated[index],
                verified: accepted,
              };
              break;
            }
          }
          return updated;
        });
      } else {
        updateStep("review", "running");
        persistPendingValidatorExecution({
          id: submitted.executionId,
          agentId,
          agentName,
          capability: capabilityName,
          parentExecutionId: 0,
          callerAgentId: 0,
          involvesExternalCall: false,
          externalService: "",
          deterministic: false,
          receivedAt: "Just now",
          trustScore: "Pending",
          riskLevel: "1",
          task: prompt,
          expectedReasoning: expectedReasoningTemplate || "Reasoning should explain how the result was produced.",
          outputSchema: outputSchemaTemplate || '{ "result": "string" }',
          reasoning: execution.reasoning || "No reasoning returned.",
          output: formattedExecution,
        });
        updateStep("review", "success", `Validator review card published for execution #${submitted.executionId}. Open Validators page to vote.`);

        updateStep("verify", "running");
        const executionStatus = await fetchExecutionStatus(submitted.executionId);
        if (executionStatus.finalized) {
          setVerificationAccepted(executionStatus.accepted);
          updateStep(
            "verify",
            executionStatus.accepted ? "success" : "error",
            executionStatus.accepted
              ? `Execution finalized and accepted after validator consensus.`
              : `Execution finalized and rejected after validator consensus.`,
          );
          setVerificationSummary(
            executionStatus.accepted
              ? "Validator consensus finalized this non-deterministic execution as accepted."
              : "Validator consensus finalized this non-deterministic execution as rejected.",
          );
          setMessages((prev) => {
            const updated = [...prev];
            for (let index = updated.length - 1; index >= 0; index -= 1) {
              if (updated[index]?.from === "agent") {
                updated[index] = {
                  ...updated[index],
                  verified: executionStatus.accepted,
                };
                break;
              }
            }
            return updated;
          });
          persistNonDeterministicStatus({
            agentId,
            executionId: submitted.executionId,
            steps: initialVerificationSteps("non-deterministic").map((step) => {
              if (step.key === "review") {
                return { ...step, status: "success", detail: `Validator review card published for execution #${submitted.executionId}. Open Validators page to vote.` };
              }
              if (step.key === "submit") {
                return {
                  ...step,
                  status: "success",
                  detail: `Execution #${submitted.executionId} submitted with reasoning hash and execution commitment. Tx ${truncateHash(submitted.hash)}`,
                };
              }
              if (step.key === "binding-hash") {
                return { ...step, status: "success", detail: `Execution commitment generated: ${truncateHash(firstExecutionCommitment)}` };
              }
              if (step.key === "agent-run") {
                return { ...step, status: "success", detail: `Agent output captured: ${truncateValue(formattedExecution, 92)}` };
              }
              if (step.key === "verify") {
                return {
                  ...step,
                  status: executionStatus.accepted ? "success" : "error",
                  detail: executionStatus.accepted
                    ? "Execution finalized and accepted after validator consensus."
                    : "Execution finalized and rejected after validator consensus.",
                };
              }
              return step;
            }),
            summary: executionStatus.accepted
              ? "Validator consensus finalized this non-deterministic execution as accepted."
              : "Validator consensus finalized this non-deterministic execution as rejected.",
            accepted: executionStatus.accepted,
            messages: [
              { from: "user", text: prompt },
              { from: "agent", text: formattedExecution, verified: executionStatus.accepted },
            ],
          });
        } else {
          setVerificationAccepted(null);
          const waitingDetail =
            `Waiting for validator votes. Current votes: ${executionStatus.approvals + executionStatus.rejections}. Finalization will happen once the minimum vote threshold is reached.`;
          updateStep(
            "verify",
            "running",
            waitingDetail,
          );
          setVerificationSummary("Non-deterministic execution submitted. Open Validators page to cast votes and finalize this execution.");
          persistNonDeterministicStatus({
            agentId,
            executionId: submitted.executionId,
            steps: initialVerificationSteps("non-deterministic").map((step) => {
              if (step.key === "review") {
                return { ...step, status: "success", detail: `Validator review card published for execution #${submitted.executionId}. Open Validators page to vote.` };
              }
              if (step.key === "submit") {
                return {
                  ...step,
                  status: "success",
                  detail: `Execution #${submitted.executionId} submitted with reasoning hash and execution commitment. Tx ${truncateHash(submitted.hash)}`,
                };
              }
              if (step.key === "binding-hash") {
                return { ...step, status: "success", detail: `Execution commitment generated: ${truncateHash(firstExecutionCommitment)}` };
              }
              if (step.key === "agent-run") {
                return { ...step, status: "success", detail: `Agent output captured: ${truncateValue(formattedExecution, 92)}` };
              }
              if (step.key === "verify") {
                return { ...step, status: "running", detail: waitingDetail };
              }
              return step;
            }),
            summary: "Non-deterministic execution submitted. Open Validators page to cast votes and finalize this execution.",
            accepted: null,
            messages: [
              { from: "user", text: prompt },
              { from: "agent", text: formattedExecution, verified: false },
            ],
          });
        }
      }
    } catch (error) {
      const message = formatDisplayError(error);
      setVerificationSummary(`Verification flow stopped: ${message}`);
      setVerificationSteps((current) =>
        current.map((step) =>
          step.status === "running"
            ? { ...step, status: "error", detail: message }
            : step,
        ),
      );
      setMessages((prev) => {
        const withoutPlaceholder = [...prev];
        const lastMessage = withoutPlaceholder[withoutPlaceholder.length - 1];
        if (lastMessage?.from === "agent" && lastMessage.text === "Executing task...") {
          withoutPlaceholder.pop();
        }
        return [
          ...withoutPlaceholder,
          {
            from: "agent",
            text: `Execution failed: ${message}`,
          },
        ];
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const closeAfterRating = () => {
    setShowExitRating(false);
    setHasHandledRating(true);
    onClose();
  };

  const dismissRating = () => {
    setRatingStatus("");
    closeAfterRating();
  };

  const handleAttemptClose = () => {
    if (isSubmittingRating) {
      return;
    }

    if (hasConversation && !hasHandledRating) {
      setShowExitRating(true);
      return;
    }

    onClose();
  };

  const submitRating = async () => {
    if (!canSubmitRating) return;

    setIsSubmittingRating(true);
    setRatingStatus("");

    try {
      await submitAgentReview(agentId, selectedRating * 10, feedback.trim());
      setRatingStatus("Thanks for the feedback. This session rating has been saved.");
      window.setTimeout(() => {
        closeAfterRating();
      }, 700);
    } catch (error) {
      setRatingStatus(`Failed to submit rating: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(12px)", background: "rgba(8, 10, 20, 0.4)" }}
      onClick={handleAttemptClose}
    >
      <main
        className="w-[720px] max-w-[92vw] min-h-[420px] max-h-[82vh] rounded-[16px] flex flex-col p-[24px] animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: "linear-gradient(180deg, rgba(18, 24, 46, 0.96), rgba(12, 18, 35, 0.96))",
          border: "1px solid rgba(120, 140, 255, 0.18)",
          boxShadow: "0 0 26px rgba(90, 110, 255, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-start mb-[16px]">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Compose Task with <span className="text-indigo-400">{agentName}</span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                {isFetchingEndpoint ? "Connecting" : "Ready"}
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Allow external calls"
                  aria-pressed={allowExternalCalls}
                  onClick={() => setAllowExternalCalls((prev) => !prev)}
                  className={`inline-flex h-6 w-10 items-center rounded-full border p-[2px] transition-colors ${
                    allowExternalCalls
                      ? "border-red-500/70 bg-red-500/15"
                      : "border-slate-700/80 bg-slate-900/80"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full shadow-[0_0_6px_rgba(148,163,184,0.35)] transition-all ${
                      allowExternalCalls ? "translate-x-4 bg-red-400" : "bg-slate-300"
                    }`}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] border-slate-700 bg-slate-950 text-xs text-slate-200">
                Allow agents to make external calls while handling this task.
              </TooltipContent>
            </Tooltip>
            <button
              onClick={handleAttemptClose}
              aria-label="Close modal"
              className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-white transition-colors shrink-0"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>

        <section
          className={`${chatHeight} rounded-[14px] p-4 overflow-y-auto flex flex-col gap-3 transition-all duration-300`}
          style={{
            background: "rgba(10, 16, 30, 0.85)",
            boxShadow: "inset 0 0 20px rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(120, 140, 255, 0.15)",
            scrollbarWidth: "none",
          }}
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-3 ${msg.from === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.from === "agent" ? "bg-indigo-500/20 border border-indigo-500/30" : "bg-purple-500/20 border border-purple-500/30"}`}>
                <span className={`text-[10px] font-bold ${msg.from === "agent" ? "text-indigo-400" : "text-purple-400"}`}>
                  {msg.from === "agent" ? agentInitials : "You"}
                </span>
              </div>
              <div className={`bg-white/5 border border-white/5 px-4 py-3 max-w-[85%] ${msg.from === "agent" ? "rounded-[12px] rounded-tl-none" : "rounded-[12px] rounded-tr-none"}`}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    {msg.verified && (
                      <span
                        className="mt-0.5 text-xs text-green-400"
                        style={{ textShadow: "0 0 6px rgba(34,197,94,0.7)" }}
                        aria-label="Verified"
                        title="Verified"
                      >
                        ✓
                      </span>
                    )}
                  </div>
                  {msg.verified && (
                    <div
                      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-green-400/25 bg-green-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-green-300"
                      style={{ boxShadow: "0 0 12px rgba(34,197,94,0.12)" }}
                    >
                      <span
                        className="text-xs text-green-400"
                        style={{ textShadow: "0 0 6px rgba(34,197,94,0.7)" }}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <span>Execution Verified</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>

        {ratingStatus && !showExitRating && <p className="mt-2 text-xs text-cyan-300">{ratingStatus}</p>}

        {showVerificationPanel && (
          <section
            className="mt-3 rounded-[20px] border p-4"
            style={{
              background: pipelinePanelBackground(verificationAccepted),
              borderColor: pipelinePanelBorder(verificationAccepted),
              boxShadow: pipelinePanelShadow(verificationAccepted),
              transition: "all 300ms ease-out",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Execution Verification Pipeline (Deterministic)</h3>
              <span className="rounded-full border px-2.5 py-1 text-[10px] font-semibold" style={badgeStyle(verificationAccepted)}>
                {verificationAccepted === null ? "Pending" : verificationAccepted ? "Accepted" : "Rejected"}
              </span>
            </div>

            <div className="mt-4 pb-1">
              <div className="grid grid-cols-5 items-start gap-2 w-full px-4">
                {verificationSteps.map((step, index) => (
                  <div key={step.key} className="relative flex min-w-0 flex-col items-center">
                    {index < verificationSteps.length - 1 && (
                      <div
                        className="absolute top-[6px] left-1/2 h-[2px] w-[calc(100%-0.25rem)] overflow-hidden rounded-full"
                        style={connectorBaseStyle()}
                      >
                        <div
                          className={`h-full w-full rounded-full transition-all duration-300 ease-out ${
                            connectorPulseStatus(verificationSteps, index + 1) ? "animate-pulse" : ""
                          }`}
                          style={connectorSegmentStyle(verificationSteps, index + 1)}
                        />
                      </div>
                    )}
                    {index === verificationSteps.length - 1 && (
                      <div
                        className="pointer-events-none absolute top-[6px] left-1/2 h-[2px] w-1/2"
                        style={{ background: "rgba(10,18,35,0.95)" }}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-center">
                      <div className="rounded-full bg-[rgba(10,18,35,0.95)] p-[2px]">
                        <div
                          className={`relative h-3 w-3 rounded-full transition-all duration-300 ease-out ${
                            step.status === "running" ? "animate-pulse scale-110" : ""
                          }`}
                          style={nodeStyle(step.status)}
                        />
                      </div>
                    </div>
                    <p className="mt-2 max-w-[88px] text-center text-[11px] leading-tight" style={stepLabelStyle(step.status)}>
                      {formatEdgeStepLabel(compactStepLabel(step.label)).map((line) => (
                        <span key={`${step.key}-${line}`} className="block">
                          {line}
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="mt-4 rounded-[18px] border p-4"
              style={{
                borderColor: activeCardBorder(activeVerificationStep?.status ?? "idle"),
                background: activeCardBackground(activeVerificationStep?.status ?? "idle"),
                boxShadow:
                  activeVerificationStep?.status === "running"
                    ? "0 0 12px rgba(59,130,246,0.22)"
                    : "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <div className="flex flex-col gap-2 text-sm text-slate-300">
                <span className="font-semibold text-white">{activeVerificationStep?.label ?? "Verification pipeline"}</span>
                <span className="text-slate-400">{liveStepDetail.main}</span>
                {liveStepDetail.hash && (
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400">Tx</span>
                    <span className="font-mono text-xs break-all text-cyan-300">{liveStepDetail.hash}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="mt-[12px] flex items-center gap-[10px]">
          <input
            className="flex-1 h-[42px] rounded-[10px] px-4 text-sm text-white focus:outline-none transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(20, 28, 48, 0.85), rgba(12, 18, 35, 0.85))",
              border: "1px solid rgba(120, 140, 255, 0.25)",
            }}
            placeholder="Enter your task (e.g., 'Rebalance my portfolio')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isFetchingEndpoint || isExecuting}
            onKeyDown={(e) => e.key === "Enter" && void sendTask()}
          />
          <button
            onClick={() => void sendTask()}
            disabled={isFetchingEndpoint || isExecuting}
            className="h-[42px] px-6 text-white rounded-[10px] text-sm font-semibold transition-all flex items-center gap-2 flex-shrink-0 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(90deg, #4f8cff 0%, #7a6cff 100%)",
              boxShadow: "0 4px 18px rgba(120, 140, 255, 0.45)",
            }}
          >
            <span>{isExecuting ? "Running..." : "Send Task"}</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M13 5l7 7-7 7M5 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </section>

        {showExitRating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-5 bg-[rgba(5,10,22,0.58)] backdrop-blur-md">
            <style>{`
              @keyframes fadeInScale {
                from {
                  opacity: 0;
                  transform: scale(0.96);
                }
                to {
                  opacity: 1;
                  transform: scale(1);
                }
              }
            `}</style>
            <section className="w-full max-w-[500px]" style={{ animation: "fadeInScale 250ms ease-out" }}>
              <div
                className="relative rounded-[22px] p-5 border"
                style={{
                  background:
                    "radial-gradient(circle at top left, rgba(34, 211, 238, 0.16), transparent 36%), linear-gradient(160deg, rgba(18, 26, 49, 0.92), rgba(10, 16, 31, 0.95))",
                  borderColor: "rgba(148, 163, 184, 0.14)",
                  boxShadow: "0 30px 80px rgba(0, 0, 0, 0.5), 0 0 40px rgba(56, 189, 248, 0.12)",
                  backdropFilter: "blur(18px)",
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 rounded-[22px]"
                  style={{
                    padding: "1px",
                    background: "linear-gradient(120deg, rgba(56,189,248,0.4), rgba(99,102,241,0.2), transparent)",
                    WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                    WebkitMaskComposite: "xor",
                    opacity: 0.4,
                  }}
                />
                <button
                  type="button"
                  onClick={dismissRating}
                  className="absolute right-4 top-4 h-9 w-9 flex items-center justify-center rounded-full border text-slate-400 hover:text-white transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.12)",
                    backdropFilter: "blur(6px)",
                  }}
                  aria-label="Close rating"
                  disabled={isSubmittingRating}
                >
                  <span className="material-symbols-outlined text-[18px] leading-none transition-transform duration-200 group-hover:rotate-90">close</span>
                </button>

                <div className="mb-4 pr-12">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80">Rate your experience</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">How was this chat?</h3>
                  </div>
                </div>

                <div
                  className="mt-4 rounded-[20px] border px-4 py-4"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    {starOptions.map((star) => {
                      const isSelected = star <= selectedRating;
                      const starColor =
                        star <= 1
                          ? "#ef4444"
                          : star <= 2
                            ? "#f87171"
                            : star <= 3
                              ? "#fb923c"
                              : star <= 4
                                ? "#facc15"
                                : "#fde047";

                      return (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSelectedRating(star)}
                          className="transition-all duration-200 ease-out hover:scale-[1.15]"
                          aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                        >
                          <span
                            className={`material-symbols-outlined text-[32px] sm:text-[38px] leading-none ${isSelected ? "fill-1" : ""}`}
                            style={{
                              color: isSelected ? starColor : "#475569",
                              textShadow: isSelected ? `0 0 18px ${starColor}` : "none",
                              transition: "all 250ms ease",
                            }}
                          >
                            {isSelected ? "star" : "star_outline"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <textarea
                  className="mt-4 w-full rounded-[14px] px-[14px] py-3 text-sm text-white focus:outline-none transition-all resize-none placeholder:text-slate-400/50"
                  style={{
                    background: "rgba(7, 12, 24, 0.85)",
                    border: "1px solid rgba(148, 163, 184, 0.12)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
                  }}
                  placeholder="Feedback"
                  rows={1}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={isSubmittingRating}
                />

                {ratingStatus && <p className="mt-3 text-xs text-cyan-300">{ratingStatus}</p>}

                <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={dismissRating}
                    className="h-11 px-4 rounded-[14px] text-sm font-medium text-slate-200 border transition-all duration-200 hover:bg-white/10"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      borderColor: "rgba(255,255,255,0.1)",
                      color: "#cbd5f5",
                    }}
                    disabled={isSubmittingRating}
                  >
                    Next time
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitRating()}
                    disabled={!canSubmitRating}
                    className="h-11 px-5 rounded-[14px] text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-[1px]"
                    style={{
                      background: "linear-gradient(90deg, #67e8f9 0%, #60a5fa 45%, #34d399 100%)",
                      boxShadow: "0 10px 30px rgba(56,189,248,0.35), 0 0 20px rgba(34,197,94,0.2)",
                    }}
                  >
                    {isSubmittingRating ? "Saving session rating..." : "Submit and close"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function formatExecution(_prompt: string, execution: AgentExecutionResponse) {
  const resultText = typeof execution.result === "string" ? execution.result : JSON.stringify(execution.result, null, 2);
  return resultText || "No result returned";
}

function normalizeExecutionResult(execution: AgentExecutionResponse) {
  if (typeof execution.normalizedOutput === "string") {
    return execution.normalizedOutput.replace(/\s+/g, " ").trim().toLowerCase();
  }

  if (typeof execution.result === "string") {
    return execution.result.replace(/\s+/g, " ").trim().toLowerCase();
  }

  if (execution.result === undefined) {
    return "";
  }

  return JSON.stringify(execution.result).replace(/\s+/g, " ").trim().toLowerCase();
}

function isUndefinedExecution(execution: AgentExecutionResponse) {
  return normalizeExecutionResult(execution) === "undefined";
}

function truncateHash(value: string, size = 10) {
  if (!value) {
    return value;
  }

  if (value.length <= size * 2) {
    return value;
  }

  return `${value.slice(0, size)}...${value.slice(-size)}`;
}

function truncateValue(value: string, max = 96) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}...`;
}

function compactStepLabel(label: string) {
  return label.replace(/^\d+\.\s*/, "");
}

function formatEdgeStepLabel(label: string) {
  if (label === "Run Agent") {
    return ["Run", "Agent"];
  }

  if (label === "Final Verify") {
    return ["Final", "Verify"];
  }

  return [label];
}

function getActiveVerificationIndex(steps: VerificationStep[]) {
  const runningIndex = steps.findIndex((step) => step.status === "running");
  if (runningIndex >= 0) {
    return runningIndex;
  }

  const errorIndex = steps.findIndex((step) => step.status === "error");
  if (errorIndex >= 0) {
    return errorIndex;
  }

  const completedIndex = [...steps].reverse().findIndex((step) => step.status === "success");
  if (completedIndex >= 0) {
    return steps.length - 1 - completedIndex;
  }

  return 0;
}

function connectorBaseStyle() {
  return {
    background: "rgba(71, 85, 105, 0.45)",
  };
}

function connectorSegmentStyle(steps: VerificationStep[], index: number) {
  const status = steps[index]?.status ?? "idle";

  if (status === "success") {
    return {
      background: "#4ade80",
      boxShadow: "0 0 6px rgba(34,197,94,0.6)",
    };
  }

  if (status === "running") {
    return {
      background: "linear-gradient(90deg, rgba(96,165,250,1), rgba(129,140,248,1))",
      boxShadow: "0 0 8px rgba(59,130,246,0.35)",
    };
  }

  return {
    background: "rgba(71, 85, 105, 0.7)",
    opacity: 0.4,
  };
}

function connectorPulseStatus(steps: VerificationStep[], index: number) {
  return steps[index]?.status === "running";
}

function nodeStyle(status: VerificationStepStatus) {
  if (status === "success") {
    return {
      background: "#4ade80",
      boxShadow: "0 0 10px rgba(34,197,94,0.8), 0 0 20px rgba(34,197,94,0.15)",
    };
  }

  if (status === "error") {
    return {
      background: "#fb7185",
      boxShadow: "0 0 10px rgba(244,63,94,0.45)",
    };
  }

  if (status === "running") {
    return {
      background: "#60a5fa",
      boxShadow: "0 0 14px rgba(59,130,246,0.9)",
    };
  }

  return {
    background: "rgba(71,85,105,0.9)",
    opacity: 0.5,
  };
}

function activeCardBorder(status: VerificationStepStatus) {
  if (status === "success") {
    return "rgba(45, 212, 191, 0.22)";
  }

  if (status === "error") {
    return "rgba(251, 113, 133, 0.22)";
  }

  if (status === "running") {
    return "rgba(56, 189, 248, 0.24)";
  }

  return "rgba(148, 163, 184, 0.14)";
}

function stepLabelStyle(status: VerificationStepStatus) {
  if (status === "success") {
    return {
      color: "#4ade80",
      opacity: 0.8,
      fontWeight: 500,
    };
  }

  if (status === "running") {
    return {
      color: "#ffffff",
      fontWeight: 500,
    };
  }

  return {
    color: status === "error" ? "#fda4af" : "#94a3b8",
    opacity: status === "error" ? 0.9 : 0.5,
  };
}

function activeCardBackground(status: VerificationStepStatus) {
  if (status === "running") {
    return "linear-gradient(90deg, rgba(59,130,246,0.12), rgba(139,92,246,0.1))";
  }

  return "rgba(255,255,255,0.02)";
}

function splitTxDetail(detail: string) {
  const hashMatch = detail.match(/(0x[a-fA-F0-9.]+)/);
  const hash = hashMatch?.[1] ?? "";

  if (!hash) {
    return { main: detail, hash: "" };
  }

  return {
    main: detail.replace(hash, "").trim(),
    hash,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function persistPendingValidatorExecution(execution: {
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
}) {
  try {
    const raw = window.localStorage.getItem(VALIDATOR_REVIEW_STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const persistedExecution = {
      ...execution,
      createdAt: Date.now(),
      expiresAt: Date.now() + NON_DETERMINISTIC_REVIEW_TTL_MS,
    };
    const next = Array.isArray(current)
      ? [persistedExecution, ...current.filter((item: { id?: number }) => item?.id !== execution.id)].slice(0, 10)
      : [persistedExecution];
    window.localStorage.setItem(VALIDATOR_REVIEW_STORAGE_KEY, JSON.stringify(next));
  } catch {
    window.localStorage.setItem(
      VALIDATOR_REVIEW_STORAGE_KEY,
      JSON.stringify([
        {
          ...execution,
          createdAt: Date.now(),
          expiresAt: Date.now() + NON_DETERMINISTIC_REVIEW_TTL_MS,
        },
      ])
    );
  }
}

function persistNonDeterministicStatus(params: {
  agentId: number;
  executionId: number;
  steps: VerificationStep[];
  summary: string;
  accepted: boolean | null;
  messages: ModalMessage[];
}) {
  const payload = {
    ...params,
    expiresAt: Date.now() + NON_DETERMINISTIC_REVIEW_TTL_MS,
  };

  try {
    const raw = window.localStorage.getItem(NON_DETERMINISTIC_STATUS_STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(current)
      ? [payload, ...current.filter((item: { agentId?: number }) => item?.agentId !== params.agentId)].slice(0, 10)
      : [payload];
    window.localStorage.setItem(NON_DETERMINISTIC_STATUS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    window.localStorage.setItem(NON_DETERMINISTIC_STATUS_STORAGE_KEY, JSON.stringify([payload]));
  }
}

function readPersistedNonDeterministicStatus(agentId: number): {
  agentId: number;
  executionId: number;
  steps: VerificationStep[];
  summary: string;
  accepted: boolean | null;
  messages: ModalMessage[];
  expiresAt: number;
} | null {
  try {
    const raw = window.localStorage.getItem(NON_DETERMINISTIC_STATUS_STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(current)) {
      return null;
    }

    const now = Date.now();
    const active = current.filter((item) => typeof item?.expiresAt === "number" && item.expiresAt > now);
    if (active.length !== current.length) {
      window.localStorage.setItem(NON_DETERMINISTIC_STATUS_STORAGE_KEY, JSON.stringify(active));
    }

    return active.find((item) => item?.agentId === agentId) ?? null;
  } catch {
    return null;
  }
}

function updatePersistedMessagesVerification(messages: ModalMessage[], accepted: boolean | null) {
  if (accepted !== true) {
    return messages;
  }

  const updated = [...messages];
  for (let index = updated.length - 1; index >= 0; index -= 1) {
    if (updated[index]?.from === "agent") {
      updated[index] = {
        ...updated[index],
        verified: true,
      };
      break;
    }
  }

  return updated;
}

function pipelinePanelBackground(accepted: boolean | null) {
  if (accepted === true) {
    return "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(16,185,129,0.03) 35%, rgba(7,12,24,0.97) 75%), linear-gradient(180deg, rgba(10, 18, 35, 0.95), rgba(7, 12, 24, 0.97))";
  }

  return "radial-gradient(circle at top right, rgba(34, 211, 238, 0.1), transparent 24%), linear-gradient(180deg, rgba(10, 18, 35, 0.95), rgba(7, 12, 24, 0.97))";
}

function pipelinePanelBorder(accepted: boolean | null) {
  if (accepted === true) {
    return "rgba(74, 222, 128, 0.3)";
  }

  return "rgba(125, 211, 252, 0.16)";
}

function pipelinePanelShadow(accepted: boolean | null) {
  if (accepted === true) {
    return "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 30px rgba(34,197,94,0.2)";
  }

  return "inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 42px rgba(3, 7, 18, 0.2)";
}

function badgeStyle(accepted: boolean | null) {
  if (accepted === true) {
    return {
      borderColor: "rgba(52, 211, 153, 0.3)",
      background: "rgba(34, 197, 94, 0.1)",
      color: "#4ade80",
    };
  }

  if (accepted === false) {
    return {
      borderColor: "rgba(248, 113, 113, 0.3)",
      background: "rgba(239, 68, 68, 0.12)",
      color: "#fecaca",
    };
  }

  return {
    borderColor: "rgba(148, 163, 184, 0.18)",
    background: "rgba(255,255,255,0.04)",
    color: "#cbd5e1",
  };
}

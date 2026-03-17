import { useEffect, useMemo, useState } from "react";
import {
  executeAgentTask,
  fetchAgentExecutionMetadata,
  submitAgentReview,
  type AgentExecutionResponse,
} from "@/lib/hedera";

interface ComposeTaskModalProps {
  agentId: number;
  agentName: string;
  agentInitials: string;
  capabilities: string[];
  onClose: () => void;
}

type ModalMessage = {
  from: "agent" | "user";
  text: string;
};

const ratingOptions = [10, 20, 30, 40, 50] as const;

export default function ComposeTaskModal({
  agentId,
  agentName,
  agentInitials,
  capabilities,
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
  const [showRatingCard, setShowRatingCard] = useState(false);
  const [selectedRating, setSelectedRating] = useState<(typeof ratingOptions)[number]>(50);
  const [feedback, setFeedback] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingStatus, setRatingStatus] = useState<string>("");

  const canSubmitRating = useMemo(() => !isSubmittingRating && Boolean(selectedRating), [isSubmittingRating, selectedRating]);

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
        setMessages((prev) => [
          ...prev,
          {
            from: "agent",
            text: `Connected to agent endpoint from IPFS metadata (${metadata.metadataUri}).`,
          },
        ]);
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

  const sendTask = async () => {
    const prompt = input.trim();
    if (!prompt || isFetchingEndpoint || isExecuting) return;

    if (!endpoint) {
      setMessages((prev) => [
        ...prev,
        { from: "user", text: prompt },
        { from: "agent", text: "This agent endpoint is not available. Please try again later." },
      ]);
      setInput("");
      return;
    }

    setShowRatingCard(false);
    setRatingStatus("");
    setInput("");
    setIsExecuting(true);
    setMessages((prev) => [...prev, { from: "user", text: prompt }, { from: "agent", text: "Executing task..." }]);

    try {
      const execution = await executeAgentTask(endpoint, prompt);
      setMessages((prev) => {
        const withoutPlaceholder = [...prev];
        withoutPlaceholder.pop();
        return [...withoutPlaceholder, { from: "agent", text: formatExecution(prompt, execution) }];
      });
      setShowRatingCard(true);
    } catch (error) {
      setMessages((prev) => {
        const withoutPlaceholder = [...prev];
        withoutPlaceholder.pop();
        return [
          ...withoutPlaceholder,
          {
            from: "agent",
            text: `Execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ];
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const submitRating = async () => {
    if (!canSubmitRating) return;

    setIsSubmittingRating(true);
    setRatingStatus("");

    try {
      await submitAgentReview(agentId, selectedRating, feedback.trim());
      setRatingStatus("Thanks for your feedback. Your rating has been submitted successfully.");
      setShowRatingCard(false);
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
      onClick={onClose}
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
            <p className="text-xs text-slate-400 mt-1">Interact with agent #{String(agentId).padStart(3, "0")} to perform a task.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                {isFetchingEndpoint ? "Connecting" : "Ready"}
              </span>
            </div>
            <button onClick={onClose} aria-label="Close modal" className="p-1 text-slate-500 hover:text-white transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>

        <section
          className="h-[360px] rounded-[14px] p-4 overflow-y-auto flex flex-col gap-3"
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
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}
        </section>

        {showRatingCard && (
          <section
            className="mt-3 rounded-[12px] p-4 border"
            style={{
              background: "linear-gradient(160deg, rgba(28, 35, 62, 0.92), rgba(18, 24, 45, 0.92))",
              borderColor: "rgba(120, 140, 255, 0.25)",
            }}
          >
            <p className="text-sm font-semibold text-white">How was this response?</p>
            <p className="text-xs text-slate-400 mt-1">Optional: share a quick rating to help improve agent quality.</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {ratingOptions.map((value) => {
                const label = (value / 10).toFixed(1);
                const selected = selectedRating === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedRating(value)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                    style={{
                      border: `1px solid ${selected ? "rgba(99, 102, 241, 0.9)" : "rgba(148, 163, 184, 0.25)"}`,
                      background: selected ? "rgba(79, 140, 255, 0.2)" : "rgba(15, 23, 42, 0.55)",
                      color: selected ? "#c7d2fe" : "#cbd5e1",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <textarea
              className="mt-3 w-full rounded-[10px] px-3 py-2 text-sm text-white focus:outline-none transition-all"
              style={{
                background: "rgba(10, 16, 30, 0.85)",
                border: "1px solid rgba(120, 140, 255, 0.2)",
              }}
              placeholder="Optional feedback"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={isSubmittingRating}
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRatingCard(false)}
                className="h-[36px] px-4 rounded-[10px] text-sm font-medium text-slate-200 border border-slate-500/30 bg-slate-900/30 hover:bg-slate-900/60 transition-all"
                disabled={isSubmittingRating}
              >
                Next time
              </button>
              <button
                type="button"
                onClick={() => void submitRating()}
                disabled={!canSubmitRating}
                className="h-[36px] px-4 rounded-[10px] text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(90deg, #4f8cff 0%, #7a6cff 100%)",
                  boxShadow: "0 4px 18px rgba(120, 140, 255, 0.35)",
                }}
              >
                {isSubmittingRating ? "Submitting..." : "Submit rating"}
              </button>
            </div>
          </section>
        )}

        {ratingStatus && <p className="mt-2 text-xs text-cyan-300">{ratingStatus}</p>}

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
      </main>
    </div>
  );
}

function formatExecution(prompt: string, execution: AgentExecutionResponse) {
  const resultText = typeof execution.result === "string" ? execution.result : JSON.stringify(execution.result, null, 2);

  return ["Prompt", execution.input || prompt, "", "Result", resultText || "No result returned", "", "Output Hash", execution.outputHash || "N/A"].join("\n");
}

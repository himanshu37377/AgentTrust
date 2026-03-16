import { useState } from "react";

interface ComposeTaskModalProps {
  agentId: number;
  agentName: string;
  agentInitials: string;
  capabilities: string[];
  onClose: () => void;
}

export default function ComposeTaskModal({
  agentId,
  agentName,
  agentInitials,
  capabilities,
  onClose,
}: ComposeTaskModalProps) {
  const [messages, setMessages] = useState([
    {
      from: "agent",
      text: `Agent #${String(agentId).padStart(3, "0")} ready to receive tasks. Supported capabilities: ${capabilities.join(", ") || "General execution"}.`,
    },
  ]);
  const [input, setInput] = useState("");

  const sendTask = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      { from: "user", text: input },
      { from: "agent", text: `Processing task: "${input}". Analyzing parameters and preparing execution plan...` },
    ]);
    setInput("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(12px)", background: "rgba(8, 10, 20, 0.4)" }}
      onClick={onClose}
    >
      <main
        className="w-[720px] max-w-[92vw] min-h-[420px] max-h-[75vh] rounded-[16px] flex flex-col p-[24px] animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: "linear-gradient(180deg, rgba(18, 24, 46, 0.96), rgba(12, 18, 35, 0.96))",
          border: "1px solid rgba(120, 140, 255, 0.18)",
          boxShadow: "0 0 26px rgba(90, 110, 255, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Ready</span>
            </div>
            <button onClick={onClose} aria-label="Close modal" className="p-1 text-slate-500 hover:text-white transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>

        {/* Chat */}
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
                <p className="text-sm text-slate-300 leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Input */}
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
            onKeyDown={(e) => e.key === "Enter" && sendTask()}
          />
          <button
            onClick={sendTask}
            className="h-[42px] px-6 text-white rounded-[10px] text-sm font-semibold transition-all flex items-center gap-2 flex-shrink-0 hover:opacity-90"
            style={{
              background: "linear-gradient(90deg, #4f8cff 0%, #7a6cff 100%)",
              boxShadow: "0 4px 18px rgba(120, 140, 255, 0.45)",
            }}
          >
            <span>Send Task</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M13 5l7 7-7 7M5 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </section>
      </main>
    </div>
  );
}

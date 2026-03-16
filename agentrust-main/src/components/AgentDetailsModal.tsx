import { useEffect, useState } from "react";

interface AgentDetails {
  name: string;
  agentId: string;
  description: string;
  risk: string;
  riskColor: string;
  capabilities: { name: string; active: boolean }[];
  authorizedCount: number;
}

interface AgentDetailsModalProps {
  agent: AgentDetails;
  onClose: () => void;
}

export default function AgentDetailsModal({ agent, onClose }: AgentDetailsModalProps) {
  const [capabilities, setCapabilities] = useState(agent.capabilities);

  useEffect(() => {
    setCapabilities(agent.capabilities);
  }, [agent]);

  const authorizedCount = capabilities.filter((c) => c.active).length;

  const toggleCapability = (index: number) => {
    setCapabilities((prev) =>
      prev.map((c, i) => (i === index ? { ...c, active: !c.active } : c))
    );
  };

  const riskStyles: Record<string, string> = {
    green: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    yellow: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    red: "bg-red-500/10 border-red-500/20 text-red-400",
  };

  const riskLabels: Record<string, string> = {
    green: "[ LOW RISK ]",
    yellow: "[ MEDIUM RISK ]",
    red: "[ HIGH RISK ]",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(12px)", background: "rgba(8, 10, 20, 0.4)" }}
      onClick={onClose}
    >
      <section
        className="w-full max-w-[680px] rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300"
        style={{
          background: "linear-gradient(180deg, rgba(18, 24, 46, 0.95) 0%, rgba(12, 18, 35, 0.95) 100%)",
          border: "1px solid rgba(120, 140, 255, 0.18)",
          boxShadow: "0 0 40px rgba(79, 70, 229, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="p-6 flex justify-between items-start" style={{ borderBottom: "1px solid rgba(120, 140, 255, 0.18)" }}>
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-[12px] flex items-center justify-center border border-white/20"
              style={{
                background: "radial-gradient(circle, #4f8cff, #7a6cff)",
                boxShadow: "0 0 15px rgba(79, 140, 255, 0.5)",
              }}
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight leading-tight">{agent.name}</h2>
              <p className="text-xs text-indigo-400 font-mono mt-0.5">Agent ID: {agent.agentId}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close modal" className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </header>

        {/* Content */}
        <main className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold mb-3">Description</label>
                <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
                  <p className="text-slate-300 text-sm leading-[1.6]">{agent.description}</p>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold mb-3">Authorization</label>
                <button className="w-full h-[42px] text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity" style={{ background: "linear-gradient(90deg, #4f46e5 0%, #9333ea 100%)" }}>
                  Authorize Selected Capabilities
                </button>
                <div className="mt-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 8px rgba(16,185,129,0.5)" }} />
                  <span className="text-[11px] text-slate-400 font-medium">Authorized for {authorizedCount} capabilities</span>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold mb-3">Security Tier</label>
                <div className={`inline-flex items-center px-3 py-1.5 rounded-md border text-[11px] font-bold tracking-wider ${riskStyles[agent.riskColor]}`}>
                  {riskLabels[agent.riskColor]}
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold mb-3">Capabilities</label>
                <div className="flex flex-col gap-2.5">
                  {capabilities.map((cap, i) => (
                    <button
                      key={cap.name}
                      onClick={() => toggleCapability(i)}
                      className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-xs transition-all ${
                        cap.active
                          ? "text-white border border-transparent"
                          : "bg-white/5 border border-white/10 text-slate-400 hover:border-indigo-500/50 hover:text-slate-200"
                      }`}
                      style={cap.active ? { background: "linear-gradient(90deg, #4f46e5 0%, #9333ea 100%)" } : {}}
                    >
                      <span>{cap.name}</span>
                      {cap.active ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd" />
                        </svg>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-600" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-6 bg-white/5 flex justify-end gap-3" style={{ borderTop: "1px solid rgba(120, 140, 255, 0.18)" }}>
          <button onClick={onClose} className="px-6 py-2 rounded-lg text-slate-400 text-sm font-medium hover:text-white hover:bg-white/5 transition-all">
            Close
          </button>
          <button className="px-8 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ background: "linear-gradient(90deg, #4f46e5 0%, #9333ea 100%)", boxShadow: "0 10px 20px rgba(79, 70, 229, 0.2)" }}>
            Authorize
          </button>
        </footer>
      </section>
    </div>
  );
}

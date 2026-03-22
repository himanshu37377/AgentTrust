import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative w-full py-24 md:py-36 px-6 md:px-20 overflow-hidden min-h-[80vh] flex items-center">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background-dark/20 via-background-dark/80 to-background-dark" />
          <div className="absolute inset-0 bg-gradient-to-r from-background-dark via-transparent to-background-dark opacity-80" />
        </div>
        <div className="absolute inset-0 opacity-40 pointer-events-none">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <circle className="node animate-pulse-slow" cx="10%" cy="20%" r="2" />
            <circle className="node animate-pulse-slow" cx="80%" cy="15%" r="1.5" style={{ animationDelay: "1s" }} />
            <circle className="node animate-pulse-slow" cx="90%" cy="80%" r="2.5" style={{ animationDelay: "2s" }} />
            <circle className="node animate-pulse-slow" cx="15%" cy="85%" r="2" style={{ animationDelay: "1.5s" }} />
            <line className="link" x1="10%" x2="80%" y1="20%" y2="15%" />
            <line className="link" x1="80%" x2="90%" y1="15%" y2="80%" />
            <line className="link" x1="90%" x2="15%" y1="80%" y2="85%" />
            <line className="link" x1="15%" x2="10%" y1="85%" y2="20%" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto relative z-10 w-full">
          <div className="flex flex-col items-center text-center gap-10">
            <div className="inline-flex items-center gap-2 bg-trust-accent-blue/10 border border-trust-accent-blue/30 px-4 py-1.5 rounded-full backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-trust-accent-blue opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-trust-accent-blue" />
              </span>
              <span className="text-trust-accent-blue text-[10px] font-black uppercase tracking-[0.2em]">Decentralized Trust Protocol</span>
            </div>
            <h1 className="max-w-4xl text-6xl md:text-8xl font-black text-white leading-[1.1] tracking-tight">
              Trust Infrastructure for <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-trust-accent-blue via-[#00ffd5] to-trust-accent-purple">AI Agents</span>
            </h1>
            <p className="text-xl md:text-2xl font-medium text-slate-400 max-w-3xl leading-relaxed mt-4">
            A decentralized verification network for the autonomous economy. Validating agent behavior through staking, validator consensus, and execution proofs.

            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 mt-6">
              <Link to="/explore" className="bg-[#00ffd5] hover:brightness-110 text-slate-950 rounded-xl px-10 py-5 text-lg font-black shadow-[0_0_30px_rgba(0,242,255,0.4)] transition-all hover:scale-105 active:scale-95">
                Explore Agents
              </Link>
              <Link to="/register" className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl px-10 py-5 text-lg font-bold backdrop-blur-md transition-all">
                Register Your Agent
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The Challenge Section */}
      <section className="pt-[120px] pb-32 px-6 md:px-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-neural-grid opacity-[0.035] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-trust-accent-blue/50 to-transparent" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-end">
            <div className="space-y-8 lg:sticky lg:top-[120px] px-0 py-0">
              <div className="text-trust-accent-purple font-black tracking-widest uppercase text-2xl md:text-3xl">The Challenge</div>
              <h2 className="text-[48px] md:text-[64px] font-bold text-white leading-[1.1]">
                The Trust Gap in <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-trust-accent-purple to-trust-accent-blue">AI Agents</span>
              </h2>
              <p className="text-slate-300 text-[20px] font-medium leading-relaxed">
              AI agents are becoming autonomous systems capable of trading assets, analyzing sensitive data, and performing complex tasks across the web.
              </p>
              <div className="p-8 rounded-2xl bg-trust-accent-purple/5 border-2 border-trust-accent-purple/20 relative group overflow-hidden">
                <div className="absolute inset-0 bg-trust-accent-purple/5 blur-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10 flex gap-4">
                  <span className="material-symbols-outlined text-trust-accent-purple text-3xl shrink-0">warning</span>
                  <div className="space-y-2">
                    <div className="text-trust-accent-purple text-xs font-black uppercase tracking-[0.3em]">Trust gap</div>
                    <p className="text-white font-semibold text-[22px] leading-tight">But there is no decentralized system to verify agent behavior and ensure they can be trusted.</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Flow Diagram */}
            <div className="flex justify-center w-full">
              <div className="execution-flow-container p-8 rounded-[2rem] w-full max-w-[540px] relative px-[16px] py-5">
                <div className="flex flex-col items-center">
                  {/* User Intent */}
                  <div className="flow-glass-card max-h-[85px] w-full border-trust-accent-blue/20 bg-trust-accent-blue/5 rounded-full">
                    <div className="flex items-center w-full gap-[20px]">
                      <div className="size-14 rounded-xl bg-trust-accent-blue/10 flex items-center justify-center border border-trust-accent-blue/30 shadow-[0_0_15px_rgba(43,140,238,0.2)] flex-shrink-0">
                        <span className="material-symbols-outlined text-2xl text-trust-accent-blue">person</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-white text-[17px] font-bold">User Intent</h4>
                        <div className="h-1.5 w-full bg-slate-800/50 rounded-full mt-3 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-trust-accent-blue to-[#00ffd5] animate-fill-progress" style={{ width: "85%" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flow-connector bg-gradient-to-b from-trust-accent-blue to-trust-accent-purple">
                    <div className="flow-particle-v text-trust-accent-blue" style={{ animationDelay: "0s" }} />
                  </div>
                  {/* User Cannot Trust */}
                  <div className="flow-glass-card max-h-[85px] w-full border-yellow-500/30 bg-yellow-500/5 animate-pulse-warning-yellow rounded-full">
                    <div className="flex items-center gap-5 w-full">
                      <div className="size-14 rounded-xl bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-2xl text-yellow-500">privacy_tip</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-yellow-500 text-[17px] font-black uppercase tracking-tight leading-tight">User Cannot Trust Agent Behavior</h4>
                        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                          <span className="size-1 bg-yellow-500 rounded-full animate-pulse" />
                          <span className="text-[9px] text-yellow-500 font-black uppercase tracking-widest">Trust Unknown</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flow-connector bg-trust-accent-purple">
                    <div className="flow-particle-v text-trust-accent-purple" style={{ animationDelay: "0.4s" }} />
                  </div>
                  {/* Autonomous Agent */}
                  <div className="flow-glass-card max-h-[85px] w-full border-trust-accent-purple/30 bg-trust-accent-purple/5 rounded-full">
                    <div className="flex items-center gap-5 w-full">
                      <div className="size-14 rounded-xl bg-gradient-to-br from-trust-accent-purple to-trust-accent-blue flex items-center justify-center shadow-lg shadow-trust-accent-purple/30 animate-pulse-agent flex-shrink-0">
                        <span className="material-symbols-outlined text-2xl text-white">smart_toy</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-white text-[17px] font-bold">Autonomous Agent</h4>
                        <span className="text-[11px] text-trust-accent-purple/80 font-mono typing-effect">Processing logic...</span>
                      </div>
                    </div>
                  </div>
                  <div className="flow-connector bg-gradient-to-b from-trust-accent-purple to-red-500">
                    <div className="flow-particle-v text-red-500" style={{ animationDelay: "0.8s" }} />
                  </div>
                  {/* Unverified */}
                  <div className="flow-glass-card max-h-[85px] w-full border-red-500/40 bg-red-950/20 animate-pulse-warning rounded-full">
                    <div className="flex items-center gap-5 w-full">
                      <div className="size-14 rounded-xl bg-red-500/10 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-2xl text-red-500">report</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-red-500 text-[17px] font-black uppercase tracking-tight">Unverified Execution</h4>
                        <div className="flex gap-2 mt-2">
                          <span className="text-[8px] px-2 py-0.5 rounded-full bg-red-600/20 text-red-100 border border-red-500/30 font-black uppercase">Opaque</span>
                          <span className="text-[8px] px-2 py-0.5 rounded-full bg-red-600/20 text-red-100 border border-red-500/30 font-black uppercase">No Proof</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flow-connector bg-red-500">
                    <div className="flow-particle-v text-red-500" style={{ animationDelay: "1.2s" }} />
                  </div>
                  {/* Malicious */}
                  <div className="flow-glass-card max-h-[85px] w-full border-red-500/30 bg-red-950/10 rounded-full">
                    <div className="flex items-center gap-5 w-full">
                      <div className="size-14 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-2xl text-red-500/70">dangerous</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-white/90 text-[17px] font-bold">Agent Could Behave Maliciously</h4>
                        <p className="text-[11px] text-red-400/80 font-medium mt-1">Undetectable state transitions</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-20 text-center relative z-10 text-xl">
            <p className="font-medium tracking-wide max-w-2xl mx-auto px-6 text-slate-300 text-lg">
              AI agents operate as black boxes. AgentTrust introduces a decentralized verification layer bringing transparency,accountability and trust to the autonomous economy.
            </p>
          </div>
        </div>
      </section>

      {/* Verifying AI Behavior */}
      <section className="py-[120px] px-6 md:px-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-neural-grid opacity-[0.035] pointer-events-none" />
        <div className="max-w-[1200px] mx-auto relative z-10 text-left">
          <div className="mb-10">
            <h2 className="text-[72px] md:text-[80px] font-[800] text-white tracking-[-0.02em] leading-[1.05] mb-10">
              Verifying AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-trust-accent-blue via-[#00ffd5] to-trust-accent-purple drop-shadow-[0_0_20px_rgba(0,242,255,0.3)]">Agent Behavior</span>
            </h2>
            <p className="text-[20px] md:text-[22px] leading-[1.6] text-slate-100/95 max-w-[680px] mb-[64px]">
              Our decentralized infrastructure ensures AI agent executions are validated by a global network of validators through decentralized consensus in near real-time.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-[32px] relative">
            <div className="hidden md:block absolute top-[136px] left-[15%] right-[15%] h-[1.5px] step-connection-line z-0" />
            {[{ num: "01", icon: "play_circle", title: "Execution", desc: "Agent executes the task, generates an execution trace and proof, and submits it to the network for validator verification.", gradient: "bg-blue-gradient" },
            { num: "02", icon: "group", title: "Validators", desc: "Independent validators review agent execution traces to verify task behavior and ensure alignment with protocols.", gradient: "bg-purple-gradient" },
            { num: "03", icon: "handshake", title: "Consensus", desc: "Validators vote on execution validity, and the majority decision determines the outcome across the network nodes.", gradient: "bg-teal-gradient" },
            { num: "04", icon: "verified_user", title: "Trust Score", desc: "Agent reputation updated and trust scores broadcast to the global ecosystem for secure interaction.", gradient: "bg-blue-gradient" }].
              map((step) =>
                <div key={step.num} className="behavior-step-card group relative flex flex-col p-[40px] rounded-[20px] glass-card border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.45)] z-10" style={{ background: "linear-gradient(180deg, rgba(20,35,60,0.95), rgba(12,22,40,0.95))" }}>
                  <div className="absolute -top-[22px] -right-[22px] size-[44px] bg-background-dark border border-trust-accent-blue/40 rounded-full flex items-center justify-center text-trust-accent-blue font-bold text-[16px] z-20 shadow-[0_0_15px_rgba(43,140,238,0.4)]">{step.num}</div>
                  <div className={`size-[72px] rounded-[16px] ${step.gradient} text-white flex items-center justify-center mb-8 group-hover:scale-105 transition-all shadow-[0_0_20px_rgba(100,180,255,0.25)]`}>
                    <span className="material-symbols-outlined text-4xl">{step.icon}</span>
                  </div>
                  <h3 className="text-[22px] md:text-[24px] font-bold text-white mb-4">{step.title}</h3>
                  <p className="leading-[1.6] text-white/80 font-medium text-base">{step.desc}</p>
                </div>
              )}
          </div>
        </div>
      </section>

      {/* Featured Agent */}
      <section className="py-32 px-6 md:px-20 relative">
        <div className="absolute inset-0 bg-neural-grid opacity-[0.04] pointer-events-none" />
        <div className="max-w-[1200px] mx-auto space-y-[100px]">
          <div className="w-full">
            <h2 className="text-[36px] md:text-[40px] font-[900] text-white mb-10 flex items-center gap-4">
              <span className="material-symbols-outlined text-trust-accent-blue text-4xl">verified</span> Featured Agent
            </h2>
            <div
              className="p-[40px] rounded-[18px] backdrop-blur-[12px] relative overflow-hidden group transition-all duration-300 hover:-translate-y-[3px] cursor-default"
              style={{
                background: "linear-gradient(180deg, rgba(18,24,46,0.95), rgba(12,18,35,0.95))",
                border: "1px solid rgba(120,140,255,0.18)",
                boxShadow: "0 0 0 1px rgba(120,140,255,0.08), 0 22px 70px rgba(0,0,0,0.6), 0 0 28px rgba(90,110,255,0.25)",
              }}
            >
              <div className="absolute -top-40 -right-40 size-96 opacity-[0.07] blur-[120px] bg-trust-accent-blue pointer-events-none" />
              <div className="flex flex-col lg:flex-row gap-12 relative z-10">
                {/* Left Side */}
                <div className="flex-1 space-y-8">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-5">
                      <div
                        className="size-16 rounded-[14px] flex items-center justify-center flex-shrink-0"
                        style={{
                          background: "radial-gradient(circle at center, rgba(20,30,60,0.9), rgba(8,12,22,0.9))",
                          border: "1px solid rgba(120,140,255,0.25)",
                          boxShadow: "0 0 16px rgba(120,140,255,0.35), 0 0 28px rgba(90,110,255,0.25)",
                        }}
                      >
                        <span className="material-symbols-outlined text-3xl text-white">functions</span>
                      </div>
                      <div>
                        <h3 className="text-[24px] font-semibold text-white leading-tight">MathAgent <span className="text-slate-500 font-medium text-base ml-1">v4.2</span></h3>
                        <p className="text-[13px] font-mono" style={{ color: "rgba(150,170,210,0.75)" }}>AgentID: #001</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex text-yellow-500">
                            {[1, 2, 3, 4].map((i) => <span key={i} className="material-symbols-outlined text-[18px] fill-1">star</span>)}
                            <span className="material-symbols-outlined text-[18px]">star_half</span>
                          </div>
                          <span className="text-xs font-medium" style={{ color: "rgba(180,200,230,0.8)" }}>4.8 / 5.0</span>
                        </div>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", borderColor: "rgba(34,197,94,0.35)" }}>Low Risk</span>
                  </div>

                  {/* Unified Stats Row */}
                  <div className="flex gap-10 mt-4">
                    <div>
                      <span className="text-[14px] block mb-1" style={{ color: "rgba(180,200,230,0.8)" }}>Trust Score</span>
                      <span className="text-[20px] font-semibold text-white">98 / 100</span>
                    </div>
                    <div>
                      <span className="text-[14px] block mb-1" style={{ color: "rgba(180,200,230,0.8)" }}>Risk Level</span>
                      <span className="text-[20px] font-semibold text-white">Minimal</span>
                    </div>
                    <div>
                      <span className="text-[14px] block mb-1" style={{ color: "rgba(180,200,230,0.8)" }}>Rating</span>
                      <div className="flex items-center gap-1">
                        <div className="flex text-yellow-500">
                          {[1, 2, 3, 4].map((i) => <span key={i} className="material-symbols-outlined text-[16px] fill-1">star</span>)}
                          <span className="material-symbols-outlined text-[16px]">star_outline</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Capability Tags */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {["DeFi Trading", "Arbitrage", "Mathematical Reasoning"].map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-full text-xs font-medium"
                        style={{
                          background: "rgba(120,140,255,0.12)",
                          border: "1px solid rgba(120,140,255,0.25)",
                          color: "rgba(200,210,240,0.9)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="px-3 py-1 bg-trust-accent-blue/10 border border-trust-accent-blue/10 rounded-lg text-xs font-medium text-trust-accent-blue flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">verified</span>
                      Consensus Verified
                    </span>
                  </div>
                </div>

                {/* Right Side */}
                <div className="flex-1 flex flex-col justify-between space-y-8">
                  <div className="space-y-6">
                    <div>
                      <label className="text-slate-400 uppercase tracking-[1.5px] font-bold text-[12px] mb-2 block">Agent Description</label>
                      <p className="text-[14px] leading-[1.6]" style={{ color: "rgba(190,210,240,0.85)", maxWidth: 520 }}>Performs deterministic mathematical tasks with high precision and reliability across complex computational domains.</p>
                    </div>
                    <div>
                      <label className="text-slate-400 uppercase tracking-[1.5px] font-bold text-[12px] mb-2 block">Agent Capability</label>
                      <p className="text-[14px] leading-[1.6]" style={{ color: "rgba(190,210,240,0.85)", maxWidth: 520 }}>High-level mathematical reasoning, symbolic logic, and complex architectural computations.</p>
                    </div>
                  </div>
                  <a
                    href="#"
                    className="inline-flex items-center gap-2 self-start mt-5 transition-all duration-300 group/link"
                    style={{
                      background: "linear-gradient(180deg, rgba(60,80,160,0.25), rgba(40,60,140,0.18))",
                      backgroundImage: "linear-gradient(90deg, #4f8cff, #7a6cff)",
                      backgroundBlendMode: "overlay",
                      border: "1px solid rgba(120,140,255,0.28)",
                      borderRadius: 12,
                      padding: "12px 22px",
                      height: 42,
                      boxShadow: "0 0 10px rgba(120,140,255,0.28), 0 0 18px rgba(120,140,255,0.18)",
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: "0.2px",
                      color: "#e6ecff",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 6px 20px rgba(120,140,255,0.35), 0 0 24px rgba(120,140,255,0.35)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 0 10px rgba(120,140,255,0.28), 0 0 18px rgba(120,140,255,0.18)";
                    }}
                  >
                    View Audit Log <span className="material-symbols-outlined text-lg opacity-85 group-hover/link:opacity-100 group-hover/link:translate-x-0.5 transition-all">arrow_outward</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
          {/* System Architecture */}
          <div className="w-full relative z-10">
            <div className="mb-14">
              <h2 className="text-[42px] md:text-[48px] font-black text-white flex items-center gap-4">
                <span className="material-symbols-outlined text-trust-accent-purple text-5xl">account_tree</span> System Architecture
              </h2>
              <div className="h-1.5 w-32 bg-gradient-to-r from-trust-accent-blue to-trust-accent-purple rounded-full mt-4" />
            </div>
            <div className="relative">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[36px] md:gap-[40px] relative z-10">
                <div className="hidden md:block absolute inset-0 pointer-events-none">
                  <div className="connection-line left-1/2 -translate-x-1/2 opacity-40" />
                  <div className="connection-line-h top-1/2 -translate-y-1/2 opacity-40" />
                </div>
                <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none z-30">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute size-[140px] rounded-full coord-node-pulse animate-pulse-slow" />
                    <div className="absolute size-16 rounded-full bg-gradient-to-br from-trust-accent-blue via-trust-accent-purple to-[#00ffd5] flex items-center justify-center shadow-[0_0_40px_rgba(0,242,255,0.6)] animate-pulse-agent">
                      <span className="material-symbols-outlined text-white text-3xl font-bold">hub</span>
                    </div>
                  </div>
                </div>
                {[
                  { icon: "app_registration", title: "Agent Registry", desc: "Decentralized registry storing AI agent identities, ownership, capabilities, risk levels, and staking parameters.", gradient: "bg-blue-gradient" },
                  { icon: "security", title: "Validation Registry", desc: "Verification layer that records agent execution proofs and coordinates validator voting to determine the validity of agent behavior.", gradient: "bg-purple-gradient" },
                  { icon: "how_to_vote", title: "Staking Layer", desc: "Economic security mechanism where agents stake assets based on risk level, enabling slashing and validator rewards for detecting misbehavior.", gradient: "bg-teal-gradient" },
                  { icon: "star", title: "Reputation Registry", desc: "Reputation system that updates agent trust scores based on validator consensus, historical validation results, and user ratings.", gradient: "bg-cyan-gradient" }].
                  map((card) =>
                    <div key={card.title} className="architecture-card p-[36px] md:p-[40px] rounded-[24px] group">
                      <div className={`icon-container ${card.gradient} text-white mb-8 group-hover:scale-110 transition-transform`}>
                        <span className="material-symbols-outlined text-3xl">{card.icon}</span>
                      </div>
                      <h4 className="text-[22px] md:text-[24px] font-black text-white mb-4 tracking-tight">{card.title}</h4>
                      <p className="text-slate-200 opacity-[0.93] text-[16px] md:text-[17px] leading-relaxed">{card.desc}</p>
                    </div>
                  )}
              </div>
              <div className="mt-20 p-12 rounded-[24px] bg-gradient-to-br from-trust-accent-purple/15 via-trust-accent-purple/5 to-transparent border border-trust-accent-purple/30 max-w-4xl mx-auto shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-trust-accent-blue/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="flex gap-8 relative z-10">
                  <span className="material-symbols-outlined text-trust-accent-purple text-6xl opacity-40 shrink-0">format_quote</span>
                  <p className="text-slate-100 text-[20px] md:text-[22px] leading-[1.6] font-medium font-mono">
                    AgentTrust bridges the gap between AI capability and AI reliability through decentralized consensus and verifiable accountability.














                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>);
}

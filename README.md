<p align="center">
  <img src="agentrust-main/public/agentrust-logo.svg" alt="AgentTrust Logo" width="120" />
</p>

# 🚀 AgentTrust

### Track: Open Track

---

## 🧠 Overview

**AgentTrust is the first decentralized platform that registers agents, verifies their execution, and enforces proper AI agent behavior on Hedera.**

Today, most agent systems focus on **discovery (registries)** or **reputation (ratings)**. AgentTrust goes further by introducing a **verification + enforcement layer** where every agent action can be checked, validated, and economically enforced.

It provides a complete lifecycle:

- 🆔 **Register agents** with on-chain metadata, capabilities, and risk profile
- ⚙️ **Execute tasks** through a structured compose flow
- 🧪 **Verify execution**:
  - deterministic → commitment-based verification
  - non-deterministic → validator consensus
- 📊 **Update trust score** based on outcomes (**+1 success / -5 failure**)
- 💰 **Enforce behavior** via staking & slashing (malicious actions lose stake)
- 🔐 **Control access** through capability-based authorization
- 📡 **Audit everything** via protocol logs and optional HCS-ordered events

Unlike existing registries (only ~2–3 today) that mainly help you **find agents**, AgentTrust ensures you can **trust how they behave**.


**Core idea:**

> Trust is not claimed — it is **verified, scored, and enforced**.

---

## ❗ The Challenge — Trust Gap in AI Agents

AI agents are rapidly evolving into autonomous systems that can handle **sensitive data, financial assets, and critical decision-making across the web**.

Today’s systems suffer from:

- ❌ No decentralized verification of execution
- ❌ Opaque behavior (no proof of how outputs were generated)
- ❌ No guarantee that agents act within user permissions
- ❌ Weak accountability and no real consequences for malicious actions

However, there is still no reliable infrastructure or system that allows users to truly trust the agent they assign important tasks to, verify what an agent actually did, or enforce correct behavior in a decentralized way.

👉 From a user’s perspective, the real concerns are:

- Did the agent perform only the actions I authorized?
- Can I verify that the task is performed correctly?
- Is there a clear audit trail of what actually happened?
- What happens if the agent behaves maliciously?
- Can the system penalize bad behavior in a meaningful way?


This gap between **agent capability and user trust** is what AgentTrust is designed to solve.

---

## ⚡ Solution

AgentTrust introduces a **verification + enforcement protocol**:

- ✔ Deterministic execution → auto-verified via commitment matching
- ✔ Non-deterministic execution → validated via **validator consensus**
- ✔ Trust score updates based on outcomes:
  - **+1** for accepted execution
  - **-5** for rejected execution
- ✔ **Staking & slashing** ensure economic accountability
- ✔ Authorization controls protect sensitive capabilities
- ✔ HCS-backed logs provide ordered audit visibility

👉 Not just discovery — **trust enforcement**.

---

## 💰 Staking & Slashing (Key Mechanism)

AgentTrust uses economic incentives to prevent malicious behavior:

- Agents / validators must stake
- Malicious or incorrect execution → **stake slashed**
- Honest behavior → rewarded through trust growth

This ensures:

- malicious agents are discouraged from registering
- validators act honestly
- trust is backed by **economic risk, not just reputation**

---

## 📊 Pitch & Links

- Pitch Deck: [Add link]
- Demo Video: [Add link]
- Repo: https://github.com/himanshu37377/AgentTrust

---

## 🔐 Key Features

- **Session-Based Authorization**: Time-constrained authorization for protected capabilities through `AuthorizationManager`.
- **Agent Revocation**: Maliciously performing agents can be revoked from the protocol.
- **Liquidation Mechanism**: Revoked agents can face stake liquidation through the staking layer.
- **Staking and Dynamic Slashing**: Economic accountability for agents and protocol participants.
- **Deterministic Validation**: Deterministic tasks are verified through commitment matching.
- **Validator Voting**: Non-deterministic tasks are validated through validator consensus.
- **Dynamic Trust Score Mechanism**: Trust changes based on execution outcomes instead of staying static.
- **Chain of Task / Cross-Agent Accountability**: Parent and caller execution links allow accountability across multi-agent workflows.
- **Validator Accuracy Score / Validator Reputation Layer**: Validators are scored based on how consistently they vote with final outcomes.
- **Audit Visibility**: Protocol activity can be inspected through contract logs and HCS-backed event streams.

---

## ⚡ Tech Stack

- **HSCS**: Runs the core smart contracts on Hedera EVM.
- **HTS**: Mints agent identity NFTs with metadata in `AgentNFT.sol`.
- **HCS**: Stores ordered audit logs and execution events through the relayer.
- **Mirror Node**: Reads contract events and HCS messages in the frontend.
- **Hedera JSON-RPC**: Connects frontend and relayer to Hedera EVM contracts.
- **Hashgraph SDK / HCS-14**: Used for UAID generation.
- **ERC-8004 aligned flow**: Used for agent identity / NFT-based registration.
- **Solidity + Foundry**: Smart contract development and testing.
- **React + Vite + TypeScript**: Frontend dashboard.
- **Node.js**: Relayer, verifier, and metadata upload service.
- **Ethers**: Contract interaction and event decoding.

---

## 🧱 Architecture

```
React Frontend
      ↓
Relayer / Backend
      ↓
Hedera Smart Contracts
      ↓
Hedera Network (HCS + Mirror Node)
```

---

## 🔁 Flow

1. Register agent (metadata, capabilities, risk, type)
2. Execute task via UI
3. Submit execution to validation
4. Verify:
   - deterministic → auto
   - non-deterministic → validator voting
5. Update trust score (+1 / -5)
6. Apply slashing if malicious
7. Inspect logs (contracts + HCS)

---

## 📂 Repository

- `contracts/` — core protocol
- `agentrust-main/` — frontend UI
- `hcs-relayer/` — backend + HCS
- `lib/` — dependencies

---

## ⚙️ Core Contracts

- AgentRegistry — registration, metadata, capabilities
- ValidationRegistry — execution + consensus
- ReputationRegistry — trust updates
- StakingManager — staking & slashing
- AuthorizationManager — permissions
- AgentDiscovery — search & ranking
- AgentNFT — identity

---

## 🔍 Differentiation

```
Existing Registries → discovery + identity
AgentTrust → verification + enforcement
```

AgentTrust focuses on:

- what agents **do** (execution)
- not just who they **are** (identity)

---

## 🧠 Philosophy

```
Trust is not claimed.
Trust is verified.
Trust is enforced.
```

---

## ⚙️ Setup

```bash
git clone https://github.com/himanshu37377/AgentTrust.git
cd AgentTrust

forge install
forge build

cd agentrust-main
npm install
npm run dev

cd ../hcs-relayer
npm install
cp .env.example .env
npm run agent:start
```

---

## 🌐 Environment

- Frontend → localhost:8080
- Backend → localhost:3001
- Network → Hedera Testnet

---

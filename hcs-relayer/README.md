# AgentTrust Backend and HCS Relayer

This workspace contains the backend services used by AgentTrust.

It has two main roles:

- public agent API for execution, verification, and metadata upload
- optional HCS relayer for publishing protocol events to Hedera Consensus Service

## What is inside

### 1. Agent API

Start command:

```bash
npm run agent:start
```

This runs:

- `src/agent/server.js`

Exposed endpoints:

- `POST /agent/execute`
- `POST /api/verify`
- `POST /metadata/upload`
- `POST /upload-metadata`

What they do:

- `/agent/execute` runs the demo math agent
- `/api/verify` recomputes deterministic outputs using Gemini
- `/metadata/upload` pins generated metadata JSON to IPFS through Pinata

### 2. HCS relayer

Start command:

```bash
npm start
```

This runs:

- `src/index.js`

The relayer listens to contract events and publishes structured JSON messages to HCS for audit visibility.

## Environment

Create:

- `.env`

from:

- `.env.example`

Important variables:

- `PORT`
- `PINATA_JWT`
- `GEMINI_API_KEY`
- `GEMINI_VERIFIER_MODEL`
- `GEMINI_BASE_URL`
- `HEDERA_NETWORK`
- `HEDERA_OPERATOR_ID`
- `HEDERA_OPERATOR_KEY`
- `HEDERA_MIRROR_NODE_URL`
- `HEDERA_TOPIC_ID`

Notes:

- `PINATA_JWT` is required for metadata upload
- `GEMINI_API_KEY` is required for `/api/verify`
- keep these values backend-only

## Agent API local run

```bash
npm install
cp .env.example .env
npm run agent:start
```

Default local URL:

- `http://localhost:3001`

Example request:

```bash
curl -X POST "http://localhost:3001/agent/execute" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"What is 1+9?","agentId":2}'
```

Example verify request:

```bash
curl -X POST "http://localhost:3001/api/verify" \
  -H "Content-Type: application/json" \
  -d '{"input":"What is 1+9?","agentId":2}'
```

## HCS relayer setup

To run the relayer, also create:

- `src/config.json`

from:

- `src/config.example.json`

Then run:

```bash
npm start
```

The config includes:

- Hedera operator account
- Hedera topic ID
- Hedera JSON-RPC URL
- deployed `ValidationRegistry` address
- deployed `AgentRegistry` address

## Current testnet reference

The current demo configuration uses:

- Hedera account ID: `0.0.7162616`
- Topic ID: `0.0.8322593`
- RPC URL: `https://testnet.hashio.io/api`

Demo contract addresses are already reflected in `.env.example` and `src/config.example.json`.

## Deployment

For a stable public setup:

- frontend on Vercel
- backend on Render or Railway

If you use `ngrok`, the frontend can still call this backend, but only while your local machine and tunnel are running.

## Notes

- Solidity contracts remain the protocol source of truth
- HCS is used as an ordered audit stream
- the demo math agent is intentionally simple so the trust and verification flow is easy to inspect

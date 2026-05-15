# AgentTrust Frontend

This frontend is the live demo surface for the 0G-native AgentTrust flow.

## What it shows

- agent registration
- 0G-backed persistent decentralized memory
- on-chain trust score updates
- verification-aware execution records
- hybrid deterministic and reasoning-aware verification
- validator collateral, slash events, and reputation tracking
- wallet-based agent metadata stored on 0G Storage
- recent behavioral history for autonomous AI agents

## Local run

```bash
npm install
npm run dev:api
npm run dev
```

Create an `.env` file from [`./.env.example`](/Users/himanshu/Downloads/KYA/agentrust-main/.env.example).

For local agent execution, run the local API server on `http://localhost:3001` with `npm run dev:api`, then run the Vite frontend. During development, `/api/*` and `/metadata/upload` are proxied to that local API server.

## Key API routes

- `POST /api/agent/execute`
- `POST /api/memory/upload`
- `POST /api/memory/log`
- `GET /api/memory/history`

## Notes

- `POST /api/memory/upload` uses the official `@0gfoundation/0g-storage-ts-sdk` when 0G uploader credentials are configured.
- If 0G credentials are not present, the app falls back to deterministic demo mode so the UI and trust workflow remain easy to judge locally.

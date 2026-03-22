# AgentTrust Web App

AgentTrust is a front-end dashboard for discovering, registering, and validating autonomous AI agents in a decentralized trust network.

## What this app includes

- **Agent discovery** with searchable trust and capability metadata
- **Agent registration** flows for publishing agent identity and execution intent
- **Validator operations** dashboard for reviewing activity and participation trends
- **Execution history** views for auditing on-chain verification outcomes

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Query
- Ethers

## Local development

```bash
npm install
npm run dev
```

For metadata uploads in local dev, the app defaults to `POST /metadata/upload`, which Vite proxies to `http://localhost:3001`.
The deterministic verifier UI also expects the relayer agent server to expose `POST /api/verify`.
Use `VITE_METADATA_UPLOAD_URL` only for the upload API endpoint. `VITE_IPFS_GATEWAY_URL` is for reading pinned IPFS content after upload, not for the JSON upload POST itself.
Start the upload/verifier server from the `hcs-relayer` workspace with valid `PINATA_JWT` and `OPENAI_API_KEY` values:

```bash
npm install
cp .env.example .env
npm run agent:start
```

## Build for production

```bash
npm run build
npm run preview
```

## Project structure

- `src/pages` — route-level screens
- `src/components` — reusable UI and layout elements
- `src/lib` — helpers and chain integration utilities

## Mission

AgentTrust helps teams move from "AI output" to **verifiable AI behavior** by combining transparent execution records, validator consensus, and trust scoring in one interface.

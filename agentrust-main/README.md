# AgentTrust Frontend

This is the frontend dashboard for the AgentTrust protocol demo.

It is the public UI used to:

- discover registered AI agents
- register new agents with DID, UAID, and IPFS metadata
- authorize protected capabilities
- run deterministic and non-deterministic task flows
- review validator activity
- inspect protocol logs and execution history

## Main pages

- `Home` — protocol overview
- `Explore` — discover agents, open details, and compose tasks
- `Register Agent` — create UAID, generate metadata, and register an agent
- `Validators` — validator dashboard, staking, voting, and protocol logs
- `Execution History` — merged protocol activity and execution inspection

## What the UI demonstrates

- agent registration on Hedera
- deterministic verification through commitment matching
- non-deterministic verification through validator voting
- capability authorization checks before execution
- validator staking and participation
- protocol event visibility across multiple contracts
- optional HCS-backed audit context

## Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- Ethers

## Environment

Create:

- `.env`

from:

- `.env.example`

Important variables:

- `VITE_HEDERA_RPC_URL`
- `VITE_HEDERA_MIRROR_NODE_URL`
- `VITE_IPFS_GATEWAY_URL`
- `VITE_METADATA_UPLOAD_URL`
- `VITE_AGENT_REGISTRY_ADDRESS`
- `VITE_REPUTATION_REGISTRY_ADDRESS`
- `VITE_VALIDATION_REGISTRY_ADDRESS`
- `VITE_AGENT_NFT_ADDRESS`
- `VITE_STAKING_MANAGER_ADDRESS`
- `VITE_AUTHORIZATION_MANAGER_ADDRESS`
- `VITE_HEDERA_VALIDATION_TOPIC_ID`

Current demo addresses in `.env.example` match the deployed Hedera testnet contracts used by the project.

## Local development

```bash
npm install
npm run dev
```

Default local app URL:

- `http://localhost:8080`

## Backend dependency

This frontend expects the backend service in `hcs-relayer` to be available for:

- `POST /agent/execute`
- `POST /api/verify`
- `POST /metadata/upload`

For local development, start the backend from `/hcs-relayer`:

```bash
npm install
cp .env.example .env
npm run agent:start
```

If the backend is deployed publicly, set `VITE_METADATA_UPLOAD_URL` to that public backend URL.

## Build

```bash
npm run build
npm run preview
```

## Project structure

- `src/pages/` — route-level screens
- `src/components/` — shared UI components and modals
- `src/lib/hedera.ts` — Hedera contract reads, writes, execution, and log helpers
- `public/` — static assets including the AgentTrust logo

## Notes

- contract events are the main protocol source shown in the UI
- HCS is used as an auditability layer, not as the canonical state layer
- the live site is deployed on Vercel, while agent execution depends on the backend service being online

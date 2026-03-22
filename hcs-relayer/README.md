# HCS Relayer (ValidationRegistry)

This relayer listens to `ValidationRegistry` and `AgentRegistry` events and publishes canonical JSON messages to Hedera Consensus Service (HCS).

## Events relayed

- `ExecutionSubmitted` -> `EXEC_SUBMITTED`
- `VoteSubmitted` -> `VOTE_CAST`
- `ExecutionFinalized` -> `EXEC_FINALIZED`
- `ValidatorRegistered` -> `VALIDATOR_REGISTERED`
- `AgentRegistered` -> `AGENT_REGISTERED`
- `AgentRevoked` -> `AGENT_REVOKED`

## Setup

1. Copy `src/config.example.json` to `src/config.json` and fill values.
2. Install deps: `npm install`
3. Run: `npm start`

## Notes

- Solidity remains the source of truth.
- HCS is used as ordered audit/event stream.
- Dedupe is by `txHash:logIndex` for runtime safety.

## Protocol Logs formatter

Use `src/parseMirrorNodeMessage.js` and `src/formatProtocolLog.js` to convert Mirror Node topic messages into display-ready log entries for the Validators page.

Example flow:

1. Read HCS message JSON from `/api/v1/topics/{topicId}/messages`
2. Parse each raw message with `parseMirrorNodeMessage(rawMessage)`
3. Pass `parsed.payload` and `parsed.consensusTimestamp` into `formatProtocolLog(...)`
4. Render the returned `message`, `time`, and `severity`

## Deterministic Agent

This package also includes a minimal deterministic math agent for the AgentTrust demo.

### Run the agent API

1. Install deps: `npm install`
2. Copy `.env.example` to `.env` and set `PINATA_JWT` plus `GEMINI_API_KEY`
3. Start the API: `npm run agent:start`

The server exposes:

- `POST /agent/execute`
- `POST /api/verify`
- `POST /metadata/upload`
- `POST /upload-metadata` (compatibility alias)

Request:

```json
{
  "prompt": "sum of numbers from 1 to 10"
}
```

Response:

```json
{
  "input": "sum of numbers from 1 to 10",
  "result": 55,
  "normalizedOutput": "55",
  "executionCommitment": "0xced475eba944da6b046d6e2e63dc0be29fd3a553d06e6ebe75b83d939c1f4b48",
}
```

Verifier request:

```json
{
  "input": "sum of numbers from 1 to 10",
  "agentId": 1
}
```

Verifier response:

```json
{
  "output": "55",
  "expectedHash": "0xced475eba944da6b046d6e2e63dc0be29fd3a553d06e6ebe75b83d939c1f4b48",
  "model": "Verifier: Gemini 2.5 Flash (Deterministic Mode)"
}
```

Metadata upload request:

```json
{
  "metadata": {
    "name": "Example Agent"
  }
}
```

Metadata upload response:

```json
{
  "cid": "bafy...",
  "metadataURI": "ipfs://bafy..."
}
```

### Supported prompts

- Arithmetic expressions containing `+`, `-`, `*`, `/`, and parentheses
- Natural language wrappers such as `What's 1+3+4*5?`
- Inclusive ranges in the form `sum of numbers from X to Y`

### Determinism notes

- The JSON output always keeps `input` before `result`.
- `input` is hashed exactly as received.
- Arithmetic is evaluated with exact rational math instead of unsafe `eval`.
- Division by zero returns the fixed result `UNDEFINED`.
- Deterministic execution commitments use `keccak256(abi.encode(input, normalizedOutput, agentId))`.
- `normalizedOutput` trims whitespace, collapses repeated whitespace, and lowercases before hashing.
- `/api/verify` uses Gemini only.
- The verifier uses `temperature: 0` and a strict plain-string response rule.

### Tests

Run `npm run agent:test`.

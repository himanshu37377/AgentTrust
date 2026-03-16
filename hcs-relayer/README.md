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
2. Start the API: `npm run agent:start`

The server exposes `POST /agent/execute`.

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
  "outputHash": "0x171aba1128c2fa420bc4935c6542f705f6ce635928e0b5f21b4b474b73966003"
}
```

### Supported prompts

- Arithmetic expressions containing `+`, `-`, `*`, `/`, and parentheses
- Natural language wrappers such as `What's 1+3+4*5?`
- Inclusive ranges in the form `sum of numbers from X to Y`

### Determinism notes

- The JSON output always keeps `input` before `result`.
- `input` is the exact original prompt.
- Arithmetic is evaluated with exact rational math instead of unsafe `eval`.
- Division by zero returns the fixed result `UNDEFINED`.
- The output hash is `keccak256(JSON.stringify(output))`.

### Tests

Run `npm run agent:test`.

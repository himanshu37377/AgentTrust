function shortenAddress(address) {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTime(input) {
  if (!input) return "--:--:--";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "--:--:--";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function getSeverity(type) {
  switch (type) {
    case "EXECUTION_FINALIZED":
      return "success";
    case "EXECUTION_REACHED_CONSENSUS":
      return "info";
    case "VOTE_CAST":
      return "warning";
    case "AGENT_REVOKED":
      return "danger";
    default:
      return "neutral";
  }
}

function getMessage(payload) {
  switch (payload.type) {
    case "EXECUTION_SUBMITTED":
      return `ExecutionSubmitted -> Execution #${payload.executionId} for Agent #${payload.agentId}`;
    case "VOTE_CAST":
      return `VoteCast -> Validator ${shortenAddress(payload.validator)} ${String(payload.vote || "").toLowerCase()}d execution #${payload.executionId}`;
    case "EXECUTION_REACHED_CONSENSUS":
      return `ConsensusReached -> Execution #${payload.executionId} ${String(payload.result || "").toLowerCase()} with ${payload.approvals}/${payload.rejections}`;
    case "EXECUTION_FINALIZED":
      return `ExecutionFinalized -> Execution #${payload.executionId} ${String(payload.result || "").toLowerCase()}`;
    case "VALIDATOR_REGISTERED":
      return `ValidatorRegistered -> ${shortenAddress(payload.validator)} joined validation`;
    case "AGENT_REGISTERED":
      return `AgentRegistered -> Agent #${payload.agentId} created`;
    case "AGENT_REVOKED":
      return `AgentRevoked -> Agent #${payload.agentId} revoked`;
    default:
      return payload.type || "Unknown protocol event";
  }
}

export function formatProtocolLog(payload, consensusTimestamp) {
  return {
    type: payload.type,
    severity: getSeverity(payload.type),
    time: formatTime(consensusTimestamp),
    title: payload.type,
    message: getMessage(payload),
    executionId: payload.executionId || null,
    agentId: payload.agentId || null,
    raw: payload
  };
}

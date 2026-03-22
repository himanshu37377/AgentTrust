import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { Contract, JsonRpcProvider } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "config.json");
if (!fs.existsSync(configPath)) {
  console.error("Missing config.json. Copy config.example.json to config.json first.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const validationRegistryAbi = [
  "event ExecutionSubmitted(uint256 indexed executionId,uint256 indexed agentId,uint256 parentExecutionId,uint256 callerAgentId,bool involvesExternalCall,string externalService)",
  "event VoteSubmitted(uint256 indexed executionId,address indexed validator,bool approve)",
  "event ExecutionFinalized(uint256 indexed executionId,bool accepted,uint256 approvals,uint256 rejections)",
  "event ValidatorRegistered(address indexed validator,uint256 indexed validatorId,uint256 stakedAmount)",
  "function getExecution(uint256 executionId) view returns (tuple(uint256 executionId,uint256 agentId,uint256 parentExecutionId,uint256 callerAgentId,bool involvesExternalCall,string externalService,bytes32 reasoningHash,bytes32 executionCommitment,bytes32 executionHash,bool isDeterministic,uint256 approvals,uint256 rejections,bool finalized,bool accepted,uint256 createdAt))"
];
const agentRegistryAbi = [
  "event AgentRegistered(uint256 indexed agentId,address indexed owner,uint8 riskLevel,bool isDeterministic,string metadataURI)",
  "event AgentRevoked(uint256 indexed agentId)"
];

const provider = new JsonRpcProvider(config.evm.rpcUrl);
const validationRegistry = new Contract(
  config.evm.validationRegistryAddress,
  validationRegistryAbi,
  provider
);
const agentRegistry = new Contract(config.evm.agentRegistryAddress, agentRegistryAbi, provider);

const hederaClient =
  config.hedera.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
hederaClient.setOperator(config.hedera.operatorId, config.hedera.operatorKey);

const seen = new Set();

function basePayload(evt, type, contractAddress) {
  return {
    schemaVersion: "v1",
    type,
    chainId: config.evm.chainId,
    contract: contractAddress,
    txHash: evt.log.transactionHash,
    logIndex: evt.log.index,
    blockNumber: evt.log.blockNumber
  };
}

async function publishToHCS(payload) {
  const dedupeKey = `${payload.txHash}:${payload.logIndex}`;
  if (seen.has(dedupeKey)) return;

  await new TopicMessageSubmitTransaction()
    .setTopicId(config.hedera.topicId)
    .setMessage(JSON.stringify(payload))
    .execute(hederaClient);

  seen.add(dedupeKey);
  console.log(`[HCS] ${payload.type} -> ${dedupeKey}`);
}

validationRegistry.on(
  "ExecutionSubmitted",
  async (
    executionId,
    agentId,
    parentExecutionId,
    callerAgentId,
    involvesExternalCall,
    externalService,
    evt
  ) => {
  const execution = await validationRegistry.getExecution(executionId);
  const payload = {
    ...basePayload(evt, "EXECUTION_SUBMITTED", config.evm.validationRegistryAddress),
    executionId: executionId.toString(),
    agentId: agentId.toString(),
    parentExecutionId: parentExecutionId.toString(),
    callerAgentId: callerAgentId.toString(),
    involvesExternalCall,
    externalService,
    reasoningHash: execution.reasoningHash,
    executionCommitment: execution.executionCommitment,
    executionHash: execution.executionHash,
    isDeterministic: execution.isDeterministic
  };
  await publishToHCS(payload);
});

validationRegistry.on("VoteSubmitted", async (executionId, validator, approve, evt) => {
  const execution = await validationRegistry.getExecution(executionId);
  const payload = {
    ...basePayload(evt, "VOTE_CAST", config.evm.validationRegistryAddress),
    executionId: executionId.toString(),
    agentId: execution.agentId.toString(),
    validator,
    action: "VOTE_CAST",
    vote: approve ? "APPROVE" : "REJECT",
    approvals: execution.approvals.toString(),
    rejections: execution.rejections.toString(),
    finalized: execution.finalized
  };
  await publishToHCS(payload);
});

validationRegistry.on("ExecutionFinalized", async (executionId, accepted, approvals, rejections, evt) => {
  const execution = await validationRegistry.getExecution(executionId);
  const consensusPayload = {
    ...basePayload(evt, "EXECUTION_REACHED_CONSENSUS", config.evm.validationRegistryAddress),
    executionId: executionId.toString(),
    agentId: execution.agentId.toString(),
    action: "EXECUTION_REACHED_CONSENSUS",
    result: accepted ? "APPROVED" : "REJECTED",
    approvals: approvals.toString(),
    rejections: rejections.toString(),
    finalized: execution.finalized
  };
  await publishToHCS(consensusPayload);

  const finalizedPayload = {
    ...basePayload(evt, "EXECUTION_FINALIZED", config.evm.validationRegistryAddress),
    executionId: executionId.toString(),
    agentId: execution.agentId.toString(),
    action: "EXECUTION_FINALIZED",
    result: accepted ? "APPROVED" : "REJECTED",
    approvals: approvals.toString(),
    rejections: rejections.toString(),
    finalized: execution.finalized
  };
  await publishToHCS(finalizedPayload);
});

validationRegistry.on("ValidatorRegistered", async (validator, validatorId, stakedAmount, evt) => {
  const payload = {
    ...basePayload(evt, "VALIDATOR_REGISTERED", config.evm.validationRegistryAddress),
    validator,
    validatorId: validatorId.toString(),
    stakedAmount: stakedAmount.toString()
  };
  await publishToHCS(payload);
});

agentRegistry.on(
  "AgentRegistered",
  async (agentId, owner, riskLevel, isDeterministic, metadataURI, evt) => {
    const payload = {
      ...basePayload(evt, "AGENT_REGISTERED", config.evm.agentRegistryAddress),
      agentId: agentId.toString(),
      owner,
      riskLevel: Number(riskLevel),
      isDeterministic,
      metadataURI
    };
    await publishToHCS(payload);
  }
);

agentRegistry.on("AgentRevoked", async (agentId, evt) => {
  const payload = {
    ...basePayload(evt, "AGENT_REVOKED", config.evm.agentRegistryAddress),
    agentId: agentId.toString()
  };
  await publishToHCS(payload);
});

console.log("HCS relayer started: listening ValidationRegistry + AgentRegistry events");

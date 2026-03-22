import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicDeleteTransaction,
  TopicInfoQuery,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
} from "@hashgraph/sdk";

const DEFAULT_NETWORK = process.env.HEDERA_NETWORK || "testnet";
const DEFAULT_MIRROR_NODE_URL =
  process.env.HEDERA_MIRROR_NODE_URL ||
  (DEFAULT_NETWORK === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com");

function printUsage() {
  console.log(`
Usage:
  node --env-file-if-exists=.env src/topic-admin.js create [--memo "text"] [--public]
  node --env-file-if-exists=.env src/topic-admin.js update --topic-id 0.0.x [--memo "text"] [--public]
  node --env-file-if-exists=.env src/topic-admin.js info --topic-id 0.0.x
  node --env-file-if-exists=.env src/topic-admin.js submit --topic-id 0.0.x --message "hello world"
  node --env-file-if-exists=.env src/topic-admin.js delete --topic-id 0.0.x
  node --env-file-if-exists=.env src/topic-admin.js messages --topic-id 0.0.x [--limit 10]

Environment:
  HEDERA_NETWORK=testnet|mainnet
  HEDERA_OPERATOR_ID=0.0.x
  HEDERA_OPERATOR_KEY=302e...
  HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
  HEDERA_TOPIC_ADMIN_KEY=optional private key for topic admin
  HEDERA_TOPIC_SUBMIT_KEY=optional private key for topic submit
  HEDERA_TOPIC_ID=optional default topic id for info/submit/delete/messages/update

Notes:
  - If you pass --public during create, the topic will be created without a submit key.
  - If HEDERA_TOPIC_ADMIN_KEY or HEDERA_TOPIC_SUBMIT_KEY are omitted on create, the operator key is used.
  - The created topic ID should also be set as VITE_HEDERA_VALIDATION_TOPIC_ID in agentrust-main/.env.
`.trim());
}

function parseArgs(argv) {
  const [, , command, ...rest] = argv;
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) {
      continue;
    }

    const key = item.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { command, flags };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getClient() {
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");
  const operatorKey = parsePrivateKey(requireEnv("HEDERA_OPERATOR_KEY"));
  const client = DEFAULT_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, operatorKey);
  return client;
}

function parsePrivateKey(value, fallback) {
  const raw = value?.trim() || fallback?.trim();
  if (!raw) {
    return null;
  }

  return PrivateKey.fromStringECDSA(raw);
}

function getTopicId(flags) {
  return String(flags["topic-id"] || process.env.HEDERA_TOPIC_ID || "").trim();
}

async function createTopic(client, flags) {
  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY");
  const memo = typeof flags.memo === "string" ? flags.memo : "AgentTrust validation audit topic";
  const isPublic = Boolean(flags.public);

  const adminKey = parsePrivateKey(process.env.HEDERA_TOPIC_ADMIN_KEY, operatorKey);
  const submitKey = isPublic ? null : parsePrivateKey(process.env.HEDERA_TOPIC_SUBMIT_KEY, operatorKey);

  let tx = new TopicCreateTransaction().setTopicMemo(memo);
  if (adminKey) {
    tx = tx.setAdminKey(adminKey.publicKey);
  }
  if (submitKey) {
    tx = tx.setSubmitKey(submitKey.publicKey);
  }

  let frozen = await tx.freezeWith(client);
  if (adminKey && adminKey.toStringRaw() !== operatorKey) {
    frozen = await frozen.sign(adminKey);
  }

  const response = await frozen.execute(client);
  const receipt = await response.getReceipt(client);
  const topicId = receipt.topicId?.toString();

  if (!topicId) {
    throw new Error("Topic created but no topic ID was returned");
  }

  console.log(`Created topic: ${topicId}`);
  console.log(`Network: ${DEFAULT_NETWORK}`);
  console.log(`Mirror node: ${DEFAULT_MIRROR_NODE_URL}`);
  console.log("");
  console.log("Set these values next:");
  console.log(`agentrust-main/.env -> VITE_HEDERA_VALIDATION_TOPIC_ID=${topicId}`);
  console.log(`hcs-relayer/src/config.json -> "topicId": "${topicId}"`);
}

async function updateTopic(client, flags) {
  const topicId = getTopicId(flags);
  if (!topicId) {
    throw new Error("Missing --topic-id or HEDERA_TOPIC_ID");
  }

  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY");
  const memo = typeof flags.memo === "string" ? flags.memo : undefined;
  const isPublic = Boolean(flags.public);
  const adminKey = parsePrivateKey(process.env.HEDERA_TOPIC_ADMIN_KEY, operatorKey);
  const submitKey = isPublic ? null : parsePrivateKey(process.env.HEDERA_TOPIC_SUBMIT_KEY);

  if (!memo && submitKey === null && !isPublic) {
    throw new Error("Nothing to update. Pass --memo, --public, or HEDERA_TOPIC_SUBMIT_KEY.");
  }

  let tx = new TopicUpdateTransaction().setTopicId(topicId);
  if (memo) {
    tx = tx.setTopicMemo(memo);
  }
  if (isPublic) {
    tx = tx.clearSubmitKey();
  } else if (submitKey) {
    tx = tx.setSubmitKey(submitKey.publicKey);
  }

  let frozen = await tx.freezeWith(client);
  if (adminKey && adminKey.toStringRaw() !== operatorKey) {
    frozen = await frozen.sign(adminKey);
  }

  const response = await frozen.execute(client);
  await response.getReceipt(client);
  console.log(`Updated topic: ${topicId}`);
}

async function getTopicInfo(client, flags) {
  const topicId = getTopicId(flags);
  if (!topicId) {
    throw new Error("Missing --topic-id or HEDERA_TOPIC_ID");
  }

  const info = await new TopicInfoQuery().setTopicId(topicId).execute(client);
  console.log(JSON.stringify({
    topicId,
    memo: info.topicMemo,
    runningHash: info.runningHash ? Buffer.from(info.runningHash).toString("hex") : null,
    sequenceNumber: info.sequenceNumber?.toString?.() ?? null,
    expirationTime: info.expirationTime?.toString?.() ?? null,
    autoRenewPeriod: info.autoRenewPeriod?.seconds?.toString?.() ?? null,
    adminKey: info.adminKey?.toString?.() ?? null,
    submitKey: info.submitKey?.toString?.() ?? null,
  }, null, 2));
}

async function submitMessage(client, flags) {
  const topicId = getTopicId(flags);
  const message = typeof flags.message === "string" ? flags.message : "";
  if (!topicId) {
    throw new Error("Missing --topic-id or HEDERA_TOPIC_ID");
  }
  if (!message) {
    throw new Error("Missing --message");
  }

  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY");
  const submitKey = parsePrivateKey(process.env.HEDERA_TOPIC_SUBMIT_KEY);

  let tx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message);

  let frozen = await tx.freezeWith(client);
  if (submitKey && submitKey.toStringRaw() !== operatorKey) {
    frozen = await frozen.sign(submitKey);
  }

  const response = await frozen.execute(client);
  const receipt = await response.getReceipt(client);
  console.log(`Submitted message to topic ${topicId}`);
  console.log(`Status: ${receipt.status.toString()}`);
  console.log(`Transaction ID: ${response.transactionId.toString()}`);
}

async function deleteTopic(client, flags) {
  const topicId = getTopicId(flags);
  if (!topicId) {
    throw new Error("Missing --topic-id or HEDERA_TOPIC_ID");
  }

  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY");
  const adminKey = parsePrivateKey(process.env.HEDERA_TOPIC_ADMIN_KEY, operatorKey);

  let tx = new TopicDeleteTransaction().setTopicId(topicId);
  let frozen = await tx.freezeWith(client);
  if (adminKey && adminKey.toStringRaw() !== operatorKey) {
    frozen = await frozen.sign(adminKey);
  }

  const response = await frozen.execute(client);
  await response.getReceipt(client);
  console.log(`Deleted topic: ${topicId}`);
}

async function getMessages(flags) {
  const topicId = getTopicId(flags);
  const limit = Number(flags.limit || 10);
  if (!topicId) {
    throw new Error("Missing --topic-id or HEDERA_TOPIC_ID");
  }

  const response = await fetch(
    `${DEFAULT_MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages?order=desc&limit=${Number.isFinite(limit) ? limit : 10}`,
  );

  if (!response.ok) {
    throw new Error(`Mirror Node request failed with ${response.status}`);
  }

  const payload = await response.json();
  const messages = (payload.messages || []).map((message) => ({
    consensusTimestamp: message.consensus_timestamp || null,
    sequenceNumber: message.sequence_number || null,
    payerAccountId: message.payer_account_id || null,
    messageUtf8: message.message ? Buffer.from(message.message, "base64").toString("utf8") : "",
  }));

  console.log(JSON.stringify(messages, null, 2));
}

async function main() {
  const { command, flags } = parseArgs(process.argv);

  if (!command || flags.help) {
    printUsage();
    return;
  }

  const client = getClient();

  try {
    switch (command) {
      case "create":
        await createTopic(client, flags);
        break;
      case "update":
        await updateTopic(client, flags);
        break;
      case "info":
        await getTopicInfo(client, flags);
        break;
      case "submit":
        await submitMessage(client, flags);
        break;
      case "delete":
        await deleteTopic(client, flags);
        break;
      case "messages":
        await getMessages(flags);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

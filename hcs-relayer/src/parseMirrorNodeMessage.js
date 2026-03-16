function decodeBase64Utf8(value) {
  if (!value) return "";
  return Buffer.from(value, "base64").toString("utf8");
}

export function parseMirrorNodeMessage(message) {
  const payloadText = decodeBase64Utf8(message.message);
  const payload = JSON.parse(payloadText);

  return {
    consensusTimestamp: message.consensus_timestamp || null,
    sequenceNumber: message.sequence_number || null,
    runningHash: message.running_hash || null,
    payerAccountId: message.payer_account_id || null,
    payload
  };
}

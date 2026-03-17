const toHex = (input) =>
  Array.from(new TextEncoder().encode(input))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export class HCS14Client {
  async createUaid(payload, options = {}) {
    const registry = payload?.registry || "hol";
    const proto = payload?.protocol || "rest";
    const uid = options?.uid || payload?.name?.toLowerCase?.().replace(/\s+/g, "-") || "agent";
    const fingerprint = toHex(
      JSON.stringify({
        name: payload?.name || "",
        version: payload?.version || "",
        protocol: proto,
        nativeId: payload?.nativeId || "",
        skills: payload?.skills || [],
        uid,
      }),
    ).slice(0, 24);

    return `uaid:aid:${uid}-${fingerprint};registry=${registry};proto=${proto}`;
  }
}

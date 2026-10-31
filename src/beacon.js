import { bls12_381 } from "@noble/curves/bls12-381.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export const RANDOMNESS_POLICY = Object.freeze({
  type: "drand-quicknet-v1",
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  scheme: "bls-unchained-g1-rfc9380",
  genesis: 1692803367,
  period: 3,
  delayMs: 120000,
  selection: "first-consensus-future-round-v1",
  afterFreeze: "settle-or-wait-no-admin-pause",
});
export const digest = (value) => bytesToHex(sha256(utf8ToBytes(value)));
export const RANDOMNESS_POLICY_V3 = Object.freeze({
  ...RANDOMNESS_POLICY,
  selection: "rekor-first-freeze-future-round-v1",
});
export function assertRandomnessPolicy(manifest) {
  if (
    ![2, 3].includes(manifest?.version) ||
    manifest.mode !== "LIVE" ||
    manifest.sourceProfile !== "PUBLIC-NOKEY-v1" ||
    JSON.stringify(manifest.randomness) !==
      JSON.stringify(
        manifest.version === 3 ? RANDOMNESS_POLICY_V3 : RANDOMNESS_POLICY,
      )
  )
    throw Error("RANDOMNESS_POLICY_MISMATCH");
}
export function futureBeaconRound(sealedAt) {
  if (
    !Number.isSafeInteger(sealedAt) ||
    sealedAt < RANDOMNESS_POLICY.genesis * 1000
  )
    throw Error("INVALID_SEAL_TIME");
  return (
    Math.ceil(
      (sealedAt +
        RANDOMNESS_POLICY.delayMs -
        RANDOMNESS_POLICY.genesis * 1000) /
        (RANDOMNESS_POLICY.period * 1000),
    ) + 1
  );
}
export function beaconTime(round) {
  if (!Number.isSafeInteger(round) || round < 1)
    throw Error("INVALID_BEACON_ROUND");
  const time =
    (RANDOMNESS_POLICY.genesis + (round - 1) * RANDOMNESS_POLICY.period) * 1000;
  if (!Number.isSafeInteger(time)) throw Error("INVALID_BEACON_ROUND");
  return time;
}
export function verifyBeacon(beacon, expectedRound) {
  try {
    if (
      !Number.isSafeInteger(expectedRound) ||
      expectedRound < 1 ||
      beacon?.round !== expectedRound ||
      typeof beacon.signature !== "string" ||
      !/^[a-f0-9]{96}$/.test(beacon.signature) ||
      typeof beacon.randomness !== "string" ||
      !/^[a-f0-9]{64}$/.test(beacon.randomness) ||
      bytesToHex(sha256(hexToBytes(beacon.signature))) !== beacon.randomness
    )
      return false;
    const message = new Uint8Array(8);
    new DataView(message.buffer).setBigUint64(0, BigInt(expectedRound), false);
    const bls = bls12_381.shortSignatures;
    return bls.verify(
      hexToBytes(beacon.signature),
      bls.hash(sha256(message)),
      hexToBytes(RANDOMNESS_POLICY.publicKey),
    );
  } catch {
    return false;
  }
}
export function snapshotPayload(round, prices, sources) {
  return JSON.stringify({
    version: 1,
    round: round.id,
    commitment: round.commitment,
    prices: [...prices]
      .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
      .map(({ symbol, date, currency, scale, close }) => ({
        symbol,
        date,
        currency,
        scale,
        close,
      })),
    sources: [...sources].sort((a, b) =>
      a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0,
    ),
  });
}
export function validateSnapshot(
  snapshot,
  manifest,
  { allowUnwitnessed = false } = {},
) {
  assertRandomnessPolicy(manifest);
  if (
    !snapshot ||
    typeof snapshot.payload !== "string" ||
    snapshot.payload.length > 200000 ||
    digest(snapshot.payload) !== snapshot.digest ||
    !Number.isSafeInteger(snapshot.sealedAt) ||
    snapshot.sealedAt < manifest.ready ||
    snapshot.sealedAt <= manifest.cutoff ||
    (manifest.version === 2
      ? snapshot.beaconRound !== futureBeaconRound(snapshot.sealedAt)
      : !(
          allowUnwitnessed &&
          snapshot.witnessedAt === null &&
          snapshot.beaconRound === null
        ) &&
        (!Number.isSafeInteger(snapshot.witnessedAt) ||
          snapshot.witnessedAt < snapshot.sealedAt ||
          snapshot.beaconRound !== futureBeaconRound(snapshot.witnessedAt)))
  )
    throw Error("INVALID_ENTROPY_SNAPSHOT");
  const payload = JSON.parse(snapshot.payload);
  if (
    payload.version !== 1 ||
    payload.round !== manifest.id ||
    payload.commitment !== digest(JSON.stringify(manifest)) ||
    !Array.isArray(payload.prices) ||
    !Array.isArray(payload.sources) ||
    payload.prices.length !== manifest.markets.length ||
    payload.sources.length !== manifest.markets.length ||
    new Set(payload.prices.map((p) => p.symbol)).size !==
      payload.prices.length ||
    new Set(payload.sources.map((p) => p.symbol)).size !==
      payload.sources.length ||
    snapshotPayload(
      { id: manifest.id, commitment: payload.commitment },
      payload.prices,
      payload.sources,
    ) !== snapshot.payload
  )
    throw Error("INVALID_ENTROPY_SNAPSHOT");
  for (const p of payload.prices) {
    const market = manifest.markets.find((m) => m.symbol === p.symbol),
      source = payload.sources.find((s) => s.symbol === p.symbol);
    if (
      !market ||
      p.date !== market.date ||
      p.currency !== market.currency ||
      p.scale !== market.scale ||
      !Number.isSafeInteger(p.close) ||
      p.close <= 0 ||
      !Array.isArray(source?.sources) ||
      source.sources.length !== 2 ||
      !Array.isArray(source.failures) ||
      source.failures.length ||
      source.sources
        .map((s) => s.provider)
        .sort()
        .join(",") !== "Nasdaq,YahooFinance" ||
      source.sources.some(
        (s) => s.close !== p.close || !/^[a-f0-9]{64}$/.test(s.sha256),
      )
    )
      throw Error("INVALID_SNAPSHOT_CONSENSUS");
  }
  return payload;
}
export function canonicalV2(id, commitment, prices, snapshot, beacon) {
  return JSON.stringify({
    version: 2,
    round: id,
    commitment,
    prices: [...prices]
      .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
      .map(({ symbol, date, currency, scale, close }) => ({
        symbol,
        date,
        currency,
        scale,
        close,
      })),
    snapshot: {
      digest: snapshot.digest,
      sealedAt: snapshot.sealedAt,
      beaconRound: snapshot.beaconRound,
    },
    beacon: {
      chainHash: RANDOMNESS_POLICY.chainHash,
      round: beacon.round,
      signature: beacon.signature,
      randomness: beacon.randomness,
    },
  });
}
export const seedV2 = (input) => digest("market-luck/draw/v2\n" + input);

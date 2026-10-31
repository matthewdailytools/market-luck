import { md5 } from "@noble/hashes/legacy.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  digest,
  RANDOMNESS_POLICY_V3,
  futureBeaconRound,
  validateSnapshot,
  beaconTime,
} from "./beacon.js";
import {
  WITNESS_POLICY,
  jcs,
  base64,
  unbase64,
  verifyWitness,
} from "./witness.js";
export { verifyWitness, WITNESS_POLICY } from "./witness.js";

export const SECRET_POLICY = Object.freeze({
  type: "hidden-order-nonce-v1",
  nonceBytes: 32,
  reveal: "after-verified-future-beacon",
  hashes: ["md5", "sha256"],
});
export const md5Digest = (s) => bytesToHex(md5(utf8ToBytes(s)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function randomBelow(n, random = crypto.getRandomValues.bind(crypto)) {
  if (!Number.isSafeInteger(n) || n < 1 || n > 1000)
    throw Error("INVALID_RANDOM_RANGE");
  const limit = Math.floor(4294967296 / n) * n;
  let x;
  do {
    x = random(new Uint32Array(1))[0];
  } while (x >= limit);
  return x % n;
}
export function makeSecret(manifest) {
  const order = manifest.markets.map((m) => m.symbol).sort();
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return JSON.stringify({
    version: 1,
    round: manifest.id,
    order,
    nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
  });
}
export function prepareCommitment(base) {
  const secret = makeSecret(base);
  return {
    manifest: {
      ...base,
      version: 3,
      randomness: { ...RANDOMNESS_POLICY_V3 },
      hidden: {
        ...SECRET_POLICY,
        md5: md5Digest(secret),
        sha256: digest(secret),
      },
      witness: { ...WITNESS_POLICY },
    },
    secret,
  };
}
export function assertV3Policy(manifest) {
  if (
    manifest.version !== 3 ||
    manifest.mode !== "LIVE" ||
    manifest.sourceProfile !== "PUBLIC-NOKEY-v1" ||
    !same(manifest.randomness, RANDOMNESS_POLICY_V3) ||
    !same(manifest.witness, WITNESS_POLICY) ||
    !same(
      {
        ...SECRET_POLICY,
        md5: manifest.hidden?.md5,
        sha256: manifest.hidden?.sha256,
      },
      manifest.hidden,
    ) ||
    !/^[a-f0-9]{32}$/.test(manifest.hidden?.md5) ||
    !/^[a-f0-9]{64}$/.test(manifest.hidden?.sha256)
  )
    throw Error("INVALID_V3_POLICY");
}
export function validateReveal(secret, manifest) {
  assertV3Policy(manifest);
  if (
    typeof secret !== "string" ||
    secret.length > 3000 ||
    md5Digest(secret) !== manifest.hidden.md5 ||
    digest(secret) !== manifest.hidden.sha256
  )
    throw Error("SECRET_COMMITMENT_MISMATCH");
  const p = JSON.parse(secret);
  if (
    p.version !== 1 ||
    p.round !== manifest.id ||
    !Array.isArray(p.order) ||
    p.order.length !== manifest.markets.length ||
    new Set(p.order).size !== p.order.length ||
    p.order.some((s) => !manifest.markets.some((m) => m.symbol === s)) ||
    !/^[a-f0-9]{64}$/.test(p.nonce) ||
    JSON.stringify({
      version: 1,
      round: p.round,
      order: p.order,
      nonce: p.nonce,
    }) !== secret
  )
    throw Error("INVALID_REVEAL");
  return p;
}
async function encryptionKey(secret) {
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/.test(secret))
    throw Error("COMMIT_ENCRYPTION_KEY_UNAVAILABLE");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secret.match(/../g), (v) => parseInt(v, 16)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptSecret(secret, manifest, key) {
  validateReveal(secret, manifest);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: utf8ToBytes(
          "market-luck/secret/v3\n" +
            manifest.id +
            "\n" +
            digest(JSON.stringify(manifest)),
        ),
      },
      await encryptionKey(key),
      utf8ToBytes(secret),
    ),
  );
  return JSON.stringify({
    version: 1,
    iv: base64(iv),
    ciphertext: base64(ciphertext),
  });
}
export async function decryptSecret(envelope, manifest, key) {
  if (typeof envelope !== "string" || envelope.length > 8000)
    throw Error("INVALID_SECRET_ENVELOPE");
  const p = JSON.parse(envelope);
  if (p.version !== 1 || unbase64(p.iv).length !== 12)
    throw Error("INVALID_SECRET_ENVELOPE");
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: unbase64(p.iv),
      additionalData: utf8ToBytes(
        "market-luck/secret/v3\n" +
          manifest.id +
          "\n" +
          digest(JSON.stringify(manifest)),
      ),
    },
    await encryptionKey(key),
    unbase64(p.ciphertext),
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(plain);
  validateReveal(text, manifest);
  return text;
}
export function witnessRecord(round, stage, snapshot) {
  const m = JSON.parse(round.manifest);
  assertV3Policy(m);
  if (stage === "presale")
    return jcs({
      domain: "market-luck/presale/v3",
      round: round.id,
      manifestSha256: round.commitment,
      secretMd5: m.hidden.md5,
      secretSha256: m.hidden.sha256,
    });
  if (stage !== "freeze" || !snapshot) throw Error("INVALID_WITNESS_STAGE");
  return jcs({
    domain: "market-luck/freeze/v3",
    round: round.id,
    manifestSha256: round.commitment,
    snapshotSha256: snapshot.digest,
    sealedAt: snapshot.sealedAt,
  });
}
export async function validateV3Witnesses(
  round,
  snapshot,
  witnesses,
  verifier = verifyWitness,
) {
  const m = JSON.parse(round.manifest);
  assertV3Policy(m);
  const a = await verifier(witnesses?.presale, witnessRecord(round, "presale"));
  const b = await verifier(
    witnesses?.freeze,
    witnessRecord(round, "freeze", snapshot),
  );
  if (
    !a ||
    !b ||
    a.time < Math.floor(m.preparedAt / 1000) * 1000 ||
    a.time >= m.cutoff ||
    b.time + 1000 < snapshot.sealedAt ||
    b.time < m.ready ||
    b.time < a.time ||
    snapshot.witnessedAt !== b.time + 1000 ||
    snapshot.beaconRound !== futureBeaconRound(b.time + 1000)
  )
    throw Error("V3_WITNESS_MISMATCH");
  validateSnapshot(snapshot, m);
  return { presale: a, freeze: b };
}
export function canonicalV3(
  round,
  prices,
  { snapshot, beacon, reveal, witnesses },
) {
  const m = JSON.parse(round.manifest),
    p = validateReveal(reveal, m);
  const ordered = p.order.map((symbol) => {
    const x = prices.find((p) => p.symbol === symbol);
    if (!x) throw Error("MISSING_ORDERED_PRICE");
    const { date, currency, scale, close } = x;
    return { symbol, date, currency, scale, close };
  });
  if (
    prices.length !== ordered.length ||
    new Set(prices.map((p) => p.symbol)).size !== ordered.length
  )
    throw Error("INVALID_ORDERED_PRICE");
  return JSON.stringify({
    version: 3,
    round: round.id,
    commitment: round.commitment,
    prices: ordered,
    reveal,
    snapshot: {
      digest: snapshot.digest,
      sealedAt: snapshot.sealedAt,
      witnessedAt: snapshot.witnessedAt,
      beaconRound: snapshot.beaconRound,
    },
    witnesses: {
      presale: digest(JSON.stringify(witnesses.presale)),
      freeze: digest(JSON.stringify(witnesses.freeze)),
    },
    beacon: {
      chainHash: RANDOMNESS_POLICY_V3.chainHash,
      round: beacon.round,
      signature: beacon.signature,
      randomness: beacon.randomness,
    },
  });
}
export const seedV3 = (input) => digest("market-luck/draw/v3\n" + input);

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { p256 } from "@noble/curves/nist.js";

// Pinned independently operated production Rekor v1 key. No runtime TOFU/key URL.
export const WITNESS_POLICY = Object.freeze({
  type: "rekor-v1-set-inclusion",
  origin: "https://rekor.sigstore.dev",
  publicKey:
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE2G2Y+2tabdTV5BcGiBIx0a9fAFwrkBbmLSGtks4L3qX6yYY0zufBnhC8Ur/iy55GhWP/9A/bY2LhC30M9+RYtw==",
  stages: ["presale", "freeze"],
  delayMs: 120000,
});
const hex = (x) => bytesToHex(sha256(x));
export const witnessHash = (x) => hex(utf8ToBytes(x));
export const base64 = (x) => btoa(String.fromCharCode(...x));
export function unbase64(x) {
  if (
    typeof x !== "string" ||
    x.length > 100000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(x)
  )
    throw Error("INVALID_BASE64");
  return Uint8Array.from(atob(x), (c) => c.charCodeAt(0));
}
export function jcs(value) {
  if (Array.isArray(value)) return "[" + value.map(jcs).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + jcs(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const pem = (bytes) =>
  "-----BEGIN PUBLIC KEY-----\n" +
  base64(bytes)
    .match(/.{1,64}/g)
    .join("\n") +
  "\n-----END PUBLIC KEY-----\n";
const derKey = (text) => {
  if (
    typeof text !== "string" ||
    !/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/.test(
      text,
    )
  )
    throw Error("INVALID_WITNESS_KEY");
  return unbase64(text.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, ""));
};
async function verifySignature(key, signature, message) {
  const imported = await crypto.subtle.importKey(
    "spki",
    key,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const compact = p256.Signature.fromBytes(signature, "der").toBytes("compact");
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    imported,
    compact,
    message,
  );
}
export async function makeWitnessIntent(record) {
  if (
    typeof record !== "string" ||
    record.length > 10000 ||
    jcs(JSON.parse(record)) !== record
  )
    throw Error("INVALID_WITNESS_RECORD");
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keys.privateKey,
      utf8ToBytes(record),
    ),
  );
  const pub = new Uint8Array(
    await crypto.subtle.exportKey("spki", keys.publicKey),
  );
  return JSON.stringify({
    apiVersion: "0.0.1",
    kind: "hashedrekord",
    spec: {
      data: { hash: { algorithm: "sha256", value: witnessHash(record) } },
      signature: {
        content: base64(
          p256.Signature.fromBytes(signature, "compact").toBytes("der"),
        ),
        publicKey: { content: base64(utf8ToBytes(pem(pub))) },
      },
    },
  });
}
function inclusion(body, proof) {
  let fn = proof.logIndex,
    sn = proof.treeSize - 1;
  if (
    !Number.isSafeInteger(fn) ||
    fn < 0 ||
    !Number.isSafeInteger(sn) ||
    fn > sn ||
    sn < 0 ||
    !Array.isArray(proof.hashes) ||
    proof.hashes.length > 64
  )
    return false;
  let value = sha256(Uint8Array.of(0, ...body));
  for (const hash of proof.hashes) {
    if (sn === 0 || !/^[a-f0-9]{64}$/.test(hash)) return false;
    const p = Uint8Array.from(hash.match(/../g), (v) => parseInt(v, 16));
    if (fn % 2 === 1 || fn === sn) {
      value = sha256(Uint8Array.of(1, ...p, ...value));
      while (fn !== 0 && fn % 2 === 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else value = sha256(Uint8Array.of(1, ...value, ...p));
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && bytesToHex(value) === proof.rootHash;
}
export async function verifyWitness(receipt, expectedRecord, expectedIntent) {
  try {
    if (
      !receipt ||
      JSON.stringify(receipt).length > 100000 ||
      receipt.record !== expectedRecord ||
      jcs(JSON.parse(expectedRecord)) !== expectedRecord ||
      !/^(?:[a-f0-9]{64}|[a-f0-9]{80})$/.test(receipt.uuid)
    )
      return null;
    const e = receipt.entry,
      key = unbase64(WITNESS_POLICY.publicKey),
      logID = hex(key);
    if (
      !e ||
      e.logID !== logID ||
      !Number.isSafeInteger(e.integratedTime) ||
      e.integratedTime < 1 ||
      !Number.isSafeInteger(e.logIndex) ||
      e.logIndex < 0
    )
      return null;
    const body = unbase64(e.body),
      parsed = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(body),
      );
    if (
      parsed.kind !== "hashedrekord" ||
      parsed.apiVersion !== "0.0.1" ||
      parsed.spec?.data?.hash?.algorithm !== "sha256" ||
      parsed.spec.data.hash.value !== witnessHash(expectedRecord)
    )
      return null;
    if (expectedIntent && jcs(parsed) !== jcs(JSON.parse(expectedIntent)))
      return null;
    const artifactKey = derKey(
      new TextDecoder().decode(
        unbase64(parsed.spec.signature.publicKey.content),
      ),
    );
    if (
      !(await verifySignature(
        artifactKey,
        unbase64(parsed.spec.signature.content),
        utf8ToBytes(expectedRecord),
      ))
    )
      return null;
    if (
      !(await verifySignature(
        key,
        unbase64(e.verification?.signedEntryTimestamp),
        utf8ToBytes(
          jcs({
            body: e.body,
            integratedTime: e.integratedTime,
            logID: e.logID,
            logIndex: e.logIndex,
          }),
        ),
      ))
    )
      return null;
    const proof = e.verification?.inclusionProof;
    if (
      !proof ||
      proof.logIndex > e.logIndex ||
      !inclusion(body, proof) ||
      receipt.uuid.slice(-64) !== hex(Uint8Array.of(0, ...body))
    )
      return null;
    const checkpoint = proof.checkpoint;
    if (typeof checkpoint !== "string" || checkpoint.length > 5000) return null;
    const split = checkpoint.split("\n\n");
    if (split.length !== 2) return null;
    const lines = split[0].split("\n");
    if (
      lines.length !== 3 ||
      !/^rekor\.sigstore\.dev - [0-9]+$/.test(lines[0]) ||
      lines[1] !== String(proof.treeSize) ||
      base64(
        Uint8Array.from(proof.rootHash.match(/../g), (x) => parseInt(x, 16)),
      ) !== lines[2]
    )
      return null;
    if (
      receipt.uuid.length === 80 &&
      BigInt("0x" + receipt.uuid.slice(0, 16)).toString() !==
        lines[0].split(" - ")[1]
    )
      return null;
    const signed = split[1].trim().split("\n");
    let valid = false;
    for (const line of signed) {
      const m = /^— rekor\.sigstore\.dev ([A-Za-z0-9+/=]+)$/.exec(line);
      if (!m) continue;
      const sig = unbase64(m[1]);
      if (bytesToHex(sig.slice(0, 4)) !== logID.slice(0, 8)) continue;
      if (
        await verifySignature(key, sig.slice(4), utf8ToBytes(split[0] + "\n"))
      )
        valid = true;
    }
    if (!valid) return null;
    // logIndex is the virtual index in SET; inclusionProof uses the shard-local index.
    return {
      time: e.integratedTime * 1000,
      logIndex: e.logIndex,
      treeSize: proof.treeSize,
      url: WITNESS_POLICY.origin + "/api/v1/log/entries/" + receipt.uuid,
    };
  } catch {
    return null;
  }
}
async function boundedText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100000) {
        await reader.cancel();
        throw Error("WITNESS_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export async function submitWitness(
  record,
  intent,
  fetcher = fetch,
  verifier = verifyWitness,
) {
  const endpoint = WITNESS_POLICY.origin + "/api/v1/log/entries";
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: intent,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  let result;
  if (response.status === 409) {
    const location = response.headers.get("location");
    const url = new URL(location || "", endpoint);
    if (
      url.origin !== WITNESS_POLICY.origin ||
      !/^\/api\/v1\/log\/entries\/[a-f0-9]{64,80}$/.test(url.pathname) ||
      url.search
    )
      throw Error("INVALID_WITNESS_CONFLICT");
    const prior = await fetcher(url.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (prior.status !== 200) throw Error("WITNESS_UNAVAILABLE");
    result = JSON.parse(await boundedText(prior));
  } else {
    if (response.status !== 201) throw Error("WITNESS_HTTP_" + response.status);
    result = JSON.parse(await boundedText(response));
  }
  const ids = Object.keys(result);
  if (ids.length !== 1) throw Error("INVALID_WITNESS_RESPONSE");
  const receipt = { record, uuid: ids[0], entry: result[ids[0]] };
  if (!(await verifier(receipt, record, intent)))
    throw Error("INVALID_WITNESS_RECEIPT");
  return receipt;
}

import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const base =
  process.env.TEST_BASE_URL || "https://luck-test.onlinefreetools.org";
assert(
  [
    "https://luck-test.onlinefreetools.org",
    "https://luck.onlinefreetools.org",
  ].includes(base) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base),
);
let checks = 0;
const get = async (path) => {
  const r = await fetch(base + path, { method: "GET" });
  assert.equal(new URL(r.url).origin, new URL(base).origin);
  checks++;
  return r;
};
const hash = (v) => createHash("sha256").update(v).digest("hex");
const before = await (await get("/api/state")).json();
assert.equal(before.me, null);
const r = await get("/api/randomness-health");
assert.equal(r.status, 200);
const health = await r.json();
assert(health.ready && health.recordGuardsInstalled);
assert(
  health.historicalSelfTest.validAccepted &&
    health.historicalSelfTest.tamperRejected,
);
if (!/^http:/.test(base)) assert(health.abuseProtectionConfigured);
assert.deepEqual(health.installedAlgorithms, [1, 2, 3]);
assert.equal(health.newRoundVersion, 3);
assert(
  health.witnessGuardsInstalled &&
    health.witnessSelfTest.validAccepted &&
    health.witnessSelfTest.tamperRejected,
);
if (!/^http:/.test(base)) assert(health.hiddenCommitmentsConfigured);
for (const file of [
  "beacon-verifier.js",
  "commitment-verifier.js",
  "entropy-view.js",
  "proof-verifier.js",
  "verify.js",
  "verify.html",
  "verify.css",
  "round-summary.js",
  "i18n.js",
]) {
  const result = await get("/" + file);
  assert.equal(result.status, 200);
  const value = Buffer.from(await result.arrayBuffer()),
    local = await readFile(new URL("../public/" + file, import.meta.url));
  assert.equal(
    hash(value),
    hash(local),
    file + " differs from deployed source",
  );
}
const round =
  before.rounds.find((r) => r.status === "open") || before.rounds[0];
assert(round);
const entropy = await (await get("/api/round/" + round.id + "/entropy")).json();
assert.equal(entropy.roundId, round.id);
assert.equal(entropy.version, round.manifest.version);
if (round.manifest.version === 1) assert.equal(entropy.snapshot, null);
assert.equal(
  (await get("/api/round/security-missing-round/entropy")).status,
  404,
);
const after = await (await get("/api/state")).json();
const witnesses = await (
  await get("/api/round/" + round.id + "/witnesses")
).json();
assert.equal(witnesses.roundId, round.id);
if (round.manifest.version < 3) {
  assert.deepEqual(witnesses.witnesses, {});
  assert.equal(witnesses.reveal, null);
}
assert.equal(
  (await get("/api/round/security-missing-round/witnesses")).status,
  404,
);
const current = after.rounds.find((r) => r.id === round.id);
assert(current);
assert.deepEqual(current.manifest, round.manifest);
assert.equal(current.commitment, round.commitment);
if (!before.demo) {
  assert.equal(after.pool, before.pool);
  assert.deepEqual(current.proof, round.proof);
  assert.equal(current.cutoff, round.cutoff);
  assert.equal(current.ready, round.ready);
}
const report = {
  status: "passed",
  base,
  checkedAt: new Date().toISOString(),
  checks,
  apiWrites: 0,
  version: round.manifest.version,
  round: round.id,
  poolBefore: before.pool,
  poolAfter: after.pool,
  health,
  manifestUnchanged: true,
  commitmentUnchanged: true,
  legacyEntropyUnchanged:
    round.manifest.version === 1 && entropy.snapshot === null,
};
await mkdir("test-output", { recursive: true });
await writeFile(
  "test-output/security-http-" + (before.demo ? "demo" : "live") + ".json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    status: report.status,
    base,
    checks,
    apiWrites: 0,
    version: report.version,
    ready: health.ready,
  }),
);

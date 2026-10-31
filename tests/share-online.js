import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { verifyProof } from "../public/proof-verifier.js";
import { describeRoundShare } from "../public/round-share-model.js";

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
  const r = await fetch(base + path, { method: "GET", redirect: "follow" });
  assert.equal(
    new URL(r.url).origin,
    new URL(base).origin,
    "Unexpected cross-origin redirect",
  );
  checks++;
  return r;
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assets = [
  "share.html",
  "share.css",
  "share.js",
  "share-copy.js",
  "round-share-model.js",
  "trust-entry.js",
  "app.js",
  "campaigns.js",
  "style.css",
  "index.html",
];
await Promise.all(
  assets.map(async (asset) => {
    const r = await get(asset === "index.html" ? "/" : "/" + asset);
    assert.equal(r.status, 200, asset);
    const bytes = Buffer.from(await r.arrayBuffer()),
      local = await readFile(new URL("../public/" + asset, import.meta.url));
    assert.equal(hash(bytes), hash(local), "Deployed bytes differ: " + asset);
    assert.match(r.headers.get("content-security-policy"), /script-src 'self'/);
  }),
);
const before = await (await get("/api/state")).json();
assert.equal(before.me, null);
const original =
  before.rounds.find((r) => r.status === "open") || before.rounds[0];
assert(original);
const response = await get("/api/round/" + original.id);
assert.equal(response.status, 200);
const data = await response.json();
assert.equal(data.round.id, original.id);
let verification = null;
if (data.round.status === "settled") {
  const proof = await (await get("/api/proof/" + original.id)).json();
  assert.deepEqual(proof, data.round.proof);
  verification = await verifyProof(proof, {
    roundId: original.id,
    commitment: original.commitment,
    manifest: original.manifest,
  });
  assert.equal(verification.ok, true);
}
for (const language of ["zh-CN", "en", "ja"]) {
  for (const game of data.round.manifest.games) {
    const view = describeRoundShare(
      data,
      game.id,
      language,
      data.serverTime,
      verification,
    );
    checks++;
    assert(view && view.id === original.id);
    assert.equal(view.game.id, game.id);
    assert.equal(view.mode, data.round.manifest.mode);
    if (!original.proof) assert.deepEqual(view.main, []);
    if (verification?.ok) assert.equal(view.phase, "passed");
    assert.equal(
      new URL(view.path, base).searchParams.get("round"),
      original.id,
    );
  }
}
assert.equal(
  (await get("/api/round/share-acceptance-missing-record")).status,
  404,
);
const after = await (await get("/api/state")).json();
const next = after.rounds.find((r) => r.id === original.id);
assert(next);
assert.deepEqual(next.manifest, original.manifest);
assert.equal(next.commitment, original.commitment);
if (!before.demo) {
  assert.equal(after.pool, before.pool);
  assert.deepEqual(next.proof, original.proof);
}
const report = {
  status: "passed",
  base,
  checkedAt: new Date().toISOString(),
  checks,
  apiWrites: 0,
  round: original.id,
  mode: data.round.manifest.mode,
  phase: original.status,
  poolBefore: before.pool,
  poolAfter: after.pool,
  manifestUnchanged: true,
  commitmentUnchanged: true,
  proofRecalculated: verification?.ok === true,
  proofPublished: Boolean(original.proof),
};
await mkdir("test-output", { recursive: true });
await writeFile(
  "test-output/share-http-" + (before.demo ? "demo" : "live") + ".json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));

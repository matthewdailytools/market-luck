import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { verifyProof } from "../public/proof-verifier.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = "tests/fixtures/v3-controlled-proof.json";
const bytes = await readFile(new URL("../" + fixture, import.meta.url));
const proof = JSON.parse(bytes);
const verified = await verifyProof(proof, {
  roundId: proof.manifest.id,
  manifest: proof.manifest,
  commitment: proof.commitment,
});
assert.equal(verified.ok, true);
assert.equal(verified.checks.length, 11);
const invoke = (path) =>
  spawnSync(process.execPath, ["scripts/verify-proof.js", path], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });
const valid = invoke(fixture);
assert.equal(valid.status, 0);
assert.match(valid.stdout, /VERIFIED/);
const copy = structuredClone(proof);
const secret = JSON.parse(copy.reveal),
  nonce = secret.nonce;
secret.nonce = (nonce[0] === "0" ? "1" : "0") + nonce.slice(1);
copy.reveal = JSON.stringify(secret);
const folder = await mkdtemp(join(tmpdir(), "opendraw-launch-"));
let invalid;
try {
  const path = join(folder, "tampered-proof.json");
  await writeFile(path, JSON.stringify(copy));
  invalid = invoke(path);
} finally {
  await rm(folder, { recursive: true, force: true });
}
assert.equal(invalid.status, 1);
const failed = await verifyProof(copy, {
  roundId: proof.manifest.id,
  manifest: proof.manifest,
  commitment: proof.commitment,
});
assert.equal(failed.ok, false);
assert(failed.errors.length > 0);
const evidence = {
  schema: 1,
  kind: "CONTROLLED_REPLAY",
  execution: proof.execution,
  naturalMarketDraw: false,
  source:
    "actual CLI and browser-verifier execution; video is paced motion reconstruction",
  fixture,
  fixtureSha256: createHash("sha256").update(bytes).digest("hex"),
  round: proof.manifest.id,
  manifestSha256: proof.commitment,
  secretMd5: proof.manifest.hidden.md5,
  secretSha256: proof.manifest.hidden.sha256,
  witnesses: {
    presaleAt: new Date(
      proof.witnesses.presale.entry.integratedTime * 1000,
    ).toISOString(),
    freezeAt: new Date(
      proof.witnesses.freeze.entry.integratedTime * 1000,
    ).toISOString(),
  },
  beaconRound: proof.snapshot.beaconRound,
  checks: verified.checks,
  valid: {
    command: "node scripts/verify-proof.js " + fixture,
    exitCode: valid.status,
    stdout: valid.stdout.trim(),
  },
  tamper: {
    field: "JSON.parse(reveal).nonce[0]",
    original: nonce[0],
    changed: secret.nonce[0],
    command: "node scripts/verify-proof.js <temporary>/tampered-proof.json",
    exitCode: invalid.status,
    errorType: invalid.stderr.includes("AssertionError")
      ? "AssertionError"
      : "Error",
    errors: failed.errors,
  },
  gameCount: proof.manifest.games.length,
  example: { game: "cn", ...proof.results.cn },
  limits: [
    "Root operators can stop or withhold reveals",
    "Log inclusion does not prove candidate uniqueness",
    "GitHub observer can lag the future beacon",
  ],
};
await mkdir(new URL("../docs/launch/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../docs/launch/demo-evidence.json", import.meta.url),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: "passed",
    checks: evidence.checks.length,
    validExit: valid.status,
    tamperedExit: invalid.status,
    fixtureSha256: evidence.fixtureSha256,
  }),
);

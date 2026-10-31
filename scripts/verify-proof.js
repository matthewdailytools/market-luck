import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyProof } from "../public/proof-verifier.js";
const proof = JSON.parse(await readFile(process.argv[2], "utf8"));
const digest = (algorithm, s) =>
  createHash(algorithm).update(s, "utf8").digest("hex");
assert.equal(
  digest("sha256", JSON.stringify(proof.manifest)),
  proof.commitment,
);
const parsed = JSON.parse(proof.input);
assert.equal(parsed.round, proof.manifest.id);
assert.equal(parsed.commitment, proof.commitment);
const canonical = JSON.stringify({
  version: proof.manifest.version,
  round: parsed.round,
  commitment: parsed.commitment,
  prices: [...parsed.prices]
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
    .map((p) => ({
      symbol: p.symbol,
      date: p.date,
      currency: p.currency,
      scale: p.scale,
      close: p.close,
    })),
  ...(proof.version === 2
    ? {
        snapshot: {
          digest: proof.snapshot?.digest,
          sealedAt: proof.snapshot?.sealedAt,
          beaconRound: proof.snapshot?.beaconRound,
        },
        beacon: parsed.beacon,
      }
    : {}),
});
assert.equal(canonical, proof.input);
assert.equal(digest("md5", canonical), proof.md5);
assert(
  [1, 2].includes(proof.version) && proof.version === proof.manifest.version,
);
assert.equal(
  digest(
    "sha256",
    proof.version === 2 ? "market-luck/draw/v2\n" + canonical : canonical,
  ),
  proof.seed,
);
if (proof.version === 2) {
  const verified = await verifyProof(proof, {
    roundId: proof.manifest.id,
    manifest: proof.manifest,
    commitment: proof.commitment,
  });
  assert(verified.ok, verified.errors.join(","));
}
for (const g of proof.manifest.games) {
  let words = [],
    counter = 0;
  const sample = (n) => {
    const limit = Math.floor(2 ** 32 / n) * n;
    let x;
    do {
      if (!words.length) {
        const b = createHash("sha256")
          .update(`${proof.seed}:${g.id}:${counter++}`)
          .digest();
        words = Array.from({ length: 8 }, (_, i) => b.readUInt32BE(i * 4));
      }
      x = words.shift();
    } while (x >= limit);
    return x % n;
  };
  const pool = Array.from({ length: g.max }, (_, i) => i + 1),
    main = [];
  for (let i = 0; i < g.count; i++)
    main.push(pool.splice(sample(pool.length), 1)[0]);
  assert.deepEqual(
    {
      main: main.sort((a, b) => a - b),
      bonus: g.bonus ? sample(g.bonus) + (g.bonusMin ?? 1) : null,
    },
    proof.results[g.id],
  );
}
console.log(
  "VERIFIED: commitment, canonical input, MD5, SHA-256 and all game results. Mode: " +
    proof.mode +
    "; Execution: " +
    (proof.execution || "legacy/unspecified"),
);

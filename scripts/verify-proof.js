import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  version: 1,
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
});
assert.equal(canonical, proof.input);
assert.equal(digest("md5", canonical), proof.md5);
assert.equal(digest("sha256", canonical), proof.seed);
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

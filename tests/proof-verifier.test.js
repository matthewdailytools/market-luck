import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { games, evidence, hash } from "../src/engine.js";
import { liveManifest } from "../src/live.js";
import { verifyProof } from "../public/proof-verifier.js";
import { md5Hex, sha256Hex } from "../public/proof-hashes.js";

const copy = (value) => structuredClone(value);
const expected = (p) => ({
  roundId: p.manifest.id,
  commitment: p.commitment,
  manifest: p.manifest,
});
const check = (r, id) => r.checks.find((c) => c.id === id).ok;

function fixture(mode = "DEMO", suffix = "1") {
  const markets = ["AAPL", "MSFT", "IBM"].map((ticker) => ({
    symbol: `${ticker === "IBM" ? "XNYS" : "XNAS"}:${ticker}`,
    date: "2026-11-02",
    currency: "USD",
    scale: 2,
  }));
  const manifest =
    mode === "LIVE"
      ? liveManifest(
          { markets, cutoff: Date.parse("2026-11-02T08:30:00Z") },
          Date.parse("2026-10-31T00:00:00Z"),
        )
      : {
          version: 1,
          mode: "DEMO",
          price: 10,
          games,
          markets,
          sources: ["FIXTURE-v1"],
        };
  manifest.id = `browser-proof-fixture-${suffix}`;
  const round = {
    id: manifest.id,
    manifest: JSON.stringify(manifest),
    commitment: hash(JSON.stringify(manifest)),
  };
  const prices = markets.map((market, i) => ({
    ...market,
    close: 12345 + i * 100,
  }));
  const proof = {
    ...evidence(round, prices),
    mode,
    poolBefore: 100030,
    payout: 30000,
    poolAfter: 70030,
  };
  if (mode === "DEMO") proof.simulatedClock = true;
  else {
    proof.execution = "LIVE_REAL_CLOCK";
    proof.observedAt = new Date(manifest.ready).toISOString();
    proof.sources = prices.map((price) => ({
      symbol: price.symbol,
      failures: [],
      sources: ["YahooFinance", "Nasdaq"].map((provider) => ({
        provider,
        close: price.close,
        closeMinorUnits: price.close,
        sha256: hash(provider + price.symbol),
      })),
    }));
  }
  return proof;
}

test("browser MD5 and SHA-256 agree with Node crypto for Unicode and block boundaries", async () => {
  for (const text of [
    "",
    "abc",
    "公开核验🙂",
    "a".repeat(55),
    "b".repeat(56),
    "c".repeat(64),
    "d".repeat(10000),
  ]) {
    assert.equal(md5Hex(text), createHash("md5").update(text).digest("hex"));
    assert.equal(
      await sha256Hex(text),
      createHash("sha256").update(text).digest("hex"),
    );
  }
});

test("independent browser implementation reproduces all 16 games including a zero German bonus", async () => {
  let proof;
  for (let i = 0; i < 200; i++) {
    proof = fixture("DEMO", String(i));
    if (proof.results.de.bonus === 0) break;
  }
  assert.equal(proof.results.de.bonus, 0);
  const result = await verifyProof(proof, expected(proof));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.results, proof.results);
  assert.equal(result.mode, "DEMO");
  assert.equal(result.execution, null);
});

test("LIVE and tagged replay evidence reproduce while retaining their execution identity", async () => {
  const proof = fixture("LIVE");
  const live = await verifyProof(proof, expected(proof));
  assert.equal(live.ok, true, JSON.stringify(live.errors));
  assert.equal(live.execution, "LIVE_REAL_CLOCK");
  proof.execution = "ONLINE_REPLAY_SIMULATED_CLOCK";
  const replay = await verifyProof(proof, expected(proof));
  assert.equal(replay.ok, true);
  assert.equal(replay.execution, "ONLINE_REPLAY_SIMULATED_CLOCK");
});

test("expected round and commitment cannot be replaced with self-declared proof values", async () => {
  const proof = fixture();
  for (const update of [
    { roundId: "another-round" },
    { commitment: "0".repeat(64) },
    { manifest: { ...proof.manifest, price: 999 } },
  ]) {
    const result = await verifyProof(proof, { ...expected(proof), ...update });
    assert.equal(result.ok, false);
    assert.equal(check(result, "manifest"), false);
  }
  assert.equal((await verifyProof(proof)).ok, false);
});

test("tampering with hashes, result numbers, canonical order or source price cannot stay green", async () => {
  const original = fixture("LIVE");
  for (const [id, mutate] of [
    [
      "hashes",
      (p) => {
        p.md5 = "0".repeat(32);
      },
    ],
    [
      "hashes",
      (p) => {
        p.seed = "0".repeat(64);
      },
    ],
    [
      "results",
      (p) => {
        p.results.cn.main[0] = 999;
      },
    ],
    [
      "canonical",
      (p) => {
        const data = JSON.parse(p.input);
        data.prices.reverse();
        p.input = JSON.stringify(data);
      },
    ],
    [
      "canonical",
      (p) => {
        const data = JSON.parse(p.input);
        data.prices[0].date = "2026-11-03";
        p.input = JSON.stringify(data);
      },
    ],
    [
      "sources",
      (p) => {
        p.sources[0].sources[1].close++;
      },
    ],
  ]) {
    const proof = copy(original);
    mutate(proof);
    const result = await verifyProof(proof, expected(original));
    assert.equal(result.ok, false, id);
    assert.equal(check(result, id), false, id);
  }
});

test("incomplete, duplicate or unpinned source metadata is rejected", async () => {
  const original = fixture("LIVE");
  for (const mutate of [
    (p) => {
      p.sources.pop();
    },
    (p) => {
      p.sources[0].sources.pop();
    },
    (p) => {
      p.sources[0].sources[1].provider = "YahooFinance";
    },
    (p) => {
      p.sources[0].sources[1].provider = "OtherVendor";
    },
    (p) => {
      p.sources[0].sources[1].sha256 = "not-a-digest";
    },
    (p) => {
      p.sources[0].sources[1].closeMinorUnits++;
    },
  ]) {
    const proof = copy(original);
    mutate(proof);
    const result = await verifyProof(proof, expected(original));
    assert.equal(check(result, "sources"), false);
    assert.equal(result.ok, false);
  }
});

test("early observations, wrong execution mode and broken pool arithmetic are separate failures", async () => {
  const original = fixture("LIVE");
  for (const mutate of [
    (p) => {
      p.observedAt = new Date(p.manifest.ready - 1).toISOString();
    },
    (p) => {
      delete p.execution;
    },
    (p) => {
      p.mode = "DEMO";
    },
    (p) => {
      p.simulatedClock = true;
    },
  ]) {
    const proof = copy(original);
    mutate(proof);
    assert.equal(
      check(await verifyProof(proof, expected(original)), "timing"),
      false,
    );
  }
  for (const mutate of [
    (p) => {
      p.poolAfter++;
    },
    (p) => {
      p.payout = -1;
    },
    (p) => {
      p.poolBefore = Number.MAX_SAFE_INTEGER + 1;
    },
  ]) {
    const proof = copy(original);
    mutate(proof);
    assert.equal(
      check(await verifyProof(proof, expected(original)), "pool"),
      false,
    );
  }
});

test("malformed and oversized inputs fail without throwing or unbounded draw work", async () => {
  for (const proof of [
    null,
    [],
    {},
    { manifest: {} },
    { ...fixture(), input: "{" },
    { ...fixture(), filler: "x".repeat(2000001) },
  ]) {
    const result = await verifyProof(proof, expected(fixture()));
    assert.equal(result.ok, false);
    assert.equal(result.checks.length, 7);
    assert(result.checks.every((c) => typeof c.ok === "boolean"));
    assert(result.errors.length > 0);
  }
  const huge = copy(fixture());
  huge.manifest.games[0].max = 1000000000;
  assert.equal((await verifyProof(huge, expected(huge))).ok, false);
});

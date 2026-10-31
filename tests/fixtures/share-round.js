import { games, evidence, hash } from "../../src/engine.js";
import { liveManifest } from "../../src/live.js";

// Controlled evidence, never a natural draw. Used only by unit and isolated CI tests.
export function shareFixture(kind = "passed") {
  const now = Date.parse("2026-11-04T00:00:00Z");
  const markets = ["AAPL", "MSFT", "IBM"].map((ticker) => ({
    symbol: `${ticker === "IBM" ? "XNYS" : "XNAS"}:${ticker}`,
    date: "2026-11-02",
    currency: "USD",
    scale: 2,
  }));
  const live = ["live", "replay"].includes(kind);
  const manifest = live
    ? liveManifest(
        { markets, cutoff: Date.parse("2026-11-02T08:30:00Z") },
        Date.parse("2026-10-31T00:00:00Z"),
      )
    : {
        version: 1,
        mode: "DEMO",
        price: 10,
        games: structuredClone(games),
        cutoff: now - 120000,
        ready: now - 60000,
        sources: ["FIXTURE-v1"],
        markets: markets.map((m) => ({ ...m, closeUTC: now - 90000 })),
      };
  manifest.id = "share-fixture-" + kind;
  if (kind === "pending") {
    manifest.cutoff = now + 60000;
    manifest.ready = now + 120000;
  }
  const round = {
    id: manifest.id,
    manifest,
    commitment: hash(JSON.stringify(manifest)),
    cutoff: manifest.cutoff,
    ready: manifest.ready,
    status:
      kind === "pending" ? "open" : kind === "paused" ? "paused" : "settled",
    proof: null,
  };
  if (round.status === "settled") {
    const proof = {
      ...evidence(
        { ...round, manifest: JSON.stringify(manifest) },
        manifest.markets.map((m, i) => ({ ...m, close: 12345 + i * 100 })),
      ),
      mode: manifest.mode,
      poolBefore: 100030,
      payout: 30000,
      poolAfter: 70030,
    };
    if (!live) proof.simulatedClock = true;
    else {
      proof.execution =
        kind === "replay" ? "ONLINE_REPLAY_SIMULATED_CLOCK" : "LIVE_REAL_CLOCK";
      if (kind === "replay") proof.simulatedClock = true;
      proof.observedAt = new Date(manifest.ready).toISOString();
      proof.sources = manifest.markets.map((market, i) => ({
        symbol: market.symbol,
        failures: [],
        sources: ["YahooFinance", "Nasdaq"].map((provider) => ({
          provider,
          close: 12345 + i * 100,
          sha256: hash(provider + market.symbol),
        })),
      }));
    }
    if (kind === "tampered") proof.results.cn.main[0] = 99;
    round.proof = proof;
  }
  return { serverTime: now, demo: !live, round };
}

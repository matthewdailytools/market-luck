import { readFileSync } from "node:fs";
import { prepareLiveManifest } from "../../src/live.js";
import { evidence, hash } from "../../src/engine.js";
import {
  snapshotPayload,
  futureBeaconRound,
  beaconTime,
} from "../../src/beacon.js";
// Controlled market data and a real historical beacon. Never a natural draw.
export function v2ProofFixture() {
  const vector = JSON.parse(
    readFileSync(new URL("quicknet-20261030.json", import.meta.url)),
  );
  const markets = ["AAPL", "MSFT", "IBM"].map((t) => ({
    symbol: `${t === "IBM" ? "XNYS" : "XNAS"}:${t}`,
    date: "2026-10-29",
    currency: "USD",
    scale: 2,
  }));
  const manifest = prepareLiveManifest(
    { markets, cutoff: Date.parse("2026-10-29T07:30:00Z") },
    Date.parse("2026-10-28T00:00:00Z"),
  );
  manifest.id = "security-v2-controlled-replay";
  const round = {
    id: manifest.id,
    manifest: JSON.stringify(manifest),
    commitment: hash(JSON.stringify(manifest)),
  };
  const prices = markets.map((m, i) => ({ ...m, close: 10000 + i * 100 }));
  const sources = prices.map((p) => ({
    symbol: p.symbol,
    failures: [],
    sources: ["YahooFinance", "Nasdaq"].map((provider) => ({
      provider,
      close: p.close,
      sha256: hash("CONTROLLED_FIXTURE:" + provider + p.symbol),
    })),
  }));
  const payload = snapshotPayload(round, prices, sources),
    snapshot = {
      payload,
      digest: hash(payload),
      sealedAt: vector.sealedAt,
      beaconRound: futureBeaconRound(vector.sealedAt),
    };
  return {
    ...evidence(round, prices, { snapshot, beacon: vector.beacon }),
    mode: "LIVE",
    snapshot,
    beacon: vector.beacon,
    sources,
    execution: "ONLINE_REPLAY_SIMULATED_CLOCK",
    simulatedClock: true,
    observedAt: new Date(beaconTime(snapshot.beaconRound)).toISOString(),
    poolBefore: 100000,
    payout: 0,
    poolAfter: 100000,
  };
}

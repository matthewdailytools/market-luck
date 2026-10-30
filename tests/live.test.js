import { test } from "node:test";
import assert from "node:assert/strict";
import { liveManifest } from "../src/live.js";
const now = Date.parse("2026-10-29T00:00:00Z");
const openUTC = Date.parse("2026-10-30T13:30:00Z"),
  closeUTC = Date.parse("2026-10-30T20:00:00Z");
const markets = ["AAPL", "MSFT"].map((s) => ({
  symbol: "XNAS:" + s,
  date: "2026-10-30",
  currency: "USD",
  scale: 2,
  openUTC,
  closeUTC,
  eodhd: s + ".US",
  alpha: s,
  twelve: s,
  exchange: "NASDAQ",
}));
test("live manifest pins free source quorum, cutoff and confirmation window", () => {
  const m = liveManifest({ markets, cutoff: now + 7200000 }, now);
  assert.equal(m.ready, closeUTC + 86400000);
  assert.equal(m.quorum, 2);
  assert.deepEqual(m.sources, ["EODHD", "AlphaVantage", "TwelveData"]);
});
test("no late cutoff, duplicate symbols or currency ambiguity", () => {
  assert.throws(() => liveManifest({ markets, cutoff: openUTC }, now));
  assert.throws(() =>
    liveManifest(
      { markets: [markets[0], markets[0]], cutoff: now + 7200000 },
      now,
    ),
  );
  assert.throws(() =>
    liveManifest(
      {
        markets: [{ ...markets[0], currency: "GBP" }, markets[1]],
        cutoff: now + 7200000,
      },
      now,
    ),
  );
});

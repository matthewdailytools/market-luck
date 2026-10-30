import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decimalUnits,
  freeConsensus,
  collectMarketData,
} from "../src/market-data.js";
const m = {
  symbol: "XNAS:AAPL",
  eodhd: "AAPL.US",
  alpha: "AAPL",
  twelve: "AAPL",
  exchange: "NASDAQ",
  date: "2026-10-30",
  currency: "USD",
  scale: 2,
  closeUTC: 0,
};
const keys = {
  EODHD_API_KEY: "fake",
  ALPHA_VANTAGE_API_KEY: "fake",
  TWELVE_DATA_API_KEY: "fake",
};
const mock =
  (prices = ["123.45", "123.4500", "123.45"]) =>
  async (u) =>
    new Response(
      JSON.stringify(
        u.hostname === "eodhd.com"
          ? [{ date: m.date, close: prices[0] }]
          : u.hostname === "www.alphavantage.co"
            ? {
                "Meta Data": { "2. Symbol": "AAPL" },
                "Time Series (Daily)": { [m.date]: { "4. close": prices[1] } },
              }
            : {
                meta: { symbol: "AAPL", exchange: "NASDAQ", currency: "USD" },
                values: [{ datetime: m.date, close: prices[2] }],
              },
      ),
    );
test("exact fixed decimal conversion", () => {
  assert.equal(decimalUnits("123.4500", 2), 12345);
  for (const x of ["NaN", "-1", "0", "1.001", "1e2"])
    assert.throws(() => decimalUnits(x, 2));
});
test("three free providers agree", async () => {
  const r = await freeConsensus(m, keys, mock());
  assert.equal(r.sources.length, 3);
  assert.equal(r.price.close, 12345);
});
test("two of three available may agree", async () => {
  const r = await freeConsensus(m, { ...keys, EODHD_API_KEY: "" }, mock());
  assert.equal(r.sources.length, 2);
  assert.equal(r.failures[0].reason, "MISSING_KEY");
});
test("any valid disagreement freezes, even with majority", async () => {
  await assert.rejects(
    freeConsensus(m, keys, mock(["123.45", "123.45", "123.46"])),
    /SOURCE_CONFLICT/,
  );
});
test("one provider cannot draw", async () => {
  await assert.rejects(
    freeConsensus(m, { EODHD_API_KEY: "fake" }, mock()),
    /QUORUM_NOT_REACHED/,
  );
});
test("rate limit and wrong dates do not produce prices", async () => {
  await assert.rejects(
    freeConsensus(
      m,
      keys,
      async () => new Response(JSON.stringify({ Information: "rate limited" })),
    ),
    /QUORUM/,
  );
});
test("time window and pinned source policy", async () => {
  await assert.rejects(
    collectMarketData(
      {
        mode: "LIVE",
        sources: ["EODHD", "AlphaVantage", "TwelveData"],
        quorum: 2,
        confirmationDelayMs: 86400000,
        ready: 999999999,
        markets: [m],
      },
      keys,
      mock(),
      10,
    ),
    /MARKETS_NOT_FINAL/,
  );
});

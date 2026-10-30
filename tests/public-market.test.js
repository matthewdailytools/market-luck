import { test } from "node:test";
import assert from "node:assert/strict";
import { publicConsensus, yahooMinorUnits } from "../src/public-market-data.js";
const date = "2026-10-29",
  now = Date.parse("2026-10-31T00:00:00Z");
const fetcher =
  (different = false) =>
  async (url) =>
    new Response(
      JSON.stringify(
        url.includes("query1")
          ? {
              chart: {
                result: [
                  {
                    meta: {
                      symbol: "AAPL",
                      currency: "USD",
                      exchangeTimezoneName: "America/New_York",
                    },
                    timestamp: [1793280600],
                    indicators: { quote: [{ close: [348.9100036621094] }] },
                  },
                ],
              },
            }
          : {
              data: {
                symbol: "AAPL",
                tradesTable: {
                  rows: [
                    {
                      date: "10/29/2026",
                      close: different ? "$348.92" : "$348.91",
                    },
                  ],
                },
              },
              status: { rCode: 200 },
            },
      ),
    );
test("Yahoo float32 artifacts normalize without rounding real fractional cents", () => {
  assert.equal(yahooMinorUnits(348.9100036621094), 34891);
  assert.throws(() => yahooMinorUnits(348.911), /PRECISION/);
  assert.throws(() => yahooMinorUnits(NaN));
});
test("two no-key independent vendors agree", async () => {
  const r = await publicConsensus("AAPL", date, fetcher(), now);
  assert.equal(r.ok, true);
  assert.equal(r.closeMinorUnits, 34891);
  assert.equal(r.observations.length, 2);
});
test("no-key conflicts and blocked access cannot form consensus", async () => {
  const r = await publicConsensus("AAPL", date, fetcher(true), now);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "SOURCE_CONFLICT");
  const denied = await publicConsensus(
    "AAPL",
    date,
    async () => new Response("", { status: 403 }),
    now,
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.unavailable.length, 2);
});
test("no-key diagnostics reject current date and arbitrary instruments", async () => {
  await assert.rejects(
    publicConsensus(
      "AAPL",
      "2026-10-30",
      fetcher(),
      Date.parse("2026-10-30T17:00:00Z"),
    ),
    /HISTORICAL_DATE/,
  );
  await assert.rejects(
    publicConsensus("INVALID", date, fetcher(), now),
    /INVALID_MARKET/,
  );
});

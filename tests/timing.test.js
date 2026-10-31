import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "../src/engine.js";
import { sessionFor, assertLockedRound } from "../src/calendar.js";
import { liveManifest, collectAndSettle } from "../src/live.js";
const now = Date.parse("2026-10-28T00:00:00Z");
const markets = ["AAPL", "MSFT"].map((s) => ({
  symbol: "XNAS:" + s,
  date: "2026-10-29",
  currency: "USD",
  scale: 2,
}));
test("calendar handles DST, holidays, weekends and early closes", () => {
  assert.equal(
    new Date(sessionFor("2026-10-30").openUTC).toISOString(),
    "2026-10-30T13:30:00.000Z",
  );
  assert.equal(
    new Date(sessionFor("2026-11-02").openUTC).toISOString(),
    "2026-11-02T14:30:00.000Z",
  );
  assert.equal(
    new Date(sessionFor("2026-11-27").closeUTC).toISOString(),
    "2026-11-27T18:00:00.000Z",
  );
  assert.equal(
    new Date(sessionFor("2026-12-24").closeUTC).toISOString(),
    "2026-12-24T18:00:00.000Z",
  );
  for (const d of ["2026-11-26", "2026-10-31", "2027-01-04", "2026-02-30"])
    assert.throws(() => sessionFor(d));
});
test("no-key LIVE manifest derives pinned clocks and rejects fake sessions or known history", () => {
  const cutoff = sessionFor("2026-10-29").cutoff;
  const m = liveManifest({ markets, cutoff }, now);
  assert.deepEqual(m.sources, ["YahooFinance", "Nasdaq"]);
  assert.equal(m.ready, sessionFor("2026-10-29").closeUTC + 86400000);
  assert.throws(() =>
    liveManifest(
      { markets, cutoff: sessionFor("2026-10-29").openUTC - 1 },
      now,
    ),
  );
  assert.throws(() =>
    liveManifest(
      {
        markets: markets.map((m) => ({
          ...m,
          openUTC: Date.parse("2026-11-02T14:30Z"),
        })),
        cutoff,
      },
      now,
    ),
  );
  assert.throws(() =>
    liveManifest({ markets, cutoff }, Date.parse("2026-10-31T00:00Z")),
  );
});
test("ready equality required; mutable columns and paused rounds cannot collect", async () => {
  const m = liveManifest(
    { markets, cutoff: sessionFor("2026-10-29").cutoff },
    now,
  );
  const r = {
    id: m.id,
    manifest: JSON.stringify(m),
    commitment: hash(JSON.stringify(m)),
    cutoff: m.cutoff,
    ready: m.ready,
    status: "open",
  };
  assert.throws(
    () => assertLockedRound(r, m.ready - 1, { forCollection: true }),
    /MARKETS_NOT_FINAL/,
  );
  assertLockedRound(r, m.ready, { forCollection: true });
  assert.throws(
    () => assertLockedRound({ ...r, ready: m.ready - 1 }, m.ready),
    /MISMATCH/,
  );
  assert.throws(() =>
    assertLockedRound({ ...r, status: "paused" }, m.ready, {
      forCollection: true,
    }),
  );
  let fetched = false;
  await assert.rejects(
    collectAndSettle(
      {},
      r,
      () => {
        fetched = true;
      },
      m.ready - 1,
    ),
    /MARKETS_NOT_FINAL/,
  );
  assert.equal(fetched, false);
});

test("LIVE instruments use a single canonical MIC and ticker cannot be duplicated", () => {
  const cutoff = sessionFor("2026-10-29").cutoff;
  const ibm = { ...markets[0], symbol: "XNYS:IBM" };
  assert.throws(
    () =>
      liveManifest(
        { markets: [markets[0], { ...ibm, symbol: "XNAS:IBM" }], cutoff },
        now,
      ),
    /INVALID_MARKET/,
  );
  assert.throws(
    () => liveManifest({ markets: [ibm, { ...ibm }], cutoff }, now),
    /INVALID_MARKET/,
  );
  assert.throws(
    () =>
      liveManifest(
        {
          markets: [markets[0], { ...markets[1], symbol: "XNYS:MSFT" }],
          cutoff,
        },
        now,
      ),
    /INVALID_MARKET/,
  );
});

test("LIVE provider mappings are derived for both profiles and contradictory mappings are rejected", () => {
  const cutoff = sessionFor("2026-10-29").cutoff;
  const basket = [...markets, { ...markets[0], symbol: "XNYS:IBM" }];
  for (const sourceProfile of ["PUBLIC-NOKEY-v1", "KEYED-v1"]) {
    const m = liveManifest({ markets: basket, cutoff, sourceProfile }, now);
    assert.deepEqual(
      m.markets.map(({ symbol, eodhd, alpha, twelve, exchange }) => ({
        symbol,
        eodhd,
        alpha,
        twelve,
        exchange,
      })),
      [
        {
          symbol: "XNAS:AAPL",
          eodhd: "AAPL.US",
          alpha: "AAPL",
          twelve: "AAPL",
          exchange: "NASDAQ",
        },
        {
          symbol: "XNAS:MSFT",
          eodhd: "MSFT.US",
          alpha: "MSFT",
          twelve: "MSFT",
          exchange: "NASDAQ",
        },
        {
          symbol: "XNYS:IBM",
          eodhd: "IBM.US",
          alpha: "IBM",
          twelve: "IBM",
          exchange: "NYSE",
        },
      ],
    );
    for (const [field, value] of Object.entries({
      eodhd: "MSFT.US",
      alpha: "MSFT",
      twelve: "MSFT",
      exchange: "NYSE",
    })) {
      assert.throws(
        () =>
          liveManifest(
            {
              markets: [{ ...markets[0], [field]: value }, markets[1]],
              cutoff,
              sourceProfile,
            },
            now,
          ),
        /INVALID_MARKET/,
      );
    }
    const matching = m.markets.map((market) => ({ ...market }));
    assert.doesNotThrow(() =>
      liveManifest({ markets: matching, cutoff, sourceProfile }, now),
    );
  }
});

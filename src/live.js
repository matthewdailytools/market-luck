import { games, hash } from "./engine.js";
import { collectMarketData } from "./market-data.js";
import { settle } from "./settle.js";
import { publicConsensus } from "./public-market-data.js";
import {
  sessionFor,
  assertLockedRound,
  CALENDAR_VERSION,
  CONFIRMATION_MS,
} from "./calendar.js";
export function liveManifest(b, now = Date.now()) {
  if (
    !b ||
    !Array.isArray(b.markets) ||
    b.markets.length < 2 ||
    b.markets.length > 3 ||
    !Number.isSafeInteger(b.cutoff) ||
    b.cutoff < now + 3600000
  )
    throw Error("INVALID_MANIFEST");
  const tickers = new Set();
  const preparedMarkets = [];
  const profile = b.sourceProfile || "PUBLIC-NOKEY-v1";
  if (!["PUBLIC-NOKEY-v1", "KEYED-v1"].includes(profile))
    throw Error("INVALID_SOURCE_PROFILE");
  for (const m of b.markets) {
    const ticker =
      typeof m?.symbol === "string" ? m.symbol.split(":")[1] : undefined;
    const mapping = {
      symbol: `${ticker === "IBM" ? "XNYS" : "XNAS"}:${ticker}`,
      eodhd: `${ticker}.US`,
      alpha: ticker,
      twelve: ticker,
      exchange: ticker === "IBM" ? "NYSE" : "NASDAQ",
    };
    if (
      !["AAPL", "MSFT", "IBM"].includes(ticker) ||
      m.symbol !== mapping.symbol ||
      tickers.has(ticker) ||
      m.currency !== "USD" ||
      m.scale !== 2 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(m.date) ||
      ["eodhd", "alpha", "twelve", "exchange"].some(
        (field) => m[field] !== undefined && m[field] !== mapping[field],
      )
    )
      throw Error("INVALID_MARKET");
    const session = sessionFor(m.date);
    if (
      b.cutoff > session.cutoff ||
      now >= session.cutoff ||
      (m.openUTC !== undefined && m.openUTC !== session.openUTC) ||
      (m.closeUTC !== undefined && m.closeUTC !== session.closeUTC)
    )
      throw Error("CALENDAR_MISMATCH");
    tickers.add(ticker);
    preparedMarkets.push({
      symbol: mapping.symbol,
      date: m.date,
      currency: m.currency,
      scale: m.scale,
      openUTC: session.openUTC,
      closeUTC: session.closeUTC,
      eodhd: mapping.eodhd,
      alpha: mapping.alpha,
      twelve: mapping.twelve,
      exchange: mapping.exchange,
    });
  }
  const delay = CONFIRMATION_MS;
  return {
    version: 1,
    id: crypto.randomUUID(),
    mode: "LIVE",
    price: 10,
    games,
    cutoff: b.cutoff,
    ready: Math.max(...preparedMarkets.map((m) => m.closeUTC)) + delay,
    sourceProfile: profile,
    calendarVersion: CALENDAR_VERSION,
    preparedAt: now,
    sources:
      profile === "PUBLIC-NOKEY-v1"
        ? ["YahooFinance", "Nasdaq"]
        : ["EODHD", "AlphaVantage", "TwelveData"],
    quorum: 2,
    conflict: "any-valid-disagreement-waits",
    confirmationDelayMs: delay,
    markets: preparedMarkets,
    payout: [50, 30, 20],
    missing: "wait",
    calendar: "pinned-NYSE-Nasdaq-2026-calendar",
  };
}
export async function collectAndSettle(
  env,
  round,
  fetcher = fetch,
  now = Date.now(),
) {
  if (round.status === "settled" && round.proof) return JSON.parse(round.proof);
  const m = JSON.parse(round.manifest);
  if (hash(round.manifest) !== round.commitment)
    throw Error("COMMITMENT_MISMATCH");
  assertLockedRound(round, now, { forCollection: true });
  let data;
  if (m.sourceProfile === "PUBLIC-NOKEY-v1") {
    if (m.sources.join(",") !== "YahooFinance,Nasdaq" || m.quorum !== 2)
      throw Error("INVALID_SOURCE_PROFILE");
    const archives = [],
      prices = [];
    for (const p of m.markets) {
      const r = await publicConsensus(
        p.symbol.split(":")[1],
        p.date,
        fetcher,
        now,
      );
      if (!r.ok) throw Error(r.reason);
      prices.push({
        symbol: p.symbol,
        date: p.date,
        currency: p.currency,
        scale: p.scale,
        close: r.closeMinorUnits,
      });
      archives.push({
        symbol: p.symbol,
        sources: r.observations.map((o) => ({
          ...o,
          close: o.closeMinorUnits,
        })),
        failures: r.unavailable,
      });
    }
    data = {
      prices,
      archives,
      note: "Yahoo Finance close (split-adjusted historical series, not adjclose) and Nasdaq Close/Last must agree exactly at declared precision; dated snapshots after the confirmation window. Not exchange-signed finality.",
    };
  } else data = await collectMarketData(m, env, fetcher);
  const observedAt = new Date(now).toISOString();
  for (const archive of data.archives)
    for (const source of archive.sources)
      await env.EVIDENCE.put(
        `raw/${round.id}/${archive.symbol}/${source.provider}/${source.sha256}.json`,
        source.raw,
      );
  const sources = data.archives.map((a) => ({
    symbol: a.symbol,
    sources: a.sources.map(({ raw, ...rest }) => rest),
    failures: a.failures || [],
  }));
  return settle(
    env,
    round,
    data.prices,
    {
      observedAt,
      execution:
        env.INSTALLATION_KIND === "ONLINE_REPLAY"
          ? "ONLINE_REPLAY_SIMULATED_CLOCK"
          : "LIVE_REAL_CLOCK",
      sources,
      dataNote: data.note,
    },
    now,
  );
}

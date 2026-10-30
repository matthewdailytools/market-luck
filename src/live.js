import { games, hash } from "./engine.js";
import { collectMarketData } from "./market-data.js";
import { settle } from "./settle.js";
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
  const symbols = new Set();
  for (const m of b.markets) {
    if (
      !/^(XNAS|XNYS):[A-Z.]{1,10}$/.test(m.symbol) ||
      symbols.has(m.symbol) ||
      m.currency !== "USD" ||
      m.scale !== 2 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(m.date) ||
      !Number.isSafeInteger(m.openUTC) ||
      !Number.isSafeInteger(m.closeUTC) ||
      m.openUTC <= b.cutoff ||
      m.closeUTC <= m.openUTC ||
      !["NASDAQ", "NYSE"].includes(m.exchange) ||
      m.alpha !== m.twelve ||
      m.eodhd !== m.alpha + ".US" ||
      m.symbol.split(":")[1] !== m.alpha ||
      m.exchange !== (m.symbol.startsWith("XNAS:") ? "NASDAQ" : "NYSE") ||
      new Date(m.openUTC).toISOString().slice(0, 10) !== m.date ||
      new Date(m.closeUTC).toISOString().slice(0, 10) !== m.date
    )
      throw Error("INVALID_MARKET");
    symbols.add(m.symbol);
  }
  const delay = 86400000;
  return {
    version: 1,
    id: crypto.randomUUID(),
    mode: "LIVE",
    price: 10,
    games,
    cutoff: b.cutoff,
    ready: Math.max(...b.markets.map((m) => m.closeUTC)) + delay,
    sources: ["EODHD", "AlphaVantage", "TwelveData"],
    quorum: 2,
    conflict: "any-valid-disagreement-waits",
    confirmationDelayMs: delay,
    markets: b.markets.map((m) => ({
      symbol: m.symbol,
      date: m.date,
      currency: m.currency,
      scale: m.scale,
      openUTC: m.openUTC,
      closeUTC: m.closeUTC,
      eodhd: m.eodhd,
      alpha: m.alpha,
      twelve: m.twelve,
      exchange: m.exchange,
    })),
    payout: [50, 30, 20],
    missing: "wait",
    calendar: "operator-reviewed-exchange-calendar",
  };
}
export async function collectAndSettle(env, round, fetcher = fetch) {
  if (round.status === "settled" && round.proof) return JSON.parse(round.proof);
  const m = JSON.parse(round.manifest);
  if (hash(round.manifest) !== round.commitment)
    throw Error("COMMITMENT_MISMATCH");
  const data = await collectMarketData(m, env, fetcher);
  const observedAt = new Date().toISOString();
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
  return settle(env, round, data.prices, {
    observedAt,
    sources,
    dataNote: data.note,
  });
}

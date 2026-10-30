import { hash } from "./engine.js";
import { decimalUnits } from "./market-data.js";
const tradingDate = (timestamp, timeZone = "America/New_York") => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type).value)
    .join("-");
};
export function yahooMinorUnits(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw Error("INVALID_PRICE");
  const cents = Math.round(value * 100),
    recovered = cents / 100;
  // Yahoo chart prices often contain float32 artifacts. Accept only the same float32 value,
  // within 0.0001 USD of an exact cent; never silently round a genuine fractional-cent quote.
  if (
    !Number.isSafeInteger(cents) ||
    Math.abs(value - recovered) > 0.0001 ||
    Math.fround(value) !== Math.fround(recovered)
  )
    throw Error("PRECISION_MISMATCH");
  return cents;
}
async function read(url, fetcher) {
  const res = await fetcher(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent": "Market-Luck-research/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw Error("HTTP_" + res.status);
  const raw = await res.text();
  if (raw.length > 2000000) throw Error("RESPONSE_TOO_LARGE");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error("INVALID_JSON");
  }
  return { data, raw };
}
export async function publicConsensus(
  symbol,
  date,
  fetcher = fetch,
  now = Date.now(),
) {
  if (
    !["AAPL", "MSFT", "IBM"].includes(symbol) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error("INVALID_MARKET");
  if (date >= tradingDate(now)) throw Error("HISTORICAL_DATE_REQUIRED");
  const start = Math.floor(Date.parse(date + "T00:00:00Z") / 1000),
    observations = [],
    unavailable = [];
  const providers = [
    {
      name: "YahooFinance",
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${start}&period2=${start + 86400}&interval=1d`,
      parse(d) {
        const r = d.chart?.result?.[0];
        if (
          !r ||
          d.chart.error ||
          r.meta?.symbol !== symbol ||
          r.meta.currency !== "USD" ||
          r.meta.exchangeTimezoneName !== "America/New_York"
        )
          throw Error("SYMBOL_MISMATCH");
        const matches = (r.timestamp || [])
          .map((t, i) => ({
            date: tradingDate(t * 1000),
            close: r.indicators?.quote?.[0]?.close?.[i],
          }))
          .filter((p) => p.date === date);
        if (matches.length !== 1) throw Error("DATE_MISSING");
        return yahooMinorUnits(matches[0].close);
      },
    },
    {
      name: "Nasdaq",
      url: `https://api.nasdaq.com/api/quote/${symbol}/historical?assetclass=stocks&fromdate=${new Date((start - 86400) * 1000).toISOString().slice(0, 10)}&todate=${date}&limit=10`,
      parse(d) {
        if (d.status?.rCode !== 200 || d.data?.symbol !== symbol)
          throw Error("PROVIDER_ERROR");
        const dateUS =
          date.slice(5, 7) + "/" + date.slice(8, 10) + "/" + date.slice(0, 4);
        const matches =
          d.data.tradesTable?.rows?.filter((r) => r.date === dateUS) || [];
        if (matches.length !== 1) throw Error("DATE_MISSING");
        if (!/^\$[\d,]+\.\d{2}$/.test(matches[0].close))
          throw Error("PRICE_FORMAT");
        return decimalUnits(matches[0].close.replace(/[$,]/g, ""), 2);
      },
    },
  ];
  for (const p of providers) {
    try {
      const { data, raw } = await read(p.url, fetcher);
      observations.push({
        provider: p.name,
        closeMinorUnits: p.parse(data),
        sha256: hash(raw),
        raw,
      });
    } catch (e) {
      unavailable.push({
        provider: p.name,
        reason:
          /^(HTTP_\d{3}|INVALID_JSON|SYMBOL_MISMATCH|DATE_MISSING|INVALID_PRICE|PRECISION_MISMATCH|PROVIDER_ERROR|PRICE_FORMAT|RESPONSE_TOO_LARGE)$/.test(
            e.message,
          )
            ? e.message
            : "UNAVAILABLE",
      });
    }
  }
  const ok =
    observations.length === 2 &&
    observations[0].closeMinorUnits === observations[1].closeMinorUnits;
  return {
    ok,
    profile: "PUBLIC-NOKEY-RESEARCH-v1",
    purpose:
      "Historical source diagnostics only; not an authorized LIVE draw source profile",
    symbol,
    date,
    currency: "USD",
    scale: 2,
    closeMinorUnits: ok ? observations[0].closeMinorUnits : null,
    reason: ok
      ? null
      : observations.length < 2
        ? "QUORUM_NOT_REACHED"
        : "SOURCE_CONFLICT",
    observedAt: new Date(now).toISOString(),
    observations,
    unavailable,
  };
}

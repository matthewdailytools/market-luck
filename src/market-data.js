import { hash } from "./engine.js";
export function decimalUnits(value, scale) {
  const s = String(value);
  if (!/^\d+(\.\d+)?$/.test(s)) throw Error("INVALID_PRICE");
  const [a, b = ""] = s.split(".");
  if (b.slice(scale).replace(/0/g, "") !== "")
    throw Error("PRECISION_MISMATCH");
  const n = Number(a + b.slice(0, scale).padEnd(scale, "0"));
  if (!Number.isSafeInteger(n) || n <= 0) throw Error("INVALID_PRICE");
  return n;
}
async function read(url, fetcher) {
  const res = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Error("PROVIDER_HTTP_ERROR");
  const raw = await res.text();
  if (raw.length > 2000000) throw Error("PROVIDER_RESPONSE_TOO_LARGE");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error("PROVIDER_INVALID_JSON");
  }
  return { data, raw };
}
export async function fetchConsensus(m, env, fetcher = fetch) {
  if (!env.EODHD_API_KEY || !env.ALPHA_VANTAGE_API_KEY)
    throw Error("MISSING_PROVIDER_KEYS");
  const a = new URL(`https://eodhd.com/api/eod/${encodeURIComponent(m.eodhd)}`);
  a.search = new URLSearchParams({
    api_token: env.EODHD_API_KEY,
    fmt: "json",
    from: m.date,
    to: m.date,
    period: "d",
    order: "a",
  });
  const b = new URL("https://www.alphavantage.co/query");
  b.search = new URLSearchParams({
    function: "TIME_SERIES_DAILY",
    symbol: m.alpha,
    apikey: env.ALPHA_VANTAGE_API_KEY,
    outputsize: "compact",
  });
  const [e, v] = await Promise.all([read(a, fetcher), read(b, fetcher)]);
  if (
    !Array.isArray(e.data) ||
    e.data.length !== 1 ||
    e.data[0].date !== m.date
  )
    throw Error("EOD_DATE_MISSING");
  if (v.data["Meta Data"]?.["2. Symbol"] !== m.alpha)
    throw Error("SYMBOL_MISMATCH");
  const av = v.data["Time Series (Daily)"]?.[m.date]?.["4. close"];
  if (av === undefined) throw Error("ALPHA_DATE_MISSING");
  const x = decimalUnits(e.data[0].close, m.scale),
    y = decimalUnits(av, m.scale);
  if (x !== y) throw Error("SOURCE_CONFLICT");
  return {
    price: {
      symbol: m.symbol,
      date: m.date,
      currency: m.currency,
      scale: m.scale,
      close: x,
    },
    sources: [
      { provider: "EODHD", raw: e.raw, sha256: hash(e.raw) },
      { provider: "AlphaVantage", raw: v.raw, sha256: hash(v.raw) },
    ],
  };
}
export async function collectMarketData(
  manifest,
  env,
  fetcher = fetch,
  now = Date.now(),
) {
  if (
    manifest.mode !== "LIVE" ||
    manifest.sources?.join(",") !== "EODHD,AlphaVantage,TwelveData" ||
    manifest.quorum !== 2 ||
    !Number.isFinite(manifest.confirmationDelayMs) ||
    manifest.confirmationDelayMs < 86400000
  )
    throw Error("INVALID_LIVE_MANIFEST");
  if (
    now < manifest.ready ||
    manifest.markets.some(
      (m) => now < m.closeUTC + manifest.confirmationDelayMs,
    )
  )
    throw Error("MARKETS_NOT_FINAL");
  const rows = [];
  for (const m of manifest.markets)
    rows.push(await freeConsensus(m, env, fetcher));
  return {
    prices: rows.map((r) => r.price),
    archives: rows.map((r, i) => ({
      symbol: manifest.markets[i].symbol,
      sources: r.sources,
      failures: r.failures,
    })),
    note: "至少两源一致且无有效分歧的日线快照；供应商后续仍可能修订，不等同交易所签名终局数据",
  };
}
export async function freeConsensus(m, env, fetcher = fetch) {
  const observations = [],
    failures = [];
  const providers = [
    [
      "EODHD",
      env.EODHD_API_KEY,
      () => {
        const u = new URL(
          `https://eodhd.com/api/eod/${encodeURIComponent(m.eodhd)}`,
        );
        u.search = new URLSearchParams({
          api_token: env.EODHD_API_KEY,
          fmt: "json",
          from: m.date,
          to: m.date,
          period: "d",
        });
        return u;
      },
      (d) => {
        if (!Array.isArray(d) || d.length !== 1 || d[0].date !== m.date)
          throw Error("DATE_MISSING");
        return d[0].close;
      },
    ],
    [
      "AlphaVantage",
      env.ALPHA_VANTAGE_API_KEY,
      () => {
        const u = new URL("https://www.alphavantage.co/query");
        u.search = new URLSearchParams({
          function: "TIME_SERIES_DAILY",
          symbol: m.alpha,
          apikey: env.ALPHA_VANTAGE_API_KEY,
          outputsize: "compact",
        });
        return u;
      },
      (d) => {
        if (d["Meta Data"]?.["2. Symbol"] !== m.alpha)
          throw Error("SYMBOL_MISMATCH");
        const v = d["Time Series (Daily)"]?.[m.date]?.["4. close"];
        if (v === undefined) throw Error("DATE_MISSING");
        return v;
      },
    ],
    [
      "TwelveData",
      env.TWELVE_DATA_API_KEY,
      () => {
        const u = new URL("https://api.twelvedata.com/time_series");
        u.search = new URLSearchParams({
          symbol: m.twelve,
          exchange: m.exchange,
          interval: "1day",
          start_date: m.date,
          end_date: m.date,
          adjust: "none",
          apikey: env.TWELVE_DATA_API_KEY,
        });
        return u;
      },
      (d) => {
        if (
          d.meta?.symbol !== m.twelve ||
          d.meta?.currency !== m.currency ||
          d.meta?.exchange !== m.exchange
        )
          throw Error("SYMBOL_MISMATCH");
        if (d.values?.length !== 1 || d.values[0].datetime !== m.date)
          throw Error("DATE_MISSING");
        return d.values[0].close;
      },
    ],
  ];
  for (const [provider, key, url, extract] of providers) {
    try {
      if (!key) throw Error("MISSING_KEY");
      const { data, raw } = await read(url(), fetcher);
      observations.push({
        provider,
        close: decimalUnits(extract(data), m.scale),
        raw,
        sha256: hash(raw),
      });
    } catch (err) {
      failures.push({
        provider,
        reason: [
          "MISSING_KEY",
          "DATE_MISSING",
          "SYMBOL_MISMATCH",
          "PRECISION_MISMATCH",
          "INVALID_PRICE",
          "PROVIDER_HTTP_ERROR",
          "PROVIDER_INVALID_JSON",
          "PROVIDER_RESPONSE_TOO_LARGE",
        ].includes(err.message)
          ? err.message
          : "PROVIDER_UNAVAILABLE",
      });
    }
  }
  if (observations.length < 2) {
    const error = Error("QUORUM_NOT_REACHED");
    error.observations = observations;
    error.failures = failures;
    throw error;
  }
  if (new Set(observations.map((o) => o.close)).size !== 1) {
    const error = Error("SOURCE_CONFLICT");
    error.observations = observations;
    error.failures = failures;
    throw error;
  }
  return {
    price: {
      symbol: m.symbol,
      date: m.date,
      currency: m.currency,
      scale: m.scale,
      close: observations[0].close,
    },
    sources: observations,
    failures,
  };
}

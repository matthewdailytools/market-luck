import { readFile } from "node:fs/promises";
import { freeConsensus } from "../src/market-data.js";
const [date, symbol = "AAPL"] = process.argv.slice(2);
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(date || "") ||
  !/^\w{1,10}$/.test(symbol) ||
  Number.isNaN(Date.parse(date))
) {
  console.error(
    "Usage: node scripts/check-market-sources.js YYYY-MM-DD [AAPL|MSFT|IBM]",
  );
  process.exit(2);
}
if (!["AAPL", "MSFT", "IBM"].includes(symbol)) {
  console.error("Initial verified mapping supports AAPL, MSFT and IBM only.");
  process.exit(2);
}
const env = { ...process.env };
try {
  const raw = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
for (const key of [
  "EODHD_API_KEY",
  "ALPHA_VANTAGE_API_KEY",
  "TWELVE_DATA_API_KEY",
])
  if (env[key]?.startsWith("replace-")) delete env[key];
const market = {
  symbol: (symbol === "IBM" ? "XNYS:" : "XNAS:") + symbol,
  date,
  currency: "USD",
  scale: 2,
  eodhd: symbol + ".US",
  alpha: symbol,
  twelve: symbol,
  exchange: symbol === "IBM" ? "NYSE" : "NASDAQ",
};
const safe = (rows) =>
  rows?.map(({ provider, close, sha256 }) => ({
    provider,
    closeMinorUnits: close,
    sha256,
  }));
try {
  const r = await freeConsensus(market, env);
  console.log(
    JSON.stringify(
      {
        ok: true,
        symbol: market.symbol,
        date,
        closeMinorUnits: r.price.close,
        scale: 2,
        currency: "USD",
        sources: safe(r.sources),
        unavailable: r.failures,
        note: "Credentials and raw response contents are not printed. This check does not activate live draws.",
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        reason: err.message,
        symbol: market.symbol,
        date,
        observations: safe(err.observations),
        unavailable: err.failures,
        note: "No draw. Fix keys, date, entitlement or conflicting prices; do not round or override.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

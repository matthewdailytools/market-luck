import { publicConsensus } from "../src/public-market-data.js";
import { mkdir, writeFile } from "node:fs/promises";
const [date, symbol = "AAPL"] = process.argv.slice(2);
if (!date) {
  console.error(
    "Usage: node scripts/check-public-sources.js YYYY-MM-DD [AAPL|MSFT|IBM]",
  );
  process.exit(2);
}
try {
  const report = await publicConsensus(symbol, date);
  await mkdir("test-output", { recursive: true });
  const safe = {
    ...report,
    observations: report.observations.map(({ raw, ...o }) => o),
  };
  await writeFile(
    `test-output/public-sources-${symbol}-${date}.json`,
    JSON.stringify(safe, null, 2),
  );
  for (const o of report.observations)
    await writeFile(
      `test-output/${o.provider}-${symbol}-${date}-${o.sha256}.json`,
      o.raw,
    );
  console.log(JSON.stringify(safe, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (e) {
  console.error(JSON.stringify({ ok: false, reason: e.message }));
  process.exitCode = 1;
}

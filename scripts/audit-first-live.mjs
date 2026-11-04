// Owner-side, read-only acceptance of the one originally sold v1 round.
// Inputs in test-output are private exports. Only aggregate results are emitted.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { verifyProof } from "../public/proof-verifier.js";

const id = "1c6cb4c0-f039-4f23-a290-c303d509562a";
const commitment =
  "12e6fae3c838a77ea1b1ee6630b4f5704c200f817c5a011ed9666959886b18e1";
const pinned =
  "https://raw.githubusercontent.com/matthewdailytools/market-luck/2e4fff6e4c28bdaa6e0df0a0e56efecfda26ebd1/commitments/" +
  id +
  ".json";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const json = async (p) => {
  try {
    return JSON.parse((await readFile(p, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    throw Error("Invalid or unavailable audit input: " + p);
  }
};
const checks = [];
const check = (ok, label) => {
  assert(ok, label);
  checks.push(label);
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const beijing = (t) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  }).format(new Date(t));
const db = await json("test-output/natural-private-ledger.json");
check(
  Array.isArray(db) && db.length === 14 && db.every((r) => r.success),
  "Complete D1 read returned 14 successful result sets",
);
const rows = db.map((r) => r.results),
  [
    start,
    roundRows,
    anchors,
    tickets,
    ledger,
    locks,
    payments,
    users,
    pools,
    attempts,
    roundHeaders,
    testClocks,
    counts,
    end,
  ] = rows;
const config = await json("wrangler.live.jsonc"),
  account = await json("test-output/natural-cloudflare-account.json");
const dbInfo = await readFile("test-output/natural-d1-info.txt", "utf8");
check(
  config.name === "market-luck-live" &&
    config.vars.INSTALLATION_KIND === "LIVE" &&
    config.vars.DEMO_MODE === "false" &&
    config.d1_databases[0].database_name === "market-luck-live" &&
    config.r2_buckets[0].bucket_name === "market-luck-live-evidence",
  "Worker, D1 and R2 configuration is the isolated LIVE installation",
);
check(
  account.loggedIn &&
    [].concat(account.accounts).some((a) => a.id === config.account_id) &&
    dbInfo.includes(config.d1_databases[0].database_id) &&
    dbInfo.includes("market-luck-live"),
  "Authenticated account membership and remote D1 identity match the LIVE config",
);
check(testClocks.length === 0, "LIVE has no test_clock table");
check(
  counts[0].users === users.length &&
    counts[0].ledger === ledger.length &&
    counts[0].tickets === tickets.length &&
    counts[0].payments === payments.length,
  "Full users, ledger, target tickets and authorized payment counts match COUNT(*)",
);
check(
  start[0].ledgerHead === end[0].ledgerHead &&
    end[0].ledgerHead === ledger.at(-1).id,
  "Ledger head remained unchanged during the full snapshot",
);
check(
  roundRows.length === 1 &&
    roundRows[0].id === id &&
    roundRows[0].status === "settled",
  "Expected target round is settled",
);
const round = roundRows[0],
  m = JSON.parse(round.manifest),
  proof = JSON.parse(round.proof),
  original = await readFile("test-output/natural-original-manifest.json");
const publicProof = await json("test-output/natural-public-proof.json"),
  r2Proof = await json("test-output/natural-r2-proof.json");
check(
  hash(original) === commitment &&
    hash(round.manifest) === commitment &&
    original.equals(Buffer.from(round.manifest)) &&
    hash(JSON.stringify(m)) === commitment,
  "Pinned GitHub manifest raw bytes exactly match D1 and original commitment",
);
check(
  round.commitment === commitment &&
    equal(m, proof.manifest) &&
    equal(proof, r2Proof) &&
    equal(proof, publicProof),
  "D1, direct remote R2 and public proof API contain the same proof",
);
check(
  proof.version === 1 &&
    m.version === 1 &&
    proof.mode === "LIVE" &&
    proof.execution === "LIVE_REAL_CLOCK",
  "Proof is natural LIVE_REAL_CLOCK under the original v1 algorithm",
);
check(
  round.cutoff === m.cutoff &&
    round.ready === m.ready &&
    m.cutoff === Date.parse("2026-11-02T08:30:00Z") &&
    m.ready === Date.parse("2026-11-03T21:00:00Z"),
  "Immutable D1 timing columns equal the original manifest and agreed UTC boundaries",
);
check(
  m.markets.length === 3 &&
    m.markets.every(
      (p) =>
        p.date === "2026-11-02" &&
        p.currency === "USD" &&
        p.scale === 2 &&
        p.openUTC === Date.parse("2026-11-02T14:30:00Z") &&
        p.closeUTC === Date.parse("2026-11-02T21:00:00Z"),
    ),
  "All markets retain Nov 2 trading date, USD cents and original EST session",
);
check(
  m.sourceProfile === "PUBLIC-NOKEY-v1" &&
    equal(m.sources, ["YahooFinance", "Nasdaq"]) &&
    m.quorum === 2 &&
    m.confirmationDelayMs === 86400000 &&
    equal(m.payout, [50, 30, 20]),
  "Original sources, 2/2 quorum, 24-hour confirmation and payout percentages are unchanged",
);
check(
  anchors.length === 1 &&
    anchors[0].url === pinned &&
    anchors[0].verified_hash === commitment &&
    m.preparedAt <= anchors[0].published &&
    anchors[0].published <= m.cutoff &&
    anchors[0].verified_at <= m.cutoff,
  "Verified fixed-commit publication is recorded before the sales cutoff",
);
const observed = Date.parse(proof.observedAt),
  success = attempts.filter((a) => a.ok === 1);
check(
  observed >= m.ready &&
    observed <= end[0].databaseNow &&
    success.length >= 1 &&
    success.every((a) => a.attempted >= observed && a.attempted >= m.ready),
  "Natural collection and all successful attempts occurred after ready using the real database clock",
);
const firstSuccess = Math.min(...success.map((a) => a.attempted));
const input = JSON.parse(proof.input);
check(
  input.prices.length === 3 &&
    equal(
      input.prices.map((p) => p.symbol),
      ["XNAS:AAPL", "XNAS:MSFT", "XNYS:IBM"],
    ),
  "Canonical input has exactly the pinned three symbols in fixed order",
);
const rawIndex = await json("test-output/natural-r2-index.json"),
  sourceEvidence = [];
const dateNY = (ms) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
for (const price of input.prices) {
  check(
    price.date === "2026-11-02" &&
      price.currency === "USD" &&
      price.scale === 2 &&
      Number.isSafeInteger(price.close) &&
      price.close > 0,
    "Canonical price fields are the pinned date, currency and integer precision: " +
      price.symbol,
  );
  const archive = proof.sources.find((s) => s.symbol === price.symbol);
  check(
    archive?.sources.length === 2 &&
      equal(archive.sources.map((s) => s.provider).sort(), [
        "Nasdaq",
        "YahooFinance",
      ]),
    "Exactly both pinned providers are archived: " + price.symbol,
  );
  for (const source of archive.sources) {
    const item = rawIndex.find(
      (x) => x.symbol === price.symbol && x.provider === source.provider,
    );
    check(
      item &&
        item.key ===
          `raw/${id}/${price.symbol}/${source.provider}/${source.sha256}.json`,
      "Raw object key matches proof source: " +
        price.symbol +
        "/" +
        source.provider,
    );
    const bytes = await readFile(item.file);
    check(
      hash(bytes) === source.sha256 &&
        source.close === price.close &&
        source.closeMinorUnits === price.close,
      "Remote R2 raw-response SHA-256 and recorded cents match proof: " +
        price.symbol +
        "/" +
        source.provider,
    );
    const raw = JSON.parse(bytes),
      ticker = price.symbol.split(":")[1];
    let cents, rawValue;
    if (source.provider === "YahooFinance") {
      const r = raw.chart?.result?.[0];
      check(
        r &&
          raw.chart.error === null &&
          r.meta.symbol === ticker &&
          r.meta.currency === "USD" &&
          r.meta.exchangeTimezoneName === "America/New_York",
        "Yahoo symbol, explicit USD and exchange timezone match: " + ticker,
      );
      const matches = (r.timestamp || [])
        .map((t, i) => ({
          date: dateNY(t * 1000),
          value: r.indicators?.quote?.[0]?.close?.[i],
        }))
        .filter((p) => p.date === "2026-11-02");
      check(
        matches.length === 1 && typeof matches[0].value === "number",
        "Yahoo has one dated quote.close, not adjclose: " + ticker,
      );
      rawValue = matches[0].value;
      cents = Math.round(rawValue * 100);
      check(
        Math.abs(rawValue - cents / 100) <= 0.0001 &&
          Math.fround(rawValue) === Math.fround(cents / 100),
        "Yahoo float32 recovery stays within the committed cent rule: " +
          ticker,
      );
    } else {
      check(
        raw.status?.rCode === 200 && raw.data?.symbol === ticker,
        "Nasdaq successful US-stock symbol response matches: " + ticker,
      );
      const matches =
        raw.data.tradesTable?.rows?.filter((r) => r.date === "11/02/2026") ||
        [];
      check(
        matches.length === 1 && /^\$[\d,]+\.\d{2}$/.test(matches[0].close),
        "Nasdaq has one Nov 2 Close/Last with exactly two decimals: " + ticker,
      );
      rawValue = matches[0].close;
      const [whole, fraction] = rawValue.replace(/[$,]/g, "").split(".");
      cents = Number(whole) * 100 + Number(fraction);
    }
    check(
      cents === price.close,
      "Independent archived-response parsing reaches the same cents: " +
        price.symbol +
        "/" +
        source.provider,
    );
    sourceEvidence.push({
      symbol: price.symbol,
      provider: source.provider,
      date: price.date,
      currency: "USD",
      scale: 2,
      closeMinorUnits: cents,
      sha256: source.sha256,
      bytes: bytes.length,
      rawValue,
    });
  }
}
const withoutKey = { ...proof };
delete withoutKey.evidenceKey;
check(
  proof.evidenceKey === `${id}/${hash(JSON.stringify(withoutKey))}.json`,
  "R2 proof is stored under the correct content-addressed evidence key",
);
const cryptoCheck = spawnSync(
  process.execPath,
  ["scripts/verify-proof.js", "test-output/natural-r2-proof.json"],
  { encoding: "utf8" },
);
check(
  cryptoCheck.status === 0 &&
    cryptoCheck.stdout.includes("VERIFIED") &&
    cryptoCheck.stdout.includes("LIVE_REAL_CLOCK"),
  "Independent Node crypto CLI reproduced canonical bytes, MD5, SHA-256 and all 16 game results",
);
const publicCheck = await verifyProof(proof, {
  roundId: id,
  manifest: m,
  commitment,
});
check(publicCheck.ok, "Shared public verifier also accepts the natural proof");
const ranks = [0, 0, 0, 0],
  graded = [],
  games = Object.fromEntries(m.games.map((g) => [g.id, g]));
check(
  new Set(tickets.map((t) => t.id)).size === tickets.length &&
    new Set(payments.map((p) => p.ticket_id)).size === tickets.length &&
    locks.length === 1 &&
    locks[0].round_id === id,
  "Unique ticket/payment sets and exactly one settlement lock cover the target",
);
for (const t of tickets) {
  const game = games[t.game],
    main = JSON.parse(t.numbers),
    result = proof.results[t.game];
  check(
    game &&
      t.round_id === id &&
      t.created >= anchors[0].verified_at &&
      t.created < m.cutoff &&
      main.length === game.count &&
      new Set(main).size === main.length &&
      main.every((n) => Number.isInteger(n) && n >= 1 && n <= game.max),
    "Private ticket terms and sales timestamp are valid",
  );
  check(
    game.bonus
      ? Number.isInteger(t.bonus) &&
          t.bonus >= (game.bonusMin ?? 1) &&
          t.bonus < (game.bonusMin ?? 1) + game.bonus
      : t.bonus === null,
    "Private ticket special-number bounds are valid",
  );
  const resultSet = new Set(result.main),
    hits = main.reduce((n, x) => n + Number(resultSet.has(x)), 0),
    special = result.bonus === null || t.bonus === result.bonus;
  const rank =
    hits === game.count && special
      ? 1
      : hits === game.count - 1 && special
        ? 2
        : hits >= (game.minMatch ?? 3) || (result.bonus !== null && special)
          ? 3
          : 0;
  ranks[rank]++;
  graded.push({ ticket: t, rank });
}
const perWinner = m.payout.map((percent, i) =>
  ranks[i + 1]
    ? Math.floor(Math.floor((proof.poolBefore * percent) / 100) / ranks[i + 1])
    : 0,
);
const expectedPrizes = [];
let totalPayout = 0;
for (const { ticket: t, rank } of graded) {
  const prize = rank ? perWinner[rank - 1] : 0,
    payment = payments.find((p) => p.ticket_id === t.id);
  check(
    t.tier === rank &&
      t.prize === prize &&
      payment.round_id === id &&
      payment.tier === rank &&
      payment.prize === prize,
    "Every stored ticket grade and authorization equals independent recomputation",
  );
  totalPayout += prize;
  if (prize > 0) expectedPrizes.push(`${t.user_id}|${prize}`);
}
const targetLedger = ledger.filter((l) => l.round_id === id),
  prizeLedger = targetLedger.filter((l) => l.kind === "prize");
check(
  equal(
    expectedPrizes.sort(),
    prizeLedger.map((l) => `${l.user_id}|${l.delta}`).sort(),
  ),
  "Actual positive prize ledger multiset matches expected payments without missing or duplicate payouts",
);
const ticketBuys = tickets
    .map((t) => `${t.user_id}|${t.created}|${-m.price}`)
    .sort(),
  actualBuys = targetLedger
    .filter((l) => l.kind === "purchase")
    .map((l) => `${l.user_id}|${l.created}|${l.delta}`)
    .sort();
check(
  equal(ticketBuys, actualBuys),
  "Every target ticket has one matching purchase ledger transfer",
);
check(
  proof.payout === totalPayout &&
    proof.poolAfter === proof.poolBefore - totalPayout &&
    proof.poolBefore >= 0 &&
    proof.poolAfter >= 0,
  "Proof payout and before/after pool arithmetic equal actual recomputed awards",
);
check(
  ledger.every(
    (l) =>
      ["seed", "signup", "purchase", "prize"].includes(l.kind) &&
      Number.isSafeInteger(l.delta),
  ) && new Set(ledger.map((l) => l.id)).size === ledger.length,
  "Full global ledger has only supported issuance/transfer kinds and unique row IDs",
);
const seeds = ledger.filter((l) => l.kind === "seed"),
  signups = ledger.filter((l) => l.kind === "signup");
check(
  seeds.length === 1 &&
    seeds[0].delta === 100000 &&
    signups.length === users.length &&
    signups.every((l) => l.delta === 1000),
  "Global initial injection and one 1000-point registration issuance per user match the declared model",
);
check(
  users.every(
    (u) =>
      Number.isSafeInteger(u.balance) &&
      u.balance >= 0 &&
      ledger
        .filter((l) => l.user_id === u.id)
        .reduce((n, l) => n + l.delta, 0) === u.balance &&
      signups.filter((l) => l.user_id === u.id).length === 1,
  ),
  "Every full user balance reconciles to issuance and transfers and is nonnegative",
);
check(
  ledger.every(
    (l) => l.kind === "seed" || users.some((u) => u.id === l.user_id),
  ),
  "No non-seed ledger event refers to a missing user",
);
const poolDelta = (l) =>
  l.kind === "seed"
    ? l.delta
    : l.kind === "purchase" || l.kind === "prize"
      ? -l.delta
      : 0;
const ledgerPool = ledger.reduce((n, l) => n + poolDelta(l), 0),
  userTotal = users.reduce((n, u) => n + u.balance, 0),
  currentPool = pools.reduce((n, p) => n + p.balance, 0),
  issued =
    seeds.reduce((n, l) => n + l.delta, 0) +
    signups.reduce((n, l) => n + l.delta, 0);
check(
  pools.length === 1 &&
    pools[0].id === 1 &&
    currentPool === ledgerPool &&
    currentPool >= 0,
  "Current pool reconciles against the complete global pool ledger",
);
check(
  userTotal + currentPool === issued,
  "Sum of all user balances plus pool equals all issuance",
);
const beforePool = ledger
  .filter(
    (l) => !(l.round_id === id && l.kind === "prize") && l.created <= observed,
  )
  .reduce((n, l) => n + poolDelta(l), 0);
check(
  beforePool === proof.poolBefore,
  "Pre-settlement pool is independently reconstructed from the earlier global transfers",
);
const laterDelta = ledger
  .filter(
    (l) => l.created > observed && !(l.round_id === id && l.kind === "prize"),
  )
  .reduce((n, l) => n + poolDelta(l), 0);
check(
  proof.poolAfter + laterDelta === currentPool,
  "Current pool is proof.poolAfter plus subsequent unrelated pool flows",
);
const gameSummary = m.games.map((g) => ({
  game: g.id,
  name: g.name,
  tickets: graded.filter((x) => x.ticket.game === g.id).length,
  tiers: [1, 2, 3].map(
    (rank) =>
      graded.filter((x) => x.ticket.game === g.id && x.rank === rank).length,
  ),
  payout: graded
    .filter((x) => x.ticket.game === g.id)
    .reduce((n, x) => n + (x.rank ? perWinner[x.rank - 1] : 0), 0),
}));
const report = {
  status: "passed",
  round: id,
  version: 1,
  mode: proof.mode,
  execution: proof.execution,
  checkedAt: new Date().toISOString(),
  checkedAtBeijing: beijing(Date.now()),
  snapshotAtBeijing: beijing(end[0].databaseNow),
  commitment,
  publication: {
    url: pinned,
    preparedAtBeijing: beijing(m.preparedAt),
    verifiedAtBeijing: beijing(anchors[0].verified_at),
    cutoffBeijing: beijing(m.cutoff),
  },
  timing: {
    readyBeijing: beijing(m.ready),
    collectionStartedAt: proof.observedAt,
    collectionStartedBeijing: beijing(observed),
    successfulAttemptAt: firstSuccess,
    successfulAttemptBeijing: beijing(firstSuccess),
    exactDatabaseCommitTimestampAvailable: false,
  },
  sources: sourceEvidence,
  crypto: {
    independentNodeCli: "passed",
    md5: proof.md5,
    seed: proof.seed,
    gameCount: m.games.length,
    publicVerifierChecks: publicCheck.checks.length,
    r2ProofSha256: hash(await readFile("test-output/natural-r2-proof.json")),
    evidenceKey: proof.evidenceKey,
  },
  settlement: {
    tickets: tickets.length,
    locks: locks.length,
    authorizedPayments: payments.length,
    tierCounts: ranks.slice(1),
    nonWinningTickets: ranks[0],
    perWinner,
    payout: totalPayout,
    positivePrizeLedgerRecords: prizeLedger.length,
    poolBefore: proof.poolBefore,
    poolAfter: proof.poolAfter,
    gameSummary,
  },
  conservation: {
    users: users.length,
    userBalanceSum: userTotal,
    pool: currentPool,
    issued,
    total: userTotal + currentPool,
    registrationIssuance: signups.length * 1000,
    ledgerRecords: ledger.length,
    ledgerHead: end[0].ledgerHead,
    poolFromAllLedger: ledgerPool,
    subsequentPoolDelta: laterDelta,
    negativeUserBalances: users.filter((u) => u.balance < 0).length,
  },
  snapshotFingerprints: {
    tickets: hash(JSON.stringify(tickets)),
    ledger: hash(JSON.stringify(ledger)),
    users: hash(JSON.stringify(users)),
  },
  checksPassed: checks.length,
  checks,
  limitations: [
    "Source snapshots are provider data, not exchange-signed finality",
    "The v1 round has no new v3 witness/beacon requirements",
    "No standalone D1 transaction commit timestamp exists; settlement is bracketed by collection start and success record",
    "This natural round has zero winning tickets, so positive payout was not exercised naturally",
    "Private raw user/ticket exports are not published; full private-ledger checks require owner access",
  ],
};
await mkdir("docs/first-live-draw", { recursive: true });
await writeFile(
  "docs/first-live-draw/audit.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    checks: checks.length,
    tickets: tickets.length,
    tiers: ranks.slice(1),
    payout: totalPayout,
    pool: currentPool,
    userTotal,
    issued,
    sourceResponses: sourceEvidence.length,
    cryptoGameCount: m.games.length,
  }),
);

// DEMO-only API acceptance. Run explicitly; this file is not a node:test suite.
// Frontend review/confirmation behavior requires separate local/browser testing.
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  validatePurchaseDraft,
  sameDraft,
  validatePurchaseReceipt,
  findConfirmedTicket,
} from "../public/purchase-flow-model.js";

const project = new URL("../", import.meta.url);
const output = new URL("test-output/", project);
const checks = [];
const report = {
  status: "running",
  startedAt: new Date().toISOString(),
  url: null,
  scope:
    "DEMO onboarding API; frontend review is tested separately in the browser/local tests",
  modeProtection: {
    exactTestOriginOrLoopbackOnly: true,
    demoRequiredBeforeMutation: true,
    redirects: "rejected",
  },
  limits: {
    intendedUniquePurchases: 1,
    administrativeCalls: 0,
    clockAdvances: 0,
    createdRounds: 0,
  },
  ledgerScope:
    "public-global-without-user-id; own debit is corroborated by private ticket and balance",
  checks,
};
let base,
  cookie = "",
  demoConfirmed = false;

class ScenarioError extends Error {
  constructor(message, status = "failed") {
    super(message);
    this.status = status;
  }
}
function check(condition, label) {
  if (!condition) throw new ScenarioError(label);
  checks.push(label);
}
function retry(reason) {
  throw new ScenarioError(reason, "retry");
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 250));

function allowedOrigin() {
  let target;
  try {
    target = new URL(
      process.env.TEST_BASE_URL || "https://luck-test.onlinefreetools.org",
    );
  } catch {
    throw new ScenarioError("Invalid target URL; no requests sent", "blocked");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    target.hostname,
  );
  if (
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/" ||
    !(
      target.origin === "https://luck-test.onlinefreetools.org" ||
      (loopback && ["http:", "https:"].includes(target.protocol))
    )
  )
    throw new ScenarioError(
      "Target must be the exact DEMO test origin or a loopback origin; no requests sent",
      "blocked",
    );
  check(true, "Target origin is explicitly allowed");
  return target.origin;
}

async function request(path, body, expected = 200) {
  if (
    !base ||
    ![
      "/api/state",
      "/api/register",
      "/api/login",
      "/api/logout",
      "/api/buy",
    ].includes(path)
  )
    throw new ScenarioError(
      "Endpoint is outside this onboarding scenario",
      "blocked",
    );
  if (body !== undefined && !demoConfirmed)
    throw new ScenarioError(
      "A DEMO state check is required before any mutation",
      "blocked",
    );
  let response;
  try {
    response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined
          ? {}
          : { origin: base, "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    retry(
      "Network request did not complete; no automatic purchase retry was attempted",
    );
  }
  check(
    response.status < 300 || response.status >= 400,
    "Request did not redirect",
  );
  check(
    new URL(response.url).origin === base,
    "Response stayed on the allowed origin",
  );
  check(
    response.status === expected,
    `${path} returned its expected HTTP status`,
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ScenarioError("API returned invalid JSON");
  }
  return { response, data };
}

async function readState() {
  const { data } = await request("/api/state");
  if (data.demo !== true) {
    demoConfirmed = false;
    throw new ScenarioError(
      "Installation is not DEMO; further mutations are prohibited",
      "blocked",
    );
  }
  check(true, "State explicitly identifies the DEMO installation");
  demoConfirmed = true;
  check(Number.isSafeInteger(data.serverTime), "State provides a server clock");
  check(
    Number.isSafeInteger(data.pool) && data.pool >= 0,
    "Shared pool is a nonnegative integer",
  );
  check(
    Array.isArray(data.rounds) &&
      Array.isArray(data.tickets) &&
      Array.isArray(data.ledger),
    "State exposes the required bounded lists",
  );
  return data;
}

function session(response) {
  const header = response.headers.get("set-cookie") || "";
  check(
    /(?:^|;\s*)HttpOnly(?:;|$)/i.test(header),
    "Authenticated cookie is HttpOnly",
  );
  check(
    /(?:^|;\s*)SameSite=Strict(?:;|$)/i.test(header),
    "Authenticated cookie uses SameSite=Strict",
  );
  check(
    /(?:^|;\s*)Path=\/(?:;|$)/i.test(header),
    "Authenticated cookie is scoped to the root path",
  );
  if (base.startsWith("https:"))
    check(
      /(?:^|;\s*)Secure(?:;|$)/i.test(header),
      "HTTPS authenticated cookie is Secure",
    );
  const match = header.match(/(?:^|,\s*)session=([a-f0-9]{64})(?:;|$)/);
  check(
    Boolean(match),
    "Authenticated cookie contains a valid opaque session value",
  );
  cookie = `session=${match[1]}`;
}

function suitableOpen(state) {
  const round = state.rounds.find((item) => item.status === "open");
  if (
    !round ||
    round.manifest?.mode !== "DEMO" ||
    !Number.isSafeInteger(round.cutoff) ||
    round.cutoff <= state.serverTime + 60000
  )
    retry(
      "No DEMO open round has more than 60 seconds before cutoff; rerun later without creating or advancing a round",
    );
  const game = round.manifest.games?.find((item) => item.id === "uk");
  if (
    !game ||
    game.count !== 6 ||
    game.max !== 59 ||
    game.bonus !== 0 ||
    round.manifest.price !== 10
  )
    retry(
      "The current locked round does not offer the expected 10-point UK format; rerun against a suitable DEMO round",
    );
  return { round, game };
}

function settledUk(state) {
  const round = state.rounds.find(
    (item) =>
      item.status === "settled" &&
      item.manifest?.mode === "DEMO" &&
      item.manifest.games?.some(
        (game) =>
          game.id === "uk" &&
          game.count === 6 &&
          game.max === 59 &&
          game.bonus === 0,
      ),
  );
  if (!round)
    retry(
      "An existing settled DEMO UK round is needed for rejection testing; this script will not create or settle one",
    );
  return round;
}

const topLedgerId = (state) =>
  Math.max(0, ...state.ledger.map((row) => row.id));
async function stableState() {
  let previous = await readState();
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readState();
    if (
      current.pool === previous.pool &&
      topLedgerId(current) === topLedgerId(previous) &&
      current.me?.balance === previous.me?.balance &&
      JSON.stringify(current.tickets) === JSON.stringify(previous.tickets)
    )
      return current;
    previous = current;
    await pause();
  }
  retry(
    "Concurrent DEMO updates prevented a stable state observation; rerun without changing any round",
  );
}

function ownAccount(state, userId, balance, label) {
  check(state.me?.id === userId, "The same test account remains authenticated");
  if (state.tickets.some((ticket) => ticket.prize > 0))
    retry(
      "The test ticket received a natural DEMO payout during onboarding; rerun for an uninterrupted purchase window",
    );
  check(state.me.balance === balance, label);
}

function verifyPoolWindow(before, after) {
  const start = topLedgerId(before);
  if (start && !after.ledger.some((row) => row.id === start))
    retry(
      "Concurrent activity exceeded the public ledger window; pool conservation cannot be established from these snapshots",
    );
  const rows = after.ledger.filter((row) => row.id > start);
  check(rows.length > 0, "A new ledger window covers the purchase");
  check(
    rows.every(
      (row) => Number.isSafeInteger(row.id) && Number.isSafeInteger(row.delta),
    ) && new Set(rows.map((row) => row.id)).size === rows.length,
    "New ledger entries have unique integer IDs and deltas",
  );
  if (!rows.every((row) => ["purchase", "prize", "seed"].includes(row.kind)))
    retry(
      "An unsupported ledger kind appeared; pool conservation requires separate inspection",
    );
  check(
    rows
      .filter((row) => row.kind === "purchase")
      .every((row) => row.delta === -10),
    "Every new public purchase ledger debit is exactly -10",
  );
  const effect = rows.reduce(
    (sum, row) => sum + (row.kind === "seed" ? row.delta : -row.delta),
    0,
  );
  check(
    after.pool - before.pool === effect,
    "Pool movement equals all visible purchase credits and prize debits, including concurrent activity",
  );
  report.pool = {
    before: before.pool,
    after: after.pool,
    movement: after.pool - before.pool,
    ledgerMovement: effect,
    publicPurchaseRows: rows.filter((row) => row.kind === "purchase").length,
    publicPrizeRows: rows.filter((row) => row.kind === "prize").length,
    directUserLedgerAvailable: false,
  };
}

async function main() {
  base = allowedOrigin();
  report.url = base;
  const ignore = await readFile(new URL(".gitignore", project), "utf8");
  check(
    /^test-output\/\s*$/m.test(ignore),
    "Credential output directory is explicitly gitignored",
  );
  const initial = await readState();
  check(
    initial.me === null,
    "The scenario starts without an authenticated account",
  );
  suitableOpen(initial);
  const closed = settledUk(initial);
  check(
    true,
    "Existing DEMO sale and settled rounds are suitable; no administrator action is needed",
  );

  const name = `onb${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
  const password = `T!${randomBytes(32).toString("base64url")}`;
  const credentials = { name, password };
  const registered = await request("/api/register", credentials);
  check(registered.data.ok === true, "Registration succeeds");
  session(registered.response);
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL("onboarding-browser-account.json", output),
    JSON.stringify({ name, password, url: base }, null, 2),
    { mode: 0o600 },
  );
  let current = await readState();
  const userId = current.me?.id;
  check(
    typeof userId === "string" && userId.length > 0,
    "Registration creates an authenticated test account",
  );
  ownAccount(
    current,
    userId,
    1000,
    "Registration grants exactly 1,000 points once",
  );
  check(current.tickets.length === 0, "The new account starts without tickets");

  const duplicate = await request("/api/register", credentials, 400);
  check(
    typeof duplicate.data.error === "string",
    "Duplicate registration is rejected",
  );
  current = await readState();
  ownAccount(
    current,
    userId,
    1000,
    "Duplicate registration does not grant more points",
  );
  const login = await request("/api/login", credentials);
  check(login.data.ok === true, "An existing account can sign in");
  session(login.response);
  current = await readState();
  ownAccount(
    current,
    userId,
    1000,
    "Signing in does not grant a second registration reward",
  );

  const before = await stableState();
  const { round, game } = suitableOpen(before);
  const picked = new Set();
  while (picked.size < game.count) picked.add(randomInt(1, game.max + 1));
  const main = [...picked].sort((a, b) => a - b);
  const draftState = validatePurchaseDraft({
    state: before,
    gameId: "uk",
    main,
    bonus: null,
    now: before.serverTime,
  });
  check(
    draftState.phase === "ready",
    "Random UK selection is eligible under the locked round and server clock",
  );
  const refreshed = await readState();
  suitableOpen(refreshed);
  const reviewed = validatePurchaseDraft({
    state: refreshed,
    gameId: "uk",
    main,
    bonus: null,
    now: refreshed.serverTime,
  });
  check(
    reviewed.canSubmit && sameDraft(draftState.draft, reviewed.draft),
    "A refreshed state preserves the exact reviewed ticket intent",
  );
  const ticket = {
    round: round.id,
    game: "uk",
    main,
    bonus: null,
    key: randomUUID(),
  };
  const bought = await request("/api/buy", ticket);
  const receipt = validatePurchaseReceipt(bought.data, reviewed.draft);
  check(Boolean(receipt), "The purchase response has a valid receipt ID");
  const replay = await request("/api/buy", ticket);
  check(
    replay.data.ok === true &&
      replay.data.replayed === true &&
      replay.data.id === receipt.id,
    "Repeating the same idempotency key returns the original ticket",
  );
  const after = await stableState();
  ownAccount(
    after,
    userId,
    990,
    "One purchase and its replay debit exactly 10 points",
  );
  check(
    after.tickets.length === 1 && after.tickets[0].request_key === ticket.key,
    "The account has one ticket and one successful purchase intent",
  );
  check(
    Boolean(findConfirmedTicket(after, receipt)),
    "The stored ticket matches owner, round, game and the reviewed numbers",
  );
  verifyPoolWindow(before, after);
  report.purchase = {
    uniqueTickets: 1,
    pointsSpent: 10,
    balanceAfter: 990,
    replayed: true,
    ownDebitCorroboratedByTicketAndBalance: true,
  };

  await request("/api/logout", {});
  const loggedOut = await readState();
  check(
    loggedOut.me === null,
    "Logout invalidates the previous authenticated cookie",
  );
  cookie = "";
  const relogin = await request("/api/login", credentials);
  check(relogin.data.ok === true, "The same test account can sign in again");
  session(relogin.response);
  current = await readState();
  ownAccount(
    current,
    userId,
    990,
    "Re-login preserves the balance without another 1,000-point reward",
  );
  check(
    current.tickets.length === 1,
    "Re-login preserves exactly one purchased ticket",
  );

  const invalid = {
    ...ticket,
    key: randomUUID(),
    main: [main[0], main[0], ...main.slice(2)],
  };
  const invalidResponse = await request("/api/buy", invalid, 400);
  check(
    typeof invalidResponse.data.error === "string",
    "Duplicate main numbers are rejected",
  );
  current = await readState();
  ownAccount(
    current,
    userId,
    990,
    "Rejected invalid numbers do not debit points",
  );
  check(
    current.tickets.length === 1,
    "Rejected invalid numbers do not create another ticket",
  );
  const closedResponse = await request(
    "/api/buy",
    { ...ticket, round: closed.id, key: randomUUID() },
    400,
  );
  check(
    typeof closedResponse.data.error === "string",
    "An already settled period rejects new purchases",
  );
  current = await readState();
  ownAccount(
    current,
    userId,
    990,
    "Rejected settled-period purchase does not debit points",
  );
  check(
    current.tickets.length === 1 &&
      Boolean(findConfirmedTicket(current, receipt)),
    "All negative cases leave only the original confirmed ticket",
  );
  report.status = "passed";
  report.finalBalance = current.me.balance;
  report.httpsCookieFlagsVerified = base.startsWith("https:");
  report.browserAccountFile =
    "test-output/onboarding-browser-account.json (gitignored; credentials omitted from this report)";
}

try {
  await main();
} catch (error) {
  report.status = error instanceof ScenarioError ? error.status : "failed";
  // Only our fixed, credential-free messages enter reports; never dump API bodies or errors.
  report.reason =
    error instanceof ScenarioError
      ? error.message
      : "Unexpected local error; inspect the script without printing credentials";
  process.exitCode =
    report.status === "retry" ? 75 : report.status === "blocked" ? 2 : 1;
}
report.finishedAt = new Date().toISOString();
report.checkCount = checks.length;
await mkdir(output, { recursive: true });
await writeFile(
  new URL("onboarding-online-report.json", output),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

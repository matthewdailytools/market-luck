// Uses an existing disposable DEMO account. No registration, ticket creation,
// clock changes, administration or settlement requests are sent.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { describeTicketHistory } from "../public/ticket-history-model.js";

const accountPath =
  process.env.TEST_ACCOUNT_FILE ||
  "test-output/onboarding-browser-account.json";
const report = {
  startedAt: new Date().toISOString(),
  status: "pending",
  domainRecordsReadOnly: true,
  mutations: ["existing test-account login", "test session logout"],
  registrations: 0,
  purchases: 0,
  administrativeCalls: 0,
  checks: [],
};
let cookie = "",
  base;
const check = (value, message) => {
  assert(value, message);
  report.checks.push(message);
};
async function request(path, body) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      ...(body ? { "content-type": "application/json", origin: base } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  check(response.status === 200, `Expected successful ${path}`);
  return { response, data: await response.json() };
}
async function main() {
  const account = JSON.parse(await readFile(accountPath, "utf8"));
  const target = new URL(account.url);
  check(
    target.origin === account.url && !target.username && !target.password,
    "Existing account has an origin-only URL",
  );
  check(
    target.origin === "https://luck-test.onlinefreetools.org" ||
      (target.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)),
    "Only the isolated DEMO or loopback is allowed",
  );
  base = target.origin;
  report.url = base;
  const anonymous = (await request("/api/state")).data;
  check(
    anonymous.demo === true,
    "Installation is explicitly DEMO before any session request",
  );
  check(
    anonymous.me === null && anonymous.tickets.length === 0,
    "Anonymous API response has no private tickets",
  );
  check(
    describeTicketHistory(anonymous).status === "anonymous",
    "Anonymous ticket view offers sign-in",
  );
  const login = await request("/api/login", {
    name: account.name,
    password: account.password,
  });
  check(
    login.data.ok === true,
    "Existing test account signs in without registration",
  );
  cookie = login.response.headers.get("set-cookie")?.split(";")[0] || "";
  check(cookie.length > 10, "Test session cookie was issued");
  const before = (await request("/api/state")).data;
  check(
    before.demo === true && typeof before.me?.id === "string",
    "Signed-in snapshot is a DEMO owner",
  );
  check(
    Array.isArray(before.tickets) &&
      before.tickets.length > 0 &&
      before.tickets.length <= 100,
    "Existing test account has a bounded purchased ticket list",
  );
  check(
    before.tickets.every((t) => t.user_id === before.me.id),
    "All private tickets belong to the authenticated owner",
  );
  const initial = describeTicketHistory(before, { now: before.serverTime });
  const extras = [];
  const ids = [...new Set(before.tickets.map((t) => t.round_id))];
  for (const id of ids) {
    check(
      /^[A-Za-z0-9-]{1,80}$/.test(id),
      "A ticket round ID is safe for an exact lookup",
    );
    const detail = (await request("/api/round/" + encodeURIComponent(id))).data;
    check(
      detail.round?.id === id,
      "Exact round lookup retains the ticket's own period",
    );
    check(
      !("me" in detail) && !("tickets" in detail) && !("user_id" in detail),
      "Public round lookup does not expose private account data",
    );
    extras.push(detail.round);
  }
  report.ticketCount = before.tickets.length;
  report.roundsLookedUp = extras.length;
  report.initialMissingRoundCount = initial.missingRoundIds.length;
  report.languages = {};
  for (const language of ["zh-CN", "en", "ja"]) {
    const view = describeTicketHistory(before, {
      language,
      rounds: extras,
      now: before.serverTime,
    });
    check(
      view.status === "ready" && view.counts.shown === before.tickets.length,
      `${language}: every owned ticket has a card model`,
    );
    check(
      view.items.every(
        (t) =>
          t.numbersValid &&
          t.id &&
          t.auditHref.endsWith(encodeURIComponent(t.roundId)),
      ),
      `${language}: original numbers and round verification links remain valid`,
    );
    check(
      view.items.every((t) => t.cost === 10 && t.costText.includes("10")),
      `${language}: committed ticket cost is shown`,
    );
    check(
      view.items.every((t) => t.mode === "DEMO"),
      `${language}: demonstration identity stays explicit`,
    );
    check(
      view.counts.invalid === 0 && view.counts.unverified === 0,
      `${language}: actual records have sufficient consistent round evidence`,
    );
    check(
      view.missingRoundIds.length === 0,
      `${language}: old-round lookups resolve all missing metadata`,
    );
    report.languages[language] = {
      counts: view.counts,
      statuses: view.items.map((t) => t.status),
      costs: view.items.map((t) => t.cost),
    };
  }
  const after = (await request("/api/state")).data;
  check(
    before.me.id === after.me.id && before.me.balance === after.me.balance,
    "Record lookup does not change the account balance",
  );
  check(
    JSON.stringify(before.tickets) === JSON.stringify(after.tickets),
    "Record lookup does not create, modify or remove a ticket",
  );
  report.balanceUnchanged = true;
  await request("/api/logout", {});
  cookie = "";
  const loggedOut = (await request("/api/state")).data;
  check(
    loggedOut.me === null && loggedOut.tickets.length === 0,
    "Logout removes private API tickets",
  );
  const loggedOutView = describeTicketHistory(
    { ...loggedOut, tickets: before.tickets },
    { rounds: extras },
  );
  check(
    loggedOutView.status === "anonymous" && loggedOutView.items.length === 0,
    "Retained stale tickets cannot reappear in an anonymous view",
  );
  report.status = "passed";
}
try {
  await main();
} catch {
  report.status = "failed";
  report.reason =
    "Ticket-history acceptance failed; inspect code and fixed checks without printing credentials or cookies.";
  process.exitCode = 1;
} finally {
  if (cookie && base) {
    try {
      await request("/api/logout", {});
    } catch {}
  }
}
report.finishedAt = new Date().toISOString();
report.checkCount = report.checks.length;
await mkdir("test-output", { recursive: true });
await writeFile(
  "test-output/ticket-history-online-report.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      url: report.url,
      checks: report.checkCount,
      ticketCount: report.ticketCount,
      languages: report.languages,
      reason: report.reason,
    },
    null,
    2,
  ),
);

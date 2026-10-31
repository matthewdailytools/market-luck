// Read-only deployment acceptance. This script sends GET requests only: it does
// not register users, buy tickets, collect prices, advance clocks or pay prizes.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyProof } from "../public/proof-verifier.js";

const target = new URL(process.env.TEST_BASE_URL || "http://127.0.0.1:8787");
assert(
  target.protocol === "https:" ||
    (target.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)),
  "Use HTTPS, or HTTP on the local development host",
);
assert(
  !target.username && !target.password && !target.search && !target.hash,
  "TEST_BASE_URL must not contain credentials or query parameters",
);
assert.equal(target.pathname, "/", "TEST_BASE_URL must identify an origin");
const base = target.origin;
let checks = 0;
const equal = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const ok = (value, message) => {
  assert(value, message);
  checks++;
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const idPath = (id) => {
  assert(
    typeof id === "string" && /^[A-Za-z0-9-]{1,80}$/.test(id),
    "Round ID has an invalid format",
  );
  return "/api/round/" + encodeURIComponent(id);
};

async function get(path, status = 200) {
  const response = await fetch(base + path, {
    method: "GET",
    credentials: "omit",
    signal: AbortSignal.timeout(20000),
  });
  equal(response.status, status, `GET ${path}: unexpected HTTP status`);
  equal(new URL(response.url).origin, base, `GET ${path}: foreign redirect`);
  return response;
}

function noPrivateFields(value) {
  const forbidden = new Set([
    "me",
    "tickets",
    "password",
    "salt",
    "sessions",
    "token",
    "user_id",
    "users",
  ]);
  const visit = (item) => {
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      assert(
        !forbidden.has(key.toLowerCase()),
        `Private field exposed: ${key}`,
      );
      visit(child);
    }
  };
  visit(value);
  checks++;
}

async function details(id) {
  const response = await get(idPath(id));
  ok(
    response.headers.get("cache-control")?.includes("no-store"),
    "Round details must not be cached",
  );
  ok(
    response.headers.get("content-type")?.includes("application/json"),
    "Round details must be JSON",
  );
  const payload = await response.json();
  equal(payload.round?.id, id, "Round endpoint returned another round");
  ok(payload.round.status !== "draft", "Draft round exposed");
  ok(Number.isSafeInteger(payload.serverTime), "Missing server clock");
  ok(typeof payload.demo === "boolean", "Missing installation mode");
  ok(
    Array.isArray(payload.attempts) && payload.attempts.length <= 10,
    "Attempts must be a bounded list for this round",
  );
  equal(
    payload.anchor?.round_id ?? null,
    payload.anchor ? id : null,
    "Anchor belongs to another round",
  );
  noPrivateFields(payload);
  return payload;
}

async function manifest(payload) {
  const response = await get(idPath(payload.round.id) + "/manifest");
  ok(
    response.headers.get("cache-control")?.includes("no-store"),
    "Manifest download must not be cached",
  );
  ok(
    response.headers.get("content-disposition")?.startsWith("attachment;"),
    "Manifest must retain its JSON attachment download",
  );
  equal(
    response.headers.get("x-content-type-options"),
    "nosniff",
    "Manifest download must prevent content sniffing",
  );
  ok(
    response.headers.get("content-type")?.includes("application/json"),
    "Manifest download must be JSON",
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  equal(
    digest(bytes),
    payload.round.commitment,
    "Raw manifest bytes do not match the published commitment",
  );
  equal(
    JSON.parse(bytes.toString("utf8")),
    payload.round.manifest,
    "Readable manifest differs from its original JSON",
  );
}

const page = await get("/verify.html");
const policy = page.headers.get("content-security-policy") || "";
for (const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
])
  ok(policy.includes(directive), "Missing readable-page CSP: " + directive);
equal(
  page.headers.get("x-content-type-options"),
  "nosniff",
  "Readable page must prevent content sniffing",
);
const pageText = await page.text();
ok(pageText.includes("verify.js"), "Readable page script is not loaded");
ok(pageText.includes("verify.css"), "Readable page styles are not loaded");
const homeResponse = await get("/");
const home = await homeResponse.text();
for (const id of [
  "heroPoolAmount",
  "heroPointsNote",
  "heroAuditLink",
  "recentDrawPanel",
  "worldFormats",
  "firstRun",
  "myTickets",
  "ticketHistoryLogin",
  "receiptTicketsLink",
  "purchaseReview",
  "pickerAuditLink",
])
  ok(home.includes(`id="${id}"`), "Homepage is missing " + id);
for (const asset of [
  "app.js",
  "campaigns.js",
  "round-summary.js",
  "home-highlights.js",
  "home-highlights-model.js",
  "purchase-flow.js",
  "purchase-flow-model.js",
  "ticket-history.js",
  "ticket-history-model.js",
  "state-refresh.js",
  "style.css",
  "verify.js",
  "verify.css",
  "proof-verifier.js",
  "proof-hashes.js",
]) {
  const response = await get("/" + asset);
  const deployed = await response.text();
  const local = await readFile(new URL("../public/" + asset, import.meta.url));
  equal(
    digest(Buffer.from(deployed, "utf8")),
    digest(local),
    `Deployed ${asset} differs from the local version under acceptance`,
  );
}

const stateResponse = await get("/api/state");
const state = await stateResponse.json();
ok(Array.isArray(state.rounds), "Public state must list published rounds");
ok(
  state.rounds.every((round) => round.status !== "draft"),
  "Public state exposed a draft",
);
const chosenId =
  process.env.TEST_ROUND ||
  state.rounds.find((round) => round.status === "open")?.id ||
  state.rounds.find((round) => round.status === "paused")?.id ||
  state.rounds[0]?.id;
ok(
  chosenId,
  "No public round exists; initialize a local demo before acceptance",
);
const chosen = await details(chosenId);
await manifest(chosen);
if (chosen.round.status !== "settled") {
  equal(
    chosen.round.proof,
    null,
    "An unsettled round must not fabricate proof",
  );
  await get("/api/proof/" + encodeURIComponent(chosenId), 404);
}
if (
  chosen.round.manifest.mode === "LIVE" &&
  chosen.serverTime < chosen.round.ready
) {
  ok(
    chosen.round.status !== "settled" && chosen.round.proof === null,
    "A future LIVE round must remain pending",
  );
}

const missing = "audit-missing-" + randomUUID();
for (const suffix of ["", "/manifest"])
  await get(idPath(missing) + suffix, 404);
if (process.env.TEST_DRAFT_ROUND) {
  for (const suffix of ["", "/manifest"])
    await get(idPath(process.env.TEST_DRAFT_ROUND) + suffix, 404);
}

const settledId =
  process.env.TEST_SETTLED_ROUND ||
  (chosen.round.status === "settled" ? chosen.round.id : null) ||
  state.rounds.find((round) => round.status === "settled" && round.proof)?.id;
let execution = null;
if (settledId) {
  const settled = settledId === chosenId ? chosen : await details(settledId);
  equal(
    settled.round.status,
    "settled",
    "Historical test round is not settled",
  );
  if (settledId !== chosenId) await manifest(settled);
  const archivedResponse = await get(
    "/api/proof/" + encodeURIComponent(settledId),
  );
  ok(
    archivedResponse.headers
      .get("content-disposition")
      ?.startsWith("attachment;"),
    "Original proof JSON download is not an attachment",
  );
  const archived = await archivedResponse.json();
  equal(
    archived,
    settled.round.proof,
    "R2 proof download differs from the readable round details",
  );
  const verification = await verifyProof(archived, {
    roundId: settled.round.id,
    commitment: settled.round.commitment,
    manifest: settled.round.manifest,
  });
  ok(
    verification.ok,
    "Local proof reproduction failed: " + verification.errors,
  );
  equal(
    verification.results,
    archived.results,
    "Reproduced numbers differ from the published result",
  );
  for (const id of [
    "manifest",
    "canonical",
    "hashes",
    "results",
    "timing",
    "sources",
    "pool",
  ])
    equal(
      verification.checks.find((check) => check.id === id)?.ok,
      true,
      "Missing or failing verification check: " + id,
    );
  execution = archived.execution || (archived.simulatedClock ? "DEMO" : null);
}

console.log(
  JSON.stringify(
    {
      base,
      readOnly: true,
      checkedAt: new Date().toISOString(),
      checks,
      round: chosen.round.id,
      mode: chosen.round.manifest.mode,
      status: chosen.round.status,
      settledProofChecked: Boolean(settledId),
      settledRound: settledId || null,
      execution,
      draftVisibilityChecked: Boolean(process.env.TEST_DRAFT_ROUND),
    },
    null,
    2,
  ),
);

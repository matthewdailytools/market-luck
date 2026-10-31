import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { hash } from "../src/engine.js";
const base = process.env.LIVE_URL || "https://luck.onlinefreetools.org";
const admin =
  process.env.LIVE_ADMIN_TOKEN ||
  (await readFile(".wrangler/live-admin-token", "utf8"));
let cookie = "",
  checks = 0;
async function call(path, body, status = 200) {
  const r = await fetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin: base,
      cookie,
      "content-type": "application/json",
      ...(path.startsWith("admin/")
        ? { authorization: "Bearer " + admin }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  checks++;
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return d;
}
const s = await call("state"),
  round = s.rounds.find((r) => r.status === "open");
assert(round);
assert.equal(round.manifest.mode, "LIVE");
assert.deepEqual(round.manifest.sources, ["YahooFinance", "Nasdaq"]);
assert.equal(s.demo, false);
assert.equal(hash(JSON.stringify(round.manifest)), round.commitment);
assert(Date.now() < round.cutoff);
const before = s.pool;
const anchor = s.anchors.find((a) => a.round_id === round.id);
assert(anchor.verified_at < round.cutoff);
assert.equal(hash(await (await fetch(anchor.url)).text()), round.commitment);
await call("register", {
  name: "liveqa" + Date.now(),
  password: "online-live-test-only-123",
});
const tickets = round.manifest.games.map((g) => ({
  round: round.id,
  game: g.id,
  main: Array.from({ length: g.count }, (_, i) => i + 1),
  bonus: g.bonus ? (g.bonusMin ?? 1) : null,
  key: crypto.randomUUID(),
}));
for (const t of tickets) await call("buy", t);
await call("buy", tickets[0]);
let state = await call("state");
assert.equal(state.me.balance, 840);
assert.equal(state.pool, before + 160);
await call(
  "buy",
  { ...tickets[0], main: [1, 1, 2, 3, 4, 5], key: crypto.randomUUID() },
  400,
);
const responses = await Promise.all(
  Array.from({ length: 90 }, async () => {
    const r = await fetch(base + "/api/buy", {
      method: "POST",
      headers: { origin: base, cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...tickets[2], key: crypto.randomUUID() }),
    });
    const d = await r.json();
    assert([200, 400].includes(r.status));
    if (r.status === 400) assert.equal(d.error, "积分不足");
    return r.status;
  }),
);
assert.equal(responses.filter((x) => x === 200).length, 84);
assert.equal(responses.filter((x) => x === 400).length, 6);
state = await call("state");
assert.equal(state.me.balance, 0);
assert.equal(state.pool, before + 1000);
assert.equal(state.tickets.length, 100);
const blocked = await call("admin/collect", { round: round.id }, 409);
assert.equal(blocked.error, "MARKETS_NOT_FINAL");
await call("demo/advance", { round: round.id }, 403);
await call("proof/" + round.id, undefined, 404);
const final = await call("state");
assert.equal(final.rounds.find((r) => r.id === round.id).status, "open");
assert.equal(final.pool, state.pool);
await call("logout", {});
const report = {
  ok: true,
  environment: "LIVE_REAL_CLOCK",
  checks,
  round: round.id,
  anchor: anchor.url,
  salesCutoff: new Date(round.cutoff).toISOString(),
  marketClose: new Date(
    Math.max(...round.manifest.markets.map((m) => m.closeUTC)),
  ).toISOString(),
  earliestDraw: new Date(round.ready).toISOString(),
  games: 16,
  tickets: 100,
  concurrentRequests: 90,
  concurrentSuccess: 84,
  concurrentInsufficient: 6,
  earlyCollection: "BLOCKED",
  demoAdvance: "BLOCKED",
  naturalSettlement: "PENDING_FUTURE_MARKET",
  checkedAt: new Date().toISOString(),
};
await mkdir("test-output", { recursive: true });
await writeFile(
  "test-output/live-online.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

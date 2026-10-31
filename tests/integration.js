import assert from "node:assert/strict";
import { hash, evidence, games, draw } from "../src/engine.js";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
let cookie = "";
let checks = 0;
async function call(path, body, expected = 200, auth = true) {
  const r = await fetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json", origin: base } : {}),
      ...(auth ? { cookie } : {}),
      ...(path.startsWith("demo/") && process.env.TEST_ADMIN_TOKEN
        ? { authorization: "Bearer " + process.env.TEST_ADMIN_TOKEN }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.equal(r.status, expected, JSON.stringify(d));
  checks++;
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return d;
}
const name = "test" + Date.now();
await call("register", { name, password: "test-password-123" });
await call("register", { name, password: "test-password-123" }, 400);
await call("login", { name, password: "incorrect" }, 401);
await call("login", { name, password: "test-password-123" });
let s = await call("state");
assert.equal(s.me.balance, 1000);
const before = s.pool;
const round = (await call("demo/create", {})).id;
await call("demo/draw", { round }, 409);
s = await call("state");
const r = s.rounds.find((r) => r.id === round);
assert.equal(hash(JSON.stringify(r.manifest)), r.commitment);
const roundDetail = await call("round/" + round, undefined, 200, false);
assert.equal(roundDetail.round.id, round);
assert.equal(roundDetail.round.proof, null);
assert.equal(roundDetail.anchor, null);
assert(!("me" in roundDetail) && !("tickets" in roundDetail));
const rawManifestResponse = await fetch(
  base + "/api/round/" + round + "/manifest",
);
assert.equal(rawManifestResponse.status, 200);
assert(
  rawManifestResponse.headers.get("content-disposition").includes("attachment"),
);
assert.equal(hash(await rawManifestResponse.text()), r.commitment);
checks++;
await call("round/unknown-public-round", undefined, 404, false);
await call("round/unknown-public-round/manifest", undefined, 404, false);
const prices = r.manifest.markets.map((x, i) => ({
  ...x,
  close: 10000 + (parseInt(hash(round + ":" + i).slice(0, 6), 16) % 100000),
}));
const proof = evidence({ ...r, manifest: JSON.stringify(r.manifest) }, prices);
const winning = proof.results.cn;
const ticket = {
  round,
  game: "cn",
  main: winning.main,
  bonus: winning.bonus,
  key: crypto.randomUUID(),
};
await call("buy", ticket);
await call("buy", ticket);
s = await call("state");
assert.equal(s.me.balance, 990);
assert.equal(s.pool, before + 10);
await call(
  "buy",
  { ...ticket, key: crypto.randomUUID(), main: [1, 1, 2, 3, 4, 5] },
  400,
);
for (const g of games.filter((g) => g.id !== "cn"))
  await call("buy", {
    round,
    game: g.id,
    main: Array.from({ length: g.count }, (_, i) => i + 1),
    bonus: g.bonus ? (g.bonusMin ?? 1) : null,
    key: crypto.randomUUID(),
  });
const purchases = await Promise.all(
  Array.from({ length: 105 }, async () => {
    const response = await fetch(base + "/api/buy", {
      method: "POST",
      headers: { cookie, origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        round,
        game: "uk",
        main: [1, 2, 3, 4, 5, 6],
        bonus: null,
        key: crypto.randomUUID(),
      }),
    });
    const body = await response.json();
    assert([200, 400].includes(response.status));
    if (response.status === 400) assert.equal(body.error, "积分不足");
    return response.status;
  }),
);
assert.equal(purchases.filter((s) => s === 200).length, 84);
assert.equal(purchases.filter((s) => s === 400).length, 21);
// Each request receives either 200 or 400; validate aggregate outcome from the ledger.
s = await call("state");
assert.equal(s.me.balance, 0);
assert.equal(s.pool, before + 1000);
assert.equal(s.tickets.length, 100);
await call("buy", { ...ticket, key: crypto.randomUUID() }, 400);
await call("demo/advance", { round });
await call("buy", { ...ticket, key: crypto.randomUUID() }, 400);
await call("demo/draw", { round });
const settled = await call("state");
const settledRound = settled.rounds.find((r) => r.id === round);
assert.equal(settledRound.status, "settled");
assert(settled.me.balance > 0);
assert.equal(settled.pool + settled.me.balance, before + 1000);
assert(
  settled.winners.some((t) => t.user_id === settled.me.id && t.tier === 1),
);
const downloaded = await call("proof/" + round);
const settledDetail = await call("round/" + round, undefined, 200, false);
assert.deepEqual(settledDetail.round.proof, downloaded);
assert.equal(downloaded.seed, hash(downloaded.input));
for (const g of games)
  assert.deepEqual(downloaded.results[g.id], draw(downloaded.seed, g));
await Promise.all([call("demo/draw", { round }), call("demo/draw", { round })]);
s = await call("state");
assert.equal(s.pool, settled.pool);
assert.equal(s.me.balance, settled.me.balance);
const denied = await fetch(base + "/api/demo/create", {
  method: "POST",
  headers: {
    origin: "https://evil.invalid",
    "content-type": "application/json",
  },
  body: "{}",
});
assert.equal(denied.status, 403);
const html = await fetch(base);
assert.equal(html.status, 200);
assert((await html.text()).includes("公开奖"));
await call("logout", {});
s = await call("state");
assert.equal(s.me, null);
await call("buy", ticket, 401);
console.log(
  JSON.stringify(
    {
      ok: true,
      checks,
      concurrentRequests: purchases.length,
      winnerBalance: settled.me.balance,
      pool: settled.pool,
      proofSeed: downloaded.seed,
    },
    null,
    2,
  ),
);

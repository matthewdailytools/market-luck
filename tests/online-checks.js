import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const base =
  process.env.TEST_BASE_URL || "https://luck-test.onlinefreetools.org";
assert.equal(new URL(base).protocol, "https:");
let checks = 0,
  cookie = "";
async function get(path) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200);
  checks++;
  return r;
}
const page = await get("/");
assert(
  page.headers
    .get("content-security-policy")
    .includes("frame-ancestors 'none'"),
);
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
for (const asset of ["/app.js", "/i18n.js", "/game-rules.js", "/style.css"])
  await get(asset);
let state = await (await get("/api/state")).json();
assert.equal(state.games.length, 16);
assert.equal(state.demo, true);
const rounds = state.rounds.filter((r) => r.proof);
assert(rounds.length > 0);
await mkdir("test-output", { recursive: true });
const proof = await (await get("/api/proof/" + rounds[0].id)).json();
await writeFile("test-output/online-proof.json", JSON.stringify(proof));
const verify = spawnSync(
  process.execPath,
  ["scripts/verify-proof.js", "test-output/online-proof.json"],
  { encoding: "utf8" },
);
assert.equal(verify.status, 0, verify.stderr);
checks++;
const name = "https" + Date.now(),
  password = "online-test-password-123";
const post = async (path, body, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: {
      origin: base,
      "content-type": "application/json",
      cookie,
      ...headers,
    },
    body: JSON.stringify(body),
  });
const registered = await post("/api/register", { name, password });
assert.equal(registered.status, 200);
const setCookie = registered.headers.get("set-cookie");
assert(setCookie.includes("Secure"));
assert(setCookie.includes("HttpOnly"));
assert(setCookie.includes("SameSite=Strict"));
cookie = setCookie.split(";")[0];
checks++;
const privateState = await fetch(base + "/api/state", { headers: { cookie } });
const mine = await privateState.json();
assert.equal(mine.me.balance, 1000);
for (const [path, body, headers, status] of [
  [
    "/api/buy",
    {
      round: rounds[0].id,
      game: "de",
      main: [1, 2, 3, 4, 5, 6],
      bonus: 10,
      key: crypto.randomUUID(),
    },
    {},
    400,
  ],
  [
    "/api/buy",
    {
      round: rounds[0].id,
      game: "cn",
      main: [1, 2, 3, 4, 5, 6],
      bonus: 1,
      key: crypto.randomUUID(),
    },
    {},
    400,
  ],
  ["/api/admin/prepare", {}, {}, 401],
  ["/api/demo/advance", { round: rounds[0].id }, {}, 403],
  ["/api/register", { name: "bad", password: "short" }, {}, 400],
  ["/api/logout", {}, { origin: "https://example.invalid" }, 403],
]) {
  const r = await post(path, body, headers);
  assert.equal(r.status, status, await r.text());
  checks++;
}
const after = await (
  await fetch(base + "/api/state", { headers: { cookie } })
).json();
assert.equal(after.me.balance, 1000);
await post("/api/logout", {});
const loggedOut = await (
  await fetch(base + "/api/state", { headers: { cookie } })
).json();
assert.equal(loggedOut.me, null);
checks++;
const report = {
  url: base,
  checkedAt: new Date().toISOString(),
  checks,
  proofRound: rounds[0].id,
  proofSeed: proof.seed,
  games: 16,
  secureCookie: true,
  proofVerification: verify.stdout.trim(),
  pool: state.pool,
};
await writeFile(
  "test-output/online-checks.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

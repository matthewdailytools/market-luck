import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { testDatabase } from "./fixtures/sqlite-d1.js";
import {
  liveManifest,
  prepareLiveManifest,
  collectAndSettle,
} from "../src/live.js";
import { evidence, hash } from "../src/engine.js";
import {
  RANDOMNESS_POLICY,
  futureBeaconRound,
  beaconTime,
  verifyBeacon,
  validateSnapshot,
} from "../src/beacon.js";
import { BEACON_VECTOR, readSnapshot } from "../src/entropy.js";
import { verifyProof } from "../public/proof-verifier.js";
import { attemptLimit } from "../src/abuse.js";
import { createWorker } from "../src/worker.js";
const vector = JSON.parse(
  readFileSync(new URL("./fixtures/quicknet-20261030.json", import.meta.url)),
);
const markets = ["AAPL", "MSFT", "IBM"].map((t) => ({
  symbol: `${t === "IBM" ? "XNYS" : "XNAS"}:${t}`,
  date: "2026-10-29",
  currency: "USD",
  scale: 2,
}));
function setup(version = 2) {
  const store = testDatabase(Date.parse("2026-10-28T00:00:00Z")),
    r2 = new Map();
  const manifest = (version === 2 ? prepareLiveManifest : liveManifest)(
    { markets, cutoff: Date.parse("2026-10-29T07:30:00Z") },
    store.now(),
  );
  const raw = JSON.stringify(manifest),
    round = {
      id: manifest.id,
      manifest: raw,
      commitment: hash(raw),
      cutoff: manifest.cutoff,
      ready: manifest.ready,
      status: "open",
      proof: null,
    };
  store.db
    .prepare(
      "INSERT INTO rounds(id,manifest,commitment,cutoff,ready,status) VALUES(?,?,?,?,?,'draft')",
    )
    .run(round.id, raw, round.commitment, round.cutoff, round.ready);
  store.db
    .prepare(
      "INSERT INTO anchors(round_id,url,published,verified_hash,verified_at) VALUES(?,?,?,?,?)",
    )
    .run(
      round.id,
      "https://example.test/commit",
      store.now(),
      round.commitment,
      store.now(),
    );
  store.db.prepare("UPDATE rounds SET status='open' WHERE id=?").run(round.id);
  store.db
    .prepare(
      "INSERT INTO users(id,name,password,salt) VALUES('owner','owner','unused','unused')",
    )
    .run();
  const env = {
    DB: store.DB,
    EVIDENCE: {
      async put(k, v) {
        r2.set(k, v);
      },
      async get(k) {
        const v = r2.get(k);
        return v ? { text: async () => v, body: v } : null;
      },
    },
    BEACON_VERIFIER: {
      getByName() {
        return { verify: async (b, r) => verifyBeacon(b, r) };
      },
    },
    INSTALLATION_KIND: "ONLINE_REPLAY",
  };
  let calls = 0,
    priceChange = false,
    invalidBeacon = false;
  const fetcher = async (url) => {
    if (url.includes("drand")) {
      const beacon = structuredClone(vector.beacon);
      if (invalidBeacon)
        Object.assign(beacon, { ...BEACON_VECTOR, round: beacon.round });
      return Response.json(beacon);
    }
    calls++;
    const symbol = new URL(url).pathname
      .match(/\/(?:chart|quote)\/([a-z]+)/i)?.[1]
      .toUpperCase();
    const price =
      100 + ["AAPL", "MSFT", "IBM"].indexOf(symbol) + (priceChange ? 10 : 0);
    return Response.json(
      url.includes("query1")
        ? {
            chart: {
              result: [
                {
                  meta: {
                    symbol,
                    currency: "USD",
                    exchangeTimezoneName: "America/New_York",
                  },
                  timestamp: [1793280600],
                  indicators: { quote: [{ close: [price] }] },
                },
              ],
            },
          }
        : {
            data: {
              symbol,
              tradesTable: {
                rows: [{ date: "10/29/2026", close: "$" + price.toFixed(2) }],
              },
            },
            status: { rCode: 200 },
          },
    );
  };
  const buy = (numbers = [1, 2, 3, 4, 5, 6], bonus = 0, game = "de") =>
    store.db
      .prepare(
        "INSERT INTO tickets(id,user_id,round_id,game,numbers,bonus,request_key,created) VALUES(?,'owner',?,?,?,?,?,?)",
      )
      .run(
        crypto.randomUUID(),
        round.id,
        game,
        JSON.stringify(numbers),
        bonus,
        crypto.randomUUID(),
        store.now(),
      );
  return {
    ...store,
    manifest,
    round,
    env,
    fetcher,
    buy,
    calls: () => calls,
    changePrices() {
      priceChange = true;
    },
    invalidateBeacon() {
      invalidBeacon = true;
    },
  };
}
test("official quicknet vectors pass while forged randomness, signatures, rounds and policy fail", () => {
  assert(verifyBeacon(BEACON_VECTOR, 1000));
  assert(verifyBeacon(vector.beacon, vector.beacon.round));
  assert.equal(
    verifyBeacon({ ...BEACON_VECTOR, round: 1001 }, 1001),
    false,
    "a valid signature cannot be relabelled as another round even when its randomness hash matches",
  );
  for (const bad of [
    { ...vector.beacon, round: vector.beacon.round + 1 },
    { ...vector.beacon, signature: "0".repeat(96) },
    { ...vector.beacon, randomness: "0".repeat(64) },
  ])
    assert.equal(verifyBeacon(bad, vector.beacon.round), false);
  assert(
    beaconTime(futureBeaconRound(vector.sealedAt)) >= vector.sealedAt + 120000,
  );
  const s = setup();
  assert.throws(
    () =>
      validateSnapshot(
        {},
        {
          ...s.manifest,
          randomness: { ...RANDOMNESS_POLICY, publicKey: "0".repeat(192) },
        },
      ),
    /POLICY/,
  );
});
test("new preparation rejects v1 downgrades and alternate source sets without altering legacy constructor", () => {
  const s = setup();
  assert.equal(s.manifest.version, 2);
  assert.equal(setup(1).manifest.version, 1);
  assert.throws(
    () =>
      prepareLiveManifest(
        { markets, cutoff: s.round.cutoff, version: 1 },
        s.now(),
      ),
    /REQUIRE_V2/,
  );
  assert.throws(
    () =>
      prepareLiveManifest(
        { markets, cutoff: s.round.cutoff, sourceProfile: "KEYED-v1" },
        s.now(),
      ),
    /PUBLIC_SOURCE/,
  );
});
test("v2 freezes only the first consensus, waits for the future signed round, reproduces and pays once", async () => {
  const s = setup();
  s.buy();
  s.setNow(s.manifest.ready);
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /FUTURE_BEACON/,
  );
  const snapshot = await readSnapshot(s.env, s.round.id);
  assert.equal(snapshot.sealedAt, vector.sealedAt);
  assert.equal(snapshot.beaconRound, vector.beacon.round);
  const firstCalls = s.calls();
  s.changePrices();
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /FUTURE_BEACON/,
  );
  assert.equal(s.calls(), firstCalls);
  s.setNow(beaconTime(snapshot.beaconRound));
  const proof = await collectAndSettle(s.env, s.round, s.fetcher, s.now());
  assert.equal(proof.version, 2);
  assert.deepEqual(proof.snapshot, snapshot);
  assert.equal(s.calls(), firstCalls);
  const report = await verifyProof(proof, {
    roundId: s.round.id,
    commitment: s.round.commitment,
    manifest: s.manifest,
  });
  assert(report.ok, report.errors.join(","));
  assert.equal(report.checks.length, 9);
  const paid = s.db.prepare("SELECT balance FROM pool").get().balance;
  const retry = await collectAndSettle(s.env, s.round, s.fetcher, s.now());
  assert.deepEqual(retry, proof);
  assert.equal(s.db.prepare("SELECT balance FROM pool").get().balance, paid);
  assert.equal(
    s.db.prepare("SELECT SUM(balance) AS total FROM users").get().total + paid,
    101000,
  );
  await mkdir("test-output", { recursive: true });
  await writeFile("test-output/v2-isolated-proof.json", JSON.stringify(proof));
  const cli = spawnSync(
    process.execPath,
    ["scripts/verify-proof.js", "test-output/v2-isolated-proof.json"],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  for (const mutate of [
    (p) => p.snapshot.sealedAt++,
    (p) => p.beacon.round++,
    (p) => (p.beacon.randomness = "0".repeat(64)),
    (p) => (p.snapshot.digest = "0".repeat(64)),
  ]) {
    const bad = structuredClone(proof);
    mutate(bad);
    assert.equal(
      (
        await verifyProof(bad, {
          roundId: s.round.id,
          commitment: s.round.commitment,
          manifest: s.manifest,
        })
      ).ok,
      false,
    );
  }
});
test("invalid beacon cannot settle, replace a frozen input or make a partial payment", async () => {
  const s = setup();
  s.buy();
  s.setNow(s.manifest.ready);
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /FUTURE_BEACON/,
  );
  const original = await readSnapshot(s.env, s.round.id);
  assert.throws(
    () => s.db.prepare("UPDATE rounds SET status='paused'").run(),
    /CANNOT_PAUSE/,
  );
  assert.throws(
    () => s.db.prepare("UPDATE rounds SET status='draft'").run(),
    /TRANSITION/,
  );
  assert.throws(
    () => s.db.prepare("UPDATE rounds SET status='settled'").run(),
    /SETTLEMENT/,
  );
  s.setNow(beaconTime(original.beaconRound));
  s.invalidateBeacon();
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /INVALID/,
  );
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM settlements").get().n,
    0,
  );
  assert.equal(s.db.prepare("SELECT balance FROM users").get().balance, 990);
  assert.deepEqual(await readSnapshot(s.env, s.round.id), original);
  assert.throws(
    () =>
      s.db.prepare("UPDATE entropy_snapshots SET sealed_at=sealed_at+1").run(),
    /IMMUTABLE/,
  );
  assert.throws(
    () => s.db.prepare("DELETE FROM entropy_snapshots").run(),
    /IMMUTABLE/,
  );
});
test("legacy v1 payouts keep their seed and reject backdated edits, deletion, proof rewrites and prize resetting", async () => {
  const s = setup(1),
    prices = s.manifest.markets.map((m, i) => ({
      ...m,
      close: (100 + i) * 100,
    }));
  const expected = evidence(s.round, prices);
  s.buy(expected.results.cn.main, expected.results.cn.bonus, "cn");
  assert.throws(
    () => s.db.prepare("UPDATE tickets SET numbers='[7,8,9,10,11,12]'").run(),
    /IMMUTABLE/,
  );
  assert.throws(
    () => s.db.prepare("UPDATE tickets SET created=created-10000").run(),
    /IMMUTABLE/,
  );
  assert.throws(() => s.db.prepare("DELETE FROM tickets").run(), /IMMUTABLE/);
  s.setNow(s.manifest.ready);
  const proof = await collectAndSettle(s.env, s.round, s.fetcher, s.now());
  assert.equal(proof.seed, expected.seed);
  assert.equal(proof.md5, expected.md5);
  assert.equal(proof.version, 1);
  assert.equal(proof.snapshot, undefined);
  const before = s.db.prepare("SELECT balance FROM users").get().balance;
  assert(before > 990);
  for (const sql of [
    "UPDATE tickets SET prize=0",
    "UPDATE tickets SET prize=prize+1",
    "UPDATE tickets SET tier=0",
    "DELETE FROM settlement_payments",
    "UPDATE ledger SET delta=999",
    "DELETE FROM ledger",
    "DELETE FROM anchors",
    "UPDATE anchors SET url='https://bad.test'",
    "UPDATE rounds SET proof='{}'",
    "DELETE FROM rounds",
    "DELETE FROM settlements",
  ])
    assert.throws(() => s.db.exec(sql), undefined, sql);
  assert.equal(s.db.prepare("SELECT balance FROM users").get().balance, before);
});
test("missing settlement fields and stale pool snapshots roll back even with zero tickets", async () => {
  const s = setup(1);
  s.setNow(s.manifest.ready);
  s.db.prepare("INSERT INTO settlements(round_id) VALUES(?)").run(s.round.id);
  assert.throws(
    () => s.db.prepare("UPDATE rounds SET status='settled',proof='{}'").run(),
    /SNAPSHOT/,
  );
  assert.equal(s.db.prepare("SELECT status FROM rounds").get().status, "open");
});
test("persistent HMAC rate limits enforce concurrent signup caps and isolate windows without raw IP storage", async () => {
  const s = setup(),
    env = { DB: s.DB, ABUSE_IP_KEY: "local-test-only-key", DEMO_MODE: "false" };
  const request = new Request("https://example.test/api/register", {
    headers: { "CF-Connecting-IP": "192.0.2.10" },
  });
  const attempts = await Promise.all(
    Array.from({ length: 20 }, () =>
      attemptLimit(request, env, "register", s.now()),
    ),
  );
  assert.equal(attempts.filter((x) => x === null).length, 5);
  assert(
    attempts.filter(Boolean).every((x) => x.status === 429 && x.retryAfter > 0),
  );
  assert(
    !JSON.stringify(s.db.prepare("SELECT * FROM abuse_limits").all()).includes(
      "192.0.2.10",
    ),
  );
  assert.equal(
    await attemptLimit(request, env, "register", s.now() + 3600000),
    null,
  );
  assert.equal(
    (
      await attemptLimit(
        new Request("https://example.test"),
        env,
        "login",
        s.now(),
      )
    ).status,
    503,
  );
});
test("concurrent collectors preserve one frozen snapshot and one atomic settlement", async () => {
  const s = setup();
  s.buy();
  s.setNow(s.manifest.ready);
  const freeze = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    ),
  );
  assert(
    freeze.every(
      (r) => r.status === "rejected" && /FUTURE_BEACON/.test(r.reason.message),
    ),
  );
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM entropy_snapshots").get().n,
    1,
  );
  const snapshot = await readSnapshot(s.env, s.round.id);
  s.setNow(beaconTime(snapshot.beaconRound));
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    ),
  );
  assert(
    results.every((p) => JSON.stringify(p) === JSON.stringify(results[0])),
  );
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM settlements").get().n,
    1,
  );
  const total = s.db
    .prepare(
      "SELECT (SELECT SUM(balance) FROM users)+(SELECT balance FROM pool WHERE id=1) AS n",
    )
    .get().n;
  assert.equal(total, 101000);
});
test("a changed pool balance aborts settlement atomically, including zero-ticket rounds", async () => {
  const s = setup(1);
  s.setNow(s.manifest.ready);
  const original = s.env.DB.batch;
  s.env.DB = {
    ...s.env.DB,
    async batch(ops) {
      s.db.exec("UPDATE pool SET balance=balance+10");
      return original(ops);
    },
  };
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /SNAPSHOT|SETTLEMENT_REQUIRED/,
  );
  assert.equal(s.db.prepare("SELECT proof FROM rounds").get().proof, null);
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM settlements").get().n,
    0,
  );
  assert.equal(s.db.prepare("SELECT balance FROM users").get().balance, 1000);
});
test("the HTTP signup endpoint returns 429 and Retry-After without issuing more accounts", async () => {
  const s = setup(),
    env = { ...s.env, DEMO_MODE: "false", ABUSE_IP_KEY: "test-only-local-key" },
    worker = createWorker(s.now);
  for (let index = 0; index < 6; index++) {
    const response = await worker.fetch(
      new Request("https://auth.example/api/register", {
        method: "POST",
        headers: {
          Origin: "https://auth.example",
          "CF-Connecting-IP": "192.0.2.12",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "test_user_" + index,
          password: "test-password-only",
        }),
      }),
      env,
    );
    assert.equal(response.status, index < 5 ? 200 : 429);
    if (index === 5) assert(Number(response.headers.get("retry-after")) > 0);
  }
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 6);
});
test("chunked oversized JSON bodies are rejected before account creation", async () => {
  const s = setup(),
    worker = createWorker(s.now);
  const request = new Request("http://localhost/api/register", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    duplex: "half",
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(17000));
        c.close();
      },
    }),
  });
  const response = await worker.fetch(request, { ...s.env, DEMO_MODE: "true" });
  assert.equal(response.status, 413);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
});
test("HTTP preparation always pins v2, rejects downgrade and keeps draft entropy private", async () => {
  const s = setup(),
    worker = createWorker(s.now),
    env = { ...s.env, ADMIN_TOKEN: "isolated-admin-test-only" };
  const call = (body) =>
    worker.fetch(
      new Request("https://admin.example/api/admin/prepare", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.ADMIN_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ markets, cutoff: s.round.cutoff, ...body }),
      }),
      env,
    );
  assert.equal((await call({ version: 1 })).status, 400);
  const response = await call({});
  assert.equal(response.status, 200);
  const prepared = await response.json();
  assert.equal(prepared.manifest.version, 2);
  assert.deepEqual(prepared.manifest.randomness, RANDOMNESS_POLICY);
  const unpublished = await worker.fetch(
    new Request(
      "https://admin.example/api/round/" + prepared.manifest.id + "/entropy",
    ),
    env,
  );
  assert.equal(unpublished.status, 404);
  s.db.exec("DROP TRIGGER entropy_no_update");
  assert.equal((await call({})).status, 503);
});
test("new session digests cannot be used as cookies and are never returned to the client", async () => {
  const s = setup(),
    worker = createWorker(s.now),
    env = { ...s.env, DEMO_MODE: "true" };
  const response = await worker.fetch(
    new Request("http://localhost/api/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "session_user",
        password: "local-test-password",
      }),
    }),
    env,
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0],
    raw = cookie.slice("session=".length),
    stored = s.db.prepare("SELECT token FROM sessions").get().token;
  assert(stored.startsWith("s2:"));
  assert(!stored.includes(raw));
  const state = await (
    await worker.fetch(
      new Request("http://localhost/api/state", {
        headers: { Cookie: cookie },
      }),
      env,
    )
  ).json();
  assert.equal(state.me.name, "session_user");
  assert.deepEqual(Object.keys(state.me).sort(), ["balance", "id", "name"]);
  const forged = await (
    await worker.fetch(
      new Request("http://localhost/api/state", {
        headers: { Cookie: "session=" + stored.slice(3) },
      }),
      env,
    )
  ).json();
  assert.equal(forged.me, null);
  await worker.fetch(
    new Request("http://localhost/api/logout", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: cookie },
    }),
    env,
  );
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
});
test("an existing v1 session upgrades on use without changing cookie identity or expiry", async () => {
  const s = setup(),
    raw = "a".repeat(64),
    expiry = s.now() + 604800000;
  s.db
    .prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,'owner',?)")
    .run(raw, expiry);
  const state = await (
    await createWorker(s.now).fetch(
      new Request("http://localhost/api/state", {
        headers: { Cookie: "session=" + raw },
      }),
      { ...s.env, DEMO_MODE: "true" },
    )
  ).json();
  assert.equal(state.me.id, "owner");
  const row = s.db.prepare("SELECT * FROM sessions").get();
  assert.equal(row.token, "s2:" + hash("market-luck/session/v2\n" + raw));
  assert.equal(row.expires, expiry);
});

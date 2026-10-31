import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { testDatabase } from "./fixtures/sqlite-d1.js";
import { createWorker } from "../src/worker.js";
import { archiveInstallation, diskStore } from "../scripts/core-archive.js";
const base = "https://luck-test.onlinefreetools.org";
function memoryStore() {
  const files = new Map();
  return {
    files,
    async read(p) {
      return files.get(p) ?? null;
    },
    async writeOnce(p, v) {
      if (files.has(p)) {
        assert.equal(files.get(p), v, "IMMUTABLE_ARCHIVE_CONFLICT");
        return false;
      }
      files.set(p, v);
      return true;
    },
    async replace(p, v) {
      if (files.get(p) === v) return false;
      files.set(p, v);
      return true;
    },
  };
}
async function fixture() {
  const state = testDatabase(Date.parse("2026-10-31T12:00:00Z")),
    r2 = new Map(),
    worker = createWorker(state.now);
  const env = {
    DB: state.DB,
    DEMO_MODE: "true",
    EVIDENCE: {
      put: async (k, v) => r2.set(k, v),
      get: async (k) =>
        r2.has(k) ? { body: r2.get(k), text: async () => r2.get(k) } : null,
    },
  };
  const post = (path) =>
    worker.fetch(
      new Request("http://127.0.0.1:8787" + path, {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:8787",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(path.includes("create") ? {} : { round }),
      }),
      env,
    );
  await post("/api/demo/create");
  const round = state.db.prepare("SELECT id FROM rounds").get().id;
  state.db
    .prepare(
      "INSERT INTO users(id,name,password,salt) VALUES('PRIVATE_OWNER_ID','PRIVATE_OWNER_NAME','PRIVATE_PASSWORD','PRIVATE_SALT')",
    )
    .run();
  state.db
    .prepare(
      "INSERT INTO tickets(id,user_id,round_id,game,numbers,bonus,request_key,created) VALUES('PRIVATE_TICKET_ID','PRIVATE_OWNER_ID',?,'de','[1,2,3,4,5,6]',0,'PRIVATE_REQUEST_KEY',?)",
    )
    .run(round, state.now());
  let tamper = null;
  const fetcher = async (url, init) => {
    const response = await worker.fetch(new Request(url, init), env);
    if (!tamper) return response;
    const path = new URL(url).pathname;
    if (tamper === "hide" && path === "/api/history/rounds") {
      const d = await response.json();
      d.rounds = [];
      return Response.json(d);
    }
    if (tamper === "ledger" && path === "/api/history/ledger") {
      const d = await response.json();
      const p = d.records.find((r) => r.kind === "purchase");
      p.delta -= 10;
      p.poolDelta += 10;
      d.pool += 10;
      d.poolAtHead += 10;
      return Response.json(d);
    }
    if (tamper === "deleteLedger" && path === "/api/history/ledger") {
      const d = await response.json(),
        first = d.records.find((r) => r.kind === "purchase");
      d.records = d.records.filter((r) => r.id !== first.id);
      d.pool -= first.poolDelta;
      d.poolAtHead -= first.poolDelta;
      return Response.json(d);
    }
    if (
      (tamper === "proof" || tamper === "private") &&
      (path === "/api/proof/" + round || path === "/api/round/" + round)
    ) {
      const d = await response.json(),
        p = path.includes("/proof/") ? d : d.round.proof;
      if (p) {
        if (tamper === "private") p.password = "PRIVATE_LEAK";
        else p.dataNote = "changed after initial publication";
      }
      return Response.json(d);
    }
    return response;
  };
  return {
    ...state,
    env,
    worker,
    round,
    fetcher,
    post,
    r2,
    setTamper: (v) => (tamper = v),
  };
}
const run = (f, store) =>
  archiveInstallation({
    base,
    kind: "demo",
    store,
    fetcher: f.fetcher,
    now: () => new Date(f.now()).toISOString(),
  });
test("history indexes page beyond twenty rounds while excluding drafts and private fields", async () => {
  const f = await fixture();
  const original = f.db.prepare("SELECT * FROM rounds").get();
  for (let i = 0; i < 105; i++)
    f.db
      .prepare(
        "INSERT INTO rounds(id,manifest,commitment,cutoff,ready,status) VALUES(?,?,?,?,?,?)",
      )
      .run(
        "history-round-" + i,
        original.manifest,
        original.commitment,
        original.cutoff,
        original.ready,
        i === 104 ? "draft" : "paused",
      );
  const a = await (await f.fetcher(base + "/api/history/rounds")).json();
  assert.equal(a.rounds.length, 100);
  assert(a.nextAfter);
  const b = await (
    await f.fetcher(base + "/api/history/rounds?after=" + a.nextAfter)
  ).json();
  assert.equal(b.rounds.length, 5);
  assert.equal(b.nextAfter, null);
  assert(!JSON.stringify([a, b]).includes("PRIVATE_"));
  assert(![...a.rounds, ...b.rounds].some((r) => r.status === "draft"));
  for (const suffix of ["?after=-1", "?after=abc", "?after=9007199254740992"])
    assert.equal(
      (await f.fetcher(base + "/api/history/rounds" + suffix)).status,
      400,
    );
});
test("public ledger uses a fixed snapshot head, conserves the pool and never returns signup or owner data", async () => {
  const f = await fixture();
  for (let n = 0; n < 3; n++)
    f.db
      .prepare("INSERT INTO users(id,name,password,salt) VALUES(?,?,?,?)")
      .run("p" + n, "person" + n, "private", "private");
  for (let n = 0; n < 210; n++)
    f.db
      .prepare(
        "INSERT INTO tickets(id,user_id,round_id,game,numbers,bonus,request_key,created) VALUES(?,?,?,'de','[1,2,3,4,5,6]',0,?,?)",
      )
      .run(
        "ticket" + n,
        "p" + Math.floor(n / 100),
        f.round,
        "key" + n,
        f.now(),
      );
  const a = await (await f.fetcher(base + "/api/history/ledger")).json();
  assert.equal(a.records.length, 200);
  assert.equal(a.pool, a.poolAtHead);
  f.db
    .prepare(
      "INSERT INTO tickets(id,user_id,round_id,game,numbers,bonus,request_key,created) VALUES('late','p2',?,'de','[1,2,3,4,5,6]',0,'late',?)",
    )
    .run(f.round, f.now());
  const b = await (
    await f.fetcher(
      base +
        "/api/history/ledger?after=" +
        a.nextAfter +
        "&through=" +
        a.through,
    )
  ).json();
  assert.equal(b.records.length, 12);
  assert.equal(b.poolAtHead, a.poolAtHead);
  assert.equal(
    [...a.records, ...b.records].reduce((s, r) => s + r.poolDelta, 0),
    a.poolAtHead,
  );
  assert(!JSON.stringify([a, b]).includes("user_id"));
  assert(!JSON.stringify([a, b]).includes("PRIVATE_"));
  assert([...a.records, ...b.records].every((r) => r.kind !== "signup"));
  assert.equal(
    (await f.fetcher(base + "/api/history/ledger?through=999999")).status,
    400,
  );
});
test("core archive saves all public facts once, remains unchanged on repetition, and adds a verified simulated settlement", async () => {
  const f = await fixture(),
    store = memoryStore();
  const first = await run(f, store);
  assert(first.changed > 0);
  assert.equal(first.poolAtHead, 100010);
  f.setNow(f.now() + 1000);
  assert.equal((await run(f, store)).changed, 0);
  assert((await f.post("/api/demo/advance")).ok);
  assert((await f.post("/api/demo/draw")).ok);
  const settled = await run(f, store);
  assert(settled.changed > 0);
  assert(store.files.has("demo/" + f.round + "/proof.json"));
  assert(store.files.has("demo/" + f.round + "/settlement.json"));
  assert.equal((await run(f, store)).changed, 0);
  for (const value of store.files.values())
    assert(
      !value.includes("PRIVATE_"),
      "Private account/ticket information escaped into a public archive",
    );
});
test("core archive rejects rewritten facts and missing rounds while retaining its previous index", async () => {
  const f = await fixture(),
    store = memoryStore();
  f.db
    .prepare(
      "INSERT INTO tickets(id,user_id,round_id,game,numbers,bonus,request_key,created) VALUES('second-private-ticket','PRIVATE_OWNER_ID',?,'de','[1,2,3,4,5,6]',0,'second-private-key',?)",
    )
    .run(f.round, f.now());
  await run(f, store);
  const index = await store.read("demo/index.json");
  f.setTamper("ledger");
  await assert.rejects(run(f, store), /IMMUTABLE_ARCHIVE/);
  assert.equal(await store.read("demo/index.json"), index);
  f.setTamper("deleteLedger");
  await assert.rejects(run(f, store), /IMMUTABLE_LEDGER_PREFIX/);
  assert.equal(await store.read("demo/index.json"), index);
  f.setTamper("hide");
  await assert.rejects(run(f, store), /ROUND_DISAPPEARED/);
  assert.equal(await store.read("demo/index.json"), index);
  f.setTamper(null);
  await f.post("/api/demo/advance");
  await f.post("/api/demo/draw");
  await run(f, store);
  const proof = await store.read("demo/" + f.round + "/proof.json");
  f.setTamper("proof");
  await assert.rejects(run(f, store), /IMMUTABLE_ARCHIVE/);
  assert.equal(await store.read("demo/" + f.round + "/proof.json"), proof);
  f.setTamper("private");
  await assert.rejects(run(f, store), /PRIVATE_ARCHIVE_FIELD/);
});
test("filesystem archive prevents path traversal and byte replacement", async () => {
  const root = resolve("test-output/archive-fs-" + crypto.randomUUID());
  await mkdir(root, { recursive: true });
  const store = diskStore(root);
  assert.equal(
    await store.writeOnce("live/abc/manifest.json", '{"fixed":true}'),
    true,
  );
  assert.equal(
    await store.writeOnce("live/abc/manifest.json", '{"fixed":true}'),
    false,
  );
  await assert.rejects(
    store.writeOnce("live/abc/manifest.json", '{"fixed":false}'),
    /IMMUTABLE/,
  );
  await assert.rejects(
    store.writeOnce("../outside.json", "x"),
    /UNSAFE_ARCHIVE_PATH/,
  );
});

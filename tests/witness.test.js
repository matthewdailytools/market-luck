import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { testDatabase } from "./fixtures/sqlite-d1.js";
import { WITNESS_VECTOR } from "../src/witness-vector.js";
import {
  verifyWitness,
  submitWitness,
  jcs,
  base64,
  unbase64,
  witnessHash,
} from "../src/witness.js";
import {
  makeSecret,
  randomBelow,
  validateReveal,
  encryptSecret,
  decryptSecret,
  prepareCommitment,
  witnessRecord,
  validateV3Witnesses,
  canonicalV3,
} from "../src/commitment.js";
import { prepareLiveRound, collectAndSettle } from "../src/live.js";
import { hash } from "../src/engine.js";
import { verifyBeacon, beaconTime } from "../src/beacon.js";
import { ensureWitness, readWitnesses } from "../src/witness-store.js";
import { readSnapshot } from "../src/entropy.js";
import { verifyProof } from "../public/proof-verifier.js";
import { createWorker } from "../src/worker.js";
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/rekor-readiness.json", import.meta.url)),
);
const markets = ["AAPL", "MSFT", "IBM"].map((t) => ({
  symbol: (t === "IBM" ? "XNYS:" : "XNAS:") + t,
  date: "2026-10-29",
  currency: "USD",
  scale: 2,
}));
const fresh = () =>
  prepareLiveRound(
    { markets, cutoff: Date.parse("2026-10-29T07:30:00Z") },
    Date.parse("2026-10-28T00:00:00Z"),
  );

test("real independent Rekor SET, artifact signature, shard inclusion and checkpoint verify offline", async () => {
  const verified = await verifyWitness(
    fixture.receipt,
    fixture.receipt.record,
    fixture.intent,
  );
  assert(verified);
  assert.equal(verified.time, fixture.receipt.entry.integratedTime * 1000);
  assert.equal(
    await verifyWitness(fixture.receipt, fixture.receipt.record + " "),
    null,
  );
  for (const mutation of [
    (r) => r.entry.integratedTime++,
    (r) => r.entry.logIndex++,
    (r) => (r.entry.logID = "0".repeat(64)),
    (r) => (r.uuid = "0".repeat(80)),
    (r) => (r.entry.body = r.entry.body.slice(0, -8) + "AAAAAAAA"),
    (r) => (r.entry.verification.inclusionProof.hashes[0] = "0".repeat(64)),
    (r) => r.entry.verification.inclusionProof.logIndex++,
    (r) => r.entry.verification.inclusionProof.treeSize++,
    (r) =>
      (r.entry.verification.inclusionProof.checkpoint =
        r.entry.verification.inclusionProof.checkpoint.replace(
          "rekor.sigstore.dev",
          "evil.invalid",
        )),
    (r) => (r.entry.verification.signedEntryTimestamp = "A".repeat(96)),
  ]) {
    const r = structuredClone(fixture.receipt);
    mutation(r);
    assert.equal(await verifyWitness(r, r.record), null);
  }
  assert.equal(
    await verifyWitness(fixture.receipt, fixture.receipt.record, "{}"),
    null,
  );
});
test("a duplicate upload retrieves the exact same external leaf; redirects and service failures never choose another service", async () => {
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++;
    if (init?.method === "POST") {
      assert.equal(init.body, fixture.intent);
      return new Response("", {
        status: 409,
        headers: { location: "/api/v1/log/entries/" + fixture.receipt.uuid },
      });
    }
    assert.equal(new URL(url).hostname, "rekor.sigstore.dev");
    return Response.json({ [fixture.receipt.uuid]: fixture.receipt.entry });
  };
  assert.deepEqual(
    await submitWitness(fixture.receipt.record, fixture.intent, fetcher),
    fixture.receipt,
  );
  assert.equal(calls, 2);
  for (const location of [
    "https://evil.invalid/api/v1/log/entries/" + fixture.receipt.uuid,
    "/api/v1/log/entries/invalid",
  ])
    await assert.rejects(
      submitWitness(
        fixture.receipt.record,
        fixture.intent,
        async () => new Response("", { status: 409, headers: { location } }),
      ),
      /INVALID_WITNESS_CONFLICT/,
    );
  await assert.rejects(
    submitWitness(
      fixture.receipt.record,
      fixture.intent,
      async () => new Response("", { status: 503 }),
    ),
    /WITNESS_HTTP_503/,
  );
  await assert.rejects(
    submitWitness(
      fixture.receipt.record,
      fixture.intent,
      async () => new Response("x".repeat(100001), { status: 201 }),
    ),
    /WITNESS_TOO_LARGE/,
  );
});
test("CSPRNG shuffle rejects modulo-biased words, uses all instruments once and adds 256 independent nonce bits", () => {
  let calls = 0;
  assert.equal(
    randomBelow(3, (words) => {
      words[0] = calls++ === 0 ? 0xffffffff : 5;
      return words;
    }),
    2,
  );
  assert.equal(calls, 2);
  const { manifest, secret } = fresh(),
    p = validateReveal(secret, manifest);
  assert.equal(p.nonce.length, 64);
  assert.deepEqual([...p.order].sort(), markets.map((m) => m.symbol).sort());
  assert.notEqual(makeSecret(manifest), secret);
  for (const body of [
    { version: 2 },
    { order: ["x"] },
    { nonce: "0".repeat(64) },
    { hidden: {} },
    { secret: "x" },
  ])
    assert.throws(() =>
      prepareLiveRound(
        { markets, cutoff: manifest.cutoff, ...body },
        manifest.preparedAt,
      ),
    );
  assert.throws(
    () => validateReveal(secret.replace(p.nonce, "0".repeat(64)), manifest),
    /COMMITMENT/,
  );
});
test("AES-GCM binds encrypted secrets to the exact round and manifest; only the plaintext reveal verifies the commitment", async () => {
  const { manifest, secret } = fresh(),
    key = "b".repeat(64),
    envelope = await encryptSecret(secret, manifest, key);
  assert(!envelope.includes(secret));
  assert(!envelope.includes(JSON.parse(secret).nonce));
  assert.equal(await decryptSecret(envelope, manifest, key), secret);
  await assert.rejects(decryptSecret(envelope, manifest, "c".repeat(64)));
  await assert.rejects(
    decryptSecret(envelope, { ...manifest, id: "other-round" }, key),
  );
  await assert.rejects(
    decryptSecret(envelope, manifest, undefined),
    /KEY_UNAVAILABLE/,
  );
  const v = JSON.parse(envelope);
  v.ciphertext = "A" + v.ciphertext.slice(1);
  await assert.rejects(decryptSecret(JSON.stringify(v), manifest, key));
});

// Synthetic log responses isolate the DB state machine. This is never a valid
// public receipt: actual cryptography is exercised separately above and below.
async function setup() {
  const store = testDatabase(Date.parse("2026-10-28T00:00:00Z")),
    r2 = new Map(),
    bundle = fresh(),
    m = bundle.manifest;
  const round = {
    id: m.id,
    manifest: JSON.stringify(m),
    commitment: hash(JSON.stringify(m)),
    cutoff: m.cutoff,
    ready: m.ready,
    status: "open",
  };
  store.db
    .prepare(
      "INSERT INTO rounds(id,manifest,commitment,cutoff,ready,status) VALUES(?,?,?,?,?,'draft')",
    )
    .run(round.id, round.manifest, round.commitment, round.cutoff, round.ready);
  store.db
    .prepare("INSERT INTO round_secrets(round_id,envelope) VALUES(?,?)")
    .run(round.id, await encryptSecret(bundle.secret, m, "b".repeat(64)));
  const vector = JSON.parse(
      readFileSync(
        new URL("./fixtures/quicknet-v3-historical.json", import.meta.url),
      ),
    ),
    uploads = new Map(),
    seen = [];
  let down = false,
    changed = false,
    badBeacon = false,
    quoteCalls = 0;
  const env = {
    DB: store.DB,
    COMMIT_ENCRYPTION_KEY: "b".repeat(64),
    INSTALLATION_KIND: "ONLINE_REPLAY",
    EVIDENCE: { put: async (k, v) => r2.set(k, v) },
    BEACON_VERIFIER: {
      getByName: () => ({
        verify: async (b, r) => verifyBeacon(b, r),
        verifyWitness: async (r, record, intent) => {
          if (r?.entry?.testOnly !== true)
            return verifyWitness(r, record, intent);
          if (r.record !== record) return null;
          const parsed = JSON.parse(
            new TextDecoder().decode(unbase64(r.entry.body)),
          );
          if (parsed.spec.data.hash.value !== witnessHash(record)) return null;
          return {
            time: r.entry.integratedTime * 1000,
            url: "https://example.invalid/controlled-log",
            logIndex: 1,
          };
        },
      }),
    },
  };
  const fetcher = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === "rekor.sigstore.dev") {
      assert.equal(init?.method, "POST");
      seen.push(init.body);
      if (down) return new Response("", { status: 503 });
      let receipt = uploads.get(init.body);
      if (!receipt) {
        const row = store.db
          .prepare("SELECT record FROM witness_intents WHERE body=?")
          .get(init.body);
        assert(row);
        const body = base64(
          new TextEncoder().encode(jcs(JSON.parse(init.body))),
        );
        receipt = {
          record: row.record,
          uuid: hash(body),
          entry: {
            testOnly: true,
            body,
            integratedTime: Math.floor(store.now() / 1000),
          },
        };
        uploads.set(init.body, receipt);
      }
      return Response.json({ [receipt.uuid]: receipt.entry }, { status: 201 });
    }
    if (u.hostname.includes("drand"))
      return Response.json(
        badBeacon ? { ...vector, randomness: "0".repeat(64) } : vector,
      );
    quoteCalls++;
    const symbol = u.pathname
        .match(/\/(?:chart|quote)\/([a-z]+)/i)[1]
        .toUpperCase(),
      price =
        100 + ["AAPL", "MSFT", "IBM"].indexOf(symbol) + (changed ? 10 : 0);
    return Response.json(
      u.hostname.includes("query1")
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
  await ensureWitness(env, round, "presale", null, fetcher);
  store.db
    .prepare(
      "INSERT INTO anchors(round_id,url,published,verified_hash,verified_at) VALUES(?,?,?,?,?)",
    )
    .run(
      round.id,
      "https://example.invalid/controlled-anchor",
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
  store.db
    .prepare(
      "INSERT INTO tickets(id,user_id,round_id,game,numbers,bonus,request_key,created) VALUES('ticket','owner',?,'de','[1,2,3,4,5,6]',0,'v3-test-purchase',?)",
    )
    .run(round.id, store.now());
  return {
    ...store,
    round,
    manifest: m,
    env,
    fetcher,
    seen,
    uploads,
    r2,
    quotes: () => quoteCalls,
    down: () => (down = true),
    up: () => (down = false),
    changed: () => (changed = true),
    bad: () => (badBeacon = true),
    good: () => (badBeacon = false),
  };
}
test("v3 state machine freezes one snapshot, retries one log intent, refuses early reveal and settles atomically once", async () => {
  const s = await setup();
  s.setNow(s.manifest.ready);
  s.down();
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /WITNESS_HTTP_503/,
  );
  const first = await readSnapshot(s.env, s.round.id);
  assert.equal(first.beaconRound, null);
  const quoteCalls = s.quotes();
  assert.throws(
    () =>
      s.db
        .prepare("INSERT INTO round_reveals(round_id,payload) VALUES(?,'{}')")
        .run(s.round.id),
    /REVEAL_TOO_EARLY/,
  );
  s.changed();
  s.up();
  const waiting = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    ),
  );
  assert(
    waiting.every(
      (r) => r.status === "rejected" && /FUTURE_BEACON/.test(r.reason.message),
    ),
  );
  assert.equal(s.quotes(), quoteCalls);
  assert.equal(new Set(s.seen.slice(1)).size, 1);
  const snapshot = await readSnapshot(s.env, s.round.id);
  assert.equal(snapshot.payload, first.payload);
  assert.equal(snapshot.beaconRound, 33529053);
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM round_reveals").get().n,
    0,
  );
  assert.throws(
    () => s.db.prepare("UPDATE rounds SET status='paused'").run(),
    /CANNOT_PAUSE/,
  );
  s.setNow(beaconTime(snapshot.beaconRound));
  s.bad();
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /BEACON_UNAVAILABLE/,
  );
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM round_reveals").get().n,
    0,
  );
  s.good();
  const result = await Promise.all(
    Array.from({ length: 4 }, () =>
      collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    ),
  );
  assert(result.every((r) => r.input === result[0].input));
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM settlements").get().n,
    1,
  );
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM round_reveals").get().n,
    1,
  );
  assert.equal(
    s.db.prepare("SELECT balance FROM pool").get().balance +
      s.db.prepare("SELECT SUM(balance) AS total FROM users").get().total,
    101000,
  );
  assert.equal(
    (
      await verifyProof(result[0], {
        roundId: s.round.id,
        manifest: s.manifest,
        commitment: s.round.commitment,
      })
    ).ok,
    false,
    "synthetic log never passes the public verifier",
  );
  for (const table of [
    "round_secrets",
    "witness_intents",
    "witness_receipts",
    "round_reveals",
  ])
    assert.throws(
      () => s.db.prepare("DELETE FROM " + table).run(),
      /IMMUTABLE/,
    );
  assert.throws(
    () => s.db.prepare("UPDATE witness_intents SET body='{}'").run(),
    /IMMUTABLE/,
  );
});
test("failed v3 settlement rolls back the reveal together with every payment and can retry safely", async () => {
  const s = await setup();
  s.setNow(s.manifest.ready);
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /FUTURE_BEACON/,
  );
  const snapshot = await readSnapshot(s.env, s.round.id);
  s.setNow(beaconTime(snapshot.beaconRound));
  s.db.exec(
    "CREATE TRIGGER controlled_settlement_failure BEFORE UPDATE OF status ON rounds WHEN NEW.status='settled' BEGIN SELECT RAISE(ABORT,'CONTROLLED_FAILURE'); END;",
  );
  await assert.rejects(
    collectAndSettle(s.env, s.round, s.fetcher, s.now()),
    /CONTROLLED_FAILURE/,
  );
  for (const table of ["settlements", "settlement_payments", "round_reveals"])
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM " + table).get().n, 0);
  assert.equal(s.db.prepare("SELECT proof FROM rounds").get().proof, null);
  assert.equal(s.db.prepare("SELECT balance FROM users").get().balance, 990);
  assert.equal(s.db.prepare("SELECT balance FROM pool").get().balance, 100010);
  s.db.exec("DROP TRIGGER controlled_settlement_failure");
  const proof = await collectAndSettle(s.env, s.round, s.fetcher, s.now());
  assert.equal(proof.version, 3);
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM round_reveals").get().n,
    1,
  );
});
test("missing secret keys stop collection before contacting market/log services; public v3 GET never exposes encrypted storage", async () => {
  const s = await setup();
  s.setNow(s.manifest.ready);
  const seen = s.seen.length;
  await assert.rejects(
    collectAndSettle(
      { ...s.env, COMMIT_ENCRYPTION_KEY: undefined },
      s.round,
      s.fetcher,
      s.now(),
    ),
    /KEY_UNAVAILABLE/,
  );
  assert.equal(s.seen.length, seen);
  assert.equal(s.quotes(), 0);
  const worker = createWorker(s.now),
    r = await worker.fetch(
      new Request(
        "https://example.test/api/round/" + s.round.id + "/witnesses",
      ),
      s.env,
    );
  const pub = await r.json();
  assert.equal(r.status, 200);
  assert.equal(pub.reveal, null);
  assert(!JSON.stringify(pub).includes("ciphertext"));
  assert(pub.witnesses.presale);
  assert.throws(
    () =>
      s.db
        .prepare("UPDATE witness_receipts SET witnessed_at=witnessed_at+1")
        .run(),
    /IMMUTABLE/,
  );
});
test("v3 complete public replay verifies genuine log receipts and future beacon, while replacing any commitment fails", async () => {
  const proof = JSON.parse(
      readFileSync(
        new URL("./fixtures/v3-controlled-proof.json", import.meta.url),
      ),
    ),
    expected = {
      roundId: proof.manifest.id,
      manifest: proof.manifest,
      commitment: proof.commitment,
    };
  const report = await verifyProof(proof, expected);
  assert(report.ok, report.errors.join(","));
  assert.equal(report.checks.length, 11);
  const input = JSON.parse(proof.input);
  assert.deepEqual(
    input.prices.map((p) => p.symbol),
    JSON.parse(proof.reveal).order,
  );
  for (const mutation of [
    (p) => (p.reveal = p.reveal.replace('"nonce":"', '"nonce":"0')),
    (p) => p.witnesses.presale.entry.integratedTime++,
    (p) => (p.witnesses.freeze = p.witnesses.presale),
    (p) => p.snapshot.witnessedAt++,
    (p) => p.snapshot.beaconRound++,
    (p) => (p.input = p.input.replace('"prices":', '"tampered":')),
    (p) => (p.manifest.hidden.md5 = "0".repeat(32)),
    (p) => (p.beacon.randomness = "0".repeat(64)),
  ]) {
    const bad = structuredClone(proof);
    mutation(bad);
    assert.equal((await verifyProof(bad, expected)).ok, false);
  }
  const cli = spawnSync(
    process.execPath,
    ["scripts/verify-proof.js", "tests/fixtures/v3-controlled-proof.json"],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
});

test("refreshing a genuine checkpoint or reordering receipt properties cannot choose a different v3 seed", async () => {
  const proof = JSON.parse(
      readFileSync(
        new URL("./fixtures/v3-controlled-proof.json", import.meta.url),
      ),
    ),
    replacement = JSON.parse(
      readFileSync(
        new URL("./fixtures/rekor-freeze-new-checkpoint.json", import.meta.url),
      ),
    );
  assert(await verifyWitness(replacement, replacement.record));
  const altered = structuredClone(proof);
  altered.witnesses.freeze = replacement;
  altered.witnesses.presale = Object.fromEntries(
    Object.entries(altered.witnesses.presale).reverse(),
  );
  const round = {
    id: proof.manifest.id,
    manifest: JSON.stringify(proof.manifest),
    commitment: proof.commitment,
  };
  assert.equal(
    canonicalV3(round, JSON.parse(proof.input).prices, altered),
    proof.input,
  );
  const checked = await verifyProof(altered, {
    roundId: round.id,
    manifest: proof.manifest,
    commitment: proof.commitment,
  });
  assert(checked.ok, checked.errors.join(","));
  assert.equal(altered.seed, proof.seed);
  assert.deepEqual(altered.results, proof.results);
});

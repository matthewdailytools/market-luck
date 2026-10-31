import { test } from "node:test";
import assert from "node:assert/strict";
import { createStateRefresh } from "../public/state-refresh.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function harness() {
  const requests = [];
  const applied = [];
  const gate = createStateRefresh({
    load: () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
    apply: (snapshot) => applied.push(snapshot),
  });
  return { ...gate, requests, applied };
}

test("the latest request applies once and reports whether a snapshot was committed", async () => {
  const env = harness();
  const first = env.refresh();
  const latest = env.refresh();
  env.requests[0].resolve({ me: { id: "old" } });
  assert.equal(await first, false);
  assert.deepEqual(env.applied, []);
  const snapshot = { me: { id: "current" }, tickets: [] };
  env.requests[1].resolve(snapshot);
  assert.equal(await latest, true);
  assert.deepEqual(env.applied, [snapshot]);
});

for (const owner of [null, "account-b"]) {
  test(`a late account A snapshot cannot replace ${owner ? "account B" : "the signed-out state"}`, async () => {
    const env = harness();
    const previous = env.refresh();
    env.invalidate();
    const current = env.refresh();
    const snapshot = { me: owner ? { id: owner } : null, tickets: [] };
    env.requests[1].resolve(snapshot);
    assert.equal(await current, true);
    env.requests[0].resolve({
      me: { id: "account-a" },
      tickets: [{ id: "private-a-ticket" }],
    });
    assert.equal(await previous, false);
    assert.deepEqual(env.applied, [snapshot]);
  });
}

test("authentication start and end invalidate pre-mutation and in-mutation loads", async () => {
  const env = harness();
  const beforeAuthentication = env.refresh();
  env.invalidate(); // Login/register/logout starts.
  const duringAuthentication = env.refresh();
  env.requests[0].resolve({ me: { id: "account-a" }, tickets: [] });
  assert.equal(await beforeAuthentication, false);
  env.invalidate(); // The authentication mutation finishes.
  const afterAuthentication = env.refresh();
  const current = { me: { id: "account-b" }, tickets: [] };
  env.requests[2].resolve(current);
  assert.equal(await afterAuthentication, true);
  env.requests[1].resolve({ me: { id: "account-a" }, tickets: [] });
  assert.equal(await duringAuthentication, false);
  assert.deepEqual(env.applied, [current]);
});

test("a stale rejection resolves false without exposing a previous account's error", async () => {
  const env = harness();
  const previous = env.refresh();
  env.invalidate();
  env.requests[0].reject(new Error("Private account A request failed"));
  assert.equal(await previous, false);
  assert.deepEqual(env.applied, []);
});

test("a failed latest request preserves the committed snapshot and never revives an older response", async () => {
  const env = harness();
  const committed = env.refresh();
  const current = { me: { id: "account-b" }, tickets: [] };
  env.requests[0].resolve(current);
  assert.equal(await committed, true);
  const previous = env.refresh();
  const latest = env.refresh();
  const error = new Error("Current refresh failed");
  env.requests[2].reject(error);
  await assert.rejects(latest, (actual) => actual === error);
  assert.deepEqual(env.applied, [current]);
  env.requests[1].resolve({ me: { id: "account-a" }, tickets: [] });
  assert.equal(await previous, false);
  assert.deepEqual(env.applied, [current]);
});

test("an old rejected refresh cannot replace the latest snapshot or produce an error", async () => {
  const env = harness();
  const previous = env.refresh();
  const latest = env.refresh();
  const snapshot = { me: null, tickets: [] };
  env.requests[1].resolve(snapshot);
  assert.equal(await latest, true);
  env.requests[0].reject(new Error("Stale signed-in request failed"));
  assert.equal(await previous, false);
  assert.deepEqual(env.applied, [snapshot]);
});

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate as nextTurn } from "node:timers/promises";
import { games } from "../src/engine.js";

// Execute the real controller against only the DOM operations it uses.
// These tests establish behavior, not browser layout or visual quality.
class FakeElement {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.disabled = false;
    this._text = "";
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => {
        const active =
          enabled === undefined ? !this.classes.has(name) : enabled;
        if (active) this.classes.add(name);
        else this.classes.delete(name);
        return active;
      },
      contains: (name) => this.classes.has(name),
    };
  }
  get textContent() {
    return (
      this._text + this.children.map((child) => child.textContent).join("")
    );
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = "";
    this.append(...children);
  }
  before(element) {
    assert.ok(this.parentNode, "before() requires a connected target");
    const siblings = this.parentNode.children;
    element.parentNode = this.parentNode;
    siblings.splice(siblings.indexOf(this), 0, element);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  async click() {
    if (!this.disabled) return this.onclick?.({ preventDefault() {} });
  }
}

const html = await readFile(
  new URL("../public/index.html", import.meta.url),
  "utf8",
);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
function fakeDocument() {
  const body = new FakeElement("body");
  body.append(...ids.map((id) => new FakeElement("div", id)));
  const find = (root, id) =>
    root.id === id
      ? root
      : root.children.map((child) => find(child, id)).find(Boolean) || null;
  return {
    documentElement: { lang: "zh-CN" },
    body,
    getElementById: (id) => find(body, id),
    createElement: (tag) => new FakeElement(tag),
  };
}
const originalGlobals = new Map(
  ["document", "localStorage", "navigator"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
const install = (key, value) =>
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
install("document", fakeDocument());
install("localStorage", { getItem: () => "zh-CN" });
install("navigator", { language: "zh-CN" });
const { createTicketHistory } = await import("../public/ticket-history.js");
after(() => {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const clock = Date.parse("2026-11-02T08:00:00Z");
function round(id, status = "paused") {
  return {
    id,
    status,
    cutoff: clock + 1800000,
    ready: clock + 172800000,
    manifest: {
      id,
      mode: "LIVE",
      price: 10,
      games: structuredClone(games),
      markets: [{ closeUTC: clock + 3600000 }],
      sources: ["YahooFinance", "Nasdaq"],
    },
    proof: null,
  };
}
function ticket(owner, roundId, i = 1) {
  return {
    id: `${owner}-ticket-${i}`,
    user_id: owner,
    round_id: roundId,
    game: "uk",
    numbers: "[1,2,3,4,5,6]",
    bonus: null,
    created: clock - 1000,
    prize: 0,
    tier: 0,
  };
}
function account(
  owner = "owner-a",
  ticketRounds = ["round-a"],
  knownRounds = [],
) {
  return {
    me: owner ? { id: owner, balance: 990 } : null,
    serverTime: clock,
    demo: false,
    games: structuredClone(games),
    tickets: ticketRounds.map((id, i) => ticket(owner || "owner-a", id, i + 1)),
    rounds: knownRounds,
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(options = {}) {
  const document = fakeDocument();
  install("document", document);
  const env = {
    document,
    state: options.state || account(),
    time: clock,
    requests: [],
    active: 0,
    peak: 0,
    refreshes: 0,
    signIns: 0,
    element(id) {
      const element = document.getElementById(id);
      assert.ok(
        element,
        `Controller element #${id} must exist in the real HTML or be inserted by the controller`,
      );
      return element;
    },
    cards() {
      return this.element("tickets").children;
    },
  };
  env.history = createTicketHistory({
    getState: () => env.state,
    now: () => env.time,
    onSignIn: () => {
      env.signIns++;
    },
    refresh: async () => {
      env.refreshes++;
      return options.refresh?.(env);
    },
    fetchRound: async (id) => {
      env.requests.push(id);
      env.active++;
      env.peak = Math.max(env.peak, env.active);
      try {
        return await (options.fetchRound
          ? options.fetchRound(env, id)
          : { round: round(id) });
      } finally {
        env.active--;
      }
    },
  });
  env.history.render();
  return env;
}

test("anonymous state hides stale private cards and its sign-in action calls only onSignIn", async () => {
  const env = harness();
  assert.equal(env.cards().length, 1);
  assert.equal(env.cards()[0].dataset.ticketId, "owner-a-ticket-1");
  env.state.me = null; // Deliberately leave the old private response attached.
  env.history.render();
  assert.equal(env.cards().length, 0);
  assert.equal(env.element("ticketHistoryLogin").hidden, false);
  assert.equal(env.element("ticketHistoryRefresh").disabled, true);
  assert.match(env.element("ticketHistorySummary").textContent, /登录后/);
  await env.element("ticketHistoryLogin").click();
  await env.history.loadOlderRounds();
  assert.equal(env.signIns, 1);
  assert.equal(env.refreshes, 0);
  assert.deepEqual(env.requests, []);
});

test("overlapping history loads share a global four-request cap and never fetch an ID twice", async () => {
  const gate = deferred();
  const roundIds = Array.from({ length: 9 }, (_, i) => `old-round-${i}`);
  const env = harness({
    state: account("owner-a", roundIds),
    fetchRound: async (_env, id) => {
      await gate.promise;
      return { round: round(id) };
    },
  });
  const first = env.history.loadOlderRounds();
  const second = env.history.loadOlderRounds();
  await nextTurn();
  const inFlight = env.active;
  const peakAtOverlap = env.peak;
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(inFlight, 4);
  assert.ok(
    peakAtOverlap <= 4,
    "independent calls must not each allocate four more workers",
  );
  assert.ok(env.peak <= 4);
  assert.equal(env.requests.length, roundIds.length);
  assert.equal(new Set(env.requests).size, roundIds.length);
  assert.ok(
    env.cards().every((card) => card.dataset.ticketStatus === "paused"),
  );
  await env.history.loadOlderRounds();
  assert.equal(
    env.requests.length,
    roundIds.length,
    "terminal cached records should not refetch on another automatic render",
  );
});

test("finishing account A's historical request after switching to B or signing out never restores A's tickets", async () => {
  for (const nextOwner of ["owner-b", null]) {
    const gate = deferred();
    const env = harness({
      fetchRound: async (_env, id) => {
        await gate.promise;
        return { round: round(id) };
      },
    });
    const load = env.history.loadOlderRounds();
    await nextTurn();
    assert.equal(env.active, 1);
    if (nextOwner)
      env.state = account(nextOwner, ["round-b"], [round("round-b")]);
    else env.state.me = null;
    env.history.render();
    gate.resolve();
    await load;
    assert.equal(
      env.cards().some((card) => card.dataset.ticketId === "owner-a-ticket-1"),
      false,
    );
    assert.equal(
      env.element("tickets").textContent.includes("owner-a-ticket-1"),
      false,
    );
    if (nextOwner) {
      assert.equal(env.cards().length, 1);
      assert.equal(env.cards()[0].dataset.ticketId, "owner-b-ticket-1");
    } else {
      assert.equal(env.cards().length, 0);
      assert.equal(env.element("ticketHistoryLogin").hidden, false);
    }
  }
});

test("failed or mismatched historical responses remain unverified, back off and retry on explicit refresh", async () => {
  let fail = true;
  const env = harness({
    state: account("owner-a", ["unavailable-old", "mismatched-old"]),
    fetchRound: async (_env, id) => {
      if (fail && id === "unavailable-old")
        throw new Error("Public record temporarily unavailable");
      return { round: round(fail ? "wrong-round" : id) };
    },
  });
  await env.history.loadOlderRounds();
  assert.equal(env.requests.length, 2);
  assert.ok(
    env.cards().every((card) => card.dataset.ticketStatus === "unverified"),
  );
  assert.equal(env.element("ticketHistoryLoadStatus").hidden, false);
  assert.match(
    env.element("ticketHistoryLoadStatus").textContent,
    /状态保留为待核实/,
  );
  env.time += 1000;
  await env.history.loadOlderRounds();
  await env.history.loadOlderRounds();
  assert.equal(
    env.requests.length,
    2,
    "automatic rendering must honor failure backoff",
  );
  fail = false;
  await env.element("ticketHistoryRefresh").click();
  assert.equal(env.refreshes, 1);
  assert.equal(
    env.requests.length,
    4,
    "an explicit refresh retries both failed records before the automatic backoff expires",
  );
  assert.ok(
    env.cards().every((card) => card.dataset.ticketStatus === "paused"),
  );
  assert.equal(env.element("ticketHistoryLoadStatus").hidden, true);
  assert.equal(env.element("ticketHistoryRefresh").disabled, false);
});

test("an earlier account's refresh rejection and finally cannot overwrite the next account's busy state or show its error", async () => {
  const first = deferred(),
    second = deferred();
  const env = harness({
    state: account("owner-a", ["round-a"], [round("round-a")]),
    refresh: (current) =>
      current.refreshes === 1 ? first.promise : second.promise,
  });
  const a = env.element("ticketHistoryRefresh").onclick();
  await nextTurn();
  assert.equal(env.element("ticketHistoryRefresh").disabled, true);
  assert.match(env.element("ticketHistoryRefresh").textContent, /正在刷新/);
  await env.element("ticketHistoryRefresh").onclick();
  assert.equal(env.refreshes, 1, "busy refresh must ignore another activation");
  env.state = account("owner-b", ["round-b"], [round("round-b")]);
  env.history.render();
  assert.equal(env.element("ticketHistoryRefresh").disabled, false);
  const b = env.element("ticketHistoryRefresh").onclick();
  await nextTurn();
  first.reject(new Error("Account A refresh failed"));
  await a;
  assert.equal(env.refreshes, 2);
  assert.equal(
    env.element("ticketHistoryRefresh").disabled,
    true,
    "A's finally must not clear B's independent in-flight refresh",
  );
  assert.match(env.element("ticketHistoryRefresh").textContent, /正在刷新/);
  assert.equal(
    env.element("ticketHistoryLoadStatus").hidden,
    true,
    "an account A error must not be shown to account B",
  );
  assert.equal(env.cards()[0].dataset.ticketId, "owner-b-ticket-1");
  second.resolve();
  await b;
  assert.equal(env.element("ticketHistoryRefresh").disabled, false);
  assert.equal(env.element("ticketHistoryLoadStatus").hidden, true);
  assert.equal(env.cards()[0].dataset.ticketId, "owner-b-ticket-1");
});

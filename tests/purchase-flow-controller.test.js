import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { games } from "../src/engine.js";

// Deliberately small DOM surface: the actual controller owns all flow decisions.
class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set();
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.value = "";
    this._text = "";
    this.classList = {
      toggle: (name, enabled) => {
        const value = enabled === undefined ? !this.classes.has(name) : enabled;
        if (value) this.classes.add(name);
        else this.classes.delete(name);
        return value;
      },
      contains: (name) => this.classes.has(name),
    };
  }
  get textContent() {
    return (
      this._text +
      this.children
        .map((child) => (typeof child === "string" ? child : child.textContent))
        .join("")
    );
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this._text = "";
    this.children = [...children];
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  focus() {
    this.focused = true;
  }
  scrollIntoView() {
    this.scrolled = true;
  }
  showModal() {
    this.open = true;
  }
  close() {
    if (!this.open) return;
    this.open = false;
    for (const handler of this.listeners.get("close") || [])
      handler({ target: this });
  }
  async emit(type, fields = {}) {
    const event = {
      target: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...fields,
    };
    await this[`on${type}`]?.(event);
    for (const handler of this.listeners.get(type) || []) await handler(event);
    return event;
  }
  async click() {
    if (!this.disabled) await this.emit("click");
  }
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

const html = await readFile(
  new URL("../public/index.html", import.meta.url),
  "utf8",
);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
function fakeDocument() {
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const tabs = new FakeElement();
  const steps = Array.from({ length: 4 }, () => new FakeElement());
  return {
    documentElement: { lang: "zh-CN" },
    getElementById: (id) => elements.get(id) ?? null,
    createElement: () => new FakeElement(),
    querySelector: (selector) =>
      selector === ".auth-tabs"
        ? tabs
        : selector.startsWith("#")
          ? (elements.get(selector.slice(1)) ?? null)
          : null,
    querySelectorAll: (selector) =>
      selector === "[data-onboarding-step]" ? steps : [],
  };
}

const originalGlobals = new Map(
  ["document", "localStorage", "navigator", "sessionStorage", "matchMedia"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  ),
);
function install(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
install("document", fakeDocument());
const languageStorage = new MemoryStorage();
languageStorage.setItem("market-luck-language", "zh-CN");
install("localStorage", languageStorage);
install("navigator", { language: "zh-CN" });
install("matchMedia", () => ({ matches: true }));
install("sessionStorage", new MemoryStorage());
const { createPurchaseFlow } = await import("../public/purchase-flow.js");
after(() => {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const cutoff = Date.parse("2026-11-02T08:30:00Z");
const pendingKey = "market-luck-pending-ticket-v1:user-one";
const picks = () => ({ gameId: "uk", main: [6, 1, 5, 2, 4, 3], bonus: null });
function round(id = "round-one", end = cutoff) {
  return {
    id,
    status: "open",
    cutoff: end,
    ready: end + 172800000,
    commitment: "locked-commitment",
    manifest: {
      id,
      mode: "DEMO",
      price: 10,
      cutoff: end,
      ready: end + 172800000,
      games: structuredClone(games),
      sources: ["FIXTURE-v1"],
      markets: [{ symbol: "XNAS:AAPL", closeUTC: end + 3600000 }],
      payout: [50, 30, 20],
    },
  };
}
function initialState(anonymous = false) {
  return {
    demo: true,
    games: structuredClone(games),
    rounds: [round()],
    me: anonymous
      ? null
      : { id: "user-one", name: "controller-test", balance: 1000 },
    tickets: [],
    pool: 100000,
  };
}
function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness(options = {}) {
  const document = fakeDocument();
  const storage = options.storage || new MemoryStorage();
  install("document", document);
  install("sessionStorage", storage);
  const env = {
    document,
    storage,
    server: options.server || initialState(options.anonymous),
    client: null,
    selection: options.selection || picks(),
    clock: options.clock || { now: cutoff - 1000 },
    calls: [],
    notifications: [],
    deductions: 0,
    refreshCount: 0,
    flow: null,
    element: (id) => {
      const element = document.getElementById(id);
      assert.ok(
        element,
        `The real page must contain controller element #${id}`,
      );
      return element;
    },
  };
  env.client = structuredClone(env.server);
  env.buyCalls = () => env.calls.filter((call) => call.path === "buy");
  env.accept = (body, ticketId = `ticket-${env.server.tickets.length + 1}`) => {
    const old = env.server.tickets.find(
      (ticket) => ticket.request_key === body.key,
    );
    if (old) return { ok: true, id: old.id, replayed: true };
    const sale = env.server.rounds.find((item) => item.id === body.round);
    if (!sale || sale.status !== "open" || env.clock.now >= sale.cutoff)
      throw httpError("已停售");
    if (env.server.me.balance < 10) throw httpError("积分不足");
    env.server.me.balance -= 10;
    env.server.pool += 10;
    env.deductions++;
    env.server.tickets.unshift({
      id: ticketId,
      user_id: env.server.me.id,
      round_id: body.round,
      game: body.game,
      numbers: JSON.stringify([...body.main].sort((a, b) => a - b)),
      bonus: body.bonus,
      request_key: body.key,
      created: env.clock.now,
      prize: 0,
      tier: 0,
    });
    return { ok: true, id: ticketId };
  };
  env.refresh = async () => {
    env.refreshCount++;
    await options.beforeRefresh?.(env);
    env.client = structuredClone(env.server);
    env.flow?.render();
  };
  env.api = async (path, body) => {
    env.calls.push({ path, body: structuredClone(body) });
    if (path === "register" || path === "login") {
      env.server.me ||= { id: "user-one", name: body.name, balance: 1000 };
      return { ok: true };
    }
    assert.equal(path, "buy", "Controller must not invoke administrative APIs");
    if (options.buy) return options.buy(env, body);
    return env.accept(body);
  };
  env.flow = createPurchaseFlow({
    getState: () => env.client,
    getSelection: () => env.selection,
    refresh: env.refresh,
    api: env.api,
    now: () => env.clock.now,
    onRandom: () => {
      env.selection = picks();
      env.flow.render();
    },
    onPickAgain: () => {
      env.selection = { gameId: "uk", main: [], bonus: null };
    },
    notify: (message) => env.notifications.push(message),
  });
  env.authenticate = async (mode) => {
    await env
      .element(mode === "login" ? "authLoginTab" : "authRegisterTab")
      .click();
    env.element("name").value = "controller-test";
    env.element("password").value = "controller-only-password";
    await env
      .element("authForm")
      .emit("submit", { submitter: env.element("authSubmit") });
  };
  return env;
}

test("anonymous complete picks open authentication; register and login both preserve picks and only open review", async () => {
  for (const mode of ["register", "login"]) {
    const env = harness({ anonymous: true });
    const selection = structuredClone(env.selection);
    await env.element("buy").click();
    assert.equal(env.element("auth").open, true);
    assert.equal(env.element("purchaseReview").open, false);
    assert.equal(env.buyCalls().length, 0);
    await env.authenticate(mode);
    assert.equal(env.element("auth").open, false);
    assert.equal(env.element("purchaseReview").open, true);
    assert.deepEqual(env.selection, selection);
    assert.equal(
      env.buyCalls().length,
      0,
      "successful authentication must not automatically buy",
    );
    assert.equal(env.server.me.balance, 1000);
    assert.match(env.element("reviewNumbers").textContent, /010203040506/);
    assert.equal(env.element("password").value, "");
  }
});

test("cancelling authentication or ticket review creates no ticket and spends no points", async () => {
  let env = harness({ anonymous: true });
  await env.element("buy").click();
  await env.element("closeAuth").click();
  assert.equal(env.element("auth").open, false);
  assert.equal(env.calls.length, 0);
  env = harness();
  await env.element("buy").click();
  assert.equal(env.element("purchaseReview").open, true);
  await env.element("cancelPurchase").click();
  assert.equal(env.element("purchaseReview").open, false);
  assert.equal(env.buyCalls().length, 0);
  assert.equal(env.server.me.balance, 1000);
  assert.equal(env.server.tickets.length, 0);
});

test("explicit confirmation needs a matching refreshed private ticket before showing success", async () => {
  const env = harness({ buy: () => ({ ok: true, id: "accepted-ticket" }) });
  await env.element("buy").click();
  assert.equal(env.buyCalls().length, 0);
  await env.element("confirmPurchase").click();
  assert.equal(env.buyCalls().length, 1);
  assert.equal(
    env.element("purchaseReceipt").hidden,
    true,
    "an accepted response is not a confirmed private ticket",
  );
  assert.equal(env.element("purchaseReview").open, true);
  const body = env.buyCalls()[0].body;
  env.accept(body, "accepted-ticket");
  env.server.tickets[0].numbers = "[1,2,3,4,5,7]";
  await env.refresh();
  assert.equal(
    env.element("purchaseReceipt").hidden,
    true,
    "a ticket ID with different numbers must not claim success",
  );
  env.server.tickets[0].numbers = JSON.stringify(
    [...body.main].sort((a, b) => a - b),
  );
  await env.refresh();
  assert.equal(env.element("purchaseReceipt").hidden, false);
  assert.equal(env.element("purchaseReview").open, false);
  assert.match(env.element("receiptTicket").textContent, /accepted-ticket/);
  assert.match(env.element("receiptBalance").textContent, /990/);
  assert.equal(env.storage.getItem(pendingKey), null);
});

test("two confirm events while refresh is in flight cause one purchase and one debit", async () => {
  const gate = deferred();
  const env = harness({
    beforeRefresh: async (e) => {
      if (e.refreshCount === 1) await gate.promise;
    },
  });
  await env.element("buy").click();
  const first = env.element("confirmPurchase").onclick();
  const second = env.element("confirmPurchase").onclick();
  assert.equal(env.element("confirmPurchase").disabled, true);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(env.buyCalls().length, 1);
  assert.equal(env.deductions, 1);
  assert.equal(env.server.me.balance, 990);
  assert.equal(env.element("purchaseReceipt").hidden, false);
});

test("a balance change discovered on refresh requires another explicit confirmation", async () => {
  const env = harness();
  await env.element("buy").click();
  env.server.me.balance = 900;
  await env.element("confirmPurchase").click();
  assert.equal(env.buyCalls().length, 0);
  assert.match(env.element("reviewError").textContent, /余额已更新/);
  assert.match(env.element("reviewBalance").textContent, /900/);
  assert.equal(env.element("purchaseReview").open, true);
  await env.element("confirmPurchase").click();
  assert.equal(env.buyCalls().length, 1);
  assert.equal(env.server.me.balance, 890);
  assert.equal(env.element("purchaseReceipt").hidden, false);
});

test("an interrupted response after server acceptance recovers from private tickets without another debit", async () => {
  const env = harness({
    buy: (e, body) => {
      e.accept(body);
      throw new TypeError("Network response interrupted");
    },
  });
  await env.element("buy").click();
  await env.element("confirmPurchase").click();
  assert.equal(env.buyCalls().length, 1);
  assert.equal(env.deductions, 1);
  assert.equal(env.server.me.balance, 990);
  assert.equal(env.server.tickets.length, 1);
  assert.equal(env.element("purchaseReceipt").hidden, false);
  assert.equal(env.storage.getItem(pendingKey), null);
});

test("a request lost before reaching the server retries the same persisted key", async () => {
  const env = harness({
    buy: (e, body) => {
      if (e.buyCalls().length === 1)
        throw new TypeError("Network unavailable before send");
      return e.accept(body);
    },
  });
  await env.element("buy").click();
  await env.element("confirmPurchase").click();
  assert.equal(env.server.tickets.length, 0);
  assert.equal(env.element("purchaseReceipt").hidden, true);
  const pending = JSON.parse(env.storage.getItem(pendingKey));
  assert.equal(pending.submitted, true);
  await env.element("confirmPurchase").click();
  assert.equal(env.buyCalls().length, 2);
  assert.equal(env.buyCalls()[0].body.key, env.buyCalls()[1].body.key);
  assert.equal(env.buyCalls()[1].body.key, pending.key);
  assert.equal(env.server.tickets.length, 1);
  assert.equal(env.deductions, 1);
  assert.equal(env.element("purchaseReceipt").hidden, false);
});

async function unansweredPending() {
  const env = harness({
    buy: () => {
      throw new TypeError("Network unavailable before send");
    },
  });
  await env.element("buy").click();
  await env.element("confirmPurchase").click();
  assert.equal(env.buyCalls().length, 1);
  assert.equal(env.server.tickets.length, 0);
  return { env, pending: JSON.parse(env.storage.getItem(pendingKey)) };
}

test("reloading restores an unanswered intent even with empty selection and keeps the query entry enabled", async () => {
  const { env: previous, pending } = await unansweredPending();
  const env = harness({
    server: previous.server,
    storage: previous.storage,
    selection: { gameId: "uk", main: [], bonus: null },
  });
  assert.equal(
    env.element("buy").disabled,
    false,
    "pending-query access must not depend on freshly selecting numbers",
  );
  assert.match(env.element("buy").textContent, /查询/);
  await env.element("buy").click();
  assert.equal(env.element("purchaseReview").open, true);
  assert.match(env.element("reviewNumbers").textContent, /010203040506/);
  assert.equal(env.buyCalls().length, 0);
  await env.element("confirmPurchase").click();
  assert.equal(env.buyCalls().length, 1);
  assert.equal(env.buyCalls()[0].body.key, pending.key);
  assert.equal(env.deductions, 1);
  assert.equal(env.element("purchaseReceipt").hidden, false);
  assert.equal(env.storage.getItem(pendingKey), null);
});

test("an expired unanswered intent receives a terminal server rejection, releases its lock and permits a new round", async () => {
  const { env: previous, pending } = await unansweredPending();
  previous.server.rounds[0].status = "settled";
  previous.server.rounds.unshift(round("round-two", cutoff + 86400000));
  const env = harness({
    server: previous.server,
    storage: previous.storage,
    selection: { gameId: "uk", main: [], bonus: null },
    clock: { now: cutoff + 1000 },
  });
  assert.equal(env.element("buy").disabled, false);
  await env.element("buy").click();
  await env.element("confirmPurchase").click();
  assert.equal(
    env.buyCalls().length,
    1,
    "a submitted historical key is queried/replayed even after its round stops being the current draft",
  );
  assert.equal(env.buyCalls()[0].body.key, pending.key);
  assert.equal(env.buyCalls()[0].body.round, "round-one");
  assert.equal(env.deductions, 0);
  assert.equal(
    env.storage.getItem(pendingKey),
    null,
    "an explicit closed/not-found response resolves the old intent",
  );
  assert.equal(env.element("purchaseReview").open, false);
  assert.equal(env.element("purchaseReceipt").hidden, true);
  assert.ok(
    env.notifications.some((message) =>
      /未购|未成功|未购买|没有购|未扣|未形成票据/.test(message),
    ),
    "terminal resolution must tell the user no ticket was bought",
  );
  env.selection = picks();
  env.flow.render();
  assert.equal(env.element("buy").disabled, false);
  await env.element("buy").click();
  await env.element("confirmPurchase").click();
  assert.equal(env.buyCalls().length, 2);
  assert.equal(env.buyCalls()[1].body.round, "round-two");
  assert.notEqual(env.buyCalls()[1].body.key, pending.key);
  assert.equal(env.deductions, 1);
  assert.equal(env.server.me.balance, 990);
  assert.equal(env.element("purchaseReceipt").hidden, false);
});

for (const outcome of ["accepted", "rejected", "expired", "interrupted"]) {
  test(`a late ${outcome} response from account A cannot overwrite or delete account B's pending request`, async () => {
    const previous = outcome === "expired" ? await unansweredPending() : null;
    const secondState = initialState();
    secondState.me.id = "user-two";
    const second = harness({
      server: secondState,
      buy: () => {
        throw new TypeError("Account B's request has an unknown outcome");
      },
    });
    await second.element("buy").click();
    await second.element("confirmPurchase").click();
    const secondKey = "market-luck-pending-ticket-v1:user-two";
    const secondSaved = second.storage.getItem(secondKey);
    assert.ok(
      secondSaved,
      "account B must have a real persisted controller request",
    );
    if (previous)
      second.storage.setItem(
        pendingKey,
        previous.env.storage.getItem(pendingKey),
      );

    const sent = deferred();
    const release = deferred();
    let firstState;
    const server = previous ? previous.env.server : initialState();
    if (previous) server.rounds[0].status = "settled";
    const env = harness({
      server,
      storage: second.storage,
      clock: { now: cutoff + (previous ? 1000 : -1000) },
      buy: async (e, body) => {
        if (e.buyCalls().length > 1) return e.accept(body);
        const response =
          outcome === "accepted" ? e.accept(body, "account-a-ticket") : null;
        firstState = structuredClone(e.server);
        sent.resolve();
        await release.promise;
        if (outcome === "accepted") return response;
        if (outcome === "interrupted")
          throw new TypeError("Account A's response was interrupted");
        throw httpError(outcome === "expired" ? "已停售" : "积分不足");
      },
    });
    await env.element("buy").click();
    const confirmation = env.element("confirmPurchase").click();
    await sent.promise;
    const firstSaved = env.storage.getItem(pendingKey);
    const firstPending = JSON.parse(firstSaved);
    env.server = structuredClone(second.server);
    await env.refresh();
    assert.equal(env.element("purchaseReceipt").hidden, true);
    release.resolve();
    await confirmation;

    assert.equal(
      env.storage.getItem(secondKey),
      secondSaved,
      "account A's late response must not change B's persisted key, draft or receipt ID",
    );
    assert.equal(
      env.storage.getItem(pendingKey),
      firstSaved,
      "account A's unanswered request must remain available when A returns",
    );
    assert.equal(env.element("purchaseReceipt").hidden, true);
    assert.equal(env.element("confirmPurchase").disabled, true);
    assert.equal(env.server.me.id, "user-two");
    assert.equal(env.server.me.balance, 1000);
    assert.equal(env.server.tickets.length, 0);

    env.server = firstState;
    await env.refresh();
    if (outcome === "accepted") {
      assert.equal(env.element("purchaseReceipt").hidden, false);
      assert.match(
        env.element("receiptTicket").textContent,
        /account-a-ticket/,
      );
      assert.equal(env.buyCalls().length, 1);
      assert.equal(env.deductions, 1);
    } else {
      await env.element("closeReview").click();
      await env.element("buy").click();
      await env.element("confirmPurchase").click();
      assert.equal(env.buyCalls().length, 2);
      assert.equal(env.buyCalls()[1].body.key, firstPending.key);
      assert.equal(env.deductions, outcome === "expired" ? 0 : 1);
    }
    assert.equal(env.storage.getItem(pendingKey), null);
    assert.equal(env.storage.getItem(secondKey), secondSaved);
  });
}

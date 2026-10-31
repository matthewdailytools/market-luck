import { test } from "node:test";
import assert from "node:assert/strict";
import { games } from "../src/engine.js";
import {
  validatePurchaseDraft,
  sameDraft,
  validatePurchaseReceipt,
  findConfirmedTicket,
} from "../public/purchase-flow-model.js";

const cutoff = Date.parse("2026-11-02T08:30:00Z");
const now = cutoff - 1000;
function state(mode = "LIVE") {
  return {
    demo: mode === "DEMO",
    games: structuredClone(games),
    me: { id: "user-one", balance: 1000 },
    tickets: [],
    rounds: [
      {
        id: "round-one",
        status: "open",
        cutoff,
        commitment: "locked-commitment",
        manifest: {
          id: "round-one",
          mode,
          cutoff,
          price: 10,
          games: structuredClone(games),
          payout: [50, 30, 20],
          markets: [{ symbol: "XNAS:AAPL", date: "2026-11-02" }],
        },
      },
    ],
  };
}
const validate = (input = {}) =>
  validatePurchaseDraft({
    state: state(),
    gameId: "de",
    main: [6, 1, 5, 2, 4, 3],
    bonus: 0,
    now,
    ...input,
  });

test("legal Germany zero is a sorted immutable review intent, not an automatic purchase", () => {
  const result = validate();
  assert.equal(result.phase, "ready");
  assert.equal(result.canReview, true);
  assert.equal(result.canSubmit, true);
  assert.deepEqual(result.draft.main, [1, 2, 3, 4, 5, 6]);
  assert.equal(result.draft.bonus, 0);
  assert.equal(result.draft.price, 10);
  assert.equal(result.draft.cutoff, cutoff);
  assert.equal(result.game.bonusMin, 0);
  assert.equal(Object.isFrozen(result.draft), true);
  assert.equal(Object.isFrozen(result.draft.main), true);
  assert.throws(() => result.draft.main.push(7), TypeError);
});

test("server cutoff is exclusive, and only open periods can produce a draft", () => {
  assert.equal(validate({ now: cutoff - 1 }).phase, "ready");
  for (const time of [cutoff, cutoff + 1, cutoff + 86400000]) {
    const result = validate({ now: time });
    assert.equal(result.phase, "closed");
    assert.equal(result.canSubmit, false);
    assert.equal(result.canReview, false);
    assert.equal(result.draft, null);
  }
  for (const status of ["paused", "settled", "draft"]) {
    const input = state();
    input.rounds[0].status = status;
    assert.equal(validate({ state: input }).phase, "no-round");
  }
  const input = state();
  input.rounds.unshift({ id: "history", status: "settled" });
  assert.equal(validate({ state: input }).draft.round, "round-one");
});

test("loading and malformed schedules cannot create a purchasable confirmation", () => {
  assert.equal(validate({ state: undefined }).phase, "loading");
  const malformed = [
    (s) => {
      delete s.rounds;
    },
    (s) => {
      s.rounds.push(structuredClone(s.rounds[0]));
    },
    (s) => {
      s.rounds[0].id = "<unsafe>";
    },
    (s) => {
      s.rounds[0].manifest.id = "wrong-round";
    },
    (s) => {
      s.rounds[0].manifest.mode = "UNKNOWN";
    },
    (s) => {
      s.rounds[0].cutoff = NaN;
    },
    (s) => {
      s.rounds[0].cutoff = "2026-11-02";
    },
    (s) => {
      s.rounds[0].cutoff = 0;
    },
    (s) => {
      s.rounds[0].manifest.games = [];
    },
    (s) => {
      delete s.rounds[0].manifest.games;
    },
    (s) => {
      s.rounds[0].manifest.games[0].max = -1;
    },
    (s) => {
      s.rounds[0].manifest.games.push(s.rounds[0].manifest.games[0]);
    },
  ];
  for (const mutate of malformed) {
    const input = state();
    mutate(input);
    const result = validate({ state: input });
    assert.equal(result.phase, "malformed-round", mutate.toString());
    assert.equal(result.draft, null);
    assert.equal(result.canReview, false);
  }
  for (const time of [undefined, NaN, Infinity, -1])
    assert.equal(validate({ now: time }).phase, "malformed-round");
});

test("both LIVE and DEMO use the committed 10-point price supported by D1", () => {
  for (const mode of ["LIVE", "DEMO"]) {
    assert.equal(validate({ state: state(mode) }).draft.price, 10);
    for (const price of [
      undefined,
      null,
      "10",
      0,
      -10,
      1.5,
      20,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const input = state(mode);
      input.rounds[0].manifest.price = price;
      const result = validate({ state: input });
      assert.equal(
        result.phase,
        "malformed-round",
        `${mode} price ${String(price)}`,
      );
      assert.equal(result.draft, null);
    }
  }
  const demo = state("DEMO");
  demo.rounds[0].manifest.cutoff = cutoff + 86400000;
  demo.rounds[0].cutoff = cutoff;
  assert.equal(
    validate({ state: demo, now: cutoff }).phase,
    "closed",
    "a simulated runtime cutoff, not its original future manifest time, closes sales",
  );
});

test("locked formats take precedence over a newer global catalog", () => {
  const input = state();
  input.rounds[0].manifest.games = [
    { id: "jp", name: "日本 · 六之幸", count: 2, max: 10, bonus: 0 },
  ];
  assert.equal(validate({ state: input, gameId: "de" }).phase, "choose");
  const result = validate({
    state: input,
    gameId: "jp",
    main: [10, 2],
    bonus: null,
  });
  assert.equal(result.phase, "ready");
  assert.deepEqual(result.draft.main, [2, 10]);
  assert.equal(result.game.count, 2);
  assert.equal(validate({ gameId: undefined }).phase, "choose");
});

test("number count, uniqueness, ranges and bonus rules gate review before authentication", () => {
  for (const main of [
    null,
    [],
    [1, 2],
    [1, 2, 3, 4, 5, 6, 7],
    [1, 1, 3, 4, 5, 6],
    [0, 2, 3, 4, 5, 6],
    [50, 2, 3, 4, 5, 6],
    [1.5, 2, 3, 4, 5, 6],
    ["1", 2, 3, 4, 5, 6],
  ]) {
    const result = validate({ main });
    assert.equal(result.phase, "incomplete");
    assert.equal(result.canReview, false);
    assert.equal(result.draft, null);
  }
  for (const bonus of [null, -1, 10, "0", 0.5, NaN])
    assert.equal(validate({ bonus }).phase, "incomplete");
  assert.equal(validate({ gameId: "uk", bonus: null }).phase, "ready");
  assert.equal(validate({ gameId: "uk", bonus: 0 }).phase, "incomplete");
  assert.equal(validate({ gameId: "cn", bonus: 0 }).phase, "incomplete");
  const result = validate({ main: [1, 2], bonus: null });
  assert.equal(result.missingMain, 4);
  assert.equal(result.missingBonus, true);
});

test("anonymous valid picks survive sign-in as the same intent and require explicit re-review", () => {
  const input = state();
  input.me = null;
  const beforeLogin = validate({ state: input });
  assert.equal(beforeLogin.phase, "auth");
  assert.equal(beforeLogin.canReview, true);
  assert.equal(beforeLogin.canSubmit, false);
  assert.ok(beforeLogin.draft);
  assert.equal(validate({ state: input, main: [1] }).phase, "incomplete");
  input.me = { id: "newly-registered", balance: 1000 };
  const afterLogin = validate({ state: input });
  assert.equal(afterLogin.phase, "ready");
  assert.equal(sameDraft(beforeLogin.draft, afterLogin.draft), true);
  assert.equal(
    beforeLogin.canSubmit,
    false,
    "a previous anonymous validation does not turn into a purchase after registration",
  );
});

test("zero, insufficient and unavailable balances never permit submission", () => {
  for (const balance of [
    0,
    9,
    undefined,
    null,
    -1,
    "1000",
    10.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const input = state();
    input.me.balance = balance;
    const result = validate({ state: input });
    assert.equal(result.phase, "insufficient", String(balance));
    assert.equal(result.canReview, true);
    assert.equal(result.canSubmit, false);
    assert.ok(result.draft);
    assert.equal(
      result.balance,
      Number.isSafeInteger(balance) && balance >= 0 ? balance : null,
    );
  }
  const input = state();
  input.me.balance = 10;
  assert.equal(validate({ state: input }).phase, "ready");
});

test("a refreshed draft cannot quietly swap a round, rule, price, cutoff or numbers", () => {
  const original = validate().draft;
  assert.equal(
    sameDraft(original, validate({ main: [1, 2, 3, 4, 5, 6] }).draft),
    true,
  );
  const mutations = [
    (s) => {
      s.rounds[0].id = "next-round";
      s.rounds[0].manifest.id = "next-round";
    },
    (s) => {
      s.rounds[0].manifest.games.find((g) => g.id === "de").max = 50;
    },
    (s) => {
      s.rounds[0].manifest.games.find((g) => g.id === "de").bonusMin = 1;
    },
    (s) => {
      s.rounds[0].manifest.payout = [60, 20, 20];
    },
    (s) => {
      s.rounds[0].manifest.markets[0].symbol = "XNAS:MSFT";
    },
    (s) => {
      s.rounds[0].manifest.price = 20;
    },
    (s) => {
      s.rounds[0].cutoff++;
    },
    (s) => {
      s.rounds[0].commitment = "different-commitment";
    },
  ];
  for (const mutate of mutations) {
    const input = state();
    mutate(input);
    assert.equal(
      sameDraft(original, validate({ state: input }).draft),
      false,
      mutate.toString(),
    );
  }
  assert.equal(sameDraft(original, validate({ bonus: 1 }).draft), false);
  assert.equal(
    sameDraft(original, validate({ main: [1, 2, 3, 4, 5, 7] }).draft),
    false,
  );
  assert.equal(sameDraft(original, validate({ now: cutoff }).draft), false);
  assert.equal(sameDraft(null, null), false);
  const input = state();
  input.rounds[0].manifest = Object.fromEntries(
    Object.entries(input.rounds[0].manifest).reverse(),
  );
  assert.equal(
    sameDraft(original, validate({ state: input }).draft),
    true,
    "JSON object order alone must not invalidate the same rules",
  );
});

test("receipt acceptance is strict and remains distinct from an actual matching ticket", () => {
  const draft = validate().draft;
  const receipt = validatePurchaseReceipt(
    { ok: true, id: "ticket-one" },
    draft,
  );
  assert.equal(receipt.id, "ticket-one");
  assert.equal(receipt.replayed, false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(sameDraft(receipt.draft, draft), true);
  assert.equal(
    validatePurchaseReceipt(
      { ok: true, id: "ticket-one", replayed: true },
      draft,
    ).replayed,
    true,
  );
  for (const response of [
    null,
    {},
    { ok: false, id: "ticket-one" },
    { ok: 1, id: "ticket-one" },
    { ok: true },
    { ok: true, id: "<unsafe>" },
    { ok: true, id: "ticket-one", replayed: "true" },
    { ok: true, id: "ticket-one", error: "failed" },
  ])
    assert.equal(validatePurchaseReceipt(response, draft), null);
  assert.equal(
    validatePurchaseReceipt({ ok: true, id: "ticket-one" }, null),
    null,
  );
  assert.equal(
    findConfirmedTicket(state(), receipt),
    null,
    "an API acceptance without a refreshed ticket is not yet confirmed",
  );
});

function confirmedState(receipt) {
  const input = state();
  input.me.balance = 0;
  input.rounds[0].status = "settled";
  input.tickets = [
    {
      id: receipt.id,
      user_id: input.me.id,
      round_id: receipt.draft.round,
      game: receipt.draft.game,
      numbers: "[6,5,4,3,2,1]",
      bonus: 0,
      created: now,
    },
  ];
  return input;
}

test("fresh tickets must match receipt identity, current owner and every chosen number including zero", () => {
  const receipt = validatePurchaseReceipt(
    { ok: true, id: "ticket-one" },
    validate().draft,
  );
  const input = confirmedState(receipt);
  const ticket = findConfirmedTicket(input, receipt);
  assert.deepEqual(ticket.main, [1, 2, 3, 4, 5, 6]);
  assert.equal(ticket.bonus, 0);
  assert.equal(ticket.round, "round-one");
  assert.equal(Object.isFrozen(ticket.main), true);
  const mutations = [
    (s) => {
      s.me = null;
    },
    (s) => {
      s.me.id = "different-user";
    },
    (s) => {
      s.tickets[0].id = "other-ticket";
    },
    (s) => {
      s.tickets[0].user_id = "different-user";
    },
    (s) => {
      s.tickets[0].round_id = "other-round";
    },
    (s) => {
      s.tickets[0].game = "cn";
    },
    (s) => {
      s.tickets[0].bonus = null;
    },
    (s) => {
      s.tickets[0].numbers = "[1,2,3,4,5,7]";
    },
    (s) => {
      s.tickets[0].numbers = "[1,1,3,4,5,6]";
    },
    (s) => {
      s.tickets[0].numbers = "[1,2,3,4,5,6.5]";
    },
    (s) => {
      s.tickets[0].numbers = "not JSON";
    },
    (s) => {
      s.tickets[0].numbers = [1, 2, 3, 4, 5, 6];
    },
  ];
  for (const mutate of mutations) {
    const different = confirmedState(receipt);
    mutate(different);
    assert.equal(
      findConfirmedTicket(different, receipt),
      null,
      mutate.toString(),
    );
  }
});

test("validation and receipt confirmation do not mutate or alias input selections", () => {
  const input = {
    state: state(),
    gameId: "de",
    main: [6, 1, 5, 2, 4, 3],
    bonus: 0,
    now,
  };
  const before = structuredClone(input);
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  freeze(input);
  const result = validatePurchaseDraft(input);
  const receipt = validatePurchaseReceipt(
    { ok: true, id: "ticket-one" },
    result.draft,
  );
  const saved = confirmedState(receipt);
  const savedBefore = structuredClone(saved);
  freeze(saved);
  findConfirmedTicket(saved, receipt);
  assert.deepEqual(input, before);
  assert.deepEqual(saved, savedBefore);
  assert.notEqual(result.draft.main, input.main);
});

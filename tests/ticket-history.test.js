import { test } from "node:test";
import assert from "node:assert/strict";
import { games } from "../src/engine.js";
import { describeTicketHistory } from "../public/ticket-history-model.js";

const cutoff = Date.parse("2026-11-02T08:30:00Z");
const close = Date.parse("2026-11-02T21:00:00Z");
const ready = Date.parse("2026-11-03T21:00:00Z");
function round(
  id = "round-one",
  status = "open",
  mode = "LIVE",
  catalog = games,
) {
  const manifest = {
    id,
    mode,
    price: 10,
    games: structuredClone(catalog),
    cutoff,
    ready,
    sources: ["YahooFinance", "Nasdaq"],
    markets: [{ symbol: "XNAS:AAPL", date: "2026-11-02", closeUTC: close }],
  };
  return {
    id,
    status,
    cutoff,
    ready,
    manifest,
    proof:
      status === "settled"
        ? {
            mode,
            manifest: structuredClone(manifest),
            ...(mode === "DEMO"
              ? { simulatedClock: true }
              : { execution: "LIVE_REAL_CLOCK" }),
            results: Object.fromEntries(
              catalog.map((game) => [
                game.id,
                {
                  main: Array.from({ length: game.count }, (_, i) => i + 1),
                  bonus: game.bonus ? (game.bonusMin ?? 1) : null,
                },
              ]),
            ),
          }
        : null,
  };
}
function ticket(overrides = {}) {
  return {
    id: "ticket-one",
    user_id: "user-one",
    round_id: "round-one",
    game: "uk",
    numbers: "[6,1,5,2,4,3]",
    bonus: null,
    created: cutoff - 1000,
    prize: 0,
    tier: 0,
    ...overrides,
  };
}
function state(tickets = [ticket()], rounds = [round()]) {
  return {
    me: { id: "user-one", balance: 990 },
    serverTime: cutoff - 1,
    demo: false,
    games: structuredClone(games),
    tickets,
    rounds,
  };
}
const item = (input, options) => describeTicketHistory(input, options).items[0];

test("anonymous and switched accounts cannot expose another owner's private ticket records", () => {
  const input = state([
    ticket(),
    ticket({ id: "other-ticket", user_id: "user-two" }),
  ]);
  input.me = null;
  let view = describeTicketHistory(input);
  assert.equal(view.status, "anonymous");
  assert.deepEqual(view.items, []);
  assert.equal(view.counts.shown, 0);
  assert.deepEqual(view.missingRoundIds, []);
  input.me = { id: "user-two" };
  view = describeTicketHistory(input);
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].id, "other-ticket");
  assert.equal(
    view.items.some((row) => row.id === "ticket-one"),
    false,
  );
});

test("counts describe only the owned, returned latest-100 list and preserve API order", () => {
  const input = state(
    Array.from({ length: 105 }, (_, i) => ticket({ id: `ticket-${i}` })),
  );
  input.tickets.unshift(ticket({ id: "unrelated", user_id: "other-user" }));
  const view = describeTicketHistory(input);
  assert.equal(view.items.length, 100);
  assert.equal(view.items[0].id, "ticket-0");
  assert.equal(view.items[99].id, "ticket-99");
  assert.equal(view.counts.shown, 100);
  assert.equal(view.counts.pending, 100);
  assert.equal(view.limited, true);
  assert.equal(view.limit, 100);
  assert.match(view.scopeNote, /最近100张.*不代表全部历史/);
  assert.equal(describeTicketHistory(state([])).status, "empty");
});

test("cutoff, close and ready equalities retain pending status without inventing a completed draw", () => {
  const input = state();
  for (const [now, timePhase] of [
    [cutoff - 1, "sales"],
    [cutoff, "awaitingClose"],
    [close, "confirming"],
    [ready, "waiting"],
    [ready + 86400000, "waiting"],
  ]) {
    const row = item(input, { now });
    assert.equal(row.phase, "pending");
    assert.equal(row.timePhase, timePhase);
    assert.equal(row.auditHref, "/verify.html?round=round-one");
    assert.equal(row.id, "ticket-one");
    assert.doesNotMatch(row.statusLabel, /已结算|派奖/);
  }
  assert.equal(item(input, { now: NaN }).phase, "unverified");
  input.rounds[0].ready = cutoff;
  assert.equal(item(input).phase, "unverified");
});

test("settled results distinguish a losing ticket, a paid win and a zero-point winning tier", () => {
  const settled = round("round-one", "settled");
  const input = state(
    [
      ticket({ id: "lost", numbers: "[20,21,22,23,24,25]" }),
      ticket({ id: "paid", tier: 1, prize: 125 }),
      ticket({ id: "zero-winning-tier", tier: 1, prize: 0 }),
    ],
    [settled],
  );
  const view = describeTicketHistory(input);
  assert.deepEqual(
    view.items.map((row) => row.phase),
    ["lost", "paid", "unverified"],
  );
  assert.equal(view.items[1].prizeText, "125 积分");
  assert.match(view.items[1].note, /根据账户记录.*独立复算/);
  assert.match(view.items[2].note, /命中第1档.*0积分.*不应视为未中奖/);
  assert.equal(view.counts.lost, 1);
  assert.equal(view.counts.paid, 1);
  assert.equal(view.counts.unverified, 1);
});

test("a missing, wrong-round or malformed proof and contradictory grades never claim paid or lost", () => {
  const corrupt = [
    (r) => {
      r.proof = null;
    },
    (r) => {
      r.proof.manifest.id = "another-round";
    },
    (r) => {
      r.proof.mode = "DEMO";
    },
    (r) => {
      r.proof.manifest.games[0].max++;
    },
    (r) => {
      r.proof.results.uk.main = [1, 1, 3, 4, 5, 6];
    },
    (r) => {
      r.proof.results.uk.main[0] = 60;
    },
    (r) => {
      r.proof.results.uk.bonus = 0;
    },
    (r) => {
      delete r.proof.results.cn;
    },
    (r) => {
      r.proof.execution = "UNRECOGNIZED";
    },
  ];
  for (const mutate of corrupt) {
    const settled = round("round-one", "settled");
    mutate(settled);
    assert.equal(
      item(state([ticket({ tier: 1, prize: 125 })], [settled])).phase,
      "unverified",
      mutate.toString(),
    );
  }
  const settled = round("round-one", "settled");
  assert.equal(
    item(state([ticket()], [settled])).phase,
    "unverified",
    "winning numbers with a recorded losing tier cannot claim a verified loss",
  );
  assert.equal(
    item(
      state(
        [ticket({ numbers: "[20,21,22,23,24,25]", tier: 1, prize: 125 })],
        [settled],
      ),
    ).phase,
    "unverified",
  );
  assert.equal(
    item(state([ticket({ tier: 0, prize: 125 })], [settled])).phase,
    "unverified",
  );
});

test("historical round details use that locked format and price, with exact state round precedence", () => {
  const oldCatalog = [
    {
      id: "uk",
      name: "英国 · 六重奏",
      flag: "🇬🇧",
      count: 2,
      max: 10,
      bonus: 0,
    },
  ];
  const historical = round("archived-round", "settled", "LIVE", oldCatalog);
  historical.manifest.price = 7;
  historical.proof.manifest.price = 7;
  const oldTicket = ticket({ round_id: "archived-round", numbers: "[10,9]" });
  let row = item(state([oldTicket], []), { rounds: [{ round: historical }] });
  assert.equal(row.phase, "lost");
  assert.deepEqual(row.main, [9, 10]);
  assert.equal(row.cost, 7);
  assert.equal(row.costText, "7 积分");
  assert.equal(row.auditHref, "/verify.html?round=archived-round");
  const current = round("archived-round", "paused", "LIVE", oldCatalog);
  row = item(state([oldTicket], [current]), { rounds: [historical] });
  assert.equal(
    row.phase,
    "paused",
    "supplemental cache cannot overwrite a current state record",
  );
  assert.equal(row.cost, 10);
});

test("an unavailable old round does not borrow today's rules, cost or waiting/losing status", () => {
  const input = state([
    ticket({ round_id: "unretrieved-old", numbers: "[9,10]" }),
  ]);
  const view = describeTicketHistory(input);
  const row = view.items[0];
  assert.equal(row.phase, "unverified");
  assert.equal(row.timePhase, null);
  assert.deepEqual(row.main, [9, 10]);
  assert.equal(row.cost, null);
  assert.equal(row.costText, "—");
  assert.match(row.title, /玩法规则待核实/);
  assert.match(row.note, /不能判断开奖或中奖状态.*不使用当前玩法/);
  assert.deepEqual(view.missingRoundIds, ["unretrieved-old"]);
  assert.equal(row.auditHref, "/verify.html?round=unretrieved-old");
});

test("Germany's special zero survives strict parsing, while malformed private fields are flagged", () => {
  const german = ticket({ game: "de", bonus: 0, tier: 1, prize: 10 });
  const row = item(state([german], [round("round-one", "settled")]));
  assert.equal(row.phase, "paid");
  assert.equal(row.bonus, 0);
  assert.deepEqual(row.main, [1, 2, 3, 4, 5, 6]);
  const invalid = [
    { numbers: "not JSON" },
    { numbers: [1, 2, 3, 4, 5, 6] },
    { numbers: "[]" },
    { numbers: "[1,1,3,4,5,6]" },
    { numbers: "[0,2,3,4,5,6]" },
    { numbers: "[1,2,3,4,5,60]" },
    { numbers: '["1",2,3,4,5,6]' },
    { numbers: "[1,2,3]" },
    { bonus: 0 },
    { created: 0 },
    { created: "2026-11-02" },
    { created: Infinity },
    { id: "<script>" },
    { round_id: "https://evil.invalid" },
    { game: "<unsafe>" },
    { prize: -1 },
    { prize: "10" },
    { tier: 4 },
    { tier: 1.5 },
  ];
  for (const fields of invalid)
    assert.equal(
      item(state([ticket(fields)])).phase,
      "invalid",
      JSON.stringify(fields),
    );
  const malformed = item(state([ticket({ round_id: "<bad>" })]));
  assert.equal(malformed.roundId, null);
  assert.equal(malformed.auditHref, "/verify.html");
  assert.equal(
    describeTicketHistory(state([ticket(), ticket()])).counts.invalid,
    2,
    "duplicate ticket identities cannot inflate successful counts",
  );
});

test("paused and unknown statuses clear pending or paid classifications without inventing a result", () => {
  const input = state(
    [ticket({ tier: 1, prize: 125 })],
    [round("round-one", "settled")],
  );
  assert.equal(item(input).phase, "paid");
  input.rounds[0].status = "paused";
  assert.equal(item(input).phase, "paused");
  input.rounds[0].status = "open";
  assert.equal(
    item(input).phase,
    "unverified",
    "a positive prize on an unclosed record does not establish payment",
  );
  input.rounds[0].status = "draft";
  assert.equal(item(input).phase, "unverified");
  input.tickets = [];
  assert.deepEqual(describeTicketHistory(input).items, []);
});

test("LIVE, DEMO and replay identity belongs to the original ticket round, not today's installation", () => {
  const live = round("live", "settled");
  const demo = round("demo", "settled", "DEMO");
  const replay = round("replay", "settled");
  replay.proof.execution = "ONLINE_REPLAY_SIMULATED_CLOCK";
  replay.proof.simulatedClock = true;
  const input = state(
    ["live", "demo", "replay"].map((id) =>
      ticket({ id: `ticket-${id}`, round_id: id, tier: 1, prize: 10 }),
    ),
    [live, demo, replay],
  );
  input.demo = true;
  const view = describeTicketHistory(input);
  assert.deepEqual(
    view.items.map((row) => row.mode),
    ["LIVE", "DEMO", "REPLAY"],
  );
  assert.match(view.items[1].modeLabel, /演示.*模拟/);
  assert.match(view.items[1].note, /不代表真实行情开奖/);
  assert.match(view.items[2].modeLabel, /回放.*模拟/);
  assert.match(view.items[2].note, /不代表自然开奖/);
});

test("three languages explain original dates and UTC fallback without assuming a cash value", () => {
  const input = state(
    [ticket({ tier: 1, prize: 1000 })],
    [round("round-one", "settled")],
  );
  const zh = item(input, { language: "zh-CN", timeZone: "Asia/Shanghai" });
  const en = item(input, { language: "en", timeZone: "UTC" });
  const ja = item(input, { language: "ja", timeZone: "invalid/zone" });
  assert.equal(zh.title, "英国 · 六重奏");
  assert.equal(en.title, "UK · Six Notes");
  assert.match(ja.title, /英国/);
  assert.match(zh.createdText, /2026.*16:29.*Asia\/Shanghai/);
  assert.match(en.createdText, /2026.*8:29.*UTC/);
  assert.match(ja.createdText, /UTC/);
  assert.equal(en.prizeText, "1,000 points");
  assert.equal(ja.prizeText, "1,000 ポイント");
  assert.match(en.note, /account records.*Independently/);
  assert.match(ja.statusLabel, /付与済み/);
});

test("malformed snapshots and frozen inputs are safe and returned number arrays never alias private data", () => {
  for (const snapshot of [
    undefined,
    null,
    false,
    "state",
    [],
    {},
    { me: { id: "user-one" }, tickets: null },
  ])
    assert.doesNotThrow(() => describeTicketHistory(snapshot, null));
  assert.equal(describeTicketHistory(undefined).status, "loading");
  const input = state();
  const before = structuredClone(input);
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  freeze(input);
  const view = describeTicketHistory(input, { rounds: [null, {}, []] });
  view.items[0].main[0] = 999;
  assert.deepEqual(input, before);
  assert.equal(item(input).main[0], 1);
});

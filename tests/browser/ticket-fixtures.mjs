import { games } from "../../src/engine.js";

// Browser presentation fixtures. These are not market evidence or online draws.
export function ticketFixture(kind, at = Date.now()) {
  const id =
    kind === "long" ? "round-" + "r".repeat(74) : "visual-fixture-round";
  const manifest = {
    id,
    mode: "DEMO",
    price: 10,
    cutoff: at + 3600000,
    ready: at + 3660000,
    games: structuredClone(games),
    sources: ["VISUAL-FIXTURE"],
    markets: [
      {
        symbol: "FIXTURE:A",
        currency: "USD",
        scale: 2,
        date: "2026-10-31",
        closeUTC: at + 3630000,
      },
    ],
    payout: [50, 30, 20],
  };
  const round = {
    id,
    manifest,
    cutoff: manifest.cutoff,
    ready: manifest.ready,
    status: "open",
    commitment: "a".repeat(64),
    proof: null,
  };
  const me = {
    id: "visual-fixture-owner",
    name: kind === "long" ? "visual-layout-long-name24" : "visual-fixture",
    balance: 990,
  };
  const ticket = {
    id: kind === "long" ? "ticket-" + "t".repeat(73) : "visual-fixture-ticket",
    user_id: me.id,
    round_id: id,
    game: "de",
    numbers: "[1,2,3,4,5,6]",
    bonus: 0,
    request_key: "visual-fixture-request",
    created: at - 60000,
    tier: 0,
    prize: 0,
  };
  if (["paid", "lost", "zero", "older"].includes(kind)) {
    round.status = "settled";
    round.proof = {
      mode: "DEMO",
      manifest: structuredClone(manifest),
      results: Object.fromEntries(
        games.map((g) => [
          g.id,
          {
            main: Array.from({ length: g.count }, (_, i) => i + 1),
            bonus: g.bonus ? (g.bonusMin ?? 1) : null,
          },
        ]),
      ),
    };
    ticket.game = "uk";
    ticket.bonus = null;
    if (kind === "lost") ticket.numbers = "[20,21,22,23,24,25]";
    else {
      ticket.tier = 1;
      ticket.prize = kind === "zero" ? 0 : 500;
    }
  }
  if (kind === "paused") round.status = "paused";
  if (kind === "invalid") ticket.numbers = "[1,1,2,3,4,5]";
  const state = {
    demo: true,
    autoDraw: true,
    serverTime: at,
    pool: 100010,
    games: structuredClone(games),
    rounds: [round],
    me,
    tickets: [ticket],
    anchors: [],
    attempts: [],
    winners: [],
    ledger: [],
  };
  if (kind === "anonymous") {
    state.me = null;
    state.tickets = [];
  }
  if (kind === "empty") state.tickets = [];
  if (["unverified", "older"].includes(kind)) state.rounds = [];
  if (kind === "many")
    state.tickets = Array.from({ length: 100 }, (_, i) => ({
      ...ticket,
      id: `visual-fixture-ticket-${i + 1}`,
      request_key: `visual-fixture-key-${i + 1}`,
    }));
  const expected = {
    anonymous: null,
    empty: null,
    pending: "pending",
    long: "pending",
    many: "pending",
    paid: "paid",
    lost: "lost",
    zero: "unverified",
    older: "paid",
    paused: "paused",
    unverified: "unverified",
    invalid: "invalid",
  }[kind];
  return { state, round, expected, provenance: "controlled-browser-fixture" };
}

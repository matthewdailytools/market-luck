import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectDisplayRound,
  describeHomeRound,
} from "../public/round-summary.js";

const cutoff = Date.parse("2026-11-02T08:30:00Z");
const close = Date.parse("2026-11-02T21:00:00Z");
const ready = Date.parse("2026-11-03T21:00:00Z");
function round(id = "live-round", status = "open") {
  return {
    id,
    status,
    cutoff,
    ready,
    proof: status === "settled" ? { execution: "LIVE_REAL_CLOCK" } : null,
    manifest: {
      mode: "LIVE",
      price: 10,
      cutoff,
      ready,
      sources: ["YahooFinance", "Nasdaq"],
      markets: [
        { symbol: "XNAS:AAPL", closeUTC: close },
        { symbol: "XNAS:MSFT", closeUTC: close },
        { symbol: "XNYS:IBM", closeUTC: close },
      ],
    },
  };
}
const state = (rows = [round()]) => ({ demo: false, rounds: rows });
const describe = (
  rows,
  now = cutoff - 1,
  language = "zh-CN",
  zone = "Asia/Shanghai",
) => describeHomeRound(state(rows), now, language, zone);

test("display selection prioritizes an open round but otherwise preserves latest published history", () => {
  const published = round("newest-settled", "settled");
  const paused = round("older-paused", "paused");
  const open = round("open-sale");
  const draft = round("new-draft", "draft");
  assert.equal(selectDisplayRound([draft, published, paused, open]), open);
  assert.equal(selectDisplayRound([draft, published, paused]), published);
  assert.equal(selectDisplayRound([draft, paused, published]), paused);
  assert.equal(selectDisplayRound([draft]), null);
  assert.equal(
    selectDisplayRound([null, { ...open, id: "bad?id" }, published]),
    published,
  );
  assert.equal(selectDisplayRound(undefined), null);
  assert.equal(selectDisplayRound("not-a-list"), null);
});

test("cutoff, close and ready equality never retain the previous countdown or invent a result", () => {
  const rows = [round()];
  const cases = [
    [cutoff - 1, "sales", cutoff],
    [cutoff, "awaitingClose", null],
    [close - 1, "awaitingClose", null],
    [close, "confirming", ready],
    [ready - 1, "confirming", ready],
    [ready, "waiting", null],
    [ready + 86400000, "waiting", null],
  ];
  for (const [now, expectedPhase, expectedTarget] of cases) {
    const summary = describe(rows, now);
    assert.equal(summary.phase, expectedPhase);
    assert.equal(summary.target, expectedTarget);
    assert.equal(summary.auditHref, "/verify.html?round=live-round");
  }
  const waiting = describe(rows, ready);
  assert.match(waiting.timingNote, /不是保证开奖.*缺失或分歧就等待/);
  assert.doesNotMatch(waiting.countdownLabel, /已公布|开奖完成|复算一致/);
});

test("paused and published rounds override clock urgency and keep their own verification identity", () => {
  const paused = describe([round("paused-id", "paused")], cutoff - 86400000);
  assert.equal(paused.phase, "paused");
  assert.equal(paused.target, null);
  assert.match(paused.cutoffLabel, /原定/);
  assert.match(paused.readyLabel, /原定/);
  assert.match(paused.timingNote, /不再接受本期购票/);
  assert.equal(paused.auditHref, "/verify.html?round=paused-id");

  const settled = describe([round("published-id", "settled")], ready + 1000);
  assert.equal(settled.phase, "settled");
  assert.equal(settled.target, null);
  assert.match(settled.timingNote, /最近已公布期/);
  assert.match(settled.readyLabel, /本期/);
  assert.equal(settled.auditHref, "/verify.html?round=published-id");
  assert.doesNotMatch(settled.countdownLabel, /下一次|倒计时/);

  const missingProof = round("missing-proof", "settled");
  missingProof.proof = null;
  const unavailable = describe([missingProof], ready + 1000);
  assert.equal(unavailable.phase, "unavailable");
  assert.equal(unavailable.target, null);
  assert.doesNotMatch(unavailable.countdownLabel, /已公布|复算一致/);
});

test("loading and empty snapshots clear earlier round times, sources and bound links", () => {
  const prior = describe([round()]);
  assert.equal(prior.cutoff, cutoff);
  assert.match(prior.sourceText, /YahooFinance/);
  const snapshots = [
    describeHomeRound(undefined, cutoff),
    describe([], cutoff),
    describe([round("draft-only", "draft")], cutoff),
  ];
  assert.equal(snapshots[0].phase, "loading");
  assert.equal(snapshots[1].phase, "empty");
  assert.equal(snapshots[2].phase, "empty");
  for (const summary of snapshots) {
    assert.equal(summary.round, null);
    assert.equal(summary.target, null);
    assert.equal(summary.cutoff, null);
    assert.equal(summary.ready, null);
    assert.equal(summary.cutoffText, "—");
    assert.equal(summary.readyText, "—");
    assert.equal(summary.auditHref, "/verify.html");
    assert.doesNotMatch(summary.sourceText, /YahooFinance|Nasdaq|AAPL/);
  }
});

test("advanced demo clocks use running cutoff and ready, not future manifest market closes", () => {
  const demo = round("demo-progress");
  demo.manifest.mode = "DEMO";
  demo.manifest.sources = ["FIXTURE-v1"];
  demo.cutoff = cutoff - 2000;
  demo.ready = cutoff - 1000;
  const summary = describeHomeRound({ demo: true, rounds: [demo] }, cutoff);
  assert.equal(summary.mode, "DEMO");
  assert.equal(summary.phase, "waiting");
  assert.equal(summary.target, null);
  assert.equal(summary.cutoff, cutoff - 2000);
  assert.equal(summary.ready, cutoff - 1000);
  assert.match(summary.timingNote, /模拟运行时间.*最早时间不保证/);
  assert.match(summary.sourceText, /模拟行情/);
  assert.doesNotMatch(summary.sourceText, /YahooFinance/);
  assert.equal(demo.manifest.ready, ready);
  assert.equal(demo.manifest.markets[0].closeUTC, close);
});

test("tagged replay remains a simulated presentation even when its manifest says LIVE", () => {
  const replay = round("replay-result", "settled");
  replay.proof.execution = "ONLINE_REPLAY_SIMULATED_CLOCK";
  const summary = describe([replay], ready + 1, "en", "UTC");
  assert.equal(summary.mode, "REPLAY");
  assert.equal(summary.phase, "settled");
  assert.match(summary.timingNote, /Replay clock, not a natural draw/);
  assert.match(summary.sourceText, /not a natural draw/);
});

test("three languages expose interpretable absolute times and identify timezone fallbacks", () => {
  for (const language of ["zh-CN", "en", "ja"]) {
    const shanghai = describe([round()], cutoff - 1, language, "Asia/Shanghai");
    assert.equal(shanghai.timeZone, "Asia/Shanghai");
    assert.match(shanghai.cutoffText, /16:30/);
    assert.match(shanghai.readyText, /05:00/);
    assert.match(shanghai.readyText, /11\/4/);
    assert.match(shanghai.timingNote, /Asia\/Shanghai/);
    assert.match(shanghai.pointsNote, /1,000/);
    assert.match(shanghai.pointsNote, /10/);

    const utc = describe([round()], cutoff - 1, language, "UTC");
    assert.equal(utc.timeZone, "UTC");
    assert.match(utc.cutoffText, /08:30/);
    assert.match(utc.readyText, /21:00/);
    const fallback = describe(
      [round()],
      cutoff - 1,
      language,
      "invalid/time-zone",
    );
    assert.equal(fallback.timeZone, "UTC");
    assert.equal(fallback.cutoffText, utc.cutoffText);
    assert.equal(fallback.readyText, utc.readyText);
    assert.match(fallback.timingNote, /UTC/);
    assert.doesNotMatch(fallback.timingNote, /invalid\/time-zone/);
  }
  assert.match(
    describe([round()], cutoff - 1, "zh-CN").pointsNote,
    /一次.*无现金价值/,
  );
  assert.match(
    describe([round()], cutoff - 1, "en").pointsNote,
    /once.*No cash value/,
  );
  assert.match(
    describe([round()], cutoff - 1, "ja").pointsNote,
    /1回.*金銭的価値なし/,
  );
});

test("invalid or contradictory running times cannot produce sale urgency or a successful draw claim", () => {
  const malformed = [
    { cutoff: null },
    { ready: Infinity },
    { cutoff: ready, ready: cutoff },
    { cutoff: -1 },
    { ready: close - 1 },
    { manifest: { ...round().manifest, markets: [] } },
    {
      manifest: { ...round().manifest, markets: [{ closeUTC: "not-a-time" }] },
    },
  ];
  for (const patch of malformed) {
    const summary = describe([{ ...round(), ...patch }], cutoff - 1);
    assert.equal(summary.phase, "unavailable");
    assert.equal(summary.target, null);
    assert.match(summary.timingNote, /不据此认定已开奖/);
    assert.doesNotMatch(summary.countdownLabel, /倒计时|已公布|复算一致/);
  }
  for (const now of [NaN, Infinity, undefined]) {
    const summary = describeHomeRound(state(), now);
    assert.equal(summary.phase, "unavailable");
    assert.equal(summary.target, null);
  }
});

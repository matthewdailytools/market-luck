import { test } from "node:test";
import assert from "node:assert/strict";
import { games } from "../src/engine.js";
import { describeHomeHighlights } from "../public/home-highlights-model.js";

function round(id, status = "open", mode = "LIVE", catalog = games) {
  const manifest = {
    id,
    mode,
    games: structuredClone(catalog),
    markets: [
      { symbol: "XNAS:AAPL", date: "2026-11-02" },
      { symbol: "XNAS:MSFT", date: "2026-11-02" },
    ],
  };
  return {
    id,
    status,
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

function state(rounds = [], demo = false) {
  return { rounds, demo, games: structuredClone(games), pool: 100000 };
}

test("a first live round waits without manufacturing balls from winners or DEMO history", () => {
  const current = round("live-first");
  const input = state([current, round("old-demo", "settled", "DEMO")]);
  input.winners = [
    { game: "cn", main: [1, 2, 3, 4, 5, 6], bonus: 1, prize: 5000 },
  ];
  const model = describeHomeHighlights(input);
  assert.equal(model.recent.status, "waiting");
  assert.equal(model.recent.mode, "LIVE");
  assert.equal(model.recent.roundId, null);
  assert.deepEqual(model.recent.games, []);
  assert.equal(model.recent.href, "/verify.html?round=live-first");
  assert.match(model.recent.message, /尚无.*真实.*继续等待/);
  assert.equal(model.active.roundId, "live-first");
  assert.equal(model.formats.length, 16);
  assert.equal(model.pool.value, 100000);
  assert.match(model.pool.note, /全部玩法共用.*无现金价值/);
  assert.equal(model.pool.label, "当前共享积分池");
  assert.equal(model.pool.unit, "积分");
});

test("current open round and latest published result keep separate IDs and links", () => {
  const input = state([
    round("new-draft", "draft"),
    round("recent-paused", "paused"),
    round("new-open"),
    round("latest-published", "settled"),
    round("older-published", "settled"),
  ]);
  const model = describeHomeHighlights(input);
  assert.equal(model.active.roundId, "new-open");
  assert.equal(model.active.label, "当前期");
  assert.equal(model.active.href, "/verify.html?round=new-open");
  assert.equal(model.pool.roundId, "new-open");
  assert.equal(model.recent.roundId, "latest-published");
  assert.equal(
    model.recent.href,
    "/verify.html?round=latest-published#results",
  );
  assert.equal(model.recent.marketDate, "2026-11-02");
  assert.match(model.recent.message, /已公布/);
  assert.doesNotMatch(model.recent.message, /已核验/);
});

test("all 16 formats show published proof numbers, including Germany's special zero", () => {
  const model = describeHomeHighlights(state([round("published", "settled")]));
  assert.equal(model.recent.status, "ready");
  assert.equal(model.recent.games.length, 16);
  const germany = model.recent.games.find((game) => game.id === "de");
  assert.equal(germany.bonus, 0);
  assert.equal(germany.format, "6/49 + 0–9");
  assert.deepEqual(germany.main, [1, 2, 3, 4, 5, 6]);
  assert.equal(model.recent.games.find((game) => game.id === "uk").bonus, null);
  assert.equal(
    model.formats.find((game) => game.id === "cn").selection,
    "6/33 + 1/16",
  );
  assert.match(
    model.formats.find((game) => game.id === "de").summary,
    /特别号1个（0–9）/,
  );
});

test("history is interpreted using that proof's locked catalog, never today's 16-format catalog", () => {
  const oldCatalog = [
    { id: "cn", name: "中国 · 双星", flag: "🇨🇳", count: 2, max: 3, bonus: 0 },
  ];
  const old = round("old-two-number-format", "settled", "LIVE", oldCatalog);
  old.proof.results.cn.main = [1, 3];
  const model = describeHomeHighlights(state([round("new-open"), old]));
  assert.equal(model.recent.status, "ready");
  assert.equal(model.recent.games.length, 1);
  assert.equal(model.recent.games[0].format, "2/3");
  assert.deepEqual(model.recent.games[0].main, [1, 3]);
  assert.equal(model.formats.length, 16);
});

test("format choices follow the open round's commitment and only use the server catalog without an open round", () => {
  const lockedCatalog = [
    {
      id: "jp",
      name: "日本 · 六之幸",
      flag: "🇯🇵",
      count: 2,
      max: 10,
      bonus: 0,
    },
  ];
  const open = round("locked-open", "open", "LIVE", lockedCatalog);
  let model = describeHomeHighlights(
    state([open, round("published", "settled")]),
  );
  assert.equal(model.formats.length, 1);
  assert.equal(model.formats[0].id, "jp");
  assert.equal(model.formats[0].selection, "2/10");
  assert.equal(
    model.recent.games.length,
    16,
    "historical results keep their own catalog",
  );
  open.manifest.games = null;
  model = describeHomeHighlights(state([open]));
  assert.deepEqual(
    model.formats,
    [],
    "a damaged lock cannot silently enable today's formats",
  );
  model = describeHomeHighlights(state([round("paused", "paused")]));
  assert.equal(model.formats.length, 16);
});

test("LIVE excludes simulated replays and DEMO while DEMO and replay remain unmistakably labelled", () => {
  const replay = round("replay", "settled");
  replay.proof.execution = "ONLINE_REPLAY_SIMULATED_CLOCK";
  replay.proof.simulatedClock = true;
  const demo = round("demo-history", "settled", "DEMO");
  const live = round("actual-live", "settled");
  let model = describeHomeHighlights(
    state([round("live-open"), replay, demo, live]),
  );
  assert.equal(model.recent.mode, "LIVE");
  assert.equal(model.recent.roundId, "actual-live");

  model = describeHomeHighlights(
    state([round("demo-open", "open", "DEMO"), live, demo], true),
  );
  assert.equal(model.recent.mode, "DEMO");
  assert.equal(model.recent.roundId, "demo-history");
  assert.match(model.recent.modeLabel, /演示.*模拟/);
  assert.match(model.recent.message, /不代表真实开奖/);
  assert.equal(model.pool.mode, "DEMO");

  model = describeHomeHighlights(state([replay, live]));
  assert.equal(model.active.mode, "REPLAY");
  assert.equal(model.recent.mode, "REPLAY");
  assert.equal(model.recent.roundId, "replay");
  assert.match(model.recent.modeLabel, /回放.*模拟/);
  assert.match(model.recent.message, /不代表自然开奖/);
  assert.equal(model.pool.mode, "REPLAY");

  delete replay.proof.execution;
  model = describeHomeHighlights(state([round("live-open"), replay]));
  assert.equal(
    model.recent.status,
    "waiting",
    "a legacy simulated LIVE proof must not masquerade as a real draw",
  );
});

test("pool absence and malformed values are unavailable, while a genuine zero remains zero", () => {
  for (const value of [
    undefined,
    null,
    -1,
    "100000",
    NaN,
    Infinity,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const input = state();
    input.pool = value;
    const pool = describeHomeHighlights(input).pool;
    assert.equal(pool.value, null);
    assert.equal(pool.hasValue, false);
    assert.equal(pool.formatted, "—");
    assert.match(pool.note, /暂不可用/);
  }
  const input = state();
  input.pool = 0;
  const pool = describeHomeHighlights(input).pool;
  assert.equal(pool.value, 0);
  assert.equal(pool.hasValue, true);
  assert.equal(pool.formatted, "0");
});

test("malformed or wrong-round results are never converted into plausible winning balls", () => {
  const corrupt = [
    (r) => {
      r.proof.manifest.id = "another-round";
    },
    (r) => {
      r.manifest.id = "another-round";
    },
    (r) => {
      r.proof.mode = "DEMO";
    },
    (r) => {
      r.proof.manifest.mode = "DEMO";
    },
    (r) => {
      delete r.proof.manifest.games;
    },
    (r) => {
      r.proof.results = {};
    },
    (r) => {
      delete r.proof.results.cn;
    },
    (r) => {
      r.proof.results.cn.main = [1, 1, 3, 4, 5, 6];
    },
    (r) => {
      r.proof.results.cn.main[0] = 0;
    },
    (r) => {
      r.proof.results.cn.main[0] = 34;
    },
    (r) => {
      r.proof.results.cn.main[0] = "1";
    },
    (r) => {
      r.proof.results.cn.main.pop();
    },
    (r) => {
      r.proof.results.de.bonus = 10;
    },
    (r) => {
      r.proof.results.de.bonus = -1;
    },
    (r) => {
      r.proof.results.cn.bonus = null;
    },
    (r) => {
      r.proof.results.uk.bonus = 0;
    },
    (r) => {
      r.proof.results.extra = { main: [1], bonus: null };
    },
    (r) => {
      r.proof.execution = "UNKNOWN_CLOCK";
    },
  ];
  for (const mutate of corrupt) {
    const invalid = round("invalid", "settled");
    mutate(invalid);
    const model = describeHomeHighlights(state([round("active"), invalid]));
    assert.equal(model.recent.status, "waiting", mutate.toString());
    assert.deepEqual(model.recent.games, [], mutate.toString());
    assert.equal(model.recent.roundId, null);
  }
  const broken = round("broken-latest", "settled");
  broken.proof.results = null;
  assert.equal(
    describeHomeHighlights(state([broken, round("last-valid", "settled")]))
      .recent.roundId,
    "last-valid",
  );
});

test("loading, paused, settled and empty transitions clear stale results and links", () => {
  let model = describeHomeHighlights(undefined);
  assert.equal(model.recent.status, "loading");
  assert.equal(model.pool.mode, "UNKNOWN");
  assert.equal(model.pool.hasValue, false);
  assert.equal(model.active.roundId, null);
  model = describeHomeHighlights(state([round("published", "settled")]));
  assert.equal(model.active.status, "settled");
  assert.equal(model.recent.status, "ready");
  model = describeHomeHighlights(state([round("paused", "paused")]));
  assert.equal(model.active.status, "paused");
  assert.equal(model.active.label, "暂停期");
  assert.equal(model.active.href, "/verify.html?round=paused");
  assert.equal(model.recent.status, "waiting");
  assert.deepEqual(model.recent.games, []);
  model = describeHomeHighlights(state([round("draft", "draft")]));
  assert.equal(model.active.roundId, null);
  assert.equal(model.active.href, "/verify.html");
  assert.equal(model.recent.roundId, null);
  assert.equal(model.recent.href, "/verify.html");
  assert.deepEqual(model.recent.games, []);
});

test("market dates describe the historical data date without inventing a draw date", () => {
  const published = round("published", "settled");
  published.proof.manifest.markets[1].date = "2026-11-03";
  let recent = describeHomeHighlights(state([published])).recent;
  assert.equal(recent.status, "ready");
  assert.equal(
    recent.marketDate,
    null,
    "different market dates cannot be collapsed into one date",
  );
  published.proof.manifest.markets.forEach((market) => {
    market.date = "2026-02-30";
  });
  recent = describeHomeHighlights(state([published])).recent;
  assert.equal(recent.marketDate, null);
  assert.equal(Object.hasOwn(recent, "drawDate"), false);
});

test("Chinese, English and Japanese localize country names, mode warnings and rule summaries", () => {
  const input = state([round("demo", "settled", "DEMO")], true);
  const zh = describeHomeHighlights(input, "zh-CN");
  const en = describeHomeHighlights(input, "en");
  const ja = describeHomeHighlights(input, "ja");
  assert.equal(zh.formats[0].name, "中国 · 双星");
  assert.equal(en.formats[0].name, "China · Twin Star");
  assert.equal(ja.formats[0].name, "中国 · ツインスター");
  assert.equal(en.recent.games[0].name, en.formats[0].name);
  assert.match(en.formats[0].summary, /Pick 6 main numbers/);
  assert.match(ja.formats[0].summary, /主番号6個/);
  assert.match(en.recent.modeLabel, /DEMO.*simulated clock/);
  assert.match(ja.recent.message, /実際の抽選ではありません/);
  assert.deepEqual(describeHomeHighlights(input, "bad-locale"), en);
});

test("the model accepts frozen input and returns copies of published number arrays", () => {
  const input = state([round("published", "settled")]);
  const before = structuredClone(input);
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  freeze(input);
  const model = describeHomeHighlights(input);
  model.recent.games[0].main[0] = 999;
  model.formats[0].name = "changed";
  assert.deepEqual(input, before);
  assert.equal(describeHomeHighlights(input).recent.games[0].main[0], 1);
});

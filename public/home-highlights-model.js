import { dictionary } from "./i18n.js";
import { selectDisplayRound } from "./round-summary.js";

// Presentation only: published numbers are not a substitute for proof verification.
const copy = {
  "zh-CN": {
    modes: {
      LIVE: "真实行情",
      DEMO: "演示 · 模拟时钟",
      REPLAY: "回放 · 模拟时钟",
      UNKNOWN: "模式待确认",
    },
    pool: "共享积分池",
    currentPool: "当前共享奖池",
    poolNote: "全部玩法共用；虚拟积分，无现金价值。",
    unavailablePool: "奖池数据暂不可用；虚拟积分，无现金价值。",
    active: {
      open: "当前期",
      paused: "暂停期",
      settled: "最近公布期",
      empty: "尚未开期",
      loading: "正在读取本期",
    },
    loading: "正在读取已公布结果。",
    waiting: {
      LIVE: "尚无可展示的真实开奖结果；数据未齐或未达成共识时继续等待。",
      DEMO: "演示结果尚未公布；使用模拟时钟，不代表真实开奖。",
      REPLAY: "回放结果尚未公布；使用模拟时钟，不代表自然开奖。",
      UNKNOWN: "模式待确认，暂不展示开奖结果。",
    },
    ready: {
      LIVE: "最近已公布的真实开奖结果，可在核验页复算。",
      DEMO: "演示结果使用模拟时钟，仅用于体验，不代表真实开奖。",
      REPLAY: "线上回放结果使用模拟时钟，不代表自然开奖。",
    },
    summary: (g) =>
      `主球选${g.count}个（1–${g.max}）${g.bonus ? ` + 特别号1个（${g.bonusMin}–${g.bonusMax}）` : ""}`,
  },
  en: {
    modes: {
      LIVE: "Live market data",
      DEMO: "DEMO · simulated clock",
      REPLAY: "REPLAY · simulated clock",
      UNKNOWN: "Mode unconfirmed",
    },
    pool: "Shared points pool",
    currentPool: "Current shared points pool",
    poolNote: "Shared by all formats; virtual points with no cash value.",
    unavailablePool:
      "Pool data is unavailable; virtual points have no cash value.",
    active: {
      open: "Current round",
      paused: "Paused round",
      settled: "Latest published round",
      empty: "No round yet",
      loading: "Loading current round",
    },
    loading: "Loading published results.",
    waiting: {
      LIVE: "No live draw result is available yet. Missing or conflicting data means waiting.",
      DEMO: "No demo result yet. The simulated clock does not represent a real draw.",
      REPLAY:
        "No replay result yet. The simulated clock does not represent a natural draw.",
      UNKNOWN: "The mode is unconfirmed; draw results are not shown.",
    },
    ready: {
      LIVE: "Latest published live draw result; recalculate it on the verification page.",
      DEMO: "Demo result with a simulated clock, for practice; this is not a real draw.",
      REPLAY:
        "Online replay result with a simulated clock; this is not a natural draw.",
    },
    summary: (g) =>
      `Pick ${g.count} main numbers (1–${g.max})${g.bonus ? ` + 1 special (${g.bonusMin}–${g.bonusMax})` : ""}`,
  },
  ja: {
    modes: {
      LIVE: "実際の市場データ",
      DEMO: "デモ · 模擬時計",
      REPLAY: "リプレイ · 模擬時計",
      UNKNOWN: "モード未確認",
    },
    pool: "共有ポイントプール",
    currentPool: "現在の共有ポイントプール",
    poolNote: "全形式で共有する仮想ポイント。現金価値はありません。",
    unavailablePool:
      "プールデータを取得できません。仮想ポイントに現金価値はありません。",
    active: {
      open: "現在の回",
      paused: "停止中の回",
      settled: "直近の公表回",
      empty: "開催回は未定",
      loading: "現在の回を取得中",
    },
    loading: "公表済みの結果を取得中です。",
    waiting: {
      LIVE: "表示できる実際の抽選結果はまだありません。データ不足や不一致の場合は待機します。",
      DEMO: "デモ結果は未公表です。模擬時計を使用し、実際の抽選ではありません。",
      REPLAY:
        "リプレイ結果は未公表です。模擬時計を使用し、自然時刻の抽選ではありません。",
      UNKNOWN: "モード未確認のため、抽選結果は表示しません。",
    },
    ready: {
      LIVE: "直近の公表済み抽選結果。検証ページで再計算できます。",
      DEMO: "模擬時計を使用した体験用のデモ結果です。実際の抽選ではありません。",
      REPLAY:
        "模擬時計を使用したオンラインリプレイ結果です。自然時刻の抽選ではありません。",
    },
    summary: (g) =>
      `主番号${g.count}個（1–${g.max}）${g.bonus ? ` + 特別番号1個（${g.bonusMin}–${g.bonusMax}）` : ""}`,
  },
};

const safeId = (id) =>
  typeof id === "string" && /^[A-Za-z0-9-]{1,80}$/.test(id);
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const link = (id) =>
  safeId(id) ? `/verify.html?round=${encodeURIComponent(id)}` : "/verify.html";

function roundMode(round) {
  const mode = round?.manifest?.mode;
  if (mode !== "LIVE" && mode !== "DEMO") return "UNKNOWN";
  if (
    round?.proof?.execution === "ONLINE_REPLAY_SIMULATED_CLOCK" ||
    (mode === "LIVE" && round?.proof?.simulatedClock === true)
  )
    return "REPLAY";
  return mode;
}

function gameMetadata(game, language, words) {
  if (
    !object(game) ||
    typeof game.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,40}$/.test(game.id) ||
    typeof game.name !== "string" ||
    !game.name.trim() ||
    game.name.length > 120 ||
    !Number.isSafeInteger(game.count) ||
    game.count < 1 ||
    game.count > 100 ||
    !Number.isSafeInteger(game.max) ||
    game.max < game.count ||
    game.max > 1000000 ||
    !Number.isSafeInteger(game.bonus) ||
    game.bonus < 0 ||
    game.bonus > 1000000
  )
    return null;
  const bonusMin = game.bonusMin ?? 1;
  if (
    !Number.isSafeInteger(bonusMin) ||
    bonusMin < 0 ||
    !Number.isSafeInteger(bonusMin + game.bonus)
  )
    return null;
  const normalized = { ...game, bonusMin, bonusMax: bonusMin + game.bonus - 1 };
  const name =
    language === "zh-CN"
      ? game.name
      : dictionary[game.name]?.[language === "ja" ? 1 : 0] || game.name;
  const selection = `${game.count}/${game.max}${game.bonus ? ` + ${bonusMin === 1 ? `1/${game.bonus}` : `${bonusMin}–${normalized.bonusMax}`}` : ""}`;
  return {
    id: game.id,
    name,
    flag:
      typeof game.flag === "string" && game.flag.length <= 16 ? game.flag : "",
    selection,
    summary: words.summary(normalized),
  };
}

function formatCatalog(catalog, language, words) {
  if (!Array.isArray(catalog)) return [];
  const seen = new Set();
  return catalog.flatMap((game) => {
    const item = gameMetadata(game, language, words);
    if (!item || seen.has(item.id)) return [];
    seen.add(item.id);
    return [item];
  });
}

function publishedResults(round, mode, language, words) {
  const proof = round?.proof;
  const manifest = proof?.manifest;
  if (
    round?.status !== "settled" ||
    !safeId(round.id) ||
    !object(proof) ||
    !object(manifest) ||
    manifest.id !== round.id ||
    round.manifest?.id !== round.id ||
    manifest.mode !== round.manifest?.mode ||
    proof.mode !== manifest.mode ||
    roundMode(round) !== mode ||
    !object(proof.results) ||
    (proof.execution !== undefined &&
      !["LIVE_REAL_CLOCK", "ONLINE_REPLAY_SIMULATED_CLOCK"].includes(
        proof.execution,
      ))
  )
    return null;
  const catalog = manifest.games;
  const formats = formatCatalog(catalog, language, words);
  // A partial or mismatched catalog must not create plausible but incomplete balls.
  if (
    !formats.length ||
    formats.length !== catalog.length ||
    Object.keys(proof.results).length !== catalog.length
  )
    return null;
  const results = [];
  for (let i = 0; i < catalog.length; i++) {
    const game = catalog[i];
    const value = Object.hasOwn(proof.results, game.id)
      ? proof.results[game.id]
      : null;
    const min = game.bonusMin ?? 1;
    if (
      !object(value) ||
      !Array.isArray(value.main) ||
      value.main.length !== game.count ||
      new Set(value.main).size !== game.count ||
      value.main.some((n) => !Number.isInteger(n) || n < 1 || n > game.max) ||
      (game.bonus
        ? !Number.isInteger(value.bonus) ||
          value.bonus < min ||
          value.bonus >= min + game.bonus
        : value.bonus !== null)
    )
      return null;
    results.push({
      id: game.id,
      name: formats[i].name,
      flag: formats[i].flag,
      main: [...value.main],
      bonus: value.bonus,
      format: formats[i].selection,
    });
  }
  return results;
}

function marketDate(manifest) {
  const dates = Array.isArray(manifest?.markets)
    ? manifest.markets.map((m) => m?.date)
    : [];
  if (
    !dates.length ||
    !dates.every(
      (date) =>
        typeof date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date &&
        date === dates[0],
    )
  )
    return null;
  return dates[0];
}

/** Pure display data for the homepage; never infers numbers from winning tickets. */
export function describeHomeHighlights(state, language = "zh-CN") {
  const lang = Object.hasOwn(copy, language) ? language : "en";
  const words = copy[lang];
  const loaded = object(state);
  const rounds = loaded && Array.isArray(state.rounds) ? state.rounds : [];
  const displayed = selectDisplayRound(rounds);
  const activeMode = displayed
    ? roundMode(displayed)
    : loaded
      ? state.demo === true
        ? "DEMO"
        : "LIVE"
      : "UNKNOWN";
  // A LIVE host never borrows DEMO results. A selected explicit replay is labelled separately.
  const mode = !loaded
    ? "UNKNOWN"
    : state.demo === true
      ? "DEMO"
      : activeMode === "REPLAY"
        ? "REPLAY"
        : "LIVE";
  const value =
    loaded && Number.isSafeInteger(state.pool) && state.pool >= 0
      ? state.pool
      : null;
  let published = null;
  let games = [];
  for (const round of rounds) {
    const result = publishedResults(round, mode, lang, words);
    if (result) {
      published = round;
      games = result;
      break;
    }
  }
  const status = !loaded ? "loading" : published ? "ready" : "waiting";
  return {
    pool: {
      value,
      hasValue: value !== null,
      formatted:
        value === null ? "—" : new Intl.NumberFormat(lang).format(value),
      label: displayed?.status === "open" ? words.currentPool : words.pool,
      note: value === null ? words.unavailablePool : words.poolNote,
      mode,
      modeLabel: words.modes[mode],
      roundId: displayed?.id ?? null,
    },
    active: {
      roundId: displayed?.id ?? null,
      status: displayed?.status ?? null,
      mode: activeMode,
      modeLabel: words.modes[activeMode],
      label: words.active[displayed?.status ?? (loaded ? "empty" : "loading")],
      href: link(displayed?.id),
    },
    recent: {
      status,
      roundId: published?.id ?? null,
      mode,
      modeLabel: words.modes[mode],
      marketDate: published ? marketDate(published.proof.manifest) : null,
      games,
      message: !loaded
        ? words.loading
        : published
          ? words.ready[mode]
          : words.waiting[mode],
      href: published ? `${link(published.id)}#results` : link(displayed?.id),
    },
    // The open round's committed formats also govern the purchase picker.
    formats: formatCatalog(
      displayed?.status === "open" ? displayed.manifest?.games : state?.games,
      lang,
      words,
    ),
  };
}

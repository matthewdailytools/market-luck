import { dictionary } from "./i18n.js";
import { describeHomeRound } from "./round-summary.js";

// Account records are presentation data; independent proof checks live on /verify.
const words = {
  "zh-CN": {
    unit: "积分",
    unknownGame: "玩法规则待核实",
    unknownCost: "成本待核实",
    modes: {
      LIVE: "真实行情",
      DEMO: "演示 · 模拟时钟",
      REPLAY: "回放 · 模拟时钟",
      UNKNOWN: "模式待核实",
    },
    statuses: {
      pending: "等待开奖",
      lost: "已结算 · 未中奖",
      paid: "已中奖 · 已派奖",
      paused: "本期已暂停",
      unverified: "状态待核实",
      invalid: "票据数据异常",
    },
    loading: "正在读取我的票据。",
    anonymous: "登录后查看自己的票据。",
    empty: "还没有可显示的票据，选号并确认后会记录在这里。",
    scope: (n) => `仅统计当前返回的最近${n}张票，最多100张；不代表全部历史。`,
    account:
      "根据账户记录展示；核验页可独立复算公开输入与号码，原始行情与全账本需另行核验。",
    unknownRound:
      "该票所属的历史期次尚未取得，不能判断开奖或中奖状态，也不使用当前玩法解释旧票。",
    invalid: "票据字段不符合公开格式，暂不据此判断中奖或派奖。",
    inconsistent: "期次、证明或账户结果不完整或不一致，暂不能确认结算状态。",
    zero: (tier) =>
      `账户记录命中第${tier}档，本档分配0积分；不应视为未中奖，请核对本期分配规则。`,
    paused: "该票所属期次已暂停；以下保留原票据，不推断最终开奖结果。",
    unknownTime: "本期时间待核实，暂不能判断开奖进度。",
    demo: "此为演示票据，不代表真实行情开奖。",
    replay: "此为模拟时钟回放票据，不代表自然开奖。",
  },
  en: {
    unit: "points",
    unknownGame: "Format rules unconfirmed",
    unknownCost: "Cost unconfirmed",
    modes: {
      LIVE: "Live market data",
      DEMO: "DEMO · simulated clock",
      REPLAY: "REPLAY · simulated clock",
      UNKNOWN: "Mode unconfirmed",
    },
    statuses: {
      pending: "Awaiting draw",
      lost: "Settled · No prize",
      paid: "Won · Paid",
      paused: "Round paused",
      unverified: "Status unconfirmed",
      invalid: "Invalid ticket data",
    },
    loading: "Loading your tickets.",
    anonymous: "Sign in to view your own tickets.",
    empty:
      "No tickets to show yet. Reviewed and confirmed purchases appear here.",
    scope: (n) =>
      `Counts cover the ${n} recently returned tickets, up to 100; they are not lifetime totals.`,
    account:
      "Shown from account records. Independently recalculate published inputs and numbers on the verification page; raw prices and the full ledger require separate checks.",
    unknownRound:
      "This ticket’s historical round has not been retrieved. Draw and prize status are unknown; today’s format rules are not applied to old tickets.",
    invalid:
      "Ticket fields do not match the published format. A win or payout cannot be established from this data.",
    inconsistent:
      "Round, proof or account results are incomplete or inconsistent. Settlement status is unconfirmed.",
    zero: (tier) =>
      `Account records show tier ${tier} with a zero-point allocation. This is not a losing ticket; check the round’s allocation rules.`,
    paused:
      "This ticket’s round is paused. The original ticket is retained without predicting a final result.",
    unknownTime:
      "Round timing is unconfirmed; draw progress cannot be established.",
    demo: "This is a demo ticket, not a live-market draw.",
    replay: "This is a simulated-clock replay ticket, not a natural draw.",
  },
  ja: {
    unit: "ポイント",
    unknownGame: "形式ルール未確認",
    unknownCost: "消費ポイント未確認",
    modes: {
      LIVE: "実際の市場データ",
      DEMO: "デモ · 模擬時計",
      REPLAY: "リプレイ · 模擬時計",
      UNKNOWN: "モード未確認",
    },
    statuses: {
      pending: "抽選待ち",
      lost: "精算済み · 当選なし",
      paid: "当選 · 付与済み",
      paused: "開催回は停止中",
      unverified: "状態未確認",
      invalid: "券データに異常",
    },
    loading: "自分の券を取得中です。",
    anonymous: "ログインすると自分の券を確認できます。",
    empty: "表示する券はまだありません。内容を確認して購入すると記録されます。",
    scope: (n) =>
      `現在取得した直近${n}枚（最大100枚）の集計です。全履歴の合計ではありません。`,
    account:
      "アカウント記録に基づく表示です。公開入力と番号は検証ページで独立して再計算できます。元の相場や全台帳は別途確認が必要です。",
    unknownRound:
      "この券の過去の開催回を未取得のため、抽選や当選の状態は不明です。現在の形式ルールを過去の券に適用しません。",
    invalid:
      "券の項目が公開形式と一致しません。このデータから当選や付与は判断できません。",
    inconsistent:
      "開催回・証明・アカウント結果が不足または不一致です。精算状態は未確認です。",
    zero: (tier) =>
      `記録では${tier}等に一致し、配分は0ポイントです。外れとは扱いません。今回の配分ルールを確認してください。`,
    paused:
      "この券の開催回は停止中です。元の券を保持し、最終結果は推測しません。",
    unknownTime: "開催回の時刻が未確認のため、抽選の進捗は判断できません。",
    demo: "デモ用の券です。実際の市場データによる抽選ではありません。",
    replay: "模擬時計のリプレイ用の券です。自然時刻の抽選ではありません。",
  },
};

const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const safeId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9-]{1,80}$/.test(value);
const gameId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(value);
const points = (value) => Number.isSafeInteger(value) && value >= 0;
const timestamp = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;

function validGame(game) {
  return (
    record(game) &&
    gameId(game.id) &&
    Number.isSafeInteger(game.count) &&
    game.count > 0 &&
    game.count <= 100 &&
    Number.isSafeInteger(game.max) &&
    game.max >= game.count &&
    game.max <= 1000000 &&
    Number.isSafeInteger(game.bonus) &&
    game.bonus >= 0 &&
    game.bonus <= 1000000 &&
    points(game.bonusMin ?? 1) &&
    Number.isSafeInteger((game.bonusMin ?? 1) + game.bonus) &&
    (game.minMatch === undefined ||
      (Number.isSafeInteger(game.minMatch) &&
        game.minMatch >= 1 &&
        game.minMatch <= game.count))
  );
}
function validCatalog(catalog) {
  return (
    Array.isArray(catalog) &&
    catalog.length > 0 &&
    catalog.length <= 100 &&
    catalog.every(validGame) &&
    new Set(catalog.map((game) => game.id)).size === catalog.length
  );
}
function validNumbers(main, bonus, game) {
  return (
    Array.isArray(main) &&
    main.length === game.count &&
    new Set(main).size === main.length &&
    main.every((n) => Number.isSafeInteger(n) && n >= 1 && n <= game.max) &&
    (game.bonus
      ? Number.isSafeInteger(bonus) &&
        bonus >= (game.bonusMin ?? 1) &&
        bonus < (game.bonusMin ?? 1) + game.bonus
      : bonus === null)
  );
}
function parseNumbers(ticket) {
  if (typeof ticket.numbers !== "string" || ticket.numbers.length > 4096)
    return null;
  let main;
  try {
    main = JSON.parse(ticket.numbers);
  } catch {
    return null;
  }
  if (
    !Array.isArray(main) ||
    !main.length ||
    main.length > 100 ||
    new Set(main).size !== main.length ||
    main.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 1000000) ||
    !(
      ticket.bonus === null ||
      (Number.isSafeInteger(ticket.bonus) &&
        ticket.bonus >= 0 &&
        ticket.bonus <= 1000000)
    )
  )
    return null;
  return { main: [...main].sort((a, b) => a - b), bonus: ticket.bonus };
}
function modeOf(round) {
  if (!["LIVE", "DEMO"].includes(round?.manifest?.mode)) return "UNKNOWN";
  if (
    round.proof?.execution === "ONLINE_REPLAY_SIMULATED_CLOCK" ||
    (round.manifest.mode === "LIVE" && round.proof?.simulatedClock === true)
  )
    return "REPLAY";
  return round.manifest.mode;
}
function sameCatalog(a, b) {
  return (
    a.length === b.length &&
    a.every((game, i) => {
      const other = b[i];
      return (
        game.id === other.id &&
        game.count === other.count &&
        game.max === other.max &&
        game.bonus === other.bonus &&
        (game.bonusMin ?? 1) === (other.bonusMin ?? 1) &&
        (game.minMatch ?? 3) === (other.minMatch ?? 3)
      );
    })
  );
}
function validProof(round) {
  const proof = round.proof;
  const manifest = proof?.manifest;
  if (
    !record(proof) ||
    !record(manifest) ||
    manifest.id !== round.id ||
    manifest.mode !== round.manifest.mode ||
    proof.mode !== manifest.mode ||
    !validCatalog(manifest.games) ||
    !sameCatalog(round.manifest.games, manifest.games) ||
    !record(proof.results) ||
    Object.keys(proof.results).length !== manifest.games.length ||
    (proof.execution !== undefined &&
      !["LIVE_REAL_CLOCK", "ONLINE_REPLAY_SIMULATED_CLOCK"].includes(
        proof.execution,
      ))
  )
    return false;
  return manifest.games.every(
    (game) =>
      Object.hasOwn(proof.results, game.id) &&
      record(proof.results[game.id]) &&
      validNumbers(
        proof.results[game.id].main,
        proof.results[game.id].bonus,
        game,
      ),
  );
}
function grade(main, bonus, result, game) {
  const hits = main.filter((n) => result.main.includes(n)).length;
  const special = result.bonus === null || bonus === result.bonus;
  if (hits === result.main.length && special) return 1;
  if (hits === result.main.length - 1 && special) return 2;
  return hits >= (game.minMatch ?? 3) || (result.bonus !== null && special)
    ? 3
    : 0;
}

function formatter(language, requestedZone) {
  try {
    return new Intl.DateTimeFormat(language, {
      timeZone: requestedZone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Intl.DateTimeFormat(language, {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
}
function roundIndex(stateRounds, extraRounds) {
  const map = new Map();
  for (const source of [stateRounds, extraRounds]) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      const round = record(entry?.round) ? entry.round : entry;
      if (record(round) && safeId(round.id) && !map.has(round.id))
        map.set(round.id, round);
    }
  }
  return map;
}

/** Pure, bounded view of the signed-in owner's recently returned ticket records. */
export function describeTicketHistory(state, options = {}) {
  const settings = record(options) ? options : {};
  const language = Object.hasOwn(words, settings.language)
    ? settings.language
    : "zh-CN";
  const text = words[language];
  const date = formatter(language, settings.timeZone || "Asia/Shanghai");
  const zone = date.resolvedOptions().timeZone;
  const now = settings.now === undefined ? state?.serverTime : settings.now;
  const amount = (value) =>
    points(value)
      ? `${new Intl.NumberFormat(language).format(value)} ${text.unit}`
      : "—";
  const counts = {
    shown: 0,
    pending: 0,
    lost: 0,
    paid: 0,
    paused: 0,
    unverified: 0,
    invalid: 0,
  };
  const output = {
    status: "loading",
    items: [],
    counts,
    limit: 100,
    limited: false,
    scopeNote: text.scope(0),
    message: text.loading,
    missingRoundIds: [],
  };
  if (!record(state)) return output;
  if (!record(state.me) || !safeId(state.me.id))
    return { ...output, status: "anonymous", message: text.anonymous };
  if (!Array.isArray(state.tickets))
    return { ...output, status: "unavailable", message: text.inconsistent };
  const owned = state.tickets.filter(
    (ticket) => record(ticket) && ticket.user_id === state.me.id,
  );
  const records = owned.slice(0, 100);
  const index = roundIndex(state.rounds, settings.rounds);
  const missing = new Set();
  const duplicates = new Set(
    records
      .filter(
        (ticket, i) =>
          records.findIndex((other) => other.id === ticket.id) !== i,
      )
      .map((ticket) => ticket.id),
  );
  output.items = records.map((ticket) => {
    const id = safeId(ticket.id) ? ticket.id : null;
    const roundId = safeId(ticket.round_id) ? ticket.round_id : null;
    const selectedGame = gameId(ticket.game) ? ticket.game : null;
    const round = roundId ? index.get(roundId) : null;
    if (roundId && !round) missing.add(roundId);
    const manifest = round?.manifest;
    const locked =
      record(manifest) &&
      manifest.id === roundId &&
      ["LIVE", "DEMO"].includes(manifest.mode) &&
      validCatalog(manifest.games);
    const game = locked
      ? manifest.games.find((item) => item.id === selectedGame)
      : null;
    const parsed = parseNumbers(ticket);
    const numbersValid = Boolean(
      parsed && (!game || validNumbers(parsed.main, parsed.bonus, game)),
    );
    const created = timestamp(ticket.created) ? ticket.created : null;
    const prize = points(ticket.prize) ? ticket.prize : null;
    const tier =
      Number.isSafeInteger(ticket.tier) && ticket.tier >= 0 && ticket.tier <= 3
        ? ticket.tier
        : null;
    const cost =
      locked && Number.isSafeInteger(manifest.price) && manifest.price > 0
        ? manifest.price
        : null;
    const mode = modeOf(round);
    const title =
      game &&
      typeof game.name === "string" &&
      game.name.trim() &&
      game.name.length <= 120
        ? language === "zh-CN"
          ? game.name
          : dictionary[game.name]?.[language === "ja" ? 1 : 0] || game.name
        : `${selectedGame || "—"} · ${text.unknownGame}`;
    let phase = "unverified",
      note = text.inconsistent,
      timePhase = null;
    if (
      !id ||
      !roundId ||
      !selectedGame ||
      !created ||
      !numbersValid ||
      prize === null ||
      tier === null ||
      duplicates.has(ticket.id)
    ) {
      phase = "invalid";
      note = text.invalid;
    } else if (!round) note = text.unknownRound;
    else if (!locked || !game) note = text.inconsistent;
    else if (round.status === "paused") {
      phase = "paused";
      note = text.paused;
    } else if (round.status === "settled") {
      if (validProof(round)) {
        const rank = grade(
          parsed.main,
          parsed.bonus,
          round.proof.results[game.id],
          game,
        );
        if (rank !== tier || (prize > 0 && !tier) || (!tier && prize !== 0))
          note = text.inconsistent;
        else if (prize > 0 && tier > 0) {
          phase = "paid";
          note = text.account;
        } else if (tier === 0 && prize === 0) {
          phase = "lost";
          note = text.account;
        } else note = text.zero(tier);
      }
    } else if (round.status === "open" && prize === 0 && tier === 0) {
      const summary = describeHomeRound(
        { demo: mode === "DEMO", rounds: [round] },
        now,
        language,
        zone,
      );
      timePhase = summary.phase;
      if (
        ["sales", "awaitingClose", "confirming", "waiting"].includes(
          summary.phase,
        )
      ) {
        phase = "pending";
        note = `${summary.countdownLabel} · ${text.account}`;
      } else note = text.unknownTime;
    }
    if (mode === "DEMO") note += ` ${text.demo}`;
    if (mode === "REPLAY") note += ` ${text.replay}`;
    const href = roundId
      ? `/verify.html?round=${encodeURIComponent(roundId)}`
      : "/verify.html";
    return {
      id,
      roundId,
      gameId: selectedGame,
      title,
      name: title,
      flag:
        game && typeof game.flag === "string" && game.flag.length <= 16
          ? game.flag
          : "",
      main: numbersValid ? [...parsed.main] : [],
      bonus: numbersValid ? parsed.bonus : null,
      numbersValid,
      created,
      createdText: created ? `${date.format(created)} (${zone})` : "—",
      cost,
      costText: cost === null ? "—" : amount(cost),
      prize,
      prizeText: amount(prize),
      tier,
      phase,
      status: phase,
      statusLabel: text.statuses[phase],
      note,
      timePhase,
      mode,
      modeLabel: text.modes[mode],
      href,
      auditHref: href,
    };
  });
  for (const item of output.items) counts[item.phase]++;
  counts.shown = output.items.length;
  output.status = counts.shown ? "ready" : "empty";
  output.limited = owned.length >= 100;
  output.scopeNote = text.scope(counts.shown);
  output.message = counts.shown ? output.scopeNote : text.empty;
  output.missingRoundIds = [...missing];
  return output;
}

// Read-only presentation model. Buying still requires the server's open round.
export function selectDisplayRound(rounds = []) {
  const published = (Array.isArray(rounds) ? rounds : []).filter(
    (r) =>
      r &&
      ["open", "paused", "settled"].includes(r.status) &&
      typeof r.id === "string" &&
      /^[A-Za-z0-9-]{1,80}$/.test(r.id),
  );
  return published.find((r) => r.status === "open") || published[0] || null;
}

const text = {
  "zh-CN": {
    points: (price) =>
      `纯积分 · 注册一次赠1,000分 · 每注${price}分 · 无现金价值`,
    title: "本期开奖安排",
    historyTitle: "最近一期记录",
    plannedTitle: "原定开奖安排",
    cutoff: "停售",
    ready: "最早核验",
    priorCutoff: "本期停售",
    priorReady: "本期最早核验",
    plannedCutoff: "原定停售",
    plannedReady: "原定最早核验",
    audit: "查看本期规则与时间 →",
    archiveAudit: "查看本期结果与复算 →",
    noRoundAudit: "了解开奖如何核验 →",
    timezone: "显示时区",
    note: "最早核验不是保证开奖；来源缺失或分歧就等待。",
    history: "以下是最近已公布期的时间，结果可在说明页复算。",
    pausedNote: "本期已暂停，以下为原定安排，不再接受本期购票。",
    loadingNote: "正在读取本期时间，请稍候。",
    emptyNote: "尚未开期，时间公布后显示。",
    unknownNote: "本期时间待核对，请查看规则，不据此认定已开奖。",
    demo: "模拟运行时间，不代表真实行情开奖。",
    replay: "回放模拟时间，不代表自然开奖。",
    demoWait: "演示进度，最早时间不保证立即公布结果。",
    statusSales: "正在售票",
    statusWaiting: "等待开奖",
    sales: "停售倒计时",
    awaitingClose: "已停售 · 等待收盘",
    confirming: "收盘确认倒计时",
    waiting: "等待双源一致",
    paused: "本期已暂停",
    settled: "最近一期已公布",
    empty: "等待下一期开售",
    loading: "本期数据载入中",
    unavailable: "本期时间待核对",
    simulatedSource: "模拟行情 · 纯积分体验",
    replaySource: "模拟时钟回放 · 非自然开奖",
    noSource: "等待本期来源公布",
  },
  en: {
    points: (price) =>
      `Virtual points · 1,000 once on sign-up · ${price} per ticket · No cash value`,
    title: "This round’s schedule",
    historyTitle: "Latest round record",
    plannedTitle: "Planned round schedule",
    cutoff: "Sales close",
    ready: "Earliest verification",
    priorCutoff: "Round sales closed",
    priorReady: "Round earliest verification",
    plannedCutoff: "Planned sales close",
    plannedReady: "Planned earliest check",
    audit: "See this round’s rules and timing →",
    archiveAudit: "See this round’s result and checks →",
    noRoundAudit: "How draw verification works →",
    timezone: "Time zone",
    note: "Earliest verification is not a guaranteed draw. Missing or conflicting sources mean waiting.",
    history:
      "These times belong to the latest published round. Reproduce its result on the guide page.",
    pausedNote:
      "This round is paused. These are its planned times; it accepts no more tickets.",
    loadingNote: "Loading this round’s times.",
    emptyNote: "No round is open. Times will appear when published.",
    unknownNote:
      "Round timing needs checking. Read the rules; this does not establish a completed draw.",
    demo: "Simulated running times, not a live-market draw.",
    replay: "Replay clock, not a natural draw.",
    demoWait:
      "Simulation progress. The earliest time does not guarantee immediate publication.",
    statusSales: "Sales open",
    statusWaiting: "Awaiting draw",
    sales: "Ticket sales close in",
    awaitingClose: "Sales closed · awaiting market close",
    confirming: "Close confirmation in",
    waiting: "Awaiting source consensus",
    paused: "This round is paused",
    settled: "Latest round published",
    empty: "Next round coming soon",
    loading: "Loading the round",
    unavailable: "Round timing needs checking",
    simulatedSource: "Simulated market · virtual points",
    replaySource: "Simulated replay · not a natural draw",
    noSource: "Awaiting round sources",
  },
  ja: {
    points: (price) =>
      `仮想ポイント · 登録時1,000を1回付与 · 1口${price} · 金銭的価値なし`,
    title: "今回の抽選予定",
    historyTitle: "直近の回の記録",
    plannedTitle: "当初の抽選予定",
    cutoff: "販売終了",
    ready: "最早検証",
    priorCutoff: "この回の販売終了",
    priorReady: "この回の最早検証",
    plannedCutoff: "当初の販売終了",
    plannedReady: "当初の最早検証",
    audit: "今回のルールと時刻を見る →",
    archiveAudit: "今回の結果と再計算を見る →",
    noRoundAudit: "抽選の検証方法を見る →",
    timezone: "表示タイムゾーン",
    note: "最早検証時刻は抽選時刻の保証ではありません。情報源の欠損や不一致は待機します。",
    history:
      "以下は直近の公開済み回の時刻です。説明ページで結果を再計算できます。",
    pausedNote:
      "この回は停止中です。以下は当初の予定で、新しい購入は受け付けません。",
    loadingNote: "今回の時刻を読み込み中です。",
    emptyNote: "販売中の回はありません。時刻は公開後に表示します。",
    unknownNote:
      "今回の時刻を確認中です。ルールを確認し、抽選済みとは判断しないでください。",
    demo: "模擬実行時刻であり、実相場の抽選ではありません。",
    replay: "模擬時計のリプレイであり、自然な抽選ではありません。",
    demoWait: "デモの進捗です。最早時刻での即時発表は保証しません。",
    statusSales: "販売中",
    statusWaiting: "抽選待ち",
    sales: "販売終了まで",
    awaitingClose: "販売終了 · 取引終了待ち",
    confirming: "終値確認まで",
    waiting: "2社の一致を確認中",
    paused: "この回は停止中",
    settled: "直近の結果を公開済み",
    empty: "次回の販売を準備中",
    loading: "今回のデータを読込中",
    unavailable: "今回の時刻を確認中",
    simulatedSource: "模擬相場 · 仮想ポイント",
    replaySource: "模擬時計リプレイ · 自然な抽選ではありません",
    noSource: "今回の情報源の公開待ち",
  },
};
const validTime = (value) =>
  Number.isSafeInteger(value) &&
  value > 0 &&
  Number.isFinite(new Date(value).getTime());
const formatters = new Map();
function clockFormat(language, zone) {
  const key = `${language}/${zone}`;
  if (formatters.has(key)) return formatters.get(key);
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat(language, {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    formatter = new Intl.DateTimeFormat(language, {
      timeZone: "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  formatters.set(key, formatter);
  return formatter;
}

export function describeHomeRound(
  state,
  now,
  language = "zh-CN",
  timeZone = "Asia/Shanghai",
) {
  const lang = text[language] ? language : "en",
    words = text[lang];
  const round = selectDisplayRound(state?.rounds);
  const mode =
    round?.proof?.execution === "ONLINE_REPLAY_SIMULATED_CLOCK"
      ? "REPLAY"
      : state?.demo || round?.manifest?.mode === "DEMO"
        ? "DEMO"
        : round?.manifest?.mode;
  const cutoff = validTime(round?.cutoff) ? round.cutoff : null;
  const ready = validTime(round?.ready) ? round.ready : null;
  const markets = Array.isArray(round?.manifest?.markets)
    ? round.manifest.markets
    : [];
  const sources = Array.isArray(round?.manifest?.sources)
    ? round.manifest.sources.filter((s) => typeof s === "string")
    : [];
  const closes = markets.map((m) => m?.closeUTC);
  let phase,
    target = null;
  if (!state) phase = "loading";
  else if (!round) phase = "empty";
  else if (round.status === "paused") phase = "paused";
  else if (round.status === "settled")
    phase = round.proof ? "settled" : "unavailable";
  else if (
    !cutoff ||
    !ready ||
    cutoff >= ready ||
    !Number.isFinite(now) ||
    !["LIVE", "DEMO", "REPLAY"].includes(mode) ||
    (mode !== "DEMO" &&
      (!closes.length ||
        !closes.every(validTime) ||
        ready < Math.max(...closes) ||
        cutoff >= Math.min(...closes)))
  )
    phase = "unavailable";
  else if (now < cutoff) {
    phase = "sales";
    target = cutoff;
  } else if (mode !== "DEMO" && (!closes.length || !closes.every(validTime)))
    phase = "unavailable";
  else if (mode !== "DEMO" && now < Math.max(...closes))
    phase = "awaitingClose";
  else if (now < ready) {
    phase = "confirming";
    target = ready;
  } else phase = "waiting";

  const formatter = clockFormat(lang, timeZone);
  const v2 = [2, 3].includes(round?.manifest?.version);
  const entropyLabels = {
    "zh-CN": "等待一致行情或未来信标",
    en: "Awaiting consensus or future beacon",
    ja: "相場の一致または将来ビーコン待ち",
  };
  const entropyNotes = {
    "zh-CN": "v2 首次行情冻结后，还需等待至少 120 秒后的指定信标并验签。",
    en: "v2 also waits for its specified beacon at least 120 seconds after the first price freeze, then verifies its signature.",
    ja: "v2 は相場固定から120秒以上先の指定ビーコンを待ち、署名を検証します。",
  };
  const zone = formatter.resolvedOptions().timeZone;
  let note =
    phase === "paused"
      ? words.pausedNote
      : phase === "settled"
        ? words.history
        : phase === "empty"
          ? words.emptyNote
          : phase === "loading"
            ? words.loadingNote
            : phase === "unavailable"
              ? words.unknownNote
              : mode === "DEMO"
                ? words.demoWait
                : words.note;
  if (mode === "DEMO") note = words.demo + " " + note;
  if (mode === "REPLAY") note = words.replay + " " + note;
  const price =
    Number.isSafeInteger(round?.manifest?.price) && round.manifest.price > 0
      ? round.manifest.price
      : 10;
  return {
    round,
    phase,
    target,
    mode,
    timeZone: zone,
    pointsNote: words.points(price),
    cardTitle:
      phase === "settled"
        ? words.historyTitle
        : phase === "paused"
          ? words.plannedTitle
          : words.title,
    cutoffLabel:
      phase === "settled"
        ? words.priorCutoff
        : phase === "paused"
          ? words.plannedCutoff
          : words.cutoff,
    readyLabel:
      phase === "settled"
        ? words.priorReady
        : phase === "paused"
          ? words.plannedReady
          : words.ready,
    cutoff,
    ready,
    cutoffText: cutoff ? formatter.format(cutoff) : "—",
    readyText: ready ? formatter.format(ready) : "—",
    timingNote: `${words.timezone}: ${zone} · ${note}${v2 ? " " + entropyNotes[lang] : ""}`,
    auditLabel: !round
      ? words.noRoundAudit
      : phase === "settled"
        ? words.archiveAudit
        : words.audit,
    auditHref: round
      ? "/verify.html?round=" + encodeURIComponent(round.id)
      : "/verify.html",
    countdownLabel:
      phase === "waiting" && v2 ? entropyLabels[lang] : words[phase],
    statusLabel:
      phase === "sales"
        ? words.statusSales
        : ["awaitingClose", "confirming", "waiting"].includes(phase)
          ? phase === "waiting" && v2
            ? entropyLabels[lang]
            : words.statusWaiting
          : words[phase],
    sourceText:
      !round || !sources.length
        ? words.noSource
        : mode === "DEMO"
          ? words.simulatedSource
          : mode === "REPLAY"
            ? words.replaySource
            : `${sources.join(" + ")} · ${markets
                .map((m) =>
                  typeof m?.symbol === "string"
                    ? m.symbol.split(":").pop()
                    : "",
                )
                .filter(Boolean)
                .join(" / ")}`,
  };
}

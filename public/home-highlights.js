import { describeHomeHighlights } from "./home-highlights-model.js";
import { describeHomeRound } from "./round-summary.js";

const copy = {
  "zh-CN": {
    recentTitle: "最近开奖结果",
    progressTitle: "本期进度 · 等待揭晓",
    progressNote: "按已公布规则等待，固定来源一致后才公布结果。",
    currentPhase: "当前进度",
    checkingProgress: "公布记录待核对",
    progressSteps: ["选号", "停售", "行情核验", "公布"],
    demoSteps: ["选号", "停售", "模拟核验", "模拟公布"],
    checkScope: "复算覆盖公开输入与号码；原始响应及全账本需另行核验。",
    recentNote: "本站已公布号码 · 历史结果与当前奖池分开记录",
    formatsTitle: "一池期待，16国玩法",
    formatsNote: "同一共享积分奖池 · 各国选号结构模拟 · 先看规则再选号",
    poolLink: "查看奖池流水 →",
    chooseResult: "查看哪种玩法的结果？",
    round: "结果期号",
    marketDate: "行情交易日",
    proof: "查看这期结果与复算 →",
    waitingLink: "查看本期时间与规则 →",
    waitingTitle: "开奖结果，等待揭晓。",
    loadingTitle: "正在读取开奖结果…",
    main: "主球",
    bonus: "特别球",
    numbers: "已公布号码",
    select: (name) => `选择${name}，查看规则与选号`,
    loadingFormats: "正在载入各国玩法…",
  },
  en: {
    recentTitle: "Latest draw results",
    progressTitle: "This round · Awaiting results",
    progressNote:
      "Following the published rules. Results require agreement from the fixed sources.",
    currentPhase: "Current stage",
    checkingProgress: "Published record needs checking",
    progressSteps: ["Pick", "Sales close", "Price checks", "Publish"],
    demoSteps: ["Pick", "Sales close", "Demo checks", "Demo result"],
    checkScope:
      "Reproduce published inputs and numbers here. Raw responses and the full ledger require separate checks.",
    recentNote:
      "Published here · Past results and the current pool are separate",
    formatsTitle: "One pool. 16 national formats.",
    formatsNote:
      "One shared points pool · Inspired number formats · Read the rules first",
    poolLink: "View pool ledger →",
    chooseResult: "Which format’s result?",
    round: "Result round",
    marketDate: "Market session date",
    proof: "See this result and reproduce it →",
    waitingLink: "See this round’s timing and rules →",
    waitingTitle: "The result is still to come.",
    loadingTitle: "Loading draw results…",
    main: "Main balls",
    bonus: "Special ball",
    numbers: "Published numbers",
    select: (name) => `Select ${name} to read the rules and pick numbers`,
    loadingFormats: "Loading national formats…",
  },
  ja: {
    recentTitle: "直近の抽選結果",
    progressTitle: "今回の進捗 · 発表待ち",
    progressNote:
      "公開ルールに従って待機し、指定情報源の一致後に結果を公表します。",
    currentPhase: "現在の段階",
    checkingProgress: "公表記録の確認が必要",
    progressSteps: ["番号選択", "販売終了", "終値確認", "公表"],
    demoSteps: ["番号選択", "販売終了", "模擬確認", "模擬公表"],
    checkScope:
      "公開入力と番号を再計算できます。元の応答や全台帳は別途確認が必要です。",
    recentNote: "本サイトの公開番号 · 過去の結果と現在のプールは別の記録です",
    formatsTitle: "ひとつのプール、16か国の形式",
    formatsNote:
      "共有ポイントプール · 各国の番号形式を参考にした模擬ゲーム · まずルールを確認",
    poolLink: "プールの履歴を見る →",
    chooseResult: "どの形式の結果を見ますか？",
    round: "結果の回番号",
    marketDate: "相場の取引日",
    proof: "この結果と再計算を見る →",
    waitingLink: "今回の時刻とルールを見る →",
    waitingTitle: "抽選結果は発表待ちです。",
    loadingTitle: "抽選結果を読み込み中…",
    main: "主番号",
    bonus: "特別番号",
    numbers: "公開された番号",
    select: (name) => `${name}を選び、ルールと番号選択を見る`,
    loadingFormats: "各国の形式を読み込み中…",
  },
};
let recentChoice = "cn";
let recentKey, formatsKey, onGamePick;
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
function setText(id, value) {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
}
function link(text, href, className) {
  const el = node("a", text, className);
  el.href = href;
  return el;
}
function renderRecent(recent, words, summary) {
  const panel = document.getElementById("recentDrawPanel");
  if (!panel) return;
  const key = JSON.stringify([
    recent,
    words.recentTitle,
    summary.round?.id,
    summary.round?.status,
    summary.cutoff,
    summary.ready,
    summary.timeZone,
  ]);
  if (key === recentKey) return;
  recentKey = key;
  panel.dataset.status = recent.status;
  panel.dataset.mode = recent.mode || "";
  panel.dataset.round = recent.roundId || "";
  panel.replaceChildren();
  if (recent.modeLabel)
    panel.append(
      node(
        "span",
        recent.modeLabel,
        "highlight-mode" +
          (recent.mode === "DEMO"
            ? " is-demo"
            : recent.mode === "REPLAY"
              ? " is-replay"
              : ""),
      ),
    );
  if (recent.status !== "ready") {
    const empty = node("div", undefined, "recent-draw-empty");
    empty.append(
      node(
        "strong",
        recent.status === "loading" ? words.loadingTitle : words.waitingTitle,
      ),
      node("p", recent.message),
    );
    if (recent.status === "waiting" && summary.round) {
      const phase = node("p", undefined, "recent-meta");
      phase.id = "recentDrawPhase";
      const progress = node("ol", undefined, "round-progress");
      progress.id = "recentDrawProgress";
      const steps =
        summary.mode === "DEMO" || summary.mode === "REPLAY"
          ? words.demoSteps
          : words.progressSteps;
      steps.forEach((label) => progress.append(node("li", label)));
      const timing = node("p", undefined, "recent-timing");
      timing.append(
        node("span", `${summary.cutoffLabel} ${summary.cutoffText}`),
        node(
          "span",
          `${summary.readyLabel} ${summary.readyText} (${summary.timeZone})`,
        ),
      );
      empty.append(
        phase,
        progress,
        timing,
        node(
          "p",
          summary.phase === "settled"
            ? `${summary.timeZone} · ${words.checkingProgress}`
            : summary.timingNote,
          "recent-meta",
        ),
      );
    }
    panel.append(empty);
    panel.append(link(words.waitingLink, recent.href, "recent-proof-link"));
    panel.append(node("p", words.checkScope, "recent-meta"));
    return;
  }
  const meta = node("p", undefined, "recent-meta");
  meta.append(node("span", `${words.round} ${recent.roundId.slice(0, 8)}`));
  if (recent.marketDate)
    meta.append(
      document.createTextNode(" · "),
      node("span", `${words.marketDate} ${recent.marketDate}`),
    );
  panel.append(meta);
  const field = node("div", undefined, "recent-game-selector");
  const label = node("label", words.chooseResult);
  label.htmlFor = "recentGameSelect";
  const select = node("select");
  select.id = "recentGameSelect";
  for (const game of recent.games) {
    const option = node("option", `${game.flag} ${game.name}`);
    option.value = game.id;
    select.append(option);
  }
  if (!recent.games.some((game) => game.id === recentChoice))
    recentChoice = recent.games[0].id;
  select.value = recentChoice;
  field.append(label, select);
  const balls = node("div", undefined, "recent-balls");
  balls.id = "recentDrawBalls";
  const drawBalls = () => {
    const game = recent.games.find((item) => item.id === select.value);
    if (!game) return;
    recentChoice = game.id;
    balls.dataset.game = game.id;
    balls.setAttribute("role", "group");
    balls.setAttribute("aria-label", `${game.name} · ${words.numbers}`);
    balls.replaceChildren();
    for (const number of game.main)
      balls.append(
        node("span", String(number).padStart(2, "0"), "recent-ball"),
      );
    if (game.bonus !== null && game.bonus !== undefined) {
      const bonus = node(
        "span",
        String(game.bonus).padStart(2, "0"),
        "recent-ball bonus",
      );
      bonus.setAttribute("aria-label", `${words.bonus} ${game.bonus}`);
      balls.append(bonus);
    }
  };
  select.addEventListener("change", drawBalls);
  drawBalls();
  panel.append(field, balls, node("p", recent.message, "recent-meta"));
  panel.append(link(words.proof, recent.href, "recent-proof-link"));
  panel.append(node("p", words.checkScope, "recent-meta"));
}

// Uses the same tested clock phases as the hero; it never predicts a result.
export function syncHomeHighlightProgress(summary, language = "zh-CN") {
  const words = copy[language] || copy.en;
  // A rejected published proof must not make the waiting card claim success.
  const label =
    summary.phase === "settled" ? words.checkingProgress : summary.statusLabel;
  setText("recentDrawPhase", `${words.currentPhase}：${label}`);
  const current = {
    sales: 0,
    awaitingClose: 1,
    confirming: 2,
    waiting: 2,
  }[summary.phase];
  document.querySelectorAll("#recentDrawProgress li").forEach((item, index) => {
    item.classList.toggle("is-current", index === current);
    item.classList.toggle(
      "is-complete",
      current !== undefined && index < current,
    );
    if (index === current) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
}
function renderFormats(formats, words, selectedGame) {
  const box = document.getElementById("worldFormats");
  if (!box) return;
  const key = JSON.stringify([formats, words.formatsTitle]);
  if (key !== formatsKey) {
    formatsKey = key;
    box.replaceChildren();
    if (!formats.length) box.append(node("p", words.loadingFormats));
    for (const game of formats) {
      const button = node("button", undefined, "world-format");
      button.type = "button";
      button.dataset.format = game.id;
      button.setAttribute("aria-label", words.select(game.name));
      const flag = node("span", game.flag, "format-flag");
      flag.setAttribute("aria-hidden", "true");
      const country = game.name.split(" · ")[0];
      button.append(
        flag,
        node("b", country, "format-name"),
        node("small", game.selection, "format-rule"),
      );
      button.title = `${game.name} · ${game.summary}`;
      button.addEventListener("click", () => onGamePick?.(game.id));
      box.append(button);
    }
  }
  for (const button of box.querySelectorAll("[data-format]")) {
    const active = button.dataset.format === selectedGame;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("active", active);
  }
}

// Presentation only: this module never purchases a ticket or changes a round.
export function renderHomeHighlights(
  state,
  {
    language = "zh-CN",
    selectedGame = "cn",
    onSelectGame,
    now = Date.now(),
  } = {},
) {
  onGamePick = onSelectGame;
  const words = copy[language] || copy.en;
  const view = describeHomeHighlights(state, language);
  const summary = describeHomeRound(
    state,
    now,
    language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const formatsTitle = view.formats.length
    ? words.formatsTitle.replace("16", String(view.formats.length))
    : words.formatsTitle;
  setText(
    "heroPoolLabel",
    view.pool.label +
      (view.pool.mode === "DEMO" || view.pool.mode === "REPLAY"
        ? ` · ${view.pool.modeLabel}`
        : ""),
  );
  setText("heroPoolAmount", view.pool.formatted);
  setText("heroPoolUnit", view.pool.unit);
  setText("heroPoolNote", view.pool.note);
  setText("heroPoolLink", words.poolLink);
  const amount = document.getElementById("heroPoolAmount");
  if (amount)
    amount.dataset.value = view.pool.hasValue ? String(view.pool.value) : "";
  const poolLink = document.getElementById("heroPoolLink");
  if (poolLink) poolLink.href = "#ledger";
  const recentTitle =
    view.recent.status === "waiting" && summary.round
      ? words.progressTitle
      : words.recentTitle;
  setText("recentDrawTitle", recentTitle);
  setText(
    "recentDrawNote",
    view.recent.status === "waiting" && summary.round
      ? words.progressNote
      : words.recentNote,
  );
  setText("worldFormatsTitle", formatsTitle);
  setText("worldFormatsEyebrow", `${view.formats.length || 16} WAYS TO PICK`);
  setText("worldFormatsNote", words.formatsNote);
  document
    .querySelector(".lottery-highlights")
    ?.setAttribute("aria-label", `${recentTitle} · ${formatsTitle}`);
  renderRecent(view.recent, words, summary);
  syncHomeHighlightProgress(summary, language);
  renderFormats(view.formats, words, selectedGame);
}

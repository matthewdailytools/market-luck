import { describeHomeHighlights } from "./home-highlights-model.js";

const copy = {
  "zh-CN": {
    recentTitle: "最近开奖结果",
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
function renderRecent(recent, words) {
  const panel = document.getElementById("recentDrawPanel");
  if (!panel) return;
  const key = JSON.stringify([recent, words.recentTitle]);
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
    panel.append(empty);
    panel.append(link(words.waitingLink, recent.href, "recent-proof-link"));
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
  { language = "zh-CN", selectedGame = "cn", onSelectGame } = {},
) {
  onGamePick = onSelectGame;
  const words = copy[language] || copy.en;
  const view = describeHomeHighlights(state, language);
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
  setText("heroPoolNote", view.pool.note);
  setText("heroPoolLink", words.poolLink);
  const amount = document.getElementById("heroPoolAmount");
  if (amount)
    amount.dataset.value = view.pool.hasValue ? String(view.pool.value) : "";
  const poolLink = document.getElementById("heroPoolLink");
  if (poolLink) poolLink.href = "#ledger";
  setText("recentDrawTitle", words.recentTitle);
  setText("recentDrawNote", words.recentNote);
  setText("worldFormatsTitle", formatsTitle);
  setText("worldFormatsEyebrow", `${view.formats.length || 16} WAYS TO PICK`);
  setText("worldFormatsNote", words.formatsNote);
  document
    .querySelector(".lottery-highlights")
    ?.setAttribute("aria-label", `${words.recentTitle} · ${formatsTitle}`);
  renderRecent(view.recent, words);
  renderFormats(view.formats, words, selectedGame);
}

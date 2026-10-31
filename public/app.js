import { renderGameRules } from "./game-rules.js";
import { initLanguages, translate } from "./i18n.js";
import { createPurchaseFlow } from "./purchase-flow.js";
import { describeHomeRound, selectDisplayRound } from "./round-summary.js";
import {
  renderHomeHighlights,
  syncHomeHighlightProgress,
} from "./home-highlights.js";
import {
  initCampaigns,
  syncCampaigns,
  syncCampaignClock,
} from "./campaigns.js";
initLanguages();
initCampaigns();
const $ = (s) => document.querySelector(s);
let state,
  gid = "cn",
  chosen = [],
  special = null,
  selectionContext = null;
let serverOffset = 0;
const serverNow = () => Date.now() + serverOffset;
const purchaseFlow = createPurchaseFlow({
  getState: () => state,
  getSelection: () => ({ gameId: gid, main: [...chosen], bonus: special }),
  refresh: () => refresh(),
  api: (...args) => api(...args),
  now: serverNow,
  onRandom: () => randomPick(),
  onPickAgain: () => {
    chosen = [];
    special = null;
    picker();
  },
  notify: (message) => toast(message),
});
updateHeroSummary();
updateHomeHighlights();
const toast = (s) => {
  $("#toast").textContent = s;
  $("#toast").style.display = "block";
  setTimeout(() => ($("#toast").style.display = "none"), 4500);
};
async function api(path, body) {
  const r = await fetch(
    "/api/" + path,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await r.json();
  if (!r.ok) {
    const error = Error(data.error);
    error.status = r.status;
    throw error;
  }
  return data;
}
const current = () => state?.rounds.find((r) => r.status === "open");
function make(tag, text, cls) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function rows(selector, items, render) {
  const box = $(selector);
  box.replaceChildren();
  if (!items.length) box.append(make("p", "暂无记录"));
  items.forEach((i) => box.append(render(i)));
}
function updateHomeHighlights() {
  renderHomeHighlights(state, {
    language: document.documentElement.lang,
    selectedGame: gid,
    now: serverNow(),
    onSelectGame: (id) => selectGame(id, true),
  });
}
function selectGame(id, scroll = false) {
  const catalog = current()?.manifest.games || state?.games || [];
  if (!catalog.some((game) => game.id === id)) return;
  purchaseFlow.selectionChanged();
  gid = id;
  chosen = [];
  special = null;
  renderGameCards();
  picker();
  updateHomeHighlights();
  if (scroll) {
    const rules = document.querySelector(".game-rules");
    rules.open = true;
    const title = document.querySelector("#gameRules");
    title.setAttribute("tabindex", "-1");
    title.focus({ preventScroll: true });
    rules.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }
}
function renderGameCards() {
  normalizeSelection();
  rows("#games", current()?.manifest.games || state.games, (g) => {
    const b = make("button", "", `game${g.id === gid ? " active" : ""}`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(g.id === gid));
    b.append(
      make("span", g.flag),
      make("b", g.name),
      make(
        "small",
        `${g.count} / ${g.max}${g.bonus ? " + 1 / " + g.bonus : ""}`,
      ),
    );
    b.onclick = () => selectGame(g.id);
    return b;
  });
}
function normalizeSelection() {
  const catalog = current()?.manifest.games || state.games;
  const game = catalog.find((item) => item.id === gid) || catalog[0];
  const context = JSON.stringify([
    current()?.id || null,
    game.id,
    game.count,
    game.max,
    game.bonus,
    game.bonusMin ?? 1,
  ]);
  if (selectionContext !== context) {
    chosen = [];
    special = null;
    selectionContext = context;
  }
  gid = game.id;
  return game;
}
function picker() {
  const g = normalizeSelection();
  renderGameRules(g, document.documentElement.lang);
  $("#gameName").textContent = g.name;
  $("#rule").textContent =
    `主球选 ${g.count} 个（1–${g.max}）${g.bonus ? ` + 特别球 1 个（${g.bonusMin ?? 1}–${(g.bonusMin ?? 1) + g.bonus - 1}）` : ""} · 虚拟规则`;
  for (const [sel, max, isBonus] of [
    ["#numbers", g.max, false],
    ["#bonus", g.bonus, true],
  ]) {
    const box = $(sel);
    box.replaceChildren();
    for (
      let n = isBonus ? (g.bonusMin ?? 1) : 1;
      n < (isBonus ? (g.bonusMin ?? 1) : 1) + max;
      n++
    ) {
      const b = make(
        "button",
        String(n).padStart(2, "0"),
        "ball" +
          ((isBonus ? special === n : chosen.includes(n)) ? " selected" : ""),
      );
      b.setAttribute("aria-label", translate(isBonus ? "特别球" : "主球") + n);
      b.setAttribute(
        "aria-pressed",
        String(isBonus ? special === n : chosen.includes(n)),
      );
      b.onclick = () => {
        purchaseFlow.selectionChanged();
        if (isBonus) special = n;
        else if (chosen.includes(n)) chosen = chosen.filter((x) => x !== n);
        else if (chosen.length < g.count) chosen.push(n);
        picker();
      };
      box.append(b);
    }
  }
  $("#bonusLabel").textContent = g.bonus ? "特别球" : "";
  $("#selection").textContent =
    `已选 ${chosen.length}/${g.count}${g.bonus ? ` · 特别球 ${special ?? "未选"}` : ""}`;
  purchaseFlow.render();
}
async function refresh() {
  state = await api("state");
  serverOffset = (state.serverTime || Date.now()) - Date.now();
  $("#pool").textContent = state.pool.toLocaleString();
  $("#balance").textContent = state.me
    ? state.me.balance.toLocaleString()
    : "未登录";
  $("#account").textContent = state.me ? state.me.name : "登录 / 注册";
  $("#logout").hidden = !state.me;
  document.querySelector(".demo").hidden = !state.demo || state.autoDraw;
  document.querySelector(".notice").textContent = state.demo
    ? "实验环境 / 模拟行情与模拟时钟，不代表真实股市开奖。公开复算让信任边界可见。"
    : "真实开奖 / Yahoo Finance + Nasdaq 双源一致后开奖。停售、闭市与24小时确认窗口提前锁定；缺失或分歧就等待。积分无现金价值。";
  const r = current();
  $("#commitment").textContent =
    r?.commitment || state.rounds[0]?.commitment || "尚未开期";
  const publication = state.anchors?.find(
    (a) => a.round_id === (r || state.rounds[0])?.id,
  );
  const targetRound = selectDisplayRound(state.rounds);
  let guideLink = document.querySelector("#roundGuideLink");
  if (!guideLink) {
    guideLink = make("a", "", "round-guide-link");
    guideLink.id = "roundGuideLink";
    document.querySelector("#commitment").after(guideLink);
  }
  guideLink.hidden = !targetRound;
  if (targetRound) {
    guideLink.href = "/verify.html?round=" + encodeURIComponent(targetRound.id);
    guideLink.textContent = translate("看懂本期规则与核验 →");
  }
  let anchorLink = document.querySelector("#anchorLink");
  if (!anchorLink) {
    anchorLink = make("a", "", "raw-json-link");
    anchorLink.id = "anchorLink";
    anchorLink.target = "_blank";
    anchorLink.rel = "noopener noreferrer";
    guideLink.after(anchorLink);
  }
  anchorLink.hidden = !publication;
  if (publication) {
    anchorLink.href = publication.url;
    anchorLink.textContent = translate("原始承诺 JSON ↗");
  }
  rows("#markets", r?.manifest.markets || [], (x) =>
    make(
      "div",
      `${x.symbol} · ${x.currency} · ${r.manifest.mode === "DEMO" ? "模拟收盘" : new Date(x.closeUTC).toLocaleString(document.documentElement.lang)}`,
    ),
  );
  renderGameCards();
  rows("#tickets", state.tickets, (t) => {
    const a = make("div", "", "row");
    a.append(
      make(
        "div",
        `${state.games.find((g) => g.id === t.game).name} · ${JSON.parse(t.numbers).join(" ")}${t.bonus !== null ? " + " + t.bonus : ""}`,
      ),
      make(
        "small",
        `票号 ${t.id.slice(0, 8)} · ${t.prize ? "中奖 +" + t.prize + " 分" : state.rounds.find((r) => r.id === t.round_id)?.status === "settled" ? "未中奖" : "等待开奖"}`,
      ),
    );
    return a;
  });
  rows("#winners", state.winners, (t) =>
    make(
      "div",
      `${t.user_id.slice(0, 8)} · 第 ${t.tier} 档 · +${t.prize.toLocaleString()} 分`,
      "row",
    ),
  );
  rows("#ledger", state.ledger, (t) =>
    make(
      "div",
      `#${t.id} · ${{ seed: "系统奖池注资", purchase: "购票入池", prize: "中奖出池" }[t.kind] || t.kind} · ${t.kind === "purchase" ? "+10" : t.kind === "prize" ? "-" + t.delta : "+" + t.delta} 分`,
      "row",
    ),
  );
  rows(
    "#proofs",
    state.rounds.filter((r) => r.proof),
    (r) => {
      const box = make("div", "");
      for (const g of r.proof.manifest.games) {
        const d = r.proof.results[g.id];
        if (!d) continue;
        box.append(
          make(
            "div",
            g.name +
              " · " +
              d.main.join(" ") +
              (d.bonus !== null ? " + " + d.bonus : ""),
          ),
        );
      }
      const a = make("a", "下载证据 / " + r.id.slice(0, 8));
      a.href = "/api/proof/" + r.id;
      box.append(a);
      const guide = make(
        "a",
        translate("查看本期复算说明 →"),
        "round-guide-link",
      );
      guide.href =
        "/verify.html?round=" + encodeURIComponent(r.id) + "#results";
      box.append(guide);
      return box;
    },
  );
  picker();
  updateHomeHighlights();
  syncCampaigns(state);
  tickCountdown();
}
const fail = (e) => toast(e.message);
$("#logout").onclick = async () => {
  await api("logout", {});
  refresh().catch(fail);
};
function randomInt(max) {
  const b = new Uint32Array(1),
    limit = Math.floor(4294967296 / max) * max;
  do {
    crypto.getRandomValues(b);
  } while (b[0] >= limit);
  return b[0] % max;
}
function randomPick() {
  if (!state?.games?.length) return;
  purchaseFlow.selectionChanged();
  const g = (current()?.manifest.games || state.games).find(
      (x) => x.id === gid,
    ),
    s = new Set();
  while (s.size < g.count) s.add(randomInt(g.max) + 1);
  chosen = [...s].sort((a, b) => a - b);
  special = g.bonus ? randomInt(g.bonus) + (g.bonusMin ?? 1) : null;
  picker();
}
$("#random").onclick = randomPick;
for (const action of ["create", "advance", "draw"])
  $("#" + action).onclick = async () => {
    try {
      await api("demo/" + action, { round: current()?.id });
      await refresh();
      toast(
        {
          create: "本期规则已锁定",
          advance: "已模拟闭市，停止售票",
          draw: "开奖完成，证据已归档",
        }[action],
      );
    } catch (e) {
      fail(e);
    }
  };
$("#refresh").onclick = () => refresh().catch(fail);
refresh().catch(fail);
setInterval(() => refresh().catch(() => {}), 30000);

document.querySelector("#language").addEventListener("change", () => {
  if (state) picker();
  updateHomeHighlights();
  syncCampaigns(state);
  tickCountdown();
});

function updateHeroSummary() {
  const summary = describeHomeRound(
    state,
    serverNow(),
    document.documentElement.lang,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  for (const [selector, value] of [
    ["#heroPointsNote", summary.pointsNote],
    [".draw-glass-label", summary.cardTitle],
    ["#heroCutoffLabel", summary.cutoffLabel],
    ["#heroReadyLabel", summary.readyLabel],
    ["#heroCutoff", summary.cutoffText],
    ["#heroReady", summary.readyText],
    ["#heroTimingNote", summary.timingNote],
    ["#heroAuditLink", summary.auditLabel],
    ["#status", summary.statusLabel],
    [
      "#deadline",
      summary.round
        ? `${summary.cutoffLabel} ${summary.cutoffText} · ${summary.readyLabel} ${summary.readyText} (${summary.timeZone})`
        : summary.timingNote,
    ],
  ]) {
    const el = $(selector);
    if (el && el.textContent !== value) el.textContent = value;
  }
  for (const [selector, ms] of [
    ["#heroCutoff", summary.cutoff],
    ["#heroReady", summary.ready],
  ]) {
    const el = $(selector);
    if (el && ms) el.setAttribute("datetime", new Date(ms).toISOString());
    else el?.removeAttribute("datetime");
  }
  const link = $("#heroAuditLink");
  if (link) link.setAttribute("href", summary.auditHref);
  return summary;
}
function tickCountdown() {
  const el = document.querySelector("#drawCountdown"),
    source = document.querySelector("#sourceStatus");
  if (!el) return;
  const summary = updateHeroSummary();
  syncHomeHighlightProgress(summary, document.documentElement.lang);
  const now = serverNow();
  syncCampaignClock(now);
  const target = summary.target;
  const delta = target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
  const duration = target
    ? `${Math.floor(delta / 86400)}d ${String(Math.floor(delta / 3600) % 24).padStart(2, "0")}:${String(Math.floor(delta / 60) % 60).padStart(2, "0")}:${String(delta % 60).padStart(2, "0")}`
    : "";
  el.textContent = summary.countdownLabel + (target ? " " + duration : "");
  if (source) source.textContent = summary.sourceText;
  if (!current() || now >= current().cutoff)
    document.querySelector("#buy").disabled = true;
  purchaseFlow.render();
}
setInterval(tickCountdown, 1000);

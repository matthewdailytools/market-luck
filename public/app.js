import { renderGameRules } from "./game-rules.js";
import { initLanguages, translate } from "./i18n.js";
initLanguages();
const $ = (s) => document.querySelector(s);
let state,
  gid = "cn",
  chosen = [],
  special = null;
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
  if (!r.ok) throw Error(data.error);
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
function picker() {
  const catalog = current()?.manifest.games || state.games;
  const g = catalog.find((x) => x.id === gid) || catalog[0];
  gid = g.id;
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
  $("#buy").disabled =
    chosen.length !== g.count ||
    (g.bonus && special === null) ||
    !current() ||
    Date.now() >= current().cutoff;
}
async function refresh() {
  state = await api("state");
  $("#pool").textContent = state.pool.toLocaleString();
  $("#balance").textContent = state.me
    ? state.me.balance.toLocaleString()
    : "未登录";
  $("#account").textContent = state.me ? state.me.name : "登录 / 注册";
  $("#logout").hidden = !state.me;
  document.querySelector(".demo").hidden = !state.demo || state.autoDraw;
  document.querySelector(".notice").textContent = state.demo
    ? "实验环境 / 模拟行情与模拟时钟，不代表真实股市开奖。公开复算让信任边界可见。"
    : "真实行情模式 / 固定免费源交叉核验，至少两源一致且无有效分歧。无共识则等待，不承诺绝对不可操控。";
  const r = current();
  $("#status").textContent = r
    ? Date.now() < r.cutoff
      ? "正在售票"
      : "等待开奖"
    : "等待开期";
  $("#deadline").textContent = r
    ? "停售 " + new Date(r.cutoff).toLocaleString(document.documentElement.lang)
    : "创建新期开始体验";
  $("#commitment").textContent =
    r?.commitment || state.rounds[0]?.commitment || "尚未开期";
  rows("#markets", r?.manifest.markets || [], (x) =>
    make(
      "div",
      `${x.symbol} · ${x.currency} · ${r.manifest.mode === "DEMO" ? "模拟收盘" : new Date(x.closeUTC).toLocaleString(document.documentElement.lang)}`,
    ),
  );
  rows("#games", r?.manifest.games || state.games, (g) => {
    const b = make("button", "", `game${g.id === gid ? " active" : ""}`);
    b.append(
      make("span", g.flag),
      make("b", g.name),
      make(
        "small",
        `${g.count} / ${g.max}${g.bonus ? " + 1 / " + g.bonus : ""}`,
      ),
    );
    b.onclick = () => {
      gid = g.id;
      chosen = [];
      special = null;
      refresh().catch(fail);
    };
    return b;
  });
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
      return box;
    },
  );
  picker();
}
const fail = (e) => toast(e.message);
$("#account").onclick = () => {
  if (!state.me) $("#auth").showModal();
};
$("#closeAuth").onclick = () => $("#auth").close();
$("#authForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api(e.submitter.value, {
      name: $("#name").value,
      password: $("#password").value,
    });
    $("#auth").close();
    await refresh();
    toast("欢迎来到 Market Luck");
  } catch (e) {
    fail(e);
  }
};
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
$("#random").onclick = () => {
  const g = (current()?.manifest.games || state.games).find(
      (x) => x.id === gid,
    ),
    s = new Set();
  while (s.size < g.count) s.add(randomInt(g.max) + 1);
  chosen = [...s].sort((a, b) => a - b);
  special = g.bonus ? randomInt(g.bonus) + (g.bonusMin ?? 1) : null;
  picker();
};
$("#buy").onclick = async () => {
  if (!state.me) {
    $("#auth").showModal();
    return;
  }
  $("#buy").disabled = true;
  try {
    await api("buy", {
      game: gid,
      main: chosen,
      bonus: special,
      round: current().id,
      key: crypto.randomUUID(),
    });
    await refresh();
    toast("购票成功，祝你好运！");
  } catch (e) {
    fail(e);
    picker();
  }
};
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
});

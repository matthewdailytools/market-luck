import { describeTicketHistory } from "./ticket-history-model.js";

const copy = {
  "zh-CN": {
    title: "你的每一注，都有记录。",
    nav: "我的彩票",
    note: "仅本人可见 · 最近100张 · 虚拟积分，无现金价值",
    refresh: "刷新票据 ↻",
    refreshing: "正在刷新…",
    login: "登录查看我的票据 →",
    choose: "去选下一注 →",
    round: "所属期次",
    ticket: "完整票号",
    created: "购票时间",
    cost: "本注成本",
    prize: "派奖记录",
    main: "主球",
    bonus: "特别球",
    audit: "查看这期规则、结果与复算 →",
    loadingRounds: "正在补查较早期次的公开记录…",
    failedRounds:
      "部分历史期次暂时无法读取，状态保留为待核实，可稍后刷新或打开核验页。",
    refreshError: "票据刷新失败；保留上次记录，请稍后重试。",
    asOf: "记录更新时间",
    timeZone: "显示时区",
    summary: (c) =>
      `本清单 ${c.shown} 张 · 待开奖 ${c.pending} · 已派奖 ${c.paid} · 未中奖 ${c.lost} · 其他待查看 ${c.paused + c.unverified + c.invalid}`,
  },
  en: {
    title: "Every ticket has a record.",
    nav: "My tickets",
    note: "Visible only to you · Latest 100 tickets · Virtual points, no cash value",
    refresh: "Refresh tickets ↻",
    refreshing: "Refreshing…",
    login: "Sign in to view my tickets →",
    choose: "Choose another ticket →",
    round: "Ticket round",
    ticket: "Full ticket ID",
    created: "Purchased",
    cost: "Ticket cost",
    prize: "Payout record",
    main: "Main ball",
    bonus: "Special ball",
    audit: "This round’s rules, results and reproduction →",
    loadingRounds: "Looking up older public round records…",
    failedRounds:
      "Some historical rounds could not be loaded. Their status stays unconfirmed; refresh later or open verification.",
    refreshError:
      "Could not refresh tickets. Previous records remain; try again later.",
    asOf: "Records updated",
    timeZone: "Display time zone",
    summary: (c) =>
      `${c.shown} shown · ${c.pending} awaiting draw · ${c.paid} paid · ${c.lost} no prize · ${c.paused + c.unverified + c.invalid} need a look`,
  },
  ja: {
    title: "一口ごとの記録を、ここに。",
    nav: "購入した券",
    note: "本人のみ表示 · 直近100枚 · 仮想ポイント、金銭的価値なし",
    refresh: "券の記録を更新 ↻",
    refreshing: "更新中…",
    login: "ログインして券を見る →",
    choose: "次の1口を選ぶ →",
    round: "対象の回",
    ticket: "券番号の全文",
    created: "購入日時",
    cost: "消費ポイント",
    prize: "配分の記録",
    main: "主番号",
    bonus: "特別番号",
    audit: "この回のルール・結果・再計算を見る →",
    loadingRounds: "以前の回の公開記録を取得中…",
    failedRounds:
      "一部の過去の回を取得できません。状態は未確認のままです。後で更新するか検証ページをご覧ください。",
    refreshError:
      "更新できませんでした。前回の記録を保持しています。後で再試行してください。",
    asOf: "記録の更新日時",
    timeZone: "表示タイムゾーン",
    summary: (c) =>
      `表示 ${c.shown}枚 · 抽選待ち ${c.pending} · 配分済み ${c.paid} · 落選 ${c.lost} · その他要確認 ${c.paused + c.unverified + c.invalid}`,
  },
};
const safeId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9-]{1,80}$/.test(value);

export function createTicketHistory({
  getState,
  fetchRound,
  refresh,
  onSignIn,
  now = () => Date.now(),
}) {
  const $ = (id) => document.getElementById(id);
  const cache = new Map(),
    pending = new Set(),
    failed = new Map();
  let loading = null,
    reloadRequested = false,
    forceNext = false;
  let owner = null,
    generation = 0,
    refreshing = false,
    refreshFailed = false,
    rendered = "";
  const language = () =>
    copy[document.documentElement.lang] ? document.documentElement.lang : "en";
  const set = (id, text) => {
    const el = $(id);
    if (el && el.textContent !== text) el.textContent = text;
  };
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function syncOwner() {
    const current = getState()?.me?.id || null;
    if (current !== owner) {
      owner = current;
      generation++;
      refreshing = false;
      refreshFailed = false;
      rendered = "";
    }
  }
  function view() {
    return describeTicketHistory(getState(), {
      language: language(),
      rounds: [...cache.values()].map((entry) => entry.round),
      now: now(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }
  function card(item, w) {
    const box = node("article", undefined, "ticket-card");
    box.dataset.ticketId = item.id || "";
    box.dataset.ticketStatus = item.status;
    const heading = node("div", undefined, "ticket-card-heading");
    heading.append(node("h3", `${item.flag || ""} ${item.title}`.trim()));
    const tone =
      { pending: "is-pending", paid: "is-won", paused: "is-paused" }[
        item.status
      ] || "";
    heading.append(node("span", item.statusLabel, "ticket-status " + tone));
    box.append(heading, node("p", item.modeLabel, "ticket-mode"));
    const numbers = node("div", undefined, "ticket-card-numbers");
    for (const n of item.main) {
      const ball = node("span", String(n).padStart(2, "0"), "ticket-ball");
      ball.setAttribute("aria-label", `${w.main} ${n}`);
      numbers.append(ball);
    }
    if (item.bonus !== null) {
      const ball = node(
        "span",
        String(item.bonus).padStart(2, "0"),
        "ticket-ball bonus",
      );
      ball.setAttribute("aria-label", `${w.bonus} ${item.bonus}`);
      numbers.append(ball);
    }
    box.append(numbers, node("p", item.note, "ticket-card-note"));
    const meta = node("dl", undefined, "ticket-card-meta");
    for (const [title, value] of [
      [w.ticket, item.id || "—"],
      [w.round, item.roundId || "—"],
      [w.created, item.createdText],
      [w.cost, item.costText],
      [w.prize, item.prizeText],
    ]) {
      const pair = node("div");
      pair.append(node("dt", title), node("dd", value));
      meta.append(pair);
    }
    box.append(meta);
    if (item.auditHref && item.roundId) {
      const actions = node("div", undefined, "ticket-card-actions"),
        link = node("a", w.audit);
      link.href = item.auditHref;
      actions.append(link);
      box.append(actions);
    }
    return box;
  }
  function render() {
    syncOwner();
    const w = copy[language()],
      m = view(),
      state = getState();
    set("ticketHistoryTitle", w.title);
    set("ticketHistoryNav", w.nav);
    set("receiptTicketsLink", w.nav + " →");
    set("onboardingTicketsLink", w.nav + " →");
    set(
      "ticketHistoryEyebrow",
      language() === "ja" ? "選んだ番号を記録" : "YOUR PICKS, ON RECORD",
    );
    set("ticketHistoryLogin", w.login);
    set("ticketHistoryChoose", w.choose);
    set("ticketHistoryRefresh", refreshing ? w.refreshing : w.refresh);
    const summary = m.status === "ready" ? w.summary(m.counts) : m.message;
    set("ticketHistorySummary", summary);
    let updated = "";
    if (owner && Number.isSafeInteger(state?.serverTime)) {
      const fmt = new Intl.DateTimeFormat(language(), {
        dateStyle: "short",
        timeStyle: "medium",
      });
      updated = ` · ${w.asOf}: ${fmt.format(state.serverTime)} · ${w.timeZone}: ${fmt.resolvedOptions().timeZone}`;
    }
    set("ticketHistoryNote", `${w.note}${updated}`);
    $("ticketHistoryRefresh").disabled = !owner || refreshing;
    $("ticketHistoryLogin").hidden = Boolean(owner);
    $("ticketHistoryEmpty").hidden = m.status === "ready";
    set("ticketHistoryEmpty", m.message);
    const ids = new Set(
      (Array.isArray(state?.tickets) ? state.tickets : [])
        .filter((t) => t?.user_id === owner)
        .slice(0, 100)
        .map((t) => t.round_id)
        .filter(safeId),
    );
    const loading = [...ids].some((id) => pending.has(id));
    const hasFailed = [...ids].some((id) => failed.has(id));
    const notice = refreshFailed
      ? w.refreshError
      : loading
        ? w.loadingRounds
        : hasFailed
          ? w.failedRounds
          : "";
    let noticeBox = $("ticketHistoryLoadStatus");
    if (!noticeBox) {
      noticeBox = node("p", undefined, "ticket-history-load-status");
      noticeBox.id = "ticketHistoryLoadStatus";
      noticeBox.setAttribute("role", "status");
      $("tickets").before(noticeBox);
    }
    noticeBox.hidden = !notice;
    set("ticketHistoryLoadStatus", notice);
    const key = JSON.stringify([owner, language(), m.items]);
    if (key !== rendered) {
      $("tickets").replaceChildren(...m.items.map((item) => card(item, w)));
      rendered = key;
    }
    return m;
  }
  async function loadBatch(force = false) {
    syncOwner();
    if (!owner) return;
    const expected = generation,
      state = getState();
    const supplied = new Set(
      (Array.isArray(state?.rounds) ? state.rounds : []).map((r) => r?.id),
    );
    const ids = [
      ...new Set(
        (Array.isArray(state?.tickets) ? state.tickets : [])
          .filter((t) => t?.user_id === owner)
          .slice(0, 100)
          .map((t) => t.round_id)
          .filter(safeId),
      ),
    ];
    const work = ids.filter((id) => {
      if (supplied.has(id) || pending.has(id)) return false;
      const entry = cache.get(id),
        retryAt = failed.get(id);
      if (force && retryAt) return true;
      if (retryAt && now() < retryAt) return false;
      const terminal =
        entry?.round.status === "paused" ||
        (entry?.round.status === "settled" && entry.round.proof);
      return !entry || (!terminal && now() - entry.fetchedAt >= 30000);
    });
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, work.length) }, async () => {
        while (index < work.length && expected === generation) {
          const id = work[index++];
          pending.add(id);
          render();
          try {
            const payload = await fetchRound(id);
            if (
              payload?.round?.id !== id ||
              !["open", "settled", "paused"].includes(payload.round.status)
            )
              throw Error("Invalid public round");
            cache.set(id, { round: payload.round, fetchedAt: now() });
            failed.delete(id);
          } catch {
            failed.set(id, now() + 60000);
          } finally {
            pending.delete(id);
            render();
          }
        }
      }),
    );
    // Only public round metadata is cached; private tickets always come from the current account state.
    if (cache.size > 200)
      for (const id of cache.keys()) {
        if (!ids.includes(id)) cache.delete(id);
        if (cache.size <= 200) break;
      }
  }
  function loadOlderRounds(force = false) {
    reloadRequested = true;
    forceNext ||= force;
    if (loading) return loading;
    loading = (async () => {
      do {
        reloadRequested = false;
        const forced = forceNext;
        forceNext = false;
        await loadBatch(forced);
      } while (reloadRequested);
    })().finally(() => {
      loading = null;
    });
    return loading;
  }
  $("ticketHistoryLogin").onclick = () => onSignIn();
  $("ticketHistoryRefresh").onclick = async () => {
    syncOwner();
    if (refreshing || !owner) return;
    const expected = generation;
    refreshing = true;
    refreshFailed = false;
    render();
    try {
      if ((await refresh()) === false) throw Error("Snapshot superseded");
      syncOwner();
      if (expected === generation) await loadOlderRounds(true);
    } catch {
      if (expected === generation) refreshFailed = true;
    } finally {
      if (expected === generation) refreshing = false;
      render();
    }
  };
  return { render, loadOlderRounds };
}

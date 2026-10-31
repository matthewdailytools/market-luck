import { translate } from "./i18n.js";
import { describeHomeRound } from "./round-summary.js";
import {
  validatePurchaseDraft,
  sameDraft,
  validatePurchaseReceipt,
  findConfirmedTicket,
} from "./purchase-flow-model.js";

const labels = {
  firstRunEyebrow: ["YOUR FIRST TICKET", "YOUR FIRST TICKET", "はじめての1口"],
  firstRunTitle: [
    "从领积分，到你的第一注。",
    "From welcome points to your first ticket.",
    "登録ポイントから、はじめての1口へ。",
  ],
  onboardingRegisterTitle: ["注册领积分", "Get welcome points", "登録ポイント"],
  onboardingCountryTitle: ["选择国家玩法", "Choose a format", "形式を選ぶ"],
  onboardingNumbersTitle: ["挑选幸运号码", "Pick your numbers", "番号を選ぶ"],
  onboardingReviewTitle: [
    "核对后再购票",
    "Review, then confirm",
    "確認して購入",
  ],
  onboardingChoose: ["选择玩法 →", "Choose a format →", "形式を選ぶ →"],
  onboardingRandom: ["随机选一注 →", "Quick pick →", "ランダムで選ぶ →"],
  onboardingReview: [
    "核对号码与积分 →",
    "Review numbers and cost →",
    "番号とポイントを確認 →",
  ],
  purchaseCostLabel: ["每注成本", "Cost per ticket", "1口の消費"],
  purchaseBalanceLabel: ["我的积分", "My balance", "保有ポイント"],
  purchaseAfterLabel: ["本注确认后", "After this ticket", "この1口の購入後"],
  pickedPreviewLabel: ["你选好的号码", "Your selected numbers", "選んだ番号"],
  pickerAuditLink: [
    "查看本期规则、时间与核验 →",
    "This round’s rules, timing and verification →",
    "今回のルール・時刻・検証を見る →",
  ],
  authEyebrow: [
    "WELCOME TO MARKET LUCK",
    "WELCOME TO MARKET LUCK",
    "MARKET LUCKへようこそ",
  ],
  authRegisterTab: ["注册领积分", "Register", "新規登録"],
  authLoginTab: ["已有账号登录", "Sign in", "ログイン"],
  authNameLabel: ["用户名", "Username", "ユーザー名"],
  authPasswordLabel: ["密码", "Password", "パスワード"],
  authNameHint: [
    "3–24个字母、数字、下划线或连字符。",
    "3–24 letters, numbers, underscores or hyphens.",
    "3～24文字の文字・数字・_・-。",
  ],
  authPasswordHint: [
    "8–128个字符；请使用独立密码。",
    "8–128 characters. Use a separate password.",
    "8～128文字。専用のパスワードを使用してください。",
  ],
  reviewEyebrow: [
    "CHECK BEFORE YOU CONFIRM",
    "CHECK BEFORE YOU CONFIRM",
    "購入前に確認",
  ],
  reviewTitle: ["核对这一注。", "Review this ticket.", "この1口を確認。"],
  reviewCostLabel: ["本注成本", "Ticket cost", "消費ポイント"],
  reviewBalanceLabel: ["当前余额", "Current balance", "現在の残高"],
  reviewAfterLabel: [
    "预计确认后余额",
    "Expected balance after",
    "購入後の予定残高",
  ],
  reviewAuditLink: [
    "查看这一期的规则与核验 →",
    "Verify this round’s rules →",
    "この回のルールと検証を見る →",
  ],
  cancelPurchase: ["返回修改", "Back to edit", "戻って変更"],
  receiptAuditLink: [
    "查看这张票所属期次与核验 →",
    "View this ticket’s round and verification →",
    "この券の回と検証を見る →",
  ],
  pickAgain: ["再选一注", "Choose another ticket", "次の1口を選ぶ"],
};
const words = {
  unit: ["积分", "points", "ポイント"],
  signInBalance: ["登录后显示", "Sign in to view", "ログイン後に表示"],
  predicted: ["登录后计算", "Calculated after sign-in", "ログイン後に計算"],
  registration: [
    "注册一次赠1,000积分；每注10积分，无充值提现。可先选号，登录后保留。",
    "Get 1,000 points once at registration. Tickets cost 10 points; no top-ups or withdrawals. Picks are kept through sign-in.",
    "登録時1,000ポイントを1回付与。1口10ポイント、入出金はありません。ログイン後も選択を保持します。",
  ],
  member: [
    "已登录；先看规则、选好号码，再核对本注成本。",
    "You’re signed in. Read the rules, pick numbers, then review the ticket cost.",
    "ログイン済みです。ルールと番号を選び、この1口の消費を確認してください。",
  ],
  register: [
    "注册并领1,000积分 →",
    "Register for 1,000 points →",
    "登録して1,000ポイント →",
  ],
  signedIn: [
    "已登录，继续选玩法 →",
    "Signed in · Choose a format →",
    "ログイン済み・形式を選ぶ →",
  ],
  authTitle: [
    "注册，领1,000积分。",
    "Start with 1,000 points.",
    "登録して1,000ポイント。",
  ],
  loginTitle: ["欢迎回来。", "Welcome back.", "おかえりなさい。"],
  authHint: [
    "仅新注册赠分一次，登录不重复领取。积分无现金价值。",
    "The welcome grant is issued once on registration. Sign-in gives no extra grant. Points have no cash value.",
    "初回登録時に1回のみ付与。ログインによる再付与はありません。現金価値はありません。",
  ],
  authResume: [
    "你选好的号码会保留；完成后仍需核对并明确确认，不会自动购票。",
    "Your picks are kept. You must review and confirm afterwards; no ticket is bought automatically.",
    "選んだ番号を保持します。完了後に再確認が必要で、自動購入は行いません。",
  ],
  submitRegister: [
    "注册并领取积分",
    "Register and get points",
    "登録してポイントを受け取る",
  ],
  submitLogin: ["登录并继续", "Sign in and continue", "ログインして続ける"],
  authBusy: ["正在处理，请稍候…", "Working, please wait…", "処理中です…"],
  inputInvalid: [
    "请检查用户名与密码长度。",
    "Check the username and password requirements.",
    "ユーザー名とパスワードの条件を確認してください。",
  ],
  welcome: [
    "注册赠分已到账。",
    "Your welcome points are ready.",
    "登録ポイントを受け取りました。",
  ],
  loggedIn: [
    "登录成功，号码已保留。",
    "Signed in. Your picks are kept.",
    "ログインしました。選んだ番号を保持しています。",
  ],
  noPicks: [
    "尚未选择号码，可使用随机选号。",
    "No numbers yet. Try Quick pick.",
    "番号未選択です。ランダム選択も使えます。",
  ],
  review: ["核对号码与积分", "Review numbers and cost", "番号とポイントを確認"],
  authReview: [
    "保留号码，注册或登录后核对",
    "Keep picks · Sign in to review",
    "番号を保持してログイン後に確認",
  ],
  confirm: ["确认购票", "Confirm ticket", "購入を確定"],
  retry: ["重试本次确认", "Retry this confirmation", "この購入を再試行"],
  submitting: [
    "正在确认，请勿重复操作…",
    "Confirming, please wait…",
    "確定処理中です…",
  ],
  balanceChanged: [
    "余额已更新，请再核对一次后确认。",
    "Your balance changed. Review it again before confirming.",
    "残高が更新されました。もう一度確認して確定してください。",
  ],
  changed: [
    "期次、规则或选号已变化，请返回重新核对。",
    "The round, rules or picks changed. Return and review again.",
    "回・ルール・番号が変わりました。戻って再確認してください。",
  ],
  ownerChanged: [
    "登录账号已变化，请返回重新核对。",
    "Your signed-in account changed. Return and review again.",
    "ログイン中のアカウントが変わりました。戻って再確認してください。",
  ],
  uncertain: [
    "本次请求结果待确认。请查询或重试同一笔确认，不要另建重复请求。",
    "This request’s outcome is unconfirmed. Check or retry the same confirmation to avoid duplicates.",
    "この要求の結果を確認中です。重複を避け、同じ要求を確認または再試行してください。",
  ],
  syncing: [
    "请求已接收，票据仍在同步。请稍后重试查询。",
    "Request accepted; the ticket is still syncing. Check again shortly.",
    "要求を受け付けました。券を同期中です。後ほど再確認してください。",
  ],
  query: [
    "查询本次票据状态",
    "Check this ticket’s status",
    "この券の状態を確認",
  ],
  notPurchased: [
    "上次请求未形成票据，该期已停售。可重新选择可售期次。",
    "The previous request created no ticket and that round is closed. You can choose an available round.",
    "前の要求では券が作成されず、その回は販売終了しました。購入できる回を選べます。",
  ],
  success: [
    "购票成功，票据已核对。",
    "Ticket confirmed and checked.",
    "購入完了。券の内容を確認しました。",
  ],
  verifiedScope: [
    "本注使用虚拟积分；结果与派奖按本期规则，积分无现金价值。",
    "This ticket uses virtual points. Results and payouts follow this round’s rules. Points have no cash value.",
    "仮想ポイントを使用します。結果と配分は今回のルールに従い、現金価値はありません。",
  ],
  pendingResume: [
    "上次请求仍待核对，请先处理这笔确认。",
    "A previous request still needs checking. Resolve it first.",
    "前の要求が未確認です。先にこの要求を確認してください。",
  ],
};
const phaseText = {
  loading: [
    "正在读取本期与积分…",
    "Loading round and balance…",
    "回と残高を取得中…",
  ],
  "no-round": [
    "目前没有可购期次，可先了解玩法。",
    "No round is on sale. You can explore the formats.",
    "購入できる回はありません。形式は確認できます。",
  ],
  closed: [
    "本期已停售，不能确认购票。",
    "Sales have closed for this round.",
    "この回の販売は終了しました。",
  ],
  "malformed-round": [
    "本期规则或价格待核对，暂不能购票。",
    "The round rules or price need checking; purchases are unavailable.",
    "回のルールまたは価格を確認中です。購入できません。",
  ],
  choose: [
    "先选择一个国家玩法。",
    "Choose a national format first.",
    "先に形式を選んでください。",
  ],
  incomplete: [
    "选齐主球与特别球，或使用随机选号，再核对本注。",
    "Complete the required numbers or use Quick pick, then review.",
    "必要な番号を選ぶかランダム選択し、この1口を確認してください。",
  ],
  auth: [
    "号码已选好；注册或登录后保留，仍需再次确认。",
    "Picks are ready. Sign in to keep reviewing; confirmation is still required.",
    "番号を選びました。ログイン後も保持され、購入には再確認が必要です。",
  ],
  insufficient: [
    "积分不足，当前不能购票。登录不会再次赠分。",
    "Insufficient points. Signing in does not issue another grant.",
    "ポイントが不足しています。ログインによる再付与はありません。",
  ],
  ready: [
    "号码已齐，先核对本注号码、成本与期次。点击此处不会立即扣分。",
    "Picks are complete. Review the numbers, cost and round first. Opening review does not spend points.",
    "番号が揃いました。番号・消費・回を確認してください。確認画面を開くだけでは消費しません。",
  ],
};
const phaseButton = {
  loading: ["载入中…", "Loading…", "読込中…"],
  "no-round": [
    "等待下一期开售",
    "Waiting for the next round",
    "次回の販売待ち",
  ],
  closed: ["本期已停售", "Sales closed", "販売終了"],
  "malformed-round": ["暂不可购票", "Purchases unavailable", "購入できません"],
  choose: ["先选择玩法", "Choose a format first", "形式を選択"],
  incomplete: ["先选齐号码", "Complete your picks", "番号を揃えてください"],
  insufficient: ["积分不足", "Insufficient points", "ポイント不足"],
};

export function createPurchaseFlow({
  getState,
  getSelection,
  refresh,
  api,
  now,
  onRandom,
  onPickAgain,
  notify,
}) {
  const $ = (id) => document.getElementById(id);
  const index = () =>
    document.documentElement.lang === "ja"
      ? 2
      : document.documentElement.lang === "en"
        ? 1
        : 0;
  const text = (values) => values[index()];
  const set = (id, value) => {
    const e = $(id);
    if (e && e.textContent !== value) e.textContent = value;
  };
  const points = (n) =>
    Number.isSafeInteger(n) && n >= 0
      ? `${new Intl.NumberFormat(document.documentElement.lang).format(n)} ${text(words.unit)}`
      : "—";
  const view = (draft) =>
    validatePurchaseDraft({
      state: getState(),
      ...(draft
        ? { gameId: draft.game, main: draft.main, bonus: draft.bonus }
        : getSelection()),
      now: now(),
    });
  const guide = (round) =>
    "/verify.html" + (round ? "?round=" + encodeURIComponent(round) : "");
  const focus = (id) => {
    const e = $(id);
    if (!e) return;
    e.setAttribute("tabindex", "-1");
    e.focus({ preventScroll: true });
    e.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  let authMode = "register",
    authBusy = false,
    buying = false,
    authReturnTo = "worldFormats",
    resumeDraft = null;
  let review = null,
    pending = null,
    receipt = null,
    authError = "",
    reviewError = "",
    reviewIssue = null,
    previewKey = "";
  const storageKey = "market-luck-pending-ticket-v1:";
  async function refreshAccount() {
    if ((await refresh()) === false) throw Error(text(words.changed));
  }
  let loadedOwner = null;
  function loadPending(owner) {
    pending = null;
    if (!owner) return;
    try {
      const saved = sessionStorage.getItem(storageKey + owner);
      if (saved && saved.length < 50000) {
        const p = JSON.parse(saved);
        if (
          p.owner === owner &&
          typeof p.key === "string" &&
          /^[A-Za-z0-9-]{8,80}$/.test(p.key) &&
          sameDraft(p.draft, p.draft)
        )
          pending = { ...p, submitted: true };
      }
    } catch {}
  }
  function savePending(intent) {
    if (!intent?.submitted || !intent.owner) return;
    try {
      sessionStorage.setItem(storageKey + intent.owner, JSON.stringify(intent));
    } catch {}
  }
  function clearPending(intent) {
    if (!intent?.owner) return;
    try {
      const saved = sessionStorage.getItem(storageKey + intent.owner);
      if (saved && JSON.parse(saved).key === intent.key)
        sessionStorage.removeItem(storageKey + intent.owner);
    } catch {}
    if (pending === intent) pending = null;
  }
  function numbers(id, main, bonus) {
    const box = $(id);
    if (!box) return;
    const signature = JSON.stringify([main, bonus, index()]);
    if (box.dataset.flowNumbers === signature) return;
    box.dataset.flowNumbers = signature;
    box.replaceChildren();
    if (!main.length && bonus === null) {
      box.textContent = text(words.noPicks);
      return;
    }
    for (const n of [...main].sort((a, b) => a - b)) {
      const e = document.createElement("span");
      e.className = "picked-number";
      e.textContent = String(n).padStart(2, "0");
      box.append(e);
    }
    if (bonus !== null) {
      const e = document.createElement("span");
      e.className = "picked-number bonus";
      e.textContent = String(bonus).padStart(2, "0");
      e.setAttribute(
        "aria-label",
        translate("特别球", document.documentElement.lang) + " " + bonus,
      );
      box.append(e);
    }
  }
  function recover() {
    const state = getState();
    if (!pending || state?.me?.id !== pending.owner) return false;
    const row = state.tickets?.find((t) => t.request_key === pending.key);
    const accepted = pending.id
      ? validatePurchaseReceipt({ ok: true, id: pending.id }, pending.draft)
      : row
        ? validatePurchaseReceipt({ ok: true, id: row.id }, pending.draft)
        : null;
    const ticket = accepted && findConfirmedTicket(state, accepted);
    if (!ticket) return false;
    receipt = { ticket, draft: pending.draft, owner: pending.owner };
    clearPending(pending);
    review = null;
    reviewError = "";
    reviewIssue = null;
    if ($("purchaseReview").open) $("purchaseReview").close();
    notify(text(words.success));
    return true;
  }
  function renderAuth() {
    set(
      "authTitle",
      text(authMode === "register" ? words.authTitle : words.loginTitle),
    );
    set(
      "authHint",
      text(words.authHint) + (resumeDraft ? " " + text(words.authResume) : ""),
    );
    set(
      "authSubmit",
      text(
        authBusy
          ? words.authBusy
          : authMode === "register"
            ? words.submitRegister
            : words.submitLogin,
      ),
    );
    $("authSubmit").value = authMode;
    $("password").autocomplete =
      authMode === "register" ? "new-password" : "current-password";
    for (const [id, mode] of [
      ["authRegisterTab", "register"],
      ["authLoginTab", "login"],
    ]) {
      $(id).setAttribute("aria-selected", String(authMode === mode));
      $(id).disabled = authBusy;
      $(id).tabIndex = authMode === mode ? 0 : -1;
    }
    $("authFields").setAttribute(
      "aria-labelledby",
      authMode === "register" ? "authRegisterTab" : "authLoginTab",
    );
    for (const id of ["authSubmit", "name", "password", "closeAuth"])
      $(id).disabled = authBusy;
    $("authForm").setAttribute("aria-busy", String(authBusy));
    set("authStatus", authBusy ? text(words.authBusy) : "");
    set(
      "authError",
      authError ? translate(authError, document.documentElement.lang) : "",
    );
    $("authError").hidden = !authError;
    $("closeAuth").setAttribute(
      "aria-label",
      ["关闭账户窗口", "Close account window", "アカウント画面を閉じる"][
        index()
      ],
    );
    document
      .querySelector(".auth-tabs")
      ?.setAttribute(
        "aria-label",
        ["注册或登录", "Register or sign in", "登録またはログイン"][index()],
      );
  }
  function renderReview() {
    if (!review) return;
    const state = getState(),
      m = view(review.draft);
    set(
      "reviewSummary",
      `${translate(review.name, document.documentElement.lang)} · ${review.draft.round.slice(0, 8)} · ${text(words.verifiedScope)}`,
    );
    numbers("reviewNumbers", review.draft.main, review.draft.bonus);
    set("reviewCost", points(review.draft.price));
    set("reviewBalance", points(m.balance));
    set(
      "reviewAfter",
      m.balance !== null && m.balance >= review.draft.price
        ? points(m.balance - review.draft.price)
        : text(phaseText.insufficient),
    );
    $("reviewAfter").classList.toggle(
      "is-insufficient",
      m.balance !== null && m.balance < review.draft.price,
    );
    const summary = describeHomeRound(
      state,
      now(),
      document.documentElement.lang,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    set(
      "reviewTiming",
      `${summary.cutoffLabel} ${new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: "short", timeStyle: "short" }).format(review.draft.cutoff)} · ${summary.timingNote}`,
    );
    $("reviewAuditLink").href = guide(review.draft.round);
    const ownerMatches = state?.me?.id === review.owner;
    const matches = sameDraft(review.draft, m.draft);
    const canRetry = pending?.submitted && pending.owner === review.owner;
    const blocked = !ownerMatches || !m.canSubmit || !matches;
    const queryOnly = canRetry && (pending.id || blocked);
    $("confirmPurchase").disabled =
      buying || !ownerMatches || (blocked && !canRetry);
    $("purchaseReview").setAttribute("aria-busy", String(buying));
    set(
      "confirmPurchase",
      buying
        ? text(words.submitting)
        : queryOnly
          ? text(words.query)
          : `${text(canRetry ? words.retry : words.confirm)} · ${points(review.draft.price)}`,
    );
    for (const id of ["cancelPurchase", "closeReview"]) $(id).disabled = buying;
    $("closeReview").setAttribute(
      "aria-label",
      ["关闭购票核对窗口", "Close ticket review", "購入確認を閉じる"][index()],
    );
    let message = reviewError || (reviewIssue ? text(words[reviewIssue]) : "");
    if (!ownerMatches) message = text(words.ownerChanged);
    else if (!m.canSubmit)
      message =
        text(phaseText[m.phase]) +
        (canRetry ? " " + text(words.uncertain) : "");
    else if (!matches) message = text(words.changed);
    set("reviewError", message);
    $("reviewError").hidden = !message;
  }
  function render() {
    for (const [id, values] of Object.entries(labels)) set(id, text(values));
    const state = getState(),
      m = view(),
      selected = getSelection();
    const owner = state?.me?.id || null;
    if (owner !== loadedOwner) {
      loadedOwner = owner;
      loadPending(owner);
    }
    recover();
    set(
      "onboardingStatus",
      text(state?.me ? words.member : words.registration),
    );
    set("startRegistration", text(state?.me ? words.signedIn : words.register));
    set(
      "onboardingBalance",
      `${["我的积分：", "My balance: ", "保有ポイント："][index()]}${state?.me ? points(m.balance) : text(words.signInBalance)}`,
    );
    set(
      "onboardingCost",
      `${["每注：", "Per ticket: ", "1口："][index()]}${points(10)}`,
    );
    set("purchaseCost", points(10));
    set(
      "purchaseBalance",
      state?.me ? points(m.balance) : text(words.signInBalance),
    );
    set(
      "purchaseAfter",
      !state?.me
        ? text(words.predicted)
        : m.balance !== null && m.balance >= 10
          ? points(m.balance - 10)
          : text(phaseText.insufficient),
    );
    $("purchaseAfter").classList.toggle(
      "is-insufficient",
      Boolean(state?.me && (m.balance === null || m.balance < 10)),
    );
    const key = JSON.stringify([selected.main, selected.bonus, index()]);
    if (key !== previewKey) {
      numbers("pickedPreview", selected.main, selected.bonus);
      previewKey = key;
    }
    set(
      "pickerHelp",
      pending?.submitted && pending.owner === state?.me?.id
        ? text(words.pendingResume)
        : text(phaseText[m.phase]),
    );
    const displayRound =
      m.draft?.round || state?.rounds?.find((r) => r.status === "open")?.id;
    $("pickerAuditLink").href = guide(displayRound);
    const hasPending = pending?.submitted && pending.owner === state?.me?.id;
    set(
      "buy",
      hasPending
        ? text(words.query)
        : m.phase === "auth"
          ? text(words.authReview)
          : m.canReview
            ? text(words.review)
            : text(phaseButton[m.phase] || phaseText[m.phase]),
    );
    $("buy").disabled =
      buying || (!hasPending && (!m.canReview || m.phase === "insufficient"));
    $("random").disabled = buying || !state?.games?.length;
    $("onboardingRandom").disabled = $("random").disabled;
    const complete = [
      Boolean(state?.me),
      Boolean(m.game || state?.games?.some((g) => g.id === selected.gameId)),
      Boolean(m.draft),
      Boolean(receipt?.owner === state?.me?.id),
    ];
    const stage = complete.findIndex((done) => !done);
    document.querySelectorAll("[data-onboarding-step]").forEach((el, i) => {
      el.classList.toggle("is-complete", complete[i]);
      el.classList.toggle("is-current", i === stage);
      if (i === stage) el.setAttribute("aria-current", "step");
      else el.removeAttribute("aria-current");
    });
    $("purchaseReceipt").hidden = !receipt || receipt.owner !== state?.me?.id;
    if (receipt && receipt.owner === state?.me?.id) {
      set(
        "receiptSummary",
        `${text(words.success)} ${points(receipt.draft.price)} · ${receipt.ticket.round.slice(0, 8)}`,
      );
      numbers("receiptNumbers", receipt.ticket.main, receipt.ticket.bonus);
      set(
        "receiptTicket",
        `${["票号：", "Ticket: ", "券番号："][index()]}${receipt.ticket.id}`,
      );
      set(
        "receiptBalance",
        `${["当前余额：", "Current balance: ", "現在の残高："][index()]}${points(m.balance)}`,
      );
      $("receiptAuditLink").href = guide(receipt.ticket.round);
    }
    renderAuth();
    renderReview();
  }
  function openAuth(
    mode = "register",
    draft = null,
    returnTo = "worldFormats",
  ) {
    if (authBusy) return;
    authMode = mode;
    authError = "";
    resumeDraft = draft;
    authReturnTo = returnTo;
    renderAuth();
    if (!$("auth").open) $("auth").showModal();
    $("name").focus();
  }
  function showReview(draft, name) {
    const state = getState();
    review = { draft, name, owner: state.me.id, balanceSeen: state.me.balance };
    reviewError = "";
    reviewIssue = null;
    renderReview();
    if (!$("purchaseReview").open) $("purchaseReview").showModal();
  }
  function requestReview() {
    const state = getState(),
      m = view();
    if (pending?.submitted && pending.owner === state?.me?.id) {
      recover();
      if (pending) {
        showReview(
          pending.draft,
          state.games?.find((g) => g.id === pending.draft.game)?.name ||
            pending.draft.game,
        );
        reviewIssue = "uncertain";
        renderReview();
      } else render();
      return;
    }
    if (!m.canReview) {
      focus("pickerHelp");
      return;
    }
    if (!state?.me) {
      openAuth("register", m.draft);
      return;
    }
    if (!m.canSubmit) {
      focus("pickerHelp");
      return;
    }
    showReview(m.draft, m.game.name);
  }
  async function confirmPurchase() {
    if (buying || !review) return;
    const confirmation = review;
    let intent = pending;
    const stillCurrent = () =>
      review === confirmation &&
      getState()?.me?.id === confirmation.owner &&
      pending === intent;
    let firstAttempt = false,
      postError = false;
    buying = true;
    reviewError = "";
    reviewIssue = null;
    render();
    try {
      await refreshAccount();
      // Refresh may recover this ticket or load a different account's request.
      if (!stillCurrent()) return;
      const state = getState(),
        m = view(confirmation.draft);
      const recovery = Boolean(
        intent?.submitted && intent.owner === confirmation.owner,
      );
      const sameCurrentIntent =
        m.canSubmit && sameDraft(confirmation.draft, m.draft);
      if (!recovery && !sameCurrentIntent) {
        reviewIssue = "changed";
        return;
      }
      if (
        sameCurrentIntent &&
        !intent?.id &&
        state.me.balance !== confirmation.balanceSeen
      ) {
        confirmation.balanceSeen = state.me.balance;
        reviewIssue = "balanceChanged";
        return;
      }
      if (!intent || !intent.submitted) {
        firstAttempt = true;
        intent = {
          owner: confirmation.owner,
          draft: confirmation.draft,
          key: crypto.randomUUID(),
          submitted: false,
        };
        pending = intent;
      }
      if (
        intent.owner !== confirmation.owner ||
        !sameDraft(intent.draft, confirmation.draft)
      ) {
        reviewIssue = "uncertain";
        return;
      }
      intent.submitted = true;
      savePending(intent);
      let response;
      try {
        response = await api("buy", {
          round: intent.draft.round,
          game: intent.draft.game,
          main: intent.draft.main,
          bonus: intent.draft.bonus,
          key: intent.key,
        });
      } catch (error) {
        postError = true;
        throw error;
      }
      if (!stillCurrent()) return;
      const accepted = validatePurchaseReceipt(response, intent.draft);
      if (!accepted) {
        reviewIssue = "uncertain";
        return;
      }
      intent.id = accepted.id;
      savePending(intent);
      await refreshAccount();
      if (!stillCurrent()) return;
      reviewIssue = "syncing";
    } catch (error) {
      // Late success and error responses belong only to their captured intent.
      // Its saved key stays recoverable if the user has switched accounts.
      if (!stillCurrent()) return;
      const rejected =
        postError &&
        firstAttempt &&
        error.status >= 400 &&
        error.status < 500 &&
        !error.message.includes("重复");
      const expiredRecovery =
        postError &&
        !firstAttempt &&
        intent?.submitted &&
        ((error.status === 400 && error.message.includes("已停售")) ||
          (error.status === 404 && error.message.includes("期次不存在")));
      if (expiredRecovery) {
        clearPending(intent);
        review = null;
        if ($("purchaseReview").open) $("purchaseReview").close();
        notify(text(words.notPurchased));
      } else if (intent?.submitted && !rejected)
        reviewIssue = intent.id ? "syncing" : "uncertain";
      else {
        reviewError = translate(error.message, document.documentElement.lang);
        if (rejected) clearPending(intent);
      }
      try {
        await refreshAccount();
        if (!stillCurrent()) return;
      } catch {}
    } finally {
      buying = false;
      render();
    }
  }
  for (const [id, mode] of [
    ["authRegisterTab", "register"],
    ["authLoginTab", "login"],
  ])
    $(id).onclick = () => {
      if (!authBusy) {
        authMode = mode;
        authError = "";
        renderAuth();
      }
    };
  for (const id of ["authRegisterTab", "authLoginTab"])
    $(id).addEventListener("keydown", (event) => {
      if (
        authBusy ||
        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
      )
        return;
      event.preventDefault();
      authMode =
        event.key === "Home"
          ? "register"
          : event.key === "End"
            ? "login"
            : authMode === "register"
              ? "login"
              : "register";
      authError = "";
      renderAuth();
      $(authMode === "register" ? "authRegisterTab" : "authLoginTab").focus();
    });
  $("account").onclick = () => {
    if (!getState()?.me) openAuth();
  };
  $("startRegistration").onclick = () =>
    getState()?.me ? focus("worldFormats") : openAuth();
  $("onboardingRandom").onclick = () => {
    onRandom();
    focus("pickedPreview");
  };
  $("onboardingReview").onclick = (event) => {
    event.preventDefault();
    requestReview();
  };
  $("buy").onclick = requestReview;
  $("confirmPurchase").onclick = confirmPurchase;
  for (const id of ["cancelPurchase", "closeReview"])
    $(id).onclick = () => {
      if (!buying) $("purchaseReview").close();
    };
  $("purchaseReview").addEventListener("cancel", (event) => {
    if (buying) event.preventDefault();
  });
  $("closeAuth").onclick = () => {
    if (!authBusy) $("auth").close();
  };
  $("auth").addEventListener("cancel", (event) => {
    if (authBusy) event.preventDefault();
  });
  $("auth").addEventListener("close", () => {
    $("password").value = "";
    if (!authBusy) resumeDraft = null;
  });
  $("authForm").onsubmit = async (event) => {
    event.preventDefault();
    if (authBusy) return;
    const name = $("name").value.trim(),
      password = $("password").value;
    if (
      !/^[\p{L}\p{N}_-]{3,24}$/u.test(name) ||
      password.length < 8 ||
      password.length > 128
    ) {
      authError = text(words.inputInvalid);
      renderAuth();
      return;
    }
    const resume = resumeDraft,
      mode = authMode;
    authBusy = true;
    authError = "";
    renderAuth();
    try {
      await api(mode, { name, password });
      await refreshAccount();
      authBusy = false;
      $("auth").close();
      $("password").value = "";
      notify(text(mode === "register" ? words.welcome : words.loggedIn));
      const m = view();
      if (resume && sameDraft(resume, m.draft)) requestReview();
      else if (resume) {
        notify(text(words.changed));
        focus("pickerHelp");
      } else focus(authReturnTo);
    } catch (error) {
      authError = error.message;
    } finally {
      authBusy = false;
      render();
    }
  };
  $("pickAgain").onclick = () => {
    receipt = null;
    onPickAgain();
    focus("random");
    render();
  };
  render();
  return {
    render,
    requestReview,
    openAuth,
    selectionChanged() {
      receipt = null;
    },
  };
}

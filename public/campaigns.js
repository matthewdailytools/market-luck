// Campaign copy changes presentation only. Timing, sources, purchases and draws
// remain controlled by app.js and the server's committed round manifest.
import { selectDisplayRound } from "./round-summary.js";
const allowed = new Set(["verify", "points", "world"]);
const storageKey = "market-luck-campaign";
export const DEFAULT_CAMPAIGN = "verify";
export function resolveCampaign(requested, saved) {
  return allowed.has(requested)
    ? requested
    : allowed.has(saved)
      ? saved
      : DEFAULT_CAMPAIGN;
}
let selected = DEFAULT_CAMPAIGN;
let latestState;
let initialized = false;
let serverOffset = 0;

const copy = {
  "zh-CN": {
    switchLabel: "你想先了解什么？",
    choices: { verify: "公开核验", points: "积分体验", world: "全球玩法" },
    boundary:
      "纯虚拟积分，无现金价值。各国玩法为结构模拟；公开页面仅展示最近记录，并非全部原始响应。数据源、托管和管理员仍是信任边界。",
    statuses: {
      loading: "本期状态载入后显示；事前承诺不等于结果已核验。",
      empty: "等待本期承诺发布，尚未开售。",
      demo: "当前为模拟体验；演示结果不是真实行情自然开奖。",
      paused: "本期已暂停，等待处理；不临时更换规则或结果。",
      sales: "本期承诺已发布，尚未开奖。",
      unpublished: "本期承诺链接尚未确认，请先查看核验流程。",
      closed: "已停售，等待闭市确认；尚未公布结果。",
      waiting: "确认窗口已到，等待固定来源达成共识。",
      result: "本期结果已公布，可下载证明并自行复算。",
    },
    verify: {
      kicker: "公平机制 · 公开记录 · 结果可追溯",
      title: ["规则先承诺，", "结果可复算。"],
      intro: "核心步骤公开，第三方可以独立核验。",
      description:
        "规则售前固定，结果公开复算。GitHub 保存公开核心档案；新 v3 期增加隐藏顺序承诺与独立日志见证。每期按自己的已公布版本执行，纯虚拟积分。",
      primary: "查看本期规则与核验 ↗",
      fallback: "先看核验流程 ↗",
      secondary: "每注10分，去选号 →",
      secondaryHref: "#worldFormats",
      eyebrow: "FROM QUESTIONS TO CHECKS",
      evidenceTitle: "把疑问，变成可以核对的事。",
      cards: [
        [
          "规则先锁定",
          "查看固定提交中的本期标的、时间和算法承诺。",
          "查看本期承诺 ↗",
          "anchor",
        ],
        [
          "独立日志与公开历史",
          "查看 GitHub 核心档案；新 v3 期另有 Rekor 签名可验。",
          "查看 GitHub 历史 ↗",
          "https://github.com/matthewdailytools/market-luck/tree/main/history",
        ],
        [
          "结果可以自己算",
          "开奖后下载输入与证明，重新计算号码并核对记录。",
          "查看证明与记录 ↗",
          "#proofs",
        ],
      ],
    },
    points: {
      kicker: "给期待一个轻松的开始",
      title: ["花一点积分，", "留一份期待。"],
      intro: "号码按公开算法生成，结果可以自己核对。",
      description:
        "注册一次赠1,000积分，每注10分，无充值提现。真实期使用固定美股篮子，公开输入与号码可复算。积分无现金价值。",
      primary: "选玩法，开始选号 ↗",
      memberPrimary: "选玩法，用积分选号 ↗",
      secondary: "查看本期规则与时间 →",
      secondaryHref: "#audit",
      eyebrow: "POINTS FOR EXPERIENCE",
      evidenceTitle: "体验预算，明明白白。",
      cards: [
        [
          "1,000分起步",
          "注册成功时一次性赠分，登录不重复领取。不设现金充值。",
          "了解积分体验 ↗",
          "#play",
        ],
        [
          "10分一注",
          "先看号码范围、中奖条件和概率；每张票只计最高档。",
          "查看玩法规则 ↗",
          "#gameRules",
        ],
        [
          "收支有记录",
          "查询余额、中奖及奖池记录。命中奖档不等于回本，奖金额可能低于票价。",
          "查看积分与奖池 ↗",
          "#ledger",
        ],
      ],
    },
    world: {
      kicker: "16种方式，打开一次期待",
      title: ["从熟悉的一注，", "逛到世界的玩法。"],
      intro: "不必一次学会，先从你喜欢的规则开始。",
      description:
        "16国指选号结构，真实期使用固定美股篮子。先选一个熟悉玩法，再看号码范围、中奖条件与概率。",
      primary: "探索16国玩法 ↗",
      secondary: "从玩法规则开始 →",
      secondaryHref: "#gameRules",
      eyebrow: "EXPLORE THE FORMATS",
      evidenceTitle: "世界很大，规则可以讲清楚。",
      cards: [
        [
          "熟悉的起点",
          "先从熟悉的选号方式开始，不必一次学完16种规则。",
          "选择一个玩法 ↗",
          "#play",
        ],
        [
          "差异一眼对比",
          "主球、特别球和中奖门槛随玩法而异。概率不会因国家名称改变。",
          "比较选号规则 ↗",
          "#gameRules",
        ],
        [
          "数据范围说清",
          "全球指玩法灵感。当前真实期使用指定美股篮子，不代表全球股市全部数据。",
          "查看实际行情篮子 ↗",
          "#markets",
        ],
      ],
    },
  },
  en: {
    switchLabel: "What would you like to explore first?",
    choices: {
      verify: "Verify the draw",
      points: "Try with points",
      world: "Explore formats",
    },
    boundary:
      "Virtual points only, with no cash value. National formats are simulations. Public pages show recent records, not every raw response. Providers, hosting and administrators remain trust boundaries.",
    statuses: {
      loading:
        "Round status will load here. A prior commitment is not a verified outcome.",
      empty: "Awaiting the round commitment. Ticket sales have not opened.",
      demo: "Simulation mode. Demo results are not a natural live-market draw.",
      paused:
        "This round is paused for review. Rules and results are not substituted.",
      sales:
        "The round commitment is published. The draw has not happened yet.",
      unpublished:
        "The commitment link is not confirmed. Inspect the verification process first.",
      closed:
        "Sales closed. Awaiting market confirmation; no result is published yet.",
      waiting:
        "The confirmation window has elapsed. Awaiting source consensus.",
      result:
        "The result is published. Download the proof and reproduce it yourself.",
    },
    verify: {
      kicker: "FAIR RULES. OPEN RECORDS. TRACEABLE DRAWS.",
      title: ["Commit the rules.", "Reproduce the result."],
      intro: "Public steps. Independently verifiable evidence.",
      description:
        "Rules are committed before sales and results are reproducible. GitHub preserves public core records; new v3 rounds add hidden-order commitments and independent log witnesses. Each round keeps its published version. Virtual points only.",
      primary: "See this round’s rules and checks ↗",
      fallback: "Inspect the process ↗",
      secondary: "Pick numbers · 10 points a ticket →",
      secondaryHref: "#worldFormats",
      eyebrow: "FROM QUESTIONS TO CHECKS",
      evidenceTitle: "Turn questions into checks.",
      cards: [
        [
          "Commit the rules first",
          "Inspect the instruments, timing and algorithm commitment in a fixed source commit.",
          "View the round commitment ↗",
          "anchor",
        ],
        [
          "Independent logs and public history",
          "Inspect GitHub core archives. New v3 rounds also include independently signed Rekor witnesses.",
          "Browse GitHub history ↗",
          "https://github.com/matthewdailytools/market-luck/tree/main/history",
        ],
        [
          "Reproduce the result",
          "After the draw, download the input and proof, recalculate the numbers and inspect the records.",
          "View proof and records ↗",
          "#proofs",
        ],
      ],
    },
    points: {
      kicker: "A LIGHTER WAY TO BEGIN",
      title: ["A few points.", "A little anticipation."],
      intro:
        "Numbers follow a public algorithm. Reproduce the result yourself.",
      description:
        "Get 1,000 points once at sign-up; each ticket costs 10. No top-ups or withdrawals. Live rounds use a fixed US-stock basket. Reproduce published inputs and numbers. Points have no cash value.",
      primary: "Choose a game and pick numbers ↗",
      memberPrimary: "Choose a game · Pick with points ↗",
      secondary: "See this round’s rules and timing →",
      secondaryHref: "#audit",
      eyebrow: "POINTS FOR EXPERIENCE",
      evidenceTitle: "An experience budget you can understand.",
      cards: [
        [
          "1,000 points to start",
          "A one-time registration grant. Signing in does not issue another grant. No cash top-ups.",
          "Explore the experience ↗",
          "#play",
        ],
        [
          "10 points per ticket",
          "Read the number ranges, winning conditions and odds. Each ticket receives its highest tier only.",
          "Read the game rules ↗",
          "#gameRules",
        ],
        [
          "Recorded inflows and outflows",
          "Inspect balances, prizes and pool entries. A matched prize tier does not guarantee profit; a payout may be below the ticket price.",
          "View points and the pool ↗",
          "#ledger",
        ],
      ],
    },
    world: {
      kicker: "16 WAYS TO EXPLORE A POSSIBILITY",
      title: ["Start with a familiar pick.", "Explore a world of formats."],
      intro: "No need to learn everything at once.",
      description:
        "16 countries inspire the number formats; live rounds use a fixed US-stock basket. Start with a familiar format, then read its ranges, winning conditions and odds.",
      primary: "Explore 16 national formats ↗",
      secondary: "Start with the rules →",
      secondaryHref: "#gameRules",
      eyebrow: "EXPLORE THE FORMATS",
      evidenceTitle: "A world of formats, clearly explained.",
      cards: [
        [
          "A familiar starting point",
          "Choose a number format you know. You do not have to learn all 16 at once.",
          "Choose a format ↗",
          "#play",
        ],
        [
          "Compare the differences",
          "Main balls, special balls and thresholds differ. A country name does not change the odds.",
          "Compare number rules ↗",
          "#gameRules",
        ],
        [
          "A clearly defined data basket",
          "Global describes the game inspirations. The current live round uses specified US equities, not every global stock market.",
          "Inspect the actual basket ↗",
          "#markets",
        ],
      ],
    },
  },
  ja: {
    switchLabel: "最初に知りたいことは？",
    choices: {
      verify: "抽選を検証",
      points: "ポイント体験",
      world: "世界の形式",
    },
    boundary:
      "仮想ポイントのみで、金銭的価値はありません。各国の形式はシミュレーションです。公開ページには最近の記録のみを表示し、すべての元応答は公開していません。情報源・運営環境・管理者への信頼は残ります。",
    statuses: {
      loading:
        "抽選回の状態を読み込みます。事前コミットメントは、結果の検証完了を意味しません。",
      empty: "コミットメントの公開待ちです。まだ販売は始まっていません。",
      demo: "模擬体験です。デモの結果は実相場による自然な抽選ではありません。",
      paused: "この回は確認のため停止中です。ルールや結果を差し替えません。",
      sales: "事前コミットメントを公開済みです。まだ抽選は行われていません。",
      unpublished:
        "コミットメントのリンクは未確認です。まず検証の流れをご覧ください。",
      closed: "販売終了。終値の確認待ちで、結果はまだ公開されていません。",
      waiting: "確認期間を経過しました。情報源の一致を待っています。",
      result: "結果を公開しました。証拠を保存して、ご自身で再計算できます。",
    },
    verify: {
      kicker: "公平な仕組み・公開記録・追跡できる結果",
      title: ["ルールを先に固定、", "結果を自分で検証。"],
      intro: "主要な手順を公開し、第三者が独立して検証できます。",
      description:
        "販売前にルールを固定し、結果を公開して再計算できます。GitHubに主要記録を保存し、新しいv3回には非公開順序のコミットメントと独立ログを追加。各回の公開済み方式を維持する仮想ポイント体験です。",
      primary: "今回のルールと検証を見る ↗",
      fallback: "検証の流れを見る ↗",
      secondary: "1口10ポイントで番号を選ぶ →",
      secondaryHref: "#worldFormats",
      eyebrow: "FROM QUESTIONS TO CHECKS",
      evidenceTitle: "疑問を、確認できる項目へ。",
      cards: [
        [
          "先にルールを固定",
          "固定コミットにある銘柄・時刻・アルゴリズムのコミットメントを確認できます。",
          "事前コミットメントを見る ↗",
          "anchor",
        ],
        [
          "独立ログと公開履歴",
          "GitHubの主要記録と、新しいv3回のRekor署名を確認できます。",
          "GitHub履歴を見る ↗",
          "https://github.com/matthewdailytools/market-luck/tree/main/history",
        ],
        [
          "自分で結果を再計算",
          "抽選後に入力と証拠を保存し、番号と記録を確かめられます。",
          "証拠と記録を見る ↗",
          "#proofs",
        ],
      ],
    },
    points: {
      kicker: "気軽に始める、小さな楽しみ。",
      title: ["少しのポイントで、", "次の楽しみを。"],
      intro: "番号は公開アルゴリズムで生成。結果は自分で再計算。",
      description:
        "登録時に1,000ポイントを1回付与、1口10ポイント。入出金はありません。実抽選は固定した米国株を使い、公開入力と番号を再計算できます。ポイントに金銭的価値はありません。",
      primary: "形式を選んで番号を選ぶ ↗",
      memberPrimary: "形式を選びポイントで番号選択 ↗",
      secondary: "今回のルールと時刻を見る →",
      secondaryHref: "#audit",
      eyebrow: "POINTS FOR EXPERIENCE",
      evidenceTitle: "体験の予算を、わかりやすく。",
      cards: [
        [
          "1,000ポイントから",
          "新規登録時に1回だけ付与。ログインによる再付与や現金チャージはありません。",
          "ポイント体験を見る ↗",
          "#play",
        ],
        [
          "1口10ポイント",
          "番号の範囲・当選条件・確率を確認。1口につき最高等級のみ適用します。",
          "ゲームのルールを見る ↗",
          "#gameRules",
        ],
        [
          "収支を記録",
          "残高・当選・プールの記録を確認できます。等級への一致は利益を保証せず、配分が購入額を下回る場合もあります。",
          "ポイントとプールを見る ↗",
          "#ledger",
        ],
      ],
    },
    world: {
      kicker: "16の形式で、次の楽しみを。",
      title: ["慣れた番号選びから、", "世界の形式へ。"],
      intro: "すべてを一度に覚える必要はありません。",
      description:
        "16か国は番号形式の着想で、実抽選は固定した米国株を使います。慣れた形式を選び、番号範囲・条件・確率を確認できます。",
      primary: "16か国の形式を探索 ↗",
      secondary: "ルールから始める →",
      secondaryHref: "#gameRules",
      eyebrow: "EXPLORE THE FORMATS",
      evidenceTitle: "世界の形式を、わかりやすく。",
      cards: [
        [
          "慣れた形式から",
          "知っている番号形式を選べます。16種類を一度に学ぶ必要はありません。",
          "形式を選ぶ ↗",
          "#play",
        ],
        [
          "違いを見比べる",
          "主番号・特別番号・条件は形式により異なり、国名だけで確率は変わりません。",
          "番号のルールを比べる ↗",
          "#gameRules",
        ],
        [
          "データの範囲も明示",
          "世界とは形式の着想を指します。現在の実抽選は指定米国株のバスケットを使い、世界中の株式ではありません。",
          "実際の銘柄を見る ↗",
          "#markets",
        ],
      ],
    },
  },
};

function language() {
  return copy[document.documentElement.lang]
    ? document.documentElement.lang
    : "en";
}

function storedSelection() {
  try {
    const value = localStorage.getItem(storageKey);
    return allowed.has(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function requestedSelection() {
  const value = new URL(window.location.href).searchParams.get("theme");
  return allowed.has(value) ? value : undefined;
}

function currentRound() {
  return selectDisplayRound(latestState?.rounds);
}

function publicationLink(round) {
  const anchor = latestState?.anchors?.find((a) => a.round_id === round?.id);
  if (!anchor?.url) return undefined;
  try {
    const url = new URL(anchor.url);
    if (
      url.protocol === "https:" &&
      url.hostname === "raw.githubusercontent.com" &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {}
  return undefined;
}

function setLink(el, text, href) {
  if (!el) return;
  el.textContent = text;
  el.setAttribute("href", href);
  if (href.startsWith("https://")) {
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  } else {
    el.removeAttribute("target");
    el.removeAttribute("rel");
  }
}

function element(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function statusText(words, round, anchor, now) {
  if (!latestState) return words.statuses.loading;
  if (latestState.demo || round?.manifest?.mode === "DEMO")
    return words.statuses.demo;
  if (!round) return words.statuses.empty;
  if (round.status === "paused") return words.statuses.paused;
  if (round.status === "settled" && round.proof) return words.statuses.result;
  if (!anchor) return words.statuses.unpublished;
  if (now < round.cutoff) return words.statuses.sales;
  if (now < round.ready) return words.statuses.closed;
  return words.statuses.waiting;
}

function render() {
  if (!initialized) return;
  const words = copy[language()];
  const campaign = words[selected];
  const round = currentRound();
  const anchor = publicationLink(round);
  const guideHref =
    "/verify.html" + (round ? "?round=" + encodeURIComponent(round.id) : "");
  document.body.dataset.campaign = selected;
  document
    .querySelector(".campaign-switcher")
    ?.setAttribute("aria-label", words.switchLabel);
  document.querySelector("#campaignSwitchLabel").textContent =
    words.switchLabel;
  for (const button of document.querySelectorAll("[data-campaign-choice]")) {
    const key = button.dataset.campaignChoice;
    button.textContent = words.choices[key];
    button.setAttribute("aria-pressed", String(key === selected));
  }
  document.querySelector(".hero-kicker span:last-child").textContent =
    campaign.kicker;
  const heading = document.querySelector("#campaignTitle");
  heading.replaceChildren(
    document.createTextNode(campaign.title[0]),
    document.createElement("br"),
    element("span", campaign.title[1]),
  );
  document.querySelector(".hero-intro").textContent = campaign.intro;
  document.querySelector(".hero-description").textContent =
    campaign.description;
  const primaryHref = selected === "verify" ? guideHref : "#worldFormats";
  const primaryText =
    selected === "points" && latestState?.me
      ? campaign.memberPrimary
      : campaign.primary;
  setLink(
    document.querySelector(".hero-actions .primary"),
    primaryText,
    primaryHref,
  );
  setLink(
    document.querySelector(".hero-secondary"),
    campaign.secondary,
    selected === "points" ? guideHref : campaign.secondaryHref,
  );
  document.querySelector("#campaignEvidenceEyebrow").textContent =
    campaign.eyebrow;
  document.querySelector("#campaignEvidenceTitle").textContent =
    campaign.evidenceTitle;
  const cards = document.querySelector("#campaignEvidenceCards");
  cards.replaceChildren();
  campaign.cards.forEach(([title, description, label, href], index) => {
    const article = document.createElement("article");
    article.append(
      element(
        "span",
        String(index + 1).padStart(2, "0"),
        "campaign-card-number",
      ),
      element("h3", title),
      element("p", description),
    );
    const link = document.createElement("a");
    setLink(
      link,
      label,
      href === "anchor"
        ? guideHref + "#rules"
        : href === "#audit" || href === "#markets"
          ? guideHref + "#sources"
          : href === "#proofs"
            ? guideHref + "#results"
            : href === "#play"
              ? "#worldFormats"
              : href,
    );
    article.append(link);
    cards.append(article);
  });
  syncCampaignClock();
  document.querySelector("#campaignBoundary").textContent = words.boundary;
  const sphere = document.querySelector(".sphere-main");
  if (sphere)
    sphere.textContent =
      selected === "points" ? "10" : selected === "world" ? "16" : "?";
}

export function initCampaigns() {
  if (initialized || !document.querySelector("#campaignTitle")) return;
  initialized = true;
  selected = resolveCampaign(requestedSelection(), storedSelection());
  for (const button of document.querySelectorAll("[data-campaign-choice]")) {
    button.addEventListener("click", () => {
      const value = button.dataset.campaignChoice;
      if (!allowed.has(value)) return;
      selected = value;
      try {
        localStorage.setItem(storageKey, selected);
      } catch {}
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("theme", selected);
        history.replaceState(history.state, "", url);
      } catch {}
      render();
    });
  }
  window.addEventListener("popstate", () => {
    selected = resolveCampaign(requestedSelection(), storedSelection());
    render();
  });
  render();
}

export function syncCampaigns(state) {
  if (state !== undefined) {
    latestState = state;
    serverOffset = Number.isFinite(state?.serverTime)
      ? state.serverTime - Date.now()
      : 0;
  }
  render();
}

export function syncCampaignClock(now = Date.now() + serverOffset) {
  if (!initialized) return;
  const round = currentRound();
  const value = statusText(
    copy[language()],
    round,
    publicationLink(round),
    now,
  );
  const status = document.querySelector("#campaignStatus");
  if (status && status.textContent !== value) status.textContent = value;
}

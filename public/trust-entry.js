import { describeHomeHighlights } from "./home-highlights-model.js";
import { selectDisplayRound } from "./round-summary.js";
import { roundSharePath } from "./round-share-model.js";

const copy = {
  "zh-CN": {
    links: ["公开算法 ↗", "事前规则 ↗", "结果复算 ↗"],
    share: "查看与分享本期卡片 →",
    recent: "分享这期公开卡片 →",
    label: "查看公平机制与证据",
  },
  en: {
    links: ["Public algorithm ↗", "Published rules ↗", "Reproduce results ↗"],
    share: "View and share this round →",
    recent: "Share this public round →",
    label: "Fairness mechanisms and evidence",
  },
  ja: {
    links: ["公開アルゴリズム ↗", "事前ルール ↗", "結果を再計算 ↗"],
    share: "今回のカードを表示・共有 →",
    recent: "この回の公開カードを共有 →",
    label: "公平性の仕組みと証拠",
  },
};
export function renderTrustEntry(state, language, selectedGame = "cn") {
  const words = copy[language] || copy.en;
  const current = selectDisplayRound(state?.rounds);
  const base = current
    ? "/verify.html?round=" + encodeURIComponent(current.id)
    : "/verify.html";
  const box = document.getElementById("trustPillars");
  if (box) {
    box.setAttribute("aria-label", words.label);
    const targets = [
      "https://github.com/matthewdailytools/market-luck/blob/main/ALGORITHM.md",
      base + "#rules",
      base + "#results",
    ];
    [...box.querySelectorAll("a")].forEach((a, index) => {
      a.textContent = words.links[index];
      a.href = targets[index];
    });
  }
  const set = (id, round, game, label) => {
    const element = document.getElementById(id);
    if (!element) return;
    const path = roundSharePath(round?.id, game, language);
    element.hidden = !path;
    element.textContent = label;
    if (path) element.href = path;
    else element.removeAttribute("href");
  };
  const currentGame = current?.manifest?.games?.some(
    (g) => g.id === selectedGame,
  )
    ? selectedGame
    : current?.manifest?.games?.[0]?.id;
  set("heroShareLink", current, currentGame, words.share);
  const highlights = describeHomeHighlights(state, language);
  const recent =
    state?.rounds?.find((r) => r.id === highlights.recent.roundId) || current;
  const picked = document.getElementById("recentGameSelect")?.value;
  const recentGame = recent?.manifest?.games?.some((g) => g.id === picked)
    ? picked
    : recent?.manifest?.games?.[0]?.id;
  set("recentShareLink", recent, recentGame, words.recent);
}

// Each row documents a number-format inspiration, not an official lottery affiliation.
export const gameRules = {
  cn: {
    reference: "双色球",
    url: "https://www.gdfc.org.cn/resource/2026/2026011601.pdf",
    omit: ["官方六档奖金", "Official six-tier payouts", "公式の6等級配分"],
  },
  us: {
    reference: "Powerball",
    url: "https://www.powerball.com/powerball-prize-chart",
    omit: [
      "官方九档奖金、Power Play 与 Double Play",
      "Official nine-tier payouts, Power Play and Double Play",
      "公式の9等級配分・Power Play・Double Play",
    ],
  },
  uk: {
    reference: "Lotto · 6/59",
    url: "https://www.national-lottery.co.uk/games/lotto/about-lotto",
    omit: [
      "补充球、额外轮次及官方奖金",
      "Bonus ball, additional rounds and official payouts",
      "ボーナス番号・追加抽選・公式配分",
    ],
  },
  jp: {
    reference: "Loto 6",
    url: "https://www.takarakuji-official.jp/kuji/loto/loto6/introduction2.html",
    omit: [
      "补充球和官方五档奖金",
      "Bonus ball and official five-tier payouts",
      "ボーナス番号・公式の5等級配分",
    ],
  },
  fr: {
    reference: "LOTO",
    url: "https://www.fdj.fr/jeux-de-tirage/loto/comment-jouer",
    omit: [
      "第二次抽奖、抽奖代码及官方奖金",
      "Second draw, raffle codes and official payouts",
      "追加抽選・抽選コード・公式配分",
    ],
  },
  de: {
    reference: "LOTTO 6aus49",
    url: "https://www.lotto.de/lotto-6aus49/spielregeln",
    omit: [
      "Superzahl 由票号产生的机制及官方九档奖金",
      "Ticket-number-derived Superzahl and official nine-tier payouts",
      "券番号由来のSuperzahl・公式の9等級配分",
    ],
  },
  it: {
    reference: "SuperEnalotto",
    url: "https://www.superenalotto.it/scopri-il-gioco",
    omit: [
      "Jolly、SuperStar 与即开附加玩法",
      "Jolly, SuperStar and instant-win add-ons",
      "Jolly・SuperStar・即時当選オプション",
    ],
  },
  es: {
    reference: "La Primitiva",
    url: "https://www.loteriasyapuestas.es/es/centro-de-ayuda/como-se-juega/como-jugar-a-la-primitiva",
    omit: [
      "Complementario、Reintegro 与 Joker",
      "Complementario, Reintegro and Joker",
      "Complementario・Reintegro・Joker",
    ],
  },
  ca: {
    reference: "LOTTO 6/49",
    url: "https://www.olg.ca/en/frequently-asked-questions/lottery-games/lotto-649.html",
    omit: [
      "补充球、Gold Ball 及额外选号组合",
      "Bonus ball, Gold Ball and combination entries",
      "ボーナス番号・Gold Ball・組合せ購入",
    ],
  },
  au: {
    reference: "Oz Lotto",
    url: "https://help.thelott.com/hc/en-us/articles/4416863329689-How-do-I-play-the-Oz-Lotto-game",
    omit: [
      "补充球和官方七档奖金",
      "Supplementary balls and official seven-tier payouts",
      "補助番号・公式の7等級配分",
    ],
  },
  nz: {
    reference: "Lotto NZ",
    url: "https://mylotto.co.nz/lotto/how-to-play",
    omit: [
      "补充球、Powerball 与 Strike",
      "Bonus ball, Powerball and Strike",
      "ボーナス番号・Powerball・Strike",
    ],
  },
  kr: {
    reference: "Lotto 6/45",
    url: "https://m.dhlottery.co.kr/lt645/intro",
    omit: [
      "补充球和官方五档奖金",
      "Bonus ball and official five-tier payouts",
      "ボーナス番号・公式の5等級配分",
    ],
  },
  sg: {
    reference: "TOTO",
    url: "https://www.singaporepools.com.sg/en/rules/Pages/pdf/toto-game-rules.pdf",
    omit: [
      "Additional Number 及官方七档奖金",
      "Additional Number and official seven-tier payouts",
      "Additional Number・公式の7等級配分",
    ],
  },
  br: {
    reference: "Mega-Sena",
    url: "https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx",
    omit: [
      "官方金额、特别期与官方资金分配",
      "Official cash prizes, special draws and fund allocation",
      "公式賞金・特別回・公式資金配分",
    ],
  },
  za: {
    reference: "Lotto · 6/52",
    url: "https://www.lottery.co.za/lotto",
    omit: [
      "补充球与 Lotto Plus；使用明确标注的 6/52 格式，不追溯旧 6/58",
      "Bonus ball and Lotto Plus; uses the labeled 6/52 format, not legacy 6/58",
      "ボーナス番号・Lotto Plus。表示どおり6/52形式を使用（旧6/58ではありません）",
    ],
  },
  ph: {
    reference: "Ultra Lotto 6/58",
    url: "https://pcso.gov.ph/Games/Lotto/UltraLotto658.html",
    omit: [
      "官方现金奖金和特别派奖安排",
      "Official cash prizes and special payout arrangements",
      "公式賞金・特別配分",
    ],
  },
};
const choose = (n, k) => {
  let x = 1;
  for (let i = 1; i <= k; i++) x = (x * (n - k + i)) / i;
  return Math.round(x);
};
export function renderGameRules(g, language = "zh-CN") {
  const r = gameRules[g.id],
    el = document.querySelector("#gameRules");
  if (!el) return;
  el.replaceChildren();
  const l = language === "en" ? 1 : language === "ja" ? 2 : 0;
  const texts = [
    [
      "本玩法规则 · 虚拟积分版",
      "Game rules · virtual points",
      "ルール · 仮想ポイント",
    ],
    ["选号", "Selection", "番号選択"],
    ["一等奖", "Tier 1", "1等"],
    ["二等奖", "Tier 2", "2等"],
    ["三等奖", "Tier 3", "3等"],
    ["头奖概率", "Jackpot odds", "1等確率"],
    ["未复刻", "Not simulated", "未実装"],
    ["官方参考", "Official reference", "公式参照"],
  ];
  const add = (label, value) => {
    const p = document.createElement("p");
    const b = document.createElement("b");
    b.textContent = label + " · ";
    p.append(b, document.createTextNode(value));
    el.append(p);
  };
  const min = g.bonusMin ?? 1,
    threshold = g.minMatch ?? 3;
  const main = [
    `从 1–${g.max} 选 ${g.count} 个不同主球`,
    `Choose ${g.count} unique main balls from 1–${g.max}`,
    `1–${g.max}から異なる主番号を${g.count}個選択`,
  ][l];
  const extra = g.bonus
    ? [
        `，另选 ${min}–${min + g.bonus - 1} 的特别球 1 个`,
        `, plus one special ball from ${min}–${min + g.bonus - 1}`,
        `、特別番号${min}–${min + g.bonus - 1}から1個`,
      ][l]
    : "";
  add(texts[0][l], r.reference + " · " + ["公开奖", "OpenDraw", "公開くじ"][l]);
  add(texts[1][l], main + extra);
  add(
    texts[2][l],
    [
      `命中全部 ${g.count} 个主球${g.bonus ? "及特别球" : ""}`,
      `Match all ${g.count} main balls${g.bonus ? " and the special ball" : ""}`,
      `主番号${g.count}個すべて${g.bonus ? "と特別番号" : ""}に一致`,
    ][l],
  );
  add(
    texts[3][l],
    [
      `命中 ${g.count - 1} 个主球${g.bonus ? "及特别球" : ""}`,
      `Match ${g.count - 1} main balls${g.bonus ? " and the special ball" : ""}`,
      `主番号${g.count - 1}個${g.bonus ? "と特別番号" : ""}に一致`,
    ][l],
  );
  add(
    texts[4][l],
    [
      `至少命中 ${threshold} 个主球${g.bonus ? "，或命中特别球" : ""}；只计最高档`,
      `Match at least ${threshold} main balls${g.bonus ? " OR the special ball" : ""}; highest tier only`,
      `主番号${threshold}個以上${g.bonus ? "または特別番号" : ""}に一致。最高等級のみ`,
    ][l],
  );
  add(
    texts[5][l],
    `1 / ${(choose(g.max, g.count) * (g.bonus || 1)).toLocaleString(language)}`,
  );
  add(
    ["积分分配", "Point allocation", "ポイント配分"][l],
    [
      "每注 10 分；共享奖池按一/二/三档 50% / 30% / 20% 均分，整数余数和空档滚存，不保证中奖金额大于票价。",
      "10 points per ticket; the shared pool allocates 50% / 30% / 20% to tiers 1/2/3, equally split and rounded down. Unused amounts roll over. A prize may be below the ticket price.",
      "1口10ポイント。共有プールの50% / 30% / 20%を1～3等へ均等配分し端数切捨て。未配分分は繰越。当選額が購入額を下回る場合があります。",
    ][l],
  );
  add(texts[6][l], r.omit[l]);
  const a = document.createElement("a");
  a.href = r.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = texts[7][l] + " ↗";
  el.append(a);
}

import { verifyProof } from "./proof-verifier.js";

const $ = (selector) => document.querySelector(selector);
const locales = ["zh-CN", "en", "ja"];
const words = {
  brandSub: [
    "让过程看得懂",
    "A process you can understand",
    "過程を、わかりやすく",
  ],
  backPlay: ["返回选号", "Choose numbers", "番号を選ぶ"],
  title: [
    "本期开奖，一步步看清楚。",
    "Understand this draw, step by step.",
    "今回の抽選を、一つずつ確認。",
  ],
  intro: [
    "先看固定规则和时间，再看行情如何生成号码。开奖后，这个页面会在你的浏览器中重新计算结果。",
    "Read the fixed rules and schedule, then see how closing prices become numbers. After the draw, this page recalculates the result in your browser.",
    "固定されたルールと時刻を確認し、終値から番号が生まれる過程を見ます。抽選後は、このページがお使いのブラウザーで再計算します。",
  ],
  pointsBoundary: [
    "纯虚拟积分，无现金价值；各国玩法为选号结构模拟，不是官方彩票。",
    "Virtual points only, with no cash value. National formats are simulations, not official lotteries.",
    "仮想ポイントのみで、金銭的価値はありません。各国の形式は番号構造のシミュレーションで、公式宝くじではありません。",
  ],
  roundLabel: ["查看期次", "Draw round", "抽選回"],
  roundPublished: ["已公布", "Published", "公開済み"],
  roundOpen: ["进行中", "In progress", "進行中"],
  roundPaused: ["已暂停", "Paused", "停止中"],
  loading: ["正在载入…", "Loading…", "読み込み中…"],
  refreshing: [
    "正在刷新本期数据，暂不显示旧的复算结论…",
    "Refreshing this round; the previous verification verdict is cleared…",
    "この回を更新中。前回の再計算判定は消去しています…",
  ],
  refreshingCheck: ["重新读取中", "Refreshing", "更新中"],
  invalidRound: [
    "期号不正确，请重新选择一期或返回首页。",
    "The round ID is invalid. Choose another round or return home.",
    "回IDが正しくありません。別の回を選ぶか、ホームへ戻ってください。",
  ],
  refresh: ["刷新状态 ↻", "Refresh ↻", "更新 ↻"],
  loadFailed: [
    "暂时无法读取这期数据",
    "This round could not be loaded",
    "この回を読み込めませんでした",
  ],
  retryHelp: [
    "请稍后刷新。当前不会展示上一期的证明或核验结论。",
    "Please refresh later. No proof or verdict from a different round is shown.",
    "後で更新してください。別の回の証拠や判定は表示しません。",
  ],
  errorDetails: ["错误详情", "Error details", "エラー詳細"],
  ticketCost: ["每注积分", "Points per ticket", "1口のポイント"],
  sourceRule: ["固定核验来源", "Specified sources", "指定情報源"],
  earliest: ["最早开始核验", "Earliest verification", "検証開始の最早時刻"],
  rules: ["本期规则", "This round’s rules", "今回のルール"],
  sources: ["行情来源", "Price sources", "相場の情報源"],
  timeline: [
    "停售与开奖时间",
    "Sales and draw timeline",
    "販売終了と抽選の時刻",
  ],
  results: [
    "号码与本机复算",
    "Numbers and local recalculation",
    "番号とブラウザー再計算",
  ],
  downloads: ["原始文件", "Original files", "元のファイル"],
  gameLabel: [
    "选择一种玩法查看条件",
    "Choose a format to read its conditions",
    "形式を選んで条件を確認",
  ],
  payoutBoundary: [
    "每张票只计最高档；同档均分、向下取整，未分配部分结转。命中奖档不保证返奖高于每注成本。",
    "Only the highest matched tier applies. Each tier is split equally and rounded down; unused points carry over. A payout may be below the ticket cost.",
    "1口につき最高等級のみ適用。同じ等級内で均等配分し、端数は切り捨て、未配分分は繰り越します。当選額が購入額を下回る場合もあります。",
  ],
  sourceBoundary: [
    "这里展示固定采集范围与证明中声明的来源记录。双源一致不等于交易所签名；私有 R2 中的原始响应没有在本页公开验证。",
    "This shows the fixed basket and source records declared in the proof. Agreement is not an exchange signature. This page does not publicly verify the original responses in private R2 storage.",
    "固定銘柄と証拠に記載された情報源を示します。情報源の一致は取引所の署名ではなく、非公開R2の元応答はこのページでは検証しません。",
  ],
  windowHelp: [
    "“最早开始核验”不是保证开奖时刻。确认窗口结束后，只有固定来源达成共识才会开奖；缺失或分歧就继续等待。",
    "The earliest verification time is not a guaranteed draw time. After the confirmation window, the specified sources must agree. Missing or conflicting data means waiting.",
    "検証開始の最早時刻は、抽選時刻の保証ではありません。確認期間後、指定情報源が一致した場合のみ抽選します。欠損や不一致は待機します。",
  ],
  latestChecks: [
    "最近采集记录",
    "Recent collection attempts",
    "最近の取得記録",
  ],
  noChecks: [
    "尚无本期采集记录。最早核验时间前不会采集开奖。",
    "No collection attempts recorded for this round. Collection waits until the earliest verification time.",
    "この回の取得記録はまだありません。最早検証時刻までは取得・抽選しません。",
  ],
  recalculate: [
    "在本机重新计算",
    "Recalculate in this browser",
    "このブラウザーで再計算",
  ],
  verifyBoundary: [
    "复算一致表示这份证明的规则、输入与号码相互吻合，不证明数据商原始响应的真实性，也不是全部用户派奖与全账本的审计。",
    "A match means the rules, input and numbers in this proof agree. It does not authenticate the provider’s original response or audit every user payment and the full ledger.",
    "一致は、この証拠のルール・入力・番号が整合することを示します。情報源の元応答の真正性や、全ユーザーへの配分・全台帳の監査ではありません。",
  ],
  downloadHelp: [
    "想保留证据或使用开源脚本独立核对，可以下载原始文件。原始 JSON 与本页的人话说明同时保留。",
    "Download the originals to keep the evidence or check it with the open-source script. The raw JSON remains available alongside this explanation.",
    "証拠の保存や公開スクリプトによる独立検証のために、元ファイルを保存できます。この説明とともに元のJSONも残します。",
  ],
  manifestDownload: [
    "下载本期规则 JSON",
    "Download rules JSON",
    "ルールJSONを保存",
  ],
  proofDownload: [
    "下载开奖证明 JSON",
    "Download proof JSON",
    "抽選証拠JSONを保存",
  ],
  publishedManifest: [
    "查看售前固定提交 ↗",
    "View the fixed pre-sale commit ↗",
    "販売前の固定コミットを見る ↗",
  ],
  technical: [
    "展开技术细节与核验边界",
    "Technical details and verification limits",
    "技術情報と検証の範囲",
  ],
  hashHelp: [
    "MD5 是输入指纹，SHA-256 产生种子；各玩法按固定顺序和拒绝采样生成号码。公开算法不能消除托管、管理员及行情来源的全部信任边界。",
    "MD5 fingerprints the input and SHA-256 creates the seed. Fixed ordering and rejection sampling generate each format’s numbers. The open algorithm does not remove all trust in hosting, administrators or sources.",
    "MD5は入力の指紋、SHA-256はシードを生成します。固定順序と棄却サンプリングで番号を生成します。公開手順だけで運営環境・管理者・情報源への信頼が不要になるわけではありません。",
  ],
  platformTime: [
    "发布时间、采集时间由平台记录；本页不将它们当作独立可信时间戳。",
    "Publication and collection times are platform records, not independent trusted timestamps.",
    "公開時刻・取得時刻はプラットフォームの記録であり、独立した信頼できるタイムスタンプではありません。",
  ],
  algorithm: [
    "阅读开源算法说明 ↗",
    "Read the open algorithm ↗",
    "公開アルゴリズムを読む ↗",
  ],
  backHome: ["返回首页", "Back to home", "ホームへ戻る"],
  noRound: [
    "尚无可查看的期次。",
    "There are no published rounds to view.",
    "確認できる公開済みの回はありません。",
  ],
  loaded: [
    "已更新；每30秒自动刷新。",
    "Updated; refreshes every 30 seconds.",
    "更新済み。30秒ごとに自動更新します。",
  ],
  live: ["真实行情期", "Live-market round", "実相場の回"],
  demo: ["模拟体验", "Simulation", "模擬体験"],
  replay: [
    "隔离回放 · 模拟时钟",
    "Isolated replay · simulated clock",
    "分離リプレイ・模擬時計",
  ],
  demoNotice: [
    "此期使用模拟行情或模拟时钟，不代表真实行情自然开奖。",
    "This round uses simulated prices or a simulated clock, not a natural live-market draw.",
    "この回は模擬相場または模擬時計を使い、自然な実相場抽選ではありません。",
  ],
  replayNotice: [
    "这是隔离回放结果，使用模拟时钟；不能作为首期自然开奖已经完成的证据。",
    "This is an isolated replay with a simulated clock. It is not evidence that the first natural live draw has completed.",
    "これは模擬時計による分離リプレイです。初回の自然な実相場抽選の完了を示す証拠ではありません。",
  ],
  salesTitle: [
    "正在售票，规则已固定。",
    "Sales are open; the rules are fixed.",
    "販売中。ルールは固定済みです。",
  ],
  salesHelp: [
    "你可以查看本期条件；到停售时刻后，系统将拒绝购票。",
    "Inspect the conditions now. Purchases are rejected from the cutoff onward.",
    "今回の条件を確認できます。販売終了時刻以降の購入は拒否されます。",
  ],
  closedTitle: [
    "已停售，等待市场闭市。",
    "Sales closed; waiting for market close.",
    "販売終了。市場の終了を待っています。",
  ],
  closedHelp: [
    "停售早于指定市场开盘；此时尚未生成开奖号码。",
    "Sales close before the specified market opens. No draw numbers have been generated yet.",
    "指定市場の取引開始より前に販売を終了します。抽選番号はまだ生成していません。",
  ],
  confirmationTitle: [
    "市场已闭市，等待确认窗口。",
    "Markets closed; waiting for confirmation.",
    "市場終了。確認期間を待っています。",
  ],
  confirmationHelp: [
    "至少等待最后一个市场闭市后的固定确认窗口，再尝试核验收盘数据。",
    "The fixed confirmation window after the last market close must elapse before collection begins.",
    "最後の市場終了後、固定の確認期間を経てから終値の取得を試みます。",
  ],
  consensusTitle: [
    "确认窗口已到，等待来源共识。",
    "The window has elapsed; awaiting consensus.",
    "確認期間を経過。情報源の一致待ちです。",
  ],
  consensusHelp: [
    "达到最早时间不代表已经开奖。来源缺失或价格不一致时，系统继续等待。",
    "Reaching the earliest time does not mean the draw has happened. Missing sources or different prices keep the round waiting.",
    "最早時刻に達しても抽選済みとは限りません。欠損や価格の不一致があれば待機を続けます。",
  ],
  settledTitle: [
    "结果已公布，可以自己复算。",
    "Results are published and ready to reproduce.",
    "結果を公開済み。自分で再計算できます。",
  ],
  settledHelp: [
    "下方显示本期公布号码，以及你的浏览器本次重新计算的检查结果。",
    "Below are the published numbers and checks freshly recalculated in your browser.",
    "公開番号と、このブラウザーで今回再計算した確認結果を表示します。",
  ],
  pausedTitle: [
    "本期已暂停。",
    "This round is paused.",
    "この回は停止中です。",
  ],
  pausedHelp: [
    "此期暂不购票或开奖，等待处理。页面不会替换规则或提供替代结果。",
    "Purchases and the draw are paused for review. This page does not substitute rules or results.",
    "購入と抽選を停止し、確認を待っています。ルールや結果を差し替えません。",
  ],
  waitingResult: [
    "尚未开奖，因此没有可复算的开奖号码。达到最早时间后仍须等待固定来源一致。",
    "No draw has happened, so there are no numbers to recalculate. The specified sources must agree after the earliest time.",
    "まだ抽選していないため、再計算できる番号はありません。最早時刻後も指定情報源の一致が必要です。",
  ],
  publishedResult: [
    "以下是本期证明中的公布号码；本机复算会单独给出一致或不一致的结论。",
    "These are the numbers published in the proof. Local recalculation separately reports whether they match.",
    "以下は証拠に記載された公開番号です。本機の再計算で別途一致・不一致を確認します。",
  ],
  archiveUnavailableTitle: [
    "结果已发布，原始证明暂不可读取。",
    "Results published; the original proof is unavailable.",
    "結果公開済みですが、元の証拠を取得できません。",
  ],
  archiveUnavailableHelp: [
    "请稍后刷新。未取得对应的原始证明，因此本页没有执行复算，也没有使用其他数据代替。",
    "Refresh later. The matching original proof was not retrieved, so no recalculation or substitute data is used.",
    "後で更新してください。対応する元の証拠を取得できていないため、再計算せず、別のデータで代用もしません。",
  ],
  verifying: [
    "正在你的浏览器中复算…",
    "Recalculating in your browser…",
    "このブラウザーで再計算中…",
  ],
  verified: [
    "本机复算一致",
    "Local recalculation matches",
    "ブラウザー再計算は一致",
  ],
  failedVerify: [
    "本机检查发现不一致，请保留原始证明。",
    "A local check found a mismatch. Keep the original proof.",
    "本機の確認で不一致を検出しました。元の証拠を保存してください。",
  ],
  verifyError: [
    "本机复算未完成，请稍后重试。",
    "Local recalculation did not complete. Please retry.",
    "本機の再計算が完了しませんでした。再試行してください。",
  ],
  notPublished: [
    "尚无发布时间记录",
    "No publication time recorded",
    "公開時刻の記録はありません",
  ],
  publishedTime: [
    "平台记录的承诺发布时间",
    "Platform-recorded commitment publication",
    "平台記録のコミットメント公開時刻",
  ],
  cutoffTime: ["停止购票", "Ticket sales close", "購入受付を終了"],
  closeTime: [
    "指定市场全部闭市",
    "All specified markets close",
    "指定市場がすべて終了",
  ],
  readyTime: [
    "最早开始采集与核验",
    "Earliest collection and verification",
    "取得・検証開始の最早時刻",
  ],
  resultTime: [
    "结果公布与本机复算",
    "Published result and local recalculation",
    "結果公開とブラウザー再計算",
  ],
  publishedNoTime: [
    "结果已公布，具体发布时间未记录。",
    "Results are published; the exact publication time was not recorded.",
    "結果は公開済みですが、正確な公開時刻は記録されていません。",
  ],
  collectionTime: [
    "证明记录的采集时间（平台记录）",
    "Collection time declared in the proof (platform record)",
    "証拠に記載された取得時刻（プラットフォーム記録）",
  ],
  commitmentHelp: [
    "本期标的、来源、时间和算法在售票前固定。固定提交链接仍可从原始文件区打开。",
    "The instruments, sources, times and algorithm are committed before sales. The fixed commit remains linked in Original files.",
    "銘柄・情報源・時刻・手順は販売前に固定します。固定コミットは元ファイル欄から確認できます。",
  ],
  cutoffHelp: [
    "从这个时刻开始不能再购买本期票。",
    "No tickets for this round can be purchased from this instant onward.",
    "この時刻以降、この回の購入はできません。",
  ],
  closeHelp: [
    "需要等待每个固定标的所属交易时段结束。",
    "Every specified instrument’s trading session must have ended.",
    "指定されたすべての銘柄の取引時間終了を待ちます。",
  ],
  readyHelp: [
    "这是最早尝试时间，不是保证的开奖时刻。",
    "This is the earliest attempt, not a guaranteed result time.",
    "最早の試行時刻であり、結果発表時刻の保証ではありません。",
  ],
  resultHelp: [
    "只有来源满足规则才产生结果；公布后可下载和重新计算。",
    "A result is generated only when the source rule is met; then it can be downloaded and reproduced.",
    "情報源が条件を満たした場合のみ結果を生成し、その後保存・再計算できます。",
  ],
  simulatedAdvance: [
    "模拟时钟已推进：下列停售/最早时间使用模拟运行值，原始规则JSON仍保留最初时间。它们不能当作真实市场时间线。",
    "The simulated clock was advanced. Cutoff/ready below use simulation values, while the rules JSON keeps the original times. This is not a real market timeline.",
    "模擬時計を進めています。以下の販売終了・最早時刻は模擬実行値で、元のルールJSONは初期時刻を保持します。実市場の時系列ではありません。",
  ],
  pending: ["等待收盘确认", "Awaiting close confirmation", "終値の確認待ち"],
  session: ["交易日", "Trading date", "取引日"],
  closedAt: ["闭市", "Market close", "取引終了"],
  proofPrice: [
    "证明声明价格",
    "Price declared in proof",
    "証拠に記載された価格",
  ],
  noSource: [
    "证明尚无此来源记录",
    "No record for this source in the proof",
    "この情報源の記録はありません",
  ],
  sourcePublic: [
    "Yahoo Finance 与 Nasdaq 必须逐只股票、同一交易日、同一币种、以声明精度完全一致。任一缺失或分歧都等待，不平均、不换来源、不换交易日。",
    "Yahoo Finance and Nasdaq must match exactly for every instrument, trading date, currency and declared precision. Missing or conflicting data means waiting: no averaging or changing sources or dates.",
    "Yahoo FinanceとNasdaqは、銘柄・取引日・通貨・指定精度ごとに完全一致が必要です。欠損や不一致は待機し、平均化や情報源・日付の変更はしません。",
  ],
  sourceDemo: [
    "模拟来源只用于演示页面与算法流程，数据可预测，不具备真实行情随机性的含义。",
    "Simulated sources demonstrate the page and algorithm. Their prices are predictable and are not live-market randomness.",
    "模擬情報源は画面と手順のデモ用です。価格は予測可能で、実相場のランダム性を意味しません。",
  ],
  sourceOther: [
    "以下为本期售前固定的来源；来源共识要求以原始规则JSON为准。",
    "These are the sources committed for this round. The original rules JSON defines the consensus requirement.",
    "以下は販売前に固定された情報源です。合意条件は元のルールJSONに従います。",
  ],
  noDate: ["尚未记录", "Not recorded yet", "未記録"],
  local: ["你的时区", "Your time zone", "表示タイムゾーン"],
  beijing: ["北京时间", "Beijing time", "北京時間"],
  passed: ["一致", "Matches", "一致"],
  mismatch: ["不一致", "Mismatch", "不一致"],
  collectionOk: [
    "来源满足共识条件",
    "Sources met the consensus rule",
    "情報源が合意条件を満たしました",
  ],
  collectionWait: [
    "采集仍需等待",
    "Collection is still waiting",
    "取得は引き続き待機中",
  ],
  roundId: ["期号", "Round ID", "回ID"],
  commitment: [
    "规则承诺摘要（SHA-256）",
    "Rules commitment (SHA-256)",
    "ルールのコミットメント（SHA-256）",
  ],
  inputFingerprint: [
    "输入指纹（MD5）",
    "Input fingerprint (MD5)",
    "入力指紋（MD5）",
  ],
  seed: ["抽号种子（SHA-256）", "Draw seed (SHA-256)", "抽選シード（SHA-256）"],
  execution: ["运行方式", "Execution mode", "実行方式"],
  poolBefore: [
    "证明中的开奖前奖池",
    "Pre-draw pool in the proof",
    "証拠に記載された抽選前プール",
  ],
  payout: [
    "证明中的总派奖",
    "Total payout in the proof",
    "証拠に記載された総配分",
  ],
  poolAfter: [
    "证明中的开奖后奖池",
    "Post-draw pool in the proof",
    "証拠に記載された抽選後プール",
  ],
  poolBoundary: [
    "这里只核对这一份证明的减法关系，不代表后续奖池余额或完整账本守恒已审计。",
    "This checks the subtraction in this proof, not the later pool balance or conservation across the full ledger.",
    "この証拠内の差引計算のみを確認し、その後の残高や全台帳の保存則監査ではありません。",
  ],
  selection: ["如何选号", "How to choose", "番号の選び方"],
  firstTier: ["一等奖", "Tier 1", "1等"],
  secondTier: ["二等奖", "Tier 2", "2等"],
  thirdTier: ["三等奖", "Tier 3", "3等"],
  odds: ["头奖概率", "Top-tier odds", "1等の確率"],
  allocation: ["共享奖池分配", "Shared-pool allocation", "共有プール配分"],
};
const checks = {
  manifest: [
    ["固定规则摘要", "Committed rules", "固定ルール"],
    [
      "规则摘要与本期承诺相符。",
      "The rules digest matches the round commitment.",
      "ルールの要約値が今回のコミットメントと一致。",
    ],
  ],
  canonical: [
    ["输入排序与格式", "Input order and format", "入力順序と形式"],
    [
      "本期价格按承诺格式组成同一输入。",
      "The round prices form the same canonical input.",
      "今回の価格から同じ規定入力を構成。",
    ],
  ],
  hashes: [
    ["输入指纹与种子", "Fingerprint and seed", "指紋とシード"],
    [
      "本机重新计算 MD5 与 SHA-256。",
      "MD5 and SHA-256 are recalculated locally.",
      "本機でMD5とSHA-256を再計算。",
    ],
  ],
  results: [
    ["各玩法号码", "Every format’s numbers", "各形式の番号"],
    [
      "重新抽取的号码与公布号码逐项比较。",
      "Freshly generated numbers are compared with the published numbers.",
      "再生成した番号と公開番号を項目ごとに比較。",
    ],
  ],
  timing: [
    ["证明内的时间顺序", "Timing inside the proof", "証拠内の時系列"],
    [
      "仅核对证明声明的时间；模拟时钟会单独标示。",
      "Checks declared times only; simulated clocks are labeled separately.",
      "記載時刻のみ確認。模擬時計は別途表示。",
    ],
  ],
  sources: [
    [
      "证明声明的来源共识",
      "Declared source agreement",
      "記載された情報源の一致",
    ],
    [
      "只核对证明中的来源记录，不认证私有原始响应。",
      "Checks source records in the proof, not private original responses.",
      "証拠内の情報源記録のみ確認し、非公開の元応答は認証しません。",
    ],
  ],
  pool: [
    ["证明内的奖池算术", "Pool arithmetic in the proof", "証拠内のプール計算"],
    [
      "核对开奖前减派奖等于开奖后，不是全账本审计。",
      "Checks before minus payout equals after, not the full ledger.",
      "抽選前−配分＝抽選後のみを確認し、全台帳監査ではありません。",
    ],
  ],
};
const gameNames = {
  cn: ["中国 · 双星", "China · Twin Star", "中国 · ツインスター"],
  us: ["美国 · 超级球", "USA · Super Ball", "米国 · スーパーボール"],
  uk: ["英国 · 六重奏", "UK · Six Notes", "英国 · シックス"],
  jp: ["日本 · 六之幸", "Japan · Lucky Six", "日本 · ラッキーシックス"],
  fr: ["法国 · 幸运星", "France · Lucky Star", "フランス · ラッキースター"],
  de: ["德国 · 超级数", "Germany · Super Number", "ドイツ · スーパー番号"],
  it: ["意大利 · 九十之选", "Italy · Ninety Picks", "イタリア · ナインティ"],
  es: ["西班牙 · 原野六", "Spain · Field Six", "スペイン · フィールドシックス"],
  ca: ["加拿大 · 枫叶六", "Canada · Maple Six", "カナダ · メープルシックス"],
  au: [
    "澳大利亚 · 南十字七",
    "Australia · Southern Seven",
    "豪州 · サザンセブン",
  ],
  nz: [
    "新西兰 · 云帆六",
    "New Zealand · Cloud Six",
    "ニュージーランド · クラウドシックス",
  ],
  kr: ["韩国 · 四五之约", "Korea · Forty Five", "韓国 · フォーティファイブ"],
  sg: [
    "新加坡 · 狮城六",
    "Singapore · Lion Six",
    "シンガポール · ライオンシックス",
  ],
  br: ["巴西 · 森林六", "Brazil · Forest Six", "ブラジル · フォレストシックス"],
  za: [
    "南非 · 彩虹六",
    "South Africa · Rainbow Six",
    "南アフリカ · レインボーシックス",
  ],
  ph: [
    "菲律宾 · 群岛六",
    "Philippines · Island Six",
    "フィリピン · アイランドシックス",
  ],
};
let language = "zh-CN";
try {
  const stored = localStorage.getItem("market-luck-language");
  language = locales.includes(stored)
    ? stored
    : navigator.language.startsWith("ja")
      ? "ja"
      : navigator.language.startsWith("zh")
        ? "zh-CN"
        : "en";
} catch {}
const index = () => locales.indexOf(language);
const t = (key) => words[key]?.[index()] || key;
const pick = (array) => array[index()];
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const setText = (selector, text) => {
  const el = $(selector);
  if (el.textContent !== text) el.textContent = text;
};
const validRound = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(id);
const timestamp = (value) =>
  typeof value === "number"
    ? value
    : typeof value === "string"
      ? Date.parse(value)
      : NaN;
const dateText = (value, zone) => {
  const ms = timestamp(value);
  return Number.isFinite(ms)
    ? new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "medium",
        ...(zone ? { timeZone: zone } : {}),
      }).format(ms)
    : t("noDate");
};
const gameName = (g) =>
  `${g.flag || ""} ${gameNames[g.id]?.[index()] || g.name || g.id}`.trim();
let roundList = [],
  selectedId = new URL(location.href).searchParams.get("round"),
  invalidRequestedRound = selectedId !== null && !validRound(selectedId),
  displayedRoundId = null,
  data = null,
  report = null,
  gameId = "cn",
  offset = 0,
  requestVersion = 0,
  verificationVersion = 0,
  requestController;
if (!validRound(selectedId)) selectedId = null;
function renderStatic() {
  document.documentElement.lang = language;
  document.title = `Market Luck · ${t("title")}`;
  for (const el of document.querySelectorAll("[data-t]"))
    el.textContent = t(el.dataset.t);
  $("#verifyLanguage").value = language;
}
function formatTime(el, value) {
  el.replaceChildren(node("strong", dateText(value), "time-local"));
  if (Number.isFinite(timestamp(value)))
    el.append(
      node(
        "small",
        `${t("beijing")}: ${dateText(value, "Asia/Shanghai")} · UTC: ${new Date(timestamp(value)).toISOString().replace("T", " ").replace(".000Z", "Z")}`,
        "time-other",
      ),
    );
}
function updateRoundSelect() {
  const rows = [...roundList];
  if (selectedId && !rows.some((r) => r.id === selectedId))
    rows.unshift(
      data?.round?.id === selectedId ? data.round : { id: selectedId },
    );
  const desired = rows.map((r) => r.id).join("|");
  const select = $("#roundSelect");
  if (select.dataset.ids !== desired) {
    select.replaceChildren(
      ...rows.map((r) => {
        const option = node("option", r.id);
        option.value = r.id;
        return option;
      }),
    );
    select.dataset.ids = desired;
  }
  rows.forEach((r, i) => {
    const date = r.manifest?.markets?.[0]?.date;
    const status = t(
      r.status === "settled"
        ? "roundPublished"
        : r.status === "paused"
          ? "roundPaused"
          : "roundOpen",
    );
    select.options[i].textContent = date
      ? `${date} · ${status} · ${r.id.slice(0, 8)}`
      : r.id;
  });
  select.disabled = !rows.length;
  if (selectedId) select.value = selectedId;
}
function phase() {
  const r = data?.round;
  if (!r) return null;
  if (r.status === "paused") return ["pausedTitle", "pausedHelp", -1];
  if (r.status === "settled" && data.proofUnavailable)
    return ["archiveUnavailableTitle", "archiveUnavailableHelp", 3];
  if (r.status === "settled" && r.proof)
    return ["settledTitle", "settledHelp", 4];
  const now = Date.now() + offset,
    close = Math.max(...r.manifest.markets.map((m) => m.closeUTC));
  if (now < r.cutoff) return ["salesTitle", "salesHelp", 0];
  if (now < close) return ["closedTitle", "closedHelp", 1];
  if (now < r.ready) return ["confirmationTitle", "confirmationHelp", 2];
  return ["consensusTitle", "consensusHelp", 3];
}
function tick() {
  if (!data) return;
  const current = phase();
  const simulatedAdvance =
    data.round.manifest.mode === "DEMO" &&
    (data.round.cutoff !== data.round.manifest.cutoff ||
      data.round.ready !== data.round.manifest.ready);
  setText("#phaseTitle", t(current[0]));
  setText("#phaseDescription", t(current[1]));
  document.querySelectorAll("#drawTimeline li").forEach((el, i) => {
    el.classList.toggle("complete", !simulatedAdvance && current[2] >= i);
    el.classList.toggle("current", current[2] === i);
  });
}
function renderRules() {
  const m = data.round.manifest,
    catalog = m.games || [];
  const price = m.price,
    payout = (m.payout || []).join("% / ") + "%";
  $("#ruleSummary").textContent = pick([
    `本期包含 ${catalog.length} 种虚拟选号结构，每注 ${price} 积分；共享奖池一/二/三档按 ${payout} 分配。`,
    `This round contains ${catalog.length} virtual number formats at ${price} points per ticket. The shared pool allocates ${payout} to tiers 1/2/3.`,
    `今回の仮想番号形式は${catalog.length}種類、1口${price}ポイント。共有プールを1～3等に${payout}で配分します。`,
  ]);
  const select = $("#auditGame");
  select.replaceChildren(
    ...catalog.map((g) => {
      const o = node("option", gameName(g));
      o.value = g.id;
      return o;
    }),
  );
  const g = catalog.find((x) => x.id === gameId) || catalog[0];
  if (!g) return;
  gameId = g.id;
  select.value = gameId;
  const min = g.bonusMin ?? 1,
    extra = g.bonus
      ? pick([
          `，另选 ${min}–${min + g.bonus - 1} 的特别球1个`,
          `, plus one special ball from ${min}–${min + g.bonus - 1}`,
          `、特別番号${min}–${min + g.bonus - 1}から1個`,
        ])
      : "";
  const values = [
    [
      "selection",
      pick([
        `从1–${g.max}选${g.count}个不同主球${extra}`,
        `Choose ${g.count} different main balls from 1–${g.max}${extra}`,
        `1–${g.max}から異なる主番号${g.count}個${extra}`,
      ]),
    ],
    [
      "firstTier",
      pick([
        `命中全部${g.count}个主球${g.bonus ? "及特别球" : ""}`,
        `Match all ${g.count} main balls${g.bonus ? " and the special ball" : ""}`,
        `主番号${g.count}個すべて${g.bonus ? "と特別番号" : ""}に一致`,
      ]),
    ],
    [
      "secondTier",
      pick([
        `命中${g.count - 1}个主球${g.bonus ? "及特别球" : ""}`,
        `Match ${g.count - 1} main balls${g.bonus ? " and the special ball" : ""}`,
        `主番号${g.count - 1}個${g.bonus ? "と特別番号" : ""}に一致`,
      ]),
    ],
    [
      "thirdTier",
      pick([
        `至少命中${g.minMatch ?? 3}个主球${g.bonus ? "或命中特别球" : ""}；只计最高档`,
        `Match at least ${g.minMatch ?? 3} main balls${g.bonus ? " OR the special ball" : ""}; highest tier only`,
        `主番号${g.minMatch ?? 3}個以上${g.bonus ? "または特別番号" : ""}に一致。最高等級のみ`,
      ]),
    ],
    [
      "odds",
      `1 / ${Math.round(Array.from({ length: g.count }, (_, i) => (g.max - i) / (i + 1)).reduce((a, b) => a * b, 1) * (g.bonus || 1)).toLocaleString(language)}`,
    ],
    ["allocation", payout],
  ];
  $("#gameExplanation").replaceChildren(
    ...values.map(([label, value]) => {
      const box = node("div");
      box.append(node("b", t(label)), node("span", value));
      return box;
    }),
  );
}
function renderSources() {
  const m = data.round.manifest,
    proof = data.round.proof;
  $("#sourceExplanation").textContent =
    m.mode === "DEMO"
      ? t("sourceDemo")
      : m.sourceProfile === "PUBLIC-NOKEY-v1"
        ? t("sourcePublic")
        : t("sourceOther");
  $("#marketCards").replaceChildren(
    ...m.markets.map((market) => {
      const box = node("article", undefined, "market-card");
      box.append(
        node("h3", market.symbol),
        node(
          "p",
          `${t("session")}: ${market.date} · ${market.currency} · ${pick(["精度", "precision", "精度"])} ${market.scale}`,
        ),
        node("p", `${t("closedAt")}: ${dateText(market.closeUTC)}`),
      );
      const archive = proof?.sources?.find((x) => x.symbol === market.symbol);
      for (const provider of m.sources || []) {
        const source = archive?.sources?.find((s) => s.provider === provider),
          row = node("div", undefined, "source-observation");
        row.append(node("strong", provider));
        if (
          source &&
          Number.isSafeInteger(source.closeMinorUnits ?? source.close)
        ) {
          const value = source.closeMinorUnits ?? source.close;
          row.append(
            node(
              "span",
              `${t("proofPrice")}: ${(value / 10 ** market.scale).toFixed(market.scale)} ${market.currency}`,
            ),
          );
          if (source.sha256) {
            const hash = node(
              "small",
              ` · SHA-256 ${source.sha256.slice(0, 12)}…`,
            );
            hash.title = source.sha256;
            row.append(hash);
          }
        } else
          row.append(
            node(
              "span",
              data.proofUnavailable
                ? t("archiveUnavailableTitle")
                : proof
                  ? t("noSource")
                  : t("pending"),
            ),
          );
        box.append(row);
      }
      return box;
    }),
  );
}
function renderTimeline() {
  const r = data.round,
    m = r.manifest,
    close = Math.max(...m.markets.map((x) => x.closeUTC));
  const rows = [
    ["publishedTime", data.anchor?.published, "commitmentHelp"],
    ["cutoffTime", r.cutoff, "cutoffHelp"],
    ["closeTime", close, "closeHelp"],
    ["readyTime", r.ready, "readyHelp"],
    ["resultTime", null, "resultHelp"],
  ];
  $("#drawTimeline").replaceChildren(
    ...rows.map(([label, time, help]) => {
      const li = node("li");
      li.append(node("h3", t(label)));
      const timeBox = node("div");
      if (label === "publishedTime" && !time)
        timeBox.append(node("span", t("notPublished"), "time-other"));
      else if (label === "resultTime")
        timeBox.append(
          node(
            "span",
            t(r.status === "settled" ? "publishedNoTime" : "waitingResult"),
            "time-other",
          ),
        );
      else formatTime(timeBox, time);
      li.append(timeBox, node("p", t(help)));
      return li;
    }),
  );
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  $("#timezoneNote").textContent =
    `${t("local")}: ${zone} · ${t("beijing")}: Asia/Shanghai · UTC`;
  const changed =
    m.mode === "DEMO" && (r.cutoff !== m.cutoff || r.ready !== m.ready);
  $("#simulatedClockNotice").hidden = !changed;
  $("#simulatedClockNotice").textContent = t("simulatedAdvance");
  const attempts = data.attempts || [];
  $("#collectionAttempts").replaceChildren(
    ...(attempts.length
      ? attempts.map((a) => {
          const row = node("div", undefined, "attempt-row");
          row.append(
            node(
              "span",
              `${dateText(a.attempted)} · ${a.ok ? t("collectionOk") : t("collectionWait")}`,
            ),
            node("small", String(a.reason || "")),
          );
          return row;
        })
      : [node("p", t("noChecks"))]),
  );
}
function renderResults() {
  const proof = data.round.proof;
  const replay =
    proof?.execution === "ONLINE_REPLAY_SIMULATED_CLOCK" ||
    data.executionHint === "ONLINE_REPLAY_SIMULATED_CLOCK";
  const simulated = data.demo || data.round.manifest.mode === "DEMO";
  $("#resultModeNotice").hidden = !replay && !simulated;
  $("#resultModeNotice").textContent = t(
    replay ? "replayNotice" : "demoNotice",
  );
  $("#resultIntro").textContent = data.proofUnavailable
    ? t("archiveUnavailableHelp")
    : proof
      ? t("publishedResult")
      : t("waitingResult");
  $("#recalculate").disabled = !proof;
  $("#drawResults").replaceChildren();
  $("#poolResult").replaceChildren();
  $("#verificationChecks").replaceChildren();
  if (!proof) {
    $("#verificationStatus").textContent = t(
      data.proofUnavailable ? "archiveUnavailableTitle" : "waitingResult",
    );
    if (data.proofUnavailable) {
      const error = node("details");
      error.append(
        node("summary", t("errorDetails")),
        node("p", data.proofError),
      );
      $("#verificationChecks").append(error);
    }
    return;
  }
  for (const g of data.round.manifest.games || []) {
    const result = proof.results?.[g.id];
    if (!result) continue;
    const row = node("div", undefined, "result-row");
    row.append(
      node("b", gameName(g)),
      node(
        "span",
        `${(result.main || []).join(" · ")}${result.bonus !== null && result.bonus !== undefined ? ` + ${result.bonus}` : ""}`,
      ),
    );
    $("#drawResults").append(row);
  }
  for (const [key, value] of [
    ["poolBefore", proof.poolBefore],
    ["payout", proof.payout],
    ["poolAfter", proof.poolAfter],
  ])
    $("#poolResult").append(
      node(
        "p",
        `${t(key)}: ${Number.isSafeInteger(value) ? value.toLocaleString(language) : "—"}`,
      ),
    );
  $("#poolResult").append(node("p", t("poolBoundary"), "muted"));
  if (report) renderReport();
  else $("#verificationStatus").textContent = t("verifying");
}
function renderReport() {
  if (!report || !data?.round.proof) return;
  $("#verificationStatus").textContent = report.ok
    ? t("verified")
    : t("failedVerify");
  $("#verificationChecks").replaceChildren(
    ...report.checks.map((check) => {
      const info =
        data.round.manifest.mode === "DEMO" && check.id === "timing"
          ? [
              ["模拟时钟标记", "Simulated-clock marker", "模擬時計のマーカー"],
              [
                "只核对模拟标记，不验证真实市场时序。",
                "Checks the simulation marker only, not real-market timing.",
                "模擬マーカーのみ確認し、実市場の時系列は検証しません。",
              ],
            ]
          : data.round.manifest.mode === "DEMO" && check.id === "sources"
            ? [
                [
                  "模拟来源标记",
                  "Simulated-source marker",
                  "模擬情報源のマーカー",
                ],
                [
                  "只核对 FIXTURE-v1 标记，不代表真实双源共识。",
                  "Checks the FIXTURE-v1 marker only; this is not real two-source consensus.",
                  "FIXTURE-v1マーカーのみ確認し、実際の2情報源の合意は意味しません。",
                ],
              ]
            : checks[check.id];
      const box = node(
        "div",
        undefined,
        `check-item ${check.ok ? "pass" : "fail"}`,
      );
      box.dataset.checkId = check.id;
      box.append(
        node(
          "strong",
          `${check.ok ? "✓" : "!"} ${info ? pick(info[0]) : check.id} · ${check.ok ? t("passed") : t("mismatch")}`,
        ),
        node("p", info ? pick(info[1]) : check.id),
      );
      return box;
    }),
  );
  if (!report.ok && report.errors?.length) {
    const detail = node("details");
    detail.append(
      node("summary", t("errorDetails")),
      node("p", report.errors.join(" · ")),
    );
    $("#verificationChecks").append(detail);
  }
}
function safePublication(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      u.hostname === "raw.githubusercontent.com" &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function renderDownloads() {
  const r = data.round,
    proof = r.proof;
  $("#manifestDownload").href =
    `/api/round/${encodeURIComponent(r.id)}/manifest`;
  $("#proofDownload").hidden = !proof && !data.proofUnavailable;
  if (proof || data.proofUnavailable)
    $("#proofDownload").href = `/api/proof/${encodeURIComponent(r.id)}`;
  else $("#proofDownload").removeAttribute("href");
  const url = safePublication(data.anchor?.url);
  $("#publishedManifest").hidden = !url;
  if (url) $("#publishedManifest").href = url;
  else $("#publishedManifest").removeAttribute("href");
  const entries = [
    ["roundId", r.id],
    ["commitment", r.commitment],
    ["execution", proof?.execution || r.manifest.mode],
  ];
  if (proof)
    entries.push(["inputFingerprint", proof.md5], ["seed", proof.seed]);
  if (proof?.observedAt)
    entries.push(["collectionTime", dateText(proof.observedAt)]);
  $("#technicalDetails").replaceChildren(
    ...entries.flatMap(([key, value]) => [
      node("dt", t(key)),
      node("dd", String(value ?? "—")),
    ]),
  );
}
function renderData() {
  if (!data) return;
  const r = data.round,
    m = r.manifest,
    replay =
      r.proof?.execution === "ONLINE_REPLAY_SIMULATED_CLOCK" ||
      data.executionHint === "ONLINE_REPLAY_SIMULATED_CLOCK",
    demo = data.demo || m.mode === "DEMO";
  $("#stageBadge").textContent = t(replay ? "replay" : demo ? "demo" : "live");
  $("#modeNotice").hidden = !demo && !replay;
  $("#modeNotice").textContent = t(replay ? "replayNotice" : "demoNotice");
  $("#ticketPrice").textContent = String(m.price);
  $("#sourceCount").textContent = (m.sources || []).join(" + ");
  $("#earliestTime").textContent = dateText(r.ready);
  renderRules();
  updateRoundSelect();
  renderSources();
  renderTimeline();
  renderResults();
  renderDownloads();
  tick();
}
async function runVerification() {
  if (!data?.round.proof) return;
  const current = data,
    version = ++verificationVersion;
  report = null;
  $("#recalculate").disabled = true;
  $("#verificationChecks").replaceChildren();
  $("#verificationStatus").textContent = t("verifying");
  try {
    const fresh = await verifyProof(current.round.proof, {
      roundId: current.round.id,
      commitment: current.round.commitment,
      manifest: current.round.manifest,
    });
    if (version !== verificationVersion || data !== current) return;
    report = fresh;
    renderReport();
  } catch {
    if (version === verificationVersion && data === current)
      $("#verificationStatus").textContent = t("verifyError");
  } finally {
    if (version === verificationVersion && data === current)
      $("#recalculate").disabled = false;
  }
}
async function getJson(path, signal) {
  const response = await fetch(path, { signal, cache: "no-store" });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}
async function refresh() {
  const version = ++requestVersion;
  const preserveLayout =
    !invalidRequestedRound &&
    selectedId &&
    selectedId === displayedRoundId &&
    !$("#auditContent").hidden;
  requestController?.abort();
  requestController = new AbortController();
  const signal = requestController.signal;
  ++verificationVersion;
  data = null;
  report = null;
  if (!preserveLayout) {
    $("#auditContent").hidden = true;
    displayedRoundId = null;
  } else {
    $("#auditContent").classList.add("is-refreshing");
    $("#recalculate").disabled = true;
    $("#verificationStatus").textContent = t("refreshing");
    for (const item of document.querySelectorAll(
      "#verificationChecks .check-item",
    )) {
      item.classList.remove("pass", "fail");
      const info = checks[item.dataset.checkId];
      item.querySelector("strong").textContent =
        `⟳ ${info ? pick(info[0]) : item.dataset.checkId} · ${t("refreshingCheck")}`;
    }
  }
  $("#loadError").hidden = true;
  $("#loadStatus").textContent = t(preserveLayout ? "refreshing" : "loading");
  $("#refreshVerify").disabled = true;
  try {
    if (invalidRequestedRound) throw Error("INVALID_ROUND_ID");
    const state = await getJson("/api/state", signal);
    if (version !== requestVersion) return;
    roundList = state.rounds || [];
    if (!selectedId)
      selectedId =
        roundList.find((r) => r.status === "open")?.id || roundList[0]?.id;
    updateRoundSelect();
    if (!selectedId) {
      $("#loadStatus").textContent = t("noRound");
      return;
    }
    const detail = await getJson(
      `/api/round/${encodeURIComponent(selectedId)}`,
      signal,
    );
    if (version !== requestVersion) return;
    if (detail.round?.id !== selectedId || !detail.round?.manifest)
      throw Error("ROUND_RESPONSE_MISMATCH");
    const receivedAt = Date.now();
    offset =
      (Number.isFinite(detail.serverTime) ? detail.serverTime : receivedAt) -
      receivedAt;
    detail.executionHint = detail.round.proof?.execution;
    if (detail.round.proof) {
      try {
        const original = await getJson(
          `/api/proof/${encodeURIComponent(selectedId)}`,
          signal,
        );
        if (version !== requestVersion) return;
        if (original.execution === "ONLINE_REPLAY_SIMULATED_CLOCK")
          detail.executionHint = original.execution;
        if (original.manifest?.id !== detail.round.id)
          throw Error("ARCHIVE_ROUND_MISMATCH");
        if (JSON.stringify(original) !== JSON.stringify(detail.round.proof))
          throw Error("ARCHIVE_PROOF_MISMATCH");
        detail.round.proof = original;
      } catch (error) {
        if (version !== requestVersion || error.name === "AbortError") return;
        detail.round.proof = null;
        detail.proofUnavailable = true;
        detail.proofError = String(error.message);
      }
    }
    if (version !== requestVersion) return;
    data = detail;
    displayedRoundId = detail.round.id;
    $("#auditContent").classList.remove("is-refreshing");
    $("#auditContent").hidden = false;
    $("#loadStatus").textContent = t("loaded");
    renderData();
    if (detail.round.proof) await runVerification();
    if (!preserveLayout && version === requestVersion && data === detail) {
      const section = location.hash.slice(1);
      if (
        ["rules", "sources", "timeline", "results", "downloads"].includes(
          section,
        )
      )
        document
          .getElementById(section)
          ?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  } catch (error) {
    if (version !== requestVersion || error.name === "AbortError") return;
    data = null;
    report = null;
    displayedRoundId = null;
    $("#auditContent").classList.remove("is-refreshing");
    $("#auditContent").hidden = true;
    $("#loadError").hidden = false;
    $("#errorText").textContent = String(error.message);
    $("#loadStatus").textContent = t(
      invalidRequestedRound ? "invalidRound" : "loadFailed",
    );
    if (invalidRequestedRound) $("#errorText").textContent = t("invalidRound");
  } finally {
    if (version === requestVersion) $("#refreshVerify").disabled = false;
  }
}
$("#verifyLanguage").addEventListener("change", () => {
  language = $("#verifyLanguage").value;
  try {
    localStorage.setItem("market-luck-language", language);
  } catch {}
  renderStatic();
  updateRoundSelect();
  if (data) {
    $("#loadStatus").textContent = t("loaded");
    renderData();
  }
});
$("#roundSelect").addEventListener("change", () => {
  selectedId = $("#roundSelect").value;
  invalidRequestedRound = false;
  const url = new URL(location.href);
  url.searchParams.set("round", selectedId);
  history.replaceState(null, "", url);
  void refresh();
});
$("#auditGame").addEventListener("change", () => {
  gameId = $("#auditGame").value;
  if (data) renderRules();
});
$("#refreshVerify").addEventListener("click", () => void refresh());
$("#recalculate").addEventListener("click", () => void runVerification());
window.addEventListener("popstate", () => {
  const id = new URL(location.href).searchParams.get("round");
  invalidRequestedRound = id !== null && !validRound(id);
  selectedId = validRound(id) ? id : null;
  void refresh();
});
renderStatic();
void refresh();
setInterval(() => void refresh(), 30000);
setInterval(tick, 1000);

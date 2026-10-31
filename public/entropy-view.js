let generation = 0;
const copy = {
  "zh-CN": {
    title: "随机性与行情冻结",
    legacy:
      "本期为 v1，按原有双源行情算法执行。v2 未来信标不会追溯加入已售期次。",
    v2: "v2 先冻结首次一致行情，再等待至少 120 秒后的固定 quicknet 轮次。服务器和浏览器分别验签；失败不换轮、不降级。",
    waiting: "尚未冻结行情。数据缺失或分歧时继续等待。",
    failed: "冻结快照暂时无法读取，请刷新重试。",
    fields: ["快照冻结时间", "目标信标轮次", "目标信标时间", "快照 SHA-256"],
    download: "下载冻结快照 JSON",
    boundary:
      "冻结时间来自平台数据库，不是独立可信时间戳；同账号验签对象也不是第三方见证。",
  },
  en: {
    title: "Randomness and price freeze",
    legacy:
      "This is a v1 round and keeps its original two-source algorithm. The v2 future beacon is never added to tickets already sold.",
    v2: "v2 freezes the first consensus, then waits for its fixed quicknet round at least 120 seconds later. Server and browser verify signatures; failures never change rounds or downgrade.",
    waiting:
      "No frozen consensus yet. Missing or conflicting quotes mean waiting.",
    failed: "The frozen snapshot could not be loaded. Please retry.",
    fields: [
      "Snapshot sealed at",
      "Target beacon round",
      "Target beacon time",
      "Snapshot SHA-256",
    ],
    download: "Download frozen snapshot JSON",
    boundary:
      "The database seal time is not an independent timestamp. The same-account verifier is not a third-party witness.",
  },
  ja: {
    title: "乱数と相場の固定",
    legacy:
      "この回は v1 の元の2情報源アルゴリズムを使用します。販売済みの回に v2 の将来ビーコンを追加しません。",
    v2: "v2 は最初の一致相場を固定し、120秒以上先の指定 quicknet 回を待ちます。サーバーとブラウザで署名を検証し、失敗時も別の回や旧方式に切り替えません。",
    waiting: "一致相場は未固定です。欠損や不一致は待機します。",
    failed: "固定記録を取得できません。更新して再試行してください。",
    fields: [
      "固定時刻",
      "対象ビーコン回",
      "対象ビーコン時刻",
      "固定記録 SHA-256",
    ],
    download: "固定記録 JSON を保存",
    boundary:
      "データベースの時刻は独立したタイムスタンプではありません。同じアカウントの検証処理は第三者の証人ではありません。",
  },
};
export async function renderEntropy(data, language = "zh-CN") {
  const attempt = ++generation,
    words = copy[language] || copy.en,
    box = document.getElementById("entropyPanel");
  if (!box) return;
  const heading = document.createElement("h2"),
    intro = document.createElement("p");
  heading.id = "entropyTitle";
  heading.textContent = words.title;
  intro.textContent =
    data?.round?.manifest?.version === 2 ? words.v2 : words.legacy;
  box.replaceChildren(heading, intro);
  if (data?.round?.manifest?.version !== 2) return;
  const note = document.createElement("p");
  note.textContent = words.waiting;
  note.setAttribute("role", "status");
  box.append(note);
  const boundary = document.createElement("p");
  boundary.className = "muted";
  boundary.textContent = words.boundary;
  box.append(boundary);
  try {
    const id = data.round.id,
      r = await fetch("/api/round/" + encodeURIComponent(id) + "/entropy", {
        credentials: "omit",
        cache: "no-store",
      });
    if (!r.ok) throw Error("UNAVAILABLE");
    const result = await r.json();
    if (attempt !== generation) return;
    if (result.roundId !== id) throw Error("MISMATCH");
    if (!result.snapshot) return;
    const { snapshot, beaconTime } = result;
    const format = (value) =>
      new Intl.DateTimeFormat(language, {
        timeZone: "Asia/Shanghai",
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(value) + " (Asia/Shanghai)";
    const values = [
      format(snapshot.sealedAt),
      String(snapshot.beaconRound),
      format(beaconTime),
      snapshot.digest,
    ];
    const details = document.createElement("dl");
    details.className = "rule-grid";
    values.forEach((value, index) => {
      const item = document.createElement("div"),
        title = document.createElement("dt"),
        description = document.createElement("dd");
      title.textContent = words.fields[index];
      description.textContent = value;
      item.append(title, description);
      details.append(item);
    });
    note.replaceWith(details);
    const link = document.createElement("a");
    link.href = "/api/round/" + encodeURIComponent(id) + "/entropy";
    link.download = "entropy-" + id + ".json";
    link.textContent = words.download;
    box.insertBefore(link, boundary);
  } catch {
    if (attempt === generation) note.textContent = words.failed;
  }
}

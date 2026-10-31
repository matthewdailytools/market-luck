import {
  verifyWitness,
  witnessRecord,
  validateReveal,
} from "./commitment-verifier.js";
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
    data?.round?.manifest?.version === 3
      ? v3Copy[language]?.intro || v3Copy.en.intro
      : data?.round?.manifest?.version === 2
        ? words.v2
        : words.legacy;
  box.replaceChildren(heading, intro);
  if (data?.round?.manifest?.version === 3) {
    await renderV3(data, language, box, attempt);
    return;
  }
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

const v3Copy = {
  "zh-CN": {
    intro:
      "v3 在售前承诺隐藏的股票顺序与 256 位随机数；首次一致行情冻结后，由独立 Rekor 日志见证，再等待指定的未来信标。结算时揭晓秘密，逐项复算。",
    labels: [
      "秘密包 MD5（兼容指纹）",
      "秘密包 SHA-256（安全承诺）",
      "售前独立见证",
      "行情冻结独立见证",
      "固定信标轮次",
      "股票顺序（揭晓后）",
      "256 位随机数（揭晓后）",
    ],
    pending: "等待，尚未取得有效见证",
    hidden: "尚未揭晓",
    valid: "签名与包含证明通过",
    failed: "记录校验失败，请勿据此信任开奖结果",
    download: "下载承诺、见证与揭晓 JSON",
    boundary:
      "Rekor 独立保存签名日志；仍依赖其时钟和日志诚信。见证不保证行情真实，也不能强迫掌握根权限的人继续服务或揭晓。",
  },
  en: {
    intro:
      "v3 commits to a hidden stock order and 256-bit nonce before sales. Rekor independently witnesses the first frozen consensus before the fixed future beacon. Settlement reveals the package for reproduction.",
    labels: [
      "Secret MD5 (fingerprint)",
      "Secret SHA-256 (binding commitment)",
      "Independent presale witness",
      "Independent freeze witness",
      "Fixed beacon round",
      "Revealed stock order",
      "Revealed 256-bit nonce",
    ],
    pending: "Waiting for a valid witness",
    hidden: "Not revealed",
    valid: "Signature and inclusion verified",
    failed: "Verification failed; do not trust this result",
    download: "Download commitments, witnesses and reveal JSON",
    boundary:
      "Rekor is independently operated; its clock and log integrity remain trusted. Witnesses do not authenticate market truth or force an account owner to serve or reveal.",
  },
  ja: {
    intro:
      "v3 は販売前に非公開の銘柄順と256ビット乱数をコミットします。最初の一致相場を固定し、独立した Rekor 記録の後に指定の将来ビーコンを待ちます。精算時に秘密を公開して再計算します。",
    labels: [
      "秘密のMD5（指紋）",
      "秘密のSHA-256（コミットメント）",
      "販売前の独立記録",
      "相場固定の独立記録",
      "指定ビーコン回",
      "公開後の銘柄順",
      "公開後の256ビット乱数",
    ],
    pending: "有効な独立記録を待機中",
    hidden: "未公開",
    valid: "署名と包含証明を検証済み",
    failed: "検証失敗。この結果を信頼しないでください",
    download: "コミットメント・独立記録・公開内容のJSON",
    boundary:
      "Rekor は独立運営ですが、時計とログの誠実性に依存します。相場の真実性や運営者の継続・秘密公開は保証しません。",
  },
};
async function renderV3(data, language, box, attempt) {
  const w = v3Copy[language] || v3Copy.en,
    m = data.round.manifest,
    id = data.round.id;
  const details = document.createElement("dl");
  details.className = "rule-grid";
  box.append(details);
  const add = (label, text, href) => {
    const item = document.createElement("div"),
      dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = label;
    if (href) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = text;
      dd.append(a);
    } else dd.textContent = text;
    item.append(dt, dd);
    details.append(item);
  };
  add(w.labels[0], m.hidden?.md5 || w.failed);
  add(w.labels[1], m.hidden?.sha256 || w.failed);
  const note = document.createElement("p");
  note.setAttribute("role", "status");
  note.textContent = w.pending;
  box.append(note);
  const boundary = document.createElement("p");
  boundary.className = "muted";
  boundary.textContent = w.boundary;
  box.append(boundary);
  try {
    const [a, b] = await Promise.all(
      ["witnesses", "entropy"].map((p) =>
        fetch("/api/round/" + encodeURIComponent(id) + "/" + p, {
          credentials: "omit",
          cache: "no-store",
        }),
      ),
    );
    if (!a.ok || !b.ok) throw Error("UNAVAILABLE");
    const witnesses = await a.json(),
      entropy = await b.json();
    if (attempt !== generation) return;
    if (
      witnesses.roundId !== id ||
      entropy.roundId !== id ||
      witnesses.version !== 3 ||
      witnesses.commitment !== data.round.commitment
    )
      throw Error("MISMATCH");
    for (const [index, stage] of [
      [2, "presale"],
      [3, "freeze"],
    ]) {
      const receipt = witnesses.witnesses?.[stage];
      if (!receipt) {
        add(w.labels[index], w.pending);
        continue;
      }
      const checked = await verifyWitness(
        receipt,
        witnessRecord(
          {
            id,
            manifest: JSON.stringify(m),
            commitment: data.round.commitment,
          },
          stage,
          entropy.snapshot,
        ),
      );
      if (
        !checked ||
        (stage === "presale"
          ? checked.time < Math.floor(m.preparedAt / 1000) * 1000 ||
            checked.time + 1000 > m.cutoff
          : checked.time < m.ready ||
            checked.time + 1000 < entropy.snapshot?.sealedAt)
      )
        throw Error("INVALID_WITNESS");
      if (attempt !== generation) return;
      add(
        w.labels[index],
        w.valid + " · " + new Date(checked.time).toISOString(),
        checked.url,
      );
    }
    add(
      w.labels[4],
      entropy.snapshot?.beaconRound
        ? String(entropy.snapshot.beaconRound)
        : w.pending,
    );
    const revealed = witnesses.reveal
      ? validateReveal(witnesses.reveal, m)
      : null;
    add(w.labels[5], revealed ? revealed.order.join(" → ") : w.hidden);
    add(w.labels[6], revealed ? revealed.nonce : w.hidden);
    const link = document.createElement("a");
    link.href = "/api/round/" + encodeURIComponent(id) + "/witnesses";
    link.download = "witnesses-" + id + ".json";
    link.textContent = w.download;
    box.insertBefore(link, boundary);
    note.remove();
  } catch {
    if (attempt === generation) note.textContent = w.failed;
  }
}

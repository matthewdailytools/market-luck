import { readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { hash } from "../src/engine.js";
import {
  validateSnapshot,
  futureBeaconRound,
  beaconTime,
} from "../src/beacon.js";
import {
  verifyWitness,
  witnessRecord,
  assertV3ProductionTiming,
  validateV3Witnesses,
} from "../src/commitment.js";
import { verifyProof } from "../public/proof-verifier.js";
import { verifyPublication } from "../src/publication.js";

const id = (x) => typeof x === "string" && /^[A-Za-z0-9-]{1,80}$/.test(x);
const integer = (x) => Number.isSafeInteger(x) && x >= 0;
const digest = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const check = (v, message) => {
  if (!v) throw Error(message);
};
const json = (x) => JSON.stringify(x, null, 2) + "\n";
const stableFacts = (r) =>
  JSON.stringify({
    record: r.record,
    uuid: r.uuid,
    body: r.entry.body,
    integratedTime: r.entry.integratedTime,
    logID: r.entry.logID,
    logIndex: r.entry.logIndex,
  });
const kinds = new Set(["seed", "purchase", "prize"]);
function publicOnly(value) {
  if (typeof value === "string") {
    check(
      !/[?&](?:api_?key|api_token|access_token|token)=/i.test(value),
      "PRIVATE_ARCHIVE_URL_REFUSED",
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    check(
      !/^(password|salt|session|sessions|token|user_id|userId|request_key|accounts|tickets|privateKey|ciphertext|encryptedSecret|apiKey|api_key|raw|nonce)$/i.test(
        key,
      ),
      "PRIVATE_ARCHIVE_FIELD_REFUSED",
    );
    publicOnly(child);
  }
}
async function textResponse(response) {
  check(response.status === 200, "ARCHIVE_HTTP_" + response.status);
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2000000) {
        await reader.cancel();
        throw Error("ARCHIVE_RESPONSE_TOO_LARGE");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function diskStore(directory) {
  const root = resolve(directory);
  async function path(relative) {
    check(
      typeof relative === "string" &&
        /^[A-Za-z0-9_./-]+$/.test(relative) &&
        !relative.split("/").includes(".."),
      "UNSAFE_ARCHIVE_PATH",
    );
    const target = resolve(root, relative);
    check(target.startsWith(root + sep), "UNSAFE_ARCHIVE_PATH");
    await mkdir(root, { recursive: true });
    const relativeParts = target.slice(root.length + 1).split(sep);
    let cursor = root;
    for (const part of ["", ...relativeParts]) {
      if (part) cursor = resolve(cursor, part);
      try {
        check(
          !(await lstat(cursor)).isSymbolicLink(),
          "ARCHIVE_SYMLINK_REFUSED",
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    return target;
  }
  return {
    async read(relative) {
      const target = await path(relative);
      try {
        return await readFile(target, "utf8");
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async writeOnce(relative, value) {
      const target = await path(relative);
      await mkdir(dirname(target), { recursive: true });
      try {
        await writeFile(target, value, { flag: "wx" });
        return true;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        check(
          (await readFile(target)).equals(Buffer.from(value, "utf8")),
          "IMMUTABLE_ARCHIVE_CONFLICT: " + relative,
        );
        return false;
      }
    },
    async replace(relative, value) {
      const target = await path(relative);
      await mkdir(dirname(target), { recursive: true });
      const old = await this.read(relative);
      if (old === value) return false;
      await writeFile(target, value);
      return true;
    },
  };
}
export async function archiveInstallation({
  base,
  kind,
  store,
  fetcher = fetch,
  now = () => new Date().toISOString(),
  repository = "matthewdailytools/market-luck",
  runUrl = null,
  approvedOrigin = kind === "live"
    ? "https://luck.onlinefreetools.org"
    : "https://luck-test.onlinefreetools.org",
}) {
  check(["live", "demo"].includes(kind), "INVALID_ARCHIVE_KIND");
  const origin = new URL(base);
  check(
    origin.protocol === "https:" &&
      origin.origin === base &&
      base === approvedOrigin,
    "UNAPPROVED_ARCHIVE_ORIGIN",
  );
  check(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository),
    "INVALID_ARCHIVE_REPOSITORY",
  );
  const prefix = kind + "/",
    installation = kind === "live" ? "LIVE" : "DEMO";
  const priorIndexText = await store.read(prefix + "index.json"),
    priorIndex = priorIndexText ? JSON.parse(priorIndexText) : null;
  let changed = 0;
  const once = async (p, v) => {
    const result = await store.writeOnce(prefix + p, v);
    if (result) changed++;
    return result;
  };
  const get = async (path) =>
    textResponse(
      await fetcher(base + path, {
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      }),
    );
  const getJson = async (path) => JSON.parse(await get(path));
  async function pages(path, field, through) {
    let after = 0,
      first = null;
    const rows = [];
    for (let page = 0; page < 1000; page++) {
      const value = await getJson(
        path +
          "?after=" +
          after +
          (through === undefined ? "" : "&through=" + through),
      );
      check(
        value.installation === installation && Array.isArray(value[field]),
        "ARCHIVE_INSTALLATION_MISMATCH",
      );
      if (!first) first = value;
      if (field === "records") {
        if (through === undefined) through = value.through;
        check(value.through === through, "LEDGER_HEAD_CHANGED");
      }
      rows.push(...value[field]);
      check(rows.length <= 200000, "ARCHIVE_SCALE_LIMIT");
      if (value.nextAfter === null) return { first, rows };
      check(
        integer(value.nextAfter) && value.nextAfter > after,
        "INVALID_ARCHIVE_PAGINATION",
      );
      after = value.nextAfter;
    }
    throw Error("ARCHIVE_PAGE_LIMIT");
  }
  const ledger = await pages("/api/history/ledger", "records");
  check(
    integer(ledger.first.through) &&
      ledger.first.latestHead === ledger.first.through &&
      integer(ledger.first.pool) &&
      ledger.first.pool === ledger.first.poolAtHead,
    "POOL_HEAD_INCONSISTENT",
  );
  let balance = 0,
    lastId = 0;
  const normalizedLedger = [];
  for (const incoming of ledger.rows) {
    const row = {
      id: incoming.id,
      roundId: incoming.roundId,
      kind: incoming.kind,
      delta: incoming.delta,
      poolDelta: incoming.poolDelta,
      created: incoming.created,
    };
    check(
      Object.keys(incoming).sort().join(",") ===
        Object.keys(row).sort().join(","),
      "PRIVATE_ARCHIVE_FIELD_REFUSED",
    );
    check(
      Object.keys(row).sort().join(",") ===
        "created,delta,id,kind,poolDelta,roundId" &&
        integer(row.id) &&
        row.id > lastId &&
        row.id <= ledger.first.through &&
        integer(row.created) &&
        kinds.has(row.kind) &&
        Number.isSafeInteger(row.delta) &&
        Number.isSafeInteger(row.poolDelta),
      "INVALID_PUBLIC_LEDGER",
    );
    check(
      row.kind === "seed"
        ? row.roundId === null && row.delta > 0
        : id(row.roundId) &&
            (row.kind === "purchase" ? row.delta < 0 : row.delta > 0),
      "INVALID_LEDGER_EVENT",
    );
    check(
      row.poolDelta === (row.kind === "seed" ? row.delta : -row.delta),
      "LEDGER_DIRECTION_MISMATCH",
    );
    balance += row.poolDelta;
    check(integer(balance), "POOL_BALANCE_INVALID");
    lastId = row.id;
    normalizedLedger.push(row);
    await once(
      `ledger/${String(Math.floor(row.id / 1000)).padStart(4, "0")}/${String(row.id).padStart(12, "0")}.json`,
      json(row),
    );
  }
  check(balance === ledger.first.poolAtHead, "POOL_CONSERVATION_FAILED");
  if (priorIndex) {
    check(
      ledger.first.through >= priorIndex.ledgerThrough,
      "LEDGER_HEAD_REGRESSION",
    );
    check(
      hash(
        JSON.stringify(
          normalizedLedger.filter((r) => r.id <= priorIndex.ledgerThrough),
        ),
      ) === priorIndex.ledgerDigest,
      "IMMUTABLE_LEDGER_PREFIX_CONFLICT",
    );
  }
  const listing = await pages("/api/history/rounds", "rounds");
  const index = [];
  const seen = new Set();
  for (const item of listing.rows) {
    check(
      id(item.id) &&
        !seen.has(item.id) &&
        digest(item.commitment) &&
        [1, 2, 3].includes(item.version),
      "INVALID_ARCHIVE_ROUND",
    );
    seen.add(item.id);
    const folder = item.id + "/",
      raw = await get("/api/round/" + item.id + "/manifest"),
      manifest = JSON.parse(raw);
    publicOnly(manifest);
    check(
      hash(raw) === item.commitment &&
        manifest.id === item.id &&
        manifest.mode === installation &&
        manifest.version === item.version,
      "ARCHIVE_MANIFEST_MISMATCH",
    );
    const round = { id: item.id, manifest: raw, commitment: item.commitment };
    let detail = await getJson("/api/round/" + item.id),
      entropy = await getJson("/api/round/" + item.id + "/entropy");
    const evidence = await getJson("/api/round/" + item.id + "/witnesses");
    check(
      entropy.roundId === item.id &&
        entropy.version === manifest.version &&
        evidence.roundId === item.id &&
        evidence.version === manifest.version &&
        evidence.commitment === item.commitment,
      "ARCHIVE_RECORD_ID_MISMATCH",
    );
    check(
      detail.round?.id === item.id &&
        detail.round.commitment === item.commitment &&
        JSON.stringify(detail.round.manifest) === raw,
      "ARCHIVE_DETAIL_MISMATCH",
    );
    if (installation === "LIVE") {
      check(
        detail.round.cutoff === manifest.cutoff &&
          detail.round.ready === manifest.ready,
        "ARCHIVE_CLOCK_MISMATCH",
      );
      check(
        detail.anchor?.verified_hash === item.commitment,
        "ARCHIVE_ANCHOR_REQUIRED",
      );
      await verifyPublication(
        detail.anchor.url,
        item.commitment,
        repository,
        fetcher,
      );
    }
    if (manifest.version === 3) assertV3ProductionTiming(manifest);
    await once(folder + "manifest.json", raw);
    if (detail.anchor)
      await once(
        folder + "anchor.json",
        json({
          round_id: detail.anchor.round_id,
          url: detail.anchor.url,
          published: detail.anchor.published,
          verified_hash: detail.anchor.verified_hash,
          verified_at: detail.anchor.verified_at,
        }),
      );
    let snapshot = entropy.snapshot,
      proofHash = null;
    if (evidence.witnesses?.freeze && !snapshot) {
      entropy = await getJson("/api/round/" + item.id + "/entropy");
      snapshot = entropy.snapshot;
    }
    const previousText = await store.read(prefix + folder + "index.json"),
      previous = previousText ? JSON.parse(previousText) : null;
    let freezeObserved = previous?.freezeObservedAt || null;
    if (snapshot) {
      validateSnapshot(snapshot, manifest, {
        allowUnwitnessed: manifest.version === 3,
      });
      await once(folder + "snapshot-payload.json", snapshot.payload);
      await once(
        folder + "snapshot.json",
        json({ digest: snapshot.digest, sealedAt: snapshot.sealedAt }),
      );
      if (!freezeObserved) freezeObserved = now();
    }
    if (manifest.version < 3)
      check(
        Object.keys(evidence.witnesses || {}).length === 0 &&
          evidence.reveal === null,
        "UNEXPECTED_LEGACY_WITNESS",
      );
    if (manifest.version === 3) {
      check(Boolean(evidence.witnesses?.presale), "PRESALE_WITNESS_MISSING");
      for (const stage of ["presale", "freeze"]) {
        const receipt = evidence.witnesses[stage];
        if (!receipt) {
          check(
            !(await store.read(prefix + folder + "witness-" + stage + ".json")),
            "ARCHIVE_WITNESS_DISAPPEARED",
          );
          continue;
        }
        publicOnly(receipt);
        const record = witnessRecord(round, stage, snapshot),
          verified = await verifyWitness(receipt, record);
        check(verified, "ARCHIVE_WITNESS_INVALID");
        if (stage === "presale")
          check(
            verified.time >= Math.floor(manifest.preparedAt / 1000) * 1000 &&
              verified.time + 1000 <= manifest.cutoff,
            "ARCHIVE_PRESALE_TIME_INVALID",
          );
        if (stage === "freeze") {
          check(
            snapshot &&
              verified.time >= manifest.ready &&
              verified.time + 1000 >= snapshot.sealedAt,
            "ARCHIVE_FREEZE_TIME_INVALID",
          );
          const derived = {
            ...snapshot,
            witnessedAt: verified.time + 1000,
            beaconRound: futureBeaconRound(verified.time + 1000),
          };
          if (snapshot.beaconRound !== null)
            check(
              snapshot.beaconRound === derived.beaconRound &&
                snapshot.witnessedAt === derived.witnessedAt,
              "ARCHIVE_TARGET_MISMATCH",
            );
          snapshot = derived;
        }
        const name = folder + "witness-" + stage + ".json",
          old = await store.read(prefix + name);
        if (old) {
          const first = JSON.parse(old);
          check(
            (await verifyWitness(first, record)) &&
              stableFacts(first) === stableFacts(receipt),
            "IMMUTABLE_WITNESS_CONFLICT",
          );
        } else await once(name, json(receipt));
        await once(folder + "record-" + stage + ".json", record);
      }
      if (evidence.witnesses.freeze)
        await validateV3Witnesses(round, snapshot, evidence.witnesses);
      if (snapshot?.beaconRound !== null && snapshot?.beaconRound !== undefined)
        check(Boolean(evidence.witnesses.freeze), "ARCHIVE_WITNESS_MISSING");
    }
    if (evidence.reveal !== null && detail.round.status !== "settled")
      detail = await getJson("/api/round/" + item.id);
    check(
      ["open", "paused", "settled"].includes(detail.round.status),
      "INVALID_ARCHIVE_STATUS",
    );
    if (detail.round.status === "settled") {
      const proofText = await get("/api/proof/" + item.id),
        proof = JSON.parse(proofText);
      publicOnly(proof);
      check(
        JSON.stringify(proof) === JSON.stringify(detail.round.proof),
        "ARCHIVE_PROOF_COPY_MISMATCH",
      );
      check(
        installation === "DEMO"
          ? proof.simulatedClock === true
          : proof.execution === "LIVE_REAL_CLOCK" &&
              proof.simulatedClock !== true,
        "ARCHIVE_REPLAY_MIXUP",
      );
      const result = await verifyProof(proof, {
        roundId: item.id,
        manifest,
        commitment: item.commitment,
      });
      check(result.ok, "ARCHIVE_PROOF_INVALID: " + result.errors.join(","));
      if (manifest.version === 3) {
        check(evidence.reveal === proof.reveal, "ARCHIVE_REVEAL_MISMATCH");
        await once(folder + "reveal.json", proof.reveal);
      }
      proofHash = hash(proofText);
      await once(folder + "proof.json", proofText);
      await once(
        folder + "settlement.json",
        json({
          round: item.id,
          proofSha256: proofHash,
          poolBefore: proof.poolBefore,
          payout: proof.payout,
          poolAfter: proof.poolAfter,
        }),
      );
    } else check(evidence.reveal === null, "PREMATURE_PUBLIC_REVEAL");
    if (previous) {
      check(!previous.hasSnapshot || snapshot, "ARCHIVE_SNAPSHOT_DISAPPEARED");
      check(!previous.hasProof || proofHash, "ARCHIVE_PROOF_DISAPPEARED");
      check(
        !["paused", "settled"].includes(previous.status) ||
          detail.round.status === previous.status,
        "ARCHIVE_STATUS_REGRESSION",
      );
    }
    const state = {
      round: item.id,
      version: manifest.version,
      status: detail.round.status,
      commitment: item.commitment,
      cutoff: detail.round.cutoff,
      ready: detail.round.ready,
      snapshot: snapshot
        ? {
            digest: snapshot.digest,
            sealedAt: snapshot.sealedAt,
            witnessedAt: snapshot.witnessedAt ?? null,
            beaconRound: snapshot.beaconRound,
          }
        : null,
      proofSha256: proofHash,
    };
    const stateText = json(state),
      stateHash = hash(stateText);
    await once(folder + "states/" + stateHash + ".json", stateText);
    const descriptor = {
      version: 1,
      kind,
      round: item.id,
      manifestSha256: item.commitment,
      firstObservedAt: previous?.firstObservedAt || now(),
      lastChangedAt:
        previous?.stateSha256 === stateHash ? previous.lastChangedAt : now(),
      freezeObservedAt: freezeObserved,
      stateSha256: stateHash,
      status: state.status,
      algorithm: manifest.version,
      hasSnapshot: Boolean(snapshot),
      hasProof: Boolean(proofHash),
      originalPresaleAnchor: detail.anchor?.url || null,
      observation: "post-publication mirror; not a new presale attestation",
      run: previous?.stateSha256 === stateHash ? previous.run : runUrl,
    };
    if (await store.replace(prefix + folder + "index.json", json(descriptor)))
      changed++;
    const evidenceLinks = [
      `- [原始规则字节](manifest.json) · SHA-256: ${item.commitment}`,
      ...(detail.anchor
        ? [
            `- [原售前固定提交](${detail.anchor.url})（与本目录补档时间分别核对）`,
          ]
        : []),
      ...(snapshot
        ? [
            "- [冻结输入原字节](snapshot-payload.json) · [冻结元数据](snapshot.json)",
          ]
        : []),
      ...["presale", "freeze"]
        .filter((s) => evidence.witnesses?.[s])
        .map(
          (s) =>
            `- [${s === "presale" ? "售前" : "冻结"}独立见证](witness-${s}.json) · [外部日志](https://rekor.sigstore.dev/api/v1/log/entries/${evidence.witnesses[s].uuid})`,
        ),
      ...(proofHash
        ? ["- [原始开奖证明](proof.json) · [奖池结算汇总](settlement.json)"]
        : ["- 尚无最终开奖证明；本档案不预测号码。"]),
      ...(manifest.version === 3 && proofHash
        ? ["- [已揭晓的秘密包原字节](reveal.json)"]
        : []),
    ];
    const readable = [
      `# ${installation} 期次 ${item.id}`,
      "",
      `算法：v${manifest.version}；当前观察状态：${detail.round.status}。`,
      "",
      `首次观察：${descriptor.firstObservedAt}。该时间是公开后的镜像观察时间，不追溯为售前见证。`,
      "",
      ...evidenceLinks,
      "",
      `[在线可读核验](${base}/verify.html?round=${item.id}) · [机器索引](index.json) · [状态事件](states/)`,
      "",
      "GitHub 提供公开历史托管，不认证开奖公平性。请保存 commit SHA，并分别核对原售前承诺、Rekor 签名与归档提交时间。",
    ];
    if (
      await store.replace(
        prefix + folder + "README.md",
        readable.join("\n") + "\n",
      )
    )
      changed++;
    index.push(descriptor);
  }
  for (const old of priorIndex?.rounds || [])
    check(seen.has(old.round), "ARCHIVE_ROUND_DISAPPEARED");
  const summary = {
    version: 1,
    installation,
    origin: base,
    ledgerThrough: ledger.first.through,
    ledgerDigest: hash(JSON.stringify(normalizedLedger)),
    poolAtLedgerHead: balance,
    publicLedgerRecords: ledger.rows.length,
    rounds: index,
  };
  if (await store.replace(prefix + "index.json", json(summary))) changed++;
  const lines = [
    `# ${installation} 公开核心档案`,
    "",
    "这是公开后的观察镜像。原售前承诺、独立日志和本次归档时间须分别核对；GitHub 托管不构成公平性认证。账户和私人票据不在此目录。",
    "",
    `奖池（流水上界 ${summary.ledgerThrough}）：${balance} 积分。公开流水 ${ledger.rows.length} 条。`,
    "",
    "|期号|版本|状态|档案|",
    "|---|---|---|---|",
    ...index.map(
      (r) =>
        `|${r.round}|v${r.algorithm}|${r.status}|[核验档案](${r.round}/README.md)|`,
    ),
  ];
  if (await store.replace(prefix + "README.md", lines.join("\n") + "\n"))
    changed++;
  return {
    status: "passed",
    installation,
    rounds: index.length,
    ledgerRecords: ledger.rows.length,
    poolAtHead: balance,
    ledgerThrough: ledger.first.through,
    changed,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const store = diskStore("history"),
    repository =
      process.env.GITHUB_REPOSITORY || "matthewdailytools/market-luck";
  const origins = [
    [
      "live",
      process.env.ARCHIVE_LIVE_ORIGIN || "https://luck.onlinefreetools.org",
    ],
  ];
  if (process.env.ARCHIVE_INCLUDE_DEMO === "true")
    origins.push([
      "demo",
      process.env.ARCHIVE_DEMO_ORIGIN ||
        "https://luck-test.onlinefreetools.org",
    ]);
  for (const [kind, base] of origins)
    console.log(
      JSON.stringify(
        await archiveInstallation({
          base,
          kind,
          store,
          repository,
          approvedOrigin: base,
          runUrl: process.env.GITHUB_RUN_ID
            ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
            : null,
        }),
      ),
    );
}

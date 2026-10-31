const kinds = "('seed','purchase','prize')";
const cursor = (url, key, optional = false) => {
  const raw = url.searchParams.get(key);
  if (raw === null) return optional ? null : 0;
  if (!/^(0|[1-9][0-9]{0,15})$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw Error("INVALID_HISTORY_CURSOR");
  return Number(raw);
};
export function archiveInfo(env, round) {
  if (env.INSTALLATION_KIND === "ONLINE_REPLAY") return null;
  const repository =
    env.COMMITMENT_REPOSITORY || "matthewdailytools/market-luck";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return null;
  const kind = JSON.parse(round.manifest).mode === "DEMO" ? "demo" : "live";
  return {
    repository,
    kind,
    url: `https://github.com/${repository}/tree/main/history/${kind}/${round.id}`,
    asynchronous: true,
  };
}
export async function publicHistory(env, url, now = Date.now()) {
  const installation =
    env.INSTALLATION_KIND === "ONLINE_REPLAY"
      ? "ONLINE_REPLAY"
      : env.DEMO_MODE === "true"
        ? "DEMO"
        : "LIVE";
  const after = cursor(url, "after"),
    q = (s, ...a) => env.DB.prepare(s).bind(...a);
  if (url.pathname === "/api/history/rounds") {
    const rows = (
      await q(
        "SELECT rowid AS sequence,id,status,commitment,cutoff,ready,json_extract(manifest,'$.version') AS version FROM rounds WHERE status!='draft' AND rowid>? ORDER BY rowid LIMIT 101",
        after,
      ).all()
    ).results;
    return {
      installation,
      serverTime: now,
      rounds: rows.slice(0, 100),
      nextAfter: rows.length > 100 ? rows[99].sequence : null,
    };
  }
  const through = cursor(url, "through", true);
  if (through !== null && after > through)
    throw Error("INVALID_HISTORY_CURSOR");
  const boundary = `COALESCE(?,(SELECT MAX(id) FROM ledger WHERE kind IN ${kinds}))`;
  const results = await env.DB.batch([
    q(
      `SELECT MAX(id) AS latestHead,COALESCE(?,MAX(id)) AS through FROM ledger WHERE kind IN ${kinds}`,
      through,
    ),
    q("SELECT balance FROM pool WHERE id=1"),
    q(
      `SELECT id,round_id AS roundId,kind,delta,CASE WHEN kind='seed' THEN delta ELSE -delta END AS poolDelta,created FROM ledger WHERE kind IN ${kinds} AND id>? AND id<=${boundary} ORDER BY id LIMIT 201`,
      after,
      through,
    ),
    q(
      `SELECT COALESCE(SUM(CASE WHEN kind='seed' THEN delta ELSE -delta END),0) AS poolAtHead FROM ledger WHERE kind IN ${kinds} AND id<=${boundary}`,
      through,
    ),
  ]);
  const meta = results[0].results[0];
  if (meta.through > meta.latestHead) throw Error("INVALID_HISTORY_CURSOR");
  const rows = results[2].results;
  return {
    installation,
    serverTime: now,
    through: meta.through,
    latestHead: meta.latestHead,
    pool: results[1].results[0].balance,
    poolAtHead: results[3].results[0].poolAtHead,
    records: rows.slice(0, 200),
    nextAfter: rows.length > 200 ? rows[199].id : null,
  };
}

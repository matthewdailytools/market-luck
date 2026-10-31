import { makeWitnessIntent, submitWitness, witnessHash } from "./witness.js";
import { witnessRecord, assertV3Policy } from "./commitment.js";
export async function witnessOnServer(env, receipt, record, intent) {
  if (!env.BEACON_VERIFIER) throw Error("WITNESS_VERIFIER_UNAVAILABLE");
  return env.BEACON_VERIFIER.getByName("quicknet-v1").verifyWitness(
    receipt,
    record,
    intent,
  );
}
export async function readWitnesses(env, id) {
  const rows = (
    await env.DB.prepare(
      "SELECT stage,receipt FROM witness_receipts WHERE round_id=?",
    )
      .bind(id)
      .all()
  ).results;
  return Object.fromEntries(rows.map((r) => [r.stage, JSON.parse(r.receipt)]));
}
export async function ensureWitness(
  env,
  round,
  stage,
  snapshot,
  fetcher = fetch,
) {
  const m = JSON.parse(round.manifest);
  assertV3Policy(m);
  const record = witnessRecord(round, stage, snapshot),
    q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  let intent = await q(
    "SELECT record,body FROM witness_intents WHERE round_id=? AND stage=?",
    round.id,
    stage,
  ).first();
  if (!intent) {
    const body = await makeWitnessIntent(record);
    await q(
      "INSERT INTO witness_intents(round_id,stage,record,body) VALUES(?,?,?,?) ON CONFLICT(round_id,stage) DO NOTHING",
      round.id,
      stage,
      record,
      body,
    ).run();
    intent = await q(
      "SELECT record,body FROM witness_intents WHERE round_id=? AND stage=?",
      round.id,
      stage,
    ).first();
  }
  if (intent.record !== record) throw Error("WITNESS_INTENT_MISMATCH");
  const verifier = (r, s, i) => witnessOnServer(env, r, s, i);
  let receipt = (await readWitnesses(env, round.id))[stage];
  if (!receipt)
    receipt = await submitWitness(record, intent.body, fetcher, verifier);
  const verified = await verifier(receipt, record, intent.body);
  if (
    !verified ||
    (stage === "presale"
      ? verified.time < Math.floor(m.preparedAt / 1000) * 1000 ||
        verified.time + 1000 > m.cutoff
      : verified.time + 1000 < snapshot.sealedAt || verified.time < m.ready)
  )
    throw Error("WITNESS_TIME_MISMATCH");
  const text = JSON.stringify(receipt);
  await env.EVIDENCE.put(
    `witness/${round.id}/${stage}/${witnessHash(text)}.json`,
    text,
    { httpMetadata: { contentType: "application/json" } },
  );
  await q(
    "INSERT INTO witness_receipts(round_id,stage,receipt,witnessed_at) VALUES(?,?,?,?) ON CONFLICT(round_id,stage) DO NOTHING",
    round.id,
    stage,
    text,
    verified.time + 1000,
  ).run();
  const stored = (await readWitnesses(env, round.id))[stage];
  if (
    stored.uuid !== receipt.uuid ||
    stored.entry.integratedTime !== receipt.entry.integratedTime ||
    !(await verifier(stored, record, intent.body))
  )
    throw Error("WITNESS_RECEIPT_CHANGED");
  return stored;
}
export async function v3GuardsReady(env) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('secret_no_update','intent_no_update','receipt_no_update','reveal_no_update','v3_open_guard','v3_settlement_guard')",
  ).first();
  return row?.n === 6;
}

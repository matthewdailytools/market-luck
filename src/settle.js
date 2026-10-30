import { evidence, tier, hash } from "./engine.js";
export async function settle(env, round, prices, metadata = {}) {
  const q = (s, ...a) => env.DB.prepare(s).bind(...a);
  const existing = await q(
    "SELECT proof FROM rounds WHERE id=?",
    round.id,
  ).first();
  if (existing?.proof) return JSON.parse(existing.proof);
  if (Date.now() < round.cutoff || Date.now() < round.ready)
    throw Error("MARKETS_NOT_FINAL");
  const proof = {
    ...evidence(round, prices),
    ...metadata,
    mode: JSON.parse(round.manifest).mode,
  };
  const tickets = (
    await q("SELECT * FROM tickets WHERE round_id=?", round.id).all()
  ).results;
  const balance = (await q("SELECT balance FROM pool WHERE id=1").first())
    .balance;
  const catalog = JSON.parse(round.manifest).games;
  const graded = tickets.map((t) => ({
    ...t,
    rank: tier(
      { main: JSON.parse(t.numbers), bonus: t.bonus },
      proof.results[t.game],
      catalog.find((g) => g.id === t.game),
    ),
  }));
  const counts = [1, 2, 3].map(
    (n) => graded.filter((t) => t.rank === n).length,
  );
  const shares = [50, 30, 20].map((n, i) =>
    counts[i] ? Math.floor(Math.floor((balance * n) / 100) / counts[i]) : 0,
  );
  proof.poolBefore = balance;
  proof.payout = graded.reduce(
    (a, t) => a + (t.rank ? shares[t.rank - 1] : 0),
    0,
  );
  proof.poolAfter = balance - proof.payout;
  // Content-addressed evidence avoids concurrent retries overwriting another committed proof.
  const key = `${round.id}/${hash(JSON.stringify(proof))}.json`;
  proof.evidenceKey = key;
  await env.EVIDENCE.put(key, JSON.stringify(proof, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
  const payments = JSON.stringify(
    graded.map((t) => ({
      id: t.id,
      prize: t.rank ? shares[t.rank - 1] : 0,
      tier: t.rank,
    })),
  );
  const ops = [
    q("INSERT INTO settlements(round_id) VALUES(?)", round.id),
    q(
      "UPDATE rounds SET status='settled',proof=? WHERE id=? AND status='open'",
      JSON.stringify(proof),
      round.id,
    ),
    q(
      "WITH payments AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.prize') AS prize,json_extract(value,'$.tier') AS tier FROM json_each(?)) UPDATE tickets SET prize=(SELECT prize FROM payments WHERE payments.id=tickets.id),tier=(SELECT tier FROM payments WHERE payments.id=tickets.id) WHERE round_id=?",
      payments,
      round.id,
    ),
  ];
  try {
    await env.DB.batch(ops);
  } catch (err) {
    const row = await q(
      "SELECT proof FROM rounds WHERE id=?",
      round.id,
    ).first();
    if (row?.proof) return JSON.parse(row.proof);
    throw err;
  }
  return proof;
}

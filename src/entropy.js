import {
  RANDOMNESS_POLICY,
  assertRandomnessPolicy,
  futureBeaconRound,
  beaconTime,
  snapshotPayload,
  validateSnapshot,
  digest,
} from "./beacon.js";

export const BEACON_VECTOR = Object.freeze({
  round: 1000,
  randomness:
    "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd",
  signature:
    "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39",
});
export async function verifyOnServer(env, beacon, round) {
  if (!env.BEACON_VERIFIER) throw Error("BEACON_VERIFIER_UNAVAILABLE");
  return (
    (await env.BEACON_VERIFIER.getByName("quicknet-v1").verify(
      beacon,
      round,
    )) === true
  );
}
export async function readSnapshot(env, id) {
  const row = await env.DB.prepare(
    "SELECT payload,digest,sealed_at FROM entropy_snapshots WHERE round_id=?",
  )
    .bind(id)
    .first();
  return row
    ? {
        payload: row.payload,
        digest: row.digest,
        sealedAt: row.sealed_at,
        beaconRound: futureBeaconRound(row.sealed_at),
      }
    : null;
}
export async function freezeSnapshot(env, round, prices, sources) {
  const manifest = JSON.parse(round.manifest);
  assertRandomnessPolicy(manifest);
  const payload = snapshotPayload(round, prices, sources);
  await env.DB.prepare(
    "INSERT INTO entropy_snapshots(round_id,payload,digest) VALUES(?,?,?) ON CONFLICT(round_id) DO NOTHING",
  )
    .bind(round.id, payload, digest(payload))
    .run();
  const snapshot = await readSnapshot(env, round.id);
  validateSnapshot(snapshot, manifest);
  return snapshot;
}
export async function fetchBeacon(
  env,
  snapshot,
  fetcher = fetch,
  now = Date.now(),
) {
  const round = snapshot.beaconRound;
  if (now < beaconTime(round)) throw Error("WAITING_FOR_FUTURE_BEACON");
  for (const host of ["https://api.drand.sh", "https://drand.cloudflare.com"]) {
    try {
      const r = await fetcher(
        `${host}/${RANDOMNESS_POLICY.chainHash}/public/${round}`,
        { redirect: "manual", signal: AbortSignal.timeout(12000) },
      );
      if (r.status !== 200) continue;
      const raw = await r.text();
      if (raw.length > 4096) continue;
      const value = JSON.parse(raw);
      const beacon = {
        round: value.round,
        signature: value.signature,
        randomness: value.randomness,
      };
      if (await verifyOnServer(env, beacon, round)) return beacon;
    } catch {}
  }
  throw Error("BEACON_UNAVAILABLE_OR_INVALID");
}

import { games, hash } from "./engine.js";
import { collectMarketData } from "./market-data.js";
import { settle } from "./settle.js";
import { publicConsensus } from "./public-market-data.js";
import {
  RANDOMNESS_POLICY,
  assertRandomnessPolicy,
  validateSnapshot,
} from "./beacon.js";
import { readSnapshot, freezeSnapshot, fetchBeacon } from "./entropy.js";
import { recordGuardsReady } from "./record-guards.js";
import {
  prepareCommitment,
  decryptSecret,
  validateReveal,
  validateV3Witnesses,
} from "./commitment.js";
import {
  ensureWitness,
  readWitnesses,
  witnessOnServer,
  v3GuardsReady,
} from "./witness-store.js";
import { beaconTime } from "./beacon.js";
export function prepareLiveRound(body, now = Date.now()) {
  if (body?.version !== undefined && body.version !== 3)
    throw Error("NEW_ROUNDS_REQUIRE_V3");
  if (body?.sourceProfile && body.sourceProfile !== "PUBLIC-NOKEY-v1")
    throw Error("V3_REQUIRES_PUBLIC_SOURCE_PROFILE");
  if (
    [
      "secret",
      "hidden",
      "order",
      "nonce",
      "randomness",
      "witness",
      "reveal",
    ].some((k) => body?.[k] !== undefined)
  )
    throw Error("ADMIN_SECRET_OVERRIDE_FORBIDDEN");
  return prepareCommitment(liveManifest(body, now));
}
export const prepareLiveManifest = (body, now = Date.now()) =>
  prepareLiveRound(body, now).manifest;
// Compatibility constructor for already committed v2 fixtures; never exposed by prepare API.
export function prepareV2Manifest(body, now = Date.now()) {
  if (body?.version !== undefined && body.version !== 2)
    throw Error("NEW_ROUNDS_REQUIRE_V2");
  if (body?.sourceProfile && body.sourceProfile !== "PUBLIC-NOKEY-v1")
    throw Error("V2_REQUIRES_PUBLIC_SOURCE_PROFILE");
  return {
    ...liveManifest(body, now),
    version: 2,
    randomness: { ...RANDOMNESS_POLICY },
  };
}
import {
  sessionFor,
  assertLockedRound,
  CALENDAR_VERSION,
  CONFIRMATION_MS,
} from "./calendar.js";
export function liveManifest(b, now = Date.now()) {
  if (
    !b ||
    !Array.isArray(b.markets) ||
    b.markets.length < 2 ||
    b.markets.length > 3 ||
    !Number.isSafeInteger(b.cutoff) ||
    b.cutoff < now + 3600000
  )
    throw Error("INVALID_MANIFEST");
  const tickers = new Set();
  const preparedMarkets = [];
  const profile = b.sourceProfile || "PUBLIC-NOKEY-v1";
  if (!["PUBLIC-NOKEY-v1", "KEYED-v1"].includes(profile))
    throw Error("INVALID_SOURCE_PROFILE");
  for (const m of b.markets) {
    const ticker =
      typeof m?.symbol === "string" ? m.symbol.split(":")[1] : undefined;
    const mapping = {
      symbol: `${ticker === "IBM" ? "XNYS" : "XNAS"}:${ticker}`,
      eodhd: `${ticker}.US`,
      alpha: ticker,
      twelve: ticker,
      exchange: ticker === "IBM" ? "NYSE" : "NASDAQ",
    };
    if (
      !["AAPL", "MSFT", "IBM"].includes(ticker) ||
      m.symbol !== mapping.symbol ||
      tickers.has(ticker) ||
      m.currency !== "USD" ||
      m.scale !== 2 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(m.date) ||
      ["eodhd", "alpha", "twelve", "exchange"].some(
        (field) => m[field] !== undefined && m[field] !== mapping[field],
      )
    )
      throw Error("INVALID_MARKET");
    const session = sessionFor(m.date);
    if (
      b.cutoff > session.cutoff ||
      now >= session.cutoff ||
      (m.openUTC !== undefined && m.openUTC !== session.openUTC) ||
      (m.closeUTC !== undefined && m.closeUTC !== session.closeUTC)
    )
      throw Error("CALENDAR_MISMATCH");
    tickers.add(ticker);
    preparedMarkets.push({
      symbol: mapping.symbol,
      date: m.date,
      currency: m.currency,
      scale: m.scale,
      openUTC: session.openUTC,
      closeUTC: session.closeUTC,
      eodhd: mapping.eodhd,
      alpha: mapping.alpha,
      twelve: mapping.twelve,
      exchange: mapping.exchange,
    });
  }
  const delay = CONFIRMATION_MS;
  return {
    version: 1,
    id: crypto.randomUUID(),
    mode: "LIVE",
    price: 10,
    games,
    cutoff: b.cutoff,
    ready: Math.max(...preparedMarkets.map((m) => m.closeUTC)) + delay,
    sourceProfile: profile,
    calendarVersion: CALENDAR_VERSION,
    preparedAt: now,
    sources:
      profile === "PUBLIC-NOKEY-v1"
        ? ["YahooFinance", "Nasdaq"]
        : ["EODHD", "AlphaVantage", "TwelveData"],
    quorum: 2,
    conflict: "any-valid-disagreement-waits",
    confirmationDelayMs: delay,
    markets: preparedMarkets,
    payout: [50, 30, 20],
    missing: "wait",
    calendar: "pinned-NYSE-Nasdaq-2026-calendar",
  };
}
export async function collectAndSettle(
  env,
  round,
  fetcher = fetch,
  now = Date.now(),
) {
  if (round.status === "settled" && round.proof) return JSON.parse(round.proof);
  const m = JSON.parse(round.manifest);
  if (hash(round.manifest) !== round.commitment)
    throw Error("COMMITMENT_MISMATCH");
  assertLockedRound(round, now, { forCollection: true });
  if (![1, 2, 3].includes(m.version))
    throw Error("UNSUPPORTED_ALGORITHM_VERSION");
  if (m.version === 3) return collectV3(env, round, fetcher, now);
  let snapshot = null;
  if (m.version === 2) {
    if (!(await recordGuardsReady(env)))
      throw Error("RECORD_GUARDS_UNAVAILABLE");
    assertRandomnessPolicy(m);
    snapshot = await readSnapshot(env, round.id);
    if (snapshot) {
      const frozen = validateSnapshot(snapshot, m);
      const beacon = await fetchBeacon(env, snapshot, fetcher, now);
      return settle(
        env,
        round,
        frozen.prices,
        {
          snapshot,
          beacon,
          sources: frozen.sources,
          observedAt: new Date(now).toISOString(),
          execution:
            env.INSTALLATION_KIND === "ONLINE_REPLAY"
              ? "ONLINE_REPLAY_SIMULATED_CLOCK"
              : "LIVE_REAL_CLOCK",
          dataNote:
            "First consensus snapshot frozen before the fixed future quicknet beacon.",
        },
        now,
      );
    }
  }
  let data;
  if (m.sourceProfile === "PUBLIC-NOKEY-v1") {
    if (m.sources.join(",") !== "YahooFinance,Nasdaq" || m.quorum !== 2)
      throw Error("INVALID_SOURCE_PROFILE");
    const archives = [],
      prices = [];
    for (const p of m.markets) {
      const r = await publicConsensus(
        p.symbol.split(":")[1],
        p.date,
        fetcher,
        now,
      );
      if (!r.ok) throw Error(r.reason);
      prices.push({
        symbol: p.symbol,
        date: p.date,
        currency: p.currency,
        scale: p.scale,
        close: r.closeMinorUnits,
      });
      archives.push({
        symbol: p.symbol,
        sources: r.observations.map((o) => ({
          ...o,
          close: o.closeMinorUnits,
        })),
        failures: r.unavailable,
      });
    }
    data = {
      prices,
      archives,
      note: "Yahoo Finance close (split-adjusted historical series, not adjclose) and Nasdaq Close/Last must agree exactly at declared precision; dated snapshots after the confirmation window. Not exchange-signed finality.",
    };
  } else data = await collectMarketData(m, env, fetcher);
  const observedAt = new Date(now).toISOString();
  for (const archive of data.archives)
    for (const source of archive.sources)
      await env.EVIDENCE.put(
        `raw/${round.id}/${archive.symbol}/${source.provider}/${source.sha256}.json`,
        source.raw,
      );
  const sources = data.archives.map((a) => ({
    symbol: a.symbol,
    sources: a.sources.map(({ raw, ...rest }) => rest),
    failures: a.failures || [],
  }));
  let entropy = {};
  if (m.version === 2) {
    snapshot = await freezeSnapshot(env, round, data.prices, sources);
    const frozen = validateSnapshot(snapshot, m);
    const beacon = await fetchBeacon(env, snapshot, fetcher, now);
    // The first persisted snapshot wins even when collectors raced with differing quotes.
    data.prices = frozen.prices;
    sources.splice(0, sources.length, ...frozen.sources);
    entropy = { snapshot, beacon };
  }
  return settle(
    env,
    round,
    data.prices,
    {
      ...entropy,
      observedAt,
      execution:
        env.INSTALLATION_KIND === "ONLINE_REPLAY"
          ? "ONLINE_REPLAY_SIMULATED_CLOCK"
          : "LIVE_REAL_CLOCK",
      sources,
      dataNote: data.note,
    },
    now,
  );
}

async function collectV3(env, round, fetcher, now) {
  const m = JSON.parse(round.manifest);
  if (!(await recordGuardsReady(env)) || !(await v3GuardsReady(env)))
    throw Error("RECORD_GUARDS_UNAVAILABLE");
  const row = await env.DB.prepare(
    "SELECT envelope FROM round_secrets WHERE round_id=?",
  )
    .bind(round.id)
    .first();
  const reveal = await decryptSecret(
    row?.envelope,
    m,
    env.COMMIT_ENCRYPTION_KEY,
  );
  validateReveal(reveal, m);
  let snapshot = await readSnapshot(env, round.id);
  if (!snapshot) {
    const prices = [],
      sources = [];
    for (const p of m.markets) {
      const result = await publicConsensus(
        p.symbol.split(":")[1],
        p.date,
        fetcher,
        now,
      );
      if (!result.ok) throw Error(result.reason);
      prices.push({
        symbol: p.symbol,
        date: p.date,
        currency: p.currency,
        scale: p.scale,
        close: result.closeMinorUnits,
      });
      for (const o of result.observations)
        await env.EVIDENCE.put(
          `raw/${round.id}/${p.symbol}/${o.provider}/${o.sha256}.json`,
          o.raw,
        );
      sources.push({
        symbol: p.symbol,
        sources: result.observations.map(({ raw, ...o }) => ({
          ...o,
          close: o.closeMinorUnits,
        })),
        failures: result.unavailable,
      });
    }
    snapshot = await freezeSnapshot(env, round, prices, sources);
  }
  await ensureWitness(env, round, "freeze", snapshot, fetcher);
  snapshot = await readSnapshot(env, round.id);
  const witnesses = await readWitnesses(env, round.id);
  await validateV3Witnesses(round, snapshot, witnesses, (r, s) =>
    witnessOnServer(env, r, s),
  );
  const frozen = validateSnapshot(snapshot, m),
    beacon = await fetchBeacon(env, snapshot, fetcher, now);
  if (now < beaconTime(snapshot.beaconRound))
    throw Error("WAITING_FOR_FUTURE_BEACON");
  return settle(
    env,
    round,
    frozen.prices,
    {
      snapshot,
      beacon,
      reveal,
      witnesses,
      sources: frozen.sources,
      observedAt: new Date(now).toISOString(),
      execution:
        env.INSTALLATION_KIND === "ONLINE_REPLAY"
          ? "ONLINE_REPLAY_SIMULATED_CLOCK"
          : "LIVE_REAL_CLOCK",
      dataNote:
        "v3 hidden order committed before sales; first consensus witnessed by pinned Rekor before the derived future beacon.",
    },
    now,
  );
}

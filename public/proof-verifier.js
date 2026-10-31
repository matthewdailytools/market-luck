import { md5Hex, sha256Bytes, sha256Hex } from "./proof-hashes.js";
import {
  RANDOMNESS_POLICY,
  validateSnapshot,
  verifyBeacon,
  beaconTime,
} from "./beacon-verifier.js";
import {
  canonicalV3,
  validateReveal,
  validateV3Witnesses,
  assertV3ProductionTiming,
} from "./commitment-verifier.js";

const ids = [
  "manifest",
  "canonical",
  "hashes",
  "results",
  "timing",
  "sources",
  "pool",
];
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const digest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unique = (values) => new Set(values).size === values.length;
const validDate = (date) =>
  typeof date === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) &&
  new Date(date).toISOString().slice(0, 10) === date;
const validPrice = (p) =>
  isRecord(p) &&
  typeof p.symbol === "string" &&
  /^[A-Z0-9]+:[A-Z0-9.-]+$/.test(p.symbol) &&
  p.symbol.length < 60 &&
  validDate(p.date) &&
  /^[A-Z]{3}$/.test(p.currency) &&
  integer(p.scale, 0, 8) &&
  integer(p.close, 1);
const gameShape = (g) =>
  isRecord(g) &&
  typeof g.id === "string" &&
  /^[a-z][a-z0-9_-]{0,31}$/.test(g.id) &&
  integer(g.max, 1, 1000) &&
  integer(g.count, 1, Math.min(g.max, 50)) &&
  integer(g.bonus, 0, 1000) &&
  (g.bonusMin === undefined || integer(g.bonusMin, 0, 1000));

async function recalculate(seed, game) {
  let words = [],
    counter = 0;
  const sample = async (size) => {
    const limit = Math.floor(4294967296 / size) * size;
    let word;
    do {
      if (!words.length) {
        // The domain and counter are part of the published algorithm. Read big-endian.
        const bytes = await sha256Bytes(`${seed}:${game.id}:${counter++}`);
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        words = Array.from({ length: 8 }, (_, i) =>
          view.getUint32(i * 4, false),
        );
      }
      word = words.shift();
    } while (word >= limit);
    return word % size;
  };
  const available = Array.from({ length: game.max }, (_, i) => i + 1),
    main = [];
  for (let i = 0; i < game.count; i++)
    main.push(available.splice(await sample(available.length), 1)[0]);
  return {
    main: main.sort((a, b) => a - b),
    bonus: game.bonus
      ? (await sample(game.bonus)) + (game.bonusMin ?? 1)
      : null,
  };
}

function timingMatches(proof, manifest) {
  if (proof.mode !== manifest.mode) return false;
  if (manifest.mode === "DEMO")
    return (
      proof.simulatedClock === true &&
      (proof.execution === undefined ||
        proof.execution === "DEMO_SIMULATED_CLOCK")
    );
  if (
    manifest.mode !== "LIVE" ||
    !["LIVE_REAL_CLOCK", "ONLINE_REPLAY_SIMULATED_CLOCK"].includes(
      proof.execution,
    )
  )
    return false;
  if (proof.execution === "LIVE_REAL_CLOCK" && proof.simulatedClock === true)
    return false;
  if (
    !integer(manifest.cutoff, 1) ||
    !integer(manifest.ready, 1) ||
    !integer(manifest.confirmationDelayMs, 1)
  )
    return false;
  const markets = manifest.markets;
  if (
    !markets.every(
      (p) =>
        integer(p.closeUTC, 1) &&
        integer(p.openUTC, 1) &&
        p.openUTC < p.closeUTC,
    )
  )
    return false;
  const lastClose = Math.max(...markets.map((p) => p.closeUTC));
  if (
    manifest.ready !== lastClose + manifest.confirmationDelayMs ||
    manifest.cutoff >= Math.min(...markets.map((p) => p.openUTC))
  )
    return false;
  if (
    typeof proof.observedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(proof.observedAt)
  )
    return false;
  const observed = Date.parse(proof.observedAt);
  return (
    Number.isFinite(observed) &&
    observed >= manifest.ready &&
    observed >= manifest.cutoff &&
    observed >= lastClose
  );
}

function sourcesMatch(proof, manifest, prices) {
  if (manifest.mode === "DEMO")
    return (
      proof.mode === "DEMO" &&
      proof.simulatedClock === true &&
      same(manifest.sources, ["FIXTURE-v1"])
    );
  if (
    manifest.mode !== "LIVE" ||
    !Array.isArray(proof.sources) ||
    proof.sources.length !== manifest.markets.length ||
    !unique(proof.sources.map((entry) => entry?.symbol))
  )
    return false;
  let permitted;
  if (manifest.sourceProfile === "PUBLIC-NOKEY-v1") {
    permitted = ["YahooFinance", "Nasdaq"];
    if (!same(manifest.sources, permitted) || manifest.quorum !== 2)
      return false;
  } else if (manifest.sourceProfile === "KEYED-v1") {
    permitted = ["EODHD", "AlphaVantage", "TwelveData"];
    if (!same(manifest.sources, permitted) || manifest.quorum !== 2)
      return false;
  } else return false;
  return prices.every((price) => {
    const entry = proof.sources.find((item) => item.symbol === price.symbol);
    if (
      !entry ||
      !Array.isArray(entry.sources) ||
      entry.sources.length < manifest.quorum ||
      entry.sources.length > permitted.length ||
      !unique(entry.sources.map((source) => source?.provider))
    )
      return false;
    if (
      manifest.sourceProfile === "PUBLIC-NOKEY-v1" &&
      (!Array.isArray(entry.failures) || entry.failures.length !== 0)
    )
      return false;
    return entry.sources.every(
      (source) =>
        isRecord(source) &&
        permitted.includes(source.provider) &&
        source.close === price.close &&
        (source.closeMinorUnits === undefined ||
          source.closeMinorUnits === price.close) &&
        digest(source.sha256),
    );
  });
}

/** Reproduce public evidence locally. It does not fetch or authenticate private raw
 * source responses, inspect all tickets, verify payout recipients, or certify fairness.
 * A replay's internally consistent time remains a simulated time. */
export async function verifyProof(proof, expected = {}) {
  const checks = [
      ...ids,
      ...([2, 3].includes(proof?.version) ? ["snapshot", "beacon"] : []),
      ...(proof?.version === 3 ? ["hidden", "witnesses"] : []),
    ].map((id) => ({ id, ok: false })),
    errors = [],
    results = {};
  const checked = (id, ok) => {
    checks.find((check) => check.id === id).ok = Boolean(ok);
    if (!ok) errors.push(id.toUpperCase() + "_MISMATCH");
  };
  const output = () => ({
    ok: checks.every((check) => check.ok),
    checks,
    results,
    errors,
    mode: proof?.mode ?? null,
    execution: proof?.execution ?? null,
  });
  try {
    if (
      !isRecord(proof) ||
      !isRecord(proof.manifest) ||
      JSON.stringify(proof).length > 2000000
    )
      throw Error("INVALID_PROOF");
    const manifest = proof.manifest;
    if (
      ![1, 2, 3].includes(proof.version) ||
      manifest.version !== proof.version ||
      !Array.isArray(manifest.games) ||
      manifest.games.length < 1 ||
      manifest.games.length > 64 ||
      !manifest.games.every(gameShape) ||
      !unique(manifest.games.map((g) => g.id)) ||
      !Array.isArray(manifest.markets) ||
      manifest.markets.length < 1 ||
      manifest.markets.length > 100 ||
      !unique(manifest.markets.map((p) => p?.symbol))
    )
      throw Error("INVALID_MANIFEST_SHAPE");
    checked(
      "manifest",
      typeof expected.roundId === "string" &&
        manifest.id === expected.roundId &&
        digest(expected.commitment) &&
        expected.commitment === proof.commitment &&
        same(manifest, expected.manifest) &&
        (await sha256Hex(JSON.stringify(manifest))) === proof.commitment,
    );
    if (typeof proof.input !== "string" || proof.input.length > 500000)
      throw Error("INVALID_CANONICAL_INPUT");
    const input = JSON.parse(proof.input);
    if (
      !isRecord(input) ||
      !Array.isArray(input.prices) ||
      input.prices.length < 1 ||
      input.prices.length > 100 ||
      !input.prices.every(validPrice) ||
      !unique(input.prices.map((p) => p.symbol))
    )
      throw Error("INVALID_PRICE_SHAPE");
    const prices = [...input.prices].sort((a, b) =>
      a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0,
    );
    const canonical =
      manifest.version === 3
        ? canonicalV3(
            {
              id: manifest.id,
              manifest: JSON.stringify(manifest),
              commitment: proof.commitment,
            },
            prices,
            proof,
          )
        : JSON.stringify({
            version: manifest.version,
            round: manifest.id,
            commitment: proof.commitment,
            prices: prices.map(({ symbol, date, currency, scale, close }) => ({
              symbol,
              date,
              currency,
              scale,
              close,
            })),
            ...(manifest.version === 2
              ? {
                  snapshot: {
                    digest: proof.snapshot?.digest,
                    sealedAt: proof.snapshot?.sealedAt,
                    beaconRound: proof.snapshot?.beaconRound,
                  },
                  beacon: {
                    chainHash: RANDOMNESS_POLICY.chainHash,
                    round: proof.beacon?.round,
                    signature: proof.beacon?.signature,
                    randomness: proof.beacon?.randomness,
                  },
                }
              : {}),
          });
    const marketsMatch =
      prices.length === manifest.markets.length &&
      prices.every((p) =>
        manifest.markets.some(
          (m) =>
            m.symbol === p.symbol &&
            m.date === p.date &&
            m.currency === p.currency &&
            m.scale === p.scale,
        ),
      );
    checked(
      "canonical",
      input.version === manifest.version &&
        input.round === expected.roundId &&
        input.commitment === proof.commitment &&
        proof.input === canonical &&
        marketsMatch,
    );
    if (manifest.version === 2 || manifest.version === 3) {
      if (manifest.version === 3) {
        if (proof.execution === "LIVE_REAL_CLOCK")
          assertV3ProductionTiming(manifest);
        validateReveal(proof.reveal, manifest);
        checked("hidden", true);
        await validateV3Witnesses(
          {
            id: manifest.id,
            manifest: JSON.stringify(manifest),
            commitment: proof.commitment,
          },
          proof.snapshot,
          proof.witnesses,
        );
        checked("witnesses", true);
      }
      const frozen = validateSnapshot(proof.snapshot, manifest);
      checked(
        "snapshot",
        same(frozen.prices, prices) && same(frozen.sources, proof.sources),
      );
      checked(
        "beacon",
        verifyBeacon(proof.beacon, proof.snapshot.beaconRound) &&
          Date.parse(proof.observedAt) >=
            beaconTime(proof.snapshot.beaconRound),
      );
    }
    const seed = await sha256Hex(
      manifest.version >= 2
        ? `market-luck/draw/v${manifest.version}\n` + canonical
        : canonical,
    );
    checked("hashes", seed === proof.seed && md5Hex(canonical) === proof.md5);
    for (const game of manifest.games)
      results[game.id] = await recalculate(seed, game);
    checked(
      "results",
      isRecord(proof.results) &&
        Object.keys(proof.results).length === manifest.games.length &&
        manifest.games.every((g) => same(results[g.id], proof.results[g.id])),
    );
    checked("timing", timingMatches(proof, manifest));
    checked("sources", sourcesMatch(proof, manifest, prices));
    checked(
      "pool",
      integer(proof.poolBefore) &&
        integer(proof.payout) &&
        integer(proof.poolAfter) &&
        proof.payout <= proof.poolBefore &&
        proof.poolBefore - proof.payout === proof.poolAfter,
    );
  } catch (error) {
    errors.push(
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "INVALID_PROOF",
    );
  }
  return output();
}

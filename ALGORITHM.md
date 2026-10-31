# Algorithms v1 and v2 / 开奖算法规范

This specification describes the implementation in `src/engine.js`. It is deterministic, not proof of absolute resistance to manipulation. Virtual points have no cash value.

Sections 1–6 below retain **v1** for already published/sold rounds. Upgraded LIVE preparation uses **v2**, specified at the end. Never add the v2 beacon to an existing v1 manifest or change a sold period's canonical bytes.

## 1. Commit before sales / 事前承诺

Serialize the complete manifest with `JSON.stringify`, UTF-8, no whitespace or trailing newline. Publish its lowercase hexadecimal SHA-256 before opening ticket sales. Preserve the exact manifest bytes, instrument mappings, market dates, decimal scale, UTC opens/closes, sales cutoff, confirmation delay, sources, quorum, game definitions and payout policy.

For live rounds, cutoff is at least one hour after preparing the manifest and strictly before the earliest included market opens. Ready time is the latest included close plus 24 hours. Trading sessions are supplied from a reviewed calendar; holidays, DST and early closes must be resolved before publication. The app validates ordering and symbol mapping, but does not independently verify the exchange calendar or external anchor timestamp.

## 2. Prices / 价格口径

Use the daily close defined by the pinned source profile, never an intraday last trade. Legacy KEYED-v1 uses raw unadjusted close. PUBLIC-NOKEY-v1 uses Yahoo quote.close (not adjclose, but historical splits may be applied) cross-checked against Nasdaq Close/Last; see the profile-specific section below. Identify records by instrument and exchange-local trading date. Store prices as positive safe integers in declared decimal units. USD 123.4500 with scale 2 becomes 12345; 123.451 is rejected rather than rounded.

Pin EODHD, Alpha Vantage and Twelve Data in this order. At least two distinct sources must return the specified date and exact normalized price. **Any valid conflicting observation freezes the draw**, including a 2-to-1 disagreement. A missing, rate-limited or malformed provider is recorded as unavailable; two remaining matching sources can pass. Never average, use yesterday, replace an instrument or switch source sets after sales. Sources may share upstream feeds.

## 3. Canonical bytes / 规范字节

Sort prices ascending by ASCII `symbol` (`MIC:TICKER`). Create this exact field order:

```json
{"version":1,"round":"ROUND_ID","commitment":"MANIFEST_SHA256","prices":[{"symbol":"XNAS:AAPL","date":"2026-10-30","currency":"USD","scale":2,"close":12345}]}
```

The example demonstrates the serialization format; live manifests require 2–3 instruments. Only the six listed price fields enter the canonical input. Encode the compact `JSON.stringify` output as UTF-8 without BOM or trailing newline. Publish `md5 = lowercaseHex(MD5(input))` and `seed = lowercaseHex(SHA256(input))`. **MD5 is only a fingerprint; it is not the random seed or commitment.** Round ID and manifest commitment are included to bind the input to the published round.

## 4. Number mapping / 数字映射

For each game independently, start counter at zero and generate:

```text
block = SHA256(UTF8(seed + ":" + game.id + ":" + decimal(counter)))
counter = counter + 1
```

Interpret each block as eight unsigned 32-bit big-endian words, in order. To select from `n` choices, let `limit = floor(2^32 / n) * n`. Discard words `x >= limit`. Use `x % n` as the zero-based choice. This avoids modulo bias.

Start a pool `[1, …, max]`. Remove the chosen element from the remaining pool and repeat until `count` main balls have been selected, then sort ascending. For games with a special ball, consume the same game's **next words** with `n = bonus` (the number of allowed special values), then add `bonusMin` (default 1; Germany uses 0). The special ball is independent of main-ball uniqueness, so it can equal a main-ball number. Game IDs separate the streams; there is no separate special-ball hash domain in v1.

Formats: `cn` = 6/33 + 1/16; `us` = 5/69 + 1/26; `uk` = 6/59; `jp` = 6/43. These simulate number formats, not complete official lottery rules or prize schedules.

## 5. Payout / 派奖

Each ticket costs 10 points, all flowing into one shared pool initially funded with 100000 system points. Registration issues 1000 new user points separately. Tier 1 matches all main balls and the special ball if applicable. Tier 2 matches `count−1` main balls and the special ball if applicable. Tier 3 matches at least `minMatch` main balls (default 3; France/Italy 2, Brazil 4) or the special ball. Only the highest tier applies.

At settlement, reserve `floor(pool * 50/100)`, `floor(pool * 30/100)`, and `floor(pool * 20/100)` for tiers 1–3. Divide each tier's reserve equally among winners and round down. No winners means no payout from that reserve. All remainders roll over. Database constraints prevent negative balances. A unique settlement row and a D1 batch transaction prevent duplicate payouts.

## 6. Reproduce / 独立复算

Download `/api/proof/ROUND_ID`, then run:

```sh
node scripts/verify-proof.js path/to/proof.json
```

This independently recomputes manifest commitment, canonical input, MD5, SHA-256, and every game's numbers. It does **not** prove that a provider told the truth, that a calendar is accurate, or that the commitment existed at an independently verified earlier time. Audit those against raw provider response hashes, exchange records and an external timestamped publication.

The [readable verification page](https://luck.onlinefreetools.org/verify.html) also performs independent browser-side recalculation using `public/proof-verifier.js` and Web Crypto. It reads the exact selected public round, downloads its original R2 proof, checks both copies agree, and recalculates all game results. Original rules bytes remain downloadable at `/api/round/ROUND_ID/manifest`; SHA-256 of these bytes must equal the commitment.

The browser also checks declared source metadata, recorded timing and `poolBefore - payout = poolAfter`. These are separate consistency checks, not authentication of private provider responses, trusted external time, per-ticket payouts or full-ledger conservation. DEMO checks only simulated time/source markers, and ONLINE_REPLAY remains explicitly identified. No published proof means no successful-recalculation claim.

## Extended catalog

The catalog now includes 16 countries. France: 5/49 + 1/10; Germany: 6/49 + a special digit 0–9; Italy: 6/90; Spain/Canada/Singapore: 6/49; Australia: 7/47; New Zealand: 6/40; Korea: 6/45; Brazil: 6/60; South Africa: explicitly labeled 6/52 format; Philippines: 6/58. See 各国玩法说明.md for limits and reference sources. Every committed round uses its own manifest.games, never a newer global catalog.

## PUBLIC-NOKEY-v1 LIVE profile

YahooFinance and Nasdaq are both mandatory (2/2); no keyed-source substitution. Use exact-date Yahoo quote.close and Nasdaq Close/Last. Yahoo is not adjclose but historical splits can still revise it; equality is a provider snapshot rule, not an exchange-signed final price. Millisecond cutoff is enforced by D1 at commit time; all LIVE manifest timing columns are immutable. The reviewed 2026 NY calendar sets a latest 03:30 New York cutoff, before the 04:00 premarket, and ready is close + 24 hours. See LIVE接入与线上验收.md for full timing and test boundaries. Legacy manifests preserve their original source profile.

## v2: first price freeze and a future verified beacon

New LIVE manifests have `version: 2`, the same price, game definitions, cutoff, 24-hour market-confirmation minimum and payout policy, plus a fixed `randomness` object from `src/beacon.js`. `prepareLiveManifest` refuses new v1 or KEYED-v1 preparation. The legacy constructor remains available to isolated compatibility tests.

After `ready`, the first successful exact Yahoo/Nasdaq consensus is stored once in `entropy_snapshots`. The snapshot payload is compact UTF-8 JSON with fields in this order: `version:1`, `round`, `commitment`, `prices`, `sources`. Prices use the same six fields and ASCII symbol order as v1. Source groups are sorted by symbol; their captured metadata order is preserved. `digest = SHA256(payload)` in lowercase hexadecimal. `sealedAt` is the D1-generated millisecond time; neither an API caller nor a retry may replace it or the payload. Raw market responses remain private content-addressed R2 records.

The pinned network is drand quicknet, chain hash `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`, scheme `bls-unchained-g1-rfc9380`, genesis 1692803367 seconds and period 3 seconds. The complete pinned G2 key is in the source and manifest; it is never taken from an untrusted relay response. With all times in milliseconds:

```text
beaconRound = ceil((sealedAt + 120000 - 1692803367000) / 3000) + 1
beaconTime  = 1692803367000 + (beaconRound - 1) * 3000
```

The round-selection formula is committed before sales; the exact round is determined when the first snapshot is sealed. Before `beaconTime`, wait. Request only that round on the pinned chain, using `api.drand.sh` or `drand.cloudflare.com` as transport mirrors. A mirror is not a distinct entropy source. Verify the 48-byte G1 BLS signature over `SHA256(uint64_be(round))` against the pinned 96-byte G2 key, using the RFC9380 G1 NUL domain supported by noble. Also require `randomness = SHA256(signatureBytes)`. Invalid/missing data never substitutes latest, another chain, another round, a new price snapshot or v1. After freezing, the v2 admin pause operation is disabled; failure can only wait or successfully settle. This cannot force a Cloudflare account owner to keep running the service.

v2 canonical input is compact JSON in the following field order:

```text
{version:2, round, commitment, prices:[the six v1 price fields],
 snapshot:{digest,sealedAt,beaconRound},
 beacon:{chainHash,round,signature,randomness}}
```

`md5 = MD5(input)` remains a compatibility fingerprint. `seed = SHA256(UTF8("market-luck/draw/v2\n" + input))`; the `\n` denotes one newline byte. Sampling and grading stay unchanged. A v2 proof includes the full snapshot payload and digest, seal time and target round, the beacon response, source metadata and observation time. Browser/CLI checks bind the snapshot, prices, source metadata, round policy, BLS signature and domain-separated seed before reproducing all numbers.

The Free Worker invokes a same-account SQLite Durable Object for BLS execution; no paid-plan upgrade is required. The object uses the same pinned verification rules. It is not an independent witness. The public health endpoint verifies a real historical signature and rejects the same signature relabelled as another round; it does not represent a future natural draw. Database time, key governance, source truth and root-operator availability remain explicit trust assumptions. Reference: [drand protocol](https://docs.drand.love/docs/specification/).

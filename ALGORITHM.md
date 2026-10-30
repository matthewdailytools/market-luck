# Algorithm v1 / 开奖算法规范

This specification describes the implementation in `src/engine.js`. It is deterministic, not proof of absolute resistance to manipulation. Virtual points have no cash value.

## 1. Commit before sales / 事前承诺

Serialize the complete manifest with `JSON.stringify`, UTF-8, no whitespace or trailing newline. Publish its lowercase hexadecimal SHA-256 before opening ticket sales. Preserve the exact manifest bytes, instrument mappings, market dates, decimal scale, UTC opens/closes, sales cutoff, confirmation delay, sources, quorum, game definitions and payout policy.

For live rounds, cutoff is at least one hour after preparing the manifest and strictly before the earliest included market opens. Ready time is the latest included close plus 24 hours. Trading sessions are supplied from a reviewed calendar; holidays, DST and early closes must be resolved before publication. The app validates ordering and symbol mapping, but does not independently verify the exchange calendar or external anchor timestamp.

## 2. Prices / 价格口径

Use raw, unadjusted daily close, not adjusted close or an intraday last trade. Identify records by instrument and exchange-local trading date. Store prices as positive safe integers in declared decimal units. USD 123.4500 with scale 2 becomes 12345; 123.451 is rejected rather than rounded.

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

Start a pool `[1, …, max]`. Remove the chosen element from the remaining pool and repeat until `count` main balls have been selected, then sort ascending. For games with a special ball, consume the same game's **next words** with `n = bonusMax`, then add `bonusMin` (default 1; Germany uses 0). The special ball is independent of main-ball uniqueness, so it can equal a main-ball number. Game IDs separate the streams; there is no separate special-ball hash domain in v1.

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

## Extended catalog

The catalog now includes 16 countries. France: 5/49 + 1/10; Germany: 6/49 + a special digit 0–9; Italy: 6/90; Spain/Canada/Singapore: 6/49; Australia: 7/47; New Zealand: 6/40; Korea: 6/45; Brazil: 6/60; South Africa: explicitly labeled 6/52 format; Philippines: 6/58. See 各国玩法说明.md for limits and reference sources. Every committed round uses its own manifest.games, never a newer global catalog.

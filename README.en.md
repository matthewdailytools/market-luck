# OpenDraw · 公开奖

[中文](README.md) · English · [日本語](README.ja.md)

A virtual-points lottery experiment using publicly reproducible market-close input, built on Cloudflare Workers, D1 and R2. Includes 16 national number formats, Chinese/English/Japanese UI, signup points, atomic purchases, a shared rollover pool, winner history and downloadable proof.

**Committed rules. Reproducible results.** Public evidence supports independent third-party verification. The draw algorithm does not use ticket choices as number-generation input. The repository keeps its `market-luck` identity to preserve existing commitments. [Public archives](history/README.md) · [GitHub launch plan and English draft](GitHub传播方案.md).

Try `npm ci` then `node scripts/verify-proof.js tests/fixtures/v3-controlled-proof.json` for an offline controlled replay with genuine external signatures. It is not a natural market draw. GitHub history mirrors public facts with append-only checks; Workers never receive the archive write token.

[Current release acceptance (Chinese)](公开奖随机承诺与GitHub档案上线验收.md): 145 unit tests, 837 browser layout observations, a real GitHub archive and an unchanged-data/no-empty-commit run. The original 100 sold tickets and pool remain unchanged. A natural v3 draw has not occurred yet.

New LIVE preparation uses v3: commit a CSPRNG stock permutation and 256-bit nonce before sales using MD5 and binding SHA-256; independently witness the rules and first frozen price snapshot in Rekor; derive and verify a future drand round; reveal atomically with settlement. Existing v1/v2 rules stay unchanged. No Rekor API key is needed. A SQLite Durable Object verifies signatures on the Free plan. Configure separate `ABUSE_IP_KEY` and 32-byte hexadecimal `COMMIT_ENCRYPTION_KEY` secrets per installation, preserve existing encryption keys while any v3 secret remains unrevealed, apply all migrations and deploy matching code. See the Chinese installation steps, [v3 plan](隐藏顺序承诺与独立见证改进方案.md) and [algorithm](ALGORITHM.md). Node.js 22.13+ is required for SQLite security tests.

This is **not** an official lottery, real-money service or a promise of absolute tamper resistance. No deposits, withdrawals, transfers or physical prizes. Hosting, data providers and administrators remain trust boundaries. MD5 is only a fingerprint; SHA-256 generates commitments and sampling seeds.

[Hardening release evidence (Chinese)](随机性与防作弊改进上线验收.md) records the deployed versions, 130 unit tests, real cloud signature checks and browser acceptance. Sold v1 records were preserved; controlled historical-beacon tests do not establish a future natural v2 draw.

[Public round cards](https://luck.onlinefreetools.org/share.html?lang=en) need no sign-in. Links pin the round and format; cards support three languages, link sharing and PNG downloads. Published numbers appear only after browser recalculation passes. LIVE, DEMO and replay labels stay visible, and cards contain no private tickets or balances.

## Live installation and current round

[Live draw site](https://luck.onlinefreetools.org) · [Separate demo site](https://luck-test.onlinefreetools.org) · [LIVE implementation and acceptance report](LIVE接入与线上验收.md)

The live site now uses **Yahoo Finance + Nasdaq without API keys** through the fixed `PUBLIC-NOKEY-v1` profile. Both sources must return the specified trading date and an identical normalized close: **2 of 2 are required**. Missing data, rate limits, network failures or disagreement leave the draw waiting. Prices are never averaged, substituted or taken from a previous date.

The current round uses AAPL, MSFT and IBM for **November 2, 2026**. Sales close at **03:30 America/New_York**, before the 04:00 premarket session. The earliest draw is the core market close plus a fixed 24-hour confirmation window:

| Event | New York time, EST | UTC | Beijing time |
|---|---|---|---|
| Sales close | Nov 2, 03:30 | Nov 2, 08:30 | **Nov 2, 16:30** |
| Core market closes | Nov 2, 16:00 | Nov 2, 21:00 | Nov 3, 05:00 |
| Earliest draw attempt | Nov 3, 16:00 | Nov 3, 21:00 | **Nov 4, 05:00** |

The actual draw may take longer if consensus is unavailable. The server derives sessions from the reviewed **2026 NYSE/Nasdaq calendar** using `America/New_York`, including daylight-saving changes, holidays and early closes. Unreviewed years are rejected. D1 uses its current millisecond clock to reject purchases at or after cutoff and settlements before the confirmation window ends; committed live rules and timestamps cannot be modified.

Live publication, sales, time-boundary rejection and database protections have been tested online. The complete purchase-to-payout path was tested with actual historical provider responses in a **separate replay Worker, D1 database and R2 bucket**, explicitly marked as replay with a simulated clock. This is not a claim that the future November 2 round has already completed a natural live draw. See the report for evidence and remaining boundaries.

## Install locally

Requirements: Node.js 22+, npm, Git. No Cloudflare account is needed for local emulation.

```sh
git clone https://github.com/matthewdailytools/market-luck.git
cd market-luck
npm ci
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:8787`. Create a demo round, register, choose numbers and purchase tickets. Advance the simulated clock, run the draw, then download evidence. All demo prices are predictable fixtures.

```sh
npm test
# With the local dev server running:
npm run test:integration
```

## Deploy your own live installation

```sh
npx wrangler login
cp wrangler.live.example.jsonc wrangler.live.jsonc
npx wrangler d1 create market-luck-live
npx wrangler r2 bucket create market-luck-live-evidence
```

Replace the account ID, D1 ID, R2 bucket and domain in `wrangler.live.jsonc` with your own values before continuing. Use `DEMO_MODE=false` for live operation. Set `COMMITMENT_REPOSITORY=owner/repo` for your own GitHub repository; otherwise only the project's default commitment repository is accepted.

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.live.jsonc
npx wrangler secret put ADMIN_TOKEN --config wrangler.live.jsonc
npx wrangler deploy --config wrangler.live.jsonc
```

Prepare a future round through `/api/admin/prepare`. The server derives canonical symbol mappings and session times; cutoff must satisfy the reviewed calendar and premarket rule. Save the returned manifest's exact bytes in your configured GitHub repository, commit them, and provide the immutable 40-character commit URL to `/api/admin/publish`. The Worker downloads and verifies those bytes before opening sales. Cron attempts collection after the confirmation window; administrators can also call collect or pause a round without changing committed rules. Keep the admin token in Workers secrets, out of the frontend and Git.

**No market-data API keys are required for `PUBLIC-NOKEY-v1`.** The older EODHD / Alpha Vantage / Twelve Data adapters remain as an alternative keyed-source integration. Those keys are not a prerequisite for the current Yahoo/Nasdaq live site. Never replace a published round's source profile after sales begin.

Keep live, demo and replay installations on **different Worker/D1/R2 resources**. Production uses `migrations/`. **Never apply `tests/replay-migrations/` to a live database.** Production has no simulated-clock advancement endpoint or replay clock table.

For a demo installation, copy `wrangler.test.example.jsonc` and use your own IDs/domain. `DEMO_MODE=true` and `DEMO_AUTO_DRAW=true` enable scheduled simulation. Owner-specific deployment configuration is gitignored.

Free anonymous access does not guarantee uptime, unlimited requests, exchange-final data or public redistribution rights. Providers can revise prices or share upstream data; review applicable permissions and operational safeguards for your own installation.

## Documentation

- [LIVE rollout and online acceptance](LIVE接入与线上验收.md)
- [Algorithm and independent verification](ALGORITHM.md)
- [HTTP API](API.md)
- [16 country formats](各国玩法说明.md)
- [Signup points calculation](注册赠分测算.md)
- [Market sources](行情数据源接入.md)
- [Security boundaries](SECURITY.md) / [Contributing](CONTRIBUTING.md) / [MIT license](LICENSE)

Signup grants 1,000 points once, equivalent to 100 tickets: six trials of each of 16 formats plus four flexible tickets. This is an experience budget, not a guarantee of winning or profit. Account verification and anti-abuse controls are required before treating the points economy as resistant to farming.

## Anonymous market-source diagnostics

No API keys are needed for historical diagnostics: `node scripts/check-public-sources.js 2026-10-29 AAPL`. This command does not buy tickets or settle a round. The same Yahoo/Nasdaq sources are now integrated into live rounds, with the additional calendar, commitment and timing protections described above. See [anonymous-source test notes](免Key行情源实测.md) and the [optional API key setup guide](免费行情API申请与配置-逐步操作.md).

`node tests/live-online.js` exercises live publication and sales using real clocks and requires `LIVE_ADMIN_TOKEN`; it cannot force an early draw. `node scripts/run-live-replay.js` is only for a separately installed replay environment and requires `REPLAY_ADMIN_TOKEN`. These tests create test accounts and tickets; read the acceptance report before running them against an installation.

[Theme design evaluation](主题设计评估.md): the selected bright global-play direction is an expert design judgment, not a measured A/B conversion result.

The default for new visitors remains **Try with points** after the [review of appeal, anticipation and trust](三主题复评-奖池与开奖结果版.md). Explicit theme links and saved visitor choices take priority. Points units, complete desktop timing, a waiting-stage timeline and a clearer mobile starting path address the review findings. Verify the draw and Explore formats remain selectable in all three languages. These are AI design judgments, not measured conversion results.

The homepage now highlights the current shared points pool, published results and 16 national format shortcuts. Past results use their own committed rules; the live site waits when no real result exists, and demo results are labelled. Country shortcuts open rules and number selection without buying a ticket. See the [homepage pool and results acceptance report](首页奖池与开奖结果优化验收.md).

The first-ticket guide connects the one-time 1,000-point registration grant, country selection, quick pick and explicit confirmation. Both the picker and review show the 10-point cost, current/projected balances and round verification link. Signing in preserves valid picks without purchasing. Interrupted requests retain their original idempotency key; success requires a matching private ticket. See the [first-ticket flow and acceptance report](首次体验与购票流程上线验收.md).

My tickets shows your latest 100 tickets with full IDs, original rounds, numbers, costs and payout records. Older rounds are looked up individually; missing evidence stays unconfirmed instead of borrowing current rules. Each ticket links to its own round’s verification. Sign-in returns to the records, sign-out clears private cards immediately, and stale responses cannot replace a newer account snapshot. See the [ticket-history acceptance report](票据记录与开奖状态优化验收.md).

Browser acceptance runs Chromium and WebKit in an isolated GitHub-hosted Linux environment, producing screenshots and viewport, language, theme and touch checks. In Actions → **Ticket browser and mobile acceptance** → **Run workflow**, enable `online` to add a disposable DEMO account flow and read-only LIVE checks. Only DEMO creates a points ticket; LIVE API writes are blocked. See the [browser and mobile acceptance report](我的彩票浏览器与移动端验收.md).

The [readable verification page](https://luck.onlinefreetools.org/verify.html) explains each round's rules, sources and timeline, then reproduces published results locally in the browser. Original manifest and proof JSON downloads remain available. Pending, simulated and replay results are clearly distinguished; local consistency checks do not authenticate private source responses or audit all payouts.

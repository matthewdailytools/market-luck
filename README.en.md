# Market Luck

[中文](README.md) · English · [日本語](README.ja.md)

A virtual-points lottery experiment using publicly reproducible market-close input, built on Cloudflare Workers, D1 and R2. Includes 16 national number formats, Chinese/English/Japanese UI, signup points, atomic purchases, a shared rollover pool, winner history and downloadable proof.

This is **not** an official lottery, real-money service or a promise of absolute tamper resistance. No deposits, withdrawals, transfers or physical prizes. Hosting, data providers and administrators remain trust boundaries. MD5 is only a fingerprint; SHA-256 generates commitments and sampling seeds.

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

## Deploy to your Cloudflare account

```sh
npx wrangler login
npx wrangler d1 create market-luck
npx wrangler r2 bucket create market-luck-evidence
```

Replace the D1 ID and bucket name in `wrangler.jsonc` with the returned values. Keep `wrangler.test.jsonc` separate: it identifies this project's public test installation, not your account. Add your own custom domain with a Workers `routes` entry when needed.

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

For an automated simulation site, set `DEMO_MODE` and `DEMO_AUTO_DRAW` to `"true"` and a Cron schedule such as every five minutes. It will create and settle demo rounds using simulated prices. Remote demo controls additionally require the admin bearer token, which is never sent to the public UI.

For live-market rounds set `DEMO_MODE` to `"false"`. Register free provider accounts and set `EODHD_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TWELVE_DATA_API_KEY` using `wrangler secret put`. At least two providers must return an identical valid close, and **any valid disagreement freezes settlement**. No averaging or fallback to yesterday. Free access does not automatically grant public redistribution rights. Review exchange calendars and publish an external commitment before opening live sales. Real provider-account online testing is pending until keys are supplied.

## Documentation

- [Algorithm and independent verification](ALGORITHM.md)
- [HTTP API](API.md)
- [16 country formats](各国玩法说明.md)
- [Signup points calculation](注册赠分测算.md)
- [Market sources](行情数据源接入.md)
- [Security boundaries](SECURITY.md) / [Contributing](CONTRIBUTING.md) / [MIT license](LICENSE)

Signup grants 1,000 points once, equivalent to 100 tickets: six trials of each of 16 formats plus four flexible tickets. This is an experience budget, not a guarantee of winning or profit. Account verification and anti-abuse controls are required before treating the points economy as resistant to farming.

## Anonymous market-source diagnostics

No API keys are needed to test Yahoo Finance + Nasdaq historical closes: `node scripts/check-public-sources.js 2026-10-29 AAPL`. This is historical diagnostics, not an active LIVE draw profile. See [免 Key 实测](免Key行情源实测.md) and [API Key 逐步申请](免费行情API申请与配置-逐步操作.md). The owner-specific test deployment config is gitignored; copy `wrangler.test.example.jsonc` to `wrangler.test.jsonc` and use your own IDs/domain when creating your own test site.

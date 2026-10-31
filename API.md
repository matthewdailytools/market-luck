# HTTP API

Base URL: local `http://127.0.0.1:8787`, or your deployed HTTPS origin. Responses use JSON, except static assets and proof downloads. User sessions use an HttpOnly, SameSite=Strict cookie; HTTPS adds Secure. All non-admin POST requests require an `Origin` header equal to the server origin. No cross-origin API access is enabled.

## Public / user endpoints

| Method | Path | Request | Result |
|---|---|---|---|
| GET | `/api/state` | Session cookie optional | `me`, `games`, `demo`, `pool`, latest 20 rounds and anchors, latest 100 own tickets, public winners and pool ledger |
| GET | `/api/round/{round}` | Public, no session needed | Exact public round, its anchor and latest 10 collection attempts; supports history outside the state list |
| GET | `/api/round/{round}/manifest` | Public, no session needed | Original committed manifest JSON bytes as an attachment; SHA-256 equals the round commitment |
| POST | `/api/register` | `{name,password}` | Creates account, issues 1000 points once, sets session cookie |
| POST | `/api/login` | `{name,password}` | Sets session cookie; no extra points |
| POST | `/api/logout` | `{}` | Revokes session and clears cookie |
| POST | `/api/buy` | `{round,game,main,bonus,key}` | `{ok,id}`; requires user session; 10 points atomically transferred to pool |
| GET | `/api/proof/{round}` | None | Download settled evidence JSON from R2; 404 before settlement |

Names contain 3–24 Unicode letters/numbers, `_` or `-`. Passwords contain 8–128 characters. `main` must contain the game's required number of unique integers; `bonus` is `null` when absent. Germany accepts `0–9`, not `1–10`. Game IDs are `cn,us,uk,jp,fr,de,it,es,ca,au,nz,kr,sg,br,za,ph`. The exact round's `manifest.games` controls eligibility; new games cannot be purchased in an older committed round.

`key` is an 8–80 character alphanumeric/hyphen idempotency key, unique per account. Retry with the same body/key to avoid duplicate spending. A reused key returns the original ticket rather than changing its numbers. Concurrent identical first requests may return a duplicate-request error; query the private tickets in `/api/state`, then recover or retry the original body/key until its outcome is known. Do not generate a different key while the original request may have succeeded.

The homepage keeps registration/sign-in separate from explicit ticket confirmation. It shows the committed 10-point cost, current balance and projected balance, refreshes the account and round before submission, and only displays a confirmed receipt after matching the returned ID to a private ticket's owner, round, game and numbers. An unanswered request is stored per account in browser session storage with its original key, without passwords or session cookies. If its period has ended, replaying that original request can still recover an existing ticket; a terminal closed-period rejection releases an unprocessed request. See [first-ticket flow and acceptance](首次体验与购票流程上线验收.md).

Example (session cookie obtained using register/login and a cookie jar):

```sh
curl -c cookies.txt -H 'Origin: http://127.0.0.1:8787' -H 'Content-Type: application/json' \
  -d '{"name":"example-user","password":"replace-with-a-long-password"}' \
  http://127.0.0.1:8787/api/register

curl -b cookies.txt -H 'Origin: http://127.0.0.1:8787' -H 'Content-Type: application/json' \
  -d '{"round":"ROUND_ID","game":"de","main":[1,2,3,4,5,6],"bonus":0,"key":"unique-request-0001"}' \
  http://127.0.0.1:8787/api/buy
```

## Demo endpoints

POST `/api/demo/create` with `{}` opens a committed simulation round, or returns the current round ID. POST `/api/demo/advance` with `{round}` advances simulation timing. POST `/api/demo/draw` with `{round}` settles it and archives evidence. They require `DEMO_MODE=true`, localhost, and a matching Origin. Live rounds cannot be advanced or drawn through these routes. Simulated prices are predictable fixtures and must never be described as live random market data.

## Administrator endpoints

All admin POST calls require `Authorization: Bearer ADMIN_TOKEN`. The token is a server secret. These endpoints do not require the browser Origin header. Do not expose the token to the public frontend.

1. POST `/api/admin/prepare`: `{cutoff,markets}`. Creates a `draft` manifest and returns its exact bytes as JSON plus SHA-256 commitment. `cutoff` is integer Unix milliseconds, at least one hour in the future and before all market opens. There must be 2–3 USD equity entries, scale 2. Each entry has `symbol`, `date`, `currency`, `scale`, `openUTC`, `closeUTC`, `eodhd`, `alpha`, `twelve`, `exchange`. Example mapping: XNAS:AAPL, AAPL.US, AAPL, AAPL, NASDAQ. Exchange calendar values must be reviewed before submission.
2. Publish the exact manifest and hash to an external timestamped record before ticket sales.
3. POST `/api/admin/publish`: `{round,anchor:"https://…"}`. Opens the draft and records the reference. This app only checks the URL format; it does not independently verify the external timestamp or publication contents.
4. POST `/api/admin/collect`: `{round}`. Fetches all pinned free providers, requires at least two matching valid closes with no valid conflicts, archives raw snapshots in R2, and settles. It waits until the last close plus 24 hours. Provider keys are secrets. Daily Cron at 06:00 UTC also attempts eligible live rounds.

## Errors and limits

Errors return `{error:"message"}`. Typical statuses: 400 invalid input, duplicate registration, insufficient points or provider failure; 401 missing login/admin credentials; 403 Origin failure or disabled demo; 404 missing endpoint/round/proof; 409 draw too early or invalid round state; 413 oversized declared request body; 503 missing stored evidence. Error messages currently use Chinese and are translated by the UI.

State lists are bounded recent history, not a complete paginated export. A public archive/pagination endpoint has not yet been implemented. Large-scale operation also needs explicit request/registration rate limits and settlement batch sizing; current local testing covers 100 tickets per round. Do not describe this API as production-audited.

## Private ticket history

The homepage’s `#myTickets` uses the latest 100 owned tickets from `/api/state`; its totals describe that returned list, not lifetime history. When a ticket’s original round is outside the latest 20 state rounds, the client retrieves its public metadata using `GET /api/round/{round}`. Requests share a four-request concurrency cap, successful round metadata is reused, transient failures back off for 60 seconds, and manual refresh can retry failures. No ticket mutation or settlement endpoint is called by this feature.

Ticket numbers, cost and prize status use the original committed catalog. Missing or inconsistent rounds/proofs stay unconfirmed; zero-point allocations to a winning tier are not labelled losing tickets. Status and payout text present account records with consistency checks; independent hash and draw reproduction remains on the verification page. Authentication boundaries invalidate older state requests, sign-out clears private cards immediately, and only the current owner’s tickets are rendered.

`npm run test:tickets` checks an existing disposable DEMO account using a gitignored credentials file (`TEST_ACCOUNT_FILE`, default `test-output/onboarding-browser-account.json`). Obtain that file with `npm run test:onboarding` on the isolated demo first. The ticket-history check sends only public/private GET requests and test-session login/logout; it never registers, buys, advances clocks or settles. Credentials must not be committed. See [acceptance details](票据记录与开奖状态优化验收.md).

## Readable verification page

`/verify.html?round=ROUND_ID` explains a selected public round in Chinese, English or Japanese. Without an ID it selects a current public round from `/api/state`. Rules, source requirements and times come from that round's manifest, not a separate marketing configuration. The page downloads settled evidence from `/api/proof/{round}` and independently recalculates the hashes and all game numbers in the browser.

`GET /api/round/{round}` returns `{serverTime,demo,round,anchor,attempts}`. The `round` object contains only `id,status,manifest,commitment,cutoff,ready,proof`; `manifest` and `proof` are parsed objects, and `proof` is null before settlement. Attempts are scoped to the requested round. No user accounts, sessions, private source response bodies or per-user tickets are returned. Both this endpoint and the manifest attachment return 404 for unknown or draft rounds. IDs contain 1–80 ASCII letters, digits or hyphens. Responses use `Cache-Control: no-store`.

The manifest attachment returns the stored original string without pretty-printing, so its exact bytes can be checked against the published commitment. The existing proof download remains the original R2 archive. Local browser checks establish consistency with the selected public manifest, deterministic numbers, declared source metadata, recorded timing and proof-internal pool arithmetic. They do not authenticate private source responses, establish an independent trusted timestamp or audit every ticket and payment. DEMO and ONLINE_REPLAY remain visibly identified.

## Anonymous-source research endpoint

`POST /api/admin/check-public-sources` accepts `{symbol,date}` for AAPL/MSFT/IBM. It fetches Yahoo Finance and Nasdaq without API keys, archives source responses privately to R2, and returns a redacted diagnostic report. Requires the admin Bearer token. Returns 200 on two agreeing observations, 409 on unavailable/conflicting data. No tickets or payouts are created; existing LIVE manifests are unaffected.

## LIVE profile update (2026-10-31)

Default prepare profile is now `PUBLIC-NOKEY-v1`, sources exactly YahooFinance + Nasdaq (2/2). KEYED-v1 remains explicit opt-in. Server derives MIC/provider mappings and session UTC from the reviewed 2026 NYSE/Nasdaq calendar; cutoff must be at or before 03:30 New York, at least one hour after preparation. Unsupported calendar years fail closed. Publish now fetches the exact immutable GitHub commit manifest and verifies its bytes, with manual redirect handling. Configure COMMITMENT_REPOSITORY for a fork. `/api/admin/pause` permanently pauses an open round; there is no automatic resume or time override. State now includes serverTime and collection attempts. See LIVE接入与线上验收.md for the actual future round, separated online replay test and current rollout.

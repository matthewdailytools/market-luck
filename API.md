# HTTP API

Base URL: local `http://127.0.0.1:8787`, or your deployed HTTPS origin. Responses use JSON, except static assets and proof downloads. User sessions use an HttpOnly, SameSite=Strict cookie; HTTPS adds Secure. All non-admin POST requests require an `Origin` header equal to the server origin. No cross-origin API access is enabled.

## Public / user endpoints

| Method | Path | Request | Result |
|---|---|---|---|
| GET | `/api/state` | Session cookie optional | `me`, `games`, `demo`, `pool`, latest 20 rounds and anchors, latest 100 own tickets, public winners and pool ledger |
| POST | `/api/register` | `{name,password}` | Creates account, issues 1000 points once, sets session cookie |
| POST | `/api/login` | `{name,password}` | Sets session cookie; no extra points |
| POST | `/api/logout` | `{}` | Revokes session and clears cookie |
| POST | `/api/buy` | `{round,game,main,bonus,key}` | `{ok,id}`; requires user session; 10 points atomically transferred to pool |
| GET | `/api/proof/{round}` | None | Download settled evidence JSON from R2; 404 before settlement |

Names contain 3–24 Unicode letters/numbers, `_` or `-`. Passwords contain 8–128 characters. `main` must contain the game's required number of unique integers; `bonus` is `null` when absent. Germany accepts `0–9`, not `1–10`. Game IDs are `cn,us,uk,jp,fr,de,it,es,ca,au,nz,kr,sg,br,za,ph`. The exact round's `manifest.games` controls eligibility; new games cannot be purchased in an older committed round.

`key` is an 8–80 character alphanumeric/hyphen idempotency key, unique per account. Retry with the same body/key to avoid duplicate spending. A reused key returns the original ticket rather than changing its numbers. Concurrent identical first requests may return a duplicate-request error; query state before retrying with a different key.

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

## Anonymous-source research endpoint

`POST /api/admin/check-public-sources` accepts `{symbol,date}` for AAPL/MSFT/IBM. It fetches Yahoo Finance and Nasdaq without API keys, archives source responses privately to R2, and returns a redacted diagnostic report. Requires the admin Bearer token. Returns 200 on two agreeing observations, 409 on unavailable/conflicting data. No tickets or payouts are created; existing LIVE manifests are unaffected.

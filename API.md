# HTTP API

Base URL: local `http://127.0.0.1:8787`, or your deployed HTTPS origin. Responses use JSON, except static assets and proof downloads. User sessions use an HttpOnly, SameSite=Strict cookie; HTTPS adds Secure. All non-admin POST requests require an `Origin` header equal to the server origin. No cross-origin API access is enabled.

## Public / user endpoints

| Method | Path | Request | Result |
|---|---|---|---|
| GET | `/api/state` | Session cookie optional | `me`, `games`, `demo`, `pool`, latest 20 rounds and anchors, latest 100 own tickets, public winners and pool ledger |
| GET | `/api/round/{round}` | Public, no session needed | Exact public round, its anchor and latest 10 collection attempts; supports history outside the state list |
| GET | `/api/round/{round}/manifest` | Public, no session needed | Original committed manifest JSON bytes as an attachment; SHA-256 equals the round commitment |
| GET | `/api/round/{round}/witnesses` | Public, no session needed | v3 stage receipts and exact secret reveal after settlement; older versions return empty receipts and null reveal |
| GET | `/api/history/rounds?after=0` | Public, integer sequence cursor | Up to 100 published round headers and `nextAfter`; excludes drafts and private fields |
| GET | `/api/history/ledger?after=0&through=HEAD` | Public; omit through on first page | Up to 200 de-identified pool ledger records within a fixed head; no signup or owner rows |
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

## Randomness and anti-abuse additions

GET `/api/randomness-health` returns installed algorithm versions, the new-round version, pinned public beacon policy, server abuse-key configuration status, and a real historical quicknet signature self-test performed by a SQLite Durable Object. A valid round-1000 signature must pass; relabelling it as round 1001 must fail. This endpoint is read-only with respect to D1/R2, although the verifier may cache its result in memory. Success is an execution-readiness check, not a certificate of fairness or a future natural draw.

It now reports algorithms `[1,2,3]`, `newRoundVersion:3`, `hiddenCommitmentsConfigured`, `witnessGuardsInstalled`, pinned `witnessPolicy` and a genuine historical Rekor signature/inclusion self-test with a tampered-time rejection. `policy` describes v3 beacon selection; `legacyV2Policy` retains the earlier formula. The same-account verifier computes checks; the independent witness is the external Rekor log, not the DO.

GET `/api/round/ROUND_ID/entropy` returns `{roundId,version,snapshot,beaconTime}` only for a public round. A v1 or not-yet-frozen round returns `snapshot:null`. A v2 snapshot contains `{payload,digest,sealedAt,beaconRound}`. v3 adds `witnessedAt`; target/time are null until a verified freeze receipt is stored. These are public prices and metadata, not all raw provider bodies. No account or ticket ownership information is included. Invalid or unpublished IDs return 404.

New POST `/api/admin/prepare` requests produce v3 manifests; omit `version` or specify 3. Versions 1/2 and KEYED-v1 preparation are refused. Caller-supplied `secret,hidden,order,nonce,randomness,witness,reveal` are rejected. The response contains only public manifest, commitment and next-step text, never the secret or encrypted envelope. `COMMIT_ENCRYPTION_KEY` and installed v3 guards are required. Existing v1/v2 rounds keep their original flows. Both v2/v3 prohibit pause after freezing with 409 `FROZEN_ROUND_CANNOT_PAUSE`; rejected pause history is append-only.

GET `/api/round/ROUND_ID/witnesses` returns `{roundId,version,commitment,witnesses,reveal}`. `witnesses` has optional `presale` and `freeze` receipts, each `{record,uuid,entry}`. `entry` preserves the signed external log response, including SET and inclusion/checkpoint. `reveal` is the exact compact secret JSON string, or null before its settlement transaction commits. v1/v2 return `{}` and null. Private envelopes, signing keys and credentials are never returned; draft and invalid IDs return 404. Preserve the public record together with its receipt for offline verification.

v3 publish first verifies the existing immutable GitHub manifest, then obtains and verifies the independent presale receipt before opening. Collection freezes once, persists one immutable log-upload intent, obtains/verifies the freeze receipt, and waits for the target derived from the signed witness second plus one conservative second. Missing/invalid log or beacon data cannot select a new request, input or service. Reveal and payments commit atomically; a failed transaction publishes no reveal. See [v3 algorithm](ALGORITHM.md#v3-hidden-order-nonce-and-independently-witnessed-records).

Authentication now uses persistent fixed-window source limits: LIVE registration 5/hour, DEMO registration 50/hour, login 60/minute. A rejected request returns HTTP 429 and `Retry-After` seconds. Public LIVE authentication refuses a missing server key/source instead of disabling protection. Local DEMO development may omit the key. The database stores HMAC bucket IDs, not raw IPs. Request JSON is limited to 16 KiB even when Content-Length is omitted.

New sessions store a domain-separated SHA-256 digest (`s2:` prefix) rather than the raw Cookie token. Existing sessions are upgraded on legitimate use without changing their Cookie or expiry; the stored digest is not an accepted Cookie. Logout revokes both storage formats. No session digest or internal session key is returned in `/api/state`.

## Public sharing page

GET `/share.html?round=ROUND_ID&game=de&lang=zh-CN` opens a read-only page, not a new purchase API. `lang` supports `zh-CN`, `en`, and `ja`; `game` must belong to that exact round's committed catalog. Without a round parameter, the page selects the displayed public round and then pins its ID in the URL. A supplied invalid, missing or unpublished ID shows an error instead of borrowing another round. Cloudflare Assets may canonicalize the HTML path; the query parameters are preserved.

The page requests existing public `/api/round/:id` and `/api/proof/:id` resources with credentials omitted. Settled rounds require the proof copies to match and all browser-side `verifyProof` checks to pass before showing numbers or exporting a result image. Pending cards show no predicted numbers. A passed check means consistency of published evidence, not independent authentication of source prices, timestamps, individual payouts or the whole ledger. DEMO and replay remain labelled simulations.

Share URLs include only the public round ID, format and language. No accounts, private tickets, balances or arbitrary incoming parameters are copied. Native sharing is optional, clipboard failures provide a selectable URL, and PNG export runs locally in the browser. No sharing rewards, additional win probability or analytics collection are introduced. Run `npm run test:share` for read-only deployed-asset and public-record checks; `TEST_BASE_URL` selects a permitted local/DEMO/LIVE origin.

For locally advanced DEMO clocks, operational times may differ from the committed simulation schedule. The card explicitly labels that difference and keeps the original rules linked; it does not rewrite the manifest. LIVE operational timing must still equal the committed timing or the card rejects the record.

## Demo endpoints

POST `/api/demo/create` with `{}` opens a committed simulation round, or returns the current round ID. POST `/api/demo/advance` with `{round}` advances simulation timing. POST `/api/demo/draw` with `{round}` settles it and archives evidence. They require `DEMO_MODE=true`, localhost, and a matching Origin. Live rounds cannot be advanced or drawn through these routes. Simulated prices are predictable fixtures and must never be described as live random market data.

## Administrator endpoints

All admin POST calls require `Authorization: Bearer ADMIN_TOKEN`. The token is a server secret. These endpoints do not require the browser Origin header. Do not expose the token to the public frontend.

1. POST `/api/admin/prepare`: `{cutoff,markets,version:3,sourceProfile:"PUBLIC-NOKEY-v1"}` (version and profile may be omitted). Creates a v3 `draft` manifest and public commitment. `cutoff` is integer Unix milliseconds, at least one hour in the future and at or before 03:30 New York on the market date. There must be 2–3 supported USD equities, scale 2. Entries identify `symbol,date,currency,scale`; the server derives provider mappings and UTC sessions from the reviewed calendar. Unsupported years fail closed. New v1/v2 or KEYED-v1 preparation is rejected.
2. Publish the exact manifest and hash to an external timestamped record before ticket sales.
3. POST `/api/admin/publish`: `{round,anchor:"https://…"}`. Opens the draft after fetching and comparing the exact manifest bytes from the immutable GitHub commit reference in `COMMITMENT_REPOSITORY`; v3 additionally requires a verified presale Rekor receipt. GitHub contents alone are not a trusted timestamp. Missing or invalid external witness means the draft stays closed.
4. POST `/api/admin/collect`: `{round}`. Fetches the original manifest's providers only after its last close plus 24 hours. PUBLIC-NOKEY-v1 requires YahooFinance and Nasdaq to agree exactly; raw snapshots are archived in R2. v1 settles using its original input. v2 first seals consensus, waits for its derived beacon and settles. v3 additionally witnesses the freeze and reveals the committed package atomically with settlement. Failures wait without replacing the snapshot or target. Cron attempts eligible rounds every five minutes.
5. POST `/api/admin/pause`: `{round}`. Permanently pauses an eligible open round. A frozen v2/v3 round cannot be paused; a rejection is recorded in collection history. An open LIVE round cannot be hidden by changing it to draft, and settled status requires settlement evidence.

## Errors and limits

Errors return `{error:"message"}`. Typical statuses: 400 invalid input, duplicate registration, insufficient points or provider failure; 401 missing login/admin credentials; 403 Origin failure or disabled demo; 404 missing endpoint/round/proof; 409 draw too early, pending/invalid beacon or invalid round state; 413 JSON body over 16 KiB; 429 source rate limit (with Retry-After); 503 missing evidence, installed guards or verifier configuration. Error messages currently use Chinese and are translated by the UI.

State lists are bounded recent history, not a complete paginated export. A public archive/pagination endpoint has not yet been implemented. Authentication limits do not cover every API route or establish one person per account. Large-scale operation still needs settlement batch sizing and load review; integration testing covers 100 tickets per round. Do not describe this API as production-audited.

## Public GitHub history

`GET /api/history/rounds` returns `{installation,serverTime,rounds,nextAfter}`. Headers contain `sequence,id,status,commitment,cutoff,ready,version`. Start with `after=0`, follow `nextAfter` until null, and restart a full scan on each archive run so a previously prepared draft that opens later is not missed. Sequence is a database row identifier, not an algorithm input or draw result.

`GET /api/history/ledger` returns `{installation,serverTime,through,latestHead,pool,poolAtHead,records,nextAfter}`. The first page fixes the current public head. Pass that `through` on subsequent pages, even if new transactions arrive. Each row has only `id,roundId,kind,delta,poolDelta,created`. Types are seed, purchase and prize; signup and user IDs are excluded. `poolDelta=delta` for seed and `-delta` for purchases/prizes. The read batch captures the head, current pool and bounded records consistently; historical `poolAtHead` is the accumulated public pool delta through the selected head. Invalid/negative/unsafe cursors or a head beyond existing public history return 400.

Public round details additionally include `archive:{repository,kind,url,asynchronous:true}`. This is a navigation reference, not proof that a mirror exists yet. The readable page explains asynchronous archiving and distinguishes original presale anchors from later observations.

`npm run archive:core` verifies and writes `history/live/`. GitHub Actions uses its own repository-scoped token to commit public facts; no GitHub write token is configured in Workers. Set trusted repository variables `ARCHIVE_LIVE_ORIGIN` / `ARCHIVE_DEMO_ORIGIN` for a fork's deployment and use `COMMITMENT_REPOSITORY` for its manifest repository. Manual `include_demo=true` adds the separate DEMO archive. Fixed files cannot be overwritten; a prior ledger-prefix change, vanished round/snapshot/proof or invalid evidence fails the job. Existing valid witness receipts are retained when the log merely refreshes a checkpoint. See [storage plan](GitHub核心档案存储方案.md).

## Private ticket browsing

The homepage’s `#myTickets` uses the latest 100 owned tickets from `/api/state`; its totals describe that returned list, not lifetime history. When a ticket’s original round is outside the latest 20 state rounds, the client retrieves its public metadata using `GET /api/round/{round}`. Requests share a four-request concurrency cap, successful round metadata is reused, transient failures back off for 60 seconds, and manual refresh can retry failures. No ticket mutation or settlement endpoint is called by this feature.

Ticket numbers, cost and prize status use the original committed catalog. Missing or inconsistent rounds/proofs stay unconfirmed; zero-point allocations to a winning tier are not labelled losing tickets. Status and payout text present account records with consistency checks; independent hash and draw reproduction remains on the verification page. Authentication boundaries invalidate older state requests, sign-out clears private cards immediately, and only the current owner’s tickets are rendered.

`npm run test:tickets` checks an existing disposable DEMO account using a gitignored credentials file (`TEST_ACCOUNT_FILE`, default `test-output/onboarding-browser-account.json`). Obtain that file with `npm run test:onboarding` on the isolated demo first. The ticket-history check sends only public/private GET requests and test-session login/logout; it never registers, buys, advances clocks or settles. Credentials must not be committed. See [acceptance details](票据记录与开奖状态优化验收.md).

The separate **Ticket browser and mobile acceptance** GitHub Actions workflow runs isolated Chromium/WebKit browsers. Pushes and PRs exercise localhost fixtures and a real local D1/R2 account. A manual `main` run with `online=true` additionally prepares one disposable DEMO ticket through the API, checks the real browser interface, and visits LIVE with API writes blocked. It uploads only measurements and PNGs, excluding credential files, cookies and authentication traces. This workflow is independent of desktop browser-control permissions; see [browser and mobile evidence](我的彩票浏览器与移动端验收.md).

## Readable verification page

`/verify.html?round=ROUND_ID` explains a selected public round in Chinese, English or Japanese. Without an ID it selects a current public round from `/api/state`. Rules, source requirements and times come from that round's manifest, not a separate marketing configuration. The page downloads settled evidence from `/api/proof/{round}` and independently recalculates the hashes and all game numbers in the browser.

`GET /api/round/{round}` returns `{serverTime,demo,round,anchor,attempts}`. The `round` object contains only `id,status,manifest,commitment,cutoff,ready,proof`; `manifest` and `proof` are parsed objects, and `proof` is null before settlement. Attempts are scoped to the requested round. No user accounts, sessions, private source response bodies or per-user tickets are returned. Both this endpoint and the manifest attachment return 404 for unknown or draft rounds. IDs contain 1–80 ASCII letters, digits or hyphens. Responses use `Cache-Control: no-store`.

The manifest attachment returns the stored original string without pretty-printing, so its exact bytes can be checked against the published commitment. The existing proof download remains the original R2 archive. Local browser checks establish consistency with the selected public manifest, deterministic numbers, declared source metadata, recorded timing and proof-internal pool arithmetic. They do not authenticate private source responses, establish an independent trusted timestamp or audit every ticket and payment. DEMO and ONLINE_REPLAY remain visibly identified.

## Anonymous-source research endpoint

`POST /api/admin/check-public-sources` accepts `{symbol,date}` for AAPL/MSFT/IBM. It fetches Yahoo Finance and Nasdaq without API keys, archives source responses privately to R2, and returns a redacted diagnostic report. Requires the admin Bearer token. Returns 200 on two agreeing observations, 409 on unavailable/conflicting data. No tickets or payouts are created; existing LIVE manifests are unaffected.

## Earlier LIVE profile update (superseded for new v2 preparation)

The existing v1 LIVE period uses `PUBLIC-NOKEY-v1`, sources exactly YahooFinance + Nasdaq (2/2). Older KEYED-v1 manifests retain their pinned collection logic; KEYED-v1 is no longer an opt-in for new preparation. The reviewed calendar, immutable GitHub manifest reference and lack of time overrides remain in place. v2 adds the freeze/beacon protocol and pause restrictions described above. See LIVE接入与线上验收.md for the original future period and separated replay evidence, and [hardening acceptance](随机性与防作弊改进上线验收.md) for the current release.

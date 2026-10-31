# Security and trust model

This is an experimental virtual-points application, not a real-money lottery. Do not use it to accept deposits, enable withdrawals, or promise monetary prizes.

For a vulnerability, use the repository's private vulnerability reporting feature when enabled. Do not publish credentials, account details or an exploit against a running instance in a public issue. If private reporting is unavailable, contact the repository owner privately first.

Known boundaries:

- Providers can be wrong or correlated. Two matching quotes are not a cryptographic proof of exchange finality.
- The operator controls Workers code, D1 and R2. R2 is durable storage, not immutable notarization. The anchor URL is an operator-provided reference; this app does not independently verify its publication timestamp.
- MD5 is a compatibility fingerprint, not a secure commitment. SHA-256 is used for commitments and sampling.
- Registration has persistent HMAC-IP rate limits (LIVE: 5 registrations per fixed hour bucket; DEMO: 50; login: 60 attempts per fixed minute). The secret stays on the server and raw IPs are not stored in the limit table. This is not proof of one person per account: proxies, shared NAT and distributed signup abuse remain limitations. There is still no email verification or CAPTCHA.
- Calendar values are reviewed and supplied by an operator. There is no automatic global holiday calendar integration.
- UI lists show the most recent records. Cursor-based ledger and winner history are not implemented yet.
- No production penetration test or provider-account live test has been performed.

Security-sensitive changes require relevant tests and an explicit update to the trust model. Report which release and runtime you used.

## Versioned hardening

Existing v1/v2 rounds retain their original input, seed, mapping and payouts. v2 freezes the first exact two-source consensus in an insert-once D1 row, derives a specific quicknet round at least 120 seconds after the database seal time, and verifies the pinned chain's BLS signature before settlement. New preparation now creates v3, described below. It never selects a newer beacon on failure or re-collects a different price snapshot. API/SQL pause is refused after a v2/v3 snapshot exists. Cloudflare account owners can still stop the service or remove protections; database time alone is not an independent timestamp.

BLS work runs in a same-account SQLite Durable Object, whose execution budget supports verification on the Free plan. The normal Worker cannot substitute a boolean from a browser request or pick a public key. Browser and CLI verification perform BLS verification themselves. This object is computation isolation, not an independent operator or witness. Quota exhaustion leaves a v2 round waiting.

Ticket terms, settlement authorizations, public round deletion, published proof replacement, anchors, collection history and ledger rewriting are protected by additive database triggers. Settlement atomically records exact per-ticket authorized amounts and grades and checks the pool/ticket snapshot. These guards reduce application and limited database-write attacks, but do not survive an administrator dropping the triggers. They do not authenticate arbitrary ledger inserts or certify the complete historical ledger.

`ABUSE_IP_KEY` is required for public LIVE authentication. Generate a separate random server secret per installation, configure it with Wrangler secrets, and never commit it. Local DEMO tests may omit it; public installations must configure it and check `/api/randomness-health`. Rotation resets the effective rate-limit identity buckets without changing user balances or sessions.

New sessions store only `s2:` plus a domain-separated SHA-256 token digest. Existing raw sessions are recognized and transparently converted on first legitimate use without changing their cookies or expiry. A stored digest cannot be used as a Cookie. Already stolen raw cookies still require revocation, and database write/deployment privileges remain trusted. This is not a full password, account-recovery or identity audit.

Read the earlier threat model in [随机性与防作弊改进方案.md](随机性与防作弊改进方案.md). No per-person identity guarantee or professional penetration test is claimed.

## v3 independent witnesses and hidden commitments

v3 binds a CSPRNG permutation plus 256-bit nonce with both MD5 and SHA-256. MD5 alone is not binding. AES-256-GCM protects private D1 envelopes from a read-only database leak without the deployment secret; it does not hide them from a root operator. Preserve and securely back up `COMMIT_ENCRYPTION_KEY`; never blindly regenerate it for an existing installation with unrevealed rounds. Key loss or intentional withholding can prevent settlement. There is no independent secret escrow or forced reveal.

Presale rules and the first frozen price snapshot obtain external Rekor v1 hashedrekord receipts. Upload intent bytes are fixed before sending, and receipts cannot be replaced. Validate the artifact signature, pinned independent log key/ID, signed integration time, Merkle inclusion, shard and checkpoint signature. v3 selects the future beacon from the conservative end of the independently signed freeze second; a root operator cannot merely backdate D1 to obtain a past beacon under the published protocol. Reveals and settlement/payment changes commit atomically. Public verification remains versioned.

Rekor's key is not controlled by this project's Cloudflare/GitHub accounts, but its v1 clock and log honesty are trusted. A valid inclusion is not a global consistency or availability proof, nor proof of truthful stock data, continuous public visibility or the complete ledger. The log stores hashes of public artifacts; preserve record contents with receipts. Rekor v1 is maintained, not an interchangeable service: later key/log migrations require a new protocol, never a silent sold-round change. Root operators can still stop or fork service, refuse to reveal, or remove application protections. Future-beacon unpredictability remains essential even when the operator knows the hidden nonce.

See [v3 plan and remaining limits](隐藏顺序承诺与独立见证改进方案.md). Controlled expedited-calendar replays and synthetic failure-injection log tests are clearly labelled and never claim a natural market draw.

Only fixed witness-record content enters the seed; refreshed checkpoints and receipt JSON formatting cannot change results. Log inclusion does not establish global candidate uniqueness. A root operator may pre-witness multiple candidate snapshots and hide alternatives; clients should archive the published freeze before the future beacon. Enforcing the first record across malicious root operators requires an independent stateful per-round witness/monitor and governance, which this release does not claim to provide.

## Public GitHub archive observer

The core archive runs in GitHub Actions and pulls public GET endpoints. Its repository write token never enters Workers or any request to the lottery service. It preserves exact manifest, snapshot payload, witness record, reveal and proof bytes, and retains the first valid receipt for each stage. Replacing a fixed fact, hiding an archived public round, removing a snapshot/proof or changing an earlier ledger prefix fails the archive run. A paginated public ledger omits user IDs, signup records, account fields and private tickets. Private-field regressions are rejected before writing public proof files.

This is an asynchronous observer and public replica, not GitHub certification or a globally unique first-record service. A five-minute schedule may be delayed and can observe a freeze after its future beacon. Original presale commits, independent log timestamps, observer timestamps and archive commits have different meanings. GitHub root owners can still modify workflows, force-push or delete the repository; save independent clones and pinned commits. Large histories require future segmentation and retention planning. Existing sold rules are never gated on this new observer.

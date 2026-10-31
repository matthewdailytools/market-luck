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

Already sold v1 rounds retain their original input, seed, mapping and payouts. New LIVE preparation produces v2 only. v2 freezes the first exact two-source consensus in an insert-once D1 row, derives a specific quicknet round at least 120 seconds after the database seal time, and verifies the pinned chain's BLS signature before settlement. It never selects a newer beacon on failure or re-collects a different price snapshot. API/SQL pause is refused after a v2 snapshot exists. Cloudflare account owners can still stop the service or remove protections; the database timestamp is not an independent timestamp.

BLS work runs in a same-account SQLite Durable Object, whose execution budget supports verification on the Free plan. The normal Worker cannot substitute a boolean from a browser request or pick a public key. Browser and CLI verification perform BLS verification themselves. This object is computation isolation, not an independent operator or witness. Quota exhaustion leaves a v2 round waiting.

Ticket terms, settlement authorizations, public round deletion, published proof replacement, anchors, collection history and ledger rewriting are protected by additive database triggers. Settlement atomically records exact per-ticket authorized amounts and grades and checks the pool/ticket snapshot. These guards reduce application and limited database-write attacks, but do not survive an administrator dropping the triggers. They do not authenticate arbitrary ledger inserts or certify the complete historical ledger.

`ABUSE_IP_KEY` is required for public LIVE authentication. Generate a separate random server secret per installation, configure it with Wrangler secrets, and never commit it. Local DEMO tests may omit it; public installations must configure it and check `/api/randomness-health`. Rotation resets the effective rate-limit identity buckets without changing user balances or sessions.

New sessions store only `s2:` plus a domain-separated SHA-256 token digest. Existing raw sessions are recognized and transparently converted on first legitimate use without changing their cookies or expiry. A stored digest cannot be used as a Cookie. Already stolen raw cookies still require revocation, and database write/deployment privileges remain trusted. This is not a full password, account-recovery or identity audit.

Read the threat model in [随机性与防作弊改进方案.md](随机性与防作弊改进方案.md). No new independent timestamping service, per-person identity guarantee or professional penetration test is claimed.

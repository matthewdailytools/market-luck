# Security and trust model

This is an experimental virtual-points application, not a real-money lottery. Do not use it to accept deposits, enable withdrawals, or promise monetary prizes.

For a vulnerability, use the repository's private vulnerability reporting feature when enabled. Do not publish credentials, account details or an exploit against a running instance in a public issue. If private reporting is unavailable, contact the repository owner privately first.

Known boundaries:

- Providers can be wrong or correlated. Two matching quotes are not a cryptographic proof of exchange finality.
- The operator controls Workers code, D1 and R2. R2 is durable storage, not immutable notarization. The anchor URL is an operator-provided reference; this app does not independently verify its publication timestamp.
- MD5 is a compatibility fingerprint, not a secure commitment. SHA-256 is used for commitments and sampling.
- Registration has no email verification, CAPTCHA or anti-Sybil control. Signup points can be farmed; production needs rate limiting and account abuse controls.
- Calendar values are reviewed and supplied by an operator. There is no automatic global holiday calendar integration.
- UI lists show the most recent records. Cursor-based ledger and winner history are not implemented yet.
- No production penetration test or provider-account live test has been performed.

Security-sensitive changes require relevant tests and an explicit update to the trust model. Report which release and runtime you used.

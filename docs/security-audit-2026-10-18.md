# Security review — 2026-10-18

## Scope and method

Source review of Worker authentication, admin authorization, project ownership, OAuth, payment processing, uploads, push delivery and Google/Apps Script integration. Adversarial tests run against isolated SQLite fixtures and mocked external services. Production checks are low-rate, read-only HTTP requests; no customer data, payments or Zalo messages are changed. This is a scoped application review, not a guarantee that every vulnerability has been found.

## Findings addressed

| Finding | Impact | Remediation |
| --- | --- | --- |
| Google login nonce was single-use but not tied to the initiating browser | Login CSRF: a callback initiated elsewhere could establish the wrong identity in a victim browser | Require an unpredictable `__Host-` HttpOnly/Secure cookie matching the nonce for popup and redirect login. Cross-site Google form POST requires SameSite=None. Keep signature, issuer, audience, expiry and one-use nonce validation. |
| Google Drive OAuth callback bypassed the usual blocked-user route guard | A blocked admin with an existing session could complete an in-flight connection | Recheck blocked status before processing the callback. |
| Image/showcase uploads read the full body before enforcing size; voice uploads trusted declared size | Oversized or falsely sized requests could consume memory or exceed intended limits | Count bytes while streaming, cancel on overflow, and only store validated bounded data. |
| Dynamic responses did not consistently carry browser security headers | Missing defense against framing, content sniffing and accidental caching of admin/auth responses | Apply nosniff, frame denial, referrer restrictions, HTTPS HSTS and no-store on admin/auth responses. Preserve the existing static application CSP. |
| Push endpoint allowlist accepted unnecessary URL components and followed redirects | Unnecessary outbound-request attack surface | Reject embedded credentials, custom ports and fragments; revalidate stored endpoints and refuse redirects. |

## Validation

- Actual Worker requests: anonymous, forged session, ordinary member, cross-origin admin mutations and blocked admin are denied. Members cannot read or modify another user's project.
- Google login: browser-cookie mismatch and nonce replay rejected; RSA signature tampering, wrong audience/issuer/nonce, expired/future-issued tokens, unverified email and unsigned JWT rejected. Worker callback without the browser cookie cannot set a login session.
- Oversized chunked upload with falsely small Content-Length is rejected before bucket storage.
- Push allowlist rejects credential-bearing, non-HTTPS, lookalike-host, custom-port and fragment URLs.
- Regression tests cover Google OAuth state/PKCE/encryption, JSON byte limits, payment idempotence and stale runner leases.
- TypeScript check and production web build pass. Dependency audit reports zero known vulnerabilities at review time; that does not assess application logic or unpublished dependency vulnerabilities.

## Operational boundaries and follow-up

Cloudflare account security, WAF/rate-limit configuration, DNS, Google account grants and production secrets were not independently audited. Use MFA for hosting/GitHub/Google administrators and review who has owner access. Do not expose shared runner or bridge keys in client-side code. Rotate credentials if their disclosure is suspected; this review does not establish that any credential was leaked.

No brute-force, denial-of-service or destructive production exploitation was performed. An authenticated visual browser check of Google login remains necessary after deployment, particularly across mobile privacy settings that can block cookies. Third-party service behavior and infrastructure controls remain outside the isolated tests.

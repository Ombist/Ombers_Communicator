# Ombist iOS: client certificates for mTLS to Ombers ingress

When Nginx (or another ingress) terminates **mutual TLS** (`ssl_verify_client on`), every **HTTPS** and **WSS** connection from the device must present a **client certificate** trusted by the ingress **client CA**.

This is **in addition to** (not a replacement for):

- **Server TLS** validation and **leaf public-key pinning** for the relay host ([ios-tls-pins-for-wss-ingress.md](./ios-tls-pins-for-wss-ingress.md)).
- **`OMBERS_AUTH_TOKEN`** / Middleware Bearer token on WebSocket upgrade, if enabled on Ombers.

Ombers remains a **payload relay**; mTLS only strengthens **who may open a TLS connection** to the ingress.

## Current app behavior (baseline)

Today, Ombist iOS uses `URLSession` / `URLSessionWebSocketTask` with **server** trust and optional **leaf SHA-256 pins** ([`WebSocketService.swift`](../../Ombist_IOS/Ombist_IOS/Services/WebSocketService.swift), [`RelayProbeHTTPSession.swift`](../../Ombist_IOS/Ombist_IOS/Services/RelayProbeHTTPSession.swift)). **Client certificate authentication to the relay is not implemented in this repository** as of this document; operators enabling **mandatory** mTLS on the relay must plan an app or MDM delivery path before cutover.

## Recommended delivery options

| Approach | Pros | Cons |
|----------|------|------|
| **MDM / configuration profile** | Central enrollment, revocation, aligns with enterprise internal PKI; private keys can be non-exportable. | Requires MDM investment; test flight vs production profiles. |
| **In-app PKCS#12 import** | Works without MDM; user or admin supplies `.p12` once. | Key handling risk; UX and secure storage (Keychain) must be designed; rotation prompts. |
| **Platform SSO / managed app config** | Varies by vendor; may wrap client cert provisioning. | Integration-specific. |

**Threat model notes:**

- Treat **client private keys** like long-lived API secrets: prefer **short-lived** client certs and automation.
- **Revocation:** plan how to block lost devices (CA revoke list, short TTL, or disable identity server-side).

## Engineering checklist (when implementing in the app)

1. **Identity in Keychain:** Import or receive client cert + private key as `SecIdentity` (e.g. PKCS#12 with user-supplied password, or MDM-installed identity).
2. **`URLSession` delegate:** Implement `urlSession(_:didReceive:completionHandler:)` for **`NSURLAuthenticationMethodClientCertificate`** and supply `URLCredential(identity:certificate:)` when the server requests a client cert.
3. **Apply to all relay TLS connections:** Same delegate (or shared credential) for **WebSocket**, **`/health`**, **`/relay-peers`**, and any **pin manifest** fetch if those hosts also require mTLS (manifest fetch today uses **system** `URLSession.shared` without client cert — a **bootstrap deadlock** can occur if the manifest host **also** requires the same mTLS cert; host manifest on a URL that does not require client cert, or extend manifest fetch to use an ephemeral session with client identity).
4. **QA matrix**

| Case | Expected |
|------|----------|
| No client identity, ingress `ssl_verify_client on` | TLS or HTTP failure; no relay session. |
| Valid client identity, valid server + pin | WebSocket upgrade succeeds; health probes return 200. |
| Valid client identity, wrong server pin | TLS / pin failure (same as today without mTLS). |
| Valid client identity, missing `OMBERS_AUTH_TOKEN` when required | **401** on upgrade (Ombers unchanged). |
| Expired or revoked client cert | TLS handshake failure at Nginx. |

5. **Staging:** Use `ssl_verify_client optional` first, measure failure rate, then `on`.

## Related

- Nginx mTLS layout: [nginx-mtls-ingress.md](./nginx-mtls-ingress.md)
- Server leaf pins: [ios-tls-pins-for-wss-ingress.md](./ios-tls-pins-for-wss-ingress.md)

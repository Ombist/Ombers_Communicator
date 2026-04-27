# iOS TLS public-key pinning (WSS ingress operators)

When Ombist iOS connects with **`wss://`** to a non-localhost relay host, production behavior uses **TLS** and may require **certificate pinning** (leaf DER SHA-256) before the WebSocket is opened. This is independent of the WebSocket path; only the **TLS server certificate** presented on the ingress matters.

## Operator checklist (align with WSS Nginx)

1. **Ingress certificate**  
   Use a real CA (e.g. Let’s Encrypt) or an enterprise chain that devices trust **or** plan to rely entirely on **pins** (private CA / tailnet-only names often need pins).

2. **Compute the leaf pin** (64 lowercase hex chars, no colons) from the **leaf** cert the client sees:

   ```bash
   echo | openssl s_client -servername relay.example.com -connect relay.example.com:8443 2>/dev/null \
     | openssl x509 -outform DER | shasum -a 256 | awk '{print tolower($1)}'
   ```

   See also [../README.md](../README.md) (Ingress TLS / leaf fingerprint) and [ADR-002: TLS Public Key Pinning](../../docs/adr/ADR-002-tls-public-key-pinning.md).

3. **Deliver pins to clients**

   - **Signed manifest** (recommended for rotation): [../../docs/ios-pin-rotation-calendar.md](../../docs/ios-pin-rotation-calendar.md); sign and verify with **[Ombifest](../../Ombifest/README.md)** ([SPEC](../../Ombifest/SPEC.md)). Legacy entrypoint [../../docs/tools/sign-pin-manifest.mjs](../../docs/tools/sign-pin-manifest.mjs) forwards to the same CLI. Configure `OMBIST_PIN_MANIFEST_URL` / `OMBIST_PIN_MANIFEST_PUBLIC_KEY_HEX` in the app Info.plist (or UserDefaults override for URL).
   - **Dual-pin helper**: [../../docs/tools/build-relay-pin-manifest.sh](../../docs/tools/build-relay-pin-manifest.sh) or `node ../../Ombifest/src/cli.js build-relay …` — produces a signed manifest from the current relay leaf cert plus optional next pin.
   - **UserDefaults / MDM**: `clawchat_pinned_cert_sha256` — comma-separated leaf pins (union with manifest).

4. **Rotation without outage**  
   Keep **at least two** valid leaf pins (current + next) for the overlap window; publish the next pin **before** cutover. Full timeline: [../../docs/ios-pin-rotation-calendar.md](../../docs/ios-pin-rotation-calendar.md). Gameday-style verification: [../../docs/operations/cert-rotation-gameday.md](../../docs/operations/cert-rotation-gameday.md).

5. **Same host for health and WSS**  
   After ingress is TLS-only on the relay ports, iOS health and relay-peers probes use **`https://`** on those same ports (aligned with `wss://`). Plain `http://` upstream is only between Nginx and Ombers on loopback.

## Code references (Ombist iOS)

- Pin format and `WebSocketService`: `Ombist_IOS/Services/WebSocketService.swift`
- Manifest fetch: `Ombist_IOS/Services/PinManifestService.swift`
- Scheme (`wss` / `https`): `Ombist_IOS/Services/SettingsService.swift`

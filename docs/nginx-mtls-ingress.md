# Nginx TLS + mutual TLS (mTLS) in front of Ombers Communicator

This document extends [nginx-wss-ingress.md](./nginx-wss-ingress.md): same **dual-port** layout (phone `P`, machine `P+1`), same WebSocket `Upgrade` headers, but adds **client certificate verification** at Nginx so only holders of a valid **client cert** (issued by your **client CA**) can complete TLS and reach Ombers upstream.

Ombers itself remains a **pure relay** ([`index.js`](../index.js)); it does **not** terminate mTLS. Terminate **server TLS + mTLS at Nginx**, then `proxy_pass` to **loopback HTTP** on Ombers.

## Ombers bind address and internal ports

When Nginx fronts the relay:

| Component | Bind | Ports |
|-----------|------|--------|
| **Ombers (Node)** | `LISTEN_ADDRESS=127.0.0.1` | Internal `PHONE_PORT` / `MACHINE_PORT` (e.g. `18080`, `18081`) — **not** the public TLS ports |
| **Nginx** | `0.0.0.0` (or tailnet IP) | Public TLS **8443** (phone), **8444** (machine) — must match team relay settings in Ombist iOS (`PHONE` and `PHONE+1`) |

Set the iOS team relay **phone port** to the **Nginx TLS** phone port (e.g. `8443`). The app derives machine port as **phone + 1** ([`RelaySettingsResolver.swift`](../../Ombist_IOS/Ombist_IOS/Services/RelaySettingsResolver.swift)).

Never bind Nginx TLS to the same TCP port Ombers uses on loopback without a port offset (see the port conflict table in [nginx-wss-ingress.md](./nginx-wss-ingress.md)).

## PKI roles

| Role | Typical use |
|------|-------------|
| **Server certificate** | Public CA (e.g. Let’s Encrypt) or internal CA; presented to clients as the **ingress leaf** (iOS **leaf pin** targets this cert — see [ios-tls-pins-for-wss-ingress.md](./ios-tls-pins-for-wss-ingress.md)). |
| **Client CA (`ssl_client_certificate`)** | PEM bundle of the CA (or chain) that signs **Ombot** and **Ombist iOS** **client** certificates. Nginx verifies client certs against this trust anchor. |
| **Client certificates** | One identity per machine (Ombot) and/or per device (iOS); short-lived certs + automation preferred over long-lived static files. |

**Issuance, renewal, revocation:** use a single internal pipeline (Vault PKI, Smallstep, AD CS, etc.). Prefer **short TTL** + automated renew over manual CRL unless you already operate OCSP/CRL. Document **device loss**: revoke or block serial, rotate CA if compromised.

See [operations/runbook.md](./operations/runbook.md) **mTLS and client PKI** for on-call checks.

## Nginx: dual `server` blocks with mTLS

Shared `http` context: keep the same `map` for WebSocket upgrades as [nginx-wss-ingress.md](./nginx-wss-ingress.md).

Replace certificate paths, upstream ports, and CA paths with your values.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# Phone side — mTLS required after rollout
server {
    listen 8443 ssl;
    listen [::]:8443 ssl;
    server_name relay.example.com;

    ssl_certificate     /etc/ssl/relay/fullchain.pem;
    ssl_certificate_key /etc/ssl/relay/privkey.pem;

    ssl_client_certificate     /etc/ssl/relay/client-ca-chain.pem;
    ssl_verify_client          on;
    ssl_verify_depth           3;

    # Optional: log client subject for audit
    # access_log /var/log/nginx/relay-phone-mtls.log combined;

    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Optional: forward client cert DN to upstream (Ombers ignores by default)
        # proxy_set_header X-Client-Cert-S-DN $ssl_client_s_dn;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}

server {
    listen 8444 ssl;
    listen [::]:8444 ssl;
    server_name relay.example.com;

    ssl_certificate     /etc/ssl/relay/fullchain.pem;
    ssl_certificate_key /etc/ssl/relay/privkey.pem;

    ssl_client_certificate     /etc/ssl/relay/client-ca-chain.pem;
    ssl_verify_client          on;
    ssl_verify_depth           3;

    location / {
        proxy_pass http://127.0.0.1:18081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Paths for clients (unchanged except TLS now requires a client cert):

- **WebSocket:** `wss://relay.example.com:8443/ws/<sessionKey>` (phone), `wss://relay.example.com:8444/ws/<sessionKey>` (machine).
- **Health:** `GET https://…:8443/health` and `GET https://…:8444/health` — with **`ssl_verify_client on`**, plain `curl` without a client cert **fails** (see below).

## Rollout: `optional` → `on`

1. **Week 0–1:** Set `ssl_verify_client optional;` on both servers. Valid clients with certs succeed; clients without certs may still connect (depending on Nginx/OpenSSL behavior for `optional` — monitor `$ssl_client_verify`).
2. **Monitor:** Log or metric on failed handshakes / `400` responses; ensure Ombot and iOS are enrolling client certs before forcing.
3. **Cutover:** Set `ssl_verify_client on;` on both ports together so phone and machine paths stay symmetric.
4. **If you use `OMBERS_AUTH_TOKEN`:** Keep it enabled during rollout; mTLS and Bearer token are **orthogonal** (TLS identity vs application upgrade auth).

## Health checks and monitoring

With **`ssl_verify_client on`**, external synthetic checks must present a **valid client certificate**:

```bash
curl -fsS --cert /path/to/probe.crt --key /path/to/probe.key \
  "https://relay.example.com:8443/health"
curl -fsS --cert /path/to/probe.crt --key /path/to/probe.key \
  "https://relay.example.com:8444/health"
```

Alternatives (choose one, document it in your environment):

- **Dedicated internal listener** (same host, firewall-restricted) with `ssl_verify_client optional` **only** for `location = /health` — higher operational risk if mis-exposed; prefer mTLS-capable probes.
- **Probe from loopback** to Ombers **directly** on `http://127.0.0.1:18080/health` (bypasses Nginx) — validates Ombers only, **not** the public TLS+mTLS path; combine with occasional mTLS `curl` above.

Ombist iOS relay health probes use **HTTPS** on the same ports as `wss`; until the app presents a **client identity**, health checks against **mandatory mTLS** ingress will fail unless you use one of the patterns above. See [ios-client-mtls.md](./ios-client-mtls.md).

## Coexistence with `OMBERS_AUTH_TOKEN`

Ombers still validates `Authorization: Bearer` (or `?token=`) on WebSocket upgrade when configured. Nginx mTLS does **not** remove the need for token configuration unless you deliberately disable token auth after a threat-model review.

## Client implementation pointers

- **Ombot:** [Ombot README](../../Ombot/README.md) — `MIDDLEWARE_TLS_CLIENT_CERT_PATH` / `MIDDLEWARE_TLS_CLIENT_KEY_PATH` (optional `MIDDLEWARE_TLS_CA_PATH`).
- **Ombist iOS:** [ios-client-mtls.md](./ios-client-mtls.md) (MDM vs in-app identity, QA matrix).

## Reference deployment

Optional Docker Compose (Nginx + Ombers on one host): [../docker-compose.mtls.example.yml](../docker-compose.mtls.example.yml).

## Verification checklist (acceptance)

1. **No client cert:** TLS handshake fails or Nginx returns **400** / connection reset; Ombers logs **no** new WebSocket upgrade from the public path.
2. **Valid client cert + valid server chain:** `curl` health with `--cert/--key` returns **200** and Ombers JSON on both ports; `wscat` or clients can upgrade WebSocket.
3. **End-to-end:** Phone and machine use the **same** `sessionKey` path; relay forwards as today.
4. **With `OMBERS_AUTH_TOKEN`:** Missing or wrong token still yields **401** on upgrade (unchanged Ombers behavior).
5. **Server leaf rotation:** iOS **leaf pin** dual-pin overlap still applies ([ios-pin-rotation-calendar.md](../../docs/ios-pin-rotation-calendar.md)); rotating **client** certs does not change server leaf pin unless you also change the ingress server certificate.

## Related

- TLS termination without mTLS: [nginx-wss-ingress.md](./nginx-wss-ingress.md)
- iOS server leaf pins: [ios-tls-pins-for-wss-ingress.md](./ios-tls-pins-for-wss-ingress.md)
- iOS client certs: [ios-client-mtls.md](./ios-client-mtls.md)
- On-call: [operations/runbook.md](./operations/runbook.md)

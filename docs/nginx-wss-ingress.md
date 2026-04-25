# Nginx TLS termination for Ombers Communicator (mandatory WSS)

Ombers listens on **plain HTTP** and upgrades to WebSocket. For production, terminate **TLS at Nginx** (or Caddy/Traefik) so clients use **`wss://` and `https://`** on the same host/ports that Ombist iOS expects for [PHONE and MACHINE = PHONE + 1](../../Ombist_IOS/Ombist_IOS/Services/RelaySettingsResolver.swift).

## Why two external ports

The relay uses **two TCP listeners** (phone side and machine side). Nginx must expose **two TLS ports** whose numbers match the team relay settings (phone port `P`, machine port `P+1`), unless you use a more advanced routing scheme (not covered here).

## Avoid port bind conflicts

Nginx cannot `listen 8080 ssl` and forward to the same host’s `8080` where Node already listens. Typical layout:

| Role | Bind | Ports |
|------|------|--------|
| Ombers (Node) | `127.0.0.1` only if using `LISTEN_ADDRESS=127.0.0.1` | e.g. `18080` (phone), `18081` (machine) via `PHONE_PORT` / `MACHINE_PORT` in `.env` |
| Nginx | `0.0.0.0` or tailnet IP | e.g. `8443` (TLS → phone upstream), `8444` (TLS → machine upstream) |

Set the **iOS team relay “phone port”** to the **TLS port** clients use (e.g. `8443`). The app derives machine port as **phone + 1** (`8444`).

## Example: two `server` blocks

Replace certificate paths and upstream ports with your values. `map` is shared once in `http` context.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# Phone side (MIDDLEWARE_WS_URL / iOS wss host:PHONE_PORT)
server {
    listen 8443 ssl;
    listen [::]:8443 ssl;
    server_name relay.example.com;

    ssl_certificate     /etc/ssl/relay/fullchain.pem;
    ssl_certificate_key /etc/ssl/relay/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:18080;
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

# Machine side (Ombot wss host:MACHINE_PORT)
server {
    listen 8444 ssl;
    listen [::]:8444 ssl;
    server_name relay.example.com;

    ssl_certificate     /etc/ssl/relay/fullchain.pem;
    ssl_certificate_key /etc/ssl/relay/privkey.pem;

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

Paths used by clients:

- **WebSocket (multiplex):** `wss://relay.example.com:8443/ws/<sessionKey>` (phone), `wss://relay.example.com:8444/ws/<sessionKey>` (machine).
- **Health:** `GET https://relay.example.com:8443/health` and `GET https://relay.example.com:8444/health` (same paths Ombers serves on plain HTTP upstream).

## Optional `/relay-peers`

If `OMBERS_EXPOSE_RELAY_PEERS=1`, the same `location /` proxy forwards `GET /relay-peers`. When Ombers requires auth, send `Authorization: Bearer <token>` from the client (iOS does this for relay-peers when a middleware token is configured).

## Lock down metrics

Do **not** expose `GET /metrics` on untrusted networks. Restrict with `location /metrics { deny all; }` or a separate internal-only `server` block.

## Verify

```bash
curl -fsS "https://relay.example.com:8443/health"
curl -fsS "https://relay.example.com:8444/health"
```

Use `wscat` or the iOS app to confirm WebSocket upgrade over TLS.

## Related

- Ombers env and security: [../README.md](../README.md)
- Firewall layers: [../../docs/relay-internal-firewall.md](../../docs/relay-internal-firewall.md)
- iOS certificate pins when using `wss`: [ios-tls-pins-for-wss-ingress.md](./ios-tls-pins-for-wss-ingress.md)

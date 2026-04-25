# Ombers Communicator

WebSocket relay between OpenClaw Machine and Phone. No crypto; only forwards messages.

**Architecture:**  
`OpenClaw Machine <-> Ombers Communicator (this) <-> Phone`

## Setup

```bash
cd Ombers_Communicator
npm install
```

## Production user and permissions (`omber`)

Run the service as a dedicated non-root user instead of `root`.

1. Create service user/group and app directory permissions:

```bash
cd Ombers_Communicator
sudo ./scripts/setup-omber-user.sh
```

2. Copy release files to `/opt/ombers/ombers-communicator` and grant ownership:

```bash
sudo rsync -a --delete ./ /opt/ombers/ombers-communicator/
sudo chown -R omber:omber /opt/ombers/ombers-communicator
```

3. Install the systemd unit and start service as `omber`:

```bash
sudo cp ombers-communicator.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ombers-communicator
sudo systemctl status ombers-communicator
```

4. Ongoing operations:

```bash
sudo systemctl restart ombers-communicator
sudo journalctl -u ombers-communicator -f
```

**Ombist iOS**：經 SSH 佈署時會另外安裝系統 unit `ombist-ombers-communicator.service`（`User` 為 SSH 登入帳號、`ExecStart` 讀取 `~/ombers-communicator/.env.middleware` 的埠）。若你已在同一主機以手動 `ombers-communicator.service` 監聽相同 `PHONE_PORT`／`MACHINE_PORT`，兩套服務會衝突，請擇一或改用不同埠。

**Ombist iOS SSH 佈署前置**：App 以**非互動 SSH**執行遠端腳本，並在支援平台上**自動安裝** `git`、**Node.js（主版本見本目錄 `.nvmrc`）** 與 **`npm`**（Debian／Ubuntu、RHEL 系、macOS 之 Homebrew、Windows 之 winget），再載入 **`$NVM_DIR/nvm.sh`**、`nvm use default`、**`nvm use`**（讀 **`.nvmrc`**）、已裝版本 **`sort -V`**、**`nvm use node`**、**Volta**、**fnm**；最後寫入 systemd。**root**（或遠端無 `sudo`）可直接安裝；**非 root** 須 **`sudo -n`（免密碼 sudo）**。須可連 **NodeSource／registry** 之外網（稽核注意見 monorepo [Ombist_IOS/README.md](../Ombist_IOS/README.md)「通訊中繼 SSH 佈署」）。可先手動預裝 Node 18+ 以跳過套件升級；手動 **Ubuntu apt** 說明見該 README「Ubuntu（apt）」。Debian／Ubuntu 僅有 **`nodejs`** 指令時，佈署會嘗試銜接 **`node`**。請以 `ssh user@host 'command -v npm && command -v node && node -v && ( [ "$(id -u)" = 0 ] || sudo -n true )'` 驗證。

## Run

```bash
npm start
# or
MACHINE_PORT=8081 PHONE_PORT=8080 node index.js
```

## Test

```bash
npm test
```

Runs **unit tests** (`node --test test/*.test.js`) and an **integration** check (`tools/test-two-tunnels.mjs`) that two concurrent `sessionKey` tunnels do not cross.

```bash
npm run test:unit   # unit only
npm run test-multipair
```

## Internal-only (VPN / private network)

若 PHONE／MACHINE 埠**僅允許內網或 Tailscale／Headscale** 存取，請參考 monorepo 維運文件（連線方向、分層防火牆、`IP_ALLOWLIST` 不支援 CIDR 等）：

- [docs/relay-internal-firewall.md](../docs/relay-internal-firewall.md)
- Copy-paste **examples only** (`ufw` / `nft`): [docs/firewall-internal-examples.md](docs/firewall-internal-examples.md)

## TLS / WSS in front of Ombers (Nginx)

Ombers stays plain HTTP/WebSocket on loopback; Nginx terminates **TLS** so clients use **`wss://`** and **`https://`** on the relay ports. Step-by-step layout (dual TLS ports, internal `PHONE_PORT`/`MACHINE_PORT`, WebSocket `Upgrade` headers): [docs/nginx-wss-ingress.md](docs/nginx-wss-ingress.md). iOS **leaf pin** checklist and rotation pointers: [docs/ios-tls-pins-for-wss-ingress.md](docs/ios-tls-pins-for-wss-ingress.md).

## CI

In the **Ombist** monorepo, GitHub Actions runs quality and security gates in `Ombers_Communicator/` when this directory changes (see `../.github/workflows/ombers-communicator.yml`):

- lint + unit/integration tests
- dependency audit
- SBOM generation artifact
- image vulnerability scan (HIGH/CRITICAL blocks merge)

If you publish **only** this folder as its own repository, copy that workflow to `.github/workflows/ci.yml` at the **root** of that repo (or equivalent) and drop the `working-directory` / `paths` monorepo bits.

## Env

| Env | Default | Description |
|-----|---------|-------------|
| `MACHINE_PORT` | 8081 | Port for OpenClaw Machine connections |
| `PHONE_PORT` | 8080 | Port for Phone connections |
| `LISTEN_ADDRESS` or `BIND_ADDRESS` | `0.0.0.0` | TCP bind address for **both** listeners. Use `127.0.0.1` when only a local reverse proxy (e.g. Nginx) should reach Ombers; see [docs/nginx-wss-ingress.md](docs/nginx-wss-ingress.md) |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Max time for graceful shutdown before `exit 1` |
| `LOG_FORMAT` | _(unset)_ | Set to `json` for one JSON object per line (`ts`, `level`, `msg`, …) |
| `ENABLE_METRICS` or `METRICS_ENABLED` | _(off)_ | Set to `1` or `true` to expose Prometheus text on `GET /metrics` |
| `OMBERS_EXPOSE_RELAY_PEERS` | _(off)_ | Set to `1` or `true` to expose `GET /relay-peers` on **each** listener (PHONE and MACHINE ports): JSON `{ status, side, peers }` listing **remote** TCP addresses of open WebSockets on that port. When token auth is required for upgrades, the same `Authorization: Bearer` (or `?token=`) must be sent. Intended for operators (e.g. Ombist iOS team relay screen); do not expose on untrusted networks without TLS/proxy controls. |
| `OMBERS_USE_TLS` | _(off)_ | Set to `1` or `true` to enable native TLS on both listeners (`wss://` + `https://`) |
| `OMBERS_TLS_CERT_PATH` | _(required when TLS on)_ | Certificate PEM path used by Node `https.createServer()` |
| `OMBERS_TLS_KEY_PATH` | _(required when TLS on)_ | Private key PEM path used by Node `https.createServer()` |
| `WS_MAX_PAYLOAD_BYTES` | `104857600` | Max WebSocket message size (100 MiB) |
| `MAX_TOTAL_CONNECTIONS` | `0` | If &gt; `0`, refuse new WebSocket upgrades with HTTP **503** when total connections ≥ this value |
| `OMBERS_AUTH_TOKEN` | _(unset)_ | When set, enables token check on WebSocket upgrade (Bearer token or `?token=`) |
| `REQUIRE_AUTH_TOKEN` | auto | Force auth check on/off (`1`/`true` to require) |
| `IP_ALLOWLIST` or `OMBERS_IP_ALLOWLIST` | _(unset)_ | Comma-separated allowed source IPs; unset means allow all |
| `WS_UPGRADE_RATE_LIMIT_PER_MIN` | `120` | Per-IP max upgrade attempts per minute |

## Health check

On **both** ports, probe over HTTP(S) (not WebSocket):

- `GET /health` → `200` and `{"status":"ok","service":"ombers-communicator"}` (`http://` when TLS off, `https://` when TLS on)

When `OMBERS_EXPOSE_RELAY_PEERS=1`, **both** ports also serve:

- `GET /relay-peers` → `200` and `{"status":"ok","side":"phone"|"machine","peers":["…"],"service":"ombers-communicator"}` (remote IP list for open WebSockets on **that** port). Returns **404** if the feature is off. Uses the same token rules as WebSocket upgrades when auth is enabled.

Use this for load balancers, Docker `HEALTHCHECK`, or Kubernetes probes. Other HTTP methods/paths still get **404** (except `/metrics` when metrics are enabled, and `/relay-peers` when peer listing is enabled).

## Metrics (optional)

When `ENABLE_METRICS=true`, **both** ports serve:

- `GET /metrics` → Prometheus text (Content-Type from registry)

Counters / gauges include:

- `ombers_relay_messages_total{direction="phone_to_machine|machine_to_phone"}`
- `ombers_websocket_connections` (open sockets on both ports)
- `ombers_upgrade_rejections_total{reason="rate_limit|ip_not_allowed|auth_failed|capacity|invalid_path"}`
- `ombers_relay_errors_total{direction="phone_to_machine|machine_to_phone"}`
- Default Node/process metrics from `prom-client`

Expose `/metrics` only on internal networks or behind auth if you enable this in production.

## Graceful shutdown

On `SIGINT` or `SIGTERM`, the process closes all WebSocket clients, stops the WebSocket servers, then closes the HTTP listeners. If shutdown takes longer than `SHUTDOWN_TIMEOUT_MS`, the process exits with code `1`.

## Security and deployment

This service can enforce token auth and ingress controls at the relay layer. In production you should:

- Put **TLS** in front (reverse proxy or tunnel) so traffic is not cleartext on the Internet.
- Configure reverse proxy to force HTTPS + HSTS, and proxy only `/ws` + `/health` (and `/metrics` if required).
- Restrict **firewall / security groups** so only your Phone app path and Machine hosts can reach these ports.
- Require `OMBERS_AUTH_TOKEN` and enforce source `IP_ALLOWLIST`.
- Rely on **strong, unguessable `sessionKey` values** and end-to-end crypto on the clients (see protocol doc below).
- Keep `/metrics` internal-only (private network or protected endpoint).

Recommended ingress verification commands:

```bash
curl -I https://your-relay.example.com/health
curl -I https://your-relay.example.com/metrics   # should be blocked publicly unless intentionally exposed
```

## Ingress TLS certificate rotation (iOS “no surprise” alignment)

TLS usually terminates at the reverse proxy; the Communicator still sees plain HTTP/WebSocket. Coordinate leaf renewal with **client pin overlap** (see monorepo [docs/ios-pin-rotation-calendar.md](../docs/ios-pin-rotation-calendar.md)).

**Calendar (summary)**

- **T−30 / T−14 / T−7**: Alert on `notAfter`; track renewal job success in change log.
- **T−14 (or earlier)**: Publish the **next** leaf pin in the iOS signed manifest (and/or app defaults); verify on staging with `openssl s_client`.
- **T−0**: Install new leaf on ingress; keep **both** current and next pins valid until the overlap window ends.
- **T+window**: After TLS/pin failure metrics stay flat vs baseline, remove the old pin and retire the old cert.

**Verify chain and expiry**

```bash
echo | openssl s_client -servername your-relay.example.com -connect your-relay.example.com:443 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer
```

**Leaf fingerprint (matches iOS leaf DER SHA-256 pin)**

```bash
echo | openssl s_client -servername your-relay.example.com -connect your-relay.example.com:443 2>/dev/null \
  | openssl x509 -outform DER | shasum -a 256
```

Full checklist: [docs/operations/runbook.md](./docs/operations/runbook.md) (ingress TLS section).

Example secure run:

```bash
OMBERS_AUTH_TOKEN='replace-me' \
IP_ALLOWLIST='127.0.0.1,::1' \
WS_UPGRADE_RATE_LIMIT_PER_MIN=60 \
ENABLE_METRICS=true \
npm start
```

`boxCrypto.js` in this folder is a **reference** NaCl box helper aligned with clients; the relay **does not** import it.

## Protocol

Each port supports two path shapes (after HTTP Upgrade, traffic is WebSocket):

### Multiplex (recommended)

- **Machine:** `ws://host:MachinePort/ws/<sessionKey>`
- **Phone:** `ws://host:PhonePort/ws/<sessionKey>`

Under the same `sessionKey`, messages from one side are forwarded to the other. A new connection on the same side replaces the existing socket and closes it.

The `sessionKey` format is defined in the repo root [docs/clawchat-e2e-protocol.md](../docs/clawchat-e2e-protocol.md) (`SHA-256` + Base64url from normalized `agentId` and `conversationId`). You may pass the key through `encodeURIComponent` in the path; the server applies `decodeURIComponent`.

### Legacy (single pair)

- **Path:** `ws://host:port/ws` or `ws://host:port/ws/`
- The whole instance keeps at most **one** Phone and **one** Machine connection (legacy behavior).

## Implementation notes

- Node `http.createServer` + `WebSocketServer({ noServer: true })` for upgrade; `sessionKey` from `URL.pathname` (see `lib/parseSessionPath.js`).
- Plain HTTP: `GET /health` → **200**; `GET /metrics` when enabled; other paths → **404**.

## Operations and reliability docs

- SLO + error budget: [docs/operations/slo.md](./docs/operations/slo.md)
- On-call runbook: [docs/operations/runbook.md](./docs/operations/runbook.md)
- Incident template: [docs/operations/incident-template.md](./docs/operations/incident-template.md)
- GameDay playbook: [docs/operations/gameday.md](./docs/operations/gameday.md)
- Secrets rotation SOP: [docs/security/secrets-rotation.md](./docs/security/secrets-rotation.md)
- Security ADR: [docs/adr/ADR-001-security-baseline.md](./docs/adr/ADR-001-security-baseline.md)

## Deployment and rollback scripts

```bash
# rolling deploy
sudo ./scripts/deploy-rolling.sh

# rollback to a previously prepared release directory
sudo ./scripts/rollback.sh /opt/ombers/releases/2026-03-26T120000Z
```

## License

MIT — see [LICENSE](./LICENSE).

# Ombers Communicator

WebSocket relay between OpenClaw Machine and Phone. No crypto; only forwards messages.

**Architecture:**  
`OpenClaw Machine <-> Ombers Communicator (this) <-> Phone`

## Setup

```bash
cd Ombers_Communicator
npm install
```

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

## CI

In the **Ombist** monorepo, GitHub Actions runs `npm ci` and `npm test` in `Ombers_Communicator/` when this directory changes (see `../.github/workflows/ombers-communicator.yml`).

If you publish **only** this folder as its own repository, copy that workflow to `.github/workflows/ci.yml` at the **root** of that repo (or equivalent) and drop the `working-directory` / `paths` monorepo bits.

## Env

| Env | Default | Description |
|-----|---------|-------------|
| `MACHINE_PORT` | 8081 | Port for OpenClaw Machine connections |
| `PHONE_PORT` | 8080 | Port for Phone connections |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Max time for graceful shutdown before `exit 1` |
| `LOG_FORMAT` | _(unset)_ | Set to `json` for one JSON object per line (`ts`, `level`, `msg`, …) |
| `ENABLE_METRICS` or `METRICS_ENABLED` | _(off)_ | Set to `1` or `true` to expose Prometheus text on `GET /metrics` |
| `WS_MAX_PAYLOAD_BYTES` | `104857600` | Max WebSocket message size (100 MiB) |
| `MAX_TOTAL_CONNECTIONS` | `0` | If &gt; `0`, refuse new WebSocket upgrades with HTTP **503** when total connections ≥ this value |

## Health check

On **both** ports, plain HTTP (not WebSocket):

- `GET /health` → `200` and `{"status":"ok","service":"ombers-communicator"}`

Use this for load balancers, Docker `HEALTHCHECK`, or Kubernetes probes. Other HTTP methods/paths still get **404** (except `/metrics` when metrics are enabled).

## Metrics (optional)

When `ENABLE_METRICS=true`, **both** ports serve:

- `GET /metrics` → Prometheus text (Content-Type from registry)

Counters / gauges include:

- `ombers_relay_messages_total{direction="phone_to_machine|machine_to_phone"}`
- `ombers_websocket_connections` (open sockets on both ports)
- Default Node/process metrics from `prom-client`

Expose `/metrics` only on internal networks or behind auth if you enable this in production.

## Graceful shutdown

On `SIGINT` or `SIGTERM`, the process closes all WebSocket clients, stops the WebSocket servers, then closes the HTTP listeners. If shutdown takes longer than `SHUTDOWN_TIMEOUT_MS`, the process exits with code `1`.

## Security and deployment

This service **does not authenticate** clients. Anyone who can open TCP to `PHONE_PORT` and `MACHINE_PORT` can attach to `/ws` or `/ws/<sessionKey>`. In production you should:

- Put **TLS** in front (reverse proxy or tunnel) so traffic is not cleartext on the Internet.
- Restrict **firewall / security groups** so only your Phone app path and Machine hosts can reach these ports.
- Rely on **strong, unguessable `sessionKey` values** and end-to-end crypto on the clients (see protocol doc below).

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

## License

MIT — see [LICENSE](./LICENSE).

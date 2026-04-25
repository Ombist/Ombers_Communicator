/**
 * Ombers Communicator
 * Pure relay: no decrypt, no encrypt; every packet is forwarded as-is to the other side.
 * Phone and Machine use end-to-end encryption; the middleware cannot read payloads.
 * - MACHINE_PORT (8081): Machine connects here
 * - PHONE_PORT (8080): Phone connects here
 *
 * Multiplex: `/ws/<sessionKey>` — Phone and Machine sharing the same sessionKey are bridged.
 * Legacy (single pair): path is only `/ws` or `/ws/`, one Phone and one Machine for the whole instance.
 *
 * HTTP: `GET /health` (always), optional `GET /metrics` when ENABLE_METRICS=true,
 * optional `GET /relay-peers` when OMBERS_EXPOSE_RELAY_PEERS=1 (JSON: open WS remote IPs for this port).
 */
import http from 'http';
import { WebSocketServer } from 'ws';
import { createLogger } from './lib/log.js';
import { parseSessionPath } from './lib/parseSessionPath.js';
import {
  getMetricsContentType,
  initMetrics,
  metricsEnabled,
  metricsText,
  recordRelay,
  recordRelayError,
  recordUpgradeReject,
} from './lib/metrics.js';
import {
  createFixedWindowRateLimiter,
  getAuthToken,
  isIpAllowed,
  isTokenAuthorized,
  readSecurityConfig,
} from './lib/security.js';

const log = createLogger();

const MACHINE_PORT = Number(process.env.MACHINE_PORT) || 8081;
const PHONE_PORT = Number(process.env.PHONE_PORT) || 8080;
/** Bind address for both HTTP listeners (`0.0.0.0` default). Use `127.0.0.1` when TLS terminates in Nginx on the same host. */
const LISTEN_ADDRESS = String(process.env.LISTEN_ADDRESS || process.env.BIND_ADDRESS || '0.0.0.0').trim() || '0.0.0.0';
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000;

const WS_MAX_PAYLOAD_BYTES =
  Number(process.env.WS_MAX_PAYLOAD_BYTES) > 0
    ? Number(process.env.WS_MAX_PAYLOAD_BYTES)
    : 104_857_600;

const MAX_TOTAL_CONNECTIONS =
  Number(process.env.MAX_TOTAL_CONNECTIONS) > 0 ? Number(process.env.MAX_TOTAL_CONNECTIONS) : 0;
const security = readSecurityConfig(process.env);
const upgradeLimiter = createFixedWindowRateLimiter(security.wsUpgradeRateLimitPerMin, 60_000);

function envBool(name) {
  const v = process.env[name];
  return v === '1' || String(v).toLowerCase() === 'true';
}

/** When true, `GET /relay-peers` returns JSON of open WebSocket remote addresses for this listener (PHONE or MACHINE). */
const EXPOSE_RELAY_PEERS = envBool('OMBERS_EXPOSE_RELAY_PEERS');

function normalizePeerIp(addr) {
  if (!addr || typeof addr !== 'string') return null;
  if (addr.startsWith('::ffff:')) return addr.slice(7);
  return addr;
}

function collectPeerAddresses(wss) {
  const out = [];
  for (const ws of wss.clients) {
    const sock = ws.socket || ws._socket;
    const raw = sock?.remoteAddress;
    if (!raw) continue;
    const n = normalizePeerIp(raw);
    if (n) out.push(n);
  }
  return [...new Set(out)];
}

/** @type {Array<{ server: import('http').Server, wss: import('ws').WebSocketServer, label: string, port: number }>} */
const instances = [];

function totalConnections() {
  return instances.reduce((sum, { wss }) => sum + wss.clients.size, 0);
}

initMetrics({ getConnectionCount: totalConnections });

let shuttingDown = false;

/** nonempty sessionKey -> { phone?: WebSocket, machine?: WebSocket } */
const muxPairs = new Map();
let legacyPhone = null;
let legacyMachine = null;

function getMuxEntry(sessionKey) {
  let e = muxPairs.get(sessionKey);
  if (!e) {
    e = {};
    muxPairs.set(sessionKey, e);
  }
  return e;
}

function pruneMux(sessionKey) {
  const e = muxPairs.get(sessionKey);
  if (!e) return;
  if (!e.phone && !e.machine) muxPairs.delete(sessionKey);
}

function bindPhone(sessionKey, ws) {
  const legacy = sessionKey === '';

  const getPeer = () => (legacy ? legacyMachine : getMuxEntry(sessionKey).machine);
  const setThis = (w) => {
    if (legacy) {
      if (legacyPhone && legacyPhone.readyState <= 1 && legacyPhone !== w) legacyPhone.close();
      legacyPhone = w;
    } else {
      const e = getMuxEntry(sessionKey);
      if (e.phone && e.phone.readyState <= 1 && e.phone !== w) e.phone.close();
      e.phone = w;
    }
  };

  setThis(ws);
  log.info(legacy ? 'Phone connected (legacy /ws)' : `Phone connected session=${sessionKey.slice(0, 12)}…`);

  ws.on('message', (data) => {
    const peer = getPeer();
    if (peer && peer.readyState === 1) {
      try {
        peer.send(data);
        recordRelay('phone_to_machine');
      } catch (e) {
        recordRelayError('phone_to_machine');
        log.error('Phone->Machine relay error', { err: e.message });
      }
    }
  });

  ws.on('close', () => {
    if (legacy) {
      if (legacyPhone === ws) legacyPhone = null;
    } else {
      const e = muxPairs.get(sessionKey);
      if (e && e.phone === ws) delete e.phone;
      pruneMux(sessionKey);
    }
    log.info(legacy ? 'Phone disconnected (legacy)' : `Phone disconnected session=${sessionKey.slice(0, 12)}…`);
  });

  ws.on('error', (err) => log.error('Phone ws error', { err: err.message }));
}

function bindMachine(sessionKey, ws) {
  const legacy = sessionKey === '';

  const getPeer = () => (legacy ? legacyPhone : getMuxEntry(sessionKey).phone);
  const setThis = (w) => {
    if (legacy) {
      if (legacyMachine && legacyMachine.readyState <= 1 && legacyMachine !== w) legacyMachine.close();
      legacyMachine = w;
    } else {
      const e = getMuxEntry(sessionKey);
      if (e.machine && e.machine.readyState <= 1 && e.machine !== w) e.machine.close();
      e.machine = w;
    }
  };

  setThis(ws);
  log.info(legacy ? 'Machine connected (legacy /ws)' : `Machine connected session=${sessionKey.slice(0, 12)}…`);

  ws.on('message', (data) => {
    const peer = getPeer();
    if (peer && peer.readyState === 1) {
      try {
        peer.send(data);
        recordRelay('machine_to_phone');
      } catch (e) {
        recordRelayError('machine_to_phone');
        log.error('Machine->Phone relay error', { err: e.message });
      }
    }
  });

  ws.on('close', () => {
    if (legacy) {
      if (legacyMachine === ws) legacyMachine = null;
    } else {
      const e = muxPairs.get(sessionKey);
      if (e && e.machine === ws) delete e.machine;
      pruneMux(sessionKey);
    }
    log.info(legacy ? 'Machine disconnected (legacy)' : `Machine disconnected session=${sessionKey.slice(0, 12)}…`);
  });

  ws.on('error', (err) => log.error('Machine ws error', { err: err.message }));
}

function rejectUpgrade503(socket, body) {
  const b = Buffer.from(body, 'utf8');
  socket.write(
    `HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: ${b.length}\r\n\r\n`,
  );
  socket.write(b);
  socket.destroy();
}

function rejectUpgrade401(socket, body) {
  const b = Buffer.from(body, 'utf8');
  socket.write(
    `HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: ${b.length}\r\n\r\n`,
  );
  socket.write(b);
  socket.destroy();
}

function rejectUpgrade403(socket, body) {
  const b = Buffer.from(body, 'utf8');
  socket.write(
    `HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: ${b.length}\r\n\r\n`,
  );
  socket.write(b);
  socket.destroy();
}

function createPlainHttpHandler(wss, side) {
  return function handlePlainHttp(req, res) {
    const host = req.headers.host || 'localhost';
    let pathname;
    let urlObj;
    try {
      urlObj = new URL(req.url || '/', `http://${host}`);
      pathname = urlObj.pathname;
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    if (req.method === 'GET' && (pathname === '/relay-peers' || pathname === '/relay-peers/')) {
      if (!EXPOSE_RELAY_PEERS) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (security.requireAuthToken) {
        const token = getAuthToken(req.headers, urlObj);
        if (!isTokenAuthorized(security.expectedToken, token)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'unauthorized', service: 'ombers-communicator' }));
          return;
        }
      }
      const peers = collectPeerAddresses(wss);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          side,
          peers,
          service: 'ombers-communicator',
        }),
      );
      return;
    }

    if (req.method === 'GET' && (pathname === '/health' || pathname === '/health/')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', service: 'ombers-communicator' }));
      return;
    }

    if (req.method === 'GET' && (pathname === '/metrics' || pathname === '/metrics/')) {
      if (!metricsEnabled()) {
        res.writeHead(404);
        res.end();
        return;
      }
      void metricsText().then(
        (text) => {
          res.writeHead(200, { 'Content-Type': getMetricsContentType() });
          res.end(text);
        },
        (err) => {
          log.error('metrics export failed', { err: String(err) });
          res.writeHead(500);
          res.end();
        },
      );
      return;
    }

    res.writeHead(404);
    res.end();
  };
}

function attachUpgradeServer(port, label, side) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD_BYTES });
  const server = http.createServer(createPlainHttpHandler(wss, side));

  server.on('upgrade', (req, socket, head) => {
    if (shuttingDown) {
      socket.destroy();
      return;
    }

    const remoteIp = req.socket.remoteAddress || 'unknown';
    if (!isIpAllowed(remoteIp, security.ipAllowlist)) {
      recordUpgradeReject('ip_not_allowed');
      log.warn('rejecting WebSocket upgrade: ip not allowed', { ip: remoteIp });
      rejectUpgrade403(socket, 'Forbidden');
      return;
    }

    if (!upgradeLimiter.allow(remoteIp)) {
      recordUpgradeReject('rate_limit');
      log.warn('rejecting WebSocket upgrade: rate limit', { ip: remoteIp });
      rejectUpgrade503(socket, 'Too many upgrade requests');
      return;
    }

    if (MAX_TOTAL_CONNECTIONS > 0 && totalConnections() >= MAX_TOTAL_CONNECTIONS) {
      log.warn('rejecting WebSocket upgrade: connection limit', { limit: MAX_TOTAL_CONNECTIONS });
      recordUpgradeReject('capacity');
      rejectUpgrade503(socket, 'Too many connections');
      return;
    }

    const host = req.headers.host || 'localhost';
    let url;
    try {
      url = new URL(req.url || '/', `http://${host}`);
    } catch {
      socket.destroy();
      return;
    }

    const sessionKey = parseSessionPath(url.pathname);
    if (sessionKey === null) {
      recordUpgradeReject('invalid_path');
      socket.destroy();
      return;
    }

    if (security.requireAuthToken) {
      const token = getAuthToken(req.headers, url);
      if (!isTokenAuthorized(security.expectedToken, token)) {
        recordUpgradeReject('auth_failed');
        log.warn('rejecting WebSocket upgrade: auth failed', { side, ip: remoteIp });
        rejectUpgrade401(socket, 'auth_failed');
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      if (side === 'phone') bindPhone(sessionKey, ws);
      else bindMachine(sessionKey, ws);
    });
  });

  server.listen(port, LISTEN_ADDRESS, () => {
    const extra = EXPOSE_RELAY_PEERS ? ', /relay-peers' : '';
    log.info(
      `Middleware: ${label} listening on ${LISTEN_ADDRESS}:${port} (GET /health${metricsEnabled() ? ', /metrics' : ''}${extra}, /ws legacy, /ws/<sessionKey> multiplex)`,
    );
  });

  server.on('error', (err) => {
    log.error(`${label} server error`, { err: err.message });
  });

  instances.push({ server, wss, label, port });
}

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Middleware: ${signal} received, graceful shutdown`, { maxMs: SHUTDOWN_TIMEOUT_MS });

  const forceTimer = setTimeout(() => {
    log.error('Middleware: shutdown timeout, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  const closeWss = instances.map(
    ({ wss }) =>
      new Promise((resolve) => {
        wss.close(() => resolve());
      }),
  );

  Promise.all(closeWss)
    .then(
      () =>
        Promise.all(
          instances.map(
            ({ server }) =>
              new Promise((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
              }),
          ),
        ),
    )
    .then(() => {
      clearTimeout(forceTimer);
      log.info('Middleware: shutdown complete');
      process.exit(0);
    })
    .catch((err) => {
      clearTimeout(forceTimer);
      log.error('Middleware: shutdown error', { err: err.message });
      process.exit(1);
    });
}

attachUpgradeServer(MACHINE_PORT, 'Machine side', 'machine');
attachUpgradeServer(PHONE_PORT, 'Phone side', 'phone');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => gracefulShutdown(sig));
}

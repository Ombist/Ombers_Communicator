import client from 'prom-client';

const enabled =
  process.env.ENABLE_METRICS === '1' ||
  process.env.ENABLE_METRICS === 'true' ||
  process.env.METRICS_ENABLED === '1' ||
  process.env.METRICS_ENABLED === 'true';

/** @type {import('prom-client').Registry | null} */
let register = null;
/** @type {import('prom-client').Counter<string> | null} */
let relayCounter = null;
/** @type {import('prom-client').Counter<string> | null} */
let upgradeRejectCounter = null;
/** @type {import('prom-client').Counter<string> | null} */
let relayErrorCounter = null;

/**
 * @param {{ getConnectionCount: () => number }} opts
 */
export function initMetrics(opts) {
  if (!enabled) return false;

  register = new client.Registry();
  client.collectDefaultMetrics({ register });

  relayCounter = new client.Counter({
    name: 'ombers_relay_messages_total',
    help: 'Total messages relayed between phone and machine WebSockets',
    labelNames: ['direction'],
    registers: [register],
  });

  new client.Gauge({
    name: 'ombers_websocket_connections',
    help: 'Open WebSocket connections (both ports)',
    registers: [register],
    collect() {
      this.set(opts.getConnectionCount());
    },
  });

  upgradeRejectCounter = new client.Counter({
    name: 'ombers_upgrade_rejections_total',
    help: 'Total rejected WebSocket upgrades',
    labelNames: ['reason'],
    registers: [register],
  });

  relayErrorCounter = new client.Counter({
    name: 'ombers_relay_errors_total',
    help: 'Total relay forwarding errors',
    labelNames: ['direction'],
    registers: [register],
  });

  return true;
}

export function metricsEnabled() {
  return enabled && register !== null;
}

/** @param {'phone_to_machine' | 'machine_to_phone'} direction */
export function recordRelay(direction) {
  relayCounter?.inc({ direction });
}

/** @param {'rate_limit' | 'ip_not_allowed' | 'auth_failed' | 'capacity' | 'invalid_path'} reason */
export function recordUpgradeReject(reason) {
  upgradeRejectCounter?.inc({ reason });
}

/** @param {'phone_to_machine' | 'machine_to_phone'} direction */
export function recordRelayError(direction) {
  relayErrorCounter?.inc({ direction });
}

export async function metricsText() {
  if (!register) return '';
  return register.metrics();
}

export function getMetricsContentType() {
  return register?.contentType ?? 'text/plain; charset=utf-8';
}

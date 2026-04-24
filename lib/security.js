import crypto from 'crypto';

function parseBoolean(value) {
  return value === '1' || value === 'true';
}

function splitCsv(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function parseAllowlist(raw) {
  const items = splitCsv(raw);
  return new Set(items);
}

export function isIpAllowed(ip, allowlist) {
  if (allowlist.size === 0) return true;
  return allowlist.has(ip);
}

export function getAuthToken(headers, urlObj) {
  const authHeader = headers.authorization || headers.Authorization || '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  return urlObj.searchParams.get('token') || '';
}

export function isTokenAuthorized(expectedToken, providedToken) {
  if (!expectedToken) return true;
  const expectedBuf = Buffer.from(expectedToken, 'utf8');
  const providedBuf = Buffer.from(providedToken || '', 'utf8');
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function createFixedWindowRateLimiter(maxPerWindow, windowMs) {
  /** @type {Map<string, { count: number, startMs: number }>} */
  const buckets = new Map();

  return {
    allow(key, nowMs = Date.now()) {
      if (maxPerWindow <= 0) return true;
      const cur = buckets.get(key);
      if (!cur || nowMs - cur.startMs >= windowMs) {
        buckets.set(key, { count: 1, startMs: nowMs });
        return true;
      }
      if (cur.count >= maxPerWindow) return false;
      cur.count += 1;
      return true;
    },
    bucketCount() {
      return buckets.size;
    },
  };
}

export function readSecurityConfig(env) {
  const expectedToken = env.OMBERS_AUTH_TOKEN || '';
  const ipAllowlist = parseAllowlist(env.IP_ALLOWLIST || env.OMBERS_IP_ALLOWLIST || '');
  const wsUpgradeRateLimitPerMin =
    Number(env.WS_UPGRADE_RATE_LIMIT_PER_MIN) > 0 ? Number(env.WS_UPGRADE_RATE_LIMIT_PER_MIN) : 120;
  const requireAuthToken = parseBoolean(env.REQUIRE_AUTH_TOKEN || (expectedToken ? '1' : '0'));

  return {
    expectedToken,
    ipAllowlist,
    requireAuthToken,
    wsUpgradeRateLimitPerMin,
  };
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFixedWindowRateLimiter,
  getAuthToken,
  isIpAllowed,
  isTokenAuthorized,
  parseAllowlist,
  readSecurityConfig,
} from '../lib/security.js';

describe('security helpers', () => {
  it('parses ip allowlist csv', () => {
    const allow = parseAllowlist('127.0.0.1, ::1 ,10.0.0.2');
    assert.equal(allow.has('127.0.0.1'), true);
    assert.equal(allow.has('::1'), true);
    assert.equal(allow.has('10.0.0.2'), true);
  });

  it('allows all ip when allowlist is empty', () => {
    assert.equal(isIpAllowed('203.0.113.1', new Set()), true);
  });

  it('supports bearer and query token extraction', () => {
    const u = new URL('http://localhost/ws/a?token=q123');
    assert.equal(getAuthToken({ authorization: 'Bearer h123' }, u), 'h123');
    assert.equal(getAuthToken({}, u), 'q123');
  });

  it('validates token only when expected is configured', () => {
    assert.equal(isTokenAuthorized('', ''), true);
    assert.equal(isTokenAuthorized('abc', 'abc'), true);
    assert.equal(isTokenAuthorized('abc', 'wrong'), false);
    assert.equal(isTokenAuthorized('abc', 'ab'), false);
  });

  it('rate limiter applies fixed window policy', () => {
    const rl = createFixedWindowRateLimiter(2, 1_000);
    assert.equal(rl.allow('ip', 0), true);
    assert.equal(rl.allow('ip', 100), true);
    assert.equal(rl.allow('ip', 200), false);
    assert.equal(rl.allow('ip', 1_100), true);
  });

  it('reads security config defaults and token requirement', () => {
    const cfg = readSecurityConfig({ OMBERS_AUTH_TOKEN: 't' });
    assert.equal(cfg.requireAuthToken, true);
    assert.equal(cfg.wsUpgradeRateLimitPerMin, 120);
  });
});

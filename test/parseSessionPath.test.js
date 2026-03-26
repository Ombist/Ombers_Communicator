import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSessionPath } from '../lib/parseSessionPath.js';

describe('parseSessionPath', () => {
  it('returns empty string for legacy /ws', () => {
    assert.equal(parseSessionPath('/ws'), '');
    assert.equal(parseSessionPath('/ws/'), '');
  });

  it('returns null for unrelated paths', () => {
    assert.equal(parseSessionPath('/'), null);
    assert.equal(parseSessionPath('/api/ws/foo'), null);
    assert.equal(parseSessionPath('/wsx'), null);
  });

  it('decodes session key segment', () => {
    assert.equal(parseSessionPath('/ws/hello%2Fworld'), 'hello/world');
    assert.equal(parseSessionPath('/ws/abc'), 'abc');
  });

  it('returns raw segment when decodeURIComponent throws', () => {
    assert.equal(parseSessionPath('/ws/%E0%A4%A'), '%E0%A4%A');
  });
});

/**
 * @param {string} pathname URL pathname (e.g. from WHATWG URL)
 * @returns {string|null} session key string, '' for legacy /ws, or null if not a WebSocket path
 */
export function parseSessionPath(pathname) {
  if (pathname === '/ws' || pathname === '/ws/') return '';
  if (pathname.startsWith('/ws/')) {
    const raw = pathname.slice('/ws/'.length);
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

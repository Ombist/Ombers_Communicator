const jsonMode = process.env.LOG_FORMAT === 'json';

function baseRecord(level, msg, extra = {}) {
  const rec = { ts: new Date().toISOString(), level, msg, ...extra };
  return rec;
}

/**
 * @param {string} level
 * @param {string} msg
 * @param {Record<string, unknown>} [extra]
 */
function emit(level, msg, extra) {
  if (jsonMode) {
    const line = JSON.stringify(baseRecord(level, msg, extra));
    if (level === 'error') console.error(line);
    else console.log(line);
    return;
  }
  const suffix = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
  if (level === 'error') console.error(msg + suffix);
  else console.log(msg + suffix);
}

export function createLogger() {
  return {
    info: (msg, extra) => emit('info', msg, extra),
    warn: (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra),
  };
}

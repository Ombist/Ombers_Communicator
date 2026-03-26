/**
 * Short test: two sessionKeys connected concurrently; messages must not cross tunnels.
 * Requires `npm install` first. Run: node tools/test-two-tunnels.mjs
 */
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PHONE_PORT = 38080;
const MACHINE_PORT = 38081;

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function waitMsg(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(t);
      resolve(data.toString());
    });
  });
}

const child = spawn(process.execPath, ['index.js'], {
  cwd: root,
  env: { ...process.env, PHONE_PORT: String(PHONE_PORT), MACHINE_PORT: String(MACHINE_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((r) => setTimeout(r, 400));

try {
  const keyA = 'tunnel-a-test-key';
  const keyB = 'tunnel-b-test-key';

  const pA = new WebSocket(`ws://127.0.0.1:${PHONE_PORT}/ws/${encodeURIComponent(keyA)}`);
  const mA = new WebSocket(`ws://127.0.0.1:${MACHINE_PORT}/ws/${encodeURIComponent(keyA)}`);
  const pB = new WebSocket(`ws://127.0.0.1:${PHONE_PORT}/ws/${encodeURIComponent(keyB)}`);
  const mB = new WebSocket(`ws://127.0.0.1:${MACHINE_PORT}/ws/${encodeURIComponent(keyB)}`);

  await Promise.all([waitOpen(pA), waitOpen(mA), waitOpen(pB), waitOpen(mB)]);

  const gotA = waitMsg(mA);
  pA.send('ping-A');
  const ra = await gotA;
  if (ra !== 'ping-A') throw new Error(`A expected ping-A got ${ra}`);

  const gotB = waitMsg(mB);
  pB.send('ping-B');
  const rb = await gotB;
  if (rb !== 'ping-B') throw new Error(`B expected ping-B got ${rb}`);

  const gotRev = waitMsg(pB);
  mB.send('from-machine-B');
  const rev = await gotRev;
  if (rev !== 'from-machine-B') throw new Error(`reverse B failed: ${rev}`);

  pA.close();
  mA.close();
  pB.close();
  mB.close();
  console.log('middleware multipair OK');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 200));
}

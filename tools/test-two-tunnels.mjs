/**
 * Multipair test: N sessionKeys connected concurrently; messages must not cross tunnels.
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
const TUNNELS = Math.max(16, Number(process.env.TEST_TUNNELS || 16));

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
  const pairs = [];
  for (let i = 0; i < TUNNELS; i++) {
    const key = `tunnel-${i}-test-key`;
    const phone = new WebSocket(`ws://127.0.0.1:${PHONE_PORT}/ws/${encodeURIComponent(key)}`);
    const machine = new WebSocket(`ws://127.0.0.1:${MACHINE_PORT}/ws/${encodeURIComponent(key)}`);
    pairs.push({ key, phone, machine });
  }

  await Promise.all(pairs.flatMap((x) => [waitOpen(x.phone), waitOpen(x.machine)]));

  for (let i = 0; i < pairs.length; i++) {
    const msg = `ping-${i}`;
    const got = waitMsg(pairs[i].machine);
    pairs[i].phone.send(msg);
    const echoed = await got;
    if (echoed !== msg) throw new Error(`tunnel ${i} expected ${msg} got ${echoed}`);
  }

  for (let i = 0; i < pairs.length; i++) {
    const msg = `from-machine-${i}`;
    const got = waitMsg(pairs[i].phone);
    pairs[i].machine.send(msg);
    const echoed = await got;
    if (echoed !== msg) throw new Error(`reverse tunnel ${i} expected ${msg} got ${echoed}`);
  }

  for (const { phone, machine } of pairs) {
    phone.close();
    machine.close();
  }
  console.log(`middleware multipair OK tunnels=${TUNNELS}`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 200));
}

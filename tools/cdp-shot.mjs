// CDP screenshot driver: launches headless Chromium once, then opens each
// ?shot= scene from shots.json in a fresh tab. Chrome's Local Network Access
// check blocks remote-controlled navigations to loopback, so each tab first
// opens a tiny file:// redirect page (a local initiator) that location.replaces
// to the game URL — a real render of this game's own code, no editing.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHROME = process.env.CHROME_BIN || '/opt/meta-chromium/chrome';
const PORT = Number(process.env.CDP_PORT || 9360);
const BASE = process.env.GAME_URL || 'http://localhost:8080/index.html';
const PROFILE = '/tmp/solmar-chrome-profile';
const REDIRECT = '/tmp/solmar-redirect.html';
const POLICY_FILE = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function redirectTo(url) {
  writeFileSync(REDIRECT,
    '<!doctype html><meta charset="utf-8"><title>redirect</title>\n' +
    '<script>location.replace(' + JSON.stringify(url) + ');</script>\n');
}

async function openTab(port, url) {
  redirectTo(url);
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('file://' + REDIRECT)}`, { method: 'PUT' });
  return res.json();
}

async function shootOne(port, shot) {
  const target = await openTab(port, BASE + shot.query);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let mid = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++mid;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(String(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || ''));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r?.result?.value;
  };
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 60000) {
    if (await evalJs('window.__shotReady === true')) { ready = true; break; }
    const err = await evalJs('window.__shotError || null');
    if (err) throw new Error('shot error: ' + err);
    await sleep(500);
  }
  if (!ready) throw new Error('timeout waiting for __shotReady for ' + shot.name);
  await sleep(400);
  const shotRes = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  const buf = Buffer.from(shotRes.data, 'base64');
  writeFileSync(join(root, 'screenshots', shot.name), buf);
  console.log(shot.name, buf.length + ' bytes', errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : 'clean');
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
  return { name: shot.name, bytes: buf.length, errors };
}

rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader', '--no-proxy-server',
  `--hatch-webgl-allowed-domains-file=${POLICY_FILE}`,
  `--hatch-webgl-allowed-domains-sha256=${POLICY_SHA}`,
  '--window-size=1280,800',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: 'ignore' });

try {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      if (list.find((t) => t.type === 'page')) break;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  mkdirSync(join(root, 'screenshots'), { recursive: true });
  const results = [];
  for (const shot of shots) results.push(await shootOne(PORT, shot));
  const bad = results.filter((r) => r.errors.length > 0);
  if (bad.length > 0) console.log('WARNING: console errors in', bad.map((b) => b.name).join(', '));
  console.log('done');
} finally {
  chrome.kill('SIGKILL');
  rmSync(PROFILE, { recursive: true, force: true });
}

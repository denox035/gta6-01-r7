// Headless play-test: opens the game with ?new=1 in a fresh tab (via a
// file:// redirect page, so Chrome's Local Network Access check lets the
// loopback navigation through), holds W to walk, toggles pause twice, and
// reports whether the world runs, the player moves, and any console error
// breaks play. Exits non-zero on page errors or a stuck player.
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/opt/meta-chromium/chrome';
const PORT = Number(process.env.CDP_PORT || 9371);
const BASE = process.env.GAME_URL || 'http://localhost:8080/index.html';
const PROFILE = '/tmp/solmar-play-profile';
const REDIRECT = '/tmp/solmar-play-redirect.html';
const POLICY_FILE = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

let failures = 0;
try {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      if (list.find((t) => t.type === 'page')) break;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  writeFileSync(REDIRECT,
    '<!doctype html><meta charset="utf-8"><title>redirect</title>\n' +
    '<script>location.replace(' + JSON.stringify(BASE + '?new=1&seed=7') + ');</script>\n');
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('file://' + REDIRECT)}`, { method: 'PUT' })).json();
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
    else if (msg.method === 'Runtime.exceptionThrown') errors.push(String(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || ''));
    else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r?.result?.value;
  };
  await sleep(6000);
  const screen0 = await evalJs('window.__game && window.__game.screen');
  const pos0 = await evalJs('window.__game ? [window.__game.player.x, window.__game.player.z, window.__game.cars.length, window.__game.peds.length] : null');
  console.log('screen after load:', screen0, 'state:', JSON.stringify(pos0));
  if (screen0 !== 'play') { console.log('FAIL: expected screen play'); failures += 1; }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
  await sleep(3000);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
  const pos1 = await evalJs('window.__game ? [window.__game.player.x, window.__game.player.z] : null');
  console.log('pos after walking:', JSON.stringify(pos1));
  const moved = pos0 && pos1 && (Math.abs(pos1[0] - pos0[0]) + Math.abs(pos1[1] - pos0[1]) > 2);
  if (!moved) { console.log('FAIL: player did not move'); failures += 1; }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p' });
  await sleep(600);
  const paused = await evalJs('window.__game.screen');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p' });
  await sleep(600);
  const resumed = await evalJs('window.__game.screen');
  console.log('pause:', paused, '-> resume:', resumed);
  if (paused !== 'paused' || resumed !== 'play') { console.log('FAIL: pause/resume'); failures += 1; }
  const mission = await evalJs('window.__game.mission ? window.__game.mission.def.title : null');
  const hudCash = await evalJs('document.getElementById("hud-cash").textContent');
  console.log('active mission:', mission, '| HUD cash:', hudCash);
  if (!mission) { console.log('FAIL: no mission active'); failures += 1; }
  console.log('console errors:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length > 0) failures += 1;
  ws.close();
} finally {
  chrome.kill('SIGKILL');
  rmSync(PROFILE, { recursive: true, force: true });
}
console.log(failures === 0 ? 'PLAYTEST PASS' : 'PLAYTEST FAIL (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);

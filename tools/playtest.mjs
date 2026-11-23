// Scripted gameplay test: node tools/playtest.mjs <game-url>
// Drives the real game in headless Chrome via CDP: loads the title screen,
// starts a new game, walks, steals a car, drives, triggers the wanted system,
// and reports the observed state plus console errors.
const [,, url] = process.argv;
const port = 9222;
const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const evl = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '') };
  return r.result?.result?.value;
};
const results = {};
await sleep(5000);
results.titleScreen = await evl(`({ screen: S.screen, cars: S.cars.length, peds: S.peds.length, coins: S.coins.length, titleVisible: document.getElementById('title-screen').style.display })`);
// Start a new game via the button (reloads with ?new=1).
await evl(`document.getElementById('btn-new').click()`);
await sleep(4000);
results.afterNewGame = await evl(`({ screen: S.screen, missionRunning: S.mission.running, missionName: S.mission.index, objective: document.getElementById('hud-objective').textContent, hudVisible: document.getElementById('hud').style.display })`);
// Walk forward for 2s.
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
results.afterWalk = await evl(`({ x: +S.player.x.toFixed(1), z: +S.player.z.toFixed(1), onFoot: S.player.onFoot })`);
// Teleport next to the blue mission car and press E to enter it.
await evl(`S.player.x = -40.5; S.player.z = 33; S.player.mesh.position.set(-40.5, 0, 33);`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyE', key: 'e' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyE', key: 'e' });
await sleep(500);
results.afterEnterCar = await evl(`({ onFoot: S.player.onFoot, carId: S.player.car && S.player.car.id, missionStep: S.mission.step })`);
// Drive forward for 3s.
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
await sleep(3000);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
results.afterDrive = await evl(`({ x: +S.player.x.toFixed(1), z: +S.player.z.toFixed(1), speed: +S.player.car.speed.toFixed(1), missionStep: S.mission.step })`);
// Trigger wanted level and check police response.
await evl(`World.addWanted(2, 'test')`);
await sleep(2000);
results.wanted = await evl(`({ wanted: S.wanted, policeCars: S.police.length, policePeds: S.policePeds.length })`);
// Pause and resume.
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p' });
await sleep(300);
results.paused = await evl(`S.screen`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p' });
await sleep(300);
results.resumed = await evl(`S.screen`);
// Exit the car and punch.
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyE', key: 'e' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyE', key: 'e' });
await sleep(400);
results.afterExit = await evl(`({ onFoot: S.player.onFoot })`);
// Save the game.
results.save = await evl(`Save.save()`);
results.saveExists = await evl(`!!Save.load()`);
// Live play screenshot.
const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync('/tmp/playtest-live.png', Buffer.from(shot.result.data, 'base64'));
}
const errs = events.filter(e => (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') || e.method === 'Runtime.exceptionThrown');
const cErrs = events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error');
results.pageErrors = errs.length;
results.consoleErrors = cErrs.map(e => e.params.args.map(a => a.value ?? a.description ?? '').join(' '));
console.log(JSON.stringify(results, null, 2));
await send('Page.close').catch(() => {});
process.exit(0);

// CDP screenshot helper (kept in the repo so a /tmp wipe cannot lose it).
// node tools/cdp-shot.mjs <url> <out.png> <width> <height> [waitMs]
// Opens a fresh tab, waits for window.__shotReady, captures a PNG and reports
// page/console errors.
import { writeFileSync } from 'node:fs';
const [,, url, out, w = '1280', h = '720', waitMs = '8000'] = process.argv;
const port = 9222;
const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
await new Promise(r => ws.onopen = r);
function send(method, params = {}) {
  return new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
}
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < +waitMs) {
  const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
  if (r.result?.result?.value) { ready = true; break; }
  await new Promise(r2 => setTimeout(r2, 250));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
const title = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
const errs = events.filter(e => (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') || (e.method === 'Runtime.exceptionThrown'));
const consoleErrs = events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error');
console.log(JSON.stringify({ ready, waitedMs: Date.now() - t0, saved: !!shot.result?.data, title: title.result?.result?.value ?? null, pageErrors: errs.length, consoleErrors: consoleErrs.length, consoleErrorText: consoleErrs.slice(0, 5).map(e => e.params.args.map(a => a.value ?? a.description ?? '').join(' ')) }));
await send('Page.close').catch(() => {});
process.exit(0);

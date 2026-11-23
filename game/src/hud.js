// HUD: DOM overlays (cash, health, ammo, wanted stars, clock, speed, banners,
// dialogue, toasts, damage vignette) plus a live 2D minimap canvas showing
// roads, traffic, police, the mission marker and sun coins.
import { CITY } from './config.js';
import { fmtCash, fmtClock } from './random.js';
import { missionTarget } from './missions.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const root = {
    cash: el('hud-cash'),
    healthFill: el('hud-health-fill'),
    healthText: el('hud-health-text'),
    ammo: el('hud-ammo'),
    stars: el('hud-stars'),
    clock: el('hud-clock'),
    speed: el('hud-speed'),
    banner: el('hud-banner'),
    bannerTitle: el('hud-banner-title'),
    bannerSub: el('hud-banner-sub'),
    dialogue: el('hud-dialogue'),
    dialogueName: el('hud-dialogue-name'),
    dialogueText: el('hud-dialogue-text'),
    toast: el('hud-toast'),
    vignette: el('hud-vignette'),
    mission: el('hud-mission'),
    minimap: el('hud-minimap'),
  };
  const mm = root.minimap.getContext('2d');
  const MAP = 168;
  const half = CITY.half + 24;

  function drawMinimap(state) {
    const w = MAP, h = MAP;
    mm.clearRect(0, 0, w, h);
    mm.fillStyle = 'rgba(10, 18, 28, 0.82)';
    mm.fillRect(0, 0, w, h);
    const toMap = (x, z) => [
      ((x + half) / (half * 2)) * w,
      ((z - 20 + half) / (half * 2)) * h,
    ];
    // Roads.
    mm.strokeStyle = '#5a636e';
    mm.lineWidth = 2;
    for (const line of state.city.roadLines) {
      const [ax] = toMap(line, 0);
      mm.beginPath(); mm.moveTo(ax, 0); mm.lineTo(ax, h); mm.stroke();
      const [, bz] = toMap(0, 20 + line);
      mm.beginPath(); mm.moveTo(0, bz); mm.lineTo(w, bz); mm.stroke();
    }
    // Sea strip.
    mm.fillStyle = '#1e7fa8';
    mm.fillRect(0, 0, w, 6);
    // Sun coins.
    mm.fillStyle = '#ffd94d';
    for (const c of state.coins) {
      if (c.taken) continue;
      const [x, y] = toMap(c.x, c.z);
      mm.beginPath(); mm.arc(x, y, 2, 0, Math.PI * 2); mm.fill();
    }
    // Traffic (grey) and police (blue/red blink).
    mm.fillStyle = '#c8ccd2';
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      const [x, y] = toMap(car.x, car.z);
      mm.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const blink = Math.floor(state.time * 3) % 2 === 0;
    mm.fillStyle = blink ? '#ff4444' : '#4488ff';
    for (const car of state.police) {
      const [x, y] = toMap(car.x, car.z);
      mm.beginPath(); mm.arc(x, y, 3.5, 0, Math.PI * 2); mm.fill();
    }
    // Mission marker (gold diamond, pulsing).
    const target = missionTarget(state);
    if (target) {
      const [x, y] = toMap(target.x, target.z);
      const r = 5 + Math.sin(state.time * 4) * 1.5;
      mm.fillStyle = '#ffd94d';
      mm.beginPath();
      mm.moveTo(x, y - r); mm.lineTo(x + r, y); mm.lineTo(x, y + r); mm.lineTo(x - r, y);
      mm.closePath(); mm.fill();
    }
    // Taxi marker (green) when a fare is live.
    if (state.taxi.active) {
      const dest = state.taxi.stage === 0 ? state.taxi.pickup : state.taxi.dest;
      if (dest) {
        const [x, y] = toMap(dest.x, dest.z);
        mm.fillStyle = '#2ecc71';
        mm.beginPath(); mm.arc(x, y, 4, 0, Math.PI * 2); mm.fill();
      }
    }
    // Player arrow (white, rotated by heading).
    const p = state.player;
    const [px, py] = toMap(p.x, p.z);
    mm.save();
    mm.translate(px, py);
    mm.rotate(Math.atan2(Math.sin(p.angle), -Math.cos(p.angle)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -6); mm.lineTo(4.5, 5); mm.lineTo(-4.5, 5);
    mm.closePath(); mm.fill();
    mm.restore();
    // North label.
    mm.fillStyle = '#9fb2c8';
    mm.font = 'bold 10px sans-serif';
    mm.fillText('N', 6, 14);
  }

  function update(state) {
    root.cash.textContent = fmtCash(state.cash);
    root.healthFill.style.width = Math.max(0, state.health) + '%';
    root.healthFill.style.background = state.health > 50 ? '#2ecc71' : state.health > 25 ? '#f39c12' : '#e74c3c';
    root.healthText.textContent = Math.ceil(state.health) + ' HP';
    root.ammo.textContent = 'Ammo ' + state.ammo;
    root.clock.textContent = fmtClock(state.clock);
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    root.stars.textContent = stars;
    root.stars.style.color = state.wanted > 0 ? '#ffd94d' : '#8a94a6';
    const p = state.player;
    const kmh = p.car ? Math.round(Math.abs(p.car.speed) * 3.6) : Math.round((p.speed || 0) * 3.6);
    root.speed.textContent = p.car ? kmh + ' km/h  •  ' + p.car.name : (p.moving ? 'On foot' : 'On foot');
    if (state.banner) {
      root.banner.style.display = 'block';
      root.bannerTitle.textContent = state.banner.title;
      root.bannerSub.textContent = state.banner.subtitle || '';
    } else {
      root.banner.style.display = 'none';
    }
    if (state.dialogue) {
      root.dialogue.style.display = 'block';
      root.dialogueName.textContent = state.dialogue.name;
      root.dialogueText.textContent = state.dialogue.text;
    } else {
      root.dialogue.style.display = 'none';
    }
    if (state.toast && state.toastT > 0) {
      root.toast.style.display = 'block';
      root.toast.textContent = state.toast;
    } else {
      root.toast.style.display = 'none';
    }
    root.vignette.style.opacity = String(state.damageFlash * 0.85);
    const m = state.mission;
    root.mission.textContent = m
      ? 'Mission ' + (m.index + 1) + '/6: ' + m.def.title
      : (state.missionIndex >= 6 ? 'All missions complete — free roam!' : 'Mission ' + (state.missionIndex + 1) + '/6 ready — press M to start');
    drawMinimap(state);
  }

  return { update };
}

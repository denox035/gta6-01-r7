// localStorage save: cash, mission progress, player position, coins, stats.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      cash: Math.floor(state.cash),
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      coins: state.coinsCollected.slice(),
      stats: state.stats,
      pos: [state.player.x, state.player.z],
      clock: state.clock,
      version: 1,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function applySave(state, data) {
  if (!data) return;
  if (Number.isFinite(data.cash)) state.cash = data.cash;
  if (Number.isInteger(data.missionIndex)) state.missionIndex = data.missionIndex;
  if (Array.isArray(data.missionsDone)) state.missionsDone = data.missionsDone.slice(0, 6);
  if (Array.isArray(data.coins)) {
    for (const i of data.coins) {
      if (Number.isInteger(i) && state.coins[i]) state.coins[i].taken = true;
    }
  }
  if (data.stats && typeof data.stats === 'object') {
    state.stats = { ...state.stats, ...data.stats };
  }
  if (Array.isArray(data.pos) && data.pos.length === 2) {
    state.player.x = data.pos[0];
    state.player.z = data.pos[1];
  }
  if (Number.isFinite(data.clock)) state.clock = data.clock;
}

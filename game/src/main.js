// Boot and the one loop: input every frame, the world in fixed 1/60 s steps,
// the renderer paints what is there. Screens: title, play, paused, wasted,
// busted. ?seed=N fixes the city. ?shot=start|street|chase|mission stages a
// scene instead of running the loop, paints it twice and sets __shotReady.
// ?new=1 starts a fresh game straight away (no title screen after it).
import { STEP, SAVE_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, updateWorld, startNewGame, STEP as WORLD_STEP } from './world.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { loadSave, applySave, writeSave, clearSave } from './save.js';
import { startMission } from './missions.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const newGame = params.get('new') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const rng = createRandom(seed);
const state = createWorld(rng, [], []);
state.seed = seed;
const audio = createAudio();
const input = createInput(canvas);
const renderer = createRenderer(canvas, state);
const hud = createHud();
window.__game = state;

const titleEl = document.getElementById('screen-title');
const endEl = document.getElementById('screen-end');
const endTitle = document.getElementById('end-title');
const endReason = document.getElementById('end-reason');
const continueBtn = document.getElementById('btn-continue');
const saved = loadSave();
if (!saved && continueBtn) continueBtn.style.display = 'none';

function showTitle() {
  state.screen = 'title';
  titleEl.style.display = 'flex';
  endEl.style.display = 'none';
}
function hideScreens() {
  titleEl.style.display = 'none';
  endEl.style.display = 'none';
}
function showEnd(title, reason) {
  state.screen = title === 'WASTED' ? 'wasted' : 'busted';
  endTitle.textContent = title;
  endReason.textContent = reason;
  endEl.style.display = 'flex';
  titleEl.style.display = 'none';
}

function beginNew() {
  audio.unlock();
  audio.click();
  hideScreens();
  startNewGame(state);
}
function beginContinue() {
  audio.unlock();
  audio.click();
  hideScreens();
  const data = loadSave();
  startNewGame(state);
  if (data) {
    applySave(state, data);
    state.screen = 'play';
  }
  if (state.missionIndex < 6 && !state.mission) startMission(state, state.missionIndex);
}

document.getElementById('btn-new').addEventListener('click', beginNew);
if (continueBtn) continueBtn.addEventListener('click', beginContinue);
document.getElementById('btn-retry').addEventListener('click', () => {
  hideScreens();
  endShown = '';
  state.screen = 'play';
  state.health = 100;
});
document.getElementById('btn-title').addEventListener('click', showTitle);
document.getElementById('btn-clear-save').addEventListener('click', () => {
  clearSave();
  if (continueBtn) continueBtn.style.display = 'none';
});

// --- Shot mode: stage, paint twice, signal ready. No loop, no title. -------
if (shot) {
  hideScreens();
  try {
    stageShot(shot, state, audio);
  } catch (err) {
    console.error('stageShot failed', err);
    window.__shotError = String(err && err.message ? err.message : err);
  }
  let painted = 0;
  const paint = () => {
    renderer.draw();
    hud.update(state);
    painted += 1;
    // The camera eases toward the player, so paint many frames before the
    // shot counts: two paints leave it halfway across the city.
    if (painted < 40) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else if (newGame) {
  // Fresh game straight away: the title must NOT come back after this branch.
  beginNew();
} else {
  showTitle();
}

// --- Main loop ---------------------------------------------------------------
const MAX_FRAME = 0.25;
let last = performance.now();
let acc = 0;
let endShown = '';

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  // Pause toggles on the P/Escape edge, in either direction, every time.
  if (input.pressed(ACTION_PAUSE)) {
    if (state.screen === 'play') {
      state.screen = 'paused';
      document.getElementById('screen-pause').style.display = 'flex';
    } else if (state.screen === 'paused') {
      state.screen = 'play';
      document.getElementById('screen-pause').style.display = 'none';
    }
  }
  if (state.screen === 'title' && input.pressed(ACTION_CONFIRM)) beginNew();
  if ((state.screen === 'wasted' || state.screen === 'busted') && input.pressed(ACTION_CONFIRM)) {
    hideScreens();
    endShown = '';
    state.screen = 'play';
    state.health = 100;
  }
  if (state.screen === 'play' && input.pressed('mission') && !state.mission && state.missionIndex < 6) {
    startMission(state, state.missionIndex);
    audio.missionStart();
  }

  if (state.screen === 'play') {
    acc += elapsed;
    let n = 0;
    while (acc >= STEP && n < 5) {
      updateWorld(state, input, audio, STEP);
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
    if (state.screen === 'wasted' && endShown !== 'wasted') {
      endShown = 'wasted';
      showEnd('WASTED', state.endReason);
    } else if (state.screen === 'busted' && endShown !== 'busted') {
      endShown = 'busted';
      showEnd('BUSTED', state.endReason);
    }
  } else {
    endShown = '';
  }

  renderer.draw();
  if (state.screen === 'play' || state.screen === 'paused') hud.update(state);
  input.endFrame();
}

if (!shot) requestAnimationFrame(frame);

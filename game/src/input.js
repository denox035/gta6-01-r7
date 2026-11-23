// Keyboard + mouse input. Actions are edge-triggered where noted (pressed()).
// Pointer lock is requested on canvas click; the mouse orbits the camera.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_ENTER_CAR = 'enterCar';
export const ACTION_PUNCH = 'punch';
export const ACTION_SHOOT = 'shoot';
export const ACTION_HANDBRAKE = 'handbrake';
export const ACTION_HORN = 'horn';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyE: ACTION_ENTER_CAR,
  KeyF: ACTION_PUNCH,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  Enter: ACTION_CONFIRM,
  Space: ACTION_HANDBRAKE,
  KeyH: ACTION_HORN,
  KeyM: 'mission',
  KeyN: 'mute',
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let wheel = 0;
  let mouseDown = false;
  let locked = false;

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (e.code === 'Space') e.preventDefault();
    if (!held.has(action)) pressed.add(action);
    held.add(action);
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) held.delete(action);
  }
  function onMouseMove(e) {
    if (locked) {
      mouseDX += e.movementX || 0;
      mouseDY += e.movementY || 0;
    }
  }
  function onMouseDown(e) {
    if (e.button === 0) {
      mouseDown = true;
      pressed.add(ACTION_SHOOT);
      if (!locked && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ }
      }
    }
  }
  function onMouseUp(e) { if (e.button === 0) mouseDown = false; }
  function onWheel(e) { wheel += e.deltaY; }
  function onLockChange() { locked = document.pointerLockElement === canvas; }
  function onBlur() { held.clear(); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('blur', onBlur);

  return {
    is(action) { return held.has(action); },
    pressed(action) { return pressed.has(action); },
    mouseDown() { return mouseDown; },
    consumeMouse() {
      const d = { dx: mouseDX, dy: mouseDY, wheel };
      mouseDX = 0; mouseDY = 0; wheel = 0;
      return d;
    },
    endFrame() { pressed.clear(); },
    isLocked() { return locked; },
  };
}

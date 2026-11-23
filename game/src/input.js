// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (confirm, pause, interact, punch, reload) are queued as flags and taken once,
// so a press between two frames is never lost and never counted twice.
var Input = (function () {
  var keys = {};
  var actions = 0;
  var mouseDX = 0, mouseDY = 0, mouseDown = false;
  var dragging = false, lastX = 0, lastY = 0, wheelDelta = 0;

  var ACTION_CONFIRM = 1;
  var ACTION_PAUSE = 2;
  var ACTION_INTERACT = 4;
  var ACTION_PUNCH = 8;
  var ACTION_RELOAD = 16;

  function init(canvas) {
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
      if (e.repeat) return;
      keys[e.code] = true;
      if (e.code === 'Enter' || e.code === 'Space') actions |= ACTION_CONFIRM;
      else if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACTION_PAUSE;
      else if (e.code === 'KeyE') actions |= ACTION_INTERACT;
      else if (e.code === 'KeyF') actions |= ACTION_PUNCH;
      else if (e.code === 'KeyR') actions |= ACTION_RELOAD;
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('blur', function () {
      for (var k in keys) keys[k] = false;
      dragging = false; mouseDown = false;
    });
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      mouseDown = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      mouseDX += e.clientX - lastX; mouseDY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    });
    function endDrag() { dragging = false; mouseDown = false; }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', function (e) { wheelDelta += e.deltaY; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  return {
    ACTION_CONFIRM: ACTION_CONFIRM,
    ACTION_PAUSE: ACTION_PAUSE,
    ACTION_INTERACT: ACTION_INTERACT,
    ACTION_PUNCH: ACTION_PUNCH,
    ACTION_RELOAD: ACTION_RELOAD,
    init: init,
    held: function (code) { return !!keys[code]; },
    // WASD / arrows as a -1..1 pair, relative to the camera.
    move: function () {
      var x = 0, y = 0;
      if (keys['KeyW'] || keys['ArrowUp']) y += 1;
      if (keys['KeyS'] || keys['ArrowDown']) y -= 1;
      if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) x += 1;
      return { x: x, y: y };
    },
    sprint: function () { return !!keys['ShiftLeft'] || !!keys['ShiftRight']; },
    mouseDown: function () { return mouseDown; },
    takeMouseDelta: function () {
      var d = { x: mouseDX, y: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return d;
    },
    takeWheel: function () { var d = wheelDelta; wheelDelta = 0; return d; },
    takeActions: function () { var a = actions; actions = 0; return a; },
  };
})();

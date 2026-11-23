// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between
// five screens: title, play, paused, wasted and busted. ?shot=cover|street|
// chase|mission stages that scene instead of running the loop, paints it a few
// times and sets window.__shotReady for a screenshot.
var Main = (function () {
  var STEP = CFG.STEP;
  var MAX_FRAME = 0.25;
  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  var seedParam = Number.parseInt(params.get('seed') || '', 10);
  var seed = Number.isInteger(seedParam) ? seedParam : 20261123;
  var canvas = null;
  var scene = null;
  var accumulator = 0, last = 0;
  var titleAngle = 0;

  function createState() {
    S = {
      screen: 'title',
      time: CFG.START_HOUR,
      cash: 0, health: CFG.PLAYER_MAX_HEALTH, ammo: CFG.AMMO_START,
      wanted: 0, wantedQuiet: 0,
      player: {
        x: 0, z: 24, y: 0, heading: Math.PI, speed: 0,
        onFoot: true, car: null, punchT: 0, shootT: 0, vy: 0,
        walkPhase: 0, mesh: null,
      },
      cars: [], peds: [], police: [], policePeds: [], enemies: [],
      coins: [], pickups: [], stats: null, coinsCollected: 0,
      taxi: { active: false, waiting: false, passenger: null, dest: null, fare: 0, timeLeft: 0, marker: null },
      mission: { index: 0, step: 0, running: false, done: false, between: false },
      missionTarget: null,
      cameraYaw: Math.PI, cameraPitch: 0.32, cameraDist: 10,
      shake: 0,
      onBusted: null, onWasted: null, onEnterCar: null, onEnemyDown: null, onTaxiEnd: null,
    };
  }

  function boot() {
    createState();
    canvas = document.getElementById('game');
    scene = Render.init(canvas);
    HUD.init();
    Input.init(canvas);
    // The hero: Marco Reyes, teal jacket, dark jeans.
    var hero = Entities.makePersonMesh(0x2a9a8a, 0x2c3242, 0xd8a878);
    scene.add(hero);
    S.player.mesh = hero;
    World.createWorld(scene, seed);
    Missions.init(scene);
    S.onBusted = onBusted;
    S.onWasted = onWasted;
    S.onEnterCar = onEnterCar;
    S.onEnemyDown = function () { Missions.onEnemyDown(); };
    wireMenus();
    if (shot) { runShot(shot); return; }
    if (params.get('continue') === '1') {
      var d = Save.load();
      if (d) { Save.apply(d); startPlaying(); }
    } else if (params.get('new') === '1') {
      try { window.localStorage.removeItem(CFG.SAVE_KEY); } catch (e) {}
      startPlaying();
    }
    if (S.screen === 'title') showTitle();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function runShot(name) {
    S.screen = 'play';
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('end-screen').style.display = 'none';
    Shots.stage(name);
    var painted = 0;
    function paint() {
      Render.update(1 / 60);
      Render.render();
      HUD.update(1 / 60);
      painted += 1;
      if (painted < 4) requestAnimationFrame(paint);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paint);
  }

  function wireMenus() {
    var $ = function (id) { return document.getElementById(id); };
    $('btn-new').addEventListener('click', function () {
      AudioSys.unlock(); AudioSys.click();
      window.location.search = '?new=1';
    });
    $('btn-continue').addEventListener('click', function () {
      AudioSys.unlock(); AudioSys.click();
      window.location.search = '?continue=1';
    });
    $('btn-resume').addEventListener('click', function () { AudioSys.click(); resumeGame(); });
    $('btn-save').addEventListener('click', function () {
      if (Save.save()) HUD.toast('Game saved', 'good'); else HUD.toast('Save failed', 'bad');
    });
    $('btn-quit').addEventListener('click', function () { window.location.search = ''; });
    $('btn-respawn').addEventListener('click', function () { AudioSys.click(); respawn(); });
    $('btn-mute').addEventListener('click', function () {
      var m = AudioSys.toggleMute();
      $('btn-mute').textContent = m ? 'Sound: OFF' : 'Sound: ON';
    });
    if (!Save.hasSave()) $('btn-continue').style.display = 'none';
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S.screen === 'play') pauseGame();
    });
  }

  function showTitle() {
    S.screen = 'title';
    HUD.setScreenVisible(false);
    document.getElementById('title-screen').style.display = 'flex';
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('end-screen').style.display = 'none';
  }

  function startPlaying() {
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('end-screen').style.display = 'none';
    S.screen = 'play';
    HUD.setScreenVisible(true);
    if (!S.mission.running && !S.mission.done && S.mission.index === 0) {
      Missions.startMission(0);
    }
    if (!S.mission.running) HUD.setObjective('Free roam — find sun coins, drive a taxi, or start a mission');
  }

  function pauseGame() {
    if (S.screen !== 'play') return;
    S.screen = 'paused';
    document.getElementById('pause-screen').style.display = 'flex';
    AudioSys.engineSet(0, false);
  }

  function resumeGame() {
    document.getElementById('pause-screen').style.display = 'none';
    S.screen = 'play';
    last = performance.now();
  }

  function onBusted() {
    if (S.screen !== 'play') return;
    S.screen = 'busted';
    var fine = Math.min(150, S.cash);
    S.cash -= fine;
    S.wanted = 0; World.ensurePolice(0);
    S.policePeds.forEach(function (p) { p.state = 'walk'; });
    S.policePeds = [];
    showEnd('BUSTED', 'The Solmar PD caught you. Fine: $' + fine + '. Your car was impounded.');
    AudioSys.missionFail();
  }

  function onWasted() {
    if (S.screen !== 'play') return;
    S.screen = 'wasted';
    var bill = Math.min(100, S.cash);
    S.cash -= bill;
    S.wanted = 0; World.ensurePolice(0);
    showEnd('WASTED', 'You wake up at Solmar General. Hospital bill: $' + bill + '.');
    AudioSys.missionFail();
  }

  function showEnd(title, text) {
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-text').textContent = text;
    document.getElementById('end-screen').style.display = 'flex';
    HUD.setScreenVisible(false);
  }

  function respawn() {
    document.getElementById('end-screen').style.display = 'none';
    if (S.player.car) World.exitCar();
    var sp = S.screen === 'wasted' ? City.spawnPoints().hospital : City.spawnPoints().policeStation;
    S.player.x = sp.x; S.player.z = sp.z;
    S.player.health = CFG.PLAYER_MAX_HEALTH;
    S.health = CFG.PLAYER_MAX_HEALTH;
    S.player.mesh.position.set(S.player.x, 0, S.player.z);
    S.screen = 'play';
    HUD.setScreenVisible(true);
    Save.save();
  }

  function handleActions() {
    var actions = Input.takeActions();
    if (actions & Input.ACTION_PAUSE) {
      if (S.screen === 'play') pauseGame();
      else if (S.screen === 'paused') resumeGame();
    }
    if (actions & Input.ACTION_CONFIRM) {
      if (S.screen === 'title') { AudioSys.unlock(); startPlaying(); }
      else if (S.screen === 'wasted' || S.screen === 'busted') respawn();
    }
    if (actions & Input.ACTION_INTERACT && S.screen === 'play') {
      var p = S.player;
      if (!p.onFoot) { World.exitCar(); return; }
      // Taxi passenger first.
      if (S.taxi.waiting && S.taxi.passenger &&
        Math.sqrt(dist2(p.x, p.z, S.taxi.passenger.x, S.taxi.passenger.z)) < 6) {
        HUD.toast('The passenger needs a car first — get in a car, then press E near them', 'info');
        return;
      }
      if (S.player.car === null && S.taxi.waiting && S.taxi.passenger) { /* handled below in car */ }
      World.enterCar();
    }
    if (actions & Input.ACTION_PUNCH && S.screen === 'play') World.punch();
    // Taxi pickup only works from inside a car, near the waiting passenger.
    if (S.screen === 'play' && S.player.car && S.taxi.waiting && S.taxi.passenger) {
      if (Math.sqrt(dist2(S.player.x, S.player.z, S.taxi.passenger.x, S.taxi.passenger.z)) < 6) {
        World.startTaxiRide();
      }
    }
    if (Input.held('KeyM') && S.screen === 'play') {
      // M is handled as a held key: show the mission list once per press via confirm flag.
    }
  }

  function onEnterCar(car) {
    // Taxi: picking up a waiting passenger from the car.
    if (S.taxi.waiting && S.taxi.passenger &&
      Math.sqrt(dist2(S.player.x, S.player.z, S.taxi.passenger.x, S.taxi.passenger.z)) < 6) {
      World.startTaxiRide();
    }
  }

  function step() {
    if (S.screen === 'title') {
      // Slow orbit around the plaza behind the title screen.
      titleAngle += STEP * 0.05;
      S.player.x = Math.sin(titleAngle) * 30;
      S.player.z = 24 + Math.cos(titleAngle) * 30;
      S.player.heading = titleAngle + Math.PI / 2;
      S.player.mesh.position.set(S.player.x, 0, S.player.z);
      S.player.mesh.rotation.y = S.player.heading;
      return;
    }
    World.step(STEP);
    Missions.update(STEP);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (S.screen === 'title' || S.screen === 'play') {
      while (accumulator >= STEP && (S.screen === 'title' || S.screen === 'play')) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (S.screen === 'title') {
      S.cameraYaw = titleAngle + Math.PI;
      S.cameraDist = 16;
      S.cameraPitch = 0.5;
    }
    Render.update(STEP);
    Render.render();
    if (S.screen === 'play' || S.screen === 'paused') HUD.update(STEP);
  }

  return { boot: boot };
})();

window.addEventListener('DOMContentLoaded', function () { Main.boot(); });

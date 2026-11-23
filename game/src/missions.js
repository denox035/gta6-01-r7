// The story of Solmar: six missions for Marco Reyes and his fixer Nadia Sol.
// Each mission is a list of objectives (go somewhere, get in a car, collect,
// lose the cops, survive a shootout). Completing one pays cash, saves the game
// and opens the next. All characters, places and dialogue are original.
var Missions = (function () {
  var scene = null;
  var defs = [];
  var marker = null;
  var packages = [];
  var betweenTimer = 0;
  var current = null;

  function def(name, intro, reward, steps) {
    return { name: name, intro: intro, reward: reward, steps: steps };
  }

  function buildDefs() {
    defs = [
      def('First Fare',
        [['Nadia Sol', 'Marco! The Harbor Crew needs a driver tonight. Meet me at the plaza fountain.'],
         ['Nadia Sol', 'Take the blue Comet by the avenue and drop the package at the east side marker. Drive careful — the city watches.']],
        150, [
          { type: 'goto', x: 0, z: 24, r: 5, text: 'Meet Nadia Sol at the plaza fountain' },
          { type: 'enterCar', carId: 'blue', text: 'Get in the blue Comet' },
          { type: 'driveTo', x: 222, z: -148, r: 7, text: 'Drive to the drop-off on the east side' },
        ]),
      def('Hot Wheels',
        [['Nadia Sol', 'A purple Stallion is sitting in the lot on Palm Row. The owner owes us. Bring it to the docks.'],
         ['Nadia Sol', 'The lockup pays well for clean sports cars. Don\'t let the cops see you take it.']],
        300, [
          { type: 'goto', x: -222, z: -148, r: 8, text: 'Go to the parking lot on Palm Row' },
          { type: 'enterCar', carId: 'lot-sport', text: 'Take the purple Stallion', wanted: 1 },
          { type: 'driveTo', x: 296, z: 296, r: 8, text: 'Deliver the Stallion to the docks lockup' },
        ]),
      def('Package Run',
        [['Nadia Sol', 'Three packages stashed around Civic Center. On foot this time — cars draw eyes.'],
         ['Nadia Sol', 'Grab all three, then come back to me.']],
        250, [
          { type: 'collect', spots: [[148, 0], [-148, 0], [0, 148]], r: 3, text: 'Collect the packages (0/3)' },
          { type: 'goto', x: 0, z: 24, r: 5, text: 'Return to Nadia at the plaza' },
        ]),
      def('Heat',
        [['Nadia Sol', 'Somebody talked. The Solmar PD is all over you — two stars, Marco. Lose them.'],
         ['Nadia Sol', 'Break line of sight, keep moving, and the heat cools off on its own.']],
        400, [
          { type: 'escape', text: 'Lose the cops — get your wanted level to zero' },
        ]),
      def('The Getaway',
        [['Nadia Sol', 'Change of plan: I\'m riding with you. Take my teal Sunbeam and get us to the docks.'],
         ['Nadia Sol', 'Three stars and counting. Drive like the whole city is behind you — because it is.']],
        600, [
          { type: 'enterCar', carId: 'teal', text: 'Get in Nadia\'s teal Sunbeam', wanted: 3 },
          { type: 'driveTo', x: 296, z: 296, r: 8, text: 'Reach the docks — lose the cops if you can' },
        ]),
      def('Solmar Nights',
        [['Nadia Sol', 'The Vulture gang moved on our warehouse tonight. Four of them. End it, Marco.'],
         ['Nadia Sol', 'After that, the safehouse on Sunset Strip is yours. Welcome to the top of Solmar.']],
        1000, [
          { type: 'goto', x: -259, z: -259, r: 10, text: 'Go to the warehouse in the north-west', night: true },
          { type: 'shootout', text: 'Clear out the Vulture gang (0/4)' },
          { type: 'driveTo', x: 111, z: 111, r: 7, text: 'Drive to the safehouse on Sunset Strip' },
        ]),
    ];
  }

  function init(sc) {
    scene = sc;
    buildDefs();
    S.mission = { index: 0, step: 0, running: false, done: false, between: false };
  }

  function setMarker(x, z, color) {
    clearMarker();
    marker = Entities.makeMarkerMesh(color || 0xffd23e);
    marker.position.set(x, 0, z);
    scene.add(marker);
    S.missionTarget = { x: x, z: z };
  }
  function clearMarker() {
    if (marker) { scene.remove(marker); marker = null; }
    S.missionTarget = null;
  }

  function currentDef() { return defs[S.mission.index]; }
  function currentStep() {
    var d = currentDef();
    return d ? d.steps[S.mission.step] : null;
  }

  function startMission(i) {
    S.mission.index = i;
    S.mission.step = 0;
    S.mission.running = true;
    S.mission.between = false;
    var d = currentDef();
    HUD.banner('MISSION: ' + d.name, d.steps[0].text);
    showIntro(d);
    setupStep();
    HUD.toast('Mission started: ' + d.name, 'info');
  }

  function showIntro(d) {
    d.intro.forEach(function (line, i) {
      setTimeout(function () { HUD.dialogue(line[0], line[1]); }, i * 3600);
    });
  }

  function setupStep() {
    var step = currentStep();
    if (!step) return;
    HUD.setObjective(step.text);
    clearPackages();
    if (step.type === 'goto' || step.type === 'driveTo') setMarker(step.x, step.z);
    else if (step.type === 'enterCar') {
      var car = S.cars.find(function (c) { return c.id === step.carId; });
      if (car) setMarker(car.x, car.z, 0x2ce8c8);
    } else if (step.type === 'collect') {
      step.spots.forEach(function (s) { spawnPackage(s[0], s[1]); });
      step.got = 0;
      setMarker(step.spots[0][0], step.spots[0][1]);
    } else if (step.type === 'escape') {
      if (S.wanted < 2) World.addWanted(2, 'Tipped off');
      World.ensurePolice(2);
      clearMarker();
    } else if (step.type === 'shootout') {
      if (step.night || true) S.time = 21.5;
      spawnEnemies();
      step.killed = 0;
      setMarker(-259, -259, 0xff4444);
    }
  }

  function spawnPackage(x, z) {
    var g = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9),
      new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
    box.position.y = 0.5; g.add(box);
    var tape = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.62, 0.2),
      new THREE.MeshLambertMaterial({ color: 0xd8c86a }));
    tape.position.y = 0.5; g.add(tape);
    g.position.set(x, 0, z);
    scene.add(g);
    packages.push({ mesh: g, x: x, z: z, taken: false });
  }
  function clearPackages() {
    packages.forEach(function (p) { scene.remove(p.mesh); });
    packages = [];
  }

  function spawnEnemies() {
    var spots = [[-259, -259], [-245, -270], [-270, -245], [-250, -250]];
    spots.forEach(function (s) {
      var e = Entities.makePerson('enemy');
      e.x = s[0]; e.z = s[1]; e.health = CFG.ENEMY_HEALTH;
      e.mesh.position.set(e.x, 0, e.z);
      scene.add(e.mesh);
      S.enemies.push(e);
    });
  }

  function advanceStep() {
    var step = currentStep();
    if (step && step.type === 'enterCar' && step.wanted) World.addWanted(step.wanted, 'Stolen car');
    AudioSys.pickup();
    S.mission.step++;
    if (S.mission.step >= currentDef().steps.length) completeMission();
    else setupStep();
  }

  function completeMission() {
    var d = currentDef();
    S.cash += d.reward;
    S.stats.earned += d.reward;
    S.stats.missionsDone++;
    AudioSys.missionPass();
    HUD.banner('MISSION PASSED', '+$' + d.reward + '  —  ' + d.name);
    HUD.setObjective('Mission complete');
    clearMarker();
    clearPackages();
    S.mission.running = false;
    S.mission.between = true;
    betweenTimer = 5;
    Save.save();
    if (S.mission.index >= defs.length - 1) {
      S.mission.done = true;
      setTimeout(function () {
        HUD.banner('KING OF SOLMAR', 'You finished the story — free roam, taxis and sun coins remain');
        HUD.dialogue('Nadia Sol', 'Solmar is yours now, Marco. The city never sleeps, and neither do we.');
      }, 2500);
    }
  }

  function update(dt) {
    if (S.mission.between) {
      betweenTimer -= dt;
      if (betweenTimer <= 0) {
        S.mission.between = false;
        if (!S.mission.done && S.mission.index + 1 < defs.length) startMission(S.mission.index + 1);
      }
      return;
    }
    if (!S.mission.running) return;
    var step = currentStep();
    if (!step) return;
    var p = S.player;
    var d = Math.sqrt(dist2(p.x, p.z, step.x || 0, step.z || 0));
    if (step.type === 'goto') {
      if (d < step.r) advanceStep();
    } else if (step.type === 'driveTo') {
      if (!p.car) { HUD.setObjective(step.text + '  (you need a car!)'); return; }
      if (d < step.r) advanceStep();
    } else if (step.type === 'enterCar') {
      if (p.car && p.car.id === step.carId) advanceStep();
      else if (p.car) HUD.setObjective('Wrong car — find the marked one');
    } else if (step.type === 'collect') {
      var remaining = 0;
      packages.forEach(function (pk) {
        if (pk.taken) return;
        remaining++;
        if (dist2(p.x, p.z, pk.x, pk.z) < step.r * step.r) {
          pk.taken = true;
          scene.remove(pk.mesh);
          step.got++;
          AudioSys.coin();
          HUD.toast('Package ' + step.got + '/3', 'good');
          HUD.setObjective('Collect the packages (' + step.got + '/3)');
          var next = packages.find(function (q) { return !q.taken; });
          if (next) setMarker(next.x, next.z);
        }
      });
      if (remaining === 0) advanceStep();
    } else if (step.type === 'escape') {
      if (S.wanted === 0) advanceStep();
    } else if (step.type === 'shootout') {
      var alive = S.enemies.filter(function (e) { return e.state !== 'dead'; }).length;
      var killed = 4 - alive;
      if (killed !== step.killed) {
        step.killed = killed;
        HUD.setObjective('Clear out the Vulture gang (' + killed + '/4)');
      }
      if (alive === 0) advanceStep();
    }
    if (marker) {
      marker.rotation.y += dt * 0.8;
      marker.userData.arrow.position.y = 3.2 + Math.sin(S.time * 8) * 0.4;
    }
  }

  function onEnemyDown() { /* counted in update() via alive check */ }

  return {
    init: init,
    startMission: startMission,
    update: update,
    active: function () { return S.mission && S.mission.running; },
    onEnemyDown: onEnemyDown,
    currentName: function () { var d = currentDef(); return d ? d.name : ''; },
  };
})();

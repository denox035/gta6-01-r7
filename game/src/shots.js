// Screenshot scenes behind ?shot=cover|street|chase|mission. Each one stages a
// real game state — a car on the avenue, the plaza on foot, a police chase, a
// mission in progress — then paints it a few times and sets window.__shotReady,
// so the screenshot is exactly what a player sees in that moment.
var Shots = (function () {
  function placeCarAt(car, x, z, heading, speed) {
    car.x = x; car.z = z; car.heading = heading; car.speed = speed || 0;
    car.parked = false;
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = heading;
  }

  function putPlayerInCar(car) {
    S.player.x = car.x; S.player.z = car.z;
    S.player.car = car; car.isPlayer = true;
    S.player.onFoot = false;
    S.player.mesh.visible = false;
  }

  function putPlayerOnFoot(x, z, heading) {
    S.player.x = x; S.player.z = z; S.player.heading = heading;
    S.player.onFoot = true; S.player.car = null;
    S.player.mesh.visible = true;
    S.player.mesh.position.set(x, 0, z);
    S.player.mesh.rotation.y = heading;
  }

  function cameraBehind(heading, dist, pitch) {
    S.cameraYaw = heading + Math.PI;
    S.cameraDist = dist || 11;
    S.cameraPitch = pitch || 0.32;
  }

  function stage(name) {
    S.screen = 'play';
    HUD.setScreenVisible(true);
    if (name === 'street') return stageStreet();
    if (name === 'chase') return stageChase();
    if (name === 'mission') return stageMission();
    return stageCover();
  }

  // The cover: driving the red sports car down the main avenue at golden hour,
  // traffic ahead, two police cars closing in behind, two stars on the HUD.
  function stageCover() {
    S.time = 16.5;
    S.cash = 1240; S.health = 92; S.ammo = 28;
    var sport = S.cars.find(function (c) { return c.id === 'sport'; });
    placeCarAt(sport, -120, -37, Math.PI / 2, 24);
    putPlayerInCar(sport);
    // Traffic on the same avenue.
    var i = 0;
    S.cars.forEach(function (c) {
      if (c.isPlayer || c.police || c.parked) return;
      if (i < 4) {
        var x = -60 + i * 26;
        placeCarAt(c, x, -37 + (i % 2 === 0 ? 3.5 : -3.5), Math.PI / 2, 11);
        i++;
      }
    });
    // Police closing in — one alongside ahead, one coming the other way,
    // so the chase reads in the frame (a chase camera cannot see behind it).
    S.wanted = 2;
    World.ensurePolice(2);
    placeCarAt(S.police[0], -95, -40.5, Math.PI / 2, 26);
    if (S.police[1]) placeCarAt(S.police[1], -62, -33.5, -Math.PI / 2, 24);
    cameraBehind(Math.PI / 2, 12, 0.3);
    HUD.setObjective('Drive to the drop-off on the east side');
    HUD.toast('WANTED: Grand theft auto', 'bad');
  }

  // On foot in the central plaza: the fountain, palms, pedestrians, towers.
  function stageStreet() {
    S.time = 10.5;
    S.cash = 350; S.health = 100; S.ammo = 36;
    putPlayerOnFoot(0, 26, Math.PI);
    // Pull a few pedestrians into the plaza.
    var placed = 0;
    S.peds.forEach(function (p) {
      if (placed < 10 && p.state !== 'dead') {
        p.x = -22 + placed * 5; p.z = 12 + (placed % 3) * 6;
        p.heading = Math.PI + (placed % 2 === 0 ? 0.4 : -0.4);
        p.mesh.position.set(p.x, 0, p.z);
        p.mesh.rotation.y = p.heading;
        placed++;
      }
    });
    cameraBehind(Math.PI, 11, 0.22);
    HUD.setObjective('Meet Nadia Sol at the plaza fountain');
  }

  // A four-star chase at dusk: three police cars cutting the player off ahead.
  function stageChase() {
    S.time = 17.2;
    S.cash = 2680; S.health = 64; S.ammo = 12;
    var sport = S.cars.find(function (c) { return c.id === 'sport'; });
    // Northbound in the right-hand lane of the avenue at x = -37.
    placeCarAt(sport, -33.5, 150, Math.PI, 30);
    putPlayerInCar(sport);
    S.wanted = 4;
    World.ensurePolice(4);
    var spots = [[-33.5, 120, 0], [-40.5, 100, 0], [-26, 135, Math.PI]];
    S.police.forEach(function (pc, i) {
      if (spots[i]) placeCarAt(pc, spots[i][0], spots[i][1], spots[i][2], 32);
    });
    World.spawnBurst(-33.5, 1, 158, 0x888888, 12, 3);
    cameraBehind(Math.PI, 13, 0.3);
    HUD.setObjective('Lose the cops — get your wanted level to zero');
    HUD.toast('WANTED: Evading arrest', 'bad');
  }

  // A mission in progress: The Getaway, driving Nadia's car to the docks.
  function stageMission() {
    S.time = 16.5;
    S.cash = 1975; S.health = 88; S.ammo = 24;
    var teal = S.cars.find(function (c) { return c.id === 'teal'; });
    // Southbound on the avenue at x = 185, toward the docks and the sea.
    placeCarAt(teal, 181.5, 111, 0, 20);
    putPlayerInCar(teal);
    S.mission.index = 4; S.mission.step = 1; S.mission.running = true;
    HUD.setObjective('Reach the docks — lose the cops if you can');
    HUD.dialogue('Nadia Sol', 'Three stars and counting. Drive like the whole city is behind you — because it is.');
    // Rebuild the mission marker at the docks by staging the step directly.
    var marker = Entities.makeMarkerMesh(0xffd23e);
    marker.position.set(296, 0, 296);
    Render.scene().add(marker);
    S.missionTarget = { x: 296, z: 296 };
    S.wanted = 3;
    World.ensurePolice(3);
    placeCarAt(S.police[0], 188.5, 60, Math.PI, 24);
    if (S.police[1]) placeCarAt(S.police[1], 181.5, 150, 0, 24);
    cameraBehind(0, 12, 0.3);
  }

  return { stage: stage };
})();

// The living city: the player on foot and behind the wheel, traffic that follows
// the roads, pedestrians on the sidewalks, police that chase, the wanted system,
// combat, pickups, collectibles and the taxi side job. All state lives in S.
var World = (function () {
  var scene = null, rng = null;
  var particles = [];
  var particlePool = [];
  var tracers = [];
  var flashT = 0;
  var crimeCooldown = 0;
  var bustedMeter = 0;
  var taxiTimer = 0;

  function createWorld(sc, seed) {
    scene = sc; rng = makeRandom(seed);
    var city = City.build(scene, rng);
    S.city = city;
    S.time = CFG.START_HOUR;
    S.cash = 0; S.health = CFG.PLAYER_MAX_HEALTH; S.ammo = CFG.AMMO_START;
    S.wanted = 0; S.wantedQuiet = 0;
    S.cars = []; S.peds = []; S.police = []; S.policePeds = []; S.enemies = [];
    S.coins = []; S.pickups = [];
    S.stats = { carsStolen: 0, missionsDone: 0, fares: 0, earned: 0, shots: 0, hits: 0 };
    S.coinsCollected = 0;
    S.taxi = { active: false, passenger: null, dest: null, fare: 0, timeLeft: 0, marker: null };
    S.cameraYaw = Math.PI; S.cameraPitch = 0.32; S.cameraDist = 10;
    S.shake = 0;

    // Player.
    var p = S.player;
    p.x = 0; p.z = 24; p.y = 0; p.heading = Math.PI; p.speed = 0;
    p.onFoot = true; p.car = null; p.punchT = 0; p.shootT = 0; p.vy = 0;
    p.mesh.visible = true;

    // Parked cars around the city (some are mission cars).
    var parkedSpots = [
      { x: 40.5, z: -111, h: Math.PI / 2, sport: true, color: 0xc8452c, id: 'sport' },
      { x: -40.5, z: 37, h: -Math.PI / 2, color: 0x2c6ac8, id: 'blue' },
      { x: 114.5, z: 185, h: 0, color: 0xe8c832, id: 'taxi1' },
      { x: -222, z: -141.5, h: Math.PI, sport: true, color: 0x8a4ac8, id: 'lot-sport' },
      { x: 259, z: 296, h: Math.PI / 2, color: 0x3a9a4a, id: 'dock' },
      { x: -296, z: 111, h: Math.PI, color: 0xd8d8d8, id: 'white' },
      { x: 185, z: -40.5, h: Math.PI / 2, color: 0x4ac8c0, id: 'teal' },
      { x: -111, z: 259, h: 0, color: 0x9a2c4a, id: 'maroon' },
    ];
    parkedSpots.forEach(function (s) {
      var car = Entities.makeCar({ color: s.color, sport: s.sport });
      car.x = s.x; car.z = s.z; car.heading = s.h; car.parked = true; car.id = s.id;
      car.mesh.position.set(s.x, 0, s.z); car.mesh.rotation.y = s.h;
      scene.add(car.mesh);
      S.cars.push(car);
    });

    // Traffic cars, driving the roads.
    for (var i = 0; i < CFG.TRAFFIC_CARS; i++) {
      var car = Entities.makeCar({ color: pick(rng, Entities.CAR_COLORS) });
      placeOnRoad(car);
      car.speed = range(rng, 7, 13);
      car.driver = Entities.makePerson('ped');
      scene.add(car.mesh);
      S.cars.push(car);
    }

    // Pedestrians on the sidewalks.
    for (var j = 0; j < CFG.PEDS; j++) {
      var ped = Entities.makePerson('ped');
      var bx = rangeInt(rng, -4, 4) * CFG.PITCH, bz = rangeInt(rng, -4, 4) * CFG.PITCH;
      ped.x = bx + range(rng, -28, 28); ped.z = bz + range(rng, -28, 28);
      ped.heading = rng() * Math.PI * 2;
      ped.speed = range(rng, 1.2, 2.2);
      pickWalkTarget(ped);
      ped.mesh.position.set(ped.x, 0, ped.z);
      scene.add(ped.mesh);
      S.peds.push(ped);
    }

    // Sun coins scattered at landmarks.
    var coinSpots = [
      [0, 12], [0, -12], [-222, 148], [222, -148], [296, 296], [-296, -296],
      [60, 380], [-60, 380], [148, 0], [-148, 0], [0, 148], [0, -148],
      [111, 111], [-111, -111], [259, -259], [-259, 259], [37, 222], [-37, -222],
      [185, 185], [-185, -185],
    ];
    coinSpots.forEach(function (s) {
      var mesh = Entities.makeCoinMesh();
      mesh.position.set(s[0], 1.1, s[1]);
      scene.add(mesh);
      S.coins.push({ mesh: mesh, x: s[0], z: s[1], taken: false, spin: rng() * 6 });
    });

    // Health and ammo pickups.
    addPickup('health', -37, -100);
    addPickup('health', 296, 280);
    addPickup('ammo', 111, -100);
    addPickup('ammo', -259, 148);
    addPickup('health', 60, 370);

    // Particle pool (small boxes reused for smoke, sparks, bursts).
    for (var k = 0; k < 60; k++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      m.visible = false;
      scene.add(m);
      particlePool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    return S;
  }

  function addPickup(kind, x, z) {
    var mesh = kind === 'health' ? Entities.makeHealthMesh() : Entities.makeAmmoMesh();
    mesh.position.set(x, 1.0, z);
    scene.add(mesh);
    S.pickups.push({ kind: kind, mesh: mesh, x: x, z: z, taken: false, respawn: 0 });
  }

  function placeOnRoad(car) {
    var centers = City.roadCenters();
    var horizontal = rng() < 0.5;
    var c = pick(rng, centers);
    var along = range(rng, -320, 320);
    var dir = rng() < 0.5 ? 1 : -1;
    if (horizontal) {
      car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.x = along; car.z = c + (dir > 0 ? 3.5 : -3.5);
    } else {
      car.heading = dir > 0 ? 0 : Math.PI;
      car.x = c + (dir > 0 ? -3.5 : 3.5); car.z = along;
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }

  function pickWalkTarget(ped) {
    // Walk to a nearby sidewalk corner.
    var bx = Math.round(ped.x / CFG.PITCH) * CFG.PITCH;
    var bz = Math.round(ped.z / CFG.PITCH) * CFG.PITCH;
    var dx = pick(rng, [-30, 0, 30]), dz = pick(rng, [-30, 0, 30]);
    if (dx === 0 && dz === 0) dx = 30;
    ped.target = { x: clamp(bx + dx, -330, 330), z: clamp(bz + dz, -330, 330) };
  }

  // --- wanted -------------------------------------------------------------
  function addWanted(n, reason) {
    if (crimeCooldown > 0 && n <= 1) return;
    var before = S.wanted;
    S.wanted = clamp(S.wanted + n, 0, CFG.WANTED_MAX);
    S.wantedQuiet = 0;
    if (n > 0) crimeCooldown = 2.5;
    if (S.wanted > before) {
      HUD.toast('WANTED: ' + reason, 'bad');
      ensurePolice(S.wanted);
    }
  }

  function ensurePolice(stars) {
    var want = Math.min(stars + 1, CFG.MAX_POLICE);
    while (S.police.length < want) spawnPoliceCar();
    while (S.police.length > want) {
      var c = S.police.pop();
      scene.remove(c.mesh);
      var idx = S.cars.indexOf(c);
      if (idx >= 0) S.cars.splice(idx, 1);
    }
    if (stars >= 2 && !S.player.onFoot) return;
    if (stars >= 2 && S.policePeds.length < 2) spawnPolicePed();
  }

  function spawnPoliceCar() {
    var car = Entities.makeCar({ police: true });
    var a = rng() * Math.PI * 2;
    car.x = clamp(S.player.x + Math.cos(a) * 110, -330, 330);
    car.z = clamp(S.player.z + Math.sin(a) * 110, -330, 330);
    car.heading = Math.atan2(S.player.x - car.x, S.player.z - car.z);
    car.speed = 20;
    car.mesh.position.set(car.x, 0, car.z);
    scene.add(car.mesh);
    S.cars.push(car);
    S.police.push(car);
    return car;
  }

  function spawnPolicePed() {
    var ped = Entities.makePerson('police');
    var a = rng() * Math.PI * 2;
    ped.x = S.player.x + Math.cos(a) * 30;
    ped.z = S.player.z + Math.sin(a) * 30;
    ped.state = 'chase'; ped.speed = 7;
    ped.mesh.position.set(ped.x, 0, ped.z);
    scene.add(ped.mesh);
    S.policePeds.push(ped);
  }

  // --- player actions ------------------------------------------------------
  function nearestCar(maxDist) {
    var best = null, bd = maxDist * maxDist;
    for (var i = 0; i < S.cars.length; i++) {
      var c = S.cars[i];
      if (c.police) continue;
      var d = dist2(S.player.x, S.player.z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function enterCar() {
    var car = nearestCar(4.5);
    if (!car) return false;
    if (car.driver) {
      // Carjack: the driver flees, the law notices.
      var d = car.driver;
      d.state = 'flee'; d.panic = 6;
      car.driver = null;
      S.stats.carsStolen++;
      addWanted(1, 'Grand theft auto');
      HUD.toast('Car stolen!', 'bad');
    }
    car.parked = false;
    S.player.car = car; car.isPlayer = true;
    S.player.onFoot = false;
    S.player.mesh.visible = false;
    car.mesh.position.y = 0;
    AudioSys.door();
    if (S.onEnterCar) S.onEnterCar(car);
    return true;
  }

  function exitCar() {
    var car = S.player.car;
    if (!car) return;
    car.isPlayer = false;
    S.player.car = null;
    S.player.onFoot = true;
    var a = car.heading + Math.PI / 2;
    S.player.x = car.x + Math.sin(a) * 2.2;
    S.player.z = car.z + Math.cos(a) * 2.2;
    S.player.heading = car.heading;
    S.player.speed = 0;
    var p = City.resolveCircle(S.player.x, S.player.z, CFG.PLAYER_RADIUS);
    S.player.x = p.x; S.player.z = p.z;
    S.player.mesh.visible = true;
    AudioSys.door();
  }

  function shoot() {
    var p = S.player;
    if (!p.onFoot || p.shootT > 0 || S.ammo <= 0) return;
    p.shootT = 0.28;
    S.ammo--; S.stats.shots++;
    AudioSys.gunshot();
    flashT = 0.06;
    // Aim from the camera through the screen centre.
    var dir = Render.aimDirection();
    var ox = p.x, oy = 1.5, oz = p.z;
    var best = null, bd = CFG.PISTOL_RANGE;
    var targets = S.enemies.concat(S.policePeds).concat(S.peds);
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.state === 'dead') continue;
      var dx = t.x - ox, dz = t.z - oz;
      var along = dx * dir.x + dz * dir.z;
      if (along < 1 || along > CFG.PISTOL_RANGE) continue;
      var perp = Math.abs(dx * dir.z - dz * dir.x);
      if (perp < 1.6 && along < bd) { bd = along; best = t; }
    }
    var endX = ox + dir.x * bd, endZ = oz + dir.z * bd;
    spawnTracer(ox, oy, oz, endX, 1.4, endZ);
    if (best) {
      best.health -= CFG.PISTOL_DAMAGE;
      S.stats.hits++;
      spawnBurst(best.x, 1.4, best.z, 0xc81e1e, 8, 3);
      if (best.health <= 0) {
        best.state = 'dead';
        best.mesh.rotation.x = -Math.PI / 2;
        best.mesh.position.y = 0.4;
        if (best.kind === 'ped') addWanted(1, 'Assault');
        if (best.kind === 'enemy') { HUD.toast('Rival down', 'good'); if (S.onEnemyDown) S.onEnemyDown(best); }
      } else if (best.kind === 'ped') {
        best.state = 'flee'; best.panic = 5;
        addWanted(1, 'Assault');
      }
    } else {
      // A stray shot still draws attention.
      if (S.wanted > 0) S.wantedQuiet = 0;
    }
  }

  function punch() {
    var p = S.player;
    if (!p.onFoot || p.punchT > 0) return;
    p.punchT = 0.4;
    AudioSys.punch();
    var fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    var targets = S.enemies.concat(S.policePeds).concat(S.peds);
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.state === 'dead') continue;
      var dx = t.x - p.x, dz = t.z - p.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < CFG.PUNCH_RANGE && dx * fx + dz * fz > 0) {
        t.health -= CFG.PUNCH_DAMAGE;
        t.x += fx * 1.2; t.z += fz * 1.2;
        spawnBurst(t.x, 1.4, t.z, 0xd8a878, 6, 2);
        if (t.health <= 0) {
          t.state = 'dead';
          t.mesh.rotation.x = -Math.PI / 2; t.mesh.position.y = 0.4;
          if (t.kind === 'ped') addWanted(1, 'Assault');
        } else if (t.kind === 'ped') { t.state = 'flee'; t.panic = 5; }
        return;
      }
    }
  }

  // --- particles ------------------------------------------------------------
  function spawnBurst(x, y, z, color, n, speed) {
    for (var i = 0; i < n; i++) {
      var pt = particlePool.find(function (q) { return q.life <= 0; });
      if (!pt) return;
      pt.life = range(rng, 0.35, 0.8);
      pt.maxLife = pt.life;
      pt.mesh.visible = true;
      pt.mesh.material.color.setHex(color);
      pt.mesh.position.set(x, y, z);
      var a = rng() * Math.PI * 2, s = range(rng, 0.5, 1) * speed;
      pt.vx = Math.cos(a) * s; pt.vz = Math.sin(a) * s; pt.vy = range(rng, 1, 3.5);
    }
  }

  function spawnTracer(x1, y1, z1, x2, y2, z2) {
    var geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line: line, life: 0.09 });
  }

  // --- per-frame updates ----------------------------------------------------
  function step(dt) {
    crimeCooldown = Math.max(0, crimeCooldown - dt);
    flashT = Math.max(0, flashT - dt);
    S.time += dt * 24 / CFG.DAY_LENGTH;
    if (S.time >= 24) S.time -= 24;
    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateEnemies(dt);
    updateCoins(dt);
    updatePickups(dt);
    updateTaxi(dt);
    updateParticles(dt);
    updateWanted(dt);
    // Sea shimmer.
    var sea = scene.getObjectByName('sea');
    if (sea) sea.position.y = Math.sin(S.time * 20) * 0.08;
  }

  function updatePlayer(dt) {
    var p = S.player;
    p.punchT = Math.max(0, p.punchT - dt);
    p.shootT = Math.max(0, p.shootT - dt);
    var mv = Input.move();
    if (p.onFoot) {
      var speed = Input.sprint() ? CFG.RUN_SPEED : CFG.WALK_SPEED;
      var yaw = S.cameraYaw;
      var mx = 0, mz = 0;
      if (mv.y !== 0 || mv.x !== 0) {
        // Camera-relative movement: forward is away from the camera.
        var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        var rx = -fz, rz = fx;
        mx = fx * mv.y + rx * mv.x;
        mz = fz * mv.y + rz * mv.x;
        var len = Math.sqrt(mx * mx + mz * mz);
        mx /= len; mz /= len;
        var targetHeading = Math.atan2(mx, mz);
        p.heading += angleDiff(p.heading, targetHeading) * Math.min(1, dt * 12);
        p.speed = speed;
      } else p.speed = 0;
      var nx = p.x + Math.sin(p.heading) * p.speed * dt;
      var nz = p.z + Math.cos(p.heading) * p.speed * dt;
      var res = City.resolveCircle(nx, nz, CFG.PLAYER_RADIUS);
      p.x = clamp(res.x, -CFG.WORLD_R, CFG.WORLD_R);
      p.z = clamp(res.z, -CFG.WORLD_R, CFG.WORLD_R + 60);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // Walk animation.
      if (p.speed > 0.1) {
        p.walkPhase += dt * p.speed * 1.6;
        var s = Math.sin(p.walkPhase);
        p.mesh.userData.legL.rotation.x = s * 0.7;
        p.mesh.userData.legR.rotation.x = -s * 0.7;
        p.mesh.userData.armL.rotation.x = -s * 0.5;
        p.mesh.userData.armR.rotation.x = s * 0.5;
      } else {
        p.mesh.userData.legL.rotation.x = 0;
        p.mesh.userData.legR.rotation.x = 0;
      }
      if (Input.mouseDown() && S.screen === 'play') shoot();
    } else if (p.car) {
      var car = p.car;
      var maxSpeed = car.sport ? CFG.CAR_SPORT_MAX : CFG.CAR_MAX;
      if (mv.y > 0) car.speed += CFG.CAR_ACCEL * dt;
      else if (mv.y < 0) {
        if (car.speed > 0.5) car.speed -= CFG.CAR_BRAKE * dt;
        else car.speed -= CFG.CAR_REVERSE * dt * 0.6;
      } else {
        car.speed -= car.speed * CFG.CAR_DRAG * dt;
        if (Math.abs(car.speed) < 0.2) car.speed = 0;
      }
      car.speed = clamp(car.speed, -CFG.CAR_REVERSE, maxSpeed);
      var steerInput = mv.x;
      var steerFactor = clamp(Math.abs(car.speed) / 8, 0, 1);
      car.heading += steerInput * CFG.CAR_STEER * steerFactor * dt * (car.speed >= 0 ? 1 : -1);
      car.steer = steerInput;
      var fx2 = Math.sin(car.heading), fz2 = Math.cos(car.heading);
      var nx2 = car.x + fx2 * car.speed * dt;
      var nz2 = car.z + fz2 * car.speed * dt;
      var hitWall = City.hitsCollider(nx2, nz2, CFG.CAR_RADIUS);
      if (hitWall) {
        var res2 = City.resolveCircle(car.x, car.z, CFG.CAR_RADIUS);
        car.x = res2.x; car.z = res2.z;
        if (Math.abs(car.speed) > 8) { AudioSys.crash(Math.abs(car.speed) / 40); S.shake = 0.4; spawnBurst(car.x, 1, car.z, 0xffc861, 10, 4); }
        car.speed *= -0.25;
      } else {
        car.x = nx2; car.z = nz2;
      }
      car.x = clamp(car.x, -CFG.WORLD_R, CFG.WORLD_R);
      car.z = clamp(car.z, -CFG.WORLD_R, CFG.WORLD_R + 60);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // Wheels spin and steer.
      var wheels = car.mesh.userData.wheels;
      if (wheels) {
        for (var w = 0; w < wheels.length; w++) wheels[w].rotation.x += car.speed * dt * 1.4;
      }
      p.x = car.x; p.z = car.z; p.heading = car.heading;
      // Running over pedestrians.
      for (var i = 0; i < S.peds.length; i++) {
        var ped = S.peds[i];
        if (ped.state === 'dead') continue;
        if (dist2(car.x, car.z, ped.x, ped.z) < 2.6 * 2.6 && Math.abs(car.speed) > 3) {
          ped.state = 'dead'; ped.health = 0;
          ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.4;
          spawnBurst(ped.x, 1, ped.z, 0xc81e1e, 10, 3);
          addWanted(1, 'Hit and run');
          S.shake = 0.3;
        }
      }
      // Collisions with other cars.
      for (var j = 0; j < S.cars.length; j++) {
        var other = S.cars[j];
        if (other === car) continue;
        var d2 = dist2(car.x, car.z, other.x, other.z);
        if (d2 < 3.4 * 3.4) {
          var d = Math.sqrt(d2) || 0.01;
          var push = (3.4 - d) * 0.5;
          var px = (car.x - other.x) / d, pz = (car.z - other.z) / d;
          car.x += px * push; car.z += pz * push;
          if (!other.isPlayer && !other.police) { other.x -= px * push; other.z -= pz * push; }
          if (Math.abs(car.speed) > 6) { AudioSys.crash(0.4); S.shake = 0.25; }
          car.speed *= 0.82;
          if (other.police) { S.health -= 2; if (S.health <= 0) S.health = 1; }
        }
      }
      AudioSys.engineSet(Math.abs(car.speed) / maxSpeed, true);
    }
  }

  function updateTraffic(dt) {
    var centers = City.roadCenters();
    for (var i = 0; i < S.cars.length; i++) {
      var car = S.cars[i];
      if (car.isPlayer || car.police || car.parked) continue;
      // Car ahead? Brake.
      var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      var wantSpeed = 11;
      for (var j = 0; j < S.cars.length; j++) {
        var o = S.cars[j];
        if (o === car) continue;
        var dx = o.x - car.x, dz = o.z - car.z;
        var along = dx * fx + dz * fz;
        var perp = Math.abs(dx * fz - dz * fx);
        if (along > 0 && along < 9 && perp < 2.6) { wantSpeed = 0; break; }
      }
      // A pedestrian crossing ahead? Brake.
      for (var k = 0; k < S.peds.length; k++) {
        var ped = S.peds[k];
        if (ped.state === 'dead') continue;
        var pdx = ped.x - car.x, pdz = ped.z - car.z;
        var palong = pdx * fx + pdz * fz;
        var pperp = Math.abs(pdx * fz - pdz * fx);
        if (palong > 0 && palong < 7 && pperp < 2.2) { wantSpeed = 0; break; }
      }
      car.speed += clamp(wantSpeed - car.speed, -14 * dt, 8 * dt);
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      // At an intersection centre, maybe turn.
      var nearX = City.nearestRoadCenter(car.x), nearZ = City.nearestRoadCenter(car.z);
      if (Math.abs(car.x - nearX) < 1.2 && Math.abs(car.z - nearZ) < 1.2) {
        if (rng() < 0.5) {
          var headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
          var cur = car.heading;
          var options = headings.filter(function (h) { return Math.abs(angleDiff(cur, h)) > 2.6; });
          var nh = pick(rng, options);
          car.heading = nh;
          // Snap onto the new lane (right-hand traffic).
          var nfx = Math.sin(nh), nfz = Math.cos(nh);
          var rx = -nfz, rz = nfx; // right-hand side
          if (Math.abs(nfx) > 0.5) { car.z = nearZ + rz * 3.5; }
          else { car.x = nearX + rx * 3.5; }
        }
      }
      // Wrap around the city edge.
      if (car.x > 345 || car.x < -345 || car.z > 345 || car.z < -345) placeOnRoad(car);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      var wheels = car.mesh.userData.wheels;
      if (wheels) for (var w = 0; w < wheels.length; w++) wheels[w].rotation.x += car.speed * dt * 1.4;
    }
  }

  function updatePeds(dt) {
    for (var i = 0; i < S.peds.length; i++) {
      var ped = S.peds[i];
      if (ped.state === 'dead') continue;
      if (ped.state === 'flee') {
        ped.panic -= dt;
        var dx = ped.x - S.player.x, dz = ped.z - S.player.z;
        var len = Math.sqrt(dx * dx + dz * dz) || 1;
        ped.heading = Math.atan2(dx / len, dz / len);
        ped.speed = 5.5;
        if (ped.panic <= 0) { ped.state = 'walk'; pickWalkTarget(ped); }
      } else if (ped.target) {
        var tx = ped.target.x - ped.x, tz = ped.target.z - ped.z;
        var td = Math.sqrt(tx * tx + tz * tz);
        if (td < 1.5) {
          ped.waitT -= dt;
          if (ped.waitT <= 0) { pickWalkTarget(ped); ped.waitT = range(rng, 1, 4); }
          ped.speed = 0;
        } else {
          ped.heading = Math.atan2(tx / td, tz / td);
          ped.speed = 1.8;
        }
      }
      // A speeding car nearby scares pedestrians.
      if (ped.state !== 'flee') {
        for (var j = 0; j < S.cars.length; j++) {
          var c = S.cars[j];
          if (Math.abs(c.speed) > 10 && dist2(c.x, c.z, ped.x, ped.z) < 36) {
            ped.state = 'flee'; ped.panic = 3; break;
          }
        }
      }
      var nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
      var nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
      var res = City.resolveCircle(nx, nz, 0.5);
      ped.x = res.x; ped.z = res.z;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      if (ped.speed > 0.1) {
        ped.walkPhase += dt * ped.speed * 2.2;
        var s = Math.sin(ped.walkPhase);
        ped.mesh.userData.legL.rotation.x = s * 0.6;
        ped.mesh.userData.legR.rotation.x = -s * 0.6;
      }
    }
  }

  function updatePolice(dt) {
    // Police cars chase the player.
    for (var i = 0; i < S.police.length; i++) {
      var car = S.police[i];
      var dx = S.player.x - car.x, dz = S.player.z - car.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var wantHeading = Math.atan2(dx, dz);
      var turn = clamp(angleDiff(car.heading, wantHeading), -1.6 * dt, 1.6 * dt);
      car.heading += turn;
      var target = d > 200 ? 0 : (S.player.onFoot ? 30 : 42);
      car.speed += clamp(target - car.speed, -18 * dt, 10 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      var res = City.resolveCircle(car.x, car.z, CFG.CAR_RADIUS);
      car.x = res.x; car.z = res.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // Flashing light bar.
      if (car.mesh.userData.lightBar) {
        var phase = Math.floor(S.time * 40 + i * 2) % 2 === 0;
        car.mesh.userData.lightBar.children[0].material.emissiveIntensity = phase ? 2.2 : 0.2;
        car.mesh.userData.lightBar.children[1].material.emissiveIntensity = phase ? 0.2 : 2.2;
      }
      var wheels = car.mesh.userData.wheels;
      if (wheels) for (var w = 0; w < wheels.length; w++) wheels[w].rotation.x += car.speed * dt * 1.4;
      // Ramming the player's car.
      if (!S.player.onFoot && d < 4.5) {
        S.player.car.speed *= 0.985;
        bustedMeter += dt * (Math.abs(S.player.car.speed) < 3 ? 0.35 : 0.05);
      }
      // Too far away? Teleport closer to keep the chase alive.
      if (d > 260) {
        var a = rng() * Math.PI * 2;
        car.x = clamp(S.player.x + Math.cos(a) * 100, -330, 330);
        car.z = clamp(S.player.z + Math.sin(a) * 100, -330, 330);
      }
    }
    // Police on foot chase the player when on foot.
    for (var j = 0; j < S.policePeds.length; j++) {
      var ped = S.policePeds[j];
      if (ped.state === 'dead') continue;
      var pdx = S.player.x - ped.x, pdz = S.player.z - ped.z;
      var pd = Math.sqrt(pdx * pdx + pdz * pdz);
      ped.heading = Math.atan2(pdx / pd, pdz / pd);
      ped.speed = 7;
      var pnx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
      var pnz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
      var pres = City.resolveCircle(pnx, pnz, 0.5);
      ped.x = pres.x; ped.z = pres.z;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      ped.walkPhase += dt * 12;
      var s2 = Math.sin(ped.walkPhase);
      ped.mesh.userData.legL.rotation.x = s2 * 0.7;
      ped.mesh.userData.legR.rotation.x = -s2 * 0.7;
      if (pd < 2.6 && S.player.onFoot) bustedMeter += dt * 0.6;
    }
    // Siren volume by nearest police distance.
    var nearest = Infinity;
    for (var k = 0; k < S.police.length; k++) {
      var dd = Math.sqrt(dist2(S.police[k].x, S.police[k].z, S.player.x, S.player.z));
      if (dd < nearest) nearest = dd;
    }
    AudioSys.sirenSet(S.wanted > 0 && nearest < 130, nearest);
    if (bustedMeter >= 1) { bustedMeter = 0; if (S.onBusted) S.onBusted(); }
  }

  function updateEnemies(dt) {
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      if (e.state === 'dead') continue;
      var dx = S.player.x - e.x, dz = S.player.z - e.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 45) {
        e.heading = Math.atan2(dx / d, dz / d);
        // Keep a firing distance, strafe sideways.
        var want = d > 18 ? 3.2 : (d < 10 ? -2 : 0);
        e.x += Math.sin(e.heading) * want * dt + Math.cos(e.heading) * Math.sin(S.time * 3 + i) * 1.2 * dt;
        e.z += Math.cos(e.heading) * want * dt - Math.sin(e.heading) * Math.sin(S.time * 3 + i) * 1.2 * dt;
        var res = City.resolveCircle(e.x, e.z, 0.5);
        e.x = res.x; e.z = res.z;
        e.shootT = (e.shootT || 0) - dt;
        if (e.shootT <= 0 && d < 38) {
          e.shootT = range(rng, 1.0, 1.8);
          AudioSys.gunshot();
          spawnTracer(e.x, 1.5, e.z, S.player.x, 1.4, S.player.z);
          var hitChance = d < 15 ? 0.3 : d < 25 ? 0.18 : 0.08;
          if (rng() < hitChance) {
            S.health -= rangeInt(rng, 5, 10);
            S.shake = 0.35;
            HUD.flashDamage();
            if (S.health <= 0) { S.health = 0; if (S.onWasted) S.onWasted(); }
          }
        }
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
      e.walkPhase += dt * 4;
      var s = Math.sin(e.walkPhase);
      e.mesh.userData.legL.rotation.x = s * 0.5;
      e.mesh.userData.legR.rotation.x = -s * 0.5;
    }
  }

  function updateCoins(dt) {
    var p = S.player;
    for (var i = 0; i < S.coins.length; i++) {
      var c = S.coins[i];
      if (c.taken) continue;
      c.spin += dt * 2;
      c.mesh.rotation.y = c.spin;
      c.mesh.position.y = 1.1 + Math.sin(c.spin * 1.5) * 0.15;
      if (dist2(p.x, p.z, c.x, c.z) < 2.4 * 2.4) {
        c.taken = true;
        c.mesh.visible = false;
        S.coinsCollected++;
        S.cash += CFG.COIN_VALUE;
        S.stats.earned += CFG.COIN_VALUE;
        AudioSys.coin();
        HUD.toast('Sun coin! +$' + CFG.COIN_VALUE + ' (' + S.coinsCollected + '/' + CFG.COINS_TOTAL + ')', 'good');
      }
    }
  }

  function updatePickups(dt) {
    var p = S.player;
    for (var i = 0; i < S.pickups.length; i++) {
      var pk = S.pickups[i];
      if (pk.taken) {
        pk.respawn -= dt;
        if (pk.respawn <= 0) { pk.taken = false; pk.mesh.visible = true; }
        continue;
      }
      pk.mesh.rotation.y += dt;
      pk.mesh.position.y = 1.0 + Math.sin(S.time * 6 + i) * 0.12;
      if (dist2(p.x, p.z, pk.x, pk.z) < 2 * 2) {
        pk.taken = true; pk.mesh.visible = false; pk.respawn = 60;
        if (pk.kind === 'health') {
          S.health = Math.min(CFG.PLAYER_MAX_HEALTH, S.health + 40);
          HUD.toast('Health +40', 'good');
        } else {
          S.ammo += 24;
          HUD.toast('Ammo +24', 'good');
        }
        AudioSys.pickup();
      }
    }
  }

  function updateTaxi(dt) {
    var t = S.taxi;
    if (!t.active) {
      // Spawn a waiting passenger every so often when the player is driving.
      taxiTimer -= dt;
      if (taxiTimer <= 0 && S.player.car && !Missions.active()) {
        taxiTimer = 25;
        spawnTaxiPassenger();
      }
      return;
    }
    t.timeLeft -= dt;
    if (t.timeLeft <= 0) {
      HUD.toast('Fare cancelled — too slow', 'bad');
      endTaxi(false);
      return;
    }
    var d = Math.sqrt(dist2(S.player.x, S.player.z, t.dest.x, t.dest.z));
    if (d < 6 && S.player.car) {
      var tip = Math.floor(t.timeLeft) * 2;
      var fare = t.fare + tip;
      S.cash += fare; S.stats.earned += fare; S.stats.fares++;
      HUD.toast('Fare complete! +$' + fare + (tip > 0 ? ' (incl. $' + tip + ' tip)' : ''), 'good');
      AudioSys.missionPass();
      endTaxi(true);
    }
  }

  function spawnTaxiPassenger() {
    var ped = Entities.makePerson('ped');
    var centers = City.roadCenters();
    var c = pick(rng, centers);
    var along = range(rng, -300, 300);
    if (rng() < 0.5) { ped.x = along; ped.z = c + 9; } else { ped.x = c + 9; ped.z = along; }
    ped.state = 'wait';
    ped.mesh.position.set(ped.x, 0, ped.z);
    scene.add(ped.mesh);
    S.peds.push(ped);
    S.taxi.passenger = ped;
    S.taxi.waiting = true;
    HUD.toast('A passenger is waving for a ride — drive close and press E', 'info');
  }

  function startTaxiRide() {
    var t = S.taxi;
    var ped = t.passenger;
    if (!ped) return;
    ped.mesh.visible = false;
    var centers = City.roadCenters();
    var destRoad = pick(rng, centers);
    var destAlong = range(rng, -300, 300);
    if (rng() < 0.5) t.dest = { x: destAlong, z: destRoad };
    else t.dest = { x: destRoad, z: destAlong };
    t.fare = rangeInt(rng, CFG.TAXI_FARE_MIN, CFG.TAXI_FARE_MAX);
    var d = Math.sqrt(dist2(S.player.x, S.player.z, t.dest.x, t.dest.z));
    t.timeLeft = d / 14 + 25;
    t.active = true; t.waiting = false;
    if (t.marker) scene.remove(t.marker);
    t.marker = Entities.makeMarkerMesh(0x2ce8c8);
    t.marker.position.set(t.dest.x, 0, t.dest.z);
    scene.add(t.marker);
    HUD.toast('Take the passenger to the marker — $' + t.fare + ' + tip', 'info');
  }

  function endTaxi(done) {
    var t = S.taxi;
    if (t.marker) { scene.remove(t.marker); t.marker = null; }
    if (t.passenger) {
      t.passenger.mesh.visible = true;
      t.passenger.state = 'walk';
      t.passenger.x = S.player.x + 3; t.passenger.z = S.player.z + 3;
      pickWalkTarget(t.passenger);
      t.passenger = null;
    }
    t.active = false; t.waiting = false; t.dest = null;
    if (S.onTaxiEnd) S.onTaxiEnd(done);
  }

  function updateParticles(dt) {
    for (var i = 0; i < particlePool.length; i++) {
      var pt = particlePool[i];
      if (pt.life <= 0) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.mesh.visible = false; continue; }
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.position.z += pt.vz * dt;
      pt.vy -= 6 * dt;
      pt.mesh.material.opacity = 0.9 * (pt.life / pt.maxLife);
      var sc = 0.6 + (1 - pt.life / pt.maxLife) * 1.4;
      pt.mesh.scale.set(sc, sc, sc);
    }
    for (var j = tracers.length - 1; j >= 0; j--) {
      tracers[j].life -= dt;
      if (tracers[j].life <= 0) {
        scene.remove(tracers[j].line);
        tracers[j].line.geometry.dispose();
        tracers.splice(j, 1);
      }
    }
  }

  function updateWanted(dt) {
    if (S.wanted === 0) { ensurePolice(0); return; }
    var nearestPolice = Infinity;
    for (var i = 0; i < S.police.length; i++) {
      var d = Math.sqrt(dist2(S.police[i].x, S.police[i].z, S.player.x, S.player.z));
      if (d < nearestPolice) nearestPolice = d;
    }
    for (var j = 0; j < S.policePeds.length; j++) {
      var d2 = Math.sqrt(dist2(S.policePeds[j].x, S.policePeds[j].z, S.player.x, S.player.z));
      if (d2 < nearestPolice) nearestPolice = d2;
    }
    if (nearestPolice > 80) {
      S.wantedQuiet += dt;
      if (S.wantedQuiet > CFG.WANTED_DECAY_SECONDS) {
        S.wanted--;
        S.wantedQuiet = 0;
        HUD.toast(S.wanted === 0 ? 'You lost the cops' : 'Heat cooling off — ' + S.wanted + ' star' + (S.wanted > 1 ? 's' : ''), 'good');
        ensurePolice(S.wanted);
      }
    } else {
      S.wantedQuiet = 0;
    }
  }

  return {
    createWorld: createWorld,
    step: step,
    addWanted: addWanted,
    ensurePolice: ensurePolice,
    enterCar: enterCar,
    exitCar: exitCar,
    shoot: shoot,
    punch: punch,
    nearestCar: nearestCar,
    spawnBurst: spawnBurst,
    startTaxiRide: startTaxiRide,
    endTaxi: endTaxi,
    spawnPoliceCar: spawnPoliceCar,
    addPickup: addPickup,
    flashT: function () { return flashT; },
  };
})();

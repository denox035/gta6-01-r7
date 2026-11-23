// Mesh factories: the low-poly people and cars of Solmar. A car is a group of
// boxes with wheels that spin and steer; a person is a small articulated figure
// whose legs swing as it walks. All of it is original geometry built here.
var Entities = (function () {
  var CAR_COLORS = [0xc8452c, 0x2c6ac8, 0xe8c832, 0x3a9a4a, 0x8a4ac8, 0xd8d8d8, 0x222226, 0xc86a2c, 0x4ac8c0, 0x9a2c4a];
  var SHIRT_COLORS = [0x2c6ac8, 0xc8452c, 0xe8c832, 0x3a9a4a, 0xd8d8d8, 0xc86a2c, 0x4a4a4a, 0x8a4ac8];

  function lam(color) { return new THREE.MeshLambertMaterial({ color: color }); }

  // --- cars --------------------------------------------------------------
  function makeCarMesh(opts) {
    opts = opts || {};
    var color = opts.color !== undefined ? opts.color : pick(Math.random, CAR_COLORS);
    var police = !!opts.police;
    var sport = !!opts.sport;
    var g = new THREE.Group();
    var bodyMat = lam(police ? 0xe8e8e8 : color);
    var len = sport ? 4.6 : 4.2, wid = sport ? 1.9 : 1.85, hgt = sport ? 0.62 : 0.72;
    var body = new THREE.Mesh(new THREE.BoxGeometry(wid, hgt, len), bodyMat);
    body.position.y = 0.62; body.castShadow = true;
    g.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.82, 0.55, len * 0.48),
      lam(0x1c2733));
    cabin.position.set(0, 1.18, -len * 0.04); cabin.castShadow = true;
    g.add(cabin);
    // Wheels.
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    var wheelMat = lam(0x14141a);
    var wheels = [];
    [[-wid / 2, len / 2 - 0.8], [wid / 2, len / 2 - 0.8], [-wid / 2, -len / 2 + 0.8], [wid / 2, -len / 2 + 0.8]].forEach(function (p, i) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(p[0], 0.36, p[1]);
      g.add(w); wheels.push(w);
    });
    // Headlights and taillights.
    var hl = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.86, 0.14, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xfff2b8, emissive: 0xffedb0, emissiveIntensity: 0.7 }));
    hl.position.set(0, 0.66, len / 2 + 0.01);
    g.add(hl);
    var tl = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.86, 0.14, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xc81e1e, emissive: 0x881111, emissiveIntensity: 0.7 }));
    tl.position.set(0, 0.66, -len / 2 - 0.01);
    g.add(tl);
    var lightBar = null;
    if (police) {
      // Black doors + a red/blue light bar.
      var door = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.02, 0.4, len * 0.55), lam(0x1c1c22));
      door.position.set(0, 0.62, 0);
      g.add(door);
      lightBar = new THREE.Group();
      var r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3),
        new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
      r.position.x = -0.35; lightBar.add(r);
      var b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1 }));
      b.position.x = 0.35; lightBar.add(b);
      lightBar.position.set(0, 1.52, -len * 0.04);
      g.add(lightBar);
    }
    g.userData.wheels = wheels;
    g.userData.lightBar = lightBar;
    g.userData.len = len;
    return g;
  }

  function makeCar(opts) {
    var mesh = makeCarMesh(opts);
    return {
      mesh: mesh,
      x: 0, z: 0, heading: 0, speed: 0,
      steer: 0, color: opts.color || 0,
      sport: !!opts.sport, police: !!opts.police,
      isPlayer: false, driver: null, // traffic cars carry a driver ped id or null (parked)
      target: null, // traffic route target {x,z}
      axis: 'x', dir: 1, lane: 0,
      stuck: 0, health: 100,
      honk: 0,
    };
  }

  // --- people ------------------------------------------------------------
  function makePersonMesh(shirt, pants, skin) {
    var g = new THREE.Group();
    var skinMat = lam(skin || 0xd8a878);
    var shirtMat = lam(shirt);
    var pantsMat = lam(pants || 0x2c3242);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirtMat);
    torso.position.y = 1.12; torso.castShadow = true;
    g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
    head.position.y = 1.78; head.castShadow = true;
    g.add(head);
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), lam(0x241a12));
    hair.position.y = 1.84;
    g.add(hair);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.26), pantsMat);
    legL.position.set(-0.17, 0.39, 0); g.add(legL);
    var legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.26), pantsMat);
    legR.position.set(0.17, 0.39, 0); g.add(legR);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), shirtMat);
    armL.position.set(-0.42, 1.12, 0); g.add(armL);
    var armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), shirtMat);
    armR.position.set(0.42, 1.12, 0); g.add(armR);
    g.userData.legL = legL; g.userData.legR = legR;
    g.userData.armL = armL; g.userData.armR = armR;
    g.userData.torso = torso;
    return g;
  }

  function makePerson(kind) {
    var shirt = kind === 'enemy' ? 0x8a1e1e : kind === 'police' ? 0x1c2c4a : pick(Math.random, SHIRT_COLORS);
    var mesh = makePersonMesh(shirt, kind === 'police' ? 0x1c2c4a : 0x2c3242);
    if (kind === 'police') {
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 10), lam(0x14203a));
      cap.position.y = 1.98; mesh.add(cap);
    }
    return {
      mesh: mesh, kind: kind || 'ped',
      x: 0, z: 0, heading: 0, speed: 0,
      walkPhase: Math.random() * 6,
      target: null, state: 'walk', // walk | flee | dead | wait | chase
      waitT: 0, health: 100,
      panic: 0,
    };
  }

  // --- pickups, coins, markers -------------------------------------------
  function makeCoinMesh() {
    var g = new THREE.Group();
    var coin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16),
      new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xa87800, emissiveIntensity: 0.6 }));
    coin.rotation.x = Math.PI / 2;
    g.add(coin);
    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.18 }));
    g.add(glow);
    return g;
  }

  function makeMarkerMesh(color) {
    var g = new THREE.Group();
    var cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: color || 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    cyl.position.y = 15;
    g.add(cyl);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 24),
      new THREE.MeshBasicMaterial({ color: color || 0xffd23e }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
    g.add(ring);
    var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 4),
      new THREE.MeshBasicMaterial({ color: color || 0xffd23e }));
    arrow.rotation.x = Math.PI; arrow.position.y = 3.2;
    g.add(arrow);
    g.userData.ring = ring; g.userData.arrow = arrow;
    return g;
  }

  function makeHealthMesh() {
    var g = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), lam(0xffffff));
    g.add(box);
    var cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), lam(0xd81e1e));
    cross1.position.z = 0.36; g.add(cross1);
    var cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.1), lam(0xd81e1e));
    cross2.position.z = 0.36; g.add(cross2);
    return g;
  }

  function makeAmmoMesh() {
    var g = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.9), lam(0x3a5a2c));
    g.add(box);
    for (var i = 0; i < 3; i++) {
      var b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6), lam(0xd8b23e));
      b.position.set(-0.18 + i * 0.18, 0.32, 0);
      g.add(b);
    }
    return g;
  }

  return {
    makeCarMesh: makeCarMesh,
    makeCar: makeCar,
    makePersonMesh: makePersonMesh,
    makePerson: makePerson,
    makeCoinMesh: makeCoinMesh,
    makeMarkerMesh: makeMarkerMesh,
    makeHealthMesh: makeHealthMesh,
    makeAmmoMesh: makeAmmoMesh,
    CAR_COLORS: CAR_COLORS,
  };
})();

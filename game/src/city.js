// SOLMAR, the city itself: a 9x9 grid of blocks split by roads, a beach and the sea
// to the south, a plaza, a park, a parking lot and the docks. Everything is built
// from boxes and canvas textures at boot, from a fixed seed, so the city is the
// same every run. Exports the collision boxes and the road graph the traffic uses.
var City = (function () {
  var roadCenters = []; // centrelines, -333 .. +333 step 74
  var colliders = [];   // {minX,maxX,minZ,maxZ}
  var buildings = [];   // {x,z,w,d,h,mesh}
  var lamps = [];
  var trees = [];
  var spawnPoints = {};
  var plaza = { x: 0, z: 0 };
  var dockPoint = { x: 296, z: 296 };
  var lotPoint = { x: -222, z: -148 };

  function canvasTexture(w, h, draw, repeatX, repeatY) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (repeatX) tex.repeat.set(repeatX, repeatY || repeatX);
    tex.anisotropy = 4;
    return tex;
  }

  function buildingTexture(rng, base, lit) {
    return canvasTexture(128, 256, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      var cols = 6, rows = 14;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var on = rng() < lit;
          g.fillStyle = on ? '#ffd98a' : (rng() < 0.5 ? '#2c3e50' : '#5d7a94');
          g.fillRect(8 + c * 20, 10 + r * 17, 12, 10);
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, h - 14, w, 14);
    });
  }

  function roadTexture() {
    return canvasTexture(128, 128, function (g, w, h) {
      g.fillStyle = '#33363d'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 260; i++) {
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#c8b45a';
      g.fillRect(w / 2 - 2, 8, 4, 26); g.fillRect(w / 2 - 2, 72, 4, 26);
      g.fillStyle = '#e8e8e8';
      g.fillRect(6, 0, 2, h); g.fillRect(w - 8, 0, 2, h);
    }, 1, 1);
  }

  function build(scene, rng) {
    for (var i = 0; i < CFG.ROADS; i++) roadCenters.push(-333 + i * CFG.PITCH);

    // Ground, beach, sea.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100),
      new THREE.MeshLambertMaterial({ color: PALETTE.ground }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 60);
    scene.add(ground);
    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 110),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, 395);
    scene.add(sand);
    var sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 420),
      new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.0, 660);
    sea.name = 'sea';
    scene.add(sea);

    // Roads: one long plane per centreline, with a dashed-line texture.
    var roadTex = roadTexture();
    var roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    roadCenters.forEach(function (c) {
      var len = CFG.HALF * 2 + CFG.ROAD_W;
      var v = new THREE.Mesh(new THREE.PlaneGeometry(CFG.ROAD_W, len), roadMat.clone());
      v.material.map = roadTex.clone();
      v.material.map.repeat.set(1, len / 28);
      v.material.map.needsUpdate = true;
      v.rotation.x = -Math.PI / 2; v.position.set(c, 0.06, 0);
      scene.add(v);
      var hz = new THREE.Mesh(new THREE.PlaneGeometry(len, CFG.ROAD_W), roadMat.clone());
      hz.material.map = roadTex.clone();
      hz.material.map.repeat.set(len / 28, 1);
      hz.material.map.needsUpdate = true;
      hz.rotation.x = -Math.PI / 2; hz.position.set(0, 0.06, c);
      scene.add(hz);
    });

    // Building textures (a few shared variants).
    var texes = [
      buildingTexture(rng, '#7a6a5f', 0.25),
      buildingTexture(rng, '#5f6a7a', 0.3),
      buildingTexture(rng, '#8a7a5f', 0.2),
      buildingTexture(rng, '#6a5f7a', 0.35),
      buildingTexture(rng, '#a87a5f', 0.25),
    ];
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);

    // Blocks.
    for (var bx = -4; bx <= 4; bx++) {
      for (var bz = -4; bz <= 4; bz++) {
        var cx = bx * CFG.PITCH, cz = bz * CFG.PITCH;
        var downtown = Math.abs(bx) <= 1 && Math.abs(bz) <= 1;
        // Special blocks.
        if (bx === 0 && bz === 0) { buildPlaza(scene, cx, cz, rng); continue; }
        if (bx === -3 && bz === 2) { buildPark(scene, cx, cz, rng); continue; }
        if (bx === 3 && bz === -2) { buildLot(scene, cx, cz, rng); continue; }
        if (bx === 4 && bz === 4) { buildDocks(scene, cx, cz, rng); continue; }
        // Sidewalk base.
        var base = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }));
        base.scale.set(CFG.BLOCK, 0.4, CFG.BLOCK);
        base.position.set(cx, 0, cz);
        base.receiveShadow = true;
        scene.add(base);
        // One tower or four small buildings.
        var count = downtown ? 1 : (rng() < 0.6 ? 4 : 1);
        for (var k = 0; k < count; k++) {
          var w, d, ox = 0, oz = 0;
          if (count === 1) { w = range(rng, 34, 48); d = range(rng, 34, 48); }
          else {
            w = range(rng, 20, 26); d = range(rng, 20, 26);
            ox = (k % 2 === 0 ? -1 : 1) * 15; oz = (k < 2 ? -1 : 1) * 15;
          }
          var h = downtown ? range(rng, 45, 95) : range(rng, 10, 42);
          if (Math.abs(bx) <= 2 && Math.abs(bz) <= 2 && !downtown) h = range(rng, 24, 60);
          var mat = new THREE.MeshLambertMaterial({ map: pick(rng, texes) });
          var b = new THREE.Mesh(boxGeo, mat);
          b.scale.set(w, h, d);
          b.position.set(cx + ox, 0.4, cz + oz);
          b.castShadow = true; b.receiveShadow = true;
          scene.add(b);
          // Rooftop box.
          var roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x555550 }));
          roof.scale.set(w * 0.3, 2.5, d * 0.3);
          roof.position.set(cx + ox + w * 0.15, 0.4 + h, cz + oz - d * 0.1);
          scene.add(roof);
          colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
          buildings.push({ x: cx + ox, z: cz + oz, w: w, d: d, h: h, mesh: b });
        }
        // A palm or two on the block corner.
        if (rng() < 0.7) addPalm(scene, cx + 26, cz + 26, rng);
        if (rng() < 0.4) addPalm(scene, cx - 26, cz - 26, rng);
      }
    }

    // Street lamps along every road, both sides.
    var lampGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    var lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    var bulbGeo = new THREE.SphereGeometry(0.45, 8, 6);
    roadCenters.forEach(function (c) {
      for (var t = -300; t <= 300; t += 74) {
        if (Math.abs(t - c) < 20) continue;
        var lamp = new THREE.Group();
        var pole = new THREE.Mesh(lampGeo, lampMat);
        pole.position.y = 3.5; lamp.add(pole);
        var arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.15), lampMat);
        arm.position.set(1, 6.9, 0); lamp.add(arm);
        var bulbMat = new THREE.MeshLambertMaterial({ color: 0x554411, emissive: 0xffc861, emissiveIntensity: 0.4 });
        var bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(2.1, 6.8, 0); lamp.add(bulb);
        lamp.position.set(c + CFG.ROAD_W / 2 + 1.2, 0, t);
        lamp.userData.bulbMat = bulbMat;
        scene.add(lamp);
        lamps.push(lamp);
      }
    });

    // Spawn points used by missions and the player start.
    spawnPoints.plaza = { x: 0, z: 24 };
    spawnPoints.hospital = { x: -37, z: -111 };
    spawnPoints.policeStation = { x: 111, z: -37 };
    spawnPoints.docks = { x: 296, z: 296 };
    spawnPoints.lot = { x: -222, z: -148 };
    spawnPoints.beach = { x: 60, z: 380 };
    return { roadCenters: roadCenters, colliders: colliders, buildings: buildings, lamps: lamps, spawnPoints: spawnPoints };
  }

  function buildPlaza(scene, cx, cz, rng) {
    var base = new THREE.Mesh(new THREE.BoxGeometry(CFG.BLOCK, 0.4, CFG.BLOCK),
      new THREE.MeshLambertMaterial({ color: 0xa89a80 }));
    base.position.set(cx, 0.2, cz); base.receiveShadow = true;
    scene.add(base);
    // Fountain: a ring and a column of water.
    var ring = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 1.2, 20),
      new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
    ring.position.set(cx, 0.9, cz); ring.castShadow = true;
    scene.add(ring);
    var water = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.4, 20),
      new THREE.MeshLambertMaterial({ color: 0x4fa8d8 }));
    water.position.set(cx, 1.3, cz);
    scene.add(water);
    var col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 3.4, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c2 }));
    col.position.set(cx, 1.4, cz);
    scene.add(col);
    colliders.push({ minX: cx - 7.6, maxX: cx + 7.6, minZ: cz - 7.6, maxZ: cz + 7.6 });
    for (var i = 0; i < 6; i++) addPalm(scene, cx + (i % 2 === 0 ? -24 : 24), cz + (i < 3 ? -20 : 20), rng);
    plaza = { x: cx, z: cz };
  }

  function buildPark(scene, cx, cz, rng) {
    var grass = new THREE.Mesh(new THREE.BoxGeometry(CFG.BLOCK, 0.4, CFG.BLOCK),
      new THREE.MeshLambertMaterial({ color: 0x5f9a4a }));
    grass.position.set(cx, 0.2, cz); grass.receiveShadow = true;
    scene.add(grass);
    for (var i = 0; i < 12; i++) {
      addTree(scene, cx + range(rng, -26, 26), cz + range(rng, -26, 26), rng);
    }
    var pond = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.5, 18),
      new THREE.MeshLambertMaterial({ color: 0x3f8fb8 }));
    pond.position.set(cx + 12, 0.5, cz + 10);
    scene.add(pond);
  }

  function buildLot(scene, cx, cz, rng) {
    var tarmac = new THREE.Mesh(new THREE.BoxGeometry(CFG.BLOCK, 0.3, CFG.BLOCK),
      new THREE.MeshLambertMaterial({ color: 0x4a4d55 }));
    tarmac.position.set(cx, 0.15, cz);
    scene.add(tarmac);
    lotPoint = { x: cx, z: cz };
  }

  function buildDocks(scene, cx, cz, rng) {
    var concrete = new THREE.Mesh(new THREE.BoxGeometry(CFG.BLOCK, 0.4, CFG.BLOCK),
      new THREE.MeshLambertMaterial({ color: 0x8a8578 }));
    concrete.position.set(cx, 0.2, cz);
    scene.add(concrete);
    // Shipping containers, stacked.
    var cols = [0xc8452c, 0x2c6ac8, 0x3a9a4a, 0xc8a52c];
    for (var i = 0; i < 5; i++) {
      var c = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 3),
        new THREE.MeshLambertMaterial({ color: pick(rng, cols) }));
      c.position.set(cx - 18 + (i % 3) * 16, 1.9 + (i >= 3 ? 3 : 0), cz - 14 + Math.floor(i / 3) * 8);
      c.rotation.y = (rng() - 0.5) * 0.1;
      c.castShadow = true;
      scene.add(c);
      colliders.push({ minX: c.position.x - 6, maxX: c.position.x + 6, minZ: c.position.z - 1.8, maxZ: c.position.z + 1.8 });
    }
    var crane = new THREE.Mesh(new THREE.BoxGeometry(4, 26, 4),
      new THREE.MeshLambertMaterial({ color: 0xd8a52c }));
    crane.position.set(cx + 20, 13, cz + 18);
    scene.add(crane);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(26, 2, 2),
      new THREE.MeshLambertMaterial({ color: 0xd8a52c }));
    arm.position.set(cx + 8, 25, cz + 18);
    scene.add(arm);
    colliders.push({ minX: cx + 18, maxX: cx + 22, minZ: cz + 16, maxZ: cz + 20 });
    dockPoint = { x: cx, z: cz + 24 };
  }

  function addPalm(scene, x, z, rng) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
    trunk.position.y = 3.5; trunk.rotation.z = (rng() - 0.5) * 0.12;
    g.add(trunk);
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8a3a });
    for (var i = 0; i < 6; i++) {
      var leaf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.9), leafMat);
      var a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.5, 7.1, Math.sin(a) * 1.5);
      leaf.rotation.y = -a;
      leaf.rotation.z = 0.35;
      g.add(leaf);
    }
    g.position.set(x, 0.4, z);
    scene.add(g);
    trees.push(g);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }

  function addTree(scene, x, z, rng) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
    trunk.position.y = 1.2; g.add(trunk);
    var crown = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 2.2, 3.2), 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a8a3a }));
    crown.position.y = 3.6; crown.castShadow = true; g.add(crown);
    g.position.set(x, 0.4, z);
    scene.add(g);
    trees.push(g);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }

  // --- queries -----------------------------------------------------------
  function nearestRoadCenter(v) {
    var best = roadCenters[0], bd = Infinity;
    for (var i = 0; i < roadCenters.length; i++) {
      var d = Math.abs(roadCenters[i] - v);
      if (d < bd) { bd = d; best = roadCenters[i]; }
    }
    return best;
  }
  function onRoad(x, z) {
    return Math.abs(x - nearestRoadCenter(x)) < CFG.ROAD_W / 2 ||
      Math.abs(z - nearestRoadCenter(z)) < CFG.ROAD_W / 2;
  }
  // Push a circle (x,z,r) out of every building collider it overlaps.
  function resolveCircle(x, z, r) {
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (x + r <= c.minX || x - r >= c.maxX || z + r <= c.minZ || z - r >= c.maxZ) continue;
      var dxl = x + r - c.minX, dxr = c.maxX - (x - r);
      var dzl = z + r - c.minZ, dzr = c.maxZ - (z - r);
      var m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = c.minX - r;
      else if (m === dxr) x = c.maxX + r;
      else if (m === dzl) z = c.minZ - r;
      else z = c.maxZ + r;
    }
    return { x: x, z: z };
  }
  function hitsCollider(x, z, r) {
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  return {
    build: build,
    roadCenters: function () { return roadCenters; },
    colliders: function () { return colliders; },
    buildings: function () { return buildings; },
    lamps: function () { return lamps; },
    spawnPoints: function () { return spawnPoints; },
    plaza: function () { return plaza; },
    dockPoint: function () { return dockPoint; },
    lotPoint: function () { return lotPoint; },
    nearestRoadCenter: nearestRoadCenter,
    onRoad: onRoad,
    resolveCircle: resolveCircle,
    hitsCollider: hitsCollider,
  };
})();

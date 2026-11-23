// The three.js renderer: scene, sun and sky that follow the in-game clock,
// a third-person camera that orbits with the mouse, shadows that track the
// player, and the muzzle-flash light. No post-processing — the look comes from
// the golden-hour palette, the fog and the long shadows.
var Render = (function () {
  var renderer = null, scene = null, camera = null;
  var sun = null, hemi = null, flashLight = null;
  var canvas = null;
  var camTarget = { x: 0, z: 0 };

  function init(cv) {
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(PALETTE.skyDay);
    scene.fog = new THREE.Fog(PALETTE.fogDay, 180, 700);
    camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);
    camera.position.set(0, 12, -20);

    hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.9);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(PALETTE.sunDay, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    flashLight = new THREE.PointLight(0xffe9a8, 0, 30);
    scene.add(flashLight);
    resize();
    window.addEventListener('resize', resize);
    return scene;
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function aimDirection() {
    // Direction the camera looks, flattened to the ground plane.
    var d = new THREE.Vector3();
    camera.getWorldDirection(d);
    var len = Math.sqrt(d.x * d.x + d.z * d.z) || 1;
    return { x: d.x / len, z: d.z / len };
  }

  function update(dt) {
    // Mouse orbit.
    var md = Input.takeMouseDelta();
    S.cameraYaw -= md.x * 0.005;
    S.cameraPitch = clamp(S.cameraPitch + md.y * 0.003, 0.08, 1.1);
    var wheel = Input.takeWheel();
    if (wheel !== 0) S.cameraDist = clamp(S.cameraDist + wheel * 0.01, 6, 20);
    // Drift the camera behind the player's motion.
    var p = S.player;
    if (p.onFoot && p.speed > 0.5) {
      S.cameraYaw += angleDiff(S.cameraYaw, p.heading + Math.PI) * Math.min(1, dt * 1.2);
    } else if (p.car) {
      S.cameraYaw += angleDiff(S.cameraYaw, p.car.heading + Math.PI) * Math.min(1, dt * 2.2);
    }
    // Camera position: behind the player, above, looking at the player.
    var dist = S.cameraDist * (p.car ? 1.25 : 1);
    var cx = p.x + Math.sin(S.cameraYaw) * dist;
    var cz = p.z + Math.cos(S.cameraYaw) * dist;
    var cy = 4.5 + Math.sin(S.cameraPitch) * dist * 0.9;
    // Keep the camera out of buildings.
    var res = City.resolveCircle(cx, cz, 1.2);
    cx = res.x; cz = res.z;
    var shake = S.shake || 0;
    if (shake > 0) {
      S.shake = Math.max(0, shake - dt * 1.4);
      cx += (Math.random() - 0.5) * shake;
      cy += (Math.random() - 0.5) * shake * 0.6;
      cz += (Math.random() - 0.5) * shake;
    }
    camera.position.set(cx, cy, cz);
    camTarget.x = p.x;
    camTarget.z = p.z;
    camera.lookAt(p.x, 1.6 + (p.car ? 0.4 : 0), p.z);

    // Sun, sky and fog from the clock. 6:00 sunrise, 18:30 sunset.
    var t = S.time;
    var dayF = clamp(Math.sin((t - 6) / 12 * Math.PI), 0, 1); // 0 night, 1 noon
    var duskF = clamp(1 - Math.abs(t - 17.5) / 2.5, 0, 1) * (t > 12 ? 1 : 0);
    var sunAngle = ((t - 6) / 12) * Math.PI; // 0 at dawn, PI at dusk
    var sx = Math.cos(sunAngle) * 180, sy = Math.sin(sunAngle) * 160 + 10, sz = 90;
    sun.position.set(p.x + sx, sy, p.z + sz);
    sun.target.position.set(p.x, 0, p.z);
    sun.intensity = 0.6 + dayF * 2.2;
    hemi.intensity = 0.45 + dayF * 0.7;
    var sky = new THREE.Color(PALETTE.skyNight).lerp(new THREE.Color(PALETTE.skyDay), dayF);
    if (duskF > 0) sky.lerp(new THREE.Color(PALETTE.skyDusk), duskF * 0.7);
    scene.background.copy(sky);
    scene.fog.color.copy(sky).lerp(new THREE.Color(PALETTE.fogDay), 0.35);
    // Lamp glow at night.
    var lamps = City.lamps();
    var night = dayF < 0.35;
    for (var i = 0; i < lamps.length; i++) {
      lamps[i].userData.bulbMat.emissiveIntensity = night ? 1.6 : 0.4;
    }
    // Muzzle flash.
    var ft = World.flashT();
    flashLight.intensity = ft > 0 ? 60 : 0;
    if (ft > 0) flashLight.position.set(p.x, 1.6, p.z);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return {
    init: init, update: update, render: render,
    aimDirection: aimDirection,
    scene: function () { return scene; },
    camera: function () { return camera; },
  };
})();

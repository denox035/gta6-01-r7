// Renderer: three.js scene, day-cycle lighting, third-person camera,
// mesh sync for every entity, tracers, muzzle flash, beacon marker and coins.
import { CITY, PALETTE } from './config.js';
import { buildCity } from './city.js';
import { makeCarMesh, makePedMesh, makePlayerMesh } from './entities.js';
import { missionTarget } from './missions.js';
import { lerp, clamp } from './random.js';

const THREE = window.THREE;

export function createRenderer(canvas, state) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDay);
  scene.fog = new THREE.Fog(0x9fc4e0, 120, 420);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
  sun.position.set(120, 160, 60);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.5);
  scene.add(hemi);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 12, 55);

  const city = buildCity(state.rng);
  scene.add(city.group);
  state.city.colliders = city.colliders;
  state.city.roadLines = city.roadLines;
  state.city.lights = city.lights;

  // Player mesh.
  const playerMesh = makePlayerMesh();
  scene.add(playerMesh);

  // Car meshes (traffic + police share the pool; parked cars keep theirs).
  const carMeshes = new Map();
  function carMeshFor(car) {
    let m = carMeshes.get(car);
    if (!m) {
      m = makeCarMesh(car.color, car.kind === 'police');
      carMeshes.set(car, m);
      scene.add(m);
    }
    return m;
  }
  for (const car of state.cars) carMeshFor(car);

  // Ped meshes.
  const pedMeshes = new Map();
  function pedMeshFor(ped, isCop) {
    let m = pedMeshes.get(ped);
    if (!m) {
      m = makePedMesh(ped.shirt || 0x1a2a4a, isCop);
      pedMeshes.set(ped, m);
      scene.add(m);
    }
    return m;
  }
  for (const ped of state.peds) pedMeshFor(ped, false);

  // Gang meshes (red shirts).
  for (const g of state.gang) {
    if (!g.mesh) {
      g.mesh = makePedMesh(0xc0392b, false);
      scene.add(g.mesh);
    }
  }

  // Coins: spinning gold discs.
  const coinGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.12, 16);
  const coinMat = new THREE.MeshBasicMaterial({ color: 0xffd94d });
  for (const coin of state.coins) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(coin.x, 1.2, coin.z);
    coin.mesh = m;
    scene.add(m);
  }

  // Pickups: green crosses (health) and yellow boxes (ammo).
  for (const pk of state.pickups) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshBasicMaterial({ color: pk.kind === 'health' ? 0x2ecc71 : 0xf1c40f }),
    );
    m.position.set(pk.x, 0.8, pk.z);
    pk.mesh = m;
    scene.add(m);
  }

  // Mission beacon: tall gold pillar of light.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  beacon.position.y = 30;
  scene.add(beacon);
  const beaconBase = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  beaconBase.rotation.x = -Math.PI / 2;
  beaconBase.position.y = 0.1;
  scene.add(beaconBase);

  // Tracer lines + muzzle flash.
  const tracerGroup = new THREE.Group();
  scene.add(tracerGroup);
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe27a }),
  );
  muzzle.visible = false;
  scene.add(muzzle);

  const camPos = new THREE.Vector3(0, 12, 55);
  const camLook = new THREE.Vector3(0, 1.5, 40);

  function dayCycle() {
    const h = state.clock;
    // Day factor: 1 at noon, 0 at midnight; dusk colours near 18-20h.
    const dayF = clamp(Math.sin(((h - 6) / 12) * Math.PI), 0, 1);
    const duskF = clamp(1 - Math.abs(h - 18.5) / 2.5, 0, 1) * (h > 12 ? 1 : 0);
    const sky = new THREE.Color(PALETTE.skyDay).lerp(new THREE.Color(PALETTE.skyNight), 1 - dayF);
    sky.lerp(new THREE.Color(PALETTE.skyDusk), duskF * 0.7);
    scene.background = sky;
    scene.fog.color.copy(sky);
    sun.intensity = 0.25 + dayF * 1.5;
    const sunAngle = ((h - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(sunAngle) * 160, Math.sin(sunAngle) * 160 + 20, 80);
    ambient.intensity = 0.25 + dayF * 0.35;
    hemi.intensity = 0.2 + dayF * 0.35;
    const lampOn = dayF < 0.35;
    for (const lamp of city.lights) lamp.material.color.setHex(lampOn ? 0xffe9a0 : 0x5a5a5a);
  }

  function sync() {
    const p = state.player;
    // Player.
    playerMesh.visible = !p.car;
    if (!p.car) {
      playerMesh.position.set(p.x, 0, p.z);
      playerMesh.rotation.y = p.angle;
      const bob = p.moving ? Math.sin(state.time * 12) * 0.06 : 0;
      playerMesh.position.y = Math.abs(bob);
      playerMesh.userData.legs.rotation.x = p.moving ? Math.sin(state.time * 12) * 0.5 : 0;
    }
    // Cars.
    const seen = new Set();
    for (const car of state.cars) {
      seen.add(car);
      const m = carMeshFor(car);
      m.position.set(car.x, 0, car.z);
      m.rotation.y = car.angle;
      const wheels = m.userData.wheels || [];
      for (const w of wheels) w.rotation.x = car.wheelSpin || 0;
      if (car.kind === 'police' && m.userData.lightBar) {
        m.userData.lightBar.material.color.setHex(Math.floor(state.time * 4) % 2 === 0 ? 0xff2222 : 0x2244ff);
      }
      m.visible = true;
    }
    for (const [car, m] of carMeshes) {
      if (!seen.has(car)) m.visible = false;
    }
    // Peds.
    for (const ped of state.peds) {
      const m = pedMeshFor(ped, false);
      m.position.set(ped.x, 0, ped.z);
      m.rotation.y = ped.angle;
      m.userData.legs.rotation.x = Math.sin(ped.walkPhase) * 0.45;
    }
    // Cops on foot.
    for (const cop of state.cops) {
      const m = pedMeshFor(cop, true);
      m.position.set(cop.x, 0, cop.z);
      m.rotation.y = cop.angle;
      m.userData.legs.rotation.x = Math.sin(cop.walkPhase) * 0.5;
    }
    // Gang.
    for (const g of state.gang) {
      if (!g.mesh) {
        g.mesh = makePedMesh(0xc0392b, false);
        scene.add(g.mesh);
      }
      g.mesh.visible = g.alive;
      if (g.alive) {
        g.mesh.position.set(g.x, 0, g.z);
        g.mesh.rotation.y = g.angle;
      }
    }
    // Coins + pickups.
    for (const coin of state.coins) {
      if (coin.mesh) {
        coin.mesh.visible = !coin.taken;
        coin.mesh.rotation.z += 0.03;
        coin.mesh.position.y = 1.2 + Math.sin(state.time * 2 + coin.id) * 0.25;
      }
    }
    for (const pk of state.pickups) {
      if (pk.mesh) {
        pk.mesh.visible = !pk.taken;
        pk.mesh.rotation.y += 0.02;
      }
    }
    // Beacon.
    const target = missionTarget(state);
    const taxiTarget = state.taxi.active
      ? (state.taxi.stage === 0 ? state.taxi.pickup : state.taxi.dest)
      : null;
    const bt = target || taxiTarget;
    if (bt) {
      beacon.visible = true;
      beaconBase.visible = true;
      beacon.position.set(bt.x, 30, bt.z);
      beaconBase.position.set(bt.x, 0.1, bt.z);
      const pulse = 0.3 + Math.sin(state.time * 4) * 0.12;
      beacon.material.opacity = pulse;
    } else {
      beacon.visible = false;
      beaconBase.visible = false;
    }
    // Tracers.
    while (tracerGroup.children.length > 0) tracerGroup.remove(tracerGroup.children[0]);
    for (const t of state.tracers) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(t.x1, 1.3, t.z1),
        new THREE.Vector3(t.x2, 1.3, t.z2),
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: t.enemy ? 0xff5533 : 0xffe27a }));
      tracerGroup.add(line);
    }
    // Muzzle flash at the player's gun.
    muzzle.visible = state.muzzle > 0 && !p.car;
    if (muzzle.visible) {
      muzzle.position.set(
        p.x + Math.sin(p.angle) * 0.6,
        1.3,
        p.z + Math.cos(p.angle) * 0.6,
      );
    }
  }

  function draw() {
    dayCycle();
    sync();
    // Third-person camera: behind the player/car, mouse-orbit yaw/pitch.
    const p = state.player;
    const shake = state.crashShake * 0.5;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    const dist = state.camDist + (p.car ? 3 : 0);
    const tx = p.x - Math.sin(state.camYaw) * Math.cos(state.camPitch) * dist;
    const tz = p.z - Math.cos(state.camYaw) * Math.cos(state.camPitch) * dist;
    const ty = 2 + Math.sin(state.camPitch) * dist;
    camPos.x = lerp(camPos.x, tx + sx, 0.25);
    camPos.y = lerp(camPos.y, ty + sy, 0.25);
    camPos.z = lerp(camPos.z, tz + sx, 0.25);
    camLook.x = lerp(camLook.x, p.x, 0.4);
    camLook.y = lerp(camLook.y, 1.6, 0.4);
    camLook.z = lerp(camLook.z, p.z, 0.4);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return { draw, scene, camera, renderer };
}

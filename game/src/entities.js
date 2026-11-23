// Entities: the player character, traffic cars, pedestrians and police.
// Mesh factories live here; movement logic for traffic/peds lives here too.
// Every entity keeps logic fields (x, z, angle, speed) plus its THREE mesh.
import { CITY, CAR_COLORS, CAR_NAMES, PED_SHIRTS } from './config.js';
import { clamp, angleLerp, dist2 } from './random.js';

const THREE = window.THREE;

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1a2e : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), bodyMat);
  body.position.y = 0.65;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.2),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0xecf0f1 : 0x222831 }),
  );
  cabin.position.set(0, 1.25, -0.2);
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    h.position.set(hx, 0.7, 2.22);
    g.add(h);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    bar.position.set(0, 1.65, -0.2);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  g.userData.wheels = wheels;
  return g;
}

export function makePedMesh(shirt, isCop) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.8, 0.3),
    new THREE.MeshLambertMaterial({ color: isCop ? 0x1a2a4a : 0x2c3e50 }),
  );
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.75, 0.34),
    new THREE.MeshLambertMaterial({ color: isCop ? 0x1a2a4a : shirt }),
  );
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.78;
  g.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.12, 0.46),
      new THREE.MeshLambertMaterial({ color: 0x0d1b2a }),
    );
    cap.position.y = 2.02;
    g.add(cap);
  }
  g.userData.legs = legs;
  g.userData.torso = torso;
  return g;
}

export function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xd4a017 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.85, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x1f2a44 }));
  legs.position.y = 0.42;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.36), jacket);
  torso.position.y = 1.2;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 1.85;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48),
    new THREE.MeshLambertMaterial({ color: 0x7a1f1f }));
  cap.position.y = 2.1;
  g.add(cap);
  // Pistol in the right hand.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.45),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.4, 1.15, 0.25);
  g.add(gun);
  g.userData.legs = legs;
  g.userData.torso = torso;
  return g;
}

function randomRoadPoint(rng, roadLines) {
  const line = roadLines[rng.int(0, roadLines.length - 1)];
  const along = rng.range(-CITY.half, CITY.half);
  return { line, along };
}

// --- Spawning -------------------------------------------------------------
export function spawnTraffic(rng, roadLines, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng, roadLines);
    const vertical = rng.chance(0.5);
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = 2.4; // right-hand lane offset
    const car = {
      kind: 'traffic',
      x: vertical ? p.line + lane * dir : p.along,
      z: vertical ? p.along : 20 + p.line + lane * dir,
      angle: vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: rng.range(7, 12),
      cruise: rng.range(7, 12),
      vertical, dir,
      color: CAR_COLORS[i % CAR_COLORS.length],
      name: CAR_NAMES[i % CAR_NAMES.length],
      mesh: null,
      wheelSpin: 0,
      brake: false,
    };
    cars.push(car);
  }
  return cars;
}

export function spawnPeds(rng, roadLines, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng, roadLines);
    const vertical = rng.chance(0.5);
    const off = rng.range(6, 9) * (rng.chance(0.5) ? 1 : -1);
    peds.push({
      x: vertical ? p.line + off : p.along,
      z: vertical ? p.along : 20 + p.line + off,
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(1, 2.2),
      vertical,
      dir: rng.chance(0.5) ? 1 : -1,
      shirt: PED_SHIRTS[i % PED_SHIRTS.length],
      mesh: null,
      flee: 0,
      walkPhase: rng.range(0, 6),
    });
  }
  return peds;
}

// --- Traffic update: follow the road graph, brake for trouble -------------
export function updateTraffic(state, dt) {
  const { roadLines } = state.city;
  const player = state.player;
  const px = player.car ? player.car.x : player.x;
  const pz = player.car ? player.car.z : player.z;
  const playerSpeed = player.car ? Math.abs(player.car.speed) : 0;

  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    // Sense trouble ahead: another car, a crossing ped, or the player.
    let blocked = false;
    const ax = Math.sin(car.angle), az = Math.cos(car.angle);
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const ahead = dx * ax + dz * az;
      const side = Math.abs(dx * az - dz * ax);
      if (ahead > 0 && ahead < 9 && side < 2.6) { blocked = true; break; }
    }
    if (!blocked) {
      for (const ped of state.peds) {
        const dx = ped.x - car.x, dz = ped.z - car.z;
        const ahead = dx * ax + dz * az;
        const side = Math.abs(dx * az - dz * ax);
        if (ahead > 0 && ahead < 7 && side < 2.2) { blocked = true; break; }
      }
    }
    if (!blocked) {
      const dx = px - car.x, dz = pz - car.z;
      const ahead = dx * ax + dz * az;
      const side = Math.abs(dx * az - dz * ax);
      if (ahead > 0 && ahead < 8 && side < 2.4 && playerSpeed < 3) blocked = true;
    }
    car.brake = blocked;
    const target = blocked ? 0 : car.cruise;
    car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    // At an intersection, sometimes turn onto the crossing road.
    const nearLine = roadLines.find((l) => {
      const v = car.vertical ? car.z - 20 : car.x;
      return Math.abs(v - l) < 1.2;
    });
    if (nearLine !== undefined && state.rng.chance(0.004)) {
      car.vertical = !car.vertical;
      const turn = state.rng.chance(0.5) ? 1 : -1;
      car.dir = turn;
      car.angle = car.vertical
        ? (turn > 0 ? 0 : Math.PI)
        : (turn > 0 ? Math.PI / 2 : -Math.PI / 2);
      // Snap onto the new lane.
      if (car.vertical) car.x = nearLine + 2.4 * turn;
      else car.z = 20 + nearLine + 2.4 * turn;
    }
    // Wrap around the city edge.
    if (car.x < -CITY.half - 30) car.x = CITY.half + 30;
    if (car.x > CITY.half + 30) car.x = -CITY.half - 30;
    if (car.z < -CITY.half - 10) car.z = CITY.half + 50;
    if (car.z > CITY.half + 50) car.z = -CITY.half - 10;
    car.wheelSpin += car.speed * dt * 2;
  }
}

// --- Pedestrian update: stroll sidewalks, flee danger ---------------------
export function updatePeds(state, dt) {
  const player = state.player;
  const px = player.car ? player.car.x : player.x;
  const pz = player.car ? player.car.z : player.z;
  const danger = player.car ? Math.abs(player.car.speed) : 0;
  for (const ped of state.peds) {
    const d2p = dist2(ped.x, ped.z, px, pz);
    let fleeing = ped.flee > 0;
    if (d2p < 100 && (danger > 12 || state.shotsFired > 0)) {
      ped.flee = 2.5;
      fleeing = true;
    }
    if (state.shotsFired > 0 && d2p < 900) { ped.flee = 2.5; fleeing = true; }
    ped.flee = Math.max(0, ped.flee - dt);
    const speed = fleeing ? 5.2 : ped.speed;
    if (fleeing) {
      // Run directly away from the player.
      const dx = ped.x - px, dz = ped.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      ped.angle = angleLerp(ped.angle, Math.atan2(dx / d, dz / d), dt * 6);
    } else {
      // Stroll along the sidewalk; reverse at the city edge.
      const limit = CITY.half + 18;
      if (ped.vertical) {
        if (ped.z > limit || ped.z < -limit) ped.dir *= -1;
      } else if (ped.x > limit || ped.x < -limit) {
        ped.dir *= -1;
      }
      const target = ped.vertical ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      ped.angle = angleLerp(ped.angle, target, dt * 4);
    }
    ped.x += Math.sin(ped.angle) * speed * dt;
    ped.z += Math.cos(ped.angle) * speed * dt;
    ped.walkPhase += speed * dt * 4;
  }
}

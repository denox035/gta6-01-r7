// World state + simulation: player on foot and driving, arcade car physics,
// combat, wanted/police, pickups, sun coins, taxi and missions, day cycle.
import {
  CITY, PLAYER, CAR, COMBAT, WANTED, STEP, COIN_COUNT, COIN_VALUE, DAY_LENGTH,
} from './config.js';
import { clamp, dist2, angleLerp } from './random.js';
import { resolveCollisions, clampToCity } from './city.js';
import { spawnTraffic, spawnPeds, updateTraffic, updatePeds } from './entities.js';
import { startMission, updateMission, updateTaxi, MISSIONS, spawnGang } from './missions.js';
import { writeSave } from './save.js';

const HOSPITAL = { x: 10, z: 30 };
const POLICE_STATION = { x: 60, z: 120 };

const COIN_SPOTS = [
  [0, 20], [-120, 20], [120, 20], [0, -120], [0, 140], [-60, -160], [60, -160],
  [-120, -110], [120, 140], [-120, 140], [60, 60], [-60, 60], [120, -80],
  [-120, -40], [30, -60], [-30, 90], [90, -120], [-90, 120], [150, 0], [-150, 0],
];

export function createWorld(rng, roadLines, colliders) {
  const state = {
    rng,
    seed: 1,
    city: { roadLines, colliders },
    screen: 'title',
    time: 0,
    clock: 17.5, // golden hour
    cash: 250,
    health: PLAYER.health,
    ammo: COMBAT.pistolAmmoStart,
    wanted: 0,
    wantedTimer: 0,
    unseenTimer: 0,
    player: {
      x: 0, z: 40, angle: 0, speed: 0,
      car: null, stolen: false,
      punchCd: 0, shootCd: 0, moving: false,
    },
    cars: spawnTraffic(rng, roadLines, 26),
    peds: spawnPeds(rng, roadLines, 52),
    police: [],
    cops: [],
    gang: [],
    coins: COIN_SPOTS.slice(0, COIN_COUNT).map(([x, z], i) => ({ x, z, taken: false, mesh: null, id: i })),
    pickups: [
      { kind: 'health', x: 8, z: 12, taken: false, respawn: 0, mesh: null },
      { kind: 'health', x: -118, z: -108, taken: false, respawn: 0, mesh: null },
      { kind: 'ammo', x: 118, z: 148, taken: false, respawn: 0, mesh: null },
      { kind: 'ammo', x: -58, z: -158, taken: false, respawn: 0, mesh: null },
      { kind: 'health', x: 118, z: -78, taken: false, respawn: 0, mesh: null },
    ],
    missionIndex: 0,
    missionsDone: [false, false, false, false, false, false],
    mission: null,
    taxi: { active: false, stage: 0, pickup: null, dest: null, timer: 0, offerTimer: 8 },
    stats: { kills: 0, carsStolen: 0, fares: 0, coins: 0, missions: 0, shots: 0 },
    banner: null,
    dialogue: null,
    toast: null,
    toastT: 0,
    damageFlash: 0,
    crashShake: 0,
    muzzle: 0,
    tracers: [],
    camYaw: Math.PI,
    camPitch: 0.32,
    camDist: 9,
    shotsFired: 0,
    shotDecay: 0,
    saveDirty: false,
    endReason: '',
  };
  return state;
}

export function startNewGame(state) {
  state.cash = 250;
  state.health = PLAYER.health;
  state.ammo = COMBAT.pistolAmmoStart;
  state.wanted = 0;
  state.missionIndex = 0;
  state.missionsDone = [false, false, false, false, false, false];
  state.mission = null;
  state.stats = { kills: 0, carsStolen: 0, fares: 0, coins: 0, missions: 0, shots: 0 };
  for (const c of state.coins) c.taken = false;
  state.player.x = 0; state.player.z = 40; state.player.angle = 0;
  state.player.car = null; state.player.stolen = false;
  state.clock = 17.5;
  state.screen = 'play';
  startMission(state, 0);
}

export function addWanted(state, n) {
  state.wanted = clamp(state.wanted + n, 0, WANTED.maxStars);
  state.unseenTimer = 0;
}

function nearestCar(state, x, z, maxD) {
  let best = null, bestD = maxD * maxD;
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    const d = dist2(x, z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(state, audio) {
  const p = state.player;
  const car = nearestCar(state, p.x, p.z, 3.5);
  if (!car) return false;
  car.kind = 'player';
  car.speed = 0;
  p.car = car;
  p.stolen = true;
  state.stats.carsStolen += 1;
  addWanted(state, 1);
  state.toast = 'Stole a ' + car.name + ' — the law noticed (+1 star)';
  if (audio) audio.sirenBlip();
  return true;
}

function exitCar(state) {
  const p = state.player;
  if (!p.car) return;
  const car = p.car;
  car.kind = 'parked';
  car.speed = 0;
  p.x = car.x + Math.sin(car.angle + Math.PI / 2) * 2.2;
  p.z = car.z + Math.cos(car.angle + Math.PI / 2) * 2.2;
  p.angle = car.angle;
  p.car = null;
  p.stolen = false;
}

function aimDir(state) {
  return { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
}

function shoot(state, audio) {
  const p = state.player;
  if (p.shootCd > 0 || state.ammo <= 0 || p.car) return;
  p.shootCd = COMBAT.pistolCooldown;
  state.ammo -= 1;
  state.stats.shots += 1;
  state.shotsFired = 1;
  state.shotDecay = 1.2;
  state.muzzle = 0.07;
  if (audio) audio.shot();
  const dir = aimDir(state);
  const ox = p.x, oz = p.z;
  // Targets: gang, cops on foot, pedestrians.
  const targets = [];
  for (const g of state.gang) if (g.alive) targets.push({ x: g.x, z: g.z, ref: g, kind: 'gang' });
  for (const c of state.cops) targets.push({ x: c.x, z: c.z, ref: c, kind: 'cop' });
  for (const ped of state.peds) targets.push({ x: ped.x, z: ped.z, ref: ped, kind: 'ped' });
  let best = null, bestAlong = COMBAT.pistolRange;
  for (const t of targets) {
    const dx = t.x - ox, dz = t.z - oz;
    const along = dx * dir.x + dz * dir.z;
    if (along <= 0 || along > COMBAT.pistolRange) continue;
    const side = Math.abs(dx * dir.z - dz * dir.x);
    if (side > 1.6 + along * 0.02) continue;
    if (along < bestAlong) { bestAlong = along; best = t; }
  }
  const endX = ox + dir.x * bestAlong;
  const endZ = oz + dir.z * bestAlong;
  state.tracers.push({ x1: ox, z1: oz, x2: endX, z2: endZ, t: 0.12 });
  if (best) {
    if (best.kind === 'gang') {
      best.ref.health -= COMBAT.pistolDamage;
      if (best.ref.health <= 0) {
        best.ref.alive = false;
        state.stats.kills += 1;
        state.toast = 'Viper down — ' + state.gang.filter((g) => g.alive).length + ' left';
      }
    } else if (best.kind === 'cop') {
      best.ref.health -= COMBAT.pistolDamage;
      if (best.ref.health <= 0) {
        best.ref.dead = true;
        state.stats.kills += 1;
        addWanted(state, 1);
      }
    } else {
      best.ref.flee = 4;
      addWanted(state, 1);
      state.toast = 'You shot a bystander — the cops are coming';
    }
  }
}

function punch(state, audio) {
  const p = state.player;
  if (p.punchCd > 0 || p.car) return;
  p.punchCd = PLAYER.punchCooldown;
  if (audio) audio.punch();
  const fx = Math.sin(p.angle), fz = Math.cos(p.angle);
  const hit = (x, z) => {
    const dx = x - p.x, dz = z - p.z;
    return dx * fx + dz * fz > 0 && dist2(x, z, p.x, p.z) < PLAYER.punchRange * PLAYER.punchRange;
  };
  for (const g of state.gang) {
    if (g.alive && hit(g.x, g.z)) {
      g.health -= PLAYER.punchDamage;
      if (g.health <= 0) { g.alive = false; state.stats.kills += 1; }
    }
  }
  for (const ped of state.peds) {
    if (hit(ped.x, ped.z)) {
      ped.flee = 4;
      addWanted(state, 1);
      state.toast = 'You punched a bystander — wanted level up';
      break;
    }
  }
}

function damagePlayer(state, amount, audio) {
  state.health -= amount;
  state.damageFlash = 1;
  if (state.health <= 0) {
    state.health = 0;
    wasted(state, audio);
  }
}

function wasted(state, audio) {
  const fine = WANTED.hospitalFee + state.wanted * 100;
  state.cash = Math.max(0, state.cash - fine);
  state.wanted = 0;
  state.police = [];
  state.cops = [];
  if (state.player.car) { state.player.car.kind = 'parked'; state.player.car = null; }
  state.player.x = HOSPITAL.x; state.player.z = HOSPITAL.z;
  state.health = PLAYER.health;
  state.screen = 'wasted';
  state.endReason = 'WASTED — hospital bill $' + fine;
  state.saveDirty = true;
  if (audio) audio.fail();
}

function busted(state, audio) {
  const fine = state.wanted * WANTED.finePerStar;
  state.cash = Math.max(0, state.cash - fine);
  state.wanted = 0;
  state.police = [];
  state.cops = [];
  if (state.player.car) { state.player.car.kind = 'parked'; state.player.car = null; }
  state.player.x = POLICE_STATION.x; state.player.z = POLICE_STATION.z;
  state.health = PLAYER.health;
  state.screen = 'busted';
  state.endReason = 'BUSTED — fine $' + fine;
  state.saveDirty = true;
  if (audio) audio.fail();
}

// --- Police ----------------------------------------------------------------
function updatePolice(state, dt, audio) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  // Spawn police cars up to the wanted level (max 3).
  const wantCars = Math.min(state.wanted, 3);
  while (state.police.length < wantCars) {
    const a = state.rng.range(0, Math.PI * 2);
    const car = {
      kind: 'police', x: px + Math.sin(a) * 45, z: pz + Math.cos(a) * 45,
      angle: a, speed: 0, cruise: 30, vertical: false, dir: 1,
      color: 0x1a1a2e, name: 'Interceptor', mesh: null, wheelSpin: 0, brake: false,
    };
    state.police.push(car);
    state.cars.push(car);
  }
  while (state.police.length > wantCars) {
    const car = state.police.pop();
    const i = state.cars.indexOf(car);
    if (i >= 0) state.cars.splice(i, 1);
  }
  // Chase: steer toward the player, ram at close range.
  for (const car of state.police) {
    const dx = px - car.x, dz = pz - car.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    const targetAngle = Math.atan2(dx / d, dz / d);
    car.angle = angleLerp(car.angle, targetAngle, dt * 2.2);
    const targetSpeed = d > 6 ? 30 : 12;
    car.speed += clamp(targetSpeed - car.speed, -20 * dt, 14 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    car.wheelSpin += car.speed * dt * 2;
    if (d < 3.2) {
      if (p.car) {
        p.car.speed *= 0.86;
        state.crashShake = Math.max(state.crashShake, 0.5);
        if (audio) audio.crash();
      } else {
        damagePlayer(state, 8 * dt * 10, audio);
      }
    }
  }
  // Foot officers at 2+ stars.
  if (state.wanted >= 2) {
    while (state.cops.length < state.wanted - 1) {
      const a = state.rng.range(0, Math.PI * 2);
      state.cops.push({
        x: px + Math.sin(a) * 25, z: pz + Math.cos(a) * 25,
        angle: a, speed: 5, health: COMBAT.policeHealth, mesh: null,
        walkPhase: 0, dead: false, isCop: true,
      });
    }
  } else {
    state.cops = [];
  }
  for (const cop of state.cops) {
    if (cop.dead) continue;
    const dx = px - cop.x, dz = pz - cop.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    cop.angle = angleLerp(cop.angle, Math.atan2(dx / d, dz / d), dt * 5);
    cop.x += Math.sin(cop.angle) * cop.speed * dt;
    cop.z += Math.cos(cop.angle) * cop.speed * dt;
    cop.walkPhase += dt * 8;
    if (d < 1.6 && !p.car && Math.abs(p.speed || 0) < 3) {
      busted(state, audio);
      return;
    }
  }
  state.cops = state.cops.filter((c) => !c.dead);
  // Wanted decay when no police can see the player.
  let nearest = Infinity;
  for (const car of state.police) nearest = Math.min(nearest, dist2(px, pz, car.x, car.z));
  for (const cop of state.cops) nearest = Math.min(nearest, dist2(px, pz, cop.x, cop.z));
  if (state.wanted > 0 && nearest > 55 * 55) {
    state.unseenTimer += dt;
    if (state.unseenTimer > WANTED.decayDelay) {
      state.wanted -= 1;
      state.unseenTimer = 0;
      state.toast = 'Heat cooling off — ' + state.wanted + ' star' + (state.wanted === 1 ? '' : 's') + ' left';
    }
  } else {
    state.unseenTimer = 0;
  }
}

// --- Gang AI ---------------------------------------------------------------
function updateGang(state, dt, audio) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  for (const g of state.gang) {
    if (!g.alive) continue;
    const dx = px - g.x, dz = pz - g.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    if (d < 55) {
      g.angle = Math.atan2(dx / d, dz / d);
      g.shootCd -= dt;
      if (g.shootCd <= 0 && d > 3) {
        g.shootCd = 1.1 + state.rng.range(0, 0.8);
        // Gang shots mostly miss at range; some hit.
        if (state.rng.chance(clamp(0.55 - d * 0.006, 0.08, 0.5))) {
          damagePlayer(state, 7, audio);
        }
        state.tracers.push({ x1: g.x, z1: g.z, x2: px, z2: pz, t: 0.1, enemy: true });
        if (audio) audio.shot();
      }
      // Strafe slowly to keep distance.
      if (d < 10) {
        g.x -= Math.sin(g.angle) * 2 * dt;
        g.z -= Math.cos(g.angle) * 2 * dt;
      }
    }
  }
}

// --- Main update -----------------------------------------------------------
export function updateWorld(state, input, audio, dt) {
  state.time += dt;
  state.clock = (state.clock + (dt * 24) / DAY_LENGTH) % 24;
  state.shotDecay -= dt;
  if (state.shotDecay <= 0) state.shotsFired = 0;
  state.damageFlash = Math.max(0, state.damageFlash - dt * 1.6);
  state.crashShake = Math.max(0, state.crashShake - dt * 2.2);
  state.muzzle = Math.max(0, state.muzzle - dt);
  for (const t of state.tracers) t.t -= dt;
  state.tracers = state.tracers.filter((t) => t.t > 0);
  if (state.toastT > 0) state.toastT -= dt;
  else state.toast = null;
  if (state.banner) {
    state.banner.t -= dt;
    if (state.banner.t <= 0) state.banner = null;
  }
  if (state.dialogue) {
    state.dialogue.t -= dt;
    if (state.dialogue.t <= 0) state.dialogue = null;
  }

  const p = state.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);

  // Camera orbit from the mouse.
  const mouse = input.consumeMouse();
  state.camYaw -= mouse.dx * 0.0035;
  state.camPitch = clamp(state.camPitch + mouse.dy * 0.002, 0.08, 1.1);
  state.camDist = clamp(state.camDist + mouse.wheel * 0.01, 5, 16);

  if (input.pressed('mute') && audio) audio.setMuted(!audio.isMuted());
  if (input.pressed('horn') && p.car && audio) audio.horn();

  // --- Driving ------------------------------------------------------------
  if (p.car) {
    const car = p.car;
    const fwd = input.is('up') ? 1 : input.is('down') ? -0.6 : 0;
    const steerIn = (input.is('left') ? 1 : 0) - (input.is('right') ? 1 : 0);
    const handbrake = input.is('handbrake');
    if (fwd > 0) car.speed += CAR.accel * dt;
    else if (fwd < 0) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverse * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 6 * dt;
      if (Math.abs(car.speed) < 0.3) car.speed = 0;
    }
    if (handbrake) car.speed *= Math.max(0, 1 - 3 * dt);
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const steerAmt = steerIn * CAR.steer * dt * (car.speed >= 0 ? 1 : -1) * clamp(Math.abs(car.speed) / 8, 0.25, 1);
    car.angle += steerAmt * (handbrake ? 1.6 : 1);
    const nx = car.x + Math.sin(car.angle) * car.speed * dt;
    const nz = car.z + Math.cos(car.angle) * car.speed * dt;
    const res = resolveCollisions(nx, nz, 1.7, state.city.colliders);
    if (res.x !== nx || res.z !== nz) {
      if (Math.abs(car.speed) > 10) {
        state.crashShake = 1;
        if (audio) audio.crash();
      }
      car.speed *= 0.45;
    }
    const clamped = clampToCity(res.x, res.z);
    car.x = clamped.x; car.z = clamped.z;
    car.wheelSpin += car.speed * dt * 2;
    p.x = car.x; p.z = car.z; p.angle = car.angle;
    // Hit-and-run: ploughing through a ped at speed.
    for (const ped of state.peds) {
      if (dist2(car.x, car.z, ped.x, ped.z) < 3.2 && Math.abs(car.speed) > 8) {
        ped.flee = 5;
        ped.x += Math.sin(car.angle) * 6;
        ped.z += Math.cos(car.angle) * 6;
        addWanted(state, 1);
        state.toast = 'Hit and run — wanted level up';
        car.speed *= 0.7;
        if (audio) audio.crash();
      }
    }
    if (input.pressed('enterCar')) exitCar(state);
    if (audio) audio.setEngine(Math.abs(car.speed) / CAR.maxSpeed, true);
  } else {
    // --- On foot ----------------------------------------------------------
    const fwdIn = (input.is('up') ? 1 : 0) - (input.is('down') ? 1 : 0);
    const strafeIn = (input.is('right') ? 1 : 0) - (input.is('left') ? 1 : 0);
    const running = input.is('run');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Movement is relative to the camera yaw.
    const mx = Math.sin(state.camYaw) * fwdIn + Math.cos(state.camYaw) * strafeIn;
    const mz = Math.cos(state.camYaw) * fwdIn - Math.sin(state.camYaw) * strafeIn;
    const len = Math.sqrt(mx * mx + mz * mz) || 1;
    p.moving = fwdIn !== 0 || strafeIn !== 0;
    if (p.moving) {
      const targetAngle = Math.atan2(mx / len, mz / len);
      p.angle = angleLerp(p.angle, targetAngle, dt * 10);
      const nx = p.x + (mx / len) * speed * dt;
      const nz = p.z + (mz / len) * speed * dt;
      const res = resolveCollisions(nx, nz, PLAYER.radius, state.city.colliders);
      const clamped = clampToCity(res.x, res.z);
      p.x = clamped.x; p.z = clamped.z;
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    if (input.pressed('enterCar')) enterCar(state, audio);
    if (input.pressed('punch')) punch(state, audio);
    if (input.mouseDown() || input.pressed('shoot')) shoot(state, audio);
    if (audio) audio.setEngine(0, false);
  }

  updateTraffic(state, dt);
  updatePeds(state, dt);
  updatePolice(state, dt, audio);
  updateGang(state, dt, audio);
  updateMission(state, dt);
  updateTaxi(state, dt);

  // Coins.
  for (const coin of state.coins) {
    if (!coin.taken && dist2(p.x, p.z, coin.x, coin.z) < 4) {
      coin.taken = true;
      state.cash += COIN_VALUE;
      state.stats.coins += 1;
      state.toast = 'Sun coin +$' + COIN_VALUE + ' (' + state.stats.coins + '/' + COIN_COUNT + ')';
      state.toastT = 3;
      if (audio) audio.coin();
    }
  }
  // Pickups.
  for (const pk of state.pickups) {
    if (pk.taken) {
      pk.respawn -= dt;
      if (pk.respawn <= 0) pk.taken = false;
      continue;
    }
    if (dist2(p.x, p.z, pk.x, pk.z) < 4) {
      pk.taken = true;
      pk.respawn = 45;
      if (pk.kind === 'health') {
        state.health = Math.min(PLAYER.health, state.health + 50);
        state.toast = 'Health kit +50';
      } else {
        state.ammo = Math.min(COMBAT.pistolAmmoMax, state.ammo + 24);
        state.toast = 'Ammo +24';
      }
      state.toastT = 3;
      if (audio) audio.pickup();
    }
  }

  // Auto-save when dirty.
  if (state.saveDirty) {
    state.saveDirty = false;
    writeSave(state);
  }
  if (audio) audio.setSiren(state.wanted > 0, state.wanted);
}

export { MISSIONS, startMission, STEP };

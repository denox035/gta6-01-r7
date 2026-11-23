// Missions & story: six jobs for Marco Reyes and fixer Nadia Sol, plus the
// taxi side job. Each mission has dialogue, a beacon target, a reward and an
// auto-save on completion. Progression checks live in updateMission().
import { MISSION_REWARDS, TAXI_FARE } from './config.js';
import { dist2 } from './random.js';

export const MISSIONS = [
  {
    title: 'First Fare',
    subtitle: 'Marco needs a driver who shows up',
    giver: 'Marco Reyes',
    intro: 'Marco: "Solmar runs on wheels, kid. Take my cab, pick up the fare at the plaza, drop them at the beach. Easy money."',
    outro: 'Marco: "Not bad. The city noticed you. Come back when you want real work."',
    target: { x: 0, z: 20, label: 'Plaza pickup' },
    target2: { x: -60, z: -160, label: 'Beach drop-off' },
    reward: MISSION_REWARDS[0],
  },
  {
    title: 'Borrowed Wheels',
    subtitle: 'Nadia wants a car nobody will miss',
    giver: 'Nadia Sol',
    intro: 'Nadia: "A client needs a Cometa, no questions. Walk up to any parked car on the street, take it, and bring it to the docks. Quietly."',
    outro: 'Nadia: "Clean. The client pays clean. You are on my list now."',
    target: { x: 120, z: 140, label: 'Deliver to the docks' },
    reward: MISSION_REWARDS[1],
  },
  {
    title: 'Package Run',
    subtitle: 'One box, no peeking, no cops',
    giver: 'Nadia Sol',
    intro: 'Nadia: "A package is waiting at the container docks. Grab it, then run it to the park before the sun drops. Do not open it."',
    outro: 'Nadia: "Delivered. Whoever that box was for, they are happy. So am I."',
    target: { x: 120, z: 150, label: 'Pick up the package' },
    target2: { x: -120, z: -110, label: 'Deliver to the park' },
    reward: MISSION_REWARDS[2],
  },
  {
    title: 'Lose the Heat',
    subtitle: 'The whole precinct is looking for you',
    giver: 'Marco Reyes',
    intro: 'Marco: "You stirred the nest, kid. Get the cops off your tail and stay out of sight until the heat dies. Do not get busted."',
    outro: 'Marco: "Ghost. That is how you survive in Solmar."',
    reward: MISSION_REWARDS[3],
  },
  {
    title: 'Getaway Driver',
    subtitle: 'Three checkpoints, one very fast car',
    giver: 'Nadia Sol',
    intro: 'Nadia: "My crew hits the marina vault at dusk. You drive. Three checkpoints across the city, then vanish. Fast is not fast enough — be faster."',
    outro: 'Nadia: "The crew is out and the vault is empty. You drive like the city owes you money."',
    checkpoints: [
      { x: -120, z: 20, label: 'Checkpoint 1 — West End' },
      { x: 0, z: 150, label: 'Checkpoint 2 — South Gate' },
      { x: 120, z: -80, label: 'Checkpoint 3 — Marina' },
    ],
    reward: MISSION_REWARDS[4],
  },
  {
    title: 'Night Shootout',
    subtitle: 'The Vipers took the docks. Take them back.',
    giver: 'Marco Reyes',
    intro: 'Marco: "The Vipers moved on our docks at nightfall. Four of them, armed. End it, and Solmar is ours again."',
    outro: 'Marco: "The docks are ours. Solmar is ours. You did that, kid."',
    target: { x: 120, z: 150, label: 'Clear the docks' },
    reward: MISSION_REWARDS[5],
  },
];

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return;
  state.mission = {
    index,
    def,
    stage: 0,
    timer: 0,
    started: true,
  };
  state.dialogue = { name: def.giver, text: def.intro, t: 6 };
  state.banner = { title: def.title, subtitle: def.subtitle, t: 4 };
  if (index === 3) {
    // Mission 4: the heat starts now.
    state.wanted = Math.max(state.wanted, 2);
    state.wantedTimer = 0;
  }
  if (index === 5) {
    state.clock = 21.5; // night shootout, after dark
    spawnGang(state);
  }
}

export function spawnGang(state) {
  const spots = [[112, 142], [128, 158], [108, 160], [132, 140]];
  state.gang = spots.map(([x, z], i) => ({
    x, z, angle: 0, health: 60, alive: true, shootCd: 1 + i * 0.4, mesh: null, id: i,
  }));
}

function playerPos(state) {
  return state.player.car
    ? { x: state.player.car.x, z: state.player.car.z }
    : { x: state.player.x, z: state.player.z };
}

function near(state, target, r = 7) {
  const p = playerPos(state);
  return dist2(p.x, p.z, target.x, target.z) < r * r;
}

export function updateMission(state, dt) {
  const m = state.mission;
  if (!m || !m.started) return;
  m.timer += dt;
  const complete = () => {
    state.cash += m.def.reward;
    state.missionsDone[m.index] = true;
    state.missionIndex = Math.min(m.index + 1, MISSIONS.length);
    state.dialogue = { name: m.def.giver, text: m.def.outro, t: 6 };
    state.banner = { title: 'Mission Complete', subtitle: m.def.title + '  •  +$' + m.def.reward, t: 4 };
    state.toast = 'Saved — mission ' + (m.index + 1) + ' of 6 complete';
    state.mission = null;
    state.saveDirty = true;
    state.stats.missions = (state.stats.missions || 0) + 1;
  };

  if (m.index === 0) {
    // Stage 0: reach the plaza pickup (on foot or in a car). Stage 1: beach.
    if (m.stage === 0 && near(state, m.def.target, 8)) {
      m.stage = 1;
      state.toast = 'Fare picked up — drive to the beach';
      state.banner = { title: 'First Fare', subtitle: 'Drop the fare at the beach', t: 3 };
    } else if (m.stage === 1 && near(state, m.def.target2, 8)) {
      complete();
    }
  } else if (m.index === 1) {
    if (state.player.car && state.player.stolen) {
      if (near(state, m.def.target, 10)) complete();
      else if (m.stage === 0) {
        m.stage = 1;
        state.toast = 'Car stolen — deliver it to the docks';
      }
    }
  } else if (m.index === 2) {
    if (m.stage === 0 && near(state, m.def.target, 7)) {
      m.stage = 1;
      state.toast = 'Package collected — deliver to the park';
      state.banner = { title: 'Package Run', subtitle: 'Deliver the package to the park', t: 3 };
    } else if (m.stage === 1 && near(state, m.def.target2, 7)) {
      complete();
    }
  } else if (m.index === 3) {
    if (state.wanted === 0) complete();
  } else if (m.index === 4) {
    const cp = m.def.checkpoints[m.stage];
    if (cp && near(state, cp, 8)) {
      m.stage += 1;
      if (m.stage >= m.def.checkpoints.length) complete();
      else state.toast = 'Checkpoint ' + m.stage + ' of 3 — next: ' + m.def.checkpoints[m.stage].label;
    }
  } else if (m.index === 5) {
    const alive = state.gang.filter((g) => g.alive).length;
    if (alive === 0) complete();
  }
}

// Current beacon target for the HUD minimap + world marker.
export function missionTarget(state) {
  const m = state.mission;
  if (!m) return null;
  if (m.index === 0) return m.stage === 0 ? m.def.target : m.def.target2;
  if (m.index === 1) return m.def.target;
  if (m.index === 2) return m.stage === 0 ? m.def.target : m.def.target2;
  if (m.index === 4) return m.def.checkpoints[m.stage] || null;
  if (m.index === 5) return m.def.target;
  return null;
}

// --- Taxi side job ---------------------------------------------------------
// When the player drives, a fare offer appears; drive to the waiting
// passenger, then to their destination. Fast delivery earns a speed tip.
export function updateTaxi(state, dt) {
  const t = state.taxi;
  const p = playerPos(state);
  if (!t.active) {
    if (state.player.car) {
      t.offerTimer -= dt;
      if (t.offerTimer <= 0) {
        t.active = true;
        t.stage = 0;
        const spots = [
          { x: -60, z: 20, dx: 60, dz: 140 },
          { x: 60, z: -40, dx: -90, dz: 90 },
          { x: 0, z: 120, dx: -120, dz: -120 },
          { x: 90, z: 60, dx: -60, dz: -160 },
        ];
        const s = spots[state.rng.int(0, spots.length - 1)];
        t.pickup = { x: s.x, z: s.z };
        t.dest = { x: s.dx, z: s.dz };
        t.timer = 90;
        state.toast = 'Taxi fare: passenger waiting — drive to the marker';
      }
    }
    return;
  }
  t.timer -= dt;
  if (t.timer <= 0) {
    t.active = false;
    t.offerTimer = 12;
    state.toast = 'Fare cancelled — too slow';
    return;
  }
  if (t.stage === 0) {
    if (dist2(p.x, p.z, t.pickup.x, t.pickup.z) < 64) {
      t.stage = 1;
      t.timer = 90;
      state.toast = 'Passenger aboard — drive to the destination';
    }
  } else if (dist2(p.x, p.z, t.dest.x, t.dest.z) < 64) {
    const tip = t.timer > 45 ? 60 : 0;
    const fare = TAXI_FARE + tip;
    state.cash += fare;
    state.stats.fares = (state.stats.fares || 0) + 1;
    state.toast = 'Fare paid ' + '$' + fare + (tip ? ' (includes $60 speed tip)' : '');
    t.active = false;
    t.offerTimer = 15;
  }
}

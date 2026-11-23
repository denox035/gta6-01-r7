// Screenshot scenes behind ?shot=name&seed=N. Each stages a real game state
// (a live world, stepped forward with a scripted driver) and paints it twice,
// then sets window.__shotReady for the screenshot driver.
import { startMission, spawnGang } from './missions.js';
import { updateWorld, addWanted } from './world.js';

function fakeInput(drive) {
  const held = new Set(drive ? ['up'] : []);
  return {
    is: (a) => held.has(a),
    pressed: () => false,
    mouseDown: () => false,
    consumeMouse: () => ({ dx: 0, dy: 0, wheel: 0 }),
    endFrame: () => {},
  };
}

function stepWorld(state, audio, seconds, drive) {
  const input = fakeInput(drive);
  const steps = Math.floor(seconds * 60);
  for (let i = 0; i < steps; i += 1) updateWorld(state, input, audio, 1 / 60);
}

export function stageShot(name, state, audio) {
  const p = state.player;
  if (name === 'street') {
    // On foot in the city at golden hour, traffic and peds moving.
    state.screen = 'play';
    state.clock = 17.5;
    p.x = -20; p.z = 60; p.angle = 0.4;
    state.camYaw = Math.PI * 0.95;
    state.camPitch = 0.22; // low angle so the skyline shows
    state.camDist = 10;
    stepWorld(state, audio, 6, false);
    return;
  }
  if (name === 'chase') {
    // Wanted 3 stars, driving fast down a main road with police on the tail.
    state.screen = 'play';
    state.clock = 17.0; // golden hour, so the chase reads clearly
    const car = state.cars[0];
    car.kind = 'player';
    p.car = car;
    p.stolen = true;
    car.x = -17; car.z = -60; car.angle = 0; car.speed = 24; // on the -17 road, heading +Z
    p.x = car.x; p.z = car.z; p.angle = car.angle;
    addWanted(state, 3);
    state.camYaw = 0; // camera behind the car, looking down the road
    state.camPitch = 0.3;
    state.camDist = 12;
    stepWorld(state, audio, 3, true);
    return;
  }
  if (name === 'mission') {
    // Night shootout at the docks: gang members, tracers, beacon, HUD.
    state.screen = 'play';
    state.clock = 21.5;
    state.missionIndex = 5;
    spawnGang(state);
    startMission(state, 5);
    p.x = 100; p.z = 130; p.angle = 0.8;
    state.camYaw = Math.PI * 0.85;
    state.camPitch = 0.3;
    state.camDist = 11;
    state.ammo = 48;
    stepWorld(state, audio, 4, false);
    return;
  }
  // Default: 'start' — title scene, plaza and fountain at golden hour.
  state.screen = 'title';
  state.clock = 17.5;
  p.x = 6; p.z = 34; p.angle = Math.PI;
  state.camYaw = Math.PI;
  state.camPitch = 0.18; // low angle: skyline over the plaza
  state.camDist = 12;
  stepWorld(state, audio, 5, false);
  // Show the real title screen over the staged city, as the player sees it.
  const titleEl = document.getElementById('screen-title');
  if (titleEl) titleEl.style.display = 'flex';
}

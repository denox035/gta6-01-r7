// SOLMAR — Streets of Gold: shared constants for the whole game.
// A sun-soaked coastal city, 9x9 blocks, built fresh for the gta6-01 bounty.
export const CITY = {
  blocks: 9,          // blocks per side
  blockSize: 34,      // metres per block incl. road
  roadWidth: 10,
  half: 153,          // half-extent of the drivable city (9*34/2)
  seaZ: -190,         // beach / sea edge on the -Z side
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 11,
  radius: 0.55,
  health: 100,
  punchDamage: 12,
  punchRange: 2.1,
  punchCooldown: 0.45,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverse: 12,
  maxSpeed: 38,
  maxReverse: 12,
  steer: 1.9,
  grip: 6.5,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 70,
  pistolCooldown: 0.28,
  pistolAmmoStart: 24,
  pistolAmmoMax: 120,
  gangHealth: 60,
  policeHealth: 50,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 6,      // seconds unseen before a star decays
  finePerStar: 150,
  hospitalFee: 200,
};

export const MISSION_REWARDS = [400, 650, 800, 900, 1200, 2000];
export const TAXI_FARE = 120;
export const COIN_VALUE = 50;
export const COIN_COUNT = 20;

export const DAY_LENGTH = 480; // seconds per full in-game day
export const STEP = 1 / 60;

export const SAVE_KEY = 'solmar-save-v1';
export const BEST_KEY = 'solmar-best-v1';

export const PALETTE = {
  skyDay: 0x87bfe8,
  skyDusk: 0xff9a5c,
  skyNight: 0x0b1026,
  sun: 0xffe9b0,
  road: 0x2e3138,
  sidewalk: 0x9aa0a3,
  sand: 0xe8d29a,
  sea: 0x1e7fa8,
  grass: 0x4f9e4d,
  plaza: 0xcbb28a,
};

export const CAR_COLORS = [
  0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22,
  0xecf0f1, 0x1a1a1a, 0x7f8c8d, 0x16a085, 0xd35400, 0x2c3e50,
];

export const CAR_NAMES = [
  'Cometa', 'Vuelo GT', 'Brisa', 'Toro', 'Marlin', 'Solstice',
  'Cascabel', 'Puma S', 'Ola', 'Faro', 'Duna', 'Coral',
];

export const PED_SHIRTS = [
  0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0xecf0f1, 0xfd79a8, 0x00cec9,
];

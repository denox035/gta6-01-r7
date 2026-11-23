// SOLMAR — configuration, tuning numbers, palette and names. Everything here is original:
// a fictional sun-soaked coastal city, its own people, cars and story.
var S = null; // the live game state, created by main.js

var CFG = {
  // City geometry (1 unit = 1 metre). A 9x9 grid of blocks split by roads.
  PITCH: 74,          // distance between neighbouring road centrelines
  ROAD_W: 14,         // road width
  BLOCK: 60,          // block width
  ROADS: 10,          // roads per axis (centrelines from -333 to +333)
  HALF: 340,          // city half-extent; the beach runs south of it
  BEACH_Z: 340,       // where the sand starts
  SEA_Z: 430,         // where the water starts
  WORLD_R: 520,       // soft boundary for the player

  STEP: 1 / 60,       // fixed simulation step
  DAY_LENGTH: 480,    // seconds of real play per in-game day
  START_HOUR: 16.5,   // golden-hour start: long sun, warm light

  // On-foot movement
  WALK_SPEED: 6,
  RUN_SPEED: 10.5,
  PLAYER_RADIUS: 0.55,

  // Driving (arcade, metres / seconds)
  CAR_ACCEL: 15,
  CAR_BRAKE: 26,
  CAR_REVERSE: 13,
  CAR_MAX: 38,
  CAR_SPORT_MAX: 47,
  CAR_DRAG: 0.55,     // per-second speed loss factor
  CAR_STEER: 0.62,    // radians of heading change per second at full lock, scaled by speed
  CAR_RADIUS: 1.5,

  // Population
  TRAFFIC_CARS: 26,
  PEDS: 52,
  MAX_POLICE: 6,

  // Combat
  PISTOL_DAMAGE: 34,
  PISTOL_RANGE: 55,
  PUNCH_DAMAGE: 25,
  PUNCH_RANGE: 2.2,
  ENEMY_HEALTH: 100,
  PLAYER_MAX_HEALTH: 100,
  AMMO_START: 36,

  // Wanted
  WANTED_MAX: 5,
  WANTED_DECAY_SECONDS: 9, // quiet seconds per star lost

  // Economy
  COIN_VALUE: 25,
  COINS_TOTAL: 20,
  TAXI_FARE_MIN: 40,
  TAXI_FARE_MAX: 90,

  SAVE_KEY: 'solmar.save.v1',
};

// The city, its districts and its people. All names are invented for this game.
var NAMES = {
  CITY: 'Solmar',
  GAME_TITLE: 'SOLMAR',
  GAME_SUBTITLE: 'Streets of Gold — an open-world crime story',
  HERO: 'Marco Reyes',
  FIXER: 'Nadia Sol',
  CREW: 'the Harbor Crew',
  DISTRICTS: ['Old Harbor', 'Palm Row', 'Civic Center', 'The Docks', 'Sunset Strip', 'Marina Bay'],
  CAR_MODELS: ['Comet', 'Stallion', 'Prowler', 'Dune Buggy', 'Civic', 'Vulture', 'Sunbeam', 'Rhino'],
  MISSION_NAMES: [
    'First Fare',
    'Hot Wheels',
    'Package Run',
    'Heat',
    'The Getaway',
    'Solmar Nights',
  ],
};

var PALETTE = {
  skyDay: 0x87bfe8,
  skyDusk: 0xff9e5e,
  skyNight: 0x0b1026,
  sunDay: 0xfff2d8,
  sunDusk: 0xffb36b,
  fogDay: 0xa8c8e0,
  ground: 0x9aa08a,
  sidewalk: 0xb8b0a0,
  road: 0x3a3d44,
  sand: 0xe8d29a,
  sea: 0x2e7fa8,
  buildingGlass: 0x8fb8cc,
};

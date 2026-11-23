// A small seeded random number generator (mulberry32): the same seed gives the same
// city, the same traffic and the same screenshot scenes, every run.
function makeRandom(seed) {
  var a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function range(rng, min, max) { return min + rng() * (max - min); }
function rangeInt(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }
function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
// Shortest signed angle from a to b, in (-PI, PI].
function angleDiff(a, b) {
  var d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function dist2(ax, az, bx, bz) {
  var dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

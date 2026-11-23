// Save and load through localStorage: cash, mission progress, the player's
// position and health, coins found, and lifetime stats. A save is written on
// every mission pass and from the pause menu.
var Save = (function () {
  function data() {
    return {
      v: 1,
      cash: S.cash,
      health: S.health,
      ammo: S.ammo,
      missionIndex: S.mission.index,
      missionDone: S.mission.done,
      missionsDone: S.stats.missionsDone,
      x: S.player.x,
      z: S.player.z,
      heading: S.player.heading,
      time: S.time,
      coinsCollected: S.coinsCollected,
      coinsTaken: S.coins.map(function (c) { return c.taken; }),
      stats: S.stats,
      savedAt: Date.now(),
    };
  }

  function save() {
    try {
      window.localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data()));
      return true;
    } catch (e) { return false; }
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(CFG.SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function hasSave() { return !!load(); }

  function apply(d) {
    S.cash = d.cash || 0;
    S.health = d.health != null ? d.health : CFG.PLAYER_MAX_HEALTH;
    S.ammo = d.ammo != null ? d.ammo : CFG.AMMO_START;
    S.time = d.time != null ? d.time : CFG.START_HOUR;
    S.coinsCollected = d.coinsCollected || 0;
    S.stats = d.stats || S.stats;
    S.player.x = d.x || 0;
    S.player.z = d.z != null ? d.z : 24;
    S.player.heading = d.heading || 0;
    S.player.mesh.position.set(S.player.x, 0, S.player.z);
    S.player.mesh.rotation.y = S.player.heading;
    if (d.coinsTaken) {
      S.coins.forEach(function (c, i) {
        if (d.coinsTaken[i]) { c.taken = true; c.mesh.visible = false; }
      });
    }
    // Resume at the next uncompleted mission.
    var idx = d.missionDone ? 6 : (d.missionIndex || 0);
    if (idx >= 6) { S.mission.done = true; S.mission.index = 5; }
    else {
      S.mission.index = idx;
      Missions.startMission(idx);
    }
  }

  return { save: save, load: load, hasSave: hasSave, apply: apply };
})();

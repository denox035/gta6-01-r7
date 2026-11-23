// The HUD: DOM panels for cash, health, wanted stars and the clock, a live
// 2D minimap drawn on a canvas, mission banners, dialogue and toasts.
var HUD = (function () {
  var els = {};
  var mapCanvas = null, mapCtx = null;
  var toasts = [];
  var dialogueTimer = 0;
  var bannerTimer = 0;

  function init() {
    els.cash = document.getElementById('hud-cash');
    els.healthFill = document.getElementById('hud-health-fill');
    els.healthText = document.getElementById('hud-health-text');
    els.stars = document.getElementById('hud-stars');
    els.clock = document.getElementById('hud-clock');
    els.objective = document.getElementById('hud-objective');
    els.speed = document.getElementById('hud-speed');
    els.ammo = document.getElementById('hud-ammo');
    els.banner = document.getElementById('banner');
    els.bannerTitle = document.getElementById('banner-title');
    els.bannerSub = document.getElementById('banner-sub');
    els.dialogue = document.getElementById('dialogue');
    els.dialogueName = document.getElementById('dialogue-name');
    els.dialogueText = document.getElementById('dialogue-text');
    els.toasts = document.getElementById('toasts');
    els.vignette = document.getElementById('vignette');
    els.flash = document.getElementById('flash');
    els.hint = document.getElementById('hud-hint');
    mapCanvas = document.getElementById('minimap');
    mapCtx = mapCanvas.getContext('2d');
  }

  function fmtCash(v) { return '$' + Math.floor(v).toLocaleString('en-US'); }
  function fmtClock(hours) {
    var h = Math.floor(hours) % 24;
    var m = Math.floor((hours % 1) * 60);
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return (h12 < 10 ? '0' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }

  function update(dt) {
    if (!S) return;
    els.cash.textContent = fmtCash(S.cash);
    els.healthFill.style.width = Math.max(0, S.health) + '%';
    els.healthFill.style.background = S.health > 50 ? '#3fae5a' : S.health > 25 ? '#e8a13a' : '#d83838';
    els.healthText.textContent = Math.ceil(Math.max(0, S.health));
    var stars = '';
    for (var i = 0; i < CFG.WANTED_MAX; i++) stars += i < S.wanted ? '★' : '☆';
    els.stars.textContent = stars;
    els.stars.style.color = S.wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    els.clock.textContent = fmtClock(S.time) + '  ·  ' + NAMES.CITY;
    els.ammo.textContent = S.player.onFoot ? ('AMMO ' + S.ammo) : '';
    if (S.player.car) {
      var kmh = Math.round(Math.abs(S.player.car.speed) * 3.6);
      els.speed.textContent = kmh + ' km/h';
      els.speed.style.display = 'block';
    } else els.speed.style.display = 'none';
    // Context hint.
    var hint = '';
    if (S.screen === 'play') {
      if (S.player.onFoot) {
        var car = World.nearestCar(4.5);
        if (car) hint = '[E] Get in the ' + (car.sport ? 'sports car' : 'car');
        else if (S.taxi && S.taxi.waiting && S.taxi.passenger &&
          Math.sqrt(dist2(S.player.x, S.player.z, S.taxi.passenger.x, S.taxi.passenger.z)) < 6) hint = '[E] Talk to the passenger';
        else hint = 'WASD move · Shift run · F punch · Click shoot · E enter car';
      } else {
        hint = 'W/S drive · A/D steer · Space handbrake · E exit car';
      }
    }
    els.hint.textContent = hint;
    drawMinimap();
    if (dialogueTimer > 0) {
      dialogueTimer -= dt;
      if (dialogueTimer <= 0) els.dialogue.style.display = 'none';
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) els.banner.style.display = 'none';
    }
  }

  function drawMinimap() {
    var ctx = mapCtx, size = 220;
    var scale = size / (CFG.HALF * 2 + 60);
    function mx(x) { return size / 2 + x * scale; }
    function mz(z) { return size / 2 + z * scale; }
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(20, 26, 34, 0.85)';
    ctx.fillRect(0, 0, size, size);
    // Beach + sea.
    ctx.fillStyle = '#c8b06a';
    ctx.fillRect(0, mz(CFG.BEACH_Z), size, size - mz(CFG.BEACH_Z));
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, mz(CFG.SEA_Z), size, size - mz(CFG.SEA_Z));
    // Roads.
    ctx.strokeStyle = '#5a5e66';
    ctx.lineWidth = Math.max(2, CFG.ROAD_W * scale);
    City.roadCenters().forEach(function (c) {
      ctx.beginPath(); ctx.moveTo(mx(c), 0); ctx.lineTo(mx(c), size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, mz(c)); ctx.lineTo(size, mz(c)); ctx.stroke();
    });
    // Blocks.
    ctx.fillStyle = 'rgba(140, 150, 160, 0.5)';
    for (var bx = -4; bx <= 4; bx++) for (var bz = -4; bz <= 4; bz++) {
      ctx.fillRect(mx(bx * CFG.PITCH - 30), mz(bz * CFG.PITCH - 30), 60 * scale, 60 * scale);
    }
    // Coins (only nearby ones, so the map stays readable).
    ctx.fillStyle = '#ffd23e';
    S.coins.forEach(function (c) {
      if (c.taken) return;
      if (Math.abs(c.x - S.player.x) > 120 || Math.abs(c.z - S.player.z) > 120) return;
      ctx.beginPath(); ctx.arc(mx(c.x), mz(c.z), 2, 0, Math.PI * 2); ctx.fill();
    });
    // Taxi destination / passenger.
    if (S.taxi && S.taxi.dest) {
      ctx.fillStyle = '#2ce8c8';
      ctx.beginPath(); ctx.arc(mx(S.taxi.dest.x), mz(S.taxi.dest.z), 4, 0, Math.PI * 2); ctx.fill();
    }
    if (S.taxi && S.taxi.waiting && S.taxi.passenger) {
      ctx.fillStyle = '#2ce8c8';
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', mx(S.taxi.passenger.x), mz(S.taxi.passenger.z));
    }
    // Mission target: pulsing yellow diamond.
    if (S.missionTarget) {
      var pulse = 4 + Math.sin(performance.now() / 180) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.save();
      ctx.translate(mx(S.missionTarget.x), mz(S.missionTarget.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
      ctx.restore();
    }
    // Traffic cars.
    ctx.fillStyle = '#ffffff';
    S.cars.forEach(function (c) {
      if (c.isPlayer || c.police) return;
      ctx.fillRect(mx(c.x) - 1.5, mz(c.z) - 1.5, 3, 3);
    });
    // Police: flashing blue/red dots.
    var flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#4488ff' : '#ff4444';
    S.police.forEach(function (c) {
      ctx.beginPath(); ctx.arc(mx(c.x), mz(c.z), 3.5, 0, Math.PI * 2); ctx.fill();
    });
    // Enemies.
    ctx.fillStyle = '#ff2222';
    S.enemies.forEach(function (e) {
      if (e.state === 'dead') return;
      ctx.beginPath(); ctx.arc(mx(e.x), mz(e.z), 3, 0, Math.PI * 2); ctx.fill();
    });
    // Player arrow.
    ctx.save();
    ctx.translate(mx(S.player.x), mz(S.player.z));
    ctx.rotate(S.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // North marker.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('N', 6, 14);
  }

  function setObjective(text) { els.objective.textContent = text; }
  function banner(title, sub) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub || '';
    els.banner.style.display = 'block';
    bannerTimer = 3.2;
  }
  function dialogue(name, text) {
    els.dialogueName.textContent = name;
    els.dialogueText.textContent = text;
    els.dialogue.style.display = 'block';
    dialogueTimer = 5.5;
  }
  function toast(text, kind) {
    var div = document.createElement('div');
    div.className = 'toast ' + (kind || 'info');
    div.textContent = text;
    els.toasts.appendChild(div);
    toasts.push(div);
    setTimeout(function () {
      div.style.opacity = '0';
      setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 400);
    }, 3600);
  }
  function flashDamage() {
    els.vignette.style.opacity = '0.85';
    setTimeout(function () { els.vignette.style.opacity = '0'; }, 180);
  }
  function flashWhite() {
    els.flash.style.opacity = '0.7';
    setTimeout(function () { els.flash.style.opacity = '0'; }, 120);
  }
  function setScreenVisible(playing) {
    document.getElementById('hud').style.display = playing ? 'block' : 'none';
  }

  return {
    init: init, update: update, setObjective: setObjective,
    banner: banner, dialogue: dialogue, toast: toast,
    flashDamage: flashDamage, flashWhite: flashWhite,
    setScreenVisible: setScreenVisible,
  };
})();

// =========================================================================
// BOSS_MOTION.JS — Vaelgor's dashes, lunges and backsteps used to move him by setting his position in a single frame, which
// looks like a teleport. The game logic still moves him instantly (so every hit box and telegraph is exactly where it was), but
// what you SEE now glides there: the drawn model is offset by the jump and the offset eases to nothing in about a tenth of a
// second, so a dash reads as a dash and a lunge as a lunge.
// Mechanic states and cutscenes are left alone (those moves are meant to be cuts).
//
// For a guest this also covers the position corrections that arrive in network packets (boss_sync nudges him between frames):
// any step bigger than a few units that happened outside his own update is eased in the same way instead of showing as a stutter.
// =========================================================================
(function () {
  if (typeof VaelgorRaidBoss === 'undefined') return;
  const P = VaelgorRaidBoss.prototype;
  const MIN_POP = 26, MAX_POP = 520, GLIDE = 0.11, MIN_NET = 4;
  const KEEP = /(_mechanic|^intro|cutscene|^dead|vanish|mech_approach)/;
  // patterns that make him grunt and burst on Hard when they end
  const GRUNT = new Set(['pat_graveyard', 'pat_dreadnought', 'pat_world_cleaver', 'pat_cross_judgment', 'pat_blood_rain', 'pat_eclipse_blender']);
  const isGuest = () => !!(window.game && window.game.net && window.game.net.isHost === false);

  // add a visual offset (the boss is drawn at his logic position + offset), merged with whatever is left of an earlier glide
  function addOffset(b, ox, oy) {
    const rem = b._glide ? (1 - b._glide.t / GLIDE) : 0;
    b._glide = { x: (b._glide ? b._glide.x * rem * rem : 0) + ox, y: (b._glide ? b._glide.y * rem * rem : 0) + oy, t: 0 };
  }

  const oUpdate = P.update;
  P.update = function (dt, ...rest) {
    const st0 = this.state || '';
    // a guest's boss was moved by a packet since the last frame: ease that step instead of showing it as a jump
    if (this._lx !== undefined && isGuest() && !KEEP.test(st0) && this.hp > 0) {
      const ed = Math.hypot(this.x - this._lx, this.y - this._ly);
      if (ed > MIN_NET && ed < MAX_POP) addOffset(this, this._lx - this.x, this._ly - this.y);
    }
    const x0 = this.x, y0 = this.y;
    const r = oUpdate.call(this, dt, ...rest);
    const st = this.state || '';
    // HARD: after some patterns he grunts and a small ring bursts around him, with no floor telegraph (the host decides, guests see it)
    if (st0 !== st && GRUNT.has(st0) && !/^pat_/.test(st) && this.hp > 0 && this.isHardRaid && this.isHardRaid()) {
      if (window.audio && audio.playBossVoice) audio.playBossVoice('', 'attack');
      (this.hardEchoes = this.hardEchoes || []).push({ x: this.x, y: this.y, r: 125, dmg: 230, delay: 0.3, t: 0, silent: true });
    }
    if (this._glide) {
      this._glide.t += dt;
      if (this._glide.t >= GLIDE) this._glide = null;
    }
    const d = Math.hypot(this.x - x0, this.y - y0);
    if (d > MIN_POP && d < MAX_POP && !KEEP.test(st) && this.hp > 0) addOffset(this, x0 - this.x, y0 - this.y);
    this._lx = this.x; this._ly = this.y;
    return r;
  };

  const oDraw = P.draw;
  P.draw = function (ctx) {
    const g = this._glide;
    if (!g) return oDraw.call(this, ctx);
    const k = Math.max(0, 1 - g.t / GLIDE), e = k * k;           // fast start, soft landing
    ctx.save();
    ctx.translate(g.x * e, g.y * e);
    try { return oDraw.call(this, ctx); } finally { ctx.restore(); }
  };
})();

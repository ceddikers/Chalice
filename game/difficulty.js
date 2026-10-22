// =========================================================================
// DIFFICULTY.JS — Normal / Hard.
//   NORMAL  ONE revive per person per raid (auto-revive after a few seconds, or a teammate picks you up first); after that you
//           spectate, and the party is defeated when nobody is left who can stand back up. The boss hits 30% softer, the
//           enrage timer is much longer (9:30 solo, +0:35 per extra player; Hard is 5:30) and a failed mechanic is a heavy hit, not an instant wipe.
//   HARD    the boss exactly as designed. NO revives of any kind: when you fall you spectate, and when every player is down the
//           party is defeated and gets a retry / return-to-hub screen.
// The host (or a solo player) picks the mode in the hub; guests follow the host. Practice rooms are always forgiving.
// =========================================================================
(function () {
  const KEY = 'newtry1_difficulty';
  const NORMAL_DAMAGE = 0.7;       // damage multiplier on the local player in Normal
  // boss HP went x1.5 on 2026-10-18; the timers went up x1.375 (mechanics and cutscenes take the same time as before)
  const NORMAL_ENRAGE = 570;       // seconds for a solo run (Hard keeps the boss's own 330)
  const NORMAL_ENRAGE_PER_EXTRA = 35;   // + this many seconds for each extra player
  const MECHANIC_SHIELD = 0.25;    // fraction of max HP granted as a shield when the party clears a mechanic
  const WIPE_DAMAGE_NORMAL = 0.6;  // Normal: a failed mechanic's instant wipe becomes this fraction of max HP instead
  const NORMAL_REVIVES = 1;        // Normal: revives per person per raid (the auto-revive or a teammate's pick-up, whichever comes first)
  const WIPE_GRACE = 1.6;         // seconds with nobody standing before the party is declared defeated
  const $ = (id) => document.getElementById(id);
  const toast = (m) => { if (window.QoL) window.QoL.toast(m); };

  if (typeof Game25D === 'undefined') return;
  const proto = Game25D.prototype;

  proto.isHard = function () {
    const b = this.boss;
    const practice = !!(b && (b.practiceClockMode || b.practiceFinalPhaseMode || b.practiceFinalClashMode));
    return this.difficulty === 'hard' && !practice;
  };

  proto.paintDifficulty = function () {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('on', b.dataset.d === this.difficulty));
    if (window.RaidSelect) window.RaidSelect.refresh();     // keep an open menu in step (e.g. the host changed it)
  };

  proto.setDifficulty = function (d, broadcast = true) {
    this.difficulty = d === 'hard' ? 'hard' : 'normal';
    try { localStorage.setItem(KEY, this.difficulty); } catch (e) {}
    this.paintDifficulty();
    if (broadcast && this.net.isHost && this.net.isConnected()) this.net.broadcast({ type: 'difficulty', value: this.difficulty });
  };

  // Clicking the hub toggle
  proto.requestDifficulty = function (d) {
    if (this.net.isClient()) { toast('Only the host picks the difficulty'); return; }
    if (this.mode !== 'hub') { toast('Change the difficulty back in the hub'); return; }
    this.setDifficulty(d);
  };

  // A player who is down for good: Hard always, Normal once their revive is spent
  proto.isPracticeRaid = function () { const b = this.boss; return !!(b && (b.practiceClockMode || b.practiceFinalPhaseMode || b.practiceFinalClashMode)); };
  proto.canRevive = function (p) { return !!p && !this.isHard() && (this.isPracticeRaid() || (p.revivesLeft | 0) > 0); };   // practice: unlimited
  proto.spendRevive = function (p) { if (p && !this.isPracticeRaid()) p.revivesLeft = Math.max(0, (p.revivesLeft | 0) - 1); };
  proto.isOutForGood = function (p) { return !!p && p.hp <= 0 && !this.canRevive(p); };

  // Who the camera follows while you are down for good
  proto.getSpectateTarget = function () {
    if (this.mode !== 'raid' || !this.isOutForGood(this.localPlayer) || this.defeatShown) return null;
    return (this.party || []).find(p => p !== this.localPlayer && p.hp > 0) || null;
  };

  proto.showDefeat = function () {
    if (this.defeatShown) return;
    this.defeatShown = true;
    const pct = this.boss ? Math.max(1, Math.round((this.boss.hp / this.boss.maxHp) * 100)) : 100;
    const sub = $('defeat-sub');
    if (sub) sub.textContent = this.boss && this.boss.isCervanth ? `Cervanth still stands with ${pct}% of his health.` : this.boss && this.boss.isHush ? `Hush is still singing, with ${pct}% of her health.` : this.boss && this.boss.isIgnis ? `Ignis Vane still stands with ${pct}% of her health.` : `Vaelgor still stands with ${pct}% of his health.`;
    const client = this.net.isClient();
    $('defeat-retry')?.classList.toggle('hidden', client);
    const note = $('defeat-note');
    if (note) note.textContent = client ? 'Waiting for the host to choose…' : '';
    try { audio.setMusicState('hub'); } catch (e) {}
    this.closeAllModals();
    const dr = $('defeat-results');
    if (dr && window.RaidStats) {
      try { const res = window.RaidStats.compile(); res.rows.forEach(r => { r.mvp = false; }); dr.innerHTML = this.resultsHtml(res, null, [[(this.boss && this.boss.isCervanth ? 'Cervanth' : this.boss && this.boss.isHush ? 'Hush' : this.boss && this.boss.isIgnis ? 'Ignis' : 'Vaelgor') + ' left', pct + '%']]); } catch (e) { dr.innerHTML = ''; }
    }
    $('defeat-modal')?.classList.remove('hidden');
    $('spectate-banner')?.classList.add('hidden');
  };

  // ---- hooks ----------------------------------------------------------------
  const origEnter = proto.enterRaidGate;
  proto.enterRaidGate = function () {
    const r = origEnter.apply(this, arguments);
    this.defeatShown = false; this.allDeadT = 0;
    const hard = this.isHard();
    for (const p of this.party || []) if (p) { p.revivesLeft = hard ? 0 : NORMAL_REVIVES; p.deadTimer = 0; }
    if (this.boss && !hard && !this.net.isClient()) {
      const humans = Math.max(1, (this.party || []).filter(p => !p.isBot).length);
      this.boss.enrageMaxTimer = this.boss.enrageTimer = NORMAL_ENRAGE + NORMAL_ENRAGE_PER_EXTRA * (humans - 1);
    }
    const name = document.querySelector('#boss-hud .boss-name');
    if (name) name.textContent = ((this.boss && this.boss.hudName) || 'VAELGOR') + (hard ? ' · HARD' : '');
    toast(hard ? 'HARD: no revives' : 'Normal difficulty');
    return r;
  };

  const origHub = proto.enterHub;
  proto.enterHub = function () {
    this.defeatShown = false; this.allDeadT = 0;
    $('defeat-modal')?.classList.add('hidden');
    $('spectate-banner')?.classList.add('hidden');
    return origHub.apply(this, arguments);
  };

  const origUpdate = proto.update;
  proto.update = function (dt) {
    origUpdate.call(this, dt);
    const banner = $('spectate-banner');
    if (this.mode !== 'raid' || !this.boss || this.boss.hp <= 0 || this.defeatShown) {
      if (banner && !banner.classList.contains('hidden')) banner.classList.add('hidden');
      this.allDeadT = 0;
      return;
    }
    const me = this.localPlayer;
    if (banner) {
      if (this.isOutForGood(me)) {
        const t = this.getSpectateTarget();
        banner.textContent = t ? `You have fallen. Spectating ${t.name}` : 'You have fallen';
        banner.classList.remove('hidden');
      } else if (me.hp <= 0) {
        banner.textContent = `Reviving in ${Math.max(0, 3 - (me.deadTimer || 0)).toFixed(1)}s (last revive)`;
        banner.classList.remove('hidden');
      } else banner.classList.add('hidden');
    }
    // defeated once no human is standing and none of them can come back
    const anyStanding = (this.party || []).some(p => !p.isBot && !this.isOutForGood(p));
    if (!anyStanding) {
      this.allDeadT = (this.allDeadT || 0) + dt;
      if (this.allDeadT > WIPE_GRACE) this.showDefeat();
    } else this.allDeadT = 0;
  };

  // Normal: the boss hits softer. Hit reactions (stagger / knockdown) keep their original strength.
  if (typeof BreakerPlayer25D !== 'undefined') {
    const origTake = BreakerPlayer25D.prototype.takeDamage;
    BreakerPlayer25D.prototype.takeDamage = function (raw, src, opts) {
      const g = window.game;
      // Normal: a failed mechanic is a crushing blow, not an instant wipe
      if (g && this.isLocal && g.mode === 'raid' && !g.isHard() && raw >= 50000) {
        const o = opts ? { ...opts } : {};
        o.forceLethal = false; o.power = 'heavy';
        return origTake.call(this, Math.round(this.maxHp * WIPE_DAMAGE_NORMAL), src, o);
      }
      if (g && this.isLocal && g.mode === 'raid' && !g.isHard() && !(opts && opts.forceLethal)) {
        const o = opts ? { ...opts } : {};
        if (!o.power) o.power = raw >= 275 ? 'heavy' : (raw >= 195 ? 'medium' : 'light');
        return origTake.call(this, raw * NORMAL_DAMAGE, src, o);
      }
      return origTake.call(this, raw, src, opts);
    };
  }

  // ---- clearing a mechanic grants every player a shield (both difficulties) ------------------------------
  if (typeof VaelgorRaidBoss !== 'undefined') {
    const B = VaelgorRaidBoss.prototype;
    const grant = (boss) => {
      const g = window.game;
      if (!g || g.mode !== 'raid') return;
      const now = performance.now();
      if (boss._shieldAt && now - boss._shieldAt < 3000) return;      // one grant per clear, even if several hooks fire
      boss._shieldAt = now;
      const p = g.localPlayer;
      if (!p || p.hp <= 0) return;
      const bonus = (p.passives && p.passives.ember_signet) ? 0.15 : 0;        // Ember Signet
      p.shield = Math.min(Math.round(p.maxHp * 0.7), (p.shield || 0) + Math.round(p.maxHp * (MECHANIC_SHIELD + bonus)));
      if (g.fx) g.fx.addShockwave(p.x, p.y, 70, '#7dd3fc', 3, 0.45);
    };
    const MECH = ['eclipse_mechanic', 'iaido_mechanic', 'horizon_mechanic'];
    const origStagger = B.enterStaggerState;
    B.enterStaggerState = function (text) {
      if (MECH.includes(this.state) && /SHATTERED|STAGGER BROKEN|CONSTELLATION SOLVED/.test(String(text || ''))) grant(this);
      return origStagger.apply(this, arguments);
    };
    const origAbsorb = B.enterFinalSwordAbsorbCutscene;
    B.enterFinalSwordAbsorbCutscene = function () { grant(this); return origAbsorb.apply(this, arguments); };
    const origClash = B.completeFinalClashSuccess;
    B.completeFinalClashSuccess = function () { grant(this); return origClash.apply(this, arguments); };
    B.grantMechanicShield = function () { grant(this); };     // other bosses call this when their mechanic is cleared (boss_ignis.js)
  }

  function init() {
    const g = window.game;
    if (!g) return;
    let d = 'normal';
    try { d = localStorage.getItem(KEY) === 'hard' ? 'hard' : 'normal'; } catch (e) {}
    g.difficulty = d;
    g.paintDifficulty();    // the buttons themselves live in the raid select menu (raid_select.js)
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init); else init();
})();

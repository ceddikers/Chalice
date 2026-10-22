// =========================================================================
// RAID_STATS.JS — what happened in the fight: time, damage, stagger, deaths per player, plus the MVP.
//
// Every client sees every hit (see VaelgorRaidBoss.receiveDamage), so each one can tally the fight itself. The host's tally is
// broadcast at the end so everyone's results screen agrees.
//
// MVP score (each term is measured against the best player in the party, so it works for any group size):
//     score = 0.60 * damage/bestDamage  +  0.25 * stagger/bestStagger  +  0.15 * survival
//     survival = 1 with no deaths, 0.5 with one, 0 with two or more
// Damage is the HP actually taken off the boss (so hits that were reduced or ignored don't pad it); stagger is the stagger
// power of the hits that landed. Ties go to the higher damage. A solo run has no MVP.
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const W_DMG = 0.60, W_STAG = 0.25, W_SURV = 0.15;

  const S = { active: false, t: 0, mode: 'normal', rows: new Map(), hostResults: null, results: null };

  const row = (id) => {
    let r = S.rows.get(id);
    if (!r) { r = { id, dmg: 0, stagger: 0, hits: 0, taken: 0, deaths: 0, lastHp: null, skills: new Map() }; S.rows.set(id, r); }
    return r;
  };

  function reset(game) {
    S.active = true; S.t = 0; S.rows.clear(); S.hostResults = null; S.results = null;
    S.mode = game && game.isHard && game.isHard() ? 'hard' : 'normal';
  }

  // ---- per-ability breakdown ("detailed damage chart") -----------------------------------------------------------
  // The hit's skill name comes from dealHitToBoss ("Bonk 3/9 [F]", "Trifecta Slam [Q]", "Combo 2", ...). Hits of one ability are
  // grouped under that ability's real name: the [KEY] in the text maps to the class's skill list, a few names are special-cased,
  // and anything unrecognised is shown as-is with its numbers stripped ("Other" when no name was sent at all).
  function abilityName(raw, classId) {
    if (!raw) return 'Other';
    const meta = window.SKILL_META && window.SKILL_META[classId || 'breaker'];
    const m = /\[([A-Za-z])\]/.exec(raw);
    if (m) {
      const key = m[1].toLowerCase(), sk = meta && meta.skills && meta.skills[key];
      return `${sk ? (sk.name || sk.short) : raw.replace(/\s*\[.\]\s*$/, '').replace(/\s*\d+(\/\d+)?\s*/g, ' ').trim()} [${m[1].toUpperCase()}]`;
    }
    if (/^combo/i.test(raw) || /basic/i.test(raw)) return 'Basic attacks';
    if (/omnislash/i.test(raw)) { const sk = meta && meta.skills && meta.skills.t; return `${sk ? sk.name : 'Omnislash'} [T]`; }
    if (/^clash/i.test(raw)) return 'Clash';
    return raw.replace(/\s*\d+(\/\d+)?\s*/g, ' ').trim() || 'Other';
  }
  function addSkill(r, name, dmg, crit) {
    let s = r.skills.get(name);
    if (!s) { s = { name, dmg: 0, hits: 0, crits: 0, max: 0 }; r.skills.set(name, s); }
    s.dmg += dmg; s.hits++; if (crit) s.crits++; if (dmg > s.max) s.max = dmg;
  }

  function survival(deaths) { return deaths <= 0 ? 1 : deaths === 1 ? 0.5 : 0; }

  // Turn the raw tallies into the table the results screen shows.
  function compile(game) {
    const humans = (game.party || []).concat(game.ghosts || []).filter(p => !p.isBot);   // a player who dropped still keeps their line
    const rows = humans.map(p => {
      const r = S.rows.get(p.id) || {};
      return { id: p.id, name: p.name || 'Warden', classId: p.classId || 'breaker', look: p.look || null, isLocal: !!p.isLocal,
        dmg: Math.round(r.dmg || 0), stagger: Math.round(r.stagger || 0), hits: r.hits || 0, taken: Math.round(r.taken || 0), deaths: r.deaths || 0,
        skills: r.skills ? [...r.skills.values()].map(s => ({ name: s.name, dmg: Math.round(s.dmg), hits: s.hits, crits: s.crits, max: Math.round(s.max) })).sort((a, b) => b.dmg - a.dmg) : [] };
    });
    const time = Math.max(1, S.t);
    const totalDmg = rows.reduce((a, r) => a + r.dmg, 0) || 1;
    const bestD = Math.max(1, ...rows.map(r => r.dmg)), bestS = Math.max(1, ...rows.map(r => r.stagger));
    for (const r of rows) {
      r.dps = Math.round(r.dmg / time);
      r.share = r.dmg / totalDmg;
      r.score = W_DMG * (r.dmg / bestD) + W_STAG * (r.stagger / bestS) + W_SURV * survival(r.deaths);
    }
    rows.sort((a, b) => b.score - a.score || b.dmg - a.dmg);
    if (rows.length > 1) rows[0].mvp = true;
    return { time: Math.round(S.t), mode: S.mode, rows };
  }

  function finish(game) {
    if (!S.active) return;
    S.active = false;
    S.results = compile(game);
    if (game.net && game.net.isHost && game.net.isConnected()) game.net.broadcast({ type: 'raid_results', results: S.results });
  }

  // ---- reconnects ----------------------------------------------------------------------------------------------
  // A player who rejoins gets a new id; their tally moves over so the meter keeps going where they left off.
  function transfer(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    const r = S.rows.get(oldId);
    if (!r) return;
    S.rows.delete(oldId);
    const cur = S.rows.get(newId);
    if (cur) { r.dmg += cur.dmg; r.stagger += cur.stagger; r.hits += cur.hits; r.taken += cur.taken; r.deaths += cur.deaths; for (const [n, s] of cur.skills) addSkillRaw(r, s); }
    r.id = newId;
    S.rows.set(newId, r);
  }
  function addSkillRaw(r, s) {
    const t = r.skills.get(s.name);
    if (!t) { r.skills.set(s.name, Object.assign({}, s)); return; }
    t.dmg += s.dmg; t.hits += s.hits; t.crits += s.crits; t.max = Math.max(t.max, s.max);
  }
  function snapshot() {
    return { t: S.t, rows: [...S.rows.values()].map(r => ({ id: r.id, dmg: r.dmg, stagger: r.stagger, hits: r.hits, taken: r.taken, deaths: r.deaths, skills: [...r.skills.values()] })) };
  }
  // Rejoining client: adopt the host's tally. meId is the id this player had before; it becomes meNow.
  function applySnapshot(snap, meId, meNow) {
    if (!snap || !Array.isArray(snap.rows)) return;
    S.t = Math.max(S.t, snap.t || 0);
    for (const x of snap.rows) {
      const id = x.id === meId ? meNow : x.id;
      const r = row(id);
      r.dmg = x.dmg; r.stagger = x.stagger; r.hits = x.hits; r.taken = x.taken; r.deaths = x.deaths;
      r.skills = new Map((x.skills || []).map(s => [s.name, Object.assign({}, s)]));
    }
  }

  // What the results screen should show: the host's tally when it arrived, otherwise our own.
  function get() { return S.hostResults || S.results; }

  function onNet(data) {
    if (data && data.results && Array.isArray(data.results.rows)) {
      S.hostResults = data.results;
      // the victory screen may already be open: repaint
      if (window.game && window.game.repaintResults) window.game.repaintResults();
    }
  }

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ---- hooks ----------------------------------------------------------------
  const proto = Game25D.prototype;
  const origEnter = proto.enterRaidGate;
  proto.enterRaidGate = function () {
    const r = origEnter.apply(this, arguments);
    reset(this);
    return r;
  };

  const origUpdate = proto.update;
  proto.update = function (dt) {
    origUpdate.call(this, dt);
    const clock = document.getElementById('raid-clock');
    const live = this.mode === 'raid' && S.active && this.boss && this.boss.hp > 0;
    if (!live) { if (clock && !clock.classList.contains('hidden') && this.mode !== 'raid') clock.classList.add('hidden'); return; }
    if (this.boss.state !== 'intro_cutscene') S.t += dt;
    let deaths = 0;
    for (const p of this.party || []) {
      if (p.isBot) continue;
      const r = row(p.id);
      if (r.lastHp !== null) {
        if (r.lastHp > 0 && p.hp <= 0) r.deaths++;
        else if (p.hp < r.lastHp) r.taken += r.lastHp - p.hp;
      }
      r.lastHp = p.hp;
      deaths += r.deaths;
    }
    if (clock) {
      clock.classList.remove('hidden');
      const txt = `${fmtTime(Math.floor(S.t))}${deaths ? ` · ${deaths} down` : ''}`;
      if (clock.textContent !== txt) clock.textContent = txt;
    }
  };

  if (typeof VaelgorRaidBoss !== 'undefined') {
    const origHit = VaelgorRaidBoss.prototype.receiveDamage;
    VaelgorRaidBoss.prototype.receiveDamage = function (dmg, staggerAmt, attacker, hitOpts) {
      if (!S.active || !attacker || !attacker.id || attacker.isBot || this.hp <= 0 || this.state === 'intro_cutscene' || (!(hitOpts && hitOpts.fromNetwork) && attacker.isRemote)) {
        return origHit.apply(this, arguments);
      }
      const before = this.hp;
      const out = origHit.apply(this, arguments);
      const r = row(attacker.id);
      const dealt = Math.max(0, before - this.hp);
      r.dmg += dealt;
      r.stagger += Math.max(0, staggerAmt || 0);
      r.hits++;
      addSkill(r, abilityName(hitOpts && hitOpts.skill, attacker.classId), dealt, !!(hitOpts && hitOpts.crit));
      return out;
    };
  }

  window.RaidStats = { finish, get, onNet, transfer, snapshot, applySnapshot, fmtTime, compile: () => compile(window.game), state: S, WEIGHTS: { W_DMG, W_STAG, W_SURV } };
})();

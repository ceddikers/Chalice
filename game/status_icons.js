// =========================================================================
// STATUS_ICONS.JS — buff / debuff icons.
//   player   a row just above the skill bar, lined up with its left edge
//   boss     a row right under the boss's HP and stagger bars
// Every status is one entry in DEFS: where it shows (side), whether it is a buff or debuff, how to read it from the game state,
// and its text. Add a line to DEFS and it appears. Icons show a stack count and a draining bar when the effect is timed;
// hover for the name and what it does.
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const $ = (id) => document.getElementById(id);

  const ICON = {
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.3 1 2 2 2-1-3 0-5 1-8z"/>',
    shield: '<path d="M12 3l7 3v5.5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6z"/>',
    bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
    chain: '<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>',
    crack: '<path d="M12 3l-2 6 4 2-3 4 2 3M4 8l4 1M16 14l4 1"/>',
    skull: '<circle cx="12" cy="10" r="6.5"/><path d="M9.5 16.5V20h5v-3.5M9.5 10h.01M14.5 10h.01"/>',
    moon: '<path d="M19 14.5A8 8 0 0 1 9.5 5a8 8 0 1 0 9.5 9.5z"/>',
    arrowDown: '<path d="M12 4v13M6 12l6 6 6-6"/>',
    spiral: '<path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0M12 8a4 4 0 1 1-4 4M12 4a8 8 0 1 1-8 8"/>'
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;

  // Careful (the boss after a Rebuke) is painted in code, two tints: gold while he is immune, cool steel while he is resistant.
  // Same look as the painted PNGs: dark vignette plate, a glowing motif (a wary eye inside a ring of ticks), speckled brush grain.
  const carefulArt = {};
  function carefulIcon(stage) {
    if (carefulArt[stage]) return carefulArt[stage];
    const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const hot = stage === 'immune';
    const L = hot ? ['#fff3c4', '#f4b942', '#a8641a', '#4a2a0c'] : ['#e6f2ff', '#8fb8e8', '#476a9c', '#1c2a44'];
    let seed = hot ? 11 : 29; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // plate
    let bg = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.72);
    bg.addColorStop(0, L[3]); bg.addColorStop(0.55, '#14131a'); bg.addColorStop(1, '#07070b');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    // soft glow behind the motif
    const glow = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, 40);
    glow.addColorStop(0, hot ? 'rgba(255,214,120,0.55)' : 'rgba(150,200,255,0.38)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    // ring of ticks (a guard)
    g.save(); g.translate(S / 2, S / 2); g.lineCap = 'round';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, long = i % 3 === 0;
      g.strokeStyle = long ? L[1] : L[2]; g.globalAlpha = long ? 0.95 : 0.6; g.lineWidth = long ? 3.2 : 2;
      g.beginPath(); g.moveTo(Math.cos(a) * 35, Math.sin(a) * 35); g.lineTo(Math.cos(a) * (long ? 43 : 40), Math.sin(a) * (long ? 43 : 40)); g.stroke();
    }
    g.globalAlpha = 1;
    // the eye: two heavy brush arcs
    const eye = (path, fill) => { g.beginPath(); path(); if (fill) { g.fillStyle = fill; g.fill(); } };
    eye(() => { g.moveTo(-27, 0); g.quadraticCurveTo(0, -25, 27, 0); g.quadraticCurveTo(0, 25, -27, 0); }, 'rgba(10,8,12,0.88)');
    g.lineJoin = 'round';
    g.strokeStyle = L[2]; g.lineWidth = 6; g.stroke();
    g.strokeStyle = L[1]; g.lineWidth = 3.6; g.stroke();
    // iris + pupil + a catch-light
    const ir = g.createRadialGradient(-3, -3, 1, 0, 0, 13);
    ir.addColorStop(0, L[0]); ir.addColorStop(0.55, L[1]); ir.addColorStop(1, L[2]);
    g.fillStyle = ir; g.beginPath(); g.arc(0, 0, 12.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0a0810'; g.beginPath(); g.ellipse(0, 0, 4.2, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(-4.5, -4.5, 2.2, 0, Math.PI * 2); g.fill();
    // a lowered brow stroke (wary)
    g.strokeStyle = L[1]; g.lineWidth = 4; g.beginPath(); g.moveTo(-26, -19); g.quadraticCurveTo(-4, -34, 28, -16); g.stroke();
    g.restore();
    // brush grain + vignette
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      const w = 1 + rnd() * 5; g.fillRect(rnd() * S, rnd() * S, w, 1 + rnd() * 1.5);
    }
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.38, S / 2, S / 2, S * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = vg; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, S - 3, S - 3);
    return (carefulArt[stage] = c.toDataURL('image/png'));
  }

  // Ignis Vane's statuses, painted in code the same way (plate, glow, motif, brush grain, vignette).
  const ignisArt = {};
  function ignisIcon(kind) {
    if (ignisArt[kind]) return ignisArt[kind];
    const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const PAL = {
      tantrum:  ['#ffe2c4', '#ff5a2a', '#9c1c10', '#3e0a08'],
      showoff:  ['#fff6d0', '#ffc64a', '#a8641a', '#3a2008'],
      burnt:    ['#e8d6c8', '#9a7a66', '#4c3a30', '#1e1714'],
      scorched: ['#fff0c0', '#ff9a2a', '#b2400e', '#3a1406'],
      heart:    ['#ffe4ef', '#ff4f9a', '#a3124e', '#3a0a1e'],
      starstruck: ['#fff4fa', '#ff7ab8', '#b0185c', '#4a0a28']
    };
    const L = PAL[kind] || PAL.tantrum;
    let seed = kind.length * 37 + 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let bg = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.72);
    bg.addColorStop(0, L[3]); bg.addColorStop(0.55, '#14131a'); bg.addColorStop(1, '#07070b');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    const glow = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, 40);
    glow.addColorStop(0, kind === 'burnt' ? 'rgba(160,120,100,0.25)' : 'rgba(255,170,80,0.5)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    g.save(); g.translate(S / 2, S / 2); g.lineCap = 'round'; g.lineJoin = 'round';
    const flame = (x, y, h, w, cols) => {           // a teardrop flame, base at (x, y)
      const fl = g.createLinearGradient(x, y, x, y - h);
      fl.addColorStop(0, cols[2]); fl.addColorStop(0.45, cols[1]); fl.addColorStop(1, cols[0]);
      g.fillStyle = fl; g.beginPath(); g.moveTo(x, y - h);
      g.bezierCurveTo(x + w * 0.9, y - h * 0.45, x + w, y - h * 0.05, x, y);
      g.bezierCurveTo(x - w, y - h * 0.05, x - w * 0.9, y - h * 0.45, x, y - h); g.fill();
    };
    const fan = (open, crack) => {                   // a folding fan, pivot low
      const n = 9, sp = open ? 1.9 : 1.2, r = 34, py = 18;
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 - sp / 2 + (i / n) * sp, a1 = a0 + sp / n;
        g.fillStyle = i % 2 ? L[2] : L[1];
        g.beginPath(); g.moveTo(0, py); g.arc(0, py, r + 8, a0, a1); g.closePath(); g.fill();
      }
      g.strokeStyle = L[0]; g.lineWidth = 2.4; g.beginPath(); g.arc(0, py, r + 8, -Math.PI / 2 - sp / 2, -Math.PI / 2 + sp / 2); g.stroke();
      g.fillStyle = 'rgba(10,8,12,0.9)'; g.beginPath(); g.arc(0, py, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = L[1]; g.beginPath(); g.arc(0, py, 3.5, 0, Math.PI * 2); g.fill();
      if (crack) {
        g.strokeStyle = '#0a0608'; g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(-4, -30); g.lineTo(3, -18); g.lineTo(-5, -8); g.lineTo(4, 4); g.stroke();
        g.strokeStyle = L[0]; g.lineWidth = 1.4; g.stroke();
      }
    };
    if (kind === 'tantrum') {
      flame(-22, 30, 30, 9, L); flame(22, 30, 30, 9, L);
      fan(true, true);
    } else if (kind === 'showoff') {
      fan(true, false);
      g.fillStyle = L[0]; g.save(); g.translate(20, -24);          // a sparkle
      g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? 3 : 11; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.restore();
    } else if (kind === 'burnt') {
      g.fillStyle = '#2a2220'; g.fillRect(-9, 4, 18, 26);              // a guttered candle stub
      g.fillStyle = L[2]; g.fillRect(-9, 4, 18, 4);
      g.strokeStyle = '#120e0c'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 4); g.lineTo(1, -4); g.stroke();
      g.strokeStyle = L[1]; g.lineWidth = 3; g.globalAlpha = 0.7;    // a curl of smoke
      g.beginPath(); g.moveTo(1, -6); g.bezierCurveTo(14, -14, -12, -24, 4, -36); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = '#ff7a3a'; g.beginPath(); g.arc(1, -4, 2, 0, Math.PI * 2); g.fill();
    } else if (kind === 'heart' || kind === 'starstruck') {
      const heart = (x, y, s, col) => {
        g.fillStyle = col; g.beginPath(); g.moveTo(x, y + s * 0.9);
        g.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
        g.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9); g.fill();
      };
      heart(0, 4, 26, L[2]); heart(0, 2, 22, L[1]);
      g.fillStyle = L[0]; g.beginPath(); g.ellipse(-9, -6, 5, 3, -0.6, 0, Math.PI * 2); g.fill();
      if (kind === 'starstruck') {                                   // little hearts circling it
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.1; heart(Math.cos(a) * 34, Math.sin(a) * 30, 7, L[0]); }
      }
    } else {
      g.strokeStyle = L[2]; g.lineWidth = 4;                         // a burn ring with a fireball in it
      g.beginPath(); g.arc(0, 4, 32, 0, Math.PI * 2); g.stroke();
      flame(0, 22, 46, 16, L);
      g.fillStyle = L[0]; g.beginPath(); g.arc(0, 8, 7, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      const w = 1 + rnd() * 5; g.fillRect(rnd() * S, rnd() * S, w, 1 + rnd() * 1.5);
    }
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.38, S / 2, S / 2, S * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = vg; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, S - 3, S - 3);
    return (ignisArt[kind] = c.toDataURL('image/png'));
  }

  // get(ctx) returns null when the effect is off, or { stacks?, dur?, max? }.  ctx = { p: local player, b: boss, g: game }
  const DEFS = [
    // ---- on you ----
    { id: 'surge', side: 'player', kind: 'buff', icon: 'flame', name: 'Overpower Surge', desc: 'Your gauge is spent: stronger and tougher for a short time.',
      get: ({ p }) => p.overpowerSurge && p.surgeTimer > 0 ? { dur: p.surgeTimer, max: 14 } : null },
    { id: 'astral', side: 'player', kind: 'buff', icon: 'moon', name: 'Astral Surge', desc: 'Breaking the Eclipse charges you with extra power.',
      get: ({ p }) => p.astralStaggerSurge > 0 ? { dur: p.astralStaggerSurge, max: 12 } : null },
    { id: 'shield', side: 'player', kind: 'buff', icon: 'shield', name: 'Shield', desc: 'Absorbs damage before your health is touched.',
      get: ({ p }) => p.shield > 1 && p.classId !== 'reaper' ? { text: Math.round(p.shield) } : null },
    { id: 'umbral', side: 'player', kind: 'buff', icon: 'shield', name: 'Umbral Shield', desc: 'Stolen life, held as a shield. It drains once you stop feeding it, and your spenders consume it for more damage.',
      get: ({ p }) => p.classId === 'reaper' && p.shield > 1 ? { text: Math.round(p.shield) } : null },
    { id: 'bulwark', side: 'player', kind: 'buff', icon: 'shield', name: 'Bulwark', desc: 'Braced: 30% more damage and a shield worth a quarter of your health, until it fades.',
      get: ({ p }) => p.bulwarkT > 0 ? { dur: p.bulwarkT, max: 10 } : null },
    { id: 'voidform', side: 'player', kind: 'buff', icon: 'skull', name: 'Voidform', desc: 'The demon is out: stronger, tougher and faster, with a whole new set of skills. Each skill can be used once.',
      get: ({ p }) => p.classId === 'reaper' && p.form === 'void' ? { dur: p.formT, max: 22 } : null },
    { id: 'crimson_eclipse', side: 'player', kind: 'buff', icon: 'moon', name: 'Crimson Eclipse', desc: 'All your remaining energy is going into the blood sphere. You cannot be hurt until it is thrown.',
      get: ({ p }) => p.classId === 'reaper' && p.act && p.act.kind === 'tv' ? { dur: Math.max(0, p.act.dur - p.act.t), max: p.act.dur } : null },
    { id: 'sync', side: 'player', kind: 'buff', icon: 'bolt', name: 'Sync', desc: 'Freshly swapped: your next skill deals 30% more damage.',
      get: ({ p }) => p.classId === 'arclight' && p.syncT > 0 ? { dur: p.syncT, max: 4 } : null },
    { id: 'chain', side: 'player', kind: 'buff', icon: 'chain', name: 'Chain', desc: 'Cast a DIFFERENT attack skill within 3 seconds of the last (either mode) and the chain grows: +3% damage per link, up to 5 links. Swapping modes keeps it going.',
      get: ({ p }) => p.classId === 'arclight' && p.chainT > 0 && p.chain > 0 ? { stacks: p.chain, dur: p.chainT, max: 3 } : null },
    { id: 'solarfull', side: 'player', kind: 'buff', icon: 'flame', name: 'Solar Cannon Ready', desc: 'The core is fully charged. Press Z to fire the Solar Cannon.',
      get: ({ p }) => p.classId === 'arclight' && p.heat >= 99.5 ? {} : null },
    { id: 'overload', side: 'player', kind: 'buff', icon: 'bolt', name: 'Overload', desc: 'Full Momentum released: heavier, faster hammer work.',
      get: ({ p }) => p.overloadTimer > 0 ? { dur: p.overloadTimer, max: 8 } : null },
    { id: 'unbound_untouched', side: 'player', kind: 'buff', icon: 'shield', name: 'Untouched', desc: 'Not hit since your last Release: your next Release deals 25% more damage. Getting hit loses it.',
      get: ({ p }) => p.classId === 'unbound' && p.clean ? {} : null },
    { id: 'unbound_ready', side: 'player', kind: 'buff', icon: 'flame', name: 'Release Ready', desc: 'Restraint is full. Press Z to Release.',
      get: ({ p }) => p.classId === 'unbound' && p.full && !(p.act && p.act.kind === 'z') ? {} : null },
    { id: 'rooted', side: 'player', kind: 'debuff', icon: 'chain', name: 'Rooted', desc: 'You cannot move. Break free.',
      get: ({ p }) => p.rooted ? {} : null },
    { id: 'spasm', side: 'player', kind: 'debuff', icon: 'spiral', name: 'Muscle Spasms', desc: 'Your arms are spent. You cannot clash again yet.',
      get: ({ p }) => p.karokSpasm > 0 ? { dur: p.karokSpasm, max: 120 } : null },
    { id: 'grabbed', side: 'player', kind: 'debuff', icon: 'chain', name: 'Seized', desc: 'You are in his grip.',
      get: ({ p }) => p.state === 'grabbed' ? {} : null },
    // the get-up roll ([Space] while knocked down) recharging; shows only while it is on cooldown
    { id: 'wakeup', side: 'player', kind: 'debuff', icon: 'arrowDown', name: 'Get-Up Roll', desc: 'Recharging. While you are knocked down, [Space] rolls you back to your feet, but only when this is gone.',
      get: ({ p }) => (p.cds && p.cds.wakeup > 0 && p.maxCds && p.maxCds.wakeup > 0)
        ? { dur: p.cds.wakeup, max: Math.max(p.cds.wakeup, p.maxCds.wakeup * (1 - (p.wakeRecovery || 0))), img: `game/icons/skill_${p.classId || 'breaker'}_space.png` } : null },   // wears the class's own [Space] evade icon

    // ---- on the boss ----
    { id: 'fracture', side: 'boss', kind: 'debuff', icon: 'crack', name: 'Armor Fracture', desc: 'His armor is cracking. Stacks are spent by a heavy finisher.',
      get: ({ b }) => b.fractureStacks > 0 ? { stacks: b.fractureStacks } : null },
    { id: 'broken', side: 'boss', kind: 'debuff', icon: 'arrowDown', name: 'Broken', desc: 'He takes more damage from everyone for each stack.',
      get: ({ b }) => b.brokenStacks > 0 ? { stacks: b.brokenStacks } : null },
    { id: 'marks', side: 'boss', kind: 'debuff', icon: 'crack', name: 'Marked', desc: 'Your blades have marked him. Zenith Dive detonates every Mark for 20% more damage each.',
      get: ({ p }) => p.classId === 'arclight' && p.mode === 'saber' && (p.marks | 0) > 0 ? { stacks: p.marks | 0 } : null },
    { id: 'locks', side: 'boss', kind: 'debuff', icon: 'crack', name: 'Locked On', desc: 'Your cannon has locked on. Convergence Beam gets +10% per Lock and keeps them; Overcharge Beam gets +10% per Lock, a wider beam, and erases them.',
      get: ({ p }) => p.classId === 'arclight' && p.mode === 'beam' && (p.marks | 0) > 0 ? { stacks: p.marks | 0 } : null },
    { id: 'barrier', side: 'boss', kind: 'buff', icon: 'shield', name: 'Warded', desc: 'Most damage is reduced right now. Solve the mechanic.',
      get: ({ b }) => (b.state === 'eclipse_mechanic' && b.eclipsePhase === 'bait_swords') || b.state === 'horizon_mechanic' || b.state === 'final_phase_mechanic' || (b.state === 'iaido_mechanic' && b.iaidoPhase !== 'grab_stagger') || (typeof b.isWarded === 'function' && b.isWarded()) ? {} : null },
    // Ignis Vane
    { id: 'ig_tantrum', side: 'boss', kind: 'buff', icon: 'flame', name: 'Tantrum', desc: 'Her ego broke. She is faster and hits harder, but sloppy: she takes 30% more stagger.',
      get: ({ b }) => b.isIgnis && b.tantrumT > 0 ? { dur: b.tantrumT, max: 18, img: ignisIcon('tantrum') } : null },
    { id: 'ig_showoff', side: 'boss', kind: 'buff', icon: 'moon', name: 'Showing Off', desc: 'Her ego is sky high. Every so often she stops to show off: a free opening. Counters, rebukes, breaks and steady damage bring her down.',
      get: ({ b }) => b.isIgnis && b.tantrumT <= 0 && b.ego >= 85 ? { img: ignisIcon('showoff') } : null },
    { id: 'ig_burnt', side: 'boss', kind: 'debuff', icon: 'arrowDown', name: 'Burnt Out', desc: 'Her big finish failed. She is slower and hits softer.',
      get: ({ b }) => b.isIgnis && b.burntOut ? { img: ignisIcon('burnt') } : null },
    { id: 'ig_scorched', side: 'player', kind: 'debuff', icon: 'flame', name: 'Scorched', desc: 'You just caught a fireball. Catching another before this fades hurts a lot more: let someone else take the next one.',
      get: ({ p, b }) => p.ignisScorch > 0 ? { dur: p.ignisScorch, max: Math.max(p.ignisScorch, (b && b.mech && b.mech.scorch) || 6), img: ignisIcon('scorched') } : null },
    { id: 'ig_hearts', side: 'player', kind: 'debuff', icon: 'flame', name: 'Smitten', desc: 'Her kisses linger. It fades if she leaves you alone for a while.',
      get: ({ p }) => (p.igHearts | 0) > 0 && !(p.ignisCharm > 0) ? { stacks: p.igHearts | 0, dur: p.igHeartT || 0, max: 10, img: ignisIcon('heart') } : null },
    { id: 'ig_starstruck', side: 'player', kind: 'debuff', icon: 'flame', name: 'Starstruck', desc: 'You only have eyes for her.',
      get: ({ p }) => p.ignisCharm > 0 ? { dur: p.ignisCharm, max: 3.2, img: ignisIcon('starstruck') } : null },
    { id: 'awakened', side: 'boss', kind: 'buff', icon: 'moon', name: 'Awakened', desc: 'He fights faster and with less patience.',
      get: ({ b }) => b.awakened && !b.enraged ? {} : null },
    { id: 'empowered', side: 'boss', kind: 'buff', icon: 'flame', name: 'Empowered', desc: 'He has taken the sword\'s power: he hits 50% harder and fights faster.',
      get: ({ b }) => b.finalPhase && !(b.enraged && b.enrageTimer <= 0) ? {} : null },
    { id: 'berserk', side: 'boss', kind: 'buff', icon: 'skull', name: 'Berserk', desc: 'Time is up. He is faster and relentless.',
      get: ({ b }) => b.enraged && b.enrageTimer <= 0 ? {} : null },
    { id: 'careful', side: 'boss', kind: 'buff', icon: 'shield', name: 'Careful', desc: 'He has been caught off guard once and will not be again so soon.',
      get: ({ b }) => b.careful && b.careful.t > 0 && b.rebukeData
        ? { dur: b.careful.t, max: b.careful.stage === 'immune' ? b.rebukeData.immune : b.rebukeData.resist, img: carefulIcon(b.careful.stage) } : null }
  ];

  const rows = {};
  const live = { player: new Map(), boss: new Map() };

  function ensureRows() {
    for (const side of ['player', 'boss']) {
      if (rows[side] && rows[side].isConnected) continue;
      const el = document.createElement('div');
      el.className = `st-row st-${side} hidden`;
      document.body.appendChild(el);
      rows[side] = el;
      live[side].clear();
    }
  }

  function build(def, v) {
    const el = document.createElement('div');
    el.className = `st-ic ${def.kind}`;
    el.innerHTML = `<img src="${(v && v.img) || 'game/icons/status_' + def.id + '.png'}" alt="" draggable="false"><i class="st-fill"></i><b class="st-n"></b><em class="st-t"></em>`;
    el.dataset.id = def.id;
    el.dataset.side = def.side;
    return el;
  }

  function sync(side, list, ctx) {
    const row = rows[side], map = live[side];
    const seen = new Set();
    for (const def of DEFS) {
      if (def.side !== side) continue;
      let v = null;
      try { v = def.get(ctx); } catch (e) { v = null; }
      if (!v) continue;
      seen.add(def.id);
      let el = map.get(def.id);
      if (!el) { el = build(def, v); map.set(def.id, el); row.appendChild(el); }
      el._v = v;
      if (v.img) { const im = el.querySelector('img'); if (im.getAttribute('src') !== v.img) im.setAttribute('src', v.img); }   // a status can pick its art from the game state
      const n = el.querySelector('.st-n'), f = el.querySelector('.st-fill'), t = el.querySelector('.st-t');
      const stack = v.stacks > 1 ? String(v.stacks) : (v.text != null ? String(v.text) : '');
      if (n.textContent !== stack) n.textContent = stack;
      if (v.dur != null) {
        const pct = Math.max(0, Math.min(100, (v.dur / v.max) * 100)) + '%';
        if (f.style.height !== pct) f.style.height = pct;
        const sec = v.dur >= 60 ? Math.ceil(v.dur / 60) + 'm' : Math.ceil(v.dur) + 's';
        if (t.textContent !== sec) t.textContent = sec;
        el.classList.toggle('low', v.dur / v.max < 0.2);
      } else { if (f.style.height) f.style.height = '0'; if (t.textContent) t.textContent = ''; el.classList.remove('low'); }
    }
    for (const [id, el] of map) if (!seen.has(id)) { el.remove(); map.delete(id); }
    row.classList.toggle('hidden', map.size === 0);
  }

  // keep each row glued to the HUD piece it belongs to
  function place() {
    const hud = $('bottom-action-hud'), boss = $('boss-hud');
    const pr = rows.player, br = rows.boss;
    if (hud && pr && !pr.classList.contains('hidden')) {
      const r = hud.getBoundingClientRect();
      pr.style.left = Math.round(r.left) + 'px';
      pr.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px';
    }
    if (boss && br && !br.classList.contains('hidden') && !boss.classList.contains('hidden')) {
      const r = boss.getBoundingClientRect();
      br.style.left = Math.round(r.left + 2) + 'px';
      br.style.top = Math.round(r.bottom + 5) + 'px';
    }
  }

  const proto = Game25D.prototype;
  const origUpdate = proto.update;
  let acc = 0;
  proto.update = function (dt) {
    origUpdate.call(this, dt);
    acc -= dt;
    if (acc > 0) return;
    acc = 0.1;
    ensureRows();
    const body = document.body;
    const hidden = body.classList.contains('cs-open');
    const p = this.localPlayer, b = this.boss;
    if (hidden || !p) { rows.player.classList.add('hidden'); rows.boss.classList.add('hidden'); return; }
    followHints(p);
    sync('player', DEFS, { p, b, g: this });
    if (this.mode === 'raid' && b && b.hp > 0) sync('boss', DEFS, { p, b, g: this });
    else { rows.boss.classList.add('hidden'); live.boss.clear(); rows.boss.innerHTML = ''; }
    place();
  };

  // ---- instant tooltips (the browser's own title tooltip is slow and unreliable) ----------------------------------------
  let tip = null, tipFor = null;
  function showTip(el, x, y) {
    const def = DEFS.find(d => d.id === el.dataset.id);
    if (!def) return;
    if (!tip) { tip = document.createElement('div'); tip.id = 'st-tip'; document.body.appendChild(tip); }
    const v = el._v || {};
    const lines = [];
    if (v.stacks > 1) lines.push(`Stacks: ${v.stacks}`);
    if (v.text != null) lines.push(`Amount: ${v.text}`);
    if (v.dur != null) lines.push(`${v.dur >= 60 ? Math.ceil(v.dur / 60) + ' min' : v.dur.toFixed(1) + 's'} remaining`);
    // the boss lines are written for Vaelgor; Ignis gets them with her own pronouns
    const her = def.side === 'boss' && window.game && window.game.boss && window.game.boss.isIgnis;
    const desc = her ? def.desc.replace(/\bHis\b/g, 'Her').replace(/\bHe\b/g, 'She').replace(/\bhim\b/g, 'her').replace(/\bhis\b/g, 'her').replace(/\bhe\b/g, 'she') : def.desc;
    tip.innerHTML = `<div class="stt-head ${def.kind}"><b>${def.name}</b><i>${def.kind === 'buff' ? 'Buff' : 'Debuff'}</i></div><div class="stt-desc">${desc}</div>${lines.length ? `<div class="stt-meta">${lines.join(' · ')}</div>` : ''}`;
    tip.classList.add('show');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const side = el.dataset.side;
    // player buffs open upward (the skill bar is below them); boss buffs open downward
    let left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2));
    let top = side === 'boss' ? y + 22 : y - h - 14;
    tip.style.left = left + 'px'; tip.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, top)) + 'px';
    tipFor = el;
  }
  function hideTip() { if (tip) tip.classList.remove('show'); tipFor = null; }
  document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('.st-ic'); if (el) showTip(el, e.clientX, e.clientY); });
  document.addEventListener('mousemove', (e) => { const el = e.target.closest && e.target.closest('.st-ic'); if (el) showTip(el, e.clientX, e.clientY); else if (tipFor) hideTip(); });

  // ---- follow-up hints on the Gravebreaker's skill slots (Q chain and F bonks) ---------------------------------------------
  function followHints(p) {
    const set = (key, text) => {
      const slot = document.getElementById('slot-' + key);
      if (!slot) return;
      if (text) { if (slot.dataset.follow !== text) slot.dataset.follow = text; } else if (slot.dataset.follow) delete slot.dataset.follow;
    };
    const a = p && p.classId === 'hammer' ? p.act : null;
    if (a && a.kind === 'q' && a.step < 3) set('q', a.step === 1 ? 'Q again: backhand' : 'Q again: slam');
    else if (a && a.kind === 'q' && a.step === 3) set('q', 'Slam!');
    else set('q', '');
    if (a && a.kind === 'f' && !a.ending && a.k < a.max) set('f', (a.bt >= 0.36 && a.bt <= 0.78) ? `F now: perfect  ${a.k}/${a.max}` : `F again  ${a.k}/${a.max}`);
    else set('f', '');
  }

  window.StatusIcons = { DEFS, followHints };
})();

// =========================================================================
// BOSS_CERVANTH_STAGE.JS: the Hollow Glade, floor telegraphs, mechanic props, things in the air and screen overlays.
//   drawArena(ctx, game)   the glade: ash ground, dead trees at the rim, mist                         [arena_env.js]
//   drawFloor(ctx)         telegraphs, cracks, pools, tower rings                                      [main.js, under everyone]
//   extraRenderables()     y-sorted props: ghost stags, bone towers, bone spikes                       [main.js]
//   drawTop(ctx)           arcs, thrusts, rings, flying antlers, dust, the wall crash                  [main.js, over everyone]
//   drawScreen(ctx, W, H)  the heart readout (wordless), the final-phase vignette                      [screen space]
// Look: pale ash and dead wood under a cold teal-black sky; bone for everything of his; one hot crimson for what hurts.
// Telegraphs are crimson with a bone rim so they read on the ash.
// =========================================================================
(function () {
  if (typeof CervanthBoss === 'undefined') return;
  const P = CervanthBoss.prototype;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const now = () => performance.now() / 1000;
  const party = () => (window.game && window.game.party) || [];
  const localP = () => (window.game && window.game.localPlayer) || party()[0];
  const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // =========================================================================================================================
  // THE HOLLOW GLADE
  // =========================================================================================================================
  let floorCache = null;
  function gladeFloor(R) {
    if (floorCache && floorCache.R === R) return floorCache;
    const D = Math.ceil(R * 2 + 40), c = document.createElement('canvas');
    c.width = c.height = D;
    const g = c.getContext('2d');
    g.translate(D / 2, D / 2);
    g.save();
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    const base = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
    base.addColorStop(0, '#2a2530'); base.addColorStop(0.7, '#1e1a25'); base.addColorStop(1, '#100d15');
    g.fillStyle = base; g.fillRect(-R, -R, R * 2, R * 2);
    // ash drifts and moss
    for (let i = 0; i < 70; i++) {
      const a = hash(i) * TAU, r = Math.sqrt(hash(i + 50)) * R * 0.95, w = 40 + hash(i + 9) * 110;
      g.fillStyle = hash(i + 4) < 0.35 ? 'rgba(52,78,70,0.16)' : 'rgba(210,200,214,0.05)';
      g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, w, w * 0.6, hash(i + 2) * 3, 0, TAU); g.fill();
    }
    // old bones in the ash
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const a = hash(i + 200) * TAU, r = Math.sqrt(hash(i + 300)) * R * 0.97, x = Math.cos(a) * r, y = Math.sin(a) * r, l = 8 + hash(i + 7) * 20, ang = hash(i + 11) * TAU;
      g.strokeStyle = `rgba(214,207,196,${0.16 + hash(i + 5) * 0.22})`; g.lineWidth = 1.5 + hash(i + 13) * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); g.stroke();
    }
    // a faint ring of standing stones' shadows, and the ritual circle
    g.strokeStyle = 'rgba(225,29,72,0.10)'; g.lineWidth = 3; g.setLineDash([22, 16]);
    g.beginPath(); g.arc(0, 0, R * 0.78, 0, TAU); g.stroke(); g.setLineDash([]);
    g.strokeStyle = 'rgba(214,207,196,0.06)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R * 0.38, 0, TAU); g.stroke();
    const vg = g.createRadialGradient(0, 0, R * 0.6, 0, 0, R);
    vg.addColorStop(0, 'rgba(6,5,10,0)'); vg.addColorStop(1, 'rgba(6,5,10,0.8)');
    g.fillStyle = vg; g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    floorCache = { R, c, D };
    return floorCache;
  }
  function deadTree(ctx, x, y, h, seed, col) {
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    const branch = (bx, by, len, ang, w, depth) => {
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      if (depth <= 0) return;
      const n = 2 + (hash(seed + depth * 7 + len) < 0.35 ? 1 : 0);
      for (let i = 0; i < n; i++) branch(ex, ey, len * (0.62 + hash(seed + i + depth) * 0.14), ang + (i - (n - 1) / 2) * (0.55 + hash(seed + i * 3) * 0.3) + (hash(seed + depth) - 0.5) * 0.3, w * 0.66, depth - 1);
    };
    branch(x, y, h * 0.5, -Math.PI / 2 + (hash(seed) - 0.5) * 0.2, Math.max(3, h * 0.06), 4);
  }
  P.drawArena = function (ctx, game) {
    const R = game.arenaRadius, tilt = T(), t = now();
    const fin = this.finalPhaseOn;
    ctx.save();
    ctx.fillStyle = '#05050a'; ctx.fillRect(-8000, -8000, 16000, 16000);
    // a cold, starless sky glowing faintly where the trees thin out
    const by = -R * tilt - 10;
    const sky = ctx.createLinearGradient(0, by - 700, 0, by + 30);
    sky.addColorStop(0, '#05060c'); sky.addColorStop(0.7, fin ? '#2a0a14' : '#0e1a1d'); sky.addColorStop(1, fin ? '#40101c' : '#16282a');
    ctx.fillStyle = sky; ctx.fillRect(-R * 2.4, by - 700, R * 4.8, 740);
    // dead trees ringing the clearing (back and sides only, so none stand in front of the fight)
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 16; i++) {
        const seed = layer * 40 + i, a = Math.PI + 0.12 + hash(seed) * (Math.PI - 0.24) + (layer ? 0.1 : 0);
        const dist = R * (1.08 + layer * 0.16 + hash(seed + 3) * 0.12), x = Math.cos(a) * dist, y = Math.sin(a) * dist * tilt;
        const h = 190 + hash(seed + 5) * 230 + layer * 40;
        deadTree(ctx, x, y, h, seed, layer === 0 ? '#0a090e' : (layer === 1 ? '#0c1012' : '#111a1c'));
        if (layer === 0 && hash(seed + 8) < 0.2) { ctx.fillStyle = 'rgba(214,207,196,0.12)'; ctx.fillRect(x - 2, y - h * 0.5, 4, h * 0.5); }
      }
    }
    // the floor
    const F = gladeFloor(R);
    ctx.drawImage(F.c, -F.D / 2, -F.D / 2 * tilt, F.D, F.D * tilt);
    // mist crawling over the ground
    ctx.save(); ctx.translate(0, 0); ctx.scale(1, tilt);
    for (let i = 0; i < 6; i++) {
      const a = t * 0.05 + i * TAU / 6, r = R * (0.55 + 0.25 * Math.sin(t * 0.2 + i)), x = Math.cos(a) * r, y = Math.sin(a) * r;
      const g = ctx.createRadialGradient(x, y, 10, x, y, 190);
      g.addColorStop(0, fin ? 'rgba(120,30,50,0.10)' : 'rgba(150,185,185,0.07)'); g.addColorStop(1, 'rgba(150,185,185,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 190, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = fin ? 'rgba(225,29,72,0.35)' : 'rgba(150,185,185,0.14)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.restore();
  };

  // =========================================================================================================================
  // FLOOR: telegraphs, cracks, pools, tower rings
  // =========================================================================================================================
  P.drawTele = function (ctx, te) {
    const k = c01(1 - te.life / te.max);
    const fade = te.life < 0 ? Math.max(0, 1 + te.life / 0.18) : 1;
    const tilt = T();
    ctx.save(); ctx.translate(te.x, te.y); ctx.scale(1, tilt);
    ctx.globalAlpha *= fade;
    const edge = 'rgba(240,226,200,0.95)', fill = `rgba(225,29,72,${0.12 + 0.08 * k})`, core = `rgba(225,29,72,${0.22 + 0.28 * k})`;
    if (te.k === 'circle' || te.k === 'tine') {
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, te.r, 0, TAU); ctx.fill();
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, te.r * k, 0, TAU); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.arc(0, 0, te.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (te.k === 'tine') {   // a bone shadow growing under the target
        ctx.fillStyle = `rgba(226,214,198,${0.2 + 0.5 * k})`;
        ctx.beginPath(); ctx.moveTo(0, -te.r * 0.9 * k); ctx.lineTo(te.r * 0.22, te.r * 0.1); ctx.lineTo(-te.r * 0.22, te.r * 0.1); ctx.closePath(); ctx.fill();
      }
    } else if (te.k === 'sector') {
      const full = te.half >= Math.PI - 1e-3;
      const a0 = te.a - te.half, a1 = te.a + te.half;
      const path = (r1) => { ctx.beginPath(); if (full) { ctx.arc(0, 0, r1, 0, TAU); if (te.r0 > 0) { ctx.moveTo(te.r0, 0); ctx.arc(0, 0, te.r0, 0, TAU, true); } } else { ctx.arc(0, 0, r1, a0, a1); ctx.arc(0, 0, te.r0, a1, a0, true); ctx.closePath(); } };
      path(te.r1); ctx.fillStyle = fill; ctx.fill('evenodd');
      path(te.r0 + (te.r1 - te.r0) * k); ctx.fillStyle = core; ctx.fill('evenodd');
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); path(te.r1); ctx.stroke(); ctx.setLineDash([]);
    } else if (te.k === 'corridor') {
      ctx.rotate(te.a);
      const x0 = -18;
      ctx.fillStyle = fill; ctx.fillRect(x0, -te.w, te.len - x0, te.w * 2);
      ctx.fillStyle = core; ctx.fillRect(x0, -te.w, (te.len - x0) * k, te.w * 2);
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); ctx.strokeRect(x0, -te.w, te.len - x0, te.w * 2); ctx.setLineDash([]);
    } else if (te.k === 'prints') {
      // the Herd: pale hoofprints appear along the lane, nearest the ghost first, and the lane tints as it nears
      const dx = te.x1 - te.x, dy = (te.y1 - te.y) / tilt, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      ctx.rotate(ang);
      ctx.fillStyle = `rgba(225,29,72,${0.04 + 0.1 * k})`; ctx.fillRect(0, -te.w, len, te.w * 2);
      const n = Math.floor(len / 46);
      for (let i = 0; i < n; i++) {
        const s = i / n; if (s > k * 1.15) break;
        const x = 20 + i * 46, o = (i % 2 ? 1 : -1) * te.w * 0.36;
        ctx.fillStyle = `rgba(226,214,198,${0.35 + 0.5 * k})`;
        for (const dy2 of [-6, 6]) { ctx.beginPath(); ctx.ellipse(x, o + dy2, 8, 4, 0, 0, TAU); ctx.fill(); }
      }
      ctx.strokeStyle = `rgba(240,226,200,${0.25 + 0.4 * k})`; ctx.lineWidth = 2; ctx.strokeRect(0, -te.w, len, te.w * 2);
    }
    ctx.restore();
  };

  P.drawFloor = function (ctx) {
    if (this.hp <= 0) return;
    const t = now(), tilt = T(), m = this.mech;
    // cracks from his charges and stomps: jagged, they stay
    for (const c of this.cracks) {
      const fade = 1 - c01((c.t - 60) / 30);
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, tilt); ctx.rotate(c.a); ctx.globalAlpha *= fade * c01(c.t * 4);
      ctx.strokeStyle = 'rgba(2,1,6,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0);
      let x = 0, y = 0; for (let i = 1; i <= 8; i++) { x = c.len * i / 8; y = (hash(c.seed + i) - 0.5) * 26; ctx.lineTo(x, y); } ctx.stroke();
      ctx.strokeStyle = `rgba(225,29,72,${0.25 + 0.2 * Math.sin(t * 2 + c.seed)})`; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
    // Marrow pools, Echo and other lingering ground things
    for (const h of this.hazards) {
      if (h.t < (h.delay || 0)) continue;
      const fade = Math.min(1, h.t * 4) * Math.min(1, (h.dur - h.t) * 1.5);
      ctx.save(); ctx.translate(h.x, h.y); ctx.scale(1, tilt); ctx.globalAlpha *= fade;
      if (h.k === 'circle') {
        ctx.fillStyle = 'rgba(70,10,26,0.8)'; ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(225,29,72,0.8)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'rgba(253,164,175,0.5)';
        for (let i = 0; i < 5; i++) { const a = i * 1.3 + t * 0.7, r = h.r * (0.3 + 0.4 * hash(i)); ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r * 0.9, 3, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
    // Cage of Tines: each tower's ring on the floor fills as it ripens; bone-white once someone is inside
    if (m && m.kind === 'cage' && m.phase !== 'intro') {
      const el = m.t - m.t0;
      for (const tw of m.towers) {
        const k = tw.done ? 1 : c01((el - (tw.ripen - tw.fuse)) / tw.fuse);
        ctx.save(); ctx.translate(tw.x, tw.y); ctx.scale(1, tilt);
        ctx.globalAlpha *= tw.done ? 0.4 : 1;
        ctx.fillStyle = tw.inside ? 'rgba(240,226,200,0.18)' : 'rgba(225,29,72,0.14)'; ctx.beginPath(); ctx.arc(0, 0, tw.r, 0, TAU); ctx.fill();
        ctx.fillStyle = tw.inside ? `rgba(240,226,200,${0.25 + 0.3 * k})` : `rgba(225,29,72,${0.2 + 0.35 * k})`; ctx.beginPath(); ctx.arc(0, 0, tw.r * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = tw.inside ? '#f0e2c8' : 'rgba(253,164,175,0.95)'; ctx.lineWidth = 3 + 2 * k;
        ctx.beginPath(); ctx.arc(0, 0, tw.r, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
    for (const te of this.teles) this.drawTele(ctx, te);
    // the Hollow Herd's rim: hoofprints glow along the arena edge as the horn blows
    if (m && m.kind === 'herd' && m.phase === 'intro') {
      const R = this.arenaR();
      ctx.save(); ctx.scale(1, tilt); ctx.strokeStyle = `rgba(253,164,175,${0.5 * c01(m.t / m.introDur)})`; ctx.lineWidth = 6; ctx.setLineDash([26, 22]);
      ctx.beginPath(); ctx.arc(0, 0, R - 10, 0, TAU); ctx.stroke(); ctx.restore();
    }
  };

  // =========================================================================================================================
  // PROPS (y-sorted with the party): ghost stags, bone towers, bone spikes
  // =========================================================================================================================
  P.drawGhostStag = function (ctx, g) {
    if (g.px == null) return;
    const tilt = T(), k = c01((g.t - g.delay) / g.run), a = g.a != null ? g.a : Math.atan2((g.y1 - g.y0) / tilt, g.x1 - g.x0);
    const dir = Math.cos(a) >= 0 ? 1 : -1, t = now();
    const fadeIn = c01((g.t - g.delay) / 0.12), fadeOut = 1 - c01((g.t - g.delay - g.run) / 0.4);
    const al = 0.62 * fadeIn * fadeOut;
    if (al <= 0.02) return;
    ctx.save(); ctx.translate(g.px, g.py); ctx.globalAlpha *= al;
    const sc = 1.15;
    // ground mist trail
    ctx.fillStyle = 'rgba(190,220,225,0.2)';
    for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.ellipse(-dir * i * 26, 4, 26 + i * 4, 9, 0, 0, TAU); ctx.fill(); }
    ctx.scale(dir * sc, sc);
    const col = g.echo ? '#e8f3f2' : '#cfe3e6', run = t * 18;
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // legs
    ctx.lineWidth = 6;
    for (const [lx, ph] of [[-26, 0], [-14, Math.PI], [20, Math.PI * 0.5], [32, Math.PI * 1.5]]) {
      const sw = Math.sin(run + ph) * 20, lift = Math.max(0, Math.cos(run + ph)) * 10;
      ctx.beginPath(); ctx.moveTo(lx, -34); ctx.lineTo(lx + sw * 0.6, -16 - lift * 0.4); ctx.lineTo(lx + sw, -2 - lift); ctx.stroke();
    }
    // body, neck, head
    ctx.beginPath(); ctx.ellipse(0, -46, 42, 17, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(30, -52); ctx.lineTo(54, -76); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(50, -80); ctx.lineTo(80, -72); ctx.lineTo(54, -66); ctx.closePath(); ctx.fill();
    // antlers
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(54, -84); ctx.quadraticCurveTo(48, -118, 22, -128); ctx.moveTo(48, -108); ctx.lineTo(60, -122); ctx.moveTo(38, -120); ctx.lineTo(30, -140); ctx.moveTo(54, -84); ctx.quadraticCurveTo(66, -116, 52, -138); ctx.stroke();
    ctx.fillStyle = '#e11d48'; ctx.beginPath(); ctx.arc(62, -76, 2.4, 0, TAU); ctx.fill();
    ctx.restore();
  };
  P.drawTower = function (ctx, tw, m) {
    const g = tw.grow, tilt = T();
    if (g <= 0.02) return;
    const h = 150 * g, sway = Math.sin(now() * 1.3 + tw.i) * 1.5;
    ctx.save(); ctx.translate(tw.x, tw.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 4, 30, 30 * tilt, 0, 0, TAU); ctx.fill();
    const col = tw.done ? (tw.ok ? '#b8aea0' : '#7a2a3a') : '#d6cfc4';
    // a spire of stacked bone with outward-leaning tines
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = col; ctx.strokeStyle = '#2a1e22'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-10 + sway, -h * 0.55); ctx.lineTo(sway, -h); ctx.lineTo(10 + sway, -h * 0.55); ctx.lineTo(22, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const s of [-1, 1]) for (let i = 1; i <= 3; i++) {
      const y = -h * i / 4.2; ctx.beginPath(); ctx.moveTo(s * 8, y); ctx.lineTo(s * (26 + i * 6), y - 18 * g); ctx.lineTo(s * 12, y - 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // ripe: the crimson comes up through it
    const el = m.t - m.t0, k = tw.done ? 1 : c01((el - (tw.ripen - tw.fuse)) / tw.fuse);
    if (k > 0.02) { ctx.fillStyle = `rgba(225,29,72,${0.25 + 0.5 * k})`; ctx.beginPath(); ctx.moveTo(-10 + sway, -h * 0.5 * k); ctx.lineTo(sway, -h * k); ctx.lineTo(10 + sway, -h * 0.5 * k); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  };
  P.extraRenderables = function () {
    const out = [];
    const m = this.mech;
    for (const g of this.ghosts) if (g.t >= g.delay - 0.02 && g.px != null) out.push({ y: g.py, draw: (ctx) => this.drawGhostStag(ctx, g) });
    if (m && m.kind === 'cage' && m.phase !== 'intro') for (const tw of m.towers) out.push({ y: tw.y, draw: (ctx) => this.drawTower(ctx, tw, m) });
    for (const v of this.vfx) {
      if (v.k === 'spike') {
        const k = c01(v.t / 0.12), fade = 1 - c01((v.t - v.life + 0.5) / 0.5);
        out.push({ y: v.y, draw: (ctx) => {
          ctx.save(); ctx.translate(v.x, v.y); ctx.globalAlpha *= fade;
          ctx.fillStyle = '#d6cfc4'; ctx.strokeStyle = '#2a1e22'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(-3, -62 * k); ctx.lineTo(9, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        } });
      }
    }
    return out;
  };

  // =========================================================================================================================
  // TOP: things in the air over everyone
  // =========================================================================================================================
  P.drawTop = function (ctx) {
    if (this.hp <= 0) return;
    const t = now(), tilt = T();
    ctx.save();
    ctx.lineCap = 'round';
    for (const v of this.vfx) {
      const k = c01(v.t / (v.life || 1));
      if (v.k === 'arc') {
        ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, tilt);
        ctx.strokeStyle = `rgba(240,226,200,${0.9 * (1 - k)})`; ctx.lineWidth = 16 * (1 - k) + 3;
        ctx.beginPath(); ctx.arc(0, 0, v.r * (0.7 + 0.3 * k), v.a0, v.a1); ctx.stroke();
        ctx.restore();
      } else if (v.k === 'thrust' || v.k === 'lockCharge') {
        ctx.save(); ctx.translate(v.x != null ? v.x : this.x, v.y != null ? v.y : this.y); ctx.scale(1, tilt); ctx.rotate(v.a);
        ctx.fillStyle = `rgba(240,226,200,${0.5 * (1 - k)})`; ctx.fillRect(0, -10, v.len * Math.min(1, k * 4), 20);
        ctx.restore();
      } else if (v.k === 'spin') {
        ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, tilt);
        ctx.strokeStyle = `rgba(225,29,72,${0.8 * (1 - k)})`; ctx.lineWidth = 12 * (1 - k) + 2;
        ctx.beginPath(); ctx.arc(0, 0, v.r * (0.6 + 0.4 * k), 0, TAU); ctx.stroke(); ctx.restore();
      } else if (v.k === 'ring' || v.k === 'howlRing') {
        const r = v.k === 'howlRing' ? 560 * k : (v.r || 100) * (0.4 + 0.6 * k);
        ctx.save(); ctx.translate(v.x != null ? v.x : this.x, v.y != null ? v.y : this.y); ctx.scale(1, tilt);
        ctx.strokeStyle = v.k === 'howlRing' ? `rgba(253,164,175,${0.8 * (1 - k)})` : (v.col || '#fda4af'); ctx.globalAlpha *= (1 - k);
        ctx.lineWidth = v.k === 'howlRing' ? 20 * (1 - k) + 3 : 5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); ctx.restore();
      } else if (v.k === 'suck') {
        // dust and bone chips are pulled into his open mouth
        for (let i = 0; i < 18; i++) {
          const a = i * TAU / 18 + hash(i) * 0.4, rr = 360 * (1 - ((k * 1.2 + hash(i + 3)) % 1));
          const x = this.x + Math.cos(a) * rr, y = this.y + Math.sin(a) * rr * tilt - 60 * (1 - rr / 360);
          ctx.fillStyle = `rgba(214,207,196,${0.5 * (1 - rr / 360)})`; ctx.fillRect(x, y, 3, 3);
        }
      } else if (v.k === 'boneDust') {
        for (let i = 0; i < 10; i++) { const a = hash(i) * TAU, rr = 20 + 60 * k * hash(i + 2), x = this.x + Math.cos(a) * rr, y = this.y - 110 - 30 * k + Math.sin(a) * rr * 0.3; ctx.fillStyle = `rgba(214,207,196,${0.6 * (1 - k)})`; ctx.fillRect(x, y, 3, 3); }
      } else if (v.k === 'antlerFly') {
        const z = v.z + 140 * Math.sin(k * Math.PI) * 0.8 - 160 * k * k, x = v.x + v.side * 90 * k, y = v.y - 30 * k;
        ctx.save(); ctx.translate(x, y - z); ctx.rotate(k * 7 * v.side); ctx.globalAlpha *= 1 - c01((k - 0.7) / 0.3);
        ctx.strokeStyle = '#d6cfc4'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(24, -30, 56, -34); ctx.moveTo(18, -22); ctx.lineTo(24, -52); ctx.moveTo(38, -32); ctx.lineTo(50, -58); ctx.stroke();
        ctx.restore();
      } else if (v.k === 'wallCrash') {
        for (let i = 0; i < 14; i++) { const a = v.a + Math.PI + (hash(i) - 0.5) * 2.2, rr = 30 + 160 * k * hash(i + 4); ctx.fillStyle = `rgba(214,207,196,${0.8 * (1 - k)})`; ctx.fillRect(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr * tilt - 30 * k, 4, 4); }
      } else if (v.k === 'towerBurst') {
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt);
        ctx.strokeStyle = v.ok ? `rgba(240,226,200,${1 - k})` : `rgba(225,29,72,${1 - k})`; ctx.lineWidth = 14 * (1 - k) + 2;
        ctx.beginPath(); ctx.arc(0, 0, 84 + 160 * k, 0, TAU); ctx.stroke(); ctx.restore();
      } else if (v.k === 'heartHit') {
        ctx.fillStyle = `rgba(255,241,242,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(this.x + 10 * (this.modelScale || 1), this.y - 125 * (this.modelScale || 1), 40 + 20 * k, 0, TAU); ctx.fill();
      }
    }
    // Marrow Spit: bone shards flying in an arc, each with a shadow on the ground where it will land
    for (const pr of this.proj) {
      if (pr.k !== 'shard' || pr.done || pr.cx == null) continue;
      const nx = pr.tx - pr.x, ny = (pr.ty - pr.y) / tilt, ang = Math.atan2(ny, nx);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(pr.cx, pr.cy, 9, 4, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(pr.cx, pr.cy - pr.z - 14); ctx.rotate(ang + (pr.t * 14));
      ctx.fillStyle = '#d6cfc4'; ctx.strokeStyle = '#2a1e22'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -5); ctx.lineTo(-4, 0); ctx.lineTo(-8, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e11d48'; ctx.beginPath(); ctx.arc(-6, 0, 2.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  // =========================================================================================================================
  // SCREEN: the heart readout (no words) and the final-phase vignette
  // =========================================================================================================================
  P.drawScreen = function (ctx, W, H) {
    if (this.hp <= 0) return;
    const t = now(), m = this.mech;
    ctx.save();
    if (this.finalPhaseOn) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(60,4,16,0)'); vg.addColorStop(1, `rgba(60,4,16,${0.28 + 0.06 * Math.sin(t * 3)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    // HEART EXPOSED: a heart that fills from the bottom with how much has been dealt; a ring around it drains with the time left
    if (m && m.kind === 'heart' && m.phase !== 'intro') {
      const cx = W / 2, cy = 120, r = 30, fill = c01(m.dealt / m.need), left = m.phase === 'open' ? 1 - c01((m.t - m.t0) / m.dur) : 0;
      ctx.fillStyle = 'rgba(10,6,12,0.65)'; ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.8);
      ctx.bezierCurveTo(cx - r * 1.3, cy + r * 0.1, cx - r * 0.9, cy - r * 0.9, cx, cy - r * 0.3);
      ctx.bezierCurveTo(cx + r * 0.9, cy - r * 0.9, cx + r * 1.3, cy + r * 0.1, cx, cy + r * 0.8);
      ctx.closePath(); ctx.fillStyle = '#2a0a14'; ctx.fill(); ctx.clip();
      ctx.fillStyle = '#e11d48'; ctx.fillRect(cx - r * 1.4, cy + r * 0.8 - (r * 1.1) * fill, r * 2.8, r * 1.2);
      ctx.restore();
      ctx.strokeStyle = left < 0.3 ? `rgba(253,164,175,${0.6 + 0.4 * Math.sin(t * 14)})` : 'rgba(240,226,200,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke();
    }
    ctx.restore();
  };

  // Karok: the antler lock's lane. Bone-white tines rise along both edges toward the end of the lane as he charges.
  P.drawKarokLaneTell = function (ctx, p, charge, time) {
    const lane = this.karokLane || { len: 380, half: 72 };
    const N = 10, grown = c01(p / 0.62) * N, strobe = charge > 0.85, tilt = T();
    ctx.save();
    ctx.translate(this.x, this.y); ctx.scale(1, tilt); ctx.rotate(this.facingAngle);
    ctx.fillStyle = `rgba(225,29,72,${0.08 + 0.1 * c01(p / 0.62)})`; ctx.fillRect(30, -lane.half, lane.len - 30, lane.half * 2);
    for (let i = 0; i < N; i++) {
      const on = c01(grown - i); if (on <= 0) break;
      const x = 50 + (lane.len - 50) * i / (N - 1);
      for (const sg of [-1, 1]) {
        ctx.fillStyle = strobe ? `rgba(255,255,255,${0.6 + 0.4 * Math.sin(time * 30)})` : `rgba(226,214,198,${on})`;
        ctx.beginPath(); ctx.moveTo(x - 7, sg * lane.half); ctx.lineTo(x, sg * (lane.half + 26 * on)); ctx.lineTo(x + 7, sg * lane.half); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  };
})();

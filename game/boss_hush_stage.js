// =========================================================================
// BOSS_HUSH_STAGE.JS — Hush's nursery: the room, the floor telegraphs, mechanic props, things in the air and screen overlays.
//   drawArena(ctx, game)   the nursery (wallpapered wall, moon window, star mobile, floorboards, the round rug)  [arena_env.js]
//   drawFloor(ctx)         telegraphs, lingering thread, ground effects, the dollhouse room                      [main.js, under everyone]
//   extraRenderables()     y-sorted props: her rocking chair, toy soldiers, shadow toys, blocks, the nightlight, old toys
//   drawTop(ctx)           her strings, pins, falling blocks, slashes, the dark                                    [main.js, over everyone]
//   drawScreen(ctx, W, H)  eyelids (how sleepy you are), Lights Out, the moon                                      [screen space]
// Look: a cold blue night with one warm lamp; Delft blue and cream; gold for anything of hers that is breaking. Telegraphs are
// rose with a gold rim so they read on the blue rug.
// =========================================================================
(function () {
  if (typeof HushBoss === 'undefined') return;
  const P = HushBoss.prototype;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const now = () => performance.now() / 1000;
  const party = () => (window.game && window.game.party) || [];
  const localP = () => (window.game && window.game.localPlayer) || party()[0];
  const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const CHAIR = HushBoss.CHAIR, ROOM_R = HushBoss.ROOM_R, STAGE = HushBoss.STAGE;
  const INK = 'rgba(20,24,46,0.92)';

  // =========================================================================================================================
  // THE NURSERY
  // =========================================================================================================================
  let floorCache = null;
  function nurseryFloor(R) {
    if (floorCache && floorCache.R === R) return floorCache;
    const D = Math.ceil(R * 2 + 40), c = document.createElement('canvas');
    c.width = c.height = D;
    const g = c.getContext('2d');
    g.translate(D / 2, D / 2);
    // floorboards (unflattened: the arena draw squashes it by the tilt)
    g.save();
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    g.fillStyle = '#2b2236'; g.fillRect(-R, -R, R * 2, R * 2);
    const plank = 46;
    for (let row = -R; row < R; row += plank) {
      const ri = Math.round(row / plank);
      let x = -R - hash(ri) * 220;
      while (x < R) {
        const w = 180 + hash(ri * 7 + x) * 220;
        const tone = 0.85 + hash(ri * 3.1 + x * 0.7) * 0.3;
        g.fillStyle = `rgb(${Math.round(70 * tone)},${Math.round(54 * tone)},${Math.round(78 * tone)})`;
        g.fillRect(x + 1, row + 1, w - 2, plank - 2);
        g.strokeStyle = 'rgba(255,230,200,0.05)'; g.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const yy = row + 8 + k * 12 + hash(x + k) * 6; g.beginPath(); g.moveTo(x + 6, yy); g.bezierCurveTo(x + w * 0.3, yy - 3, x + w * 0.6, yy + 3, x + w - 6, yy); g.stroke(); }
        g.fillStyle = 'rgba(10,6,16,0.6)'; g.fillRect(x + w - 3, row + plank / 2 - 1.5, 2, 3);
        x += w;
      }
    }
    // the edge falls away into the dark
    const vg = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
    vg.addColorStop(0, 'rgba(8,8,22,0)'); vg.addColorStop(1, 'rgba(8,8,22,0.82)');
    g.fillStyle = vg; g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    // the rug: scalloped outer band, a cream ring of stars, a deep blue field with a crescent moon
    const rr = R * 0.74;
    g.save();
    g.beginPath();
    for (let i = 0; i <= 96; i++) { const a = i / 96 * TAU, r = rr + Math.sin(a * 32) * 6; if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fillStyle = '#1f3570'; g.fill();
    g.strokeStyle = 'rgba(10,14,40,0.8)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#e9e1c8'; g.beginPath(); g.arc(0, 0, rr - 22, 0, TAU); g.fill();
    g.fillStyle = '#2a4a8f'; g.beginPath(); g.arc(0, 0, rr - 58, 0, TAU); g.fill();
    // little blue stars on the cream band
    g.fillStyle = '#3b5fb0';
    for (let i = 0; i < 36; i++) { const a = i / 36 * TAU, r = rr - 40; star(g, Math.cos(a) * r, Math.sin(a) * r, 7, 3, a); }
    // the field: soft woven texture, a ring of dots, scattered stars, the moon
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 2;
    for (let r = 20; r < rr - 58; r += 9) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
    g.fillStyle = '#e9e1c8';
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; g.beginPath(); g.arc(Math.cos(a) * (rr - 74), Math.sin(a) * (rr - 74), 3, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(253,230,138,0.85)';
    for (let i = 0; i < 26; i++) { const a = hash(i) * TAU, r = 90 + hash(i + 50) * (rr - 190); star(g, Math.cos(a) * r, Math.sin(a) * r, 5 + hash(i + 9) * 5, 2, a); }
    g.fillStyle = '#f5e7b0';
    g.beginPath(); g.arc(0, 0, 74, 0, TAU); g.fill();
    g.fillStyle = '#2a4a8f'; g.beginPath(); g.arc(28, -16, 66, 0, TAU); g.fill();
    g.restore();
    floorCache = { c, R, D };
    return floorCache;
  }
  function star(g, x, y, r1, r2, rot = 0) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? r2 : r1; if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.closePath(); g.fill();
  }

  P.drawArena = function (ctx, game) {
    const R = game.arenaRadius, tilt = T(), t = now();
    const a2 = !!this.act2, late = this.phase >= 3, fin = !!(this.mech && this.mech.kind === 'finale') || this.mech10;
    ctx.save();
    ctx.fillStyle = '#05060f'; ctx.fillRect(-8000, -8000, 16000, 16000);
    // ---- the far wall ----
    const by = -R * tilt - 18, ww = R * 1.55, wh = 560;
    const wall = ctx.createLinearGradient(0, by - wh, 0, by);
    wall.addColorStop(0, '#0b1230'); wall.addColorStop(1, a2 ? '#1c2148' : '#16204a');
    ctx.fillStyle = wall; ctx.fillRect(-ww, by - wh, ww * 2, wh + 20);
    // wallpaper: pale stripes and a repeating little moon / star print
    ctx.fillStyle = 'rgba(160,180,255,0.05)';
    for (let x = -ww; x < ww; x += 64) ctx.fillRect(x, by - wh, 22, wh);
    ctx.fillStyle = 'rgba(200,215,255,0.12)';
    for (let r = 0; r < 9; r++) for (let x = -ww + (r % 2) * 32; x < ww; x += 64) {
      const y = by - wh + 30 + r * 58;
      if (r % 3 === 1) { ctx.beginPath(); ctx.arc(x + 11, y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#0f1738'; ctx.beginPath(); ctx.arc(x + 14, y - 2, 5, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(200,215,255,0.12)'; }
      else star(ctx, x + 11, y, 5, 2);
    }
    // from the Wind-Up on, the wallpaper is torn in long strips and gold shows through the cracks in the plaster
    if (a2) {
      for (let i = 0; i < 9; i++) {
        const x = -ww + (i + 0.5) * (ww * 2 / 9) + (hash(i) - 0.5) * 80, top = by - wh + 60 + hash(i + 3) * 160, len = 90 + hash(i + 7) * 160;
        ctx.fillStyle = '#0a0f26'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + 22, top + 6); ctx.lineTo(x + 16, top + len); ctx.lineTo(x + 4, top + len - 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(214,224,255,0.16)'; ctx.beginPath(); ctx.moveTo(x + 22, top + 6); ctx.quadraticCurveTo(x + 40, top + len * 0.4, x + 30, top + len * 0.7); ctx.lineTo(x + 18, top + len * 0.5); ctx.closePath(); ctx.fill();
      }
    }
    if (late) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        let x = -ww * 0.9 + hash(i * 11) * ww * 1.8, y = by - 30;
        ctx.strokeStyle = `rgba(245,197,66,${0.35 + 0.2 * Math.sin(t * 2 + i)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 7; k++) { x += (hash(i * 13 + k) - 0.5) * 60; y -= 30 + hash(i + k * 5) * 40; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    // the arched window with the moon (in the Last Verse the moon is her verse: it fills with gold as the verse runs out)
    const wx = 0, wy = by - wh + 120, wwd = 150, wht = 230;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(wx - wwd / 2, wy + wht); ctx.lineTo(wx - wwd / 2, wy + wwd / 2); ctx.arc(wx, wy + wwd / 2, wwd / 2, Math.PI, 0); ctx.lineTo(wx + wwd / 2, wy + wht); ctx.closePath();
    const sky = ctx.createLinearGradient(0, wy, 0, wy + wht);
    sky.addColorStop(0, '#1b2a66'); sky.addColorStop(1, '#0a1233');
    ctx.fillStyle = sky; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 18; i++) { const x = wx - wwd / 2 + hash(i) * wwd, y = wy + hash(i + 30) * wht; ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i)); ctx.fillRect(x, y, 1.6, 1.6); }
    ctx.globalAlpha = 1;
    const mx = wx + 18, my = wy + 70, mr = fin ? 40 : 30;
    const halo = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 2.4);
    halo.addColorStop(0, fin ? 'rgba(253,230,138,0.45)' : 'rgba(220,230,255,0.35)'); halo.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, mr * 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eef2ff'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    const clk = this.finaleClock ? this.finaleClock(this.mech) : 0;
    if (fin && clk > 0) { ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.clip(); ctx.fillStyle = '#f5c542'; ctx.fillRect(mx - mr, my + mr - mr * 2 * clk, mr * 2, mr * 2 * clk); ctx.restore(); }
    else { ctx.fillStyle = '#1b2a66'; ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.9, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#e9e1c8'; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = '#e9e1c8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx, wy + wht); ctx.moveTo(wx - wwd / 2, wy + wht * 0.55); ctx.lineTo(wx + wwd / 2, wy + wht * 0.55); ctx.stroke();
    // curtains tied back
    for (const sg of [-1, 1]) {
      ctx.fillStyle = '#c9d4f2';
      ctx.beginPath(); ctx.moveTo(wx + sg * (wwd / 2 + 4), wy - 18); ctx.quadraticCurveTo(wx + sg * (wwd / 2 - 30), wy + wht * 0.5, wx + sg * (wwd / 2 + 10), wy + wht + 20); ctx.lineTo(wx + sg * (wwd / 2 + 44), wy + wht + 20); ctx.quadraticCurveTo(wx + sg * (wwd / 2 + 26), wy + wht * 0.5, wx + sg * (wwd / 2 + 50), wy - 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e58aa8'; ctx.fillRect(wx + sg * (wwd / 2 + 18) - 10, wy + wht * 0.52, 20, 6);
    }
    ctx.restore();
    // shelves with silhouettes of toys, and a skirting board
    ctx.fillStyle = '#2b2a52';
    for (const sg of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const sx = sg * (R * 0.62 + k * 40), sy = by - 260 + k * 120, sw = 230;
        ctx.fillStyle = '#3a3566'; ctx.fillRect(sx - sw / 2, sy, sw, 10);
        ctx.fillStyle = '#0d1230';
        for (let i = 0; i < 5; i++) {
          const x = sx - sw / 2 + 20 + i * 44, h = 26 + hash(i + k * 5 + (sg > 0 ? 20 : 0)) * 30, kind = (i + k) % 3;
          if (kind === 0) { ctx.beginPath(); ctx.arc(x, sy - h + 9, 9, 0, TAU); ctx.fill(); ctx.fillRect(x - 8, sy - h + 14, 16, h - 14); }
          else if (kind === 1) { ctx.fillRect(x - 11, sy - 22, 22, 22); }
          else { ctx.beginPath(); ctx.moveTo(x - 10, sy); ctx.lineTo(x, sy - h); ctx.lineTo(x + 10, sy); ctx.closePath(); ctx.fill(); }
        }
      }
    }
    ctx.fillStyle = '#e9e1c8'; ctx.fillRect(-ww, by - 6, ww * 2, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-ww, by + 8, ww * 2, 6);
    // the mobile of moons and stars hanging from the dark
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const a = t * 0.25 + i * TAU / 5, hx = Math.cos(a) * 120, hy = by - wh + 60 + Math.sin(a) * 18, len = 50 + (i % 2) * 24;
      ctx.strokeStyle = 'rgba(220,225,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, by - wh); ctx.lineTo(hx, hy + len); ctx.stroke();
      ctx.fillStyle = i % 2 ? '#f5e7b0' : '#c7d2fe';
      if (i % 2) star(ctx, hx, hy + len + 8, 10, 4, t * 0.4 + i); else { ctx.beginPath(); ctx.arc(hx, hy + len + 8, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#16204a'; ctx.beginPath(); ctx.arc(hx + 4, hy + len + 6, 8, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    // ---- the floor ----
    const F = nurseryFloor(R);
    ctx.save(); ctx.scale(1, tilt);
    ctx.drawImage(F.c, -F.D / 2, -F.D / 2);
    // a shaft of moonlight from the window onto the rug, with dust in it
    ctx.globalCompositeOperation = 'lighter';
    const mg = ctx.createRadialGradient(40, -R * 0.15, 20, 40, -R * 0.15, R * 0.55);
    mg.addColorStop(0, fin ? 'rgba(253,230,138,0.14)' : 'rgba(180,200,255,0.12)'); mg.addColorStop(1, 'rgba(180,200,255,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(40, -R * 0.15, R * 0.55, 0, TAU); ctx.fill();
    // the warm little lamp pool beside her chair
    const lx = CHAIR.x + 120, ly = CHAIR.y / tilt + 30;
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 170);
    lg.addColorStop(0, 'rgba(255,200,120,0.22)'); lg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, 170, 0, TAU); ctx.fill();
    ctx.restore();
    // the shaft itself (screen-vertical, from the window down onto the floor)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const sg2 = ctx.createLinearGradient(0, wy + 40, 0, -R * 0.15 * tilt);
    sg2.addColorStop(0, fin ? 'rgba(253,230,138,0.10)' : 'rgba(190,205,255,0.09)'); sg2.addColorStop(1, 'rgba(190,205,255,0)');
    ctx.fillStyle = sg2;
    ctx.beginPath(); ctx.moveTo(wx - 60, wy + 40); ctx.lineTo(wx + 70, wy + 40); ctx.lineTo(wx + 260, -R * 0.15 * tilt); ctx.lineTo(wx - 140, -R * 0.15 * tilt); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 26; i++) {
      const k = (hash(i) + t * 0.03 * (0.5 + hash(i + 4))) % 1, x = lerp(wx - 40, wx + 120, hash(i + 9)) + k * 120, y = lerp(wy + 60, -R * 0.15 * tilt, k);
      ctx.fillStyle = `rgba(230,236,255,${0.35 * Math.sin(k * Math.PI)})`; ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
    // the small lamp on its table beside the chair (dark once the Nightlight puts every light out)
    const dark = this.mech && this.mech.kind === 'nightlight' ? this.mech.dark : 0;
    drawSideLamp(ctx, CHAIR.x + 120, CHAIR.y + 18, 1 - dark, t);
    ctx.restore();
  };
  function drawSideLamp(ctx, x, y, lit, t) {
    ctx.save();
    ctx.fillStyle = '#3a2a1e'; ctx.fillRect(x - 3, y - 54, 6, 54);
    ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.ellipse(x, y - 54, 24, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c9973a'; ctx.fillRect(x - 2, y - 80, 4, 26);
    ctx.fillStyle = lit > 0.5 ? '#ffe2a8' : '#6b5b48';
    ctx.beginPath(); ctx.moveTo(x - 16, y - 76); ctx.lineTo(x + 16, y - 76); ctx.lineTo(x + 10, y - 98); ctx.lineTo(x - 10, y - 98); ctx.closePath(); ctx.fill();
    if (lit > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y - 86, 0, x, y - 86, 70);
      g.addColorStop(0, `rgba(255,214,150,${0.5 * lit})`); g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 86, 70, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // =========================================================================================================================
  // FLOOR: telegraphs, thread, ground effects, the dollhouse room, mechanic props on the floor
  // =========================================================================================================================
  P.drawTele = function (ctx, te) {
    const k = c01(1 - te.life / te.max);
    const fade = te.life < 0 ? Math.max(0, 1 + te.life / 0.18) : 1;
    const tilt = T();
    ctx.save(); ctx.translate(te.x, te.y); ctx.scale(1, tilt);
    ctx.globalAlpha *= fade;
    const edge = 'rgba(253,230,138,0.95)', fill = `rgba(244,114,182,${0.13 + 0.08 * k})`, core = `rgba(251,113,133,${0.22 + 0.25 * k})`;
    if (te.k === 'circle') {
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, te.r, 0, TAU); ctx.fill();
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, te.r * k, 0, TAU); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.arc(0, 0, te.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    } else if (te.k === 'sector') {
      const full = te.half >= Math.PI - 1e-3;
      const a0 = te.a - te.half, a1 = te.a + te.half;
      const path = (r1) => { ctx.beginPath(); if (full) { ctx.arc(0, 0, r1, 0, TAU); if (te.r0 > 0) { ctx.moveTo(te.r0, 0); ctx.arc(0, 0, te.r0, 0, TAU, true); } } else { ctx.arc(0, 0, r1, a0, a1); ctx.arc(0, 0, te.r0, a1, a0, true); ctx.closePath(); } };
      path(te.r1); ctx.fillStyle = fill; ctx.fill('evenodd');
      if (full) {   // a ring: the danger creeps outward from the inner edge
        path(te.r0 + (te.r1 - te.r0) * k); ctx.fillStyle = core; ctx.fill('evenodd');
      } else { path(te.r0 + (te.r1 - te.r0) * k); ctx.fillStyle = core; ctx.fill(); }
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); path(te.r1); ctx.stroke(); ctx.setLineDash([]);
    } else if (te.k === 'corridor') {
      ctx.rotate(te.a);
      const x0 = -18;
      ctx.fillStyle = fill; ctx.fillRect(x0, -te.w, te.len - x0, te.w * 2);
      ctx.fillStyle = core; ctx.fillRect(x0, -te.w, (te.len - x0) * k, te.w * 2);
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); ctx.strokeRect(x0, -te.w, te.len - x0, te.w * 2); ctx.setLineDash([]);
    }
    ctx.restore();
  };

  P.drawFloor = function (ctx) {
    if (this.hp <= 0) return;
    const t = now(), tilt = T(), m = this.mech;
    // the dollhouse room folds up around the middle of the rug
    if (m && m.kind === 'dollhouse' && m.fold > 0) this.drawDollhouseFloor(ctx, m, t);
    // Nightlight: the glow pool of the lamp on the floor
    if (m && m.kind === 'nightlight') {
      const lp = this.lampPos(m);
      ctx.save(); ctx.translate(lp.x, lp.y); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, m.lampR * 1.25);
      g.addColorStop(0, 'rgba(255,214,150,0.45)'); g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, m.lampR * 1.25, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // lingering thread (Stitch): a taut pink thread pinned along the floor, with cross-stitches
    for (const h of this.hazards) {
      if (h.t < (h.delay || 0) || h.k !== 'lane') continue;
      const fade = Math.min(1, h.t * 5) * Math.min(1, (h.dur - h.t) * 2);
      ctx.save(); ctx.translate(h.x, h.y); ctx.scale(1, tilt); ctx.rotate(h.a); ctx.globalAlpha *= fade;
      ctx.fillStyle = 'rgba(244,114,182,0.12)'; ctx.fillRect(0, -h.w, h.len, h.w * 2);
      ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h.len, 0); ctx.stroke();
      ctx.strokeStyle = '#fbcfe8'; ctx.lineWidth = 2;
      for (let x = 10; x < h.len - 6; x += 22) { ctx.beginPath(); ctx.moveTo(x - 6, -7); ctx.lineTo(x + 6, 7); ctx.moveTo(x + 6, -7); ctx.lineTo(x - 6, 7); ctx.stroke(); }
      ctx.restore();
    }
    for (const te of this.teles) this.drawTele(ctx, te);
    // Last Verse: a soft gold light on the floor under the glowing string, the side to strike from
    if (m && m.kind === 'finale' && m.phase === 'strings' && m.cur < 3) {
      const s = m.strings[m.order[m.cur]], a = s.ang + m.spin;
      ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 40, 0, 0, 300);
      g.addColorStop(0, 'rgba(253,230,138,0.32)'); g.addColorStop(1, 'rgba(253,230,138,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 300, a - 0.75, a + 0.75); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Head Tilt: the beam of her painted gaze along the floor
    const sw = this.sweep;
    if (sw && sw.a != null && this.state === 'hs_head_tilt') {
      ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, tilt); ctx.rotate(sw.a); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, sw.len, 0);
      g.addColorStop(0, 'rgba(147,197,253,0.6)'); g.addColorStop(1, 'rgba(147,197,253,0.05)');
      ctx.fillStyle = g; ctx.fillRect(0, -sw.w, sw.len, sw.w * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(0, -sw.w * 0.25, sw.len, sw.w * 0.5);
      ctx.restore();
    }
    // Shatter Rings: a racing ring of breaking porcelain with gold in its cracks
    if (this._rings && this.state === 'hs_shatter_rings') for (const r of this._rings) {
      if (!r.r) continue;
      ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, tilt);
      ctx.strokeStyle = 'rgba(245,197,66,0.55)'; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(0, 0, r.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#f3f0e8'; ctx.strokeStyle = INK; ctx.lineWidth = 1;
      const n = Math.max(16, Math.floor(r.r / 9));
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + hash(i) * 0.1, rr = r.r + (hash(i + 3) - 0.5) * 24, s = 6 + hash(i + 7) * 7;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y - s * 0.7); ctx.lineTo(x + s * 0.8, y + s * 0.2); ctx.lineTo(x - s * 0.2, y + s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // falling-block shadows grow where they will land
    for (const pr of this.proj) {
      if (pr.k !== 'drop' || pr.done) continue;
      const k = c01(pr.t / pr.dur);
      ctx.fillStyle = `rgba(6,8,20,${0.2 + 0.4 * k})`;
      ctx.beginPath(); ctx.ellipse(pr.x, pr.y, pr.r * 0.55 * (0.4 + 0.6 * k), pr.r * 0.55 * (0.4 + 0.6 * k) * tilt, 0, 0, TAU); ctx.fill();
    }
    // ground effects
    for (const v of this.vfx) {
      const k = c01(v.t / (v.life || 1));
      if (v.k === 'ring') {
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt);
        ctx.strokeStyle = v.col || '#fde68a'; ctx.globalAlpha *= (1 - k); ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(0, 0, v.r * (0.4 + 0.6 * Math.sqrt(k)), 0, TAU); ctx.stroke();
        ctx.restore();
      } else if (v.k === 'plunge') {
        // the needle tore a stitched seam into the floor
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt); ctx.rotate(v.a); ctx.globalAlpha *= 1 - k * k;
        ctx.fillStyle = 'rgba(10,10,24,0.7)'; ctx.fillRect(20, -5, v.len, 10);
        ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 2;
        for (let x = 30; x < v.len; x += 24) { ctx.beginPath(); ctx.moveTo(x - 7, -10); ctx.lineTo(x + 7, 10); ctx.moveTo(x + 7, -10); ctx.lineTo(x - 7, 10); ctx.stroke(); }
        ctx.restore();
      } else if (v.k === 'stitch') {
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt); ctx.globalAlpha *= 1 - k;
        ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 5;
        const s = 26 + k * 14;
        ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke();
        ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 62 * (0.5 + k * 0.5), 0, TAU); ctx.stroke();
        ctx.restore();
      } else if (v.k === 'spin') {
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt); ctx.globalAlpha *= 1 - k;
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = i === 1 ? '#fbcfe8' : '#f472b6'; ctx.lineWidth = 8 - i * 2;
          const a0 = k * 9 + i * 2.1;
          ctx.beginPath(); ctx.arc(0, 0, v.r * (0.75 + i * 0.12), a0, a0 + 3.6); ctx.stroke();
        }
        ctx.restore();
      } else if (v.k === 'arc') {
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt); ctx.globalAlpha *= 1 - k;
        ctx.strokeStyle = 'rgba(241,245,249,0.9)'; ctx.lineWidth = 16 * (1 - k) + 2;
        ctx.beginPath(); ctx.arc(0, 0, v.r * 0.85, v.a0, v.a1); ctx.stroke();
        ctx.restore();
      }
    }
  };

  // the dollhouse: floor of the room, the rest of the nursery dark, walls (back half here, front half in drawTop), lights on the
  // wall going out one by one (the room's clock), the window with her eye, the old toys' glow
  P.drawDollhouseFloor = function (ctx, m, t) {
    const tilt = T(), f = m.fold, R = ROOM_R;
    ctx.save(); ctx.translate(STAGE.x, STAGE.y); ctx.scale(1, tilt);
    // the world outside the room goes dark
    ctx.fillStyle = `rgba(4,5,14,${0.9 * f})`;
    ctx.beginPath(); ctx.rect(-3000, -3000, 6000, 6000); ctx.arc(0, 0, R, 0, TAU, true); ctx.fill('evenodd');
    // the room's floor: little painted parquet
    ctx.save(); ctx.globalAlpha *= f;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
    for (let x = -R; x < R; x += 40) for (let y = -R; y < R; y += 40) {
      const odd = ((x + y) / 40) % 2 === 0;
      ctx.fillStyle = odd ? 'rgba(120,80,60,0.55)' : 'rgba(150,104,72,0.55)'; ctx.fillRect(x, y, 40, 40);
    }
    ctx.restore();
    ctx.restore();
    // old toys glowing on the floor (a ring fills while you stand on one)
    if (m.phase !== 'intro') for (const toy of m.toys) {
      ctx.save(); ctx.translate(toy.x, toy.y); ctx.scale(1, tilt);
      if (toy.got) {
        ctx.fillStyle = 'rgba(253,230,138,0.12)'; ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.7 + 0.3 * Math.sin(t * 4 + toy.i);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
        g.addColorStop(0, `rgba(253,230,138,${0.45 * pulse})`); g.addColorStop(1, 'rgba(253,230,138,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(253,230,138,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.stroke();
        if (toy.hold > 0) { ctx.strokeStyle = '#fff2b8'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + TAU * c01(toy.hold / 1.1)); ctx.stroke(); }
      }
      ctx.restore();
    }
    // the back walls of the room
    this.drawDollWalls(ctx, m, t, false);
  };
  // walls: a ring of panels rising with the fold. back = far half (drawn under everyone), front = near half, see-through (top)
  P.drawDollWalls = function (ctx, m, t, front) {
    // the near half is cut away like a real dollhouse: only a low rim, so the room stays readable
    const tilt = T(), R = ROOM_R, H = (front ? 34 : 150) * m.fold, N = 36;
    const el = m.phase === 'room' ? (m.t - m.t0) : (m.phase === 'out' ? m.dur : 0);
    const lit = m.phase === 'intro' ? N : Math.ceil(N * (1 - c01(el / m.dur)));
    ctx.save();
    if (front) ctx.globalAlpha *= 0.85;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * TAU, a1 = (i + 1) / N * TAU, am = (a0 + a1) / 2;
      const isFront = Math.sin(am) > 0;
      if (isFront !== front) continue;
      const x0 = STAGE.x + Math.cos(a0) * R, y0 = STAGE.y + Math.sin(a0) * R * tilt, x1 = STAGE.x + Math.cos(a1) * R, y1 = STAGE.y + Math.sin(a1) * R * tilt;
      const shade = 0.55 + 0.45 * Math.max(0, Math.cos(am - 2.4));
      ctx.fillStyle = `rgb(${Math.round(222 * shade)},${Math.round(200 * shade)},${Math.round(220 * shade)})`;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - H); ctx.lineTo(x0, y0 - H); ctx.closePath(); ctx.fill();
      // wallpaper stripe and a skirting board
      ctx.fillStyle = `rgba(229,138,168,${0.35 * shade})`; ctx.beginPath(); ctx.moveTo(lerp(x0, x1, 0.4), lerp(y0, y1, 0.4)); ctx.lineTo(lerp(x0, x1, 0.6), lerp(y0, y1, 0.6)); ctx.lineTo(lerp(x0, x1, 0.6), lerp(y0, y1, 0.6) - H); ctx.lineTo(lerp(x0, x1, 0.4), lerp(y0, y1, 0.4) - H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(60,40,50,0.8)'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - 10 * m.fold); ctx.lineTo(x0, y0 - 10 * m.fold); ctx.closePath(); ctx.fill();
      // a little wall light per panel: they go out one by one as the room's time runs out
      if (!front && m.fold > 0.6) {
        const on = i < lit;
        const lx = (x0 + x1) / 2, ly = (y0 + y1) / 2 - H * 0.72;
        ctx.fillStyle = on ? '#ffe2a8' : '#3a3346'; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, TAU); ctx.fill();
        if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,214,150,0.25)'; ctx.beginPath(); ctx.arc(lx, ly, 13, 0, TAU); ctx.fill(); ctx.restore(); }
      }
      ctx.strokeStyle = 'rgba(30,20,40,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0 - H); ctx.lineTo(x1, y1 - H); ctx.stroke();
    }
    // the window in the back wall, and her eye in it
    if (!front && m.fold > 0.5) {
      const wx = STAGE.x, wy = STAGE.y - R * tilt - H * 0.55;
      ctx.fillStyle = '#0a0f26'; ctx.fillRect(wx - 70, wy - 42, 140, 84);
      const e = m.eye;
      const open = e ? c01(e.t / 0.3) : 0.12 + 0.1 * Math.sin(t * 0.8);
      ctx.save(); ctx.beginPath(); ctx.rect(wx - 70, wy - 42, 140, 84); ctx.clip();
      // a huge painted eye filling the window
      ctx.fillStyle = '#f3f0e8'; ctx.beginPath(); ctx.ellipse(wx, wy, 66, 40 * open + 2, 0, 0, TAU); ctx.fill();
      if (open > 0.2) {
        const look = e ? e.a : Math.PI / 2;
        const px = wx + Math.cos(look) * 18, py = wy + Math.sin(look) * 10;
        ctx.fillStyle = e && e.locked ? '#be123c' : '#2f4f9e'; ctx.beginPath(); ctx.arc(px, py, 22 * Math.min(1, open * 1.2), 0, TAU); ctx.fill();
        ctx.fillStyle = '#0b1024'; ctx.beginPath(); ctx.arc(px, py, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - 7, py - 7, 4, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = '#e9e1c8'; ctx.lineWidth = 6; ctx.strokeRect(wx - 70, wy - 42, 140, 84);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx, wy - 42); ctx.lineTo(wx, wy + 42); ctx.stroke();
      // while it searches, a pale cone of its gaze sweeps the room
      if (e && !e.fired) {
        ctx.save(); ctx.translate(STAGE.x, STAGE.y - R * tilt); ctx.scale(1, tilt); ctx.rotate(e.a); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, 0, R * 2, 0);
        g.addColorStop(0, e.locked ? 'rgba(251,113,133,0.4)' : 'rgba(147,197,253,0.25)'); g.addColorStop(1, 'rgba(147,197,253,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 2 + 40, -60); ctx.lineTo(R * 2 + 40, 60); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (e && e.fired && e.t < e.track + e.lock + 0.3) {
        ctx.save(); ctx.translate(STAGE.x, STAGE.y - R * tilt); ctx.scale(1, tilt); ctx.rotate(e.a); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,240,240,0.7)'; ctx.fillRect(0, -46, R * 2 + 40, 92);
        ctx.restore();
      }
    }
    ctx.restore();
  };

  // =========================================================================================================================
  // Y-SORTED PROPS
  // =========================================================================================================================
  P.extraRenderables = function () {
    const out = [];
    const m = this.mech;
    const inChair = Math.hypot(this.x - CHAIR.x, this.y - CHAIR.y) < 12;
    const chairFace = inChair ? this.facingAngle : Math.PI * 0.5;
    const backNear = Math.sin(chairFace) < 0;                       // the chair faces away: its back is between us and her
    if (!(m && m.kind === 'dollhouse' && m.fold > 0.5)) {
      out.push({ y: CHAIR.y - 1, draw: (ctx) => this.drawChair(ctx, chairFace, inChair, 'base') });
      out.push({ y: CHAIR.y + (backNear ? 1 : -2), draw: (ctx) => this.drawChair(ctx, chairFace, inChair, 'back') });
    }
    for (const n of this.minions) {
      if (n.k === 'soldier' && n.t >= n.delay - 0.6) out.push({ y: n.y, draw: (ctx) => this.drawSoldier(ctx, n) });
      else if (n.k === 'shadow') out.push({ y: n.y, draw: (ctx) => this.drawShadowToy(ctx, n) });
    }
    for (const v of this.vfx) if (v.k === 'block') out.push({ y: v.y, draw: (ctx) => this.drawBlock(ctx, v.x, v.y, v.r * 0.5, v.letter, v.col, 0, 1 - c01((v.t - v.life + 0.4) / 0.4)) });
    if (m && m.kind === 'nightlight' && !m.lamp.held && m.phase === 'dark') out.push({ y: m.lamp.y, draw: (ctx) => this.drawNightlight(ctx, m.lamp.x, m.lamp.y, 0) });
    if (m && m.kind === 'dollhouse' && m.phase !== 'intro') for (const toy of m.toys) out.push({ y: toy.y, draw: (ctx) => this.drawOldToy(ctx, toy) });
    return out;
  };

  // her rocking chair (it keeps rocking, empty, after she gets up)
  P.drawChair = function (ctx, face, occupied, part) {
    const S = 1.62, tilt = T(), X = CHAIR.x, Y = CHAIR.y;
    const cs = Math.cos(face), sn = Math.sin(face);
    const rock = Math.sin(now() * (occupied ? 1.3 : 0.9)) * (occupied ? 0.05 : 0.08);
    const proj = (f, s, u) => { const uu = u + f * rock * 0.6 + Math.abs(f) * 0; return { x: X + (f * cs - s * sn) * S, y: Y + (f * sn + s * cs) * S * tilt - uu * S }; };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const wood = '#6e4a2e', woodLt = '#8d6440', woodDk = '#3f2817';
    if (part === 'base') {
      ctx.fillStyle = 'rgba(6,8,20,0.35)'; ctx.beginPath(); ctx.ellipse(X, Y, 30 * S, 30 * S * tilt, 0, 0, TAU); ctx.fill();
      // rockers
      for (const s of [-13, 13]) {
        ctx.strokeStyle = woodDk; ctx.lineWidth = 5; ctx.beginPath();
        for (let i = 0; i <= 12; i++) { const f = -26 + i * 52 / 12, u = 2 + (f / 26) * (f / 26) * 5 - rock * f * 0.8; const q = proj(f, s, u); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
        ctx.stroke();
      }
      // legs
      ctx.strokeStyle = wood; ctx.lineWidth = 4;
      for (const f of [-14, 12]) for (const s of [-13, 13]) { const a = proj(f, s, 4), b = proj(f, s, 25); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      // seat with a cushion
      const c = [proj(-16, -15, 26), proj(14, -15, 26), proj(14, 15, 26), proj(-16, 15, 26)];
      ctx.fillStyle = woodLt; ctx.beginPath(); c.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = woodDk; ctx.lineWidth = 1.5; ctx.stroke();
      const cu = [proj(-14, -13, 28), proj(12, -13, 28), proj(12, 13, 28), proj(-14, 13, 28)];
      ctx.fillStyle = '#c9d4f2'; ctx.beginPath(); cu.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.fill();
      // arms
      ctx.strokeStyle = wood; ctx.lineWidth = 4;
      for (const s of [-15, 15]) { const a = proj(-16, s, 40), b = proj(13, s, 38), d = proj(13, s, 26); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.stroke(); }
    } else {
      // the spindle back (open, so she shows through it)
      ctx.strokeStyle = wood; ctx.lineWidth = 3.5;
      for (let i = 0; i < 6; i++) { const s = -13 + i * 26 / 5; const a = proj(-16, s, 26), b = proj(-19, s, 76); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      ctx.lineWidth = 6; ctx.strokeStyle = woodLt; ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const s = -16 + i * 3.2, u = 76 + Math.sin(i / 10 * Math.PI) * 6; const q = proj(-19, s, u); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
      ctx.stroke();
      ctx.strokeStyle = woodDk; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.restore();
  };

  // a wind-up toy soldier: red coat, tall shako, a key in his back; marches in hops
  P.drawSoldier = function (ctx, n) {
    const tilt = T(), appear = c01((n.t - (n.delay - 0.6)) / 0.6);
    const hop = n.t > n.delay ? Math.abs(Math.sin((n.t + n.hop) * 11)) * 6 : 0;
    const x = n.x, y = n.y, s = 1.15, faceR = Math.cos(n.a) >= 0 ? 1 : -1;
    ctx.save(); ctx.globalAlpha *= appear;
    ctx.fillStyle = 'rgba(6,8,20,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, 13 * s, 13 * s * tilt, 0, 0, TAU); ctx.fill();
    ctx.translate(x, y - hop); ctx.scale(faceR * s, s);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    // legs
    const step = n.t > n.delay ? Math.sin((n.t + n.hop) * 11) * 4 : 0;
    ctx.fillStyle = '#1e3a8a'; ctx.fillRect(-6 + step * 0.5, -18, 5, 18); ctx.fillRect(1 - step * 0.5, -18, 5, 18);
    ctx.fillStyle = '#111'; ctx.fillRect(-7 + step * 0.5, -3, 7, 3); ctx.fillRect(0 - step * 0.5, -3, 7, 3);
    // coat
    ctx.fillStyle = '#c0262d'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-8, -40, 16, 23, 3) : ctx.rect(-8, -40, 16, 23); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-8, -26); ctx.lineTo(8, -26); ctx.stroke();
    ctx.fillStyle = '#fde68a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -36 + i * 6, 1.2, 0, TAU); ctx.fill(); }
    // arm with a musket
    ctx.fillStyle = '#c0262d'; ctx.fillRect(5, -38, 4, 14);
    ctx.strokeStyle = '#3f2817'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, -24); ctx.lineTo(10, -54); ctx.stroke();
    // head and shako
    ctx.fillStyle = '#f3e1c8'; ctx.beginPath(); ctx.arc(0, -45, 5.5, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#c94f6d'; ctx.beginPath(); ctx.arc(2.5, -43.5, 1.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(-5.5, -63, 11, 15); ctx.fillStyle = '#fde68a'; ctx.fillRect(-5.5, -50, 11, 2);
    ctx.fillStyle = '#c0262d'; ctx.beginPath(); ctx.arc(0, -64, 2.5, 0, TAU); ctx.fill();
    // the key, turning
    const k = Math.cos(n.t * 8);
    ctx.strokeStyle = '#c9973a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -32); ctx.lineTo(-13, -32); ctx.stroke();
    ctx.fillStyle = '#c9973a'; ctx.beginPath(); ctx.ellipse(-14, -32 - 3 * k, 2, Math.abs(3 * k) + 0.5, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-14, -32 + 3 * k, 2, Math.abs(3 * k) + 0.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  };

  // a shadow toy from the dark: a smudge of a bear / rabbit / jack-in-the-box, two glowing eyes; burns away in lamplight
  P.drawShadowToy = function (ctx, n) {
    const tilt = T(), t = now(), burn = c01((n.burn || 0) / 0.45), appear = c01(n.t / 0.5);
    const x = n.x, y = n.y, wob = Math.sin(t * 7 + n.id) * 2;
    ctx.save(); ctx.globalAlpha *= appear * (1 - burn * 0.6);
    ctx.fillStyle = 'rgba(2,2,8,0.5)'; ctx.beginPath(); ctx.ellipse(x, y, 20, 20 * tilt, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgb(${10 + burn * 60},${8 + burn * 20},${22})`;
    ctx.translate(x, y + wob * 0.3);
    ctx.beginPath();
    if (n.kind === 0) { ctx.ellipse(0, -22, 15, 18, 0, 0, TAU); ctx.moveTo(-8, -40); ctx.arc(-10, -40, 6, 0, TAU); ctx.moveTo(14, -40); ctx.arc(10, -40, 6, 0, TAU); }
    else if (n.kind === 1) { ctx.ellipse(0, -20, 13, 17, 0, 0, TAU); ctx.ellipse(-6, -46, 4, 13, -0.2, 0, TAU); ctx.ellipse(6, -46, 4, 13, 0.2, 0, TAU); }
    else { ctx.rect(-13, -26, 26, 26); ctx.moveTo(4, -26); ctx.ellipse(0, -40 - Math.abs(Math.sin(t * 5 + n.id)) * 8, 9, 10, 0, 0, TAU); }
    ctx.fill();
    // ragged smoky edge
    for (let i = 0; i < 6; i++) { const a = t * 2 + i; ctx.beginPath(); ctx.arc(Math.cos(a) * 14, -20 + Math.sin(a * 1.3) * 14, 5, 0, TAU); ctx.fill(); }
    ctx.restore();
    if (burn > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,170,90,${0.5 * burn})`; ctx.beginPath(); ctx.arc(x, y - 22, 22, 0, TAU); ctx.fill(); ctx.restore(); }
  };
  P.drawShadowEyes = function (ctx) {
    const t = now();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const n of this.minions) {
      if (n.k !== 'shadow') continue;
      const ey = n.y - (n.kind === 2 ? 40 : 24), blink = (Math.sin(t * 1.7 + n.id * 3) > 0.96) ? 0.2 : 1;
      for (const sg of [-1, 1]) {
        const g = ctx.createRadialGradient(n.x + sg * 5, ey, 0, n.x + sg * 5, ey, 7);
        g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(1, 'rgba(255,190,90,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(n.x + sg * 5, ey, 7, 7 * blink, 0, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  };

  // an alphabet block (a cube seen from above-front) with its letter
  P.drawBlock = function (ctx, x, y, s, letter, col, z, alpha) {
    if (alpha <= 0.01) return;
    const tilt = T(), top = s * tilt;
    ctx.save(); ctx.globalAlpha *= alpha;
    const yb = y - z;
    ctx.fillStyle = col || '#fde68a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    // front face
    ctx.beginPath(); ctx.rect(x - s, yb - s * 1.6, s * 2, s * 1.6); ctx.fill(); ctx.stroke();
    // top face
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(x - s, yb - s * 1.6); ctx.lineTo(x + s, yb - s * 1.6); ctx.lineTo(x + s * 0.8, yb - s * 1.6 - top); ctx.lineTo(x - s * 0.8, yb - s * 1.6 - top); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.strokeRect(x - s * 0.82, yb - s * 1.45, s * 1.64, s * 1.3);
    ctx.fillStyle = '#1b1f3a'; ctx.font = `bold ${Math.round(s * 1.1)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter || 'A', x, yb - s * 0.8);
    ctx.restore();
  };

  // the nightlight: a small porcelain moon on a brass stand, glowing warm
  P.drawNightlight = function (ctx, x, y, z) {
    const t = now(), yy = y - z;
    ctx.save();
    if (z <= 0) { ctx.fillStyle = 'rgba(6,8,20,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, 12, 12 * T(), 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#c9973a'; ctx.fillRect(x - 7, yy - 4, 14, 4); ctx.fillRect(x - 1.5, yy - 16, 3, 12);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, yy - 26, 0, x, yy - 26, 46);
    g.addColorStop(0, `rgba(255,224,160,${0.85 + 0.1 * Math.sin(t * 6)})`); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, yy - 26, 46, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(x, yy - 26, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,110,0.8)'; ctx.beginPath(); ctx.arc(x + 4, yy - 28, 9, 0, TAU); ctx.fill();
    ctx.restore();
  };

  // her old toys in the dollhouse: a rocking horse, a music box, a paper crown
  P.drawOldToy = function (ctx, toy) {
    const t = now(), x = toy.x, y = toy.y, bob = toy.got ? 0 : Math.sin(t * 2 + toy.i) * 2;
    ctx.save();
    ctx.globalAlpha *= toy.got ? 0.35 : 1;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.translate(x, y - bob);
    if (toy.kind === 'horse') {
      const r = Math.sin(t * 2.4) * 0.12;
      ctx.rotate(r);
      ctx.strokeStyle = '#7c4a26'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -40, 34, Math.PI * 0.32, Math.PI * 0.68); ctx.stroke();
      ctx.fillStyle = '#f3f0e8'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, -22, 16, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -26); ctx.lineTo(18, -42); ctx.lineTo(26, -40); ctx.lineTo(16, -24); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e58aa8'; ctx.fillRect(-6, -31, 10, 4);
      for (const lx of [-10, 10]) { ctx.beginPath(); ctx.moveTo(lx, -16); ctx.lineTo(lx * 1.2, -8); ctx.stroke(); }
    } else if (toy.kind === 'box') {
      ctx.fillStyle = '#2a4a8f'; ctx.fillRect(-15, -22, 30, 18); ctx.strokeRect(-15, -22, 30, 18);
      ctx.fillStyle = '#5d7fc4'; ctx.save(); ctx.translate(-15, -22); ctx.rotate(-0.6 - Math.sin(t * 3) * 0.05); ctx.fillRect(0, -4, 30, 4); ctx.strokeRect(0, -4, 30, 4); ctx.restore();
      ctx.fillStyle = '#f3f0e8'; ctx.beginPath(); ctx.arc(0, -30, 3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, -27); ctx.lineTo(0, -22); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -30, Math.abs(6 * Math.cos(t * 4)) + 0.3, 1.5, 0, 0, TAU); ctx.stroke();
    } else {
      ctx.fillStyle = '#fde68a';
      ctx.beginPath(); ctx.moveTo(-16, -10); ctx.lineTo(-16, -26); ctx.lineTo(-9, -18); ctx.lineTo(0, -30); ctx.lineTo(9, -18); ctx.lineTo(16, -26); ctx.lineTo(16, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e58aa8'; ctx.beginPath(); ctx.arc(0, -16, 2.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };

  // =========================================================================================================================
  // TOP: her strings, things in the air, slashes, the dark
  // =========================================================================================================================
  P.drawTop = function (ctx) {
    if (this.hp <= 0) return;
    const t = now(), tilt = T(), m = this.mech;
    ctx.save();
    ctx.lineCap = 'round';
    // her marionette strings, from her head and hands up into the dark (the finale has its own three)
    const hidden = m && m.kind === 'dollhouse';
    if (!hidden && !(m && m.kind === 'finale') && this._headTop) {
      ctx.strokeStyle = 'rgba(226,232,240,0.28)'; ctx.lineWidth = 1;
      for (const q of [this._headTop, this._handR, this._handL]) {
        if (!q) continue;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + (q.x - this.x) * 0.15, q.y - 900); ctx.stroke();
      }
    }
    if (m && m.kind === 'finale') this.drawFinaleStrings(ctx, m, t);
    if (m && m.kind === 'dollhouse' && m.fold > 0) { this.drawDollWalls(ctx, m, t, true); this.drawHand(ctx, m); }
    // Unravel: the taut thread whipping round from her spool
    const u = this.unravel;
    if (u && u.live) {
      const ox = this.x, oy = this.y - 40;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 5; i++) {
        const a = u.a - u.dir * i * 0.06;
        ctx.strokeStyle = `rgba(244,114,182,${0.3 - i * 0.05})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(this.x + Math.cos(a) * u.len, this.y + Math.sin(a) * u.len * tilt - 20); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#fbcfe8'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(this.x + Math.cos(u.a) * u.len, this.y + Math.sin(u.a) * u.len * tilt - 20); ctx.stroke();
    }
    // Head Tilt: the light from her eyes down to the floor beam
    const sw = this.sweep;
    if (sw && sw.a != null && this.state === 'hs_head_tilt' && this._headTop) {
      const h = this._headTop, end = { x: this.x + Math.cos(sw.a) * sw.len * 0.5, y: this.y + Math.sin(sw.a) * sw.len * 0.5 * tilt };
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(h.x, h.y + 14, end.x, end.y);
      g.addColorStop(0, 'rgba(191,219,254,0.6)'); g.addColorStop(1, 'rgba(191,219,254,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(h.x - 3, h.y + 14); ctx.lineTo(end.x - 26, end.y); ctx.lineTo(end.x + 26, end.y); ctx.lineTo(h.x + 3, h.y + 14); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // pins in flight
    for (const pr of this.proj) {
      if (pr.k === 'pin' && !pr.done) {
        const dx = Math.cos(pr.a), dy = Math.sin(pr.a) * tilt, L = 22, z = 34;
        const x = pr.x, y = pr.y - z;
        ctx.strokeStyle = 'rgba(226,232,240,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - dx * 40, y - dy * 40); ctx.lineTo(x, y); ctx.stroke();
        ctx.strokeStyle = '#e7ecf3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - dx * L, y - dy * L); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#e58aa8'; ctx.beginPath(); ctx.arc(x - dx * L, y - dy * L, 3.5, 0, TAU); ctx.fill();
      } else if (pr.k === 'drop' && !pr.done) {
        const k = c01(pr.t / pr.dur), z = 620 * (1 - k * k);
        this.drawBlock(ctx, pr.x, pr.y, pr.r * 0.5, pr.letter, pr.col, z, c01(k * 4));
      }
    }
    // the nightlight in a carrier's hands
    if (m && m.kind === 'nightlight') {
      const p = party().find(q => q && q.hsCarry);
      if (p) this.drawNightlight(ctx, p.x, p.y, 92);
    }
    // effects in the air
    for (const v of this.vfx) this.drawAirVfx(ctx, v, t);
    ctx.restore();
    // the Nightlight's dark, with the lamp's light and a little of yours cut out of it
    if (m && m.kind === 'nightlight' && m.dark > 0.01) this.drawDark(ctx, m);
  };

  P.drawAirVfx = function (ctx, v, t) {
    const k = c01(v.t / (v.life || 1)), tilt = T();
    switch (v.k) {
      case 'chips': {
        const n = v.big ? 18 : 8;
        for (let i = 0; i < n; i++) {
          const a = v.a + (hash(v.seed + i) - 0.5) * 2.2, sp = 90 + hash(v.seed + i * 3) * 160, tt = v.t;
          const x = v.x + Math.cos(a) * sp * tt, y = v.y + Math.sin(a) * sp * tt * tilt, z = Math.max(0, 70 + 190 * tt - 520 * tt * tt);
          const s = (v.big ? 6 : 4) * (0.6 + hash(v.seed + i * 7));
          ctx.save(); ctx.translate(x, y - z); ctx.rotate(tt * 9 + i); ctx.globalAlpha *= 1 - k * k;
          ctx.fillStyle = i % 4 ? '#f3f0e8' : '#2a4a8f'; ctx.strokeStyle = INK; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(0, -s * 0.7); ctx.lineTo(s, s * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'zzz': {
        const p = party().find(q => q && q.id === v.pid);
        const x = p ? p.x : v.x, y = p ? p.y : v.y;
        ctx.save(); ctx.strokeStyle = '#c7d2fe'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.7 + i / 3) % 1, s = 6 + i * 3, zx = x + 14 + ph * 22 + i * 4, zy = y - 70 - ph * 50;
          ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
          ctx.beginPath(); ctx.moveTo(zx - s, zy - s); ctx.lineTo(zx + s, zy - s); ctx.lineTo(zx - s, zy + s); ctx.lineTo(zx + s, zy + s); ctx.stroke();
        }
        // the blanket of thread wrapped over the sleeper
        ctx.globalAlpha = 0.8; ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) { const yy = y - 10 - i * 9; ctx.beginPath(); ctx.ellipse(x, yy, 16, 4, 0, 0, TAU); ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'motes': {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 12; i++) {
          const a = hash(v.seed + i) * TAU, r = v.r * (0.3 + hash(v.seed + i * 2) * 0.7);
          const x = v.x + Math.cos(a) * r, y = v.y + Math.sin(a) * r * tilt - k * 60 - hash(i) * 20;
          ctx.fillStyle = `rgba(253,230,138,${(1 - k) * 0.8})`; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
        ctx.restore();
        break;
      }
      case 'puff': {
        ctx.save(); ctx.globalAlpha *= (1 - k) * 0.7; ctx.fillStyle = '#0b0b18';
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.arc(v.x + Math.cos(a) * 14 * (1 + k), v.y - 24 + Math.sin(a) * 10 * (1 + k) - k * 20, 10 * (1 - k * 0.5), 0, TAU); ctx.fill(); }
        ctx.restore();
        break;
      }
      case 'snatch': {
        const down = c01(v.t / 0.12), up = c01((v.t - 0.18) / 0.3);
        const y0 = v.y - 900, yEnd = lerp(y0, v.y - 20, down) - (v.y - 20 - y0) * up;
        ctx.save(); ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(v.x, y0); ctx.lineTo(v.x, yEnd); ctx.stroke();
        ctx.beginPath(); ctx.arc(v.x, yEnd + 6, 6, 0, Math.PI); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'memory': {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * TAU + k * 2, r = 20 + k * 50;
          ctx.fillStyle = `rgba(255,236,170,${1 - k})`;
          ctx.beginPath(); ctx.arc(v.x + Math.cos(a) * r, v.y - 30 - k * 80 + Math.sin(a) * r * 0.4, 2.5, 0, TAU); ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'threadSpark': case 'snap': {
        const big = v.k === 'snap';
        const ox = this.x + Math.cos(v.a) * 40, oy = this.y + Math.sin(v.a) * 40 * tilt - (this.jumpZ || 0) - 110;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const n = big ? 14 : 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + v.a, r = (big ? 70 : 24) * k;
          ctx.strokeStyle = `rgba(255,230,140,${1 - k})`; ctx.lineWidth = big ? 3 : 2;
          ctx.beginPath(); ctx.moveTo(ox + Math.cos(a) * r * 0.4, oy + Math.sin(a) * r * 0.4); ctx.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r); ctx.stroke();
        }
        if (big) {
          // the cut string whips away upward
          ctx.strokeStyle = `rgba(253,230,138,${1 - k})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(ox, oy - 40 - k * 400); ctx.quadraticCurveTo(ox + Math.sin(k * 12) * 40, oy - 300 - k * 400, ox, oy - 800); ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'thrust': {
        const dx = Math.cos(v.a), dy = Math.sin(v.a) * tilt, z = 60;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 1 - k;
        ctx.strokeStyle = 'rgba(241,245,249,0.9)'; ctx.lineWidth = 12 * (1 - k) + 2;
        ctx.beginPath(); ctx.moveTo(v.x + dx * 40, v.y + dy * 40 - z); ctx.lineTo(v.x + dx * v.len, v.y + dy * v.len - z * 0.5); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        break;
      }
      case 'plunge': {
        const dx = Math.cos(v.a), dy = Math.sin(v.a) * tilt, reach = Math.min(1, k * 4) * v.len;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 1 - k;
        ctx.strokeStyle = 'rgba(241,245,249,0.85)'; ctx.lineWidth = 26 * (1 - k) + 4;
        ctx.beginPath(); ctx.moveTo(v.x + dx * 30, v.y + dy * 30 - 50); ctx.lineTo(v.x + dx * reach, v.y + dy * reach - 10); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'ribbon': {
        ctx.save(); ctx.globalAlpha *= 1 - k * k;
        const n = 24, len = v.len * Math.min(1, k * 5);
        ctx.strokeStyle = '#f472b6'; ctx.lineWidth = v.wide ? 10 : 7;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const d = i / n * len, a = v.a + (v.wide ? (i / n - 0.5) * 1.0 : 0);
          const wave = Math.sin(i * 0.8 - v.t * 30) * 10 * (i / n);
          const x = v.x + Math.cos(a) * d - Math.sin(a) * wave, y = v.y + (Math.sin(a) * d + Math.cos(a) * wave) * tilt - 40 + i / n * 20;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#fbcfe8'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        break;
      }
      case 'lasso': {
        const out = k < 0.5 ? k * 2 : 1 - (k - 0.5) * 2, d = v.len * out;
        const ex = v.x + Math.cos(v.a) * d, ey = v.y + Math.sin(v.a) * d * tilt - 40;
        ctx.save(); ctx.strokeStyle = '#fbcfe8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(v.x, v.y - 70); ctx.quadraticCurveTo((v.x + ex) / 2, (v.y + ey) / 2 - 60, ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(ex, ey, 22, 10, v.t * 12, 0, TAU); ctx.stroke();
        ctx.restore();
        break;
      }
    }
  };

  // Last Verse: three strings hold her up; the one to cut glows gold; cut ones hang frayed
  P.drawFinaleStrings = function (ctx, m, t) {
    const tilt = T(), hz = this.jumpZ || 0, S = this.modelScale || 1;
    for (const s of m.strings) {
      const a = s.ang + m.spin;
      const ax = this.x + Math.cos(a) * 26 * S, ay = this.y + Math.sin(a) * 26 * S * tilt - hz - 70 * S;
      const tx = this.x + Math.cos(a) * 140, ty = this.y + Math.sin(a) * 140 * tilt - 1000;
      const live = m.cur < 3 && m.order[m.cur] === s.i;
      if (s.cut) {
        ctx.strokeStyle = 'rgba(226,232,240,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + Math.sin(t * 2 + s.i) * 8, ay + 20, ax + 4, ay + 46); ctx.stroke();
        continue;
      }
      if (live) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(253,230,138,${0.35 + 0.2 * Math.sin(t * 6)})`; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.restore();
        // how much of it is left: the bright part shortens toward her as it frays
        const left = c01(s.hp / s.max);
        ctx.strokeStyle = '#fff2b8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lerp(ax, tx, 0.15 + 0.85 * left), lerp(ay, ty, 0.15 + 0.85 * left)); ctx.stroke();
        ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lerp(ax, tx, 0.15 + 0.85 * left), lerp(ay, ty, 0.15 + 0.85 * left)); ctx.lineTo(tx, ty); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(226,232,240,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
      }
    }
  };

  // Dollhouse: her enormous porcelain hand, raised outside the wall, then sweeping straight across the room
  P.drawHand = function (ctx, m) {
    const h = m.hand; if (!h) return;
    const tilt = T(), L = ROOM_R * 2 + 80;
    const sweep = c01((h.t - h.lead) / 0.3), lift = h.t < h.lead ? 120 + Math.sin(h.t * 8) * 6 : 30;
    const d = sweep * L;
    const x = h.x + Math.cos(h.a) * d, y = h.y + Math.sin(h.a) * d * tilt;
    const fade = h.t > h.lead + 0.35 ? 1 - c01((h.t - h.lead - 0.35) / 0.25) : 1;
    ctx.save(); ctx.globalAlpha *= fade;
    ctx.fillStyle = 'rgba(6,8,20,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, 70, 70 * tilt, 0, 0, TAU); ctx.fill();
    ctx.translate(x, y - lift); ctx.rotate(h.a + Math.PI / 2);
    // palm and fingers, glossy white with gold seams
    ctx.fillStyle = '#f3f0e8'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 54, 44, 0, 0, TAU); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 4; i++) { const fx = -36 + i * 24; ctx.beginPath(); ctx.ellipse(fx, -64, 10, 30, (i - 1.5) * 0.08, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(56, -10, 10, 26, 0.9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-30, 10); ctx.lineTo(-8, -6); ctx.lineTo(4, 14); ctx.lineTo(28, -2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-18, -16, 16, 7, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
  };

  // the dark: one full-screen layer with holes burnt in it by the lamp and (a little) around you; it closes in as time runs out
  let darkCv = null;
  P.drawDark = function (ctx, m) {
    const W = ctx.canvas.width, H = ctx.canvas.height, tilt = T();
    if (!darkCv) darkCv = document.createElement('canvas');
    if (darkCv.width !== W || darkCv.height !== H) { darkCv.width = W; darkCv.height = H; }
    const g = darkCv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgba(3,4,12,${0.94 * m.dark})`; g.fillRect(0, 0, W, H);
    g.setTransform(ctx.getTransform());
    g.globalCompositeOperation = 'destination-out';
    const el = m.phase === 'dark' ? (m.t - m.t0) : 0, close = c01(el / m.dur);
    const hole = (x, y, r, a) => {
      g.save(); g.translate(x, y); g.scale(1, tilt);
      const gr = g.createRadialGradient(0, 0, r * 0.25, 0, 0, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.restore();
    };
    const lp = this.lampPos(m);
    hole(lp.x, lp.y - 20, m.lampR * 1.5, 1);
    const p = localP();
    if (p && !p.hsCarry) hole(p.x, p.y - 30, lerp(130, 55, close), 0.85);
    hole(CHAIR.x, CHAIR.y - 40, 90, 0.35);                 // she is a pale shape in the dark
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(darkCv, 0, 0); ctx.restore();
    // what you must still see: the shadow toys' eyes, and her strings coming down for the light
    this.drawShadowEyes(ctx);
    for (const te of this.teles) { ctx.save(); ctx.globalAlpha *= 0.75; this.drawTele(ctx, te); ctx.restore(); }
    for (const v of this.vfx) if (v.k === 'snatch') this.drawAirVfx(ctx, v, now());
  };

  // =========================================================================================================================
  // SCREEN: eyelids, Lights Out, the moon
  // =========================================================================================================================
  P.drawScreen = function (ctx, W, H) {
    if (this.hp <= 0) return;
    const p = localP(), t = now(), m = this.mech;
    ctx.save();
    // Lights Out (Last Verse): the room dims to black as it winds up, then a white strike
    if (m && m.kind === 'finale' && m.lights) {
      const l = m.lights;
      let a = 0;
      if (l.t < l.chime) a = 0.82 * c01(l.t / l.chime);
      else if (l.t < l.strike) a = 0.82 + 0.1 * c01((l.t - l.chime) / (l.strike - l.chime));
      if (a > 0) { ctx.fillStyle = `rgba(2,3,10,${a})`; ctx.fillRect(0, 0, W, H); }
      if (l.t >= l.strike) { const k = c01((l.t - l.strike) / 0.5); ctx.fillStyle = `rgba(255,248,225,${0.65 * (1 - k)})`; ctx.fillRect(0, 0, W, H); }
    }
    // the moon: her verse clock in the Last Verse (top of the screen, fills with gold)
    if (m && m.kind === 'finale' && m.phase === 'strings') {
      const clk = this.finaleClock(m), cx = W / 2, cy = 118, r = 22;
      ctx.fillStyle = 'rgba(10,14,40,0.6)'; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e0e7ff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      ctx.fillStyle = '#f5c542'; ctx.fillRect(cx - r, cy + r - 2 * r * clk, 2 * r, 2 * r * clk);
      ctx.restore();
      ctx.strokeStyle = clk > 0.8 ? `rgba(251,113,133,${0.6 + 0.4 * Math.sin(t * 10)})` : 'rgba(253,230,138,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, TAU); ctx.stroke();
    }
    // eyelids: how sleepy you are. They droop from the top and bottom of the screen; asleep, they shut.
    if (p) {
      let d = c01((p.hushDrowsy || 0) / 100);
      if (p.hushSleep > 0) d = 1;
      const close = p.hushSleep > 0 ? 0.5 - Math.max(0, 0.6 - p.hushSleep) * 0.6 : Math.pow(d, 1.6) * 0.34;
      if (close > 0.003) {
        const flutter = p.hushSleep > 0 ? 0 : Math.sin(t * 2.6) * 0.012 * d;
        const hTop = H * (close + flutter), hBot = H * (close + flutter) * 0.85;
        ctx.fillStyle = '#05060f';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, hTop * 0.55); ctx.quadraticCurveTo(W / 2, hTop * 1.45, 0, hTop * 0.55); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, H); ctx.lineTo(W, H - hBot * 0.55); ctx.quadraticCurveTo(W / 2, H - hBot * 1.45, 0, H - hBot * 0.55); ctx.closePath(); ctx.fill();
        // a soft blue haze creeps over everything as you drift
        ctx.fillStyle = `rgba(30,40,90,${0.22 * d})`; ctx.fillRect(0, 0, W, H);
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
        vg.addColorStop(0, 'rgba(5,6,15,0)'); vg.addColorStop(1, `rgba(5,6,15,${0.55 * d})`);
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.restore();
  };

  // Karok: the stitched lane: X-stitches sew themselves down both edges of the lane toward the end
  P.drawKarokLaneTell = function (ctx, p, charge, time) {
    const lane = this.karokLane || { len: 330, half: 60 };
    const N = 14, sewn = c01(p / 0.62) * N, strobe = charge > 0.85;
    const ca = Math.cos(this.facingAngle), sa = Math.sin(this.facingAngle), tilt = T();
    ctx.save();
    ctx.translate(this.x, this.y); ctx.scale(1, tilt); ctx.rotate(this.facingAngle);
    ctx.fillStyle = `rgba(226,232,240,${0.08 + 0.1 * c01(p / 0.62)})`; ctx.fillRect(30, -lane.half, lane.len - 30, lane.half * 2);
    for (let i = 0; i < N; i++) {
      const on = c01(sewn - i);
      if (on <= 0) break;
      const x = 40 + (lane.len - 40) * i / (N - 1);
      for (const sg of [-1, 1]) {
        const y = sg * lane.half;
        ctx.strokeStyle = strobe ? `rgba(255,255,255,${0.6 + 0.4 * Math.sin(time * 30)})` : `rgba(244,114,182,${on})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 8 * on); ctx.lineTo(x + 8, y + 8 * on); ctx.moveTo(x + 8, y - 8 * on); ctx.lineTo(x - 8, y + 8 * on); ctx.stroke();
      }
    }
    // the thread running between the stitches
    ctx.strokeStyle = 'rgba(253,230,138,0.8)'; ctx.lineWidth = 1.5;
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(40, sg * lane.half); ctx.lineTo(40 + (lane.len - 40) * c01(sewn / N), sg * lane.half); ctx.stroke(); }
    ctx.restore();
    void ca; void sa;
  };

  // ---- the raid-menu preview: standing on her mark, needle lowered
  P.drawPreview = function (ctx) {
    if (!this.ribN) this.resetRig();
    this.updateRig(1 / 60);
    this.state = 'idle'; this.speed = 0;
    this._pose = this.livePose(this.hushPose());
    this.drawFigure(ctx, 0, 0, Math.PI * 0.5 + 0.2, this._pose, { lift: 0, noShadow: false });
  };
})();

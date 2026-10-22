// =========================================================================
// ARENA_ENV.JS — the Abyssal Cathedral around the Vaelgor fight.
// Replaces the old flat disc with a floating ruin: a black-sun eclipse in the far void, drifting nebula and stars, broken rock
// islands, a carved platform with a rock underside and glowing fissures, runic bands and an eclipse sigil, gothic pillars with
// braziers around the rim, and rising embers. The final phase (Pale Eclipse Sanctuary) is the same place bleached to ivory marble
// with gold-and-violet inlay and slow shafts of light.
// The floor is painted once into an off-screen canvas per mood; only the glow, rotating rings, flames and embers move each frame.
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const TAU = Math.PI * 2;
  const TILT = () => (typeof PERSPECTIVE_TILT !== 'undefined' ? PERSPECTIVE_TILT : 0.58);
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const PAL = {
    normal: { floor: ['#2b2040', '#1a1329', '#0c0816'], band: 'rgba(130,105,190,0.10)', seam: 'rgba(0,0,0,0.55)', hi: 'rgba(170,150,230,0.16)', rim: ['#4a3f66', '#241c36'], glow: '255,58,96', glyph: 'rgba(255,90,120,0.8)', side: ['#1b1428', '#07050c'], core: '#07040c' },
    eclipse: { floor: ['#3a1226', '#1f0a17', '#0a040a'], band: 'rgba(200,70,100,0.10)', seam: 'rgba(0,0,0,0.6)', hi: 'rgba(255,110,140,0.14)', rim: ['#5a2438', '#26101a'], glow: '255,40,80', glyph: 'rgba(255,70,100,0.95)', side: ['#2a0f1a', '#08030a'], core: '#050205' },
    final: { floor: ['#fbf7ee', '#ebe4d6', '#b5aec6'], band: 'rgba(120,90,170,0.10)', seam: 'rgba(80,60,110,0.34)', hi: 'rgba(255,255,255,0.45)', rim: ['#fffaf0', '#a79fbb'], glow: '168,85,247', glyph: 'rgba(212,170,90,0.95)', side: ['#d9d1e6', '#4c4466'], core: '#1b1030' }
  };

  const cache = {};
  function layers(mood, R) {
    const key = mood + '|' + R;
    if (cache[key]) return cache[key];
    const S = 1.25, D = Math.ceil((2 * R + 70) * S), C = D / 2, P = PAL[mood], rnd = rng(R * 7 + (mood === 'final' ? 99 : mood === 'eclipse' ? 33 : 11));
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = D; return c; };
    const floor = mk(), glow = mk(), fx = floor.getContext('2d'), gx = glow.getContext('2d');
    // the glow is soft light, so it is kept at about half the floor's resolution (a quarter of the pixels to blend every frame)
    const GR = 0.55; glow.width = glow.height = Math.ceil(D * GR); gx.setTransform(1, 0, 0, 1, 0, 0);
    fx.scale(S, S); fx.translate(C / S, C / S); gx.scale(S * GR, S * GR); gx.translate(C / S, C / S);

    // base stone
    const g0 = fx.createRadialGradient(0, 0, 10, 0, 0, R);
    g0.addColorStop(0, P.floor[0]); g0.addColorStop(0.55, P.floor[1]); g0.addColorStop(1, P.floor[2]);
    fx.fillStyle = g0; fx.beginPath(); fx.arc(0, 0, R, 0, TAU); fx.fill();
    fx.save(); fx.beginPath(); fx.arc(0, 0, R, 0, TAU); fx.clip();

    // concentric paving bands, each cut into slabs
    const bands = [0.16, 0.34, 0.52, 0.70, 0.86, 1.0];
    for (let b = 1; b < bands.length; b++) {
      const r0 = R * bands[b - 1], r1 = R * bands[b], n = 10 + b * 7;
      if (b % 2 === 0) { fx.fillStyle = P.band; fx.beginPath(); fx.arc(0, 0, r1, 0, TAU); fx.arc(0, 0, r0, 0, TAU, true); fx.fill('evenodd'); }
      fx.strokeStyle = P.seam; fx.lineWidth = 2.2; fx.beginPath(); fx.arc(0, 0, r1, 0, TAU); fx.stroke();
      fx.lineWidth = 1.5;
      const off = rnd() * TAU;
      for (let i = 0; i < n; i++) { const a = off + (i / n) * TAU + (b % 2 ? Math.PI / n : 0); fx.beginPath(); fx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); fx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); fx.stroke(); }
      // slab highlights
      fx.strokeStyle = P.hi; fx.lineWidth = 1;
      for (let i = 0; i < n; i++) { const a = off + ((i + 0.08) / n) * TAU; fx.beginPath(); fx.arc(0, 0, r1 - 3, a, a + (TAU / n) * 0.7); fx.stroke(); }
    }
    // weathering: soft dark blotches and hairline cracks
    for (let i = 0; i < 70; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * R, s = 14 + rnd() * 46; const bl = fx.createRadialGradient(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * r, Math.sin(a) * r, s); bl.addColorStop(0, mood === 'final' ? 'rgba(90,70,120,0.10)' : 'rgba(0,0,0,0.20)'); bl.addColorStop(1, 'rgba(0,0,0,0)'); fx.fillStyle = bl; fx.beginPath(); fx.arc(Math.cos(a) * r, Math.sin(a) * r, s, 0, TAU); fx.fill(); }
    fx.strokeStyle = mood === 'final' ? 'rgba(70,50,100,0.38)' : 'rgba(0,0,0,0.55)'; fx.lineWidth = 1.4;
    for (let i = 0; i < 34; i++) { let a = rnd() * TAU, r = R * (0.2 + rnd() * 0.75), x = Math.cos(a) * r, y = Math.sin(a) * r, h = rnd() * TAU; fx.beginPath(); fx.moveTo(x, y); for (let k = 0; k < 6; k++) { h += (rnd() - 0.5) * 1.3; x += Math.cos(h) * (10 + rnd() * 16); y += Math.sin(h) * (10 + rnd() * 16); fx.lineTo(x, y); } fx.stroke(); }

    // glowing fissures (the lit copy goes on the glow layer, which pulses)
    gx.lineCap = 'round'; gx.lineJoin = 'round';
    for (let i = 0; i < 16; i++) {
      let a = rnd() * TAU, r = R * (0.2 + rnd() * 0.15), x = Math.cos(a) * r, y = Math.sin(a) * r, h = a + (rnd() - 0.5) * 0.7;
      const pts = [[x, y]]; const len = 7 + Math.floor(rnd() * 8);
      for (let k = 0; k < len; k++) { h += (rnd() - 0.5) * 0.9; x += Math.cos(h) * (22 + rnd() * 26); y += Math.sin(h) * (22 + rnd() * 26); if (Math.hypot(x, y) > R * 0.97) break; pts.push([x, y]); }
      for (const [w, al] of [[7, 0.10], [3.2, 0.35], [1.3, 0.95]]) { gx.strokeStyle = `rgba(${P.glow},${al})`; gx.lineWidth = w; gx.beginPath(); gx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) gx.lineTo(p[0], p[1]); gx.stroke(); }
      fx.strokeStyle = 'rgba(0,0,0,0.7)'; fx.lineWidth = 3.2; fx.beginPath(); fx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) fx.lineTo(p[0], p[1]); fx.stroke();
    }

    // runic band (a ring of glyphs) between 0.74R and 0.82R
    const glyphN = 54;
    for (let i = 0; i < glyphN; i++) {
      const a = (i / glyphN) * TAU, r0 = R * 0.745, r1 = R * 0.815, k = Math.floor(rnd() * 5);
      const px = (rr, da) => [Math.cos(a + da) * rr, Math.sin(a + da) * rr];
      for (const ctx2 of [fx, gx]) {
        ctx2.strokeStyle = ctx2 === fx ? 'rgba(0,0,0,0.5)' : P.glyph; ctx2.lineWidth = ctx2 === fx ? 3 : 1.6; ctx2.beginPath();
        let p = px(r0, 0), q = px(r1, 0); ctx2.moveTo(p[0], p[1]); ctx2.lineTo(q[0], q[1]);
        if (k === 1) { p = px((r0 + r1) / 2, -0.03); q = px((r0 + r1) / 2, 0.03); ctx2.moveTo(p[0], p[1]); ctx2.lineTo(q[0], q[1]); }
        else if (k === 2) { p = px(r1, -0.025); q = px(r0, 0); const e = px(r1, 0.025); ctx2.moveTo(p[0], p[1]); ctx2.lineTo(q[0], q[1]); ctx2.lineTo(e[0], e[1]); }
        else if (k === 3) { p = px(r0, 0.025); q = px(r1, 0.025); ctx2.moveTo(p[0], p[1]); ctx2.lineTo(q[0], q[1]); }
        else if (k === 4) { p = px(r0, -0.025); q = px(r1, -0.025); ctx2.moveTo(p[0], p[1]); ctx2.lineTo(q[0], q[1]); }
        ctx2.stroke();
      }
    }
    for (const [rr, w, al] of [[0.745, 2.4, 0.75], [0.815, 2.4, 0.75], [0.34, 2, 0.55], [0.5, 1.4, 0.4]]) { gx.strokeStyle = `rgba(${P.glow},${al})`; gx.lineWidth = w; gx.beginPath(); gx.arc(0, 0, R * rr, 0, TAU); gx.stroke(); }
    if (mood === 'final') { gx.strokeStyle = 'rgba(212,170,90,0.9)'; gx.lineWidth = 2.2; gx.beginPath(); gx.arc(0, 0, R * 0.78, 0, TAU); gx.stroke(); }

    // outer rim (raised carved lip)
    const rg = fx.createRadialGradient(0, 0, R - 34, 0, 0, R);
    rg.addColorStop(0, P.rim[1]); rg.addColorStop(0.6, P.rim[0]); rg.addColorStop(1, P.rim[1]);
    fx.fillStyle = rg; fx.beginPath(); fx.arc(0, 0, R, 0, TAU); fx.arc(0, 0, R - 34, 0, TAU, true); fx.fill('evenodd');
    fx.strokeStyle = 'rgba(0,0,0,0.65)'; fx.lineWidth = 2; fx.beginPath(); fx.arc(0, 0, R - 34, 0, TAU); fx.stroke();
    fx.strokeStyle = mood === 'final' ? 'rgba(212,170,90,0.95)' : 'rgba(210,190,255,0.35)'; fx.lineWidth = 2; fx.beginPath(); fx.arc(0, 0, R - 2, 0, TAU); fx.stroke();
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; fx.strokeStyle = 'rgba(0,0,0,0.5)'; fx.lineWidth = 2; fx.beginPath(); fx.moveTo(Math.cos(a) * (R - 33), Math.sin(a) * (R - 33)); fx.lineTo(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3)); fx.stroke(); }
    fx.restore();

    // the central dais with the Black Sun sigil
    const dr = R * 0.16;
    const dg = fx.createRadialGradient(0, 0, 4, 0, 0, dr);
    dg.addColorStop(0, P.core); dg.addColorStop(0.8, mood === 'final' ? '#2a1a48' : '#150d22'); dg.addColorStop(1, mood === 'final' ? '#8a7ab0' : '#3a2c58');
    fx.fillStyle = dg; fx.beginPath(); fx.arc(0, 0, dr, 0, TAU); fx.fill();
    fx.strokeStyle = 'rgba(0,0,0,0.6)'; fx.lineWidth = 2.5; fx.beginPath(); fx.arc(0, 0, dr, 0, TAU); fx.stroke();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; for (const ctx2 of [gx]) { ctx2.strokeStyle = `rgba(${P.glow},${i % 2 ? 0.45 : 0.85})`; ctx2.lineWidth = i % 2 ? 1.2 : 2; ctx2.beginPath(); ctx2.moveTo(Math.cos(a) * dr * 0.5, Math.sin(a) * dr * 0.5); ctx2.lineTo(Math.cos(a) * dr * (i % 2 ? 0.8 : 0.96), Math.sin(a) * dr * (i % 2 ? 0.8 : 0.96)); ctx2.stroke(); } }
    gx.strokeStyle = `rgba(${P.glow},0.9)`; gx.lineWidth = 2.4; gx.beginPath(); gx.arc(0, 0, dr, 0, TAU); gx.stroke();
    fx.fillStyle = '#020104'; fx.beginPath(); fx.arc(0, 0, dr * 0.42, 0, TAU); fx.fill();
    gx.strokeStyle = 'rgba(255,230,210,0.85)'; gx.lineWidth = 2.2; gx.beginPath(); gx.arc(0, 0, dr * 0.44, 0, TAU); gx.stroke();

    return (cache[key] = { floor, glow, S, C, D });
  }

  // far-away things that never change: stars, nebula, rock islands, pillars
  function scenery(R) {
    if (scenery.R === R) return scenery.d;
    const rnd = rng(4242), d = { stars: [], isles: [], pillars: [], neb: [] };
    for (let i = 0; i < 170; i++) { const a = rnd() * TAU, r = R * (1.15 + rnd() * 3.2); d.stars.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62, s: 0.6 + rnd() * 1.8, p: rnd() * TAU, sp: 0.5 + rnd() * 2 }); }
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + (rnd() - 0.5) * 0.18, r = R * (1.2 + rnd() * 1.1), sz = 22 + rnd() * 70, pts = [];
      const n = 7 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) { const aa = (k / n) * TAU, rr = sz * (0.62 + rnd() * 0.5); pts.push([Math.cos(aa) * rr, Math.sin(aa) * rr * 0.55]); }
      d.isles.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62, sz, pts, ph: rnd() * TAU, sp: 0.25 + rnd() * 0.5, depth: 30 + rnd() * 60 });
    }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.26; d.pillars.push({ a, x: Math.cos(a) * (R + 36), y: Math.sin(a) * (R + 36), back: Math.sin(a) < 0.15, h: 150 + (i % 3) * 36, ph: rnd() * TAU }); }
    for (let i = 0; i < 7; i++) { const a = rnd() * TAU, r = R * (0.9 + rnd() * 1.6); d.neb.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55, r: R * (0.5 + rnd() * 0.7), h: rnd(), ph: rnd() * TAU }); }
    scenery.R = R; scenery.d = d; return d;
  }

  // ---- pre-rendered pieces, so a frame is mostly drawImage calls and no gradient is built while playing ----------------------
  const spr = {};
  const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  function radial(key, size, stops) {
    if (spr[key]) return spr[key];
    const c = mkc(size, size), x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size); return (spr[key] = c);
  }
  const NEB = { vio: '150,70,230', rose: '230,60,120', crim: '255,50,70', pale: '190,140,255', plum: '110,40,190' };
  const nebSprite = (k) => radial('neb' + k, 128, [[0, `rgba(${NEB[k]},0.9)`], [1, `rgba(${NEB[k]},0)`]]);
  const glowSprite = (k, rgb) => radial('gl' + k, 128, [[0, `rgba(${rgb},0.95)`], [0.4, `rgba(${rgb},0.35)`], [1, `rgba(${rgb},0)`]]);

  // the void: a soft gradient image over a flat colour (replaces a 12000px gradient fill every frame)
  function voidSprite(kind) {
    return radial('void' + kind, 256, kind === 'final'
      ? [[0, 'rgba(110,90,160,1)'], [0.35, 'rgba(60,45,110,0.85)'], [1, 'rgba(10,7,22,0)']]
      : kind === 'ecl'
        ? [[0, 'rgba(96,22,48,1)'], [0.4, 'rgba(48,10,28,0.8)'], [1, 'rgba(3,2,7,0)']]
        : [[0, 'rgba(46,18,70,1)'], [0.4, 'rgba(24,9,40,0.8)'], [1, 'rgba(3,2,7,0)']]);
  }
  function coronaSprite(kind, er) {
    const key = 'cor' + kind + Math.round(er), S2 = Math.ceil(er * 5.2);
    if (spr[key]) return spr[key];
    const c = mkc(S2, S2), x = c.getContext('2d'), g = x.createRadialGradient(S2 / 2, S2 / 2, er * 0.9, S2 / 2, S2 / 2, S2 / 2);
    g.addColorStop(0, kind === 'final' ? 'rgba(255,230,190,0.55)' : kind === 'ecl' ? 'rgba(255,80,90,0.62)' : 'rgba(255,150,130,0.42)'); g.addColorStop(1, 'rgba(120,40,150,0)');
    x.fillStyle = g; x.fillRect(0, 0, S2, S2); return (spr[key] = c);
  }
  function raySprite(er) {
    const key = 'ray' + Math.round(er), S2 = Math.ceil(er * 4.4);
    if (spr[key]) return spr[key];
    const c = mkc(S2, S2), x = c.getContext('2d'); x.translate(S2 / 2, S2 / 2);
    for (let i = 0; i < 24; i++) { x.rotate(TAU / 24); const l = er * (1.5 + 0.6 * ((i * 7) % 5) / 5); const g = x.createLinearGradient(0, -er, 0, -l); g.addColorStop(0, 'rgba(255,190,150,0.28)'); g.addColorStop(1, 'rgba(255,190,150,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(-6, -er); x.lineTo(6, -er); x.lineTo(0, -l); x.fill(); }
    return (spr[key] = c);
  }
  // the rock underside of the platform, with the platform's own shape; origin at the centre of the top face
  function underside(mood, R, tilt) {
    const key = 'under' + mood + R, W = Math.ceil(2 * R + 60), H = Math.ceil(R * tilt * 2 + 330);
    if (spr[key]) return spr[key];
    const c = mkc(W, H), x = c.getContext('2d'); x.translate(W / 2, R * tilt + 20);
    const sc = PAL[mood === 'final' ? 'final' : 'normal'].side;
    for (let i = 5; i >= 0; i--) {
      const f = 1 - i * 0.07, off = 38 + i * 34, rr = R * f, cy = off;
      const sg = x.createLinearGradient(0, cy - rr * tilt, 0, cy + rr * tilt); sg.addColorStop(0, sc[0]); sg.addColorStop(1, sc[1]);
      x.fillStyle = sg; x.beginPath(); x.ellipse(0, cy, rr, rr * tilt, 0, 0, TAU); x.fill();
      x.strokeStyle = mood === 'final' ? 'rgba(212,170,90,0.4)' : 'rgba(0,0,0,0.6)'; x.lineWidth = 2; x.stroke();
    }
    return (spr[key] = { c, W, H, oy: R * tilt + 20 });
  }
  function pillarSprite(final, back, h) {
    const key = 'pil' + final + back + h;
    if (spr[key]) return spr[key];
    const w = back ? 38 : 30, W = 120, H = Math.ceil(h + 90), c = mkc(W, H), x = c.getContext('2d'); x.translate(W / 2, H - 14);
    const stone = x.createLinearGradient(-w, 0, w, 0);
    if (final) { stone.addColorStop(0, '#9d95b4'); stone.addColorStop(0.45, '#f4eee2'); stone.addColorStop(1, '#8b83a6'); } else { stone.addColorStop(0, '#0b0813'); stone.addColorStop(0.45, '#2a2140'); stone.addColorStop(1, '#0a0711'); }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(0, 4, w * 1.2, w * 0.4, 0, 0, TAU); x.fill();
    x.fillStyle = stone; x.beginPath(); x.moveTo(-w * 0.7, 0); x.lineTo(-w * 0.55, -h * 0.9); x.lineTo(0, -h - (back ? 24 : 0)); x.lineTo(w * 0.55, -h * 0.9); x.lineTo(w * 0.7, 0); x.closePath(); x.fill();
    x.strokeStyle = final ? 'rgba(212,170,90,0.8)' : 'rgba(190,160,255,0.35)'; x.lineWidth = 1.6; x.stroke();
    if (back) { x.fillStyle = final ? '#7a6f94' : '#14101e'; x.fillRect(-12, -h - 24, 24, 8); }
    return (spr[key] = { c, W, H, ox: W / 2, oy: H - 14 });
  }
  const shaftSprite = (R) => {
    const key = 'shaft' + R; if (spr[key]) return spr[key];
    const c = mkc(R, 200), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, R, 0);
    g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.5, 'rgba(255,240,200,0.14)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 92); x.lineTo(R, 10); x.lineTo(R, 190); x.lineTo(0, 108); x.fill(); return (spr[key] = c);
  };

  // The big soft images (void, nebula, sun corona, underside) are much larger than the screen. Drawing them whole makes the GPU
  // shade dozens of screens' worth of pixels every frame, which is what made slower computers crawl. blit() draws only the part
  // of an image that is on screen, and skips it when none of it is.
  let VIS = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
  function blit(ctx, img, x, y, w, h) {
    const x0 = Math.max(x, VIS.x0), y0 = Math.max(y, VIS.y0), x1 = Math.min(x + w, VIS.x1), y1 = Math.min(y + h, VIS.y1);
    if (x1 <= x0 || y1 <= y0) return;
    const sw = img.width, sh = img.height;
    ctx.drawImage(img, (x0 - x) / w * sw, (y0 - y) / h * sh, (x1 - x0) / w * sw, (y1 - y0) / h * sh, x0, y0, x1 - x0, y1 - y0);
  }
  function updateVis(ctx, cw, ch) {
    try {
      const inv = ctx.getTransform().inverse(), pts = [[0, 0], [cw, 0], [0, ch], [cw, ch]].map(([px, py]) => inv.transformPoint({ x: px, y: py }));
      const pad = 40;
      VIS = { x0: Math.min(...pts.map(p => p.x)) - pad, y0: Math.min(...pts.map(p => p.y)) - pad, x1: Math.max(...pts.map(p => p.x)) + pad, y1: Math.max(...pts.map(p => p.y)) + pad };
    } catch (e) { VIS = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }; }
  }
  const visHit = (cx, cy, r) => !(cx + r < VIS.x0 || cx - r > VIS.x1 || cy + r < VIS.y0 || cy - r > VIS.y1);

  const embers = [];
  let lastT = 0;
  const ORIG = Game25D.prototype.drawRaidArenaEnvironment;   // the plain disc the game shipped with ("Off")

  // How much of the scene to draw. 'auto' starts on full and steps down if the game cannot hold about 40 fps.
  const SP = () => (window.SettingsPlus && window.SettingsPlus.get && window.SettingsPlus.get()) || {};
  let autoLevel = 'full', slow = 0, fast = 0, lastNow = 0;
  function level(game) {
    const want = SP().env || 'auto';
    if (want !== 'auto') return want;
    return autoLevel;
  }
  function watchFps(now, game) {
    if (!lastNow) { lastNow = now; return; }
    const d = now - lastNow; lastNow = now;
    if (d > 0.5 || d <= 0) return;                              // a pause (alt-tab, loading): ignore it
    if (d > 1 / 38) { slow += d; fast = 0; } else { fast += d; slow = Math.max(0, slow - d * 0.5); }
    if (slow > 3 && (SP().env || 'auto') === 'auto' && autoLevel !== 'simple') {
      autoLevel = autoLevel === 'full' ? 'simple' : 'simple'; slow = 0;
      try { if (window.QoL) window.QoL.toast('Arena detail lowered to keep the game smooth. You can change it in Settings > Interface.'); } catch (e) {}
    }
  }

  Game25D.prototype.drawRaidArenaEnvironment = function (ctx) {
    const R = this.arenaRadius, tilt = TILT(), now = performance.now() * 0.001, dt = Math.min(0.05, now - (lastT || now)); lastT = now;
    watchFps(now, this);
    if (this.boss && typeof this.boss.drawArena === 'function') return this.boss.drawArena(ctx, this);   // a boss with its own stage (Ignis)
    const lv = level(this);
    if (lv === 'off') return ORIG.call(this, ctx);
    const boss = this.boss || {};
    const isFinal = !!boss.finalPhaseArena;
    const isEclipse = boss.state === 'eclipse_mechanic';
    // the mood eases between calm and eclipse instead of snapping
    this._eclMix = (this._eclMix || 0) + ((isEclipse ? 1 : 0) - (this._eclMix || 0)) * Math.min(1, dt * 3);
    const mix = this._eclMix, finalMode = isFinal;
    const simple = lv === 'simple';
    const X = 6000;

    ctx.save();
    updateVis(ctx, this.canvas.width, this.canvas.height);
    // ---- the void (flat colour + one soft image)
    ctx.fillStyle = finalMode ? '#0a0716' : '#030207'; ctx.fillRect(VIS.x0, VIS.y0, VIS.x1 - VIS.x0, VIS.y1 - VIS.y0);
    if (!simple) {
      const D = scenery(R), vs = R * 7.4, vy = -R * tilt * 0.5;
      blit(ctx, voidSprite(finalMode ? 'final' : 'calm'), -vs / 2, vy - vs / 2, vs, vs);
      if (!finalMode && mix > 0.02) { ctx.globalAlpha = mix; blit(ctx, voidSprite('ecl'), -vs / 2, vy - vs / 2, vs, vs); ctx.globalAlpha = 1; }

      // stars
      let lastCol = '';
      for (const s of D.stars) { const col = finalMode ? '#fff4d8' : (s.s > 1.8 ? '#ffd9d9' : '#e8e4ff'); if (col !== lastCol) { ctx.fillStyle = col; lastCol = col; } ctx.globalAlpha = (finalMode ? 0.55 : 0.8) * (0.45 + 0.55 * Math.sin(now * s.sp + s.p)); ctx.fillRect(s.x, s.y, s.s, s.s); }
      ctx.globalAlpha = 1;

      // nebula
      ctx.globalCompositeOperation = 'lighter';
      for (const n of D.neb) {
        const drift = Math.sin(now * 0.07 + n.ph) * 40, a = (finalMode ? 0.16 : 0.12 + 0.08 * mix) * 1.2, d2 = n.r * 2;
        if (finalMode) { ctx.globalAlpha = a; blit(ctx, nebSprite('pale'), n.x + drift - n.r, n.y - n.r, d2, d2); }
        else {
          const calm = n.h < 0.5 ? 'vio' : 'rose', hot = n.h < 0.5 ? 'plum' : 'crim';
          ctx.globalAlpha = a * (1 - mix); blit(ctx, nebSprite(calm), n.x + drift - n.r, n.y - n.r, d2, d2);
          if (mix > 0.02) { ctx.globalAlpha = a * mix; blit(ctx, nebSprite(hot), n.x + drift - n.r, n.y - n.r, d2, d2); }
        }
      }
      ctx.globalAlpha = 1;

      // the Black Sun hanging in the far void behind the arena
      const er = R * 0.62, pulse = 1 + 0.025 * Math.sin(now * 1.3), ey = -R * tilt * 1.95;
      const cs = er * 5.2 * pulse;
      const sunSeen = visHit(0, ey, er * 2.6);
      if (sunSeen) {
        blit(ctx, coronaSprite(finalMode ? 'final' : 'calm', er), -cs / 2, ey - cs / 2, cs, cs);
        if (!finalMode && mix > 0.02) { ctx.globalAlpha = mix; blit(ctx, coronaSprite('ecl', er), -cs / 2, ey - cs / 2, cs, cs); ctx.globalAlpha = 1; }
        if (visHit(0, ey, er * 2.2)) {   // 24 plain translucent rays (cheap vector fills, no big image)
          ctx.save(); ctx.translate(0, ey); ctx.rotate(now * 0.02); ctx.fillStyle = 'rgba(255,190,150,0.10)';
          for (let i = 0; i < 24; i++) { ctx.rotate(TAU / 24); const l = er * (1.5 + 0.6 * ((i * 7) % 5) / 5); ctx.beginPath(); ctx.moveTo(-7, -er); ctx.lineTo(7, -er); ctx.lineTo(0, -l); ctx.fill(); }
          ctx.restore();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (visHit(0, ey, er * 1.1)) {
        ctx.strokeStyle = finalMode ? 'rgba(255,240,210,0.95)' : 'rgba(255,205,170,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, ey, er * pulse, 0, TAU); ctx.stroke();
        ctx.fillStyle = finalMode ? '#120a22' : '#010004'; ctx.beginPath(); ctx.arc(0, ey, er * 0.985 * pulse, 0, TAU); ctx.fill();
      }

      // drifting rock islands
      const redGlow = glowSprite('red', '255,60,90');
      for (const ik of D.isles) {
        if (!visHit(ik.x, ik.y, ik.sz * 1.6 + ik.depth + 20)) continue;       // off screen
        const bob = Math.sin(now * ik.sp + ik.ph) * 9;
        ctx.save(); ctx.translate(ik.x, ik.y + bob);
        ctx.fillStyle = finalMode ? '#5d5678' : '#0c0814';
        ctx.beginPath(); ctx.moveTo(ik.pts[0][0], ik.pts[0][1] + ik.depth * 0.25);
        for (const p of ik.pts) ctx.lineTo(p[0] * 0.9, p[1] + ik.depth * 0.3);
        ctx.lineTo(0, ik.depth + ik.sz * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = finalMode ? '#a49cc0' : '#1c1530'; ctx.beginPath(); ctx.moveTo(ik.pts[0][0], ik.pts[0][1]); for (const p of ik.pts) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = finalMode ? 'rgba(255,255,255,0.5)' : 'rgba(180,150,255,0.28)'; ctx.lineWidth = 1.5; ctx.stroke();
        if (!finalMode) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 + 0.1 * mix; ctx.drawImage(redGlow, -ik.sz, ik.depth * 0.6 - ik.sz, ik.sz * 2, ik.sz * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        ctx.restore();
      }

      // the rock underside of the platform (pre-rendered), with the magma glow leaking from it
      const U = underside(finalMode ? 'final' : 'calm', R, tilt);
      blit(ctx, U.c, -U.W / 2, -U.oy, U.W, U.H);
      if (!finalMode) {
        const ms = R * 1.9; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now * 2);
        blit(ctx, glowSprite('red', '255,60,90'), -ms / 2, 120 - ms * tilt / 2, ms, ms * tilt); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }

    // ---- the floor (calm and eclipse variants cross-fade) and its glow
    ctx.save(); ctx.scale(1, tilt);
    const draws = finalMode ? [['final', 1]] : (mix > 0.01 ? [['normal', 1], ['eclipse', mix]] : [['normal', 1]]);
    for (const [m, al] of draws) {
      const L = layers(m, R), half = L.D / L.S / 2;
      ctx.globalAlpha = al; ctx.drawImage(L.floor, -half, -half, half * 2, half * 2); ctx.globalAlpha = 1;
    }
    const gp = 0.55 + 0.45 * Math.sin(now * 1.7) * 0.5 + 0.2 * mix;
    if (!simple) {   // Simple keeps just the painted floor: no blended glow layer
      ctx.globalCompositeOperation = 'lighter';
      for (const [m, al] of draws) { const L = layers(m, R), half = L.D / L.S / 2; ctx.globalAlpha = Math.min(1, gp * al * (m === 'eclipse' ? 1.2 : 1)); ctx.drawImage(L.glow, -half, -half, half * 2, half * 2); }
      ctx.globalAlpha = 1;
    }
    if (!simple) {
      const ringRgb = finalMode ? '212,170,90' : (mix > 0.5 ? '255,70,100' : '190,140,255');
      for (const [rr, spd, n, len] of [[R * 0.27, 0.22, 12, 14], [R * 0.64, -0.12, 20, 18]]) {
        ctx.save(); ctx.rotate(now * spd);
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU; ctx.strokeStyle = `rgba(${ringRgb},${0.35 + 0.3 * Math.sin(now * 2 + i)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); ctx.lineTo(Math.cos(a) * (rr + len), Math.sin(a) * (rr + len)); ctx.stroke(); }
        ctx.strokeStyle = `rgba(${ringRgb},0.28)`; ctx.setLineDash([6, 12]); ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
      const hr = R * 0.4; ctx.globalAlpha = 0.45 + 0.3 * Math.sin(now * 2.2); ctx.drawImage(glowSprite('core' + (finalMode ? 'f' : mix > 0.5 ? 'e' : 'c'), ringRgb), -hr / 2, -hr / 2, hr, hr); ctx.globalAlpha = 1;
      if (finalMode) {
        const sh = shaftSprite(Math.round(R)); ctx.save(); ctx.rotate(now * 0.08);
        for (let i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.drawImage(sh, 0, -100, R, 200); }
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (mix > 0.01) { ctx.strokeStyle = `rgba(255,50,80,${0.55 * mix})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); }
    ctx.restore();   // end of tilt scale

    // ---- pillars and braziers around the rim (upright, so drawn outside the tilt)
    if (!simple) {
      const D = scenery(R), fireGl = glowSprite('fire', '255,150,100'), fireGlF = glowSprite('firef', '220,190,255'), fireGlE = glowSprite('firee', '255,90,70');
      for (const p of D.pillars) {
        if (!visHit(p.x, p.y * tilt - 120, 200)) continue;
        const h = p.back ? p.h : 38, spP = pillarSprite(finalMode, p.back, h), px = p.x, py = p.y * tilt;
        const flick = 0.75 + 0.25 * Math.sin(now * 9 + p.ph) + 0.1 * Math.sin(now * 23 + p.ph * 2);
        ctx.drawImage(spP.c, px - spP.ox, py - spP.oy);
        if (!p.back) continue;
        const wg = finalMode ? '168,85,247' : (mix > 0.5 ? '255,50,80' : '255,80,110');
        for (const yy of [-h * 0.3, -h * 0.58]) { ctx.fillStyle = `rgba(${wg},${0.7 * flick})`; ctx.beginPath(); ctx.moveTo(px - 5, py + yy + 16); ctx.lineTo(px - 5, py + yy); ctx.lineTo(px, py + yy - 12); ctx.lineTo(px + 5, py + yy); ctx.lineTo(px + 5, py + yy + 16); ctx.fill(); }
        const bx = px, by = py - h - 30, fs = 140 * flick;
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(finalMode ? fireGlF : (mix > 0.5 ? fireGlE : fireGl), bx - fs / 2, by - fs / 2, fs, fs);
        ctx.fillStyle = finalMode ? '#efe4ff' : '#ffd9a0'; ctx.beginPath(); ctx.moveTo(bx - 8, by + 8); ctx.quadraticCurveTo(bx - 4, by - 10 * flick, bx, by - 24 * flick); ctx.quadraticCurveTo(bx + 5, by - 8, bx + 8, by + 8); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      // ---- embers drifting up from the platform
      const want = finalMode ? 28 : 40 + Math.round(20 * mix);
      while (embers.length < want) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * R * 1.2; embers.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * tilt, z: Math.random() * 30, vz: 18 + Math.random() * 40, s: 1 + Math.random() * 2, life: 4 + Math.random() * 5, t: Math.random() * 5, ph: Math.random() * TAU }); }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]; e.t += dt; e.z += e.vz * dt; if (e.t > e.life) { embers.splice(i, 1); continue; }
        const al = Math.min(1, e.t * 2, (e.life - e.t) * 1.5), sx = e.x + Math.sin(now * 0.8 + e.ph) * 10;
        ctx.fillStyle = finalMode ? `rgba(255,236,190,${0.7 * al})` : (e.s > 2 ? `rgba(255,120,80,${0.8 * al})` : `rgba(200,150,255,${0.7 * al})`);
        ctx.fillRect(sx, e.y - e.z, e.s, e.s);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  };
})();

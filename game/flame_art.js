// =============================================================================================================================
// FLAME_ART.JS — hand-drawn, anime-style fire for any boss or effect (window.FlameArt).
// Fire is built from curling TONGUES: flat bands of crimson -> orange -> amber -> pale core over a dark maroon shadow, with hooked
// tips that break off and drift up, plus leaf-shaped embers. Normal blending (it reads as a solid thing, not as light); only a
// faint warm underlight is additive. Everything takes screen positions; ground shapes take the camera tilt.
// =============================================================================================================================
(function () {
  const TAU = Math.PI * 2;
  const PAL = {
    fire: { shadow: '#4a0a12', outer: '#c8241a', mid: '#ff5e14', inner: '#ffa524', core: '#ffe9a0', glow: '255,110,30' },
    gold: { shadow: '#5a2008', outer: '#e0500c', mid: '#ff9418', inner: '#ffd23c', core: '#fffbe0', glow: '255,170,60' },
    violet: { shadow: '#24083d', outer: '#6d1fc0', mid: '#a855f7', inner: '#d8b4fe', core: '#faf5ff', glow: '168,85,247' },
    pink: { shadow: '#4f0a28', outer: '#be185d', mid: '#f43f5e', inner: '#f9a8d4', core: '#fff1f2', glow: '244,114,182' }
  };
  const frac = (v) => v - Math.floor(v);
  const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);

  // the outline of one tongue rising from (x, y): half-width w at the base, height h, drifting sideways by `lean`,
  // its tip hooked by `curl`; it writhes with time
  // (begin = false adds it to the current path, so a whole fire can be filled one colour at a time)
  const N = 8, LX = new Float32Array(N + 1), RX = new Float32Array(N + 1), CY = new Float32Array(N + 1);
  const SHAPE = []; for (let i = 0; i <= N; i++) { const s = i / N; SHAPE.push([s, s * s, Math.pow(s, 2.5), Math.pow(1 - s, 1.15) * (1 + 0.45 * Math.sin(s * Math.PI * 0.9))]); }
  function tonguePath(ctx, x, y, w, h, lean, curl, t, seed, begin = true) {
    const p1 = t * 6.2 + seed * 3.1, p2 = t * 10.5 + seed;
    for (let i = 0; i <= N; i++) {
      const [s, s2, s25, wk] = SHAPE[i];
      const wob = Math.sin(p1 + s * 4.2) * w * 0.7 * s + Math.sin(p2 + s * 7) * w * 0.2 * s;
      const cx = x + lean * h * 0.45 * s2 + wob + curl * w * 2.4 * s25, ww = w * wk;
      LX[i] = cx - ww; RX[i] = cx + ww; CY[i] = y - h * s;
    }
    if (begin) ctx.beginPath();
    ctx.moveTo(LX[0], CY[0]);
    for (let i = 1; i <= N; i++) ctx.quadraticCurveTo(LX[i - 1], CY[i - 1], (LX[i] + LX[i - 1]) / 2, (CY[i] + CY[i - 1]) / 2);
    ctx.lineTo(LX[N], CY[N]);
    for (let i = N - 1; i >= 0; i--) ctx.quadraticCurveTo(RX[i + 1], CY[i + 1], (RX[i] + RX[i + 1]) / 2, (CY[i] + CY[i + 1]) / 2);
    ctx.lineTo(RX[0], CY[0]);
    ctx.quadraticCurveTo(x, y + w * 0.5, LX[0], CY[0]);
    ctx.closePath();
  }
  // the per-frame state of one tongue (how tall it is in its life cycle, which way it leans and hooks)
  function prep(f, t) {
    const o = f.o || {}, seed = f.seed;
    const life = frac(t * (o.rate || 0.85) + hash(seed));
    return {
      x: f.x, y: f.y, w: f.w, seed, life,
      H: f.h * (0.7 + 0.42 * Math.sin(life * Math.PI)) * (0.92 + 0.08 * Math.sin(t * 17 + seed * 5)),
      lean: (o.lean || 0) + Math.sin(t * 1.6 + seed) * 0.22,
      curl: (hash(seed + 1) < 0.5 ? -1 : 1) * (0.45 + 0.55 * hash(seed + 2))
    };
  }
  const BANDS = [[1, 1, 'outer'], [0.74, 0.84, 'mid'], [0.5, 0.62, 'inner'], [0.26, 0.36, 'core']];

  // one living tongue of fire. o: { pal, alpha, lean, rate, shadow (bool), detach (bool), layers (2..4) }
  function tongue(ctx, x, y, h, w, t, seed, o = {}) {
    if (h < 2 || w < 0.6) return;
    const pal = PAL[o.pal] || PAL.fire, A = o.alpha == null ? 1 : o.alpha;
    if (A <= 0.01) return;
    const life = frac(t * (o.rate || 0.85) + hash(seed));
    const H = h * (0.7 + 0.42 * Math.sin(life * Math.PI)) * (0.92 + 0.08 * Math.sin(t * 17 + seed * 5));
    const lean = (o.lean || 0) + Math.sin(t * 1.6 + seed) * 0.22;
    const curl = (hash(seed + 1) < 0.5 ? -1 : 1) * (0.45 + 0.55 * hash(seed + 2));
    const base = ctx.globalAlpha;
    if (o.shadow !== false) {
      ctx.globalAlpha = base * A * 0.6; ctx.fillStyle = pal.shadow;
      tonguePath(ctx, x + w * 0.2, y + 1, w * 1.3, H * 1.1, lean, curl, t, seed); ctx.fill();
    }
    ctx.globalAlpha = base * A;
    const layers = o.layers || 4;
    for (const [kw, kh, key] of BANDS.slice(0, layers)) {
      ctx.fillStyle = pal[key];
      tonguePath(ctx, x + (1 - kw) * w * 0.15 * curl, y, w * kw, H * kh, lean * (0.6 + 0.4 * kw), curl * kw, t, seed);
      ctx.fill();
    }
    // a hooked lick that breaks off the tip and drifts up, shrinking
    if (o.detach !== false && life > 0.5) {
      const d = (life - 0.5) / 0.5, s = 1 - d;
      const tx = x + lean * H * 0.5 + curl * w * (1.3 + d), ty = y - H * (0.95 + 0.45 * d);
      ctx.globalAlpha = base * A * s;
      ctx.fillStyle = pal.outer; tonguePath(ctx, tx, ty, w * 0.42 * s, H * 0.3 * s, lean, -curl, t, seed + 9); ctx.fill();
      ctx.fillStyle = pal.inner; tonguePath(ctx, tx, ty, w * 0.2 * s, H * 0.18 * s, lean, -curl, t, seed + 9); ctx.fill();
    }
    ctx.globalAlpha = base;
  }

  // a leaf/teardrop ember
  function ember(ctx, x, y, s, rot, pal, a) {
    const P = PAL[pal] || PAL.fire;
    if (a <= 0.01 || s < 0.3) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= a;
    ctx.fillStyle = P.mid;
    ctx.beginPath(); ctx.moveTo(0, -s * 1.9); ctx.quadraticCurveTo(s * 1.1, -s * 0.2, 0, s); ctx.quadraticCurveTo(-s * 1.1, -s * 0.2, 0, -s * 1.9); ctx.fill();
    ctx.fillStyle = P.core; ctx.beginPath(); ctx.ellipse(0, -s * 0.15, s * 0.32, s * 0.6, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // a faint warm light on the ground under a fire (the only additive part)
  function underlight(ctx, x, y, r, tilt, pal, a) {
    const P = PAL[pal] || PAL.fire;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${P.glow},${0.22 * a})`); g.addColorStop(1, `rgba(${P.glow},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
  }

  // scorched, glowing ground under a fire: a ragged dark-red bed with an orange inner (flat colours, no gradient)
  function bedPath(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  function groundBed(ctx, x, y, r, tilt, t, seed, pal, a) {
    const P = PAL[pal] || PAL.fire, n = 16;
    const mk = (k) => { const pts = []; for (let i = 0; i < n; i++) { const an = i * TAU / n, rr = r * k * (0.78 + 0.3 * hash(seed + i) + 0.05 * Math.sin(t * 3 + i)); pts.push([x + Math.cos(an) * rr, y + Math.sin(an) * rr * tilt]); } return pts; };
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = P.shadow; ctx.globalAlpha *= 0.75; bedPath(ctx, mk(1)); ctx.fill();
    ctx.globalAlpha /= 0.75; ctx.fillStyle = P.outer; ctx.globalAlpha *= 0.55; bedPath(ctx, mk(0.62)); ctx.fill();
    ctx.restore();
  }

  // a continuous rolling body of flame along a run of screen points (base line), so a fire reads as one sheet, not separate flames
  function sheet(ctx, pts, h, t, seed, pal, A) {
    if (pts.length < 2 || A <= 0.01 || h < 3) return;
    const P = PAL[pal] || PAL.fire, base = ctx.globalAlpha;
    for (const [kh, col, al] of [[1, P.shadow, 0.55], [0.82, P.outer, 0.95], [0.55, P.mid, 1], [0.28, P.inner, 1]]) {
      ctx.globalAlpha = base * A * al; ctx.fillStyle = col; ctx.beginPath();
      const top = pts.map(([px, py], i) => [px, py - h * kh * (0.55 + 0.45 * Math.sin(t * 4.3 + seed + i * 1.9) * Math.sin(t * 2.1 + i * 0.7 + seed * 2))]);
      ctx.moveTo(pts[0][0], pts[0][1] + 2);
      ctx.lineTo(top[0][0], top[0][1]);
      for (let i = 1; i < top.length; i++) ctx.quadraticCurveTo(top[i - 1][0], top[i - 1][1], (top[i][0] + top[i - 1][0]) / 2, (top[i][1] + top[i - 1][1]) / 2);
      ctx.lineTo(top[top.length - 1][0], top[top.length - 1][1]);
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1] + 2);
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] + 3);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = base;
  }

  // draw a list of tongues back-to-front, skipping any that are off screen (one small fill each is cheaper for the
  // rasteriser than batching them into one big overlapping path — measured 3.5x)
  function onScreen(ctx, x, y, pad) {
    const m = ctx.getTransform(), sx = m.a * x + m.c * y + m.e, sy = m.b * x + m.d * y + m.f, cw = ctx.canvas.width, ch = ctx.canvas.height;
    return sx > -pad && sx < cw + pad && sy > -pad && sy < ch + pad * 2.5;
  }
  function drawSet(ctx, list, t) {
    list.sort((p, q) => p.y - q.y);
    const m = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height;
    for (const f of list) {
      const sx = m.a * f.x + m.c * f.y + m.e, sy = m.b * f.x + m.d * f.y + m.f, pad = 40 + f.h * Math.abs(m.d);
      if (sx < -pad || sx > cw + pad || sy < -pad || sy > ch + pad * 2.5) continue;
      tongue(ctx, f.x, f.y, f.h, f.w, t, f.seed, f.o);
    }
  }

  // fire filling a lane on the ground from (x, y) along angle a. o: { h, w, pal, alpha, from (0..1), to (0..1), lean, bed, spacing }
  function lane(ctx, x, y, a, len, hw, tilt, t, seed, o = {}) {
    const sp = o.spacing || 14, n = Math.max(2, Math.round(len / sp)), list = [], A = o.alpha == null ? 1 : o.alpha;
    const from = o.from || 0, to = o.to == null ? 1 : o.to, ca = Math.cos(a), sa = Math.sin(a);
    if (o.bed !== false) {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, tilt); ctx.rotate(a); ctx.globalAlpha *= A;
      const P = PAL[o.pal] || PAL.fire;
      const edge = (side, k) => { const pts = []; for (let i = 0; i <= 12; i++) { const s = from + (to - from) * i / 12; pts.push([s * len, side * hw * k * (0.75 + 0.35 * hash(seed + i * 3 + side))]); } return pts; };
      for (const [k, col, al] of [[1, P.shadow, 0.7], [0.55, P.outer, 0.5]]) {
        const top = edge(-1, k), bot = edge(1, k).reverse();
        ctx.fillStyle = col; ctx.globalAlpha = A * al; bedPath(ctx, top.concat(bot)); ctx.fill();
      }
      ctx.restore();
    }
    const H = o.h == null ? 42 : o.h, W = o.w == null ? 12 : o.w;
    if (H > 3 && o.sheet !== false) {
      const pts = [], m = Math.max(2, Math.round(len * (to - from) / 12));
      for (let i = 0; i <= m; i++) { const d = (from + (to - from) * i / m) * len; pts.push([x + ca * d, y + sa * d * tilt]); }
      sheet(ctx, pts, H * 0.55, t, seed, o.pal, A);
    }
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) / n; if (s < from || s > to) continue;
      const lat = (hash(seed + i * 7.3) - 0.5) * 1.5 * hw, d = s * len;
      const edgeFade = Math.min(1, (s - from) * len / 30, (to - s) * len / 30);
      list.push({ x: x + ca * d - sa * lat, y: y + (sa * d + ca * lat) * tilt, h: H * (0.5 + 0.8 * hash(seed + i)) * (0.5 + 0.5 * edgeFade), w: W * (0.75 + 0.5 * hash(seed + i + 3)), seed: seed + i * 1.37, o: { pal: o.pal, alpha: A, lean: o.lean || 0 } });
    }
    drawSet(ctx, list, t);
  }

  // fire filling a disc on the ground
  function patch(ctx, x, y, r, tilt, t, seed, o = {}) {
    const A = o.alpha == null ? 1 : o.alpha, n = Math.max(3, Math.round((r * r) / (o.density || 260))), list = [];
    if (o.bed !== false) groundBed(ctx, x, y, r, tilt, t, seed, o.pal, A);
    for (let i = 0; i < n; i++) {
      const an = i * 2.39996 + seed, rr = r * 0.85 * Math.sqrt((i + 0.5) / n);
      list.push({ x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr * tilt, h: (o.h || 40) * (0.55 + 0.75 * hash(seed + i)) * (1 - 0.35 * rr / r), w: (o.w || 12) * (0.75 + 0.5 * hash(seed + i + 3)), seed: seed + i * 1.91, o: { pal: o.pal, alpha: A, lean: o.lean || 0 } });
    }
    drawSet(ctx, list, t);
  }

  // a ring of fire on the ground (radius R). o.out leans the tongues outward (explosions)
  function ring(ctx, x, y, R, tilt, t, seed, o = {}) {
    const A = o.alpha == null ? 1 : o.alpha, n = Math.max(6, Math.round(R * TAU / (o.spacing || 18))), list = [];
    const H = o.h == null ? 40 : o.h, W = o.w == null ? 11 : o.w;
    // the back half of the ring's flame body, then all the tongues, then the front half over them
    const arcPts = (a0, a1) => { const pts = [], m = Math.max(4, Math.round(R * (a1 - a0) / 12)); for (let i = 0; i <= m; i++) { const an = a0 + (a1 - a0) * i / m; pts.push([x + Math.cos(an) * R, y + Math.sin(an) * R * tilt]); } return pts; };
    if (o.sheet !== false && H > 3) sheet(ctx, arcPts(Math.PI, TAU), H * 0.6, t, seed, o.pal, A);
    for (let i = 0; i < n; i++) {
      const an = i * TAU / n + seed * 0.1, ca = Math.cos(an);
      list.push({ x: x + ca * R, y: y + Math.sin(an) * R * tilt, h: H * (0.55 + 0.7 * hash(seed + i)), w: W * (0.75 + 0.5 * hash(seed + i + 5)), seed: seed + i * 1.13, o: { pal: o.pal, alpha: A, lean: (o.out || 0) * ca, shadow: o.shadow } });
    }
    drawSet(ctx, list, t);
    if (o.sheet !== false && H > 3) sheet(ctx, arcPts(0, Math.PI), H * 0.6, t, seed + 3, o.pal, A);
  }

  // a fireball: a layered ball with flames licking off its back (dir = travel angle on screen; default: rising)
  function ball(ctx, x, y, r, t, seed, o = {}) {
    const P = PAL[o.pal] || PAL.fire, A = o.alpha == null ? 1 : o.alpha;
    const back = (o.dir == null ? Math.PI / 2 : o.dir) + Math.PI;
    ctx.save(); ctx.globalAlpha *= A;
    // the trailing flames
    ctx.save(); ctx.translate(x, y); ctx.rotate(back + Math.PI / 2);
    tongue(ctx, 0, r * 0.4, r * 3.4, r * 1.05, t, seed, { pal: o.pal, shadow: false, rate: 1.6 });
    tongue(ctx, -r * 0.5, r * 0.5, r * 2.2, r * 0.6, t, seed + 4, { pal: o.pal, shadow: false, rate: 1.9, detach: false });
    tongue(ctx, r * 0.5, r * 0.5, r * 2.0, r * 0.55, t, seed + 8, { pal: o.pal, shadow: false, rate: 2.1, detach: false });
    ctx.restore();
    for (const [k, col] of [[1, P.outer], [0.78, P.mid], [0.55, P.inner], [0.3, P.core]]) {
      ctx.fillStyle = col; ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const an = i * TAU / 10, rr = r * k * (0.9 + 0.12 * Math.sin(t * 14 + i * 2 + seed)); i ? ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr) : ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  window.FlameArt = { PAL, tongue, tonguePath, prep, ember, underlight, groundBed, sheet, lane, patch, ring, ball, drawSet, onScreen, hash };
})();

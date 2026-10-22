// =========================================================================
// IDENTITY_GAUGES.JS — every class's identity gauge (the widget next to the [Z] slot) drawn in its own shape:
//   Breaker     a GREATSWORD laid on its side that heats up from the hilt to the tip (gold and draining during Surge)
//   Gravebreaker a MOMENTUM DIAL: three arcs and a needle (white-hot during Overload)
//   Reaper      (unchanged: the glass blood sphere, see reaper_hud.js)
//   Arclight    a hexagonal REACTOR CORE: twelve cells light around the rim, a core burns in the middle
//   Unbound     a cracked LIMITER CUFF: the cracks light up in the colour of the Release that is winning, a thin strip under it shows the mix
// Rule for new classes: pick a shape no other class uses (see the unique-class-gauges memory). The older HUD files keep updating their
// own hidden elements (kept below as invisible stubs), so nothing they write to goes missing.
// =========================================================================
(function () {
  const css = `
  .identity-zone.ig-zone { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; column-gap: 10px; }
  .ig-zone .ig-l { justify-self: end; }
  .ig-zone .ig-r { justify-self: start; display: flex; align-items: center; gap: 8px; }
  .ig-zone .ig-cv { flex: 0 0 auto; display: block; }
  .ig-zone .ig-side { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ig-zone .ig-stub { display: none; }
  .ig-zone .al-mode { align-self: flex-start; flex-direction: row; align-items: baseline; gap: 8px; min-width: 0; padding: 3px 9px; }
  .ig-zone .momentum-status { text-align: left; max-width: 150px; line-height: 1.25; }
  `;
  let injected = false;
  const inject = () => { if (injected) return; injected = true; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
  const c01 = (t) => Math.max(0, Math.min(1, t));
  const rgba = (h, a) => { const n = parseInt(String(h).replace('#', ''), 16) || 0; return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const stub = (ids) => `<div class="ig-stub">${ids.map(i => `<i id="${i}"></i>`).join('')}</div>`;

  function prep(cv, w, h) {
    const dpr = 2;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    if (cv.style.width !== w + 'px') { cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }
  const poly = (ctx, pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };

  // ---------------------------------------------------------------- BREAKER: the greatsword
  function drawSword(cv, p) {
    const W = 230, H = 58, ctx = prep(cv, W, H), t = performance.now() * 0.001;
    const surge = !!p.overpowerSurge;
    const f = surge ? c01(p.surgeTimer / 14) : c01(p.overpower / (p.maxOverpower || 100));
    const ready = !surge && f >= 0.995;
    const cy = 30, bx0 = 46, bx1 = 224;
    const half = (x) => { const u = (x - bx0) / (bx1 - bx0); return u < 0.8 ? 12 - 3.5 * u : 9.2 * (1 - (u - 0.8) / 0.2); };
    const bladePath = () => { const top = [], bot = []; for (let x = bx0; x <= bx1; x += 6) { top.push([x, cy - half(x)]); bot.push([x, cy + half(x)]); } top.push([bx1, cy]); poly(ctx, top.concat(bot.reverse())); };
    // grip, pommel
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(14, cy - 3.5, 30, 7, 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#475569'; ctx.beginPath(); for (let x = 18; x < 42; x += 5) { ctx.moveTo(x, cy - 3); ctx.lineTo(x + 3, cy + 3); } ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(9, cy, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // blade body
    ctx.save(); bladePath(); ctx.clip();
    const steel = ctx.createLinearGradient(0, cy - 12, 0, cy + 12); steel.addColorStop(0, '#334155'); steel.addColorStop(0.5, '#1b2434'); steel.addColorStop(1, '#0f1623');
    ctx.fillStyle = steel; ctx.fillRect(bx0, 0, bx1 - bx0 + 2, H);
    const fx = bx0 + (bx1 - bx0) * f;
    if (f > 0.002) {
      const g = ctx.createLinearGradient(bx0, 0, fx, 0);
      if (surge) { g.addColorStop(0, '#b45309'); g.addColorStop(0.6, '#f59e0b'); g.addColorStop(1, '#fde047'); }
      else { g.addColorStop(0, '#075985'); g.addColorStop(0.65, '#38bdf8'); g.addColorStop(1, '#e0f2fe'); }
      ctx.fillStyle = g; ctx.fillRect(bx0, 0, fx - bx0, H);
      ctx.globalCompositeOperation = 'lighter';                            // light running along the heated steel
      const sh = ((t * 0.7) % 1) * (fx - bx0 + 40) - 20 + bx0;
      const sg = ctx.createLinearGradient(sh - 18, 0, sh + 18, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.35)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(bx0, 0, fx - bx0, H);
      ctx.fillStyle = surge ? 'rgba(255,240,170,0.9)' : 'rgba(255,255,255,0.9)'; ctx.fillRect(fx - 1.5, cy - 14, 3, 28);   // the front of the heat
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx0 + 4, cy); ctx.lineTo(bx1 - 14, cy); ctx.stroke();   // the fuller
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx0 + 4, cy - 1.6); ctx.lineTo(bx1 - 14, cy - 1.6); ctx.stroke();
    if (ready) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(125,211,252,${0.14 + 0.12 * Math.sin(t * 7)})`; ctx.fillRect(bx0, 0, bx1 - bx0, H); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    ctx.strokeStyle = surge ? '#fde68a' : (ready ? '#bae6fd' : '#cbd5e1'); ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; bladePath(); ctx.stroke();
    // crossguard
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.roundRect(40, cy - 17, 8, 34, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = surge ? '#fde047' : (ready ? '#e0f2fe' : '#0ea5e9'); ctx.beginPath(); ctx.arc(44, cy, 2.6, 0, Math.PI * 2); ctx.fill();
    if (ready || surge) {                                                      // a glint that flicks off the tip
      const ph = (t * 1.4) % 1, a = ph < 0.25 ? ph / 0.25 : Math.max(0, 1 - (ph - 0.25) / 0.4);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(bx1 - 9 * a, cy); ctx.lineTo(bx1 + 3 * a, cy); ctx.moveTo(bx1 - 3, cy - 7 * a); ctx.lineTo(bx1 - 3, cy + 7 * a); ctx.stroke(); ctx.restore();
    }
    ctx.font = '800 9px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.fillStyle = surge ? '#fde047' : '#bae6fd';
    const txt = surge ? p.surgeTimer.toFixed(1) + 's' : Math.round(f * 100) + '%'; ctx.strokeText(txt, W - 3, 9); ctx.fillText(txt, W - 3, 9);
  }

  // ---------------------------------------------------------------- GRAVEBREAKER: the momentum dial
  // A heavy iron-and-brass gauge: a riveted bezel, a dark face, fifteen forged blocks in three groups (one group per Momentum), a hammer for a needle.
  function drawDial(cv, p) {
    const W = 184, H = 104, ctx = prep(cv, W, H), t = performance.now() * 0.001;
    const max = p.maxMomentum || 300, m = Math.max(0, Math.min(max, p.momentum || 0));
    const over = (p.overloadTimer || 0) > 0, full = m >= max - 0.5 && !over;
    const cx = W / 2, cy = 96, R = 78;
    // glow behind the bezel when it matters
    if (over || full) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R + 16); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.85, over ? `rgba(253,224,71,${0.3 + 0.12 * Math.sin(t * 14)})` : `rgba(239,68,68,${0.22 + 0.12 * Math.sin(t * 8)})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R + 16, Math.PI, 0); ctx.fill(); ctx.restore(); }
    // face
    const face = ctx.createRadialGradient(cx, cy, 4, cx, cy, R + 4); face.addColorStop(0, '#2a1a0e'); face.addColorStop(0.7, '#150c06'); face.addColorStop(1, '#0a0603');
    ctx.fillStyle = face; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(180,140,90,0.14)'; ctx.lineWidth = 1; for (const rr of [30, 44]) { ctx.beginPath(); ctx.arc(cx, cy, rr, Math.PI, 0); ctx.stroke(); }
    // bezel: a thick brass ring with a bevel and rivets
    const bz = ctx.createLinearGradient(0, cy - R, 0, cy); bz.addColorStop(0, '#c9a46a'); bz.addColorStop(0.5, '#7a5a30'); bz.addColorStop(1, '#3b2a14');
    ctx.strokeStyle = bz; ctx.lineWidth = 7; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.arc(cx, cy, R + 1, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,170,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R + 4, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#2a1c0c'; ctx.fillRect(cx - R - 5, cy - 1, 2 * R + 10, 7); ctx.fillStyle = bz; ctx.fillRect(cx - R - 5, cy - 1, 2 * R + 10, 2);     // the base plate
    for (let k = 0; k <= 6; k++) { const a = Math.PI + k * Math.PI / 6; ctx.fillStyle = '#e7cf9f'; ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R + 1), cy + Math.sin(a) * (R + 1), 1.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    // fifteen blocks, three groups of five
    const inner = R - 24, outer = R - 9, BL = 15, span = Math.PI, gapA = 0.022, groupGap = 0.05;
    const warm = ['#f59e0b', '#fb923c', '#ef4444'];
    for (let i = 0; i < BL; i++) {
      const grp = Math.floor(i / 5), a0 = Math.PI + span * i / BL + gapA + (grp > 0 ? 0 : 0), a1 = Math.PI + span * (i + 1) / BL - gapA;
      const fi = c01(m / max * BL - i);
      const path = () => { ctx.beginPath(); ctx.arc(cx, cy, outer, a0, a1); ctx.arc(cx, cy, inner, a1, a0, true); ctx.closePath(); };
      ctx.fillStyle = '#26170b'; path(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      if (over) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,${225 + 25 * Math.sin(t * 22 + i)},150,0.95)`; path(); ctx.fill(); ctx.restore(); }
      else if (fi > 0) {
        const col = warm[grp];
        ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * fi; ctx.fillStyle = col; path(); ctx.fill();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * fi; ctx.strokeStyle = col; ctx.lineWidth = 5; path(); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = `rgba(255,240,200,${0.45 * fi})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, outer - 1.5, a0 + 0.01, a1 - 0.01); ctx.stroke();     // a highlight on the outer edge of a lit block
      }
    }
    // group marks: I II III
    ctx.font = '700 8px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(231,207,159,0.8)';
    ['I', 'II', 'III'].forEach((s, g) => { const a = Math.PI + span * (g * 5 + 2.5) / BL, r = outer + 0; ctx.fillText(s, cx + Math.cos(a) * (inner - 8), cy + Math.sin(a) * (inner - 8)); });
    // the needle: a hammer shaft with a counterweight
    const tremor = over ? Math.sin(t * 52) * 0.03 : (full ? Math.sin(t * 34) * 0.018 : 0);
    const ang = Math.PI + (over ? 1 : m / max) * Math.PI + tremor;
    ctx.save(); ctx.translate(cx, cy);
    ctx.save(); ctx.rotate(ang); ctx.translate(2, 3); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(R - 14, -1.2); ctx.lineTo(R - 14, 1.2); ctx.lineTo(-14, 2); ctx.fill(); ctx.restore();     // its shadow
    ctx.rotate(ang);
    const sh = ctx.createLinearGradient(0, -3, 0, 3); sh.addColorStop(0, '#d8c7a8'); sh.addColorStop(1, '#6f5f48');
    ctx.fillStyle = sh; ctx.strokeStyle = '#1a1008'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-14, -2.2); ctx.lineTo(R - 20, -1.3); ctx.lineTo(R - 20, 1.3); ctx.lineTo(-14, 2.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3b3329'; ctx.beginPath(); ctx.roundRect(-20, -4.5, 9, 9, 2); ctx.fill(); ctx.stroke();                                   // counterweight
    const hh = ctx.createLinearGradient(0, -6, 0, 6); hh.addColorStop(0, over ? '#fff7d6' : '#a8a29e'); hh.addColorStop(1, over ? '#fbbf24' : '#44403c');
    ctx.fillStyle = hh; ctx.beginPath(); ctx.roundRect(R - 26, -6.5, 12, 13, 2); ctx.fill(); ctx.stroke();                                      // the hammer head
    ctx.restore();
    // hub
    const hub = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 9); hub.addColorStop(0, '#d8c7a8'); hub.addColorStop(1, '#4a3a22');
    ctx.fillStyle = hub; ctx.strokeStyle = '#1a1008'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#2a1c0c'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx - 4, cy - 3.5); ctx.lineTo(cx + 4, cy + 3.5); ctx.stroke();
    if (over) { ctx.font = '800 9px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText(Math.ceil(p.overloadTimer), cx, cy - 14); ctx.fillText(Math.ceil(p.overloadTimer), cx, cy - 14); }
    // a faint glass glare across the upper left
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - 2, Math.PI, 0); ctx.clip();
    const gl = ctx.createLinearGradient(cx - R, cy - R, cx + 10, cy - R * 0.2); gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.moveTo(cx - R, cy - R * 0.3); ctx.lineTo(cx - R * 0.2, cy - R); ctx.lineTo(cx + 6, cy - R); ctx.lineTo(cx - R * 0.55, cy); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // ---------------------------------------------------------------- ARCLIGHT: the reactor core
  function drawReactor(cv, p) {
    const S = 96, ctx = prep(cv, S, S), t = performance.now() * 0.001;
    const heat = c01((p.heatShown || 0) / 100), full = heat >= 0.995;
    const col = full ? '#fff1b8' : (heat >= 0.55 ? '#fbbf24' : '#38bdf8'), cx = S / 2, cy = S / 2, R = 41;
    const hex = (k, r) => [cx + Math.cos(-Math.PI / 2 + k * Math.PI / 3) * r, cy + Math.sin(-Math.PI / 2 + k * Math.PI / 3) * r];
    ctx.fillStyle = 'rgba(6,12,20,0.88)'; poly(ctx, [0, 1, 2, 3, 4, 5].map(k => hex(k, R + 5))); ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    // twelve cells around the rim (two per edge), lit clockwise from the top
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const e = Math.floor(i / 2), h = i % 2, a = hex(e, R), b = hex(e + 1, R);
      const p0 = h ? [(a[0] + b[0]) / 2 + (b[0] - a[0]) * 0.04, (a[1] + b[1]) / 2 + (b[1] - a[1]) * 0.04] : [a[0] + (b[0] - a[0]) * 0.06, a[1] + (b[1] - a[1]) * 0.06];
      const p1 = h ? [b[0] - (b[0] - a[0]) * 0.06, b[1] - (b[1] - a[1]) * 0.06] : [(a[0] + b[0]) / 2 - (b[0] - a[0]) * 0.04, (a[1] + b[1]) / 2 - (b[1] - a[1]) * 0.04];
      const lit = c01(heat * 12 - i);
      ctx.lineWidth = 6; ctx.strokeStyle = '#0f2236'; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      if (lit > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = lit * (full ? 0.75 + 0.25 * Math.sin(t * 10 + i) : 1); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); ctx.restore(); }
    }
    // two counter-rotating rings inside
    ctx.lineWidth = 2; ctx.lineCap = 'butt';
    ctx.strokeStyle = `rgba(125,211,252,${0.25 + 0.5 * heat})`; for (let i = 0; i < 3; i++) { const a0 = t * (0.8 + heat * 2) + i * 2.09; ctx.beginPath(); ctx.arc(cx, cy, 27, a0, a0 + 1.2); ctx.stroke(); }
    ctx.strokeStyle = `rgba(251,191,36,${0.2 + 0.5 * heat})`; for (let i = 0; i < 4; i++) { const a0 = -t * (1.2 + heat * 2.4) + i * 1.57; ctx.beginPath(); ctx.arc(cx, cy, 20, a0, a0 + 0.8); ctx.stroke(); }
    // the core
    const pul = 0.85 + 0.15 * Math.sin(t * (4 + heat * 10)), r = (6 + 9 * heat) * pul;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 2.2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = g; ctx.globalAlpha = 0.35 + 0.65 * Math.max(heat, 0.12); ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2); ctx.fill();
    if (full) { ctx.globalAlpha = 0.8; ctx.strokeStyle = '#fff7d6'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let k = 0; k < 12; k++) { const a = t * 1.5 + k * Math.PI / 6, r0 = 12, r1 = 21 + 4 * Math.sin(t * 8 + k * 2); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); } ctx.stroke(); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- UNBOUND: the limiter cuff
  // A bracer made of nine plates wrapped round a cylinder. As Restraint fills, the seams between the plates loosen and light leaks out of them in the
  // colour of the Release that is winning; at full the plates stand apart and the light pours out above and below. An inlay under it shows the mix.
  function drawCuff(cv, p) {
    const W = 232, H = 66, ctx = prep(cv, W, H), t = performance.now() * 0.001;
    const f = c01((p.restraintShown || 0) / 100), full = !!p.full, F = p.form, col = F.col, core = F.core;
    const cx = W / 2, R = 108, y0 = 8, h = 32, N = 9;
    const th = (k) => (-72 + k * 144 / N) * Math.PI / 180;                 // the plate edges, wrapped round a cylinder
    const bx = (k) => cx + Math.sin(th(k)) * R;
    // light spilling above and below when it is ready
    if (full) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, y0 + h / 2, 10, cx, y0 + h / 2, 120); g.addColorStop(0, rgba(col, 0.28 + 0.1 * Math.sin(t * 6))); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 52); ctx.restore(); }
    // rails (the retaining bands) along the top and bottom
    const rail = (y) => { const g = ctx.createLinearGradient(0, y, 0, y + 4); g.addColorStop(0, '#59627a'); g.addColorStop(1, '#1d212d'); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(bx(0) - 2, y, bx(N) - bx(0) + 4, 4, 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.8; ctx.stroke(); };
    // the plates
    for (let k = 0; k < N; k++) {
      const xa = bx(k), xb = bx(k + 1), mid = (th(k) + th(k + 1)) / 2, shade = 0.35 + 0.65 * Math.cos(mid);
      const loose = 0.6 + (full ? 2.6 : 2 * f), ga = loose / 2;
      const x1 = xa + ga, x2 = xb - ga, top = y0 + 3 * (1 - Math.cos(mid)) * 0 + 2, bot = y0 + h - 2;
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, `rgb(${Math.round(70 * shade)},${Math.round(78 * shade)},${Math.round(98 * shade)})`);
      g.addColorStop(0.45, `rgb(${Math.round(38 * shade)},${Math.round(43 * shade)},${Math.round(58 * shade)})`);
      g.addColorStop(1, `rgb(${Math.round(18 * shade)},${Math.round(20 * shade)},${Math.round(28 * shade)})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x1, top, Math.max(1, x2 - x1), bot - top, 3); ctx.fill();
      ctx.strokeStyle = `rgba(0,0,0,0.7)`; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = `rgba(190,205,235,${0.28 * shade})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1 + 2, top + 1.5); ctx.lineTo(x2 - 2, top + 1.5); ctx.stroke();            // the lit top edge
      ctx.strokeStyle = `rgba(0,0,0,0.35)`; ctx.beginPath(); ctx.moveTo(x1 + 3, y0 + h / 2 + 4); ctx.lineTo(x2 - 3, y0 + h / 2 + 4); ctx.moveTo(x1 + 3, y0 + h / 2 - 4); ctx.lineTo(x2 - 3, y0 + h / 2 - 4); ctx.stroke();   // engraved lines
    }
    rail(y0 - 3); rail(y0 + h - 1);
    // the light in the seams (between plate k-1 and k), lit one after another from the left
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 1; k < N; k++) {
      const lit = c01(f * (N - 1) + 0.0 - (k - 1)), x = bx(k), pulse = full ? 0.8 + 0.2 * Math.sin(t * 8 + k) : 1;
      if (lit <= 0.01) continue;
      const hw = 6 + 5 * lit, g = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(col, 0.85 * lit * pulse)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x - hw, y0 + 1, hw * 2, h - 2);
      ctx.fillStyle = rgba(core, lit * pulse); ctx.fillRect(x - 0.8, y0 + 2, 1.6, h - 4);
    }
    ctx.restore();
    // two latches at the ends
    for (const sx of [bx(0) - 5, bx(N) + 5]) { ctx.fillStyle = '#2b3140'; ctx.strokeStyle = '#8b95a8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(sx - 3.5, y0 + 7, 7, h - 14, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = full ? col : '#59627a'; ctx.beginPath(); ctx.arc(sx, y0 + h / 2, 1.6, 0, Math.PI * 2); ctx.fill(); }
    if (full) {                                                                  // sparks lifting off the open seams
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const u = (t * 0.9 + i * 0.37) % 1, x = bx(1 + (i * 3) % (N - 1)) + Math.sin(i * 5 + t * 3) * 4, y = y0 - 2 - u * 14; ctx.fillStyle = rgba(core, (1 - u) * 0.8); ctx.beginPath(); ctx.arc(x, y, 1.1 + (1 - u), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // the inlay under the cuff: how the meter was filled (dodges, counters, skills); the leader burns brighter
    const tl = p.tally, sum = (tl.dodge + tl.counter + tl.skill) || 0, cols = ['#38bdf8', '#ef4444', '#facc15'], vals = [tl.dodge, tl.counter, tl.skill];
    const ix = bx(0) + 8, iw = bx(N) - bx(0) - 16, iy = 49;
    ctx.fillStyle = '#0b0e15'; ctx.strokeStyle = '#3a4152'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(ix, iy, iw, 5, 2.5); ctx.fill(); ctx.stroke();
    if (sum > 0) { let x = ix + 1; vals.forEach((v, i) => { if (v <= 0) return; const sw = (iw - 2) * v / sum, lead = (p.formKey === ['beam', 'hell', 'press'][i]); ctx.save(); ctx.globalAlpha = lead ? 1 : 0.5; ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.roundRect(x, iy + 1, Math.max(2, sw - 1), 3, 1.5); ctx.fill(); if (lead) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.fillRect(x, iy + 1, Math.max(2, sw - 1), 3); } ctx.restore(); x += sw; }); }
    ctx.font = '700 8.5px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.fillStyle = full ? core : '#9aa5ba';
    const txt = full ? 'READY' : Math.round(f * 100) + '%'; ctx.strokeText(txt, W - 6, 62); ctx.fillText(txt, W - 6, 62);
  }

  // ---------------------------------------------------------------- markup (plugs into SkillHud)
  // Every gauge sits in the CENTRE of the panel: the [Z] slot hangs off its left edge and any passive readout off its right edge.
  const zone = (self, meta, cvHtml, rightHtml, extra) => `
    <div class="identity-zone ig-zone ${extra || ''}">
      <div class="ig-l">${self._slotHtml('z', meta.skills.z, 'identity')}</div>
      ${cvHtml}
      <div class="ig-r">${rightHtml || ''}</div>
    </div>`;
  if (window.SkillHud) {
    const prev = window.SkillHud._identityHtml;
    window.SkillHud._identityHtml = function (meta, player) {
      const kind = meta.identity && meta.identity.kind;
      if (kind === 'breaker_gauge') {
        inject();
        return zone(this, meta, '<canvas class="ig-cv" id="ig-breaker" width="460" height="116"></canvas>',
          stub(['hud-overpower-fill', 'hud-overpower-text']) + `
            <div class="broken-wrap fracture-wrap" data-passive="1">
              <div class="broken-title">FRACTURE</div>
              <div class="broken-pips"><span id="frac-0"></span><span id="frac-1"></span><span id="frac-2"></span></div>
            </div>`);
      }
      if (kind === 'hammer_momentum') {
        inject();
        return zone(this, meta, '<canvas class="ig-cv" id="ig-hammer" width="368" height="208"></canvas>',
          stub(['mom-fill-0', 'mom-fill-1', 'mom-fill-2', 'mom-status', 'mom-hint']) + `
            <div class="broken-wrap" data-passive="1">
              <div class="broken-title">BROKEN</div>
              <div class="broken-pips"><span id="brk-0"></span><span id="brk-1"></span><span id="brk-2"></span></div>
              <div class="broken-time" id="brk-time">—</div>
            </div>`);
      }
      if (kind === 'arclight_heat') {
        inject();
        prev.call(this, meta, player);                      // runs the Arclight HUD's own style injection (the markup it returns is not used)
        return zone(this, meta, '<canvas class="ig-cv" id="ig-arclight" width="192" height="192"></canvas>',
          stub(['al-heat', 'al-hint']) + `
            <div class="ig-side">
              <div class="al-mode" id="al-mode"><b id="al-mode-name">SABER</b><kbd>[X] swap</kbd><i id="al-sync"></i></div>
              <div class="momentum-status" id="al-status"></div>
            </div>`, 'arclight-zone');
      }
      if (kind === 'unbound_restraint') {
        inject();
        prev.call(this, meta, player);
        return zone(this, meta, '<canvas class="ig-cv" id="ig-unbound" width="464" height="132"></canvas>',
          stub(['ub-fill', 'ub-hint', 'ub-m1', 'ub-m2', 'ub-m3']), 'unbound-zone');
      }
      return prev.call(this, meta, player);
    };
  }

  const DRAW = { breaker: ['ig-breaker', drawSword], hammer: ['ig-hammer', drawDial], arclight: ['ig-arclight', drawReactor], unbound: ['ig-unbound', drawCuff] };
  window.IdentityGauges = { drawSword, drawDial, drawReactor, drawCuff };
  if (typeof Game25D !== 'undefined' && Game25D.prototype.updateRealtimeHUD) {
    const orig = Game25D.prototype.updateRealtimeHUD;
    Game25D.prototype.updateRealtimeHUD = function () {
      const r = orig.apply(this, arguments);
      const p = this.localPlayer, d = p && DRAW[p.classId || 'breaker'];
      if (d) { const cv = document.getElementById(d[0]); if (cv) { try { d[1](cv, p); } catch (e) { /* a gauge must never break the HUD loop */ } } }
      return r;
    };
  }
})();

// =========================================================================
// RENDER_POLISH.JS — the animation / model / effects pass for every player class (adopted from the showcase,
// 2026-10-18). Loaded last in index.html so it wraps the final versions of the rig methods. Every part can be
// switched off live through window.RenderPolish.flags (showcase.html uses that for its Current / Proposed toggle).
// Purely cosmetic and local: each client applies it to every character it draws, so nothing is sent over co-op.
//
//   smooth  every pose channel (hands, weapon tip, crouch, lean, yaw, head) chases its target instead of snapping,
//           the same idea as Ignis's livePose. Strikes stay fast; skill starts / ends / pose swaps blend.
//   model   the body is drawn to an offscreen layer and composited as ONE silhouette: a single dark outer outline,
//           hairline gaps at joints filled, inner part outlines softened, one light direction (rim light top-left,
//           shade band bottom-right). The weapon is its own layer so its glow stays clean.
//   fx      smear frames on fast strikes (replacing the old per-frame blade trail), a per-class particle signature,
//           a sharp anime impact on hits, and rate limits on the effects that were spawned every frame.
// =========================================================================
(function () {
  if (typeof BreakerPlayer25D === 'undefined') return;
  const flags = { smooth: true, model: true, fx: true, speed: 1 };

  // ---- per-class palette -----------------------------------------------------------------------------------
  const PAL = {
    breaker:  { line: '#05080f', base: '#1b2638', rim: '#cfeaff', shade: 'rgba(4,10,28,0.42)', accent: '#38bdf8', hot: '#e0f2fe', kind: 'shard' },
    hammer:   { line: '#0d0503', base: '#3b160d', rim: '#ffe2c4', shade: 'rgba(30,6,2,0.42)',  accent: '#fb923c', hot: '#fff1dc', kind: 'grit' },
    reaper:   { line: '#060506', base: '#231d1a', rim: '#ffd9de', shade: 'rgba(12,4,6,0.45)',  accent: '#e11d48', hot: '#ffe4e6', kind: 'mist' },
    arclight: { line: '#050c14', base: '#7d8da3', rim: '#ffffff', shade: 'rgba(10,24,44,0.36)', accent: '#22d3ee', hot: '#fef3c7', kind: 'plasma' },
    unbound:  { line: '#07070b', base: '#1c2230', rim: '#f8fafc', shade: 'rgba(6,6,14,0.42)',  accent: '#ef4444', hot: '#ffffff', kind: 'ink' }
  };
  const palOf = (p) => PAL[p.classId] || PAL.breaker;
  // smears and particles follow the "Ally VFX" switch like the rest of the skill effects (the model pass always runs)
  const vfxOn = (p) => !!p && (p.isLocal || !window.fx || window.fx.showAllyVfx !== false);

  // =========================================================================================================
  // 1. POSE SMOOTHING (applyPoseHook wrapper)
  // =========================================================================================================
  const K_LIMB = 24, K_BODY = 15;
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function smoothPose(pl, P) {
    const now = performance.now();
    const S = pl._scSm;
    const dt = Math.min(0.05, S ? (now - S.t) / 1000 : 0) * flags.speed;
    const tip = P.swordTipLocal, rh = P.rHandLocal, lh = P.lHandLocal;
    // the weapon tip is smoothed RELATIVE to the hand, in polar form, so a fast swing sweeps round the hand instead of
    // cutting a straight line through the body
    const rel = tip && rh ? { a: Math.atan2(tip.side - rh.side, tip.fwd - rh.fwd), l: Math.hypot(tip.side - rh.side, tip.fwd - rh.fwd), u: tip.up - rh.up } : null;
    if (!S || dt <= 0 || now - S.t > 250) {
      pl._scSm = { t: now, crouchZ: P.crouchZ, torsoYaw: P.torsoYaw, torsoLeanFwd: P.torsoLeanFwd, headPitchZ: P.headPitchZ,
        rh: rh && { ...rh }, lh: lh && { ...lh }, rel };
      return;
    }
    S.t = now;
    const aL = 1 - Math.exp(-K_LIMB * dt), aB = 1 - Math.exp(-K_BODY * dt);
    for (const k of ['crouchZ', 'torsoLeanFwd', 'headPitchZ']) { S[k] += (P[k] - S[k]) * aB; P[k] = S[k]; }
    S.torsoYaw += angDiff(S.torsoYaw, P.torsoYaw) * aB; P.torsoYaw = S.torsoYaw;
    const chase = (cur, want) => {
      if (!cur || !want) return want && { ...want };
      cur.fwd += (want.fwd - cur.fwd) * aL; cur.side += (want.side - cur.side) * aL; cur.up += (want.up - cur.up) * aL; return cur;
    };
    S.rh = chase(S.rh, rh); S.lh = chase(S.lh, lh);
    if (rh) P.rHandLocal = { fwd: S.rh.fwd, side: S.rh.side, up: S.rh.up };
    if (lh) P.lHandLocal = { fwd: S.lh.fwd, side: S.lh.side, up: S.lh.up };
    if (rel && S.rel) {
      S.rel.a += angDiff(S.rel.a, rel.a) * aL; S.rel.l += (rel.l - S.rel.l) * aL; S.rel.u += (rel.u - S.rel.u) * aL;
      const h = P.rHandLocal;
      P.swordTipLocal = { fwd: h.fwd + Math.cos(S.rel.a) * S.rel.l, side: h.side + Math.sin(S.rel.a) * S.rel.l, up: h.up + S.rel.u };
    } else S.rel = rel;
  }

  const CLASSES = [BreakerPlayer25D, window.HammerPlayer25D, window.ReaperPlayer25D, window.ArclightPlayer25D, window.UnboundPlayer25D]
    .concat([typeof HammerPlayer25D !== 'undefined' ? HammerPlayer25D : null, typeof ReaperPlayer25D !== 'undefined' ? ReaperPlayer25D : null,
      typeof ArclightPlayer25D !== 'undefined' ? ArclightPlayer25D : null, typeof UnboundPlayer25D !== 'undefined' ? UnboundPlayer25D : null])
    .filter((c, i, a) => c && a.indexOf(c) === i);

  if (!Object.prototype.hasOwnProperty.call(BreakerPlayer25D.prototype, 'applyPoseHook')) BreakerPlayer25D.prototype.applyPoseHook = function () {};
  for (const C of CLASSES) {
    const pr = C.prototype;
    if (!Object.prototype.hasOwnProperty.call(pr, 'applyPoseHook')) continue;
    const orig = pr.applyPoseHook;
    pr.applyPoseHook = function (P) {
      orig.call(this, P);
      if (flags.smooth) smoothPose(this, P); else this._scSm = null;
    };
  }

  // =========================================================================================================
  // 2. ONE-SILHOUETTE MODEL (painter wrappers draw into offscreen layers; flushed when the nameplate starts)
  // =========================================================================================================
  const PAINTERS = ['drawRigCloak', 'drawRigLeg', 'drawRigWaist', 'drawRigCuirass', 'drawRigArm', 'drawRigHelm', 'drawRigWings', 'drawColossalGreatsword'];
  const WEAPON = 'drawColossalGreatsword';
  const pool = [];
  let tint = null, tctx = null;
  const proto2d = CanvasRenderingContext2D.prototype;
  let inWeapon = 0;

  function makeLayer() {
    const c = document.createElement('canvas');
    const x = c.getContext('2d');
    // inner outlines of body parts are softened (thinner, fainter) so only the outer silhouette reads as a line
    x.stroke = function (...a) {
      if (!flags.model || inWeapon) return proto2d.stroke.apply(this, a);
      const lw = this.lineWidth, ga = this.globalAlpha;
      this.lineWidth = lw * 0.62; this.globalAlpha = ga * 0.62;
      proto2d.stroke.apply(this, a);
      this.lineWidth = lw; this.globalAlpha = ga;
    };
    return { c, x };
  }
  // grow-only: every buffer is just big enough for one character's box (not the whole screen)
  function sizeTo(c, w, h) { if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); } }
  // The outline is offset copies of a tinted silhouette. (A drop-shadow ctx.filter was tried: on a canvas that falls back
  // to software rendering, e.g. no GPU acceleration, it took seconds per frame, so it is not used.)
  let mask = null, mctx = null;

  function begin(pl, ctx, isWeapon) {
    let F = pl._scF;
    const main = F && F.main;
    const now = performance.now();
    if (!F || F.done || now - F.t > 6 || (main && ctx !== main && !F.layers.some(L => L.x === ctx))) {
      // a fresh frame for this player: a box around the character, in device pixels
      const T = ctx.getTransform();
      const s = Math.hypot(T.a, T.b) || 1;
      const cx = T.a * pl.x + T.c * (pl.y - 46) + T.e, cy = T.b * pl.x + T.d * (pl.y - 46) + T.f;
      const half = 200 * s;
      const r = { x: Math.floor(cx - half), y: Math.floor(cy - half * 1.15), w: Math.ceil(half * 2), h: Math.ceil(half * 2.05) };
      F = pl._scF = { main: ctx, T, s, r, layers: [], done: false, used: 0, t: now };
    }
    if (ctx !== F.main) return ctx;            // nested painter call (a subclass calling its base painter)
    const want = isWeapon ? 'raw' : 'body';
    let L = F.layers[F.layers.length - 1];
    if (!L || L.type !== want) {
      const slot = pool[F.used] || (pool[F.used] = makeLayer());
      F.used++;
      const { r, T } = F;
      sizeTo(slot.c, r.w, r.h);
      const x = slot.x;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, r.w, r.h);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.shadowBlur = 0;
      x.setTransform(T.a, T.b, T.c, T.d, T.e - r.x, T.f - r.y);
      L = { type: want, c: slot.c, x };
      F.layers.push(L);
    }
    return L.x;
  }

  function flush(pl) {
    const F = pl._scF;
    if (!F || F.done) return;
    F.done = true;
    if (!F.layers.length) return;
    const main = F.main, P = palOf(pl), { r, s } = F, w = r.w, h = r.h;
    if (!tint) { tint = document.createElement('canvas'); tctx = tint.getContext('2d'); mask = document.createElement('canvas'); mctx = mask.getContext('2d'); }
    sizeTo(tint, w, h); sizeTo(mask, w, h);
    // the body's silhouette: every body layer merged (the weapon stays out of it so its glow is never outlined)
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.globalCompositeOperation = 'source-over'; mctx.clearRect(0, 0, w, h);
    for (const L of F.layers) if (L.type === 'body') mctx.drawImage(L.c, 0, 0, w, h, 0, 0, w, h);
    const recolor = (col) => {
      tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, w, h);
      tctx.drawImage(mask, 0, 0, w, h, 0, 0, w, h);
      tctx.globalCompositeOperation = 'source-in'; tctx.fillStyle = col; tctx.fillRect(0, 0, w, h);
      tctx.globalCompositeOperation = 'source-over';
    };
    const put = (c, dx = 0, dy = 0, a = 1) => { main.globalAlpha = a; main.drawImage(c, 0, 0, w, h, r.x + dx, r.y + dy, w, h); };
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalCompositeOperation = 'source-over'; main.shadowBlur = 0; if (main.filter !== 'none') main.filter = 'none';
    const o = 2.4 * s, g = 1.1 * s;
    // one dark outer outline round the whole body, then the joint seams closed with the body's base tone
    recolor(P.line);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; put(tint, Math.cos(a) * o, Math.sin(a) * o); }
    recolor(P.base);
    put(tint, g, g); put(tint, -g, -g);
    // one light direction (top-left): a shade band on the lower-right edge and a rim of light on the upper-left,
    // baked into the body layers only (source-atop), so it never lands on the weapon
    const edge = (col, dx, dy, a) => {
      recolor(col);
      tctx.globalCompositeOperation = 'destination-out';
      tctx.drawImage(mask, 0, 0, w, h, dx, dy, w, h);
      tctx.globalCompositeOperation = 'source-over';
      for (const L of F.layers) {
        if (L.type !== 'body') continue;
        const x = L.x;
        x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a;
        x.drawImage(tint, 0, 0, w, h, 0, 0, w, h);
        x.restore();
      }
    };
    edge(P.shade, -3.2 * s, -3.6 * s, 1);
    edge(P.rim, 1.5 * s, 1.9 * s, 0.5);
    // the parts themselves, in their painter order (body, weapon, body...)
    for (const L of F.layers) put(L.c);
    main.restore();
    if (flags.fx) drawSmear(pl, main);
  }

  for (const C of CLASSES) {
    const pr = C.prototype;
    for (const name of PAINTERS) {
      if (!Object.prototype.hasOwnProperty.call(pr, name)) continue;
      const orig = pr[name];
      const isW = name === WEAPON;
      pr[name] = function (ctx, ...rest) {
        if (!this._scF || ctx === this._scF.main || !this._scF.layers.some(L => L.x === ctx)) this._scCtx = ctx;
        if (isW) recordTip(this, rest[0], rest[1]);
        const hideTrail = isW && flags.fx && this.swordTrail;
        const trail = this.swordTrail;
        if (hideTrail) this.swordTrail = EMPTY_TRAIL;     // the smear replaces the old every-frame trail
        try {
          if (!flags.model) return orig.call(this, ctx, ...rest);
          const target = begin(this, ctx, isW);
          if (isW) inWeapon++;
          try { return orig.call(this, target, ...rest); } finally { if (isW) inWeapon--; }
        } finally { if (hideTrail) this.swordTrail = trail; }
      };
    }
  }
  const EMPTY_TRAIL = { length: 0, push() {}, at() { return null; }, clear() {} };

  // the base draw reads this.noPlate right after the painter loop: that is where the body is finished
  Object.defineProperty(BreakerPlayer25D.prototype, 'noPlate', {
    configurable: true,
    get() { if (flags.model) flush(this); else if (flags.fx) drawSmear(this, null); return this._noPlate; },
    set(v) { this._noPlate = v; }
  });

  // =========================================================================================================
  // 3. EFFECTS: smear frames, class particles, anime impacts, spawn rate limits
  // =========================================================================================================
  const parts = [];
  function recordTip(pl, hand, tip) {
    if (!hand || !tip) return;
    const now = performance.now();
    const H = pl._scTips || (pl._scTips = []);
    H.push({ hx: hand.sx, hy: hand.sy, tx: tip.sx, ty: tip.sy, t: now });
    while (H.length && now - H[0].t > 110 / Math.max(0.2, flags.speed)) H.shift();
    pl._scLastMain = null;
  }

  function drawSmear(pl, mainOrNull) {
    const H = pl._scTips;
    if (!H || H.length < 3 || !vfxOn(pl)) return;
    const main = mainOrNull || pl._scCtx;
    if (!main) return;
    const a = H[0], b = H[H.length - 1];
    if (pl.classId === 'unbound') return drawPalmStreak(pl, main, H);   // no blade: the rig's "tip" is an invisible 82px point, so streak the hand instead
    const lenB = Math.hypot(b.tx - b.hx, b.ty - b.hy);
    if (lenB < 28) return;
    let travel = 0;
    for (let i = 1; i < H.length; i++) travel += Math.hypot(H[i].tx - H[i - 1].tx, H[i].ty - H[i - 1].ty);
    if (travel < 46) return;                                        // only the fast strike phase smears, not wind-up or recovery
    const P = palOf(pl);
    main.save();
    // outer edge = the tip's path, inner edge = a point 40% down the blade (so the smear is a crescent, not a fan)
    main.beginPath();
    main.moveTo(H[0].tx, H[0].ty);
    for (let i = 1; i < H.length; i++) main.lineTo(H[i].tx, H[i].ty);
    for (let i = H.length - 1; i >= 0; i--) { const h = H[i]; main.lineTo(h.hx + (h.tx - h.hx) * 0.42, h.hy + (h.ty - h.hy) * 0.42); }
    main.closePath();
    const gr = main.createLinearGradient(a.tx, a.ty, b.tx, b.ty);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, hexA(P.accent, 0.45));
    gr.addColorStop(1, hexA(P.hot, 0.9));
    main.fillStyle = gr;
    main.fill();
    // a crisp leading edge
    main.strokeStyle = hexA(P.hot, 0.9); main.lineWidth = 2; main.lineCap = 'round';
    main.beginPath();
    const k = Math.max(0, H.length - 4);
    main.moveTo(H[k].tx, H[k].ty);
    for (let i = k + 1; i < H.length; i++) main.lineTo(H[i].tx, H[i].ty);
    main.stroke();
    main.restore();
    // shed the class's signature particles off the tip while it is moving fast
    const now = performance.now();
    if (!pl._scEmitT || now - pl._scEmitT > 40 / Math.max(0.2, flags.speed)) {
      pl._scEmitT = now;
      const vx = (b.tx - H[H.length - 2].tx), vy = (b.ty - H[H.length - 2].ty);
      const m = Math.hypot(vx, vy) || 1, sp = Math.min(m * 2.2, 140);      // a short flick off the tip, not a spray across the arena
      spawn(P.kind, b.tx, b.ty, vx / m * sp, vy / m * sp, P, 1);
    }
  }

  // Unbound strikes with his palms: a short tapered white streak behind the hand (thin red edge), only on fast strikes
  function drawPalmStreak(pl, main, H) {
    let travel = 0;
    for (let i = 1; i < H.length; i++) travel += Math.hypot(H[i].hx - H[i - 1].hx, H[i].hy - H[i - 1].hy);
    if (travel < 22) return;
    const P = palOf(pl), n = H.length;
    main.save();
    main.lineCap = 'round'; main.lineJoin = 'round';
    for (const [col, w] of [[hexA(P.accent, 0.35), 7], [hexA(P.hot, 0.85), 3.2]]) {
      for (let i = 1; i < n; i++) {
        const u = i / (n - 1);                                       // thin at the tail, full width at the hand
        main.strokeStyle = col; main.lineWidth = Math.max(0.5, w * u);
        main.beginPath(); main.moveTo(H[i - 1].hx, H[i - 1].hy); main.lineTo(H[i].hx, H[i].hy); main.stroke();
      }
    }
    main.restore();
    const now = performance.now();
    if (!pl._scEmitT || now - pl._scEmitT > 60 / Math.max(0.2, flags.speed)) {
      pl._scEmitT = now;
      const b = H[n - 1], c = H[n - 2], vx = b.hx - c.hx, vy = b.hy - c.hy, m = Math.hypot(vx, vy) || 1;
      spawn(P.kind, b.hx, b.hy, vx / m * 70, vy / m * 70, P, 1);
    }
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function spawn(kind, x, y, vx, vy, P, n = 2) {
    for (let i = 0; i < n; i++) {
      const j = (Math.random() - 0.5);
      const base = { kind, x, y, vx: vx * (0.5 + Math.random() * 0.5) + j * 40, vy: vy * (0.5 + Math.random() * 0.5) + (Math.random() - 0.5) * 40,
        t: 0, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, col: P.accent, hot: P.hot };
      if (kind === 'shard') Object.assign(base, { life: 0.32, size: 2.2 + Math.random() * 2, g: 140 });
      else if (kind === 'grit') Object.assign(base, { life: 0.55, size: 2 + Math.random() * 3, g: 520, vy: base.vy - 90 });
      else if (kind === 'mist') Object.assign(base, { life: 0.7, size: 6 + Math.random() * 6, g: -40, vx: base.vx * 0.35, vy: base.vy * 0.35 });
      else if (kind === 'plasma') Object.assign(base, { life: 0.24, size: 1.6, g: 0, vx: base.vx * 1.6, vy: base.vy * 1.6 });
      else Object.assign(base, { life: 0.36, size: 3 + Math.random() * 2, g: 30 });   // ink
      parts.push(base);
    }
    if (parts.length > 260) parts.splice(0, parts.length - 260);
  }

  function impact(x, y, P, power, lift = 26) {
    y -= lift;                                    // the flash sits at body height, not on the floor
    parts.push({ kind: 'star', x, y, t: 0, life: 0.17, size: 18 + power * 16, rot: Math.random() * 0.8 - 0.4, col: P.accent, hot: P.hot });
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      parts.push({ kind: 'line', x, y, a, t: 0, life: 0.16 + Math.random() * 0.06, size: 26 + power * 26 + Math.random() * 18, col: P.accent, hot: P.hot });
    }
    spawn(P.kind, x, y, 0, -50, P, 3 + Math.round(power * 3));
  }

  let lastT = performance.now();
  function drawParts(ctx) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000) * flags.speed; lastT = now;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.t += dt;
      if (q.t >= q.life) { parts.splice(i, 1); continue; }
      if (q.vx !== undefined) { q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.rot += (q.vr || 0) * dt; }
    }
    if (!flags.fx) return;
    ctx.save();
    for (const q of parts) {
      const u = q.t / q.life, fade = 1 - u;
      if (q.kind === 'shard') {
        ctx.globalAlpha = fade; ctx.fillStyle = u < 0.3 ? q.hot : q.col;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        ctx.beginPath(); ctx.moveTo(0, -q.size); ctx.lineTo(q.size * 0.45, 0); ctx.lineTo(0, q.size); ctx.lineTo(-q.size * 0.45, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (q.kind === 'grit') {
        ctx.globalAlpha = fade; ctx.fillStyle = u < 0.25 ? q.hot : '#5b2a17';
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        if (u < 0.5) { ctx.fillStyle = q.col; ctx.fillRect(q.x - 0.8, q.y - 0.8, 1.6, 1.6); }
      } else if (q.kind === 'mist') {
        ctx.globalAlpha = 0.32 * fade; ctx.fillStyle = q.col;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.6 + u * 0.9), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = '#4c0519';
        ctx.beginPath(); ctx.arc(q.x + 1.5, q.y + 1.5, q.size * 0.3 * (1 - u * 0.5), 0, Math.PI * 2); ctx.fill();
      } else if (q.kind === 'plasma') {
        ctx.globalAlpha = fade; ctx.strokeStyle = u < 0.4 ? q.hot : q.col; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); ctx.stroke();
      } else if (q.kind === 'ink') {
        ctx.globalAlpha = fade; ctx.fillStyle = u < 0.3 ? q.col : '#0b0b10';
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.atan2(q.vy, q.vx));
        ctx.beginPath(); ctx.ellipse(0, 0, q.size * 1.8 * fade + 1, q.size * 0.4 * fade + 0.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (q.kind === 'star') {
        // sharp four-point anime impact: white core, class-coloured rim, snaps big then shrinks
        const s = q.size * (u < 0.2 ? 0.6 + u * 2 : 1 - (u - 0.2) * 0.9);
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        const star = (k) => { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? k * 0.18 : k; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.85); } ctx.closePath(); };
        ctx.globalAlpha = fade; ctx.fillStyle = q.col; star(s * 1.25); ctx.fill();
        ctx.fillStyle = q.hot; star(s); ctx.fill();
        ctx.restore();
      } else if (q.kind === 'line') {
        const r0 = 10 + u * q.size, r1 = r0 + q.size * 0.6 * fade;
        ctx.globalAlpha = fade; ctx.strokeStyle = u < 0.35 ? q.hot : q.col; ctx.lineWidth = 2.2 * fade + 0.4;
        ctx.beginPath(); ctx.moveTo(q.x + Math.cos(q.a) * r0, q.y + Math.sin(q.a) * r0 * 0.8);
        ctx.lineTo(q.x + Math.cos(q.a) * r1, q.y + Math.sin(q.a) * r1 * 0.8); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // hook into the world FX once it exists: draw our particles, and rate-limit the spammy spawns
  function hookFx() {
    const fx = window.fx;
    if (!fx || fx._scHooked) return !!fx;
    fx._scHooked = true;
    const oDraw = fx.drawForegroundSparks.bind(fx);
    fx.drawForegroundSparks = function (ctx) { oDraw(ctx); drawParts(ctx); };
    const limit = (name, fn) => { const o = fx[name]; if (typeof o !== 'function') return; fx[name] = function (...a) { return fn(o.bind(fx), a); }; };
    let lastAfter = 0, fissWin = 0, fissN = 0;
    limit('addAfterimage', (o, a) => { const n = performance.now(); if (flags.fx && n - lastAfter < 45) return; lastAfter = n; return o(...a); });
    limit('addFissureLine', (o, a) => {
      const n = performance.now();
      if (n - fissWin > 220) { fissWin = n; fissN = 0; }
      if (flags.fx && ++fissN > 4) return;                          // ultimates used to throw 10-12 at once and wipe each other out
      return o(...a);
    });
    limit('spawnMassiveEarthChunks', (o, a) => { if (flags.fx && a[2] > 8) a[2] = 8; return o(...a); });
    limit('addDragSparks', (o, a) => { if (flags.fx && a[3] > 1) a[3] = Math.max(1, Math.round(a[3] * 0.6)); return o(...a); });
    return true;
  }

  // impacts: every class lands its hits through dealHitToBoss (the hub dummy and every raid boss). The star goes on the
  // target's surface facing the attacker, sized by the skill coefficient; one per player per 55ms so multi-hits don't stack.
  for (const C of CLASSES) {
    const pr = C.prototype;
    if (!Object.prototype.hasOwnProperty.call(pr, 'dealHitToBoss')) continue;
    const orig = pr.dealHitToBoss;
    pr.dealHitToBoss = function (boss, coeff, ...rest) {
      const r = orig.call(this, boss, coeff, ...rest);
      try {
        const n = performance.now();
        if (flags.fx && boss && vfxOn(this) && !(this._scHitT && n - this._scHitT < 55)) {
          this._scHitT = n;
          const isDummy = window.game && boss === window.game.hubDummy;
          const rad = isDummy ? 12 : Math.min(70, boss.radius || boss.hitRadius || 46);
          const dx = this.x - boss.x, dy = this.y - boss.y, m = Math.hypot(dx, dy) || 1;
          const k = Math.min(m, rad) / m;
          impact(boss.x + dx * k + (Math.random() - 0.5) * 14, boss.y + dy * k + (Math.random() - 0.5) * 8, palOf(this),
            Math.min(1, 0.25 + (+coeff || 1) / 6), isDummy ? 26 : 62);
        }
      } catch (e) {}
      return r;
    };
  }

  const tick = () => { hookFx(); };
  setInterval(tick, 500);
  tick();

  window.RenderPolish = { flags, impact };
  window.ShowcaseStyle = window.RenderPolish;      // the showcase page's toggle panel drives the same flags
})();

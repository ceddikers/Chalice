// =========================================================================
// EARTH_BURST.JS — the ground breaking open: a crater, glowing cracks racing outward and rock spires thrusting up through
// the floor in a ring. Used by the Gravebreaker's Skyfall Leap (takeoff = small, landing = big). Hooks ArenaFX's update and
// ground-effect draw so it needs no changes to camera_25d.js.
// =========================================================================
(function () {
  if (typeof ArenaFX === 'undefined') return;
  const TILT = (typeof PERSPECTIVE_TILT !== 'undefined') ? PERSPECTIVE_TILT : 0.55;
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  ArenaFX.prototype.addEarthBurst = function (x, y, o = {}) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    const R = o.radius || 150;
    const big = o.big !== false;
    const color = o.color || '#fb923c';
    const b = { x, y, R, color, t: 0, life: big ? 1.9 : 0.9, big, isAlly: this.sourceIsAlly, spikes: [], cracks: [] };
    // rock spires: two rings, jittered
    const rings = big ? [[0.45, 7], [0.78, 11], [1.0, 9]] : [[0.55, 6]];
    for (const [k, n] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5 + k;
        const d = R * k * (0.85 + Math.random() * 0.3);
        b.spikes.push({
          x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * TILT,
          h: (big ? 34 : 20) + Math.random() * (big ? 46 : 18) + (1 - k) * 14,
          w: (big ? 9 : 6) + Math.random() * 7,
          lean: (Math.random() - 0.5) * 0.5,
          delay: (d / R) * 0.16 + Math.random() * 0.05
        });
      }
    }
    // cracks: jagged lines from the centre out to the rim, forking once
    const nc = big ? 9 : 5;
    for (let i = 0; i < nc; i++) {
      const a = (i / nc) * Math.PI * 2 + Math.random() * 0.4;
      const pts = [{ x, y }];
      let cx = x, cy = y, ca = a;
      const len = R * (1.0 + Math.random() * 0.35);
      const steps = 7;
      for (let s = 1; s <= steps; s++) {
        ca += (Math.random() - 0.5) * 0.7;
        cx += Math.cos(ca) * len / steps; cy += Math.sin(ca) * len / steps * TILT;
        pts.push({ x: cx, y: cy });
      }
      b.cracks.push(pts);
      if (big && Math.random() < 0.7) {
        const f = 2 + ((Math.random() * 3) | 0), fa = a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
        const fp = [{ x: pts[f].x, y: pts[f].y }];
        let fx2 = fp[0].x, fy2 = fp[0].y;
        for (let s = 0; s < 3; s++) { fx2 += Math.cos(fa) * len * 0.12; fy2 += Math.sin(fa) * len * 0.12 * TILT; fp.push({ x: fx2, y: fy2 }); }
        b.cracks.push(fp);
      }
    }
    (this.earthBursts || (this.earthBursts = [])).push(b);
    if (this.earthBursts.length > 6) this.earthBursts.shift();
  };

  const oUpdate = ArenaFX.prototype.update;
  ArenaFX.prototype.update = function (dt, ...rest) {
    const r = oUpdate.call(this, dt, ...rest);
    const arr = this.earthBursts;
    if (arr) for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t >= arr[i].life) arr.splice(i, 1); }
    return r;
  };

  const oGround = ArenaFX.prototype.drawGroundEffects;
  ArenaFX.prototype.drawGroundEffects = function (ctx) {
    oGround.call(this, ctx);
    const arr = this.earthBursts;
    if (!arr || !arr.length) return;
    for (const b of arr) {
      if (b.isAlly && !this.showAllyVfx) continue;
      const u = b.t / b.life, fade = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.45);
      ctx.save();
      // crater: dark scorched dish with a hot rim
      ctx.save();
      ctx.translate(b.x, b.y); ctx.scale(1, TILT);
      const rr = b.R * (0.35 + 0.65 * ease(b.t / 0.18));
      const g = ctx.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr);
      g.addColorStop(0, `rgba(10,6,4,${0.85 * fade})`);
      g.addColorStop(0.7, `rgba(40,22,12,${0.6 * fade})`);
      g.addColorStop(1, 'rgba(40,22,12,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // cracks, racing out in the first 0.25s then cooling
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const grow = ease(b.t / (b.big ? 0.28 : 0.2));
      for (const pts of b.cracks) {
        const n = Math.max(1, Math.floor((pts.length - 1) * grow));
        for (const pass of [0, 1]) {
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i <= n; i++) ctx.lineTo(pts[i].x, pts[i].y);
          if (pass === 0) { ctx.strokeStyle = `rgba(20,10,5,${0.9 * fade})`; ctx.lineWidth = 6; }
          else { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = b.color; ctx.globalAlpha = Math.min(1, fade * (1.2 - u)); ctx.lineWidth = 2.6; }
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
      }
      // spires: sorted back to front so nearer ones overlap farther ones
      const sp = b.spikes.slice().sort((p, q) => p.y - q.y);
      for (const s of sp) {
        const rise = ease((b.t - s.delay) / 0.14);
        const sink = u > 0.5 ? Math.max(0, 1 - (u - 0.5) / 0.4) : 1;
        const h = s.h * rise * sink;
        if (h < 1) continue;
        const bx = s.x, by = s.y, tx = bx + s.lean * h, ty = by - h;
        ctx.fillStyle = `rgba(0,0,0,${0.35 * fade})`;                               // contact shadow
        ctx.beginPath(); ctx.ellipse(bx, by, s.w * 1.2, s.w * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4b3a30';                                                    // shadowed face
        ctx.beginPath(); ctx.moveTo(bx - s.w, by); ctx.lineTo(tx, ty); ctx.lineTo(bx + s.w * 0.1, by + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7a6354';                                                    // lit face
        ctx.beginPath(); ctx.moveTo(bx + s.w * 0.1, by + 2); ctx.lineTo(tx, ty); ctx.lineTo(bx + s.w, by); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(20,10,5,0.8)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(bx - s.w, by); ctx.lineTo(tx, ty); ctx.lineTo(bx + s.w, by); ctx.stroke();
        if (rise < 1) {                                                               // hot glow while still rising
          ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = b.color; ctx.globalAlpha = (1 - rise) * 0.7;
          ctx.beginPath(); ctx.ellipse(bx, by, s.w * 1.4, s.w * 0.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
      }
      // flash at the instant of impact
      if (b.t < 0.16) {
        ctx.globalCompositeOperation = 'lighter';
        const fa = 1 - b.t / 0.16;
        const fg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.R * 0.8);
        fg.addColorStop(0, `rgba(255,240,200,${0.9 * fa})`); fg.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = fg;
        ctx.save(); ctx.translate(b.x, b.y); ctx.scale(1, TILT); ctx.translate(-b.x, -b.y);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.R * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }
  };
})();

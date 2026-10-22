// =========================================================================
// WEAPON_GLOW.JS — enhanced weapons shine. From +6 a faint aura clings to the weapon; every few levels it grows:
//   +6..+8   a soft coloured aura
//   +9..+11  brighter, with embers drifting off it
//   +12..+14 flame-like wisps licking off the weapon and a hot white core
//   +15      all of that plus a ring of light orbiting the weapon and a pulsing flare at its head
// The colour follows the weapon (blue steel, crimson Obsidian, violet Black Sun, ember-orange hammers). `weaponEnh` is set from
// the equipped weapon (reforge.js) and sent to teammates in the player_state packet so they see it too.
// =========================================================================
(function () {
  const tierOf = (e) => (e >= 15 ? 4 : e >= 12 ? 3 : e >= 9 ? 2 : e >= 6 ? 1 : 0);
  const hexRgb = (h) => { h = String(h || '#38bdf8').replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1'); const n = parseInt(h, 16) || 0x38bdf8; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (c, w, k) => c.map((v, i) => Math.round(v + (w[i] - v) * k));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

  // a/b: where the weapon starts and ends on screen. headR > 0: a big round head (the hammer) at b.
  function glow(ctx, a, b, enh, colHex, time, headR, seed) {
    const T = tierOf(enh); if (!T) return;
    const k = (enh - 5) / 10;                                  // 0.1 .. 1
    const col = hexRgb(colHex), hot = mix(col, [255, 244, 214], 0.65), warm = mix(col, [255, 190, 90], 0.45);
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const pulse = 0.85 + 0.15 * Math.sin(time * 6 + seed);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // aura along the weapon
    ctx.strokeStyle = rgba(col, (0.10 + 0.20 * k) * pulse); ctx.lineWidth = 8 + k * 20;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = rgba(hot, (0.18 + 0.34 * k) * pulse); ctx.lineWidth = 2 + k * 4;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (headR > 0) {                                           // the hammer's head glows as a disc
      const g = ctx.createRadialGradient(b.x, b.y, headR * 0.3, b.x, b.y, headR * (1.5 + k * 0.9));
      g.addColorStop(0, rgba(hot, (0.22 + 0.3 * k) * pulse)); g.addColorStop(0.5, rgba(col, (0.14 + 0.2 * k) * pulse)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, headR * (1.5 + k * 0.9), 0, Math.PI * 2); ctx.fill();
    }
    // embers drifting up off the weapon (+9)
    if (T >= 2) {
      const n = T === 2 ? 6 : T === 3 ? 10 : 14;
      for (let i = 0; i < n; i++) {
        const ph = (time * (0.55 + 0.1 * (i % 3)) + i * 0.173 + seed * 0.07) % 1;
        const along = (i * 0.311 + seed) % 1;
        const side = Math.sin(i * 12.9898 + seed) * (6 + k * 10);
        const px = a.x + dx * along + nx * side + Math.sin(ph * 7 + i) * 4, py = a.y + dy * along + ny * side - ph * (26 + 30 * k);
        ctx.fillStyle = rgba(i % 2 ? hot : warm, (1 - ph) * (0.5 + 0.4 * k));
        ctx.beginPath(); ctx.arc(px, py, 1 + (1 - ph) * (1.2 + k), 0, Math.PI * 2); ctx.fill();
      }
    }
    // flame wisps (+12): tapered tongues leaning off the weapon, flickering
    if (T >= 3) {
      const n = T === 3 ? 5 : 8;
      for (let i = 0; i < n; i++) {
        const t0 = (i + 0.5) / n, bx = a.x + dx * t0, by = a.y + dy * t0;
        const side = (i % 2 ? 1 : -1), fl = Math.sin(time * 9 + i * 1.7 + seed);
        const len = (14 + 18 * k) * (0.75 + 0.25 * fl);
        const tipX = bx + nx * side * (6 + len * 0.45) + Math.sin(time * 5 + i) * 3, tipY = by + ny * side * (6 + len * 0.45) - len;
        ctx.fillStyle = rgba(i % 2 ? warm : col, 0.34 + 0.2 * k);
        ctx.beginPath();
        ctx.moveTo(bx - ux * 5, by - uy * 5);
        ctx.quadraticCurveTo(bx + nx * side * (len * 0.8), by + ny * side * (len * 0.8) - len * 0.25, tipX, tipY);
        ctx.quadraticCurveTo(bx + nx * side * 1, by + ny * side * 1 - len * 0.2, bx + ux * 5, by + uy * 5);
        ctx.closePath(); ctx.fill();
      }
    }
    // +15: a ring of light spiralling around the weapon and a flare at its head
    if (T >= 4) {
      for (let i = 0; i < 7; i++) {
        const t0 = (time * 0.35 + i / 7) % 1, ang = time * 4 + i * 0.9;
        const px = a.x + dx * t0 + nx * Math.cos(ang) * (10 + 6 * k), py = a.y + dy * t0 + ny * Math.cos(ang) * (10 + 6 * k) + Math.sin(ang) * 3;
        ctx.fillStyle = rgba(hot, 0.85);
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      const fr = (headR > 0 ? headR * 0.9 : 9) * (0.8 + 0.25 * Math.sin(time * 8 + seed));
      const g2 = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, fr * 2.4);
      g2.addColorStop(0, rgba([255, 255, 255], 0.65)); g2.addColorStop(0.35, rgba(hot, 0.35)); g2.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(b.x, b.y, fr * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(hot, 0.5); ctx.lineWidth = 1.4;
      for (let r = 0; r < 4; r++) { const ang = time * 1.2 + r * Math.PI / 2; ctx.beginPath(); ctx.moveTo(b.x + Math.cos(ang) * fr * 0.5, b.y + Math.sin(ang) * fr * 0.5); ctx.lineTo(b.x + Math.cos(ang) * fr * 2.4, b.y + Math.sin(ang) * fr * 2.4); ctx.stroke(); }
    }
    ctx.restore();
  }
  window.WeaponGlow = { glow, tierOf };

  const show = (p) => {
    const sp = window.SettingsPlus && window.SettingsPlus.get();
    if (sp && sp.glow === false) return false;                 // Settings > Interface > Weapon glow
    return p.isLocal || !window.fx || window.fx.showAllyVfx !== false;
  };
  const seedOf = (p) => ((p.id ? String(p.id).length : 3) * 0.37) % 1;

  // the Breaker's greatsword: glow along hand -> tip, after the blade is drawn
  if (typeof BreakerPlayer25D !== 'undefined') {
    const o = BreakerPlayer25D.prototype.drawColossalGreatsword;
    BreakerPlayer25D.prototype.drawColossalGreatsword = function (ctx, rHand, tip, arc, time) {
      const r = o.apply(this, arguments);
      if ((this.weaponEnh | 0) >= 6 && show(this)) {
        try { glow(ctx, { x: rHand.sx, y: rHand.sy }, { x: tip.sx, y: tip.sy }, this.weaponEnh | 0, this.weaponColor, performance.now() * 0.001, 0, seedOf(this)); } catch (e) {}
      }
      return r;
    };
  }
  // the Gravebreaker's hammer: glow along the shaft and around the slab head
  if (typeof HammerPlayer25D !== 'undefined') {
    const o = HammerPlayer25D.prototype.drawHammerSprite;
    HammerPlayer25D.prototype.drawHammerSprite = function (ctx, hx, hy, dx, dy, shaft = 68, g = 0, scale = 1) {
      const r = o.apply(this, arguments);
      if ((this.weaponEnh | 0) >= 6 && show(this)) {
        try {
          const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, R = 34 * scale;
          const head = { x: hx + ux * (shaft * scale + R * 0.78), y: hy + uy * (shaft * scale + R * 0.78) };
          glow(ctx, { x: hx - ux * 10 * scale, y: hy - uy * 10 * scale }, head, this.weaponEnh | 0, this.weaponColor || '#fb923c', performance.now() * 0.001, R, seedOf(this));
        } catch (e) {}
      }
      return r;
    };
  }
})();

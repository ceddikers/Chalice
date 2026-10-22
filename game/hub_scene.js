// =========================================================================
// HUB_SCENE.JS — Sanctum of Rocheste: how the hub looks.
// The static stone floor is rendered once into an offscreen canvas; only the glows, flames, embers and station props animate.
// Replaces Game25D.prototype.drawHubEnvironment (main.js keeps the logic: stations, clicks, modals).
// =========================================================================
(function () {
  const TILT = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.62);
  const FLOOR_R = 520;          // matches the hub arena radius
  const CACHE = 600;            // half-size of the offscreen floor canvas (plane units)

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sector(c, r0, r1, a0, a1) {
    c.beginPath();
    c.arc(0, 0, r1, a0, a1);
    c.arc(0, 0, r0, a1, a0, true);
    c.closePath();
  }

  // ---- static floor -------------------------------------------------------
  function buildFloor() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = CACHE * 2;
    const c = cv.getContext('2d');
    c.translate(CACHE, CACHE);
    const rand = rng(1337);

    // base
    const base = c.createRadialGradient(0, 0, 30, 0, 0, FLOOR_R);
    base.addColorStop(0, '#2a3652');
    base.addColorStop(0.55, '#18213a');
    base.addColorStop(1, '#0b1020');
    c.fillStyle = base;
    c.beginPath(); c.arc(0, 0, FLOOR_R, 0, Math.PI * 2); c.fill();

    // stone tiles: annular bands cut into sectors, each a slightly different shade
    const bands = [[44, 120], [120, 200], [200, 290], [290, 380], [380, 460], [460, 490]];
    for (const [r0, r1] of bands) {
      const mid = (r0 + r1) / 2;
      const n = Math.max(8, Math.round((Math.PI * 2 * mid) / (r1 - r0 + 18)));
      const off = rand() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a0 = off + (i / n) * Math.PI * 2, a1 = off + ((i + 1) / n) * Math.PI * 2;
        const l = 17 + rand() * 9, s = 22 + rand() * 12;
        c.fillStyle = `hsla(222, ${s}%, ${l}%, 0.55)`;
        sector(c, r0 + 1.5, r1 - 1.5, a0 + 0.004, a1 - 0.004);
        c.fill();
        // a soft highlight on the leading edge of some tiles
        if (rand() < 0.35) {
          c.strokeStyle = 'rgba(148, 163, 184, 0.10)';
          c.lineWidth = 1.2;
          c.beginPath(); c.arc(0, 0, r1 - 3, a0 + 0.02, a1 - 0.02); c.stroke();
        }
      }
    }

    // cracks
    c.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 46; i++) {
      let a = rand() * Math.PI * 2, r = 60 + rand() * 420;
      let x = Math.cos(a) * r, y = Math.sin(a) * r;
      c.beginPath(); c.moveTo(x, y);
      const steps = 3 + (rand() * 4 | 0);
      let dir = rand() * Math.PI * 2;
      for (let k = 0; k < steps; k++) { dir += (rand() - 0.5) * 1.2; x += Math.cos(dir) * (8 + rand() * 14); y += Math.sin(dir) * (8 + rand() * 14); c.lineTo(x, y); }
      c.stroke();
    }

    // gold inlay rings + dotted ring
    c.strokeStyle = 'rgba(250, 204, 21, 0.34)';
    c.lineWidth = 3;
    for (const r of [120, 290, 460]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = 'rgba(250, 204, 21, 0.16)';
    c.lineWidth = 1.5;
    for (const r of [127, 297, 453]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = 'rgba(250, 204, 21, 0.30)';
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; c.beginPath(); c.arc(Math.cos(a) * 375, Math.sin(a) * 375, 2.2, 0, Math.PI * 2); c.fill(); }

    // centre sigil: eight-pointed star around a dark eclipse
    c.strokeStyle = 'rgba(250, 204, 21, 0.38)';
    c.lineWidth = 2.2;
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2, r = i % 2 === 0 ? 108 : 46;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath(); c.stroke();
    const core = c.createRadialGradient(0, 0, 4, 0, 0, 40);
    core.addColorStop(0, '#05060c'); core.addColorStop(0.7, '#1b1030'); core.addColorStop(1, 'rgba(60, 20, 80, 0)');
    c.fillStyle = core; c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fill();

    // rim: darker stone band with notches and a cold edge
    const rim = c.createRadialGradient(0, 0, 488, 0, 0, FLOOR_R);
    rim.addColorStop(0, 'rgba(8, 11, 22, 0.0)'); rim.addColorStop(0.35, 'rgba(8, 11, 22, 0.75)'); rim.addColorStop(1, 'rgba(2, 3, 8, 0.95)');
    c.fillStyle = rim; c.beginPath(); c.arc(0, 0, FLOOR_R, 0, Math.PI * 2); c.arc(0, 0, 488, 0, Math.PI * 2, true); c.fill();
    c.strokeStyle = 'rgba(100, 116, 139, 0.55)'; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, FLOOR_R - 1.5, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(0, 0, 0, 0.45)'; c.lineWidth = 2;
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * 494, Math.sin(a) * 494); c.lineTo(Math.cos(a) * (FLOOR_R - 3), Math.sin(a) * (FLOOR_R - 3)); c.stroke(); }

    // soft darkening toward the middle of the stage so the sigil does not fight the character
    const vig = c.createRadialGradient(0, 0, 0, 0, 0, 90);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0.22)'); vig.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = vig; c.beginPath(); c.arc(0, 0, 90, 0, Math.PI * 2); c.fill();
    return cv;
  }

  const BRAZIERS = [-2.3, -0.84, 0.62, 1.57, 2.52, 3.14].map(a => ({ a, x: Math.cos(a) * 492, y: Math.sin(a) * 492 }));
  const PILLARS = [[-330, -448, 170], [-170, -492, 215], [170, -492, 215], [330, -448, 170], [-455, -250, 130], [455, -250, 130]];

  function glow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb}, ${a})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // the pools of firelight lie on the floor
  function drawBrazierLight(ctx, time) {
    for (let i = 0; i < BRAZIERS.length; i++) {
      const b = BRAZIERS[i];
      const f = 0.82 + Math.sin(time * 5.3 + i * 2.1) * 0.12 + Math.sin(time * 11.7 + i) * 0.06;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(1, TILT());
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, 120, '251, 146, 60', 0.20 * f);
      ctx.restore();
    }
  }

  // one brazier (pedestal, bowl and flames); drawn depth-sorted with the characters
  function drawBrazier(ctx, time, i) {
    {
      const b = BRAZIERS[i];
      const f = 0.82 + Math.sin(time * 5.3 + i * 2.1) * 0.12 + Math.sin(time * 11.7 + i) * 0.06;
      // pedestal + bowl
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = '#1f2433'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-6, -26); ctx.lineTo(6, -26); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b3245';
      ctx.beginPath(); ctx.moveTo(-15, -26); ctx.lineTo(15, -26); ctx.lineTo(10, -17); ctx.lineTo(-10, -17); ctx.closePath(); ctx.fill(); ctx.stroke();
      // flames
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const sway = Math.sin(time * 6 + i * 1.7 + k * 2) * 3.2;
        const h = (20 + k * 4) * f - Math.abs(k - 1) * 5;
        const w = 8 - Math.abs(k - 1) * 2;
        const g = ctx.createLinearGradient(0, -27, 0, -27 - h);
        g.addColorStop(0, 'rgba(251, 146, 60, 0.95)'); g.addColorStop(0.55, 'rgba(250, 204, 21, 0.75)'); g.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        const ox = (k - 1) * 5;
        ctx.moveTo(ox - w, -27);
        ctx.quadraticCurveTo(ox - w * 0.6 + sway * 0.4, -27 - h * 0.55, ox + sway, -27 - h);
        ctx.quadraticCurveTo(ox + w * 0.6 + sway * 0.4, -27 - h * 0.55, ox + w, -27);
        ctx.closePath(); ctx.fill();
      }
      glow(ctx, 0, -34, 46, '253, 186, 116', 0.22 * f);
      ctx.restore();
    }
  }

  function drawPillar(ctx, x, y, h) {
    {
      ctx.save();
      ctx.translate(x, y);
      const g = ctx.createLinearGradient(-14, 0, 14, 0);
      g.addColorStop(0, '#0b0f1c'); g.addColorStop(0.45, '#1c2438'); g.addColorStop(1, '#090c16');
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.rect(-13, -h, 26, h); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#10162a';
      ctx.beginPath(); ctx.rect(-19, -h - 10, 38, 12); ctx.fill(); ctx.stroke();      // capital
      ctx.beginPath(); ctx.rect(-18, -8, 36, 10); ctx.fill(); ctx.stroke();           // plinth
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
      for (let k = -6; k <= 6; k += 6) { ctx.beginPath(); ctx.moveTo(k, -h + 4); ctx.lineTo(k, -10); ctx.stroke(); }
      ctx.restore();
    }
  }

  // ---- station pads + props ------------------------------------------------
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  function drawPad(ctx, st, near, time) {
    const rgb = hexToRgb(st.color);
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.scale(1, TILT());
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, st.radius * 1.55, rgb, near ? 0.34 : 0.17);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(8, 11, 22, 0.72)';
    ctx.strokeStyle = near ? '#fde047' : st.color;
    ctx.lineWidth = near ? 3 : 2.2;
    ctx.beginPath(); ctx.arc(0, 0, st.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb}, 0.55)`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 11]);
    ctx.lineDashOffset = -time * 26;
    ctx.beginPath(); ctx.arc(0, 0, st.radius * 0.82, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawForge(ctx, time) {
    const pulse = 0.75 + Math.sin(time * 3.4) * 0.2;
    // furnace
    ctx.fillStyle = '#383d4c'; ctx.strokeStyle = '#1b1f2c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-64, -78, 52, 58, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b2f3c'; ctx.beginPath(); ctx.roundRect(-52, -104, 15, 30, 3); ctx.fill(); ctx.stroke();      // chimney
    ctx.fillStyle = '#10121b'; ctx.beginPath(); ctx.roundRect(-55, -62, 38, 28, [14, 14, 3, 3]); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, -36, -46, 34 * pulse, '251, 146, 60', 0.75);
    glow(ctx, -36, -46, 80, '249, 115, 22', 0.14 * pulse);
    ctx.restore();
    // sparks
    ctx.fillStyle = '#fde68a';
    for (let i = 0; i < 6; i++) {
      const p = ((time * 0.7 + i * 0.37) % 1);
      ctx.globalAlpha = 1 - p;
      ctx.beginPath(); ctx.arc(-36 + Math.sin(i * 7.1 + time) * 14 * p, -50 - p * 70, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // anvil
    ctx.fillStyle = '#4b5567'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(6, -44); ctx.lineTo(54, -44); ctx.lineTo(66, -38); ctx.lineTo(54, -34); ctx.lineTo(44, -34);
    ctx.lineTo(44, -22); ctx.lineTo(52, -14); ctx.lineTo(8, -14); ctx.lineTo(16, -22); ctx.lineTo(16, -34); ctx.lineTo(6, -34); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(10, -43, 40, 3);
    // hammer leaning on the anvil
    ctx.strokeStyle = '#92400e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(60, -10); ctx.lineTo(72, -52); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(62, -62, 20, 12, 2); ctx.fill(); ctx.stroke();
  }

  function drawPortal(ctx, time) {
    const cy = -78;
    // stone frame
    ctx.fillStyle = '#161b2c'; ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'; ctx.lineWidth = 2;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.roundRect(sx * 62 - 11, -150, 22, 150, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(sx * 62 - 16, -158, 32, 14, 3); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-78, -150); ctx.quadraticCurveTo(0, -214, 78, -150); ctx.lineTo(78, -140); ctx.quadraticCurveTo(0, -202, -78, -140); ctx.closePath(); ctx.fill(); ctx.stroke();
    // vortex
    const vg = ctx.createRadialGradient(0, cy, 4, 0, cy, 70);
    vg.addColorStop(0, '#000'); vg.addColorStop(0.45, '#3b0a22'); vg.addColorStop(0.8, '#be123c'); vg.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = vg;
    ctx.beginPath(); ctx.ellipse(0, cy, 56, 76, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = `rgba(253, 164, 175, ${0.55 - k * 0.1})`;
      ctx.lineWidth = 2.4 - k * 0.3;
      ctx.beginPath();
      ctx.ellipse(0, cy, 46 - k * 9, 66 - k * 13, time * (0.9 + k * 0.35) * (k % 2 ? -1 : 1), 0.3, 2.9 + k * 0.4);
      ctx.stroke();
    }
    glow(ctx, 0, cy, 40 + Math.sin(time * 2.6) * 6, '244, 63, 94', 0.4);
    for (let i = 0; i < 8; i++) {      // motes drawn in towards the core
      const p = ((time * 0.45 + i * 0.125) % 1), a = i * 2.4 + time * 0.4;
      ctx.fillStyle = `rgba(254, 205, 211, ${1 - p})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 52 * (1 - p), cy + Math.sin(a) * 70 * (1 - p), 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, cy, 56, 76, 0, 0, Math.PI * 2); ctx.stroke();
  }

  function drawBoard(ctx, time) {
    ctx.fillStyle = '#3b2410'; ctx.strokeStyle = '#1c1005'; ctx.lineWidth = 2;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.rect(sx * 38 - 4, -78, 8, 78); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#5b3a1a'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-46, -86, 92, 56, 4); ctx.fill(); ctx.stroke();
    const papers = [[-36, -78, 24, 20, '#e2d6b5', -0.06], [-6, -80, 22, 26, '#d9ccaa', 0.05], [20, -77, 20, 18, '#e8dfc2', -0.03], [-30, -52, 28, 16, '#d8c9a4', 0.04], [6, -50, 30, 15, '#e6dcbc', -0.05]];
    for (const [x, y, w, h, col, rot] of papers) {
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot);
      ctx.fillStyle = col; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = 'rgba(60, 40, 20, 0.35)';
      for (let l = 0; l < 3; l++) ctx.fillRect(-w / 2 + 3, -h / 2 + 4 + l * 4.5, w - 7 - (l === 2 ? 8 : 0), 1.4);
      ctx.fillStyle = '#b91c1c'; ctx.beginPath(); ctx.arc(0, -h / 2 + 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // lantern
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.roundRect(40, -96, 12, 16, 2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 46, -88, 26 + Math.sin(time * 5) * 2, '253, 224, 71', 0.55);
    ctx.restore();
  }

  function drawDummyPad(ctx) { /* the dummy itself is drawn by Game25D.drawHubTrainingDummy */ }

  const PROPS = { forge: drawForge, portal: drawPortal, coop_board: drawBoard, dummy: drawDummyPad };
  const LABEL_Y = { forge: -118, portal: -224, coop_board: -104, dummy: -104 };

  function drawLabel(ctx, st, near) {
    const y = LABEL_Y[st.id] != null ? LABEL_Y[st.id] : -st.radius - 40;
    const name = st.name;
    ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    const w = ctx.measureText(name).width + 18;
    ctx.fillStyle = near ? 'rgba(10, 14, 26, 0.88)' : 'rgba(10, 14, 26, 0.62)';
    ctx.strokeStyle = near ? 'rgba(253, 224, 71, 0.8)' : `rgba(${hexToRgb(st.color)}, 0.5)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(-w / 2, y - 13, w, 20, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = near ? '#fef9c3' : '#e2e8f0';
    ctx.fillText(name, 0, y + 1);
    if (near && st.subtitle) {                      // the detail line only appears when you are close
      ctx.font = '600 10.5px "Segoe UI", system-ui, sans-serif';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'; ctx.lineWidth = 3;
      ctx.strokeText(st.subtitle, 0, y + 20);
      ctx.fillStyle = '#fde047';
      ctx.fillText(st.subtitle, 0, y + 20);
    }
  }

  function drawEmbers(ctx, time, R) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 34; i++) {
      const seed = i * 12.9898;
      const bx = Math.sin(seed) * 0.5 * R * 1.7;
      const by = Math.cos(seed * 1.7) * 0.5 * R * 1.0;
      const p = ((time * (0.05 + (i % 5) * 0.012) + i * 0.173) % 1);
      const x = bx + Math.sin(time * 0.8 + seed) * 14;
      const y = by - p * 150;
      ctx.fillStyle = `rgba(253, 186, 116, ${(1 - p) * 0.55})`;
      ctx.beginPath(); ctx.arc(x, y, 1.3 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawHubEnvironment(ctx) {
    const time = performance.now() * 0.002;
    const lp = this.localPlayer;
    if (!HubScene.floor) HubScene.floor = buildFloor();
    const T = TILT();

    // distant gloom behind the stage
    ctx.save();
    ctx.scale(1, T);
    const halo = ctx.createRadialGradient(0, -40, 200, 0, -40, 820);
    halo.addColorStop(0, 'rgba(30, 41, 80, 0.38)'); halo.addColorStop(1, 'rgba(5, 7, 14, 0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, -40, 820, 0, Math.PI * 2); ctx.fill();
    // floor + animated sigil light
    ctx.drawImage(HubScene.floor, -CACHE, -CACHE);
    ctx.globalCompositeOperation = 'lighter';
    const sp = 0.5 + Math.sin(time * 1.6) * 0.5;
    glow(ctx, 0, 0, 120 + sp * 12, '168, 85, 247', 0.14 + sp * 0.07);
    ctx.save(); ctx.rotate(time * 0.12);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.32)'; ctx.lineWidth = 2; ctx.setLineDash([3, 13]);
    ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI * 2); ctx.stroke();
    ctx.rotate(-time * 0.24);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.22)'; ctx.setLineDash([10, 22]);
    ctx.beginPath(); ctx.arc(0, 0, 205, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.restore();

    drawBrazierLight(ctx, time);

    // Pads lie on the floor. The props themselves (pillars, braziers, forge, gate, board) are depth-sorted with the characters
    // in Game25D.draw via HubScene.collect, so a warden walking behind one is hidden by it. Labels come last (HubScene.drawLabels).
    let hovered = null;
    const stage = window.CharSelect && window.CharSelect.isOpen();   // class screen: just the stage, no props
    for (const st of stage ? [] : this.hubStations) {
      const dist = Math.hypot(lp.x - st.x, lp.y - st.y);
      st._near = dist < st.radius + 55;
      if (Math.hypot(this.mouseWorldX - st.x, this.mouseWorldY - st.y) < st.radius + 15) hovered = st;
      drawPad(ctx, st, st._near, time);
    }
    drawEmbers(ctx, time, FLOOR_R);

    const cur = hovered ? 'pointer' : 'crosshair';
    if (this._hubCursor !== cur) { this._hubCursor = cur; this.canvas.style.cursor = cur; }
  }

  // ---- depth-sorted props ---------------------------------------------------------------------------
  // Each prop is { y, draw(ctx) }: y is where it stands on the floor, so anything with a smaller y (further up the screen)
  // is drawn first and is hidden by it.
  let propList = null;
  function buildProps(game) {
    propList = [];
    const T0 = () => performance.now() * 0.002;
    PILLARS.forEach(([x, y, h]) => propList.push({ y, draw(ctx) { drawPillar(ctx, x, y, h); } }));
    BRAZIERS.forEach((b, i) => propList.push({ y: b.y, draw(ctx) { ctx.save(); ctx.translate(b.x, b.y); drawBrazier(ctx, T0(), i); ctx.restore(); } }));
    (game.hubStations || []).forEach(st => {
      const prop = PROPS[st.id];
      if (!prop || st.id === 'dummy') return;
      propList.push({ y: st.y + 6, station: st, draw(ctx) { ctx.save(); ctx.translate(st.x, st.y); prop(ctx, T0()); ctx.restore(); } });
    });
  }
  function collect(game, out) {
    if (!propList) buildProps(game);
    const stage = window.CharSelect && window.CharSelect.isOpen();
    for (const p of propList) { if (stage && p.station) continue; out.push(p); }
  }
  function drawLabels(game, ctx) {
    if (window.CharSelect && window.CharSelect.isOpen()) return;
    for (const st of game.hubStations || []) {
      ctx.save(); ctx.translate(st.x, st.y); drawLabel(ctx, st, !!st._near); ctx.restore();
    }
  }

  const HubScene = { floor: null, rebuild() { this.floor = null; propList = null; }, collect, drawLabels };
  window.HubScene = HubScene;
  if (typeof Game25D !== 'undefined') {
    Game25D.prototype.drawHubEnvironment = drawHubEnvironment;
    const origEnter = Game25D.prototype.enterRaidGate;
    Game25D.prototype.enterRaidGate = function () {      // don't leave the hub's pointer cursor on the arena
      if (this._hubCursor) { this._hubCursor = null; this.canvas.style.cursor = 'crosshair'; }
      return origEnter.apply(this, arguments);
    };
  }
})();

// =========================================================================
// ECLIPSE_ART.JS — the black-sun backdrop shared by the title screen and the raid menu.
// =========================================================================
(function () {
  function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

  // opts.cx / opts.cy / opts.r place the sun (fractions of w/h); opts.mist draws ground mist; opts.embers draws drifting sparks
  function draw(c, w, h, t, opts) {
    const o = Object.assign({ cx: 0.5, cy: 0.36, r: 0.25, mist: true, embers: true, stars: true }, opts || {});
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#04020a'); sky.addColorStop(0.55, '#150a28'); sky.addColorStop(1, '#2a0a1c');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    if (o.stars) for (let i = 0; i < 70; i++) {
      const x = hash(i) * w, y = hash(i + 99) * h * 0.8, a = 0.25 + 0.5 * Math.abs(Math.sin(t * 0.8 + i));
      c.fillStyle = `rgba(226,232,240,${a * 0.7})`; c.fillRect(x, y, 1.4, 1.4);
    }
    const cx = w * o.cx, cy = h * o.cy, R = h * o.r;
    c.save(); c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 3.2);
    halo.addColorStop(0, 'rgba(255,140,90,0.42)'); halo.addColorStop(0.35, 'rgba(190,50,90,0.2)'); halo.addColorStop(1, 'rgba(80,20,120,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(cx, cy, R * 3.2, 0, Math.PI * 2); c.fill();
    c.translate(cx, cy); c.rotate(t * 0.05);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, len = R * (1.7 + 0.8 * hash(i + 7)), wd = 0.035 + 0.03 * hash(i + 3);
      const g = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,170,120,0.22)'); g.addColorStop(1, 'rgba(255,120,160,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(Math.cos(a - wd) * R, Math.sin(a - wd) * R); c.lineTo(Math.cos(a) * len, Math.sin(a) * len); c.lineTo(Math.cos(a + wd) * R, Math.sin(a + wd) * R); c.closePath(); c.fill();
    }
    c.restore();
    c.save(); c.translate(cx, cy);
    c.fillStyle = '#020106'; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,225,205,0.95)'; c.lineWidth = Math.max(2, R * 0.04); c.shadowColor = 'rgba(255,150,110,0.9)'; c.shadowBlur = 22;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = 'rgba(255,170,130,0.35)'; c.lineWidth = 1.4;
    c.beginPath(); c.arc(0, 0, R * 1.12, 0, Math.PI * 2); c.stroke();
    c.restore();
    if (o.mist) {
      const fog = c.createLinearGradient(0, h * 0.62, 0, h);
      fog.addColorStop(0, 'rgba(10,4,20,0)'); fog.addColorStop(1, 'rgba(20,6,26,0.85)');
      c.fillStyle = fog; c.fillRect(0, h * 0.62, w, h * 0.38);
    }
    if (o.embers) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 22; i++) {
        const p = (t * (0.04 + hash(i) * 0.04) + hash(i + 40)) % 1;
        c.fillStyle = `rgba(255,170,120,${(1 - p) * 0.5})`;
        c.beginPath(); c.arc(hash(i + 11) * w + Math.sin(t + i) * 12, h - p * h * 0.8, 1.5 + hash(i + 2) * 1.5, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
  }
  window.EclipseArt = { draw };
})();

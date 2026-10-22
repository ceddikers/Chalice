// =========================================================================
// REAPER_HUD.JS — the Reaper's identity widget: a glass sphere of blood in the [Z] spot.
// The blood fills as you drain and spend; it sloshes now and then; when it is full it is completely blood red and gleams — press [Z].
// During Voidform the sphere is the timer: it drains to empty as the form runs out.
// Also: the Umbral Shield bar, and the T slot showing whichever ultimate (Verdict / Crimson Eclipse) you currently have.
// =========================================================================
(function () {
  const css = `
  .identity-zone.reaper-zone { gap: 12px; }
  .reaper-zone .blood-sphere { flex: 0 0 auto; width: 76px; height: 76px; margin: -10px 0 -6px; filter: drop-shadow(0 0 6px rgba(0,0,0,0.6)); cursor: help; }
  .reaper-zone .blood-sphere.full { animation: bsPulse 1.1s ease-in-out infinite; }
  @keyframes bsPulse { 0%,100% { filter: drop-shadow(0 0 6px rgba(255,40,70,0.55)); } 50% { filter: drop-shadow(0 0 14px rgba(255,70,100,0.95)); } }
  .reaper-zone .momentum-title { display: flex; justify-content: space-between; align-items: baseline; font-size: 9px; font-weight: 900; letter-spacing: 1.5px; color: #fb7185; margin-bottom: 3px; }
  .reaper-zone .momentum-title span:last-child { font-weight: 700; letter-spacing: 0; color: #94a3b8; font-size: 9px; }
  .reaper-zone .shield-track { height: 12px; border: 1.5px solid rgba(251,113,133,0.45); border-radius: 4px; background: #14070b; overflow: hidden; position: relative; transform: skewX(-14deg); }
  .reaper-zone .shield-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #7f1d1d, #fb7185); transition: width 0.1s linear; }
  .reaper-zone .shield-fill.full { background: linear-gradient(90deg, #ef4444, #fecdd3); }
  .reaper-zone .shield-fill.void { background: linear-gradient(90deg, #450a0a, #ff1a3c); }
  .reaper-zone .momentum-status { margin-top: 4px; font-size: 10px; color: #cbd5e1; min-height: 12px; }
  .skill-slot#slot-z.reaper-ready { box-shadow: 0 0 14px rgba(255,40,70,0.9), inset 0 0 10px rgba(255,40,70,0.5); }
  body[data-reaper-void="1"] #bottom-action-hud .skill-slot { border-color: rgba(255,26,60,0.55); }
  `;
  let injected = false;
  const inject = () => { if (injected) return; injected = true; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };

  // ---- identity HTML (plugs into SkillHud) -------------------------------------
  if (window.SkillHud) {
    const orig = window.SkillHud._identityHtml;
    window.SkillHud._identityHtml = function (meta, player) {
      if (meta.identity && meta.identity.kind === 'reaper_blood') {
        inject();
        const z = meta.skills.z;
        return `
          <div class="identity-zone reaper-zone">
            ${this._slotHtml('z', z, 'identity')}
            <canvas class="blood-sphere" id="reaper-sphere" width="152" height="152"></canvas>
            <div class="momentum-wrap">
              <div class="momentum-title"><span>UMBRAL SHIELD</span><span id="rp-hint">Spend it with Q W E R</span></div>
              <div class="shield-track"><div class="shield-fill" id="rp-shield"></div></div>
              <div class="momentum-status" id="rp-status">Drain with Auto, S, F and D to fill the sphere</div>
            </div>
            <div class="broken-wrap" data-passive="1">
              <div class="broken-title">UMBRAL</div>
              <div class="broken-pips"><span id="rp-pip-0"></span><span id="rp-pip-1"></span><span id="rp-pip-2"></span></div>
              <div class="broken-time" id="rp-shield-num">0</div>
            </div>
          </div>`;
      }
      return orig.call(this, meta, player);
    };
  }

  // tooltips follow the form
  if (window.SkillHud) {
    const origTip = window.SkillHud._tooltipHtml;
    window.SkillHud._tooltipHtml = function (key, s) {
      const p = window.game && window.game.localPlayer;
      if (p && p.classId === 'reaper' && p.form === 'void') { const v = window.SKILL_META.reaper.void[key]; if (v) s = v; }
      return origTip.call(this, key, s);
    };
  }

  // ---- the sphere ------------------------------------------------------------------
  const S = { slosh: 0, sloshT: 3, sloshDir: 1, phase: 0, last: performance.now() };
  function drawSphere(cv, p) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = W * 0.43;
    const now = performance.now(), dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    S.phase += dt * 2.2;
    S.sloshT -= dt;
    if (S.sloshT <= 0) { S.sloshT = 2.5 + Math.random() * 4; S.slosh = 1; S.sloshDir = Math.random() < 0.5 ? -1 : 1; }
    S.slosh = Math.max(0, S.slosh - dt * 0.7);
    const inVoid = p.form === 'void';
    const fill = Math.max(0, Math.min(1, (p.bloodShown || 0) / 100));
    const full = !inVoid && p.blood >= 99.5;
    ctx.clearRect(0, 0, W, H);
    // glass body
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(12,6,12,0.9)'; ctx.fillRect(0, 0, W, H);
    // blood
    const lvl = cy + R - fill * R * 2;
    const amp = (4 + S.slosh * 11) * (fill > 0.02 && fill < 0.995 ? 1 : 0.35);
    const tilt = S.slosh * S.sloshDir * 0.22 * Math.sin(S.phase * 1.3);
    ctx.save();
    ctx.translate(cx, lvl); ctx.rotate(tilt); ctx.translate(-cx, -lvl);
    ctx.beginPath(); ctx.moveTo(-20, H + 20);
    for (let x = -20; x <= W + 20; x += 6) ctx.lineTo(x, lvl + Math.sin(x * 0.07 + S.phase * 2) * amp * 0.6 + Math.sin(x * 0.13 - S.phase * 1.4) * amp * 0.35);
    ctx.lineTo(W + 20, H + 20); ctx.closePath();
    const g = ctx.createLinearGradient(0, lvl, 0, cy + R);
    if (inVoid) { g.addColorStop(0, '#ff3b57'); g.addColorStop(1, '#3a040b'); }
    else if (full) { g.addColorStop(0, '#ff5a73'); g.addColorStop(1, '#c4112f'); }
    else { g.addColorStop(0, '#d01a37'); g.addColorStop(1, '#4d0612'); }
    ctx.fillStyle = g; ctx.fill();
    // surface highlight
    ctx.strokeStyle = 'rgba(255,170,185,0.65)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = lvl + Math.sin(x * 0.07 + S.phase * 2) * amp * 0.6 + Math.sin(x * 0.13 - S.phase * 1.4) * amp * 0.35; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.restore();
    // little bubbles drifting up in the blood
    if (fill > 0.05) {
      ctx.fillStyle = 'rgba(255,200,210,0.35)';
      for (let i = 0; i < 4; i++) { const u = ((now * 0.00025 + i * 0.27) % 1); const bx = cx + Math.sin(i * 7.1 + now * 0.0007) * R * 0.5, by = cy + R - u * fill * R * 2; ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 2), 0, Math.PI * 2); ctx.fill(); }
    }
    if (full || inVoid) {   // a completely red, shining sphere
      const pul = 0.5 + 0.5 * Math.sin(now * 0.006);
      const rg = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, 2, cx, cy, R);
      rg.addColorStop(0, `rgba(255,180,190,${0.35 + 0.25 * pul})`); rg.addColorStop(1, 'rgba(255,40,70,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    // glass rim + specular highlight
    ctx.lineWidth = 3.5; ctx.strokeStyle = full ? 'rgba(255,110,130,0.95)' : 'rgba(210,190,200,0.7)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(cx, cy, R - 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(cx - R * 0.42, cy - R * 0.5, R * 0.2, R * 0.1, -0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.ellipse(cx + R * 0.45, cy + R * 0.5, R * 0.1, R * 0.05, -0.7, 0, Math.PI * 2); ctx.fill();
    if (full) {   // gleam sweeping across
      const sx = ((now * 0.0009) % 1.6 - 0.3) * W;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,200,210,0.25)';
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 16, 0); ctx.lineTo(sx - 18, H); ctx.lineTo(sx - 34, H); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (inVoid) {   // remaining time as a small text
      ctx.fillStyle = '#ffd0d6'; ctx.font = '700 22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4; ctx.strokeText(p.formT.toFixed(0), cx, cy); ctx.fillText(p.formT.toFixed(0), cx, cy);
    }
    cv.classList.toggle('full', full);
  }

  const ReaperHud = {
    update(p, boss) {
      const cv = document.getElementById('reaper-sphere');
      if (!cv) return;
      drawSphere(cv, p);
      const cache = p._hudCache || (p._hudCache = {});
      const setText = (id, v) => { if (cache[id] === v) return; const el = document.getElementById(id); if (el) { el.textContent = v; cache[id] = v; } };
      const cap = p.shieldCap, sh = p.shield || 0;
      const fill = document.getElementById('rp-shield');
      if (fill) {
        const w = Math.min(100, sh / cap * 100).toFixed(0) + '%';
        if (cache.rpw !== w) { fill.style.width = w; cache.rpw = w; }
        fill.classList.toggle('full', sh >= cap * 0.98);
        fill.classList.toggle('void', p.form === 'void');
      }
      const frac = sh / cap;
      for (let i = 0; i < 3; i++) { const el = document.getElementById('rp-pip-' + i); if (el) el.classList.toggle('on', frac >= (i + 0.5) / 3); }
      setText('rp-shield-num', String(Math.round(sh)));
      const inVoid = p.form === 'void';
      let status;
      if (inVoid) status = `🩸 VOIDFORM ${p.formT.toFixed(1)}s · spenders are free` + (p.cds.tv <= 0.05 && !(p.act && p.act.kind === 'tv') ? ' · [T] Crimson Eclipse' : '');
      else if (p.blood >= 99.5) status = 'The sphere is full — press [Z]';
      else if (sh >= cap * 0.1) status = `Spend it: Q W E R  (${Math.round(sh / cap * 100)}% full)`;
      else status = 'Drain with Auto, S, F and D to fill your shield';
      setText('rp-status', status);
      setText('rp-hint', inVoid ? 'VOIDFORM' : `Blood ${Math.round(p.blood)}%`);
      const z = document.getElementById('slot-z');
      if (z) {
        z.classList.toggle('primed-glow', p.blood >= 99.5 && !inVoid && p.cds.z <= 0.05);
        z.classList.toggle('reaper-ready', p.blood >= 99.5 && !inVoid);
      }
      document.body.dataset.reaperVoid = inVoid ? '1' : '0';
    },

    // runs after the generic HUD loop: the T slot follows the form (Verdict <-> Crimson Eclipse) and its own cooldown
    // Show the Voidform kit (names, icons) on the skill bar while transformed, and the human kit otherwise.
    syncKit(p) {
      const inVoid = p.form === 'void';
      const img = (p.__kitImgs = p.__kitImgs || {});
      const sig = (inVoid ? 'v' : 'h') + ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't'].map(k => { const m = inVoid ? SKILL_META.reaper.void[k] : SKILL_META.reaper.skills[k]; return m && m.img ? 1 : 0; }).join('');
      if (p.__kitSig === sig) return;
      p.__kitSig = sig;
      for (const k of ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't']) {
        const m = inVoid ? SKILL_META.reaper.void[k] : SKILL_META.reaper.skills[k];
        const slot = document.getElementById('slot-' + k);
        if (!m || !slot) continue;
        const nm = slot.querySelector('.skill-name'), ic = slot.querySelector('.skill-icon');
        if (nm) nm.textContent = m.short || m.name;
        if (ic) ic.innerHTML = m.img ? `<img src="${m.img}" alt="" draggable="false">` : m.icon;
        slot.classList.toggle('has-img', !!m.img);
      }
    },

    afterGenericHud(game, p) {
      const inVoid = p.form === 'void';
      this.syncKit(p);
      const rem = inVoid ? (p.cds.tv || 0) : (p.cds.t || 0);
      const cdEl = document.getElementById('cd-t');
      if (cdEl) {
        if (rem > 0.05) { cdEl.style.display = 'flex'; cdEl.textContent = rem >= 10 ? String(Math.ceil(rem)) : rem.toFixed(1); }
        else cdEl.style.display = 'none';
      }
      const slot = document.getElementById('slot-t');
      if (slot) {
        slot.classList.toggle('primed-glow', inVoid && rem <= 0.05);
      }
    }
  };
  window.ReaperHud = ReaperHud;

  if (typeof Game25D !== 'undefined' && Game25D.prototype.updateRealtimeHUD) {
    const orig = Game25D.prototype.updateRealtimeHUD;
    Game25D.prototype.updateRealtimeHUD = function () {
      const r = orig.apply(this, arguments);
      const p = this.localPlayer;
      if (p && p.classId === 'reaper') ReaperHud.afterGenericHud(this, p);
      return r;
    };
  }
})();

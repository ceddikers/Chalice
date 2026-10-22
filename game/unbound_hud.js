// =========================================================================
// UNBOUND_HUD.JS — the Unbound's identity widget: the Restraint gauge next to the [Z] Release slot. The bar takes the colour of the
// Release that is currently winning, and a thin strip under it shows how the meter was filled (blue dodges, red counters, gold skills).
// =========================================================================
(function () {
  const css = `
  .identity-zone.unbound-zone { gap: 12px; }
  .unbound-zone .momentum-title { display: flex; justify-content: space-between; align-items: baseline; font-size: 9px; font-weight: 900; letter-spacing: 1.5px; color: #cbd5e1; margin-bottom: 3px; }
  .unbound-zone .momentum-title span:last-child { font-weight: 700; letter-spacing: 0; color: #94a3b8; font-size: 9px; }
  .unbound-zone .ub-track { height: 14px; border: 1.5px solid rgba(203,213,225,0.45); border-radius: 4px; background: #0a0d14; overflow: hidden; position: relative; transform: skewX(-14deg); min-width: 190px; }
  .unbound-zone .ub-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #0ea5e9, #38bdf8); transition: width 0.1s linear; }
  .unbound-zone .ub-fill.hell { background: linear-gradient(90deg, #b91c1c, #ef4444); }
  .unbound-zone .ub-fill.press { background: linear-gradient(90deg, #ca8a04, #facc15); }
  .unbound-zone .ub-fill.full { animation: ubFull 0.5s ease-in-out infinite; }
  @keyframes ubFull { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.6); } }
  .unbound-zone .ub-mix { display: flex; height: 3px; margin-top: 3px; border-radius: 2px; overflow: hidden; background: #0a0d14; min-width: 190px; }
  .unbound-zone .ub-mix i { display: block; height: 100%; transition: width 0.15s linear; }
  .unbound-zone .ub-mix i:nth-child(1) { background: #38bdf8; }
  .unbound-zone .ub-mix i:nth-child(2) { background: #ef4444; }
  .unbound-zone .ub-mix i:nth-child(3) { background: #facc15; }
  .skill-slot#slot-z.unbound-ready { box-shadow: 0 0 14px rgba(226,232,240,0.9), inset 0 0 10px rgba(226,232,240,0.5); }
  `;
  let injected = false;
  const inject = () => { if (injected) return; injected = true; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };

  if (window.SkillHud) {
    const orig = window.SkillHud._identityHtml;
    window.SkillHud._identityHtml = function (meta, player) {
      if (meta.identity && meta.identity.kind === 'unbound_restraint') {
        inject();
        const z = meta.skills.z;
        return `
          <div class="identity-zone unbound-zone">
            ${this._slotHtml('z', z, 'identity')}
            <div class="momentum-wrap">
              <div class="momentum-title"><span>RESTRAINT</span><span id="ub-hint">0%</span></div>
              <div class="ub-track"><div class="ub-fill" id="ub-fill"></div></div>
              <div class="ub-mix"><i id="ub-m1"></i><i id="ub-m2"></i><i id="ub-m3"></i></div>
            </div>
          </div>`;
      }
      return orig.call(this, meta, player);
    };
  }

  // FRONT / BACK positions for the Unbound's hits (matched by name in Breaker.dealHitToBoss; HIT_POSITION lives in hud_skills.js, loaded before this).
  if (window.HIT_POSITION) {
    const H = window.HIT_POSITION;
    H.front = new RegExp(H.front.source + '|Palm Pulse|Backhand|Palm Beam Finale|Hellzone Finale|Gravity Press Crush|Toss Around Finale');
    H.back = new RegExp(H.back.source + '|Afterimage (?:Cut|Punch)');
  }

  const UnboundHud = {
    update(p) {
      const bar = document.getElementById('ub-fill');
      if (!bar) return;
      const cache = p._hudCache || (p._hudCache = {});
      const w = Math.min(100, p.restraintShown).toFixed(0) + '%';
      if (cache.ubw !== w) { bar.style.width = w; cache.ubw = w; }
      const fk = p.formKey;
      if (cache.ubf !== fk) { bar.classList.toggle('hell', fk === 'hell'); bar.classList.toggle('press', fk === 'press'); cache.ubf = fk; }
      bar.classList.toggle('full', p.full);
      const hint = document.getElementById('ub-hint');
      const txt = p.full ? 'READY' : Math.round(p.restraint) + '%';
      if (hint && cache.ubh !== txt) { hint.textContent = txt; cache.ubh = txt; }
      const t = p.tally, sum = (t.dodge + t.counter + t.skill) || 1;
      const parts = [t.dodge / sum, t.counter / sum, t.skill / sum].map(v => (v * 100).toFixed(0) + '%');
      for (let i = 0; i < 3; i++) {
        const el = document.getElementById('ub-m' + (i + 1));
        if (el && cache['ubm' + i] !== parts[i]) { el.style.width = parts[i]; cache['ubm' + i] = parts[i]; }
      }
      const z = document.getElementById('slot-z');
      if (z) {
        z.classList.toggle('primed-glow', p.full && p.cds.z <= 0.05); z.classList.toggle('unbound-ready', p.full && p.cds.z <= 0.05);
        // the [Z] icon shows the Release that is currently winning (the plain cuff while nothing has been built yet)
        const raw = t.dodge + t.counter + t.skill;
        const src = raw > 0.5 ? `game/icons/unbound_form_${fk}.png` : 'game/icons/skill_unbound_z.png';
        if (cache.ubzi !== src) { const im = z.querySelector('.skill-icon img'); if (im) { im.setAttribute('src', src); cache.ubzi = src; } }
      }
    }
  };
  window.UnboundHud = UnboundHud;
})();

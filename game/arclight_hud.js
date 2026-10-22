// =========================================================================
// ARCLIGHT_HUD.JS — the Arclight's identity widget: the Core Heat gauge next to the [Z] Vent slot, a SABER / BEAM badge, and the
// skill bar that follows the current mode (names and icons swap to the Beam kit).
// =========================================================================
(function () {
  const css = `
  .identity-zone.arclight-zone { gap: 12px; }
  .arclight-zone .momentum-title { display: flex; justify-content: space-between; align-items: baseline; font-size: 9px; font-weight: 900; letter-spacing: 1.5px; color: #7dd3fc; margin-bottom: 3px; }
  .arclight-zone .momentum-title span:last-child { font-weight: 700; letter-spacing: 0; color: #94a3b8; font-size: 9px; }
  .arclight-zone .heat-track { height: 14px; border: 1.5px solid rgba(125,211,252,0.45); border-radius: 4px; background: #07101a; overflow: hidden; position: relative; transform: skewX(-14deg); min-width: 190px; }
  .arclight-zone .heat-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #0ea5e9, #38bdf8); transition: width 0.1s linear; }
  .arclight-zone .heat-fill.hot { background: linear-gradient(90deg, #0ea5e9, #fbbf24); }
  .arclight-zone .heat-fill.crit { background: linear-gradient(90deg, #fbbf24, #fff7cc); animation: alCrit 0.5s ease-in-out infinite; }
  @keyframes alCrit { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.5); } }
  .arclight-zone .heat-mark { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,0.55); }
  .arclight-zone .momentum-status { margin-top: 4px; font-size: 10px; color: #cbd5e1; min-height: 12px; }
  .arclight-zone .al-mode { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 8px; border: 1.5px solid rgba(125,211,252,0.5); border-radius: 6px; background: rgba(7,16,26,0.8); min-width: 58px; }
  .arclight-zone .al-mode b { font-size: 12px; letter-spacing: 2px; color: #fde68a; }
  .arclight-zone .al-mode.beam b { color: #7dd3fc; }
  .arclight-zone .al-mode kbd { font-size: 9px; color: #94a3b8; }
  .arclight-zone .al-mode i { font-style: normal; font-size: 9px; color: #fde68a; height: 11px; }
  .skill-slot.arc-next { box-shadow: 0 0 16px rgba(125,211,252,0.95), inset 0 0 10px rgba(125,211,252,0.55); border-color: #7dd3fc; animation: alCrit 0.55s ease-in-out infinite; }
  .skill-slot#slot-z.arclight-ready { box-shadow: 0 0 14px rgba(125,211,252,0.9), inset 0 0 10px rgba(125,211,252,0.5); }
  body[data-arclight-heat="2"] #bottom-action-hud .skill-slot { border-color: rgba(251,113,133,0.55); }
  `;
  let injected = false;
  const inject = () => { if (injected) return; injected = true; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };

  if (window.SkillHud) {
    const orig = window.SkillHud._identityHtml;
    window.SkillHud._identityHtml = function (meta, player) {
      if (meta.identity && meta.identity.kind === 'arclight_heat') {
        inject();
        const z = meta.skills.z;
        return `
          <div class="identity-zone arclight-zone">
            ${this._slotHtml('z', z, 'identity')}
            <div class="al-mode" id="al-mode"><b id="al-mode-name">SABER</b><kbd>[X] swap</kbd><i id="al-sync"></i></div>
            <div class="momentum-wrap">
              <div class="momentum-title"><span>SOLAR CHARGE</span><span id="al-hint">Empty</span></div>
              <div class="heat-track"><div class="heat-fill" id="al-heat"></div><span class="heat-mark" style="left:40%"></span><span class="heat-mark" style="left:80%"></span></div>
              <div class="momentum-status" id="al-status">Fight to charge the cannon</div>
            </div>
          </div>`;
      }
      return orig.call(this, meta, player);
    };
    const origTip = window.SkillHud._tooltipHtml;
    window.SkillHud._tooltipHtml = function (key, s) {
      const p = window.game && window.game.localPlayer;
      if (p && p.classId === 'arclight') {
        // each mode's tooltip shows only that mode's skill (the combined "Blades / Beam" text is for the character creator)
        const m = window.SKILL_META.arclight[p.mode === 'beam' ? 'beam' : 'blade'][key];
        if (m) s = Object.assign({}, s, { name: m.name, desc: m.desc }, m.destructive !== undefined ? { destructive: m.destructive } : {});
      }
      return origTip.call(this, key, s);
    };
  }

  const ArclightHud = {
    update(p, boss) {
      const bar = document.getElementById('al-heat');
      if (!bar) return;
      const cache = p._hudCache || (p._hudCache = {});
      const setText = (id, v) => { if (cache[id] === v) return; const el = document.getElementById(id); if (el) { el.textContent = v; cache[id] = v; } };
      const w = Math.min(100, p.heatShown).toFixed(0) + '%';
      if (cache.alw !== w) { bar.style.width = w; cache.alw = w; }
      bar.classList.toggle('hot', p.stage === 1);
      bar.classList.toggle('crit', p.stage === 2);
      const stageName = p.stage === 2 ? 'FULL - [Z]' : (p.stage === 1 ? 'Charging' : 'Empty');
      setText('al-hint', `${stageName} · ${Math.round(p.heat)}%`);
      // CHAIN: while it is alive, every attack skill that is ready and is not the one you just used lights up (any different skill adds a link)
      const AC = window.ARCLIGHT_CHAIN || { keys: 'qwersf', max: 5, bonus: 0.03 };
      const chainLive = p.chainT > 0 && !!p.chainKey;
      const lastKey = chainLive && p.chainKey[0] === p.mode[0] ? p.chainKey[1] : '';
      for (const k of AC.keys) { const el = document.getElementById('slot-' + k); if (el) el.classList.toggle('arc-next', chainLive && k !== lastKey && (p.cds[k] || 0) <= 0.05); }
      const chainTxt = chainLive && p.chain > 0 ? `CHAIN x${p.chain + 1} +${Math.round(AC.bonus * Math.min(AC.max, p.chain) * 100)}%` : '';
      let status;
      if (p.act && p.act.kind === 'z') status = 'SOLAR CANNON';
      else if (p.mode === 'beam' && (p.marks | 0) > 0) status = `${chainTxt ? chainTxt + ' · ' : ''}LOCK-ON ${p.marks | 0}/5 · [R] empowers, [F] erases`;
      else if (p.mode === 'saber' && p.marks > 0) status = `${chainTxt ? chainTxt + ' · ' : ''}MARKS ${p.marks | 0}/5 · [R] detonates`;
      else if (chainTxt) status = chainTxt + ' · any other skill keeps it going';
      else if (p.stage === 2) status = 'FULLY CHARGED · press [Z] for the Solar Cannon';
      else if (p.stage === 1) status = 'Almost there · keep chaining blades and beam';
      else status = 'Blade combo into beam combo to fill the core';
      setText('al-status', status);
      const mode = document.getElementById('al-mode');
      if (mode) mode.classList.toggle('beam', p.mode === 'beam');
      setText('al-mode-name', p.mode === 'beam' ? 'BEAM' : 'SABER');
      setText('al-sync', p.syncT > 0 ? `SYNC ${p.syncT.toFixed(1)}s` : '');
      const z = document.getElementById('slot-z');
      if (z) { z.classList.toggle('primed-glow', p.heat >= 99.5 && p.cds.z <= 0.05); z.classList.toggle('arclight-ready', p.heat >= 99.5 && p.cds.z <= 0.05); }
      document.body.dataset.arclightHeat = String(p.stage);
    },

    // Show the Beam kit (names, icons) on the skill bar while in Beam mode, and the Saber kit otherwise.
    syncKit(p) {
      const beam = p.mode === 'beam';
      const keys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't'];
      const sig = (beam ? 'b' : 's') + keys.map(k => { const m = beam ? SKILL_META.arclight.beam[k] : SKILL_META.arclight.skills[k]; return m && m.img ? 1 : 0; }).join('');
      if (p.__kitSig === sig) return;
      p.__kitSig = sig;
      for (const k of keys) {
        let m = beam ? SKILL_META.arclight.beam[k] : SKILL_META.arclight.skills[k];
        const slot = document.getElementById('slot-' + k);
        if (!m || !slot) continue;
        if (!beam) { const sk = SKILL_META.arclight.skills[k]; m = { short: sk.short, name: sk.name, icon: sk.icon, img: sk.img }; }
        const nm = slot.querySelector('.skill-name'), ic = slot.querySelector('.skill-icon');
        if (nm) nm.textContent = m.short || m.name;
        if (ic) ic.innerHTML = m.img ? `<img src="${m.img}" alt="" draggable="false">` : m.icon;
        slot.classList.toggle('has-img', !!m.img);
      }
    },

    afterGenericHud(game, p) { this.syncKit(p); }
  };
  window.ArclightHud = ArclightHud;

  if (typeof Game25D !== 'undefined' && Game25D.prototype.updateRealtimeHUD) {
    const orig = Game25D.prototype.updateRealtimeHUD;
    Game25D.prototype.updateRealtimeHUD = function () {
      const r = orig.apply(this, arguments);
      const p = this.localPlayer;
      if (p && p.classId === 'arclight') ArclightHud.afterGenericHud(this, p);
      return r;
    };
  }
})();

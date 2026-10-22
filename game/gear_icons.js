// =========================================================================
// GEAR_ICONS.JS — painted icons for weapons and armor (game/icons/wpn_<model>.png, arm_t1..t3.png).
// html(entry) takes a shop recipe or an owned item and returns an <img> (or the emoji if the file is missing).
// =========================================================================
(function () {
  const ARM = { starter_arm: 't1', arm_eclipse_cuirass: 't2', arm_sovereign_plate: 't3' };
  const src = (e) => {
    if (!e) return '';
    if (e.slot === 'weapon' && e.weaponModelId) return `game/icons/wpn_${e.weaponModelId}.png`;
    if (e.slot === 'armor') { const t = ARM[e.recipeId || e.id]; return t ? `game/icons/arm_${t}.png` : ''; }
    return '';
  };
  const html = (e, cls = 'acc-ico') => {
    const s = src(e), emoji = e && e.slot === 'armor' ? '🛡️' : '🗡️';
    return s ? `<img class="${cls}" src="${s}" alt="" onerror="this.replaceWith(document.createTextNode('${emoji}'))">` : emoji;
  };
  window.GearIcons = { src, html };
})();
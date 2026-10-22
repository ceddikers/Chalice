// =========================================================================
// UI_MENUS.JS — small UI glue. (The title screen, character slots and creator live in characters.js.)
// Keeps a body class in step with the world mode so the stylesheet can hide hub-only buttons while in a raid.
// =========================================================================
(function () {
  function init() {
    if (!window.game) return;
    const sync = () => document.body.classList.toggle('in-raid', window.game.mode === 'raid');
    sync();
    setInterval(sync, 250);
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init);
  else init();
})();

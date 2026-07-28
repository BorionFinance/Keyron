(() => {
  'use strict';
  const framed = window.top !== window.self;
  window.__KEYRON_FRAME_BLOCKED__ = framed;
  if (!framed) return;
  document.documentElement.style.display = 'none';
  try { window.top.location = window.self.location.href; } catch { /* sandbox/cross-origin: keep hidden */ }
})();

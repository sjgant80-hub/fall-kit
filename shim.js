/*!
 * Fall Cascade Shim · v1.0.0
 * MIT · AI-Native Solutions · ai-nativesolutions.com
 *
 * One-line injection that adds the full fall-kit AI cascade to any single-file HTML tool:
 *   T0 · off (default, seed keeps working) · T2 · WebLLM local · T3 · BYOK across
 *   12 text · 7 image · 5 video · 4 TTS · 3 STT providers.
 *
 * Usage · one line before </body>:
 *   <script src="https://sjgant80-hub.github.io/fall-kit/shim.js" defer></script>
 *
 * The shim:
 *  - lazy-loads fall-kit.js from the same host
 *  - calls FallKit.init with the current seed's slug detected from location
 *  - injects the floating AI chip · click to configure
 *  - does NOTHING until the user opts in to T2 or T3
 *
 * If the host tool already includes fall-kit inline, this shim short-circuits.
 */
(function () {
  'use strict';
  if (window.FallKit) return; // already inline
  if (document.querySelector('script[data-fall-cascade-loaded]')) return;

  const KIT_URL = 'https://sjgant80-hub.github.io/fall-kit/fall-kit.js';
  const MARKER = 'data-fall-cascade-loaded';

  function detectSeedName() {
    // Prefer document title's first token, then hostname's first label
    const title = (document.title || '').replace(/^[◊·\s]+/, '').split(/[·—\-|]/)[0].trim();
    if (title && title.length < 40) return title;
    return (location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }

  function mount() {
    if (!window.FallKit) return;
    try {
      window.FallKit.init({ seedName: detectSeedName() });
    } catch (e) {
      console.warn('[fall-cascade-shim] init failed:', e);
    }
  }

  const s = document.createElement('script');
  s.src = KIT_URL;
  s.async = true;
  s.setAttribute(MARKER, '1');
  s.onload = mount;
  s.onerror = () => console.warn('[fall-cascade-shim] fall-kit failed to load from', KIT_URL);
  document.head.appendChild(s);
})();

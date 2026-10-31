// Device detection, evaluated once at start-up (before the configuration is
// read: src/config.js applies its MOBILE profile from it).
//
//   DEVICE.mobile       touch-first phone or tablet: coarse primary pointer AND no
//                       hover AND a short screen side <= 1100 CSS px. A laptop with a
//                       touch screen (fine pointer, hover) stays a PC.
//   DEVICE.phone        mobile with a short side < 600 CSS px
//   DEVICE.touch        touch points available (any device)
//   DEVICE.touchFirst   coarse primary pointer and no hover (texts say "Touchez"
//                       there, "Sélectionnez" / "Cliquez" with a mouse)
//   DEVICE.ios          WebKit on iOS / iPadOS (every iOS browser is WebKit)
//   DEVICE.lowMemory    navigator.deviceMemory <= 4 (Chrome only; unknown = false)
//   DEVICE.saveData     the visitor asked for reduced data use
//   DEVICE.reducedMotion
//   isPortrait()        current orientation of the window (changes at run time)
//   lowBattery()        Promise<boolean>: battery < 20 % and not charging (where the
//                       Battery Status API exists: Chrome / Android; false elsewhere)
// URL override for tests (`npm run dev` only): ?mobile=1 (force the mobile profile) / ?mobile=0 (never).
const mm = (q) => { try { return window.matchMedia?.(q).matches ?? false; } catch { return false; } };

function detect() {
  if (typeof window === 'undefined') return { mobile: false, phone: false, touch: false, touchFirst: false, ios: false, lowMemory: false, saveData: false, reducedMotion: false, forced: null };
  const q = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('mobile') : null; // dev only
  const forced = q === '1' ? true : q === '0' ? false : null;
  const coarse = mm('(pointer: coarse)');
  const noHover = mm('(hover: none)');
  const scr = window.screen ?? {};
  const short = Math.min(scr.width || window.innerWidth, scr.height || window.innerHeight, Math.max(window.innerWidth, window.innerHeight));
  const touch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
  const ua = navigator.userAgent || '';
  // iPadOS reports a Mac user agent: a "Mac" with touch points is an iPad
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const auto = coarse && noHover && short <= 1100;
  const mobile = forced ?? auto;
  return {
    mobile,
    phone: mobile && short < 600,
    touch,
    touchFirst: coarse && noHover,
    ios,
    lowMemory: (navigator.deviceMemory ?? 8) <= 4,
    saveData: !!navigator.connection?.saveData,
    reducedMotion: mm('(prefers-reduced-motion: reduce)'),
    forced,
  };
}

export const DEVICE = detect();
export const isPortrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;

let battery = null;
export function lowBattery() {
  if (battery) return battery;
  battery = (async () => {
    try {
      if (!navigator.getBattery) return false;
      const b = await navigator.getBattery();
      return !b.charging && b.level < 0.2;
    } catch { return false; }
  })();
  return battery;
}

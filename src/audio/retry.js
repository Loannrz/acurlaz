// Per-URL failure counter with a growing wait, so that a failing network or a
// failing analysis is never retried in a loop (the track lists ask for their
// previews on every redraw). After a failure the next attempt is allowed only
// after baseMs, then 2x, 4x... (2 s, 4 s, 8 s); after `max` failures the URL is
// given up for the visit. A success clears its counter.
//   const gate = createRetryGate({ max: 3, baseMs: 2000 });
//   gate.allowed(url)   // may it be tried now?
//   gate.fail(url, err) // -> true when the URL is now given up
//   gate.ok(url), gate.error(url) (last error), gate.givenUp(url)
export function createRetryGate({ max = 3, baseMs = 2000 } = {}) {
  const map = new Map(); // url -> { n, until, error }
  return {
    allowed(url, now = performance.now()) {
      const e = map.get(url);
      return !e || (e.n < max && now >= e.until);
    },
    givenUp: (url) => (map.get(url)?.n ?? 0) >= max,
    error: (url) => map.get(url)?.error ?? null,
    fail(url, error) {
      const e = map.get(url) ?? { n: 0, until: 0, error: null };
      e.n++;
      e.until = performance.now() + baseMs * 2 ** (e.n - 1);
      e.error = error;
      map.set(url, e);
      return e.n >= max;
    },
    ok(url) { map.delete(url); },
  };
}

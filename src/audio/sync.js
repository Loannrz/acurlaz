// Tempo master and BEAT SYNC between the decks (CDJ-3000 Beat Sync, simplified
// for two players).
//   const sync = createSync(decks);          // src/screens/index.js
//   sync.masterUnit                          // 'cdjLeft' | 'cdjRight' | null
//   sync.setMaster(unit)                     // MASTER button: this deck leads
//   sync.toggleSync(unit) / sync.isSynced(unit)
//   sync.onChange(fn)                        // fn() when the master or a sync flag changes
// Master: the deck chosen with MASTER while it has a track; otherwise automatic
// (the playing deck, else the first loaded one), like the CDJ hands the master to
// the deck that plays.
// Synced deck: its tempo follows the master (BPM x tempo of the master, the jog
// bend excluded), halved / doubled when that is closer (70 <-> 140 BPM); its
// TEMPO slider is ignored meanwhile, and the slider tempo comes back when SYNC
// is turned off. Phase: when SYNC is turned on while both play, and when a synced
// deck starts, its position moves by less than half a beat so its beats fall on
// the master's beats (beat grids of src/audio/waveform.js).
export function createSync(decks) {
  const units = Object.keys(decks);
  const listeners = new Set();
  const synced = new Set();
  let master = null;
  let explicit = false; // chosen with the MASTER button
  let busy = false;

  const usable = (u) => decks[u]?.status === 'ready' && decks[u].trackBpm > 0;
  const emit = () => { for (const fn of listeners) fn(); };

  const resolve = () => {
    let m = master;
    if (m && !usable(m)) { m = null; explicit = false; }
    if (!explicit) {
      const ready = units.filter(usable);
      const playingFree = ready.find((u) => decks[u].playing && !synced.has(u));
      const playingAny = ready.find((u) => decks[u].playing);
      if (!m || !decks[m].playing) m = playingFree ?? playingAny ?? m ?? ready[0] ?? null;
    }
    const changed = m !== master;
    master = m;
    return changed;
  };

  // octave factor between a deck and the master: 1, 2 or 1/2, whichever needs the
  // smallest speed change (rate stays in 1/sqrt2..sqrt2: 107 -> 160 BPM plays at
  // x0.75 on the half tempo 80, not at x1.5)
  const ratioTo = (d, m) => {
    const mb = m.bpm, mine = d.trackBpm;
    if (!(mb > 0 && mine > 0)) return null;
    let r = mb / mine;
    while (r > Math.SQRT2) r /= 2;
    while (r < Math.SQRT1_2) r *= 2;
    return r;
  };
  const follow = () => {
    for (const u of units) {
      const d = decks[u];
      if (!synced.has(u) || !master || u === master || !usable(u)) { d.setSyncRate(null); continue; }
      d.setSyncRate(ratioTo(d, decks[master]));
    }
  };
  // shift (track s) that puts deck d at position `from` in phase with the master now
  const phaseShift = (d, from) => {
    const m = master ? decks[master] : null;
    if (!m || m === d || !m.playing) return 0;
    const gd = d.grid, gm = m.grid;
    const r = ratioTo(d, m);
    if (!gd || !gm || !r) return 0;
    const oct = (gd.bpm * r) / (gm.bpm * m.baseRate); // 1, 2 or 1/2
    const bd = (from - gd.first) / gd.spb;
    const bm = (m.position - gm.first) / gm.spb;
    const x = bd - oct * bm;
    return -(x - Math.round(x)) * gd.spb;
  };

  const update = () => {
    if (busy) return;
    busy = true;
    try {
      const changed = resolve();
      follow();
      if (changed) emit();
    } finally { busy = false; }
  };
  for (const u of units) {
    decks[u].onChange(update);
    // a synced deck starts in phase with the master
    decks[u].setPlayHook((d, from) => {
      if (!synced.has(u) || master === u) return from;
      let f = from + phaseShift(d, from);
      if (f < 0) f += d.grid?.spb ?? 0;
      return f;
    });
  }

  return {
    get masterUnit() { return master; },
    isSynced: (u) => synced.has(u),
    get synced() { return [...synced]; },
    setMaster(u) {
      if (!usable(u)) return false;
      const changed = master !== u || !explicit;
      master = u; explicit = true;
      follow();
      if (changed) emit();
      return true;
    },
    toggleSync(u) {
      const d = decks[u];
      if (!d) return false;
      if (synced.has(u)) { synced.delete(u); d.setSyncRate(null); emit(); return false; }
      if (!usable(u)) return false;
      synced.add(u);
      // the master syncing to the other deck: the other deck leads
      if (master === u) {
        const o = units.find((x) => x !== u && usable(x));
        if (o) { master = o; explicit = true; }
      }
      resolve();
      follow();
      if (d.playing && master && master !== u && decks[master].playing) {
        const s = phaseShift(d, d.position);
        if (Math.abs(s) > 1e-3) d.seek(d.position + s);
      }
      emit();
      return true;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

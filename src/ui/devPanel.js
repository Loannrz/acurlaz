// Dev-only panel (top right): last clicked zone with a short flash, hover
// readout, history of the last 5 clicks (and screen taps), touch events of the
// focused screen, Alt+click coordinates, FPS.
// Visibility: setVisible / toggle (key P). While a CDJ screen is focused the
// panel is hidden (setFocus(true)), then put back as it was before the focus
// (setFocus(false)); it keeps logging while hidden.
export function createDevPanel() {
  const el = document.createElement('div');
  el.id = 'devpanel';
  el.innerHTML = `
    <div class="title"><span>DEV · zones</span><span class="fps"></span></div>
    <div class="last">—</div>
    <div class="meta"></div>
    <div class="hover"></div>
    <div class="touch"></div>
    <ol></ol>
    <div class="hint">H : afficher les zones · Alt+clic : coordonnées locales<br>R : rejouer · Espace : pause · Échap : passer · P : panneau</div>`;
  document.body.appendChild(el);
  const last = el.querySelector('.last');
  const meta = el.querySelector('.meta');
  const hover = el.querySelector('.hover');
  const touchLine = el.querySelector('.touch');
  const list = el.querySelector('ol');
  const fps = el.querySelector('.fps');
  const history = [];
  let count = 0;
  let flashTimer = 0;
  let inFocus = false;
  let beforeFocus = true; // visibility to restore when the focus ends

  // Same output as toLocaleTimeString('fr-FR', { hour12: false }), but the locale
  // data is loaded here, at start-up, not on the first click (~20-70 ms stall
  // in the middle of the screen-focus flight).
  const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false });
  timeFormat.format(new Date());
  const time = () => timeFormat.format(new Date());
  const pushHistory = (text) => {
    history.unshift(text);
    history.splice(5);
    list.replaceChildren(...history.map((h) => { const li = document.createElement('li'); li.textContent = h; return li; }));
  };
  // The inline display is the single source of truth (main.js may hide the panel at start).
  const isVisible = () => el.style.display !== 'none';
  const setVisible = (v) => { el.style.display = v ? '' : 'none'; };

  return {
    el,
    click({ id, unit, label }) {
      count++;
      last.innerHTML = `<span class="id"></span>`;
      last.querySelector('.id').textContent = id;
      meta.textContent = `${unit} · ${label} · #${count} · ${time()}`;
      pushHistory(`${count}. ${id}`);
      el.classList.remove('flash');
      void el.offsetWidth; // restart the CSS transition
      el.classList.add('flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => el.classList.remove('flash'), 220);
    },
    // Touch event of a focused screen: { type, unit, x, y, region, dragging }.
    touch({ type, unit, x, y, region, dragging }) {
      const pos = `x ${x.toFixed(1)}  y ${y.toFixed(1)}`;
      touchLine.textContent = `touch ${type}${type === 'pointermove' && dragging ? ' (glisser)' : ''} · ${pos} · ${unit}${region ? ` → ${region}` : ''}`;
      if (type === 'tap') pushHistory(`tap ${unit} ${Math.round(x)},${Math.round(y)}${region ? ` → ${region}` : ''}`);
    },
    hover(info) {
      hover.textContent = info ? `survol : ${info.id}` : '';
    },
    coords({ unit, x, y, z, zone }) {
      hover.textContent = `${unit} local mm : x ${x}  y ${y}  z ${z}${zone ? `  → ${zone}` : ''}`;
    },
    status(text) { fps.textContent = text; },
    get visible() { return isVisible(); },
    setVisible,
    toggle() { setVisible(!isVisible()); return isVisible(); },
    // Screen focus: hide while active, restore the previous visibility after.
    setFocus(active) {
      if (active === inFocus) return;
      inFocus = active;
      if (active) { beforeFocus = isVisible(); setVisible(false); } else setVisible(beforeFocus);
    },
    dispose() { clearTimeout(flashTimer); el.remove(); },
  };
}

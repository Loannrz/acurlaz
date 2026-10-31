// LINK page (top key "Link"): the networks of the artist (src/data/links.js),
// drawn as a BROWSE list. A touch on a row opens the link in a new tab
// (widgets/external.js); a placeholder address shows "Lien à venir" instead.
// The category column and the USB tile stay live, as on the SOURCES page:
// TRACK / ALBUM / BPM / KEY / PLAYLIST open that view of SOURCES, FEAT / DATES /
// À PROPOS open those pages, the USB tile opens the key list.
//
// CONTRACT (keep the work inside this file + src/data/links.js):
//   - reads: api.library.links ([{ id, name, handle, url }]), api.deckInfo()
//   - writes its own nav: { lists: { highlight, scroll }, pending: link id | null },
//     and the nav of 'sources' when a category / the USB tile is touched
//   - touch zones: api.region(...) inside draw() (through widgets/browse.js);
//     drags in onPointer(e, api)
import { registerPage } from '../registry.js';
import { statusBarFps } from '../design.js';
import { browseFrame, drawFolderList, listPointer } from '../widgets/browse.js';
import { openExternal, isPending, PENDING_LABEL } from '../widgets/external.js';

const SOURCE_VIEWS = new Set(['track', 'album', 'bpm', 'key', 'playlist']);
const PAGES = { feat: 'feat', dates: 'dates', about: 'about' };
// first nav of the SOURCES page (same as its initialNav), if it was never shown
const SOURCES_NAV = { level: 'devices', device: 0, open: 0, cat: 'track', albumOpen: null, playlistOpen: null, list: {} };

const hostOf = (url) => {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; }
};

registerPage('link', {
  frameRate: statusBarFps, // status bar (REMAIN, playhead) while the deck plays, else 0
  initialNav: () => ({ lists: {}, pending: null }),

  draw(ctx, state, api) {
    const links = api.library.links ?? [];
    const nav = api.nav;
    const src = api.navOf('sources');
    const f = browseFrame(ctx, api, {
      title: 'Mes réseaux', icon: 'link', back: false, device: src.open ?? 0, category: null, buttons: [],
      onCategory: (id) => {
        if (PAGES[id]) { api.go(PAGES[id]); return; }
        if (!SOURCE_VIEWS.has(id)) return;
        api.setNavOf('sources', (prev) => ({ ...SOURCES_NAV, ...prev, level: 'tracks', cat: id }));
        api.go('sources');
      },
      onDevice: () => { api.setNavOf('sources', (prev) => ({ ...SOURCES_NAV, ...prev, level: 'devices', device: prev.open ?? 0 })); api.go('sources'); },
    });
    const items = links.map((l) => {
      const pending = nav.pending === l.id;
      return { id: l.id, name: l.name, detail: pending ? PENDING_LABEL : (l.handle || hostOf(l.url)), dim: pending };
    });
    drawFolderList(ctx, f.list, items, api, {
      navKey: 'lists', header: 'LINK', icon: 'link', openOnTap: true, trailing: 'arrow', emptyText: 'Aucun lien',
      onOpen: (i) => {
        const l = links[i];
        if (!l) return;
        if (!isPending(l.url) && openExternal(l.url)) { if (api.nav.pending) api.setNav({ pending: null }); return; }
        api.setNav({ pending: l.id });
      },
    });
  },

  onPointer(e, api) { listPointer(e, api, { navKey: 'lists' }); },
  onHide(api) { if (api.navOf('link').pending) api.setNavOf('link', { pending: null }); },
});

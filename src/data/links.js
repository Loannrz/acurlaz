// Networks of the artist, shown on the LINK page (top key "Link",
// src/screens/pages/link.js). A touch on a row opens `url` in a new tab.
//
// TO REPLACE: the URLs below are PLACEHOLDERS (home page of each network).
// Put the address of the real profile instead, e.g.
//   Instagram  https://www.instagram.com/nom_du_compte/
//   TikTok     https://www.tiktok.com/@nom_du_compte
//   SoundCloud https://soundcloud.com/nom_du_compte
//   Spotify    https://open.spotify.com/artist/identifiant
//   YouTube    https://www.youtube.com/@nom_de_la_chaine
//   Facebook   https://www.facebook.com/nom_de_la_page
//   WhatsApp   https://wa.me/33612345678 (numéro au format international, sans + ni espaces)
// An empty url (or '#') keeps the row visible: a touch shows "Lien à venir".
// Fields: id (unique), name (shown), handle (optional, shown on the right; if
// empty, the address of the link is shown instead), url.
// Only http(s), mailto: and tel: addresses are opened (src/screens/widgets/external.js).
export const LINKS = [
  { id: 'instagram', name: 'Instagram', handle: '', url: 'https://www.instagram.com/' },
  { id: 'tiktok', name: 'TikTok', handle: '', url: 'https://www.tiktok.com/' },
  { id: 'soundcloud', name: 'SoundCloud', handle: '', url: 'https://soundcloud.com/' },
  { id: 'spotify', name: 'Spotify', handle: '', url: 'https://open.spotify.com/' },
  { id: 'youtube', name: 'YouTube', handle: '', url: 'https://www.youtube.com/' },
  { id: 'facebook', name: 'Facebook', handle: '', url: 'https://www.facebook.com/' },
  { id: 'whatsapp', name: 'WhatsApp', handle: '', url: 'https://www.whatsapp.com/' },
];

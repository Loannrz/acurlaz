// FAKE list of DJs / artists the artist has played with (invented names, to be
// replaced). Read by src/screens/pages/feat.js through library.feat.
// Fields: name (stage name), style, cat (category key of the page: house |
// techno | afro | disco | breaks), country, year (last set together), sets
// (number of sets played together), where (last venue / event), note (short
// line shown in the info panel), instagramUrl (Instagram of the artist: button
// "Instagram" of the info panel).
// TO REPLACE: '#' is a placeholder; the button stays visible and a touch shows
// "Lien à venir" until a real address (https://...) is put here.
export const FEAT = [
  { name: 'Nora Velde', style: 'Deep house', cat: 'house', country: 'France', year: 2026, sets: 9, where: 'Cassita Club, Marseille', note: 'Back to back de clôture, quatre heures d’affilée.', instagramUrl: '#' },
  { name: 'KOSMA', style: 'Techno mélodique', cat: 'techno', country: 'Grèce', year: 2026, sets: 4, where: 'La Dune, La Grande-Motte', note: 'Plateau partagé au lever du soleil.', instagramUrl: '#' },
  { name: 'Lino Sarrat', style: 'Tech house', cat: 'house', country: 'France', year: 2025, sets: 7, where: 'Le Hangar 9, Lyon', note: 'Résidence croisée sur toute la saison.', instagramUrl: '#' },
  { name: 'Mira Delacroix', style: 'Disco edits', cat: 'disco', country: 'France', year: 2025, sets: 3, where: 'Péniche Oslo, Paris', note: 'Soirée sur l’eau, set de 2 h chacun.', instagramUrl: '#' },
  { name: 'Basile K.', style: 'Acid techno', cat: 'techno', country: 'Belgique', year: 2025, sets: 5, where: 'Club Nadir, Montpellier', note: 'Passage de relais à 3 h du matin.', instagramUrl: '#' },
  { name: 'Ondine Vasseur', style: 'Afro house', cat: 'afro', country: 'Sénégal', year: 2024, sets: 6, where: 'Le Solstice, Nice', note: 'Percussions live pendant le set.', instagramUrl: '#' },
  { name: 'Tomás Riera', style: 'Progressive', cat: 'house', country: 'Espagne', year: 2024, sets: 2, where: 'Sunset Session, Barcelone', note: 'Coucher de soleil en terrasse.', instagramUrl: '#' },
  { name: 'Juno Arkade', style: 'Electro', cat: 'breaks', country: 'Belgique', year: 2024, sets: 3, where: 'Warehouse 12, Bruxelles', note: 'Warehouse à deux salles.', instagramUrl: '#' },
  { name: 'Selim Varga', style: 'Minimal', cat: 'techno', country: 'Hongrie', year: 2023, sets: 2, where: 'Cassita Club, Marseille', note: 'Premier set partagé, à la fermeture.', instagramUrl: '#' },
  { name: 'Elsa Montreuil', style: 'House vocale', cat: 'house', country: 'France', year: 2023, sets: 8, where: 'Le Hangar 9, Lyon', note: 'Collaboratrice la plus régulière.', instagramUrl: '#' },
  { name: 'Kofi Anane', style: 'Afro tech', cat: 'afro', country: 'Ghana', year: 2023, sets: 3, where: 'Festival Mistral, Arles', note: 'Scène principale, fin d’après-midi.', instagramUrl: '#' },
  { name: 'DJ Soleil Noir', style: 'Italo disco', cat: 'disco', country: 'Italie', year: 2022, sets: 2, where: 'Villa Lumen, Turin', note: 'Soirée privée en jardin.', instagramUrl: '#' },
  { name: 'Vera Lund', style: 'Hard techno', cat: 'techno', country: 'Suède', year: 2022, sets: 4, where: 'Bunker 47, Berlin', note: 'Set enchaîné sans pause.', instagramUrl: '#' },
  { name: 'Maceo Brun', style: 'Breakbeat', cat: 'breaks', country: 'France', year: 2022, sets: 5, where: 'La Cartonnerie, Nantes', note: 'Duo de fin de tournée.', instagramUrl: '#' },
  { name: 'Aïcha Ferrand', style: 'Afro house', cat: 'afro', country: 'France', year: 2021, sets: 3, where: 'Plage Pointe Rouge, Marseille', note: 'Soirée en bord de mer.', instagramUrl: '#' },
  { name: 'Hugo Lessage', style: 'Disco house', cat: 'disco', country: 'France', year: 2021, sets: 6, where: 'Le Solstice, Nice', note: 'Premières dates communes.', instagramUrl: '#' },
];

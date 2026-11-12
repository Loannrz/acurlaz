// DONNÉES FACTICES : tout ce contenu (nom, bio, liens, dates, collaborateurs,
// morceaux de démo) est provisoire et doit être remplacé par les vraies
// informations de l'artiste. Seules les mentions de licence de `credits`
// (modèle 3D, musiques) sont réelles et doivent être conservées.
// Source unique du contenu : ne pas dupliquer ces données ailleurs.
//
// Les URL de liens valant '#' ou '' sont des emplacements à remplir.
// Les chemins d'assets passent par assetUrl() (compatible `base` de Vite).

const BASE = import.meta.env?.BASE_URL || '/';
export const assetUrl = (path) => `${BASE.replace(/\/?$/, '/')}${String(path).replace(/^\//, '')}`;

export const artist = {
  name: 'ARTISTE',
  role: 'DJ et producteur',
  logo: assetUrl('img/acurlaz-logo.png'),
};

export const about = {
  title: 'À propos',
  name: artist.name,
  role: 'DJ et producteur',
  paragraphs: [
    'Depuis 2014, ARTISTE joue de la techno et de la house par paliers : entrée lente, montée franche. Résident dans plusieurs clubs parisiens, il laisse la piste respirer.',
  ],
  facts: [
    { label: 'Depuis', value: '2014' },
    { label: 'Styles', value: 'Techno, house' },
    { label: 'Basé à', value: 'Paris' },
    { label: 'Résidences', value: 'Club Aval, Le Hangar' },
  ],
  photo: assetUrl('img/about-portrait.jpg'),
  photoAlt: 'Portrait en noir et blanc, visage de profil',
};

// Adresse de contact. Vide, les boutons « Écrire » et « Copier l'adresse » ne s'affichent
// pas ; remplie, « Écrire » ouvre un mailto. Comme les dates, les artistes, la bio et les
// liens, elle se modifie depuis la régie (/admin) : la valeur ci-dessous n'est que le repli.
export const contact = { email: '' };

export const links = [
  { id: 'instagram', name: 'Instagram', handle: '', url: 'https://www.instagram.com/' },
  { id: 'tiktok', name: 'TikTok', handle: '', url: 'https://www.tiktok.com/' },
  { id: 'soundcloud', name: 'SoundCloud', handle: '', url: 'https://soundcloud.com/' },
  { id: 'spotify', name: 'Spotify', handle: '', url: 'https://open.spotify.com/' },
  { id: 'youtube', name: 'YouTube', handle: '', url: 'https://www.youtube.com/' },
  { id: 'facebook', name: 'Facebook', handle: '', url: 'https://www.facebook.com/' },
  { id: 'whatsapp', name: 'WhatsApp', handle: '', url: 'https://www.whatsapp.com/' },
];

// Dates (YYYY-MM-DD). Certaines sont déjà passées : elles restent dans la liste,
// utiliser upcomingDates() pour n'afficher que les dates à venir.
// set / end / doors : heures HH:MM ; warmup : DJ d'ouverture.
export const dates = [
  { date: '2026-11-10', venue: 'Cassita Club', city: 'Marseille', address: '14 rue des Lices, 13007 Marseille', warmup: 'Lina Morel', set: '01:30', end: '03:00', doors: '23:30', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-11-11', venue: 'La Dune', city: 'La Grande-Motte', address: 'Plage du Couchant, 34280 La Grande-Motte', warmup: 'Sacha Ivo', set: '23:00', end: '00:30', doors: '20:00', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-11-13', venue: 'Le Hangar 9', city: 'Lyon', address: '9 quai Arloing, 69009 Lyon', warmup: 'Noé Barthe', set: '02:00', end: '04:00', doors: '23:00', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-11-17', venue: 'La Friche Sonore', city: 'Toulouse', address: '41 allée des Forges, 31300 Toulouse', warmup: 'Maëlle Dufour', set: '00:00', end: '01:30', doors: '22:00', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-11-21', venue: 'Club Nadir', city: 'Montpellier', address: '3 impasse des Tanneurs, 34000 Montpellier', warmup: 'Adèle Fournier', set: '00:30', end: '02:00', doors: '23:00', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-11-24', venue: 'Le Phare Bleu', city: 'Bordeaux', address: '18 quai des Chartrons, 33000 Bordeaux', warmup: 'Tom Gaillard', set: '23:30', end: '01:00', doors: '22:00', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-11-28', venue: 'Péniche Oslo', city: 'Paris', address: 'Port de la Gare, 75013 Paris', warmup: 'Kemi Rousseau', set: '01:00', end: '03:00', doors: '22:30', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-12-05', venue: 'Le Solstice', city: 'Nice', address: '27 boulevard Stalingrad, 06300 Nice', warmup: 'Basile Moreau', set: '01:30', end: '03:00', doors: '23:00', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-12-12', venue: 'Les Docks Nord', city: 'Lille', address: '6 rue du Quai, 59000 Lille', warmup: 'Inès Carpentier', set: '00:30', end: '02:30', doors: '22:30', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-12-19', venue: 'Cassita Club', city: 'Marseille', address: '14 rue des Lices, 13007 Marseille', warmup: 'Lina Morel', set: '01:00', end: '03:00', doors: '23:00', ticketUrl: '#', instagramUrl: '#' },
  { date: '2026-12-31', venue: 'Le Grand Salon', city: 'Aix-en-Provence', address: '2 cours Mirabeau, 13100 Aix-en-Provence', warmup: 'Sacha Ivo', set: '00:00', end: '02:00', doors: '21:00', ticketUrl: '#', instagramUrl: '#' },
];

// Dates à venir, triées par date croissante. Une date du jour reste incluse.
// Fonction pure : `now` est injectable pour les tests (défaut : maintenant).
export function upcomingDates(list = dates, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // aujourd'hui, 00:00 local
  return list
    .map((d) => ({ ...d, when: new Date(`${d.date}T12:00:00`) }))
    .filter((d) => d.when >= today)
    .sort((a, b) => a.when - b.when);
}

// Artistes avec qui l'artiste a joué (noms inventés).
// cat : house | techno | afro | disco | breaks
export const collaborators = [
  { name: 'Nora Velde', style: 'Deep house', cat: 'house', country: 'France', year: 2026, sets: 9, where: 'Cassita Club, Marseille', note: 'Back to back de clôture, quatre heures d’affilée.', instagramUrl: '#' },
  { name: 'KOSMA', style: 'Techno mélodique', cat: 'techno', country: 'Grèce', year: 2026, sets: 4, where: 'La Dune, La Grande-Motte', note: 'Plateau partagé au lever du soleil.', instagramUrl: '#' },
  { name: 'Lino Sarrat', style: 'Tech house', cat: 'house', country: 'France', year: 2025, sets: 7, where: 'Le Hangar 9, Lyon', note: 'Résidence croisée sur toute la saison.', instagramUrl: '#' },
  { name: 'Mira Delacroix', style: 'Disco edits', cat: 'disco', country: 'France', year: 2025, sets: 3, where: 'Péniche Oslo, Paris', note: 'Soirée sur l’eau, set de 2 h chacun.', instagramUrl: '#' },
  { name: 'Basile K.', style: 'Acid techno', cat: 'techno', country: 'Belgique', year: 2025, sets: 5, where: 'Club Nadir, Montpellier', note: 'Passage de relais à 3 h du matin.', instagramUrl: '#' },
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

// Morceaux de démo (Kevin MacLeod, CC BY 4.0, raccourcis à 150 s max).
// bpm et tonalité (notation Camelot) fictifs. duration en secondes.
const MACLEOD = { artist: 'Kevin MacLeod', license: 'CC BY 4.0' };
const mp3 = (file) => assetUrl(`audio/${file}`);
const incompetech = (name) => `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(name)}.mp3`;

export const tracks = [
  { id: 'usb1-01', source: 'USB 1', album: 'Démo vol. 1', title: 'Cyborg Ninja', ...MACLEOD, bpm: 124, key: '6A', duration: 150.0, url: mp3('usb1-01.mp3'), sourceUrl: incompetech('Cyborg Ninja') },
  { id: 'usb1-02', source: 'USB 1', album: 'Démo vol. 2', title: 'Digital Lemonade', ...MACLEOD, bpm: 126, key: '8B', duration: 150.0, url: mp3('usb1-02.mp3'), sourceUrl: incompetech('Digital Lemonade') },
  { id: 'usb1-03', source: 'USB 1', album: 'Démo vol. 3', title: 'Rocket', ...MACLEOD, bpm: 128, key: '4A', duration: 147.0, url: mp3('usb1-03.mp3'), sourceUrl: incompetech('Rocket') },
  { id: 'usb2-01', source: 'USB 2', album: 'Démo vol. 1', title: 'Cut and Run', ...MACLEOD, bpm: 122, key: '9A', duration: 150.0, url: mp3('usb2-01.mp3'), sourceUrl: incompetech('Cut and Run') },
  { id: 'usb2-02', source: 'USB 2', album: 'Démo vol. 2', title: 'Ouroboros', ...MACLEOD, bpm: 120, key: '5A', duration: 150.0, url: mp3('usb2-02.mp3'), sourceUrl: incompetech('Ouroboros') },
  { id: 'usb2-03', source: 'USB 2', album: 'Démo vol. 3', title: 'Danger Storm', ...MACLEOD, bpm: 130, key: '7A', duration: 150.0, url: mp3('usb2-03.mp3'), sourceUrl: incompetech('Danger Storm') },
  { id: 'usb3-01', source: 'USB 3', album: 'Démo vol. 1', title: 'Volatile Reaction', ...MACLEOD, bpm: 125, key: '10A', duration: 150.0, url: mp3('usb3-01.mp3'), sourceUrl: incompetech('Volatile Reaction') },
  { id: 'usb3-02', source: 'USB 3', album: 'Démo vol. 2', title: 'Move Forward', ...MACLEOD, bpm: 118, key: '3A', duration: 69.3, url: mp3('usb3-02.mp3'), sourceUrl: incompetech('Move Forward') },
  { id: 'usb3-03', source: 'USB 3', album: 'Démo vol. 3', title: 'Failing Defense', ...MACLEOD, bpm: 127, key: '11B', duration: 105.5, url: mp3('usb3-03.mp3'), sourceUrl: incompetech('Failing Defense') },
];

// Crédits et licences : à conserver (CC BY 4.0 impose l'attribution).
export const credits = {
  site: { role: 'Conception et développement', name: 'Loann Picard' },
  model3d: {
    role: 'Modèle « Pioneer CDJ-3000 »',
    author: 'MaxTht',
    source: 'Sketchfab',
    url: 'https://sketchfab.com/3d-models/pioneer-cdj-3000-7a33aaa799044e0db082f3b2b038c328',
    note: 'Modèle modifié (texture, découpe, étiquette)',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    mention: 'Pioneer CDJ-3000 par MaxTht (Sketchfab), licence CC BY 4.0, modèle modifié.',
  },
  music: {
    role: 'Musiques de démo',
    author: 'Kevin MacLeod',
    url: 'https://incompetech.com',
    note: 'Morceaux raccourcis et réencodés',
    titles: tracks.map((t) => t.title),
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    mention: 'Music by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0, creativecommons.org/licenses/by/4.0. Excerpts shortened and re-encoded.',
  },
  libraries: ['three.js', 'GSAP', 'Lenis', 'Vite', 'Web Audio API'],
  disclaimer: 'Pioneer DJ, AlphaTheta, CDJ-3000 et DJM-900NXS2 appartiennent à leurs propriétaires. Ce site est un hommage non officiel.',
};

// FAKE upcoming dates (placeholders, to be replaced by the real agenda).
// Read by src/screens/pages/dates.js through library.dates (sorted by date).
// Fields: date (YYYY-MM-DD), venue, city, address, warmup (opening DJ),
// set (start of the artist's set, HH:MM), end (end of the set, HH:MM),
// doors (opening time, optional),
// ticketUrl (ticketing page: button "Billetterie" of the info panel),
// instagramUrl (Instagram of the club: button "Instagram").
// TO REPLACE: '#' is a placeholder; the button stays visible and a touch shows
// "Lien à venir" until a real address (https://...) is put here.
export const DATES = [
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

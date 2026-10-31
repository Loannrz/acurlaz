// "À propos" content. PLACEHOLDER text (neutral, to be replaced by the real
// biography); read by src/screens/pages/about.js through library.about.
// photo: file in public/img (the URL is built with import.meta.env.BASE_URL
// by src/data/library.js), royalty-free, see public/img credits.
export const ARTIST = 'ARTISTE';

export const ABOUT = {
  title: 'À PROPOS',
  name: ARTIST,
  role: 'DJ ET PRODUCTEUR',
  paragraphs: [
    'Depuis 2014, ARTISTE joue de la techno et de la house par paliers : entrée lente, montée franche. Résident dans plusieurs clubs parisiens, il laisse la piste respirer.',
  ],
  // repères : [label, valeur] (grille 2 x 2)
  facts: [
    ['DEPUIS', '2014'],
    ['STYLES', 'Techno, house'],
    ['BASÉ À', 'Paris'],
    ['RÉSIDENCES', 'Club Aval, Le Hangar'],
  ],
  photo: 'img/about-portrait.jpg',
};

// Credits roll (page `credits`, src/screens/pages/credits.js), shown on the
// CRÉDITS screen of the mixer while it is focused. Every line comes from
// CREDITS.md / README.md / package.json: keep them in sync when an asset is
// added or replaced.
//
// Shape (all fields optional except where noted):
//   opening: { kicker, title }                 first card, centred when the roll starts
//   sections: [{
//     title,                                   section card (small spaced capitals)
//     note,                                    small grey line under the section card
//     compact,                                 true: medium names (long lists)
//     entries: [{
//       role,                                  small grey capitals above the name
//       name,                                  REQUIRED (unless `names`): large name
//       names: ['a', 'b'],                     several names on one centred line
//       lines: ['...'],                        small grey lines under the name (source, URL)
//       list: ['...'],                         titles, laid out in a centred grid
//       license,                               small licence mention (exact wording)
//     }],
//   }]
//   closing: { title, lines: ['...'] }         last card: the roll stops on it
export const CREDITS = {
  opening: { kicker: 'ACURLAZ', title: 'Crédits' },
  sections: [
    {
      title: 'Site',
      entries: [{ role: 'Conception et développement', name: 'Loann Picard' }],
    },
    {
      title: 'Modèle 3D',
      entries: [{
        role: 'Modèle « Pioneer CDJ-3000 »',
        name: 'MaxTht',
        lines: ['Sketchfab', 'sketchfab.com/3d-models/pioneer-cdj-3000-7a33aaa799044e0db082f3b2b038c328', 'Modèle modifié (texture, découpe, étiquette)'],
        license: 'Licence CC BY 4.0, creativecommons.org/licenses/by/4.0',
      }],
    },
    {
      title: 'Musiques de démo',
      entries: [{
        role: 'Musique',
        name: 'Kevin MacLeod',
        lines: ['incompetech.com', 'Morceaux raccourcis et réencodés'],
        list: [
          'Cyborg Ninja', 'Digital Lemonade', 'Rocket',
          'Cut and Run', 'Ouroboros', 'Danger Storm',
          'Volatile Reaction', 'Move Forward', 'Failing Defense',
        ],
        license: 'Music by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0, creativecommons.org/licenses/by/4.0',
      }],
    },
    {
      title: 'Photo',
      entries: [{
        role: 'Portrait « Man’s face in profile, black and white »',
        name: 'Nik Bagherzadegan',
        lines: ['Unsplash'],
        license: 'Licence Unsplash, unsplash.com/license',
      }],
    },
    {
      title: 'Décor',
      note: 'Textures photo-scannées Poly Haven (polyhaven.com), licence CC0 1.0',
      compact: true,
      entries: [
        { role: 'Red Brick 03', name: 'Rob Tuytel' },
        { role: 'Painted Plaster Wall', name: 'Amal Kumar' },
        { role: 'Dark Wood', name: 'Dario Barresi, Dimitrios Savva, Rico Cilliers' },
        { role: 'Dark Wooden Planks', name: 'Amal Kumar' },
        { role: 'Terracotta Floor Tiles', name: 'Dimitrios Savva' },
      ],
    },
    {
      title: 'Réalisé avec',
      compact: true,
      entries: [{ names: ['three.js', 'GSAP', 'Vite', 'Web Audio API'] }],
    },
  ],
  closing: {
    title: 'ACURLAZ',
    lines: [
      'Pioneer DJ, AlphaTheta, CDJ-3000 et DJM-900NXS2 appartiennent à',
      'leurs propriétaires. Ce site est un hommage non officiel.',
    ],
  },
};

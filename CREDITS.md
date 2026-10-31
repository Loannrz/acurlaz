# Crédits

## Modèle 3D

- **Pioneer Cdj 3000** par **MaxTht** — https://sketchfab.com/3d-models/pioneer-cdj-3000-7a33aaa799044e0db082f3b2b038c328
- Auteur : MaxTht (https://sketchfab.com/thetiot.maxime)
- Licence : CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
- Fichier : `pioneer_cdj_3000.glb` (original à la racine, copie servie depuis `public/models/`)
- Modifications : modèle modifié (texture repeinte sous les commandes et les impressions remplacées, découpe en appareils et en commandes mobiles, étiquette « BEAT FX » du mixer effacée), comme l'exige la licence CC BY 4.0.

Les crédits sont affichés sur le site (écran « CRÉDITS » du mixer : un clic dessus y fait défiler le générique) : texte dans `src/data/credits.js`, à tenir à jour avec ce fichier.

## Assets de démo

Sons et photo provisoires, à remplacer par les contenus réels de l'artiste. Les morceaux ont été raccourcis (150 s max, fondu de sortie) et ré-encodés en MP3 128 kbps.

### Musiques (bibliothèque factice des platines)

Auteur de tous les morceaux : Kevin MacLeod (https://incompetech.com). Licence : CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Mention à afficher : « Music by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0 ».

- `public/audio/usb1-01.mp3` : Cyborg Ninja — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cyborg%20Ninja.mp3
- `public/audio/usb1-02.mp3` : Digital Lemonade — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Digital%20Lemonade.mp3
- `public/audio/usb1-03.mp3` : Rocket — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rocket.mp3
- `public/audio/usb2-01.mp3` : Cut and Run — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cut%20and%20Run.mp3
- `public/audio/usb2-02.mp3` : Ouroboros — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ouroboros.mp3
- `public/audio/usb2-03.mp3` : Danger Storm — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Danger%20Storm.mp3
- `public/audio/usb3-01.mp3` : Volatile Reaction — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Volatile%20Reaction.mp3
- `public/audio/usb3-02.mp3` : Move Forward — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Move%20Forward.mp3
- `public/audio/usb3-03.mp3` : Failing Defense — https://incompetech.com/music/royalty-free/mp3-royaltyfree/Failing%20Defense.mp3

Les BPM et tonalités du fichier `public/audio/manifest.json` sont fictifs.

### Photo

- `public/img/about-portrait.jpg` : « Man's face in profile, black and white » par Nik Bagherzadegan (https://unsplash.com/@nik_brz) — Licence Unsplash (https://unsplash.com/license), usage commercial libre, attribution non obligatoire — https://unsplash.com/photos/mans-face-in-profile-black-and-white--BecbFaSB9U (redimensionnée à 1600 px de haut, JPEG qualité 82).

## Décor « casita » (club)

Textures photo-scannées de Poly Haven (https://polyhaven.com), licence **CC0 1.0** (domaine public, usage commercial libre, attribution non obligatoire ; https://polyhaven.com/license). Fichiers 1k (plâtre et rugosité réduits à 512 px), ré-encodés en JPEG, dans `public/textures/club/` :

- `brick_diff.jpg`, `brick_nor.jpg` : « Red Brick 03 » par Rob Tuytel — https://polyhaven.com/a/red_brick_03
- `plaster_diff.jpg` : « Painted Plaster Wall » par Amal Kumar — https://polyhaven.com/a/painted_plaster_wall
- `wood_diff.jpg` : « Dark Wood » par Dario Barresi, Dimitrios Savva, Rico Cilliers — https://polyhaven.com/a/dark_wood
- `planks_diff.jpg` : « Dark Wooden Planks » par Amal Kumar — https://polyhaven.com/a/dark_wooden_planks
- `tiles_diff.jpg`, `tiles_nor.jpg`, `tiles_rough.jpg` : « Terracotta Floor Tiles » par Dimitrios Savva — https://polyhaven.com/a/terracotta_floor_tiles

Tout le reste du décor (géométrie, feuilles, carreaux de ciment, enseigne néon sans texte, carte d'environnement du comptoir, lumières) est procédural, généré dans `src/scene/club/`.

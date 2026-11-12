# acurlaz · direction artistique

Référence pour tous les agents et développeurs du site. Les valeurs CSS vivent dans `src/styles/tokens.css`. La section 13 fait foi pour la 3D. Le repère du modèle vient de `docs/CDJ-MODEL.md`.

## 0. L'essentiel

| Décision | Valeur |
|---|---|
| Concept | Plan-séquence : la caméra fait un tour complet autour du CDJ pendant le défilement, sans coupe |
| Encres | Noir `#0A0908`, crème du logo `#F7EEE5`, vermillon `#FF4D1A`, toutes à plat |
| Voix de l'artiste | Bricolage Grotesque, `@fontsource-variable/bricolage-grotesque` (fichier `opsz.css`) |
| Voix de la machine | Martian Mono, `@fontsource-variable/martian-mono` (fichier `wdth.css`) |
| Profondeur | Trois plans : mots géants derrière le CDJ, CDJ, contenus devant |
| Tempo | 124 BPM. Chaque durée d'animation est une fraction de temps ou de mesure |
| Forme | Angles vifs, filets d'un pixel, cercles parfaits pour les contrôles ronds |
| Effets | Aucun : ni ombre, ni flou, ni dégradé, ni verre, ni grain, ni halo |

## 1. Concept : plan-séquence

Le site montre un seul objet, un CDJ-3000 qui flotte dans le noir. Le visiteur défile, la caméra tourne autour de la platine et s'arrête cinq fois : sons, dates, avec, bio, contact. Elle part de face, passe au-dessus, longe la tranche, monte à la verticale, plonge vers l'écran, puis recule jusqu'à son point de départ : au total, un tour complet autour de l'objet.

Cinq règles en découlent.

1. **Trois plans.** Derrière le CDJ, le mot de la section en très grand (HTML). Au milieu, le CDJ (WebGL sur fond transparent). Devant, le contenu lisible (HTML). Le CDJ masque une partie du mot : la profondeur vient de là, sans texte rendu en 3D.
2. **Deux voix.** Ce que dit l'artiste s'écrit en Bricolage Grotesque, en minuscules, gras, lettres serrées comme le logo. Ce qu'affiche la machine (index, BPM, durées, heures, états, étiquettes) s'écrit en Martian Mono.
3. **Trois encres.** Noir, crème, vermillon, posées à plat comme sur une affiche sérigraphiée. Les seuls dégradés de l'image sont ceux que la lumière dessine sur le CDJ.
4. **Le vermillon veut dire « actif ».** Titre en lecture, section courante, prochaine date, focus clavier, action principale. Aucun usage décoratif.
5. **Un tempo.** Le site bat à 124 BPM. Un survol dure un quart de temps, une entrée de titre deux temps, un saut de section une mesure.

Sous le CDJ, des sillons concentriques crème dessinent un disque de neuf mètres de diamètre. Le CDJ flotte au-dessus de l'étiquette centrale. Vu à la verticale (section avec), l'image devient un vinyle : les noms des artistes tournent sur l'étiquette, les sillons autour.

## 2. Palette

### Les trois encres

| Jeton | Hex | Rôle | Contraste |
|---|---|---|---|
| `--noir` | `#0A0908` | Fond de page, texte sur crème et sur vermillon | |
| `--noir-2` | `#141312` | Surface : survol de ligne, champ | |
| `--noir-3` | `#1E1C1A` | Surface pressée | |
| `--creme` | `#F7EEE5` | Texte principal, logo, mots géants, ligne sélectionnée | 17,35:1 sur noir |
| `--creme-2` | `#A29C95` | Texte secondaire, métadonnées | 7,32:1 sur noir |
| `--creme-3` | `#8A857F` | Texte tertiaire, index au repos | 5,44:1 sur noir, 4,64:1 sur noir-3 |
| `--trait-fort` | `#696560` | Bord de champ, contour de contrôle | 3,44:1 sur noir |
| `--trait` | `#302E2B` | Filet de séparation, décoratif | |
| `--accent` | `#FF4D1A` | Vermillon : état actif | 6,00:1 sur noir |

Le crème `#F7EEE5` est la couleur opaque du logo, lue pixel par pixel dans `acurlaz-logo.png`. Les gris sont des mélanges crème sur noir figés en hex : aucun composant n'utilise `opacity` ou `rgba` pour fabriquer une teinte. Le noir est chaud (teinte du crème) pour que les deux encres appartiennent à la même famille.

### Choix de l'accent

| Candidat | Hex | Sur noir | Texte noir dessus | Écart avec le crème | Sur le CDJ (`#17171A` / `#2C2C30`) | Verdict |
|---|---|---|---|---|---|---|
| Vermillon | `#FF4D1A` | 6,00:1 | 6,00:1 | 2,89:1, luminance 0,26 contre 0,87 | 5,39:1 / 4,19:1 | Retenu |
| Jaune acide | `#D2FF3C` | 17,16:1 | 17,16:1 | 1,01:1, même luminance | 15,43:1 / 11,99:1 | Écarté |
| Vert Play | `#22E06A` | 11,31:1 | 11,31:1 | 1,53:1 | 10,17:1 / 7,91:1 | Écarté |

**Vermillon retenu** : c'est le seul candidat qui garde trois valeurs distinctes (noir, moyen, clair). La palette reste lisible en niveaux de gris et pour un daltonien, et le texte passe AA dans les deux sens, vermillon sur noir et noir sur vermillon.

Le jaune acide a la luminance du crème : deux encres claires se disputent la hiérarchie, et c'est la teinte des gabarits « néon sur noir ». Le vert Play reprend le voyant du vrai CDJ mais se lit « Spotify » sur fond noir et se confond avec le crème pour un protanope.

### Règles d'emploi

- Proportions par écran : noir 75 % au moins, crème 25 % au plus, vermillon 5 % au plus.
- Vermillon toujours plein et opaque. Texte vermillon sur noir : 12 px au moins. Pour un protanope son contraste tombe vers 4,1:1, donc un état actif porte aussi un pictogramme ou un mot.
- Interdits : texte vermillon sur crème (2,89:1), texte crème sur vermillon (2,89:1), vermillon en fond de grande surface.
- Sur aplat crème ou vermillon, le texte est `--noir`.
- Un seul bouton plein vermillon par écran.
- Sélection de texte : fond vermillon, texte noir.
- `theme-color` de `index.html` : `#0A0908`.

## 3. Typographie

### Polices

| Rôle | Police | Paquet npm (version vérifiée) | Import |
|---|---|---|---|
| Affichage et texte | Bricolage Grotesque, variable, axes `wght` 200-800 et `opsz` 12-96 | `@fontsource-variable/bricolage-grotesque` (5.3.0) | `@import '@fontsource-variable/bricolage-grotesque/opsz.css';` |
| Étiquettes et données | Martian Mono, variable, axes `wght` 100-800 et `wdth` 75-112,5 | `@fontsource-variable/martian-mono` (5.3.0) | `@import '@fontsource-variable/martian-mono/wdth.css';` |

Noms de famille CSS déclarés par les paquets : `'Bricolage Grotesque Variable'` et `'Martian Mono Variable'`. Licence OFL 1.1 pour les deux. Poids du sous-ensemble latin : 77 Ko et 38 Ko en woff2. Le sous-ensemble latin couvre les accents français, `œ`, `Œ`, `«`, `»`, `’`, `…`, `·`, `€` (rendu vérifié sur « Écouter », « Bientôt complet », « cœur », « Août »). Il ne couvre pas les flèches ni les symboles de lecture : ces signes sont des pictogrammes SVG, jamais des caractères.

**Bricolage Grotesque** prolonge le logo. Test de superposition : en ExtraBold, taille optique 96, approche -0,045 em, chaque lettre tombe sur celle du logo à quelques pixels près. Les terminaisons diffèrent (coupes verticales du c et du a, z entaillé), donc le logo garde son dessin propre. L'axe de taille optique donne dans un seul fichier une coupe d'affichage serrée et encrée, et une coupe de texte ouverte.

**Martian Mono** à chasse 75 % ressemble aux inscriptions sérigraphiées d'une façade d'appareil. Zéro barré, chiffres à chasse fixe : BPM et durées s'alignent en colonnes.

Alternative unique si Bricolage Grotesque est refusée : Archivo (`@fontsource-variable/archivo`, fichier `wdth.css`), graisse 800, chasse 112 %. Plus large et plus sportive, moins proche du logo.

Pile de repli : la famille puis `sans-serif` ou `monospace`, rien d'autre. L'écran de chargement attend `document.fonts.ready` : le visiteur ne voit jamais la police de repli. Précharger le woff2 latin de Bricolage (`files/bricolage-grotesque-latin-opsz-normal.woff2`).

### Styles

| Classe | Usage | Taille (360 → 1600 px) | Interligne | Approche | Graisse | Réglage |
|---|---|---|---|---|---|---|
| `.t-giant` | Mot de section, plan arrière | 96 → 432 px | 0,8 | -0,03 em | 800 | `opsz` 96, minuscules |
| `.t-title` | Phrase d'appel (contact) | 40 → 88 px | 0,92 | -0,025 em | 800 | `opsz` 96 |
| `.t-head` | Quantième d'une date, intertitre | 28 → 48 px | 1 | -0,02 em | 800 | `opsz` 48 |
| `.t-item` | Titre d'une ligne : morceau, lieu, artiste | 18 → 24 px | 1,2 | -0,01 em | 600 | `opsz` 24 |
| `.t-lead` | Chapeau de la bio | 18 → 22 px | 1,4 | 0 | 400 | `opsz` 14 |
| `.t-body` | Texte courant | 16 → 17 px | 1,55 | 0 | 400 | `opsz` 14, 34 rem de large au plus |
| `.t-small` | Mentions, crédits | 14 px | 1,45 | 0 | 400 | |
| `.t-label` | Étiquette, navigation, bouton | 12 px | 1,3 | 0,08 em | 400, 600 sur un bouton | Mono, chasse 75 %, capitales |
| `.t-data` | BPM, durée, heure, index | 13 → 14 px | 1,3 | 0,02 em | 400 | Mono, chasse 87,5 %, chiffres tabulaires |
| `.t-readout` | Temps écoulé du lecteur | 22 → 40 px | 1 | 0 | 400 | Mono, chasse 87,5 %, chiffres tabulaires |

Tailles fluides (jetons de `tokens.css`, bornes à 360 et 1600 px de large) :

```css
--fs-giant:   clamp(6rem, -0.097rem + 27.1vw, 27rem);
--fs-title:   clamp(2.5rem, 1.629rem + 3.871vw, 5.5rem);
--fs-head:    clamp(1.75rem, 1.387rem + 1.613vw, 3rem);
--fs-item:    clamp(1.125rem, 1.016rem + 0.484vw, 1.5rem);
--fs-lead:    clamp(1.125rem, 1.052rem + 0.323vw, 1.375rem);
--fs-body:    clamp(1rem, 0.982rem + 0.081vw, 1.0625rem);
--fs-readout: clamp(1.375rem, 1.048rem + 1.452vw, 2.5rem);
--fs-data:    clamp(0.8125rem, 0.794rem + 0.081vw, 0.875rem);
--fs-small:   0.875rem;
--fs-label:   0.75rem;
```

### Règles

- Titres d'affichage en minuscules, comme le logo. « acurlaz » s'écrit en minuscules partout, début de phrase compris.
- Capitales réservées à `.t-label`. Aucune phrase entière en capitales ailleurs.
- En `.t-giant` les lettres se touchent, comme dans le logo. Approche plancher : -0,04 em.
- Pas d'italique (les deux familles n'en ont pas). L'emphase passe par la graisse 600.
- Texte courant aligné à gauche, jamais justifié, jamais centré sur plus de deux lignes.
- Typographie française : espace fine insécable (U+202F) avant `; ! ?`, espace insécable (U+00A0) avant `:` et à l'intérieur de `« »`, apostrophe courbe `’`.
- Le visiteur ne voit aucun texte sous 12 px.

## 4. Grille et espacement

- Grille de 12 colonnes à partir de 900 px, 4 colonnes en dessous. Marge `--margin` (20 → 64 px), gouttière `--gutter` (12 → 24 px).
- Sur ordinateur le contenu d'une section occupe cinq colonnes d'un côté, le CDJ occupe l'autre côté. Les côtés alternent : sons à gauche, dates à droite, avec à gauche, bio à droite (en volet), contact au centre.
- Espacements : échelle `--space-1` à `--space-11` (4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192 px). Respiration verticale d'une section : `--section-pad`.
- Les listes sont des lignes séparées par un filet `--trait` d'un pixel. Aucune carte, aucun fond de bloc, aucun rayon.
- Rayons : `--radius-0` partout. `--radius-round` pour le bouton Play et les pastilles.
- Hauteurs : ligne de liste 56 px, bouton 48 px, cible tactile 44 px au moins.

## 5. Composants

Les changements de couleur sont des coupes : `--dur-cut` (60 ms), courbe `linear`. Les déplacements suivent les courbes de la section 7.

| Composant | Classe | Repos | Survol | Pressé | Focus clavier |
|---|---|---|---|---|---|
| Bouton principal | `.btn.btn--primary` | Aplat vermillon, texte noir, `.t-label` graisse 600, 48 px de haut, 24 px de marge interne | Aplat crème | Aplat `--creme-2` | Anneau vermillon 2 px, décalé de 3 px |
| Bouton secondaire | `.btn` | Contour crème 1 px, texte crème | Aplat crème, texte noir | Aplat `--creme-2` | Idem |
| Bouton Play | `.btn-round` | Cercle plein vermillon de 44 à 56 px, pictogramme SVG noir (triangle ou deux barres) | Cercle crème | Cercle `--creme-2` | Idem |
| Lien | `.link` | Texte crème, souligné 1 px, décalage 0,2 em | Soulignement vermillon 2 px | | Idem |
| Lien externe | `.link` | Pictogramme flèche oblique après le libellé (SVG, trait de 1,5 px, `aria-hidden`) | | | |
| Étiquette | `.tag` | `.t-label`, contour `--trait-fort`, texte `--creme-2`, marge interne 4 px / 8 px | | | |
| Étiquette active | `.tag.tag--accent` | Contour et texte vermillon | | | |
| Étiquette pleine | `.tag.tag--plein` | Aplat vermillon, texte noir | | | |
| Champ | `.field` | Fond `--noir-2`, bord `--trait-fort`, 48 px de haut, libellé visible au-dessus en `.t-label` | Bord crème | | Bord crème et anneau vermillon |

Bouton désactivé : contour `--trait-fort`, texte `--creme-3`, pas d'aplat.

### Volet

`.stage__panel--volet` : panneau `--noir` opaque sur toute la hauteur, fermé côté scène par un filet `--trait`. Il sert quand le CDJ remplit l'image et passerait sous le texte. Usage : la section bio sur ordinateur, et toute la zone de contenu sur mobile. Le filet rend la coupe lisible : l'écran se partage en deux moitiés, image et texte.

### Ligne de titre, section sons

`ul.rows > li > button.row`. Colonnes : index (`.t-data`), titre (`.t-item`), BPM, tonalité (à partir de 1024 px), durée.

| État | Classe | Rendu |
|---|---|---|
| Repos | | Texte crème, index `--creme-3`, filet haut `--trait` |
| Survol | | Fond `--noir-2` |
| Chargé sur la platine | `.is-selected`, `aria-current="true"` | Aplat crème, texte noir, comme le curseur de liste d'un CDJ |
| En lecture | `.is-playing` | L'index devient un triangle vermillon (SVG), mention « en lecture » pour les lecteurs d'écran |

Cliquer une ligne charge le titre. Le bouton Play du CDJ ou celui du lecteur lance la lecture. Un double clic sur une ligne charge et lance.

### Ligne de date

Colonnes : quantième (`.t-head`), jour et mois (`.t-label`, « sam. · nov. »), lieu (`.t-item`) et ville (`.t-label`), heure du set (`.t-data`, « 01 h 30 »), action. La première date à venir porte `.tag--accent` « Prochaine ». Date complète : étiquette « Complet », lieu barré, pas de lien.

### Ligne d'artiste, section avec

Colonnes : nom (`.t-item`), style (`.t-label`), dernier lieu et année (`.t-data`), lien Instagram.

### En-tête de section

`.kicker` : index vermillon (« 01 »), puis compteur ou consigne en `--creme-2` (« 9 titres »), le tout en `.t-label`. Le mot géant du plan arrière est décoratif (`aria-hidden`). Le vrai `h2` de la section est dans le contenu, masqué à l'œil par `.sr-only`.

### Lecteur persistant

`.player`, fixé en bas, 64 px, fond noir, filet haut. Il apparaît au premier titre chargé et reste visible dans toutes les sections. De gauche à droite : `.btn-round`, titre (`.t-item`), temps écoulé (`.t-readout`), barre de progression (filet `--trait` de 2 px, partie lue en vermillon), durée et BPM (`.t-data`). Sur mobile : bouton, titre, temps.

### Navigation et rail

- `.nav` : logo en haut à gauche (22 px de haut, masqué dans l'ouverture où le grand logo suffit), cinq liens `.t-label` en haut à droite. Chaque élément porte un fond `--noir` : une étiquette posée sur l'image. Lien de la section courante en vermillon, `aria-current="true"`.
- Sous 900 px : bouton « Menu » qui ouvre un index plein écran noir, les cinq mots en `.t-title`.
- `.rail` : sur ordinateur, filet vertical au bord droit avec cinq repères et un curseur vermillon qui suit la progression. Décoratif, `aria-hidden="true"`.

### Chargement

`.loader` : fond noir, logo centré (`min(60vw, 520px)`) en `--trait`, qui se remplit en crème de gauche à droite avec la progression réelle. Compteur en `.t-data` sous le coin droit, de « 000 » à « 100 ». À 100 %, le logo grandit jusqu'à sa place dans l'ouverture pendant que la lumière monte sur le CDJ.

## 6. Logo

- Fichier : `public/img/acurlaz-logo.png`, 1600 × 533 px, crème sur transparent. Encre utile : 1519 × 358 px.
- Pour le teinter, s'en servir comme masque (`mask-image`) sur un aplat. Trois versions autorisées : crème sur noir, noir sur crème, noir sur vermillon.
- Zone de protection : la hauteur d'x du logo (la hauteur du « a ») sur les quatre côtés.
- Largeur minimale : 72 px.
- Le logo n'est jamais recomposé en police. Interdits : contour, étirement, rotation, vermillon, effet.
- Dans l'ouverture le logo occupe 92 % de la largeur, calé en bas, dans le plan arrière (`alt=""`). Le CDJ flotte devant et en masque le haut. Le titre de la page est un `h1.sr-only` « acurlaz ».
- Limite du fichier actuel : au-delà de 800 px CSS sur un écran Retina, le PNG se voit flou. Il faut le tracé vectoriel (voir section 14).

## 7. Mouvement

### Tempo

| Jeton | Durée | Valeur musicale | Usage |
|---|---|---|---|
| `--dur-cut` | 60 ms | 1/8 de temps | Changement de couleur |
| `--dur-tick` | 121 ms | 1/4 de temps | Survol, pression, fondu en mouvement réduit |
| `--dur-half` | 242 ms | 1/2 temps | État d'interface, ouverture du menu |
| `--dur-beat` | 484 ms | 1 temps | Entrée d'une ligne, mise en rotation du jog |
| `--dur-2beat` | 968 ms | 2 temps | Entrée d'un mot géant, freinage du jog |
| `--dur-bar` | 1935 ms | 1 mesure | Allumage de la scène, saut vers une section |
| `--stagger` | 60 ms | 1/8 de temps | Décalage entre deux lignes |

Flottement du CDJ au repos : une période de 4 mesures (7,74 s).

### Courbes

| Jeton | Bézier | Équivalent GSAP | Usage |
|---|---|---|---|
| `--ease-out` | `0.16, 1, 0.3, 1` | `expo.out` | Entrée |
| `--ease-in` | `0.7, 0, 0.84, 0` | `expo.in` | Sortie |
| `--ease-in-out` | `0.83, 0, 0.17, 1` | `power4.inOut` | Déplacement d'un point à un autre |
| `--ease-mech` | `0.2, 0, 0, 1` | `CustomEase` | Bascule, tiroir, curseur |
| `--ease-linear` | `linear` | `none` | Progression, coupe de couleur, tout ce que le défilement pilote |

Pour une identité exacte entre CSS et JS, déclarer les quatre courbes avec `CustomEase.create(nom, 'x1,y1,x2,y2')`.

### Principes

1. **Les couleurs coupent, les formes glissent.** Une couleur change en 60 ms linéaires, comme un voyant. Seules les positions et les découpes s'animent avec une courbe.
2. **Le défilement tient la caméra, le temps tient l'interface.** La caméra, les mots géants et le rail suivent le défilement (`scrub`). Les entrées de contenu se jouent une fois, en durée fixe, quand la section arrive.
3. **Une entrée par bloc.** Un titre entre par ligne (masque, montée de 110 % de sa hauteur, `--dur-2beat`, `--ease-out`). Une liste entre ligne après ligne (`--shift-m`, `--dur-beat`, `--stagger`). Pas d'animation lettre par lettre.
4. **Sortie plus courte que l'entrée** : la moitié de la durée, `--ease-in`.
5. **Propriétés animées** : `transform`, `clip-path`, `opacity` pour les fondus. Jamais `width`, `height`, `top`, `left` ni les axes de la police.
6. **Boucles autorisées** : le flottement du CDJ, le jog en lecture, le voyant Play qui clignote au tempo quand un titre est chargé et en pause. Aucune autre.

### Réglages GSAP et Lenis

```js
gsap.registerPlugin(ScrollTrigger, CustomEase);
CustomEase.create('entree', '0.16,1,0.3,1');
CustomEase.create('sortie', '0.7,0,0.84,0');
CustomEase.create('transit', '0.83,0,0.17,1');
CustomEase.create('mecanique', '0.2,0,0,1');
gsap.defaults({ ease: 'entree', duration: 0.484 });

const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
```

- Ordinateur : Lenis lisse la molette, la timeline de caméra suit avec `scrub: true`.
- Tactile : défilement natif, `scrub: 0.5` pour absorber les à-coups du doigt.
- Pas de `snap`, pas de `pin` ScrollTrigger. Les paliers utilisent `position: sticky`.
- `gsap.matchMedia()` porte les deux variantes : mouvement normal et mouvement réduit.
- `ScrollTrigger.refresh()` après le chargement des polices et du modèle.

### Le jog

- En lecture : 33⅓ tours par minute, soit 200° par seconde.
- Mise en rotation : 484 ms, `power2.out`. Freinage à la pause : 968 ms, `power3.out`.
- Un index crème sur le plateau rend la rotation lisible. Un arc vermillon autour du jog indique la position dans le titre (0 à 360°).
- Voyant Play (anneau plat autour du bouton) : éteint sans titre, clignotant au tempo du titre chargé en pause, plein en lecture.

## 8. Scène 3D : lumière, matériaux, fond

### Rendu

- `WebGLRenderer({ alpha: true, antialias: true })`, fond transparent, `outputColorSpace = SRGBColorSpace`, `toneMapping = NeutralToneMapping`, exposition 1.
- Ratio de pixels plafonné à 2 sur ordinateur, 1,5 sur mobile.
- Aucun post-traitement : ni bloom, ni grain, ni vignette, ni aberration.
- Rendu à la demande quand rien ne bouge (ni défilement, ni lecture, ni survol).
- Tout aplat de couleur en 3D (anneaux, sillons, règle, index) utilise `MeshBasicMaterial({ toneMapped: false })` pour sortir le hex exact.
- Sur `canvas.scene` : `touch-action: pan-y`, pour que le doigt fasse défiler la page.

### Fond

Aucun décor. Le canvas est transparent, la page est `--noir`. Pas de ciel, pas d'étoiles, pas de brouillard : les éléments lointains s'effacent par leur opacité, sinon ils noirciraient les mots géants placés derrière le canvas.

### Lumière

Un studio à trois sources, toutes crème `#F7EEE5`, plus une source vermillon.

| Source | Type | Position (m) | Rôle |
|---|---|---|---|
| Environnement | Trois panneaux émissifs crème rendus par `PMREMGenerator` (aucun fichier HDR) : un au-dessus, un derrière à droite, un à gauche | | Reflets longs et nets sur le plastique et le jog |
| `key` | `DirectionalLight` | (-0.7, 1.3, 0.9) | Modelé du dessus |
| `rim` | `DirectionalLight` | (0.9, 0.5, -1.2) | Liseré sur les arêtes, détache le noir du noir |
| `accent` | `PointLight` vermillon `#FF4D1A`, portée 1,2 m | (-0.35, 0.25, 0.45) | Chaleur côté Play quand un titre joue |

Critère de réglage : hors reflets, le dessus du CDJ ne dépasse pas `#2C2C30`. Le vermillon garde ainsi 4:1 au moins sur l'appareil. Aucune source bleue ou froide.

Intensités relatives par section (1 = réglage de base) :

| Préréglage | key | rim | accent | Écran du CDJ |
|---|---|---|---|---|
| `ouverture` | 0,8 | 1,6 | 0 | 0,4 |
| `sons` | 1,2 | 1,0 | 0 | 1 |
| `dates` | 0,3 | 1,8 | 0,5 | 0,3 |
| `avec` | 1,0 | 0,6 | 0 | 0,4 |
| `bio` | 0,5 | 0,8 | 0 | 1,2 |
| `contact` | 0,3 | 1,2 | 0,6 | 0,2 |

En lecture, dans toutes les sections : `accent` monte à 0,8 au moins et bat de ±15 % sur chaque temps du titre (un temps sur deux au-delà de 150 BPM).

### Matériaux

- Châssis : texture d'origine, `metalness` 0,1, `roughness` 0,55, `envMapIntensity` 0,9. Les valeurs du fichier (0,74 / 0,75) éteignent la texture.
- Plateau du jog (pièce reconstruite) : noir brillant, `roughness` 0,18. Couronne : métal, `metalness` 1, `roughness` 0,35.
- Écran : plan `CanvasTexture` 1024 × 598, non éclairé, dessiné avec les trois encres. Fond noir, texte crème, tête de lecture vermillon. L'interface bleue d'origine disparaît.

### Autour du CDJ

| Élément | Description | Priorité |
|---|---|---|
| Sillons | 40 cercles crème d'un pixel sur un plan horizontal à y = -0,45 m, rayons de 0,5 à 4,5 m, opacité de 0,22 à 0 vers l'extérieur. Vide central de 0,5 m : l'étiquette du disque | 1 |
| Voyant Play, arc et index du jog | Aplats vermillon et crème posés 0,3 mm au-dessus du modèle | 1 |
| Anneaux de noms | Section avec : noms des artistes en cercle sur l'étiquette, rayons 0,36 et 0,47 m, crème, `CanvasTexture` 2048 px. Rotation lente pilotée par le défilement | 2 |
| Règle de dates | Section dates : une graduation par jour sur 60 jours, le long de l'axe Z sous le CDJ (y = -0,2 m), traits crème de 2 cm, dates de concert en traits vermillon de 6 cm | 2 |
| Onde | En lecture : sur chaque temps, le premier sillon s'allume en vermillon et s'éloigne jusqu'à 4,5 m en deux mesures. Huit ondes au plus | 2 |
| Poussière | 400 points crème d'un à deux pixels dans un volume de 6 m, dérive de 2 cm par seconde, opacité 0,35. 150 points sur mobile | 3 |

Le CDJ ne projette aucune ombre : il flotte sur fond noir et les sillons suffisent à le situer.

## 9. Chorégraphie du voyage

Repère de la scène : origine au centre du volume du CDJ, Y vers le haut, +Z côté DJ, +X à droite. Le repère local de `CDJ-MODEL.md` a son origine au bas du châssis : y scène = y local - 0,059. Points utiles : centre (0, 0, 0), jog (0, 0.05, 0.08), Play (-0.14, 0.04, 0.20), écran (0, 0.06, -0.14).

La caméra s'exprime en coordonnées sphériques autour d'une cible : azimut θ (0° face au côté DJ, positif vers +X), élévation φ, distance d. Les valeurs exactes sont dans le tableau de la section 13.

### 0 · ouverture

- **Intention** : poser le nom et l'objet.
- **Caméra** : de face, presque à hauteur (θ 0°, φ 8°), à 2,1 m, focale 30°. Le CDJ est en pose de présentation : incliné vers la caméra (62°), tourné de -24°, penché de -12°. Il occupe la moitié de la hauteur, centré, un peu au-dessus du milieu.
- **Lumière** : préréglage `ouverture`. À l'arrivée, le liseré s'allume d'abord, le dessus ensuite, en une mesure.
- **Autour** : les sillons, vus presque par la tranche, tracent un horizon sous l'appareil.
- **Contenu** : le logo à 92 % de la largeur, en bas, derrière le CDJ. Une ligne `.t-label` en haut à gauche (rôle, styles, ville). En bas à droite, « Défiler » et un trait vertical.
- **Défilement** : pas de palier. La caméra bouge dès le premier cran de molette.

### 1 · sons

- **Intention** : mettre la platine sous la main du visiteur.
- **Transit** : le CDJ se remet à plat pendant que la caméra monte. Le logo sort par le bas, le mot « sons » entre par la droite.
- **Caméra** : vue du DJ, de trois quarts au-dessus (θ -14°, φ 56°), à 1,35 m, focale 28°. Le CDJ occupe 70 % de la hauteur et 40 % de la largeur, centré à 67 % de la largeur. Le bouton Play est le point le plus proche de la caméra et de la liste. Pendant le palier, la caméra dérive de 8° vers la droite.
- **Lumière** : préréglage `sons`, la plus claire du voyage. La source vermillon s'allume à la lecture.
- **Autour** : voyant Play, arc de progression, index du jog. Onde à chaque temps. Flottement réduit à 30 % pour garder le bouton stable.
- **Contenu** : colonnes 1 à 5. En-tête « 01 · 9 titres », consigne « Choisir un titre, puis Play. », liste des titres. Le mot « sons » est calé à droite, ligne de base à 80 % de la hauteur.
- **Défilement** : palier de 160 svh, le plus long.

### 2 · dates

- **Intention** : calmer l'image pour lire un agenda.
- **Transit** : la caméra descend le long du flanc droit jusqu'à raser le plan des sillons.
- **Caméra** : profil droit, très bas (θ 82°, φ 7°), à 2,3 m, focale longue de 22°. Le CDJ devient une barre noire horizontale, bordée d'un liseré crème. Elle occupe 35 % de la largeur, centrée à 30 % de la largeur et 58 % de la hauteur. Pendant le palier, travelling de 16° le long de la tranche.
- **Lumière** : préréglage `dates`, qui réduit le CDJ à sa silhouette.
- **Autour** : la règle de dates glisse sous l'appareil avec le défilement.
- **Contenu** : colonnes 7 à 12. En-tête « 02 · 11 dates », liste. Le mot « dates » à gauche, derrière la tranche.
- **Défilement** : palier de 100 svh.

### 3 · avec

- **Intention** : montrer l'entourage dans le plan le plus graphique du voyage.
- **Transit** : la caméra contourne l'arrière et monte à la verticale.
- **Caméra** : plongée (φ 84°, jamais plus), à 2,2 m, focale 30°. Le CDJ occupe 45 % de la hauteur, centré à 66 % de la largeur. L'anneau extérieur couvre la moitié de la largeur. Pendant le palier, l'azimut passe de 150° à 240° : à cette élévation l'image tourne sur elle-même, comme un disque.
- **Lumière** : préréglage `avec`, zénithale et plate.
- **Autour** : les anneaux de noms sur l'étiquette, les sillons autour.
- **Contenu** : colonnes 1 à 5. En-tête « 03 · 16 artistes », liste. Le mot « avec » passe derrière les anneaux.
- **Défilement** : palier de 100 svh.

### 4 · bio

- **Intention** : faire le portrait, avec l'écran du CDJ pour cadre.
- **Transit** : descente en spirale de la verticale vers l'écran.
- **Caméra** : face à l'écran (θ 346°, φ 58°), à 1,05 m, focale 22°. L'écran occupe un tiers de la largeur, centré à 25 %. Dérive lente de 6°.
- **Lumière** : préréglage `bio`. L'écran devient la source principale.
- **Autour** : l'écran affiche le portrait en deux tons (noir et crème) et les quatre repères (depuis, styles, ville, résidences).
- **Contenu** : à cette distance le châssis remplit l'image. Le contenu vit donc dans un volet noir opaque sur la moitié droite (colonnes 7 à 12), fermé à gauche par un filet. En-tête « 04 », chapeau en `.t-lead`, texte en `.t-body`. Le mot « bio » à gauche, sous l'écran.
- **Défilement** : palier de 100 svh.

### 5 · contact

- **Intention** : finir sur le nom et une action.
- **Transit** : la caméra recule de 3,2 m. Le CDJ reprend sa pose de présentation, en miroir de l'ouverture.
- **Caméra** : de face (θ 360°, φ 6°), à 4,2 m, focale 30°. Le CDJ occupe 25 % de la hauteur, centré, à 32 % du haut. Recul lent de 20 cm.
- **Lumière** : préréglage `contact`. La lumière baisse, le voyant vermillon reste.
- **Autour** : les sillons seuls.
- **Contenu** : centré. En-tête « 05 », phrase d'appel en `.t-title`, bouton principal « Écrire », liens des réseaux en ligne, logo, crédits.
- **Défilement** : palier de 40 svh. Si un titre joue, il continue.

## 10. Mobile et mouvement réduit

### Mobile (moins de 900 px)

- **Scène en bandeau** : la scène occupe les 44 % hauts de l'écran (`--scene-h`), fixe, sur fond noir opaque, fermée en bas par un filet. Elle contient le mot géant et le canvas. Le contenu défile dessous, sur toute la largeur.
- Le canvas a la taille du bandeau et n'en change jamais. Cadrage centré, sans décalage. Mêmes angles que sur ordinateur, distances de la colonne « d mobile » (section 13).
- Hauteur minimale d'une section : 100 svh. Au-delà, le contenu fixe la longueur du palier.
- Ouverture : CDJ dans le bandeau, logo à 88 % de la largeur dans la zone de contenu.
- Listes simplifiées : sons = index, titre, durée. Dates = quantième, lieu et ville, action.
- Lecteur persistant en bas, 64 px. Le bouton Play du lecteur fait foi : la zone 3D mesure moins de 44 px sur un téléphone.
- Navigation : logo et bouton « Menu ».
- Téléphone en paysage : scène à gauche sur 44 % de la largeur et toute la hauteur, contenu à droite.
- Budget : ratio de pixels 1,5 au plus, pas de poussière sous 40 images par seconde, éléments de priorité 2 coupés si la cadence tombe.

### Mouvement réduit (`prefers-reduced-motion: reduce`)

- La caméra ne voyage plus. Chaque section a une pose fixe (la clé « a » du tableau). Au changement de section : fondu du canvas en 121 ms, changement de pose, fondu inverse.
- Arrêt du flottement, de la dérive, de l'onde, de la poussière, du suivi du pointeur.
- Le jog ne tourne pas et le voyant ne clignote pas. Voyant plein en lecture, contour seul en pause.
- Mots géants immobiles, à leur place finale.
- Entrées de contenu : fondu de 121 ms, sans déplacement (`--motion: 0`).
- Lenis coupé, défilement natif. Les liens de navigation sautent sans animation.
- Compteur de chargement sans défilement des chiffres.

### Sans WebGL

Image fixe du CDJ dans chaque section (rendus à produire depuis les six poses) et tout le contenu HTML. Message : « La 3D ne peut pas s'afficher sur cet appareil. Le reste du site fonctionne. »

## 11. Accessibilité

- **Structure** : le contenu vit dans le HTML, dans l'ordre de lecture. Un `h1` « acurlaz », un `h2` par section, tous deux en `.sr-only` puisque le logo et les mots géants les montrent déjà. Le plan arrière et le canvas portent `aria-hidden="true"` et ne reçoivent jamais le focus.
- **Double commande** : chaque action 3D a son jumeau HTML. Le bouton Play du lecteur reflète celui du CDJ (`aria-pressed`, libellé « Lire » ou « Mettre en pause »).
- **Focus** : `outline: var(--focus-width) solid var(--color-focus); outline-offset: var(--focus-offset)`. Sur aplat crème ou vermillon : `--color-focus-on-light`. La règle `:focus-visible` de `base.css` reprend ces jetons. Aucun `outline: none` sans remplacement.
- **Focus non masqué** : `scroll-padding-top: var(--scroll-pad-top)` et `scroll-padding-bottom: var(--player-h)` sur `html`.
- **Lien d'évitement** : « Aller au contenu », premier élément focalisable.
- **Contraste** : texte principal 17,35:1, secondaire 7,32:1, tertiaire 5,44:1, vermillon 6,00:1, bords de champ 3,44:1. Le filet `--trait` est décoratif.
- **Couleur jamais seule** : lecture = triangle et mention, prochaine date = étiquette écrite, complet = mot et texte barré.
- **Cibles** : 44 × 44 px au moins, 8 px entre deux cibles. Zone de clic du bouton Play 3D élargie à 26 mm de rayon.
- **Son** : aucune lecture automatique. Dès qu'un titre joue, un bouton pause reste visible. Une zone `aria-live="polite"` annonce « Lecture : titre, artiste ».
- **Défilement** : vitesse native, pas de capture, pas d'aimantation. Les cinq liens de navigation mènent à chaque section au clavier.
- **Clignotement** : le voyant et la source vermillon battent à moins de 3 Hz.
- **Zoom** : tailles en `rem`, mise en page valide à 200 %.
- **Contraste renforcé** : `prefers-contrast: more` monte chaque gris d'un cran (déjà dans les jetons).
- **Langue** : `lang="fr"`.

## 12. Ton éditorial

Voix sobre et directe. Le site énonce des faits : un lieu, une heure, un titre.

| Règle | Exemple |
|---|---|
| Mots de section en minuscules, un seul mot | sons, dates, avec, bio, contact |
| Verbes à l'infinitif sur les boutons | Écouter, Charger, Écrire, Copier l'adresse |
| Vouvoiement, peu fréquent | « Une date, un projet ? Écrivez. » |
| Dates en clair | sam. 14 nov. |
| Heures à la française | 23 h 30, 01 h 30 |
| Données machine au format machine | 124 BPM, 8A, 06:42 |
| Index sur deux chiffres | 01, 02, 03 |
| Séparateur des étiquettes : point médian | SAM. 14 NOV. · MARSEILLE |
| Lien externe signalé par le pictogramme flèche | Billetterie, SoundCloud, Instagram |

Libellés de référence :

| Contexte | Libellé |
|---|---|
| Consigne de la platine | Choisir un titre, puis Play. |
| Lecture, pause | Lire · Mettre en pause |
| Annonce vocale | Lecture : Cœur léger, acurlaz |
| Prochaine date | Prochaine |
| Date complète | Complet |
| Aucune date | Aucune date annoncée pour l'instant. Les prochaines s'affichent ici dès leur confirmation. |
| Lien pas encore renseigné | Lien à venir |
| Adresse copiée | Adresse copiée |
| Chargement | Chargement, 42 % (pour les lecteurs d'écran) |
| Pied de page | Modèle 3D : « Pioneer CDJ 3000 » par MaxTht, CC BY 4.0, modifié. |

Interdits : point d'exclamation, émoji, tiret cadratin, formules d'accueil (« Bienvenue », « Découvrez », « Plongez dans l'univers de »), superlatifs, anglais de remplissage (« stay tuned », « vibes »), promesse d'« expérience ». Les titres de section restent les cinq mots : aucun sous-titre d'ambiance.

Balise `title` : « acurlaz · DJ, [ville] ». Description : une phrase de faits, 155 signes au plus.

## 13. Contrat pour les développeurs

### 13.1 Branchement

```sh
npm install @fontsource-variable/bricolage-grotesque @fontsource-variable/martian-mono
```

Puis décommenter les deux `@import` en tête de `src/styles/tokens.css` et l'import de `tokens.css` dans `base.css`. Les fichiers `index.css` des paquets ne conviennent pas : sans `opsz.css` les titres perdent leur coupe d'affichage, sans `wdth.css` la chasse du mono reste à 100 %.

### 13.2 Variables CSS (liste exacte)

| Groupe | Variables |
|---|---|
| Encres | `--noir` `--noir-2` `--noir-3` `--creme` `--creme-2` `--creme-3` `--trait-fort` `--trait` `--accent` |
| Rôles de couleur | `--color-bg` `--color-surface` `--color-surface-2` `--color-text` `--color-text-2` `--color-text-3` `--color-line` `--color-line-strong` `--color-accent` `--color-inverse` `--color-inverse-pressed` `--color-on-accent` `--color-on-creme` `--color-on-creme-2` `--color-focus` `--color-focus-on-light` `--color-selection-bg` `--color-selection-text` |
| Familles | `--font-display` `--font-text` `--font-mono` |
| Graisses | `--fw-display` `--fw-item` `--fw-text` `--fw-strong` `--fw-mono` `--fw-mono-strong` |
| Axes | `--opsz-display` `--opsz-head` `--opsz-item` `--opsz-text` `--mono-stretch-label` `--mono-stretch-data` |
| Tailles | `--fs-giant` `--fs-title` `--fs-head` `--fs-item` `--fs-lead` `--fs-body` `--fs-small` `--fs-readout` `--fs-data` `--fs-label` |
| Interlignes | `--lh-giant` `--lh-title` `--lh-head` `--lh-item` `--lh-lead` `--lh-body` `--lh-small` `--lh-mono` |
| Approches | `--ls-giant` `--ls-title` `--ls-head` `--ls-item` `--ls-text` `--ls-data` `--ls-label` |
| Mesure | `--measure` |
| Espacements | `--space-1` à `--space-11` |
| Grille | `--cols` `--margin` `--gutter` `--section-pad` |
| Dimensions | `--tap-min` `--control-h` `--row-h` `--nav-h` `--player-h` `--rail-w` |
| Filets et rayons | `--line` `--line-strong` `--radius-0` `--radius-round` |
| Focus | `--focus-width` `--focus-offset` |
| Scène | `--stage-ouverture` `--stage-sons` `--stage-dates` `--stage-avec` `--stage-bio` `--stage-contact` `--scene-w` `--scene-h` `--scroll-pad-top` |
| Durées | `--bpm` `--dur-cut` `--dur-tick` `--dur-half` `--dur-beat` `--dur-2beat` `--dur-bar` `--stagger` |
| Courbes | `--ease-out` `--ease-in` `--ease-in-out` `--ease-mech` `--ease-linear` |
| Déplacements | `--motion` `--shift-s` `--shift-m` `--shift-l` |
| Plans | `--z-back` `--z-scene` `--z-content` `--z-rail` `--z-player` `--z-nav` `--z-overlay` `--z-loader` `--z-skip` |

Les composants consomment les rôles (`--color-*`), pas les encres. Aucun hex en dur dans un composant.

### 13.3 Classes utilitaires prévues

À écrire par l'agent de montage (par exemple `src/styles/typography.css` et `src/styles/components.css`). Déclarations typographiques de référence, testées avec les jetons :

```css
.t-giant   { font-family: var(--font-display); font-weight: var(--fw-display); font-size: var(--fs-giant); line-height: var(--lh-giant); letter-spacing: var(--ls-giant); font-variation-settings: 'opsz' var(--opsz-display); text-transform: lowercase; }
.t-title   { font-family: var(--font-display); font-weight: var(--fw-display); font-size: var(--fs-title); line-height: var(--lh-title); letter-spacing: var(--ls-title); font-variation-settings: 'opsz' var(--opsz-display); }
.t-head    { font-family: var(--font-display); font-weight: var(--fw-display); font-size: var(--fs-head); line-height: var(--lh-head); letter-spacing: var(--ls-head); font-variation-settings: 'opsz' var(--opsz-head); }
.t-item    { font-family: var(--font-text); font-weight: var(--fw-item); font-size: var(--fs-item); line-height: var(--lh-item); letter-spacing: var(--ls-item); font-variation-settings: 'opsz' var(--opsz-item); }
.t-lead    { font-family: var(--font-text); font-weight: var(--fw-text); font-size: var(--fs-lead); line-height: var(--lh-lead); font-variation-settings: 'opsz' var(--opsz-text); max-width: var(--measure); }
.t-body    { font-family: var(--font-text); font-weight: var(--fw-text); font-size: var(--fs-body); line-height: var(--lh-body); font-variation-settings: 'opsz' var(--opsz-text); max-width: var(--measure); }
.t-small   { font-family: var(--font-text); font-size: var(--fs-small); line-height: var(--lh-small); }
.t-label   { font-family: var(--font-mono); font-weight: var(--fw-mono); font-size: var(--fs-label); line-height: var(--lh-mono); letter-spacing: var(--ls-label); font-stretch: var(--mono-stretch-label); text-transform: uppercase; }
.t-data    { font-family: var(--font-mono); font-weight: var(--fw-mono); font-size: var(--fs-data); line-height: var(--lh-mono); letter-spacing: var(--ls-data); font-stretch: var(--mono-stretch-data); font-variant-numeric: tabular-nums; }
.t-readout { font-family: var(--font-mono); font-weight: var(--fw-mono); font-size: var(--fs-readout); line-height: 1; font-stretch: var(--mono-stretch-data); font-variant-numeric: tabular-nums; }
```

Ne pas utiliser le raccourci `font:` sur ces classes : il remet `font-stretch` et `font-variation-settings` à zéro.

| Famille | Classes |
|---|---|
| Texte | `.t-giant` `.t-title` `.t-head` `.t-item` `.t-lead` `.t-body` `.t-small` `.t-label` `.t-data` `.t-readout` |
| Couleur | `.c-2` (`--color-text-2`) `.c-3` (`--color-text-3`) `.c-accent` `.on-creme` (aplat crème, texte noir) `.on-accent` (aplat vermillon, texte noir) |
| Mise en page | `.wrap` (marges de page) `.grid` (12 ou 4 colonnes) `.backdrop` (plan arrière fixe) `.backdrop__word` (mot géant) `.backdrop__logo` `.scene` (canvas) `.stage` (section) `.stage__panel` (contenu) `.stage__panel--left` `.stage__panel--right` `.stage__panel--center` `.stage__panel--volet` |
| Composants | `.btn` `.btn--primary` `.btn-round` `.link` `.tag` `.tag--accent` `.tag--plein` `.kicker` `.rows` `.row` `.field` `.player` `.nav` `.rail` `.loader` `.skip-link` |
| États | `.is-selected` `.is-playing` `.is-current` `.is-soldout` `.is-inview` |
| Accessibilité | `.sr-only` (déjà dans `base.css`) |

Identifiants de section : `#ouverture` `#sons` `#dates` `#avec` `#bio` `#contact`. Canvas : `canvas.scene`. Attribut d'entrée : `data-reveal="lines"`, `"rows"` ou `"fade"`.

### 13.4 Empilement des trois plans

```html
<div class="backdrop" aria-hidden="true">              <!-- position: fixed; z-index: var(--z-back) -->
  <img class="backdrop__logo" src="…/acurlaz-logo.png" alt="">
  <span class="backdrop__word t-giant" data-section="sons">sons</span>
  <!-- dates, avec, bio, contact -->
</div>
<canvas class="scene" aria-hidden="true"></canvas>     <!-- position: fixed; z-index: var(--z-scene) -->
<main id="contenu">                                     <!-- position: relative; z-index: var(--z-content) -->
  <h1 class="sr-only">acurlaz</h1>
  <section class="stage" id="sons" aria-labelledby="titre-sons">
    <h2 class="sr-only" id="titre-sons">Sons</h2>
    <div class="stage__panel stage__panel--left">…</div> <!-- position: sticky; top: 0 -->
  </section>
</main>
```

- Les mots géants et le logo d'ouverture vivent dans `.backdrop`, un calque fixe. La timeline maîtresse les place et les découpe. Le contenu peut donc recevoir des `transform` sans casser la profondeur.
- `.backdrop` et `.scene` mesurent `var(--scene-w)` par `var(--scene-h)`, calés en haut à gauche. Sur mobile les jetons `--z-back` et `--z-scene` passent au-dessus de `--z-content` et `.backdrop` prend un fond `--noir` : le bandeau recouvre le contenu qui défile.
- Clics sur le CDJ : `main` et `.stage` en `pointer-events: none`, `.stage__panel` en `pointer-events: auto`. Le canvas reçoit alors le pointeur partout où aucun panneau ne le couvre. `touch-action: pan-y` sur le canvas pour laisser défiler au doigt.
- `.stage` prend `min-height: var(--stage-sons)` et ses équivalents.

### 13.5 Constantes JS

```js
export const DA = {
  color: { noir: 0x0a0908, creme: 0xf7eee5, accent: 0xff4d1a },
  bpm: 124,
  dur: { cut: 0.06, tick: 0.121, half: 0.242, beat: 0.484, twoBeat: 0.968, bar: 1.935 },
  stagger: 0.06,
  ease: { out: '0.16,1,0.3,1', in: '0.7,0,0.84,0', inOut: '0.83,0,0.17,1', mech: '0.2,0,0,1' },
  jog: { rpm: 100 / 3, spinUp: 0.484, brake: 0.968 },
  float: { period: 7.74, y: 0.012, rotX: 1.2, rotZ: 1.5 },   // mètres et degrés
  pointer: { maxDeg: 2, lerp: 0.06 },                          // suivi du pointeur, ordinateur seulement
  camera: { near: 0.05, far: 30, maxPhi: 84 },
};
```

### 13.6 Graphe de scène

```
scene
├ rig        Group à l'origine. Sa rotation est la pose (colonne « rig » du tableau)
│ └ float    Group : flottement au repos et suivi du pointeur
│   └ cdj    Mesh normalisé selon CDJ-MODEL.md, position (0, -0.059, 0)
│     ├ jog        pièce tournante, centre local (0, 0.100, 0.081)
│     ├ ecran      plan CanvasTexture, centre local (-0.0001, 0.1178, -0.1383), inclinaison 0,1717 rad
│     └ voyants    anneau Play (-0.1375, ·, 0.199), arc et index du jog
├ sillons    plan horizontal, y = -0.45 (ne tourne pas avec le rig)
├ regle      section dates
├ anneaux    section avec
└ poussiere
```

### 13.7 Clés de caméra

Position = cible + d · (sin θ · cos φ, sin φ, cos θ · cos φ), angles en degrés, distances en mètres. Entre deux clés, interpoler θ, φ, d, la cible, la focale, le cadrage et la rotation du rig, jamais la position cartésienne : la caméra traverserait l'appareil. θ n'est pas ramené entre 0 et 360 : il croît de -14 à 360 sur le voyage.

Cadrage `[x, y]` : décalage du CDJ à l'écran en fraction de la fenêtre, positif vers la droite et vers le haut. Mise en œuvre : `camera.setViewOffset(W, H, -x * W, y * H, W, H)`. Sur mobile le cadrage vaut `[0, 0]`.

Rig `[x, y, z]` : rotation d'Euler en degrés, ordre XYZ.

Orientation de la caméra : `lookAt(cible)` à chaque image, vecteur haut (0, 1, 0), aucun roulis. L'élévation plafonne à 84° pour rester loin du pôle.

| Clé | p | Section visible | θ | φ | d | d mobile | Cible (x, y, z) | Position caméra (x, y, z) | Focale | Cadrage | Rig | Lumière |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| K0 | 0,00 | ouverture | 0 | 8 | 2,10 | 1,35 | 0, 0, 0 | 0, 0.292, 2.080 | 30° | 0, 0.08 | 62, -24, -12 | `ouverture` |
| K1a | 0,10 | sons | -14 | 56 | 1,35 | 1,20 | -0.02, 0.03, 0.04 | -0.203, 1.149, 0.772 | 28° | 0.17, 0 | 0, 0, 0 | `sons` |
| K1b | 0,26 | sons | -6 | 54 | 1,32 | 1,17 | -0.02, 0.03, 0.04 | -0.101, 1.098, 0.812 | 28° | 0.17, 0 | 0, 0, 0 | `sons` |
| K2a | 0,36 | dates | 82 | 7 | 2,30 | 1,55 | 0, 0, 0 | 2.261, 0.280, 0.318 | 22° | -0.20, -0.08 | 0, 0, 0 | `dates` |
| K2b | 0,46 | dates | 98 | 5 | 2,30 | 1,55 | 0, 0, 0 | 2.269, 0.200, -0.319 | 22° | -0.20, -0.08 | 0, 0, 0 | `dates` |
| K3a | 0,56 | avec | 150 | 84 | 2,20 | 2,00 | 0, 0, 0 | 0.115, 2.188, -0.199 | 30° | 0.16, 0 | 0, 0, 0 | `avec` |
| K3b | 0,66 | avec | 240 | 84 | 2,20 | 2,00 | 0, 0, 0 | -0.199, 2.188, -0.115 | 30° | 0.16, 0 | 0, 0, 0 | `avec` |
| K4a | 0,76 | bio | 346 | 58 | 1,05 | 0,80 | 0, 0.06, -0.14 | -0.135, 0.950, 0.400 | 22° | -0.25, 0 | 0, 0, 0 | `bio` |
| K4b | 0,86 | bio | 352 | 55 | 1,00 | 0,76 | 0, 0.06, -0.14 | -0.080, 0.879, 0.428 | 22° | -0.25, 0 | 0, 0, 0 | `bio` |
| K5a | 0,96 | contact | 360 | 6 | 4,20 | 2,00 | 0, 0, 0 | 0, 0.439, 4.177 | 30° | 0, 0.18 | 62, 24, 12 | `contact` |
| K5b | 1,00 | contact | 360 | 6 | 4,40 | 2,10 | 0, 0, 0 | 0, 0.460, 4.376 | 30° | 0, 0.18 | 62, 24, 12 | `contact` |

Les positions cartésiennes valent pour l'ordinateur, fenêtre de ratio 16:10. Sur mobile, recalculer avec « d mobile ». Sur une fenêtre d'ordinateur plus étroite que 16:10, multiplier d par 1,6 / ratio pour garder le même cadrage horizontal.

Cadrages contrôlés par projection de la boîte englobante du CDJ : K0 50 % de la hauteur, K1a 71 %, K2a 35 % de la largeur, K3a 48 % de la hauteur avec un anneau extérieur à 49 % de la largeur, K4a écran à 34 % de la largeur, K5a 25 % de la hauteur. À K1a le bouton Play mesure 50 px sur une fenêtre de 900 px de haut, 39 px sur 700 px, 23 px dans le bandeau mobile.

Courbes de la timeline maîtresse : `power2.inOut` sur un transit (de Kb à Ka suivant), `none` sur un palier (de Ka à Kb). Les intensités de lumière s'interpolent sur les transits.

Réglage fin : ces valeurs partent des cotes réelles du CDJ (329 × 453 × 118 mm). Les ajuster à l'œil une fois le modèle en place, sans changer l'ordre des plans ni le sens de rotation.

### 13.8 De la position de défilement à p

p est la progression de la timeline maîtresse. Elle se calcule par morceaux à partir des sections, pour rester juste quand un contenu allonge une section.

```
vh      = hauteur de la fenêtre
top[i]  = haut de la section i dans le document, i de 1 (sons) à 5 (contact)
bas[i]  = bas de la section i

transit i : défilement de (top[i] - vh) à top[i]      →  p de K(i-1)b à K(i)a
palier  i : défilement de top[i] à (bas[i] - vh)      →  p de K(i)a à K(i)b
```

Le transit vers une section dure donc le temps que son bord haut traverse l'écran de bas en haut. Sur mobile, le bord haut s'arrête sous le bandeau : remplacer `top[i]` par `top[i] - hauteur du bandeau`.

Gabarit de référence sur ordinateur (hauteurs minimales des jetons `--stage-*`, 1000 svh de course) :

| Segment | Défilement (svh) | p |
|---|---|---|
| Transit vers sons | 0 → 100 | 0,00 → 0,10 |
| Palier sons | 100 → 260 | 0,10 → 0,26 |
| Transit vers dates | 260 → 360 | 0,26 → 0,36 |
| Palier dates | 360 → 460 | 0,36 → 0,46 |
| Transit vers avec | 460 → 560 | 0,46 → 0,56 |
| Palier avec | 560 → 660 | 0,56 → 0,66 |
| Transit vers bio | 660 → 760 | 0,66 → 0,76 |
| Palier bio | 760 → 860 | 0,76 → 0,86 |
| Transit vers contact | 860 → 960 | 0,86 → 0,96 |
| Palier contact | 960 → 1000 | 0,96 → 1,00 |

Entrées de contenu : le contenu de la section i se joue quand son transit passe la moitié. Le mot géant suit le défilement : il entre du côté du CDJ sur la seconde moitié du transit (translation de 12 vw et découpe), puis dérive de 4 vw pendant le palier.

### 13.9 Contrôle avant livraison

- [ ] Aucun hex hors de `tokens.css` et de `DA.color`.
  - Exception consignée : les gris de matière des pièces reconstruites du CDJ (albédos de `MeshStandardMaterial`, jamais affichés tels quels) vivent dans `DA.materiaux`, `src/scene/cdj/da.js`, et nulle part ailleurs.
- [ ] Aucun `border-radius` autre que `--radius-0` et `--radius-round`.
- [ ] Aucun `box-shadow`, `filter: blur`, `backdrop-filter`, `linear-gradient`, `radial-gradient`.
- [ ] Les deux familles se chargent avec leurs axes : titre géant en coupe serrée, étiquettes en chasse 75 %.
- [ ] Le mot géant passe derrière le CDJ et devant rien d'autre, dans les cinq sections.
- [ ] Le vermillon du voyant sort en `#FF4D1A` exact à l'écran (pipette).
- [ ] Parcours complet au clavier, anneau de focus visible à chaque arrêt.
- [ ] Mouvement réduit : aucune translation, aucune rotation continue.
- [ ] 60 images par seconde sur ordinateur pendant un transit, 40 au moins sur un téléphone de milieu de gamme.

## 14. Risques et points ouverts

1. **Logo en PNG de 1600 px.** L'ouverture l'affiche jusqu'à 92 % de la largeur : flou sur écran Retina au-delà de 800 px CSS. Demander le tracé vectoriel au client. À défaut, vectoriser le PNG et faire valider le résultat.
2. **Modèle en un seul maillage.** Le glb contient deux CDJ et une table de mixage soudés, sans nœud pour le jog, le bouton Play ou l'écran (`CDJ-MODEL.md`). Le jog qui tourne, l'écran et les voyants sont des pièces à reconstruire. La vue rapprochée de la bio (1,05 m) montrera la finesse réelle de la texture : reculer à 1,3 m si elle ne tient pas.
3. **Clés de caméra calculées, pas vues.** Elles sortent des cotes du CDJ et de maquettes plates. Prévoir une séance de réglage dans la scène réelle.
4. **Canvas transparent entre deux calques HTML.** Le canvas couvre la fenêtre : un panneau oublié en `pointer-events: none` devient incliquable, un conteneur oublié en `auto` bloque le bouton Play du CDJ. À tester section par section.
5. **Bricolage Grotesque gagne en popularité.** Le choix tient à sa parenté mesurée avec le logo. Si le client la juge trop vue, l'alternative Archivo est prête (section 3).
6. **Longueur du voyage.** 1000 svh de course sur ordinateur. La navigation et le rail permettent d'aller droit à une section. Raccourcir les paliers avant de raccourcir les transits.
7. **Vermillon et protanopie.** Contraste perçu vers 4,1:1 sur noir. Les règles de la section 2 compensent, à condition de les tenir.
8. **Mobile non vérifié sur appareil.** Le bandeau fixe et le canvas à ratio 1,5 restent à mesurer sur un iPhone et un Android de milieu de gamme.
9. **Licence du modèle.** CC BY 4.0 : la mention de l'auteur doit figurer dans le pied de page.

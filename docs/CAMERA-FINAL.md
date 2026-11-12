# Caméra, lumière et monde : valeurs finales

Réglage fait dans la scène réelle (DA 14.3), avec le vrai CDJ et la vraie interface, sur Chrome sans tête (carte Apple M2, Metal). Référence : `docs/DA.md` 13.7. Les valeurs vivent dans `src/scroll/keys.js` et `src/scene/world/lumieres.js`.

## 1. Clés de caméra

Règle de réglage : le mot géant reste lisible dans chaque section. Le CDJ passe devant lui sans jamais couvrir une lettre entière. L'ordre des plans et le sens de rotation de DA 13.7 sont inchangés : θ croît toujours de -14 à 360. Les clés de l'ouverture et de sons sur ordinateur sont celles de la DA. Les autres ont bougé, la section 5 dit pourquoi.

| Clé | p | Section | θ | φ | d | d mobile | Cible | Focale | Cadrage | Cadrage mobile | Rig | Flottement |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| K0 | 0,00 | ouverture | 0 | 8 | 2,10 | 1,35 | 0, 0, 0 | 30° | 0, 0.08 | 0, 0 | 62, -24, -12 | 1 |
| K1a | 0,10 | sons | -14 | 56 | 1,35 | 2,20 | -0.02, 0.03, 0.04 | 28° | 0.17, 0 | 0, -0.27 | 0, 0, 0 | 0,3 |
| K1b | 0,26 | sons | -6 | 54 | 1,32 | 2,15 | -0.02, 0.03, 0.04 | 28° | 0.17, 0 | 0, -0.27 | 0, 0, 0 | 0,3 |
| K2a | 0,36 | dates | 82 | 7 | 2,30 | 1,55 | 0, 0, 0 | 22° | -0.20, -0.062 - 0.099 l | 0, -0.13 | 0, 0, 0 | 1 |
| K2b | 0,46 | dates | 98 | 5 | 2,30 | 1,55 | 0, 0, 0 | 22° | -0.20, -0.062 - 0.099 l | 0, -0.13 | 0, 0, 0 | 1 |
| K3a | 0,56 | avec | 150 | 84 | 3,30 | 4,70 | 0, 0, 0 | 22,2° | 0.17, 0.105 | 0, -0.25 | 0, 0, 0 | 1 |
| K3b | 0,66 | avec | 240 | 84 | 3,30 | 4,70 | 0, 0, 0 | 22,2° | 0.17, 0.105 | 0, -0.25 | 0, 0, 0 | 1 |
| K4a | 0,76 | bio | 346 | 58 | 2,93 | 0,95 | 0, 0, 0 | 22° | -0.145, 0.128 | 0, -0.68 | 0, 0, 0 | 0,5 |
| K4b | 0,86 | bio | 352 | 55 | 2,85 | 0,92 | 0, 0, 0 | 22° | -0.135, 0.128 | 0, -0.68 | 0, 0, 0 | 0,5 |
| K5a | 0,96 | contact | 360 | 6 | 4,20 | 2,45 | 0, 0, 0 | 30° | 0.6 h, 0.275 | 0, -0.244 | 62, 24, 12 | 1 |
| K5b | 1,00 | contact | 360 | 6 | 4,40 | 2,55 | 0, 0, 0 | 30° | 0.6 h, 0.275 | 0, -0.276 | 62, 24, 12 | 1 |

Trois colonnes s'ajoutent au tableau de la DA.

- **Flottement** : part de l'amplitude `DA.float`. 0,3 dans sons vient de DA 9. 0,5 dans bio : dans le bandeau mobile le plan est serré, l'écran ne doit pas monter sur le mot.
- **Cadrage mobile** (`cm` dans `keys.js`) : décalage du CDJ dans le bandeau, en fraction du bandeau. La DA demandait un cadrage centré : le CDJ recouvrait alors le mot, centré lui aussi.
- **« h »** (`ch` dans `keys.js`) : décalage horizontal compté en hauteurs de fenêtre. Le mot « contact » mesure 30 svh : sa largeur suit la hauteur de la fenêtre. Le CDJ se cale sur sa dernière lettre, donc son décalage aussi. 0,6 h vaut 0,375 de la largeur en 16:10 et 0,34 en 16:9.
- **« l »** (`cl` dans `keys.js`) : décalage vertical compté en largeurs de fenêtre. Le mot « dates » mesure 16 vw : sa ligne de base descend quand la fenêtre s'élargit, le CDJ la suit. En 16:10 le cadrage vertical vaut -0,22. Le terme cesse de croître au-delà d'un ratio de 1,85 (`RATIO_MAX_CYL`), sinon la règle sortirait par le bas.

Le décalage horizontal est plafonné à 0,40 de la largeur (`CADRAGE_MAX` dans `stage.js`) : en 4:3 le CDJ reste dans l'image et devant le rail.

Fenêtre plus étroite que 16:10 : d est multiplié par 1,6 / ratio (DA 13.7). Sur mobile la référence est le bandeau de 390 × 371, avec la même règle.

## 2. Cadrages mesurés

Projection de la boîte de 329 × 453 × 118 mm, de la surface de l'écran et d'un cercle de 0,47 m posé à y = -0,45. Le banc d'essai affiche ces mesures à chaque image. « Lettres visibles » : part de chaque lettre du mot géant qui reste à l'image devant le CDJ, relevée sur deux captures (avec et sans canvas). Elle varie de quelques points avec le flottement : les fourchettes couvrent plusieurs relevés.

Ordinateur, 1440 × 900 :

| Clé | CDJ (largeur × hauteur) | Centre (x / y depuis le haut) | Autre mesure | Lettres visibles |
|---|---|---|---|---|
| K0 | 28 % × 50 % | 50 % / 42 % | | pas de mot |
| K1a | 40 % × 71 % | 69 % / 50 % | Play 50 px | s 96 %, o 1 %, n 8 %, s 88 % |
| K1b | 36 % × 68 % | 70 % / 50 % | Play 52 px | s 100 %, o 6 %, n 1 %, s 60 % |
| K2a | 35 % × 18 % | 31 % / 74 % | | 72 à 100 % |
| K2b | 35 % × 16 % | 29 % / 73 % | | 64 à 100 % |
| K3a | 25 % × 44 % | 67 % / 39 % | anneau 40 % | 84 à 100 % |
| K3b | 27 % × 40 % | 67 % / 39 % | anneau 40 % | 82 à 97 % |
| K4a | 24 % × 44 % | 36 % / 37 % | écran 12 % | 100 % |
| K4b | 22 % × 42 % | 37 % / 38 % | écran 12 % | 100 % |
| K5a | 14 % × 25 % | 88 % / 23 % | | 100 % |
| K5b | 13 % × 24 % | 88 % / 23 % | | 100 % |

Mêmes clés à 1280 × 720 : dates 64 à 100 %, avec 84 à 100 %, bio 98 à 100 %, contact 97 à 100 %. À 1024 × 768 : dates 73 à 100 %, avec 81 à 100 %, bio 100 %, contact 90 à 100 % (le CDJ couvre la pointe du dernier « t »). À 1366 × 650 et 1920 × 1080, dates reste entre 59 et 100 %. À 1024 × 768 le CDJ ne touche plus l'index « 05 » : il se tient à droite du mot, l'index est au centre.

Mobile, 390 × 844 (bandeau de 390 × 371, ratio de pixels 1,5) :

| Clé | CDJ (largeur × hauteur du bandeau) | Autre mesure | Lettres visibles |
|---|---|---|---|
| K0 | 66 % × 78 % | | pas de mot |
| K1a | 37 % × 44 % | Play 12 px | 79 à 100 % |
| K2a | 79 % × 27 % | | 61 à 100 % (K2a et K2b) |
| K3a | 27 % × 31 % | anneau 44 % | 86 à 100 % |
| K4a | | écran 56 %, sous le mot | 71 à 100 % selon le flottement |
| K5a | 36 % × 43 % | | 99 à 100 % |

Dans le bandeau, le mot est au centre et le CDJ dessous : il ne couvre que le pied des lettres. Le bouton Play 3D tombe à 12 px, le lecteur persistant fait foi (DA 10).

En mouvement réduit, la caméra prend les positions des clés « a » : K1a (-0.203, 1.149, 0.772), K2a (2.261, 0.280, 0.318), K3a (0.172, 3.282, -0.299), K4a (-0.376, 2.485, 1.507), K5a (0, 0.439, 4.177). K1a, K2a et K5a sont celles du tableau de la DA.

## 3. Lumière

Les préréglages par section sont ceux de DA 8. Les positions des trois sources aussi.

| Réglage de base | Valeur |
|---|---|
| `key` | 1,0 |
| `rim` | 2,2 |
| `accent` | 0,35 (portée 1,2 m) |
| Environnement | 0,75 × (0,6 × key + 0,4 × rim) |

Panneaux de l'environnement (PMREM, crème, tournés vers l'origine) :

| Panneau | Taille (m) | Position | Intensité |
|---|---|---|---|
| Au-dessus, vers l'avant | 3,8 × 0,5 | 0, 2.4, 1.9 | 11 |
| Derrière à droite | 0,4 × 3,0 | 2.4, 1.2, -2.6 | 12 |
| À gauche | 0,35 × 2,8 | -3.0, 0.8, 0 | 8 |

Critère de DA 8, mesuré à la pipette dans sons : la plaque de plastique la plus claire du dessus sort en `#2F2922`, luminance 0,023, sous celle de `#2C2C30` (0,026). Le reste du plastique va de `#120D07` à `#251F18`. Les capuchons métalliques des boutons et les inscriptions peintes sortent plus clairs.

Deux choix à connaître :

- Le panneau du dessus penche vers l'avant. Placé à la verticale, il laissait le CDJ incliné de l'ouverture presque noir (`#1A150E` sur la même plaque). Avec ce panneau, l'ouverture atteint `#2F2923`, le niveau de sons.
- L'intensité de l'environnement suit `key` et `rim`. La DA ne donne pas de niveau d'environnement par section.

Arrivée : `rim` monte en 0,97 s, `key` part à 0,77 s et finit à 1,94 s, soit une mesure. Le départ attend `ui:ready`, l'événement que l'interface émet quand l'écran de chargement s'efface. L'écran du CDJ et ses voyants montent avec `key`.

## 4. Monde

| Élément | Réglage |
|---|---|
| Sillons | 40 cercles, 0,5 à 4,5 m, y = -0,45, trait d'un pixel CSS, opacité 0,22 à 0 |
| Onde | Un sillon s'allume en vermillon par temps, il avance de 5 sillons par temps, 8 ondes vivantes, opacité 0,9 à 0 |
| Règle | 60 jours, pas de 3 cm, y = -0,12, traits de 2 cm et 6 cm, 36 jours de glissement entre p 0,26 et 0,56 |
| Fenêtre de la règle | Ordinateur : z de +0,62 à -0,30. Mobile : z de +0,36 à -0,36 |
| Anneaux | Rayons 0,39 et 0,47 m, y = -0,449, corps 5,2 cm au plus, liseré noir de 6 mm |
| Rotation des anneaux | Extérieur -63°, intérieur +86°, entre p 0,46 et 0,76 |
| Poussière | 400 points (150 sur mobile), 1 et 2 pixels CSS, 2 cm/s, opacité 0,35 |

Apparitions liées à p (`PISTES` dans `keys.js`) : la règle pousse de p 0,29 à 0,36 et se rétracte de 0,46 à 0,53. Les anneaux se tracent par balayage d'arc de 0,49 à 0,56 et s'effacent de 0,66 à 0,73. Aucun fondu.

Mots géants (`src/scroll/mots.js`) : entrée de 12 vw avec découpe sur la seconde moitié du transit, dérive de 4 vw pendant le palier, sortie de 6 vw sur la première moitié du transit suivant. Le côté d'entrée est celui où la clé cadre le CDJ. « contact » descend depuis le haut. Le logo sort par le bas entre p 0 et 0,05.

Poussière : `PointsMaterial.size` se compte en pixels CSS. `WebGLRenderer` multiplie lui-même la taille par son ratio de pixels. Mesuré sur capture : points de 1 et 2 px en ratio 1, de 2 et 4 px du tampon en ratio 2.

Cadence du rendu (`stage.js`), mesurée sur un écran à 60 Hz :

| Régime | Condition | Images par seconde |
|---|---|---|
| Plein | Geste récent (défilement, pointeur, clic), titre en lecture, animation en cours | 60 |
| Repos | 1,5 s sans geste : flottement et poussière continuent | 30 |
| Veille | 10 s sans geste : l'ambiance s'éteint en 1,2 s, puis plus rien n'est rendu | 0 |
| Titre chargé, en pause | Le voyant Play clignote au tempo | 4 à 5 |
| Mouvement réduit | Rendu à la demande | 0 au repos, 7 en lecture (l'écran du CDJ) |

À la reprise, le flottement repart d'une amplitude nulle : l'écart d'une image à l'autre reste de l'ordre de 0,05 mm, comme en plein régime.

## 5. Écarts avec la DA

1. **Anneaux à 40 % de la largeur, la DA annonce 49 %.** La cote de la DA suppose des anneaux à y = -0,059. Ils sont posés sur l'étiquette du disque, à y = -0,45, comme le décrit DA 1. À 49 % ils toucheraient la liste des artistes.
2. **Liseré noir autour des lettres des anneaux.** Sans lui, les noms crème disparaissent en passant devant le mot « avec », crème lui aussi. Le liseré est invisible sur le fond noir.
3. **Fenêtre de la règle.** La règle ne montre pas ses 60 jours à la fois : elle s'arrête avant la liste des dates pour ne pas passer sous le texte.
4. **Écran du CDJ plafonné à 1.** La DA demande 1,2 dans bio. Au-delà de 1, le crème blanchit et sort des trois encres.
5. **Matières des sillons et de la règle.** Les sillons sont un `MeshBasicMaterial` dont le fragment calcule le trait. La règle utilise `LineMaterial`, les segments épais de three, pour tenir un pixel CSS en Retina. Les deux sortent le hex exact : `#FF4D1A` et `#F7EEE5` relevés à la pipette sur une capture en ratio 2.
6. **Section courante.** Elle change quand p passe la moitié d'un transit : 0,05, 0,31, 0,51, 0,71, 0,91.
7. **Palier minimal.** DA 13.8 laisse un palier de longueur nulle quand le contenu d'une section ne dépasse pas la fenêtre (téléphone en paysage, liste filtrée) : la caméra sauterait de la clé « a » à la clé « b ». Le palier garde donc 25 % de la hauteur de fenêtre, pris sur la fin du transit. Le gabarit de référence (1000 svh) ne change pas.
8. **Verrou du défilement.** Lenis ne tourne pas avec `autoToggle` : cette option dépend de `transition-behavior`, absent de Safari avant 17.4, et laisserait la page bloquée après l'écran de chargement. Le module lit `overflow` sur `<html>` et fait ignorer la molette à Lenis tant que l'interface verrouille la page.
9. **`envMapIntensity` du châssis.** Depuis three r163, un matériau qui reçoit l'environnement de la scène suit `scene.environmentIntensity`. Le 0,9 de DA 8 n'a donc pas d'effet : le réglage « Environnement » du tableau ci-dessus fait foi.
10. **Dates : CDJ sous le mot.** La DA centre la tranche à 58 % de la hauteur, en plein sur le mot « dates » : il devenait illisible. Le CDJ descend à 74 %. Il ne couvre plus que le pied des lettres, le mot se lit au-dessus de lui.
11. **Règle à y = -0,12, la DA dit -0,2.** Avec le CDJ plus bas, la règle sortait de l'image par le bas. Elle remonte de 8 cm et reste sous l'appareil. En 16:10 elle tient au-dessus du lecteur persistant. En 16:9, quand le lecteur est affiché, il couvre le bas des traits longs (18 px sur 48 à 1280 × 720).
12. **Avec : groupe réduit et remonté.** CDJ à 44 % de la hauteur (DA : 45 %), centre à 39 % du haut au lieu de 50 %. Le CDJ ne couvre plus le « v » du mot. Les anneaux ne croisent que le haut des lettres.
13. **Avec : focale de 22,2° à 3,3 m, la DA dit 30° à 2,2 m.** Le cadrage est le même. La focale plus longue écrase la perspective entre le CDJ et l'étiquette, 45 cm plus bas : les coins du CDJ débordent moins sur l'anneau intérieur.
14. **Anneau intérieur à 0,39 m, la DA dit 0,36.** À 84° d'élévation, le CDJ paraît décalé de 5 cm par rapport à l'étiquette. À 0,36 m un de ses coins coupait toujours un nom.
15. **Bio : CDJ entier, à 2,9 m.** La DA cadre l'écran à un tiers de la largeur, à 1,05 m : le châssis remplissait l'image, rogné, le mot « bio » disparaissait derrière lui et la texture de 1024 px sortait molle. Le CDJ recule (44 % de la hauteur, écran à 12 % de la largeur) et se loge au-dessus du « o », à droite du « b ». Sa cible passe de l'écran au centre de l'appareil. DA 14.2 prévoyait un recul à 1,3 m : il ne suffit pas, le châssis couvre encore le mot.
16. **Contact : CDJ au bout du mot.** La DA le centre à 32 % du haut. Le mot « contact » occupe cette place : le CDJ masquait le « n » et le « t » (« cortact »), et il touchait l'index « 05 » dès 768 px de haut. Entre le pied du mot et le contenu il reste 60 px au mieux à 1280 × 720 : aucune taille de CDJ n'y tient. Il se pose donc à droite du mot, sur la pointe du dernier « t », à la même taille (25 % de la hauteur).
17. **Mobile : cadrage décalé.** DA 10 demande un cadrage centré dans le bandeau. Le mot y est centré aussi : le CDJ le recouvrait dans les cinq sections. Le CDJ descend sous le mot et rapetisse (sons 44 % du bandeau, contact 43 %, avec 31 %). Dans bio, le plan reste serré : l'écran sort sous le mot, le châssis est coupé par le bord du bandeau.
18. **Rendu en veille.** DA 8 demande un rendu à la demande quand rien ne bouge. Le flottement et la poussière bougent toujours : ils s'éteignent après 10 s sans geste, et repartent au premier geste.

## 6. Points à voir avec les autres modules

- **Mot « sons » sur ordinateur.** Le « o » et le « n » restent derrière le CDJ. DA 9 fixe le CDJ à 70 % de la hauteur et le bouton Play à 50 px : à cette taille il couvre le milieu du mot, où qu'on le place. Pour dégager les quatre lettres il faut descendre le CDJ sous 52 % (Play à 37 px), ou déplacer le mot dans `layout.css`. Décision à prendre.
- **Contact sous 800 px de haut.** Le mot (30 svh) et le bloc de contenu se touchent presque : moins de 10 px entre le pied du mot et l'index « 05 » à 1280 × 720 en fin de palier. À 1366 × 650, le titre passe sur le mot. À régler dans `layout.css` (mot plus petit, ou crédits sortis du panneau).
- **Téléphone en paysage.** `--fs-giant` suit la largeur de la fenêtre, pas celle du bandeau : « sons » et « avec » dépassent du bandeau et sont coupés à droite.
- **Écran de la bio.** DA 9 annonce un portrait en deux tons sur l'écran du CDJ. L'écran affiche l'état du lecteur. À 12 % de la largeur, un portrait y serait petit : à revoir si le portrait se fait.
- **Chargement du modèle.** `index.html` précharge le glb, et la scène lance `createCdj` dès la création du renderer. Le découpage du maillage (`splitComponents`) bloque le fil principal 7 ms sur un Apple M2, 29 ms avec un processeur bridé quatre fois, 39 ms bridé six fois. Les durées se relisent sous les noms `cdj:glb` et `cdj:decoupe` (User Timing).

## 7. Banc d'essai

```sh
npx vite --port 5317
# http://localhost:5317/src/scene/bench-stage.html
```

Paramètres : `?k=K2a` (aller à une clé), `?p=0.31`, `?hud=0`, `?gabarits=0`, `?doublure=1` (boîte de remplacement), `?ui=1` (vraie interface et écran de chargement). Dans la console : `__banc.aller('K3a')`, `__banc.mesures()`, `__banc.scene.images` (images rendues depuis le départ).

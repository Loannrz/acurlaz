# Modèle 3D `public/models/pioneer_cdj_3000.glb`

Source : "Pioneer Cdj 3000" par MaxTht (Sketchfab, CC BY 4.0), modifié. 2,2 Mo, glTF 2.0 (Sketchfab 12.68), une seule texture PNG embarquée, aucune animation, aucun skin, aucune extension.
Fichier identique à celui de l'ancien site (octet pour octet).

## Constat principal

**Le glb ne contient AUCUN noeud nommé pour le bouton Play/Pause, le jog ou l'écran.** Il y a seulement 2 meshes monolithiques :
l'un contient les DEUX CDJ côte à côte (plus des câbles modélisés), l'autre le mixer DJM-900NXS2 (plus des câbles).
Les boutons, l'écran et les inscriptions sont uniquement "peints" dans la texture. Le jog et les boutons n'existent qu'en relief low-poly grossier (prismes octogonaux).
Il n'y a donc pas de `getObjectByName('play')` possible. L'ancien site retrouve tout par géométrie (voir plus bas).

## Hiérarchie (identique pour three.js GLTFLoader)

```
Sketchfab_Scene (scene 0)
└ Sketchfab_model                      matrice : rotation Z-up -> Y-up, échelle 0.125
  └ c3d0d6dafc2c425ca09c96c2f928b37a.fbx   échelle 0.01
    └ RootNode
      ├ "CDJ 3000 NXS"                 échelle ~153.87 (rotation incluse)
      │ └ "CDJ 3000 NXS_Textures_0"    MESH 0 : 2 CDJ + câbles
      └ "DJM 900 nxs 2"                échelle ~153.87 / 170.05 en Y (rotation incluse)
        └ "DJM 900 nxs 2_Material.001_0"  MESH 1 : mixer + câbles
```

| Mesh | Nom three.js | Sommets | Triangles | Matériau | Attributs |
|---|---|---|---|---|---|
| 0 | `CDJ 3000 NXS_Textures_0` | 20 524 | 11 456 | `Textures` (metal 0.74, rough 0.75, doubleSided) | POSITION, NORMAL, TEXCOORD_0 |
| 1 | `DJM 900 nxs 2_Material.001_0` | 17 337 | 9 518 | `Material.001` (metal 0.32, rough 0.75, doubleSided) | idem |

Les deux matériaux pointent la même texture PNG (couleur de base uniquement, pas de normal ni roughness map).
Dans three.js, retrouver les meshes par regex sur le nom : `/cdj/i` et `/djm/i` (c'est ce que fait l'ancien site, `src/scene/units.js`).

## Dimensions (après application des matrices, unités brutes du fichier, Y haut)

| | min (x, y, z) | max (x, y, z) |
|---|---|---|
| Mesh CDJ (2 platines + câbles) | -0.714, -0.002, -0.427 | 0.714, 0.195, 0.279 |
| Mesh DJM | -0.416, -0.019, -0.416 | 0.579, 0.166, 0.278 |

Les unités brutes sont arbitraires : **il faut normaliser l'échelle**. L'ancien site met la largeur d'un CDJ à 0,329 m (CDJ-3000 réel : 329 x 453 x 118 mm), `scale = 0.329 / largeurCDJBrute`.
- Châssis CDJ gauche : x -0.714 .. -0.247, y 0.011 .. 0.135, z -0.323 .. 0.279 (largeur brute 0,467).
- Châssis CDJ droit : x 0.248 .. 0.714, mêmes y et z. Centres en x : ~ -0.4805 et +0.481.
- Châssis mixer : x -0.234 .. 0.234, y 0.001 .. 0.132, z -0.277 .. 0.278 (468 x 555 brut, soit ~330 x 391 mm une fois à l'échelle 0,7045 : cohérent avec un DJM-900NXS2 de 320 x 389).
- Facteur d'échelle effectif de l'ancien site : environ 0,7045 (0,329 / 0,467).
- Le mesh CDJ contient 140 composantes connexes, le mesh DJM 126 : châssis, câbles de face arrière (z ~ -0.43 .. -0.29), clés USB rouges branchées en haut à gauche à l'arrière de chaque CDJ, et tous les reliefs de boutons/potards/faders.
- Les reliefs de contrôles montent jusqu'à y 0.159 (CDJ : jog) et 0.19 (câbles). Surface plane du dessus : 0,0945 m (CDJ) et 0,0921 m (mixer) une fois mis à l'échelle (mesurée, `stage.js`).

## Centre et orientation

- Y haut, le dessus des appareils regarde +Y. Les faces avant (côté DJ) sont du côté **+Z**, les ports arrière côté **-Z**. X vers la droite.
- La scène entière n'est pas centrée : les deux CDJ sont à x ~ -0.48 et +0.48, le châssis du mixer entre eux, centré sur x ~ 0 (les câbles du mesh DJM débordent jusqu à x -0.416 et 0.579). Le fond du châssis est à y ~ 0.
- Pas de pivot utile : tout est cuit dans la géométrie (pas de noeud par appareil). Pour manipuler un CDJ seul, il faut le séparer (voir recette).

## Repère local d'un appareil (celui de l'ancien site, à réutiliser)

Après séparation et normalisation : x vers la droite, y vers le haut, z vers le DJ, origine au centre de l'empreinte, au bas du châssis. Unités : millimètres dans `hotspots.js`, mètres dans la scène (la géométrie est mise à l'échelle puis recentrée : `translate(-(minx+maxx)/2, -miny, -(minz+maxz)/2)`).

### Zones des boutons (mm, repère local d'un CDJ, source : `Acurlaz/src/config/hotspots.js`)

| Élément | Zone | Détail |
|---|---|---|
| **Play/Pause** | cercle x -137.5, z 199, r 17.5 | id `play` ; bouton en bas à gauche, côté DJ |
| Cue | cercle x -138, z 152.8, r 17 | id `cue` |
| **Jog** (disque tournant) | cercle x 0, z 81, r 109 | id `jog` ; centre mesuré sur la texture : x 0, z 80.5 (`AT.jog`) |
| **Écran** | rect x -2, z -137.5, 230 x 130, tilt 0.1717 rad | id `screen` ; zone de clic large (cadre inclus) |
| Écran, surface affichable | centre x -0.1, z -138.3, y 117.8 ; 200.8 x 117.2 mm ; tilt 0.1717 | `SCREEN_SPECS` de `src/scene/screens.js` ; inclinaison de 9,8 degrés vers le DJ |
| Fader tempo | rect x 137.5, z 146.5, 23 x 128 | course z 93.5 (haut) .. 197.5 (bas) |
| Browse (rotary) | cercle x 132, z -142, r 22 | id `browse` |
| Hot cues A..H | rects 22 x 12, z -58, x de -104 à 105.5 | |

(`tilt` : rotation autour de x, en radians, vers le DJ.)

Jog : rayons de la pièce 3D reconstruite : plateau r 78, intérieur r 33.6, extérieur r 103.7, hauteur 16.6 mm.

## Comment l'ancien site retrouve les éléments (pas par noms de noeuds)

1. `loadUnits` (`src/scene/units.js`) : trouve les 2 meshes par regex de nom, bake la matrice monde dans la géométrie, puis `splitComponents` (`src/scene/split.js`, union-find sur sommets soudés à 1e-4) découpe en composantes connexes.
2. Châssis = les 2 composantes de plus grande empreinte (x/z) du mesh CDJ (pas le nombre de triangles : les câbles en ont plus). Gauche/droite par position x. Chaque composante est rattachée au châssis dont l'empreinte contient son centre ; ce qui est hors empreinte (câbles) est jeté, ainsi que la clé USB (composante étroite, > 8 mm au-dessus du châssis, près du coin arrière gauche).
3. Chaque appareil devient son propre mesh `cdjLeft_body` / `cdjRight_body` / `mixer_body` (recentré, échelle CDJ_WIDTH_M).
4. `src/controls/index.js` retrouve le relief de chaque contrôle (jog, tempo, browse, potards) en cherchant, parmi les composantes connexes, celles dont l'empreinte tombe dans la zone de clic de `hotspots.js` et qui dépassent de la surface d'au moins `RELIEF_MIN`. Il les retire et pose à la place des pièces 3D procédurales (`src/controls/geometry.js`) ; l'image du bouton est effacée de la texture (`texturePatch.js`).
5. Le bouton Play n'est pas un objet 3D mobile : c'est uniquement une zone de clic (`play`), le picking lance un rayon sur le mesh et cherche la zone sous le point d'impact (`src/scene/hotspots.js`). L'action est dans `src/audio/cdjButtons.js` (`case 'play': d.toggle()`).
6. L'écran est un plan `CanvasTexture` posé 0,6 mm au-dessus de l'écran peint (`src/scene/screens.js`).

## Noms fiables à utiliser

| Besoin | Ce qui est fiable | Ce qui N'existe PAS |
|---|---|---|
| Mesh des 2 CDJ | `CDJ 3000 NXS_Textures_0` (regex `/cdj/i`) | noeud par platine |
| Mesh du mixer | `DJM 900 nxs 2_Material.001_0` (regex `/djm/i`) | |
| Play/Pause | aucun noeud ; zone `play` (x -137.5, z 199, r 17.5 mm, repère local) | noeud `play` |
| Jog | aucun noeud ; zone `jog` (x 0, z 80.5, r ~104 mm) ; la pièce tournante est créée par le code | noeud `jog` |
| Écran | aucun noeud ; `SCREEN_SPECS.cdjLeft` (voir ci-dessus) | noeud `screen` |

Les noms `cdj_left`, `cdj_right`, `mixer` de l'ancien site sont ceux des groupes créés par le code après séparation, pas du glb.

## Recommandation pour le CDJ jouable

Deux voies :
- Réutiliser la méthode de l'ancien site (copier `split.js`, la découpe de `units.js`, les zones de `hotspots.js`, éventuellement `controls/` pour jog et fader tempo). Fiable, déjà validée, mais un peu lourde.
- Pré-traiter le glb une fois (script Node, `@gltf-transform`) : séparer un seul CDJ (composantes dans l'empreinte x -0.714..-0.247), le recentrer, retirer le relief du jog et du bouton Play, et exporter un glb à noeuds nommés (`cdj`, `jog`, `play`, `screen`). Les coordonnées ci-dessus donnent les emplacements exacts (mm, repère local).

Dans les deux cas, le jog et l'écran doivent être recréés par le code (disque noir brillant + image du centre ; plan avec canvas), car la texture contient le dessin d'origine.
Mention de licence obligatoire (CC BY 4.0, modèle modifié) : voir `src/data/content.js` (`credits`).

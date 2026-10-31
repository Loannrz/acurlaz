# Acurlaz — intro 3D

Intro d'ouverture du site : deux CDJ-3000 et un DJM-900NXS2 posés sur le
comptoir d'un club, qui se câblent, puis une vue plongeante avec zoom à la molette.
Stack : Vite, three.js, GSAP.

Intro (`src/intro/timeline.js`, réglages `CAMERA` ; clés de caméra `CAMERA_KEYS`
dans `src/intro/camera.js`) : les trois appareils sont à leur place, éclairés, dès
la première image (ni descente, ni fondu d'apparition, ni montée de lumière : le
fondu de l'écran de chargement vers la scène est la seule transition ; ombre de
contact statique, `src/scene/contactShadows.js`). Un seul plan continu :

- 0-2,9 s : plan très large depuis le côté DJ (`far` : le set petit au milieu du
  club, champ de 46°), qui zoome progressivement (la caméra avance ET le champ se
  resserre, clé intermédiaire `approach` interpolée entre `far` et `final`, donc
  zoom monotone quel que soit le format) et passe le cadrage final sans s'arrêter ;
- 2,9-4,2 s : tour par la droite jusqu'à l'arrière du set ;
- 3,95-6,23 s : les câbles se branchent un à un (animation inchangée) pendant un
  travelling de droite à gauche ;
- 6,58-8,63 s : tour par la gauche et arrêt en douceur sur la vue finale (inchangée).

Durée totale : 8,63 s. Une seule spline C1 (pas d'arrêt ni de saut de vitesse
aux clés), départ et arrivée à vitesse nulle.

## Commandes

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # dist/ (l'intro seule ; inspect.html reste en dev)
npm run preview   # sert dist/ : à utiliser pour juger la fluidité et le chargement
```

## Contrôles

- Bouton « Passer », `Échap` : aller à la fin. Inactifs pendant le chargement ; le
  bouton n'est visible (et atteignable au clavier) que pendant l'intro.
- `R` : rejouer (les touches tenues sont relâchées et les platines s'arrêtent
  d'abord, y compris un morceau encore en décodage qui devait démarrer seul ; les
  retours d'effet Beat FX sont coupés, donc plus de queue d'écho ou de réverb
  sous l'intro, et rouverts à sa fin ; le focus écran se ferme, l'écran CRÉDITS
  revient au repos). Mouvement réduit : `R` va directement à la vue finale.
  `Espace` : pause / reprise
  pendant l'intro, puis lecture / pause du CDJ (`togglePlay`, `src/screens/index.js`) ;
  jamais interceptée sur un bouton ou un champ focalisé.
- Molette / pincement trackpad (ou deux doigts sur un écran tactile, voir
  « Mobile ») : zoom après l'intro (limites `ZOOM` dans `src/config.js`).
  En butée, la molette n'est plus interceptée (la page défilerait si elle le pouvait).
- Clic maintenu + glisser (ou un doigt) : tourner la caméra devant le set
  (élévation 15 à 62°, ±65° autour de la vue de face, butées douces ; bornes
  `ORBIT` dans `src/config.js`). Un clic simple reste un clic de bouton.
  Un glisser qui commence sur un fader, un potard, un jog… déplace ce contrôle
  et non la caméra (voir « Contrôles mobiles »).
- Vue par défaut : cadrée pour montrer les trois appareils en entier, quelle que
  soit la taille de la fenêtre (recadrée au redimensionnement tant que la caméra
  n'a pas été bougée).
- Paramètres d'URL, avec `npm run dev` seulement (un build les ignore) :
  `?t=3.2` (se positionner à un instant, pause), `?speed=0.5`,
  `?cam=final|rear|front|iso|top|left|right` (caméra fixe de dev),
  `?mobile=1|0`, `?backdrop=…`. Les valeurs invalides sont ignorées. Le panneau
  dev et `window.__intro` n'existent aussi qu'avec `npm run dev`.

## Mobile (téléphones et tablettes)

Le site reste conçu pour le grand écran ; sur téléphone (portrait et paysage) et
tablette, un profil dédié s'applique. Le PC n'est pas touché : mêmes valeurs,
mêmes images (captures avant / après identiques au pixel près).

- **Détection** (`src/utils/device.js`) : pointeur principal grossier
  (`pointer: coarse`) ET pas de survol (`hover: none`) ET petit côté d'écran
  ≤ 1100 px CSS. Un portable à écran tactile reste un PC. Forcer pour tester :
  `?mobile=1` / `?mobile=0` (en dev). L'orientation est relue à chaque redimensionnement.
- **Profil `MOBILE`** (`src/config.js`, appliqué au chargement sur `RENDER`,
  `AUDIO`, `ZOOM`) : ratio de pixels 1,25 au plus (paliers 1,25 / 1 / 0,85 via la
  résolution adaptative existante, cible ~40 images/s avant de descendre), bloom
  coupé, carte d'ombre 1024 px, textures du décor et atlas à demi-taille,
  anisotropie 4, 2 sons décodés au plus (au lieu de 3), zoom plus proche
  (0,8 m) et moins lointain. Économie (batterie < 20 % hors charge, si l'API
  existe, ou `prefers-reduced-motion`) : ratio plafonné à 1. Préchauffage des
  shaders inchangé. L'intro garde sa durée (8,63 s).
- **Cadrage** (`MOBILE_CAMERA`, `src/intro/camera.js`) : en portrait, le champ
  vertical s'élargit (jusqu'à 48°) pour garder ≥ 22° en horizontal ; la vue par
  défaut cadre le trio au plus juste (marge 1,04). Les plans fixes de l'intro
  (plan large d'ouverture, passages latéraux, travelling arrière) reculent d'au
  plus ×1,6 pour montrer ce qu'un PC montre, jamais au-dessus de 3,25 m (plafond
  du club) ni au-delà de 3,5 m derrière le DJ (mur) ; en portrait, le plan large
  garde un champ plus ouvert que la vue finale (jusqu'à 70°), donc le zoom
  d'ouverture reste visible. Focus écran : en portrait l'image de l'écran
  remplit la largeur du téléphone (touches visibles au-dessus) ; en paysage,
  écran + touches au plus juste. Idem pour l'écran CRÉDITS du mixer.
- **Rotation** : rien n'est recréé (même renderer, mêmes cibles, mêmes
  programmes ; vérifié après 9 rotations). Le chemin caméra de l'intro, la vue
  libre (le zoom garde sa proportion de la distance cadrée) et le focus écran
  sont recalculés (`renderer.onResize`, aussi sur `orientationchange` et
  `visualViewport`).
- **Gestes** : un doigt = orbite ; deux doigts = pincement (zoom vers le point
  entre les doigts) et glisser à deux doigts = déplacer le point visé sur le set
  (borné), pour approcher une platine. En focus écran : un doigt = l'écran
  (touches, listes), deux doigts = loupe (jusqu'à ×2,5) et déplacement sur
  l'écran ; repincer pour revenir. Les listes défilent au doigt avec une inertie
  légère (`TOUCH.inertia`). Plusieurs doigts sur plusieurs contrôles à la fois
  (un fader et un potard) ; un deuxième doigt posé avant que le premier ne
  bouge en fait un pincement. Tap ≠ glisser : seuil de 10 px au doigt.
- **Cibles tactiles** (`TOUCH` dans `src/config.js`) : au doigt, la zone la plus
  proche à 14 px CSS près compte (8 mm au plus sur le modèle), et les touches des
  écrans CDJ à 14 px CSS près : la rangée « Sources … Échap » en focus fait ~60 ×
  48 px effectifs en portrait, ~88 × 57 px en paysage.
- **Info-bulles** : pas de survol au doigt ; un appui long (650 ms) sur une zone
  à info-bulle l'affiche tant que le doigt reste (« Touchez pour entrer dans
  l'écran » sur un écran). Ce relâchement-là ne compte pas comme un clic.
- **Page** : `viewport-fit=cover`, `100dvh`, `touch-action: none`,
  `overscroll-behavior: none`, gestes de zoom iOS refusés : ni zoom de la page ni
  rebond. Marges de sécurité (`env(safe-area-inset-*)`) pour « Passer »,
  l'invitation (« Touchez un écran pour entrer »), les info-bulles et le
  chargement. « Passer » : 44 px de haut, en bas à droite, à portée du pouce.
  Lecture / pause : touche PLAY du CDJ ou bouton ▶ de l'écran de lecture.
- **Astuce en focus portrait** (`src/ui/focusTip.js`) : « Pincez pour agrandir,
  ou tournez le téléphone », jusqu'au premier pincement (mémorisé), à la rotation
  ou à la sortie.
- **Audio** : iOS 16.4+ joue malgré le mode silencieux
  (`navigator.audioSession.type = 'playback'`) ; un contexte interrompu (appel,
  écran verrouillé) reprend au geste suivant. Le scratch garde son repli sans
  AudioWorklet.

Mesures (Chrome headless sur MacBook Air M2, émulation iPhone 390 × 844 DPR 3,
CPU ralenti ×4 ; le GPU du Mac n'est pas celui d'un téléphone : ordres de
grandeur) : voir le tableau en bas de cette section.

| iPhone émulé (390 × 844, DPR 3), CPU ×4 | avant | après |
| --- | --- | --- |
| Ratio de pixels / canvas | 1,75 / 682 × 1477 (1,0 Mpx) | 1,25 / 487 × 1055 (0,51 Mpx) |
| Carte d'ombre / passes de bloom | 2048² / 13 passes | 1024² / aucune |
| Textures du décor | 1024 px | 512 px |
| Images / s intro (build de prod) | 59 | 59-60 |
| Images > 50 ms pendant l'intro | 0-1 | 0-1 |
| Coût d'une image vue finale (CPU+GPU) | 3,1 ms | 3,6 ms (bruit : limité par le CPU ralenti, pas par le GPU du Mac) |
| Pincement / orbite à un doigt | pas de pincement | 60 / s, zoom 2,9 m → 0,86 m |
| Focus écran, px CSS par px d'écran CDJ | 0,33 portrait | 0,37 portrait (0,89 avec la loupe), 0,50 paysage |
| Touches « Sources … Échap » en focus (portrait) | 58 × 20 px | 61 × 21 px vus, ~61 × 49 px effectifs au doigt |
| Fuite après 9 rotations (géométries / textures / programmes) | — | 178 / 103 / 46, inchangés |

Petit Android (360 × 800) : mêmes ordres de grandeur ; tablette (768 × 1024) :
ratio 1,5 au plus. Le GPU d'un téléphone de milieu de gamme n'est pas émulable
ici : la résolution adaptative (paliers 1,25 → 1 → 0,85) reste le filet.

Limites : aucun vrai téléphone ni Safari n'ont servi aux tests (émulation
Chrome seulement) ; le comportement de WebKit (gestes, audio, mémoire) reste à
vérifier sur un iPhone.

## Écran de chargement

Plein écran, inline dans `index.html` (affiché avant tout script : jamais de
page vide), piloté par `src/ui/loader.js` : une barre de progression classique
centrée sur le fond noir de la page (piste fine et discrète, remplissage clair,
240 px de large ; ni carte, ni verre, ni ombre) et un seul mot en petit dessous
(« Chargement », « Préparation », « Presque prêt », « Prêt »), sans pourcentage. La barre (`role="progressbar"`, `aria-valuenow`,
`aria-valuetext` pour les lecteurs d'écran) est pondérée par les étapes réelles : code,
modèle 3D (octets reçus), textures du décor (octets reçus), montage (découpe du
modèle, contrôles, décalque), cuisson de la lumière du décor, écrans (manifeste
audio, photo décodée, premières pages), shaders (compilés par parties), envoi des
textures et images de chauffe, choix de la résolution. Elle ne recule jamais,
glisse par une transition CSS (elle bouge même quand le fil principal compile) et
n'atteint 100 % que lorsque tout est prêt ; l'écran se retire alors en fondu et
l'intro démarre à t = 0, sans compilation ni envoi de texture pendant
l'animation. Le préchargement du modèle (`index.html`, petit script inline) ne
demande le `.glb.gz` que si `DecompressionStream` existe (sinon le `.glb`, comme
`src/scene/units.js`) ; en cas de repli sur le `.glb` après un `.gz` illisible,
la barre continue d'avancer pendant ce second téléchargement (le `.gz` n'en
remplit que 90 %). Échec du modèle : message et bouton « Réessayer » (nouvelle
tentative sans recharger) ; autre échec : message et rechargement ; sans WebGL 2 :
message de repli. Mouvement réduit : pas de transition, intro passée.
Poids des étapes et mots : `loader.define(...)` / `loader.label(...)` dans
`src/main.js` ; style : `<style>` de `index.html`. Aucun son n'est chargé avant un geste (les MP3 se chargent au LOAD).

## Performances

Mesuré sur MacBook Air M2, Chrome headless (GPU Metal), fenêtre 1440 × 900 à
devicePixelRatio 2, build de production servi par `vite preview`, profil neuf.
Le headless est bruité (machine chargée, horloge GPU variable) : ordres de
grandeur (médianes de 3 à 6 passages), à confirmer sur la machine cible.

| | avant | après |
| --- | --- | --- |
| Poids transféré | 3,5 Mo | 2,4 Mo (logo du mixer compris : PNG indexé de 26 Ko au lieu de 392 Ko) |
| Début de l'intro, réseau local / 4G / Fast 3G | 1,2-2,1 s / 4,8 s / 22,7 s | 2,0-2,9 s / 4,7 s / 16,9 s |
| Images / s pendant l'intro | 28-42 | 58-60 |
| Images > 50 ms pendant l'intro | 3-23 (max 100-400 ms) | 0-3 (max 33-117 ms) |
| Compilations / envois de texture pendant l'intro | 1-8 (réallocations) | 0 |
| Coût GPU d'une image, vue finale, 1,75 (à chaud) | ~23-26 ms | ~8,5 ms |
| Images dessinées par seconde, vue immobile | 50-60 | 1 |

Nouvelle intro (plan large, sans arrivée des platines), même machine, build de
prod, 3 passages alternés avant / après : images / s pendant l'intro 57,9-60 →
59,1-59,6 ; images > 50 ms 0-2 → 0-1 ; compilations / envois de texture pendant
l'intro 0-1 → 0 ; début de l'intro (réseau local) 2,1-3,6 s → 2,0-3,1 s (une
seule variante de programmes à compiler) ; vue immobile ~1 image / s. iPhone
émulé, CPU ×4 (2 passages) : intro 59,7-60 → 59,6-60 i/s, orbite 55-60 i/s,
pincement 60 i/s, ratio de pixels 1,25 inchangé.

- Rendu à la demande (`RENDER.renderOnDemand`) : après l'intro, une image n'est
  dessinée que si quelque chose a changé (caméra, écran, VU, matériau, lumière,
  contrôle, entrée clavier / souris, carte d'ombre) ; une vue immobile ne coûte
  plus rien au GPU (une image par seconde par sécurité).
- Carte d'ombre redessinée seulement quand un câble ou un contrôle bouge (les
  appareils ne bougent jamais ; plus à chaque image de l'intro).
- Appareils opaques dès le chargement (plus de fondu) : une seule variante de
  programmes à compiler derrière l'écran de chargement.
- Bloom calculé à demi-résolution (`RENDER.bloomScale`) : même image à l'œil
  (écart moyen < 0,1 / 255), plusieurs ms de moins par image en Retina.
- Résolution : choisie derrière l'écran de chargement (mesure du coût d'une image
  d'intro, `RENDER.frameBudgetMs`, `loadBudgetSlack`), au plus
  `introMaxPixelRatio` (1,5) pendant l'intro, et jamais changée pendant
  l'animation (avant : jusqu'à 3 changements en pleine intro, 100-250 ms de gel
  chacun), sauf dans ses 0,75 premières secondes (encore sous le fondu de
  l'écran de chargement à la première visite), si les images y sont trop lentes
  (`introMinFps`). À la fin de l'intro, une mesure à chaud
  remonte la netteté si possible (jusqu'à `maxPixelRatio`, 1,75) ; ensuite le
  palier descend si les images restent lentes (`adaptiveResolution`,
  `adaptiveMinFps`). `adaptiveResolution: false` = toujours `maxPixelRatio`.
- Textures du décor décodées hors du fil principal (`createImageBitmap`) ; le
  manifeste audio et la photo de la page « À propos » sont attendus derrière
  l'écran de chargement (premières pages dessinées et envoyées avant l'intro).
- Modèle servi compressé : le build écrit `models/*.glb.gz` (gzip -9, 2,2 Mo →
  1,1 Mo, mêmes octets une fois décompressés) et le charge avec
  `DecompressionStream` (repli sur le `.glb`). Draco / meshopt écartés : ils
  réordonnent ou soudent les sommets, or `split.js` et `controls/` découpent le
  modèle par composantes connexes et repeignent la texture par UV.
- Build : `inspect.html` exclu, three.js et GSAP dans des fichiers séparés à noms
  hachés (cache long possible côté hébergeur), `console.debug` retirés, `vite` en
  devDependencies, chemins publics via `import.meta.env.BASE_URL`.
- `R` ne recrée rien (mêmes géométries, textures et programmes après plusieurs
  replays).
- Écran CDJ non focalisé redessiné à 30 / s pendant la lecture (le focalisé à
  60 / s ; deux écrans non focalisés alternent, jamais dans la même image :
  `src/screens/router.js`). Envois de texture d'écran : 120 / s → 60 / s en vue
  d'ensemble, deux platines en lecture.
- AudioContext créé au premier moment calme après un geste (jamais pendant
  l'intro ni un vol de caméra) plutôt que dans le geste (sa création gèle
  ~20-120 ms : `src/audio/engine.js`), puis le graphe du mixer est construit. Une
  touche qui demande du son (PLAY, CUE...) le crée et le relance tout de suite
  dans son geste. Safari et navigateurs iOS (WebKit) : création dans le premier
  geste comme avant (un contexte créé hors geste peut y rester suspendu).
- 3 sons décodés au plus au lieu de 4, 2 sur mobile (`AUDIO.maxBuffers`, ~50 Mo chacun,
  `src/audio/buffers.js`) : on libère le plus ancien que ne tient aucune
  platine ; les aperçus des listes n'entrent pas dans ce cache (analysés un par
  un, son décodé jeté aussitôt).
- Logo du mixer (`public/img/acurlaz-logo.png`, 1600 × 533) en PNG indexé
  (une couleur crème, 249 niveaux d'alpha) : 392 Ko → 26 Ko, rendu identique
  sur le mixer (écart moyen 0,2 / 255 sur une capture en gros plan).

## Mode dev

En `npm run dev` seulement (jamais dans un build) : panneau en haut à droite qui affiche chaque clic
sur une zone (id, unité, libellé, compteur, heure, flash), le survol, les
événements tactiles de l'écran en focus (type, x, y en px du canvas), l'historique
des 5 derniers clics / taps et les FPS.

- Le panneau est **masqué par défaut** (il journalise quand même en arrière-plan).
- `P` : afficher / cacher le panneau, en dev seulement, à tout moment (ignorée
  dans un champ de saisie et avec Ctrl, Cmd, Alt ou Maj).
- Pendant un focus écran, le panneau est toujours caché (il masquerait des
  touches) ; à la sortie il revient dans l'état d'avant le focus (donc caché par
  défaut). `P` permet de le consulter pendant le focus.

- `H` : afficher les zones de clic (elles épousent le modèle : exactement la
  surface cliquable ; la zone survolée passe en jaune).
- `Alt+clic` sur le modèle : coordonnées locales (mm) sous le curseur et zone
  trouvée, pour recaler une zone.
- `window.__intro` : timeline, écrans, VU, hotspots, câbles, rig caméra, `quality`
  (palier de résolution, coûts mesurés), `renderReasons` (pourquoi des images sont
  dessinées : intro, caméra, matériau, entrée, filet de sécurité).

## Focus écran (CDJ et écran CRÉDITS du mixer)

Après l'intro, un clic sur l'écran d'un CDJ (zones `cdj_left_screen` /
`cdj_right_screen`) ou sur l'écran CRÉDITS du mixer (`mixer_screen`, voir
« Crédits ») fait voler la caméra devant cet écran, puis la verrouille
(molette, glisser et rotation ignorés ; les autres zones de clic restent actives).
Un clic sur la touche « ÉCHAP » de ce même écran (CDJ : en haut à droite, touche
MENU du modèle, zones `cdj_left_menu` / `cdj_right_menu` ; mixer : au-dessus de
l'écran, `mixer_menu`), ou `Échap`, ramène la caméra exactement à la pose de
départ et rend les contrôles.

En focus, l'écran devient une **surface tactile** (`src/input/screenTouch.js`) :
un appui sur l'image est converti en pixels du canvas de l'écran (raycast sur
`screen.mesh`, UV × taille du canvas : 1024×597 sur un CDJ, 1024×816 sur le
mixer) et produit `pointerdown`, `pointermove` (glisser,
`dragging` au-delà du seuil de `src/input/pointer.js`), `pointerup` puis `tap`
(sans glisser, moins de 800 ms). Souris, stylet, tactile. Halo blanc très doux au
tap (300 ms, statique en mouvement réduit), curseur « pointer » seulement sur une
région tactile. Les autres écrans ne font rien ; hors focus, un écran reste un
bouton qui lance le focus. Démo (désactivée par défaut) : trois touches « DÉMO
A/B/C » en bas à droite, seulement en focus (`SCREEN_TOUCH.demo = true` dans
`src/config.js`, code isolé dans `src/scene/screenDemo.js`). Réglages
`SCREEN_FOCUS` (CDJ) et `MIXER_FOCUS` (écran CRÉDITS) dans `src/config.js`
(cadrage, angle, durée, type de vol, loupe). Code : `src/input/screenFocus.js`
(table `TARGETS` : une entrée par écran).

```js
const f = window.__intro.screenFocus; // dev ; en prod, l'objet créé dans main.js
f.enter('cdj_left'); f.exit(); f.current; // 'cdj_left' | 'cdj_right' | 'mixer' | null
f.onChange(({ type, unit, zone }) => {}); // type : 'enter' | 'exit' | 'exited'
```

## Invitation et info-bulles

Textes modifiables dans `src/data/hints.js` (rien d'autre à toucher).

- **Invitation** (`src/ui/invite.js`) : ligne discrète en bas au centre
  (« Cliquez sur un écran pour entrer », « Touchez… » sans souris), en fondu
  0,9 s après la fin de l'intro, jamais pendant l'intro. Disparaît au premier
  focus écran, ou 8 s après la première interaction (clic, molette, info-bulle).
  Mémorisée dans `localStorage` (`acurlaz:v1:invite`) : plus montrée aux visites
  suivantes ; sans stockage, elle revient simplement. `R` la masque (sans la
  mémoriser).
- **Info-bulles** (`src/ui/tooltip.js`, styles `#hint`) : au survol souris d'une
  zone listée dans `hints.js` (écrans CDJ, touches du haut via leur libellé
  imprimé, PLAY, CUE, hot cues, boucles, SYNC, tempo, plateau ; crossfader,
  faders et EQ / filtre des voies 1-2, MASTER LEVEL, FX, écran CRÉDITS « Qui a
  fait ce site » ; touches ÉCHAP « Revenir à la scène », seules info-bulles
  actives en focus). Apparition
  après 250 ms immobile sur la zone, texte tapé à ~26 ms/caractère (affiché
  d'un coup en mouvement réduit), disparition immédiate à la sortie. Placée à côté
  de la zone (boîte projetée par `hotspots.screenRect()`), jamais dessus, en
  évitant les écrans CDJ (et, pour un écran, sa rangée de touches), repliée dans la
  fenêtre. Jamais pendant l'intro, un vol de caméra, le focus écran, un appui ou un
  glisser (la zone se tait jusqu'à ce que le pointeur en sorte), ni pendant que la
  caméra bouge. Exception assumée à « rien ne bouge seul » : la frappe, pendant un
  survol seulement ; aucun timer au repos.

## Écrans CDJ : pages et lecture audio

Chaque CDJ affiche une interface de CDJ-3000 (références : `docs/reference/`,
manuel p18, p19, p21) et se pilote avec ses touches 3D, à distance comme en focus :

- Rangée au-dessus de l'écran : `Sources`, `Link`, `Dates`, `Feat`,
  `À propos` changent la page de CE CDJ (départ : À propos). `Échap` ne fait que
  quitter le focus : la page reste.
- En focus, l'écran est tactile : 1er toucher surligne un morceau, 2e toucher
  affiche `LOAD`, `LOAD` (ou un double toucher rapide) charge le morceau dans ce
  CDJ et ouvre la page lecture (avec la pochette générée du morceau). Glisser
  fait défiler les listes. Sur la page lecture, toucher / glisser sur la vue
  d'ensemble déplace la lecture.
- Listes de morceaux : l'ordre est figé tant que la liste reste affichée (les BPM
  détectés arrivent avec les aperçus PREVIEW pendant l'affichage : rien ne
  change de place sous le doigt, ni dans l'ordre que suit TRACK SEARCH) ; il est
  recalculé quand on revient sur la vue ou qu'on change de tri. Colonne PREVIEW :
  désactivée par défaut sur téléphone et tablette (chaque aperçu décode tout un
  fichier) ; sur PC, seules les lignes visibles sont analysées, un fichier à la fois.
- PROCHAINES DATES : seules les dates à partir d'aujourd'hui (début de journée)
  s'affichent ; sans date à venir, « Aucune date annoncée ».
- `PLAY/PAUSE` : lecture / pause du morceau de ce CDJ. `CUE` (maintenu) : en
  lecture, retour au point de cue et arrêt ; à l'arrêt, la position devient le
  point de cue et le morceau joue tant que la touche est tenue, puis revient au
  point de cue. `BACK` : niveau précédent. Les deux CDJ sont indépendants.
- Le son ne démarre qu'après un premier geste de l'utilisateur (règle des navigateurs).

### Boutons des CDJ (`src/audio/cdjButtons.js`, signal dans `src/audio/deck.js`)

Les touches de jeu réagissent à l'APPUI (comme un CDJ) ; un appui sur une touche
ne fait jamais tourner la caméra et résiste à un glissement de 80 px ; il est
relâché au relâchement, à la perte de capture, et si la fenêtre perd le focus ou
l'onglet est masqué. Un deuxième doigt peut appuyer sur PLAY pendant CUE.

- À l'appui : `play`, `cue`, `hot_cue_a`…`h` (pad vide : pose à la position,
  sur le temps le plus proche avec QUANTIZE, une boucle en cours devient un hot
  cue boucle ; pad posé en lecture : saut, avec QUANTIZE depuis le temps
  précédent pour tomber sur le temps ; à l'arrêt : joue tant qu'on tient, puis
  revient), `in_cue` (LOOP IN + point de cue ; IN ADJUST en boucle), `out` (LOOP
  OUT, nombre entier de temps avec QUANTIZE ; OUT ADJUST en boucle),
  `reloop_exit`, `beat_loop_4` / `beat_loop_8` (boucle 4 / 8 temps ; ÷2 / ×2 si
  une boucle tourne), `beat_jump_back` / `fwd` (taille choisie à l'écran ;
  déplace la boucle en cours), `search_rev` / `fwd` (tenu : ×4, scrub audible à
  l'arrêt), `track_search_prev` / `next` (morceau précédent / suivant de la
  liste d'origine, dans l'ordre où elle était affichée : vue TRACK, ALBUM, BPM,
  KEY ou PLAYLIST, tri compris (`loaded.list`, et dernière liste affichée `list`
  dans `src/screens/state.js`) ; précédent = début du morceau après 2 s ; la
  lecture continue),
  `call` (remplit les pads vides avec les hot cues trouvés sur l'audio),
  `memory` (mémorise le point de cue ou la boucle), `cue_loop_call_prev` /
  `next` (appelle la mémoire précédente / suivante, en pause dessus), `delete`
  (efface la mémoire sur laquelle la platine est arrêtée, sinon arme pendant 4 s
  l'effacement du prochain hot cue appuyé), `jog` (toucher du plateau en VINYL).
- Au clic (réglages) : `quantize`, `beat_sync`, `master`, `master_tempo`,
  `tempo_range` (±6 / ±10 / ±16 / WIDE ±100), `tempo_reset` (0 % quel que soit
  le slider), `time_mode` (REMAIN / écoulé), `auto_cue`, `vinyl` et `jog_mode`
  (VINYL / CDJ), `key_sync` (KEY SHIFT vers la tonalité du maître),
  `usb_stop` (éjecte le morceau, platine arrêtée).
- Contrôles 3D (store `src/controls`) : `tempo` → vitesse réelle
  (`playbackRate`, rampe de 60 ms) ; `jog` : en lecture pitch bend, à l'arrêt
  recherche audible (1 tour = 1,8 s), en VINYL plateau tenu = disque arrêté et
  scratch (grains audio, y compris en arrière), relâché = reprise ; `jog_adjust`
  → sensibilité du bend.
- Écran de lecture : touches tactiles BEAT LOOP (1/2 à 16 temps, EXIT/RELOOP),
  KEY SHIFT (±6 demi-tons), BEAT JUMP (taille 1/2 à 32, ◀ ▶) = mêmes actions ;
  TEMPO %, plage, BPM entendu, MASTER (seulement sur le maître) / SYNC, MT,
  QUANTIZE, AUTO CUE, nombre de temps de la boucle, zone de boucle, hot cues,
  mémoires (triangles rouges) et point de cue sur les deux waveforms.
- Aucun voyant n'est dessiné sur les touches du modèle (elles gardent leur
  aspect d'origine) : les états se lisent sur l'écran de lecture.
- MASTER / SYNC (`src/audio/sync.js`) : la platine SYNC suit le BPM × tempo du
  maître (moitié / double si plus proche), slider ignoré tant que SYNC est
  actif ; phase calée sur la grille au passage en SYNC et au démarrage.
- Stockage (`src/audio/cueStore.js`) : point de cue, hot cues A–H (points ou
  boucles) et mémoires par morceau dans `localStorage`, clé
  `acurlaz:v1:cues:<fichier du manifeste>` ; réglages par platine dans
  `acurlaz:v1:prefs:<platine>`. Sans `localStorage`, tout marche sans être
  enregistré. L'AUTO CUE (premier son, par platine) ne remplace jamais un cue
  enregistré.
- Boucles : bouclage natif de la source (`loopStart` / `loopEnd`), sans
  redémarrage ; un saut redémarre la source avec des fondus de 5 ms.
- MT / KEY SHIFT : décaleur de hauteur en nœuds natifs (`src/audio/pitchShift.js`,
  deux lignes à retard modulées, grain de 100 ms) : tonalité conservée quand le
  tempo bouge, ou décalée sans changer le tempo. Limite : léger effet de
  « chorus » sur les sons tenus et attaques un peu adoucies.
- Laissés sans effet (rien de réel derrière ici) : `direction`, `slip_reverse`
  (lecture arrière d'un morceau entier : copie inversée trop lourde en mémoire),
  `shortcut`, `tag_track`, `vinyl_speed_adjust`, A.HOT CUE (chargement
  automatique : CALL le fait à la demande), bouton rotatif BROWSE (inerte : ni
  main de saisie ni rotation).

Code :

- `src/screens/` : `index.js` (assemblage, routage des touches), `state.js`
  (store par CDJ), `router.js` (dessin, tactile, redessin seulement sur
  changement ; 60 images/s sur la page lecture pendant la lecture pour l'écran
  focalisé, 30/s pour l'autre écran, 10/s pour la barre d'état des autres pages
  pendant la lecture, rien sinon), `registry.js`,
  `design.js` (couleurs, polices, tailles, helpers de dessin), `widgets/browse.js`
  (cadre BROWSE + liste de morceaux, partagé), `pages/<page>.js` (une page par
  fichier, contrat en tête de chaque fichier).
- `src/audio/` : `engine.js` (AudioContext partagé, déblocage au premier geste),
  `deck.js` (une platine par CDJ ; un échec de l'analyse de la forme d'onde ne
  met jamais la platine en erreur), `buffers.js` (chargement, décodage, cache ;
  un fichier introuvable n'est plus jamais redemandé ; échec réseau ou exception :
  attente croissante 2 / 4 / 8 s avant de réessayer en arrière-plan, abandon après
  3 échecs, `retry.js`), `waveform.js` (waveforms calculées sur l'audio décodé,
  même garde-fou), `cdjButtons.js`, `sync.js`, `cueStore.js`, `pitchShift.js`.
- `src/data/` : `library.js` (manifeste audio, playlists), `dates.js`, `feat.js`,
  `about.js` (contenus factices à remplacer), `credits.js` (générique, voir
  « Crédits »).
- Sons de démo : `public/audio/manifest.json` + fichiers à côté (remplacer le
  manifeste et les fichiers suffit). Photo : `public/img/about-portrait.jpg`.

```js
const ui = window.__intro.screenUI; // dev
ui.router.show('cdjLeft', 'dates'); ui.store.get('cdjLeft').page;
ui.decks.cdjLeft.play(); ui.decks.cdjLeft.position;
```

## Crédits (écran « CRÉDITS » du mixer)

Le petit écran Beat FX du mixer (38 × 30 mm) est un vrai écran « CRÉDITS », au
même emplacement et avec le même rendu que les écrans des CDJ (texture canvas
1024 × 816 posée sur l'afficheur, fond noir sur toute la zone, image aux coins
arrondis : `SCREEN_SPECS.mixer` dans `src/scene/screens.js`). C'est une troisième
« unité d'écran » du store et du routeur (`'mixer'`, `src/screens/state.js`,
`router.js`), sans platine.

- Au repos : page `standby` (`src/screens/pages/standby.js`), le mot « CRÉDITS »
  en grand, centré, avec un trait bleu ; ni BPM, ni Beat FX. Statique.
- Le titre imprimé « BEAT FX » au-dessus de l'écran est effacé de la texture
  (`src/scene/mixerLabel.js`, méthode `band` de `src/controls/texturePatch.js`) ;
  à sa place, une touche 3D « ÉCHAP » du même modèle que celles des CDJ
  (`MIXER_TOP_KEYS` dans `src/scene/screens.js`, 22 × 5,8 mm, zone `mixer_menu`).
  Les autres « BEAT FX » (boutons `chN_beat_fx`) restent tels quels ; les effets
  gardent leurs commandes (FX SELECT, ON/OFF, BEAT < >...).
- Clic sur l'écran (zone `mixer_screen`) : la caméra zoome jusqu'à cet écran
  (`MIXER_FOCUS` dans `src/config.js`) : vol de 1,3 s en « zoom » (distance
  interpolée sur une échelle logarithmique, point visé qui glisse à vitesse
  constante à l'écran, direction qui pivote en douceur, départ et arrivée à
  vitesse et accélération nulles), cadrage où l'image occupe ~62 % de la hauteur
  de la vue, comme un écran de CDJ en focus, touche ÉCHAP visible au-dessus.
  L'écran passe à la page `credits` dès le début du vol (carte d'ouverture
  immobile), le générique démarre à l'arrivée. Sortie : touche 3D « ÉCHAP » ou
  `Échap` : l'écran revient au repos et la caméra dézoome vers la pose de départ.
  Mobile : au toucher, portrait = l'image remplit la largeur ; loupe à deux
  doigts jusqu'à ×1,4 (le plan proche de la caméra est à 5 cm).
- Générique : défilement de bas en haut à 50 px/s (`SPEED`), après 1,4 s sur la
  carte d'ouverture, arrêt sur la dernière carte (pas de boucle). Glisser fait
  défiler à la main (le défilement s'arrête sous le doigt et reprend 0,6 s
  après), molette / flèches aussi ; toucher l'écran à la fin ou la touche
  « REJOUER » de la barre de titre relance depuis le début. Exception voulue à
  « rien ne bouge seul » : le défilement ne tourne que si la page est sur l'écran
  en focus (caméra arrivée) ; sinon, et une fois arrivé en bas, aucun redessin.
  Position calculée à partir du temps ; texte pré-rendu une fois dans un canvas
  hors écran. Mouvement réduit (`prefers-reduced-motion`) : pas de défilement
  automatique, défilement à la main seulement.
- **Modifier les noms** : `src/data/credits.js` (carte d'ouverture, sections,
  entrées `role` / `name` / `lines` / `list` / `license`, carte de fin ; la forme
  est décrite en tête du fichier). Chaque ligne vient de `CREDITS.md` : ajouter
  un asset = l'ajouter dans les deux fichiers.

```js
const ui = window.__intro.screenUI; // dev
ui.openCredits(); ui.closeCredits(); // = screenFocus.enter('mixer') / exit()
```

## Contrôles mobiles (faders, potards, jogs)

Le GLB ne modélise les contrôles que par un relief grossier (prismes, boîtes)
avec leur image cuite dans la texture. Au chargement (`src/controls/index.js`,
appelé juste après `buildStage`) :

1. le relief de chaque contrôle (composantes connexes dans sa zone de clic) est
   retiré du maillage de l'unité ;
2. son dessin est effacé de la texture (`src/controls/texturePatch.js`) : disque
   couleur panneau (échantillonnée autour, grain compris) sous les potards, piste
   voisine recopiée sous les capuchons des faders, du crossfader et du tempo ;
3. une pièce 3D PBR (`src/controls/geometry.js`) prend sa place, parentée à
   l'unité (suit l'intro, fondu, ombres) ; potards et faders de même forme sont
   instanciés (une poignée de draw calls pour tout le mixer).

Contrôles recréés (ids = zones de `src/config/hotspots.js`, préfixe d'unité) :

- Mixer : `crossfader` (46 mm, x), `chN_fader` (44 mm, z), `chN_input`
  (sélecteur 6 positions), `chN_trim`, `chN_eq_hi|mid|low`, `chN_color`,
  `master_level`, `balance`, `booth_monitor`, `headphones_mixing|level`,
  `fx_parameter`, `mic1|2_level`, `mic_eq_hi|low`, `send_return_level`,
  `fx_level_depth` (potards ±135°), `fx_select` (14 positions), `fx_channel`
  (8 positions), `fx_time` (rotatif sans fin).
- CDJ gauche et droit : `tempo` (104 mm, z), `jog` (plateau, l'écran central
  reste fixe), `browse` (rotatif sans fin, appui = clic), `jog_adjust`,
  `vinyl_speed_adjust` (potards).

Souris / doigt (`src/input/controlDrag.js`) :

- glisser sur un fader / le crossfader / le tempo : le capuchon suit le pointeur
  le long de sa fente ; sur un potard : vers le haut ou la droite = sens horaire
  (220 px pour toute la course ; un sélecteur saute de position en position) ;
  sur le jog : le plateau tourne avec le pointeur autour de son centre ;
- molette sur un jog : le fait tourner (un geste de molette commencé ailleurs
  reste un zoom ; le pincement trackpad zoome toujours) ;
- double clic (ou double tap) sur un contrôle : valeur par défaut (milieu pour
  EQ, trim, color, crossfader, tempo...) ;
- le glisser commence au-delà du même seuil que les clics (6 px, 10 px au
  doigt) : un clic court reste un clic de zone (`onButton`), un glisser ne l'est
  jamais ; pendant le glisser la caméra ne tourne pas (molette et focus écran
  inchangés). Rien ne bouge pendant l'intro ni en focus écran ; rien ne bouge
  seul.

État : `src/controls/state.js`, persistant dans `localStorage`
(`acurlaz.controls.v1`, sans effet si le stockage est indisponible), sauf ce qui
pourrait rendre le site muet ou faux à la visite suivante : sélecteurs d'entrée
`chN_input`, TRIM, faders de voie, MASTER LEVEL, crossfader (avec l'affectation
A / B par défaut, une butée coupe une platine) et faders de tempo des CDJ ne sont
jamais enregistrés (une ancienne valeur enregistrée est ignorée : valeur par
défaut à chaque visite ; `TRANSIENT` dans `src/controls/index.js`). EQ, COLOR,
potards d'effet et le reste sont gardés, sauf un état encore muet (les trois EQ
d'une voie en coupure totale, ou COLOR en passe-bas sous ~170 Hz : remis au
neutre au chargement). Contrat détaillé en tête du fichier ; pour brancher l'audio :

```js
const { store } = controls;            // window.__intro.controls en dev
store.get('mixer_ch1_fader');          // 0..1 (0 = bas, 1 = haut)
store.set('mixer_crossfader', 0.5);    // la pièce 3D suit
store.onChange('mixer_ch1_eq_hi', ({ value }) => {});   // 0..1, 0.5 = neutre
store.onChange('cdj_left_tempo', ({ value }) => {});    // 0..1, 0.5 = 0 %, 1 = vers le DJ (+)
store.onChange('cdj_left_jog', ({ value, delta }) => {}); // radians, sens horaire ; delta signé
store.onChange((e) => {});             // tous : { id, value, prev, delta, source }
store.def('mixer_fx_select').labels;   // positions d'un sélecteur (valeur = index)
```

Réglages : `CONTROL_DEFS` / `KNOB_STYLES` dans `src/controls/defs.js` (course,
défaut, forme, rayon effacé dans la texture). Vérifier : `/inspect.html?unit=mixer&view=top&px=3`
(`controls=0` montre le modèle d'origine).

## Mixer audio (DJM-900NXS2)

Le mixer route vraiment le son : chaque deck entre sur sa voie (`VU_MAP` dans
`src/config.js` : CDJ gauche → voie 1, CDJ droit → voie 2), puis TRIM → EQ →
COLOR → fader de voie → affectation A / THRU / B → crossfader → MASTER LEVEL →
BALANCE → limiteur → sortie. Code : `src/audio/mixer.js` (graphe Web Audio créé
une seule fois, abonné au store des contrôles, paramètres déplacés par rampes),
`src/audio/mixerButtons.js` (boutons à état, sauvegardés sous `acurlaz.mixer.v1` :
affectations, courbes, FILTER, Beat FX ON/OFF, BEAT...). Les valeurs
sauvegardées (voir « Contrôles mobiles » pour ce qui ne l'est pas) sont
appliquées avant le premier son.

- Potards / faders : TRIM (−∞ à +9 dB), EQ HI 13 kHz / MID 1 kHz / LOW 70 Hz
  (−26 à +6 dB, coupure totale en butée gauche ; mode ISOLATOR par `EQ CURVE`),
  COLOR = filtre (passe-bas à gauche, passe-haut à droite, neutre au centre ;
  PARAMETER = résonance ; bouton FILTER = actif / inactif), fader de voie
  (`CH FADER CURVE` : lente, douce par défaut, rapide), crossfader (`CROSS FADER
  CURVE` : puissance égale par défaut, rapide, cut), MASTER LEVEL (défaut −6 dB,
  max +6 dB), BALANCE, sélecteur d'entrée (DIGITAL ou LINE = la platine ; USB A/B,
  PHONO, RETURN AUX = rien de branché, silence).
- Beat FX (`FX SELECT`, `FX CHANNEL SELECT`, `LEVEL/DEPTH`, `TIME`, `BEAT < >`,
  `ON/OFF`) : DELAY, ECHO, PING PONG, REVERB, TRANS, FILTER, FLANGER, PHASER sur
  la voie 1 ou 2, le côté A ou B du crossfader, ou le master. Le temps suit le BPM
  du morceau (`deck.bpm`), `TIME` le règle à la main.
- Sans effet audio (une page web n'a qu'une sortie) : CUE de voie, MASTER CUE,
  LINK CUE, HEADPHONES LEVEL / MIXING, MONO SPLIT / STEREO, BOOTH MONITOR. Les
  boutons CUE / MONO SPLIT gardent seulement leur état. Inactifs aussi : MIC,
  SEND/RETURN, X-PAD, TAP, QUANTIZE, FX FREQUENCY, Sound Color FX autres que
  FILTER, Beat FX SPIRAL / PITCH / SLIP ROLL / ROLL / VINYL BRAKE / HELIX.
- VU : voie = après fader, EQ et filtre, avant le crossfader ; master = après
  master et limiteur (`MIXER_AUDIO.vuTap = 'preFader'` pour mesurer avant le
  fader, comme l'écrit le manuel du DJM). Aucune LED n'est dessinée pour les
  boutons à état.

```js
const m = window.__intro.mixer;        // dev
m.debug();                              // gains et fréquences en cours
m.options(); m.setOption('xf1', 'THRU'); // états des boutons
```

## Décor : club « casita » (défaut)

`src/scene/club/`, réglages `CLUB` dans `src/config.js`. La table est posée sur le
comptoir d'une cabine de DJ (bois satiné, frontal en carreaux de ciment, bandeaux
LED verts), sur une estrade face à une piste de danse vide en terre cuite laquée,
dans un bar tropical : murs de brique et plâtre vert à arches, banquettes dans les
niches, tables hautes, bar rétroéclairé dans l'arche du fond, plantes (monstera,
palmiers, bananiers, pothos suspendus, lierre), guirlandes d'ampoules, projecteurs
PAR avec faisceaux, appliques, enseigne néon sans texte. Ambiance verte et ambrée.

- **Tout est fixe** : aucune lumière, aucun faisceau, aucune guirlande ne bouge ni
  ne pulse, rien ne suit la musique. Seules la caméra et les câbles de l'intro
  changent l'image ; le décor est éclairé dès la première image.
- Éclairage du décor : les lumières de `src/scene/club/lights.js` ne sont pas des
  lumières three.js. Leur lumière diffuse est **cuite une fois au démarrage** sur
  le GPU dans un volume d'irradiance (`bake.js`, `CLUB.voxel`), lu par le shader du
  décor (`shading.js`) ; seuls les reflets des PAR sur la piste restent calculés.
  La table garde ses propres lumières (`renderer.js`, couleurs légèrement teintées
  par `CLUB.gearLights`) : écrans et commandes restent lisibles.
- Reflets : seuls les halos chauds (ampoules, lampes) se reflètent, en miroir,
  dans le vernis satiné du comptoir (sans passe de rendu supplémentaire). La piste
  reste sobre : léger satiné, aucun reflet coloré ni bande lumineuse au sol.
- Plantes : toutes dans des pots posés au sol, sur l'estrade ou suspendus au
  plafond ; rien sur le comptoir ni près de la table. Chaque feuille est testée
  (`blocked()` dans `foliage.js`) : elle n'est pas créée si elle entre dans le
  comptoir, la table, un mur hors niche, le mobilier, ou dans le volume où la
  caméra libre peut aller.
- Fichiers : `layout.js` (plan, cotes), `lights.js`, `bake.js`, `shading.js`,
  `room.js` (piste, estrade, cabine, murs, plafond), `foliage.js` (feuilles
  instanciées, atlas canvas), `props.js` (enceintes, PAR, guirlandes, LED,
  mobilier, bar), `glow.js` (halos, reflets, faisceaux, néon), `textures.js`.
- Textures CC0 (Poly Haven) dans `public/textures/club/`, crédits dans `CREDITS.md`.
- Réglages principaux : `lightGain`, `ambientSky` / `ambientGround`, brouillard
  (`fogColor`, `fogDensity`), `fadeCurve`, piste (`floorTint`, `floorSaturation`,
  `floorGloss`), murs (`brickTint`, `plasterGreen`,
  `plasterWarm`), `leafTint`, comptoir (`counterTint`, `counterSheen`,
  `counterReflection`, `counterGlow`), `emissiveGain`, `haloGain`, `beamGain`,
  `neonGain`, `vignette`, `grain`. Positions et couleurs des lumières :
  `lights.js` ; plan de la salle : `layout.js` (la caméra libre reste dans la
  salle quel que soit l'angle ou le zoom autorisé).

## Fond studio (variantes)

`src/scene/backdrop.js`, réglages `BACKDROP` dans `src/config.js` : fond sphérique
qui suit la caméra (dégradé vertical), sol laqué sombre (ombres de contact, halo
doux sous le set, micro-grain), brouillard exponentiel à la couleur de l'horizon
(le sol se fond dans le fond, sans bord ni ligne d'horizon), reflet discret des
appareils sur le sol, vignettage et grain fixe dans la passe de sortie. Tout est
statique.

- Variantes : `BACKDROP.variant = 'casita' | 'graphite' | 'warm' | 'cold'` (défaut
  `casita`, le club ci-dessus). Pour comparer sans recompiler : `?backdrop=graphite`.
- Réglages : couleurs par variante (`horizon`, `top`, `floor`, `pool`), brouillard
  (`fogDensity`), sol (`floorRoughness`, `floorSheen`, `floorGrain`), halo
  (`poolRadius`, `poolStrength`), reflet (`reflection`, `reflectionDepth`),
  `vignette`, `grain`.

## Recaler les zones, écrans, ports

Repère local d'une unité (mm) : origine au centre de l'empreinte au sol,
`x` vers la droite, `z` vers le DJ (avant), `y` vers le haut.

- Zones de clic : `src/config/hotspots.js` (id, forme, x, z, taille, `tilt`
  optionnel). Ce sont des empreintes vues de dessus : le clic lance un rayon sur
  le modèle lui-même et prend la zone qui contient le point touché, donc pas de
  hauteur à régler et pas de décalage selon l'angle ou le zoom. Zones qui se
  chevauchent : la plus petite gagne. Les CDJ partagent la même liste.
- Clic = appui + relâchement sur la même zone, moins de 6 px de mouvement
  (10 px au doigt, `src/input/pointer.js`) et moins de 800 ms ; au-delà c'est
  une rotation de caméra. Souris, stylet et tactile (pointer events).
- Écrans : `SCREEN_SPECS` dans `src/scene/screens.js`.
- Rangée de touches au-dessus des écrans : `TOP_ROW_LABELS` dans
  `src/scene/screens.js` (centre, taille, zone, texte de chaque touche ; matière et
  hauteur des capuchons 3D ; police). Les zones `source` … `menu` de
  `src/config/hotspots.js` sont calées sur ces capuchons.
- Caches VU : `COLUMNS` dans `src/scene/vu.js`. VU animés par l'audio réel
  (`src/audio/levels.js`) ; voie ↔ deck et échelle dB : `VU_MAP` dans `src/config.js`.
- Ports arrière / câbles : `src/config/ports.js` (x, y sur la face arrière ;
  la profondeur est trouvée par raycast).
- Page d'inspection orthographique avec grille millimétrée :
  `/inspect.html?unit=mixer&view=top&px=3`, options `rect=`, `zones=1`,
  `view=back|front|left|right|probe|parts|raw`.

## API pour la suite

```js
// écrans (CanvasTexture). Les écrans CDJ sont dessinés par src/screens/router.js :
// pour changer leur contenu, modifier une page de src/screens/pages/.
screens.cdjLeft.draw((ctx, w, h) => { /* dessin libre */ });
screens.cdjLeft.setContent({ title, right, waveform, position, footer });
screens.cdjLeft.setVideo(videoElement);
// surface tactile (écran en focus), coordonnées en px du canvas (1024×597)
screens.cdjLeft.onPointer(({ type, unit, x, y, nx, ny, dragging, dx, dy, region }) => {});
const off = screens.cdjLeft.addHitRegion({ id: 'menu-1', x: 40, y: 120, w: 300, h: 60,
  onTap: (e) => {}, onHover: (over) => {} });   // removeHitRegion('menu-1') ou off()
screens.cdjLeft.addLayer('menu', (ctx, w, h) => {}); // calque au-dessus du contenu
screens.cdjLeft.invalidate();                      // redessin à la demande
// touches au-dessus de l'écran (capuchons 3D) : texte, ou null pour revenir à la touche cuite
screens.setTopLabel('cdj_left', 2, 'Dates'); // ('mixer', 0, …) : la touche ÉCHAP de l'écran CRÉDITS
// VU du mixer, de bas en haut (jaune-vert, orange, rouge), pilotés par l'audio
vu.setLevel('ch1', 0.6);   // ch1..ch4, masterL, masterR
vu.setSegments('ch1', 7);  // 0..15 segments allumés
// boutons : callback onButton({ id, unit, label }) dans src/main.js ; pour la
// rangée au-dessus de l'écran, label = texte imprimé ('Sources', 'Link',
// 'Dates', 'Feat', 'À propos', 'Échap'), libellé d'origine dans bakedLabel
```

Crédit du modèle : voir `CREDITS.md`.

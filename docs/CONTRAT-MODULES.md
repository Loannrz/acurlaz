# Contrat entre modules (agents en parallèle)

Référence visuelle et chorégraphie : docs/DA.md (section 13 fait foi). Modèle 3D : docs/CDJ-MODEL.md. Contenu : src/data/content.js. Bus : src/core/bus.js.

## Propriété des fichiers (ne touche que les tiens)
- CDJ + audio : src/scene/cdj/**, src/audio/**
- Scène, caméra, scroll : src/scene/stage.js, src/scene/world/**, src/scroll/**
- Interface HTML/CSS : index.html (corps de page uniquement), src/ui/**, src/styles/typography.css, layout.css, components.css (tokens.css et base.css sont figés ; ajout dans base.css interdit)
- Logo : public/img/acurlaz-logo.svg
- src/main.js : propriété de l'orchestrateur. Chaque module exporte seulement une fonction d'init.

## API exportées
- `src/audio/player.js` : `export const player = { select(trackId), toggle(), play(), pause(), get state() }` ; émet `player:state` sur le bus (changement + ~10 fois/s pendant la lecture). `player.init(tracks)` reçoit `content.tracks`. Un seul morceau à la fois.
- `src/scene/cdj/index.js` : `export async function createCdj({ renderer }) → { root: THREE.Group (normalisé selon DA 13.6, centré à l'origine, échelle en mètres), jog, setPlaying(bool), setScreen({title, artist, time, duration, bpm, key}), onPlayPress(cb), pickables: Object3D[], update(dt), dispose() }`.
  Le bouton Play 3D est cliquable (raycast dans stage). Le jog tourne à DA.jog.rpm pendant la lecture, avec montée/frein.
- `src/scene/stage.js` : `export async function initScene({ canvas, tracks })` : crée renderer, lumières, monde, CDJ, timeline maîtresse liée au scroll (Lenis + ScrollTrigger), suivi du pointeur ; émet `scene:ready` et `scroll:progress`.
- `src/ui/index.js` : `export function initUI({ content })` : injecte le DOM des sections dans #app (backdrop, main, nav, rail, lecteur, footer), anime les entrées de contenu, gère focus/clavier. Les clics sur les pistes appellent `player.select` puis `player.play`.

## Règles communes
- Aucun hex hors tokens.css / DA.color ; pas de box-shadow, blur, dégradé, rayon autre que --radius-0/--radius-round (DA 13.9).
- Mouvement réduit, mobile < 900 px : suivre DA 10.
- Pas de nouvelle dépendance npm sans la nommer dans le compte rendu. Pas de git.
- `npm run build` doit rester vert. Tests visuels : lance `npx vite --port <port libre>` en arrière-plan et pilote Chrome (outils claude-in-chrome) ou Chrome headless ; arrête ton serveur ensuite.

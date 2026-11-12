# API de contenu d'acurlaz

Un Cloudflare Worker et un espace KV. Le site reste sur GitHub Pages et lit son contenu éditable (dates, artistes, bio, contact) dans cette API au chargement. La régie (`/admin/`) y écrit après connexion. Un enregistrement paraît sur le site sans reconstruction ni redéploiement.

Les morceaux, les formes d'onde et les crédits ne passent pas par l'API : ils restent dans `src/data/content.js`.

## Mise en ligne

À faire une fois, dans cet ordre. Les commandes se lancent depuis le dossier `worker/`.

### A. Déployer et éprouver le Worker

1. Compte Cloudflare (offre gratuite) : <https://dash.cloudflare.com/sign-up>. Activer la double authentification.

2. Outils et connexion :

   ```sh
   cd worker
   npm install
   npx wrangler login
   ```

3. Espace de stockage. Il est déjà créé : son `id` figure dans `wrangler.toml`. Pour mémoire, la commande était `npx wrangler kv namespace create CONTENT_KV`.

4. Déployer :

   ```sh
   npx wrangler deploy
   ```

   Au premier déploiement, Wrangler demande de choisir un sous-domaine `workers.dev`, puis affiche l'adresse du Worker : `https://acurlaz-api.<sous-domaine>.workers.dev`. La noter.

5. Poser le secret du Worker :

   ```sh
   openssl rand -base64 48
   npx wrangler secret put AUTH_SECRET
   ```

   Coller la valeur produite par `openssl` quand Wrangler la demande.

6. Éprouver le temps de calcul, tout de suite. L'offre gratuite accorde 10 ms de calcul par requête, et la vérification d'un mot de passe (PBKDF2, 100 000 itérations) peut les dépasser. `wrangler dev` n'applique pas cette limite : seul le Worker déployé permet de le savoir. Cet appel lance le même calcul qu'une vraie connexion, sans rien exiger :

   ```sh
   curl -i -X POST https://acurlaz-api.<sous-domaine>.workers.dev/admin/login \
     -H 'Origin: https://loannrz.github.io' \
     -H 'Content-Type: application/json' \
     -d '{"password":"essai"}'
   ```

   Le lancer trois fois, à quelques secondes d'intervalle.

   - Réponse attendue : `503` et `{"error":"not_initialized", …}`. Le calcul tient dans le budget. Continuer.
   - Réponse `error code: 1102` (page Cloudflare « Worker exceeded resource limits ») : le calcul dépasse le budget. Ne pas aller plus loin. Deux issues :
     - passer le Worker à l'offre payante (Workers Paid), qui lève la limite et garde les 100 000 itérations ;
     - ou baisser `PBKDF2_ITERATIONS` dans `wrangler.toml` (plancher : 50 000), relancer `npx wrangler deploy`, puis refaire ce test. À ce stade rien n'est encore amorcé : aucune remise à zéro n'est nécessaire.

   Vérifier aussi la lecture publique :

   ```sh
   curl https://acurlaz-api.<sous-domaine>.workers.dev/content
   ```

   Réponse attendue : `{"v":1,"content":{},"updatedAt":null}`.

### B. Brancher le site

7. Sur GitHub, dans le dépôt : Settings, Secrets and variables, Actions, onglet Variables, New repository variable.

   - Nom : `VITE_API_URL`
   - Valeur : l'adresse du Worker, sans barre finale

   Le workflow `.github/workflows/pages.yml` la lit.

8. Reconstruire le site : pousser sur `main`, ou relancer le workflow « Déploiement GitHub Pages » depuis l'onglet Actions. Attendre la fin, puis ouvrir <https://loannrz.github.io/acurlaz/admin/> : l'écran de connexion doit s'afficher.

### C. Ouvrir l'accès, d'une traite

Le mot de passe initial est faible. Il n'existe donc que le temps de ces quatre gestes, à faire à la suite, sans pause. Il ne vaut que **15 minutes** à compter de sa première utilisation.

9. Poser le mot de passe initial :

   ```sh
   npx wrangler secret put INITIAL_PASSWORD
   ```

10. Dans la régie, entrer ce mot de passe. La régie s'ouvre en lecture : elle ne publie rien tant qu'il est en service. Si la connexion renvoie l'erreur 1102, revenir à l'étape 6.

11. Page « sécurité » : choisir le vrai mot de passe (dix caractères au moins).

12. Retirer le mot de passe initial du Worker :

    ```sh
    npx wrangler secret delete INITIAL_PASSWORD
    ```

    Sans ce secret, le Worker ne peut plus revenir au mot de passe initial, quoi qu'il lise dans KV.

Si les 15 minutes passent avant l'étape 11, la régie répond « Le mot de passe initial a expiré » : suivre « Mot de passe perdu », plus bas.

## En local

```sh
cd worker
cp .dev.vars.example .dev.vars      # puis remplir AUTH_SECRET et INITIAL_PASSWORD
npx wrangler dev                    # API sur http://localhost:8787, KV simulé sur le disque
```

`.dev.vars.example` ne marche pas tel quel : le Worker refuse un secret de moins de 32 caractères et un mot de passe initial vide.

Dans un autre terminal, à la racine du projet :

```sh
echo "VITE_API_URL=http://localhost:8787" > .env.development.local
npm run dev                         # régie sur http://localhost:5173/admin/
```

`.dev.vars` et `.env.development.local` sont ignorés par git.

La règle des 15 minutes vaut aussi en local. Pour repartir de zéro : `npx wrangler kv key delete auth --binding CONTENT_KV --local`.

Tests de l'API :

```sh
npm test                            # le Worker tourne dans Node, KV simulé en mémoire
```

Le KV simulé reproduit la limite de Cloudflare : une écriture par seconde et par clé. Contre le moteur de Cloudflare (workerd), sur un état vierge :

```sh
npx wrangler dev --persist-to /tmp/acurlaz-kv-test
TEST_PASSWORD="<mot de passe initial de .dev.vars>" npm run test:http
```

## Ce que fait le Worker

| Sujet | Choix |
|---|---|
| Mot de passe | PBKDF2-HMAC-SHA256, 100 000 itérations, sel aléatoire de 16 octets par mot de passe. Avant PBKDF2, le mot de passe passe par un HMAC dont la clé dérive de `AUTH_SECRET` : une copie de KV ne suffit pas pour tester des mots de passe hors ligne. Comparaison à temps constant. KV ne contient aucun mot de passe en clair. Longueur mesurée de la même façon partout : dix caractères au moins, 256 octets au plus, après normalisation Unicode. |
| Mot de passe initial | KV ne contient d'abord aucune empreinte. La première connexion qui présente `INITIAL_PASSWORD` l'amorce : le Worker écrit son empreinte et la marque « à changer ». À partir de là il vaut 15 minutes. Passé ce délai, le Worker refuse la connexion quel que soit le mot de passe présenté, et ferme les sessions qu'il avait ouvertes. Le changement de mot de passe reste donc possible depuis une session initiale, mais seulement dans ces 15 minutes. Pendant ce temps la régie lit sans pouvoir publier. |
| Session | Jeton aléatoire de 256 bits, valable 2 heures (15 minutes au plus avec le mot de passe initial). KV n'en garde que le HMAC. Le jeton voyage dans l'en-tête `Authorization` et vit dans le `sessionStorage` de l'onglet. |
| Pourquoi pas un cookie | Le site (`github.io`) et l'API (`workers.dev`) sont deux sites distincts. Un cookie serait un cookie tiers : Safari le bloque, Firefox le cloisonne. Un jeton en en-tête marche partout, et le navigateur ne l'envoie jamais de lui-même. |
| CSRF | Découle du choix précédent : sans cookie, un autre site ne peut pas faire partir une requête authentifiée. S'y ajoutent le contrôle de l'en-tête `Origin` sur toutes les routes de la régie et l'obligation d'un corps `application/json`. |
| CORS | Liste exacte d'origines (`ALLOWED_ORIGINS`), jamais `*`, sans `credentials`. `localhost` n'est admis qu'en local, par `.dev.vars`. |
| Tentatives | Compteur par adresse IP (par bloc /64 en IPv6), tenu dans KV : cinq échecs, puis blocage d'une minute, doublé à chaque échec suivant, jusqu'à douze heures. Il n'est écrit qu'après un échec ; une connexion réussie ne l'écrit pas. Deux garde-fous contre les rafales : une seule tentative à la fois par adresse dans une même instance du Worker (isolat), et dix par minute et par adresse dans un même centre Cloudflare (limiteur Cloudflare). Entre isolats ou entre centres, ces garde-fous ne se coordonnent pas. Le Worker ne stocke que l'empreinte des adresses. |
| Réponses d'échec | Un mot de passe refusé répond au bout de 1,2 s au moins : « Connexion refusée. » (401) à la connexion, quelle que soit la cause ; « Mot de passe actuel refusé. » (403) au changement de mot de passe. Les refus de la limitation (429) répondent tout de suite, avec le délai à attendre. Deux états répondent tout de suite aussi, sans rien dire du mot de passe présenté : mot de passe initial expiré (403) et Worker non amorcé (503). |
| Changement de mot de passe | Session valide et ancien mot de passe exigés. Dix caractères au moins, pas de suite évidente. Toutes les autres sessions tombent. |
| Écritures de contenu | Session exigée. Schéma strict par section (`src/schema.js`) : types, longueurs, dates réelles, adresses en `https` uniquement, signes `<` et `>` refusés, tout champ inconnu refusé. Corps limité à 128 Ko. Révision vérifiée avant d'écrire. |
| Lecture publique | `GET /content` uniquement. Une clé agrégée (`content:public`), tenue à jour à chaque enregistrement : une visite coûte une lecture KV. Le navigateur garde la réponse une minute (`Cache-Control: public, max-age=60`). Le site revalide ce qu'il reçoit avec le même schéma, échappe tout à l'affichage, et garde le contenu du code si une section est absente ou invalide. |
| Limite d'écriture de KV | KV refuse deux écritures par seconde sur une même clé, suppression comprise. Le Worker retente une fois, après une seconde, les écritures indispensables (empreinte, session, contenu) ; si KV refuse encore, il répond 503 « réessayer ». Les écritures accessoires (compteur, journal de connexion) sont abandonnées sans faire échouer la requête. |
| Journaux | Événements de connexion et d'enregistrement, avec une empreinte tronquée de l'adresse. Ni mot de passe, ni jeton. `npx wrangler tail` les affiche en direct. |

Variables de `wrangler.toml` : `ALLOWED_ORIGINS`, `PBKDF2_ITERATIONS`, `SESSION_TTL_SECONDS`, `REQUIRE_PASSWORD_CHANGE`.

Clés KV : `auth`, `floor`, `audit`, `content:dates`, `content:collaborators`, `content:bio`, `content:contact`, `content:public`, `sess:…`, `rl:…`.

## Opérations

**Mot de passe perdu, ou mot de passe initial expiré.** C'est la seule remise à zéro, et elle passe par le compte Cloudflare. Reposer un mot de passe initial, puis effacer l'empreinte :

```sh
npx wrangler secret put INITIAL_PASSWORD
npx wrangler kv key delete auth --binding CONTENT_KV --remote
```

Puis refaire les étapes 10 à 12, d'une traite. Toutes les sessions ouvertes tombent.

**Sauvegarder une section avant une grosse modification.** KV ne garde pas d'historique. Les sections sont `dates`, `collaborators`, `bio` et `contact`.

```sh
npx wrangler kv key get content:dates --binding CONTENT_KV --remote > dates.json
```

Pour la restaurer, remettre la section puis effacer la vue publique :

```sh
npx wrangler kv key put content:dates --path dates.json --binding CONTENT_KV --remote
npx wrangler kv key delete content:public --binding CONTENT_KV --remote
```

Ouvrir ensuite la régie : elle reconstruit la vue publique. Dans l'intervalle, le site affiche le contenu du code.

**Revenir au contenu du code pour une section.** Même geste : supprimer `content:<section>` et `content:public`, puis ouvrir la régie.

**Changer de domaine.** Mettre la nouvelle origine dans `ALLOWED_ORIGINS` (`wrangler.toml`), puis `npx wrangler deploy`.

**Changer `AUTH_SECRET`.** L'empreinte du mot de passe en dépend : après un changement de secret, suivre « Mot de passe perdu ».

## Risques qui restent

1. **Le mot de passe initial est faible pendant qu'il existe.** L'adresse de l'API se lit dans le code du site. Entre l'étape 9 et l'étape 11, celui qui devine le mot de passe initial peut entrer et le changer lui-même. Les 15 minutes bornent cette fenêtre, sans la fermer. Signe : la connexion ou le changement échoue à l'étape 10 ou 11. Remède : « Mot de passe perdu ».
2. **KV n'est pas une base cohérente.** Une écriture met jusqu'à 60 secondes à paraître dans les autres centres Cloudflare, et il n'y a pas de transaction. Conséquences pour l'authentification :
   - Pendant la minute qui suit un changement de mot de passe ou un « tout fermer », une session ancienne peut encore être acceptée ailleurs, et quelqu'un qui connaît l'ancien mot de passe et tient une session ouverte peut poser le sien. Signe : une déconnexion inattendue. Remède : « Mot de passe perdu ».
   - Tant que le secret `INITIAL_PASSWORD` existe, un centre qui croit encore l'empreinte absente peut réamorcer le mot de passe initial si quelqu'un le lui présente. L'étape 12 ferme ce cas.
   - Fermer ces fenêtres pour de bon demande de déplacer l'authentification dans un Durable Object (cohérence forte, disponible en offre gratuite).
3. **Un enregistrement met jusqu'à une minute à paraître partout**, pour la même raison, plus la minute de cache du navigateur. Depuis l'endroit où il a été fait, il paraît le plus souvent dans la seconde. Le contrôle de révision souffre de la même limite : voir M7 plus bas.
4. **L'origine `https://loannrz.github.io` est partagée** par tous les sites GitHub Pages du compte. Un script publié sous un autre dépôt du compte pourrait lire le jeton de session si la régie a été ouverte dans le même onglet. Ne rien publier d'incertain sous ce compte, ou passer le site sur un domaine propre.
5. **PBKDF2 est plafonné à 100 000 itérations par Workers**, sous la recommandation actuelle de l'OWASP (600 000). Le HMAC à clé secrète, la limitation des tentatives et les dix caractères exigés compensent.
6. **Offre gratuite, temps de calcul.** Voir l'étape 6. Cloudflare tolère des dépassements occasionnels : un test réussi trois fois ne garantit pas toutes les connexions. Si une connexion échoue un jour avec l'erreur 1102, réessayer, puis appliquer l'une des deux issues de l'étape 6. Après une baisse de `PBKDF2_ITERATIONS`, l'empreinte existante garde son ancien réglage jusqu'au prochain changement de mot de passe : si la connexion elle-même échoue, suivre « Mot de passe perdu ».
7. **Offre gratuite, quotas.** 100 000 requêtes et 1 000 écritures KV par jour. Chaque mot de passe refusé coûte une écriture. Un tiers qui dispose de nombreuses adresses peut épuiser le quota : la régie ne peut alors plus se connecter ni enregistrer jusqu'à minuit UTC. Le site public continue de s'afficher.
8. **La limitation des tentatives est tenue par adresse**, et ses garde-fous de rafale ne valent que par isolat et par centre. Un attaquant réparti sur beaucoup d'adresses n'est freiné que par le quota ci-dessus. Un mot de passe de dix caractères ou plus reste hors de portée. À l'inverse, cinq échecs d'un inconnu sur un réseau partagé (wifi public, opérateur mobile) bloquent aussi la régie depuis ce réseau : en changer suffit.
9. **Si l'API ne répond pas**, un visiteur déjà venu revoit le dernier contenu publié. Un nouveau visiteur voit le contenu de `src/data/content.js` : y reporter de temps en temps le contenu réel.
10. **Un seul mot de passe, pas de second facteur.** Qui tient le compte Cloudflare ou le compte GitHub tient aussi le site : activer la double authentification sur les deux.

## Points de revue laissés ouverts

- **M6. Double amorçage.** Deux premières connexions simultanées avec le mot de passe initial amorcent deux fois. La seconde ferme la session de la première, qui voit « Session expirée » juste après être entrée. Se reconnecter suffit.
- **M7. Contrôle de révision non atomique.** Le Worker lit la révision puis écrit, sans transaction, et la lecture peut dater d'une minute. Deux onglets qui passent par deux centres Cloudflare peuvent s'écraser sans que l'un reçoive l'erreur de conflit. Acceptable pour un seul éditeur.
- **M9. Extensions de domaine internationalisées.** La validation des adresses (`src/schema.js`) refuse les extensions en `xn--…`. Cas rare.

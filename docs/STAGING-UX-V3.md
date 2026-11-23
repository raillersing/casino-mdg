# CasinoMDG — Staging isolé (préparation et recette v3)

> Statut au 23 novembre 2026 : automatisation du bootstrap et du préflight ajoutée ; **aucun déploiement distant confirmé**. La recette réelle #57 reste ouverte. Ne pas considérer un test simulé comme une partie réussie entre joueurs humains.

## Architecture et garanties d'isolation

- Compose dédié `docker-compose.staging.yml` avec nom de projet `casino-mdg-staging`. **Ne pas** le combiner avec `docker-compose.prod.yml`.
- Aucun `container_name` global, aucun réseau ou volume de production partagé.
- PostgreSQL, Redis, RabbitMQ, backend et moteur de jeu accessibles uniquement sur le réseau Docker du staging. Un seul port hôte est ouvert, **sur 127.0.0.1** : `STAGING_PORT` (18081 par défaut).
- Aucun identifiant de paiement ni données de production dans le staging ; n'utiliser que des comptes de test et de faux montants. Les services Celery sont optionnels (profil `background`) afin de limiter tout effet non souhaité.
- **OTP** : staging avec `DEBUG=False`. Sans passerelle SMS, des codes peuvent être envoyés par **email** si un véritable serveur SMTP de staging est configuré (`STAGING_EMAIL_OTP_ENABLED=True`, hôte, TLS, expéditeur, identifiants). Sinon, l’API renvoie HTTP 503 sans code divulgué. Les comptes historiques sans email vérifié doivent d’abord l’associer depuis une session authentifiée ; les nouvelles inscriptions par email ne prouvent pas la possession du téléphone. Voir `docs/EMAIL-OTP-FALLBACK.md`. Aucun argent réel ni contournement OTP.
- Le fichier `.env.staging` est ignoré par Git. Ne jamais injecter de secrets dans le dépôt ou dans les logs.

## Préparer et lancer sur un serveur possédant Docker Compose

Depuis un **checkout staging séparé**, sur le VPS (compte avec accès GitHub et Docker) :

```bash
# À exécuter une seule fois sur le VPS. Ne pas toucher au dossier de production.
sudo install -d -m 0750 -o "$USER" -g "$(id -gn)" /opt/casino-mdg-staging
git clone https://github.com/raillersing/casino-mdg.git /opt/casino-mdg-staging
cd /opt/casino-mdg-staging
python3 scripts/staging_environment.py init
python3 scripts/staging_environment.py check --env-file .env.staging
bash scripts/staging-up.sh
bash scripts/staging-smoke.sh
docker compose --project-name casino-mdg-staging --env-file .env.staging \
  -f docker-compose.staging.yml ps
```

La commande `init` exige un checkout dont le répertoire porte `staging` et refuse un fichier `.env.production`. Elle génère **sept secrets indépendants** sans les afficher, écrit `.env.staging` avec les permissions `0600`, et ne remplace jamais un fichier existant. Le préflight refuse les secrets insuffisants ou partagés, les origines de production, les ports sensibles, les noms DB non isolés et les activations d'argent réel. `staging-up.sh` impose ce contrôle **avant** tout démarrage Docker.

Si le checkout existe déjà, **ne pas le recloner** et ne pas régénérer les secrets. Mettre à jour le code Git de ce checkout et lancer `python3 scripts/staging_environment.py check --env-file .env.staging`, suivi des scripts de démarrage et de smoke test. Aucun secret staging ne doit être copié dans GitHub ni depuis une production existante.

Pour tester les OTP email, renseigner uniquement dans le fichier local `.env.staging` les paramètres de votre serveur SMTP de test, puis activer `STAGING_EMAIL_OTP_ENABLED=True`. Le préflight vérifie la présence de ces paramètres mais ne constitue pas un test de réception réel. Les migrations n'opèrent que sur le volume PostgreSQL propre au projet Compose staging.

**Accès depuis un ordinateur** : créer un tunnel SSH local, puis ouvrir `http://127.0.0.1:18081` dans le navigateur.

```bash
ssh -L 18081:127.0.0.1:18081 <utilisateur>@<serveur-staging>
```

Si un domaine de staging est nécessaire, le publier **uniquement** avec un reverse proxy/tunnel authentifié et une politique d'accès explicite ; renseigner son origine et hôte dans `STAGING_ORIGIN` et `STAGING_ALLOWED_HOSTS`. Ne pas exposer le port staging publiquement et ne pas copier les données ou tokens de production.

## Arrêt et nettoyage

```bash
docker compose --project-name casino-mdg-staging --env-file .env.staging \
  -f docker-compose.staging.yml down
```

`down` conserve les volumes isolés. **Ne jamais utiliser `down -v` sans sauvegarde** : cela détruirait la base de test. Ne pas exécuter ces commandes dans le projet Compose de production.

## Recette automatisable sur **vrai** staging (API + moteur)

Le fichier `scripts/staging-live-acceptance.mjs` effectue des opérations **réelles** et **mutantes**, exclusivement sur une instance de staging isolée : création de tables gratuites, admissions avec plusieurs comptes, connexion WebSocket au moteur, réception d'un véritable état de jeu et vérification de l'accès privé. Il quitte les tables qu'il a créées à la fin, même en cas d'erreur (nettoyage best-effort). Aucun paiement, aucune mise positive et aucun compte de production ne doivent être utilisés.

**Prérequis :** staging lancé sur le serveur, tunnel SSH local ouvert, Node.js 22+, **quatre comptes de test distincts** et leurs JWT d'accès de staging. La Belote réclame quatre joueurs selon `/api/v1/games/table-capabilities/`, contrairement aux autres jeux qui acceptent au moins deux joueurs. Les comptes doivent être préparés sur le staging, par la passerelle SMS de test, un SMTP de test ou un provisionnement contrôlé ; ne jamais contourner l'OTP de production.

Exemple d'utilisation depuis le poste client avec le tunnel SSH vers `127.0.0.1:18081` :

```bash
# Lire les JWT depuis une source sûre, sans les écrire dans Git, les URLs
# ou les arguments de commande visibles dans l'historique.
read -rsp 'JWT staging compte 1: ' STAGING_TOKEN_1; echo
read -rsp 'JWT staging compte 2: ' STAGING_TOKEN_2; echo
read -rsp 'JWT staging compte 3: ' STAGING_TOKEN_3; echo
read -rsp 'JWT staging compte 4: ' STAGING_TOKEN_4; echo
export STAGING_TOKEN_1 STAGING_TOKEN_2 STAGING_TOKEN_3 STAGING_TOKEN_4
STAGING_BASE_URL=http://127.0.0.1:18081 \
STAGING_ACCEPTANCE_CONFIRM=yes-create-free-test-tables \
  node scripts/staging-live-acceptance.mjs
unset STAGING_TOKEN_1 STAGING_TOKEN_2 STAGING_TOKEN_3 STAGING_TOKEN_4
```

Le programme **refuse** toute URL qui n'est pas un hôte loopback avec port explicite non standard. Il exige une réponse `/__staging__/identity` valant `{"environment":"staging","application":"casino-mdg"}` **avant toute écriture**, fournie exclusivement par `frontend/nginx.staging.conf` monté dans la stack de staging.

**Ce qu'il valide :** les contrats de format annoncés par l'API pour les cinq jeux, les places uniques, les tokens d'admission serveur, un état reçu sur chaque socket du moteur, l'absence de visibilité d'une table privée et le refus d'entrée sans code. Les résultats ne contiennent pas de tokens ou de codes privés. Le programme ne valide **ni une partie terminée, ni un tour effectivement joué, ni le matchmaking de file d'attente, ni les flux financiers, ni l'UX mobile/FR/MG**. En cas de crash ou d'interruption, vérifier et supprimer manuellement les tables de test restantes.

Les tests CI `node --test scripts/staging-live-acceptance.test.mjs` **n'exécutent pas** ce parcours réel : ils vérifient uniquement les garde-fous du programme sans accéder à une application distante ni à des secrets. Les tests Django `test_five_game_acceptance_contracts.py` valident la cohérence de l'API en base de test locale, pas la connexion à un moteur distant.

## Protocole de recette réelle — Issue #57

Préparer **deux comptes de test distincts**, deux navigateurs/profils séparés, et des jeux sans mise financière réelle. Pour chacun des cinq jeux (Belote, Domino, Ludo, Rami, Poker) :

1. Depuis l'accueil : choisir le jeu, lancer la recherche, constater deux tickets de joueurs, attendre la confirmation de table et d'admission.
2. Vérifier que le moteur WebSocket accueille les deux identités, que les deux plateaux représentent la même session et qu'un vrai premier tour peut commencer ; poursuivre jusqu'au résultat si le format le permet.
3. Créer une table publique avec A, rejoindre avec B et vérifier que la salle d'attente représente séparément les sièges réservés et les connexions confirmées.
4. Créer une table privée, vérifier que B ne peut pas y entrer sans autorisation et que les codes d'invitation ne sont pas divulgués par une simple liste de club.
5. Répéter avec table pleine, annulation pendant le matchmaking, double clic, reload, expiration, coupure réseau/reconnexion et reprise de session.
6. Vérifier FR/MG et les largeurs mobiles 320/360/390/430 px, navigation clavier, focus et lecteurs d'écran ; conserver des captures et les sorties de tests.
7. Vérifier séparément tous les flux MGA et règles Poker/non-Poker avec des professionnels compétents avant activation de fonctions financières réelles.

Pour chaque scénario : consigner date, commit exact, compte(s) de test, jeu, format, état attendu/observé, logs du backend et du moteur, résultat PASS/FAIL. Ne fermer #57 qu'après preuve et revue.

## Limites

- Le smoke test couvre le chargement du frontend et la réponse du backend via Nginx, pas l'authentification, le moteur, les paiements ni le jeu multijoueur.
- Les GitHub Actions valident seulement la syntaxe de la configuration de staging ; le déploiement nécessite un serveur Docker et des secrets de staging distincts.
- Le workflow de release `.github/workflows/release.yml` reste basé sur les tags `v*`. Il n'est pas appelé par ces scripts.

## Prochaine étape de mise en ligne

Une fois la recette validée, documenter le plan GO/NO-GO (sauvegarde, version des images, migrations, tests de santé, rollback), puis faire approuver explicitement l'opération de production.


## Déploiement GitHub Actions contrôlé (à configurer par l'exploitant)

Le workflow `.github/workflows/deploy-staging.yml` remplace l'ancien job fictif. Il ne part **jamais automatiquement** : sur GitHub Actions, choisir « Deploy isolated staging (manual) », branche `master`, puis cocher `confirm_isolated_staging`. Le workflow refuse le déploiement tant qu'aucune CI *push master* réussie n'existe pour le commit exact. Il utilise l'environnement protégé `staging` (activer une approbation humaine si nécessaire).

Configurer ces **secrets dans l'environnement GitHub `staging`** :

- `STAGING_SSH_HOST` : adresse DNS/IP du VPS de staging ;
- `STAGING_SSH_USER` : compte SSH dédié avec droits Docker limités ;
- `STAGING_SSH_PRIVATE_KEY` : clé SSH privée de déploiement, limitée au staging ;
- `STAGING_SSH_KNOWN_HOSTS` : ligne(s) de clé d'hôte SSH **vérifiées hors bande** ; ne pas désactiver la vérification de l'hôte ;
- `STAGING_DEPLOY_DIR` : dossier de checkout indépendant, contenant `staging` dans son chemin, par ex. `/opt/casino-mdg-staging`.

Sur le VPS, préparer **à l'avance** ce checkout séparé du code de production, l'accès GitHub `origin`, `docker compose`, `curl`, `python3` et le fichier `.env.staging` (secrets forts, services réels ou faux comptes de test, aucun secret de production). La clé Git de lecture sur le VPS est distincte de la clé SSH de déploiement. Le workflow refuse la présence de `.env.production` dans le dossier staging, les modifications Git suivies, les commits qui ne correspondent plus à `origin/master` et toute erreur de démarrage ou de smoke test.

Le workflow checkout le commit vérifié, démarre uniquement `docker-compose.staging.yml` et exige les checks de santé avant de déclarer l'opération réussie. **Sa présence ne prouve pas qu'un VPS a déjà été déployé.** Les tests de parties réelles restent une recette manuelle distincte (issue #57).

Voir aussi `docs/ENGINE-SESSION-REVOCATION.md` pour les scénarios de sécurité des sessions WebSocket.

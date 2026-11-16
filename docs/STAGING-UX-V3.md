# CasinoMDG — Staging isolé (préparation et recette v3)

> Statut au 16 novembre 2026 : configuration et scripts fournis, **aucun déploiement distant confirmé**. La recette réelle #57 reste ouverte. Ne pas considérer un test simulé comme une partie réussie entre joueurs humains.

## Architecture et garanties d'isolation

- Compose dédié `docker-compose.staging.yml` avec nom de projet `casino-mdg-staging`. **Ne pas** le combiner avec `docker-compose.prod.yml`.
- Aucun `container_name` global, aucun réseau ou volume de production partagé.
- PostgreSQL, Redis, RabbitMQ, backend et moteur de jeu accessibles uniquement sur le réseau Docker du staging. Un seul port hôte est ouvert, **sur 127.0.0.1** : `STAGING_PORT` (18081 par défaut).
- Aucun identifiant de paiement ni données de production dans le staging ; n'utiliser que des comptes de test et de faux montants. Les services Celery sont optionnels (profil `background`) afin de limiter tout effet non souhaité.
- **OTP** : le staging tourne avec `DEBUG=False`. Si le fournisseur SMS est absent ou en panne, l'API renvoie HTTP 503 sans révéler de code. Pour créer deux comptes de test par téléphone, connecter uniquement une passerelle SMS de test via `STAGING_SMS_GATEWAY_URL` et `STAGING_SMS_GATEWAY_API_KEY`, ou provisionner les comptes de manière contrôlée et isolée. Aucun contournement de code OTP n'est autorisé en production.
- Le fichier `.env.staging` est ignoré par Git. Ne jamais injecter de secrets dans le dépôt ou dans les logs.

## Préparer et lancer sur un serveur possédant Docker Compose

Depuis un checkout à jour de la branche / version choisie :

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
# Modifier .env.staging, remplacer TOUS les CHANGE_ME
# Générer un secret différent pour chaque variable : openssl rand -hex 32
bash scripts/staging-up.sh
bash scripts/staging-smoke.sh
docker compose --project-name casino-mdg-staging --env-file .env.staging \
  -f docker-compose.staging.yml ps
```

Le script `staging-up.sh` rejette les placeholders `CHANGE_ME` et vérifie la configuration Compose avant de créer les services. Les migrations ne s'appliquent qu'à la base `staging-postgres` propre au projet de staging.

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

**Prérequis :** staging lancé sur le serveur, tunnel SSH local ouvert, Node.js 22+, **quatre comptes de test distincts** et leurs JWT d'accès de staging. La Belote réclame quatre joueurs selon `/api/v1/games/table-capabilities/`, contrairement aux autres jeux qui acceptent au moins deux joueurs. Les comptes doivent être préparés sur le staging, par la passerelle SMS de test ou un provisionnement contrôlé ; ne jamais contourner l'OTP de production.

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

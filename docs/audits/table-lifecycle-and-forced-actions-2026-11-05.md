# Tables : création, expiration et actions obligatoires

Date : 5 novembre 2026. Branche : `fix/table-lifecycle-forced-moves`.

## Recherche et principes retenus

Les [recommandations de Board Game Arena](https://en.doc.boardgamearena.com/images/7/76/5-guidelines.pdf), pages 14 et 19, recommandent de simplifier les actions imposées, de rendre les coups compréhensibles et de conserver les décisions stratégiques au joueur. L'application automatise donc les coups sans alternative significative côté serveur, avec un court délai et un historique visible.

La [FAQ Tabletopia](https://help.tabletopia.com/faq/) distingue une session conservée après fermeture de la fenêtre d'une fermeture explicite de la partie. Cela motive la distinction entre perte de connexion et départ définitif ; les délais ci-dessous sont des choix propres à notre application.

Les [variantes de domino avec pioche recensées par Pagat](https://www.pagat.com/domino/line/draw.html) diffèrent. Les automatisations conservent la variante déjà exécutée par notre moteur : piocher quand aucun domino ne peut être posé, puis passer si la pioche est vide. Elles ne changent pas les règles de score.

## Audit du code existant

La fermeture de certaines tables vides existait déjà dans `8dd3a57`. Les anomalies restantes se situaient à plusieurs niveaux :

- Une nouvelle tentative HTTP pouvait créer deux tables ; création et première place n'étaient pas atomiques.
- L'attribution d'une place par nombre de sièges provoquait des collisions après un départ au milieu de la liste.
- Un départ pouvait rouvrir une partie déjà commencée. Le statut Django `running` recouvre aussi les tables entièrement réservées dont le moteur attend encore les connexions.
- Le nettoyage dépendait d'une lecture du catalogue et ne traitait pas les réservations fantômes. Une ligne Django ne prouve pas qu'une salle existe réellement dans le moteur.
- Une ancienne sauvegarde ou un ticket encore valide pouvait recréer une table fermée. Une notification de fermeture tardive pouvait être suivie d'un état client ancien.
- Les minuteurs perdaient certains paramètres d'action ; une boucle de surveillance pouvait s'arrêter pendant une attente humaine prolongée.
- Ludo et Domino demandaient des clics même pour des coups imposés. Les informations nécessaires pour expliquer certaines actions automatiques n'étaient pas transmises à l'interface.

## Plan suivi

1. Sécuriser les transactions, les nouvelles tentatives de création et l'attribution des places.
2. Distinguer attente, partie commencée, déconnexion temporaire et fermeture définitive dans le moteur.
3. Persister et transmettre les fermetures ; empêcher leur résurrection côté serveur et côté interface.
4. Réconcilier périodiquement Django avec l'activité authentifiée du moteur, sans expiration en cas d'indisponibilité.
5. Exécuter les actions imposées via le chemin normal de validation, de séquence et de diffusion.
6. Afficher leur origine automatique et vérifier les parcours HTTP/WebSocket et navigateur.

## Comportement implémenté

### Création et places

- Clé de création conservée par le formulaire pendant ses tentatives. Même clé et même contenu : même table ; contenu différent : HTTP 409. Clé limitée à l'utilisateur et contrainte unique en base.
- Création et première place dans une transaction ; attribution du premier index libre sous verrou.
- Une table complète encore en attente peut accueillir un remplacement après départ seulement si le moteur confirme son état d'attente. Une partie réellement commencée ne rouvre pas ses places.
- Un nouveau ticket joueur renouvelle `TableSeat.admitted_at` ; une consultation spectateur ne renouvelle pas la réservation.

### Déconnexion et fermeture

- Perte de connexion : délai de reconnexion existant de 30 secondes après détection ; les places restent protégées pendant ce délai.
- Départ explicite ou expiration du délai : une partie commencée de Ludo, Domino, Belote ou Rami se ferme si elle perd un joueur. Aucun remplacement silencieux par un robot.
- Une table sans siège humain se ferme même si des robots restent présents.
- Le poker conserve son fonctionnement par main. Le minuteur serveur peut effectuer le check/fold autorisé d'un joueur parti ; un ancien client ne reçoit pas ce privilège.
- Fermeture sauvegardée, notification aux participants, événement livré par l'outbox durable, statut Django terminé. Un marqueur persistant empêche un ancien ticket de recréer la salle même avant réception par Django.
- L'interface ignore un état tardif après fermeture. Les sièges et historiques des tables terminées sont conservés.

### Réconciliation et délais

Tâche `apps.games.tasks.reconcile_game_tables`, planifiée toutes les 30 secondes par Celery Beat, également accessible par `python manage.py reconcile_game_tables`.

| Situation | Délai par défaut | Protection |
|---|---:|---|
| Moteur venant de redémarrer | 120 s | Aucun nettoyage pendant l'initialisation |
| Salle présente dans le moteur | Conservée | Inclut les joueurs déconnectés encore en grâce |
| Réservation jamais connectée dans une salle en attente | 120 s | Dernière admission récente et sièges réservés du moteur protégés |
| Table vide absente du moteur | 120 s | Mesuré depuis la dernière mise à jour |
| Table ouverte avec sièges, absente du moteur | 900 s | Laisse le temps d'inviter d'autres joueurs |
| Table marquée en cours, absente du moteur | 120 s | Après initialisation du moteur |
| Moteur indisponible ou réponse invalide | Aucune expiration | La base reste intacte |

Les durées de table sont configurables par `TABLE_EMPTY_EXPIRY_SECONDS`, `TABLE_WAITING_EXPIRY_SECONDS`, `TABLE_RUNNING_EXPIRY_SECONDS` et `TABLE_RESERVATION_EXPIRY_SECONDS`. Une salle présente avec une partie commencée ne subit aucune suppression individuelle de siège par cette tâche.

### Actions obligatoires

- Ludo : déplacement automatique après lancer si un seul pion est jouable, ou si tous les pions jouables ont le même état et la même position. Le lancer reste une action du joueur. Des positions différentes restent un choix manuel.
- Domino : pioche obligatoire, passage imposé, pose unique sur une extrémité unique ou équivalente. Le serveur s'arrête dès qu'il existe plusieurs choix significatifs.
- Les actions passent par la validation et la séquence normales, sont diffusées et enregistrées ; temporisation de 350 ms entre actions imposées.
- Résultat réel du dé conservé, mention « automatique » et historique récent repliable pour les jeux de plateau.
- Une salle en attente refuse les actions de gameplay ; une action publique ne peut pas viser une autre table que celle du ticket.

## Validation locale

- Suite Django : 126 tests réussis sur SQLite isolé ; migrations additives `0016` et `0017` appliquées sur la base QA seulement.
- Suite Go complète avec `-race` réussie ; couverture des actions obligatoires, délais, fermetures, restauration et portée des tickets.
- Frontend : 28 tests unitaires et 23 tests Playwright réussis ; compilation TypeScript/Vite/PWA et ESLint réussis.
- Contrôles Black, isort, Flake8, golangci-lint et absence de migration manquante.
- Parcours réel Django/Go sur ports dédiés : création répétée sans doublon, deux joueurs avec tickets signés, déplacement Ludo imposé, expiration de reconnexion avec notification du pair, fermeture répercutée en base, ancien ticket refusé.
- Commande réelle de réconciliation : conservation d'une salle connectée, libération de deux réservations expirées tout en conservant une admission récente, et expiration d'une table orpheline possédant encore un siège historique.
- Test navigateur : historique des actions automatiques et fermeture qui résiste à un ancien paquet d'état.

## Activation et limites de qualification

Ces modifications sont locales : elles ne constituent pas une mise en production. Déployer les migrations, le backend et le moteur ensemble, puis activer worker et Beat Celery, ou une exécution périodique équivalente de la commande. La commande a été exercée réellement ; le transport Celery/Beat n'a pas été exécuté dans cette réception.

Conserver `ACTIVITY_OUTBOX_DIR` sur un volume persistant pour les événements et marqueurs de fermeture. Ces marqueurs sont conservés sans purge automatique ; prévoir une politique de rétention compatible avec les sauvegardes et tickets avant toute suppression.

La concurrence PostgreSQL n'est pas qualifiée par les tests SQLite locaux. Les services QA utilisent une base distincte ; aucune base utilisateur ni le Redis partagé n'a été vidé. Les tests WebSocket unitaires utilisent désormais le stockage mémoire pour ne pas dépendre des clés de ce Redis.

# Statistiques joueurs inspirées de Steam — recherche et plan

Demande : distinguer connectés, en jeu, et joueurs uniques par jeu. Ce document complète le plan et les travaux en cours ; il ne revendique pas l'implémentation de nouveaux compteurs.

## Recherche

Steam Charts distingue les joueurs en ligne sur la plateforme et les joueurs en jeu ; son classement Most Played expose Current Players et Peak Today. La documentation Steamworks décrit GetNumberOfCurrentPlayers comme un nombre de joueurs actuellement actifs dans une application. Ce compteur simultané n'est pas une audience unique quotidienne. Ne pas déduire DAU/MAU en additionnant des mesures simultanées.

Sources officielles consultées :
- https://store.steampowered.com/charts
- https://store.steampowered.com/charts/mostplayed
- https://partner.steamgames.com/doc/webapi/ISteamUserStats#GetNumberOfCurrentPlayers

## Définitions proposées pour MDG

| Mesure | Définition et source | Usage et limite |
|---|---|---|
| En ligne maintenant | Identités humaines distinctes avec présence app récente ou connexion de jeu vivante confirmée. Dédupliquer onglets, sockets et appareils. | Indique la présence, pas la disponibilité pour une partie. |
| En partie maintenant | Identités humaines connectées à une session moteur démarrée, non terminée et non périmée. Spectateurs et lobby exclus. | Sous-ensemble des connectés ; participants en entraînement séparés du multijoueur. |
| Joueurs uniques sur 24 h par jeu | Identités humaines distinctes ayant effectivement participé à une session de ce jeu dans les 24 dernières heures. Observation serveur requise, pas un clic sur la fiche. | Une personne jouant dix parties vaut un joueur unique. Valeur glissante, explicitement nommée. |
| Uniques 7 j / 30 j | Même définition sur des fenêtres glissantes de 7/30 jours. | Métrique secondaire de page de jeu ; calcul par union d'identités, pas somme des totaux quotidiens. |
| Pic simultané sur 24 h | Maximum du nombre en partie, issu des transitions de sessions et connexions enregistrées. | Ne pas le confondre avec uniques 24 h. Si seulement échantillonné, nommer « pic observé » et préciser la cadence. |

Population initiale recommandée : comptes humains identifiés. Les invités ont une identité de session distincte et un compteur séparé tant qu'une fusion fiable vers un compte n'existe pas. Aucun dédoublonnage par IP ou empreinte d'appareil. Exclure bots, tests et sessions internes ; l'entraînement peut compter l'humain dans une audience « tous modes » explicitement séparée du multijoueur. Les comptes connectés jouant dans deux jeux comptent une fois dans le total plateforme et une fois dans chaque jeu : la somme par jeu peut dépasser le total.

Tables privées : participants inclus uniquement dans les agrégats globaux sans codes, noms, liens ou possibilité de déduire une salle privée ; séparer les tables publiques rejoignables des tables privées. Prévoir masquage des très petites cohortes dans les ventilations si nécessaire ; conserver le périmètre cohérent entre les vues.

## Contrat des données

Réponse versionnée : as_of, expires_at, coverage_started_at, scope, population, availability ; global online_now/in_game_now ; par jeu in_game_now, unique_players_24h, unique_players_7d, unique_players_30d, peak_24h et tables publiques disponibles. Un champ indisponible vaut null avec une raison, jamais zéro. Distinguer valeur mesurée et historique partiel. Ne pas reconstruire un ancien historique à partir de sièges ni de simples résultats sans preuve de participation.

Présence live : registre partagé par session avec TTL et ensemble distinct d'identités ; heartbeat app visible toutes les 15 s, expiration proposée 45–60 s, complété par la connexion moteur pour les joueurs en partie. Ce sont des choix techniques à qualifier, pas les paramètres internes de Steam. Fin, abandon, reconnexion, logout et expiration sont idempotents. Cache court de 5–10 s ; affichage réactualisé toutes les 15 s. Heartbeats et événements authentifiés, rate limiting, aucune identité fournie librement par le navigateur.

Participation historique : événement serveur durable avec identifiant unique, session, jeu, identité canonique, mode, timestamps UTC et version de règle. Début effectif puis activité reconnue par le moteur ; ne pas exiger une victoire ou une fin de partie. Déduplication des événements et gestion des arrivées tardives/reprises. Base PostgreSQL pour la source durable ; Redis pour le live. Les agrégats doivent survivre à une perte du cache.

## Présentation

- Accueil : une ligne compacte « X en ligne · Y en partie », lien « Voir l'activité ». Ne pas réintroduire un tableau dense.
- Catalogue : sous chaque illustration « X en partie · Y joueurs uniques sur 24 h ». Infobulle définissant période et population.
- Page du jeu : en partie maintenant, uniques 24 h, pic 24 h ; détail 7/30 jours et courbe si historique suffisant.
- Lobby : priorité aux places disponibles et aux joueurs en recherche ; ces deux valeurs ne sont pas synonymes du nombre en partie.
- États chargement, zéro réel, indisponible, données périmées et historique partiel. Labels FR/MG, lecture clavier, couleurs non exclusives, aucune animation numérique artificielle.

## Lots et critères de réception

1. Figer définitions, identité et mode ; contrat de métriques versionné. Décider explicitement le traitement des invités et de l'entraînement. Aucun objectif chiffré de popularité inventé.
2. Instrumenter connexions moteur et cycle de vie des sessions ; registre de présence partagé et déduplication. Deux onglets/un compte = 1 connecté ; un bot = 0 ; spectateur = connecté mais pas en partie ; déconnexion expirée retire le joueur.
3. Enregistrer les participations et agréger des uniques exacts. Une identité/10 parties = 1 unique ; deux identités = 2 ; absence de partie terminée n'empêche pas de compter une participation réelle ; rejouer les événements n'augmente pas le résultat.
4. Historiser concurrence et pics ; gérer fuseaux, fenêtres glissantes, panne cache et événements tardifs. Comparer les compteurs à une liste de sessions contrôlée et réconcilier total global/par jeu.
5. Brancher API et interface sur accueil/catalogue/page de jeu/lobby. Valeur en erreur non remplacée par zéro ; horodatage et couverture visibles. Tests mobile 320/390 et bureau ; FR/MG et accessibilité.
6. Qualification multi-utilisateur et multi-worker, reconnexion moteur, restauration, logout, expiration, panne Redis, absence de fuite privée. Mesurer fraîcheur et taux d'événements manquants avant publication. CI verte et vérification du commit publié.

## Articulation avec l'implémentation en cours

Les correctifs de présence actuellement locaux retirent les sièges historiques, ajoutent le heartbeat app et exposent l'absence de confirmation moteur. Ils restent une étape intermédiaire : ne pas les renommer « Steam-like live » avant les lots 2/3. Le raccordement signé de la durée de tour et les règles des tables continuent indépendamment ; leur état de test ne constitue pas une validation des statistiques.

## Première implémentation des périodes

Ajout d'une table durable HumanGameActivity dédupliquée par identité, jeu et jour UTC. Comptages exacts distincts sur fenêtres glissantes 24 h, 7, 30 et 365 jours via last_seen_at ; pas de somme des uniques quotidiens. Endpoint de collecte réservé au secret moteur, jeu résolu côté serveur via une place existante, exclusion des simulations. Le moteur notifie après une action humaine acceptée non rejouée. Endpoint public de lecture sans identités et sélecteur de période sur la page de jeu. Historique absent/partiel explicite.

Limites de ce lot : la notification réseau moteur fait deux tentatives mais n'a pas encore d'outbox durable ; une panne prolongée peut sous-compter. La population est explicitement celle des humains avec action confirmée en multijoueur ; ce compteur n'inclut pas les spectateurs, ni les humains restés sans action. Les uniques ne remplacent pas les compteurs simultanés. Ne pas qualifier la chaîne complète avant migration, redéploiement moteur/backend et scénario réel ; le conteneur backend actif utilise encore son code embarqué.

Validation de cette étape : deux tests Django sur base dédiée réussis (fenêtres distinctes, déduplication, secret moteur et exclusion simulation) ; tests Go réussis ; compilation frontend/PWA réussie ; sélecteur des quatre périodes vérifié dans Chromium mobile avec réponse API contrôlée. Aucun résultat avec API simulée n'est présenté comme une mesure de population réelle. Migration de production, redéploiement et observation d'une action réelle restent nécessaires.

## Complément du 5 novembre 2026

La reprise a d'abord vérifié les commits et les branches distantes ; voir
[la réconciliation](implementation-reconciliation-2026-11-05.md).
Les limites des paragraphes précédents décrivent le premier lot, pas le code
complémentaire actuel : celui-ci utilise une outbox persistée sur volume Docker,
réessaie les événements réseau et conserve leur date d'origine. Les événements
invalides sont conservés à part pour inspection, sans bloquer les suivants.
La participation est enregistrée au démarrage effectif avec les humains connectés,
ou après une action humaine acceptée ; les replays, bots et spectateurs sont exclus.
Le calcul des quatre périodes utilise une agrégation SQL distincte par jeu.

Les états en ligne/en partie viennent de connexions moteur humaines vivantes,
avec déduplication par compte. Une partie démarrée peut rester reprenable pendant
le délai de reconnexion même si aucun joueur n'est connecté ; elle ne crée pas de
joueur fictif dans les compteurs. Les tables privées ne sont pas exposées dans le
nombre public de tables disponibles. Le heartbeat global est émis uniquement
lorsque l'application est visible.

Les migrations additives 0013 (activité), 0014 (taille du matchmaking), 0015
(version du contrat de règles) accompagnent le lot. Backend et moteur doivent
être redéployés ensemble ; un ancien endpoint de compteurs n'est pas traité comme
une source confirmée par le nouveau frontend. Les réglages signés sont persistés
avec l'état moteur, y compris pour Ludo et Domino ; une table en attente n'est pas
restaurée comme une partie démarrée.

Les résultats et les limites du lot complémentaire sont consignés dans
[la réception locale du 5 novembre](implementation-validation-2026-11-05.md).

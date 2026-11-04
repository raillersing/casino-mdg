# Audit et plan — présence, configuration des tables et accès privé

Date : 4 novembre 2026. Statut : audit statique et plan préalable aux corrections. Aucun changement fonctionnel dans ce lot.

## Périmètre et limites de preuve

Lecture de LobbyPage, PlayHubPage, HomePage, GamePage, services frontend ; modèles, vues, matchmaking, services et invitations Django ; création, admission, minuteries et règles du moteur Go. L'API locale sur 127.0.0.1:8001 ne répond pas au contrôle effectué : aucun parcours réel multi-utilisateur n'est qualifié. Les conclusions ci-dessous sont issues du code, pas d'un test de charge ou d'une mesure d'utilisateurs réels. La modification préexistante de docker-compose.yml est conservée.

## Constats vérifiables

| Priorité | Constat et preuve | Conséquence |
|---|---|---|
| P0 | `matchmaking.py:active_presence` utilise un TTL de 30 secondes ; le heartbeat frontend est dans le lobby authentifié, toutes les 15 secondes. `MatchmakingStatusView` filtre par jeu. | Le compteur existant ne représente pas toute l'application. Les joueurs dans une partie ou une autre page peuvent disparaître ; le jeu sélectionné n'est pas une preuve de participation. |
| P0 | `services.py:seed_demo_tables` crée six tables depuis le GET de liste. | Une liste de tables persistées n'est pas une mesure de parties réellement actives. Les tables de découverte peuvent gonfler les compteurs. |
| P0 | `services.py:join_table` marque `running` lorsque les sièges sont remplis. | `running` côté Django ne prouve ni démarrage ni activité du moteur. Un siège persisté ne prouve pas une connexion. |
| P0 | `TableListCreateView.post` borne les places entre 2 et 9, tous jeux confondus ; `stakes` est une chaîne libre ; code calculé depuis `count()+1`. | Configurations incompatibles, montant non structuré, collisions possibles en création concurrente. |
| P0 | `GameTable` n'a pas de configuration de règles versionnée ; ticket d'admission sans règles ni capacité ; création Go par identifiant et type. | Ajouter des champs frontend seulement ne transmettrait pas les règles au moteur. |
| P0 | `TableJoinView`/`TableAdmissionView` protègent les tables privées ; invitations UUID, expiration 24 h, acceptation transactionnelle existent dans `social/views.py`. | Il faut réutiliser ces contrôles ; le code public de table ne doit pas devenir un mot de passe. |
| P1 | GamePage sait créer un lien `?invite=...` et accepter une invitation ; le lobby n'offre pas de saisie. | Le parcours de partage existe partiellement, mais l'entrée manuelle manque. Une invitation acceptée est consommée par son bénéficiaire. |
| P1 | Délais humains de 18 secondes codés dans `room/manager.go` pour Belote/Rami/Ludo/Domino ; objectif Belote 501 et progression des blinds Poker internes. | Les options de vitesse et d'objectif doivent être validées et appliquées dans le moteur, y compris après restauration. |
| P1 | Le Rami Go distribue 7 cartes à 2–4 joueurs et utilise knock/gin ; des textes frontend annoncent d'autres règles. | Il faut nommer et documenter la variante réellement supportée avant de proposer « Rami Malagasy » configurable. Les règles génériques de Gin ne définissent pas la variante malgache. |
| P1 | `queue_player` associe deux tickets même lorsque la table vise quatre places. | L'appariement n'est pas la preuve d'une partie prête à démarrer ; état d'attente et seuil de départ doivent être explicites. |

## Recherche et décisions

- PokerStars Home Games : paramètres distincts de type de jeu, limite, places et monnaie ; création et accès à un club sont des parcours explicites. https://www.pokerstars.com/help/articles/home-games-faq/ et https://www.pokerstars.com/poker/home-games/
- PokerStars Learn : structure des blinds et cadence déterminent la durée d'un tournoi. Une partie rapide n'est pas un moteur de matchmaking. https://www.pokerstars.com/poker/learn/news/how-to-set-up-a-pokerstars-home-game-and-get-your-blind-structure-right/
- Pagat Belote : la variante à quatre est organisée en deux équipes ; les variantes doivent être distinguées. https://www.pagat.com/jass/belote.html
- Pagat Gin Rummy : règle classique à deux joueurs et dix cartes ; écart avec le moteur actuel à sept cartes. https://www.pagat.com/rummy/ginrummy.html
- Pagat Draw Dominoes : variantes de distribution, pioche et blocage ; ne pas proposer un simple « Domino » sans règles identifiées. https://www.pagat.com/domino/line/draw.html
- Masters of Games Ludo : référence de règles de plateau ; les options de temps sont des choix du produit numérique. https://www.mastersofgames.com/rules/ludo-rules-instructions-guide.htm

Les références éclairent les variantes ; elles ne remplacent pas les règles malgaches choisies pour le produit. Les profils rapides ci-dessous sont des propositions produit, pas des normes du domaine.

## Définitions des statistiques proposées

- En ligne dans l'app : utilisateurs humains authentifiés distincts ayant une présence récente sur une page visible ou une connexion de jeu vivante. Exclure bots ; distinguer invités humains des comptes si l'identité existe. Dédupliquer onglets, appareils et sockets par identité. Ne pas additionner aveuglément les compteurs par jeu.
- Par jeu : humains effectivement connectés à une table de ce jeu ; afficher séparément ceux qui recherchent une partie. Un filtre sélectionné ne compte pas comme joueur en partie.
- Tables en cours : sessions humaines démarrées confirmées par le moteur, avec bail/heartbeat récent et non terminées. Séparer ouvertes, en cours, entraînement et privées. Exclure tables de démonstration et sessions périmées.
- Les compteurs publics couvrent les tables publiques ; les utilisateurs autorisés voient leurs tables privées séparément. Ne publier aucune identité, code, ni détail privé dans les agrégats.
- Contrat proposé : endpoint de statistiques avec `as_of`, `expires_at`, disponibilité et compteurs globaux/par jeu. Une source indisponible doit afficher « Indisponible » ou « Dernière mise à jour… », jamais un faux zéro. TTL de présence cible 45 s et heartbeat 15 s à valider par tests ; arrêt au logout, multi-onglets et suspension mobile pris en compte.

## Réglages par jeu à proposer

| Jeu | Configuration pertinente | Contraintes préalables |
|---|---|---|
| Poker | 2–9 places selon formats pris en charge, stack initial, petites/grandes blinds, cadence et progression pour tournoi, temps de décision | Distinguer jetons de jeu, droit d'entrée et argent réel ; aucune promesse de mise appliquée tant que portefeuille/réservation/règlement ne sont pas reliés. |
| Belote | 4 places, équipes 2 contre 2, objectif de score, temps de décision, résumé des annonces/atouts | Verrouiller les règles effectivement prises en charge ; variantes à 2/3 hors périmètre initial. |
| Rami | Variante nommée, places autorisées, cartes distribuées, seuil de fermeture, objectif/manches, délai | Résoudre d'abord l'écart entre les textes et le moteur à 7 cartes ; ne pas exposer de variantes non implémentées. |
| Ludo | 2–4 places, quatre pions, délai par tour, règles de sortie/capture/relance documentées | Un mode court avec moins de pions exige une vraie extension du moteur et des tests. |
| Domino | 2–4 places selon moteur, double-six, pioche ou blocage si supporté, distribution, objectif/manches, délai | Vérifier les règles actuelles avant d'autoriser chaque variante. |

Formulaire : jeu présélectionné, profil « Standard » ou « Rapide », visibilité, puis paramètres avancés propres au jeu. Résumé avant création et sur la table. Exemple de profil numérique à étudier : rapide 15 s, standard 30 s ; valeurs non livrées tant que le moteur ne les applique pas. Séparer « trouver des adversaires » de « cadence rapide ».

## Plan d'implémentation ordonné

### Lot 0 — contrats et règles

Figer la variante par jeu depuis le moteur et les règles produit ; catalogue serveur des capacités, valeurs autorisées, défauts et versions. Définir les unités monétaires et distinguer argent/jetons. Inventorier toutes les entrées : accueil, Jeux, page de jeu, lobby, clubs, invitation et matchmaking. Réception : chaque champ proposé a une validation serveur, une destination moteur et un test de comportement identifié.

### Lot 1 — configuration persistée et réellement exécutée

Ajouter `rules_version` et configuration typée persistée avec migration conservatrice ; valider les places par jeu, montants, délais et combinaisons. Identifiant de table aléatoire et unique, création idempotente. Fournir au moteur la configuration authentifiée et son empreinte ; vérifier l'accord entre admission et table existante ; persister dans les snapshots et restaurer les mêmes paramètres. Empêcher la modification des règles après démarrage. Recette : créations simultanées, paramètres invalides, conservation des anciennes tables, délais appliqués, départ au bon seuil et reprise après redémarrage.

### Lot 2 — présence et cycle de vie fiables

Heartbeat global au niveau application, agrégation partagée avec expiration ; signal moteur pour les connexions et sessions actives. Transitions explicites ouverte/démarrée/terminée, fin et abandon idempotents ; réconciliation des sessions orphelines. Retirer l'ensemencement de démonstration du GET de production et identifier les données historiques sans les supprimer. Endpoint agrégé horodaté. Recette avec deux navigateurs et deux onglets : déduplication, changement de page, déconnexion brutale, expiration, robots, invités, privacité, panne API/moteur et plusieurs workers.

### Lot 3 — rejoindre une table privée

Entrée « Rejoindre une table privée » dans lobby et page de jeu ; accepter lien ou jeton d'invitation existant, conserver le retour après connexion. Résoudre l'invitation, montrer un résumé autorisé, rejoindre par le service transactionnel puis obtenir le ticket d'admission. Ne pas accepter le simple code prévisible comme autorisation. Pour un code court, ajouter un secret aléatoire distinct, expiration/révocation, limite d'essais et journal d'audit ; ne pas réutiliser `table_code`. Traiter expirée, consommée, pleine, terminée et club non autorisé. Recette : aucun contournement par UUID, URL, API directe ou WebSocket ; double clic idempotent et invitations concurrentes ne dépassent pas la capacité.

### Lot 4 — interface cohérente

Formulaire piloté par le catalogue serveur ; profils explicites, réglages avancés, résumé des règles. Ajouter statistiques horodatées à l'accueil, aux cartes de jeu, aux pages de jeu et au lobby. État de chargement, indisponibilité et filtres cohérents ; traductions FR/MG, clavier et mobile 320/390 px. Ne pas afficher de compteurs statiques ou de fausses tables actives.

### Lot 5 — validation et publication

Tests contrats Django/Go, concurrence et admissions ; tests navigateur contre services réels pour création de chaque jeu, application des règles, présence, invitation privée et reprise. Les tests à réponses contrôlées restent des tests UI. Contrôle de non-régression portefeuille, clubs et matchmaking. CI complète verte avant fusion, puis vérification du commit fusionné. Documenter séparément implémenté, testé localement et observé avec services réels.

## Risques restant à lever

Pas de preuve runtime disponible lors de cet audit ; état global de CI historiquement non vert à revérifier. Les règles exactes du Rami malgache et les variantes commerciales doivent être fixées avant exposition. Les montants libres actuels ne prouvent aucun débit ni réserve financière. Toute configuration monétaire nécessite un circuit de règlement explicite et idempotent. L'audit de sécurité des invitations doit inclure les chemins d'admission moteur, pas uniquement le formulaire.

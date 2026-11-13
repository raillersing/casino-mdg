# Casino MDG — Refonte UX mobile-first, incrément 1

Date : 13 novembre 2026  
Branche : `feat/mobile-first-game-lobby-2026-11-13`  
Statut : implémentation sur branche et PR en brouillon, **non déployée en production**.

## Problème et objectif

Les retours utilisateurs portent sur la difficulté à trouver un jeu, voir ses tables, créer une partie et accéder au matchmaking. Ce lot simplifie le trajet principal :
`/games` → `/lobby/:gameType` → admission/salle d'attente → `/game/:gameType/:tableCode`.

La réussite d'un parcours navigable ne suffit pas à prouver une partie multijoueur complète ; les tests à deux navigateurs et les contrôles financiers sont hors réception de cet incrément.

## Décisions de conception (Claude Frontend Design / principes d'utilisabilité)

1. **L'action avant la télémétrie** : rechercher des humains, créer et rejoindre par code sont visibles sous le titre du jeu ; les statistiques détaillées restent secondaires.
2. **Une seule sélection de jeu** : l'URL `/lobby/:gameType` détermine la file de matchmaking et la configuration de création.
3. **Divulgation progressive** : créer rapidement une table gratuite, puis accéder aux options avancées dans le formulaire historique au besoin.
4. **Vérité serveur** : les cartes indiquent des *places réservées*, non un nombre inventé de joueurs actuellement connectés. Aucun délai fixe n'est affiché dans le parcours prioritaire.
5. **Simplicité responsive** : une colonne sur mobile, deux colonnes sur grand écran ; cibles tactiles d'au moins 44 px ; arrêt des animations selon `prefers-reduced-motion`.
6. **Conserver les invariants financiers** : la création rapide envoie `stake_amount: 0`, sans manipulation des fonds MGA. Toute création avec mise passe par le parcours existant et doit faire l'objet d'une réception financière indépendante.

Références UX : https://www.nngroup.com/articles/progressive-disclosure/ et https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html.

## Parcours livrés

### Trouver des joueurs

- Sur la page d'un jeu, bouton « Trouver des joueurs » visible sans ouvrir d'onglet de lobby.
- Appel des services `queueMatch`, `getMatchmakingStatus` et `cancelMatch` déjà présents.
- L'état de file affiche une recherche en cours et son temps écoulé ; pas d'estimation artificielle.
- Lors d'une connexion obligatoire, conservation du jeu et de l'intention `action=matchmaking` pour reprendre la recherche.
- Après appariement, transfert de `table_id` dans la navigation si le ticket en contient un.
- Aucune substitution silencieuse de robots.

**À traiter plus tard :** formats de matchmaking configurables (2/3/4/6/9 selon jeu), priorité éventuelle aux tables déjà ouvertes, événements temps réel, robustesse de rejoin/expiry, tests multi-comptes et métriques de temps d'attente validées.

### Rejoindre une table

- Une carte compacte montre nom, état, places réservées, places libres et minimum de participation fourni par le serveur.
- Les tables déjà rejointe(s) sont classées en premier et restent accessibles même si la capacité est atteinte.
- Les tables encore accessibles sont listées avant les tables complètes.
- L'admission reste gérée par `joinTable` et les services existants ; une carte de table n'est pas une autorisation.

**À traiter plus tard :** déduplication présence/sièges en temps réel et réconciliation du cycle de vie des tables.

### Créer une table

- Bottom sheet mobile `QuickCreateTableSheet` : nombre de joueurs, public/privé, CTA « Créer et rejoindre ».
- Les capacités autorisées et les règles par défaut sont lues depuis `/api/v1/games/table-capabilities/`. Aucun tableau parallèle de variantes n'est codé en dur.
- Un identifiant d'idempotence est généré à l'ouverture et conservé pendant les tentatives de création.
- Le serveur reste l'autorité pour l'admission.
- Options avancées et mises restent dans `CreateTableModal`, sans réécrire les contrats financiers.
- La demande de création est conservée à travers l'authentification pour le jeu sélectionné.

## Fichiers modifiés et ajoutés

- `frontend/src/pages/LobbyPage.tsx` : orchestration, actions de jeu, logique de création, conservation des intentions.
- `frontend/src/components/game/GameLobbyEntryActions.tsx` : actions et état de recherche.
- `frontend/src/components/game/TableAvailabilityCard.tsx` : rendu des tables.
- `frontend/src/components/game/QuickCreateTableSheet.tsx` : création simple.
- `frontend/src/styles/game-lobby-v2.css` : styles isolés, responsive, accessibilité.
- `frontend/src/locales/{fr,mg}/translation.json` : titre de disponibilité.
- `frontend/tests/e2e/mobile-game-lobby-v2.spec.ts` : scénarios navigateur.

## Critères de réception

- À 320, 390 et 1440 px, les actions et les tables sont visibles, sans débordement horizontal.
- Les cartes affichent les places en tant que réservations ; une table complète interdit l'entrée sauf reprise d'un siège existant.
- Le formulaire simple reprend le jeu choisi et n'autorise que des capacités annoncées par le backend.
- La création publique/privée transmet exactement les options choisies.
- Une recherche faite depuis Ludo passe `game_type=ludo` et son annulation demande le ticket correspondant.
- Le retour d'authentification ne perd pas l'intention « créer » ou « trouver des joueurs ».
- Aucun changement du backend MGA ou du moteur n'est inclus.

## Vérifications et risques

Le premier run GitHub Actions associé au PR a validé la compilation TypeScript/Vite, Vitest et Playwright, avec des échecs préexistants ou hors périmètre à distinguer : format Prettier global, lint backend/Go et au moins un test financier Django. Une validation verte de l'ensemble de la CI n'est **pas** revendiquée.

Le test E2E simule les réponses d'API. Il ne remplace pas la recette d'une partie réelle avec deux comptes et le moteur Go, ni les tests de paiement. Ne pas déployer les mises MGA sur la base de cette validation UI.

## Incréments suivants

1. Connecter un matchmaking configurable par format à la véritable disponibilité des tables, avec test du cycle complet d'admission.
2. Revoir l'accueil et le catalogue pour réduire davantage les écrans de transition.
3. Unifier la salle d'attente et l'état de présence avec les événements du moteur.
4. Décomposer `GamePage.tsx` en contrôleur de session, sièges, plateau et commandes tactiles par jeu.
5. Réception UX modérée FR/MG, mobile Android/iOS, réseau lent, accessibilité et contrôle de sécurité comptable avant ouverture MGA.

---

# Extension : refonte UX transversale (second lot)

Le premier incrément ci-dessus reste historique. La PR #48 inclut maintenant les travaux ci-dessous sur la même branche. **Aucun parcours de production ou de paiement réel n'a été déclaré validé au moyen des seuls tests simulés.**

## Architecture des parcours

| Intention utilisateur | Destination | Résultat attendu |
|---|---|---|
| Démarrer une partie | Accueil -> Jeux -> /lobby/:jeu | Voir immédiatement recherche, tables et création |
| Créer une table | Accueil -> /games?intent=create -> /lobby/:jeu?action=create | Formulaire rapide gratuit avec capacités serveur |
| S'entraîner | Accueil -> /games?intent=practice | Simulation annoncée comme entraînement IA |
| Rejoindre sur invitation | Accueil -> /lobby?action=join-private | Code d'accès privé vérifié |
| Reprendre | Mes parties -> /game/:jeu/:code | Distinguer session moteur confirmée et siège encore enregistré |
| Jouer à plusieurs | Lobby -> recherche avec format serveur | Correspondance avec humain présent ou autres tickets compatibles |
| Retour du joueur | Bouton Quitter / Mes parties | Admission/reprise via contrats serveur existants |

### Nouveaux modules

- `HomePage.tsx` + `home-game-v2.css` : accueil orienté trois intentions, deux jeux en avant, reprise confirmée, sans statistiques artificielles.
- `GamesPage.tsx` : conserve l'intention créer ou pratiquer, séparée du parcours tables.
- `MyPartiesPage.tsx` + `playing-v2.css` : page dédiée aux parties confirmées et aux sièges réservés.
- `Layout.tsx` : navigation mobile et bureau Accueil / Jeux / Mes parties / Profil, sans bouton notification inerte.
- `GamePage.tsx` + `gameplay-ux-v2.css` : nom de table réel, statut de connexion explicite, actions prioritaires accessibles au pouce et respect du mouvement réduit.
- `WaitingRoom.tsx` : états prudents : siège enregistré ≠ joueur connecté ≠ moteur prêt ; code privé non déduit d'un identifiant public.
- `LobbyPage.tsx` : recherche des tables par nom et filtre disponibles / mes tables.

## Matchmaking et vérité serveur

- `queueMatch` envoie `target_size` lorsque le joueur choisit un format compatible.
- `MatchmakingStatusView` renvoie le ticket du jeu demandé plutôt qu'un ticket d'un autre jeu.
- `matchmaking_payload` inclut `target_players`.
- L'allocation favorise une table publique gratuite avec siège libre et présence humaine récente avant de créer une autre table.
- Les tickets en attente de jeux précédents sont annulés lorsque l'utilisateur change de jeu.
- La sélection de format repose sur `table-capabilities`, pas une liste séparée.
- Les délais d'attente factices ont été retirés du lobby général.
- Aucun robot n'est substitué à un joueur sans un parcours de simulation explicite.

## Garde-fous financiers

La règle choisie pour cet incrément, suivant le test existant `test_finance.py`, est : **pour les jeux non-Poker, un minimum en Ariary est un contrôle d'éligibilité et n'autorise pas de réservation/débit MGA**. Les tests API auparavant contradictoires sont alignés sur ce contrat et sur `TableSeat.buy_in = 0`. Le Poker à mise monétaire conserve ses traitements spécifiques. Cette règle doit être approuvée par le propriétaire du produit et revue juridiquement avant toute exploitation monétaire en production.

Les badges de statut ne transforment jamais un siège, une statistique historique ou une absence de réponse serveur en joueur connecté. Les pourcentages Poker d'équité codés en dur ont été retirés, car non calculés pour la main courante.

## Couverture automatisée de la branche

- Navigateurs : navigation mobile, cinq lobbies de jeu, recherche/filtres, création rapide, annulation/retour du matchmaking, catalogue créer/pratiquer, parties à reprendre.
- Accessibilité automatisée : Accueil, Auth, lobby générique, catalogue mobile, Mes parties et lobby du jeu sélectionné (selon les tests Playwright Axe).
- Backend : matchmaking 3 joueurs Ludo, filtrage par jeu, format invalide, table existante avec hôte présent, hôte périmé ignoré, changement de jeu.
- Tests Django de financement : contrôle sans débit non-Poker, et invariants de financement Poker.
- Go : tests du moteur et lint ; helpers inutilisés supprimés.

Voir les exécutions GitHub Actions associées au commit exact de la branche. **Les résultats d'une exécution antérieure ne prouvent pas la réussite de nouveaux commits.** Aucun benchmark LCP/INP/CLS ni test utilisateurs modéré n'a été réalisé ici.

## Limites et critères avant une mise en production

1. **Réception E2E réelle** avec deux appareils / navigateurs et deux comptes distincts, moteur Go et Django en staging, pour chacun des jeux et capacités supportées.
2. **Réconciliation sièges / présence / snapshots / déconnexion** sous réseau mobile intermittent, notamment avec 4G/3G.
3. **Audit indépendant des flux financiers** MGA, rapprochements, remboursements, all-in Poker et états de sortie. Aucun nouveau flux réel ne doit être activé sans recette.
4. **Conformité légale et protection des joueurs** pour les fonctionnalités financières et politiques locales.
5. **Tests utilisateurs** FR/MG à 320/360/390/430 px et sur appareils Android/iOS, clavier et lecteurs d'écran.
6. **Observabilité** : métriques anonymisées du temps pour rejoindre, taux de succès, annulation de matchmaking, erreurs d'admission et sessions.
7. **Contrainte de déploiement** : le workflow Release déclenché sur tags `v*` publie des images ; fusionner vers `master` n'est pas en soi un déploiement de production.

Critère « prêt à merger » : CI de la tête PR verte et absence de régression identifiée ; si les points 1–6 ne sont pas testés, les qualifier explicitement de **non certifiés**, et ne pas qualifier le produit de « production-ready ».

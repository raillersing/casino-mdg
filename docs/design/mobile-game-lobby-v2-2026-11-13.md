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

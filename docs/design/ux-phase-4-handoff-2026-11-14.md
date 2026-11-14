# Casino-MDG — Phase 4 : design system, navigation, FR/MG, accessibilité et recette

Date : 14 novembre 2026  
Branche : `feat/ux-design-system-i18n-2026-11-14`  
Base des travaux : PR #52 → #53 → #54 → phase 4 (PR empilée).  
**Statut : implémentation proposée, NON réceptionnée, NON déployée.**

## Principes UI / UX

- **Intention prioritaire** : le parcours visible commence par « Jouer en ligne », puis sélection d'un jeu et lancement de la recherche des joueurs. Tables, création et entraînement doivent rester des alternatives compréhensibles.
- **Vérité du système** : une place n'est pas un joueur connecté; un appel API échoué n'est pas « 0 table »; un ticket `queued` n'est pas un match; un match n'est pas une partie démarrée.
- **Progressive disclosure** : création rapide sans mise et création avancée distinctes; détails d'audience secondaires, pas de marketing au-dessus des actions de jeu.
- **Hiérarchie visuelle** : une action forte par tâche, alternatives secondaires contrastées, sans fausses statistiques ni attente prédites.
- **Design existant préservé** : identité sombre et accents dorés, tokens UX pour focus, lisibilité, tap targets, overflow de libellés et réduction de mouvement.
- **Accessibilité** : navigation clavier visible, focus évident, états accessibles, taille cible de 44px sur les parcours principaux, contrôle de texte bilingue FR/MG.

## Matrice des écrans, états et entrées

| Page | Action primaire | Alternatives | États explicites |
|---|---|---|---|
| Accueil `/` | Jouer en ligne | Reprendre, invitation, création, entraînement | Partie confirmée vs aucune reprise |
| Catalogue `/games` | Jouer en ligne pour le jeu choisi | Voir les tables / solo vs IA | Jeu indisponible, chargement |
| Lobby jeu `/lobby/:gameType` | Trouver des joueurs | Rejoindre, créer, code privé | Envoi, recherche, ticket trouvé, vide, filtré, erreur réseau |
| Tableau tables `/lobby` | Choix du jeu/table | Matchmaking contextuel, création | Ouverte / pleine / privée / commencée |
| Création rapide | Créer et rejoindre | Options avancées | Capacités serveur, idempotence, erreur de création |
| Salle d'attente | Attendre confirmation | Inviter, quitter, retourner aux tables | Places enregistrées, connexions *explicitement* confirmées |
| Mes parties `/mes-parties` | Reprendre partie confirmée | Ouvrir autres tables | État vérifié vs indisponible |
| Plateau `/game/:type/:id` | Action de jeu contextuelle | Quitter, reconnection | Moteur/snapshot, erreur connexion |

## Changements phase 4

- `ux-journeys-v3.css` : tokens UX séparés, focus clavier, cibles tactiles, texte long FR/MG, contrastes d'état, réductions de mouvement, forced-colors.
- `Layout.tsx` : onglet « Jeux / Lalao » localisé; 4 destinations mobile.
- `locales/fr`, `locales/mg` : entrée navigation `nav.games`.
- `GamesPage.tsx` : descriptions des cinq jeux et nombres de joueurs localisés.
- `WaitingRoom.tsx` : labels clés FR/MG, états de connexion, rappel des places réservées, filtre excluant les bots du compteur des connexions humaines confirmées, état de connexion annoncé aux technologies d'assistance.
- `GameLobbyEntryActions.tsx` : accessibilité de l'état de soumission du matchmaking, indicateur de traitement.
- `frontend/tests/e2e/design-accessibility-v3.spec.ts` : vérification de la navigation MG et d'un contrôle tactile au clavier.

## Protocole de validation recommandé

### Automatisé (bloquant avant fusion)

1. `npm ci && npm run build && npm run lint && npm test && npm run test:e2e` depuis `frontend/`.
2. `black --check .`, `isort --check-only .`, `flake8`, `pytest` depuis `backend/` avec les dépendances CI.
3. `go vet ./...` et `go test -race ./...` dans `game-engine/`; validation Docker Compose.
4. Captures 320 / 360 / 390 / 430 / 768 / 1440 px ; contraste, overflow horizontal, format paysage, focus clavier, `prefers-reduced-motion`.
5. Tests lecteurs d'écran et interaction au clavier, en FR et MG.

### Tests utilisateurs / moteur (bloquant avant publication)

1. Une personne nouvelle trouve comment **jouer à un jeu précis** sans accompagnement.
2. Deux comptes distincts démarrent une partie réelle du même jeu/format.
3. Création publique puis join par autre joueur; création privée puis join par code.
4. Partie pleine, commencée, serveur indisponible et retour d'authentification : messages exacts et issues possibles.
5. Deux requêtes de queue simultanées, match pendant annulation, ticket expiré, reload.
6. Réseau mobile dégradé, offline → online, onglet suspendu puis réveillé; reprises autoritaires.
7. Belote, Domino, Ludo, Rami, Poker avec formats server-defined et invariants MGA.
8. FR/MG et Android/iOS sur appareils réels, y compris technologies d'assistance.

## KPI à mesurer (cibles expérimentales, NON résultats)

- `home_to_game_selection` : temps et clics jusqu'à un jeu choisi.
- `selection_to_queue` : clics et délai avant confirmation serveur de file.
- `queue_to_match` : conversion et temps, sans prétendre prédire le délai.
- `match_to_engine_started` : véritable partie lancée, distinguée du siège réservé.
- `table_view_to_join_success`, `create_to_join_success`, `resume_to_connected`.
- Segmenter par jeu, format, FR/MG, nouveau/récurrent, 3G/4G/Wi-Fi, mobile/desktop.
- **Objectifs proposés à valider** : ≥85 % de réussite sans aide de recherche d'adversaires lors de tests modérés; aucune fausse connexion affichée dans les cas contrôlés. Ce ne sont pas des statistiques mesurées.

## Gouvernance, risques et limites

- Les CI déclenchées sur les PR #52 à #54 ont été observées en échec sur tous les jobs en quelques secondes; les logs ne sont pas accessibles via l'app GitHub. **La cause n'est pas établie.**
- Ne pas interpréter un test E2E API mockée comme une preuve de session multijoueur; ne pas annoncer de conformité WCAG 2.2 sans audit manuel.
- Aucun déploiement automatique lié à une fusion vers `master` n'est supposé; `.github/workflows/release.yml` publie sur tag `v*`. La version de production actuelle ne doit pas être modifiée sans validation et plan de retour arrière.
- **Monétaire** : les invariants MGA/non-Poker/Poker restent hors de toute refonte UI; une revue métier, juridique et comptable indépendante est nécessaire avant tout usage en argent réel.
- Les traductions MG doivent être relues par des locuteurs natifs avant publication.
- Dans cette session, pas de staging public opérationnel, pas de benchmark Web Vitals et pas de résultats de tests multi-comptes vérifiables : aucune certification annoncée.

## Références

- Source : `docs/design/ux-navigation-webmap-v3-2026-11-14.md` et `docs/design/mobile-game-lobby-v2-2026-11-13.md`.
- Critères UX : https://www.nngroup.com/articles/ten-usability-heuristics/
- Révélation progressive : https://www.nngroup.com/articles/progressive-disclosure/
- WCAG 2.2 : https://www.w3.org/TR/WCAG22/

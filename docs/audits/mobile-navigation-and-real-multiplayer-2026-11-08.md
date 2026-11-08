# Audit navigation mobile, tables et multijoueur réel

Date : 8 novembre 2026. Code examiné : `master`, commit `6d6fce6`.
Statut : audit et plan de refonte ; les anomalies décrites ne sont pas corrigées par ce document.

## 1. Demande et règles produit confirmées

L'utilisateur rapporte qu'un second joueur rejoint la table mais que les participants ne se voient pas et que la partie ne commence pas. Il souhaite choisir un jeu puis voir immédiatement ses tables disponibles ou créer une table, avec une navigation particulièrement simple sur mobile.

Précision reçue pendant l'audit : chaque table doit avoir un minimum de participation, sans maximum propre à la table. Au poker, le joueur choisit son tapis à l'entrée et doit pouvoir l'augmenter ensuite. Exemple attendu : minimum 5 000 Ar, tapis choisi 50 000 Ar. La limite reste le solde disponible, pas un plafond de table.

La monnaie a été confirmée pendant cet audit : **solde Ariary du portefeuille**, donc compte `MGA`, et non jetons `SIM`. Le plan réserve et restitue des fonds réels du portefeuille ; il ne convertit pas les bonus de simulation en Ariary. La recharge poker est prévue entre deux mains, comme le fonctionnement de complément décrit par Zynga.

## 2. Méthode et preuves

- Lecture des routes, liens, création, entrée par code, résolution de table, hook WebSocket, contrôle d'admission, démarrage du moteur, sérialisation des états, modèles et nettoyage.
- Navigation Chromium réelle à 390 × 844 ; mesures stabilisées à 320, 390, 768 et 1440 px. Les captures montrent l'application existante, pas une maquette.
- Backend Django et moteur Go réels, base SQLite QA distincte, quatre comptes de test. Aucun utilisateur ni volume de production modifié. Redis et PostgreSQL partagés préservés.
- Sept scénarios HTTP/WebSocket, cinq chemins d'entrée dans Chromium, trois scénarios à deux navigateurs distincts. Les tests navigateur instrumentés de cet audit ne remplacent pas une partie complète sur chaque jeu.
- Suites existantes : 133 tests Django réussis sur SQLite ; suite Go complète `-race` réussie ; 28 tests unitaires frontend et compilation TypeScript/Vite/PWA réussis ; Playwright : 21 réussis, 2 échecs ; ESLint : échec sur 2 avertissements.
- Pas de réception sur un déploiement distant, Safari/iOS ou réseau mobile réel. Ne pas assimiler la reproduction locale à une inspection du serveur utilisé par l'utilisateur.

Preuves conservées : [dossier de réception](../../reports/mobile-navigation-audit-2026-11-08/), notamment `two-browsers.json`, `entry-browser.json`, `realtime.json`, `admission-check.json` et `responsive.json`. Aucun ticket d'admission ni jeton utilisateur n'y est conservé.

## 3. Pourquoi les deux joueurs ne se voient pas

### P0 — Création rapide : le créateur n'entre pas dans le moteur

`LobbyPage.handleQuickCreate` navigue avec `table_id`, sans ticket d'admission. La réponse de création ne fournit pas ce ticket. Dans `GamePage`, le paramètre `table_id` est nommé `demoTableId`, même en multijoueur ; sa présence court-circuite l'effet censé obtenir une admission. Le WebSocket utilise alors le JWT utilisateur ordinaire.

Reproduction réelle :

1. Créer une table Ludo 2 places en HTTP puis ouvrir exactement l'URL produite par le raccourci.
2. Le créateur reçoit `unauthorized table creation requires admission ticket`, puis `table not found` au sync.
3. Un autre compte rejoint par l'API et utilise son ticket valide : il se retrouve seul dans le moteur.
4. La base compte deux sièges, le moteur seulement un ; la partie ne démarre pas.

C'est une réservation réussie en base, pas une admission réussie à la partie. Le test `quick-two` à deux navigateurs reproduit cette divergence.

Sources : `frontend/src/pages/LobbyPage.tsx` (`handleQuickCreate`), `frontend/src/pages/GamePage.tsx` (`demoTableId`, effet de résolution), `backend/apps/games/views.py` (`TableListCreateView`), `game-engine/internal/websocket/server.go` (`handleJoin`).

### P0 — Création privée et entrée par code : le ticket est perdu

La création personnalisée et `JoinPrivateTableModal` naviguent avec le seul `table_code`. Le modal reçoit un ticket de `joinTableByCode`, mais ne transmet que `response.table`. `getTables()` ne transmet pas l'authentification : la table privée n'apparaît donc pas dans cette liste, même pour un membre. Le fallback essaie le `table_code` comme code privé, tandis que l'API exige le véritable `access_code` pour une table privée.

Reproduction Chromium, créateur puis joueur ayant déjà rejoint avec le bon code : liste HTTP 200 sans la table privée, `join-by-code` HTTP 404, puis refus WebSocket faute d'admission. Il faut conserver l'identité UUID et résoudre l'admission directement, sans passer par le catalogue public.

Sources : `frontend/src/components/game/JoinPrivateTableModal.tsx`, `frontend/src/services/games.ts` (`getTables`), `GamePage`, `TableJoinByCodeView`.

### P0 — Une salle existante accepte aussi une entrée sans siège réservé

Le contrôle imposant un ticket n'est exécuté que lorsqu'aucune salle/sauvegarde n'est trouvée. Avec une salle privée déjà instanciée, un JWT utilisateur ordinaire peut être admis au moteur sans siège Django.

Test strictement QA : table privée 4 places, propriétaire connecté avec ticket ; autre compte sans réservation, connecté avec son JWT ordinaire. Résultat : 1 siège en base, 2 joueurs dans le moteur, aucune erreur. Cela crée l'incohérence inverse et doit être fermé avec le correctif d'admission, sans retirer la protection exigeant un ticket pour créer une salle.

### P1 — Attente du remplissage et faux plateau de jeu

`StartTable` et l'initialisation des jeux comparent le nombre de joueurs à `TableSettings.MaxPlayers`. Le formulaire choisit initialement le dernier nombre de la liste des capacités : 4 pour Ludo/Domino/Rami, 9 pour poker. Le raccourci poker demande 6 places.

Le moteur envoie avant démarrage `game_state.players=[]`, alors que les joueurs connectés sont dans `payload.players`. L'interface affiche néanmoins le plateau, des camps génériques, un faux nom « Table Émeraude » et parfois « Connecté » : elle n'explique ni les places manquantes ni l'absence de partie active.

Tests à deux navigateurs :

| Cas Ludo | Joueurs dans le moteur, chacun des deux écrans | Joueurs dans la partie | Résultat |
|---|---:|---:|---|
| Création rapide, 2 places | Créateur refusé ; autre joueur seul | 0 | Admission cassée |
| Deux tickets valides, table 4 places | 2 | 0 | Attente de deux autres joueurs |
| Deux tickets valides, table 2 places | 2 | 2 | Partie commencée sur les deux écrans |

Les deux problèmes se cumulent, mais ne doivent pas recevoir le même correctif : admission systématique d'abord, état d'attente explicite ensuite.

### Ce qui fonctionne dans la réception actuelle

Avec des tickets valides et le nombre configuré atteint : Ludo, Domino, Rami et poker démarrent à 2 ; Belote démarre à 4. Un lancer Ludo a été validé et diffusé aux deux clients. Ces résultats qualifient le démarrage et cette action, pas toutes les manches, scores ou paiements des cinq jeux.

## 4. Audit UX et navigation

| Priorité | Constat actuel | Effet / correction prévue |
|---|---|---|
| P1 | `HomePage` et `GamesPage` pointent vers `/play/:gameType`, page de présentation, statistiques et choix de modes | Le choix d'un jeu doit ouvrir directement `/lobby/:gameType` |
| P1 | Sur mobile 390 px, le titre du jeu dans `/play/ludo` commence vers y=1 024 ; les modes vers y=1 680 | Les informations d'audience occupent la première vue au lieu de l'action |
| P1 | Dans `/lobby/ludo`, les tables commencent vers y=1 603, après télémétrie, onglets, recherche, filtres monétaires et raccourcis | Liste des tables immédiatement après un en-tête compact ; statistiques détaillées secondaires |
| P1 | Deux pages « Jeux » et « Tables », un hub de modes et plusieurs rangées de filtres | Supprimer les choix redondants du chemin principal ; conserver les anciennes URL par redirection |
| P1 | Le catalogue des tables ne s'actualise pas périodiquement comme les compteurs | Un second utilisateur peut manquer une table nouvellement créée ; rafraîchir sur événement/focus et toutes les 5 s en attendant un flux dédié |
| P1 | `player_count` est un nombre de sièges persistés, traité visuellement comme une présence | Afficher distinctement participants réservés, réellement connectés, en reconnexion et en attente |
| P1 | Dates Django utilisées pour masquer les tables après 15/20 min, indépendamment de la présence moteur | Une table active peut disparaître du catalogue ; unifier visibilité et cycle de vie avec la vérité serveur |
| P1 | Retour d'authentification générique `/auth?next=/lobby` et fermeture du formulaire perdent du contexte ; `action=create` lit `game_type` mais pas toujours le filtre sélectionné | Préserver jeu, intention et brouillon ; ne pas redemander le jeu |
| P1 | Le formulaire moderne ne se ferme plus avec Échap | Échec Playwright actuel ; remettre fermeture, focus, verrouillage du scroll et retour du focus |
| P2 | Les choix « Standard / Blitz / Duo / Détails » se superposent aux champs durée/joueurs | Deux choix simples visibles ; durée, variantes et nom dans « Options » |
| P2 | Titres H1 → H3 dans les raccourcis | Échec axe `heading-order` ; hiérarchie sémantique cohérente |
| P2 | `GamePage.tsx` dépasse 5 000 lignes et mélange admission, rendu, chat, scores et cinq jeux | Extraire d'abord le contrôleur de session et la salle d'attente ; éviter une réécriture globale simultanée |

Les mesures stabilisées des 12 vues ne montrent pas de débordement horizontal global. Les filtres sont dans des bandes à défilement horizontal ; leurs éléments hors écran ne sont pas à eux seuls une erreur CSS. Les petites icônes du header restent une cible à agrandir et à tester, sans prétendre à une non-conformité WCAG calculée sur leur seule taille.

Captures : [lobby mobile actuel](../../reports/mobile-navigation-audit-2026-11-08/lobby-mobile-before.png), [création actuelle](../../reports/mobile-navigation-audit-2026-11-08/create-mobile-before.png), [plateau affiché pendant l'attente](../../reports/mobile-navigation-audit-2026-11-08/waiting-mobile-before.png).

## 5. Minimum de participation, tapis et recharge : état réel

- La création force `stake_amount: 0`. `validate_table_settings` rejette tout montant non nul.
- Le moteur initialise `Player.Stack` à 10 000 pour tous les joueurs, indépendamment du portefeuille. `TableSeat` ne contient pas de tapis choisi.
- Les filtres du lobby proposent pourtant 200/500/5 000 « Ar » et « Gratuit / Démo » : ce vocabulaire ne correspond pas au contrat exécuté.
- Le filtre des mises utilise une recherche de sous-chaîne dans une étiquette : il ne peut pas représenter correctement un minimum numérique.
- Le bouton poker « Recharger » envoie `rebuy` avec un montant fixe de 5 000. Le moteur n'implémente pas cette action : ce bouton n'est pas une recharge fonctionnelle.
- La reprise conserve le même ticket dans l'URL ; aucun service de renouvellement d'admission n'est appelé avant une reconnexion après expiration du ticket court. À couvrir par un test supérieur à 60 s.
- Le passage à la main suivante écarte les joueurs sans tapis et peut terminer la session s'il reste moins de deux tapis positifs. Il faut intégrer la recharge en attente avant cette décision, pas après fermeture de la table.

Le modèle demandé doit séparer : `min_participation` (table), `buy_in` (montant choisi pour s'asseoir), `stack` (jetons effectivement en jeu), `available_balance` (hors table), `pending_top_up` (recharge MGA réservée en attente de prochaine main). Les blindes restent une règle distincte du minimum d'entrée.

### P0 — Le règlement actuel est en SIM, pas en Ariary

Le portefeuille possède déjà des comptes séparés `SIM` et `MGA`. `WalletBalanceView.balance` est le solde SIM ; le véritable solde Ariary est `mga_balance`. `settle_game_win` crédite un gain de simulation depuis un compte plateforme SIM : ce service n'est pas un règlement de fonds joueurs placés à une table MGA. Les mécanismes de retrait MGA réservent des fonds, mais aucune opération équivalente de financement de tapis n'est reliée aux sièges de jeu.

Le header utilise `user.balance` avec le suffixe « Ar ». À la connexion ce champ vient du portefeuille SIM ; lors de l'hydratation par `Layout`, il est fixé à zéro sans chargement du vrai portefeuille. Il faut corriger la source et le libellé du solde, pas seulement ajouter un champ 50K dans le formulaire.

Le plan MGA doit prévoir :

- `TableBankroll` / participation par joueur avec devise MGA, montant réservé, tapis accepté par le moteur, identifiant de session et état de restitution.
- Opérations de financement identifiées et idempotentes : entrée, complément, annulation, règlement de main et sortie. Des écritures comptables documentent chaque mouvement ; une colonne de tapis ne suffit pas.
- Verrou du compte MGA partagé avec les retraits et les autres tables : aucune double dépense. Dans le modèle de retrait actuel, `balance` est déjà diminué lors de la réservation ; ne pas retrancher une deuxième fois `held_balance` pour calculer le disponible.
- Engagement du tapis autorisé côté backend, acquittement du moteur et compensation si l'entrée échoue. Une reconnexion ne refinance jamais le siège.
- Main poker avec un identifiant propre et résultat signé, reprise durable et déduplication : l'actuel gain SIM idempotent par `game_id` seul ne doit pas être utilisé pour créditer les mains successives ni rendre deux fois le capital engagé.
- Conservation des fonds entre portefeuille disponible, sommes réservées, tapis, pots et restitutions. Toute sortie, expiration, déconnexion ou reprise serveur doit aboutir à un règlement explicite et traçable.
- Pour les jeux hors poker, définir le minimum d'accès et la règle d'engagement/règlement par jeu avant d'engager des fonds : ne pas inventer un pot poker ou une redistribution générique pour Belote, Rami, Domino et Ludo.

Ce lot est une évolution comptable et moteur, pas une simple modification des étiquettes. Les essais de cet audit n'ont engagé aucun Ariary réel.

## 6. Recherches et choix de design

- [Zynga — sélection des tables](https://zyngasupport.helpshift.com/hc/en/27-zynga-poker/faq/12677-how-do-i-appropriately-select-a-table/) distingue les réglages d'achat de tapis et permet de désactiver l'achat au maximum. À retenir : sélection compréhensible du tapis, plutôt qu'engagement automatique du solde.
- [Zynga — Auto Top Off](https://zyngasupport.helpshift.com/hc/en/27-zynga-poker/faq/18350-what-is-auto-top-off/) décrit un complément après chaque main, avec option désactivable. À retenir : recharge entre deux mains, statut explicite et choix du joueur. La première livraison proposée est manuelle ; pas de recharge automatique activée par défaut.
- [PokerStars — cash games](https://www.pokerstars.com/help/articles/ring-explanations/14982/) distingue les blindes, l'achat du tapis et la recharge. Cette plateforme décrit des minimums ET maximums : notre absence de plafond de table vient de la demande utilisateur, pas d'une affirmation sur les règles de Zynga ou PokerStars.
- [NN/g — progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) préconise les choix essentiels immédiatement et les réglages secondaires sur demande. Application : tables et action principale avant statistiques, variantes et tournois.
- [WCAG 2.2 — taille des cibles](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) fixe un minimum de 24 × 24 CSS px avec exceptions d'espacement. Objectif produit retenu : commandes principales d'au moins 44 × 44 px et boutons de validation de 48 px, plus confortables sur téléphone.

## 7. Nouveau parcours proposé

### Navigation générale

Barre mobile : **Accueil · Jouer · Mes parties · Profil**. Même vocabulaire sur desktop. Solde accessible dans le header ; clubs, aide et réglages dans les accès secondaires. La page d'accueil privilégie « Reprendre ma partie » et les jeux ; les statistiques annuelles restent accessibles mais ne précèdent plus l'action.

Choisir Ludo dans le catalogue → `/lobby/ludo`. L'ancien `/play/ludo` redirige vers ce même salon. L'entraînement devient un lien secondaire « S'entraîner », avec ses réglages propres, plutôt qu'une étape obligatoire avant les tables humaines.

### Écran 1 — Tables du jeu

En haut : retour « Jeux », nom du jeu, une ligne de compteurs fiables, bouton « Code privé ». Puis immédiatement les tables rejoignables, avec une carte compacte : nom, participants/places, minimum de participation, rythme et bouton Rejoindre.

Bouton « Créer une table » accessible sans faire défiler la page. En l'absence de table : un message bref et ce même bouton ; ne pas créer silencieusement de table, de robot ou de recherche concurrente. Une section repliée contient « En cours » et les accès spectateur si autorisés.

### Écran 2 — Créer la table choisie

Ne pas redemander le jeu. Visible : public/privé, nombre de joueurs adapté, minimum de participation (gratuit ou montant), et pour le créateur poker son tapis. Nom facultatif généré ; options avancées repliées : durée, règles propres au jeu, blindes et variantes réellement supportées.

Défauts : 2 pour Ludo/Domino/Rami, 4 pour Belote. Poker : capacité affichée 2/6/9 mais démarrage possible dès 2, explicitement distinct de la capacité maximale. Pas de remplissage automatique par robots.

Résumé au-dessus du CTA : « Ludo · 2 joueurs · minimum 5K · public ». CTA fixe « Créer et rejoindre ». Validation serveur avant fermeture ; erreurs locales au champ concerné, brouillon conservé après erreur réseau.

### Écran 3 — Choisir son tapis au poker

Exemple de données fictives : minimum table 5 000 Ar ; disponible 75 000 Ar ; tapis choisi 50 000 Ar ; restant hors table 25 000 Ar. Raccourcis minimum/10K/50K et saisie numérique ; éviter un curseur dont la graduation suggère un plafond arbitraire. CTA « Rejoindre avec 50 000 Ar ».

Aucun plafond propre à la table ; validation `minimum <= buy_in <= solde disponible`, avec montants entiers et limites techniques sûres. Les autres jeux doivent appliquer le minimum d'accès sans inventer un tapis poker ni une redistribution qui n'existent pas dans leurs règles ; préciser leur engagement et leur règlement dans le lot de fonds.

### Écran 4 — Salle d'attente réelle

Afficher le vrai nom de la table, les vrais participants, leur statut et les places manquantes depuis l'état serveur, même si `game_state` n'existe pas encore. Exemple : « Vous êtes 2 sur 4 — encore 2 joueurs ». Pour Belote : équipes et places correspondantes.

Code et partage visibles pour une table privée, action « Quitter ». Pas de bouton de dé, cartes, annonces ni plateau interactif avant `playing`. « Socket connecté », « admis dans la salle » et « partie commencée » sont des états différents.

### Écran 5 — Partie et recharge poker

Plateau et actions du tour au premier plan ; historique, chat, règles et statistiques derrière des accès courts. Quitter revient au salon du jeu, pas à une page générique.

Bouton persistant « Ajouter des jetons », même avant de tomber sous 2 000 : saisie du montant supplémentaire et aperçu du futur tapis. Si une main est en cours, afficher « +10K réservés — ajout après cette main ». La réservation, l'application à la frontière entre mains et la restitution en cas d'annulation appartiennent au serveur. Aucune modification rétroactive des mises, pots ou droits au pot.

## 8. Plan d'implémentation ordonné et vérifiable

| Lot | Travail | Condition de réception |
|---|---|---|
| A — Admission fiable | Unifier toutes les entrées avec `{table, admission}` ; utiliser l'UUID ; renouveler le ticket via l'API pour un membre ; conserver le ticket reçu à la jonction privée ; ouvrir le socket après obtention d'une admission valable | Création rapide, personnalisée, code privé, lien partagé, rechargement et reconnexion fonctionnent avec deux navigateurs réels ; JWT ordinaire refusé pour toute entrée joueur non autorisée |
| B — Présence et démarrage | Contrat explicite `waiting/playing/finished`, capacité et seuil de démarrage ; participants nommés ; slots/équipes ; poker démarre dès deux joueurs | Chaque navigateur voit les mêmes participants avant le début ; Ludo 2 démarre à 2, Belote attend 4 ; aucune fausse action de jeu pendant l'attente |
| C — Fonds de participation | Utiliser le compte MGA confirmé ; corriger le solde du header ; champs numériques distincts ; tapis par siège ; réservation atomique et idempotente, annulation et restitution ; jeton signé lié au tapis autorisé ; règles non-poker explicites | Table 5K accepte tapis 50K, refuse <5K et solde insuffisant ; aucune double réservation après retry ; deux tables ne dépensent pas le même solde |
| D — Recharge poker | Commande serveur dédiée, idempotence et persistance ; réservation immédiate, application entre mains avant élimination/fermeture ; retour clair au client ; conservation des pots et side-pots | Recharge pendant une main n'affecte aucun pot ; prochaine main reçoit le complément une seule fois ; relance/reconnexion conserve la demande ; échec/abandon restitue correctement |
| E — Navigation mobile | Liens jeu → tables ; simplifier hub et salon ; création contextualisée ; table vide, erreurs et reprise ; compteurs compacts ; conserver routes historiques et contexte d'authentification | À 320/390 px, table/état vide et CTA principal dans la première vue ; pas de retour forcé au catalogue ; commandes utilisables clavier et tactile |
| F — Réception complète | Tests HTTP, WebSocket et vrais navigateurs ; toutes les règles de fin, départ, reconnexion, expiry, paiements ; lint, build et migrations PostgreSQL | Scénarios réels décrits ci-dessous et CI entière verts avant publication ; ne pas remplacer la réception par des mocks |

A et B précèdent la refonte visuelle : ils réparent l'impossibilité de jouer. C et D doivent être testés ensemble avant d'afficher des fonds ou une recharge utilisables. Les composants existants sont réutilisés autant que possible ; migrations additives et conservation des tables/historiques.

## 9. Matrice de réception obligatoire

1. Deux comptes distincts, table publique créée depuis le catalogue : les deux noms apparaissent ; partie Ludo/Domino/Rami démarre au seuil choisi ; un coup de chaque joueur est vu par l'autre.
2. Table Belote : présence visible à 1/4, 2/4 et 3/4 ; partie démarre à 4/4 ; équipes et distribution correctes.
3. Poker 6 places : démarre à deux ; nouvel arrivant attend une distribution autorisée ; les cartes privées restent privées.
4. Table privée : propriétaire et invité entrent après code valide ; mauvais code, non-membre et ticket d'une autre table refusés ; aucun JWT générique ne contourne cette réservation.
5. Rechargement de page, fermeture/réouverture du navigateur, ticket expiré, coupure brève, double onglet et changement de réseau : reprise contrôlée sans doublon de siège, nouvelle salle ni nouvelle dépense.
6. Table 5K, tapis 50K ; montants minimum, négatif, décimal, trop grand et supérieur au disponible ; double clic et timeout HTTP après commit ; réservation concurrente sur deux tables.
7. Recharge poker après gain/perte/all-in : demande pendant une main, application à la suivante, annulation, redémarrage moteur et paiement final ; conservation de la somme des jetons.
8. Fin réelle d'une partie de chacun des cinq jeux avec plusieurs comptes, règlement et historique ; fermeture, délai de grâce et absence de résurrection.
9. 320/390/768/1440 px ; clavier, Échap, focus du modal, lecteur d'écran, portrait/paysage, safe-area, clavier numérique et langue FR/MG.
10. Catalogue se rafraîchit sans geste manuel ; une table active ne disparaît pas sur une ancienne date Django ; affichage explicite si moteur indisponible.

## 10. Régressions existantes à inclure

- `npm run lint` échoue : export non-composant dans `LudoBoard.tsx` et dépendance `selectedPeriod` manquante dans `BackofficePage.tsx`.
- Playwright échoue sur la hiérarchie H1/H3 du lobby et sur Échap qui ne ferme plus la création. Les tests ne prouvent pas aujourd'hui le parcours complet admission–moteur entre deux utilisateurs : plusieurs mocks fournissent directement des états ou des tickets.
- La suite backend verte et les tests Go verts ne contredisent pas l'échec utilisateur : la rupture se situe dans l'orchestration frontend entre des composants testés séparément.

Une [maquette HTML de référence](../design/mobile-tables-proposal-2026-11-08.html) illustre les écrans prioritaires avec des données fictives. Elle ne se connecte ni aux tables ni au portefeuille.

## 11. État de livraison de cet audit

Ce livrable contient le diagnostic, des captures et preuves locales, un contrat produit proposé et le plan d'exécution. Aucun correctif fonctionnel, migration, commit, push, merge ou déploiement n'a été effectué dans cette phase. Les données des essais sont dans une base QA dédiée. Le minimum de participation et la recharge ne doivent pas être présentés comme déjà implémentés.

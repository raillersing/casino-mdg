# MDG Game Club — Roadmap active d’activation

**Version :** 2.0 — roadmap active
**Date :** 12 août 2026
**Statut :** planification approuvée, implémentation à poursuivre après validation des décisions ouvertes
**Périmètre :** simulation uniquement, jeux instantanés, tirages et activation du multijoueur

> Cette roadmap remplace la roadmap historique `IMPLEMENTATION-ROADMAP.md` pour l’ordre de livraison. Aucun jeu d’argent réel, paiement ou promesse de gain réel n’est inclus dans ce plan.

## 1. Décision produit

La priorité est de rendre le produit utile dès la première visite : un utilisateur doit pouvoir comprendre l’offre, démarrer une partie en moins de 60 secondes, savoir clairement s’il joue contre des humains ou contre une IA de démonstration, puis rejoindre naturellement le multijoueur quand des joueurs sont disponibles.

La séquence recommandée est :

```text
Visibilité → onboarding court → partie solo/démo transparente
→ présence réelle → matchmaking humain → reconnexion robuste
→ communauté et rétention → pilote fermé mesuré
```

Les bots servent à réduire l’attente et à apprendre le jeu, jamais à gonfler artificiellement le nombre de joueurs. Les compteurs “en ligne”, classements et statistiques humaines doivent exclure les bots.

## 2. État constaté

### Déjà disponible

- `/games/test` existe et propose des jeux instantanés et des tirages en mode simulation.
- Les parties test sont persistées côté backend et utilisent le portefeuille de simulation.
- Les services cœur démarrent localement : backend, frontend, moteur Go, PostgreSQL, Redis, RabbitMQ.
- Les endpoints `/healthz`, `/readyz`, `/metrics` et le health check du moteur Go répondent correctement.
- Le lobby contient un accès aux jeux test.

### Gaps restants après activation et multijoueur

- Le pilote fermé reste à exécuter avec de vrais testeurs ; le feedback intégré et les seuils go/no-go sont livrés.
- Les clubs privés et les notifications contrôlables restent à finaliser.
- Le tableau de bord produit doit encore être enrichi avec la latence, les erreurs et la rétention D1/D7.
- La frontière entre simulation, humain, bot et futur argent réel doit rester explicite dans chaque nouveau parcours.

Le back-office expose désormais une décision assistée sur sept jours via
`/api/v1/analytics/pilot-gate/`. Elle vérifie le volume de feedback, la note
moyenne, les parties terminées observées et les erreurs bloquantes. `GO provisoire`
ne remplace pas une revue humaine : il indique uniquement que les preuves
quantitatives minimales sont réunies.

### Lot en cours — Phase 5 : mesure et pilote fermé

Le socle de télémétrie est désormais implémenté : les événements d’activation sont
acceptés anonymement ou associés à un compte, dédupliqués par `event_id`, limités
à une liste versionnée et consultables sur une fenêtre de sept jours par le
back-office. Les parcours émettent notamment `activation_viewed`,
`test_games_opened`, `test_game_played`, `demo_started`,
`matchmaking_started`, `matchmaking_cancelled` et `human_match_found`.

La télémétrie est volontairement non bloquante : une indisponibilité de l’API
analytics ne doit jamais empêcher une partie ou une navigation. Le formulaire de
feedback et les seuils go/no-go sont livrés ; l’exécution du pilote fermé avec de
vrais testeurs reste la prochaine preuve terrain.

Le lot d’invitations est désormais opérationnel : un joueur autorisé génère un
lien valable 24 heures, le destinataire est invité à se connecter puis reprend
automatiquement sa destination. L’acceptation serveur est atomique, limitée à
un usage, rejouable sans créer un second siège par le même joueur, auditée et
mesurée par `invite_sent` / `invite_joined`. Une invitation expirée renvoie un
statut explicite et ne modifie pas la table.

Le lot matchmaking expose maintenant le nombre de joueurs humains observés,
une estimation prudente et le temps d’attente courant. Après 20 secondes sans
match, le lobby affiche un état explicite avec annulation et démo IA déclarée ;
aucun basculement silencieux vers un bot n’est effectué. Les événements
`matchmaking_timeout` et `bot_fallback_started` permettent de mesurer ce choix.

Le parcours de salle d’amis est également opérationnel : une table privée peut
être créée depuis le lobby, elle est exclue de la liste publique et reste
visible à son créateur et à ses membres. L’invitation existante constitue le
seul accès de partage ; les clubs persistants et leurs rôles restent un lot
distinct à planifier.

Les préférences de notifications sont persistées par compte et modifiables
depuis le profil : invitations, matchmaking, tour de jeu et annonces produit
sont séparés. Les annonces produit sont désactivées par défaut ; une erreur de
sauvegarde restaure immédiatement le choix précédent dans l’interface.

Le socle des clubs persistants est livré : création d’un club ouvert ou sur
invitation, adhésion idempotente, visibilité réservée aux membres pour les
clubs fermés et invitation dédiée valable 72 heures. Les rôles fondateur,
administrateur et membre sont persistés ; la modération avancée, les tables
réservées et les événements de club restent des extensions séparées.

## 3. Ordre de priorité

| Priorité | Phase | Résultat attendu | Dépend de |
|---|---|---|---|
| P0 | 0. Socle et contrats | périmètre gelé, tests et flags fiables | — |
| P0 | 1. Découverte et activation | un nouvel utilisateur trouve et démarre un jeu | 0 |
| P0 | 2. Solo/démo IA | jouer immédiatement sans prétendre jouer contre un humain | 0, 1 |
| P1 | 3. Présence et matchmaking | rejoindre un humain ou recevoir un fallback explicite | 0, 2 |
| P1 | 4. Multijoueur robuste | partie réelle stable sur deux navigateurs et réseau instable | 3 |
| P1 | 5. Mesure et pilote fermé | décider avec des données si le produit est prêt à élargir | 1, 2, 3, 4 |
| P2 | 6. Rétention et communauté | revenir, inviter et jouer en groupe sans pression | 4, 5 |
| P2 | 7. Accessibilité et performance | expérience correcte sur mobile et réseau lent | 1 à 6 |
| P0 avant argent réel | 8. Sécurité et jeu responsable | contrôle, audit et désactivation opérationnelle | toutes les phases |
| GATE externe | 9. Paiements et conformité | décision juridique et opérateur documentée | 8 |

## 4. Plan détaillé par phase

### Phase 0 — Socle, contrats et qualité

**Objectif :** disposer d’une base contrôlable avant d’ajouter du trafic ou de la complexité.

**Tâches**

- Définir les modes officiels : `SIMULATION_SOLO`, `DEMO_AI`, `HUMAN_MATCH`, puis réserver `REAL_MONEY` derrière un flag désactivé.
- Ajouter les états communs : chargement, vide, erreur, reconnexion, annulé, terminé.
- Figer les contrats API et WebSocket pour catalogue, présence, matchmaking, partie et résultat.
- Créer fixtures reproductibles : utilisateur test, wallet simulation, table, bot marqué `is_bot`.
- Ajouter les feature flags par jeu et par mode, avec kill switch serveur.
- Normaliser les logs avec `request_id`, `session_id`, `game_id` et `match_id`.
- Ajouter les tests de non-régression frontend, Django et moteur Go dans CI.

**Dépendances :** aucune.
**Sortie :** environnement propre, contrats versionnés, tests verts, aucun bot ou jeu réel activé implicitement.

### Phase 1 — Découverte et activation

**Objectif :** faire découvrir les jeux test sans lien direct et réduire le temps jusqu’à la première action.

**Tâches**

- Ajouter sur l’accueil un bloc “Jeux rapides” avec deux entrées : instantané et tirage.
- Ajouter un accès dans la navigation desktop, mobile, lobby et portefeuille.
- Afficher une fiche par jeu : durée, coût en jetons simulation, mode disponible, gain simulé et bouton d’action.
- Ajouter un onboarding en trois écrans maximum : simulation, différence humain/IA, règles responsables.
- Prévoir un mode invité limité à une démonstration non monétaire, puis proposer la création de compte pour conserver l’historique.
- Construire des états vides utiles : “Personne n’est disponible”, “Lancer la démo”, “Inviter un ami”.
- Vérifier les routes directes, le retour arrière, le rechargement et les traductions français/malgache.

**Critères de sortie**

- Un utilisateur non initié trouve `/games/test` depuis l’accueil en deux actions maximum.
- La première partie simulation démarre en moins de 60 secondes sur mobile local.
- Le mode affiché est visible avant la mise et avant le résultat.
- Les tests de navigation et de deep-link passent après rechargement.

### Phase 2 — Mode solo et démo IA transparente

**Objectif :** rendre les jeux de table jouables sans attendre un humain.

**Tâches**

- Commencer par Poker, puis étendre à Belote et Rami après validation du premier flux.
- Ajouter un bouton explicite “Jouer contre l’IA — démo”.
- Afficher les adversaires comme `IA Démo` ou `Bot Tutoriel`, avec une aide expliquant le comportement.
- Ajouter trois profils simples : tutoriel, équilibré, rapide ; ne pas présenter ces profils comme des joueurs humains.
- Implémenter des scénarios déterministes pour les tests : débutant, partie courte, déconnexion, fin de partie.
- Exclure les bots des compteurs en ligne, classements, statistiques humaines, invitations et récompenses compétitives.
- Permettre de quitter, recommencer et consulter le résultat sans double débit ni double attribution.
- Ajouter une entrée “Rejoindre des humains” à la fin de la démo.

**Critères de sortie**

- Une partie complète est jouable sans deuxième compte.
- Le mode IA est identifiable avant, pendant et après la partie.
- Les tests prouvent qu’aucun bot n’est compté comme humain.
- Les mutations sont idempotentes après double clic, refresh et reconnexion.

Les bots d’onboarding et le remplissage contrôlé d’une file sont des pratiques observées dans des jeux multijoueurs ; l’application doit néanmoins conserver une séparation explicite entre bot et humain. Voir [les règles de matchmaking de GameKit](https://developer.apple.com/documentation/gamekit/finding-players-using-matchmaking-rules) et l’exemple de bots de remplissage décrit par [Apex Legends](https://www.ea.com/games/apex-legends/apex-legends/news/overclocked-matchmaking-update).

### Phase 3 — Présence et matchmaking humain

**Objectif :** transformer l’attente opaque en parcours prévisible et honnête.

**Tâches**

- Ajouter une présence avec TTL, heartbeat, déconnexion et nettoyage automatique.
- Créer une file par jeu, variante, langue et niveau ; rendre l’inscription et l’annulation idempotentes.
- Afficher le nombre de joueurs humains disponibles, jamais un nombre incluant les bots.
- Afficher l’état : recherche, position approximative, estimation, annulation, match trouvé.
- Définir un timeout initial recommandé de 20 secondes, configurable par flag.
- Après timeout, proposer : relancer, inviter un ami ou passer à la démo IA ; ne pas basculer silencieusement.
- Ajouter les clubs privés et les notifications contrôlables après stabilisation du matchmaking.
- Enregistrer `human_match_found`, `matchmaking_timeout` et `bot_fallback_started`.

**Critères de sortie**

- Deux navigateurs peuvent se trouver dans une même partie.
- Une présence expirée ne bloque pas la file.
- Annuler ou relancer ne crée pas de doublon.
- Le fallback IA est un choix visible et traçable.

### Phase 4 — Multijoueur robuste

**Objectif :** rendre une vraie partie jouable sur plusieurs clients et réseau irrégulier.

**Tâches**

- Finaliser les événements WebSocket versionnés et les snapshots de partie.
- Ajouter reconnexion, heartbeat, grace period et reprise de l’état serveur.
- Gérer les sièges, le départ de table, le remplacement et la fermeture sans fantôme.
- Tester deux navigateurs, deux comptes, refresh pendant la partie et coupure réseau.
- Ajouter un contrôle serveur de tour, de mise et de résultat ; le frontend ne fait jamais foi.
- Créer une suite E2E avec données isolées et nettoyage transactionnel.

**Critères de sortie :** aucune partie ne dépend d’un état local du navigateur ; une reconnexion récupère un état cohérent ; un résultat ne peut être crédité deux fois.

### Phase 5 — Mesure et pilote fermé

**Objectif :** apprendre avant de chercher la croissance.

**Tâches**

- Ajouter un tableau de bord simulation : activation, première partie, completion, erreurs et latence.
- Recruter un petit groupe de testeurs identifiés, avec feedback intégré.
- Mettre en place un formulaire de signalement dans le jeu.
- Documenter chaque incident avec mode, jeu, match, version et reproduction.
- Définir un go/no-go hebdomadaire fondé sur les métriques et les erreurs, pas sur des compteurs artificiels.

**Critères de sortie recommandés**

- Les parcours critiques ont une preuve E2E et une preuve après rechargement.
- Les erreurs bloquantes et doubles mutations sont à zéro sur le pilote.
- Le taux de fallback IA et le taux de match humain sont connus par jeu.

### Critères go/no-go implémentés

| Critère | Cible par défaut | Effet |
|---|---:|---|
| Feedback pilote | 5 retours minimum | reste `À surveiller` si insuffisant |
| Note moyenne | au moins 4/5 | reste `À surveiller` si insuffisant |
| Parties terminées | 5 événements `first_game_completed` | reste `À surveiller` si insuffisant |
| Erreurs bloquantes | 0 événement `game_error` | passe immédiatement à `Bloqué` |

Les seuils sont des garde-fous de pilote simulation, pas des objectifs de
rentabilité ni une autorisation d’argent réel. Le statut affiché peut être
`GO provisoire`, `À surveiller` ou `Bloqué`, et doit toujours être relu par un
responsable avant une décision d’élargissement.

### Phase 6 — Rétention et communauté

**Objectif :** créer une raison de revenir sans mécanismes trompeurs ou agressifs.

**Tâches**

- Lancer un événement hebdomadaire de tirage simulation avec calendrier et règles visibles.
- Consolider les invitations et ajouter clubs privés, salle d’amis et notifications contrôlables.
- Ajouter missions non monétaires, plafonnées et clairement optionnelles.
- Séparer strictement classement humain, classement IA et statistiques personnelles.
- Ajouter notifications contrôlables et désinscription.

**Critères de sortie :** aucune récompense simulée n’est présentée comme de l’argent ; les règles, limites et probabilités affichées sont cohérentes avec le serveur.

### Phase 7 — Accessibilité, réseau et performance

**Objectif :** rendre le flux utilisable sur petits écrans, faible débit et avec des besoins d’accessibilité.

**Tâches**

- Tester clavier, lecteur d’écran, contraste, focus, tailles de cible tactile et orientation mobile.
- Respecter `prefers-reduced-motion` et éviter que les animations empêchent une action.
- Ajouter retry contrôlé, état hors ligne, reprise et messages non techniques.
- Mesurer poids initial, temps jusqu’au bouton de jeu et performance sur appareil bas de gamme.
- Vérifier les formulaires, erreurs et libellés en français et malgache.

Les critères mobile doivent être alignés avec [WCAG 2.2 pour le mobile](https://www.w3.org/TR/wcag2mobile-22/), notamment pour les interactions tactiles et les états non visuels.

### Phase 8 — Sécurité, jeu responsable et backoffice

**Objectif :** disposer des contrôles nécessaires avant toute extension commerciale.

**Tâches**

- Ajouter rate limits, validation serveur, anti-rejeu, permissions et audit des mutations.
- Séparer les wallets simulation et futurs wallets réels au niveau des modèles et des permissions.
- Ajouter limites de session, pause, auto-exclusion simulée et liens d’aide.
- Ajouter backoffice pour activer/désactiver un jeu, un mode ou un événement.
- Prévoir revue anti-fraude, modération, rétention des logs et procédure d’incident.
- Vérifier que les jeux automatiques ne permettent pas une répétition non contrôlée ; l’autoplay doit rester explicitement opt-in et borné.

La conception doit prendre en compte les standards de jeu responsable du [Responsible Gambling Council](https://responsiblegambling.org/for-industry/rg-check-accreditation/igaming-standards-criteria/) et les exigences techniques sur l’autoplay de la [UK Gambling Commission, RTS 8](https://www.gamblingcommission.gov.uk/standards/remote-gambling-and-software-technical-standards/rts-8-autoplay-functionality). Ces références ne constituent pas un avis juridique applicable à Madagascar.

### Phase 9 — Paiements et argent réel : gate externe

Cette phase est volontairement hors implémentation courante. Avant toute ligne de code, il faut une décision écrite sur : juridiction, licence, KYC/AML, protection des mineurs, fiscalité, opérateur de paiement, ségrégation des fonds, chargeback, audit RNG, support et procédure de fermeture.

**Go uniquement si :** avis juridique local, opérateur identifié, budget conformité accepté, modèle de risque validé et responsable nommé. À défaut, les fonctionnalités restent en simulation.

## 5. Dépendances et ordre exact d’exécution

```text
Phase 0
  ├── Phase 1 ──┬── Phase 2 ── Phase 3 ── Phase 4 ── Phase 5
  │             └── Phase 7
  └──────────────── Phase 8
Phase 5 ── Phase 6
Phase 8 + décision externe ── Phase 9
```

Ordre d’implémentation :

1. Geler contrats, modes, flags, fixtures et événements.
2. Rendre les jeux test visibles et le premier parcours mesurable.
3. Livrer Poker en démo IA, puis Belote et Rami.
4. Livrer présence, file humaine, invitation et fallback explicite.
5. Stabiliser WebSocket, reconnexion et invariants wallet.
6. Ouvrir un pilote fermé et mesurer.
7. Ajouter événements, clubs et missions seulement après preuve de stabilité.
8. Finaliser accessibilité, performance, sécurité et jeu responsable.
9. Revenir au gate juridique et paiement uniquement avec une décision externe documentée.

## 6. Mesure produit et événements

Événements minimum à instrumenter :

`activation_viewed`, `test_games_opened`, `demo_started`, `bot_mode_selected`, `matchmaking_started`, `matchmaking_cancelled`, `matchmaking_timeout`, `human_match_found`, `bot_fallback_started`, `invite_sent`, `invite_joined`, `test_game_played`, `first_game_completed`, `session_paused`, `game_error`.

KPI : temps jusqu’à la première partie, taux de première partie terminée, taux de match humain, taux de fallback IA, taux d’abandon de file, reconnexions réussies, erreurs par partie, rétention D1/D7 et invitations acceptées.

Ces KPI mesurent l’activation et la qualité de la simulation ; ils ne doivent pas être présentés comme chiffre d’affaires ou preuve de rentabilité.

## 7. Décisions proposées avant le code

| Décision | Recommandation par défaut | Point à confirmer |
|---|---|---|
| Premier jeu IA | Poker | oui/non |
| Accès invité | une démo gratuite sans wallet réel | oui/non |
| Timeout matchmaking | 20 secondes | 10 / 20 / 30 s |
| Fallback | choix visible entre relancer, inviter, IA | oui/non |
| Classement | humains uniquement | oui/non |
| XP et missions IA | progression personnelle, sans classement compétitif | oui/non |
| Événement tirage | hebdomadaire en simulation | fréquence |
| Jeux test visibles | accueil, navigation, lobby, portefeuille | oui/non |

En l’absence de nouvelle décision, ces valeurs servent de défaut de planification et restent derrière des feature flags.

## 8. Definition of Ready

Un lot est prêt à démarrer lorsque son objectif, ses routes, ses contrats, ses états UX, ses permissions, ses événements, ses fixtures, ses risques et ses critères d’acceptation sont documentés. Les décisions métier nécessaires sont tranchées ou explicitement représentées par un flag.

## 9. Definition of Done

Un lot est terminé lorsque le code, les migrations et les traductions sont livrés ; les tests unitaires, intégration et E2E pertinents passent ; le parcours fonctionne après refresh ; les erreurs, permissions et doubles soumissions sont vérifiées ; les métriques sont émises ; la documentation et l’index sont à jour ; et une preuve runtime est conservée.

## 10. Ne pas implémenter maintenant

- argent réel, dépôt, retrait ou mobile money ;
- fournisseur de slots externe ou RNG commercial ;
- autoplay infini ou relance automatique payante ;
- faux utilisateurs, faux compteurs ou bots masqués ;
- classements mélangeant humains et bots ;
- live dealer, crash game ou chat vocal ;
- croissance payante avant mesure du premier parcours ;
- promesse de rentabilité avant données du pilote et validation juridique.

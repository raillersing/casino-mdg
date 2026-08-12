# MDG Game Club — Roadmap d’implémentation

**Version :** 1.0 — historique
**Date :** 11 août 2026  
**Cible :** MVP simulation mobile-first, puis préparation de la phase argent réel

> Cette roadmap est conservée comme référence historique. La roadmap active et l’ordre de livraison actuels sont définis dans [20-Roadmap-Activation-Multijoueur-Jeux-Test.md](20-Roadmap-Activation-Multijoueur-Jeux-Test.md).

## 1. Point de départ

Le frontend dispose maintenant d’un prototype navigable `MDG Game Club` : accueil, lobby, authentification de démonstration, portefeuille, profil et table de poker simulée. Les données affichées restent encore locales et les modules backend sont des squelettes.

Le premier objectif produit est une boucle complète et vérifiable :

```text
Téléphone → OTP → 10 000 jetons → choix d’un jeu → matchmaking → partie réelle
→ résultat persistant → historique/statistiques → retour au lobby
```

Le mode simulation est prioritaire. Aucun paiement réel ne doit être activé avant la due diligence opérateur, la validation juridique et les contrôles de conformité prévus dans la documentation projet.

## 2. Principes de livraison

- Chaque lot doit être démontrable sur un parcours utilisateur réel, après rechargement de page.
- Une mutation métier doit être persistée côté serveur et idempotente.
- Le frontend doit gérer explicitement chargement, vide, erreur, reconnexion et succès confirmé.
- Les contrats partagés TypeScript/Go doivent être la source commune des événements de jeu et du wallet.
- Les performances et la reconnexion 3G/4G sont des critères de sortie, pas une optimisation finale.
- La langue malgache est P0 avec français disponible partout.

## 3. Lots d’implémentation

### Lot 0 — Fondations techniques et qualité

**Objectif :** rendre l’environnement reproductible et observable.

- Finaliser Docker Compose : PostgreSQL, Redis, Django, Game Engine Go, frontend.
- Ajouter migrations, fixtures de démonstration et comptes de test.
- Configurer CI : TypeScript, ESLint, tests frontend, tests Django, tests Go, build Docker.
- Ajouter health/readiness checks et logs corrélés par `request_id`/`session_id`.
- Stabiliser les contrats dans `shared/types`, `shared/contracts` et `shared/protos`.

**Sortie :** un environnement neuf démarre avec une commande et les tests passent en CI.

### Lot 1 — Comptes, téléphone et onboarding

**Objectif :** remplacer l’authentification de démonstration par une identité persistante.

- Inscription par téléphone et OTP avec expiration, rate limit et renvoi contrôlé.
- Session sécurisée, déconnexion, rotation et révocation.
- Pseudo unique, avatar, choix français/malgache.
- Attribution atomique du bonus initial de 10 000 jetons.
- Onboarding tutoriel : première partie guidée de Belote ou Poker.

**Sortie :** un nouvel utilisateur peut s’inscrire, recharger la page, retrouver son compte et recevoir le bonus une seule fois.

### Lot 2 — Wallet simulation et ledger

**Objectif :** rendre les jetons fiables et auditables.

- Ledger double entrée pour crédit, mise, gain, remboursement et bonus.
- Solde dérivé du ledger, jamais d’un simple compteur frontend.
- Idempotence par clé de mutation et prévention des doubles crédits.
- Historique paginé, détail d’une transaction, export de hand history.
- Limites de jeu et règles de jeu responsable dès la simulation.

**Sortie :** chaque partie modifie le solde une seule fois et le résultat reste identique après reload/restart.

### Lot 3 — Lobby, matchmaking et salons privés

**Objectif :** connecter le lobby à l’état réel des tables.

- Liste des tables depuis API, filtres, recherche et pagination.
- Création de table publique/privée, paramètres de mise et mot de passe.
- Matchmaking rapide par jeu, limites et région.
- Invitation par lien/WhatsApp, présence des amis et expiration des invitations.
- Protection contre table pleine, joueur déjà assis et double rejoindre.

**Sortie :** deux navigateurs de test voient la même table et ne peuvent pas obtenir le même siège.

### Lot 4 — Game Engine temps réel

**Objectif :** rendre la partie persistante, autoritaire et reconnectable.

- WebSocket authentifié avec heartbeat.
- Machine à états serveur : tour, timer, action valide, résultat.
- Snapshots Redis et reprise après coupure.
- Grace period de 30 secondes et resynchronisation explicite.
- Journal append-only des événements de partie.
- Contrôles anti-rejeu, séquence monotone et validation serveur de chaque action.

**Sortie :** une coupure réseau pendant un tour ne fait perdre ni siège, ni mise, ni résultat.

### Lot 5 — Jeux P0

Implémenter chaque jeu dans un lot séparé, avec règles et tests déterministes.

1. **Poker Texas Hold’em** : blinds, tours, fold/check/call/bet/raise/all-in, side pots, showdown, rake simulation, historique des mains.
2. **Belote classique** : équipes 2v2, distribution, annonces de base, plis, score automatique, fin de manche.
3. **Rami classique** : pioche/défausse, combinaisons valides, tour 2–4 joueurs, fin de manche et score.

Pour chaque jeu : tests unitaires du moteur, tests d’intégration WebSocket, tests de reconnexion et test E2E de la partie complète.

### Lot 6 — Résultats, social et rétention

- Résumé de partie et crédit du gain transactionnel.
- Historique, statistiques personnelles et classement local.
- Réactions emoji et chat textuel modéré.
- Amis, invitations et activité récente.
- Missions quotidiennes, bonus de retour et badges — après validation de la boucle de jeu.

**Sortie :** le joueur comprend ce qu’il a gagné, pourquoi, et peut relancer une partie en moins de deux actions.

### Lot 7 — Localisation et accessibilité

- Couverture complète des clés français/malgache, sans texte codé en dur.
- Glossaire cohérent pour les termes Poker, Belote, Rami et wallet.
- Navigation clavier, focus visible, contrastes, cibles tactiles larges.
- Mode connexion lente : états skeleton, payloads réduits, reprise élégante.
- Tests sur viewport Android courant et desktop.

### Lot 8 — Sécurité, conformité et back-office

- Vérification téléphone, limites de fréquence, détection multi-compte et anti-bot MVP.
- Score de risque, journal d’audit immuable et accès staff par rôle.
- Feature flags et kill switches pour jeux, wallet et paiements.
- Support bilingue, tickets, modération chat et traitement des signalements.
- Monitoring : erreurs, latence WebSocket, reconnexions, abandons et anomalies ledger.

### Lot 9 — Paiements mobile money, sous réserve de validation

Ce lot est bloqué par des décisions externes : statut juridique, opérateurs disponibles, contrats, KYC/AML et règles de retrait.

- Due diligence MVola, Orange Money et Airtel Money.
- Webhook inbox idempotente et rapprochement quotidien.
- Circuit breaker par opérateur et file d’attente des paiements.
- Dépôt, retrait, annulation, remboursement et notifications.
- Environnement sandbox puis pilote fermé avant activation progressive.

Les cartes bancaires, tournois, Belote coinchée, Blackjack et application native restent hors MVP conformément au PRD.

## 4. Ordre recommandé

```text
Lot 0
  ↓
Lot 1 → Lot 2
  ↓      ↓
Lot 3 → Lot 4 → Lot 5 Poker
                    ↓
               Lot 5 Belote/Rami
                    ↓
               Lot 6 → Lot 7 → Lot 8
                                  ↓
                            Lot 9 décisionnel
```

## 5. Critères de sortie MVP

- 100 % des parcours P0 fonctionnent après reload.
- Partie complète multi-joueurs persistée et vérifiée sur les trois jeux.
- Reconnexion fonctionnelle sous 5 secondes dans la grace period.
- Aucun double crédit, double débit ou résultat divergent dans les tests d’idempotence.
- Interface française et malgache couverte sur les écrans P0.
- Tests automatisés verts, logs exploitables, métriques et kill switch opérationnels.
- Mode simulation lancé en bêta fermée avant toute activation financière.

## 6. Décisions à prendre avant les lots non techniques

- Règles exactes de Belote et Rami à Madagascar.
- Politique de bonus, limites et jeu responsable.
- Opérateurs mobile money et statut réglementaire.
- Niveau de KYC requis par mode et par montant.
- Modération, support et responsabilité opérationnelle.

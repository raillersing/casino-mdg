# Réception locale du lot activité et configuration — 5 novembre 2026

## Réconciliation préalable

Après actualisation des références distantes, `origin/master` était à `1b9e823`.
Aucune PR ouverte ne livrait les compléments. Les couvertures des cinq jeux,
la découverte initiale, la saisie de code privé et le formulaire initial existaient
et ont été réutilisés. Voir
[la comparaison des travaux existants](implementation-reconciliation-2026-11-05.md).

## Compléments implémentés

- Accueil distinct du catalogue : choix du parcours, reprise confirmée par le
  moteur, accès au code privé et découverte de deux jeux. Illustrations existantes
  conservées ; aperçu de l'activité après le bloc d'accueil.
- Présence app récente et connexions humaines moteur, dédupliquées par compte,
  onglet et jeu. Les sièges historiques ne créent plus de joueurs en ligne.
  Une socket encore ouverte après un départ explicite de la place est exclue.
  Comptage séparé des humains en partie et des tables publiques confirmées.
  Une indisponibilité est affichée comme telle, sans faux zéro.
- Historique durable des participations multijoueurs humaines identifiées.
  Comptages distincts exacts sur fenêtres glissantes 24 h, 7, 30 et 365 jours ;
  ni somme de comptes quotidiens, ni estimation depuis la concurrence.
  Indication explicite de couverture absente ou partielle.
- Outbox disque avec écriture synchronisée, volume persistant, renvoi périodique
  et conservation de la date d'origine. Les erreurs réseau restent en attente ;
  les événements invalides 400/404 sont conservés en `.rejected` pour inspection
  sans bloquer les autres jeux. Endpoint de collecte réservé au secret moteur.
- Catalogue serveur des réglages effectivement exécutés : capacités par jeu,
  durées 10/15/30/60/90/120 secondes, score cible belote et blindes poker fixes.
  Les variantes non exécutées sont refusées. Argent réel non proposé ; les
  blindes sont en jetons de jeu, sans débit du portefeuille.
- Configuration signée dans l'admission, immuable une fois appliquée,
  persistée et restaurée pour les cinq jeux. Une table en attente reste en attente
  après restauration. Matchmaking et moteur attendent la taille choisie ;
  belote à quatre joueurs. Les admissions anciennes restent compatibles.
- Correction du contournement d'une table privée par son code public.
  Les parcours de lien d'invitation existants sont conservés.
- Correction de la déconnexion d'un compte présent sur plusieurs tables et de
  la reprise entre deux manches de belote sous le score cible.
- Statistiques par jeu sur le catalogue et la page de jeu, requête live partagée,
  traductions FR/MG et formulaire utilisable au clavier. Résultats poker fermables
  pour consulter l'historique ou quitter la table.

## Vérifications exécutées

| Vérification | Résultat et portée |
|---|---|
| `pytest backend/apps --ds=casino_qa_settings -q` | 110 tests réussis ; SQLite QA et cache mémoire isolés |
| `go test ./...`, `CGO_ENABLED=0` | Tous les paquets réussis ; Go 1.23.12, module déclaré Go 1.21 |
| Vitest | 28 tests réussis |
| Playwright Chromium | 22 tests réussis, dont accessibilité, quatre périodes, indisponibilité, formulaire piloté serveur, sortie et reconnexion |
| Frontend | Compilation Vite/PWA réussie ; ESLint et vérification TypeScript réussis |
| Backend modifié | Black, isort et flake8 ciblés ; migrations sans changement manquant |
| Navigateur avec API réelle | Accueil et catalogue sans débordement à 320/390/1440 px ; réglages belote/poker et sélection 365 jours |

Le scénario réel a utilisé quatre comptes QA sur une base SQLite dédiée, un
backend Django et un binaire Go construits depuis les sources modifiées :

1. Création d'une table privée pour chacun des cinq jeux, deux places sauf belote
   à quatre, durée 30 secondes, score belote 501 et blindes poker 25/50.
2. Refus du code public pour entrer dans la salle privée ; admission par son
   secret et ticket signé ; attente du nombre requis puis état de jeu initialisé.
3. Observation des délais, des blindes, des humains réellement connectés,
   de la reprise réservée aux membres et de l'absence de tables privées dans
   le compteur public.
4. Collecte effective des participations par le moteur vers Django et lecture des
   quatre périodes ; compte global dédupliqué même avec plusieurs jeux ouverts.
5. Fermeture de toutes les connexions et expiration du délai de grâce : aucun
   humain encore en partie et aucune table fantôme dans la reprise.

Les captures `reports/discovery-home-*` et `reports/discovery-games-*` illustrent
cet environnement QA ; elles ne mesurent pas l'audience de production.
Les tests avec réponses contrôlées valident l'interface et sont distincts de ce
scénario réel.

## Déploiement et limites de qualification

Cette réception est locale. Docker n'est pas accessible dans l'environnement WSL
courant. Aucun redéploiement des conteneurs existants, aucune migration de leur
base et aucune observation de production ne sont revendiqués. La base QA a été
créée séparément ; aucune donnée existante n'a été réinitialisée.

Les migrations additives 0013, 0014 et 0015 doivent accompagner le redéploiement
backend/moteur. Préserver les volumes de base, Redis et `engine-activity`,
sauvegarder la base existante, appliquer `migrate`, puis vérifier les endpoints
`live-stats`, `player-statistics` et une admission réelle. Les statistiques live
visent l'unique moteur configuré par `GAME_ENGINE_INTERNAL_URL` ; une architecture
à plusieurs moteurs nécessite leur agrégation avant de présenter un total global.

La réception SQLite ne qualifie pas les verrous PostgreSQL en concurrence ni
une restauration Redis interprocessus. La CI distante complète et une fusion ne
sont pas attestées par les tests locaux. Un historique annuel complet nécessite
365 jours de collecte ; aucune donnée passée n'est fabriquée.

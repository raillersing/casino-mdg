# Vérification des travaux existants avant reprise — 5 novembre 2026

Vérification effectuée après `git fetch origin --prune`, sur la branche locale
`feature/complete-game-platform`, avec `origin/master` à `1b9e823`.
Aucune pull request ouverte au moment de la consultation.

## Travaux déjà livrés, conservés

- `a5cd21b` / PR #44 : découverte des jeux et navigation du lobby.
- `f8b20cc` / PR #45 : cinq illustrations du catalogue. Elles sont réutilisées.
- `1b9e823` : API et affichage initial des compteurs, formulaire par jeu,
  accès aux tables privées et migration 0012. Ces fonctions ne sont pas recréées.
- Les branches distantes de découverte et de couvertures conservent les commits
  antérieurs aux merges par squash. Leur présence dans `--no-merged` ne signifie
  pas que leurs fonctionnalités restent à intégrer.

## Écarts encore présents dans master

| Fonction | Constat dans master | Complément local |
|---|---|---|
| Présence | Les sièges persistés sont ajoutés aux présents récents | Présence récente et connexions humaines du moteur ; déduplication des sockets |
| Tables en cours | Statut Django sans confirmation du moteur | Sessions démarrées confirmées ; indisponibilité explicite du moteur |
| Audience par période | Aucun stockage ni endpoint de joueurs uniques | Participations humaines dédupliquées, fenêtres glissantes 1/7/30/365 jours |
| Fiabilité des événements | Pas de collecte durable de participation | Outbox disque persistée et renvoi après panne |
| Réglages | Variantes proposées mais non transmises au moteur | Catalogue des variantes réellement exécutées, contrat signé et restauration |
| Matchmaking | Démarrage par paire même pour une taille supérieure | Attente du nombre choisi, quatre joueurs obligatoires en belote |
| Accès privé | Le code public peut contourner le code privé | Code public accepté uniquement sur une table publique |
| Accueil | Catalogue identique à la page jeux | Accueil orienté actions et reprise ; catalogue conservé sur /games |

## Frontières de validation

Un fichier local, un test unitaire, un commit fusionné et un service redéployé
sont des états différents. Le lot local doit être testé avant publication.
Les observations de conteneurs faites dans l'environnement précédent ne prouvent
pas l'état des services dans l'environnement WSL de cette reprise, où Docker
n'est actuellement pas accessible. Les essais locaux utilisent des données QA
isolées ; aucune base existante n'est réinitialisée.

Les statistiques annuelles deviennent complètes au terme d'un an de collecte.
L'interface signale l'historique absent ou partiel. Les fenêtres ne sont pas des
sommes d'uniques quotidiens. Les comptes invités, bots et simulations ne sont pas
comptés dans l'audience identifiée multijoueur. Les mises monétaires et variantes
non exécutées par le moteur ne sont pas présentées comme disponibles.

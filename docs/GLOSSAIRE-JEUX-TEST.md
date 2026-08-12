# MDG Game Club — Glossaire des jeux de hasard

**Version :** 1.0
**Date :** 11 août 2026
**Usage :** vocabulaire commun produit, UX, API, support et QA

## Terme produit officiel

Dans l’interface et les communications utilisateur, l’ancien terme **jeux
test** est remplacé par **jeux de hasard**. Le périmètre reste explicitement
en simulation : crédits SIM sans valeur monétaire, résultats persistés et
règles visibles. Les routes et identifiants techniques historiques, notamment
`/games/test` et `test_games_opened`, sont conservés pour compatibilité.

## Termes métier

| Terme | Définition | À éviter |
|---|---|---|
| Participation | Action complète d'un joueur sur un jeu instantané | Partie, spin, coup si le contexte n'est pas précisé |
| Entrée | Sélection confirmée dans un tirage avant clôture | Mise, ticket payant en mode SIM |
| Tirage | Événement planifié qui produit un résultat après clôture | Spin |
| Résultat | Valeur déterminée par le serveur pour une participation ou un tirage | Animation |
| Gain | Valeur SIM attribuée par le résultat | Argent, retrait |
| Lot | Récompense attribuée par une catégorie de résultat | Jackpot garanti |
| Remboursement | Crédit SIM qui annule une participation selon une règle documentée | Bonus |
| Règle | Version immuable du fonctionnement et de la table de résultats | Configuration libre |
| Preuve | Donnée permettant de vérifier le tirage publié | Garantie absolue |
| Commitment | Empreinte publiée avant le tirage puis vérifiable après | Seed secret affiché avant clôture |
| SIM | Crédit de démonstration sans valeur monétaire | Solde réel, cash |
| Limite | Plafond de participation ou de session | Blocage punitif |
| Pause | Action volontaire qui suspend la possibilité de jouer | Déconnexion |
| Kill switch | Désactivation opérationnelle d'un jeu sans effacer son historique | Suppression |

## États communs

| État | Signification |
|---|---|
| `draft` | Règle ou jeu non visible pour les joueurs |
| `open` | Participation possible |
| `submitting` | Requête en cours, action verrouillée temporairement |
| `completed` | Participation terminée avec résultat persistant |
| `closed` | Tirage fermé, aucune nouvelle entrée acceptée |
| `drawn` | Résultat du tirage produit et vérifiable |
| `settled` | Lots et remboursements traités |
| `cancelled` | Événement annulé avec une raison et une règle de traitement |
| `failed` | Action échouée sans résultat métier confirmé |

## Règles d'écriture UX

- Toujours écrire **crédit SIM** et non « argent gagné ».
- Utiliser **participer** pour une action instantanée et **valider une entrée** pour un tirage.
- Utiliser **résultat** pour la valeur calculée et **animation** pour sa représentation visuelle.
- Dire **prochain tirage** avec une date et une heure précises.
- Afficher la raison d'un refus : tirage clôturé, limite atteinte, solde SIM insuffisant ou service indisponible.
- Ne jamais dire « presque gagné », « chance augmentée » ou « garanti » sans règle formelle.
- Les traductions malgaches doivent conserver les mêmes distinctions métier ; elles sont validées avec un locuteur compétent avant diffusion.

# MDG Game Club — Journal des décisions de la page Jeux test

**Version :** 1.0
**Date :** 11 août 2026
**Statut :** décisions de référence pour l'implémentation SIM

Ce document évite que le frontend, le backend, le moteur de hasard et la QA appliquent des règles différentes. Toute modification d'une décision doit être ajoutée ici avant modification du code.

## Décisions validées

| ID | Décision | Choix | Raison |
|---|---|---|---|
| D-001 | Route | `/games/test` | Isoler le laboratoire du lobby existant |
| D-002 | Devise | `SIM` uniquement | Aucun argent réel ni conversion en P0 |
| D-003 | Jeu d'appel | Coffre Mada | Boucle courte et facile à comprendre |
| D-004 | Jeu de retour | Jackpot MDG hebdomadaire | Créer un rendez-vous plutôt qu'une répétition permanente |
| D-005 | Jeu bonus | Roue MDG avec quota | Animation attractive, intensité limitée |
| D-006 | Jeux différés | Plinko, slots complexes, Crash | Complexité, intensité et dépendances supérieures |
| D-007 | Résultat | Calculé côté serveur | Le client ne doit jamais décider du gain |
| D-008 | Ledger | Ledger wallet existant | Une seule source de vérité financière, même en SIM |
| D-009 | Retry | Idempotence par clé de participation | Éviter double débit et double crédit |
| D-010 | Animation | Résultat calculé avant animation | L'animation ne doit pas influencer le hasard |
| D-011 | Accessibilité | FR/MG, clavier, mobile, réduction d'animation | Contrat UX P0 |
| D-012 | Sécurité | Feature flag et kill switch par jeu | Arrêt ciblé sans supprimer l'historique |
| D-013 | Fournisseur | Aucun fournisseur externe en P0 | Tester le produit avant intégration commerciale |
| D-014 | Argent réel | Bloqué jusqu'à validation écrite | Licence, KYC/AML, fiscalité et opérateur à confirmer |

## Décisions à confirmer avant un pilote externe

- règles locales et autorisation applicables à chaque catégorie de jeu ;
- partenaire ou fournisseur certifié ;
- exigences KYC/AML et limites par profil ;
- opérateurs de paiement, frais et délais de rapprochement ;
- politique de conservation des audits et des résultats ;
- rédaction juridique des règles, promotions et communications ;
- seuils de rétention et de coût acceptables.

## Règle de changement

Une proposition de changement doit préciser :

1. la décision concernée ;
2. le comportement actuel et le nouveau comportement ;
3. l'impact frontend, backend, données et tests ;
4. l'impact sécurité, conformité et jeu responsable ;
5. la migration ou la compatibilité avec les résultats déjà enregistrés.

Une règle de jeu publiée ne peut pas être modifiée rétroactivement : une nouvelle version doit être créée.

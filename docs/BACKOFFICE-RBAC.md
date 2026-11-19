# CasinoMDG — RBAC back-office (rôles métier)

## Politique (deny by default)

Le statut Django `is_staff` **ne suffit plus** à accéder aux endpoints migrés.
Un compte doit être `is_active=True`, `is_staff=True` et appartenir à un
groupe métier disposant de la capacité requise. Le superuser actif conserve
un bypass administratif ; les contrôles métiers existants (TOTP, double
validation, exports et détails financiers) demeurent obligatoires.

Rôles Django (`auth.Group`) et capacités :

| Groupe | Capacités |
| --- | --- |
| `casino:operations` | `operations.read`, `reports.read`, `games.read` |
| `casino:player_support` | `players.list` |
| `casino:chat_moderator` | `chat.read`, `chat.moderate` |
| `casino:finance_auditor` | `finance.read`, `finance.reconcile`, `reports.export` |
| `casino:sim_cashier` | `sim.summary`, `sim.adjustments.read`, `sim.adjustments.request` |
| `casino:sim_auditor` | `sim.summary`, `sim.ledger`, `sim.adjustments.read` |
| `casino:sim_approver` | `sim.adjustments.approve` |
| `casino:compliance_officer` | `kyc.read`, `kyc.review` |
| `casino:security_auditor` | `audit.read`, `auth.read`, `flags.read` |

### Mise en service / migration des opérateurs

1. Créer les groupes via `python manage.py bootstrap_backoffice_roles` (idempotent).
2. Affecter chaque opérateur à ses seuls groupes requis avec une procédure
   d'approbation interne ; vérifier les comptes existants avant déploiement.
3. Vérifier les tests d'isolement par rôle, les refus 401/403 et les cas
   superuser. Les utilisateurs staff sans groupe seront refusés sur ces routes.
4. Ne pas donner `is_superuser` aux opérateurs : il contourne la matrice
   de capacités mais **pas** les contrôles TOTP / séparation des tâches déjà
   codés dans les vues.

### Limites et prochains contrôles

Cette tranche couvre les vues métier des applications
`backoffice` et les revues KYC (hors module pilote / vues externes
à migrer séparément). Les capacités `players.detail`, `auth.write`,
`sim.adjustments.approve`, `sim.ledger`, `reports.export` et les
vues MGA conservent en plus leurs restrictions superuser historiques.
Aucune validation réglementaire et aucun règlement externe en argent
réel n'est assuré par le seul RBAC.

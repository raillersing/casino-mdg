# Back-office — Dossiers joueurs et caisse SIM (lots P2/P3 pilote)

## Réalisé

### Joueurs

- `GET /api/v1/backoffice/players/?q=&limit=25&offset=0` :
  recherche sur pseudo, téléphone et email ; exclut comptes staff.
  Les coordonnées sont **masquées** pour les staff non-superuser ;
  filtre `state=active|suspended|all`, pagination bornée.
- `GET /api/v1/backoffice/players/<id>/` : dossier détaillé **superuser
  uniquement**, regroupant identité vérifiée, KYC courant, soldes par
  devise, dernières transactions et intents de paiement. Ne permet pas
  de modifier de données ni d'effectuer des paiements.

### SIM seulement

- `GET /api/v1/backoffice/sim/summary/` : totaux des comptes SIM,
  débits/crédits du journal SIM et demandes en attente ;
  **aucune conversion** en MGA.
- `GET /api/v1/backoffice/sim/ledger/` : journal SIM et écritures
  double entrée, accès superuser, pagination bornée.
- `GET/POST /api/v1/backoffice/sim/adjustments/` : création d'une
  demande de dotation **non exécutée**, pour un joueur actif non staff,
  montant entier compris entre 1 et 1 000 000 SIM, justification d'au
  moins 20 caractères et en-tête `Idempotency-Key`.
- `POST /api/v1/backoffice/sim/adjustments/<uuid>/decision/` :
  `{"action":"approve|reject","reason":"...","mfa_code":"123456"}`,
  **superuser avec TOTP confirmé**, différent du demandeur, verrou
  de ligne PostgreSQL et transaction atomique. L'approbation appelle
  `credit_simulation_reward` déjà présent, qui génère les deux
  écritures SIM opposées. Un replay ne crédite pas une seconde fois.
  Le refus ne touche aucun solde.
- Motif, acteur, horodatage et transaction créée sont visibles dans
  `AuditEvent` et `BalanceAdjustmentRequest`.

## À ne pas faire

- Ne **jamais** injecter directement un solde via une requête SQL, un
  serializer `PATCH` ou un `UPDATE` d'un compte.
- Ne pas accepter de devise `MGA` dans les commandes SIM ; l'entité de
  dotation n'a intentionnellement **pas** de champ de devise.
- Le mode réel et le rapprochement PSP externe restent **verrouillés**.
- Ne pas permettre l'approbation par la personne qui a demandé la
  dotation, même si elle est superuser.
- Un total de débits égal au total des crédits ne garantit pas la
  fiabilité du solde PSP, qui nécessite une autre réconciliation.

## Dette technique et sécurité restant à implémenter

- RBAC fin au lieu des seules permissions staff/superuser.
- Authentification administrateur forte complète, enregistrement et
  révocation des appareils et des sessions, revue périodique d'accès.
- Dossiers fraude, sanctions, contestations et export des rapports.
- Rapprochement des écritures SIM sur snapshots et règles d'anomalies.
- Scénarios de concurrence simultanée sur un vrai PostgreSQL de staging,
  tests E2E à deux opérateurs distincts, contrôle UX mobile.
- Audit juridique et prestataires avant tout flux MGA.

Documentation Django sur `select_for_update` :
https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update

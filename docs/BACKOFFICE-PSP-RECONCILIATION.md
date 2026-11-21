# Contrôle de rapprochement par transaction — CasinoMDG

Endpoint en lecture seule : `GET /api/v1/backoffice/finance/reconciliation/items/`.
Réservé au rôle `casino:finance_auditor` (ou super-administrateur) ; filtre `days=1|7|30|90`,
`provider=mvola|orange|airtel|all` ; pagination `limit`/`offset`.

Source : modèle PaymentIntent, WebhookInboxEvent, WalletTransaction et
LedgerEntry ; aucun appel aux API de règlement MVola, Orange Money ou Airtel.

Pour chaque intention MGA, l'API vérifie le lien
`WalletTransaction.metadata.payment_intent_id`, montant, devise,
direction, utilisateur, statut, écritures débit/crédit et webhook traité.
Elle signale les références prestataires dupliquées, les écritures
manquantes et les statuts contradictoires.

**Aucune donnée externe ne prouve un règlement.**
`external_psp_settlement_verified` et
`real_money_activation_authorized` sont toujours `false`.
Les lignes sans problème sont qualifiées **internally_consistent**,
pas **settled**.

Prochaines étapes obligatoires avant de l'argent réel :
1. Accords et accès techniques authentifiés avec chaque prestataire.
2. Import quotidien des relevés PSP signés et contrôle de l'exhaustivité,
   rapprochement 1:1 des références et des montants, gestion des écarts.
3. Gestion des remboursements, annulations, rapprochements bancaires,
   incident et piste d'audit contrôlée.
4. Audit sécurité indépendant, contrôle des décisions réglementaires,
   staging et tests opérationnels de bout en bout.

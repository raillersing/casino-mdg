# Back-office CasinoMDG — Supervision MGA, sans argent réel

## Fonctionnalités livrées

Le sous-module `/backoffice`, onglet **Finances**, permet au
**super-administrateur** de consulter les flux internes libellés MGA,
sans possibilité d'émettre une opération de débit, crédit, retrait ou
règlement :

- `GET /api/v1/backoffice/finance/overview/?days=1|7|30|90`
  : par période, classe les intentions de paiement `MGA` entre
  `metadata.sandbox=true` et **non classifiées**, détaille les
  intentions par fournisseur / direction / statut, les entrées du journal,
  les flux de dépôts/retraits terminés et les webhooks reçus / traités.
- `GET /api/v1/backoffice/finance/intents/?status=all|pending|processing|completed|failed|cancelled&limit=25&offset=0`
  : liste paginée d'intentions internes MGA. Ne renvoie pas le numéro de
  téléphone de paiement, le contenu complet `metadata` ou d'autre
  secret prestataire.
- Réservé aux `is_superuser=True` (authentifié et actif).
  Un membre du personnel non-superuser reçoit HTTP 403. `POST`,
  `PATCH` et autres écritures sont indisponibles.
- Les jetons `SIM` sont **exclus** des totaux MGA, sans conversion.
- `external_psp_reconciliation_verified=false` et
  `real_money_activation_authorized=false` sont explicites.
  Un intent non marqué sandbox **ne constitue en aucun cas la preuve**
  d'une opération réelle ; il est **non classifié** et à vérifier.

## Précautions comptables

- Les montants de transactions terminées sont des écritures **internes**
  `WalletTransaction`. Ne les présenter ni comme encaissements de banque
  ni comme revenus fiscalement établis.
- L'égalité des sommes débit/crédit du `LedgerEntry` MGA est seulement
  un contrôle **agrégé** : elle ne certifie ni l'affectation exacte de
  chaque écriture, ni la complétude, ni la présence d'une confirmation
  opérateur.
- Les soldes `held_balance` des joueurs sont un instantané courant,
  tandis que les flux sont bornés dans le temps : leurs dates de
  référence diffèrent et ils ne doivent pas être additionnés.
- Les webhooks reçus / traités sont des événements internes, non une
  preuve de fonds reçus.
- **Aucun** chemin d'activation des paiements réels n'est introduit.

## Contrôles de recette

1. Vérifier HTTP 401/403 pour visiteurs, joueurs et staff, et la
   lecture seule pour superuser.
2. Créer des intents sandbox et anciens intents sans classification :
   l'API doit les séparer sans qualifier l'ancien comme « réel ».
3. Injecter un flux SIM et un flux MGA connus : les chiffres affichés
   doivent exclure SIM.
4. Vérifier les erreurs de pagination et de période et le non-affichage
   de `phone_number`/secret de paiement.
5. Comparer les chiffres MGA à des requêtes SQL indépendantes sur une
   base de **staging isolée**.
6. Pour des opérations réelles futures, réaliser une revue indépendante
   des habilitations, contrats PSP, signatures, approbations, soldes,
   justificatifs et relevés externes.

Références : [OWASP contrôle d'accès](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[OWASP autorisation des transactions](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html),
[Django QuerySet](https://docs.djangoproject.com/en/5.2/ref/models/querysets/).

# Lot P0-02 — Intégrité des KPI financiers de CasinoMDG

Les indicateurs **MGA** du back-office proviennent désormais exclusivement des
transactions serveur `WalletTransaction(currency_code="MGA", status="completed")`.
Les montants des parties `GameResult`, `InstantPlay`, `DrawEntry` et
`GameParticipant` n'indiquent pas à eux seuls une devise monétaire : ils ne
doivent jamais être additionnés à une somme MGA.

- `total_stakes_mga` : transactions de jeu MGA terminées, direction `debit`.
- `total_payouts_mga` : transactions de jeu MGA terminées, direction `credit`.
- `ggr_mga = stakes_mga - payouts_mga` : **indicateur technique brut** ;
  non validé comme revenu réglementaire, sans taxes/bonus/frais/chargebacks.
- `deposits_volume_mga`, `withdrawals_volume_mga` : flux de wallet MGA
  terminés. Ce ne sont pas une preuve autonome du règlement bancaire ou PSP.
- `tables_created` : nombre de `GameTable` persistées, sans addition de
  `ProductEvent(table_created)` déclaré côté client.
- Attribution MGA par jeu : uniquement transactions de jeu avec
  `metadata.game_type` explicite. Les résultats sans métadonnée d'attribution
  n'apparaissent pas dans la ventilation par jeu ; ils restent dans le total MGA.
- Classement : les nombres de victoires peuvent venir des résultats jeu, mais
  les **montants MGA** proviennent uniquement des écritures du wallet MGA.
- `sim_overview` : indicateurs en jetons `SIM` séparés des flux MGA ;
  aucune conversion SIM ↔ MGA.
- `metric_provenance` documente les sources dans l'API.

## Limites restantes

Ces changements empêchent de mélanger les devises dans le dashboard
exécutif. Ils ne constituent pas encore une revue complète de toutes les
règles financières : un audit séparé des `PaymentIntent`, des écritures
`LedgerEntry`, des statuts et des adaptateurs PSP, ainsi qu'une
réconciliation vers le relevé opérateur, reste obligatoire.
L'activation des fonds réels demeure interdite dans ce lot.

Documentation des verrous et transactions :
https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update

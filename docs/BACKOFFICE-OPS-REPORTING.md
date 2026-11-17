# CasinoMDG — Rapports et supervision fondés sur des preuves (P4/P5)

## Sources et limites

Le back-office regroupe deux classes de données, sans les confondre :
- **Métriques serveur** : lignes persistées dans `User`, `GameTable`,
  `GameResult`, `MatchmakingTicket`, `WalletTransaction`,
  `PaymentIntent` et `WebhookInboxEvent`.
- **Télémétrie client** : facultative, déclarative ; elle peut informer l'UX
  mais ne démontre ni fin de partie ni paiement finalisé.

Un `GameTable.status=running` peut être attribué lors du remplissage des
places **avant l'admission WebSocket** : afficher « en cours (BDD) » ne
constitue pas une preuve que le moteur Go traite une partie.

Le reporting ne mélange **jamais** MGA et SIM. Le nombre d'intents ou de
webhooks n'est pas une preuve autonome de règlement PSP externe.
Le score d'aptitude à la production auparavant fixé à 88/100 et
des « capacités prêtes » théoriques sont supprimés de l'API :
`production_readiness_score=null`, `readiness_evidence.status=not_assessed`,
`capacity_tiers=[]`. Seuls des tests de charge *reproductibles*,
l'audit de sécurité et les tests multijoueur permettent de conclure.

## API

- `GET /api/v1/backoffice/reports/overview/?days=1|7|30|90`
  : agrégats sur joueurs, tables, résultats enregistrés, matchmaking,
  flux SIM/MGA distincts, intents PSP et webhooks.
  Aucun téléphone ou email n'est présent dans la réponse. Staff seulement.
- `GET /api/v1/backoffice/reports/export.csv?days=1|7|30|90`
  : **superuser seulement**, export des seuls agrégats (pas de dossier
  individuel), journalisation `AuditEvent`, cache HTTP désactivé.
- `GET /api/v1/backoffice/games/tables/?status=all|open|running|finished&limit=25&offset=0`
  : liste bornée de tables serveur pour supervision, **sans code d'accès
  aux tables privées ni JWT d'admission**.
- L'écran `/backoffice` fournit un rapport synthétique et un suivi des
  tables, y compris l'export CSV si l'utilisateur est habilité.

## Vérifications avant publication

1. Tester les appels anonymes, joueur, staff et superuser.
2. Contrôler que la liste des tables privées n'expose jamais leur code.
3. Générer des données SIM et MGA connues et vérifier la séparation des
   flux par devise, période, type et statut.
4. Contrôler que les exports ne contiennent aucune donnée nominative
   et sont auditables.
5. Comparer les rapports à des requêtes SQL indépendantes sur staging.
6. Exécuter des parties et tests de charge réels avant d'afficher une
   quelconque certification de préparation production.

Références :
- OWASP Authorization :
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- Django ORM aggregation :
  https://docs.djangoproject.com/en/5.2/topics/db/aggregation/

# P0 sécurité — Mode PSP sandbox imposé par le backend

**Raison :** le code antérieur acceptait `sandbox=false` dans
`POST /api/v1/payments/intents/` et transmettait ce booléen directement
à l'adaptateur Mobile Money. Si des identifiants réels avaient été
configurés, une demande cliente pouvait déclencher le chemin live.

## Règle implémentée

- L'API répond **503** à toute valeur `sandbox` différente du booléen
  JSON `true`. Si la propriété est absente, `true` est utilisé.
- Le service `initiate_payment_intent` refuse lui aussi toute demande
  `sandbox=False`, **avant toute création d'intent, réservation de fonds
  ou appel réseau**. Les autres voies d'appel ne peuvent donc pas
  contourner le contrôle de l'API.
- Chaque nouvel intent sandbox porte `metadata.sandbox=true`, permettant
  à un auditeur de distinguer une simulation d'une demande live.
- Les enregistrements `MGA` générés en **sandbox** ne prouvent pas qu'un
  opérateur a effectivement transféré de l'argent. Ils ne doivent jamais
  être comptabilisés comme des dépôts de trésorerie réelle sans rapprochement.
- Aucun paramètre d'environnement n'active le chemin live dans ce lot.
  Une autorisation juridique, des validations d'opérateurs, des contrôles
  PSP et des tests en staging seront requis **dans une PR distincte**
  avant toute ouverture du mode réel.

## Tests

- `sandbox=false` JSON -> 503, sans mutation.
- `sandbox="false"` JSON -> 503, sans mutation.
- Appel direct du service avec `sandbox=False` -> `ValidationError`,
  sans mutation.
- `sandbox=true` -> parcours de simulation existant, intent annoté
  `metadata.sandbox=true`.

## Garde supplémentaire sur les webhooks génériques

- Avec `DEBUG=False`, le webhook de simulation renvoie **503** sauf si
  `PAYMENT_SANDBOX_WEBHOOKS_ENABLED=True` **ET** si un secret HMAC non
  trivial (32 caractères minimum, différent du secret de développement)
  est configuré.
- Ce mécanisme est exclusivement destiné au staging isolé. Il ne
  remplace pas la vérification de signature/contrat d'un opérateur réel.
- En mode déployé, le service de règlement refuse les intents historiques
  ou non classifiés qui ne portent pas `metadata.sandbox=True`.
- Toute écriture MGA créée depuis un intent de test doit conserver
  `metadata.sandbox=True` afin d'empêcher sa présentation comme un
  paiement effectivement reçu.
- Le webhook ne permet pas d'activer les paiements réels. Aucun
  fournisseur n'a été authentifié ni testé en conditions réelles.

## Limites à traiter avant une activité MGA réelle

L'inbox de webhooks et le grand livre historique demandent un audit
indépendant, notamment sur l'authenticité des signatures fournisseurs,
le secret webhook de production, les références, montants, devises,
états de simulation, horodatages, rejets et conflits. Les tests unitaires
ne suffisent pas à prouver un règlement opérateur.

Références :
- OWASP Transaction Authorization :
  https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html
- Django transactions :
  https://docs.djangoproject.com/en/5.2/topics/db/transactions/
- Décret Madagascar n° 2026-472 (jeux d'argent) :
  https://cnlegis.gov.mg/uploads/D2026-472-VF.pdf

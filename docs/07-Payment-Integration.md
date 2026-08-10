# Intégration Paiements V2 — iGaming Madagascar Platform
## Payment Integration Document (Révision critique)

**Version:** 2.0  
**Date:** 2026-08-10  
**Statut:** Draft — due diligence obligatoire avant développement  
**Public cible:** Lead Backend, Finance Ops, CTO, Business Lead

---

## 1. Ce qui a changé depuis V1

| Changement | V1 | V2 |
|------------|-----|-----|
| API MVola supposées REST | Endpoints inventés | **Due diligence obligatoire** + fallback |
| Pas d'agrégateur | — | **PayDunya comme fallback** |
| Pas de webhook inbox | — | **Pattern inbox documenté** |
| Reconciliation | Quotidienne | **Toutes les heures** pour pending > 1h |
| Circuit breaker | Mentionné | **Implémenté avec table DB** |
| Cartes bancaires | PCI DSS | **Tokenization Stripe uniquement** |

---

## 2. Due diligence paiements — ÉTAT ACTUEL

### ⚠️ AVERTISSEMENT CRITIQUE
Les spécifications API ci-dessous pour MVola et Orange Money sont **hypothétiques** basées sur les patterns standards des APIs mobile money africains. **Aucune documentation officielle n'a été consultée.**

### 2.1 Actions immédiates requises

| Opérateur | Action | Responsable | Deadline |
|-----------|--------|-------------|----------|
| **MVola (Telma)** | Demander documentation API tiers | Business Lead | Semaine 1 |
| **Orange Money** | Demander documentation API tiers | Business Lead | Semaine 1 |
| **Airtel Money** | Demander documentation API tiers | Business Lead | Semaine 2 |
| **PayDunya** | Vérifier si agrégateur compatible | Business Lead | Semaine 1 |
| **Jula** | Alternative à PayDunya | Business Lead | Semaine 2 |
| **Stripe** | Vérifier couverture Madagascar | Tech Lead | Semaine 1 |

### 2.2 Questions à poser aux opérateurs

1. **Avez-vous une API REST/SOAP pour les tiers ?** Quelle est la documentation ?
2. **Quel est le processus de partenariat ?** Délai, coût, conditions ?
3. **Supportez-vous les webhooks ?** Format, signature, retry ?
4. **Quels sont les plafonds transactionnels ?** Par transaction, par jour, par mois ?
5. **Quel est le SLA ?** Uptime garanti, temps de réponse support ?
6. **Y a-t-il des restrictions pour l'iGaming ?** Certains opérateurs refusent.
7. **Quel est le processus de onboarding marchand ?** Documents requis, délai.

### 2.3 Plan B — Agrégateurs

Si MVola/Orange n'ont pas d'API directe propre :

| Agrégateur | Pays couverts | API | Coût |
|------------|---------------|-----|------|
| **PayDunya** | Sénégal, CIV, Mali, Burkina, Togo | REST JSON | ~2-3% |
| **Jula** | CIV, Sénégal, Mali, Burkina | REST JSON | ~2-3% |
| **DPO Pay** | Plusieurs pays africains | REST JSON | Variable |

**Problème** : PayDunya couvre principalement l'Afrique de l'Ouest, pas Madagascar. Vérifier si MVola/Orange sont déjà intégrés.

---

## 3. Architecture Paiements V2

### 3.1 Vue globale (correcte)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT                                    │
│                         │                                        │
│   ┌─────────────────────┴─────────────────────┐                  │
│   │           WALLET SERVICE (Django)         │                  │
│   │                                             │                  │
│   │  ┌─────────┐   ┌─────────┐   ┌────────┐   │                  │
│   │  │ Deposit │   │Withdraw │   │Ledger  │   │                  │
│   │  │ Manager │   │ Manager │   │Engine  │   │                  │
│   │  └────┬────┘   └────┬────┘   └────────┘   │                  │
│   └───────┼─────────────┼─────────────────────┘                  │
│           │               │                                      │
│           ▼               ▼                                      │
│   ┌──────────────┐  ┌──────────────┐                            │
│   │   Payment    │  │   Payment    │                            │
│   │   Adapter    │  │   Adapter    │                            │
│   │  (MVola)     │  │  (Orange)    │                            │
│   │  [Direct]    │  │  [Direct]    │                            │
│   └──────┬───────┘  └──────┬───────┘                            │
│          │                  │                                    │
│          ▼                  ▼                                    │
│   ┌────────────┐     ┌────────────┐                              │
│   │  MVola API │     │ Orange API │                              │
│   │  (REST?)   │     │  (REST?)   │                              │
│   └────────────┘     └────────────┘                              │
└─────────────────────────────────────────────────────────────────┘

Fallback si API directe indisponible :
   Wallet Service ──► PayDunya Adapter ──► PayDunya API ──► MVola/Orange
```

### 3.2 Webhook Inbox Pattern (détaillé)

```
MVola envoie webhook POST /webhooks/mvola
    │
    ▼
┌─────────────────┐
│ 1. RECEIVE      │  ← Validation signature HMAC immédiate
│                 │     Si signature invalide → 401 + log
│ 2. STORE        │  ← INSERT INTO webhook_inbox (status='pending')
│                 │     Jamais de logique métier ici
│ 3. ACK 200      │  ← Répondre 200 à MVola immédiatement
└─────────────────┘
    │
    ▼ (async, toutes les 30s)
┌─────────────────┐
│ Worker Celery   │
│                 │
│ 4. READ inbox   │  ← SELECT * WHERE status='pending'
│ 5. VALIDATE     │  ← Vérifier idempotency_key (déjà traité ?)
│ 6. PROCESS      │  ← Créditer wallet si dépôt
│ 7. UPDATE       │  ← status='processed' + processed_at
│ 8. ARCHIVE      │  ← Après 7 jours → S3
└─────────────────┘
```

**Règle critique** : Le webhook est stocké AVANT tout traitement. Si le worker crash, il retraite au prochain cycle.

### 3.3 Circuit Breaker (implémentation)

```python
class CircuitBreaker:
    """
    Pattern circuit breaker pour les API externes de paiement.
    """
    def __init__(self, service_name, failure_threshold=3, recovery_timeout=120):
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
    
    async def call(self, fn, *args, **kwargs):
        state = await self.get_state()
        
        if state == 'open':
            raise CircuitBreakerOpen(f"{self.service_name} temporarily unavailable")
        
        try:
            result = await fn(*args, **kwargs)
            await self.record_success()
            return result
        except Exception as e:
            await self.record_failure()
            raise
    
    async def record_failure(self):
        """Après N échecs → circuit open"""
        state = await self.get_state()
        if state == 'closed':
            failure_count = await self.increment_failure_count()
            if failure_count >= self.failure_threshold:
                await self.set_state('open')
                await self.schedule_half_open()
    
    async def schedule_half_open(self):
        """Après timeout → half-open (1 test)"""
        await asyncio.sleep(self.recovery_timeout)
        await self.set_state('half_open')
```

**Table circuit_breaker_states** (voir DB Schema V2) :
- `service_name` : 'mvola_api', 'orange_api'
- `state` : 'closed' (normal), 'open' (bloqué), 'half_open' (test)
- `failure_count` : nombre d'échecs consécutifs
- `next_retry_at` : timestamp prochain test

**Comportement utilisateur** quand circuit open :
```json
{
  "error": "CIRCUIT_OPEN",
  "message": "Paiements MVola temporairement indisponibles",
  "message_mg": "Tsy misy ny fandoavana MVola amin'izao fotoana izao",
  "fallback_options": ["orange_money", "paydunya"],
  "estimated_recovery": "2026-08-10T15:00:00Z"
}
```

---

## 4. Intégration MVola — Spécifications hypothétiques

> **À valider avec Telma.** Ces endpoints sont des **hypothèses** basées sur les patterns APIs mobile money africains.

### 4.1 Authentification (hypothèse)
```
Type: OAuth2 Client Credentials
Token URL: https://api.mvolamoney.mg/oauth/token
Client ID: [à obtenir]
Client Secret: [Vault]
Scope: payments:read payments:write
TTL token: 3600s
```

### 4.2 Initier un paiement (dépôt)
```
POST /api/v1/payments/initiate
Headers:
  Authorization: Bearer {access_token}
  Content-Type: application/json
  X-Idempotency-Key: {uuid}
  X-Signature: {hmac_sha256(body, secret)}

Body:
{
  "amount": 50000,
  "currency": "MGA",
  "customer_phone": "+26134xxxxxxx",
  "description": "Dépôt Casino MDG",
  "callback_url": "https://api.casino-mdg.mg/webhooks/mvola",
  "reference": "TXN-20260810-000001",
  "expires_in_minutes": 30
}

Response 200:
{
  "payment_id": "MVOLA_PAY_abc123",
  "status": "pending",
  "payment_url": "https://pay.mvolamoney.mg/abc123",
  "expires_at": "2026-08-10T12:30:00Z"
}
```

### 4.3 Webhook confirmation (hypothèse)
```
POST /webhooks/mvola
Headers:
  X-MVola-Signature: sha256=abc123...
  X-MVola-Timestamp: 1723300800
  X-MVola-Idempotency-Key: {uuid}

Body:
{
  "event": "payment.completed",
  "payment_id": "MVOLA_PAY_abc123",
  "reference": "TXN-20260810-000001",
  "amount": 50000,
  "currency": "MGA",
  "customer_phone": "+26134xxxxxxx",
  "status": "completed",
  "completed_at": "2026-08-10T12:05:00Z",
  "transaction_id": "MVOLA_TXN_xyz789"
}

Vérification:
  expected = HMAC-SHA256(body, webhook_secret)
  assert signature == expected
  assert timestamp > now - 300s  // replay protection
  assert idempotency_key not seen before
```

### 4.4 Payout (retrait vers client)
```
POST /api/v1/payments/payout
Body:
{
  "amount": 30000,
  "currency": "MGA",
  "recipient_phone": "+26134xxxxxxx",
  "recipient_name": "Jean Rakoto",
  "description": "Retrait Casino MDG",
  "reference": "WDR-20260810-000001"
}

Response:
{
  "payout_id": "MVOLA_OUT_def456",
  "status": "processing",
  "estimated_completion": "2026-08-10T14:00:00Z"
}
```

---

## 5. Intégration Orange Money — Spécifications hypothétiques

Structure similaire MVola avec adaptations Orange Money Madagascar.

| Aspect | MVola (hypothèse) | Orange Money (hypothèse) |
|--------|-------------------|--------------------------|
| API Base | api.mvolamoney.mg | api.orange.mg/om |
| Auth | OAuth2 | OAuth2 ou API Key |
| Webhook sig | HMAC-SHA256 | HMAC-SHA256 |
| Timeout dépôt | 30 min | 30 min |
| Timeout retrait | 24-48h | 24-48h |
| Plafond dépôt | À confirmer | À confirmer |
| Plafond retrait | À confirmer | À confirmer |

---

## 6. Cartes bancaires (P1) — Tokenization uniquement

### 6.1 Stripe Elements
```html
<!-- Frontend React -->
<script src="https://js.stripe.com/v3/"></script>
<StripeElements
  options={{
    mode: 'payment',
    amount: 50000,
    currency: 'mga'
  }}
>
  <PaymentElement />
</StripeElements>
```

### 6.2 Flux backend
```
1. Frontend crée PaymentIntent via Stripe.js
2. Stripe retourne client_secret
3. Frontend confirme paiement (3DS si nécessaire)
4. Stripe envoie webhook payment_intent.succeeded
5. Notre backend reçoit webhook (token uniquement)
6. Crédite wallet
```

**Aucun numéro de carte ne transite par notre serveur.**

---

## 7. Rapprochement V2 (amélioré)

### 7.1 Fréquence

| Type | Fréquence | Action si écart |
|------|-----------|----------------|
| Pending > 1h | Toutes les heures | Alerte Slack |
| Pending > 4h | Toutes les 4h | Alerte email + escalation |
| Pending > 24h | Quotidien 02:00 UTC | Alerte PagerDuty |
| Toutes transactions | Quotidien 02:00 UTC | Rapport auto |

### 7.2 Processus

```
Cron : toutes les heures
────────────────────────
1. Exporter transactions DB (status=pending, age>1h)
2. Exporter transactions externes (MVola dashboard/API)
3. Matcher par external_reference
4. Écarts :
   ├─ Transaction DB sans webhook → investigation
   ├─ Webhook sans transaction DB → créer + investigate
   ├─ Montant mismatch → ALERTE CRITIQUE PagerDuty
   └─ Statut mismatch → update + investigate
5. Générer rapport
6. Si écart > 0 : alerte Finance Ops + CTO
```

---

## 8. Checklist intégration paiement V2

### Phase 0 — Due diligence (Semaine 1-2)
- [ ] Contacter Telma (MVola) — demander API documentation
- [ ] Contacter Orange Money — demander API documentation
- [ ] Contacter Airtel Money — demander API documentation
- [ ] Contacter PayDunya — vérifier couverture Madagascar
- [ ] Vérifier Stripe — couverture Madagascar
- [ ] Documenter réponses dans ce fichier

### Phase 1 — Sandbox (Semaine 3-6)
- [ ] Créer compte sandbox avec chaque opérateur
- [ ] Tester endpoints dépôt + retrait
- [ ] Tester webhooks (signature, retry, idempotence)
- [ ] Tester circuit breaker (simuler panne API)
- [ ] Tester reconciliation

### Phase 2 — Production (post-juridique)
- [ ] Accords commerciaux signés
- [ ] Credentials prod dans Vault
- [ ] Monitoring webhooks actif
- [ ] Reconciliation auto testée
- [ ] Playbook litige documenté

---

## 9. Annexes

### A. Questions FAQ opérateurs (à poser)
1. Quel est le délai de validation du partenariat marchand ?
2. Quels documents sont requis pour le KYC opérateur ?
3. Y a-t-il un dépôt de garantie ?
4. Quel est le processus de litige transaction ?
5. Quel est le support technique (email, téléphone, Slack) ?

### B. Contacts à trouver
- Telma Business / MVola : [à rechercher]
- Orange Money Business : [à rechercher]
- Airtel Money Business : [à rechercher]
- PayDunya : hello@paydunya.com (à vérifier)

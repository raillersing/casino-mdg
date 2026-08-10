# Sécurité & Conformité V2 — iGaming Madagascar Platform
## Security & Compliance Document (Révision critique)

**Version:** 2.0  
**Date:** 2026-08-10  
**Classification:** CONFIDENTIEL  
**Public cible:** Security Engineer, CTO, Compliance Officer

---

## 1. Ce qui a changé depuis V1

| Changement | V1 | V2 |
|------------|-----|-----|
| PCI DSS Level 1 mentionné | Oui | **Supprimé — Tokenization uniquement** |
| Anti-bot | Device fingerprinting seul | **+ reCAPTCHA v3 + patterns + honey pots** |
| Pas de statut connexion fraude | — | **is_connected tracking** |
| Logs audit | SQL table | **+ S3 immuable + hash HMAC** |
| Feature flags sécurité | Absent | **Kill switch intégré** |
| Réponse incidents | Manuelle | **Playbooks documentés + PagerDuty** |

---

## 2. PCI DSS — Approche correcte

### ❌ Ce qu'il ne faut PAS faire
- Stocker des numéros de carte dans PostgreSQL
- Traiter des CVV même temporairement
- Avoir un scope SAQ D (le plus lourd)

### ✅ Ce qu'il faut faire
- **Stripe Elements** (hosted fields) : carte saisie chez Stripe, token reçu
- **Stripe.js** côté client : aucune donnée carte ne transite par notre serveur
- **Scope PCI : SAQ A** (le plus léger, questionnaire court)
- **Stripe Vault** : stockage token PCI-compliant

### Architecture paiement carte
```
Utilisateur saisit carte ──► Stripe.js (iframe Stripe)
                                │
                                ▼
                         Stripe (PCI Level 1)
                                │
                                ▼
                    Token : tok_visa_xxx (jamais PAN)
                                │
                                ▼
                    Notre Backend (charge avec token)
                                │
                                ▼
                    Wallet Service (crédite jetons)
```

**Règle absolue** : Notre backend ne voit JAMAIS de numéro de carte brute. Jamais.

---

## 3. Anti-bot V2

### 3.1 Défense en couches (defense in depth)

```
Couche 1 : Inscription
├── reCAPTCHA v3 invisible (score < 0.3 = challenge)
├── Rate limiting : max 3 inscriptions / 5 min / IP
├── Email / téléphone vérification obligatoire
└── Détection email jetable

Couche 2 : Connexion
├── Rate limiting login : 5 essais / min
├── Device fingerprint mismatch = MFA forcé
├── IP géolocalisation (si pays inattendu = alerte)
└── Session binding (token + device_fp + IP)

Couche 3 : Table de jeu
├── Max 1 action / seconde par joueur
├── Détection timing (écart type < 50ms = bot)
├── Mouse movement analysis (trajectoire humaine = bruitée)
└── Honey pot tables (voir ci-dessous)

Couche 4 : Financier
├── Dépôts : reCAPTCHA + confirmation SMS
├── Retraits : KYC + revue manuelle > seuil
└── Patterns "round tripping" = AML alerte
```

### 3.2 Détection timing (bot)

```python
def is_bot_timing(actions: List[Action]) -> bool:
    """
    Un humain a des temps de réponse variables (200ms-5s).
    Un bot a des temps constants (ex: exactement 500ms chaque fois).
    """
    if len(actions) < 5:
        return False  # pas assez de données
    
    response_times = [actions[i+1].timestamp - actions[i].timestamp 
                     for i in range(len(actions)-1)]
    
    std_dev = statistics.stdev(response_times)
    mean_time = statistics.mean(response_times)
    
    # Bot : écart-type très faible, moyenne régulière
    if std_dev < 50 and mean_time > 100:  # ms
        return True
    
    # Bot avancé : temps aléatoires mais dans une plage étroite
    if max(response_times) - min(response_times) < 200:
        return True
    
    return False
```

### 3.3 Honey Pot Tables (V2)

```
Tables "test" invisibles aux vrais utilisateurs :
  - Accessibles uniquement via DOM scraping (pas de lien normal)
  - Affichent un "bug" visuel (carte de plus, bouton invisible)
  - Seul un bot qui parse le DOM voit ces tables
  - Si un compte rejoint une honey pot → FLAG immédiat bot
  - Pas de sanction automatique (faux positif possible)
  → Score fraude +40, revue manuelle
```

### 3.4 Mouse Movement Analysis (V2)

```javascript
// Client-side (pas bloquant)
function analyzeMouseMovement(events) {
    // Humain : trajectoire bruitée, courbes, hésitations
    // Bot : lignes droites, angles parfaits
    
    const features = {
        curvature_variance: calculateCurvature(events),
        hesitation_points: detectHesitation(events),  // mouvements circulaires
        straight_line_ratio: detectStraightLines(events)
    };
    
    // Envoyer au serveur avec requête critique (pas temps réel)
    if (features.straight_line_ratio > 0.8) {
        reportSuspicious('likely_bot_mouse', features);
    }
}
```

---

## 4. Kill Switches (Feature Flags Sécurité)

### 4.1 Flags de sécurité

```sql
INSERT INTO feature_flags (name, enabled, description) VALUES
('disable_new_registrations', false, 'Bloquer nouvelles inscriptions (attaque)'),
('disable_all_games', false, 'Bloquer toutes les tables (incident critique)'),
('disable_real_money', false, 'Bloquer mode réel (incident financier)'),
('disable_mvola_payments', false, 'Bloquer MVola (problème API)'),
('force_kyc_all_users', false, 'Forcer KYC pour tous (suspicion fraude)'),
('emergency_maintenance', false, 'Mode maintenance global');
```

### 4.2 Activation rapide

```python
# Middleware
class KillSwitchMiddleware:
    def process_request(self, request):
        if FeatureFlag.is_enabled('emergency_maintenance') and not request.user.is_superuser:
            return Response(
                {"error": "maintenance", "message": "Maintenance en cours. Réessayez dans 30 minutes."},
                status=503
            )
        
        if FeatureFlag.is_enabled('disable_all_games') and request.path.startswith('/games/'):
            return Response(
                {"error": "games_disabled", "message": "Tables temporairement indisponibles."},
                status=503
            )
```

**Activation** : Superuser via back-office ou Cloudflare Worker (edge) en cas d'attaque DDoS massive.

---

## 5. Logs d'audit V2 — Immuabilité renforcée

### 5.1 Triple stockage

| Couche | Technologie | Durée | Accès |
|--------|-------------|-------|-------|
| Hot | PostgreSQL `audit_logs` | 7 jours | Application |
| Warm | S3 (parquet, partitionné jour) | 1 an | Superuser |
| Cold | S3 Glacier | 7 ans | Legal hold |

### 5.2 Hash chaîne (blockchain-like)

```python
def create_audit_log(event_type, data):
    previous_log = get_last_audit_log()
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "event_type": event_type,
        "data": data,
        "previous_hash": previous_log.integrity_hash if previous_log else "0" * 64
    }
    
    # Hash de l'entrée courante + hash précédent
    log_entry["integrity_hash"] = sha256(
        json.dumps(log_entry, sort_keys=True).encode()
    ).hexdigest()
    
    return log_entry
```

**Propriété** : Modifier un log ancien invalide tous les logs suivants. Détection immédiate.

---

## 6. Jeu Responsable V2

### 6.1 Limites configurables (dès simulation)

```python
class UserLimits:
    # Par défaut conservateurs pour Madagascar (revenus moyens)
    deposit_daily_limit = 50000    # MGA (~10 USD)
    deposit_weekly_limit = 200000  # MGA (~40 USD)
    session_time_limit = 120       # minutes
    
    # Augmentation progressive si historique clean
    def increase_limits(self, user):
        if user.clean_history_months >= 3:
            self.deposit_daily_limit *= 1.5
```

### 6.2 Détection comportements à risque (V2)

| Comportement | Seuil | Action |
|--------------|-------|--------|
| Sessions > 3h | 1x | Message pause |
| Sessions > 4h | 2x | Forcer déconnexion 15min |
| Dépôts > 3 en 2h | 1x | Message responsable |
| Dépôts > 5 en 24h | 1x | Suggestion limites |
| Perte > 80% dépôt | 1x | Cooldown 30min |
| Perte > 50% 3 jours de suite | 3x | Alerte + suggestion exclusion |
| Annulation retraits > 3 | 1x | Alerte + suggestion limites |
| Nuit (00h-06h) + session > 2h | 1x | Message "Prenez soin de vous" |

---

## 7. Playbooks incidents V2

### 7.1 Playbook — Attaque DDoS / Bot massif

```
DÉTECTION
├── Sentry alerte : rate limiting dépassé ×10
├── Grafana : requêtes /sec anormales
└── Cloudflare : challenge rate élevé

RÉPONSE (0-5 min)
1. Activer kill switch 'emergency_maintenance' (superuser)
2. Cloudflare : mode Under Attack (challenge JS)
3. Kong : rate limit global réduit à 10 req/min
4. AWS WAF : règle IP blacklist temporaire

INVESTIGATION (5-30 min)
5. Identifier pattern (IP, user-agent, géo)
6. Si bot : activer reCAPTCHA strict sur tous les endpoints
7. Si DDoS : AWS Shield Advanced (si activé)

RÉSOLUTION (30-60 min)
8. Nettoyer IP blacklist
9. Désactiver maintenance
10. Post-mortem
```

### 7.2 Playbook — Fuite de données suspectée

```
DÉTECTION
├── Alertes accès anormaux DB
├── Logs Vault : clés accédées
└── Signalement utilisateur

RÉPONSE IMMÉDIATE
1. Rotation immédiate de TOUTES les clés (Vault)
2. Révocation de tous les tokens JWT
3. Forcer reconnexion + MFA pour tous les admins
4. Gel des retraits pour investigation

INVESTIGATION
5. Audit complet des accès DB (7 jours)
6. Analyse des logs (qui a accédé à quoi)
7. Scanner les repositories pour secrets leakés

COMMUNICATION
8. Si données utilisateurs impactées : notification légale dans 72h
9. Support : FAQ prête
10. Transparence blog (si approprié)
```

---

## 8. Checklist sécurité MVP V2

### Avant beta
- [ ] reCAPTCHA v3 configuré sur inscription
- [ ] Rate limiting actif tous endpoints critiques
- [ ] Device fingerprinting opérationnel
- [ ] Logs audit immuables fonctionnels
- [ ] Kill switches configurés (testés)
- [ ] Circuit breaker paiements testé
- [ ] Webhook inbox (pattern) testé
- [ ] Feature flags opérationnels
- [ ] Back-office derrière IP whitelist + VPN
- [ ] MFA obligatoire tous comptes admin

### Avant argent réel
- [ ] Avis juridique écrit et validé
- [ ] Pentest applicatif sans critique
- [ ] Pentest infrastructure sans critique
- [ ] Audit RNG externe OK (GLI-19)
- [ ] Stripe Elements validé (pas de données carte chez nous)
- [ ] Procédures support documentées
- [ ] Plan jeu responsable approuvé
- [ ] KYC process testé end-to-end
- [ ] AML rules validées
- [ ] Insurance cyber (recommandé)

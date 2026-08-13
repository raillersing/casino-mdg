# Architecture Technique V2 — iGaming Madagascar Platform
## Technical Architecture Document (Révision critique)

**Version:** 2.0  
**Date:** 2026-08-10  
**Statut:** Draft révisé post-critique  
**Public cible:** CTO, Lead Backend, Lead Frontend, DevOps, Security Engineer

---

## 1. Ce qui a changé depuis V1

| Problème V1 | Correction V2 |
|-------------|---------------|
| Game Engine monolithique dans Django Channels | **Game Engine séparé** (Go + WebSocket dédié) |
| Pas de gestion reconnexion | **Snapshots Redis + grace period** |
| PCI DSS Level 1 dans monolithe | **Tokenization PSP uniquement**, zero données carte |
| MVP 4 jeux trop ambitieux | **MVP 3 jeux** : Poker (P0), Rami (P0), Belote (P0), Blackjack (P1) |
| API MVola/Orange supposées REST | **Due diligence obligatoire** + fallback agrégateur PayDunya |
| Pas d'anti-bot | **Détection comportements + honey pots** |
| Malgache en P1 | **Malgache P0 obligatoire** |
| Partitions Django ORM non supportées | **django-postgres-extra** ou SQL raw documenté |
| Pas de feature flags | **Feature flags DB** pour déploiement sans coupure |
| Pas de budget | **Estimation infra incluse** |

---

## 2. Principes directeurs V2

1. **Séparation des responsabilités** : Game Engine ≠ Business Logic ≠ Auth
2. **Résilience réseau** : Madagascar = connexions instables. Grace period, snapshots, reconnexion sans perte.
3. **Mobile money first, cartes last** : MVola/Orange Money en P0, cartes via tokenization en P1.
4. **Localisation native** : Malgache dès le MVP, pas en V2.
5. **Idempotence partout** : webhooks stockés avant traitement (inbox pattern).
6. **Zero carte brute** : jamais de numéro de carte dans notre infrastructure.

---

## 3. Vue d'ensemble de l'architecture V2

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐                                        │
│  │   Web App    │  │     PWA      │     React 18 + TypeScript + Vite       │
│  │  (React)     │  │  (Phase V2)  │     Socket.io-client + i18n          │
│  └──────┬───────┘  └──────┬───────┘                                        │
└─────────┼────────────────┼────────────────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDGE / CDN                                           │
│   Cloudflare — DDoS, WAF, CDN, TLS 1.3                                     │
│   + Feature flags edge (Cloudflare Workers) — kill switch global           │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY (Kong)                                   │
│   Rate limiting, auth JWT, routing, logging, transformation                  │
│   + Circuit breaker vers services externes                                   │
└─────────────────────────────────────────────────────────────────────────────┘
          │
    ┌─────┴─────┬─────────────┬─────────────┬─────────────┬─────────────┐
    ▼         ▼             ▼             ▼             ▼             ▼
┌────────┐ ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│ Auth   │ │ Wallet │   │  Game  │   │ Support│   │ Notif  │   │ Back   │
│Service │ │Service │   │Engine  │   │Service │   │Service │   │Office  │
│(Django)│ │(Django)│   │(Go)    │   │(Django)│   │(Django)│   │(React) │
│        │ │        │   │        │   │        │   │        │   │        │
└────────┘ └────────┘   └────────┘   └────────┘   └────────┘   └────────┘
    │         │             │             │             │             │
    └─────────┴─────────────┴─────────────┴─────────────┴─────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
           ┌──────────────┐   ┌──────────────┐
           │  Event Bus     │   │  Snapshot    │
           │  (RabbitMQ)    │   │  Store       │
           │                │   │  (Redis)     │
           │ - Transactions │   │              │
           │ - Game events  │   │ - Table state│
           │ - Webhooks     │   │ - Session    │
           └──────────────┘   └──────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INFRASTRUCTURE PARTAGÉE V2                          │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │PostgreSQL│  │ Redis  │  │RabbitMQ│  │MinIO/S3│  │Prometheus│  │Grafana │  │
│  │(RDS)   │  │(Cluster)│  │(3 nodes)│  │(KYC)   │  │+ Alert  │  │+ Sentry│  │
│  │        │  │        │  │        │  │        │  │        │  │        │  │
│  │ - Users│  │ - Cache│  │ - Events│  │ - Docs │  │ - Metrics│  │ - Dash │  │
│  │ - Wallet│ │ - Sessions││ - Jobs │  │ - Logs │  │ - Errors │  │        │  │
│  │ - Audit│  │ - Snap │  │ - Webhooks││        │  │        │  │        │  │
│  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Pourquoi Go pour le Game Engine

### Comparaison

| Aspect | Django Channels | Go (goroutines) | Node.js (Socket.io) |
|--------|-----------------|-----------------|---------------------|
| CCU par instance | ~100 | ~10 000+ | ~5 000 |
| Latence WS | ~50-100ms | ~5-20ms | ~10-30ms |
| CPU par connexion | Élevée | Très faible | Faible |
| Mémoire par connexion | ~5MB | ~50KB | ~200KB |
| Reconnexion élégante | Non native | Native + custom | Native |
| Side pots Poker | Complexe | Très simple | Simple |
| Écosystème iGaming | Faible | Moyen | Bon |

### Architecture Game Engine (Go)

```go
// Simplifié
package main

type Table struct {
    ID            uuid.UUID
    GameType      string      // "poker", "rami", "belote"
    State         TableState  // snapshot complet
    Players       map[int]*Player
    Deck          *Deck
    Pot           int
    Phase         GamePhase
    GracePeriod   time.Duration // 30s pour reconnexion MG
    LastActivity  time.Time
}

type TableState struct {
    Snapshot     []byte      // sérialisé pour Redis
    EventsSince  []GameEvent // depuis le snapshot
    Version      int64       // pour conflits optimistes
}
```

### Communication inter-services

```
Client ──WebSocket──► Game Engine (Go)
       │                    │
       │                    ├──► Redis (snapshots table)
       │                    ├──► PostgreSQL (parties terminées)
       │                    └──► RabbitMQ (events → Wallet, Notification)
       │
       └───REST───► API Gateway ──► Wallet Service (crédit/débit)
```

Le Game Engine ne touche **jamais** directement au wallet. Il publie des événements `game_ended` sur RabbitMQ. Le Wallet Service consomme et crédite/débite.

---

## 5. Résilience réseau — Contexte Madagascar

### 5.0 Simulation contrôlée par bots

Les simulations de parties utilisent une identité de service distincte des
comptes joueurs. Le backend orchestre une session `DEMO_AI`, puis ouvre une
connexion WebSocket par bot avec un jeton HMAC court, lié à `table_id`,
`bot_id`, `name` et `exp`. Le secret `GAME_ENGINE_BOT_SECRET` n'est jamais
envoyé au navigateur et doit être différent par environnement.

Le moteur accepte :

- un JWT utilisateur dans `?token=...` ;
- un jeton interne dans `?bot_token=...&table_id=...`.

Un payload public `role: bot` ou `is_bot: true` ne suffit jamais à obtenir une
identité bot. Le moteur vérifie la signature, l'expiration et la table avant
de créer le siège, puis publie `is_bot: true` dans l'état de table. Cette
séparation permet d'afficher les bots dans l'interface de démonstration sans
les confondre avec des joueurs humains ni ouvrir cette capacité aux clients.

### 5.1 Contrôle statistique des Jeux de hasard

Le endpoint back-office `POST /api/v1/games/chance-simulations/` exécute une
simulation pure en mémoire. Il accepte `slug`, `rounds` (1 à 100 000) et
`seed`. Il ne crée ni `InstantPlay`, ni `DrawEntry`, ni transaction wallet.
Pour les jeux instantanés, la réponse expose la distribution observée, le
coût total, le gain total, le RTP attendu et observé ainsi qu'un intervalle de
contrôle à trois erreurs standards. Pour les tirages, elle expose les
fréquences et les écarts relatifs. Le champ `anomaly` est un signal de revue,
pas une preuve de fraude : toute alerte doit être rejouée avec la même seed,
puis analysée avec un échantillon plus large.

Cette route est réservée aux utilisateurs staff et reste hors du parcours
joueur. Les résultats sont reproductibles, mais ne constituent pas un tirage
réel et ne doivent jamais créditer le portefeuille.

### Problème réel
- Connexions 3G/4G intermittentes
- Coupure électrique fréquentes (jirama)
- Utilisateurs qui basculent WiFi ↔ 4G pendant la partie

### Solutions

#### 5.1 Grace period (30 secondes)
```
Joueur déconnecte → Place "réservée" pendant 30s
                     - Cartes conservées
                     - Mise automatique (check/fold selon jeu)
                     - Pot gelé
                     
Joueur reconnecte dans les 30s → Reprend exactement où il était
Joueur ne reconnecte pas → Fold automatique (Poker) / Pass (Belote) / Écart (Rami)
```

#### 5.2 Snapshots Redis
```
Clé Redis : table_snapshot:{table_id}
TTL : 10 minutes (augmenté pendant une main active)
Contenu : état sérialisé complet de la table + events depuis snapshot

Reconnexion client :
  1. Demande snapshot + events manquants
  2. Reconstruction locale du state
  3. Reprise au point exact de déconnexion
```

#### 5.3 Reconnexion WebSocket
```javascript
// Client React
const reconnectGame = async (tableId, lastEventId) => {
  const socket = io('/game/' + tableId, {
    auth: { token, tableId },
    query: { last_event_id: lastEventId } // reprise depuis ce point
  });
  
  socket.on('reconnect', () => {
    // Demande state diff
    socket.emit('request_sync', { tableId, lastEventId });
  });
  
  socket.on('sync_data', (snapshot) => {
    // Applique snapshot + events
    setTableState(snapshot.state);
    applyEvents(snapshot.missedEvents);
  });
};
```

#### 5.4 Offline mode partiel
- Lecture profil, solde, historique : cache local (localStorage / IndexedDB)
- Notifications push quand connexion revient
- Pas de jeu offline (impossible pour du temps réel)

---

## 6. Stack technique V2 détaillé

### 6.1 Frontend

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Framework | React 18 + TypeScript strict | Typage, écosystème, recrutement facile |
| Build | Vite | Build < 1s, HMR instantané |
| State local | Zustand | Léger, pas de boilerplate Redux |
| Server state | TanStack Query (React Query) | Cache intelligent, retry auto, offline |
| Styling | Tailwind CSS + shadcn/ui | Mobile-first, dark mode natif |
| Real-time | Socket.io-client v4 | Reconnexion auto, rooms, ACK |
| i18n | react-i18next | Français + Malgache + English (fallback) |
| PWA | Vite PWA plugin | Installable Android, push notifications |
| Mobile V3 | React Native (Expo) | Code partagé si Expo SDK |
| Canvas jeux | PixiJS v7 | Rendu cartes performant, WebGL fallback |

### 6.2 Backend — Services Django REST (monolithe modulaire)

| Service | Django Apps | Base de données | Cache |
|---------|-------------|-----------------|-------|
| Auth | users, sessions, kyc | PostgreSQL users | Redis sessions |
| Wallet | ledger, transactions, payments | PostgreSQL wallet | Redis balances |
| Support | tickets, faq, exclusions | PostgreSQL support | Redis tickets |
| Notification | notifications, templates, push | PostgreSQL notif | Redis queue |
| Game Engine | **SÉPARÉ — Go** | PostgreSQL games | Redis snapshots |

### 6.3 Game Engine (Go)

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| Serveur WS | gorilla/websocket ou nhooyr/websocket | Connexions persistantes |
| Rooms | hash map en mémoire (goroutines) | Tables isolées |
| Events | NATS ou RabbitMQ (Go client) | Pub/sub inter-services |
| State | go-redis | Snapshots + grace period |
| RNG | crypto/rand | CSPRNG natif Go |
| Tests | testify + httpexpect + benchmark | Perf + correctness |

### 6.4 Base de données V2

| Usage | Technologie | Config V2 |
|-------|-------------|-----------|
| Données transactionnelles | PostgreSQL 15+ | Master + 2 replicas, partitionnement mois |
| Cache / Sessions / Snapshots | Redis 7+ Cluster | 3 maîtres + 3 répliques, persistence AOF |
| Queue events | RabbitMQ 3.12+ | 3 nœuds cluster, HA policy, DLX |
| Fichiers KYC | MinIO (S3) | 4 nœuds, erasure coding, lifecycle 7 ans |
| Search / Logs | Meilisearch ou Elasticsearch | Index users, tickets, transactions |
| Time-series metrics | InfluxDB ou Prometheus TSDB | Métriques perf, business |

### 6.5 Infrastructure V2

| Couche | Solution V2 | Coût estimé MVP/mois |
|--------|-------------|---------------------|
| Cloud | AWS (MVP) → DigitalOcean si coût trop élevé | 800-1500$/mois |
| Conteneurs | Docker + Kubernetes (EKS) | Inclus AWS |
| Game Engine | Kubernetes Deployment (3 replicas Go) | ~200$/mois (c5.large) |
| API Django | Kubernetes Deployment (2 replicas) | ~150$/mois |
| DB PostgreSQL | RDS PostgreSQL Multi-AZ (db.t3.medium) | ~300$/mois |
| Redis | ElastiCache Redis Cluster (cache.r6g.large) | ~200$/mois |
| RabbitMQ | CloudAMQP ou self-managed (EKS) | ~50$/mois |
| Storage | S3 Standard + IA | ~30$/mois |
| CDN | Cloudflare Pro | ~20$/mois |
| Monitoring | Prometheus + Grafana Cloud + Sentry | ~100$/mois |
| Secrets | HashiCorp Vault (self-hosted) | ~50$/mois |
| **TOTAL MVP** | | **~1700-2100$/mois** |

> 💡 **Note budget** : En Phase 0-1, on peut réduire à ~500$/mois avec DigitalOcean + une seule instance Redis + RabbitMQ simple. Scale progressivement.

---

## 7. Patterns architecturaux V2

### 7.1 Webhook Inbox Pattern (Idempotence)

**Problème** : webhook MVola arrive pendant downtime → perdu, ou arrive en double → double crédit.

**Solution** :
```
Webhook POST /webhooks/mvola
    │
    ▼
┌─────────────┐
│ inbox_webhooks│  ← Stocké immédiatement, pas de logique métier
│ (PostgreSQL) │     Columns: payload, signature, received_at, status
└─────────────┘
    │
    ▼
Worker Celery (toutes les 30s)
    │
    ├──► Vérifier signature HMAC
    ├──► Vérifier idempotency_key
    ├──► Vérifier si déjà traité
    ├──► Si OK : traiter (créditer wallet)
    └──► Marquer inbox_webhooks.status = 'processed'
```

### 7.2 Feature Flags (Déploiement sans coupure)

```sql
CREATE TABLE feature_flags (
    name VARCHAR(100) PRIMARY KEY,
    enabled BOOLEAN DEFAULT false,
    rollout_percent INTEGER DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
    allowed_users UUID[] DEFAULT '{}',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exemples
INSERT INTO feature_flags VALUES ('belote_mode_real', false, 0, '{}', 'Belote argent réel');
INSERT INTO feature_flags VALUES ('tournaments_v1', false, 0, '{}', 'Tournois phase 1');
INSERT INTO feature_flags VALUES ('orange_money_payout', false, 5, '{}', 'Retrait OM (5% rollout)');
```

Usage côté client :
```javascript
const { data: flags } = useQuery(['flags']);
if (flags?.belote_mode_real && user.kyc_level >= 1) {
  showRealMoneyOption();
}
```

### 7.3 Circuit Breaker (Paiements externes)

```python
# Si MVola API down 3x dans 1 minute → circuit breaker ouvert
# Toutes les transactions MVola mises en file d'attente
# Fallback : message utilisateur "Paiements MVola temporairement indisponibles, essayez Orange Money"
# Après 2 minutes : half-open (1 test), puis closed si OK
```

### 7.4 Anti-corruption Layer V2 (Paiements)

```
Wallet Service
  └── PaymentOrchestrator (interface)
        ├── MVolaAdapter (implémentation directe)
        ├── OrangeMoneyAdapter (implémentation directe)
        ├── PayDunyaAdapter (agrégateur fallback) ← NOUVEAU
        └── TestAdapter (tests)
```

**Pourquoi PayDunya ?** : Si MVola/Orange n'ont pas d'API directe propre, PayDunya (agrégateur africain) fournit une API unifiée pour plusieurs opérateurs.

---

## 8. Sécurité V2

### 8.1 Zero carte brute

| Règle | Implémentation |
|-------|---------------|
| Jamais de numéro CB dans notre infra | Stripe Elements → token uniquement |
| Jamais de CVV stocké | Stripe gère tout |
| Logs sans données sensibles | Filtrer PAN avant log |
| Scope PCI | **SAQ A** (moins lourd) grâce à Stripe hosted fields |

### 8.2 Anti-bot

| Technique | Implémentation |
|-----------|---------------|
| reCAPTCHA v3 invisible | Score < 0.3 = challenge visible |
| Détection patterns | Temps réponse constant → suspicion bot |
| Honey pots | Tables "test" avec bugs visuels détectables par DOM scraping |
| Rate limiting action | Max 1 action/seconde par joueur sur table |
| Device fingerprinting | Canvas + WebGL + fonts + timezone + langue |
| Mouse movement | Analyse trajectoire souris (humain = bruité) |

### 8.3 Ledger double entrée — Contraintes renforcées

```sql
-- V2 : Trigger PostgreSQL garantissant équilibre
CREATE OR REPLACE FUNCTION validate_ledger_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Vérifier que chaque transaction a exactement 2 entrées de même montant opposé
    IF EXISTS (
        SELECT transaction_id
        FROM transaction_entries
        WHERE transaction_id = NEW.transaction_id
        GROUP BY transaction_id
        HAVING COUNT(*) != 2
           OR SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END) != 0
           OR SUM(CASE WHEN entry_type = 'credit' THEN 1 ELSE 0 END) != 1
    ) THEN
        RAISE EXCEPTION 'Ledger entries unbalanced for transaction %', NEW.transaction_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_balance_check
AFTER INSERT ON transaction_entries
FOR EACH ROW EXECUTE FUNCTION validate_ledger_balance();
```

---

## 9. Scalabilité V2

### Capacité cible V1 (MVP simulation)

| Métrique | Cible | Stratégie |
|----------|-------|-----------|
| CCU total | 500 | 3 replicas Game Engine Go |
| CCU par table | 6 (Poker) / 4 (Belote) | Goroutine dédiée par table |
| Tables simultanées | ~100 | Load balancer par room hash |
| Transactions / minute | 500 | Pool connexions PG (20), cache balance |
| Latence WS action | < 30ms | Go + Redis local + same AZ |
| Latence API REST | < 150ms p95 | CDN + cache + index optimisés |

### Scaling horizontal Game Engine

```
Game Engine Instance 1 : tables A-F
Game Engine Instance 2 : tables G-L
Game Engine Instance 3 : tables M-R
...

Sticky sessions par table_id (hash consistent)
Si instance crash → Redis snapshot permet reconstruction sur autre instance
```

---

## 10. Environnements V2

| Environnement | Infra | Coût/mois | Données |
|---------------|-------|-----------|---------|
| local | Docker Compose | 0€ | Fixtures + seed |
| dev | 1 VM DO / AWS | ~50$ | Générées, reset quotidien |
| staging | K8s staging (1 replica) | ~200$ | Anonymisées production |
| production | K8s prod (3 replicas) | ~1700$ | Réelles |

---

## 11. ADR révisés

### ADR-001 : Django vs Node.js/Go
**Décision :** Django REST pour API métier (auth, wallet, support). **Go pour Game Engine.**  
**Raisons :** Django = productivité + ORM + back-office. Go = performance temps réel + faible empreinte mémoire.  
**Contre-indications** : 2 langages = courbe d'apprentissage + context switch. **Mitigation** : Game Engine bien encapsulé, API simple (REST pour actions, WS pour temps réel).

### ADR-002 : Monolithe Django modulaire vs Microservices
**Décision :** Monolithe modulaire pour services Django (Auth, Wallet, Support, Notification en apps séparées). Game Engine séparé en Go.  
**Raisons :** Simplicité MVP. Transactions DB cohérentes entre services Django. Game Engine isolé car contraintes complètement différentes (pas de transactions SQL, état en mémoire).  
**Évolution** : Si Wallet devient bottleneck → extraire en microservice (V3+).

### ADR-003 : Go vs Rust pour Game Engine
**Décision :** Go.  
**Raisons :** Écosystème mature WebSocket, recrutement plus facile en Afrique/remote, compilation rapide, garbage collector acceptable pour notre latence (< 30ms). Rust = plus performant mais courbe d'apprentissage + compilation lente.  
**Revue** : Si latence < 10ms requise (V4), évaluer Rust ou C++.

### ADR-004 : PostgreSQL partitionnement
**Décision :** `django-postgres-extra` pour partitions declaratives PostgreSQL.  
**Raisons :** Django ORM natif ne supporte pas les partitions. `pg_partman` ou partitions manuelles via `django-postgres-extra`.  
**Alternative** : Tables normales + archivage mensuel → plus simple MVP.

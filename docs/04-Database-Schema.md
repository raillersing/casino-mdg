# Schéma Base de Données V2 — iGaming Madagascar Platform
## Database Schema Document (Révision critique)

**Version:** 2.0  
**SGBD:** PostgreSQL 15+  
**ORM:** Django ORM + django-postgres-extra (partitions)  
**Moteur:** InnoDB est pour MySQL, PostgreSQL utilise son propre moteur (heap/B-tree)

---

## 1. Ce qui a changé depuis V1

| Changement | V1 | V2 |
|------------|-----|-----|
| Pas de table webhook_inbox | — | **Ajout table `webhook_inbox`** (pattern inbox) |
| Ledger sans contrainte | Trigger manquant | **Trigger PostgreSQL validate_ledger_balance** |
| Pas de snapshots table | — | **Table `table_snapshots`** (Redis persistant) |
| Pas de feature flags | — | **Table `feature_flags`** |
| Pas de circuit breaker state | — | **Table `circuit_breaker_states`** |
| Partitions Django ORM | Non supporté | **django-postgres-extra declarative** |
| Pas de table_players index composite | — | **Index (table_id, seat_number) + unique** |

---

## 2. Schéma complet

### 2.1 Auth Domain

#### `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    phone_verified_at TIMESTAMPTZ,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    avatar_url VARCHAR(500),
    country_code CHAR(2) DEFAULT 'MG',
    language VARCHAR(5) DEFAULT 'mg',  -- V2: malgache par défaut
    currency_code VARCHAR(3) DEFAULT 'MGA',
    kyc_level SMALLINT DEFAULT 0 CHECK (kyc_level BETWEEN 0 AND 3),
    kyc_status VARCHAR(20) DEFAULT 'unverified',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'frozen', 'self_excluded', 'deleted')),
    referral_code VARCHAR(20) UNIQUE,
    referred_by UUID REFERENCES users(id),
    -- Anti-bot / fingerprinting
    device_fingerprint VARCHAR(255),
    last_login_ip INET,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_phone ON users(phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_kyc ON users(kyc_level, kyc_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_referral ON users(referral_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_fingerprint ON users(device_fingerprint) WHERE deleted_at IS NULL;
```

#### `user_sessions`
```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    device_fingerprint VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    is_mobile_app BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id, expires_at DESC);
CREATE INDEX idx_sessions_fingerprint ON user_sessions(device_fingerprint) WHERE device_fingerprint IS NOT NULL;
```

#### `kyc_documents`
```sql
CREATE TABLE kyc_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(30) NOT NULL,
    document_number VARCHAR(100),
    front_image_url VARCHAR(500),
    back_image_url VARCHAR(500),
    selfie_image_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending_review',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_user ON kyc_documents(user_id);
CREATE INDEX idx_kyc_status ON kyc_documents(status);
```

---

### 2.2 Wallet Domain

#### `ledger_accounts`
```sql
CREATE TABLE ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type VARCHAR(30) NOT NULL CHECK (account_type IN ('player', 'platform', 'bonus', 'escrow', 'adjustment')),
    user_id UUID REFERENCES users(id),
    currency_code VARCHAR(3) DEFAULT 'MGA',
    balance INTEGER DEFAULT 0,
    held_balance INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT positive_balance CHECK (balance + held_balance >= 0)
);

CREATE INDEX idx_ledger_user ON ledger_accounts(user_id) WHERE account_type = 'player';
```

#### `transactions` (partitionnée mensuellement)
```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_code VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(30) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    currency_code VARCHAR(3) DEFAULT 'MGA',
    status VARCHAR(20) DEFAULT 'pending',
    source_account_id UUID REFERENCES ledger_accounts(id),
    destination_account_id UUID REFERENCES ledger_accounts(id),
    payment_method VARCHAR(30),
    payment_provider VARCHAR(50),
    external_reference VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Partitions mensuelles (script automatique pour créer futures)
CREATE TABLE transactions_2026_08 PARTITION OF transactions 
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE INDEX idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status) WHERE status IN ('pending', 'processing', 'disputed');
CREATE INDEX idx_transactions_external ON transactions(external_reference);
CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);
```

#### `transaction_entries` (double entrée avec trigger)
```sql
CREATE TABLE transaction_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id),
    entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    balance_after INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entries_transaction ON transaction_entries(transaction_id);
CREATE INDEX idx_entries_account ON transaction_entries(account_id, created_at DESC);

-- V2: TRIGGER CRITIQUE — garantit équilibre double entrée
CREATE OR REPLACE FUNCTION validate_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_entries INTEGER;
    credit_count INTEGER;
    balance_check INTEGER;
BEGIN
    SELECT COUNT(*), COUNT(CASE WHEN entry_type = 'credit' THEN 1 END)
    INTO total_entries, credit_count
    FROM transaction_entries
    WHERE transaction_id = NEW.transaction_id;
    
    -- Vérifier exactement 2 entrées (1 crédit + 1 débit)
    IF total_entries = 2 THEN
        SELECT COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END), 0)
        INTO balance_check
        FROM transaction_entries
        WHERE transaction_id = NEW.transaction_id;
        
        IF balance_check != 0 THEN
            RAISE EXCEPTION 'Ledger entries unbalanced for transaction %: balance_check=%', NEW.transaction_id, balance_check;
        END IF;
        
        IF credit_count != 1 THEN
            RAISE EXCEPTION 'Transaction % must have exactly 1 credit entry, found %', NEW.transaction_id, credit_count;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_balance_check
AFTER INSERT ON transaction_entries
FOR EACH ROW EXECUTE FUNCTION validate_ledger_balance();
```

#### `payment_methods`
```sql
CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    provider VARCHAR(50),
    identifier VARCHAR(255) NOT NULL,  -- +26134****xx
    token VARCHAR(255),
    is_default BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active',
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_user ON payment_methods(user_id, status);
```

---

### 2.3 Webhook Inbox (NOUVEAU V2)

#### `webhook_inbox` (pattern inbox — stockage avant traitement)
```sql
CREATE TABLE webhook_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,  -- 'mvola', 'orange_money', 'stripe'
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(500),  -- signature reçue
    signature_validated BOOLEAN DEFAULT false,
    idempotency_key VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'processing', 'processed', 'failed', 'ignored')),
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_inbox_status ON webhook_inbox(status, created_at) WHERE status IN ('pending', 'validated');
CREATE INDEX idx_webhook_inbox_provider ON webhook_inbox(provider, created_at DESC);
CREATE INDEX idx_webhook_inbox_idempotency ON webhook_inbox(idempotency_key);

-- V2: Trigger pour éviter doublons sur idempotency_key
CREATE UNIQUE INDEX idx_webhook_inbox_unique_event 
ON webhook_inbox(provider, idempotency_key) 
WHERE idempotency_key IS NOT NULL;
```

---

### 2.4 Game Domain

#### `game_types`
```sql
CREATE TABLE game_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    name_mg VARCHAR(100),  -- V2: nom malgache
    description TEXT,
    description_mg TEXT,
    min_players SMALLINT NOT NULL,
    max_players SMALLINT NOT NULL,
    supports_simulation BOOLEAN DEFAULT true,
    supports_real_money BOOLEAN DEFAULT false,
    supports_tournament BOOLEAN DEFAULT false,
    rules_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data V2 (3 jeux MVP)
INSERT INTO game_types (code, name, name_mg, min_players, max_players, supports_tournament) VALUES
('poker_texas_holdem', 'Poker Texas Hold'em', 'Poker Texas Hold'em', 2, 10, true),
('belote_classique', 'Belote classique', 'Belote', 4, 4, true),
('rami_classique', 'Rami classique', 'Rami', 2, 4, true);
```

#### `tables`
```sql
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_code VARCHAR(50) UNIQUE NOT NULL,
    game_type_id UUID NOT NULL REFERENCES game_types(id),
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'paused', 'closed')),
    mode VARCHAR(20) DEFAULT 'simulation',
    is_private BOOLEAN DEFAULT false,
    password_hash VARCHAR(255),
    max_players SMALLINT NOT NULL DEFAULT 6,
    min_buyin INTEGER NOT NULL,
    max_buyin INTEGER,
    small_blind INTEGER,
    big_blind INTEGER,
    rake_percent DECIMAL(5,2) DEFAULT 0,
    time_per_action SMALLINT DEFAULT 30,
    current_hand_number INTEGER DEFAULT 0,
    dealer_seat SMALLINT,
    pot_amount INTEGER DEFAULT 0,
    current_phase VARCHAR(20),
    grace_period_seconds SMALLINT DEFAULT 30,  -- V2: grace period
    created_by UUID REFERENCES users(id),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX idx_tables_game_type ON tables(game_type_id, status);
CREATE INDEX idx_tables_status ON tables(status) WHERE status IN ('waiting', 'playing');
CREATE INDEX idx_tables_private ON tables(is_private) WHERE is_private = true;
```

#### `table_snapshots` (NOUVEAU V2)
```sql
CREATE TABLE table_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    snapshot_data JSONB NOT NULL,  -- état complet sérialisé
    events_since JSONB DEFAULT '[]',  -- events depuis snapshot
    version INTEGER NOT NULL DEFAULT 1,  -- version optimistic locking
    is_active BOOLEAN DEFAULT true,  -- snapshot actif ou archivé
    grace_period_end TIMESTAMPTZ,  -- V2: fin de la grace period
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_table ON table_snapshots(table_id, is_active) WHERE is_active = true;
CREATE INDEX idx_snapshots_grace ON table_snapshots(grace_period_end) WHERE grace_period_end IS NOT NULL;
```

#### `table_players`
```sql
CREATE TABLE table_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    seat_number SMALLINT NOT NULL,
    initial_balance INTEGER NOT NULL,
    current_balance INTEGER NOT NULL,
    cards JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    is_connected BOOLEAN DEFAULT true,  -- V2: statut connexion
    is_sitting_out BOOLEAN DEFAULT false,
    is_dealer BOOLEAN DEFAULT false,
    is_small_blind BOOLEAN DEFAULT false,
    is_big_blind BOOLEAN DEFAULT false,
    total_bet_this_hand INTEGER DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,  -- V2: timestamp déconnexion
    UNIQUE(table_id, seat_number),
    UNIQUE(table_id, user_id) WHERE left_at IS NULL
);

CREATE INDEX idx_table_players_table ON table_players(table_id, is_active);
CREATE INDEX idx_table_players_user ON table_players(user_id);
```

#### `games`
```sql
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_code VARCHAR(50) UNIQUE NOT NULL,
    table_id UUID NOT NULL REFERENCES tables(id),
    game_type_id UUID NOT NULL REFERENCES game_types(id),
    hand_number INTEGER NOT NULL,
    mode VARCHAR(20) DEFAULT 'simulation',
    status VARCHAR(20) DEFAULT 'in_progress',
    deck_seed VARCHAR(255) NOT NULL,
    deck_sequence JSONB NOT NULL,
    community_cards JSONB DEFAULT '[]',
    pot_amount INTEGER DEFAULT 0,
    rake_amount INTEGER DEFAULT 0,
    grace_period_active BOOLEAN DEFAULT false,  -- V2
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_games_table ON games(table_id);
CREATE INDEX idx_games_status ON games(status) WHERE status = 'in_progress';
CREATE INDEX idx_games_created ON games(created_at DESC);
```

#### `game_actions`
```sql
CREATE TABLE game_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    action_number INTEGER NOT NULL,
    player_id UUID REFERENCES users(id),
    action_type VARCHAR(30) NOT NULL,
    amount INTEGER,
    cards JSONB,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, action_number)
);

CREATE INDEX idx_actions_game ON game_actions(game_id, action_number);
CREATE INDEX idx_actions_player ON game_actions(player_id, timestamp DESC);
```

#### `game_results`
```sql
CREATE TABLE game_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
    winners JSONB DEFAULT '[]',
    players_final JSONB DEFAULT '[]',
    total_pot INTEGER DEFAULT 0,
    total_rake INTEGER DEFAULT 0,
    duration_seconds INTEGER,
    ended_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 2.5 Tournament Domain

Identique V1 mais avec champs malgache.

---

### 2.6 Fraud Domain

#### `fraud_signals`
```sql
CREATE TABLE fraud_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    signal_type VARCHAR(50) NOT NULL,
    related_user_id UUID REFERENCES users(id),
    confidence_score DECIMAL(5,2) DEFAULT 0.5,
    evidence JSONB DEFAULT '{}',
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'open'
);

CREATE INDEX idx_fraud_signals_user ON fraud_signals(user_id, detected_at DESC);
CREATE INDEX idx_fraud_signals_type ON fraud_signals(signal_type, status);
```

#### `fraud_scores`
```sql
CREATE TABLE fraud_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    total_score INTEGER DEFAULT 0 CHECK (total_score BETWEEN 0 AND 100),
    level VARCHAR(20) GENERATED ALWAYS AS (
        CASE WHEN total_score <= 30 THEN 'normal'
             WHEN total_score <= 60 THEN 'surveillance'
             WHEN total_score <= 80 THEN 'suspect'
             ELSE 'critique' END
    ) STORED,
    factors JSONB DEFAULT '{}',
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 2.7 Support Domain

Identique V1 avec champs malgache ajoutés pour FAQ/tickets.

---

### 2.8 Feature Flags (NOUVEAU V2)

```sql
CREATE TABLE feature_flags (
    name VARCHAR(100) PRIMARY KEY,
    enabled BOOLEAN DEFAULT false,
    rollout_percent INTEGER DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
    allowed_users UUID[] DEFAULT '{}',
    allowed_groups VARCHAR(50)[] DEFAULT '{}',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed V2
INSERT INTO feature_flags (name, enabled, description) VALUES
('belote_mode_real', false, 'Belote argent réel (Phase 2)'),
('poker_mode_real', false, 'Poker argent réel (Phase 2)'),
('rami_mode_real', false, 'Rami argent réel (Phase 2)'),
('tournaments_v1', false, 'Système tournois'),
('orange_money_payout', false, 'Retrait Orange Money'),
('airtel_money', false, 'Intégration Airtel Money'),
('leaderboard_v1', false, 'Leaderboards hebdomadaires'),
('push_notifications', true, 'Notifications push'),
('sms_fallback', true, 'Fallback SMS si push échoue');
```

---

### 2.9 Circuit Breaker States (NOUVEAU V2)

```sql
CREATE TABLE circuit_breaker_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(100) NOT NULL UNIQUE,
    state VARCHAR(20) NOT NULL CHECK (state IN ('closed', 'open', 'half_open')),
    failure_count INTEGER DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Redis Schema (en complément PostgreSQL)

### 3.1 Sessions actives
```
Key: session:{token_hash}
TTL: expires_in (ex: 3600s)
Value: { user_id, device_fp, kyc_level }
```

### 3.2 Table snapshots (Game Engine Go)
```
Key: table_snapshot:{table_id}
TTL: 600s (10 minutes, extend pendant partie active)
Value: {
  state: { /* état complet table */ },
  events_since: [ /* events depuis snapshot */ ],
  version: 123,
  grace_period_end: "2026-08-10T14:30:00Z"
}
```

### 3.3 Balance cache (wallet)
```
Key: balance:{user_id}
TTL: 60s
Value: { available, held_in_games, total }
-- Invalidation sur toute transaction
```

### 3.4 Rate limiting
```
Key: rate:{endpoint}:{user_id}
TTL: 60s
Value: counter (incr)
-- Ex: rate:deposit:user_123 = 2 (2 dépôts dans la dernière minute)
```

### 3.5 Feature flags cache
```
Key: feature_flags
TTL: 300s
Value: { flag_name: { enabled, rollout_percent, allowed_users } }
```

---

## 4. Diagramme relationnel V2

```
users
├── user_sessions
├── kyc_documents
├── ledger_accounts
│   └── transaction_entries ──► transactions
├── payment_methods
├── table_players ──► tables ──► game_types
│                     └── table_snapshots (V2)
├── games
│   ├── game_actions
│   └── game_results
├── tournament_registrations ──► tournaments
├── fraud_signals
├── fraud_scores
├── support_tickets
│   └── ticket_messages
├── self_exclusions
├── notifications
└── webhook_inbox (V2)

feature_flags (V2)
circuit_breaker_states (V2)
```

---

## 5. Django Models (aperçu ORM)

```python
# Utilisation django-postgres-extra pour partitions
from psqlextra.models import PostgresPartitionedModel
from psqlextra.types import PostgresPartitioningMethod

class Transaction(PostgresPartitionedModel):
    class PartitioningMeta:
        method = PostgresPartitioningMethod.RANGE
        key = ["created_at"]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    transaction_code = models.CharField(max_length=50, unique=True)
    user = models.ForeignKey('users.User', on_delete=models.CASCADE)
    type = models.CharField(max_length=30, choices=TRANSACTION_TYPES)
    # ... etc

class WebhookInbox(models.Model):
    """Pattern inbox pour webhooks paiement"""
    provider = models.CharField(max_length=50)
    event_type = models.CharField(max_length=100)
    payload = models.JSONField()
    signature = models.CharField(max_length=500, null=True, blank=True)
    status = models.CharField(max_length=20, default='pending')
    retry_count = models.IntegerField(default=0)
    error_message = models.TextField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['provider', 'created_at']),
        ]
```

---

## 6. Stratégies de performance V2

| Table | Stratégie | Outil |
|-------|-----------|-------|
| transactions | Partitionnement mensuel | django-postgres-extra |
| game_actions | Partitionnement par game_id | SQL raw + pg_partman |
| webhook_inbox | TTL 7 jours + archivage | Cron + S3 |
| user_sessions | Redis uniquement (pas DB) | Redis TTL |
| table_snapshots | Redis TTL 10 min + DB fallback | Redis + PostgreSQL |
| fraud_signals | Partitionnement mensuel | SQL raw |

---

## 7. Migrations planifiées

### V1 → V2
```
1. Ajouter colonnes V2 (language_mg, name_mg, etc.)
2. Créer webhook_inbox
3. Créer table_snapshots
4. Créer feature_flags
5. Créer circuit_breaker_states
6. Ajouter trigger validate_ledger_balance
7. Ajouter colonnes grace_period aux tables
8. Remplir feature_flags (seed)
9. Créer index composites manquants
```

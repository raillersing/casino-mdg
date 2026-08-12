# Spécifications API V2 — iGaming Madagascar Platform
## API Specification Document (Révision critique)

**Version:** 2.0  
**Base URL:** `https://api.casino-mdg.mg/v1`  
**Format:** JSON  
**Auth:** Bearer JWT (OAuth2)  
**Rate limiting:** 100 req/min publics, 1000 req/min authentifiés, max 1 action/sec sur table

---

## 1. Changements V2

| Changement | V1 | V2 |
|------------|-----|-----|
| WebSocket basic | Reconnexion manuelle | **Reconnexion auto avec sync** |
| Pas de paramètre last_event_id | — | **Query param last_event_id** |
| Pas de heartbeat | — | **Ping/pong toutes les 15s** |
| Actions sans request_id | — | **request_id obligatoire** pour idempotence WS |
| Pas de statut connexion | — | **is_connected sur table_players** |

---

## 2. WebSocket Game Protocol V2

### 2.1 Connexion
```
wss://ws.casino-mdg.mg/games/{table_id}?last_event_id={event_id}
Headers:
  Authorization: Bearer <ws_auth_token>
  X-Client-Version: 1.0.0
```

**last_event_id** : ID du dernier événement reçu avant déconnexion. Permet au serveur d'envoyer uniquement les événements manquants.

### 2.2 Heartbeat (keep-alive)
```
Client -> Serveur : {"type": "ping", "timestamp": 1723300800}
Serveur -> Client : {"type": "pong", "timestamp": 1723300800, "server_time": 1723300801}

Timeout : 30s sans ping = déconnexion côté serveur
Intervalle client : toutes les 15s
```

### 2.3 Messages client -> serveur

```json
// Rejoindre table (après connexion WS)
{
  "type": "join_table",
  "table_id": "tbl_abc123",
  "auth_token": "ws_auth_xyz789",
  "request_id": "req_001"
}

// Action de jeu
{
  "type": "player_action",
  "table_id": "tbl_abc123",
  "action": "bet",
  "amount": 2000,
  "event_id": "evt_client_002",  // obligatoire pour rejouer sans doubler l'action
  "timestamp": 1723300800
}

// Demande de sync (reconnexion)
{
  "type": "request_sync",
  "table_id": "tbl_abc123",
  "last_event_id": "evt_045"
}

// Quitter table
{
  "type": "leave_table",
  "table_id": "tbl_abc123",
  "request_id": "req_003"
}

// Ping de keep-alive
{
  "type": "ping",
  "timestamp": 1723300800
}

// Signal "je suis toujours là" (reconnexion réseau)
{
  "type": "heartbeat",
  "table_id": "tbl_abc123",
  "timestamp": 1723300800
}
```

### 2.4 Messages serveur -> client

```json
// État complet de la table (snapshot initial + reconnexion)
{
  "type": "table_state",
  "table_id": "tbl_abc123",
  "game_phase": "preflop",
  "event_id": "evt_050",  // V2: pour tracking reconnexion
  "players": [
    {
      "seat": 1,
      "user_id": "usr_1",
      "display_name": "JeanR",
      "balance": 20000,
      "cards": ["AH", "KD"],
      "is_active": true,
      "is_connected": true,      // V2: statut connexion réseau
      "is_dealer": false,
      "is_small_blind": false,
      "is_big_blind": true,
      "grace_period_remaining": null  // V2: si déconnecté, secondes restantes
    },
    {
      "seat": 3,
      "user_id": "usr_2",
      "display_name": "MmeRaso",
      "balance": 15000,
      "cards": null,
      "is_active": true,
      "is_connected": false,      // V2: déconnecté !
      "is_dealer": true,
      "grace_period_remaining": 18  // V2: 18 secondes avant fold auto
    }
  ],
  "community_cards": [],
  "pot": 1500,
  "current_bet": 1000,
  "active_seat": 1,
  "time_remaining": 25,
  "hand_number": 7,
  "mode": "simulation",
  "table_name": "Table Rapide #1"
}

// Sync après reconnexion (V2 — uniquement events manquants)
{
  "type": "sync_data",
  "table_id": "tbl_abc123",
  "snapshot": { /* state complet */ },
  "missed_events": [
    { "event_id": "evt_046", "type": "action_confirmed", ... },
    { "event_id": "evt_047", "type": "card_dealt", ... },
    { "event_id": "evt_048", "type": "bet", ... },
    { "event_id": "evt_049", "type": "action_confirmed", ... }
  ],
  "current_event_id": "evt_050"
}

// Action validée
{
  "type": "action_confirmed",
  "request_id": "req_002",
  "event_id": "evt_051",  // V2
  "player": "usr_1",
  "action": "bet",
  "amount": 2000,
  "new_balance": 18000,
  "pot": 3500,
  "next_seat": 3,
  "next_player_connected": false,  // V2: alerte si prochain joueur déconnecté
  "timestamp": "2026-08-10T14:15:05Z"
}

// Déconnexion joueur détectée (V2)
{
  "type": "player_disconnected",
  "table_id": "tbl_abc123",
  "user_id": "usr_2",
  "seat": 3,
  "grace_period_seconds": 30,
  "message": "MmeRaso s'est déconnectée. Grace period: 30s."
}

// Reconnexion joueur (V2)
{
  "type": "player_reconnected",
  "table_id": "tbl_abc123",
  "user_id": "usr_2",
  "seat": 3,
  "message": "MmeRaso est de retour !"
}

// Grace period expirée (V2)
{
  "type": "grace_period_expired",
  "table_id": "tbl_abc123",
  "user_id": "usr_2",
  "seat": 3,
  "auto_action": "fold",
  "message": "MmeRaso n'a pas reconnecté. Fold automatique."
}

// Nouvelle distribution
{
  "type": "deal",
  "event_id": "evt_052",
  "hand_number": 8,
  "players": [
    { "seat": 1, "cards": ["7H", "2D"] }
  ],
  "blinds": { "small": 500, "big": 1000 },
  "dealer_seat": 1
}

// Cartes communautaires
{
  "type": "community_cards",
  "event_id": "evt_053",
  "cards": ["AC", "7H", "2D"],
  "phase": "flop"
}

// Fin de partie
{
  "type": "game_ended",
  "event_id": "evt_060",
  "winners": [
    {
      "user_id": "usr_1",
      "display_name": "JeanR",
      "amount": 4500,
      "hand_description": "Two Pair, Aces and Sevens",
      "hand_description_mg": "Double Paire, As sy Aces"  // V2
    }
  ],
  "final_balances": [
    { "user_id": "usr_1", "balance": 24500 },
    { "user_id": "usr_2", "balance": 10500 }
  ],
  "next_hand_countdown": 10  // secondes avant prochaine main
}

// Message système
{
  "type": "system_message",
  "event_id": "evt_061",
  "message": "Nouveau joueur rejoint la table",
  "message_mg": "Mpilalao vaovao miditra amin'ny latabatra",
  "severity": "info"
}

// Erreur
{
  "type": "error",
  "code": "INSUFFICIENT_BALANCE",
  "message": "Solde insuffisant pour cette mise",
  "message_mg": "Tsy ampy ny vola amin'ity petaka ity",
  "request_id": "req_002",
  "timestamp": "2026-08-10T14:15:05Z"
}

// Pong (réponse au ping)
{
  "type": "pong",
  "timestamp": 1723300800,
  "server_time": 1723300801
}
```

### 2.5 Protocole de reconnexion (V2 — IMPORTANT)

```
SÉQUENCE RECONNEXION
═══════════════════════════════════════════════════

1. Client perd connexion (coupure réseau)
   → Afficher "Reconnexion en cours..." (FR/MG)
   → Timer local : réessayer toutes les 2s, max 30s

2. Client se reconnecte (wss://...?last_event_id=evt_045)
   → Envoyer auth_token + last_event_id reçu

3. Serveur vérifie last_event_id
   → Si table toujours active : envoyer sync_data (snapshot + events manquants)
   → Si grace period active : prolonger
   → Si table fermée : rediriger lobby

4. Client applique sync_data
   → Reconstruire état
   → Afficher "Vous êtes de retour !" (FR) / "Nody ianao !" (MG)
   → Reprendre au point exact

5. Si grace period expirée pendant déconnexion
   → Fold/pass automatique appliqué
   → Client reçoit état actualisé
   → Peut continuer à la prochaine main
```

---

## 3. API REST — Endpoints modifiés/ajoutés V2

### 3.1 Feature Flags (NOUVEAU)
```
GET /features
Headers: Authorization: Bearer <token>

Response:
{
  "flags": {
    "belote_mode_real": { "enabled": false },
    "push_notifications": { "enabled": true, "rollout_percent": 100 },
    "leaderboard_v1": { "enabled": false }
  }
}
```

### 3.2 Webhook Inbox (Admin — NOUVEAU)
```
GET /admin/webhooks/inbox?status=pending&page=1
Response:
{
  "data": [
    {
      "id": "wh_abc123",
      "provider": "mvola",
      "event_type": "payment.completed",
      "status": "pending",
      "retry_count": 0,
      "created_at": "2026-08-10T12:00:00Z"
    }
  ]
}

POST /admin/webhooks/inbox/{id}/retry
POST /admin/webhooks/inbox/{id}/ignore
```

### 3.3 Circuit Breaker (Admin — NOUVEAU)
```
GET /admin/circuit-breakers
Response:
{
  "data": [
    {
      "service_name": "mvola_api",
      "state": "closed",
      "failure_count": 0,
      "last_success_at": "2026-08-10T14:00:00Z"
    }
  ]
}
```

### 3.4 Sync explicite (Client — NOUVEAU)
```
POST /games/tables/{id}/sync
Body: { "last_event_id": "evt_045" }

Response:
{
  "table_id": "tbl_abc123",
  "snapshot": { /* état complet */ },
  "missed_events": [ /* events depuis evt_045 */ ],
  "current_event_id": "evt_050",
  "grace_period_remaining": 18
}
```

### 3.5 Table Players — Connexion (NOUVEAU)
```
GET /games/tables/{id}/players

Response:
{
  "players": [
    {
      "seat": 1,
      "user_id": "usr_1",
      "display_name": "JeanR",
      "is_connected": true,
      "is_active": true
    },
    {
      "seat": 3,
      "user_id": "usr_2",
      "display_name": "MmeRaso",
      "is_connected": false,     // V2
      "grace_period_remaining": 18,  // V2
      "is_active": true
    }
  ]
}
```

---

## 4. Codes erreur V2

| Code | HTTP | Description | Message FR | Message MG |
|------|------|-------------|------------|------------|
| GRACE_PERIOD_ACTIVE | 409 | Joueur déconnecté, attente reconnexion | "Grace period active" | "Miandry ny filazana..." |
| CONNECTION_TIMEOUT | 408 | Timeout action (fold auto) | "Temps écoulé" | "Lany ny fotoana" |
| TABLE_CLOSED | 410 | Table fermée pendant déconnexion | "Table fermée" | "Mihidy ny latabatra" |
| SYNC_FAILED | 422 | Impossible de reconstruire état | "Sync impossible" | "Tsy afaka miverina" |
| RATE_LIMIT_ACTION | 429 | Trop d'actions sur table | "Trop rapide" | "Haingana loatra" |
| WEBHOOK_INVALID_SIG | 400 | Signature webhook incorrecte | "Signature invalide" | "Misy diso ny sonia" |
| CIRCUIT_OPEN | 503 | Service temporairement indisponible | "Service indisponible" | "Tsy misy ny tolotra" |

---

## 5. Rate Limiting V2

| Endpoint / Action | Limite | Période |
|-------------------|--------|---------|
| Auth login | 5 | 1 minute |
| Auth register | 3 | 5 minutes |
| Dépôt init | 2 | 1 minute |
| Retrait init | 2 | 1 minute |
| Action table (bet, etc.) | 1 | 1 seconde |
| Reconnexion WS | illimité | — |
| Ping WS | illimité | — |
| API public | 100 | 1 minute |
| API authentifié | 1000 | 1 minute |

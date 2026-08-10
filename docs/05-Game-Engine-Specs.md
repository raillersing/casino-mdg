# Spécifications Moteur de Jeu V2 — iGaming Madagascar Platform
## Game Engine Specification Document (Révision critique)

**Version:** 2.0  
**Date:** 2026-08-10  
**Public cible:** Lead Game Engine, Backend Developers, Security Engineer

---

## 1. Ce qui a changé depuis V1

| Changement | V1 | V2 |
|------------|-----|-----|
| Game Engine | Django Channels | **Go (goroutines) séparé** |
| Reconnexion | Non gérée | **Snapshots Redis + grace period 30s** |
| Blackjack MVP | P0 | **P1** |
| Belote coinchée | P1.5 | **P1** |
| Résilience | Basique | **Grace period, action auto, état persistant** |
| Event sourcing | PostgreSQL uniquement | **PostgreSQL + Redis snapshots** |
| Timer | Statique | **Heartbeat 15s + countdown côté client** |

---

## 2. Architecture Game Engine V2

### 2.1 Pourquoi Go

**Problème Django Channels** :
- Latence 50-100ms (acceptable pour chat, pas pour poker)
- 100 CCU par instance (insuffisant)
- GIL Python = pas de vrai parallélisme
- Reconnexion = reconstruction complète depuis DB (lent)

**Solution Go** :
- Goroutines : 1 par table, légères (~50KB)
- 10 000+ tables simultanées sur 1 instance
- Latence < 10ms action->broadcast
- State en mémoire + snapshots Redis (pas DB)

### 2.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GAME ENGINE (Go)                            │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐   │
│  │ Table       │    │ Action      │    │ State Manager       │   │
│  │ Manager     │◄──►│ Processor   │◄──►│ (Snapshots Redis)   │   │
│  │ (goroutine) │    │             │    │                     │   │
│  │             │    │ - Validate  │    │ - Save snapshot    │   │
│  │ - 1 goroutine│   │ - Execute   │    │ - Restore snapshot │   │
│  │   par table │    │ - Persist   │    │ - Grace period     │   │
│  │             │    │ - Broadcast │    │   management        │   │
│  └─────────────┘    └─────────────┘    └─────────────────────┘   │
│         │                   │                   │                 │
│         └───────────────────┴───────────────────┘                 │
│                              │                                    │
│                              ▼                                    │
│                    ┌─────────────────┐                          │
│                    │   Event Store     │                          │
│                    │  (PostgreSQL)     │                          │
│                    │                   │                          │
│                    │ - game_actions    │                          │
│                    │ - game_results    │                          │
│                    └─────────────────┘                          │
│                              │                                    │
│                              ▼                                    │
│                    ┌─────────────────┐                          │
│                    │   Event Bus       │                          │
│                    │  (RabbitMQ)       │                          │
│                    │                   │                          │
│                    │ - Wallet crédit   │                          │
│                    │ - Notifications   │                          │
│                    │ - Stats           │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Cycle de vie d'une table (Go)

```go
package game

type Table struct {
    ID              uuid.UUID
    GameType        string       // "poker", "rami", "belote"
    State           *TableState  // état courant en mémoire
    Players         map[int]*Player
    Deck            *Deck
    Pot             int
    Phase           GamePhase
    GracePeriod     time.Duration // 30s
    GraceTimers     map[uuid.UUID]*time.Timer
    LastActivity    time.Time
    SnapshotVersion int64
    EventCounter    int64
    mutex           sync.RWMutex
}

// Goroutine principale de la table
func (t *Table) Run() {
    ticker := time.NewTicker(1 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case action := <- t.actionChan:
            t.processAction(action)
            
        case <- ticker.C:
            t.checkTimeouts()
            t.saveSnapshot()
            
        case disconnect := <- t.disconnectChan:
            t.startGracePeriod(disconnect.playerID)
            
        case reconnect := <- t.reconnectChan:
            t.handleReconnection(reconnect.playerID)
            
        case <- t.closeChan:
            t.finalize()
            return
        }
    }
}
```

---

## 3. Gestion reconnexion — Contexte Madagascar

### 3.1 Grace period (30 secondes)

```
JOUEUR DÉCONNECTÉ
═══════════════════════════════════════════════════

T+0s  : Détection déconnexion (pas de ping depuis 30s)
T+0s  : Marquer is_connected = false
T+0s  : Démarrer grace timer 30s
T+0s  : Broadcast aux autres : "{nom} déconnecté (30s)"
T+0s  : Sauvegarder snapshot dans Redis

CAS 1 : Reconnecte dans les 30s
─────────────────────────────────
T+15s : Client reconnecte WS
T+15s : Envoyer sync_data (snapshot + events manquants)
T+15s : Annuler grace timer
T+15s : Marquer is_connected = true
T+15s : Broadcast : "{nom} est de retour !"

CAS 2 : Ne reconnecte pas
─────────────────────────
T+30s : Grace timer expire
T+30s : Appliquer action par défaut :
          Poker → fold
          Belote → passe (joue carte plus basse)
          Rami → pioche + écart carte plus haute
T+30s : Marquer is_active = false (pas eliminé, juste inactif)
T+30s : Broadcast : "{nom} fold automatique (timeout)"

CAS 3 : Reconnecte après 30s
────────────────────────────
T+45s : Client reconnecte WS
T+45s : Vérifier si partie terminée :
          Si oui → lobby
          Si non → spectateur (peut rejoindre prochaine main)
```

### 3.2 Sync data (reconnexion élégante)

```go
func (t *Table) handleReconnection(playerID uuid.UUID, lastEventID int64) (*SyncData, error) {
    t.mutex.RLock()
    defer t.mutex.RUnlock()
    
    player := t.getPlayer(playerID)
    if player == nil {
        return nil, errors.New("player not at table")
    }
    
    // Arrêter grace timer si actif
    if timer, ok := t.GraceTimers[playerID]; ok {
        timer.Stop()
        delete(t.GraceTimers, playerID)
        player.IsConnected = true
    }
    
    // Construire réponse sync
    sync := &SyncData{
        TableID:         t.ID,
        Snapshot:        t.State.Serialize(),
        CurrentEventID:  t.EventCounter,
        GracePeriodRemaining: calculateGraceRemaining(playerID),
    }
    
    // Ajouter events manquants depuis lastEventID
    if lastEventID > 0 {
        sync.MissedEvents = t.getEventsSince(lastEventID)
    }
    
    return sync, nil
}
```

### 3.3 Action par défaut timeout (par jeu)

| Jeu | Action auto (timeout) | Action auto (grace period expirée) |
|-----|----------------------|-----------------------------------|
| Poker | Fold | Fold |
| Belote | Passe (carte plus basse légale) | Passe + joue plus basse |
| Rami | Pioche + écart plus haute | Pioche + écart plus haute |

---

## 4. Poker Texas Hold'em V2

Identique V1 + modifications :
- Grace period : fold auto si déconnecté
- Snapshot : state complet sauvé dans Redis toutes les 5s
- Side pots : calcul en goroutine séparée (pas bloquant)
- Rake : prélevé uniquement si flop atteint

### 4.1 Rake V2 (corrigé)

| Pot total (MGA) | Rake % | Rake max (MGA) | Condition |
|-----------------|--------|----------------|-----------|
| < 5 000 | 0% | 0 | Préflop fold |
| 5 000 - 20 000 | 3.5% | 700 | Atteint flop |
| 20 000 - 50 000 | 4% | 1 500 | Atteint flop |
| > 50 000 | 4.5% | 3 000 | Atteint flop |

---

## 5. Belote classique V2

### 5.1 Règles MVP (4 joueurs, 2 équipes)

**Phases détaillées** :

```
1. DISTRIBUTION (5 cartes)
   ├─ Chaque joueur reçoit 5 cartes
   └─ Pli non distribué en 3 cartes

2. PRISE (enchères atout)
   ├─ Chaque joueur peut : passer ou prendre (couleur)
   ├─ Couleurs possibles : ♥ ♦ ♣ ♠
   ├─ Capot possible si tous passent (tous les plis)
   └─ Plus haute enchère = atout

3. DISTRIBUTION COMPLÈTE (3 cartes)
   ├─ 3 cartes supplémentaires
   └─ Total : 8 cartes par joueur

4. ANNONCES (MVP : NON)
   └─ Belote uniquement (Dame+Roi atout = 20 pts)
   └─ V1.5 : tierce, quarte, quinte, carré

5. JEU (8 plis)
   ├─ Mèneur pose carte
   ├─ Obligation suivre couleur
   ├─ Si pas couleur : obligation couper à l'atout
   ├─ Si pas atout : carte libre
   └─ Plus forte carte = gagne le pli

6. COMPTAGE
   ├─ Points cartes gagnées
   ├─ Dernier pli = +10 points
   ├─ Contrat atteint ?
   └─ Score équipe mis à jour
```

### 5.2 Valeurs cartes (atout vs non-atout) — identique V1

### 5.3 Belote (annonce)

```go
func checkBelote(hand []Card, atoutSuit Suit) bool {
    hasQueen := false
    hasKing := false
    
    for _, card := range hand {
        if card.Suit == atoutSuit {
            if card.Rank == Queen { hasQueen = true }
            if card.Rank == King { hasKing = true }
        }
    }
    
    return hasQueen && hasKing
}

// Points : +20 pour l'équipe (annonce en début de jeu)
```

### 5.4 Grace period Belote

```
Si joueur déconnecte pendant son tour :
  - Autres joueurs voient "En attente... (30s)"
  - Si reconnecte → reprend son tour
  - Si timeout → passe automatiquement, joue carte plus basse légale
  - Si timeout pendant prise → passe automatiquement
```

---

## 6. Rami classique V2

### 6.1 Règles MVP

**Contexte malgache** : Le Rami est un jeu très populaire à Madagascar, joué en famille. Variante proche du Gin Rummy.

```
MATÉRIEL
├── 2 jeux de 54 cartes (108 cartes total)
├── Jokers inclus
└── 2-4 joueurs

DISTRIBUTION
├── 14 cartes par joueur
└─ Reste = pioche

OBJECTIF
├── Former des combinaisons (séries + groupes)
├── Poser toutes ses cartes = "Rami"
└── Minimiser points cartes restantes adverses

COMBINAISONS VALIDES
├── Série : 3+ cartes consécutives même couleur
│   Ex: 5♥-6♥-7♥-8♥
├── Groupe : 3-4 cartes même valeur, couleurs différentes
│   Ex: 8♥-8♦-8♠
└── Joker : remplace n'importe quelle carte
    Ex: 5♥-Joker-7♥ (série)
    Ex: 8♥-8♦-Joker (groupe)

TOUR DE JEU
1. TIRAGE
   ├── Pioche (face cachée) : +1 carte
   └── Défausse (face visible) : +1 carte
   
2. ÉCART
   └── -1 carte au talon de défausse
   
3. VÉRIFICATION RAMI (si pose complète)
   └── Toutes les cartes doivent être dans des combinaisons valides
   
4. DÉCOMPTE (si rami confirmé)
   └── Points adverses = cartes restantes

DÉCOMPTE POINTS (cartes restantes adverses)
├── As (dans groupe) : 15 points
├── As (dans série) : 1 point
├── Figures (R, D, V) : 10 points
├── Joker : 25 points
└── Numériques (2-10) : valeur faciale

SCORING RAMI
├── Rami = points adverses total + bonus 25
├── Pose partielle = réduction points adverses
└── Non rami = 0 points (adversaires comptent)
```

### 6.2 Validation combinaisons (algorithme)

```go
func validateRamiHand(hand []Card, tableCombinations []Combination) bool {
    // Toutes les cartes doivent être dans des combinaisons valides
    usedCards := make(map[Card]bool)
    
    for _, combo := range tableCombinations {
        if !isValidCombination(combo) {
            return false
        }
        for _, card := range combo.Cards {
            usedCards[card] = true
        }
    }
    
    // Toutes les cartes de la main sont utilisées ?
    for _, card := range hand {
        if !usedCards[card] {
            return false
        }
    }
    
    return true
}

func isValidCombination(combo Combination) bool {
    if len(combo.Cards) < 3 {
        return false
    }
    
    // Série ?
    if isSequence(combo.Cards) {
        return true
    }
    
    // Groupe ?
    if isGroup(combo.Cards) {
        return true
    }
    
    return false
}
```

### 6.3 Grace period Rami

```
Si joueur déconnecte pendant son tour :
  - "En attente... (30s)"
  - Si reconnecte → reprend (pioche ou défausse)
  - Si timeout → pioche automatique + écart carte plus haute non essentielle
  - Si timeout et peut rami → ne rami pas (sécurité)
```

---

## 7. Mode Simulation V2

### 7.1 Jetons simulation

- Crédit initial : **10 000 jetons**
- Recharge quotidienne : **5 000 jetons** (login quotidien)
- Bonus parrainage : **5 000 jetons** (ami inscrit avec téléphone)
- Bonus pub : **2 000 jetons** (visionnage optionnel, V1.5)
- **Achat jetons : NON en MVP** (séparation simulation/réel stricte)

### 7.2 Tables simulation
- Badge "SIMULATION" visible (orange)
- Même règles, même interface
- Stats séparées : "Parties simulées" vs "Parties réelles"
- Classement simulation distinct
- Objectif : familiarisation + viralité (inviter amis sans risque)

---

## 8. Tests Game Engine V2

### 8.1 Tests unitaires Go

```go
func TestPokerHandEvaluation(t *testing.T) {
    tests := []struct {
        name     string
        hole     []string
        community []string
        expected HandRank
    }{
        {"Royal Flush", ["AH", "KH"], ["QH", "JH", "10H", "2D", "3C"], RoyalFlush},
        {"Two Pair", ["AH", "7D"], ["AC", "7H", "2D", "JS", "5H"], TwoPair},
        // ... 50+ cas
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := EvaluateHand(parseCards(tt.hole), parseCards(tt.community))
            assert.Equal(t, tt.expected, result.Rank)
        })
    }
}

func TestGracePeriod(t *testing.T) {
    table := NewTable("poker")
    player := table.AddPlayer("usr_1", 10000)
    
    // Simuler déconnexion
    table.DisconnectPlayer(player.ID)
    assert.False(t, player.IsConnected)
    assert.NotNil(t, table.GraceTimers[player.ID])
    
    // Reconnexion dans les 30s
    time.Sleep(5 * time.Second)
    table.ReconnectPlayer(player.ID)
    assert.True(t, player.IsConnected)
    assert.Nil(t, table.GraceTimers[player.ID])
    
    // Grace period expire
    table.DisconnectPlayer(player.ID)
    time.Sleep(30 * time.Second)
    table.CheckTimeouts()
    assert.False(t, player.IsActive) // fold auto
}
```

### 8.2 Tests charge

```go
func BenchmarkTableAction(b *testing.B) {
    table := NewTable("poker")
    table.AddPlayer("usr_1", 10000)
    table.AddPlayer("usr_2", 10000)
    table.StartHand()
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        table.ProcessAction(Action{Type: "check", PlayerID: "usr_1"})
    }
}

// Objectif : < 1ms par action
```

### 8.3 Tests RNG

```bash
# Dieharder
$ dieharder -a -g 201 -f rng_output.bin

# TestU01 (SmallCrush)
$ ./testu01_smallcrush rng_output.bin

# Chi-square uniformité cartes
$ python3 test_card_uniformity.py --samples 1000000 --decks 52
```

---

## 9. Sécurité moteur V2

### 9.1 Validation serveur (critique)

| Action | Validation serveur |
|--------|-------------------|
| Mise | Solde table >= mise, limite table respectée |
| Cartes | Distribution aléatoire seedée, cartes réelles stockées serveur |
| Résultat | Recalculé côté serveur, jamais envoyé par client |
| Pot | Somme des mises = pot + rake (vérifié à chaque action) |
| Temps | Timestamp serveur, pas client |
| Reconnexion | last_event_id validé, pas de replay events anciens |

### 9.2 Anti-triche V2

| Menace | Défense |
|--------|---------|
| Client modifié | Toute logique côté serveur |
| Bot / automation | reCAPTCHA v3 + timing analysis |
| Cartes visibles | Seules cartes du joueur envoyées via WS |
| Collusion | Analyse graphe (voir doc fraude) |
| Ralentissement | Timeout stricts + action auto |
| Multi-compte | Device fingerprinting + KYC |
| Reconnexion abuse | Grace period limitée 30s, pas de répétition |

---

## 10. Performance cibles V2

| Métrique | Objectif | Méthode de test |
|----------|----------|-----------------|
| Latence action WS | < 10ms | Benchmark Go |
| Latence broadcast | < 5ms | Benchmark Go |
| Reconnexion complète | < 2s | Test manuel + auto |
| Grace period | Exactement 30s | Test unitaire |
| Tables simultanées | 500+ | Load test |
| CCU total | 5 000 | Load test |
| Uptime table active | 99.99% | Monitoring |
| Recovery crash | < 5s | Kill process + mesure |

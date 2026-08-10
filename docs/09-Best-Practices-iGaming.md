# Best Practices iGaming + Contexte Madagascar
## Référence Document

**Version:** 1.0  
**Date:** 2026-08-10  
**Public cible:** Équipe produit, développement, marketing

---

## 1. Benchmark des leaders iGaming

### 1.1 PokerStars (référence mondiale)

**Ce qui marche** :
- Lobby ultra-simple : "Jouer maintenant" comme CTA principal
- Multi-tabling jusqu'à 24 tables (pro)
- Hand replayer intégré (résolution litiges)
- Note taking sur adversaires
- HUD (Heads-Up Display) stats en temps réel
- Zoom Poker (tables rapides sans sélection)
- Tournois satellites (qualification events majeurs)

**Ce qui ne marche pas pour nous** :
- Interface surchargée (trop d'options pour débutant)
- Pas de mobile money
- Pas de localisation malgache
- Pas de Belote/Rami

**À adapter** :
- CTA "Jouer maintenant" → table rapide automatique
- Hand replayer → MVP (résolution litiges)
- Zoom Poker → tables rapides sans sélection (MVP)
- HUD simplifié → V1.5 (stats basiques)

### 1.2 GGPoker (innovation UX)

**Ce qui marche** :
- Interface moderne, animations fluides
- SnapCam (vidéo réaction courte) → engagement social
- Rush & Cash (tables rapides avec bounty)
- Smart HUD (stats adaptées niveau)
- All-in insurance (assurance quand all-in)
- Staking (parier sur autres joueurs)

**À adapter** :
- SnapCam → réactions emoji/avatar (V2)
- Rush & Cash → tables rapides avec bonus (V1.5)
- All-in insurance → V2 (si juridiquement OK)

### 1.3 Betika (mobile-first Afrique)

**Ce qui marche** :
- App web < 1MB (chargement rapide sur 3G)
- Paiement M-Pesa en 2 clics
- Push notifications SMS fallback
- Bonus de bienvenue clair et simple
- Support WhatsApp
- Cash-out rapide (< 5 min)

**À adapter** :
- Poids app minimal → React lazy loading, bundle splitting
- Paiement 2 clics → dépôt MVola direct (pas 5 étapes)
- SMS fallback → notifications push + SMS
- Support WhatsApp → WhatsApp Business FR + MG

---

## 2. Bonnes pratiques UX mobile-first Afrique

### 2.1 Performance

| Métrique | Objectif | Pourquoi |
|----------|----------|----------|
| First Contentful Paint | < 1.5s | Connexion 3G lente |
| Time to Interactive | < 3s | Patient malgache court |
| Bundle JS initial | < 200KB | Data coûte cher |
| Images | WebP, lazy loading | Économie data |
| Fonts | System fonts (pas Google Fonts) | Économie data |
| Cache | Service Worker + IndexedDB | Offline partial |

### 2.2 Design pour connexions instables

- **Skeleton screens** pendant chargement (pas spinner seul)
- **Progressive enhancement** : contenu statique d'abord, puis dynamique
- **Optimistic UI** : actions affichées immédiatement, rollback si échec
- **Toast notifications** : "Action en cours..." → "Action confirmée"
- **Pull-to-refresh** sur listes (lobby, historique)
- **Offline indicator** : bandeau "Connexion perdue" discret

### 2.3 Navigation mobile

- **Bottom navigation** (pas hamburger menu) : Accueil, Jouer, Profil
- **Swipe** entre sections
- **Large touch targets** (min 44x44dp)
- **Pas de hover** (pas de souris sur mobile)
- **Keyboard friendly** : input numérique pour montants

### 2.4 Inscription minimale

| Étape | Champs | Pourquoi |
|-------|--------|----------|
| 1 | Numéro téléphone | Unique, vérifié par SMS |
| 2 | OTP (6 chiffres) | Vérification |
| 3 | Pseudo + Mot de passe | Identité + sécurité |
| Total | 3 écrans | < 60 secondes |

**PAS d'email obligatoire** (optionnel). **PAS de nom complet** (optionnel). **PAS de date de naissance** (mode simulation).

---

## 3. Contexte Madagascar spécifique

### 3.1 Réalités numériques

| Aspect | Donnée | Impact produit |
|--------|--------|---------------|
| Pénétration Internet | 20,4% | Base limitée, acquisition coûteuse |
| Mobile dominant | 97% du trafic | Mobile-first obligatoire |
| Android | ~85% | Pas besoin iOS en MVP |
| Data mobile | ~500 MGA/GB (pas cher mais revenus faibles) | Optimiser poids app |
| Électricité | Coupures fréquentes | Grace period, state persistant |
| Langues | Malgache (maternelle), Français (éducatif) | Bilingue obligatoire |
| Mobile money | 6,1M actifs | Canal prioritaire |
| Réseau social | WhatsApp > Facebook | Partage WhatsApp natif |

### 3.2 Culture des jeux de cartes

| Jeu | Popularité | Contexte |
|-----|-----------|----------|
| **Belote** | ⭐⭐⭐⭐⭐ | Ultra populaire, familial, compétitif |
| **Rami** | ⭐⭐⭐⭐⭐ | Traditionnel, intergénérationnel |
| **Poker** | ⭐⭐⭐ | Croissant (TV, streams), jeune |
| **Blackjack** | ⭐⭐⭐ | Casino, moins familial |
| **Domino** | ⭐⭐⭐⭐ | Très populaire (V2 ?) |

**Insight** : Belote et Rami sont des **jeux sociaux** (famille, amis). Poker est **compétitif**. L'acquisition via Belote/Rami puis conversion vers Poker est une stratégie forte.

### 3.3 Paiements — Réalités terrain

| Aspect | Réalité | Impact |
|--------|---------|--------|
| MVola | Leader, ~60% du marché | P0 obligatoire |
| Orange Money | ~30% | P0 |
| Airtel Money | ~10% | P1 |
| Cartes bancaires | Très peu répandues | P1 |
| Cash-in / Cash-out | Agents physiques partout | Éducation utilisateur |

**Problème** : Les opérateurs mobile money malgaches n'ont pas toujours d'API ouverte. Processus souvent manuel ou via agrégateurs.

### 3.4 Concurrence locale

| Concurrent | Type | Menace |
|------------|------|--------|
| Plateformes étrangères (Betway, etc.) | Mondial | Marque reconnue mais pas localisé |
| Jeux physiques | Traditionnel | Gratuit, social, pas digital |
| WhatsApp groups | Informel | Belote par texto, pas de monétisation |
| Plateformes locales informelles | WordPress basique | Confiance limitée, pas sécurisé |

**Opportunité** : Premier à combiner **localisation + sécurité + mobile money + Belote/Rami**.

---

## 4. Stratégies d'acquisition Madagascar

### 4.1 Canaux prioritaires

| Canal | Priorité | Coût estimé | Raison |
|-------|----------|-------------|--------|
| WhatsApp viral | P0 | Gratuit | Partage natif, groupes familiaux |
| Micro-influenceurs | P0 | ~20-50€/post | 10K-50K followers, confiance locale |
| Facebook Ads | P1 | ~0.50-2€/install | Large audience malgache sur FB |
| Radio locale | P1 | ~100-300€/spot | Couverture nationale, confiance |
| Parrainage | P0 | 5 000 jetons/ami | Viralité organique |
| Événements locaux | P2 | Variable | Tournois Belote en physique |

### 4.2 Tactiques virales

```
PARRAINAGE
├── Inviter un ami → 5 000 jetons (parrain)
├── Ami s'inscrit → 5 000 jetons (filleul)
├── Table privée → lien WhatsApp partageable
└── "Jean t'a invité à jouer à la Belote !"

RÉSEAU SOCIAL
├── Classement amis (pas global)
├── Stats comparables ("Tu as battu Jean 3 fois cette semaine")
├── Réactions emoji en table
└── Partage résultats (screenshot auto)

ÉVÉNEMENTS
├── Tournoi Belote gratuit hebdomadaire (simulation)
├── Prix : crédits téléphone, data, goodies
└── Live stream sur Facebook (engagement)
```

---

## 5. Bonnes pratiques techniques

### 5.1 Code Go — Conventions

```go
// Table manager — une goroutine par table
type TableManager struct {
    tables map[uuid.UUID]*Table
    mu     sync.RWMutex
}

func (tm *TableManager) CreateTable(config TableConfig) *Table {
    table := NewTable(config)
    
    tm.mu.Lock()
    tm.tables[table.ID] = table
    tm.mu.Unlock()
    
    // Goroutine dédiée
    go table.Run()
    
    return table
}

// Grace period
type GracePeriod struct {
    PlayerID  uuid.UUID
    Timer     *time.Timer
    StartedAt time.Time
}

func (t *Table) StartGracePeriod(playerID uuid.UUID) {
    gp := &GracePeriod{
        PlayerID:  playerID,
        StartedAt: time.Now(),
        Timer: time.AfterFunc(30*time.Second, func() {
            t.HandleGracePeriodExpired(playerID)
        }),
    }
    
    t.gracePeriods[playerID] = gp
    t.BroadcastPlayerDisconnected(playerID, 30)
}
```

### 5.2 Code React — Patterns

```typescript
// Hook reconnexion élégante
function useGameWebSocket(tableId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  const connect = useCallback(() => {
    const newSocket = io(`/game/${tableId}`, {
      auth: { token: getAuthToken() },
      query: lastEventId ? { last_event_id: lastEventId } : undefined,
    });
    
    newSocket.on('connect', () => {
      setIsReconnecting(false);
    });
    
    newSocket.on('disconnect', () => {
      setIsReconnecting(true);
    });
    
    newSocket.on('sync_data', (data) => {
      restoreTableState(data.snapshot);
      applyMissedEvents(data.missedEvents);
      setLastEventId(data.currentEventId);
    });
    
    setSocket(newSocket);
  }, [tableId, lastEventId]);
  
  useEffect(() => {
    connect();
    return () => { socket?.disconnect(); };
  }, [connect]);
  
  return { socket, isReconnecting };
}
```

### 5.3 i18n — Structure recommandée

```
locales/
├── fr/
│   ├── common.json      (boutons, labels)
│   ├── games.json       (règles, actions)
│   ├── errors.json      (messages erreur)
│   └── support.json     (FAQ, tickets)
└── mg/
    ├── common.json
    ├── games.json
    ├── errors.json
    └── support.json

// Usage React
const { t } = useTranslation('games');
<Button>{t('poker.actions.bet')}</Button>
// Affiche : "Miser" (FR) ou "Petaka" (MG)
```

---

## 6. Références et ressources

### 6.1 Documentation technique
- [Django Channels docs](https://channels.readthedocs.io/)
- [Gorilla WebSocket](https://github.com/gorilla/websocket)
- [Socket.io v4 protocol](https://socket.io/docs/v4/)
- [Stripe Elements](https://stripe.com/docs/payments/elements)
- [reCAPTCHA v3](https://developers.google.com/recaptcha/docs/v3)

### 6.2 Références iGaming
- [GLI-19 Standard](https://gaminglabs.com/wp-content/uploads/2024/06/GLI-19-Interactive-Gaming-Systems-v3.0.pdf)
- [FATF Casinos](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatfguidanceontherisk-basedapproachforcasinos.html)
- [PCI DSS](https://www.pcisecuritystandards.org/standards/)

### 6.3 Contexte Madagascar
- [DataReportal Digital 2026 Madagascar](https://datareportal.com/reports/digital-2026-madagascar)
- [IMF Mobile Money Madagascar](https://fred.stlouisfed.org/series/MDGFCMAANUM)
- [GSMA Mobile Money](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/gsma_resources/the-state-of-the-industry-report-on-mobile-money-2026/)

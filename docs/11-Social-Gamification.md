# Social & Gamification — iGaming Madagascar Platform
## Specification Document

**Version:** 1.0  
**Date:** 2026-08-10  
**Public cible:** Product Manager, Frontend Devs, Backend Devs

---

## 1. Vision sociale

### 1.1 Principe fondamental
> Les Malgaches ne jouent pas aux cartes pour gagner de l'argent. Ils jouent pour **passer du temps ensemble**, **rire**, **se défier**, et **créer des souvenirs**. Notre produit doit être **un lieu de rencontre**, pas juste une plateforme de jeu.

### 1.2 Benchmark social

| Plateforme | Social feature | Ce qu'on copie | Ce qu'on améliore |
|------------|---------------|----------------|-------------------|
| **PokerStars Home Games** | Clubs privés | Structure club | Localisation MG, Belote/Rami |
| **Discord** | Communautés | Channels, rôles | Intégré au jeu, pas app externe |
| **Duolingo** | Streaks, missions | Progression quotidienne | Missions par jeu, pas générique |
| **Strava** | Leaderboards amis | Comparatif proches | Leaderboards par jeu + club |
| **GGPoker** | SnapCam | Réactions visuelles | Chat vocal (plus naturel pour Belote) |

---

## 2. Système d'amis

### 2.1 Ajouter un ami

```
Méthodes :
├── Par numéro de téléphone (recherche)
├── Depuis table ("Ajouter {pseudo}")
├── Par code ami ({pseudo}#{code})
├── Depuis contacts téléphone (opt-in)
└── Par QR code (tablette cybercafé)
```

### 2.2 Statut ami

| Statut | Description | Actions |
|--------|-------------|---------|
| **En ligne** | Connecté, pas en jeu | Inviter, message |
| **En jeu** | Dans une partie | Spectateur, attendre |
| **Hors ligne** | Déconnecté | Notification push |
| **En recherche** | Cherche table | Rejoindre sa recherche |

### 2.3 Interaction amis

- **Inviter à table** : 1 clic → notification → accepte/rejette
- **Inviter à club** : Si ami dans même ville → suggérer club local
- **Défier** : "Je te défie en Belote !" → création table privée auto
- **Message privé** : Chat texte, historique, photos (optionnel V2)

---

## 3. Système de Clubs

### 3.1 Création club

```
Champs obligatoires :
├── Nom du club (ex: "Beloteurs d'Antsirabe")
├── Ville (pour leaderboard régional)
├── Description
├── Langue principale (FR ou MG)
└── Type : Ouvert (tous) ou Fermé (invitation)

Paramètres :
├── Logo (upload image ou avatar généré)
├── Couleurs club (primaire + secondaire)
├── Limite membres (50 / 100 / 250 / Illimité)
├── Tables réservées (max 5 simultanées)
└── Tournois privés (mensuel/hebdo)
```

### 3.2 Rôles club

| Rôle | Permissions | Limite |
|------|-------------|--------|
| **Fondateur** | Tout | 1 |
| **Administrateur** | Gérer membres, modérer chat, organiser tournois | 3 |
| **Modérateur** | Expulser temporairement, modérer chat | 5 |
| **Membre** | Jouer, chatter, participer tournois | Illimité |
| **Nouveau** | Jouer (1 semaine d'essai) | Illimité |

### 3.3 Tables réservées club

```
Table "Belote du Dimanche"
├── Club : Beloteurs d'Antsirabe
├── Accès : Membres du club uniquement
├── Horaire : Dimanche 20h-23h (récurrent)
├── Buy-in : Simulation (10 000 jetons)
├── Rake : 0% (club = pas de commission)
└── Chat : Vocal activé par défaut
```

### 3.4 Économie club

```
Points Club (non monétaires)
├── Participation table club → +10 pts
├── Victoire en tournoi club → +50 pts
├── Inviter nouveau membre → +25 pts
├── Activité hebdo (5+ parties) → +20 pts
└── Don de points possibles (entre membres)

Récompenses club (débloquables)
├── 100 pts : Badge "Membre actif"
├── 500 pts : Couleur personnalisée pseudo
├── 1000 pts : Accès table VIP club
├── 5000 pts : Titre "Pilier du club"
└── 10000 pts : Statut Admin temporaire (élection)
```

### 3.5 Tournois club

```
Format standard club :
├── Inscription : 1 semaine avant
├── Buy-in : Gratuit (simulation) ou payant (réel)
├── Format : Freezeout ou Rebuy
├── Prize pool : Jetons club ou MGA réel
├── Distribution : 50% / 30% / 20% (top 3)
└── Live stream : Optionnel (fondateur only)
```

---

## 4. Gamification — Système complet

### 4.1 XP et Niveaux

| Niveau | Titre FR | Titre MG | XP requis | Débloque |
|--------|----------|----------|-----------|----------|
| 1 | Nouveau | Vaovao | 0 | — |
| 2 | Apprenant | Mpianatra | 100 | Stats basiques |
| 3 | Initié | Niantomboka | 300 | Table privée |
| 4 | Régulier | Mahazatra | 600 | Streak bonus |
| 5 | Intermédiaire | Ampahany | 1 000 | Smart HUD |
| 6 | Confirmé | Maty paika | 1 500 | Clubs |
| 7 | Avancé | Advanced | 2 200 | Tournois open |
| 8 | Expert | Manan-kaja | 3 000 | Table VIP |
| 9 | Maître | Mpampianatra | 5 000 | Chat vocal |
| 10 | Légende | Lohateny | 10 000 | Badge unique |

**Gains XP par action** :

| Action | XP | Limite/jour |
|--------|-----|-------------|
| Partie terminée | +10 | Illimité |
| Victoire | +25 | Illimité |
| Premier Rami/Belote | +50 | 1x/jour |
| Streak 3 victoires | +30 | 1x/jour |
| Inviter ami | +20 | 5x/jour |
| Mission quotidienne | +15-50 | 3/jour |
| Tournoi (participation) | +20 | Illimité |
| Tournoi (top 10%) | +50 | Illimité |
| Tournoi (top 3) | +100 | Illimité |

### 4.2 Missions quotidiennes

```
Système de missions (3 par jour, reset 00:00 MG)

Mission 1 — Facile (toujours accessible)
├── "Termine 1 partie de Belote" → +15 XP + 500 jetons
└── Objectif : ramener joueur chaque jour

Mission 2 — Moyen (débloqué niveau 3+)
├── "Gagne 2 parties de Rami" → +30 XP + 1 000 jetons
└── Objectif : engagement 20-30 min

Mission 3 — Difficile (débloqué niveau 5+)
├── "Fais un Rami sans joker" → +50 XP + 2 000 jetons
└── Objectif : challenge technique

Série de missions (7 jours)
├── Jour 1 : Facile → Jour 7 : Difficile
├── Bonus jour 7 : +5 000 jetons + badge "Semaine complète"
└── Si série cassée → recommence Jour 1
```

### 4.3 Streak Login

```
Récompenses cumulatives (reset si manque un jour)

Jour 1 : +500 jetons
Jour 2 : +750 jetons
Jour 3 : +1 000 jetons
Jour 4 : +1 500 jetons + 1 ticket tournoi freeroll
Jour 5 : +2 000 jetons
Jour 6 : +3 000 jetons
Jour 7 : +5 000 jetons + badge "Régulier" + accès table VIP

Bonus :
├── Streak 30 jours : +20 000 jetons + titre "Fidèle"
├── Streak 60 jours : +50 000 jetons + couleur pseudo exclusive
└── Streak 90 jours : +100 000 jetons + avatar légendaire
```

### 4.4 Succès / Badges

| Badge | Condition | Récompense |
|-------|-----------|------------|
| 🃏 **Premier pas** | Première partie | +500 jetons |
| 🏆 **Première victoire** | Gagner une partie | +1 000 jetons |
| 🔄 **Rami !** | Première partie Rami gagnée | +2 000 jetons |
| 🔔 **Belote !** | Annoncer Belote (Dame+Roi atout) | +1 500 jetons |
| 💰 **High Roller** | Miser 100 000 jetons en une partie | +5 000 jetons |
| 🧠 **Stratège** | Gagner avec bluff (Poker, adversaire fold) | +3 000 jetons |
| 👥 **Social** | Inviter 5 amis qui jouent | +5 000 jetons |
| 🏘️ **Clubman** | Rejoindre 3 clubs | +2 000 jetons |
| 🔥 **Sur feu** | 10 victoires consécutives | +10 000 jetons |
| 🌟 **Légende** | Atteindre niveau 10 | +50 000 jetons |

### 4.5 Leaderboards

```
Types de leaderboard (reset hebdo le dimanche 00:00)

1. Global — Tous les joueurs
   ├── Parties jouées
   ├── Victoires
   ├── Profit (jetons)
   └── XP gagnée

2. Amis — Uniquement contacts
   ├── Même métriques que global
   └── Invite à dépasser un ami (notification)

3. Club — Membres du club
   ├── Contribution club (points)
   ├── Victoires en table club
   └── Tournois club

4. Régional — Par ville/pays
   ├── Top Antananarivo
   ├── Top Toamasina
   └── Top Antsirabe

5. Par jeu — Poker / Belote / Rami
   ├── ELO Poker
   ├── Victoires Belote
   └── Temps moyen Rami

Affichage :
├── Top 3 : Podium visuel + avatar + pseudo
├── Position utilisateur : Surlignée en couleur
├── +/- vs semaine précédente : Flèche verte/rouge
└── Récompense top 10 : Jetons + badge hebdo
```

---

## 5. Tournois — Système complet

### 5.1 Types de tournois

| Type | Description | Joueurs | Durée | Priorité |
|------|-------------|---------|-------|----------|
| **Freeroll** | Gratuit, prize jetons | 16-64 | 1-2h | V1.5 |
| **Freezeout** | 1 vie, élimination directe | 8-128 | 2-4h | V1.5 |
| **Rebuy** | Re-achat possible période 1 | 8-64 | 2-3h | V2 |
| **Satellite** | Qualification pour tournoi majeur | 4-32 | 1-2h | V2 |
| **Bounty** | Récompense pour éliminer joueur | 16-64 | 2-3h | V2 |
| **Shootout** | Table gagnant avance | 8-32 | 1-2h | V2 |
| **Belote Team** | Par équipe de 2 | 8-16 équipes | 2-3h | V1.5 |

### 5.2 Structure tournoi (exemple Freezeout)

```
Inscription : J-7 à J-0 (00:00)
Buy-in : 5 000 jetons (simulation)
Prize pool : Buy-in × joueurs - rake

Structure blinds :
├── Niveau 1 : 10/20 (15 min)
├── Niveau 2 : 20/40 (15 min)
├── Niveau 3 : 30/60 (15 min)
├── ... (monte toutes les 15 min)
└── Niveau N : All-in or fold (table finale)

Distribution prix (ex: 32 joueurs, prize pool 160 000)
├── 1er : 50 000 (31%)
├── 2ème : 30 000 (19%)
├── 3ème : 20 000 (13%)
├── 4ème : 12 000 (8%)
├── 5-8ème : 6 000 chacun (15%)
└── 9-16ème : 2 000 chacun (10%)

Interface tournoi :
├── Table courante (cartes, actions, timer)
├── Classement temps réel (positions, stacks, bubble)
├── Tables restantes (nombre, moyenne stack)
├── Blinds courantes + prochaines
├── Payout structure ("Il vous manque X pour être payé")
└── Chat tournoi (tous les participants)
```

### 5.3 Tournois spéciaux

```
Tournoi Hebdo Belote (dimanche 18h)
├── Format : Belote Team, freezeout
├── Buy-in : 10 000 jetons
├── Prize : 200 000 jetons + badge exclusif
└── Stream : Commenté par influenceur local

Tournoi Majeur Mensuel (dernier samedi)
├── Format : Poker MTT, freezeout
├── Buy-in : 50 000 jetons
├── Prize : 1 000 000 jetons + titre "Champion du Mois"
└── Qualification : Satellites toute la semaine

Tournoi Club (date variable)
├── Organisé par club fondateur
├── Accès : Membres du club uniquement
├── Prize : Défini par club (jetons ou réel)
└── Rake : 0% (cadeau aux clubs actifs)
```

---

## 6. Chat et Communication

### 6.1 Chat table (texte)

```
Fonctionnalités :
├── Messages publics (tous à la table)
├── Réactions rapides (emoji) : 👍 🔥 😂 😡 👏
├── Prédictions (Poker : "Tu as flush ?")
└── Historique : Dernières 50 messages

Modération :
├── Filtre mots interdits (FR + MG)
├── Signalement (joueur + raison)
├── Mute temporaire (1h / 24h / 7j)
└── Ban table (pour partie)
```

### 6.2 Chat vocal (V1.5, table privée uniquement)

```
Pourquoi table privée uniquement :
├── Évite toxicité publique
├── Belote = jeu social, vocal naturel
├── Famille/amis = confiance
└── Réduit besoin modération

Implémentation :
├── WebRTC (peer-to-peer)
├── Activation : Toggle par joueur
├── Indicateur : Icône micro (vert = parle)
├── Volume ajustable par joueur
└── Mute individuel possible
```

### 6.3 Système de réactions

```
Réactions instantanées (pas de texte) :
├── 👍 Bonne carte / bon move
├── 🔥 Hot hand / gros pot
├── 😂 Bluff réussi
├── 😡 Mauvaise beat
├── 👏 Respect
├── 🎉 Victoire
└── 💀 All-in

Affichage : Bulle emoji flottante au-dessus avatar (2s)
```

---

## 7. Acquisition virale intégrée

### 7.1 Parrainage amélioré

```
Flux idéal :
├── Jean joue une Belote spectaculaire
├── Bouton "Partager" → Génère highlight (3 images)
├── Jean envoie à WhatsApp group "Famille"
├── Marie (sœur) voit highlight → lien direct table
├── Marie clique → landing → inscription 30s
├── Table privée "Famille" pré-créée avec Jean + Marie
└── Notification : "Jean t'attend à la table Famille !"

Récompenses parrainage :
├── Parrain : +5 000 jetons + 2% rake filleul (1 mois)
├── Filleul : +5 000 jetons + accès table VIP (3 jours)
└── Si filleul dépose réel : +10 000 jetons parrain
```

### 7.2 Highlights automatiques

```
Détection moments forts :
├── Poker : All-in gagnant avec bad beat
├── Belote : Contrat réussi à la dernière carte
├── Rami : Rami sur pioche (probabilité faible)
└── Général : Victoire tournoi, comeback +80% stack

Génération :
├── Capture automatique (cartes, pot, réactions)
├── Template visuel (branding Casino MDG)
├── Texte auto : "Jean a gagné 50 000 avec un Rami !"
└── Export : Image PNG + lien partageable
```

### 7.3 Influenceur intégré

```
Programme Streamer (V2) :
├── Joueur active "Mode Stream"
├── Spectateurs illimités (pas de limite 6)
├── Chat spectateur séparé
├── Don jetons possible (spectateur → streamer)
└── Revenu streamer : % des dons

Programme Ambassadeur (V3) :
├── Code promo unique : "JEAN2026"
├── Tracking : Inscriptions, dépôts, activité
├── Récompense : % revenus générés
├── Exclusivité : Tables ambassadeur, tournois privés
└── Support : Matériel marketing, coaching
```

---

## 8. Implémentation technique

### 8.1 Backend (Django)

```python
# Models ajoutés

class Club(models.Model):
    name = models.CharField(max_length=100)
    city = models.CharField(max_length=50)
    description = models.TextField()
    logo_url = models.URLField()
    primary_color = models.CharField(max_length=7)
    secondary_color = models.CharField(max_length=7)
    max_members = models.IntegerField(default=50)
    is_open = models.BooleanField(default=True)
    founder = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

class ClubMembership(models.Model):
    club = models.ForeignKey(Club, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(choices=CLUB_ROLES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)
    points = models.IntegerField(default=0)

class DailyMission(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    mission_type = models.CharField(choices=MISSION_TYPES)
    target_value = models.IntegerField()
    current_value = models.IntegerField(default=0)
    completed = models.BooleanField(default=False)
    reward_xp = models.IntegerField()
    reward_tokens = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

class Achievement(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    name_mg = models.CharField(max_length=100)
    description = models.TextField()
    icon_url = models.URLField()
    condition_type = models.CharField(choices=ACHIEVEMENT_CONDITIONS)
    condition_value = models.IntegerField()
    reward_tokens = models.IntegerField()
```

### 8.2 Game Engine (Go)

```go
// Tournoi support

type Tournament struct {
    ID              uuid.UUID
    Name            string
    GameType        string
    Format          string // freezeout, rebuy, bounty
    Status          string // registering, running, completed
    MaxPlayers      int
    Registered      int
    BuyIn           int
    PrizePool       int
    Blinds          []BlindLevel
    Tables          []TournamentTable
    Players         []TournamentPlayer
    StartTime       time.Time
    RegistrationEnd time.Time
}

func (t *Tournament) Start() {
    // Créer tables, assigner joueurs, démarrer blinds
    t.assignSeats()
    t.startBlindTimer()
    t.broadcast("tournament_started")
}

func (t *Tournament) EliminatePlayer(playerID uuid.UUID) {
    // Mettre à jour classement, redistribuer tables si nécessaire
    t.updateLeaderboard()
    if t.shouldMergeTables() {
        t.mergeTables()
    }
}
```

---

## 9. KPIs Social & Gamification

| KPI | Cible V1.5 | Mesure |
|-----|-----------|--------|
| Amis moyens / user | 3 | Amis acceptés |
| Clubs rejoints / user | 1 | Clubs avec membership |
| Parties table privée / total | 40% | Ratio parties |
| Missions complétées / jour | 2.5 | Moyenne user actif |
| Streak moyen | 5 jours | Logins consécutifs |
| Tournois participés / semaine | 2 | Moyenne user actif |
| Partages WhatsApp / semaine | 1.5 | Clics bouton partage |
| Invitations envoyées / user | 2 | Total / users |
| Taux conversion invitation | 15% | Inscrits / invitations |

# PRD V2 — iGaming Madagascar Platform
## Product Requirements Document (Révision critique)

**Version:** 2.0  
**Date:** 2026-08-10  
**Statut:** Draft révisé post-critique  
**Auteur:** Projet Casino MDG  
**Public cible:** Équipe technique, Product Manager, CTO, partenaires

---

## 1. Vue d'ensemble

### 1.1 Vision produit
Construire une plateforme iGaming B2C **mobile-money-first**, localisée pour Madagascar puis extensible vers l'Afrique francophone. La plateforme propose **Poker Texas Hold'em, Rami et Belote** (P0) avec wallet virtuel, paiements MVola/Orange Money/Airtel Money, mode simulation, et système anti-fraude multi-couche.

### 1.2 Ce qui a changé depuis V1

| Changement | V1 | V2 |
|------------|-----|-----|
| Jeux MVP | Poker, Blackjack, Rami, Belote (4) | **Poker, Rami, Belote (3)** — Blackjack P1 |
| Malgache | P1 | **P0 obligatoire** |
| MVP durée | 6 mois | **6-7 mois** (3 jeux + polish) |
| Blackjack | P0 | **P1** (moteur plus simple, ajoutable vite) |
| Belote coinchée | P1.5 | **P1** (variante après classique validée) |

**Pourquoi Blackjack reporté P1** :
- Moteur joueur-vs-banque, pas de collusion, pas de multi-compte complexe
- Techniquement simple à ajouter une fois l'infrastructure temps réel Go validée
- Ne nécessite pas WebSocket complexe (tour par tour suffit)
- Focus MVP sur les jeux communautaires (Poker, Belote, Rami) = meilleur retention

### 1.3 Positionnement
> « Plateforme iGaming mobile money-first, localisée Madagascar, malgache et française, sécurité casino-grade, conformité progressive, RNG auditable, et expérience pensée pour connexions instables. »

### 1.4 Objectifs métier MVP (V1 — Mode Simulation, 6-7 mois)

| Objectif | Cible | Métrique |
|----------|-------|----------|
| Acquisition | **2 000** comptes enregistrés | Signups avec téléphone vérifié |
| Activation | 40% joue dans les 24h | Premier dépôt jetons |
| Retention | DAU/MAU > **12%** | Usage actif quotidien |
| Session | > 15 min/session | Temps moyen par partie |
| Réengagement | J+7 > 25%, J+30 > 10% | Taux retour |
| Satisfaction | NPS > **25** | Sondage post-partie |
| Stabilité | Uptime > **99.5%** | Monitoring infrastructure |
| Reconnexion | < 5s | Reconnect post-coupure |

**Pourquoi les objectifs sont plus conservateurs** : connexion internet malgache moins stable = sessions plus courtes mais plus fréquentes.

### 1.5 Non-objectifs (pour éviter scope creep)
- ❌ Blackjack (P1, 2-3 mois après MVP)
- ❌ Tournois (V1.5, 3-4 mois après MVP)
- ❌ Argént réel (Phase 2, post-juridique)
- ❌ Belote coinchée (P1)
- ❌ Cartes bancaires (P1)
- ❌ Application native (V3, 18+ mois)
- ❌ B2B/white-label (V4, 24+ mois)
- ❌ Chat vocal / vidéo (V2)
- ❌ Système de "niveaux" / XP gamification (V1.5)

---

## 2. Contexte Madagascar — Contraintes et opportunités

### 2.1 Réalités du terrain

| Aspect | Réalité | Impact produit |
|--------|---------|---------------|
| **Réseau** | 3G/4G intermittente, fibre rare | Grace period 30s, snapshots, reconnexion élégante |
| **Électricité** | JIRAMA : coupures fréquentes | State persistant, pas de perte de main |
| **Appareils** | Android majoritaire (Samsung, Tecno, Xiaomi) | PWA d'abord, pas d'iOS nécessaire en MVP |
| **Paiement** | MVola > Orange Money > Cash | MVola P0, Orange Money P0, Airtel P1 |
| **Langue** | Malgache maternelle, français éducatif | Interface bilingue, support bilingue |
| **Jeux culturels** | Belote très populaire, Rami traditionnel | Belote = levier d'acquisition majeur |
| **Confiance** | Méfiance envers plateformes étrangères | Localisation, support local, transparence |
| **Cybercafés** | Connexion partagée, IP identiques | Anti-fraude : IP jamais seule |

### 2.2 Benchmark apps similaires en Afrique

| Plateforme | Pays | Ce qui marche | Ce qui manque |
|------------|------|---------------|---------------|
| **Betika** | Kenya, Ouganda | Ultra mobile-first, M-Pesa natif, jeux simples | Peu de jeux de cartes traditionnels |
| **Betway** | Afrique du Sud | Marque reconnue, app native légère | Pas localisé francophone, pas de Belote/Rami |
| **Premier Bet** | Afrique | Cash-out rapide, bonus attractifs | UX datée, temps de chargement longs |
| **PokerStars** | Mondial | Référence poker, tables rapides | Pas mobile money, pas de Belote, trop complexe |
| **GGPoker** | Mondial | Interface moderne, features innovantes | Même problème : pas adapté Afrique |

**Opportunité** : Aucune plateforme ne combine **Poker + Belote + Rami** avec **mobile money + malgache + UX mobile-first**. C'est le créneau.

### 2.3 Bonnes pratiques des leaders (appliquées)

De **PokerStars** :
- Tables rapides (Zoom Poker) → MVP : tables rapides sans sélection de siège
- Hand history exportable → MVP : historique consultable
- Multi-tabling limité → MVP : 2 tables max

De **GGPoker** :
- SnapCam (vidéo réaction) → V2 : réactions emoji/avatar
- Rush & Cash → MVP : tables "rapides" avec auto-rebuy
- Smart HUD (stats adverses) → V1.5 : stats basiques

De **Betika** (mobile-first Afrique) :
- App web ultra-légère (< 1MB) → MVP : bundle React optimisé, lazy loading
- Paiement en 2 clics → MVP : dépôt MVola sans redirection complexe
- Push notifications SMS fallback → MVP : notifications push + SMS

---

## 3. Personas et parcours utilisateur

### 3.1 Personas — Contexte malgache

**Persona 1 — Jean, 26 ans, Antananarivo**
- Livreur à scooter, Tecno Spark, forfait data journalier
- Joue au poker avec des amis le samedi soir
- Utilise MVola pour recevoir paiements clients
- **Besoins** : inscription rapide (téléphone), tables rapides, dépôt MVola en 2 clics, notifications push quand c'est son tour
- **Frictions** : connexion coupe parfois en pleine partie, veut reprendre sans perdre
- **Langue** : Malgache (interface), Français (règles)

**Persona 2 — Mme Raso, 42 ans, Antsirabe**
- Commerçante, Samsung Galaxy, Orange Money pour business
- Joue à la belote en famille depuis 20 ans
- **Besoins** : tables privées (inviter ses sœurs), mode simulation pour apprendre, règles visibles en malgache
- **Frictions** : peur de perdre de l'argent, veut d'abord tester
- **Langue** : Malgache (total), comprend peu le français technique

**Persona 3 — Koto, 19 ans, étudiant, Fianarantsoa**
- Premier smartphone (Itel), budget très limité
- Curieux, regarde des streams de poker sur YouTube
- **Besoins** : mode simulation gratuit, tutoriels intégrés, limites basses
- **Frictions** : data coûte cher, veut app fonctionnant offline (profil)
- **Langue** : Français (études), Malgache (famille)

### 3.2 User Journey — Premier usage (contexte MG)

```
Découverte (Landing) 
    → Inscription (Téléphone, OTP SMS, pseudo)
    → Mode Simulation auto (10 000 jetons)
    → Tutoriel interactif (1 partie guidée Belote)
    → Lobby (choix jeu)
    → Table rapide (matchmaking)
    → Partie
    → Historique + Stats
    → Recharge quotidienne (5 000 jetons)
    → Invitation amis (WhatsApp share)
```

**Différences par rapport à une app européenne** :
- Pas d'email obligatoire (téléphone suffit)
- Pas de vérification KYC pour simulation
- Tutoriel obligatoire pour Belote/Rami (règles complexes)
- Recharge quotidienne (pas de "pay-to-play")
- Partage WhatsApp natif (pas Facebook)

---

## 4. Jeux et fonctionnalités MVP

### 4.1 Tableau des jeux MVP (V1)

| Jeu | Type | Mode simulation | Tournois | Risque fraude | Priorité | Raison |
|-----|------|----------------|----------|--------------|----------|--------|
| **Poker Texas Hold'em** | JvJ | Oui | V1.5 | Très élevé | **P0** | Jeu "premium", rake, retention |
| **Belote classique** | Équipe 2v2 | Oui | V1.5 | Élevé | **P0** | Levier acquisition Madagascar |
| **Rami classique** | JvJ 2-4 | Oui | V1.5 | Élevé | **P0** | Tradition malgache, communautaire |
| Blackjack | JvBanque | Oui | Non | Moyen | **P1** | Simple, ajoutable facilement |
| Belote coinchée | Équipe 2v2 | Oui | V1.5 | Élevé | **P1** | Variante compétitive |

### 4.2 Fonctionnalités Poker Texas Hold'em (P0)

Inspiré PokerStars/GGPoker, adapté contexte MG :

| Fonction | MVP | V1.5 | V2 |
|----------|-----|------|-----|
| Cash games | ✅ | ✅ | ✅ |
| Tables rapides (Zoom) | ✅ | ✅ | ✅ |
| Tables privées (password) | ✅ | ✅ | ✅ |
| Historique mains | ✅ | ✅ | ✅ |
| Rake 3.5% | ✅ | ✅ | ✅ |
| Tournois | — | ✅ | ✅ |
| Multi-tabling (2 tables) | — | ✅ | ✅ |
| Notes joueurs | — | — | ✅ |
| Smart HUD basique | — | — | ✅ |
| All-in insurance | — | — | ✅ |

### 4.3 Fonctionnalités Belote classique (P0)

| Fonction | MVP | V1.5 | V2 |
|----------|-----|------|-----|
| Belote classique 4 joueurs | ✅ | ✅ | ✅ |
| Tables privées | ✅ | ✅ | ✅ |
| Mode simulation | ✅ | ✅ | ✅ |
| Comptage points auto | ✅ | ✅ | ✅ |
| Belote coinchée | — | ✅ | ✅ |
| Annonces (tierce, carré) | — | ✅ | ✅ |
| Tournois par équipe | — | ✅ | ✅ |
| Classement amis | — | — | ✅ |

### 4.4 Fonctionnalités Rami classique (P0)

| Fonction | MVP | V1.5 | V2 |
|----------|-----|------|-----|
| Rami 2-4 joueurs | ✅ | ✅ | ✅ |
| Tables privées | ✅ | ✅ | ✅ |
| Validation combinaisons | ✅ | ✅ | ✅ |
| Comptage points auto | ✅ | ✅ | ✅ |
| Gin Rummy | — | ✅ | ✅ |
| Tournois Rami | — | ✅ | ✅ |
| Variantes (Rami 500) | — | — | ✅ |

### 4.5 Fonctionnalités transversales jeux

| Fonction | Description | Priorité |
|----------|-------------|----------|
| **Grace period** | 30s reconnexion sans perdre place | P0 |
| **Snapshot reconnexion** | State reconstruit après coupure | P0 |
| **Timer action** | 30s poker/belote, 45s rami | P0 |
| **Action auto** | Fold/pass/écart si timeout | P0 |
| **Démarrage auto** | Table se remplit → countdown 10s | P0 |
| **Chat table** | Messages texte, emoji | P0 |
| **Réactions** | Emoji rapide (GG, 😡, 😂) | P1 |
| **Notes joueurs** | Privées, persistantes | P1 |
| **Historique détaillé** | Replay main par main | P1 |
| **Stats perso** | Parties jouées, win rate, profit | P1 |
| **Leaderboard** | Classement hebdo par jeu | P1 |

---

## 5. Localisation — Malgache P0

### 5.1 Priorité linguistique

| Élément | Français | Malgache | Anglais |
|---------|----------|----------|---------|
| Interface (boutons, labels) | **P0** | **P0** | — |
| Support client | **P0** | **P0** | — |
| Règles de jeu intégrées | **P0** | **P0** | — |
| CGU / Politique confidentialité | **P0** | **P0** | — |
| Tutoriels interactifs | **P0** | **P0** | — |
| Notifications push | **P0** | **P0** | — |
| FAQ | **P0** | **P0** | — |
| Email transactionnels | **P0** | **P0** | — |
| Blog / Contenu marketing | **P0** | **P1** | — |

### 5.2 Glossaire technique malgache (exemples)

| Français | Malgache | Contexte |
|----------|----------|----------|
| Se connecter | Miditra | Bouton login |
| Jouer | Milalao | Bouton principal |
| Table | Latabatra | Lobby |
| Miser | Petaka | Poker |
| Suivre | Manaraka | Poker |
| Se coucher | Miala | Poker |
| Atout | Trumps | Belote |
| Belote | Belote | Belote (terme universel) |
| Rami | Rami | Rami (terme universel) |
| Solde | Ny vola | Wallet |
| Déposer | Mametraka | Paiement |
| Retirer | Maka | Retrait |
| Gagner | Nandresy | Résultat |
| Perdre | Resy | Résultat |

**Note** : Les termes "Poker", "Blackjack", "Belote", "Rami" sont compris en Malgache car empruntés. Pas besoin de traduire les noms de jeux.

### 5.3 Support client
- **Canaux** : Chat in-app (FR + MG), WhatsApp Business (FR + MG), email (FR)
- **Horaires** : 8h-22h heure de Madagascar (UTC+3)
- **SLA** : < 2h pour urgent (fonds bloqués), < 24h pour normal

---

## 6. Paiements et Wallet MVP

### 6.1 Canaux MVP (P0)

| Canal | Type | Délais | Frais estimés | Statut |
|-------|------|--------|----------------|--------|
| **MVola** (Telma) | Mobile Money | Instant | ~1.5% | P0 (négociation en cours) |
| **Orange Money** | Mobile Money | Instant | ~1.5% | P0 (négociation en cours) |
| Jetons simulation | Virtuel | Instant | 0% | P0 (dès inscription) |

### 6.2 Jetons simulation (P0)

- Crédit initial : **10 000 jetons** (>= 100 parties)
- Recharge quotidienne : **5 000 jetons** (login quotidien)
- Recharge par visionnage pub : +2 000 jetons (optionnel V1.5)
- Recharge par parrainage : +5 000 jetons (ami inscrit)
- Achat jetons (optionnel V2) : via mobile money, 1 jeton = 1 MGA

**Pourquoi pas d'achat de jetons en MVP** : évite tout soupçon de pari argent réel avant validation juridique.

### 6.3 Mode Simulation vs Réel

| Aspect | Simulation (V1) | Réel (Phase 2) |
|--------|-----------------|----------------|
| Inscription | Téléphone suffit | KYC niveau 1 |
| Monnaie | Jetons virtuels | MGA réel |
| Tables | Sim badge orange | Réel badge vert |
| Gains | Jetons, leaderboard | MGA, retrait |
| Rake | Non | Oui (3.5%) |
| Conversion sim→réel | NON | Jamais (séparation stricte) |

---

## 7. Anti-fraude et sécurité MVP

### 7.1 Score risque (MVP basique)

| Signal | Points MVP |
|--------|------------|
| Même appareil + même IP | +30 |
| Même numéro de retrait | +50 |
| > 5 tables communes en 24h | +20 |
| Comportement robotique (timings constants) | +40 |

| Score | Niveau | Action |
|-------|--------|--------|
| 0-30 | Normal | Rien |
| 31-60 | Surveillance | Log silencieux |
| 61-100 | Suspect | Alerte admin, pas de sanction auto MVP |

**MVP** : Détection basique, sanctions manuelles. V1.5 : sanctions automatiques.

### 7.2 Anti-bot MVP

- reCAPTCHA v3 invisible sur inscription
- Rate limit : max 1 action/seconde sur table
- Détection timing : écart type < 50ms entre actions = suspicion

---

## 8. MVP V1 — Scope détaillé

### 8.1 In (P0)
- Inscription téléphone + OTP + pseudo
- Profil (avatar, stats, préférences langue)
- Wallet simulation (10 000 jetons, recharge quotidienne)
- **Poker Texas Hold'em** : cash game, tables rapides, tables privées
- **Belote classique** : 4 joueurs, comptage auto, tables privées
- **Rami classique** : 2-4 joueurs, validation combinaisons, tables privées
- Grace period 30s + reconnexion snapshot
- Chat table (texte)
- Historique parties
- Leaderboard hebdo
- Support ticket (FR + MG)
- Back-office admin basique
- Notifications push + SMS

### 8.2 Out (reportés)
- ❌ Blackjack (P1)
- ❌ Belote coinchée (P1)
- ❌ Tournois (V1.5)
- ❌ Cartes bancaires (P1)
- ❌ Argént réel (Phase 2)
- ❌ KYC documentaire (Phase 2)
- ❌ Multi-tabling (V1.5)
- ❌ Application native (V3)
- ❌ Chat vocal (V2)

### 8.3 Critères de sortie MVP V1
- [ ] 2 000 comptes enregistrés avec téléphone vérifié
- [ ] 3 jeux jouables en mode simulation
- [ ] Grace period + reconnexion fonctionnels
- [ ] Tests reconnexion : coupure → reconnect < 5s → state intact
- [ ] Malgache présent sur tous les écrans clés
- [ ] 100 parties/jour en moyenne
- [ ] Uptime > 99.5%
- [ ] Zero data loss sur parties en cours
- [ ] Support SLA > 80% respecté
- [ ] Feedback beta testeurs > 4/5

---

## 9. KPIs et métriques

### 9.1 Acquisition
- CAC estimé : **2-5 USD** (acquisition digitale locale)
- Taux inscription : visit → signup > **15%**
- Taux vérification : signup → téléphone confirmé > **80%**

### 9.2 Activation
- Délai signup → première partie < **10 minutes**
- Taux premier tutoriel complété > **60%**

### 9.3 Rétention (adapté connexion MG)
- DAU/MAU > **12%** (objectif prudent)
- Sessions/jour par user : **2-3** (sessions courtes, fréquentes)
- Temps/session moyen : **12-18 min**
- Retour J+1 : > **30%**
- Retour J+7 : > **18%**
- Retour J+30 : > **8%**

### 9.4 Engagement
- Parties/jour par user actif : **3-5**
- Temps total/jour : **30-45 min**
- Tables privées créées : > **20%** des users
- Invitations envoyées : > **15%** des users

---

## 10. Annexes

### A. Glossaire
Voir Annexe A du dossier stratégique.

### B. Hypothèses à valider MVP
- [ ] API MVola accessible aux tiers (due diligence en cours)
- [ ] API Orange Money accessible aux tiers
- [ ] Utilisateurs acceptent mode simulation comme onboarding
- [ ] Belote et Rami génèrent suffisamment d'engagement
- [ ] Reconnexion post-coupure jugée "acceptable" par testeurs

### C. Checklist lancement beta
- [ ] Beta 50 testeurs (amis, famille, communauté locale)
- [ ] Collecte feedback hebdo (Typeform in-app)
- [ ] Corrections rapides (sprints 1 semaine)
- [ ] Objectif : NPS > 25 avant ouverture publique

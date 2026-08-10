# Roadmap Implémentation V2 — iGaming Madagascar Platform
## Implementation Roadmap Document (Révision critique)

**Version:** 2.0  
**Date:** 2026-08-10  
**Statut:** Draft révisé post-critique  
**Public cible:** CTO, Product Manager, CEO, Investors

---

## 1. Ce qui a changé depuis V1

| Changement | V1 | V2 |
|------------|-----|-----|
| MVP jeux | 4 jeux | **3 jeux (Poker, Rami, Belote)** — Blackjack P1 |
| Durée MVP | 6 mois | **7 mois** (3 jeux + Go Engine + résilience MG) |
| Malgache | P1 | **P0 obligatoire** |
| Game Engine | Django Channels | **Go séparé** (apprentissage Go inclus) |
| Budget | Absent | **Estimé 1700$/mois infra MVP** |
| Phase 0 | 3 mois | **3 mois** (due diligence paiement inclus) |

---

## 2. Budget estimé

### 2.1 Infrastructure Cloud MVP (Phase 0-1)

| Service | Fournisseur | Config MVP | Coût/mois |
|---------|-------------|-----------|-----------|
| Compute (API Django) | AWS / DO | 2 × c5.large | ~100$ |
| Compute (Game Engine Go) | AWS / DO | 2 × c5.large | ~100$ |
| Base de données | AWS RDS | db.t3.medium Multi-AZ | ~300$ |
| Cache Redis | AWS ElastiCache | cache.r6g.large | ~200$ |
| Queue RabbitMQ | CloudAMQP | Big Bunny | ~50$ |
| Storage S3 | AWS | 100GB Standard | ~30$ |
| CDN / WAF | Cloudflare | Pro Plan | ~20$ |
| Monitoring | Grafana Cloud + Sentry | Team plan | ~100$ |
| Secrets | HashiCorp Vault | Self-hosted (1 pod) | ~50$ |
| Domaine / DNS | Namecheap / Cloudflare | .mg | ~20$ |
| **TOTAL MVP** | | | **~970$/mois** |

**Réduction Phase 0** (dev uniquement) : ~300$/mois (1 VM DO, Redis simple, pas de Multi-AZ)

### 2.2 Coûts humains Phase 0-1 (9 mois)

| Rôle | Durée | Type |
|------|-------|------|
| CTO / Lead Archi | 9 mois | Fondateur / equity |
| Lead Backend (Django) | 9 mois | Freelance / salarié |
| Lead Frontend (React) | 7 mois | Freelance / salarié |
| Game Engine Dev (Go) | 6 mois | Freelance spécialisé temps réel |
| DevOps part-time | 6 mois | Freelance |
| UX/UI Designer | 3 mois | Freelance |
| QA / Tests | 4 mois | Freelance part-time |
| Compliance Officer | 3 mois | Consultant externe |

### 2.3 Coûts juridiques et conformité

| Poste | Coût estimé | Quand |
|-------|-------------|-------|
| Audit juridique Madagascar | 5 000 - 15 000 € | Phase 0 |
| KYC/AML setup | 3 000 - 8 000 € | Phase 1 |
| Audit RNG (GLI-19) | 10 000 - 20 000 € | Avant argent réel |
| Pentest applicatif | 5 000 - 12 000 € | Avant argent réel |
| Pentest infrastructure | 5 000 - 10 000 € | Avant argent réel |
| Licence internationale (V3) | 30 000 - 50 000 € | Phase 3 |

### 2.4 Coûts opérateurs mobile money

| Opérateur | Setup | Frais transaction | Notes |
|-----------|-------|-----------------|-------|
| MVola | À négocier | ~1.5% | Priorité P0 |
| Orange Money | À négocier | ~1.5% | Priorité P0 |
| Airtel Money | À négocier | ~1.5% | Priorité P1 |
| PayDunya (fallback) | ~500€ | ~2-3% | Si directe impossible |

---

## 3. Phases détaillées V2

### Phase 0 — Fondation (Mois 1-3)

#### Objectif
Valider faisabilité, construire fondations, contacter opérateurs.

#### Semaine 1-2 : Setup & Due diligence
- [ ] Repo GitHub monorepo (backend/frontend/game-engine/shared)
- [ ] CI/CD GitHub Actions
- [ ] Docker Compose local (dev)
- [ ] **DUE DILIGENCE** : contacter Telma (MVola), Orange Money, Airtel Money
- [ ] **DUE DILIGENCE** : contacter PayDunya (fallback)
- [ ] **DUE DILIGENCE** : vérifier Stripe Madagascar
- [ ] Mandat avocat Madagascar signé

#### Semaine 3-4 : POC techniques
- [ ] POC WebSocket Go (goroutines, rooms, broadcast)
- [ ] POC ledger double entrée (Django)
- [ ] POC RNG statistique (Dieharder + TestU01)
- [ ] POC reconnexion (disconnect → snapshot → reconnect)
- [ ] Benchmark : 100 tables simultanées, latence < 10ms

#### Semaine 5-8 : Design & Architecture
- [ ] Maquettes Figma (landing, inscription, wallet, lobby, table, profil)
- [ ] Design system (mobile-first, dark mode)
- [ ] Architecture validée (ADR-001 à 004)
- [ ] DB Schema finalisé + migrations
- [ ] API Specs finalisées

#### Semaine 9-12 : Pré-MVP
- [ ] Auth service complet (inscription, OTP, JWT)
- [ ] Wallet simulation (crédit initial, recharge)
- [ ] Game Engine Go : structure + table manager
- [ ] Mélange de cartes + distribution
- [ ] Tests unitaires game engine (poker)
- [ ] Back-office v0 (Django Admin étendu)

**Critères de sortie Phase 0** :
- [ ] Architecture validée
- [ ] Maquettes UX approuvées
- [ ] Avis juridique préliminaire reçu
- [ ] POC technique validé (perf, WebSocket, reconnexion)
- [ ] Contacts opérateurs établis (documentation API reçue ou plan B identifié)
- [ ] Équipe constituée (min 3 devs)

---

### Phase 1 — MVP Simulation (Mois 4-10)

**Durée augmentée à 7 mois** (pas 6) pour :
- Apprentissage Go par équipe
- 3 jeux au lieu de 4 (Poker, Rami, Belote)
- Malgache intégré dès le début
- Résilience réseau (grace period, snapshots)

#### Sprint 1-2 (Mois 4) : Auth & Profil
- [ ] Inscription téléphone + OTP SMS
- [ ] Login / Logout / Refresh token
- [ ] Profil (avatar, stats, préférences langue)
- [ ] **Malgache** : interface complète (i18n react-i18next)
- [ ] Device fingerprinting (canvas + WebGL)
- [ ] Frontend : pages inscription, login, profil (FR + MG)

#### Sprint 3-4 (Mois 4-5) : Wallet Simulation
- [ ] Crédit initial 10 000 jetons
- [ ] Recharge quotidienne 5 000 jetons
- [ ] Affichage solde + historique
- [ ] Ledger double entrée opérationnel
- [ ] Frontend : page wallet, historique (FR + MG)

#### Sprint 5-6 (Mois 5) : Lobby & Tables
- [ ] Liste tables (filtrage par jeu, buy-in, mode)
- [ ] Créer table privée (simulation)
- [ ] Rejoindre table (auto-assign siège)
- [ ] Quitter table (calcul gains/pertes)
- [ ] **Grace period** : déconnexion → reconnexion < 5s
- [ ] Frontend : lobby, création table, salle d'attente

#### Sprint 7-8 (Mois 5-6) : Poker Texas Hold'em
- [ ] Distribution cartes (RNG)
- [ ] Séquence complète (blinds, preflop, flop, turn, river)
- [ ] Actions : bet, call, raise, fold, all_in
- [ ] Évaluation mains (Royal Flush → High Card)
- [ ] Pot distribution + side pots
- [ ] Rake (3.5%, uniquement si flop atteint)
- [ ] **Snapshots Redis** : state sauvé toutes les 5s
- [ ] Frontend : table poker, cartes PixiJS, actions

#### Sprint 9-10 (Mois 6) : Belote classique
- [ ] Distribution 4 joueurs
- [ ] Système prise (atout)
- [ ] 8 plis avec règles
- [ ] Comptage points (atout vs non-atout)
- [ ] Annonce Belote (Dame+Roi atout)
- [ ] Tables privées
- [ ] **Action auto** : passe si timeout
- [ ] Frontend : table belote

#### Sprint 11-12 (Mois 6-7) : Rami classique
- [ ] Distribution 14 cartes
- [ ] Pioche / défausse
- [ ] Validation combinaisons (séries + groupes)
- [ ] Comptage points
- [ ] Tables privées
- [ ] Frontend : table rami

#### Sprint 13-14 (Mois 7-8) : Back-office + Support
- [ ] Dashboard admin (stats temps réel)
- [ ] Gestion utilisateurs (search, filter, actions)
- [ ] Gestion tables (créer, fermer, monitorer)
- [ ] Système tickets support (FR + MG)
- [ ] FAQ (FR + MG)
- [ ] Frontend : panel admin complet

#### Sprint 15-16 (Mois 8-9) : Polissage
- [ ] Animations cartes (PixiJS + CSS transitions)
- [ ] Sons basiques (optionnel, peut être reporté)
- [ ] Responsive finetuning
- [ ] Performance optimization (React lazy loading)
- [ ] Tests E2E (Playwright)
- [ ] Bug fixing marathon

#### Sprint 17-18 (Mois 9-10) : Beta fermée
- [ ] Déploiement staging stable
- [ ] Recrutement 50 beta testeurs (Antananarivo, Toamasina, Antsirabe)
- [ ] Collecte feedback (in-app + Typeform)
- [ ] Corrections rapides
- [ ] **Objectif** : NPS > 25

**Critères de sortie MVP V1** :
- [ ] 2 000 comptes enregistrés (simulation)
- [ ] 3 jeux jouables : Poker, Belote, Rami
- [ ] Grace period + reconnexion fonctionnels
- [ ] Malgache sur tous écrans clés
- [ ] Tests E2E passants
- [ ] Uptime > 99.5%
- [ ] Feedback beta > 4/5

---

### Phase 2 — MVP Argent Réel (Mois 11-13)

**⚠️ Prérequis ABSOLUS** :
- [ ] Avis juridique écrit et favorable
- [ ] Accords MVola / Orange Money signés
- [ ] Audit RNG externe OK
- [ ] Pentest sans critique

#### Sprint 19-20 (Mois 11) : KYC Niveau 1
- [ ] Upload documents (ID, selfie)
- [ ] Revue manuelle documents
- [ ] Statut KYC visible profil
- [ ] Limites selon KYC

#### Sprint 21-22 (Mois 11-12) : Paiements
- [ ] Intégration MVola (sandbox → prod)
- [ ] Intégration Orange Money (sandbox → prod)
- [ ] Webhook inbox pattern
- [ ] Circuit breaker
- [ ] Reconciliation auto

#### Sprint 23-24 (Mois 12-13) : Mode Réel
- [ ] Switch simulation → réel (feature flag)
- [ ] Rake poker actif
- [ ] Commission Belote / Rami
- [ ] Plafonds argent réel
- [ ] Limites jeu responsable
- [ ] Auto-exclusion

**Critères de sortie Phase 2** :
- [ ] Juridique validé
- [ ] Paiements intégrés
- [ ] Premiers dépôts/retraits réels
- [ ] 100 payeurs actifs
- [ ] Zero incidents sécurité critiques

---

### Phase 3 — Scale (Mois 14-20)

- Tournois (V1.5)
- Blackjack (P1)
- Belote coinchée (P1)
- PWA avancée
- Anti-fraude V1
- KYC niveau 2-3
- Leaderboards
- Analytics (Amplitude/Mixpanel)

---

### Phase 4 — International (Mois 21-30)

- Analyse marché pays 2 (Sénégal / CIV / Cameroun)
- Soft launch pays 2
- Licence internationale (Curaçao / MGA)
- Application native (React Native)

---

### Phase 5 — Plateforme (Mois 31-42)

- Nouveaux jeux (Roulette, Slots)
- B2B white-label
- Multi-pays
- 100 000+ utilisateurs

---

## 4. Calendrier visuel V2

```
Mois     │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │10 │11 │12 │13 │14-20
─────────┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼─────
Fondation│███│███│███│   │   │   │   │   │   │   │   │   │   │
MVP Sim  │   │   │░░░│███│███│███│███│███│███│███│   │   │   │
MVP Réel │   │   │   │   │   │   │   │   │   │   │███│███│███│
Scale    │   │   │   │   │   │   │   │   │   │   │   │   │   │█████

Légende : ███ = Développement    ░░░ = Transition
```

---

## 5. Risques et mitigations V2

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| API MVola indisponible | Très élevé | Élevée | Due diligence semaine 1, fallback PayDunya |
| Juridique bloquant | Très élevé | Élevée | Mandat avocat immédiat, MVP simulation d'abord |
| Complexité Go | Élevé | Moyenne | Formation équipe, POC en Phase 0 |
| Recrutement Go dev | Moyen | Moyenne | Remote-friendly, freelance international |
| Connexion instable MG | Élevé | Élevée | Grace period, snapshots, offline profil |
| Scope creep | Moyen | Élevée | PRD figé, veto Product, feature flags |
| Concurrence étrangère | Élevé | Moyenne | Localisation, Belote/Rami, mobile money |
| Rétention faible | Élevé | Moyenne | Tables privées, Belote communautaire, parrainage |

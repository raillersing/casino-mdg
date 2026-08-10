# iGaming Madagascar Platform — Documentation Projet

**Projet** : Casino MDG  
**Version** : 3.0 (vision complète)  
**Date** : 2026-08-10  
**Statut** : Phase Fondation — documentation complète, prête pour implémentation

---

## 🔴 Résumé des versions

| Version | Focus | Documents |
|---------|-------|-----------|
| V1 | Documents initiaux (analyse source) | 9 fichiers techniques |
| V2 | Correction critique (Game Engine Go, malgache P0, due diligence) | 9 fichiers révisés |
| **V3** | **Vision leader** (social, gamification, UX premium, scoring RICE) | **+3 documents vision** |

---

## 📁 Structure complète (13 documents, ~776KB)

| # | Document | Description | Public cible |
|---|----------|-------------|--------------|
| 01 | `01-PRD.md` | Product Requirements MVP (3 jeux, malgache P0, contexte MG) | PM, CEO, CTO, Investors |
| 02 | `02-Architecture-Technique.md` | Architecture V2 (Go Game Engine, snapshots, résilience) | CTO, Dev, DevOps, Security |
| 03 | `03-API-Specifications.md` | API REST + WebSocket V2 (reconnexion, heartbeat, sync) | Backend, Frontend, QA |
| 04 | `04-Database-Schema.md` | Schéma V2 (webhook_inbox, snapshots, trigger ledger) | Backend, DBA, Security |
| 05 | `05-Game-Engine-Specs.md` | Moteur Go (Poker, Belote, Rami, grace period) | Game Dev, Backend, Security |
| 06 | `06-Security-Compliance.md` | Sécurité V2 (tokenization PCI, anti-bot, kill switches) | Security, Compliance, CTO |
| 07 | `07-Payment-Integration.md` | Paiements V2 (due diligence, webhook inbox, circuit breaker) | Backend, Finance, Business |
| 08 | `08-Implementation-Roadmap.md` | Roadmap V2 (7 mois MVP, budget ~970$/mois) | CTO, PM, CEO, Investors |
| 09 | `09-Best-Practices-iGaming.md` | Benchmarks leaders, UX mobile-first Afrique, contexte MG | Produit, Design, Dev |
| **10** | **`10-Product-Vision-V3.md`** | **Vision leader : 7 piliers, scoring RICE, parcours utilisateurs** | **CEO, CTO, Investors, PM** |
| **11** | **`11-Social-Gamification.md`** | **Clubs, missions, streaks, tournois, parrainage viral** | **PM, Frontend, Backend** |
| **12** | **`12-UX-Premium.md`** | **Design system, animations, accessibilité, performance** | **UX/UI, Frontend** |
| 00 | `README.md` | Index et guide navigation | Tous |

## 🏗️ Fichiers projet

| Fichier | Description |
|---------|-------------|
| `docker-compose.yml` | Stack local complet (PostgreSQL, Redis, RabbitMQ, MinIO, Django, Go, React, Vault, Celery) |
| `.env.example` | Variables d'environnement complètes |
| `CONTRIBUTING.md` | Guide contribution (workflow Git, standards code, tests) |

---

## 🎯 Architecture retenue V3

```
Frontend    : React 18 + TypeScript + Vite + Tailwind + Socket.io + react-i18next (FR/MG)
              PixiJS (cartes), Framer Motion (animations)

API         : Django + DRF (Auth, Wallet, Support, Notification, Social, Gamification)
              Celery + RabbitMQ (async, webhooks)
              PostgreSQL 15+ (transactions, events, clubs, missions)
              Redis Cluster (cache, sessions, snapshots, leaderboards)
              MinIO (KYC docs, fichiers)

Game Engine : Go 1.21+ (goroutines par table, latence <10ms)
              WebSocket dédié (grace period 30s, reconnexion snapshot)
              Events → RabbitMQ → Wallet/Notification

Infra       : Docker + K8s + Kong + Cloudflare + Prometheus + Grafana + Sentry + Vault
```

---

## 🏆 Verdict qualité produit V3

| Phase | Score | Ce qui la rend "pro" |
|-------|-------|---------------------|
| **V1 MVP** | **7.5/10** | Stable, 3 jeux, malgache, résilience réseau |
| **V1.5 Social+** | **8.5/10** | Clubs, missions, tournois, viralité WhatsApp |
| **V2 Réel** | **9/10** | Monétisation, KYC, paiements, ML anti-fraude |
| **V3 Scale** | **9.5/10** | Leader régional, app native, B2B, 100K+ users |

### Ce qui nous place au niveau des leaders

| Dimension | Notre solution | Niveau |
|-----------|---------------|--------|
| **Social** | Clubs + amis + chat vocal + spectateur | ⭐⭐⭐ PokerStars level |
| **Gamification** | Missions + streaks + ELO + battle pass | ⭐⭐⭐ GGPoker/Betika level |
| **UX** | Dark mode + animations PixiJS + haptic + 60fps | ⭐⭐⭐ Premium |
| **Localisation** | Malgache natif + mobile money MVola | ⭐⭐⭐ Unique |
| **Résilience** | Grace period + snapshots + reconnexion <5s | ⭐⭐⭐ Unique (aucun leader ne l'a) |
| **Monétisation** | Rake 3.5% + rakeback + VIP + affiliation | ⭐⭐⭐ Standard pro |

### Ce qui manque encore pour 10/10

| Manque | Quand | Pourquoi différé |
|--------|-------|------------------|
| Live dealers | V4 | Trop coûteux, pas prioritaire Afrique |
| VR/AR | V5+ | Technologie pas mature pour 3G MG |
| Crypto | Jamais (probablement) | Réglementation MG incertaine |

---

## ⚠️ Avertissements critiques

1. **Ce projet implique des jeux d'argent.** Aucun argent réel sans validation juridique.
2. **Les API MVola/Orange Money sont hypothétiques.** Due diligence obligatoire avant développement.
3. **Les projections financières sont des hypothèses**, pas des garanties.
4. **Ce document n'est pas un avis juridique.**

---

## 🔗 Références externes

| Ressource | Lien |
|-----------|------|
| Dossier stratégique original | `../Dossier_strategique_iGaming_Madagascar.pdf` |
| Mindmap projet | `../markmap.svg` |
| GLI-19 Standard | https://gaminglabs.com/wp-content/uploads/2024/06/GLI-19-Interactive-Gaming-Systems-v3.0.pdf |
| PCI DSS | https://www.pcisecuritystandards.org/standards/ |
| FATF Casinos | https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatfguidanceontherisk-basedapproachforcasinos.html |

---

## 📅 Prochaines étapes immédiates

### Semaine 1
- [ ] **Due diligence paiements** : contacter Telma (MVola), Orange Money, Airtel Money
- [ ] **Due diligence** : contacter PayDunya (fallback)
- [ ] **Mandat avocat** Madagascar signé
- [ ] Validation de la documentation V3 par l'équipe

### Semaine 2-3
- [ ] Setup repo GitHub monorepo + CI/CD
- [ ] Environnements Docker Compose locaux
- [ ] POC Game Engine Go (WebSocket + goroutines + broadcast)

### Mois 1-3 (Phase 0)
- [ ] POC techniques validés (perf, reconnexion, RNG)
- [ ] Maquettes Figma (mobile-first, malgache + français)
- [ ] Réponses opérateurs mobile money reçues
- [ ] Constitution équipe dev (Lead Django, Lead React, Go Dev)

---

**Document confidentiel — Usage interne uniquement**

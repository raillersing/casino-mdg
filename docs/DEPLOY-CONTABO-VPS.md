# Guide de Déploiement en Production — Ubuntu VPS Contabo

Ce guide détaille la mise en production de **Casino MDG** sur un serveur VPS Ubuntu chez [Contabo](https://contabo.com/).

---

## 1. Choix de l'Offre Contabo Recommandée

| Profil de Charge | Offre Contabo Recommandée | Spécifications | Tarif Indicatif | Capacité Joueurs Simultanés |
|---|---|---|---|---|
| **Lancement & Pilote** | **Cloud VPS 1** | 4 vCPU, 6 Go RAM, 100 Go NVMe | ~5,50 € / mois | **Jusqu'à 1 500 – 3 000 CCU** |
| **Production Établie** | **Cloud VPS 2** *(Recommandé)* | 6 vCPU, 16 Go RAM, 200 Go NVMe | ~11,50 € / mois | **Jusqu'à 10 000 – 20 000 CCU** |
| **Haute Concurrence** | **Cloud VPS 3 / Storage** | 8 vCPU, 24 Go RAM, 300 Go NVMe | ~19,50 € / mois | **Jusqu'à 30 000 – 50 000+ CCU** |

*Système d'exploitation recommandé lors de la commande :* **Ubuntu 22.04 LTS** ou **Ubuntu 24.04 LTS**.

---

## 2. Déploiement en 1 Seule Commande

### Étape 2.1 — Connexion à votre VPS Contabo
Connectez-vous en SSH avec votre adresse IP Contabo :
```bash
ssh root@<VOTRE_IP_CONTABO>
```

### Étape 2.2 — Cloner le Dépôt
```bash
git clone https://github.com/<votre-organisation>/casino-mdg.git /var/www/casino-mdg
cd /var/www/casino-mdg
```

### Étape 2.3 — Lancer le Script de Déploiement Automatisé
Le script configure automatiquement le Swap (4 Go), les limites noyau Linux (sysctl), le pare-feu UFW, Docker, génère des clés de sécurité aléatoires fortes et lance tous les conteneurs :
```bash
bash scripts/deploy/deploy-contabo.sh
```

---

## 3. Configuration du Nom de Domaine & SSL (HTTPS / WSS)

Pour que les WebSockets sécurisés (`wss://`), le PWA et les paiements mobiles fonctionnent, votre site doit être servi en **HTTPS**.

### Option A — Recommandée : Cloudflare (Gratuit, CDN & Anti-DDoS)
1. Dans votre gestionnaire DNS (Cloudflare), ajoutez un enregistrement :
   - **Type :** `A`
   - **Nom :** `@` (ou votre sous-domaine)
   - **Contenu :** `<VOTRE_IP_CONTABO>`
   - **Proxy status :** Activé (*Nuage Orange*)
2. Dans le menu **SSL/TLS** de Cloudflare, sélectionnez le mode **« Flexible »** ou **« Full »**.
3. Dans `WebSockets`, assurez-vous que l'option **WebSockets** est activée (activée par défaut sur Cloudflare).

*Votre plateforme est immédiatement accessible en `https://` avec certificat SSL géré automatiquement et protection contre les attaques volumétriques DDoS.*

### Option B — Certbot Let's Encrypt Direct sur l'Hôte
Si vous ne souhaitez pas passer par Cloudflare :
```bash
apt-get install -y certbot python3-certbot-nginx
certbot certonly --standalone -d votre-domaine.com
```

---

## 4. Architecture des Conteneurs en Production (`docker-compose.prod.yml`)

```mermaid
flowchart TD
    Client["Joueurs Mondiaux (Navigateurs & Mobiles)"] -->|Port 80/443 HTTP & WSS| Frontend["Frontend Nginx (React PWA)"]
    Frontend -->|"/ws"| Engine["Game Engine Go (Temps Réel)"]
    Frontend -->|"/api", "/admin"| Backend["Django DRF (Gunicorn 4 workers)"]
    Backend -->|SQL Poolé| PgBouncer["PgBouncer (Transaction Pooling)"]
    PgBouncer -->|PostgreSQL 15| DB[(PostgreSQL)]
    Backend --> Redis[(Redis 7)]
    Engine --> Redis
    Backend --> RabbitMQ[(RabbitMQ)]
    RabbitMQ --> Celery["Celery Worker & Beat"]
```

---

## 5. Commandes de Maintenance au Quotidien

### Vérifier l'état de tous les conteneurs :
```bash
docker compose -f docker-compose.prod.yml ps
```

### Consulter les logs en temps réel :
```bash
# Logs du moteur Go (actions de jeu, tables, websocket)
docker compose -f docker-compose.prod.yml logs -f game-engine

# Logs du backend Django (API, paiements, règlements S2S)
docker compose -f docker-compose.prod.yml logs -f backend

# Logs de PgBouncer (taux d'occupation des connexions)
docker compose -f docker-compose.prod.yml logs -f pgbouncer
```

### Créer un compte administrateur pour le Backoffice Live Ops :
```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```
*Connectez-vous ensuite sur `http://<IP>/backoffice` ou `https://votre-domaine.com/backoffice`.*

### Sauvegarder la base de données PostgreSQL :
```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres casino_mdg > backup_$(date +%F_%T).sql
```

### Mettre à jour le code sans interruption :
```bash
git pull origin master
docker compose -f docker-compose.prod.yml up -d --build
```

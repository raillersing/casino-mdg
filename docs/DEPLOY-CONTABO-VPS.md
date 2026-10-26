# Guide de Déploiement en Production & Re-déploiement — Ubuntu VPS Contabo

Ce guide détaille la mise en production de **Casino MDG** sur un serveur VPS Ubuntu chez [Contabo](https://contabo.com/). Il intègre l'ensemble des bonnes pratiques et résolutions d'incidents rencontrées en conditions réelles.

---

## 1. Choix de l'Offre Contabo Recommandée

| Profil de Charge | Offre Contabo Recommandée | Spécifications | Tarif Indicatif | Capacité Joueurs Simultanés |
|---|---|---|---|---|
| **Lancement & Pilote** | **Cloud VPS 1** | 4 vCPU, 6 Go RAM, 100 Go NVMe | ~5,50 € / mois | **Jusqu'à 1 500 – 3 000 CCU** |
| **Production Établie** | **Cloud VPS 2** *(Recommandé)* | 6 vCPU, 16 Go RAM, 200 Go NVMe | ~11,50 € / mois | **Jusqu'à 10 000 – 20 000 CCU** |
| **Haute Concurrence** | **Cloud VPS 3 / Storage** | 8 vCPU, 24 Go RAM, 300 Go NVMe | ~19,50 € / mois | **Jusqu'à 30 000 – 50 000+ CCU** |

*Système d'exploitation recommandé lors de la commande :* **Ubuntu 24.04 LTS** ou **Ubuntu 22.04 LTS**.

---

## 2. Prérequis Indispensables Avant Déploiement

### Étape 2.1 — Pousser vos modifications locales sur GitHub
Sur votre machine de développement locale, assurez-vous d'avoir poussé tous les derniers commits :
```bash
git push origin master
```
*(Si vous ne poussez pas, le VPS ne trouvera pas les scripts de déploiement et affichera `No such file or directory`).*

### Étape 2.2 — Authentification GitHub sur le VPS Contabo
GitHub a désactivé l'authentification par mot de passe direct. Deux méthodes simples s'offrent à vous :

* **Option A (Recommandée - Token PAT) :**
  1. Rendez-vous sur [github.com/settings/tokens](https://github.com/settings/tokens).
  2. Cliquez sur **Generate new token (classic)**, cochez la case **`repo`**.
  3. Copiez le token (`ghp_...`).
  4. Clonez en intégrant le token directement dans l'URL :
     ```bash
     git clone https://<VOTRE_TOKEN_GHP>@github.com/raillersing/casino-mdg.git /var/www/casino-mdg
     ```

* **Option B (Clé SSH / Deploy Key) :**
  1. Sur le VPS Contabo, générez une clé : `ssh-keygen -t ed25519 -C "contabo-vps" -N "" -f ~/.ssh/id_ed25519`
  2. Affichez et copiez la clé : `cat ~/.ssh/id_ed25519.pub`
  3. Ajoutez-la dans votre repo GitHub : **Settings > Deploy keys > Add deploy key**.
  4. Clonez via SSH : `git clone git@github.com:raillersing/casino-mdg.git /var/www/casino-mdg`

---

## 3. Déploiement Automatisé en 1 Commande

Connectez-vous en SSH à votre serveur Contabo :
```bash
ssh root@<IP_DE_VOTRE_VPS_CONTABO>
cd /var/www/casino-mdg
```

Si le dépôt était déjà cloné, assurez-vous d'avoir la toute dernière version :
```bash
git pull origin master
```

Lancez le script de déploiement automatique :
```bash
bash scripts/deploy/deploy-contabo.sh
```

### Ce que le script effectue automatiquement en coulisses :
1. **Swapfile de 4 Go :** Crée et active un swap de 4 Go pour éviter que le noyau Linux ne tue des processus (OOM killer) lors de pics de charge.
2. **Optimisations Noyau Linux (`sysctl`) :** Active `vm.overcommit_memory = 1` (requis pour Redis) et augmente `somaxconn` et `nofile` à 65536.
3. **Pare-feu UFW :** Ouvre les ports 22 (SSH), 80 (HTTP/WS) et 443 (HTTPS).
4. **Génération de Clés Cryptographiques :** Génère automatiquement les secrets de 64 caractères dans `.env.production`.
5. **Stockage Local Optimisé :** Utilise les volumes Docker locaux (`media/`) sans dépendre de MinIO (qui a été retiré de Docker Hub).
6. **Migrations & Healthcheck Robuste :** Laisse 60 secondes de grâce (`start_period`) pour que Django crée ses 40+ tables SQL avant que la sonde de santé ne valide le démarrage.

---

## 4. Configuration du Nom de Domaine & SSL (Cloudflare Gratuit)

Pour activer le **HTTPS** et les **WebSockets sécurisés (`wss://`)** :

1. Créez un compte gratuit sur [Cloudflare](https://www.cloudflare.com/) et ajoutez votre domaine.
2. Pointez les serveurs de noms (Nameservers) de votre registrar vers ceux de Cloudflare.
3. Dans l'onglet **DNS > Records**, ajoutez les 2 enregistrements :
   - Type `A`, Nom `@`, Contenu `<IP_VOTRE_VPS_CONTABO>`, Proxy : **Activé (Nuage Orange)**
   - Type `A`, Nom `www`, Contenu `<IP_VOTRE_VPS_CONTABO>`, Proxy : **Activé (Nuage Orange)**
4. Dans **SSL/TLS > Overview**, choisissez le mode **« Flexible »**.
5. Dans **SSL/TLS > Edge Certificates**, activez **« Always Use HTTPS »**.
6. Dans **Network**, assurez-vous que l'option **« WebSockets »** est sur **ON**.

Dans `/var/www/casino-mdg/.env.production` sur votre VPS, modifiez votre domaine :
```env
ALLOWED_HOSTS=votre-domaine.com,www.votre-domaine.com,127.0.0.1,backend
CORS_ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com
```

Puis rechargez la configuration :
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

---

## 5. Création du Super-Administrateur Backoffice

Pour accéder au centre de contrôle des tables en direct, des statistiques RTP et du NOC :
```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```
Connectez-vous ensuite sur :
- **Lobby Joueurs :** `https://votre-domaine.com`
- **Backoffice Live Ops :** `https://votre-domaine.com/backoffice`
- **Administration Django :** `https://votre-domaine.com/admin`
- **Métriques Prometheus :** `https://votre-domaine.com/metrics`

---

## 6. Procédure de Re-déploiement & Mises à Jour Futures

Pour re-déployer ultérieurement après avoir effectué des modifications de code :

### Mise à jour standard sans interruption de service :
```bash
cd /var/www/casino-mdg
git pull origin master
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### Redémarrer un conteneur spécifique :
```bash
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart game-engine
```

### Suivre les logs en temps réel en cas de doute :
```bash
# Suivre les requêtes backend et règlements S2S :
docker compose -f docker-compose.prod.yml logs -f backend

# Suivre les WebSockets et tables de jeu Go :
docker compose -f docker-compose.prod.yml logs -f game-engine
```

### Réinitialisation complète propre (Remise à zéro si besoin) :
```bash
docker compose -f docker-compose.prod.yml down
# Attention : ceci supprime les données de jeu pour repartir d'une base vierge
# docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

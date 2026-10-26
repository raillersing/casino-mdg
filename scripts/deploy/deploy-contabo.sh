#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Casino MDG — Déploiement Automatisé Ubuntu VPS (Contabo)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}   Casino MDG — Déploiement Haute Concurrence (Ubuntu VPS)       ${NC}"
echo -e "${BLUE}================================================================${NC}"

# 1. Vérification des privilèges
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ Ce script doit être exécuté avec les privilèges root ou via sudo.${NC}"
   exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"
echo -e "${GREEN}📂 Répertoire du projet : ${PROJECT_DIR}${NC}"

# 2. Configuration du fichier SWAP (Recommandé pour VPS Contabo)
TOTAL_SWAP=$(free -m | awk '/^Swap:/ {print $2}')
if [[ "$TOTAL_SWAP" -lt 2000 ]]; then
    echo -e "${YELLOW}⚙️  Configuration d'un swapfile de 4 Go pour la stabilité système...${NC}"
    if [[ ! -f /swapfile ]]; then
        fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        echo -e "${GREEN}✅ Swapfile de 4 Go créé et activé.${NC}"
    fi
else
    echo -e "${GREEN}✅ Swap suffisant (${TOTAL_SWAP} Mo détectés).${NC}"
fi

# 3. Optimisation des limites noyau Linux (Contabo / Redis / Haute Concurrence)
echo -e "${YELLOW}⚙️  Application des paramètres noyau (sysctl & file descriptors)...${NC}"
cat << 'EOF' > /etc/sysctl.d/99-casino-tuning.conf
vm.overcommit_memory = 1
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
fs.file-max = 2097152
EOF
sysctl -p /etc/sysctl.d/99-casino-tuning.conf > /dev/null 2>&1 || true

cat << 'EOF' > /etc/security/limits.d/99-casino-limits.conf
* soft nofile 65536
* hard nofile 65536
root soft nofile 65536
root hard nofile 65536
EOF

# 4. Vérification et installation de Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}🐳 Installation de Docker Engine...${NC}"
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg lsb-release
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
    echo -e "${GREEN}✅ Docker Engine installé avec succès.${NC}"
fi

# 5. Configuration Pare-feu UFW
if command -v ufw &> /dev/null; then
    echo -e "${YELLOW}🛡️  Configuration du pare-feu UFW...${NC}"
    ufw allow 22/tcp comment 'SSH' > /dev/null 2>&1 || true
    ufw allow 80/tcp comment 'HTTP Web & WebSocket' > /dev/null 2>&1 || true
    ufw allow 443/tcp comment 'HTTPS SSL' > /dev/null 2>&1 || true
    ufw --force enable > /dev/null 2>&1 || true
    echo -e "${GREEN}✅ Ports 22, 80 et 443 autorisés sur UFW.${NC}"
fi

# 6. Initialisation du fichier .env.production sécurisé
ENV_FILE="${PROJECT_DIR}/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${YELLOW}🔐 Fichier .env.production absent. Génération automatique de clés cryptographiques sécurisées...${NC}"
    cp "${PROJECT_DIR}/.env.production.example" "$ENV_FILE"

    # Génération de clés aléatoires fortes
    DJ_SECRET=$(openssl rand -hex 32)
    JWT_SEC=$(openssl rand -hex 32)
    DB_PASS=$(openssl rand -hex 16)
    RMQ_PASS=$(openssl rand -hex 16)
    MINIO_P=$(openssl rand -hex 16)
    BOT_SEC=$(openssl rand -hex 24)
    RES_SEC=$(openssl rand -hex 24)

    sed -i "s|DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=${DJ_SECRET}|" "$ENV_FILE"
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SEC}|" "$ENV_FILE"
    sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${DB_PASS}|" "$ENV_FILE"
    sed -i "s|RABBITMQ_PASS=.*|RABBITMQ_PASS=${RMQ_PASS}|" "$ENV_FILE"
    sed -i "s|MINIO_PASS=.*|MINIO_PASS=${MINIO_P}|" "$ENV_FILE"
    sed -i "s|GAME_ENGINE_BOT_SECRET=.*|GAME_ENGINE_BOT_SECRET=${BOT_SEC}|" "$ENV_FILE"
    sed -i "s|GAME_ENGINE_RESULT_SECRET=.*|GAME_ENGINE_RESULT_SECRET=${RES_SEC}|" "$ENV_FILE"
    echo -e "${GREEN}✅ Clés générées et stockées dans .env.production${NC}"
fi

# 7. Construction et Démarrage des Conteneurs
echo -e "${YELLOW}🚀 Construction et lancement des conteneurs de production...${NC}"
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 8. Vérification des sondes de santé
echo -e "${YELLOW}⏳ Attente de la stabilisation des services (healthchecks)...${NC}"
sleep 15
docker compose -f docker-compose.prod.yml ps

PUBLIC_IP=$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}   ✅ Déploiement Casino MDG terminé avec succès !               ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "🌐 Interface Joueur & Lobby : http://${PUBLIC_IP}"
echo -e "📊 Back-office Live Ops     : http://${PUBLIC_IP}/backoffice"
echo -e "⚙️  Django Administration   : http://${PUBLIC_IP}/admin"
echo -e "📈 Métriques Prometheus     : http://${PUBLIC_IP}/metrics"
echo -e "\n${YELLOW}💡 Note : Si vous utilisez un nom de domaine, pointez son enregistrement DNS 'A' vers ${PUBLIC_IP} et activez le proxy Cloudflare pour bénéficier du SSL gratuit et de la protection DDoS.${NC}\n"

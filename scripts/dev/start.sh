#!/bin/bash
# Casino MDG — Script de démarrage développement

set -e

echo "🚀 Casino MDG — Démarrage de l'environnement de développement"

# Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé"
    exit 1
fi

# Créer le fichier .env s'il n'existe pas
if [ ! -f .env ]; then
    echo "📝 Création du fichier .env..."
    cp .env.example .env
    echo "⚠️  Veuillez configurer les variables dans .env"
fi

# Démarrer les services
echo "🐳 Démarrage des conteneurs Docker..."
docker-compose up -d postgres redis rabbitmq minio

# Attendre que PostgreSQL soit prêt
echo "⏳ Attente de PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    sleep 1
done
echo "✅ PostgreSQL prêt"

# Attendre que Redis soit prêt
echo "⏳ Attente de Redis..."
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
    sleep 1
done
echo "✅ Redis prêt"

# Démarrer le backend
echo "🐍 Démarrage du backend Django..."
docker-compose up -d backend

# Démarrer le game engine
echo "🎮 Démarrage du Game Engine..."
docker-compose up -d game-engine

# Démarrer le frontend
echo "⚛️  Démarrage du frontend React..."
docker-compose up -d frontend

echo ""
echo "✅ Tous les services sont démarrés !"
echo ""
echo "📱 Frontend : http://localhost:3000"
echo "🔧 Backend API : http://localhost:8000/api/v1"
echo "🎮 Game Engine WS : ws://localhost:8080"
echo "📊 RabbitMQ Management : http://localhost:15672"
echo "📈 Grafana : http://localhost:3001"
echo ""
echo "📋 Pour voir les logs : docker-compose logs -f [service]"
echo "🛑 Pour arrêter : docker-compose down"

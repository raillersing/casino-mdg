-- Initialisation de la base de données Casino MDG
-- Ce script s'exécute automatiquement au premier démarrage de PostgreSQL

-- Créer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Note: Les tables Django seront créées via les migrations Django
-- Ce fichier peut être utilisé pour des données d'initialisation

-- Exemple: Créer un superuser de test (à supprimer en production)
-- INSERT INTO users (email, display_name, is_staff, is_superuser, password, date_joined)
-- VALUES ('admin@casino-mdg.mg', 'Admin', true, true, crypt('admin123', gen_salt('bf')), NOW());

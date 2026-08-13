# QA et exploitation des simulations

## Périmètre

Les simulations `DEMO_AI` et `SIMULATION_SOLO` utilisent uniquement la monnaie
virtuelle. Elles ne doivent pas créer de mouvement d'argent réel ni être
présentées comme un tirage officiel.

## Vérifications locales

```bash
cd frontend
npm run lint
npm test -- --run
npm run build
npm run test:e2e -- --project=chromium

cd ../
docker compose exec -T backend pytest -q apps/games apps/analytics
docker compose exec -T backend black --check apps/games apps/analytics config/settings.py
docker compose exec -T backend isort --check-only apps/games apps/analytics config/settings.py
docker run --rm -v "$PWD/game-engine:/app" -w /app golang:1.21-alpine /usr/local/go/bin/go test ./...
```

## Contrôles de sécurité

- `GAME_ENGINE_BOT_SECRET` est partagé seulement entre le backend et le moteur.
- Le navigateur ne reçoit jamais ce secret.
- L'endpoint interne `/internal/bots/attach` refuse une requête sans secret.
- `chance-simulations/` est réservé aux utilisateurs staff.
- Une simulation statistique ne crée ni `InstantPlay`, ni `DrawEntry`, ni
  transaction wallet.
- Les seeds permettent de rejouer une alerte sans modifier le portefeuille.

## Preuve avant publication

Avant de publier une version, conserver le commit, les résultats des tests,
la réponse de `/healthz/`, `/readyz/` et `/health` du moteur, ainsi que la
version des règles simulées. Une alerte `anomaly` déclenche une revue et un
rejeu avec la même seed; elle ne constitue pas à elle seule une preuve de
fraude ou de défaut du générateur.

# CONTRIBUTING.md — Casino MDG
## Guide de contribution

**Projet** : iGaming Madagascar Platform  
**Langages** : Python (Django), Go (Game Engine), TypeScript (React)  
**Workflow** : GitHub Flow (branch feature → PR → review → merge)

---

## 1. Structure du repo

```
casino-mdg/
├── backend/              # Django REST API (Python)
│   ├── casino_mdg/       # Config projet
│   ├── apps/
│   │   ├── users/          # Auth, KYC
│   │   ├── wallet/         # Ledger, transactions
│   │   ├── support/        # Tickets, FAQ
│   │   └── notifications/  # Push, email, SMS
│   ├── manage.py
│   └── requirements.txt
├── game-engine/          # Moteur de jeu temps réel (Go)
│   ├── cmd/
│   │   └── casino-game-engine/
│   ├── internal/
│   │   ├── table/          # Gestion tables
│   │   ├── poker/          # Logique Poker
│   │   ├── belote/         # Logique Belote
│   │   ├── rami/           # Logique Rami
│   │   ├── state/          # Snapshots, grace period
│   │   └── websocket/      # WS server
│   ├── go.mod
│   └── Dockerfile
├── frontend/             # React + TypeScript
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── stores/         # Zustand
│   │   └── i18n/           # FR + MG
│   ├── package.json
│   └── vite.config.ts
├── shared/               # Types, utils partagés
├── infrastructure/       # Docker, K8s, Terraform
├── docs/                 # Documentation
└── scripts/              # Scripts utilitaires
```

---

## 2. Workflow Git

### 2.1 Branches

| Branche | Usage |
|---------|-------|
| `main` | Production (protégée) |
| `develop` | Intégration (par défaut pour PR) |
| `feature/xxx` | Nouvelle fonctionnalité |
| `bugfix/xxx` | Correction bug |
| `hotfix/xxx` | Correction urgente production |

### 2.2 Commit messages

Format : `type(scope): description`

```
feat(poker): ajouter side pots calculation
fix(wallet): corriger double entrée ledger
docs(api): mettre à jour specs WebSocket
test(game-engine): ajouter tests grace period
chore(deps): mettre à jour Django 4.2 → 5.0
refactor(auth): extraire service JWT
```

### 2.3 Pull Requests

1. Créer branche depuis `develop`
2. Développer + tests
3. Pousser branche + créer PR vers `develop`
4. Review obligatoire (1 approbation minimum)
5. CI verte (lint, tests, build)
6. Squash merge

---

## 3. Standards de code

### 3.1 Python (Django)

- **Formatter** : Black (line length 88)
- **Linter** : Ruff
- **Type hints** : Obligatoires sur les fonctions publiques
- **Docstrings** : Google style

```python
# Bon
async def process_deposit(
    user_id: uuid.UUID,
    amount: int,
    payment_method: str,
    idempotency_key: str | None = None,
) -> Transaction:
    """Process a deposit request.
    
    Args:
        user_id: The user making the deposit.
        amount: Amount in centimes (MGA).
        payment_method: One of 'mvola', 'orange_money', etc.
        idempotency_key: Optional idempotency key.
    
    Returns:
        The created Transaction object.
        
    Raises:
        InsufficientFundsError: If wallet balance is insufficient.
    """
    ...
```

### 3.2 Go (Game Engine)

- **Formatter** : gofmt (obligatoire)
- **Linter** : golangci-lint
- **Tests** : Table-driven tests
- **Commentaires** : GoDoc

```go
// Bon
// ProcessAction validates and executes a player action on the table.
// Returns the resulting state and any broadcast messages.
func (t *Table) ProcessAction(ctx context.Context, action PlayerAction) (*TableState, []Message, error) {
    t.mu.Lock()
    defer t.mu.Unlock()
    
    if err := t.validateAction(action); err != nil {
        return nil, nil, fmt.Errorf("invalid action: %w", err)
    }
    
    state, messages, err := t.executeAction(action)
    if err != nil {
        return nil, nil, fmt.Errorf("execution failed: %w", err)
    }
    
    return state, messages, nil
}
```

### 3.3 TypeScript (React)

- **Formatter** : Prettier
- **Linter** : ESLint + TypeScript strict
- **Components** : Function components + hooks
- **State** : Zustand (global), useState (local)

```typescript
// Bon
interface TableState {
  id: string;
  phase: GamePhase;
  players: Player[];
  pot: number;
}

const useTableStore = create<TableStore>((set) => ({
  table: null,
  setTable: (table) => set({ table }),
  updatePlayerBalance: (userId, amount) =>
    set((state) => ({
      table: state.table
        ? {
            ...state.table,
            players: state.table.players.map((p) =>
              p.userId === userId ? { ...p, balance: p.balance + amount } : p
            ),
          }
        : null,
    })),
}));
```

---

## 4. Tests

### 4.1 Django

```bash
cd backend
pytest --cov=apps --cov-report=html
```

- Unit tests : `test_*.py` dans chaque app
- Integration tests : `tests/integration/`
- Factory Boy pour fixtures
- Coverage minimum : **80%**

### 4.2 Go

```bash
cd game-engine
go test -race -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

- Benchmarks pour perf critiques (`*_test.go` avec `func BenchmarkXxx`)
- Race detector obligatoire (`-race`)
- Coverage minimum : **85%**

### 4.3 React

```bash
cd frontend
npm test -- --coverage
```

- Unit tests : Vitest + React Testing Library
- E2E tests : Playwright
- Coverage minimum : **70%**

---

## 5. Base de données

### 5.1 Migrations

```bash
cd backend
python manage.py makemigrations --name descriptive_name
python manage.py migrate
```

- Toujours nommer les migrations (`--name`)
- Ne jamais modifier une migration déjà mergée sur `develop`
- Seed data : `backend/apps/*/fixtures/`

### 5.2 Seeds dev

```bash
cd backend
python manage.py loaddata apps/users/fixtures/dev_users.json
python manage.py loaddata apps/wallet/fixtures/dev_transactions.json
```

---

## 6. Lancer le projet localement

### 6.1 Prérequis

- Docker + Docker Compose
- Node.js 18+
- Python 3.11+
- Go 1.21+

### 6.2 Quick start

```bash
# 1. Cloner le repo
git clone git@github.com:org/casino-mdg.git
cd casino-mdg

# 2. Configurer environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# 3. Lancer l'infrastructure
docker-compose up -d postgres redis rabbitmq minio

# 4. Backend
make backend-setup  # migrations + superuser
cd backend
source venv/bin/activate
python manage.py runserver

# 5. Game Engine
cd game-engine
go mod download
go run ./cmd/casino-game-engine

# 6. Frontend
cd frontend
npm install
npm run dev
```

### 6.3 URLs locales

| Service | URL |
|---------|-----|
| Backend API | http://localhost:8000 |
| Game Engine WS | ws://localhost:8080 |
| Frontend | http://localhost:5173 |
| RabbitMQ Management | http://localhost:15672 |
| MinIO Console | http://localhost:9001 |
| Vault | http://localhost:8200 |

---

## 7. Code review

### 7.1 Checklist reviewer

- [ ] Le code fait ce qu'il dit (nommage, commentaires)
- [ ] Tests couvrent le changement
- [ ] Pas de régression (tests existants passent)
- [ ] Pas de données sensibles (secrets, tokens)
- [ ] Pas de N+1 queries (Django)
- [ ] Pas de race conditions (Go)
- [ ] i18n inclus si texte utilisateur (FR + MG)
- [ ] Documentation mise à jour si API modifiée

### 7.2 Bonnes pratiques review

- **Constructive** : suggérer, pas imposer
- **Spécifique** : pointer la ligne exacte
- **Apprentissage** : expliquer le "pourquoi"
- **Timely** : review sous 24h idéalement

---

## 8. Communication

| Canal | Usage |
|-------|-------|
| GitHub Issues | Bugs, features, questions techniques |
| GitHub Discussions | Architecture, décisions |
| Slack / Discord | Communication quotidienne |
| Email | Confidential, juridique |

**Langue** : Français (par défaut). Anglais pour les noms de variables/fonctions. Malgache pour le contenu utilisateur.

---

## 9. Ressources

- [Architecture Technique](/docs/02-Architecture-Technique.md)
- [API Specifications](/docs/03-API-Specifications.md)
- [Database Schema](/docs/04-Database-Schema.md)
- [Game Engine Specs](/docs/05-Game-Engine-Specs.md)
- [Security & Compliance](/docs/06-Security-Compliance.md)

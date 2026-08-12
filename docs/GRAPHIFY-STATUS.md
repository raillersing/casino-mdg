# Graphify — état de référence

Graphify est la carte de navigation technique du projet. Elle doit être
rafraîchie après un lot qui modifie les routes, les services, les modèles, les
tests ou la documentation structurante.

## Dernière génération

- Date : 12 août 2026
- Commit analysé : `d293259b`
- Nœuds : 1 659
- Relations : 2 600
- Communautés : 147
- Commande : `graphify update .`
- Rapport local : `graphify-out/GRAPH_REPORT.md`

Le dossier `graphify-out/` reste ignoré par Git car il contient des artefacts
générés volumineux. Cette fiche est la référence suivie qui indique si une
carte locale doit être régénérée.

## Règle anti-doublon

Avant de créer un lot, consulter le roadmap actif et utiliser Graphify pour
retrouver les routes, composants, services et tests existants. Après chaque
lot, exécuter :

```bash
graphify update .
graphify check-update .
```

Puis mettre à jour le commit et les statistiques de cette fiche si le lot est
publié.

## Terminologie

Le nom produit est **Jeux de hasard**. Les identifiants historiques comme
`/games/test`, `test-games` et `test_games_opened` sont conservés pour éviter
une rupture de compatibilité et doivent être reconnus comme des alias
techniques, pas comme du copywriting utilisateur.

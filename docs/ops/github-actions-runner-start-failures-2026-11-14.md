# GitHub Actions: échec avant attribution d'un runner (2026-11-14)

## Incident observé et vérifié

- Dépôt **privé** `raillersing/casino-mdg`, PR [#51](https://github.com/raillersing/casino-mdg/pull/51).
- Exécutions : [43531603003](https://github.com/raillersing/casino-mdg/actions/runs/43531603003) et [43531107975](https://github.com/raillersing/casino-mdg/actions/runs/43531107975) (relancée).
- Les dix jobs sur `ubuntu-latest` échouent en environ deux secondes, avec `runner_id=0`, `runner_name=""` et `steps=[]`. Aucun `checkout`, `pip`, `npm`, `go` ou test n'a réellement été exécuté.
- L'accès aux logs retournait `BlobNotFound`. **La cause exacte n'est pas confirmée** ; une erreur de code ou de syntaxe YAML n'est pas démontrée.
- Le dernier workflow connu sur `master`, [43503101860](https://github.com/raillersing/casino-mdg/actions/runs/43503101860), était réussi avant cet incident. Cette réussite ne couvre pas la PR #51.

## Diagnostic administrateur — dans cet ordre

1. Ouvrir le job **Backend Tests** dans le run et lire **l'annotation affichée sous le titre du job**. Une mention « recent account payments have failed or your spending limit needs to be increased » indiquerait un refus de facturation, sans connexion avec les scripts de test.
2. En tant que propriétaire `raillersing`, consulter **Settings → Billing and licensing → Usage** pour le coût GitHub Actions du cycle et **Budgets and alerts** (budgets globaux, de produit et de dépôt). Un budget atteint avec **Stop usage when budget limit is reached** bloque des runners. Vérifier également le mode de paiement et d'éventuels paiements échoués.
3. Vérifier **Repository → Settings → Actions → General** et les restrictions d'utilisation des actions, puis **Actions → Runners**. S'assurer que les runners GitHub-hosted sont autorisés pour ce dépôt.
4. Consulter https://www.githubstatus.com/ pour un incident Actions actif. Un incident récent résolu n'explique pas nécessairement un nouveau run.
5. Après correction confirmée de la cause, relancer la dernière CI, contrôler **les étapes réellement exécutées**, puis les tests backend, frontend, Go, E2E, sécurité et Docker.
6. Si les budgets et permissions sont corrects et le problème persiste, ouvrir un ticket à https://support.github.com/ avec les IDs de run et la preuve `runner_id=0`, `steps=[]`, ainsi que l'annotation exacte visible sur GitHub.

## Décisions de sécurité

- **Ne pas** rendre public ce dépôt pour contourner la facturation : fuite potentielle de code et de logique métier.
- **Ne pas** désactiver les required status checks ou forcer le merge.
- **Ne pas** ajouter des secrets, paiements ou tokens directement dans des fichiers YAML ou dans ce document.
- **Ne pas** prétendre que l'absence de logs signifie une CI réussie.

## Références officielles

- [Dépannage des workflows](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Budgets and alerts](https://docs.github.com/en/billing/concepts/budgets-and-alerts)
- [Setting up budgets](https://docs.github.com/en/billing/how-tos/set-up-budgets)
- [Actions repository settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

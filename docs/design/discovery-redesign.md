# Accueil, Jeux et Lobby — refonte du 29 octobre 2026

## Recherche et diagnostic

Retour utilisateur : jeux peu visibles, trop d'information, navigation difficile.
Lecture du code : grand discours d'accueil, sélection de jeu répétée dans plusieurs blocs, réglages de robots avant le choix du mode, entrée Jeux mobile ouvrant un tiroir, absence de catalogue dédié.

Sources consultées avant implémentation :
- NN/g, Homepage Design: 5 Fundamental Principles : hiérarchie et poids visuel accordés aux tâches principales. https://www.nngroup.com/articles/homepage-design-principles/
- NN/g, Progressive Disclosure : déporter les détails secondaires jusqu'au moment où ils sont utiles. https://www.nngroup.com/articles/progressive-disclosure/
- PokerStars, Get the desktop Casino client : catégories explicites dans le lobby. https://www.pokerstars.es/en/casino/download/

Ces sources motivent des choix de conception ; elles ne prouvent pas un gain d'utilisabilité pour nos utilisateurs.

## Plan retenu et exécuté

1. Accueil : introduction courte, cinq cartes visuelles immédiatement accessibles, un lien vers les tables.
2. Jeux : véritable route /games, recherche par nom, catégories Cartes / Plateau, état vide réinitialisable ; navigation commune mobile et bureau.
3. Page de jeu : choix du mode, règles repliées, retour au catalogue ; suppression de la fausse partie de secours après échec serveur, poursuite de l'entraînement après saisie du nom invité.
4. Lobby : tables comme vue par défaut, commandes de partie rapide accessibles à la demande sur bureau et mobile, filtres de jeu reflétés dans l'URL, recherche nommée pour les lecteurs d'écran.
5. Vérification : compilation et tests navigateur à 1440, 390 et 320 px ; recherche, filtres, navigation, visibilité des jeux, options du lobby et débordement horizontal.

## Critères de réception

- Les cinq jeux sont identifiables et chacun ouvre son propre choix de mode.
- Un nouveau visiteur peut découvrir les jeux sans créer de compte.
- Recherche, filtres et réinitialisation fonctionnent.
- Les commandes secondaires du lobby ne précèdent plus les tables par défaut.
- Les erreurs réseau ne simulent pas un lancement réussi.
- À confirmer avec de vrais utilisateurs : trouver un jeu, comprendre entraînement / multijoueur, rejoindre une table ; mesurer réussite sans aide, temps et erreurs. Aucun test utilisateur n'est revendiqué.

## Limites

La refonte conserve les services et les moteurs existants. Les tests de navigation utilisent une liste de tables contrôlée ; ils ne qualifient pas les parties multijoueurs réelles ni le backend. Les textes français ajoutés suivent la langue de la demande ; leur traduction malgache reste à prévoir.

## Vérifications observées

- Parcours navigateur Chromium : 3 tests réussis à 1440, 390 et 320 px (recherche, filtres, état vide, navigation et absence de débordement).
- Captures inspectées : accueil mobile et lobby 320 px ; captures conservées dans `reports/discovery-*.png`.
- ESLint sur les cinq fichiers TypeScript/TSX modifiés : réussi sans avertissement.
- Compilation TypeScript, bundle Vite et génération PWA : réussis.
- Accessibilité automatisée axe de l'accueil : réussie après attribution d'un nom accessible distinct au bloc multijoueur. Les 4 tests navigateur finaux passent.
- Corrections nécessaires à la compilation : trois sélecteurs CSS préexistants étaient laissés ouverts avant des media queries. Leur règle pour le mode mobile forcé a été explicitée.

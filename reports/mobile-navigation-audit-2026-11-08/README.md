# Preuves de l'audit du 8 novembre 2026

Code observé : `6d6fce6`. Captures Chromium et comptes fictifs sur une base SQLite QA distincte. Les fichiers ne contiennent pas de jeton utilisateur/admission. Les identifiants de tables et les noms éventuels sont des fixtures locales.

- `lobby-mobile-before.png` : salon Ludo, 390 px ; tables après statistiques, navigation, filtres et raccourcis.
- `create-mobile-before.png` : création actuelle, sans minimum de participation configurable.
- `waiting-mobile-before.png` : plateau affiché alors que le moteur attend d'autres joueurs.
- `proposal-overview.png` : maquette proposée, quatre écrans ; données inventées et aucun fonctionnement applicatif.
- `browser.json` : positions des titres et boutons de l'audit mobile.
- `responsive.json` : mesures de largeur après stabilisation, 12 vues. Des éléments de bandes scrollables hors écran ne constituent pas à eux seuls un débordement global.
- `realtime.json` : sept configurations HTTP/WebSocket, avec démarrage observé. Le lancer Ludo est diffusé aux deux clients ; les autres jeux sont qualifiés ici pour leur démarrage seulement.
- `entry-browser.json` : cinq entrées réelles dans Chromium, avec erreurs du moteur et statuts des requêtes HTTP.
- `two-browsers.json` : reproduction à deux navigateurs distincts : créateur refusé sans ticket ; attente avec deux joueurs sur quatre places ; démarrage avec deux joueurs sur deux places.
- `admission-check.json` : contrôle strictement QA d'un JWT ordinaire sur une salle privée existante ; divergence base/moteur sans siège autorisé.

## Suites exécutées sur le code existant

- Django : 133 réussis sur SQLite isolé. Pas de réception PostgreSQL dans cette phase.
- Go : `go test -race ./...` réussi, avec outbox de test distincte.
- Vitest : 28 réussis. Compilation TypeScript/Vite/PWA réussie.
- Playwright : 21 réussis, 2 échecs (hiérarchie des titres du lobby, fermeture de la création par Échap).
- ESLint : échec sur 2 avertissements (export dans LudoBoard, dépendance du callback de BackofficePage).

L'audit et la maquette ne corrigent pas ces erreurs. Voir le plan dans `docs/audits/mobile-navigation-and-real-multiplayer-2026-11-08.md`.

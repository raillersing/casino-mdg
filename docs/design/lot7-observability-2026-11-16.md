# Lot 7 — Observabilité du parcours joueur

Statut : instrumentation côté navigateur et agrégation des événements par API. Cette mesure est une **télémétrie client**, et **ne certifie pas** une admission serveur, le démarrage d'une partie, ni une transaction en MGA.

## Événements nouveaux

| Événement | Déclencheur observé | Interprétation |
| --- | --- | --- |
| `game_selected` | Clic sur une carte de jeu (accueil/catalogue) ou lancement solo | Intention de sélectionner un jeu ; pas une file ouverte |
| `table_creation_started` | Appel de création après authentification | Requête client lancée |
| `table_created` | API création répond avec succès | Réponse reçue côté client ; pas de garantie de session moteur |
| `table_creation_failed` | API création rejette ou erreur réseau | Échec observé par le client |
| `table_join_attempted` | Requête `joinTable` effectivement déclenchée | Tentative ; pas une place réservée |
| `table_joined` | API `joinTable` répond avec succès | Admission HTTP reçue ; pas une connexion WebSocket |
| `table_join_failed` | Appel `joinTable` échoue | Refus ou erreur réseau observé |
| `matchmaking_failed` | Appel `queueMatch` échoue | Échec client pour cette requête |
| `engine_state_received` | Premier message `state` valide avec `game_state` reçu du moteur, par table montée | Présence d'un état moteur ; **pas** la preuve d'une partie démarrée |

Les événements existants `matchmaking_started` et `human_match_found` sont conservés.

## Lecture des données

L'endpoint administrateur existant `GET /api/v1/analytics/summary/` expose en plus `play_journey` avec `unit: "events"` et `source: "client_telemetry"`.

Ces compteurs sont des **volumes d'événements**, pas un entonnoir dédupliqué par utilisateur ni des taux de conversion. Ne calculez pas directement `table_joined / game_selected` : un joueur peut essayer plusieurs tables et une session peut avoir plusieurs événements. Pour des conversions robustes, il faudra une corrélation de parcours côté serveur, avec identifiants non sensibles, politique de conservation et consentement adaptés.

Les nouveaux événements ne collectent ni code OTP, ni code d'invitation de table privée, ni token d'admission, ni numéro de téléphone, ni solde ou montant de mise dans les métadonnées ajoutées.

## Critères de réception

- Backend accepte uniquement les noms de l'allowlist ; tests de rapport administrateur ; isolation de l'endpoint pour le personnel.
- Frontend compile et ses tests/E2E existants restent verts ; aucun événement ne bloque le parcours de navigation.
- Vérifier sur staging que le nombre d'événements est cohérent avec les actions réelles, sans considérer une déconnexion comme un jeu terminé.
- La recette réelle à deux comptes de l'Issue #57 reste obligatoire avant publication.

## Suite de modularisation

Le découpage des grandes pages `LobbyPage.tsx` et `GamePage.tsx` doit conserver les mêmes contrats API, états de présence, codes d'admission, règles de jeu et invariants MGA. Extraire progressivement les fonctions de présentation et de filtrage avec tests, puis l'orchestration WebSocket / matchmaking dans des PR séparées.

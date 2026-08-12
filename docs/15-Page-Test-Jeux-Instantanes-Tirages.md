# MDG Game Club — Page test des jeux instantanés et des tirages

**Version :** 1.0
**Date :** 11 août 2026
**Statut :** spécification avant implémentation
**Route proposée :** `/games/test`
**Mode :** simulation `SIM` uniquement, sans dépôt, retrait ni prix monétaire

> Cette page est un laboratoire produit démontrable. Elle ne doit pas être présentée comme une offre de jeu d'argent réel. Aucun bouton, texte ou visuel ne doit laisser croire qu'un crédit SIM possède une valeur monétaire.

## 1. Objectif

Créer une page test unique où l'équipe et les utilisateurs pilotes peuvent découvrir, jouer et comparer les deux familles retenues :

- **jeux instantanés :** résultat en quelques secondes ;
- **loterie et tirages :** participation avant une clôture et résultat publié à une heure donnée.

La page doit être navigable de bout en bout, fonctionner après rechargement, montrer les états réseau et donner accès aux règles, probabilités de simulation, résultats et journaux. Elle doit tester le comportement produit avant de brancher un fournisseur externe ou un système d'argent réel.

## 2. Décision produit

La page ne sera pas un simple catalogue de cartes. Elle proposera deux rythmes complémentaires :

1. **Maintenant** — `Coffre Mada`, `Roue MDG`, `Plinko` et `Bingo rapide`.
2. **À venir** — `Tirage 3 chiffres`, `Jackpot MDG 5 numéros` et `Bingo communautaire`.

Le premier écran met en avant :

- le Coffre Mada pour l'action immédiate ;
- le prochain Jackpot MDG pour le retour programmé ;
- le solde SIM, clairement libellé comme simulation ;
- les limites et la possibilité de faire une pause.

### 2.1 Jeux disponibles dans la première version de la page

| Jeu | Type | Expérience | État dans la page |
|---|---|---|---|
| Coffre Mada | Instantané | Révéler 9 cases et collecter des symboles | Jouable P0 |
| Roue MDG | Instantané | Faire tourner une roue aux segments visibles | Jouable P0 |
| Plinko | Instantané | Lancer une bille vers une case de résultat | Jouable P1 contrôlé |
| Bingo rapide | Instantané | Compléter une ligne dans une manche courte | Jouable P1 contrôlé |
| Tirage 3 chiffres | Tirage | Choisir une combinaison avant clôture | Jouable P0 |
| Jackpot MDG 5 numéros | Tirage | Choisir 5 numéros, attendre le tirage | Jouable P0 |
| Bingo communautaire | Tirage | Participer à une manche planifiée | Aperçu P1 |

Les jeux marqués « jouable » doivent fonctionner en simulation. Les jeux marqués « aperçu » doivent expliquer clairement leur état et ne pas proposer une action fictive qui semble enregistrée.

### 2.2 Ordre de lancement recommandé

```text
Coffre Mada
    ↓
Jackpot MDG
    ↓
Roue MDG comme bonus
    ↓
Bingo communautaire
    ↓
Plinko
    ↓
Slots via fournisseur certifié
    ↓
Crash en dernier, ou hors roadmap
```

Ce séquencement est une décision de périmètre. Il évite de disperser l'équipe sur plusieurs moteurs de jeu avant d'avoir validé la compréhension, la persistance, la confiance et la rétention.

### 2.3 Recommandations de conception par jeu

**Coffre Mada — produit d'appel**

- garder une seule mécanique au lancement : 9 cases à révéler ;
- éviter les niveaux de risque sélectionnables en P0, qui compliquent la compréhension et la table de gains ;
- afficher une animation courte, mais toujours proposer « Afficher le résultat » ;
- utiliser un thème malgache identifiable et respectueux, sans caricature ;
- afficher chaque partie dans l'historique.

**Jackpot MDG — produit de fidélisation**

- privilégier un tirage hebdomadaire pour créer un rendez-vous ;
- afficher calendrier, clôture, règles, lots et preuve du résultat ;
- publier un historique des tirages, y compris les tirages annulés ;
- ne pas modifier une entrée confirmée ;
- traiter les égalités et remboursements avec des règles écrites avant l'ouverture.

**Roue MDG — bonus et animation**

- la positionner comme bonus quotidien SIM ou animation sponsorisée ;
- afficher les probabilités par segment ;
- ne pas en faire la mécanique principale de participation répétée ;
- séparer les récompenses promotionnelles des résultats de jeu.

**Plinko, slots et Crash — différés**

- Plinko reste un jeu P1 avec résultat serveur indépendant de la trajectoire visuelle ;
- les slots complexes sont intégrés via un fournisseur certifié plutôt que développés entièrement en interne ;
- Crash est reporté en dernier à cause de sa boucle très intense, de son cash-out temps réel et de ses exigences anti-fraude.

## 3. Bonnes pratiques intégrées

### 3.1 Résultat et hasard

- Le résultat est calculé côté serveur, jamais dans React ou dans une animation CSS.
- Chaque participation possède une clé d'idempotence.
- Le résultat est persisté avant le début de la révélation visuelle.
- Le frontend peut être rechargé ou perdre la connexion sans perdre le résultat.
- La version de la règle et de la table de gains est enregistrée avec la participation.
- Les tirages utilisent un engagement préalable (`commitment`) puis publient la preuve après clôture.
- Le mode test utilise la devise `SIM` et un environnement isolé.

Ces principes suivent la logique des standards de systèmes de jeu interactifs comme GLI-19 et les exigences de génération de valeurs aléatoires sécurisées documentées par OWASP ASVS. Ils ne constituent pas une certification de jeu réel. [GLI-19](https://gaminglabs.com/wp-content/uploads/2020/07/GLI-19-Interactive-Gaming-Systems-v3.0.pdf) · [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)

### 3.2 Animation et intensité

- L'animation révèle un résultat déjà calculé ; elle ne choisit jamais le gain.
- L'animation est courte, désactivable et compatible avec `prefers-reduced-motion`.
- Aucun autoplay, aucune répétition automatique et aucun bouton « rejouer instantanément » qui contourne l'écran de résultat.
- Le joueur peut voir le résultat textuel sans attendre l'animation.
- Les gains nuls ou égaux au coût ne sont pas présentés comme une victoire.
- Aucun faux compte à rebours, near-miss, son de victoire trompeur ou illusion de contrôle.
- Un délai minimum simulé peut être utilisé pour tester l'UX, mais il ne doit pas empêcher l'accès immédiat au résultat.

Ces choix reprennent les exigences WCAG sur le contrôle des animations et les enseignements des règles de réduction de l'intensité des jeux en ligne. [W3C WCAG 2.2 — Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) · [Gambling Commission — Online Games Design](https://www.gamblingcommission.gov.uk/consultation-response/online-games-design-and-reverse-withdrawals/summary-of-responses-prohibiting-player-led-spin-stop-features)

### 3.3 Transparence

Chaque carte de jeu doit afficher avant l'action :

- le type de jeu ;
- la durée estimée ;
- le coût en SIM ;
- les résultats possibles ;
- les probabilités de simulation ou la table de gains ;
- la date de dernière version des règles ;
- le nombre d'essais disponibles dans le laboratoire ;
- le lien « Comment ça marche ? ».

Le joueur ne doit jamais devoir jouer pour découvrir une règle importante.

### 3.4 Accessibilité et mobile

- navigation clavier complète ;
- focus visible et ordre de tabulation logique ;
- boutons de 44 px minimum sur mobile ;
- contraste WCAG AA ;
- texte alternatif ou libellé accessible pour chaque symbole ;
- aucune information transmise par la couleur seule ;
- état de résultat annoncé dans une `aria-live` ;
- réduction des animations respectée ;
- interface utilisable en largeur 320 px et sur desktop ;
- fonctionnement lisible lorsque les images ou animations ne chargent pas.

## 4. Parcours utilisateur cible

```text
Accueil / Lobby
      ↓
Page « Jeux test »
      ↓
Choix : Instantanés | Tirages
      ↓
Fiche du jeu → règles + gains + limites
      ↓
Action SIM
      ↓
Résultat serveur persistant
      ↓
Révélation accessible + détail du ledger
      ↓
Historique / limites / retour au catalogue
```

### 4.1 États obligatoires

Chaque jeu doit gérer explicitement :

`idle` → `rules_open` → `submitting` → `completed` ou `failed`.

Pour les tirages :

`open` → `entry_submitting` → `entry_confirmed` → `closed` → `drawn` → `settled`.

États supplémentaires à couvrir :

- hors ligne avant action ;
- hors ligne après action ;
- double clic ;
- réponse lente ;
- résultat déjà enregistré ;
- solde SIM insuffisant ;
- jeu désactivé par feature flag ;
- tirage clôturé pendant la saisie ;
- erreur de preuve ou d'audit.

## 5. Structure de la page

### 5.1 En-tête

- fil d'Ariane : `MDG Game Club / Jeux test` ;
- badge visible `MODE SIMULATION` ;
- solde SIM actuel ;
- lien vers portefeuille de simulation ;
- bouton pause / limites ;
- sélecteur FR / MG.

### 5.2 Hero

Titre : **« Teste ta chance, comprends chaque résultat »**

Sous-texte : **« Des jeux de démonstration transparents, avec des crédits SIM sans valeur réelle. »**

Actions :

- `Jouer au Coffre Mada` ;
- `Voir le prochain tirage`.

### 5.3 Onglets

- `Instantanés` ;
- `Tirages` ;
- `Mon activité` ;
- `Règles et équité`.

L'onglet actif doit être reflété dans l'URL :

```text
/games/test?tab=instant
/games/test?tab=draws
/games/test?tab=activity
/games/test?tab=fairness
```

### 5.4 Cartes de jeu

Une carte contient :

- icône et nom ;
- étiquette `JOUABLE`, `PROCHAINEMENT` ou `SUSPENDU` ;
- micro-description ;
- durée ;
- coût SIM ;
- prochaine action ;
- aperçu du gain maximal de simulation ;
- lien vers les règles ;
- indicateur de limite si applicable.

Une carte désactivée ne doit pas ressembler à un bouton cassé. Elle explique pourquoi le jeu n'est pas disponible et permet de consulter sa fiche.

## 6. Expérience de chaque jeu

### 6.1 Coffre Mada

Écran : grille de 9 cases, compteur de cases révélées, règle courte et bouton de participation.

Règles :

- le serveur choisit le résultat avant l'animation ;
- la révélation est séquentielle mais peut être accélérée par `Afficher le résultat` ;
- les symboles et les lots sont textuellement décrits ;
- le gain est affiché avec la transaction SIM associée ;
- un bouton `Rejouer` ouvre d'abord une nouvelle confirmation, sans autoplay.

### 6.2 Roue MDG

Écran : roue à segments égaux visuellement ou proportions explicitement indiquées.

Règles :

- le bouton indique `Tirer en SIM`, pas seulement `Tourner` ;
- les probabilités sont visibles avant l'action ;
- la roue s'arrête sur le résultat serveur ;
- la version sans animation est toujours disponible ;
- la récompense journalière est limitée et visible.

### 6.3 Plinko et Bingo rapide

Ces jeux sont des extensions du laboratoire :

- Plinko : résultat calculé avant la trajectoire ; aucune physique côté client utilisée comme source de hasard.
- Bingo rapide : manche ouverte avec ticket simulé, fermeture, tirage des cases et résultat persistant.
- Les règles restent visibles avant l'entrée et le nombre de participants est exact.

### 6.4 Tirage 3 chiffres

Le joueur choisit une combinaison dans des champs accessibles ou utilise un bouton de sélection aléatoire clairement identifié. La sélection aléatoire ne doit jamais être présentée comme plus avantageuse.

Après confirmation :

- l'entrée reçoit un identifiant ;
- le joueur voit la date de clôture ;
- la modification est impossible après confirmation ;
- la page conserve l'entrée après reload ;
- le résultat est affiché dans l'historique après publication.

### 6.5 Jackpot MDG 5 numéros

La fiche montre :

- les 5 numéros à choisir ;
- le plafond de sélection ;
- l'heure de clôture ;
- le calendrier des prochains tirages ;
- les catégories de lots ;
- la méthode de tirage ;
- le hash d'engagement avant tirage et la preuve après tirage.

Le jackpot affiché en SIM est un montant de démonstration. Aucun vocabulaire de retrait ou de conversion ne doit apparaître dans cette page.

## 7. Contrats frontend et backend

### 7.1 Route frontend

Ajouter dans `frontend/src/App.tsx` :

```tsx
<Route path="/games/test" element={<TestGamesPage />} />
```

Le nom cible est `TestGamesPage.tsx`. Les composants visuels doivent être séparés :

```text
frontend/src/pages/TestGamesPage.tsx
frontend/src/components/games/InstantGameCard.tsx
frontend/src/components/games/InstantGameModal.tsx
frontend/src/components/games/RevealBoard.tsx
frontend/src/components/games/DrawCard.tsx
frontend/src/components/games/DrawEntryPanel.tsx
frontend/src/components/games/FairnessPanel.tsx
frontend/src/components/games/SimulationBadge.tsx
frontend/src/services/testGames.ts
frontend/src/types/testGames.ts
```

### 7.2 API de simulation

```text
GET  /api/v1/test-games/catalog/
GET  /api/v1/test-games/{slug}/rules/
POST /api/v1/test-games/{slug}/plays/
GET  /api/v1/test-games/plays/{id}/
GET  /api/v1/test-games/activity/

GET  /api/v1/test-draws/
POST /api/v1/test-draws/{id}/entries/
GET  /api/v1/test-draws/{id}/result/
GET  /api/v1/test-draws/{id}/fairness/
```

Le préfixe `test` permet d'empêcher une confusion accidentelle avec une future API de production. Si l'équipe décide de réutiliser les endpoints génériques définis dans le document 14, l'environnement et la devise `SIM` doivent rester des barrières séparées.

### 7.3 Réponse commune

```ts
type TestPlayResponse = {
  play_id: string
  game_slug: string
  game_version: string
  status: 'completed' | 'failed'
  currency: 'SIM'
  cost: number
  prize: number
  result_label: string
  transaction_id: string
  audit: {
    commitment?: string
    proof_available: boolean
  }
}
```

## 8. Lots d'implémentation

### Lot 1 — Fondations de la page

- route, layout, badge simulation et onglets URL ;
- types TypeScript ;
- fixtures de catalogue ;
- responsive 320 px / desktop ;
- états loading, vide et erreur ;
- traductions FR/MG.

**Sortie :** la page est navigable avec des cartes non jouables et aucune donnée métier inventée dans l'interface.

### Lot 2 — Coffre Mada et Roue MDG

- modèles et migrations ;
- endpoints de règles et de participation ;
- service de hasard serveur ;
- ledger SIM idempotent ;
- révélation accessible ;
- historique et détail de transaction ;
- tests backend, frontend et E2E.

**Sortie :** les deux jeux sont jouables après reload, sans double crédit.

### Lot 3 — Tirage 3 chiffres et Jackpot MDG

- calendrier ;
- entrée et clôture ;
- tirage idempotent ;
- preuve de tirage ;
- publication du résultat ;
- répartition SIM et historique.

**Sortie :** un cycle complet de tirage est testable sans tâche manuelle non tracée.

### Lot 4 — Plinko, Bingo et activité

- Plinko serveur avec animation indépendante ;
- Bingo rapide puis communautaire ;
- activité consolidée ;
- filtres par jeu et date ;
- export de handoff de test pour l'équipe QA.

**Sortie :** les expériences P1 sont isolées par feature flag et n'affectent pas les parcours P0.

### Lot 5 — Qualité, sécurité et pilote interne

- audit des permissions ;
- tests de concurrence et retry ;
- tests de distribution ;
- axe ou équivalent pour accessibilité ;
- Playwright sur mobile et desktop ;
- test de coupure réseau ;
- métriques et kill switch ;
- revue manuelle des textes de jeu responsable.

**Sortie :** page validée en interne, prête pour une démo contrôlée.

## 8 bis. Préparation documentaire pour faciliter le développement

### 8 bis.1 Décisions verrouillées avant le code

Les éléments suivants doivent être considérés comme décidés pour la page test :

| Décision | Choix P0 |
|---|---|
| Route | `/games/test` |
| Mode | Simulation `SIM` uniquement |
| Jeu d'appel | Coffre Mada |
| Jeu de fidélisation | Jackpot MDG hebdomadaire |
| Jeu bonus | Roue MDG, quota quotidien |
| Source du résultat | Backend Django / service serveur |
| Source du solde | Ledger existant |
| Persistance | PostgreSQL via API |
| Reconnexion | Rejouer la requête avec idempotency key |
| Langues | Français et malgache |
| Argent réel | Hors périmètre |
| Fournisseur externe | Hors périmètre P0 |

Toute modification de ces choix doit être ajoutée au journal de décisions du projet avant de modifier les contrats.

### 8 bis.2 Fiches de règles versionnées

Chaque jeu doit avoir une fiche indépendante dans `docs/game-rules/` :

```text
docs/game-rules/coffre-mada-v1.md
docs/game-rules/roue-mdg-v1.md
docs/game-rules/tirage-3-chiffres-v1.md
docs/game-rules/jackpot-mdg-v1.md
```

Chaque fiche contient :

- objectif et public cible ;
- déroulement exact ;
- états métier ;
- actions autorisées et refusées ;
- table de résultats ;
- probabilités de simulation ;
- arrondis et unités SIM ;
- conditions de clôture ;
- règles d'égalité, d'annulation et de remboursement ;
- exemple de partie complète ;
- identifiant de version ;
- cas limites et critères d'acceptation.

La règle affichée dans l'interface doit provenir de la même version que celle utilisée par le backend.

### 8 bis.3 Fixtures et scénarios de démonstration

Créer des fixtures déterministes pour éviter que les tests dépendent d'un hasard non reproductible :

```text
fixtures/test-games/catalog.json
fixtures/test-games/coffre-win.json
fixtures/test-games/coffre-no-prize.json
fixtures/test-games/draw-open.json
fixtures/test-games/draw-closed.json
fixtures/test-games/draw-tie.json
fixtures/test-games/draw-cancelled.json
```

Scénarios minimum à rendre accessibles à l'équipe QA :

1. nouvel utilisateur avec solde SIM suffisant ;
2. solde SIM insuffisant ;
3. victoire et crédit unique ;
4. absence de gain ;
5. double clic et retry ;
6. coupure réseau après soumission ;
7. tirage ouvert puis clôturé ;
8. gagnant, égalité et remboursement ;
9. jeu suspendu par kill switch ;
10. préférence `prefers-reduced-motion` activée.

### 8 bis.4 Contrats et exemples d'erreur

Les contrats API doivent documenter autant les erreurs que le succès :

| Code | Situation | Comportement UI |
|---|---|---|
| `400` | sélection ou combinaison invalide | corriger le formulaire sans perdre la saisie |
| `401` | session expirée | demander une reconnexion, sans rejouer automatiquement |
| `403` | jeu non disponible pour l'utilisateur | expliquer la restriction |
| `409` | retry ou entrée déjà confirmée | récupérer l'état existant |
| `410` | tirage clôturé | afficher la prochaine date |
| `422` | solde SIM insuffisant ou limite atteinte | afficher la limite et une option de pause |
| `429` | fréquence dépassée | afficher le délai restant sans boucle automatique |
| `503` | service temporairement indisponible | conserver le contexte et proposer de réessayer |

Chaque endpoint doit avoir au moins un exemple JSON de succès et un exemple par erreur métier principale.

### 8 bis.5 Matrice de traçabilité

Créer une matrice reliant chaque exigence à son code, son test et son résultat :

| Exigence | Code attendu | Test attendu | Preuve |
|---|---|---|---|
| Résultat serveur | service de hasard | test d'intégration | journal d'audit |
| Crédit unique | service ledger | test de concurrence | transaction SIM |
| Reload conservé | page + endpoint détail | E2E | capture/trace Playwright |
| Tirage non rejouable | tâche de clôture | test d'idempotence | `DrawResult` unique |
| Animation réductible | CSS et composant | test viewport/préférence | résultat textuel |
| Feature flag | configuration | test de désactivation | kill switch |

La fonctionnalité n'est pas considérée terminée si elle existe dans le code mais n'a pas de test et de preuve associés.

### 8 bis.6 Définition de prêt

Un lot peut commencer seulement si :

- la règle du jeu est versionnée ;
- les états et transitions sont listés ;
- le contrat API et les erreurs sont définis ;
- les fixtures SIM existent ;
- le comportement mobile est esquissé ;
- les limites et messages de jeu responsable sont écrits ;
- le test d'idempotence est nommé ;
- le propriétaire produit et le propriétaire technique sont identifiés.

### 8 bis.7 Définition de terminé

Un lot est terminé seulement si :

- le parcours fonctionne après rechargement ;
- l'erreur et le hors-ligne sont traités ;
- le résultat et le ledger sont cohérents ;
- FR et MG sont couverts ;
- clavier, mobile et réduction d'animation sont vérifiés ;
- les tests unitaires, intégration et E2E sont verts ;
- les métriques sont instrumentées ;
- le kill switch a été testé ;
- aucune capacité argent réel n'est activée par défaut.

### 8 bis.8 Journal des décisions et lexique

Ajouter deux documents courts avant l'implémentation :

```text
docs/DECISIONS-JEUX-TEST.md
docs/GLOSSAIRE-JEUX-TEST.md
```

Le journal conserve les arbitrages et leurs raisons. Le glossaire fixe les termes FR/MG, notamment `participation`, `entrée`, `tirage`, `gain`, `lot`, `remboursement`, `preuve`, `SIM` et `limite`. Cela évite que le frontend, le backend et le support utilisent des mots différents pour le même état. Les deux documents sont maintenant créés et deviennent les références de l'implémentation.

## 9. Critères d'acceptation

### Navigation

- `/games/test` est accessible depuis le lobby et la home sans casser les routes existantes.
- Les onglets sont partageables par URL.
- Le bouton retour et le breadcrumb fonctionnent sur mobile.
- Aucun écran ne dépend d'un refresh manuel pour afficher son état.

### Jeu instantané

- Une participation SIM crée exactement une transaction et un résultat.
- Un retry avec la même clé restitue le résultat existant.
- Un refresh après participation conserve le résultat.
- Le serveur, et non l'animation, choisit le résultat.
- Les probabilités et règles sont accessibles avant l'action.
- La réduction d'animation affiche directement un résultat textuel.

### Tirage

- Une entrée confirmée est visible après reload.
- Une entrée après clôture est refusée proprement.
- Une tâche de tirage répétée ne paie jamais deux fois.
- Le résultat publié et la preuve sont accessibles dans la page.
- Les égalités, annulations et remboursements ont un état explicite.

### Sécurité et responsabilité

- Aucune route ne permet de changer le prix, le gain ou la probabilité depuis le client.
- Les montants sont toujours libellés `SIM`.
- Le kill switch désactive les actions sans supprimer l'historique.
- Les limites de session et de participation sont visibles.
- Aucun autoplay, spin-stop, near-miss ou animation trompeuse n'est présent.

## 10. Plan de test

### Tests unitaires

- distribution des résultats selon la table de règles ;
- déterminisme d'une entrée rejouée ;
- validation des combinaisons et limites ;
- clôture et publication des tirages ;
- calcul des lots ;
- versionnement des règles.

### Tests d'intégration backend

- concurrence de deux participations ;
- double webhook ou retry ;
- solde insuffisant ;
- résultat déjà persisté ;
- timeout entre débit et réponse ;
- tâche de tirage exécutée deux fois ;
- interdiction d'accès d'un utilisateur non autorisé ;
- séparation stricte `SIM` / devise future.

### Tests frontend et E2E

- parcours mobile complet Coffre Mada ;
- parcours mobile complet Jackpot MDG ;
- clavier sans souris ;
- lecteur d'écran sur résultat ;
- `prefers-reduced-motion` ;
- réseau lent et coupure après soumission ;
- rechargement à chaque étape ;
- feature flag désactivé ;
- affichage FR et MG ;
- viewport 320 px, 390 px et desktop.

## 11. Métriques de la page test

Événements à instrumenter sans enregistrer de donnée sensible :

```text
test_games_viewed
test_games_tab_changed
test_game_rules_opened
test_game_play_started
test_game_play_completed
test_game_play_retried
test_draw_entry_confirmed
test_draw_result_viewed
test_fairness_opened
test_pause_limit_opened
```

Mesures à suivre :

- taux de clic depuis la fiche vers l'action ;
- abandon avant confirmation ;
- succès après retry ;
- retour à J1 et J7 ;
- parties par session ;
- temps passé sur les règles ;
- erreurs par type de réseau ;
- utilisation de la réduction d'animation ;
- activation de la pause ou d'une limite.

Ces métriques servent à améliorer l'interface et la compréhension. Elles ne doivent pas être utilisées pour pousser artificiellement les joueurs à augmenter leur fréquence de jeu.

## 12. Hors périmètre

- argent réel, dépôts et retraits ;
- conversion SIM vers MGA ou autre devise ;
- fournisseur externe de slots ;
- publicité d'acquisition ;
- affiliation ;
- jackpot progressif financé par argent réel ;
- application native ;
- crash et cash-out ;
- certification réglementaire.

## 13. Definition of Done

La page test sera considérée terminée lorsque :

- les lots 1 à 3 sont implémentés et verts ;
- les quatre jeux instantanés et les deux tirages P0 ont un parcours réel en SIM ;
- les résultats persistent et sont idempotents ;
- l'audit de hasard et la preuve de tirage sont consultables ;
- les tests E2E mobile/desktop passent ;
- le build frontend, le lint et les tests backend sont verts ;
- les états loading, empty, error, offline et reload sont vérifiés ;
- les textes FR/MG sont complets ;
- le kill switch et les limites sont démontrés ;
- aucune fonctionnalité argent réel n'est activée.

## 14. Recommandation générale pour l'application

La différenciation de MDG ne doit pas être le nombre de jeux. Elle doit être la confiance, la simplicité et l'identité locale :

- expliquer chaque résultat avant et après l'action ;
- garder `SIM` visuellement et techniquement séparé d'une future devise réelle ;
- fonctionner sur réseau lent avec reprise après coupure ;
- proposer français et malgache dès le premier écran ;
- utiliser des feature flags et un kill switch pour chaque jeu ;
- mesurer la compréhension des règles, la rétention et les erreurs, pas uniquement le nombre de parties ;
- intégrer ultérieurement le mobile money seulement après validation juridique et partenariat autorisé ;
- ne pas développer en interne un catalogue complet de slots avant d'avoir démontré une demande et choisi un fournisseur certifié.

Cette approche suit les recommandations actuelles sur le contrôle des animations, la réduction de l'intensité et l'audit des systèmes de jeu. Elle ne constitue pas une certification juridique ou réglementaire pour Madagascar.

## Sources et limites

- [W3C WCAG 2.2 — Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) : contrôle des animations et contenu qui bouge.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) : base de vérification des contrôles de sécurité applicative.
- [GLI-19 Interactive Gaming Systems](https://gaminglabs.com/wp-content/uploads/2020/07/GLI-19-Interactive-Gaming-Systems-v3.0.pdf) : référence industrielle à faire vérifier par un laboratoire compétent.
- [Gambling Commission — Online Games Design](https://www.gamblingcommission.gov.uk/consultation-response/online-games-design-and-reverse-withdrawals/summary-of-responses-prohibiting-player-led-spin-stop-features) : exemple de mesures de réduction de l'intensité des jeux, non applicable automatiquement au droit malgache.
- [Document 14 — Implémentation des jeux instantanés et de la loterie](14-Implementation-Jeux-Instantanes-Loterie.md) : modèle métier et architecture de référence du projet.

# MDG Game Club — Implémentation des jeux instantanés et de la loterie

**Version :** 1.0
**Date :** 11 août 2026
**Statut :** spécification produit et technique — simulation uniquement
**Décision proposée :** lancer les deux familles en parallèle dans le sandbox, avec une priorité commerciale aux jeux instantanés et une priorité de confiance à la loterie.

> Ce document n'est pas un avis juridique. Aucun dépôt, ticket payant, retrait ou prix monétaire ne doit être activé avant validation du cadre malgache, de la licence, du KYC/AML, des règles fiscales, des fournisseurs et des mécanismes de jeu responsable.

## 1. Décision en une page

Les jeux instantanés sont probablement le meilleur produit d'appel : résultat en quelques secondes, compréhension immédiate, sessions répétées et possibilité de proposer plusieurs thèmes. La loterie est plus lente mais crée un rendez-vous, une confiance autour du tirage et un jackpot qui peut être communiqué.

La recommandation est donc :

1. **P0 produit :** un jeu instantané très simple et ludique, « Coffre Mada », avec trois niveaux de risque et une révélation animée.
2. **P0 confiance :** un tirage hebdomadaire transparent, « Jackpot MDG », avec calendrier, règles visibles, historique et preuve du tirage.
3. **P1 rétention :** scratch, roue et mini-jeux instantanés supplémentaires, uniquement après mesure de la rétention et du coût par partie.
4. **P1 distribution :** partenariat avec un opérateur ou fournisseur autorisé plutôt que développement propriétaire de dizaines de slots.
5. **P2 argent réel :** décision séparée, conditionnée par la due diligence juridique et opérationnelle.

Le critère de réussite n'est pas le nombre de jeux publiés. C'est la combinaison suivante :

```text
revenu net potentiel
× fréquence de retour
× confiance dans le résultat
− coût fournisseur
− bonus, paiements, fraude et support
− risque réglementaire
```

## 2. Jeux à prioriser

### 2.1 Classement recommandé

| Rang | Jeu | Attractivité | Ludicité | Répétition | Complexité | Décision |
|---:|---|---:|---:|---:|---:|---|
| 1 | Coffre / scratch à symboles | Très forte | Très forte | Forte | Faible | P0 |
| 2 | Roue de fortune avec segments visibles | Très forte | Très forte | Forte | Faible | P0 contrôlé |
| 3 | Tirage de numéros avec jackpot progressif | Forte | Moyenne | Très forte | Moyenne | P0 |
| 4 | Crash / multiplicateur | Forte | Forte | Très forte | Élevée | Différer |
| 5 | Plinko / balle à cases | Forte | Forte | Forte | Moyenne | P1 |
| 6 | Bingo rapide | Forte | Forte | Forte | Moyenne | P1 |
| 7 | Slot à 3 rouleaux thématique Madagascar | Forte | Forte | Forte | Élevée | P1 fournisseur |
| 8 | Slot à 5 rouleaux avec bonus | Forte | Très forte | Forte | Très élevée | P2 fournisseur |
| 9 | Loterie instantanée à grilles | Moyenne | Moyenne | Moyenne | Moyenne | P1 |
| 10 | Tirage quotidien gratuit avec récompenses SIM | Bonne | Bonne | Forte | Faible | P0 sandbox |

Les scores sont des hypothèses de conception, pas des parts de marché mesurées à Madagascar. Les données publiques locales ne permettent pas de confirmer un classement précis. Les statistiques internationales récentes placent néanmoins les tirages de loterie, les paris, les cartes à gratter et les jeux instantanés parmi les activités en ligne les plus pratiquées. [Gambling Commission — 2025](https://www.gamblingcommission.gov.uk/statistics-and-research/publication/statistics-on-gambling-participation-wave-2-april-to-july-2025-official)

### 2.2 Pourquoi « Coffre Mada » est le meilleur premier jeu

Le jeu doit être ludique sans être opaque :

- 9 cases ou 12 cases à révéler ;
- 3 symboles de collection inspirés de Madagascar ;
- une animation courte, désactivable et compatible réseau lent ;
- un résultat calculé côté serveur avant l'animation ;
- un historique indiquant le ticket, le résultat et l'heure ;
- des lots SIM en sandbox, jamais une promesse d'argent réel ;
- aucune near-miss artificielle ni animation qui trompe le joueur ;
- une limite de sessions et un rappel de pause.

Ce format réutilise les capacités déjà présentes dans MDG : wallet, ledger, missions, historique, audit, feature flags et localisation française/malgache.

### 2.3 Pourquoi ajouter la roue, mais la contrôler

La roue est visuellement très attractive et se comprend immédiatement. Elle doit toutefois rester un jeu de hasard auditable, et non une animation qui laisse croire que le joueur influence le résultat.

Règles de conception :

- probabilités affichées par segment avant la participation ;
- résultat tiré par le serveur ;
- animation déterministe vers le résultat déjà tiré ;
- un seul tirage par mutation idempotente ;
- plafond journalier ;
- journal complet des résultats ;
- récompenses promotionnelles séparées des mises.

### 2.4 Pourquoi repousser le crash

Le crash est très engageant mais pousse à la répétition rapide, à l'illusion de contrôle et aux risques de comportement compulsif. Il exige aussi un moteur temps réel, des règles de cash-out, un mécanisme de seed vérifiable et une surveillance anti-fraude. Il ne doit pas être le premier jeu d'argent réel du projet.

## 3. Offre fonctionnelle des deux familles

### 3.1 Jeux instantanés

Un jeu instantané suit cette boucle :

```text
Choix du jeu → règle et coût visibles → participation idempotente
→ tirage serveur → animation de révélation → résultat persistant
→ crédit ou absence de gain → historique → rejouer ou quitter
```

Jeux du catalogue initial :

| Jeu | Boucle | Différenciation MDG | Limite initiale |
|---|---|---|---|
| Coffre Mada | Révéler 9 cases | Symboles locaux, collection | 5 essais SIM/jour |
| Roue MDG | Faire tourner | Segments et jackpot lisibles | 1 bonus gratuit/jour |
| Plinko | Lancer une bille | Spectacle visuel court | Pas de cash-out P0 |
| Bingo rapide | Compléter une ligne | Social et résultats fréquents | 1 partie par manche |

### 3.2 Loterie et jeux de tirage

La loterie doit créer un rendez-vous, pas seulement une transaction :

```text
Calendrier → choix de grille ou numéro → clôture des ventes
→ tirage auditable → publication du résultat → calcul des gagnants
→ distribution SIM en sandbox → réclamation et historique
```

Catalogue initial :

| Jeu | Fréquence | Intérêt produit | Décision |
|---|---|---|---|
| Tirage quotidien 3 chiffres | Quotidienne | Simple, mobile, retour fréquent | P0 sandbox |
| Jackpot hebdomadaire 5 numéros | Hebdomadaire | Événement et partage social | P0 sandbox |
| Bingo communautaire | 2 à 3 fois/semaine | Peut réutiliser les clubs | P1 |
| Tirage sponsorisé | Mensuelle | Revenu B2B et acquisition | P1 |

Pour chaque tirage, le joueur doit voir avant de participer : date et heure de clôture, méthode, fréquence, coût simulé, grille de gains, limites, règles d'annulation et traitement des égalités.

## 4. Architecture cible adaptée au projet

### 4.1 Principes

- Le backend Django est l'autorité métier.
- Le moteur de hasard est séparé du frontend et ne dépend jamais de l'animation.
- Le wallet et le ledger restent la source de vérité des crédits/débits.
- Chaque participation possède une clé d'idempotence et un identifiant public.
- Le résultat est immuable après clôture, sauf procédure d'annulation auditée.
- Les jeux peuvent être activés par feature flag et coupés par kill switch.
- Le mode `SIM` reste strictement séparé d'une future devise réelle.

### 4.2 Modèle de données proposé

Nouvelles entités Django :

| Entité | Rôle |
|---|---|
| `InstantGameDefinition` | Nom, version, thème, règles, RTP théorique simulé, statut |
| `InstantPlay` | Participation utilisateur, coût, résultat, statut, transaction |
| `DrawDefinition` | Tirage, calendrier, clôture, statut, règle et jackpot |
| `DrawEntry` | Grille ou numéro choisi, utilisateur, transaction, statut |
| `DrawResult` | Résultat publié, méthode, hash de preuve, date de publication |
| `PrizeTier` | Rang, condition, montant ou lot, plafond |
| `PrizeClaim` | Gagnant, lot, statut, paiement, date d'expiration |
| `RandomnessAudit` | Version RNG, commitment, preuve, opérateur et horodatage |

Contraintes obligatoires :

- unicité de `idempotency_key` par utilisateur et jeu ;
- impossibilité de modifier un `InstantPlay` terminé ;
- une seule entrée par combinaison autorisée pour un tirage ;
- clôture transactionnelle avant le tirage ;
- aucun résultat sans référence à une version de règle ;
- aucun crédit sans transaction wallet liée ;
- conservation de l'audit même après remboursement.

### 4.3 API proposée

```text
GET    /api/v1/instant-games/
GET    /api/v1/instant-games/{slug}/rules/
POST   /api/v1/instant-games/{slug}/plays/
GET    /api/v1/instant-games/plays/{id}/
GET    /api/v1/instant-games/history/

GET    /api/v1/draws/
GET    /api/v1/draws/{id}/rules/
POST   /api/v1/draws/{id}/entries/
GET    /api/v1/draws/{id}/result/
GET    /api/v1/draws/{id}/winners/
POST   /api/v1/prizes/{id}/claim/
```

Réponse de participation :

```json
{
  "play_id": "uuid",
  "game_version": "coffre-mada-v1",
  "status": "completed",
  "result": {"kind": "symbol_match", "prize": 250},
  "currency": "SIM",
  "transaction_id": "uuid",
  "audit": {"commitment": "sha256:...", "proof_available": true}
}
```

Le frontend ne doit jamais calculer le gain, le prix, le jackpot ou la probabilité. Il affiche la réponse de l'API et l'état de la transaction.

## 5. Déroulement technique par lots

### Lot A — Contrats et règles communes

- Ajouter les types partagés TypeScript pour jeux, tirages, lots et audit.
- Définir les statuts : `draft`, `open`, `closed`, `drawn`, `settled`, `cancelled`.
- Définir les règles d'idempotence, remboursement et reprise.
- Créer fixtures SIM et versions de règles.
- Ajouter les feature flags `instant_games_enabled` et `draws_enabled`.

**Sortie :** contrats validés, aucune mutation argent réel.

### Lot B — Hasard déterministe et auditabilité

- Générateur cryptographiquement sûr côté serveur.
- Version de règle persistée avec chaque résultat.
- Commitment avant clôture pour les tirages.
- Preuve vérifiable après publication.
- Tests de distribution sur un grand échantillon SIM.
- Interdiction de tirer depuis le client.

**Sortie :** un auditeur peut recalculer un résultat avec les éléments publiés.

### Lot C — Backend jeux instantanés

- Modèles et migrations.
- Endpoint de liste et règles.
- Endpoint de participation atomique.
- Débit du coût et crédit du gain dans une transaction ledger.
- Gestion du double clic, timeout et retry.
- Historique et métriques.

**Sortie :** un joueur peut jouer, recharger et retrouver exactement le même résultat.

### Lot D — Backend loterie

- Création et ouverture d'un tirage.
- Clôture automatique et blocage des nouvelles entrées.
- Tirage idempotent par tâche contrôlée.
- Calcul des gagnants et égalités.
- Crédit des lots et expiration des réclamations.
- Annulation et remboursement auditables.

**Sortie :** un tirage complet est reproductible en SIM, avec historique public.

### Lot E — Frontend mobile-first

- Lobby séparant clairement « Instantané » et « Tirages ».
- Cartes de jeu avec durée, coût simulé, lot et niveau de risque visibles.
- Révélation animée courte, accessible et désactivable.
- Écran de règles avant participation.
- Écran résultat avec détail du calcul et transaction.
- Calendrier des tirages et compte à rebours.
- États loading, vide, erreur, hors ligne, succès et déjà traité.
- FR/MG et mode réseau lent.

**Sortie :** parcours complet navigable sans texte codé en dur ni résultat local.

### Lot F — Social, rétention et monétisation sandbox

- Partage du résultat sans exposer de données sensibles.
- Classement de points, séparé des gains.
- Missions de découverte avec plafonds.
- Tournois ou tirages sponsorisés en SIM.
- Tableau de bord de cohortes et rétention.
- Abonnement premium uniquement pour fonctionnalités de service.

**Sortie :** la rétention est mesurée avant toute décision argent réel.

### Lot G — Conformité et pilote fermé

Ce lot ne démarre qu'après une décision juridique documentée :

- licence et périmètre autorisé ;
- âge, identité, territoire et géoblocage ;
- KYC/AML et détection fraude ;
- limites de dépôt, perte, session et auto-exclusion ;
- règles de communication et publicité ;
- fournisseur RNG/jeux certifié ;
- conditions de paiement et de retrait ;
- support, litiges et conservation des preuves.

**Sortie :** feu vert écrit, pilote limité, kill switch testé et plan d'incident.

## 6. Économie et métriques

### 6.1 Métriques produit

- taux de première participation après onboarding ;
- parties instantanées par utilisateur actif ;
- retour à J1, J7 et J30 ;
- taux de consultation des règles ;
- taux de résultat consulté après animation ;
- taux d'erreur et de retry ;
- remplissage des tirages ;
- nombre moyen d'entrées par tirage ;
- part des utilisateurs qui activent une limite ou une pause.

### 6.2 Métriques économiques

```text
GGR instantané = participations − gains − remboursements
GGR tirage     = entrées − lots − remboursements
NGR            = GGR − bonus − paiements − taxes − fraude − fournisseurs
```

Ne jamais présenter le volume de participations comme du revenu. En sandbox, toutes les valeurs restent des indicateurs de comportement, pas une projection financière.

### 6.3 Seuils de décision internes

Les seuils ci-dessous sont des propositions de pilotage, à calibrer avec les premières cohortes :

- ne pas ajouter un nouveau jeu sans amélioration mesurable de la rétention ou du revenu net simulé ;
- arrêter un jeu si son taux d'erreur ou de litige dépasse le seuil support défini ;
- limiter les bonus si le retour dépend uniquement d'incitations ;
- comparer les jeux par utilisateur actif, pas uniquement par volume global ;
- séparer les joueurs occasionnels, fréquents et à risque.

## 7. Jeu responsable et sécurité

Même en simulation, l'interface doit préparer les bons réflexes :

- âge minimum affiché ;
- limites de session et de participation ;
- pause volontaire et auto-exclusion simulée ;
- aucune notification agressive ou culpabilisante ;
- absence de faux compte à rebours pour forcer l'achat ;
- aucune récompense qui augmente les chances d'un joueur ;
- séparation entre solde bonus et solde de jeu ;
- détection des répétitions anormales, multi-comptes et retries ;
- accès staff journalisé et kill switch par jeu.

La roulette, le crash et les slots à bonus doivent être traités avec davantage de prudence que le tirage hebdomadaire : leur boucle courte peut augmenter l'intensité de jeu.

## 8. Critères d'acceptation P0

### Coffre Mada

- Le joueur voit les règles, la version et le coût SIM avant de jouer.
- Un double clic ne crée qu'une participation.
- Le résultat est tiré côté serveur et persiste après reload.
- Le gain est crédité au plus une fois.
- L'animation reflète le résultat sans le déterminer.
- L'historique affiche participation, résultat, transaction et heure.
- Un kill switch désactive le jeu sans supprimer l'historique.

### Jackpot MDG

- Les horaires de clôture sont visibles en FR et MG.
- Une entrée ne peut plus être créée après clôture.
- Le tirage est unique même après retry de la tâche.
- Le résultat publié possède une preuve d'audit.
- Les égalités et les remboursements sont déterministes.
- Les lots et réclamations sont historisés.
- Le calendrier reste consultable même si le jeu est temporairement suspendu.

## 9. Ordre de livraison recommandé

```text
Lot A Contrats
    ↓
Lot B Hasard et audit
    ├── Lot C Coffre Mada → Lot E UX instantanée
    └── Lot D Jackpot MDG → Lot E UX tirages
                              ↓
                         Lot F rétention
                              ↓
                 décision juridique et fournisseur
                              ↓
                         Lot G pilote fermé
```

## 10. Décision à prendre

Nous pouvons implémenter les deux produits en simulation sans attendre un choix de fournisseur :

- **produit d'appel :** Coffre Mada ;
- **produit de rendez-vous :** Jackpot MDG ;
- **produit ludique P1 :** Roue MDG ;
- **produits différés :** crash et slots complexes ;
- **argent réel :** hors périmètre jusqu'au feu vert juridique et partenaire autorisé.

Cette combinaison teste simultanément l'impulsion, la répétition, la confiance et la viralité, sans engager immédiatement les coûts et risques d'un catalogue de casino complet.

## Sources et limites

- [Gambling Commission — statistiques de participation 2025](https://www.gamblingcommission.gov.uk/statistics-and-research/publication/statistics-on-gambling-participation-wave-2-april-to-july-2025-official) : comparaison internationale, non spécifique à Madagascar.
- [Loterie Nationale Malagasy](https://lnm.mg/) : présence officielle d'une loterie nationale, sans conclusion sur le périmètre juridique applicable à MDG.
- [Bet261 Corporate](https://corporate.bet261.mg/decouvrir-bet261-group/) : exemple de portefeuille et de distribution à Madagascar, sans preuve publique de parts de marché ou de rentabilité par produit.
- [Centre National de Législation](https://cnlegis.gov.mg/) : point de départ pour la vérification des textes officiels ; validation par conseil local encore nécessaire.

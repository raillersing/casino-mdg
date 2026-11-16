# CasinoMDG — critères GO / NO-GO de la refonte UX

Date du document : 16 novembre 2026. **Ce document n'accorde aucune autorisation de publication.** Il impose une revue factuelle et une approbation explicite avant tout tag `v*` ou intervention sur le VPS de production.

## 1. Identité de la version

- Commit Git exact candidat : `________________________________________`
- Révision Docker/images immuables (digest, pas `latest`) : `________________________________________`
- Résultat de la CI du candidat et URL : `________________________________________`
- Date et environnement de staging : `________________________________________`
- Validateur technique / métier : `________________________________________`

**NO-GO** si l'un de ces éléments manque. Une CI verte sur un autre commit ne suffit pas.

## 2. Prérequis bloquants de sécurité et d'exploitation

- [ ] Trivy HIGH/CRITICAL et pip-audit satisfaits sur le commit et les images finales, sans contournement ; revue des vulnérabilités npm/outillage et des exceptions documentées (#60).
- [ ] Identités / JWT, secrets Django, moteur, Redis, RabbitMQ et paiement **distincts** entre staging et production ; aucun secret en Git ou dans les logs.
- [ ] Confidentialité des codes de tables privées (#62) recontrôlée sur staging et recherche de fuite dans l'API, les pages, les logs et les exports.
- [ ] Une passerelle SMS **réelle et vérifiée** est configurée, OTP ne fuit pas et mode indisponible renvoie 503 (#66).
- [ ] Revue des règles financières MGA (validation métier/juridique/comptable) ; aucune bascule d'argent réel uniquement sur la base d'une CI logicielle.
- [ ] Sauvegarde testée de Postgres, du stockage et de la configuration, **restauration de test réussie** ; procédure documentée avec responsable et heure.
- [ ] Retour arrière testé sur staging, en particulier compatibilité des migrations DB ; ne jamais supposer qu'un simple `docker compose down` annule une migration.

## 3. Recette jeux et UX (#57)

- [ ] Vrai staging isolé sur commit candidat, marqueur `/__staging__/identity` positif ; aucun service de production utilisé.
- [ ] Script `scripts/staging-live-acceptance.mjs` exécuté avec quatre comptes de test, résultats sauvegardés et nettoyages vérifiés.
- [ ] **Matchmaking réel** par jeu et format : tickets, admission, annulation vs match, expiration, reprise après reload et après coupure réseau.
- [ ] **Jeu complet réellement joué** pour Belote, Ludo, Domino, Rami et Poker, avec actions validées, fin de partie et résultats cohérents (les états WebSocket seuls ne suffisent pas).
- [ ] Test de table pleine, privée/club, droits de création, invitation et refus d'accès non autorisé.
- [ ] Présence WebSocket confirmée distinguée de la réservation d'un siège, résolution de reconnexion, multi-onglets et fermeture de table.
- [ ] Parcours FR et MG revus par des locuteurs ; mobile à 320/360/390/430 px, clavier, accessibilité et réduction de mouvement.
- [ ] Sessions pilotes sans aide, incidents réseau mobile et temps de chargement consignés avec résultats et métriques observables.
- [ ] Documentation, captures/vidéos, logs expurgés et rapport PASS/FAIL liés au **même** commit candidat.

## 4. Décision de publication

- Décision : [ ] GO  [ ] NO-GO
- Signataire technique : `____________`
- Signataire métier : `____________`
- Date/heure : `____________`
- Référence du rapport : `____________`
- Fenêtre de maintenance et communication aux joueurs : `____________`
- Procédure de restauration + temps maximum accepté : `____________`

**Règle : aucun élément « non testé » ne peut être transformé en « réussi ».** Le bon résultat est NO-GO tant qu'un prérequis P0 n'est pas démontré. Les issues #57, #60 et #66 restent ouvertes jusqu'à preuve. L'issue #70 concerne les extractions WebSocket/matchmaking de dette technique et nécessite une revue de risque distincte.

## 5. Séquence prudente de production (non exécutée)

1. Vérifier la décision GO signée et le commit/tag exact.
2. Prévenir les joueurs et limiter les nouvelles tables si besoin ; vérifier qu'aucune session active ne doit être interrompue.
3. Effectuer et **valider** la sauvegarde.
4. Déployer uniquement des images aux digests vérifiés, avec secrets de production côté serveur.
5. Exécuter les migrations contrôlées sous un plan de retour arrière préparé ; les migrations irréversibles exigent un plan de restauration des données.
6. Vérifier santé API, moteur, paiement, OTP, match et clients mobiles ; surveiller journaux et métriques.
7. En cas d'écart aux critères, appliquer le plan de rollback documenté, informer les utilisateurs et rouvrir le défaut concerné.

Ce document est une checklist de sécurité, pas un script automatique de déploiement. Ne pas déclencher un tag `v*` pour « tester » la production.

# Révocation des sessions WebSocket du moteur de jeu

## Contrat entre Django et Go

- Le backend émet les JWT d'admission avec `ver` = `User.token_version`.
- Le moteur vérifie la signature et la date d'expiration du JWT avant le handshake, puis appelle `GET /api/v1/games/internal/sessions/<player_uuid>/` avec `X-Game-Engine-Secret`. Seul le moteur connaît `GAME_ENGINE_RESULT_SECRET`.
- Django répond uniquement `{"active": true|false, "token_version": n}`, avec `Cache-Control: no-store`. Une clé erronée est refusée en 403 et un compte inconnu en 404.
- Le moteur n'accepte la connexion que si `active=true` et si la version correspond exactement à celle du JWT ; il refait le contrôle **toutes les 15 secondes** sur les connexions humaines ouvertes, même avant l'entrée dans une table. La vérification HTTPS interne n'est pas requise au sein du réseau Docker privé ; utiliser TLS authentifié pour tout backend distant.
- Si le backend est indisponible, si la réponse est malformée ou si les secrets sont absents, le moteur **refuse** les nouvelles connexions humaines et **ferme** les connexions actives lors du contrôle suivant. Une interruption backend peut donc provoquer des déconnexions ; cette politique de sécurité doit être testée en staging.
- Les bots authentifiés par `GAME_ENGINE_BOT_SECRET` ne sont pas des utilisateurs Django ; leurs tokens restent vérifiés séparément.
- `BACKEND_INTERNAL_URL` est obligatoire en déploiement ; seul un objet de configuration de test construit avec URL vide saute le contrôle. La configuration normale de l'application fournit une URL backend.

## Finances et limites

La fermeture du WebSocket utilise le chemin de déconnexion existant du moteur, sans ajouter de transfert ni de remboursement. La suspension back-office **refuse déjà** de suspendre un joueur dont le `TableBankroll` est `reserved` ou `active`. Une invalidation externe (par exemple changement d'état directement en base) reste possible et doit déclencher une procédure d'exploitation pour une partie financée, pas un remboursement improvisé.

**Non validé par l'implémentation :** tests multinoeuds réels, interruption d'une partie MGA en cours, rapprochement PSP et règlement externe, reprise après défaillance du backend. Ces points demeurent dans l'issue #86.

## Scénarios de recette staging

1. Connexion avec un JWT d'admission valide : handshake 101.
2. Suspension d'un compte de test sans fonds engagés ; le WebSocket existant doit se fermer sous environ 15 s + latence du backend et les nouvelles tentatives doivent retourner 401.
3. Réactivation : un ancien JWT doit rester refusé ; une nouvelle connexion avec jeton fraîchement émis doit réussir.
4. Redémarrage temporaire du backend sur staging : vérifier que le moteur refuse l'accès et ferme les connexions humaines lors du contrôle suivant, **sans perte de solde** ni remboursement inventé.
5. Vérifier le comportement sur plusieurs onglets et sur plusieurs instances moteur ; les résultats réels doivent être consignés avant clôture de #86.

Les tests unitaires Go et Django prouvent le comportement du code sous un serveur HTTP simulé / une DB de test ; ils ne remplacent pas la recette sur serveur.

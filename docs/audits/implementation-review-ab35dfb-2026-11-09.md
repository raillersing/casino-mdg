# Contre-vérification du rapport d'implémentation ab35dfb

Date : 9 novembre 2026. Commit examiné : `ab35dfb1c46e3a296c7dd132b327f7d9ed38367a`.

## Verdict

Les nouveaux écrans, le retour des tickets dans les réponses de création, le démarrage poker à deux et la réservation MGA existent. La mission ne satisfait cependant pas encore les critères de réception : le financement, le règlement et certains contrôles d'accès restent incomplets. La partie MGA ne doit pas être considérée comme qualifiée pour activation.

Cette revue n'applique aucun correctif fonctionnel. Les tests ci-dessous utilisent des données fictives dans une base SQLite de test isolée, sans mouvement de fonds réels ni modification des services partagés.

## P0 — Recharge moteur sans preuve comptable

`game-engine/internal/websocket/server.go:1144` traite `top_up`/`rebuy` avant le chemin normal des actions. Il lit un montant fourni par le client et appelle directement `Manager.QueueTopUp`. Aucun identifiant d'opération financière, acquittement backend ou justificatif signé n'est vérifié. Les séquences et l'idempotence habituelles des événements ne protègent pas ce chemin.

Le nouveau test `TestBuyInAndTopUpAction` envoie lui-même une recharge de 25 000 par WebSocket sans backend de réservation et attend son acceptation. Je l'ai réexécuté avec `-race` : il réussit et confirme ce comportement. Un succès de ce test ne qualifie donc pas la conservation des fonds.

Correction requise : une opération MGA durable, unique et autorisée par le backend, livrée au moteur de manière fiable ; un montant brut envoyé par le navigateur ne doit pas financer un tapis. Les répétitions d'une même opération doivent être sans effet supplémentaire.

## P0 — Tapis comptable non synchronisé avec les gains et pertes

`TableBankroll.current_stack` est initialisé dans `join_table`, puis mis à zéro lors du remboursement. La recherche de toutes ses utilisations ne trouve pas de mise à jour depuis les mains du moteur. `leave_table` restitue pourtant précisément ce champ (`services.py:204`). Les gains existants restent traités par le service SIM ; aucun règlement des variations de tapis MGA n'est relié à cette nouvelle bankroll.

Conséquence : un joueur entré avec 50 000 se voit restituer la valeur initiale sans rapprochement fiable avec son tapis final. Les soldes backend, moteur et historique ne sont pas cohérents.

Correction requise : règlement signé et idempotent par main/session, rapprochement avec le séquestre de table, règle de sortie en cours de main et invariant de conservation des fonds. Ne pas corriger par un montant de remboursement fourni par le client.

## P0 — Recharge en attente laissée bloquée après sortie

`top_up_table` diminue le disponible et augmente les fonds bloqués ainsi que `pending_top_up`. `leave_table` restitue uniquement `current_stack`, marque la bankroll `refunded` et ne traite pas ce complément.

Reproduction ciblée sur le service réel :

1. Compte MGA fictif : 100 000 disponibles, zéro bloqué.
2. Entrée poker à 50 000, puis complément de 10 000, sans aucune main jouée.
3. Sortie de table.
4. Résultat observé : **90 000 disponibles, 10 000 bloqués, complément 10 000 et bankroll marquée remboursée**.

Un second départ retourne sans remboursement puisque le siège a été supprimé. Il faut annuler/restituer les compléments non consommés ou régler leur statut de manière explicite, y compris à l'expiration et à la fermeture de la table.

## P0 — Contrôle d'admission privée encore incomplet

Dans `handleJoin`, le refus des JWT ordinaires sans ticket est toujours situé uniquement dans la branche où aucune salle/sauvegarde n'est trouvée (`server.go:369`). Une salle déjà existante n'impose pas systématiquement un ticket de siège à tout joueur. La correction du ticket côté interface ne ferme pas ce contournement déjà identifié dans l'audit initial.

Constat de lecture du chemin de contrôle inchangé ; le scénario réseau de contournement n'a pas été réexécuté dans cette contre-vérification. Ajouter un test négatif sur salle privée déjà ouverte, pas seulement sur création de salle.

## P1 — Recharge sans identité de requête et sans livraison durable

`TableTopUpView` ne reçoit pas d'identifiant d'opération idempotente. Deux appels légitimes ou une répétition après perte de réponse déclenchent de nouvelles réservations. Les codes de transaction basés sur l'heure ne constituent pas un contrat d'idempotence : dans la même seconde ils peuvent aussi provoquer une collision.

Reproduction de deux appels identiques à deux secondes d'intervalle, après une entrée de 50 000 sur 100 000 : **30 000 disponibles, 70 000 bloqués et 20 000 en attente**. Aucun mécanisme ne reconnaît la répétition d'une même demande.

De plus `GamePage.handleConfirmTopUp` fait deux opérations indépendantes : POST Django, puis envoi WebSocket via le navigateur. Si le second envoi est perdu, le backend conserve les fonds réservés sans ajout au moteur ; s'il est répété, le moteur peut ajouter plusieurs fois. Aucune confirmation durable n'efface `pending_top_up` dans Django lorsque le moteur applique la recharge.

Correction requise : une seule opération financière identifiée, avec états de réservation/livraison/application/annulation, reprise durable et compensation.

## Autres limites de la déclaration de réception

- Le rapport annonce Go `-race`, mais sa matrice indique `go test ./...` sans ce paramètre. Demander les journaux exacts et le commit testé ; le test ciblé que j'ai relancé utilise bien `-race`, mais ce n'est pas une relance de toute la suite.
- Les 29 tests Django annoncés concernent un sous-ensemble, pas la suite complète du dépôt.
- Les fichiers de preuves du 8 novembre et l'audit initial sont inclus dans le commit. Ils décrivent le code antérieur et ne constituent pas une réception des modifications du 9 novembre.
- Les tests navigateur existants ne suffisent pas à établir une partie complète avec deux vrais comptes, un règlement MGA, une recharge interrompue et une reprise après incident.
- Je n'ai pas réexécuté l'ensemble des suites ni qualifié la production pendant cette revue. Les constats financiers suffisent à invalider le statut de mission entièrement reçue, indépendamment des suites annoncées vertes.

## Tests ciblés de cette revue

- Deux scénarios Django isolés exécutés : ils vérifient les valeurs incorrectes observées et confirment les reproductions ci-dessus. Leur résultat « passed » signifie que l'anomalie a été reproduite, pas que le contrat attendu est respecté.
- `go test -race ./internal/websocket -run '^TestBuyInAndTopUpAction$' -count=1 -v` : réussi ; recharge directe sans preuve backend acceptée.
- Aucune modification du code applicatif, des migrations ou des comptes réels.

## Ordre de correction recommandé

1. Fermer le financement moteur par montant client et l'entrée joueur sans admission valable, y compris dans les salles existantes.
2. Introduire les opérations financières uniques et leur livraison durable, avec contrôle de fonds MGA et idempotence aux deux extrémités.
3. Relier résultats de main, tapis final et restitution ; traiter les compléments non appliqués, départs et expirations sans fonds bloqués orphelins.
4. Ajouter des tests négatifs qui échouent sur le code actuel : recharge non financée, répétition, sortie avec complément, perte d'acquittement, gains/pertes et conservation des fonds.
5. Reprendre la matrice complète de réception sur PostgreSQL et deux navigateurs avec les vrais services, puis produire des preuves datées pour le commit corrigé.

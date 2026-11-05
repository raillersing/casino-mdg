# Accueil distinct du catalogue et revue du travail livré

4 novembre 2026 — audit et proposition, sans modification fonctionnelle.

## Méthode et preuves

Navigation Chromium réelle sur http://127.0.0.1:3000 : accueil, /games, /lobby, /play/belote, /play/ludo ; viewport bureau 1440×1000 et contrôle mobile 390×844. Consultation réelle de GET /api/v1/games/live-stats/ sur 8001. Aucun utilisateur créé, aucune mise, aucune table créée ni rejointe. Les formulaires authentifiés et les parcours entre plusieurs joueurs ne sont donc pas qualifiés. Captures conservées dans /tmp/casino-home-audit/ (artefacts locaux temporaires).

Lecture du commit local 1b9e823 et comparaison avec origin/master f8b20cc ; inventaire des branches locales/distantes. Le changement de statistiques/configuration/code privé est un commit local sur master, en avance d'un commit sur la référence distante observée. Les branches historiques de poker, accessibilité et stabilisation E2E sont des travaux techniques ; leurs intitulés ne prouvent pas la réception des nouvelles fonctionnalités. Les deux anciennes branches feature de refonte ont été fusionnées par squash : leur absence d'ancestralité brute n'est pas une preuve de travail restant à intégrer. Aucun checkout, merge ou changement de service effectué.

## Résultats de navigation

- Accueil et Jeux utilisent le même composant HomePage avec un booléen catalog : mêmes cinq illustrations, descriptions, lien vers les tables et aide. La recherche et les catégories sont la principale différence.
- Lobby réel : bandeau « 17 joueurs en direct », « 2 tables en cours », « 206 salons ouverts » ; six cartes publiques visibles. Ces chiffres sont un instantané de réponse, pas des personnes connectées vérifiées. Le décalage des périmètres n'est pas expliqué.
- Les pages Belote et Ludo reprennent le bandeau global, même quand le visiteur s'intéresse à un seul jeu ; les réglages de robots restent exposés avant le choix effectif de l'entraînement.
- La création et la saisie de code disposent de nouvelles interfaces ; existence du formulaire ne prouve pas la transmission et l'exécution des règles.

## Revue du commit 1b9e823 : livraison partielle

### P0 — exactitude de la présence

LiveStatsView additionne une présence de moins de 60 secondes à tous les utilisateurs disposant de sièges dans des tables open/running, sans expiration des sièges. Une ancienne occupation suffit donc à compter quelqu'un en ligne. Les tables sont comptées depuis Django et incluent les lignes privées/démonstration sans définition métier claire ; aucune preuve de session moteur vivante. Le GET met à jour la présence uniquement pour request.user authentifié, alors que getLiveStats() ne transmet pas de Bearer token. Sur erreur, LiveStatsTicker conserve silencieusement les anciens chiffres ; l'indicateur vert reste visible. Corriger avant d'afficher ces statistiques sur l'accueil.

### P0 — réglages non exécutés

Le commit ajoute stake_amount, turn_duration et rules_config au modèle et aux formulaires. Aucun fichier du moteur Go ni du service d'admission n'est modifié pour transmettre/appliquer ces réglages. Les valeurs proposées pour Ludo (pions, sortie, capture), Belote, Rami et Poker ne doivent pas être présentées comme opérationnelles. rules_config est accepté comme dictionnaire, sans schéma strict par variante. L'écart Rami reste à résoudre. Ne pas déduire d'un montant stocké qu'une réservation portefeuille est réalisée.

### P0 — accès privé

TableJoinByCodeView recherche access_code OU table_code puis joint directement la table ; hors contrôle de club, il ne vérifie pas que le code fourni est le secret d'une table privée. Un table_code prévisible peut donc servir d'entrée à une table privée. Constat statique, aucun test intrusif réalisé. Le flux doit distinguer identifiant public, secret privé et invitation ; contrôler aussi le ticket d'admission et les connexions moteur. Le payload fournit access_code aux destinataires du payload d'une table privée : définir explicitement quels rôles peuvent le connaître et le partager.

### P1 — cohérence et charge cognitive

Le bandeau global répété et les catégories du lobby répètent plusieurs fois les mêmes chiffres. La somme globale et la liste autorisée n'ont pas le même périmètre. Les nouveaux formulaires sont volumineux et partiellement en français codé en dur. Réduire l'information avant le choix du mode et rendre explicites les états indisponibles.

## Comparaison de plateformes, sources consultées

- Lichess : actions distinctes « Create lobby game », « Challenge a friend », « Play against computer » ; activité en direct et contenu communautaire secondaires. https://lichess.org/
- Papergames : met explicitement en avant le jeu entre amis par lien unique ; jeux et tournois sont des parcours distincts. https://papergames.io/en/
- Board Game Arena : promesse courte, accès navigateur, amis et choix de rythme ; FAQ distinguant les modes de jeu et tables. Le rendu web consulté signalait une dépendance JS non chargée : comparaison limitée aux contenus accessibles, pas à son espace connecté. https://en.boardgamearena.com/ et https://en.boardgamearena.com/faq
- NN/g : hiérarchie visuelle, tâches prioritaires et simplicité de l'accueil. https://www.nngroup.com/articles/homepage-design-principles/
- NN/g : la personnalisation ne doit pas compenser une structure mal priorisée. https://www.nngroup.com/articles/customization-personalization/

Ces observations inspirent la proposition ; elles ne constituent pas une expérience utilisateur comparative ni une preuve d'amélioration mesurée pour MDG.

## Direction recommandée

Accueil = orientation et retour au jeu. Jeux = choix et découverte. Tables = disponibilité et organisation d'une partie. Page de jeu = modes, règles et tables du jeu choisi.

L'accueil ne doit ni répéter la grille complète ni devenir un tableau de bord dense.

Ordre proposé pour un visiteur :
1. Hero court : « Une partie, ensemble ? » ; une scène illustrée forte issue des visuels existants ; action principale « Choisir un jeu », secondaire « Rejoindre une table privée ».
2. Trois intentions lisibles : jouer en ligne, avec des proches, s'entraîner. Chaque action mène à un parcours précis et conserve le jeu choisi si nécessaire. Ne pas lancer arbitrairement une Belote par défaut.
3. Activité réelle compacte, uniquement après correction de ses sources : joueurs disponibles et tables publiques démarrées, avec fraîcheur/indisponibilité explicites. Si aucune activité, proposer création privée ou entraînement sans urgence artificielle.
4. Une sélection éditoriale courte de deux jeux maximum, alternant sur choix éditorial explicite ; lien vers les cinq jeux. Ne pas inventer de popularité.
5. Une aide brève « Choisir → rejoindre ou inviter → jouer » et liens vers règles/support.

Pour un utilisateur connecté : priorité à « Reprendre ma partie » si une session admissible est confirmée ; ensuite invitations/dernier jeu avec consentement et données disponibles. Sans session active, reprendre la structure générale. Aucun historique fictif. Les clubs ou tournois ne remontent que si une action réelle concerne cet utilisateur.

Style : conserver les illustrations, alléger les bordures, une couleur d'action dominante, éviter carrousel automatique, compteurs animés et faux « en direct ». Mobile : titre et première action au premier écran, cartes d'intention compactes, navigation persistante sans bouton flottant redondant. Textes FR/MG, cibles tactiles, clavier, contraste et réduction de mouvement.

## Plan d'implémentation et réception

1. Réception du lot de l'autre agent : protéger l'accès privé, corriger les statistiques, cataloguer et valider les règles, connecter Django au moteur et aux snapshots. Tests de paramètres réellement appliqués et présence multi-utilisateur ; ne pas fusionner le commit local sur sa seule description.
2. Architecture des pages : composant GamesCatalog distinct ; HomePage dédiée ; matrice des destinations des actions et des états visiteur/connecté/partie active/aucune activité/panne.
3. Maquette HTML locale bureau/mobile : une proposition cohérente pour chacun des états clés, revue visuelle avant raccordement des données. Utiliser les images existantes ; nouvelle génération seulement si une lacune visuelle le justifie.
4. Implémenter accueil et parcours ; intégrer création et accès privé une fois leur contrat fiable. Charger les données sans bloquer la découverte. Pas de statistiques trompeuses en repli.
5. Recette navigateur réelle : premier visiteur trouve un jeu et rejoint une invitation sans aide ; joueur revient à sa partie ; stats expirent après déconnexion ; règles choisies sont appliquées ; table privée inaccessible sans secret. Vérifier mobile 320/390, bureau, FR/MG et clavier. Mesurer réussite et hésitations auprès de vrais utilisateurs ; les durées et taux de réussite restent inconnus tant que non mesurés.
6. Publication sur branche dédiée, revue du diff, contrôles CI, puis vérification du commit livré. Préserver les autres branches et services.

Priorité recommandée : corriger la fiabilité et l'accès privé avant de faire de l'activité en direct la promesse centrale du nouvel accueil. La maquette de l'accueil peut avancer en parallèle avec des états de données explicitement illustratifs, sans les présenter comme preuve runtime.

## Lot accueil implémenté

Accueil et catalogue séparés dans HomePage/GamesPage ; hero illustré, trois intentions, sélection éditoriale limitée à deux jeux et aide, textes FR/MG. Les actions privées conservent leur destination après authentification ; intention entraînement conservée jusqu'à la page de jeu. Aucun compteur non qualifié ajouté à l'accueil. Le code public d'une table privée n'est plus accepté par la résolution par code ; test de régression ajouté.

Navigation Chromium locale réussie à 1440, 390 et 320 px : accueil distinct, catalogue complet, absence de débordement et destination privée conservée avant authentification. Capture mobile inspectée. Cette vérification ne couvre pas une connexion utilisateur complète ni une reprise de partie. Reprise de session, statistiques moteur fiables et exécution des règles spécifiques restent les lots fonctionnels suivants ; aucun succès sur ces lots n'est revendiqué.

## Suite du lot présence

Suppression du comptage des sièges historiques dans la présence ; heartbeat authentifié depuis les pages visibles ; expiration de 60 secondes conservée. GET des statistiques rendu sans effet d'écriture. Les agrégats de disponibilité excluent les tables privées, les simulations et les tables sans créateur (données de démonstration historiques). `running_tables_verified=false` expose explicitement l'absence de preuve moteur ; le bandeau nomme des tables complètes et non des parties confirmées. Erreur de chargement explicite et timeout de requête.

Attention de validation : le conteneur backend ne monte que media, et utilise son code embarqué. Les tests lancés initialement dedans ne valident pas les modifications du dépôt. Une copie isolée /tmp/casino-presence-qa est utilisée pour tester le code source actuel ; l'API active n'a pas été remplacée. Cette correction retire des faux positifs ; elle ne constitue pas encore une présence WebSocket multi-appareils qualifiée ni une preuve des tables moteur actives.

## Validation source et transmission des délais

Les trois tests backend sur la copie de code source et une base dédiée ont réussi : protection par code privé, contrat de statistiques et expiration de la présence sans sièges historiques. La compilation frontend/PWA a réussi.

Transmission ajoutée de turn_duration dans le ticket signé ; le moteur applique la durée aux prochains tours, refuse une durée contradictoire pour une table déjà configurée et sauvegarde/restaure ce paramètre dans les snapshots. Les tickets anciens sans durée conservent le défaut du moteur. Test Go ajouté pour validation/conflit/restauration ; qualification Go et parcours de jeu réels encore à achever. Les autres options de règles et la reprise de partie ne sont pas déclarées terminées. Identifiants de nouvelles tables rendus aléatoires pour éviter la dérivation depuis count().

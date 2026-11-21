# CasinoMDG — sécurité et conformité (gates obligatoires)

## Configuration production (contrôle automatique statique)

Avant toute livraison : `python3 scripts/production_preflight.py
--env-file .env.production`. Le script est **lecture seule**, refuse les
hôtes/CORS ouverts, les secrets de développement, DEBUG actif, un transport
HTTP non redirigé, l'absence de SMTP lorsque OTP email est actif, ainsi
que l'activation déclarée d'argent réel ou des callbacks sandbox publics.

La commande ne contrôle **ni** le déploiement effectif **ni** les secrets du
coffre, ni le reverse proxy, ni l'authentification MFA dans la vraie
application. Son succès n'est pas une certification de sécurité.

## Activités de jeux d'argent

Le guichet EDBM répertorie les activités de jeux de hasard parmi les
activités réglementées et décrit une procédure administrative :
https://orinasa.edbm.mg/regulatedActivities/

Le texte « Projet de loi 019/2026 » est répertorié comme **projet** :
https://assemblee-nationale.mg/textes/projet-de-loi-n-019-2026-du-02-juin-2026-portant-reglementation-des-activites-liees-aux-jeux-dargent-et-des-etablissements-de-jeux/

La licence applicable, l'autorité actuelle, les conditions de jeux en
ligne, les conditions d'âge, obligations fiscales et KYC/AML **doivent
être confirmées par un juriste à Madagascar** avec les textes consolidés
et un écrit officiel. Aucune autorisation n'a été vérifiée ici.

## Données personnelles

La loi 2014-038 et les procédures CMIL :
https://digital.gov.mg/wp-content/uploads/2025/12/manuel-procedures-cmil-03-dec-2025.pdf

Avant lancement : registre des traitements, bases légales, politique de
confidentialité, rétention, demandes des personnes, classification des
données, contrats des sous-traitants, vérification auprès de la CMIL.
Le statut de déclaration/autorisation reste **non confirmé**.

## Conditions non satisfaites pour argent réel

- Rapprochement des relevés **authentifiés** MVola/Orange Money/Airtel.
- Audit externe API, JWT, WebSocket, injection et contrôles RBAC / IDOR.
- Revue cryptographie, rotation des secrets et sauvegardes restaurées.
- Staging isolé avec parcours de bout en bout documentés, puis recette
  de production avec monitoring, rollback et approbation humaine.

**Aucun contrôle ci-dessus ne doit activer des opérations monétaires réelles.**

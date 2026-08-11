# MDG Game Club — Modèle de revenus et stratégie casino

**Version :** 1.0  
**Date :** 11 août 2026  
**Objet :** définir comment MDG Game Club peut se rémunérer en devenant une plateforme de jeux de table avec commission sur les parties.

> Ce document est une étude de modèle économique, pas un avis juridique. Aucun jeu avec argent réel, dépôt réel ou retrait réel ne doit être activé avant validation locale de la licence, des règles applicables, du KYC/AML et des contrats opérateurs.

## Executive Summary

- **Le modèle principal recommandé est la commission de plateforme sur les parties et les tournois**, avec un taux transparent et plafonné. MDG ne doit pas gagner en manipulant le résultat d’une partie : son revenu vient de l’organisation, du service et de la liquidité.
- **Le modèle Bet261 est surtout un modèle de volume et de distribution** : l’entreprise communique sur les paris, les jeux de hasard, les points de vente, le site web et l’USSD Orange/Telma. [Bet261 Group](https://corporate.bet261.mg/decouvrir-bet261-group/)
- **MDG doit commencer par la simulation**, puis tester la rétention, les parties par joueur et la demande de tournois. Les revenus réels ne deviennent pertinents qu’après autorisation et intégration opérateur.
- **La métrique à piloter sera le NGR**, pas le montant total des mises : `NGR = revenu brut de jeu − bonus − frais de paiement − taxes/redevances − remboursements − fraude`.

## 1. Le modèle de référence : une plateforme qui prend une commission

Pour une table de poker, Belote ou Rami, MDG agit comme l’organisateur du service : hébergement, matchmaking, moteur de jeu, sécurité, support, historique et paiement. La plateforme ne devrait pas prendre la position de la banque contre les joueurs sans validation spécifique.

### 1.1 Commission sur le pot — « rake »

Une fraction du pot est prélevée avant la redistribution du solde aux joueurs.

```text
Pot joué                         100 000 MGA
Commission MDG (exemple 5 %)       5 000 MGA
Montant redistribué                95 000 MGA
```

Le taux ci-dessus est une hypothèse de simulation, pas un tarif recommandé définitif. Le taux réel devra être calculé après prise en compte des taxes, des frais Mobile Money, de la concurrence et du niveau de gain attendu par les joueurs.

Garde-fous recommandés :

- taux affiché avant l’entrée à la table ;
- plafond de commission par pot ;
- aucune commission sur une partie annulée ou invalide ;
- journal public de la main et de la commission ;
- même règle pour tous les joueurs ;
- séparation stricte entre moteur de jeu et calcul financier.

### 1.2 Frais de tournoi

Pour un tournoi, le joueur paie un droit d’entrée composé du prize pool et des frais de plateforme.

```text
Droit d’entrée par joueur       10 000 MGA
Part prize pool                  9 000 MGA
Frais MDG                        1 000 MGA
```

Ce modèle est plus lisible que le rake pour les petits tournois. Il permet aussi de vendre des événements sponsorisés, par exemple un tournoi hebdomadaire financé par une marque.

### 1.3 Abonnement premium

Un abonnement ne doit pas augmenter les chances de gagner. Il peut donner accès à :

- statistiques avancées ;
- historique complet des parties ;
- thèmes et avatars ;
- tables privées améliorées ;
- filtres de matchmaking ;
- tournois communautaires réservés.

L’abonnement peut être lancé avant l’argent réel, à condition que ses avantages restent des fonctionnalités de service et non une mécanique de mise déguisée.

### 1.4 Sponsoring et partenariats

Revenus possibles :

- tournoi sponsorisé ;
- table événementielle ;
- visibilité de marque dans le lobby ;
- partenariat avec une équipe sportive ou un événement culturel ;
- récompenses financées par un partenaire.

Bet261 communique déjà sur des partenariats sportifs et des engagements sociaux à Madagascar, notamment avec la Fédération Malgache de Football. Cela confirme l’intérêt d’un modèle de marque dépassant la simple transaction de pari. [Engagements Bet261](https://corporate.bet261.mg/nos-engagements/)

### 1.5 Offre B2B / white-label

MDG pourrait fournir sa technologie à :

- hôtels et resorts ;
- clubs privés ;
- événements d’entreprise ;
- associations et communautés ;
- opérateurs déjà licenciés.

Le client B2B paierait un abonnement logiciel ou une commission sur l’activité. Ce modèle réduit l’exposition directe au risque réglementaire si le partenaire licencié reste l’opérateur de l’argent réel, sous réserve de validation juridique et contractuelle.

## 2. Les autres modèles du secteur

| Modèle | Source de revenu | Adaptation à MDG | Risque principal |
|---|---|---:|---|
| Rake sur les pots | Pourcentage du pot | Très forte | Classement juridique du jeu et transparence |
| Frais de tournoi | Frais fixe par entrée | Très forte | Prize pool, remboursements, règles promotionnelles |
| Casino contrepartie | Mise moins gains payés | Moyenne | Risque financier, RNG, licence et audit |
| Paris sportifs | Mises moins gains payés | Faible au départ | Cotes, trading, exposition et flux sportifs |
| Abonnement premium | Paiement récurrent | Forte, même en sandbox | Valeur produit à prouver |
| Sponsoring | Marque et événements | Forte | Audience et conformité publicitaire |
| White-label | Licence logicielle | Forte à moyen terme | Support, SLA, responsabilité du partenaire |

### Point de distinction essentiel

Un jeu de table entre joueurs et un casino contrepartie ne présentent pas le même profil économique ni le même risque. Dans le premier cas, MDG organise la table et prélève une commission. Dans le second, MDG devient directement exposé aux résultats des joueurs. Pour un premier lancement, le modèle « plateforme de tables » est plus contrôlable.

## 3. Économie réelle d’une partie

Le montant des mises n’est pas le revenu de MDG.

```text
Revenu brut de jeu
− bonus et promotions
− frais Mobile Money
− taxes et redevances
− remboursements et litiges
− pertes liées à la fraude
− support et opérations
− infrastructure et fournisseurs de jeux
= NGR disponible pour la marge
```

### Exemple purement illustratif

Hypothèses mensuelles, à remplacer par des données réelles après la sandbox :

| Indicateur | Hypothèse |
|---|---:|
| Joueurs actifs mensuels | 5 000 |
| Joueurs payants | 1 000 |
| Mises mensuelles moyennes par joueur payant | 200 000 MGA |
| Volume total des mises | 200 000 000 MGA |
| Commission moyenne | 5 % |
| Revenu brut de jeu | 10 000 000 MGA |
| Coûts, paiements, taxes, bonus et fraude | à mesurer |

Le chiffre de 10 000 000 MGA n’est pas une prévision. C’est un scénario de travail pour comprendre la sensibilité du modèle. Une variation de la commission de 5 % à 3 % ferait passer le revenu brut de 10 000 000 à 6 000 000 MGA à volume identique.

## 4. Ce que Bet261 nous apprend

Bet261 semble avoir construit un avantage d’accès plus qu’un simple avantage d’interface :

- plus de 20 ans de présence revendiquée ;
- réseau de points de vente national ;
- site web et canaux USSD ;
- portefeuille de plusieurs produits ;
- discours de proximité, jeu responsable et engagement social.

La page corporate mentionne plus de 1 100 points de vente et des offres USSD via Orange et Telma. [Présentation Bet261](https://corporate.bet261.mg/decouvrir-bet261-group/)

**Implication pour MDG :** nous ne devons pas essayer de battre Bet261 immédiatement sur la distribution ou la largeur de catalogue. Notre angle de départ doit être une expérience communautaire supérieure : tables privées, amis, chat modéré, classement, tournois, progression et jeux de cartes locaux.

## 5. Modèle recommandé pour MDG

### Phase A — Sandbox et validation produit

Objectif : prouver l’usage sans argent réel.

Revenus possibles :

- sponsoring de tournois ;
- abonnement premium de fonctionnalités ;
- offres B2B pour clubs et événements ;
- partenariats de marque.

Indicateurs à mesurer :

- joueurs actifs quotidiens et mensuels ;
- parties par joueur actif ;
- taux de retour à 1, 7 et 30 jours ;
- taux de remplissage des tables ;
- durée moyenne d’une session ;
- coût d’acquisition ;
- part des joueurs utilisant les tables privées.

### Phase B — Pilote argent réel avec partenaire autorisé

Objectif : tester les dépôts, retraits et commissions dans un environnement juridiquement validé.

Modèle privilégié :

```text
Rake transparent sur les tables
+ frais d’entrée de tournoi
+ sponsoring
```

La première version devrait éviter le casino contrepartie et le sportsbook : ils ajoutent de l’exposition financière, des fournisseurs de données, des obligations de contrôle et une complexité opérationnelle nettement supérieure.

### Phase C — Extension de distribution

Après validation :

- intégration MVola, Orange Money et Airtel Money ;
- support USSD ou canal bas débit ;
- partenaires physiques ;
- offre B2B ;
- tournois sponsorisés nationaux.

La présence d’USSD et de points de vente dans le modèle Bet261 montre que l’accessibilité hors application peut constituer un avantage structurel à Madagascar. [Bet261 Group](https://corporate.bet261.mg/decouvrir-bet261-group/)

## 6. Coûts à ne pas oublier

Avant de parler de marge, le business plan doit intégrer :

- licence et conseil juridique ;
- fiscalité et redevances ;
- frais Mobile Money et rapprochement ;
- KYC/AML et contrôle de fraude ;
- fournisseurs de jeux ou de données ;
- hébergement, CDN et WebSocket ;
- service client et modération ;
- acquisition et affiliation ;
- remboursements et litiges ;
- audit RNG et sécurité ;
- assurance et continuité d’activité.

Le cadre malgache doit être confirmé directement auprès des autorités et de conseils locaux. Le Centre National de Législation publie les textes officiels, mais la présence d’un texte général ne prouve pas que l’autorisation d’un autre opérateur couvre le modèle exact de MDG. [Centre National de Législation](https://cnlegis.gov.mg/)

## 7. Décision recommandée

MDG devrait se positionner comme une **plateforme communautaire de jeux de table**, avec une monétisation progressive :

1. sandbox et preuve de rétention ;
2. abonnement et sponsoring ;
3. partenariat avec un opérateur autorisé ;
4. rake et frais de tournoi transparents ;
5. extension Mobile Money et distribution locale.

Nous ne devrions pas démarrer comme un casino généraliste. Le meilleur premier avantage défendable est la communauté autour des tables, pas la quantité de jeux.

## 8. Questions à trancher avant le business plan financier

- MDG sera-t-il opérateur titulaire ou fournisseur technologique d’un opérateur licencié ?
- Quels jeux sont juridiquement autorisables : poker, Belote, Rami, tournoi, casino contrepartie ?
- Quel taux de commission maximal est acceptable pour les joueurs ?
- Quel montant minimal et maximal par session ?
- Quelle politique de jeu responsable et d’auto-exclusion ?
- Quels opérateurs Mobile Money acceptent le modèle et sous quelles conditions ?
- Quel budget d’acquisition et quel coût de support pouvons-nous financer ?
- Quel partenaire peut fournir une distribution physique ou USSD ?

## Conclusion

Le modèle le plus cohérent pour MDG est une combinaison de **rake sur les tables, frais de tournoi, sponsoring et abonnement premium**, avec un passage à l’argent réel uniquement après validation réglementaire et opérateur. Cette approche reprend l’économie de plateforme recherchée, tout en évitant de prendre trop tôt le risque d’un casino contrepartie ou d’un bookmaker complet.

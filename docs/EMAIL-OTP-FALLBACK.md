# CasinoMDG — Connexion par code email (solution provisoire)

> Développé le 16 novembre 2026. **Aucun fournisseur SMTP n'a été configuré ni testé sur le VPS.**
> Cette fonctionnalité est **désactivée par défaut** (`EMAIL_OTP_ENABLED=False`).
> Elle ne remplace pas une authentification forte ni la recette réelle du staging.

## Ce qui change

- L'adresse `User.email` existait déjà ; les inscriptions historiques par SMS créaient
  une adresse technique `+261…@mdg.local`. Le nouveau champ `email_verified_at`
  signale les **emails effectivement vérifiés** ; `phone_verified_at` distingue
  les comptes dont le numéro a été vérifié via SMS.
- L'écran `/auth` propose **Email** (sélectionné par défaut) ou **SMS**.
  Le parcours email collecte **email réel + numéro de téléphone** afin de
  conserver l'identifiant de compte actuel.
- `POST /api/v1/auth/email/request/` reçoit `{"phone":"034...","email":"contact@example.com"}`
  et renvoie `request_id`, `expires_in=300`, `email_sent=true` si SMTP accepte le message.
  Le téléphone n'est **pas vérifié par email**.
- `POST /api/v1/auth/email/verify/` reçoit `{"request_id":"UUID","code":"123456","display_name":"..."}`.
  Après preuve de possession de l'email, crée le nouveau compte (ou connecte
  celui dont l'email et le téléphone correspondent), marque l'email vérifié
  et délivre les JWT de session existants.
- `POST /api/v1/auth/me/email/request/` puis `/api/v1/auth/me/email/verify/`
  permettent **uniquement à une session déjà authentifiée** d'associer un email
  si le compte n'avait pas encore d'adresse vérifiée.
  Le profil affiche l'adresse persistante et l'état vérifié/non vérifié.
- Le système SMS existant est conservé. Un compte créé via email seul ne peut
  pas être repris automatiquement par une nouvelle vérification SMS tant
  que sa propriété du téléphone n'a pas été établie.

## Configuration SMTP

Renseigner les variables **côté backend uniquement** via un fichier non versionné
(`.env` local, `.env.staging` ou secrets de déploiement) :

```dotenv
EMAIL_OTP_ENABLED=True
EMAIL_HOST=smtp.votre-fournisseur.example
EMAIL_PORT=587
EMAIL_HOST_USER=notifications@votre-domaine.example
EMAIL_HOST_PASSWORD=<mot-de-passe-d-application-ou-identifiant-smtp>
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
DEFAULT_FROM_EMAIL=notifications@votre-domaine.example
```

Ne jamais publier les vrais identifiants dans GitHub, dans les captures ou dans les
logs. Si le fournisseur exige SSL implicite, utiliser son port documenté et
`EMAIL_USE_SSL=True` / `EMAIL_USE_TLS=False`.

**Staging** : préfixer ces noms par `STAGING_` dans `.env.staging`,
puis reconstruire uniquement la stack isolée ; `docker-compose.staging.yml`
transmettra les variables au backend. Une passerelle SMTP doit réellement
être disponible : un serveur sans SMTP configuré renvoie **503**.
Un email accepté par SMTP ne signifie pas automatiquement qu'il est arrivé dans
la boîte du destinataire : vérifier la réception avec une adresse autorisée.

**Développement** : l'email OTP n'est pas exposé en `dev_code` même si
`DEBUG=True`. Les tests Django simulent uniquement l'envoi via mocks, sans
appel à un vrai fournisseur.

## Garde-fous et limites de sécurité

- Challenge lié à un usage (`login` ou `bind`), à son destinataire et à
  `request_id` UUID. Code à six chiffres **haché**, expiration à **5 minutes**,
  **5 tentatives maximum**, usage unique et invalidation du challenge précédent
  après envoi accepté ; limitation par IP et par adresse.
- Si aucun SMTP sécurisé n'est activé, ou si l'envoi échoue : **503**, challenge
  supprimé, aucun secret retourné ni journalisé.
- Impossible de lier un email arbitraire à un numéro déjà rattaché à un autre
  compte. Les comptes historiques `@mdg.local` doivent d'abord associer un
  email depuis une session authentifiée ; **un ancien compte déconnecté sans
  accès SMS ne peut pas se reconnecter automatiquement par email**.
  Une procédure de récupération avec contrôle d'identité est à prévoir.
- Un email **déjà vérifié** ne peut pas être remplacé depuis le simple profil :
  une procédure de changement à authentification renforcée sera nécessaire.
- **Risque résiduel :** la création d'un compte avec email ne vérifie pas la
  possession du numéro saisi. La réservation abusive de numéros doit être traitée
  par une politique d'identité/recouvrement et une future vérification mobile.
- **Important :** le NIST SP 800-63B ne considère pas un code reçu par email
  comme un authentificateur hors bande fort. Tant que ce mode existe, la
  validation métier de l'assurance des comptes, la KYC et les contrôles
  des opérations financières MGA doivent être distincts ; ne pas lever les
  gates de publication #57, #60 ou #66 sur la seule base du fonctionnement SMTP.

## Recette obligatoire

1. Exécuter `python manage.py migrate` sur une **base de staging isolée**.
2. Avec `DEBUG=False` et SMTP absent, confirmer HTTP 503 et aucune fuite de code.
3. Avec SMTP de test, vérifier réception réelle, connexion, expiration, replay,
   mauvais code et limites de débit.
4. Vérifier le rattachement d'un email pour un compte historique **authentifié**.
5. Tester la sécurité des emails en doublon, le cas numéro/email discordants,
   la réouverture d'onglets et la récupération de compte.
6. Contrôler les cas de fraude et de droits MGA avant d'autoriser l'argent réel.
7. Capturer les résultats sur le **commit exact**, et décider GO/NO-GO.

### Références de sécurité

- Django 5.2 SMTP : https://docs.djangoproject.com/en/5.2/topics/email/
- OWASP email validation : https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
- NIST SP 800-63B : https://pages.nist.gov/800-63-4/sp800-63b.html

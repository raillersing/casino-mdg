# Lot P1-03 — Configuration Email / SMS depuis le back-office

Le panneau de configuration apparaît dans `/backoffice` (onglet Opérations).
Il montre l'état **configuré/non configuré** de SMTP et SMS, sans exposer
les noms d'utilisateurs, mots de passe ou secrets.

## État et API

- `GET /api/v1/auth/methods/` : public, renvoie les capacités
  `email`, `sms` (chacune `allowed` / `available`) et
  `default_channel`. Une absence d'email SMTP opérationnel ou de
  passerelle SMS déclarée ne doit pas être présentée comme un canal prêt.
- `GET /api/v1/backoffice/config/auth-methods/` : membre staff authentifié,
  lecture seule des modes, révision, santé de configuration.
- `PATCH /api/v1/backoffice/config/auth-methods/` : uniquement
  super-administrateur actif avec **appareil TOTP confirmé** et un code
  frais ; corps `{"mode":"email|sms|both|none","reason":"...","revision":0,
  "mfa_code":"123456"}`. `revision` est incrémentée atomiquement et
  protège contre les changements simultanés. Une nouvelle décision est
  enregistrée dans `AuditEvent`.
- Les demandes et vérifications de code SMS et email appliquent la
  politique *côté serveur*. La désactivation de canal s'applique aussi
  aux challenges non encore validés et à l'association email depuis le profil.
- Le mode par défaut `both` conserve le comportement antérieur ; le
  fournisseur doit être réellement disponible pour envoyer un code.
  Aucun secret n'est retourné par les endpoints de configuration.

## Mise en service du MFA administrateur

**Attention** : un `is_staff` ou `is_superuser` ne suffit jamais pour
modifier la politique. Un appareil `TOTPDevice` de `django_otp` doit
être enregistré **hors du parcours email OTP**, via un processus
administratif protégé (accès serveur contrôlé ou console d'administration
sécurisée), avec remise du secret uniquement à son propriétaire et
confirmation sur l'appareil. Ne pas mettre de QR, secret TOTP ou code dans
un ticket, log, dépôt Git ou discussion.

1. Provisionner et vérifier l'appareil TOTP du super-administrateur.
2. Démarrer en staging et vérifier `GET /auth/methods/`, les
   restrictions et l'absence de secrets.
3. Changer la politique avec une justification et un code TOTP.
4. Vérifier le refus pour un staff non-superuser, pour un appareil
   non confirmé, un code erroné, un code réutilisé et une révision obsolète.
5. Vérifier que les anciennes demandes d'OTP ne passent plus par un
   canal désactivé et qu'un autre canal actif fonctionne effectivement.
6. Avant un arrêt complet `none`, prévoir une procédure d'accès
   administrateur de secours indépendant des canaux joueurs.

## Limites de cette livraison

Un indicateur `configured` indique une configuration **syntaxiquement
présente**, pas une preuve de remise du message (SMS ou email) dans la
boîte du destinataire. Les vrais tests de livraison sont à réaliser
en staging avec un fournisseur de test.

Ce lot ne constitue pas la totalité de la sécurité back-office :
RBAC fin, session staff à assurance renforcée, politiques de rétention,
alertes et revue des rôles restent dans les lots suivants.

Références :
- Django REST Framework permissions :
  https://www.django-rest-framework.org/api-guide/permissions/
- django-otp TOTP :
  https://django-otp-official.readthedocs.io/en/stable/overview.html
- NIST SP 800-63B (l'email n'est pas un authentificateur hors bande fort) :
  https://pages.nist.gov/800-63-4/sp800-63b.html

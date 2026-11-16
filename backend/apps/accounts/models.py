"""
Models pour l'app accounts.
"""

import uuid

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Un email interne est requis")
        user = self.model(email=self.normalize_email(email), **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Utilisateur personnalisé avec KYC progressif."""

    KYC_LEVELS = [
        ("discovered", _("Découvert")),
        ("light_player", _("Petit joueur")),
        ("verified", _("Vérifié")),
        ("vip", _("VIP")),
    ]

    email = models.EmailField(_("email"), unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    phone = models.CharField(_("téléphone"), max_length=20, unique=True)
    display_name = models.CharField(_("nom affiché"), max_length=50)
    avatar = models.URLField(blank=True)

    kyc_level = models.CharField(
        max_length=20, choices=KYC_LEVELS, default="discovered"
    )
    kyc_verified_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    last_login = models.DateTimeField(null=True, blank=True)

    # 10/10 features
    xp = models.PositiveIntegerField(default=0)
    level = models.PositiveIntegerField(default=1)
    streak_days = models.PositiveIntegerField(default=0)
    last_played_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["display_name"]
    objects = UserManager()

    class Meta:
        db_table = "users"
        verbose_name = _("utilisateur")
        verbose_name_plural = _("utilisateurs")


class UserDevice(models.Model):
    """Device fingerprinting pour sécurité."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="devices")
    device_id = models.CharField(max_length=64)
    device_name = models.CharField(max_length=100)
    fingerprint = models.CharField(max_length=128)
    is_trusted = models.BooleanField(default=False)
    last_used_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_devices"
        unique_together = [["user", "device_id"]]


class OTPChallenge(models.Model):
    """Challenge téléphone à usage unique, stocké sous forme de hash."""

    phone = models.CharField(max_length=20, db_index=True)
    code_hash = models.CharField(max_length=128)
    request_id = models.CharField(max_length=36, unique=True, default=uuid.uuid4)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "otp_challenges"
        ordering = ["-created_at"]


class EmailOTPChallenge(models.Model):
    """Single-use, time-limited challenge bound to a purpose and email address."""

    PURPOSES = [("login", "Connexion"), ("bind", "Associer un email")]

    email = models.EmailField(db_index=True)
    phone = models.CharField(max_length=20, blank=True)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, null=True, blank=True
    )
    purpose = models.CharField(max_length=10, choices=PURPOSES)
    code_hash = models.CharField(max_length=128)
    request_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_otp_challenges"
        ordering = ["-created_at"]

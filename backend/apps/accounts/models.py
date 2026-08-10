"""
Models pour l'app accounts.
"""
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone


class User(AbstractBaseUser, PermissionsMixin):
    """Utilisateur personnalisé avec KYC progressif."""
    
    KYC_LEVELS = [
        ("discovered", _("Découvert")),
        ("light_player", _("Petit joueur")),
        ("verified", _("Vérifié")),
        ("vip", _("VIP")),
    ]
    
    email = models.EmailField(_("email"), unique=True)
    phone = models.CharField(_("téléphone"), max_length=20, blank=True)
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

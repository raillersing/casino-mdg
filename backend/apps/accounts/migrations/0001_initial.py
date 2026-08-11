from django.db import migrations, models
import django.contrib.auth.models
import django.db.models.deletion
import django.utils.timezone
import django.utils.crypto
import apps.accounts.models
import uuid


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
    ]
    operations = [
        migrations.CreateModel(
            name="User",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("password", models.CharField(max_length=128, verbose_name="password")),
                ("last_login", models.DateTimeField(blank=True, null=True, verbose_name="last login")),
                ("is_superuser", models.BooleanField(default=False, help_text="Designates that this user has all permissions without explicitly assigning them.", verbose_name="superuser status")),
                ("email", models.EmailField(max_length=254, unique=True, verbose_name="email")),
                ("phone", models.CharField(max_length=20, unique=True, verbose_name="téléphone")),
                ("display_name", models.CharField(max_length=50, verbose_name="nom affiché")),
                ("avatar", models.URLField(blank=True)),
                ("kyc_level", models.CharField(choices=[("discovered", "Découvert"), ("light_player", "Petit joueur"), ("verified", "Vérifié"), ("vip", "VIP")], default="discovered", max_length=20)),
                ("kyc_verified_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("is_staff", models.BooleanField(default=False)),
                ("date_joined", models.DateTimeField(default=django.utils.timezone.now)),
                ("xp", models.PositiveIntegerField(default=0)),
                ("level", models.PositiveIntegerField(default=1)),
                ("streak_days", models.PositiveIntegerField(default=0)),
                ("last_played_at", models.DateTimeField(blank=True, null=True)),
                ("groups", models.ManyToManyField(blank=True, help_text="The groups this user belongs to. A user will get all permissions granted to each of their groups.", related_name="user_set", related_query_name="user", to="auth.group", verbose_name="groups")),
                ("user_permissions", models.ManyToManyField(blank=True, help_text="Specific permissions for this user.", related_name="user_set", related_query_name="user", to="auth.permission", verbose_name="user permissions")),
            ],
            options={"db_table": "users", "verbose_name": "utilisateur", "verbose_name_plural": "utilisateurs"},
            managers=[("objects", apps.accounts.models.UserManager())],
        ),
        migrations.CreateModel(
            name="OTPChallenge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("phone", models.CharField(db_index=True, max_length=20)),
                ("code_hash", models.CharField(max_length=128)),
                ("request_id", models.CharField(default=uuid.uuid4, max_length=36, unique=True)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("expires_at", models.DateTimeField()),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "otp_challenges", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="UserDevice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("device_id", models.CharField(max_length=64)),
                ("device_name", models.CharField(max_length=100)),
                ("fingerprint", models.CharField(max_length=128)),
                ("is_trusted", models.BooleanField(default=False)),
                ("last_used_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="devices", to="accounts.user")),
            ],
            options={"db_table": "user_devices", "unique_together": {("user", "device_id")}},
        ),
    ]

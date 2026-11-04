# Generated for table specifics, turn duration, stakes, rules and access code

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("games", "0011_alter_gametable_game_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="gametable",
            name="stake_amount",
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="gametable",
            name="turn_duration",
            field=models.PositiveSmallIntegerField(default=15),
        ),
        migrations.AddField(
            model_name="gametable",
            name="access_code",
            field=models.CharField(
                blank=True, db_index=True, max_length=8, null=True, unique=True
            ),
        ),
        migrations.AddField(
            model_name="gametable",
            name="rules_config",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

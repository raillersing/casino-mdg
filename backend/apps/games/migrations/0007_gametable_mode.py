from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("games", "0006_gametable_club")]

    operations = [
        migrations.AddField(
            model_name="gametable",
            name="mode",
            field=models.CharField(
                choices=[
                    ("SIMULATION_SOLO", "Simulation solo"),
                    ("DEMO_AI", "Démonstration IA"),
                    ("HUMAN_MATCH", "Partie humaine"),
                    ("REAL_MONEY", "Argent réel"),
                ],
                default="HUMAN_MATCH",
                max_length=24,
            ),
        ),
    ]

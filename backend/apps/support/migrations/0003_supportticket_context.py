from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("support", "0002_pilotfeedback")]

    operations = [
        migrations.AddField(
            model_name="supportticket",
            name="game_type",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="supportticket",
            name="table_id",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="supportticket",
            name="session_id",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="supportticket",
            name="app_version",
            field=models.CharField(blank=True, max_length=40),
        ),
    ]

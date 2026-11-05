from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("games", "0013_humangameactivity")]
    operations = [
        migrations.AddField(
            model_name="matchmakingticket",
            name="target_players",
            field=models.PositiveSmallIntegerField(default=2),
        )
    ]

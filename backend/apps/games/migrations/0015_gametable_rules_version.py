from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("games", "0014_matchmakingticket_target_players")]
    operations = [
        migrations.AddField(
            model_name="gametable",
            name="rules_version",
            field=models.PositiveSmallIntegerField(default=0),
        )
    ]

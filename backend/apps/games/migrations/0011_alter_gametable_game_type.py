# Generated for Ludo and Domino additions

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("games", "0010_tournament_tournamentparticipant"),
    ]

    operations = [
        migrations.AlterField(
            model_name="gametable",
            name="game_type",
            field=models.CharField(
                choices=[
                    ("poker", "Poker"),
                    ("belote", "Belote"),
                    ("rami", "Rami"),
                    ("ludo", "Ludo"),
                    ("domino", "Domino"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="botsimulationsession",
            name="game_type",
            field=models.CharField(
                choices=[
                    ("poker", "Poker"),
                    ("belote", "Belote"),
                    ("rami", "Rami"),
                    ("ludo", "Ludo"),
                    ("domino", "Domino"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="matchmakingticket",
            name="game_type",
            field=models.CharField(
                choices=[
                    ("poker", "Poker"),
                    ("belote", "Belote"),
                    ("rami", "Rami"),
                    ("ludo", "Ludo"),
                    ("domino", "Domino"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="gameresult",
            name="game_type",
            field=models.CharField(
                choices=[
                    ("poker", "Poker"),
                    ("belote", "Belote"),
                    ("rami", "Rami"),
                    ("ludo", "Ludo"),
                    ("domino", "Domino"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="tournament",
            name="game_type",
            field=models.CharField(
                choices=[
                    ("poker", "Poker"),
                    ("belote", "Belote"),
                    ("rami", "Rami"),
                    ("ludo", "Ludo"),
                    ("domino", "Domino"),
                ],
                default="poker",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="playerpresence",
            name="game_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("poker", "Poker"),
                    ("belote", "Belote"),
                    ("rami", "Rami"),
                    ("ludo", "Ludo"),
                    ("domino", "Domino"),
                ],
                max_length=20,
                null=True,
            ),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_user_email_verified_emailotp"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="token_version",
            field=models.PositiveIntegerField(default=0),
        ),
    ]

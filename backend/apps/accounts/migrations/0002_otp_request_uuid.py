import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [migrations.AlterField(model_name="otpchallenge", name="request_id", field=models.CharField(default=uuid.uuid4, max_length=36, unique=True))]

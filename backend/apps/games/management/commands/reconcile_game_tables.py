import json

import requests
from django.core.management.base import BaseCommand, CommandError

from apps.games.lifecycle import reconcile_tables


class Command(BaseCommand):
    help = "Expire les tables orphelines après confirmation du moteur."

    def handle(self, *args, **options):
        try:
            result = reconcile_tables()
        except (requests.RequestException, ValueError) as exc:
            raise CommandError("Moteur indisponible : aucune table modifiée.") from exc
        self.stdout.write(json.dumps(result))

"""Provision known back-office role groups without assigning them to users."""

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from apps.backoffice.rbac import ROLE_CAPABILITIES


class Command(BaseCommand):
    help = "Provisionne les groupes RBAC CasinoMDG (sans attribuer des droits à des comptes)."

    def handle(self, *args, **options):
        for name in sorted(ROLE_CAPABILITIES):
            group, created = Group.objects.get_or_create(name=name)
            self.stdout.write(f"{'Créé' if created else 'Existant'} : {group.name}")

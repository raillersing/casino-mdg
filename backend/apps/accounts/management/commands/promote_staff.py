from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = (
        "Promeut un utilisateur en Administrateur / Staff pour accéder au Back-office."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "identifier",
            nargs="?",
            type=str,
            help="Numéro de téléphone (+261...), email ou nom d'affichage de l'utilisateur",
        )
        parser.add_argument(
            "--superuser",
            action="store_true",
            default=True,
            help="Accorde également les privilèges superuser",
        )
        parser.add_argument(
            "--demote",
            action="store_true",
            help="Retire les droits staff/admin de l'utilisateur",
        )
        parser.add_argument(
            "--list",
            action="store_true",
            help="Liste les utilisateurs actuels et leurs statuts admin",
        )
        parser.add_argument(
            "--create",
            action="store_true",
            default=True,
            help="Crée le compte s'il n'existe pas encore",
        )

    def handle(self, *args, **options):
        if options.get("list") or not options.get("identifier"):
            users = User.objects.all().order_by("-date_joined")[:20]
            self.stdout.write(self.style.NOTICE("=== UTILISATEURS DU SYSTÈME ==="))
            for u in users:
                status = "ADMIN (Staff)" if u.is_staff else "Joueur"
                self.stdout.write(
                    f"ID: {u.id} | Téléphone: {u.phone} | Nom: {u.display_name} | Rôle: {status}"
                )
            if not options.get("identifier"):
                self.stdout.write(
                    self.style.WARNING(
                        "\nUsage: python manage.py promote_staff <téléphone_ou_nom>"
                    )
                )
                return

        identifier = options["identifier"].strip()
        user = (
            User.objects.filter(phone=identifier).first()
            or User.objects.filter(email__iexact=identifier).first()
            or User.objects.filter(display_name__iexact=identifier).first()
        )

        if not user:
            # Recherche partielle si non trouvé exactement
            user = User.objects.filter(phone__icontains=identifier).first()

        if not user:
            # Recherche avec normalisation du numéro malgache (+261...)
            from apps.accounts.views import normalize_phone

            try:
                norm = normalize_phone(identifier)
                user = User.objects.filter(phone=norm).first()
            except Exception:
                norm = None

        if not user:
            # Création automatique du compte s'il n'existe pas encore
            from apps.accounts.views import normalize_phone

            try:
                phone_val = normalize_phone(identifier)
            except Exception:
                phone_val = identifier

            user = User.objects.create(
                phone=phone_val,
                email=f"{phone_val.replace('+', '')}@mdg.local",
                display_name="Administrateur",
                is_staff=True,
                is_superuser=True,
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nNouveau compte créé et promu ADMIN / STAFF avec succès :\n"
                    f"ID: {user.id} | Téléphone: {user.phone} | Nom: {user.display_name}\n"
                    "Vous pouvez vous connecter avec ce numéro sur le site "
                    "pour accéder au Back-office (/backoffice)."
                )
            )
            return

        if options.get("demote"):
            user.is_staff = False
            user.is_superuser = False
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Droits admin retirés pour {user.display_name} ({user.phone})."
                )
            )
            return

        user.is_staff = True
        if options.get("superuser"):
            user.is_superuser = True
        user.save()

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSuccès ! L'utilisateur {user.display_name} ({user.phone}) "
                "est désormais ADMIN / STAFF.\n"
                f"Il peut accéder au Back-office via l'URL : /backoffice"
            )
        )

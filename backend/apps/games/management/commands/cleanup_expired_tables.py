from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.games.models import BotSimulationSession, GameTable
from apps.games.modes import DEMO_AI


class Command(BaseCommand):
    help = "Nettoie et expire les tables fantômes, de démonstration, abandonnées ou terminées."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-all",
            action="store_true",
            help=(
                "Ferme toutes les tables existantes sans exception "
                "(remise à zéro propre du lobby)."
            ),
        )
        parser.add_argument(
            "--delete-closed",
            action="store_true",
            help="Supprime définitivement de la base les tables fermées ayant 0 joueurs.",
        )

    def handle(self, *args, **options):
        force_all = options["force_all"]
        delete_closed = options["delete_closed"]
        now = timezone.now()

        waiting_cutoff = now - timedelta(minutes=15)
        running_cutoff = now - timedelta(minutes=20)
        empty_cutoff = now - timedelta(seconds=60)

        demo_codes = [
            "emerald-01",
            "baobab-01",
            "vanilla-01",
            "ludo-mada-01",
            "domino-gasikara-01",
            "ocean-01",
        ]

        with transaction.atomic():
            if force_all:
                closed_count = GameTable.objects.exclude(status="finished").update(
                    status="finished"
                )
                BotSimulationSession.objects.filter(
                    status__in={"queued", "running"}
                ).update(status="completed", completed_at=now)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Toutes les tables ({closed_count}) ont été passées en statut 'finished'."
                    )
                )
            else:
                # 1. Fermer les tables demo et tables sans créateur
                uncreated = GameTable.objects.exclude(status="finished").filter(
                    Q(created_by__isnull=True) | Q(table_code__in=demo_codes)
                )
                c_uncreated = uncreated.update(status="finished")

                # 2. Fermer les simulations de bot terminées ou anciennes
                bot_tables = GameTable.objects.exclude(status="finished").filter(
                    mode=DEMO_AI, updated_at__lt=waiting_cutoff
                )
                c_bots = bot_tables.update(status="finished")
                BotSimulationSession.objects.filter(
                    status__in={"queued", "running"}, created_at__lt=waiting_cutoff
                ).update(status="completed", completed_at=now)

                # 3. Fermer les tables vides (0 joueurs) de plus de 60 secondes
                empty_pks = list(
                    GameTable.objects.exclude(status="finished")
                    .filter(seats__isnull=True, updated_at__lt=empty_cutoff)
                    .values_list("pk", flat=True)
                )
                c_empty = 0
                if empty_pks:
                    c_empty = GameTable.objects.filter(pk__in=empty_pks).update(
                        status="finished"
                    )

                # 4. Fermer les tables en attente dépassées (> 15 min sans activité)
                stale_open = GameTable.objects.filter(
                    status="open", updated_at__lt=waiting_cutoff
                )
                c_open = stale_open.update(status="finished")

                # 5. Fermer les tables en cours dépassées (> 20 min sans activité)
                stale_running = GameTable.objects.filter(
                    status="running", updated_at__lt=running_cutoff
                )
                c_running = stale_running.update(status="finished")

                total_closed = c_uncreated + c_bots + c_empty + c_open + c_running
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Nettoyage réussi : {total_closed} tables expirées/fermées "
                        f"(démo/sans créateur: {c_uncreated}, bots: {c_bots}, "
                        f"vides: {c_empty}, en attente >15m: {c_open}, en cours >20m: {c_running})."
                    )
                )

            # Suppression totale de toutes les tables terminées/fermées
            # L'effacement doit être demandé explicitement et ne doit pas
            # supprimer des preuves financières ou des joueurs encore assis.
            if delete_closed:
                # No financial audit history or active seats may be cascaded.
                eligible = GameTable.objects.filter(
                    status="finished",
                    seats__isnull=True,
                    bankrolls__isnull=True,
                )
                del_count, _ = eligible.delete()
                if del_count > 0:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Suppression de {del_count} tables fermées et vides."
                        )
                    )

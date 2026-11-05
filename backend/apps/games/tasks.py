from celery import shared_task

from .lifecycle import reconcile_tables


@shared_task
def reconcile_game_tables():
    return reconcile_tables()

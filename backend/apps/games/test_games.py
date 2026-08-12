import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.wallet.services import debit_simulation_entry, settle_game_win

from .models import (
    DrawDefinition,
    DrawEntry,
    DrawResult,
    InstantGameDefinition,
    InstantPlay,
)

INSTANT_CATALOG = [
    {
        "slug": "coffre-mada",
        "name": "Coffre Mada",
        "game_type": "scratch",
        "version": "coffre-mada-v1",
        "cost": 100,
        "max_prize": 500,
        "rules": {
            "cells": 9,
            "symbols": ["baobab", "vanille", "zebu"],
            "probabilities": {"no_prize": 70, "small": 20, "medium": 8, "jackpot": 2},
        },
    },
    {
        "slug": "roue-mdg",
        "name": "Roue MDG",
        "game_type": "wheel",
        "version": "roue-mdg-v1",
        "cost": 0,
        "max_prize": 250,
        "rules": {
            "daily_limit": 1,
            "segments": [
                {"label": "Pause", "prize": 0, "weight": 55},
                {"label": "+50 SIM", "prize": 50, "weight": 30},
                {"label": "+100 SIM", "prize": 100, "weight": 12},
                {"label": "+250 SIM", "prize": 250, "weight": 3},
            ],
        },
    },
]


def ensure_test_catalog():
    for definition in INSTANT_CATALOG:
        InstantGameDefinition.objects.get_or_create(
            slug=definition["slug"], defaults=definition
        )
    now = timezone.now()
    draw_defaults = [
        {
            "slug": "tirage-3-chiffres",
            "name": "Tirage 3 chiffres",
            "draw_type": "three_digits",
            "version": "tirage-3-v1",
            "entry_cost": 50,
            "closes_at": now + timedelta(hours=8),
            "rules": {
                "digits": 3,
                "min": 0,
                "max": 9,
                "prize_tiers": [{"match": 3, "prize": 500}],
            },
        },
        {
            "slug": "jackpot-mdg",
            "name": "Jackpot MDG",
            "draw_type": "five_numbers",
            "version": "jackpot-mdg-v1",
            "entry_cost": 100,
            "closes_at": now + timedelta(days=5),
            "rules": {
                "numbers": 5,
                "min": 1,
                "max": 35,
                "prize_tiers": [
                    {"match": 5, "prize": 5000},
                    {"match": 4, "prize": 500},
                ],
            },
        },
    ]
    for draw in draw_defaults:
        DrawDefinition.objects.get_or_create(slug=draw["slug"], defaults=draw)


def _weighted_choice(items):
    total = sum(item["weight"] for item in items)
    cursor = secrets.randbelow(total)
    for item in items:
        cursor -= item["weight"]
        if cursor < 0:
            return item
    return items[-1]


def play_instant(user, game, idempotency_key):
    existing = (
        InstantPlay.objects.select_related("transaction", "game")
        .filter(idempotency_key=idempotency_key)
        .first()
    )
    if existing:
        if existing.user_id != user.id:
            raise ValueError("Cette participation appartient déjà à un autre joueur.")
        return existing, False
    with transaction.atomic():
        cost = game.cost
        transaction_entry = None
        if cost:
            transaction_entry, _ = debit_simulation_entry(
                user,
                f"instant-cost:{idempotency_key}",
                cost,
                f"Participation {game.name}",
                {"game": game.slug},
            )
        if game.game_type == "wheel":
            outcome = _weighted_choice(game.rules["segments"])
            result_kind = "wheel_segment"
            result_label = outcome["label"]
            prize = outcome["prize"]
        else:
            outcome = _weighted_choice(
                [
                    {"label": "Pas de gain", "prize": 0, "weight": 70},
                    {"label": "Petit symbole", "prize": 50, "weight": 20},
                    {"label": "Double symbole", "prize": 150, "weight": 8},
                    {"label": "Coffre rare", "prize": 500, "weight": 2},
                ]
            )
            result_kind = "symbol_match"
            result_label = outcome["label"]
            prize = outcome["prize"]
        if prize:
            reward_key = hashlib.sha256(idempotency_key.encode()).hexdigest()[:32]
            reward, _ = settle_game_win(
                user,
                reward_key,
                game.slug,
                prize,
                {"source": "test-games", "version": game.version},
            )
        else:
            reward = None
        commitment = hashlib.sha256(
            f"{user.pk}:{idempotency_key}:{game.version}".encode()
        ).hexdigest()
        play = InstantPlay.objects.create(
            user=user,
            game=game,
            idempotency_key=idempotency_key,
            status="completed",
            result_kind=result_kind,
            result_label=result_label,
            cost=cost,
            prize=prize,
            transaction=reward,
            audit={
                "commitment": commitment,
                "proof_available": True,
                "version": game.version,
            },
        )
    return play, True


@transaction.atomic
def create_draw_entry(user, draw, numbers, idempotency_key):
    existing = (
        DrawEntry.objects.select_related("draw", "transaction")
        .filter(idempotency_key=idempotency_key)
        .first()
    )
    if existing:
        if existing.user_id != user.id:
            raise ValueError("Cette entrée appartient déjà à un autre joueur.")
        return existing, False
    draw = DrawDefinition.objects.select_for_update().get(pk=draw.pk)
    if draw.status != "open" or draw.closes_at <= timezone.now():
        if draw.status == "open":
            draw.status = "closed"
            draw.save(update_fields=["status", "updated_at"])
        raise ValueError("Ce tirage est clôturé.")
    if draw.draw_type == "three_digits" and (
        len(numbers) != 3 or any(number < 0 or number > 9 for number in numbers)
    ):
        raise ValueError("Le tirage attend trois chiffres entre 0 et 9.")
    if draw.draw_type == "five_numbers" and (
        len(numbers) != 5
        or len(set(numbers)) != 5
        or any(number < 1 or number > 35 for number in numbers)
    ):
        raise ValueError("Le jackpot attend cinq numéros distincts entre 1 et 35.")
    entry_tx, _ = debit_simulation_entry(
        user,
        f"draw-cost:{idempotency_key}",
        draw.entry_cost,
        f"Entrée {draw.name}",
        {"draw": draw.slug},
    )
    return (
        DrawEntry.objects.create(
            draw=draw,
            user=user,
            idempotency_key=idempotency_key,
            numbers=numbers,
            transaction=entry_tx,
        ),
        True,
    )


@transaction.atomic
def draw_now(draw):
    draw = DrawDefinition.objects.select_for_update().get(pk=draw.pk)
    if hasattr(draw, "result"):
        return draw.result, False
    if draw.status == "cancelled":
        raise ValueError("Ce tirage est annulé.")
    if draw.status == "open":
        draw.status = "closed"
        draw.save(update_fields=["status", "updated_at"])
    if draw.draw_type == "three_digits":
        numbers = [secrets.randbelow(10) for _ in range(3)]
    else:
        numbers = secrets.SystemRandom().sample(range(1, 36), 5)
    commitment = hashlib.sha256(
        f"{draw.slug}:{draw.version}:{draw.closes_at.isoformat()}".encode()
    ).hexdigest()
    result = DrawResult.objects.create(
        draw=draw,
        numbers=numbers,
        commitment=commitment,
        proof={"algorithm": "server-csprng", "published": True},
    )
    draw.status = "drawn"
    draw.save(update_fields=["status", "updated_at"])
    return result, True

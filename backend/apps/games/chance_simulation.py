import random
from collections import Counter
from math import sqrt

MAX_ROUNDS = 100_000


def _weighted_choice(items, rng):
    total = sum(int(item["weight"]) for item in items)
    cursor = rng.randrange(total)
    for item in items:
        cursor -= int(item["weight"])
        if cursor < 0:
            return item
    return items[-1]


def _control(expected_rtp, prizes, cost):
    if expected_rtp is None or not prizes:
        return {
            "expected_rtp": None,
            "observed_rtp": None,
            "confidence_low": None,
            "confidence_high": None,
            "anomaly": False,
        }
    observed_rtp = sum(prizes) / (len(prizes) * cost)
    mean_prize = sum(prizes) / len(prizes)
    variance = sum((prize - mean_prize) ** 2 for prize in prizes) / len(prizes)
    standard_error = sqrt(variance / len(prizes)) / cost
    low = max(0, observed_rtp - 3 * standard_error)
    high = observed_rtp + 3 * standard_error
    return {
        "expected_rtp": round(expected_rtp, 6),
        "observed_rtp": round(observed_rtp, 6),
        "confidence_low": round(low, 6),
        "confidence_high": round(high, 6),
        "anomaly": not (low <= expected_rtp <= high),
    }


def simulate_instant(game, rounds, seed):
    rng = random.Random(seed)
    if game.game_type == "wheel":
        outcomes = game.rules.get("segments", [])
    else:
        probabilities = game.rules.get("probabilities", {})
        outcomes = [
            {
                "label": "Pas de gain",
                "prize": 0,
                "weight": probabilities.get("no_prize", 0),
            },
            {
                "label": "Petit symbole",
                "prize": 50,
                "weight": probabilities.get("small", 0),
            },
            {
                "label": "Double symbole",
                "prize": 150,
                "weight": probabilities.get("medium", 0),
            },
            {
                "label": "Coffre rare",
                "prize": 500,
                "weight": probabilities.get("jackpot", 0),
            },
        ]
    if not outcomes or sum(int(item["weight"]) for item in outcomes) <= 0:
        raise ValueError("La configuration du jeu ne contient aucun poids valide.")
    expected_prize = sum(item["prize"] * item["weight"] for item in outcomes) / sum(
        item["weight"] for item in outcomes
    )
    expected_rtp = expected_prize / game.cost if game.cost else None
    counts = Counter()
    prizes = []
    for _ in range(rounds):
        outcome = _weighted_choice(outcomes, rng)
        counts[outcome["label"]] += 1
        prizes.append(int(outcome["prize"]))
    return {
        "kind": "instant",
        "slug": game.slug,
        "version": game.version,
        "rounds": rounds,
        "seed": seed,
        "cost_per_round": game.cost,
        "total_cost": game.cost * rounds,
        "total_prize": sum(prizes),
        "outcomes": {
            label: {"count": count, "rate": round(count / rounds, 6)}
            for label, count in sorted(counts.items())
        },
        "control": _control(expected_rtp, prizes, game.cost),
    }


def simulate_draw(draw, rounds, seed):
    rng = random.Random(seed)
    frequencies = Counter()
    if draw.draw_type == "three_digits":
        for _ in range(rounds):
            numbers = [rng.randrange(10) for _ in range(3)]
            frequencies["".join(map(str, numbers))] += 1
        sample_space = 1000
    else:
        for _ in range(rounds):
            numbers = rng.sample(range(1, 36), 5)
            for number in numbers:
                frequencies[str(number)] += 1
        sample_space = 35
    expected_rate = 1 / sample_space
    expected_count = rounds * expected_rate
    max_deviation = max(
        abs(count - expected_count) / max(expected_count, 1)
        for count in frequencies.values()
    )
    return {
        "kind": "draw",
        "slug": draw.slug,
        "version": draw.version,
        "rounds": rounds,
        "seed": seed,
        "entry_cost": draw.entry_cost,
        "total_cost": draw.entry_cost * rounds,
        "frequencies": dict(sorted(frequencies.items())),
        "control": {
            "expected_rate": round(expected_rate, 6),
            "max_relative_deviation": round(max_deviation, 6),
            "anomaly": max_deviation > 0.35 if rounds >= 1000 else False,
        },
    }

"""Only options implemented by the game engine are advertised and accepted."""

CAPABILITIES = {
    "belote": {
        "players": [4],
        "rules": {"target_score": [501, 1001, 1501]},
        "defaults": {"target_score": 1001},
        "summary": "4 joueurs, 2 équipes, annonces et atouts.",
        "summary_mg": "Mpilalao 4, ekipa 2, fanambarana sy atout.",
    },
    "poker": {
        "players": [2, 6, 9],
        "rules": {"small_blind": [25, 50, 100, 200]},
        "defaults": {"small_blind": 50},
        "summary": "Texas Hold’em : tapis choisi en MGA ou entraînement gratuit en SIM.",
        "summary_mg": "Texas Hold’em, jetona 10 000 amin’ny voalohany, blind tsy miova.",
    },
    "ludo": {
        "players": [2, 3, 4],
        "rules": {},
        "defaults": {},
        "summary": "4 pions par joueur, sortie sur 6, capture classique.",
        "summary_mg": "Piona 4 isaky ny mpilalao, mivoaka amin’ny 6, fisamborana mahazatra.",
    },
    "domino": {
        "players": [2, 3, 4],
        "rules": {},
        "defaults": {},
        "summary": "Double-six avec pioche ; une manche.",
        "summary_mg": "Double-six misy fisarihana ; fihodinana iray.",
    },
    "rami": {
        "summary_mg": "Karatra 7, misintona sy manary, famaranana knock/gin ; fihodinana iray.",
        "players": [2, 3, 4],
        "rules": {},
        "defaults": {},
        "summary": (
            "Variante actuelle : 7 cartes, pioche/défausse"
            ", fermeture knock/gin ; une manche."
        ),
    },
}


def validate_table_settings(game, players, duration, rules, stake):
    capabilities = CAPABILITIES[game]
    if isinstance(players, bool) or players not in capabilities["players"]:
        raise ValueError("Nombre de joueurs incompatible avec ce jeu.")
    if isinstance(duration, bool) or duration not in [10, 15, 30, 60, 90, 120]:
        raise ValueError("Durée de tour non prise en charge.")
    if (
        not isinstance(stake, int)
        or isinstance(stake, bool)
        or not 0 <= stake <= 2**53 - 1
    ):
        raise ValueError(
            "Le minimum de participation doit être un montant positif ou nul en Ariary."
        )
    if not isinstance(rules, dict) or set(rules) - set(capabilities["rules"]):
        raise ValueError("Cette variante de règles n’est pas prise en charge.")
    result = dict(capabilities["defaults"])
    for key, value in rules.items():
        if (
            not isinstance(value, int)
            or isinstance(value, bool)
            or value not in capabilities["rules"][key]
        ):
            raise ValueError("Valeur de règle invalide.")
        result[key] = value
    return result

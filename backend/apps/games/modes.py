"""Modes de jeu partagés par les contrats API et les simulations."""

SIMULATION_SOLO = "SIMULATION_SOLO"
DEMO_AI = "DEMO_AI"
HUMAN_MATCH = "HUMAN_MATCH"
REAL_MONEY = "REAL_MONEY"

GAME_MODES = (
    (SIMULATION_SOLO, "Simulation solo"),
    (DEMO_AI, "Démonstration IA"),
    (HUMAN_MATCH, "Partie humaine"),
    (REAL_MONEY, "Argent réel"),
)

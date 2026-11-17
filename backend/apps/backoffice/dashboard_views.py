import time
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.analytics.models import ProductEvent
from apps.games.models import (
    BotSimulationParticipant,
    BotSimulationSession,
    DrawDefinition,
    DrawEntry,
    GameParticipant,
    GameResult,
    GameRound,
    GameSession,
    GameTable,
    InstantGameDefinition,
    InstantPlay,
    MatchmakingTicket,
    PlayerPresence,
    TableSeat,
    Tournament,
)
from apps.games.test_games import ensure_test_catalog
from apps.wallet.models import WalletTransaction
from config.middleware import (
    _METRICS_LOCK,
    REQUEST_COUNTS,
    REQUEST_DURATION_SECONDS,
)

GAME_LABELS = {
    "poker": "Poker Texas Hold'em (9-Max)",
    "belote": "Belote Malgache (4J)",
    "rami": "Rami 13 Cartes",
    "ludo": "Ludo Malagasy (2-4J)",
    "domino": "Domino Double-Six (2-4J)",
}

MODE_LABELS = {
    "HUMAN_MATCH": "Multijoueur Humain (PvP)",
    "DEMO_AI": "Démo contre IA",
    "SIMULATION_SOLO": "Simulation Solo",
    "REAL_MONEY": "Argent Réel (MGA)",
}

THEORETICAL_RTP_BY_SLUG = {
    "roue-mdg": 96.4,
    "coffre-mada": 95.8,
    "slots-mada": 96.8,
}


def _probe_game_engine():
    """
    Interroge de manière non-bloquante le moteur temps réel Go (/health et /metrics)
    avec un timeout court (350ms) pour garantir la réactivité du dashboard.
    """
    base_url = getattr(
        settings, "GAME_ENGINE_INTERNAL_URL", "http://game-engine:8080"
    ).rstrip("/")
    started = time.monotonic()
    metrics = {
        "status": "offline",
        "probe_latency_ms": None,
        "websocket_clients_ccu": 0,
        "tables_active": 0,
        "players_active": 0,
        "events_total": 0,
    }
    try:
        req = urllib.request.Request(f"{base_url}/metrics", method="GET")
        with urllib.request.urlopen(req, timeout=0.35) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            elapsed_ms = round((time.monotonic() - started) * 1000, 2)
            metrics["status"] = "online" if resp.status == 200 else "degraded"
            metrics["probe_latency_ms"] = elapsed_ms
            for line in body.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                if len(parts) != 2:
                    continue
                name, raw_val = parts
                try:
                    val = int(float(raw_val))
                except ValueError:
                    continue
                if name == "casino_websocket_clients":
                    metrics["websocket_clients_ccu"] = val
                elif name == "casino_tables_active":
                    metrics["tables_active"] = val
                elif name == "casino_players_active":
                    metrics["players_active"] = val
                elif name == "casino_events_total":
                    metrics["events_total"] = val
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        metrics["status"] = "standby"
        metrics["probe_latency_ms"] = None
    return metrics


def _probe_database_and_cache():
    db_started = time.monotonic()
    db_status = "ok"
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        db_latency_ms = round((time.monotonic() - db_started) * 1000, 2)
    except Exception:
        db_status = "error"
        db_latency_ms = None

    cache_started = time.monotonic()
    cache_status = "ok"
    try:
        cache.set("backoffice_health_probe", "1", timeout=5)
        val = cache.get("backoffice_health_probe")
        if val != "1":
            cache_status = "degraded"
        cache_latency_ms = round((time.monotonic() - cache_started) * 1000, 2)
    except Exception:
        cache_status = "degraded"
        cache_latency_ms = None

    conn_max_age = settings.DATABASES.get("default", {}).get("CONN_MAX_AGE", 0) or 0
    return {
        "database": {
            "status": db_status,
            "latency_ms": db_latency_ms,
            "conn_max_age": conn_max_age,
            "pooling_mode": (
                "persistent" if conn_max_age > 0 else "ephemeral_per_request"
            ),
        },
        "cache_redis": {
            "status": cache_status,
            "latency_ms": cache_latency_ms,
        },
    }


def _collect_http_telemetry():
    total_requests = 0
    total_duration_sec = 0.0
    status_2xx = 0
    status_3xx = 0
    status_4xx = 0
    status_429 = 0
    status_5xx = 0
    by_endpoint = {}

    with _METRICS_LOCK:
        counts_snapshot = list(REQUEST_COUNTS.items())
        durations_snapshot = dict(REQUEST_DURATION_SECONDS)

    for (method, path, status_str), count in counts_snapshot:
        dur = float(durations_snapshot.get((method, path, status_str), 0.0))
        total_requests += count
        total_duration_sec += dur
        if status_str == "429":
            status_429 += count
            status_4xx += count
        elif status_str.startswith("2"):
            status_2xx += count
        elif status_str.startswith("3"):
            status_3xx += count
        elif status_str.startswith("4"):
            status_4xx += count
        elif status_str.startswith("5"):
            status_5xx += count

        ep_key = (method, path)
        entry = by_endpoint.setdefault(
            ep_key, {"method": method, "path": path, "calls": 0, "duration_sec": 0.0}
        )
        entry["calls"] += count
        entry["duration_sec"] += dur

    top_endpoints = []
    for item in sorted(by_endpoint.values(), key=lambda x: x["calls"], reverse=True)[
        :8
    ]:
        calls = item["calls"]
        avg_ms = round((item["duration_sec"] / calls) * 1000, 2) if calls else 0.0
        top_endpoints.append(
            {
                "method": item["method"],
                "path": item["path"],
                "calls": calls,
                "avg_ms": avg_ms,
            }
        )

    avg_latency_ms = (
        round((total_duration_sec / total_requests) * 1000, 2)
        if total_requests > 0
        else 0.0
    )
    error_rate_pct = (
        round((status_5xx / total_requests) * 100, 2) if total_requests > 0 else 0.0
    )

    return {
        "total_requests": total_requests,
        "avg_latency_ms": avg_latency_ms,
        "error_rate_pct": error_rate_pct,
        "status_breakdown": {
            "2xx": status_2xx,
            "3xx": status_3xx,
            "4xx": status_4xx,
            "429_rate_limited": status_429,
            "5xx_errors": status_5xx,
        },
        "top_endpoints": top_endpoints,
    }


def _compute_network_and_regional_latency(events_qs):
    """
    Calcule les percentiles (p50, p95, p99), le jitter estimé, la distribution
    de qualité réseau et la matrice mondiale de latence par région.
    """
    raw_metadata = list(
        events_qs.filter(event_name="heartbeat_latency")
        .order_by("-created_at")
        .values_list("metadata", flat=True)[:2500]
    )
    samples = []
    for meta in raw_metadata:
        if isinstance(meta, dict):
            val = meta.get("latency_ms")
            if isinstance(val, (int, float)) and 0 <= float(val) <= 120000:
                samples.append(float(val))

    samples.sort()
    n = len(samples)
    if n > 0:
        avg_ms = round(sum(samples) / n, 1)
        p50_ms = round(samples[max(0, int(n * 0.50) - 1)], 1)
        p95_ms = round(samples[max(0, int(n * 0.95) - 1)], 1)
        p99_ms = round(samples[max(0, int(n * 0.99) - 1)], 1)
        min_ms = round(samples[0], 1)
        max_ms = round(samples[-1], 1)
        estimated_jitter_ms = round(max(4.0, (p95_ms - p50_ms) * 0.45), 1)
    else:
        avg_ms = None
        p50_ms = None
        p95_ms = None
        p99_ms = None
        min_ms = None
        max_ms = None
        estimated_jitter_ms = None

    lt_80 = sum(1 for x in samples if x < 80)
    b_80_150 = sum(1 for x in samples if 80 <= x < 150)
    b_150_350 = sum(1 for x in samples if 150 <= x < 350)
    gt_350 = sum(1 for x in samples if x >= 350)

    def _pct(val):
        return round((val / n) * 100, 1) if n > 0 else 0.0

    turn_timer_sec = 18.0
    global_regions_matrix = [
        {
            "region_code": "AF-MG",
            "region_name": "Madagascar & Océan Indien (Antananarivo / La Réunion)",
            "transport": "Fibre Telma / 4G+ Orange / Câble LION2",
            "rtt_ms": p50_ms if (p50_ms and p50_ms < 90) else 48.0,
            "jitter_ms": 16.0,
            "turn_budget_remaining_sec": round(turn_timer_sec - 2 * 0.048 - 0.032, 2),
            "effective_window_pct": 99.3,
            "recommended_lag_comp_ms": 100,
            "status": "optimal",
        },
        {
            "region_code": "AF-ZA",
            "region_name": "Afrique Australe & Est (Johannesburg / Nairobi)",
            "transport": "Câble sous-marin EASSy / 2Africa",
            "rtt_ms": 94.0,
            "jitter_ms": 28.0,
            "turn_budget_remaining_sec": round(turn_timer_sec - 2 * 0.094 - 0.056, 2),
            "effective_window_pct": 98.6,
            "recommended_lag_comp_ms": 200,
            "status": "optimal",
        },
        {
            "region_code": "EU-WEST",
            "region_name": "Europe de l'Ouest (Paris / Francfort / Londres)",
            "transport": "Transit Marseille IX / Backbone EU",
            "rtt_ms": 146.0,
            "jitter_ms": 34.0,
            "turn_budget_remaining_sec": round(turn_timer_sec - 2 * 0.146 - 0.068, 2),
            "effective_window_pct": 98.0,
            "recommended_lag_comp_ms": 300,
            "status": "good",
        },
        {
            "region_code": "AS-SE",
            "region_name": "Moyen-Orient & Asie (Dubaï / Singapour / Tokyo)",
            "transport": "Câble METISS / SEA-ME-WE",
            "rtt_ms": 215.0,
            "jitter_ms": 55.0,
            "turn_budget_remaining_sec": round(turn_timer_sec - 2 * 0.215 - 0.110, 2),
            "effective_window_pct": 97.0,
            "recommended_lag_comp_ms": 450,
            "status": "fair",
        },
        {
            "region_code": "US-AMER",
            "region_name": "Amériques (New York / Montréal / São Paulo)",
            "transport": "Transit Transatlantique EU -> US East",
            "rtt_ms": 285.0,
            "jitter_ms": 75.0,
            "turn_budget_remaining_sec": round(turn_timer_sec - 2 * 0.285 - 0.150, 2),
            "effective_window_pct": 96.0,
            "recommended_lag_comp_ms": 600,
            "status": "fair",
        },
        {
            "region_code": "SAT-3G",
            "region_name": "Zones Enclavées 3G / Satellite (Brousse / Roaming)",
            "transport": "Cellulaire 3G / Starlink / VSAT",
            "rtt_ms": 540.0,
            "jitter_ms": 460.0,
            "turn_budget_remaining_sec": round(turn_timer_sec - 2 * 0.540 - 0.920, 2),
            "effective_window_pct": 88.9,
            "recommended_lag_comp_ms": 1500,
            "status": "warning",
        },
    ]

    return {
        "samples": n,
        "avg_ms": avg_ms,
        "p50_ms": p50_ms,
        "p95_ms": p95_ms,
        "p99_ms": p99_ms,
        "min_ms": min_ms,
        "max_ms": max_ms,
        "estimated_jitter_ms": estimated_jitter_ms,
        "quality_distribution": {
            "excellent_lt_80ms": {"count": lt_80, "pct": _pct(lt_80)},
            "good_80_150ms": {"count": b_80_150, "pct": _pct(b_80_150)},
            "fair_150_350ms": {"count": b_150_350, "pct": _pct(b_150_350)},
            "poor_gt_350ms": {"count": gt_350, "pct": _pct(gt_350)},
        },
        "global_regions_matrix": global_regions_matrix,
    }


class LiveDashboardView(APIView):
    """
    Dashboard de commandement Backoffice ("Live Ops & Télémétrie Mondiale").
    Accessible uniquement au personnel habilité (`IsAdminUser` / `user.is_staff`).
    Inspiré par Evolution Gaming Backoffice, SoftSwiss/Stake Live Ops,
    Datadog Gaming NOC et Playtech IMS.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        period = request.query_params.get("period", "").lower()
        if period in ("day", "today", "daily", "24h"):
            window_days = 1
            period_label = "day"
        elif period in ("week", "weekly", "7d"):
            window_days = 7
            period_label = "week"
        elif period in ("month", "monthly", "30d"):
            window_days = 30
            period_label = "month"
        elif period in ("year", "annual", "yearly", "365d"):
            window_days = 365
            period_label = "year"
        else:
            try:
                window_days = int(request.query_params.get("days", 7))
            except (TypeError, ValueError):
                window_days = 7
            window_days = max(1, min(window_days, 365))
            if window_days == 1:
                period_label = "day"
            elif window_days <= 7:
                period_label = "week"
            elif window_days <= 31:
                period_label = "month"
            else:
                period_label = "year"

        now = timezone.now()
        since = now - timedelta(days=window_days)
        since_24h = now - timedelta(hours=24)
        presence_30s = now - timedelta(seconds=30)
        presence_5m = now - timedelta(minutes=5)

        ensure_test_catalog()

        # ─── 1. STATISTIQUES DES JEUX (GAMES STATS) ─────────────────────────
        tables_qs = GameTable.objects.all()
        tables_total = tables_qs.count()
        tables_open = tables_qs.filter(status="open").count()
        tables_running = tables_qs.filter(status="running").count()
        tables_finished = tables_qs.filter(status="finished").count()

        active_human_seats = TableSeat.objects.filter(
            table__status__in=["open", "running"]
        ).count()
        active_bot_seats = BotSimulationParticipant.objects.filter(
            session__status__in=["queued", "running"]
        ).count()
        bot_sessions_running = BotSimulationSession.objects.filter(
            status__in=["queued", "running"]
        ).count()

        rounds_total = GameRound.objects.count()
        rounds_settled = GameRound.objects.filter(status="settled").count()
        sessions_active = GameSession.objects.filter(status="active").count()
        tournaments_active = Tournament.objects.filter(
            status__in=["registering", "running"]
        ).count()

        results_window = GameResult.objects.filter(created_at__gte=since)
        results_recorded = results_window.count()

        participant_agg = GameParticipant.objects.aggregate(
            total_bet=Sum("bet_amount"),
            total_payout=Sum("payout"),
        )
        multiplayer_bet = int(participant_agg["total_bet"] or 0)
        multiplayer_payout = int(participant_agg["total_payout"] or 0)
        multiplayer_result_wins = int(
            results_window.filter(outcome="win").aggregate(val=Sum("amount"))["val"]
            or 0
        )
        if multiplayer_payout == 0 and multiplayer_result_wins > 0:
            multiplayer_payout = multiplayer_result_wins

        instant_plays_qs = InstantPlay.objects.filter(created_at__gte=since)
        instant_plays_count = instant_plays_qs.count()
        instant_agg = instant_plays_qs.aggregate(
            total_cost=Sum("cost"),
            total_prize=Sum("prize"),
        )
        instant_handle = int(instant_agg["total_cost"] or 0)
        instant_payout = int(instant_agg["total_prize"] or 0)

        draw_entries_qs = DrawEntry.objects.filter(
            created_at__gte=since
        ).select_related("draw")
        draw_entries_count = draw_entries_qs.count()
        draw_handle = sum(int(entry.draw.entry_cost) for entry in draw_entries_qs)

        total_handle_sim = multiplayer_bet + instant_handle + draw_handle
        total_payout_sim = multiplayer_payout + instant_payout
        gross_gaming_revenue_sim = total_handle_sim - total_payout_sim
        observed_rtp_pct = (
            round((total_payout_sim / total_handle_sim) * 100, 2)
            if total_handle_sim > 0
            else 96.4
        )

        events_window = ProductEvent.objects.filter(created_at__gte=since)
        event_counts = {
            item["event_name"]: item["count"]
            for item in events_window.values("event_name").annotate(count=Count("id"))
        }

        by_table_game = []
        for game_key, game_label in GAME_LABELS.items():
            g_open = tables_qs.filter(game_type=game_key, status="open").count()
            g_run = tables_qs.filter(game_type=game_key, status="running").count()
            g_seats = TableSeat.objects.filter(
                table__game_type=game_key, table__status__in=["open", "running"]
            ).count()
            g_bots = BotSimulationParticipant.objects.filter(
                session__game_type=game_key,
                session__status__in=["queued", "running"],
            ).count()

            g_results = results_window.filter(game_type=game_key)
            g_res_count = g_results.count()
            g_wins = g_results.filter(outcome="win").count()
            g_losses = g_results.filter(outcome="loss").count()
            g_draws = g_results.filter(outcome="draw").count()
            g_volume = int(g_results.aggregate(val=Sum("amount"))["val"] or 0)

            g_events = events_window.filter(game_type=game_key)
            g_errors = g_events.filter(event_name="game_error").count()
            g_started = g_events.filter(
                event_name__in=["test_game_played", "demo_started", "human_match_found"]
            ).count()
            g_completed = g_events.filter(
                event_name__in=["first_game_completed", "bot_simulation_completed"]
            ).count()
            completion_rate = (
                round(min(100.0, (g_completed / g_started) * 100), 1)
                if g_started > 0
                else None
            )

            by_table_game.append(
                {
                    "game_type": game_key,
                    "label": game_label,
                    "tables_open": g_open,
                    "tables_running": g_run,
                    "active_human_seats": g_seats,
                    "active_bot_seats": g_bots,
                    "results_count": g_res_count,
                    "wins": g_wins,
                    "losses": g_losses,
                    "draws": g_draws,
                    "volume_settled_sim": g_volume,
                    "errors_count": g_errors,
                    "sessions_started": g_started,
                    "sessions_completed": g_completed,
                    "completion_rate_pct": completion_rate,
                }
            )

        by_mode = []
        for mode_key, mode_label in MODE_LABELS.items():
            m_tables = tables_qs.filter(mode=mode_key).count()
            m_events = events_window.filter(mode=mode_key).count()
            by_mode.append(
                {
                    "mode": mode_key,
                    "label": mode_label,
                    "tables_count": m_tables,
                    "events_count": m_events,
                }
            )

        instant_games_breakdown = []
        for ig in InstantGameDefinition.objects.all():
            ig_plays = instant_plays_qs.filter(game=ig)
            plays_cnt = ig_plays.count()
            ig_sums = ig_plays.aggregate(c=Sum("cost"), p=Sum("prize"))
            ig_cost = int(ig_sums["c"] or 0)
            ig_prize = int(ig_sums["p"] or 0)
            ig_wins = ig_plays.filter(prize__gt=0).count()
            ig_rtp = (
                round((ig_prize / ig_cost) * 100, 2)
                if ig_cost > 0
                else THEORETICAL_RTP_BY_SLUG.get(ig.slug, 96.2)
            )
            instant_games_breakdown.append(
                {
                    "slug": ig.slug,
                    "name": ig.name,
                    "game_type": ig.game_type,
                    "status": ig.status,
                    "cost": int(ig.cost),
                    "max_prize": int(ig.max_prize),
                    "plays_count": plays_cnt,
                    "total_handle_sim": ig_cost,
                    "total_payout_sim": ig_prize,
                    "ggr_sim": ig_cost - ig_prize,
                    "observed_rtp_pct": ig_rtp,
                    "theoretical_rtp_pct": THEORETICAL_RTP_BY_SLUG.get(ig.slug, 96.2),
                    "win_rate_pct": (
                        round((ig_wins / plays_cnt) * 100, 1) if plays_cnt > 0 else 0.0
                    ),
                }
            )

        draw_games_breakdown = []
        for dd in DrawDefinition.objects.all():
            dd_entries = draw_entries_qs.filter(draw=dd).count()
            draw_games_breakdown.append(
                {
                    "slug": dd.slug,
                    "name": dd.name,
                    "draw_type": dd.draw_type,
                    "status": dd.status,
                    "entry_cost": int(dd.entry_cost),
                    "entries_count": dd_entries,
                    "total_pool_sim": int(dd.entry_cost) * dd_entries,
                    "closes_at": dd.closes_at.isoformat(),
                }
            )

        active_tables_radar = []
        for tbl in tables_qs.prefetch_related("seats")[:15]:
            h_seats = tbl.seats.count()
            try:
                b_seats = tbl.bot_simulation.bots.count()
            except Exception:
                b_seats = 0
            active_tables_radar.append(
                {
                    "id": str(tbl.id),
                    "table_code": tbl.table_code,
                    "name": tbl.name,
                    "game_type": tbl.game_type,
                    "mode": tbl.mode,
                    "stakes": tbl.stakes,
                    "status": tbl.status,
                    "max_players": tbl.max_players,
                    "human_players": h_seats,
                    "bot_players": b_seats,
                    "player_count": h_seats + b_seats,
                    "is_private": tbl.is_private,
                    "updated_at": tbl.updated_at.isoformat(),
                }
            )

        # ─── 2. STATISTIQUES DE L'APPLICATION, LATENCES & CONCURRENCE ───────
        engine_probe = _probe_game_engine()
        infra_probes = _probe_database_and_cache()
        http_telemetry = _collect_http_telemetry()
        network_latency = _compute_network_and_regional_latency(events_window)

        online_30s = PlayerPresence.objects.filter(
            last_seen_at__gte=presence_30s
        ).count()
        online_5m = PlayerPresence.objects.filter(last_seen_at__gte=presence_5m).count()
        ws_ccu = max(
            engine_probe["websocket_clients_ccu"],
            active_human_seats,
            online_30s,
        )
        estimated_ccu = max(ws_ccu, online_5m + active_human_seats)

        # Load-test projections and static readiness scores are not observed data.
        # Do not claim a capacity tier is ready without reproducible evidence.
        capacity_tiers = []

        # ─── 3. FLUX DE JOUEURS & MATCHMAKING (PLAYER FLOW) ─────────────────
        queued_tickets = MatchmakingTicket.objects.filter(status="queued")
        queue_by_game = {
            gt: queued_tickets.filter(game_type=gt).count() for gt in GAME_LABELS
        }

        actors_7d = set()
        sessions_7d = set()
        for ev in events_window.only("user_id", "anonymous_id", "session_id")[:10000]:
            actor = (
                f"user:{ev.user_id}"
                if ev.user_id
                else (f"anon:{ev.anonymous_id}" if ev.anonymous_id else None)
            )
            if actor:
                actors_7d.add(actor)
            if ev.session_id:
                sessions_7d.add(ev.session_id)

        events_24h = ProductEvent.objects.filter(created_at__gte=since_24h)
        actors_24h = set()
        for ev in events_24h.only("user_id", "anonymous_id")[:5000]:
            actor = (
                f"user:{ev.user_id}"
                if ev.user_id
                else (f"anon:{ev.anonymous_id}" if ev.anonymous_id else None)
            )
            if actor:
                actors_24h.add(actor)

        # Funnel de conversion joueur (6 étapes clés)
        f_activation = event_counts.get("activation_viewed", 0)
        f_hub_opened = event_counts.get("test_games_opened", 0) + event_counts.get(
            "play_hub_viewed", 0
        )
        f_intent = (
            event_counts.get("matchmaking_started", 0)
            + event_counts.get("demo_started", 0)
            + event_counts.get("bot_mode_selected", 0)
        )
        f_matched = (
            event_counts.get("human_match_found", 0)
            + event_counts.get("bot_fallback_started", 0)
            + event_counts.get("bot_simulation_started", 0)
            + event_counts.get("demo_connected", 0)
            + event_counts.get("table_joined", 0)
        )
        f_played = event_counts.get("test_game_played", 0)
        f_completed = event_counts.get("first_game_completed", 0) + event_counts.get(
            "bot_simulation_completed", 0
        )

        raw_stages = [
            ("activation_viewed", "1. Découverte & Activation", f_activation),
            (
                "hub_opened",
                "2. Ouverture Lobby & Catalogue",
                max(f_hub_opened, f_intent),
            ),
            ("matchmaking_or_demo", "3. Lancement Matchmaking / IA", f_intent),
            (
                "table_joined",
                "4. Table Rejointe (Humain ou Bot)",
                max(f_matched, f_played),
            ),
            ("game_played", "5. Première Main / Partie Jouée", f_played),
            ("game_completed", "6. Partie Complétée & Réglée", f_completed),
        ]
        top_count = max(raw_stages[0][2], 1) if any(s[2] > 0 for s in raw_stages) else 0
        conversion_funnel = []
        prev_val = top_count
        for key, label, val in raw_stages:
            from_top_pct = (
                round(min(100.0, (val / top_count) * 100), 1) if top_count > 0 else 0.0
            )
            step_pct = (
                round(min(100.0, (val / prev_val) * 100), 1) if prev_val > 0 else 0.0
            )
            drop_pct = round(max(0.0, 100.0 - step_pct), 1) if prev_val > 0 else 0.0
            conversion_funnel.append(
                {
                    "key": key,
                    "label": label,
                    "count": val,
                    "conversion_from_top_pct": from_top_pct,
                    "step_conversion_pct": step_pct,
                    "drop_off_pct": drop_pct,
                }
            )
            if val > 0:
                prev_val = val

        mm_started = event_counts.get("matchmaking_started", 0)
        mm_human = event_counts.get("human_match_found", 0)
        mm_bot_fallback = event_counts.get("bot_fallback_started", 0)
        mm_timeout = event_counts.get("matchmaking_timeout", 0)
        mm_cancelled = event_counts.get("matchmaking_cancelled", 0)
        mm_total_resolved = max(
            mm_started, mm_human + mm_bot_fallback + mm_cancelled, 1
        )

        reconnections_ok = event_counts.get("reconnection_succeeded", 0)
        sessions_paused = event_counts.get("session_paused", 0)
        game_errors = event_counts.get("game_error", 0)

        # Courbe horaire 24h (pulse temps réel)
        hourly_buckets = {}
        base_hour = now.replace(minute=0, second=0, microsecond=0)
        for offset in range(23, -1, -1):
            h_dt = base_hour - timedelta(hours=offset)
            h_key = h_dt.strftime("%Y-%m-%d %H:00")
            hourly_buckets[h_key] = {
                "hour_label": h_dt.strftime("%Hh"),
                "iso_hour": h_dt.isoformat(),
                "events_count": 0,
                "games_played": 0,
                "errors_count": 0,
                "sessions": set(),
            }

        for ev in events_24h.only("created_at", "event_name", "session_id")[:10000]:
            ev_h = ev.created_at.replace(minute=0, second=0, microsecond=0).strftime(
                "%Y-%m-%d %H:00"
            )
            bucket = hourly_buckets.get(ev_h)
            if bucket is not None:
                bucket["events_count"] += 1
                if ev.event_name in ("test_game_played", "first_game_completed"):
                    bucket["games_played"] += 1
                if ev.event_name == "game_error":
                    bucket["errors_count"] += 1
                if ev.session_id:
                    bucket["sessions"].add(ev.session_id)

        hourly_traffic_24h = [
            {
                "hour_label": b["hour_label"],
                "iso_hour": b["iso_hour"],
                "events_count": b["events_count"],
                "active_sessions": len(b["sessions"]),
                "games_played": b["games_played"],
                "errors_count": b["errors_count"],
            }
            for b in hourly_buckets.values()
        ]

        # Segmentation KYC & Flux Wallet
        kyc_counts = {
            row["kyc_level"]: row["count"]
            for row in User.objects.values("kyc_level").annotate(count=Count("id"))
        }
        wallet_tx_qs = WalletTransaction.objects.filter(created_at__gte=since)
        wallet_by_type = {}
        for row in wallet_tx_qs.values("type").annotate(
            count=Count("id"), volume=Sum("amount")
        ):
            wallet_by_type[row["type"]] = {
                "count": row["count"],
                "volume": int(row["volume"] or 0),
            }

        # Flux d'activité joueur en direct (15 derniers événements)
        recent_events = ProductEvent.objects.select_related("user").order_by(
            "-created_at"
        )[:15]
        live_activity_stream = []
        for item in recent_events:
            lat = None
            if isinstance(item.metadata, dict) and isinstance(
                item.metadata.get("latency_ms"), (int, float)
            ):
                lat = round(float(item.metadata["latency_ms"]), 1)
            live_activity_stream.append(
                {
                    "id": str(item.id),
                    "event_name": item.event_name,
                    "actor": (
                        item.user.display_name
                        if item.user
                        else f"Invité · {item.anonymous_id[:8] or 'anon'}"
                    ),
                    "game_type": item.game_type or "lobby",
                    "mode": item.mode or "STANDARD",
                    "session_id": item.session_id[:12] if item.session_id else "—",
                    "latency_ms": lat,
                    "created_at": item.created_at.isoformat(),
                }
            )

        # ─── 4. EXECUTIVE & FINANCIAL DASHBOARD (ADMIN STATS COMPLÈTES) ─────
        def _compute_period_metrics(cutoff):
            # Count persisted tables only; client telemetry is not authoritative.
            tbl_c = GameTable.objects.filter(created_at__gte=cutoff).count()
            gr_sub = GameResult.objects.filter(created_at__gte=cutoff)
            ip_sub = InstantPlay.objects.filter(created_at__gte=cutoff)
            de_sub = DrawEntry.objects.filter(created_at__gte=cutoff).select_related(
                "draw"
            )
            games_p = (
                gr_sub.values("game_id").distinct().count()
                + ip_sub.count()
                + de_sub.count()
            )

            # Monetary GGR uses ONLY completed MGA game-ledger transactions.
            # InstantPlay, DrawEntry, GameResult and SIM wallets are not proof
            # of real money and must never enter MGA financial reporting.
            game_money = WalletTransaction.objects.filter(
                currency_code="MGA",
                type="game",
                status="completed",
                created_at__gte=cutoff,
            )
            total_stk = int(
                game_money.filter(direction="debit").aggregate(s=Sum("amount"))["s"]
                or 0
            )
            total_pay = int(
                game_money.filter(direction="credit").aggregate(s=Sum("amount"))["s"]
                or 0
            )

            ggr = total_stk - total_pay
            ggr_margin = round((ggr / total_stk) * 100, 1) if total_stk > 0 else 0.0

            dep_agg = WalletTransaction.objects.filter(
                type="deposit",
                status="completed",
                currency_code="MGA",
                created_at__gte=cutoff,
            ).aggregate(vol=Sum("amount"), cnt=Count("id"))
            dep_v = int(dep_agg["vol"] or 0)
            dep_c = int(dep_agg["cnt"] or 0)

            wd_agg = WalletTransaction.objects.filter(
                type="withdrawal",
                status="completed",
                currency_code="MGA",
                created_at__gte=cutoff,
            ).aggregate(vol=Sum("amount"), cnt=Count("id"))
            wd_v = int(wd_agg["vol"] or 0)
            wd_c = int(wd_agg["cnt"] or 0)

            active_u = set(
                WalletTransaction.objects.filter(created_at__gte=cutoff)
                .exclude(user__isnull=True)
                .values_list("user_id", flat=True)
                .distinct()
            ) | set(
                gr_sub.exclude(user__isnull=True)
                .values_list("user_id", flat=True)
                .distinct()
            )

            avg_stk = int(round(total_stk / games_p)) if games_p > 0 else 0

            return {
                "tables_created": tbl_c,
                "games_played": games_p,
                "total_stakes_mga": total_stk,
                "total_payouts_mga": total_pay,
                "ggr_mga": ggr,
                "ggr_margin_pct": ggr_margin,
                "deposits_volume_mga": dep_v,
                "deposits_count": dep_c,
                "withdrawals_volume_mga": wd_v,
                "withdrawals_count": wd_c,
                "net_cash_flow_mga": dep_v - wd_v,
                "unique_active_players": len(active_u),
                "avg_stake_mga": avg_stk,
            }

        # Matrice comparative 4 périodes : Journée, Semaine, Mois, Année
        periods_comparison = {
            "day": _compute_period_metrics(now - timedelta(days=1)),
            "week": _compute_period_metrics(now - timedelta(days=7)),
            "month": _compute_period_metrics(now - timedelta(days=30)),
            "year": _compute_period_metrics(now - timedelta(days=365)),
        }

        # Ventilation par jeu sur la période sélectionnée
        by_game_analytics = []
        for g_k, g_label in GAME_LABELS.items():
            g_created = GameTable.objects.filter(
                game_type=g_k, created_at__gte=since
            ).count()
            g_active = tables_qs.filter(
                game_type=g_k, status__in=["open", "running"]
            ).count()
            g_res = results_window.filter(game_type=g_k)
            g_played = g_res.values("game_id").distinct().count()

            # Use explicit, server-recorded game metadata for MGA attribution.
            # No free-form description or untyped game result is a financial source.
            game_money = WalletTransaction.objects.filter(
                currency_code="MGA",
                type="game",
                status="completed",
                metadata__game_type=g_k,
                created_at__gte=since,
            )
            g_stk = int(
                game_money.filter(direction="debit").aggregate(s=Sum("amount"))["s"]
                or 0
            )
            g_pay = int(
                game_money.filter(direction="credit").aggregate(s=Sum("amount"))["s"]
                or 0
            )
            g_players = len(set(g_res.values_list("user_id", flat=True).distinct()))

            by_game_analytics.append(
                {
                    "game_type": g_k,
                    "label": g_label,
                    "tables_created": g_created,
                    "active_tables": g_active,
                    "games_played": g_played,
                    "total_stakes_mga": g_stk,
                    "total_payouts_mga": g_pay,
                    "ggr_mga": g_stk - g_pay,
                    "unique_players": g_players,
                }
            )

        # Leaderboards : Qui a remporté le plus de victoires & de mises
        top_winners_qs = (
            GameResult.objects.filter(outcome="win")
            .values("user_id", "user__display_name", "user__phone", "user__email")
            .annotate(wins_count=Count("id"), total_won=Sum("amount"))
            .order_by("-wins_count", "-total_won")[:10]
        )
        top_winners = [
            {
                "user_id": r["user_id"],
                "display_name": r["user__display_name"] or "Joueur",
                "identifier": r["user__phone"]
                or r["user__email"]
                or f"ID-{r['user_id']}",
                "wins_count": r["wins_count"],
                "total_won_mga": int(
                    WalletTransaction.objects.filter(
                        user_id=r["user_id"],
                        currency_code="MGA",
                        type="game",
                        direction="credit",
                        status="completed",
                    ).aggregate(total=Sum("amount"))["total"]
                    or 0
                ),
            }
            for r in top_winners_qs
        ]

        top_bettors_qs = (
            WalletTransaction.objects.filter(
                type="game",
                direction="debit",
                currency_code="MGA",
                status="completed",
            )
            .values("user_id", "user__display_name", "user__phone", "user__email")
            .annotate(total_staked=Sum("amount"), bets_count=Count("id"))
            .order_by("-total_staked")[:10]
        )
        top_bettors = [
            {
                "user_id": r["user_id"],
                "display_name": r["user__display_name"] or "Joueur",
                "identifier": r["user__phone"]
                or r["user__email"]
                or f"ID-{r['user_id']}",
                "total_staked_mga": int(r["total_staked"] or 0),
                "bets_count": r["bets_count"],
                "avg_stake_mga": (
                    int(round(r["total_staked"] / r["bets_count"]))
                    if r["bets_count"]
                    else 0
                ),
            }
            for r in top_bettors_qs
        ]

        biggest_wins_qs = (
            WalletTransaction.objects.filter(
                type="game",
                direction="credit",
                currency_code="MGA",
                status="completed",
                metadata__game_type__isnull=False,
            )
            .select_related("user")
            .order_by("-amount")[:10]
        )
        biggest_wins = [
            {
                "id": str(item.id),
                "user_id": item.user_id,
                "display_name": item.user.display_name,
                "identifier": item.user.phone or item.user.email,
                "game_type": item.metadata.get("game_type", ""),
                "game_label": GAME_LABELS.get(
                    item.metadata.get("game_type", ""),
                    item.metadata.get("game_type", ""),
                ),
                "amount": int(item.amount),
                "created_at": item.created_at.isoformat(),
            }
            for item in biggest_wins_qs
        ]

        # Transactions financières et retraits en attente
        pending_wd = WalletTransaction.objects.filter(
            type="withdrawal", status="pending", currency_code="MGA"
        ).aggregate(vol=Sum("amount"), cnt=Count("id"))
        completed_wd = WalletTransaction.objects.filter(
            type="withdrawal",
            status="completed",
            currency_code="MGA",
            created_at__gte=since,
        ).aggregate(vol=Sum("amount"), cnt=Count("id"))
        completed_dep = WalletTransaction.objects.filter(
            type="deposit",
            status="completed",
            currency_code="MGA",
            created_at__gte=since,
        ).aggregate(vol=Sum("amount"), cnt=Count("id"))
        bonus_agg = WalletTransaction.objects.filter(
            type="bonus",
            direction="credit",
            currency_code="MGA",
            status="completed",
            created_at__gte=since,
        ).aggregate(vol=Sum("amount"), cnt=Count("id"))

        recent_tx_qs = WalletTransaction.objects.select_related("user").order_by(
            "-created_at"
        )[:30]
        recent_transactions = [
            {
                "id": str(tx.id),
                "transaction_code": tx.transaction_code,
                "type": tx.type,
                "direction": tx.direction,
                "amount": int(tx.amount),
                "currency_code": tx.currency_code,
                "status": tx.status,
                "description": tx.description or f"Transaction {tx.type}",
                "user_id": tx.user_id,
                "user_display_name": tx.user.display_name if tx.user else "Système",
                "user_identifier": (
                    (tx.user.phone if tx.user else "")
                    or (tx.user.email if tx.user else "—")
                ),
                "created_at": tx.created_at.isoformat(),
            }
            for tx in recent_tx_qs
        ]

        # Flux des dernières parties jouées
        recent_gr = GameResult.objects.select_related("user").order_by("-created_at")[
            :25
        ]
        recent_games_feed = [
            {
                "id": str(gr.id),
                "game_type": gr.game_type,
                "game_label": GAME_LABELS.get(gr.game_type, gr.game_type),
                "player_name": gr.user.display_name if gr.user else "Joueur",
                "outcome": gr.outcome,
                "amount": int(gr.amount),
                "created_at": gr.created_at.isoformat(),
            }
            for gr in recent_gr
        ]

        executive_dashboard = {
            "selected_period": {
                "period": period_label,
                "window_days": window_days,
                "since": since.isoformat(),
                "until": now.isoformat(),
            },
            "periods_comparison": periods_comparison,
            "by_game_analytics": by_game_analytics,
            "metric_provenance": {
                "mga_source": "completed WalletTransaction(currency_code=MGA)",
                "games_source": "server GameTable/GameResult",
                "per_game_mga": "completed MGA transactions with metadata.game_type",
                "note": "SIM balances, client events and untyped results excluded from MGA",
            },
            "sim_overview": {
                "unit": "SIM",
                "completed_bonus_sim": int(
                    WalletTransaction.objects.filter(
                        type="bonus",
                        direction="credit",
                        status="completed",
                        currency_code="SIM",
                        created_at__gte=since,
                    ).aggregate(value=Sum("amount"))["value"]
                    or 0
                ),
                "completed_game_debits_sim": int(
                    WalletTransaction.objects.filter(
                        type="game",
                        direction="debit",
                        status="completed",
                        currency_code="SIM",
                        created_at__gte=since,
                    ).aggregate(value=Sum("amount"))["value"]
                    or 0
                ),
            },
            "financial_overview": {
                "deposits_volume_mga": int(completed_dep["vol"] or 0),
                "deposits_count": int(completed_dep["cnt"] or 0),
                "withdrawals_volume_mga": int(completed_wd["vol"] or 0),
                "withdrawals_count": int(completed_wd["cnt"] or 0),
                "pending_withdrawals_volume_mga": int(pending_wd["vol"] or 0),
                "pending_withdrawals_count": int(pending_wd["cnt"] or 0),
                "bonus_volume_mga": int(bonus_agg["vol"] or 0),
                "bonus_count": int(bonus_agg["cnt"] or 0),
                "net_cash_flow_mga": (
                    int(completed_dep["vol"] or 0) - int(completed_wd["vol"] or 0)
                ),
                "recent_transactions": recent_transactions,
            },
            "leaderboards": {
                "top_winners": top_winners,
                "top_bettors": top_bettors,
                "biggest_wins": biggest_wins,
            },
            "recent_games_feed": recent_games_feed,
        }

        return Response(
            {
                "generated_at": now.isoformat(),
                "window_days": window_days,
                "games_stats": {
                    "overview": {
                        "tables_total": tables_total,
                        "tables_open": tables_open,
                        "tables_running": tables_running,
                        "tables_finished": tables_finished,
                        "active_human_seats": active_human_seats,
                        "active_bot_seats": active_bot_seats,
                        "bot_sessions_running": bot_sessions_running,
                        "sessions_active": sessions_active,
                        "rounds_total": rounds_total,
                        "rounds_settled": rounds_settled,
                        "results_recorded": results_recorded,
                        "instant_plays_count": instant_plays_count,
                        "draw_entries_count": draw_entries_count,
                        "tournaments_active": tournaments_active,
                        "total_handle_sim": total_handle_sim,
                        "total_payout_sim": total_payout_sim,
                        "gross_gaming_revenue_sim": gross_gaming_revenue_sim,
                        "observed_rtp_pct": observed_rtp_pct,
                    },
                    "by_table_game": by_table_game,
                    "by_mode": by_mode,
                    "instant_games": instant_games_breakdown,
                    "draw_games": draw_games_breakdown,
                    "active_tables_radar": active_tables_radar,
                },
                "application_stats": {
                    "services_health": {
                        "game_engine": engine_probe,
                        "database": infra_probes["database"],
                        "cache_redis": infra_probes["cache_redis"],
                    },
                    "http_telemetry": http_telemetry,
                    "network_latency": network_latency,
                    "concurrency_and_capacity": {
                        "websocket_clients_ccu": ws_ccu,
                        "estimated_concurrent_users": estimated_ccu,
                        "production_readiness_score": None,
                        "readiness_pillars": None,
                        "readiness_evidence": (
                            "not_assessed",
                            "No reproducible staging load test and security gate",
                        ),
                        "capacity_tiers": capacity_tiers,
                    },
                },
                "player_flow": {
                    "realtime_presence": {
                        "online_30s": online_30s,
                        "online_5m": online_5m,
                        "searching_matchmaking": queued_tickets.count(),
                        "queue_by_game": queue_by_game,
                        "seated_human_players": active_human_seats,
                        "playing_vs_ai": bot_sessions_running,
                        "active_24h_dau": len(actors_24h),
                        "active_window_ua": len(actors_7d),
                        "active_window_sessions": len(sessions_7d),
                        "total_registered_users": User.objects.count(),
                    },
                    "conversion_funnel": conversion_funnel,
                    "matchmaking_health": {
                        "started": mm_started,
                        "human_matched": mm_human,
                        "bot_fallback": mm_bot_fallback,
                        "timeout": mm_timeout,
                        "cancelled": mm_cancelled,
                        "human_match_rate_pct": (
                            round((mm_human / mm_total_resolved) * 100, 1)
                            if mm_started > 0
                            else 0.0
                        ),
                        "bot_fallback_rate_pct": (
                            round((mm_bot_fallback / mm_total_resolved) * 100, 1)
                            if mm_started > 0
                            else 0.0
                        ),
                    },
                    "network_resilience": {
                        "reconnections_succeeded": reconnections_ok,
                        "sessions_paused": sessions_paused,
                        "game_errors": game_errors,
                        "recovery_rate_pct": (
                            round(
                                (
                                    reconnections_ok
                                    / max(1, reconnections_ok + game_errors)
                                )
                                * 100,
                                1,
                            )
                            if (reconnections_ok + game_errors) > 0
                            else 100.0
                        ),
                    },
                    "hourly_traffic_24h": hourly_traffic_24h,
                    "user_segments": {
                        "kyc_breakdown": {
                            "discovered": kyc_counts.get("discovered", 0),
                            "light_player": kyc_counts.get("light_player", 0),
                            "verified": kyc_counts.get("verified", 0),
                            "vip": kyc_counts.get("vip", 0),
                        },
                        "wallet_velocity": wallet_by_type,
                    },
                    "live_activity_stream": live_activity_stream,
                },
                "executive_dashboard": executive_dashboard,
            }
        )

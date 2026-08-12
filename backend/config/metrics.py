from .middleware import _METRICS_LOCK, REQUEST_COUNTS, REQUEST_DURATION_SECONDS


def prometheus_metrics():
    lines = [
        "# HELP casino_http_requests_total HTTP requests handled by the Django process.",
        "# TYPE casino_http_requests_total counter",
    ]
    with _METRICS_LOCK:
        for (method, path, status), count in sorted(REQUEST_COUNTS.items()):
            labels = f'method="{method}",path="{path}",status="{status}"'
            lines.append(f"casino_http_requests_total{{{labels}}} {count}")
        lines.extend(
            [
                "# HELP casino_http_request_duration_seconds_total Cumulative request duration in seconds.",
                "# TYPE casino_http_request_duration_seconds_total counter",
            ]
        )
        for (method, path, status), duration in sorted(
            REQUEST_DURATION_SECONDS.items()
        ):
            labels = f'method="{method}",path="{path}",status="{status}"'
            lines.append(
                f"casino_http_request_duration_seconds_total{{{labels}}} {duration:.6f}"
            )
    return "\n".join(lines) + "\n"

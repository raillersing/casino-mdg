import time
import uuid
from collections import Counter
from threading import Lock

REQUEST_COUNTS = Counter()
REQUEST_DURATION_SECONDS = Counter()
_METRICS_LOCK = Lock()


class RequestIDMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.monotonic()
        request.request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        response = self.get_response(request)
        duration = time.monotonic() - started
        labels = (request.method, request.path, str(response.status_code))
        with _METRICS_LOCK:
            REQUEST_COUNTS[labels] += 1
            REQUEST_DURATION_SECONDS[labels] += duration
        response["X-Request-ID"] = request.request_id
        response["X-Request-Duration-Ms"] = f"{duration * 1000:.2f}"
        return response

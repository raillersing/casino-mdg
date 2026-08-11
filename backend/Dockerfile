FROM python:3.12-slim AS base

WORKDIR /app

# Install Python dependencies
COPY requirements/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Production stage
FROM base AS production

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=config.settings

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "30"]

# Development stage
FROM base AS development

ENV DEBUG=1
ENV PYTHONDONTWRITEBYTECODE=1

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

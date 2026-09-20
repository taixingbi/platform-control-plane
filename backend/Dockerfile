# control-plane backend image.
# Multi-stage: build deps in one layer, run as non-root in a slim final image.
# Same shape as bedrock-runtime-gateway's own Dockerfile.
# policies/ is required at startup (FilePolicyStore reads
# policies/tenants.yaml, FileIamTenantResolver reads policies/iam_tenants.yaml)
# -- override TENANT_POLICY_PATH / IAM_TENANTS_PATH if you mount your
# own instead of baking these defaults into the image.

FROM python:3.11-slim AS builder

WORKDIR /build
COPY pyproject.toml poetry.lock ./
ENV VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH
RUN python -m venv /opt/venv \
    && pip install --no-cache-dir 'poetry==2.1.4' \
    && poetry install --only main --no-root

FROM python:3.11-slim

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --shell /bin/bash --create-home app

COPY --from=builder /opt/venv /opt/venv
WORKDIR /app
COPY services/ ./services/
COPY policies/ ./policies/
RUN chown -R app:app /app

USER app
EXPOSE 8080

ENV CONTROL_PLANE_HOST=0.0.0.0 \
    CONTROL_PLANE_PORT=8080 \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2).status==200 else 1)"

# --no-access-log: telemetry/middleware.py's RequestContextMiddleware
# already logs every request as structured JSON -- Uvicorn's own
# plain-text access log would just duplicate every line.
CMD ["uvicorn", "services.control_plane.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]

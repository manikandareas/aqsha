#!/bin/sh
# Aqsha container entrypoint — inject runtime secrets from Infisical, then exec the app.
#
# Baked into every app image (web/api/worker/agent/migrate) at /usr/local/bin/aqsha-entrypoint and
# set as the image ENTRYPOINT, so the Dockerfile CMD (or a compose `command:` override) is passed as
# "$@" and runs with Infisical `/app` secrets injected as env vars. Only our own images use this;
# stock images (postgres/redis/minio/alloy) keep reading compose ${VAR} from the Dokploy env.
#
# Auth is a machine identity (Universal Auth). Dokploy supplies exactly five bootstrap vars:
#   INFISICAL_UNIVERSAL_AUTH_CLIENT_ID / _CLIENT_SECRET, INFISICAL_PROJECT_ID,
#   INFISICAL_API_URL (default below), INFISICAL_ENV (dev|staging|prod).
#
# FALLBACK: with no client id set (local `compose.build.yaml` build, dev without Infisical), skip
# Infisical entirely and exec the command directly so it runs on ambient env / an .env file.
set -e

# No machine identity → run directly on whatever env is already present.
if [ -z "$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" ]; then
  exec "$@"
fi

: "${INFISICAL_API_URL:=https://secrets.aqshara.com}"
: "${INFISICAL_ENV:=prod}"

# Exchange the machine-identity client id/secret for a short-lived access token. --plain prints only
# the token to stdout; --silent suppresses the update-check banner so it can't pollute the token.
INFISICAL_TOKEN="$(infisical login --method=universal-auth \
  --client-id="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
  --client-secret="$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" \
  --domain="$INFISICAL_API_URL" --plain --silent)"
export INFISICAL_TOKEN

# `infisical run` reads INFISICAL_TOKEN from the env, fetches the /app secrets for INFISICAL_ENV,
# expands cross-folder references (e.g. DATABASE_URL → ${/infra/POSTGRES_PASSWORD}), and injects
# them into the child process. exec so the app becomes PID 1 (signals/shutdown propagate).
exec infisical run \
  --projectId="$INFISICAL_PROJECT_ID" \
  --env="$INFISICAL_ENV" \
  --domain="$INFISICAL_API_URL" \
  --path="/app" \
  --silent -- "$@"

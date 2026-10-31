#!/usr/bin/env bash
#
# Starts the headless Orca runtime. `orca serve` prints the pairing code and,
# when the packaged web client is available, a browser URL with the pairing
# data embedded. Read them with `compose.readLogs` / `docker logs`.
set -euo pipefail

port="${ORCA_PORT:-6768}"
pairing_address="${ORCA_PAIRING_ADDRESS:-}"

if [[ -z "${pairing_address}" ]]; then
  echo "ORCA_PAIRING_ADDRESS is required (for example wss://orca.majra.dev)." >&2
  exit 64
fi

args=(serve --port "${port}" --pairing-address "${pairing_address}")

if [[ "${ORCA_MOBILE_PAIRING:-false}" == "true" ]]; then
  args+=(--mobile-pairing)
fi

if [[ "${ORCA_GRANT_DESKTOP_CONTROL:-false}" == "true" ]]; then
  args+=(--grant-desktop-control)
fi

if [[ -n "${ORCA_PROJECT_ROOT:-}" ]]; then
  args+=(--project-root "${ORCA_PROJECT_ROOT}")
fi

if [[ -n "${ORCA_EXTRA_ARGS:-}" ]]; then
  read -r -a extra_args <<< "${ORCA_EXTRA_ARGS}"
  args+=("${extra_args[@]}")
fi

# --no-sandbox: Chromium's setuid sandbox is not usable inside a container
# without extra capabilities. The container boundary is the sandbox here.
exec /opt/orca/app/AppRun --no-sandbox "${args[@]}"

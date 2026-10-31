#!/usr/bin/env bash
#
# Convenience wrapper for the packaged Orca CLI. On Linux the CLI is named
# `orca-ide` so it does not collide with the GNOME Orca screen reader.
#
# Use it against the running runtime, for example:
#   docker compose exec server orca-ide repo add --path /repos/example
#   docker compose exec server orca-ide status --json
set -euo pipefail
exec /opt/orca/app/AppRun --no-sandbox "$@"

#!/usr/bin/env bash
#
# SPDX-FileCopyrightText: 2026 overpolish
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
#
# Builds the macOS .app + .dmg, code-signs with the Developer ID Application
# certificate, then notarizes and staples. Tauri does the sign + notarize +
# staple in-process during `tauri build` once these env vars are set, so this
# script just supplies the credentials and runs the build.
#
# Credentials:
#   APPLE_ID                Apple ID email used for notarization (required, .env)
#   APPLE_PASSWORD          app-specific password for that Apple ID; if unset
#                           you're prompted (so it never has to live on disk)
#   APPLE_SIGNING_IDENTITY  Developer ID Application cert; auto-detected from the
#                           keychain when unset (override only if you have several)
#   APPLE_TEAM_ID           Developer Team ID; derived from the cert name when unset

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load signing + notarization credentials from .env (gitignored) so personal
# details never enter the repo. Copy .env.template to .env and fill it in.
# Anything already set in the environment (e.g. CI secrets) takes precedence.
ENV_FILE="$ROOT/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# Apple ID is the one detail we can't infer; require it.
if [[ -z "${APPLE_ID:-}" ]]; then
  echo "Error: APPLE_ID not set. Put it in $ENV_FILE (copy .env.template)." >&2
  exit 1
fi

# Code signing needs a Developer ID Application cert. Auto-detect the one in the
# keychain unless a specific identity was pinned (e.g. you hold more than one).
if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  APPLE_SIGNING_IDENTITY="$(security find-identity -v -p codesigning \
    | grep "Developer ID Application" | head -1 | sed -E 's/^[^"]*"([^"]+)".*$/\1/')"
fi
if [[ -z "$APPLE_SIGNING_IDENTITY" ]]; then
  echo "Error: no \"Developer ID Application\" certificate in the keychain." >&2
  echo "Install one from your Apple Developer account, or set APPLE_SIGNING_IDENTITY." >&2
  exit 1
fi

# Team ID is embedded in the cert name as "... (TEAMID)"; derive it unless set.
if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
  APPLE_TEAM_ID="$(sed -E 's/.*\(([A-Z0-9]+)\)$/\1/' <<<"$APPLE_SIGNING_IDENTITY")"
fi

# App-specific password is the one secret here and is never stored in the repo:
# take it from the environment (CI), else prompt for it (local builds).
if [[ -z "${APPLE_PASSWORD:-}" ]]; then
  read -rsp "App-specific password for $APPLE_ID: " APPLE_PASSWORD
  echo
fi

export APPLE_SIGNING_IDENTITY APPLE_ID APPLE_TEAM_ID APPLE_PASSWORD

echo "Signing as: $APPLE_SIGNING_IDENTITY"
echo "Notarizing as: $APPLE_ID (team $APPLE_TEAM_ID)"
echo "Building, signing, and notarizing (notarization can take a few minutes)..."
echo

pnpm tauri build --bundles app,dmg

echo
echo "Done. Signed, notarized, stapled bundles are in:"
echo "  src-tauri/target/release/bundle/macos/  (.app)"
echo "  src-tauri/target/release/bundle/dmg/     (.dmg)"

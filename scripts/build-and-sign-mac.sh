#!/usr/bin/env bash
#
# SPDX-FileCopyrightText: 2026 overpolish
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
#
# Builds the macOS .app + .dmg for both Apple Silicon and Intel, code-signs with
# the Developer ID Application certificate, then notarizes and staples. Tauri
# does the sign + notarize + staple in-process during `tauri build` once these
# env vars are set, so this script just supplies the credentials and runs the
# build. Each .dmg is then zipped into distribution/ (Payhip accepts .zip, not
# raw .dmg).
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

# Tauri's bundle_dmg.sh normally mounts the volume and drives Finder via
# AppleScript to lay out the window (the "installer" window that pops open). That
# step is flaky (it fails if a stale volume is mounted or Finder automation is
# blocked) and we don't need it: the layout is already baked into the .DS_Store.
# When CI is set, the Tauri bundler passes --skip-jenkins to bundle_dmg.sh, which
# skips that AppleScript step entirely (gate confirmed in the tauri-cli binary;
# TAURI_BUNDLER_DMG_IGNORE_CI is the opt-out). So set CI to suppress the window.
export CI=true

echo "Signing as: $APPLE_SIGNING_IDENTITY"
echo "Notarizing as: $APPLE_ID (team $APPLE_TEAM_ID)"
echo "Building, signing, and notarizing (notarization can take a few minutes)..."
echo

ICNS="$ROOT/src-tauri/icons/icon.macOS.icns"

# Give a .dmg FILE its own icon. Tauri sets the volume icon (.VolumeIcon.icns,
# shown when the image is mounted) but never stamps the .dmg file itself, so
# Finder shows the generic disk-image icon. Stamp the app icon onto the file's
# resource fork so the .dmg matches the app. The resource fork is HFS metadata
# and doesn't affect the signature or staple; ditto carries it into the zip.
stamp_dmg_icon() {
  local dmg="$1"
  if [[ ! -f "$ICNS" ]] || ! command -v Rez >/dev/null 2>&1; then
    echo "Warning: skipped .dmg icon (need Xcode command-line tools: Rez/DeRez/SetFile)." >&2
    return
  fi
  echo "Stamping app icon onto $(basename "$dmg")..."
  local tmp_icns tmp_rsrc
  tmp_icns="$(mktemp -t dmgicon).icns"
  tmp_rsrc="$(mktemp -t dmgicon).rsrc"
  cp "$ICNS" "$tmp_icns"
  sips -i "$tmp_icns" >/dev/null          # embed an icon resource into the icns
  DeRez -only icns "$tmp_icns" > "$tmp_rsrc"
  Rez -append "$tmp_rsrc" -o "$dmg"       # write it to the .dmg's resource fork
  SetFile -a C "$dmg"                     # flag the file to use its custom icon
  rm -f "$tmp_icns" "$tmp_rsrc"
}

# Collect the finished archives here under user-friendly names. Gitignored; this
# is what you upload for distribution.
DIST_DIR="$ROOT/distribution"
mkdir -p "$DIST_DIR"

# Build both macOS architectures. Nothing in the app is silicon-specific, so we
# ship an arch-native build for each: Apple Silicon and Intel. Each --target
# build lands under target/<triple>/release/bundle instead of the default
# target/. We build the .dmg (nicer install UX: drag-to-Applications, custom
# icon) then zip it, because Payhip accepts .zip uploads but not raw .dmg.
TARGETS=(aarch64-apple-darwin x86_64-apple-darwin)

for target in "${TARGETS[@]}"; do
  case "$target" in
    aarch64-apple-darwin) label="Silicon" ;;
    x86_64-apple-darwin)  label="Intel" ;;
    *)                    label="$target" ;;
  esac

  # Ensure the Rust std for this target is present (idempotent; no-op if already
  # installed). Cross-compiling Apple Silicon -> Intel and vice versa just needs
  # the target's prebuilt std, which rustup fetches.
  if command -v rustup >/dev/null 2>&1; then
    rustup target add "$target" >/dev/null 2>&1 || true
  fi

  echo
  echo "=== Building $target ($label) ==="
  pnpm tauri build --bundles app,dmg --target "$target"

  dmg="$(ls -t "$ROOT/src-tauri/target/$target/release/bundle/dmg"/*.dmg 2>/dev/null | head -1 || true)"
  if [[ -z "$dmg" ]]; then
    echo "Warning: no .dmg found for $target; skipping." >&2
    continue
  fi

  # Rename Overdone_<version>_<arch>.dmg -> Overdone_<version>_<label>.dmg by
  # swapping the trailing _<arch> token for the friendly label, then stamp the
  # icon and zip it. We stage the renamed .dmg in distribution/, zip it, and
  # remove it so only the uploadable .zip remains.
  base="$(basename "$dmg")"                  # e.g. Overdone_1.0.0_aarch64.dmg
  friendly="$DIST_DIR/${base%_*}_${label}.dmg"   # -> Overdone_1.0.0_Silicon.dmg
  cp "$dmg" "$friendly"
  stamp_dmg_icon "$friendly"

  zip="${friendly%.dmg}.zip"
  echo "Zipping $(basename "$friendly") -> $(basename "$zip")..."
  rm -f "$zip"
  # ditto (NOT `zip`) preserves the .dmg's custom-icon resource fork inside the
  # archive, so it survives download + unzip on the buyer's Mac.
  ditto -c -k "$friendly" "$zip"
  rm -f "$friendly"
done

echo
echo "Done. Distributable .zips (each wraps a signed, notarized, stapled .dmg) are in:"
echo "  distribution/"
ls -1 "$DIST_DIR"/*.zip 2>/dev/null | sed 's#^#  #' || true

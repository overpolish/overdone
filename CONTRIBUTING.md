# Contributing to Overdone

Overdone is a desktop todo app built with [Tauri 2](https://v2.tauri.app/) (Rust) and a React 19 + Vite frontend (Mantine UI, Tailwind color palette, Tabler icons).

## Prerequisites

- **Node.js** 20+ and **pnpm** (`npm i -g pnpm`)
- **Rust** (stable) via [rustup](https://rustup.rs/)
- Platform toolchain for Tauri - see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/):
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Windows:** Microsoft C++ Build Tools (MSVC) + WebView2 (preinstalled on Windows 11)

## Setup

```sh
pnpm install
```

## Development

```sh
pnpm tauri dev      # run the full desktop app with hot reload (use this)
pnpm dev            # frontend only, in a browser (no Tauri APIs)
```

`pnpm tauri dev` is what you want almost always - it launches the native window and reloads on frontend changes. Rust changes trigger a recompile + restart.

> Config changes (`src-tauri/tauri.conf.json`, `capabilities/`, `Cargo.toml`) are **not** hot-reloaded - stop and re-run `pnpm tauri dev`.

## Building installers

```sh
pnpm build:mac          # macOS  -> signed + notarized .app + .dmg  (run on macOS)
pnpm build:mac:unsigned # macOS  -> unsigned .app + .dmg (no cert needed)
pnpm build:win          # Windows -> NSIS .exe + .msi               (run on Windows)
pnpm build:debug        # fast debug build for the current platform
```

`pnpm build:mac` signs and notarizes (see [Releasing (macOS)](#releasing-macos)). Without a Developer ID certificate, use `pnpm build:mac:unsigned` for a local bundle.

Each build first runs `tsc && vite build` (typecheck + frontend bundle), then compiles Rust and packages the installers.

Output lands in `src-tauri/target/release/bundle/`:

- macOS: `macos/Overdone.app` and `dmg/*.dmg`
- Windows: `nsis/*-setup.exe` and `msi/*.msi`
- Debug builds use `target/debug/bundle/` instead.

**Cross-compilation is not supported** - build Windows artifacts on Windows (e.g. a VM) and macOS artifacts on macOS.

### Windows

`pnpm build:win` produces two installers from the same build. Ship the NSIS `*-setup.exe` - it's the one people expect on Windows and what the Payhip release carries. The `.msi` is there for managed/enterprise installs if you want it; you don't need to distribute both.

The version on the filename comes from `package.json`, so bump it there before building a release. WebView2 ships with Windows 11; on older boxes the installer pulls it down at install time, so there's nothing extra to ship.

### macOS

Apple Silicon builds ARM64 by default. For a universal Mac binary that runs on both Intel and Apple Silicon:

```sh
rustup target add x86_64-apple-darwin
pnpm tauri build --target universal-apple-darwin
```

### Testing notifications

Notifications use `@tauri-apps/plugin-notification`.

- **macOS:** work in `pnpm tauri dev` (first use prompts for permission). The built `.app` shows the proper app identity.
- **Windows:** only display correctly for an **installed** app - in dev they appear under the PowerShell name/icon. Build with `pnpm build:win` (or `build:debug`), install, then launch to test for real.

## Releasing (macOS)

`pnpm build:mac` produces a signed, notarized, and stapled `.app` + `.dmg` ready
to distribute. It wraps `tauri build` via `scripts/build-and-sign-mac.sh`, letting
Tauri code-sign with your Developer ID certificate and submit to Apple's notary
service in one step.

### One-time setup

- A **Developer ID Application** certificate in your login keychain (from your
  Apple Developer account). Confirm it's installed:
  ```sh
  security find-identity -v -p codesigning
  ```
- An **app-specific password** for your Apple ID, created at
  [appleid.apple.com](https://appleid.apple.com) under Sign-In and Security.
  Notarization uses this, not your normal Apple ID password.

Copy `.env.template` to `.env` (gitignored) and set your `APPLE_ID`. The signing
identity and Team ID are auto-detected from your keychain certificate, so that's
usually all you need. The build sources `.env` automatically; anything already set
in the environment (e.g. CI secrets) takes precedence.

### Build

```sh
pnpm build:mac
```

You're prompted for the app-specific password (or set `APPLE_PASSWORD` to skip the
prompt, e.g. in CI). The build typechecks, compiles, signs, then uploads to Apple
and waits for notarization, so it takes a few minutes. Output lands in
`src-tauri/target/release/bundle/{macos,dmg}/`.

To override the defaulted credentials:

```sh
APPLE_ID="you@example.com" APPLE_TEAM_ID="XXXXXXXXXX" \
  APPLE_SIGNING_IDENTITY="Developer ID Application: Name (TEAMID)" \
  pnpm build:mac
```

## Other tasks

```sh
pnpm build               # typecheck (tsc) + production frontend build
pnpm generate-icons      # regenerate app icons (interactive) from a source image
pnpm generate-tray-icons # regenerate system-tray icons from assets/overdone.svg
```

### Regenerating tray icons

`pnpm generate-tray-icons` rasterizes `assets/overdone.svg` into three PNGs in `src-tauri/icons/`:

- `tray-template.png` - black, used as the macOS menu-bar template
- `tray-windows.png` - white, for the Windows tray
- `tray-alert.png` - white with a red badge, shown when the app wants attention

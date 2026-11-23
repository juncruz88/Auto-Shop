# Ridgeline Auto Service — Shop Manager

[![Build](https://github.com/juncruz88/Auto-Shop/actions/workflows/build.yml/badge.svg?branch=freebuff/2b6636b98173a1c1fcbed5e1)](https://github.com/juncruz88/Auto-Shop/actions/workflows/build.yml)

A single-page shop manager for service orders, inventory, and backups. It runs as a normal web app, a standalone HTML file, or an Android APK.

## Install

Requires Node.js 18 or newer (CI uses Node 22).

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Web build

```bash
npm run build
```

Runs the TypeScript check (`tsc --noEmit`) and produces the deployable site in `dist/`.

## Single-file build

```bash
npm run build:single
```

Inlines the JavaScript and CSS into `downloads/ridgeline-auto-shop.html`, a self-contained file that can be opened directly or shared.

## Android APK

Prerequisites:

- JDK 17
- Android SDK with build-tools `34.0.0` and platform `android-34`
- `zip` on the `PATH`

The build script expects `JAVA_HOME` and `ANDROID_HOME` at `~/tools/jdk` and `~/tools/android-sdk` by default; set them to your own paths if needed.

```bash
npm run build:apk
```

This rebuilds the single-file HTML, then writes `downloads/ridgeline-auto-shop.apk`. The APK is debug-signed with `~/.android/debug.keystore` (generated on first run), which is suitable for sideloading but not for store distribution.

## CI

The Build workflow in `.github/workflows/build.yml` runs `npm ci`, `npm run build`, and `npm run build:single` on every push. The APK build is excluded because the default runner does not include the Android SDK.

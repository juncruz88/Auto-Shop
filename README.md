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

This rebuilds the single-file HTML, then writes `downloads/ridgeline-auto-shop.apk`. It is signed with the checked-in `android-apk/debug.keystore` (alias `androiddebugkey`, password `android`), so every build shares the same signature and later builds can install over earlier ones. The key is for sideloading only, not store distribution.

The first build using this fixed key must be installed after uninstalling any earlier build signed with a different debug key. Uninstalling clears the app's local data, so export a backup first. After that one-time uninstall, future builds update in place.

## CI

The Build workflow in `.github/workflows/build.yml` runs on every push in two independent build jobs:

- **Web and single-file build** — `npm ci`, `npm run build`, and `npm run build:single`.
- **Android APK** — installs JDK 17, Android SDK build-tools 34.0.0 and platform android-34, runs `npm run build:apk`, and uploads the APK and single-file HTML as the `ridgeline-auto-shop-android` artifact. The Android SDK is cached between runs; the APK is debug-signed.

Pushing a version tag, for example `v1.0.0`, also publishes a GitHub Release with the signed APK and single-file HTML attached, so they can be downloaded without a GitHub login and without dealing with artifact expiration.

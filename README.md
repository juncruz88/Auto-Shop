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

## Tests

```bash
npm test
```

Runs the backup-normalisation and release-tag parser tests with Vitest. The same command runs in CI before either build job.

## Automatic backups

On Android, every automatic snapshot is also written to `Downloads/Ridgeline Auto Shop` and the newest 10 are kept. These files are outside the app's private data, so they remain after clearing the app's storage; the Settings page lists them for restore. Android 10 and newer uses MediaStore and needs no storage permission. Android 6–9 asks for the legacy storage permission the first time it saves to shared Downloads and falls back to IndexedDB if permission is denied.

Settings → **Extra backup folder** can also copy each new snapshot to a folder chosen through Android's system picker. That folder can be on a USB SSD, an SD card, or a Google Drive account. The app keeps access across launches with a persisted URI permission. A Google Drive folder needs a connection while the snapshot is written; the provider syncs it afterward. Removing the folder stops future copies and leaves existing files in place. This option is Android-only: browsers cannot keep a Google Drive folder without a separate sign-in integration.

On the web the app uses IndexedDB. Clearing all site data removes IndexedDB, so export a JSON backup before clearing browser data.

## Android APK

Prerequisites:

- JDK 17
- Android SDK with build-tools `34.0.0` and platform `android-34`
- `zip` on the `PATH`

The build script expects `JAVA_HOME` and `ANDROID_HOME` at `~/tools/jdk` and `~/tools/android-sdk` by default; set them to your own paths if needed.

```bash
npm run build:apk
```

This rebuilds the single-file HTML, then writes `downloads/ridgeline-auto-shop.apk`. Set `VERSION_NAME` (for example `1.2.3`) and `VERSION_CODE` (a positive integer) to override the defaults of `1.0` and `1`; CI sets both from the release tag. It is signed with the checked-in `android-apk/debug.keystore` (alias `androiddebugkey`, password `android`), so every build shares the same signature and later builds can install over earlier ones. The key is for sideloading only, not store distribution.

The first build using this fixed key must be installed after uninstalling any earlier build signed with a different debug key. Uninstalling clears the app's local data, so export a backup first. After that one-time uninstall, future builds update in place.

## CI

The Build workflow in `.github/workflows/build.yml` runs on every push with a test job and two independent build jobs:

- **Tests** — `npm ci` and `npm test`; both build jobs wait for it to pass.
- **Web and single-file build** — `npm ci`, `npm run build`, and `npm run build:single`.
- **Android APK** — installs JDK 17, Android SDK build-tools 34.0.0 and platform android-34, runs `npm run build:apk`, checks the APK version against the release tag, and uploads the APK and single-file HTML as the `ridgeline-auto-shop-android` artifact. The Android SDK is cached between runs; the APK is debug-signed.

Pushing a semver tag such as `v1.2.3` builds the APK with version name `1.2.3` and a version code derived from the tag, then publishes a GitHub Release with the signed APK, the single-file HTML, `SHA256SUMS`, and `INSTALL.md` attached. Release assets can be downloaded without a GitHub login and do not expire.

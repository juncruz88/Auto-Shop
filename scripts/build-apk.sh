#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/tools/android-sdk}"
export PATH="$JAVA_HOME/bin:$PATH"
BUILD_TOOLS="$ANDROID_HOME/build-tools/34.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-34/android.jar"
BUILD="$ROOT/.apk-build"
OUT="$ROOT/downloads/ridgeline-auto-shop.apk"

for tool in "$BUILD_TOOLS/aapt2" "$BUILD_TOOLS/d8" "$BUILD_TOOLS/zipalign" "$BUILD_TOOLS/apksigner"; do
  [ -x "$tool" ] || { echo "Missing $tool — install Android build-tools 34.0.0"; exit 1; }
done
[ -f "$PLATFORM" ] || { echo "Missing android.jar — install platforms;android-34"; exit 1; }

echo "1/6 Building single-file web app"
node "$ROOT/scripts/build-single-file.mjs"

rm -rf "$BUILD"
mkdir -p "$BUILD/assets" "$BUILD/gen" "$BUILD/classes"
cp "$ROOT/downloads/ridgeline-auto-shop.html" "$BUILD/assets/index.html"

echo "2/6 Packaging resources"
"$BUILD_TOOLS/aapt2" compile --dir "$ROOT/android-apk/res" -o "$BUILD/res.zip"
"$BUILD_TOOLS/aapt2" link \
  -o "$BUILD/app-unsigned.apk" \
  -I "$PLATFORM" \
  --manifest "$ROOT/android-apk/AndroidManifest.xml" \
  --java "$BUILD/gen" \
  --min-sdk-version 23 \
  --target-sdk-version 34 \
  --version-code 1 \
  --version-name 1.0 \
  -A "$BUILD/assets" \
  "$BUILD/res.zip"

echo "3/6 Compiling Java"
find "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
echo "$ROOT/android-apk/src/ph/ridgeline/autoshop/MainActivity.java" >> "$BUILD/sources.txt"
"$JAVA_HOME/bin/javac" --release 17 -classpath "$PLATFORM" -d "$BUILD/classes" @"$BUILD/sources.txt"

echo "4/6 Dexing"
find "$BUILD/classes" -name '*.class' > "$BUILD/classes.txt"
"$BUILD_TOOLS/d8" --lib "$PLATFORM" --min-api 23 --output "$BUILD" $(cat "$BUILD/classes.txt")

echo "5/6 Aligning"
cp "$BUILD/app-unsigned.apk" "$BUILD/app-dex.apk"
(cd "$BUILD" && zip -q -j app-dex.apk classes.dex)
"$BUILD_TOOLS/zipalign" -f -p 4 "$BUILD/app-dex.apk" "$BUILD/app-aligned.apk"

echo "6/6 Signing"
KEYSTORE="$HOME/.android/debug.keystore"
mkdir -p "$(dirname "$KEYSTORE")"
if [ ! -f "$KEYSTORE" ]; then
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -keystore "$KEYSTORE" \
    -storepass android -keypass android \
    -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" > /dev/null 2>&1
fi
mkdir -p "$ROOT/downloads"
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out "$OUT" \
  "$BUILD/app-aligned.apk"
"$BUILD_TOOLS/apksigner" verify --print-certs "$OUT" | head -3
rm -rf "$BUILD"
echo "APK: $OUT ($(du -h "$OUT" | cut -f1))"

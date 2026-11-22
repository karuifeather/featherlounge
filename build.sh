#!/usr/bin/env bash
# Builds the FeatherLounge APK with the plain Android SDK tools (no Gradle).
#
#   ./build.sh                          # debug-signed build -> featherlounge.apk
#   YT_CLIENT_ID=... YT_CLIENT_SECRET=... ./build.sh     # pin the YouTube sign-in client (optional)
#   KEYSTORE=... KEYSTORE_PASS=... KEY_ALIAS=... ./build.sh   # sign with your own key
#
# Environment (all optional):
#   ANDROID_HOME     Android SDK root            (default: ~/Android/Sdk)
#   BUILD_TOOLS      build-tools version         (default: 35.0.0)
#   PLATFORM         platform API level          (default: 34)
#   APK_NAME         output file name            (default: featherlounge.apk)
#   KEYSTORE         signing keystore            (default: ~/.android/featherlounge.keystore, created if missing)
#   KEYSTORE_PASS    keystore password           (default: android - debug key only)
#   KEY_ALIAS        key alias                   (default: featherlounge)
#   KEY_PASS         key password                (default: same as KEYSTORE_PASS)
#   VERSION_NAME     version to stamp, e.g. 0.2.0 (default: the manifest's)
#   YT_CLIENT_ID / YT_CLIENT_SECRET   optional: pin the YouTube sign-in client; falls back to ./config.local.js
set -euo pipefail
cd "$(dirname "$0")"

SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}
BT=$SDK/build-tools/${BUILD_TOOLS:-35.0.0}
JAR=$SDK/platforms/android-${PLATFORM:-34}/android.jar
OUT=${APK_NAME:-featherlounge.apk}
KS=${KEYSTORE:-$HOME/.android/featherlounge.keystore}
KS_PASS=${KEYSTORE_PASS:-android}
KS_ALIAS=${KEY_ALIAS:-featherlounge}
KEY_PASS=${KEY_PASS:-$KS_PASS}

[ -x "$BT/aapt2" ] || { echo "error: build-tools not found at $BT (set ANDROID_HOME / BUILD_TOOLS)" >&2; exit 1; }
[ -f "$JAR" ]      || { echo "error: android.jar not found at $JAR (set ANDROID_HOME / PLATFORM)" >&2; exit 1; }

B=build
rm -rf "$B"; mkdir -p "$B/classes" "$B/dex" "$B/assets"

# Stage assets so an optional pinned sign-in client is injected into the build copy only, never into the source tree.
cp -r assets/. "$B/assets/"
# Turn debloat/packages.txt into the list the setup screen reads (staged copy only).
awk -F'|' '!/^[[:space:]]*(#|$)/ { for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i);
  gsub(/\047/, "", $2); gsub(/\047/, "", $4);
  printf "%s{ pkg: \047%s\047, label: \047%s\047, category: \047%s\047, note: \047%s\047 }", (n++ ? ",\n  " : "window.DEBLOAT_LIST = [\n  "), $1, $2, $3, $4 }
  END { print "\n];" }' debloat/packages.txt > "$B/assets/debloat.js"
if [ -n "${YT_CLIENT_ID:-}" ] && [ -n "${YT_CLIENT_SECRET:-}" ]; then
  re='^[A-Za-z0-9._~-]+$'
  [[ $YT_CLIENT_ID =~ $re && $YT_CLIENT_SECRET =~ $re ]] || { echo "error: YT_CLIENT_ID/YT_CLIENT_SECRET contain unexpected characters" >&2; exit 1; }
  printf "window.FL_CONFIG = { ytClientId: '%s', ytClientSecret: '%s' };\n" "$YT_CLIENT_ID" "$YT_CLIENT_SECRET" > "$B/assets/config.js"
  echo "YouTube sign-in client: pinned (from environment)"
elif [ -f config.local.js ]; then
  cp config.local.js "$B/assets/config.js"
  echo "YouTube sign-in client: pinned (from config.local.js)"
else
  echo "YouTube sign-in client: discovered at runtime"
fi

# Release builds stamp the version from VERSION_NAME (CI passes the tag); the code grows with the version.
version_args=()
if [ -n "${VERSION_NAME:-}" ]; then
  IFS=. read -r major minor patch _ <<< "${VERSION_NAME%%[-+]*}"
  VERSION_CODE=${VERSION_CODE:-$((major * 1000000 + minor * 1000 + patch))}
  version_args=(--replace-version --version-name "$VERSION_NAME" --version-code "$VERSION_CODE")
  echo "version: $VERSION_NAME ($VERSION_CODE)"
fi

"$BT/aapt2" compile --dir res -o "$B/res.zip"
"$BT/aapt2" link -o "$B/base.apk" -I "$JAR" --manifest AndroidManifest.xml -A "$B/assets" \
  --min-sdk-version 26 --target-sdk-version 34 "${version_args[@]}" "$B/res.zip"
javac -source 8 -target 8 -Xlint:-options -cp "$JAR" -d "$B/classes" src/io/github/karuifeather/featherlounge/*.java
"$BT/d8" --lib "$JAR" --min-api 26 --output "$B/dex" $(find "$B/classes" -name '*.class')
cp "$B/base.apk" "$B/unsigned.apk" && (cd "$B/dex" && zip -q ../unsigned.apk classes.dex)

if [ ! -f "$KS" ]; then
  echo "creating local debug keystore at $KS"
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KEY_PASS" -alias "$KS_ALIAS" \
    -dname "CN=FeatherLounge" -keyalg RSA -keysize 2048 -validity 10000 >/dev/null 2>&1
fi
rm -f "$OUT"   # so a failed signing can never leave a stale APK behind
"$BT/zipalign" -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KEY_PASS" --ks-key-alias "$KS_ALIAS" \
  --out "$OUT" "$B/aligned.apk" 2>&1 | grep -v -i "^WARNING" || true
rm -f "$OUT.idsig"
[ -f "$OUT" ] || { echo "error: signing failed" >&2; exit 1; }
echo "built: $(pwd)/$OUT"

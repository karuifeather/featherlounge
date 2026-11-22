# Building

FeatherLounge builds with the plain Android SDK command-line tools. There is **no Gradle**.

## Requirements

- Linux or macOS with `bash`, `zip`
- JDK 17 or newer (`javac`, `keytool`)
- Android SDK with **platform 34** and **build-tools 35.0.0**

```bash
sdkmanager "platforms;android-34" "build-tools;35.0.0"
export ANDROID_HOME=$HOME/Android/Sdk      # wherever your SDK lives
```

## Build

```bash
./build.sh        # -> featherlounge.apk
```

The first run creates a local **debug** signing key at `~/.android/featherlounge.keystore`. Keep using the same key so `adb install -r` can update an installed copy.

## Options (environment variables)

| Variable                                             | Default             | Purpose                                                        |
| ---------------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| `ANDROID_HOME`                                       | `~/Android/Sdk`     | SDK location                                                   |
| `BUILD_TOOLS` / `PLATFORM`                           | `35.0.0` / `34`     | SDK versions                                                   |
| `APK_NAME`                                           | `featherlounge.apk` | Output file                                                    |
| `KEYSTORE`, `KEYSTORE_PASS`, `KEY_ALIAS`, `KEY_PASS` | local debug key     | Sign with your own key                                         |
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET`                   | unset               | Pin the YouTube sign-in client ([docs/youtube.md](youtube.md)) |

These are optional: by default the app discovers the sign-in client at runtime. Instead of exporting the variables you can put them in a git-ignored `config.local.js` (copy the shape of `assets/config.js`). They are injected into the build copy only and never written to the source tree.

## Preview in a desktop browser

```bash
python3 -m http.server -d assets 8000     # then open http://localhost:8000
```

Arrow keys and Enter work, and the Stremio and public YouTube rows load. In a browser, opening a card opens the web version (YouTube / Stremio Web) in a new tab instead of the TV apps. YouTube sign-in needs the Android app (it uses the native HTTP bridge).

## Project layout

```
assets/      the UI (HTML/CSS/JS) bundled into the APK
src/         Android shell (one Activity hosting a WebView)
res/         icons, banner, colors
branding/    logo/icon source assets and generator
build.sh     build script
```

## CI and releases

`.github/workflows/build.yml` builds on every push and pull request and uploads the APK as the **FeatherLounge-apk** artifact.

Pushing a tag such as `v0.2.0` also publishes a GitHub release, which **requires a persistent signing key** so users can update in place. Add these repository secrets:

| Secret                      | Value                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 your.keystore` (Linux) or `base64 -i your.keystore \| tr -d '\n'` (macOS) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password                                                                     |
| `ANDROID_KEY_ALIAS`         | key alias                                                                             |
| `ANDROID_KEY_PASSWORD`      | key password (omit if same as keystore)                                               |

Without these secrets, normal builds still work but are signed with a throwaway key, and tag builds fail on purpose. An APK signed with a different key cannot update an installed copy; it must be uninstalled first.

CI does not inject any YouTube credentials, and none are stored in the repository or the APK. Published APKs discover the sign-in client on the device when it is first needed ([docs/youtube.md](youtube.md)).

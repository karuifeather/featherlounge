# Architecture

FeatherLounge is one Android `Activity` hosting a full-screen `WebView` that loads a local web UI.

```
MainActivity (src/)            WebView  ->  assets/index.html + *.js + style.css
  JS bridge "FeatherLounge"                         config.js   (build-time settings)
   youtube(id)    -> VIEW intent to SmartTube
   stremio(t,id)  -> stremio:/// deep link to Stremio
   app(name)      -> launch SmartTube / Stremio / Settings / Wi-Fi
   http(...)      -> native HTTP (for endpoints without CORS headers)
   isDefaultHome() / requestHome()        -> home role (setup step 2)
   removableApps() / removeApp(pkg)      -> app cleanup (setup step 3)
   version() / installUpdate(url)         -> in-app updates (update.js, Updater.java)
```

The JS bridge is `FeatherLounge` and the package id is `io.github.karuifeather.featherlounge`. Changing the package id makes Android treat it as a new app (and signs you out).

## UI (`assets/`)

- **Stage.** The UI is laid out on a fixed 1920x1080 stage that is scaled to the WebView's layout viewport, so it looks the same on any TV resolution.
- **Rows.** `ROWS` in `assets/settings.js` lists the carousels. Each row has a `load()` returning items (`{src, id, title, by, img, bg, desc}`). Add a row by adding one entry.
- **Trakt.** `trakt.js` links an account with the device-code flow, builds the Trakt rows, and `withoutWatched()` filters every Stremio row against the watched list. Trakt has no artwork, so posters come from Stremio's image service by IMDb id.
- **Data sources.** Stremio's public Cinemeta catalog (movies/shows), TMDB for top-rated rows when the build has a key (`tmdb.js`; TMDB items get their IMDb id only when opened, see `resolveImdb`), YouTube's TV feed when signed in, Piped public instances for fallback trending. Results are cached in `localStorage` for 30 minutes and shown stale if the network fails.
- **Motion.** Row and carousel scrolling is a per-frame glide toward a target position (`glideTo()`), so repeated key presses stay smooth. Focus effects use only `transform`/`opacity`. The hero updates after focus settles.
- **Navigation.** Arrow keys move focus (`setFocus`), Enter opens (`activate`), Back returns to the top bar.

## First-run setup

`assets/setup.js` shows a four-step overlay once (`SETUP_VERSION` in `settings.js`), and again from the **Setup** shortcut. Finishing the last step also removes that shortcut for good (`fl.setupCompleted`); skipping keeps it. `DeviceSetup.java` does the native part. Android can't uninstall apps or set the home role silently, so it opens the system dialogs and re-checks on resume (`onWake`). Protected packages are filtered out natively.

## Updates

`assets/update.js` reads the latest GitHub release (cached 6 hours), compares its tag to `version()`, and shows an **Update available** shortcut. `Updater.java` downloads the APK into a `PackageInstaller` session and Android asks the user to confirm. Only URLs under this repository's `releases/download/` are accepted, and Android rejects an APK not signed with the installed key. CI stamps the version from the tag (`VERSION_NAME`), and every release also uploads a fixed-name `FeatherLounge.apk` so the `releases/latest/download/` link never changes.

## Sign-in

Google's device-code flow against the YouTube TV client, then InnerTube `browse` (`FEwhat_to_watch`) with continuation tokens for longer rows. The OAuth client is discovered on the device by `youtube-client.js` (or pinned through `window.FL_CONFIG`). See [youtube.md](youtube.md).

## Branding

`branding/generate.py` traces a source feather PNG and produces the SVG/PNG assets, Android icons and the TV banner. Generated files are committed, so building the app does not need it.

## Launch screen and sound

On Android 12+ the system splash shows the feather (`res/drawable-nodpi/launch_feather.png`) on the brand colour until the page paints. The page's `#splash` then takes over with the feather in the same spot, so there is no jump. On a cold start `LaunchSound.java` prepares `res/raw/launch_chime.ogg` in `onCreate`; when the page calls `playLaunchSound()` it starts the sound and calls back `window.onIntroStart`, which adds `.go` and releases every animation, so picture and sound start together. If the sound never starts (muted, error) the visuals begin after 300 ms anyway. A relaunch in the same process shows a still logo with no sound. The animation is timed to the sound's beats in `assets/intro-beats.css`; if you replace the sound, retime that file. Everything animated uses only `transform` and `opacity`. `VISUAL_DELAY_MS` in `app.js` compensates for soundbar latency.

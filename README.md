<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/lockup-dark.svg">
    <img alt="FeatherLounge" src="branding/lockup-light.svg" height="64">
  </picture>
</p>

<p align="center"><b>A fast, modern home screen for Google TV / Android TV.</b><br>
Recommendations from YouTube and Stremio on one screen, opened in <a href="https://github.com/yuliskov/SmartTube">SmartTube</a> and <a href="https://www.stremio.com">Stremio</a>.</p>

---

## What it does

- **One home screen, two sources.** Carousels of YouTube videos and Stremio movies/shows, with a large hero for whatever is focused.
- **Opens in your apps.** A YouTube card plays in **SmartTube**; a movie or show opens in **Stremio**.
- **Personalized YouTube (optional).** Sign in once with a code on your phone to get your own YouTube recommendations. Without it you get public trending videos. See [docs/youtube.md](docs/youtube.md).
- **Recommendations tuned to you (optional).** With a free TMDB key in the build, pick your streaming services, genres and a few favourite titles with the remote and get "Because you liked…", "on your services" and hidden-gem rows. See [docs/recommendations.md](docs/recommendations.md).
- **Trakt (optional).** Link your Trakt account with a code on your phone to get "Because you watched…", your watchlist, Trakt's recommendations, and to hide what you've already seen. See [docs/trakt.md](docs/trakt.md).
- **First-run setup.** Makes itself the home screen and helps you clear out unused apps. Once you finish it, the Setup shortcut disappears for good (skipping keeps it).
- **Built for a remote.** D-pad navigation, smooth scrolling, shortcuts for SmartTube, Stremio, Network and Settings.
- **Updates itself on request.** Tells you when a new release is out; you choose when to install.
- **A proper launch.** A branded intro (the feather drifts in and settles with a short bass-weighted sound, then the name rises) plays on a cold start; relaunching shows a quiet static logo with no sound.
- **Tiny and private.** Under 400 KB, no accounts, no analytics, no servers of its own.

## Requirements

- Android TV / Google TV, Android 8.0 or newer.
- [SmartTube](https://github.com/yuliskov/SmartTube) (`org.smarttube.stable`) and [Stremio](https://www.stremio.com) (`com.stremio.one`) installed. Cards for an app that is not installed do nothing.

## Install on the TV

Install **Downloader** from the Play Store, allow it to install unknown apps, then open
`github.com/karuifeather/featherlounge/releases/latest/download/FeatherLounge.apk`. Details and updates: [docs/installing.md](docs/installing.md).

## Build and install with adb

```bash
# 1. Build (needs JDK 17+ and the Android SDK, see docs/building.md)
./build.sh                       # -> featherlounge.apk

# 2. Install on your TV (enable "Network debugging" in Developer options first)
adb connect <tv-ip>:5555
adb install -r featherlounge.apk
```

Open **FeatherLounge** from the TV's app list. Details and troubleshooting: [docs/installing.md](docs/installing.md).

## Documentation

|                                                                |                                                    |
| -------------------------------------------------------------- | -------------------------------------------------- |
| [docs/building.md](docs/building.md)                           | Build from source, signing, environment variables  |
| [docs/installing.md](docs/installing.md)                       | Install over `adb`, set as home, update, uninstall |
| [docs/youtube.md](docs/youtube.md)                             | YouTube sign-in: how it works, privacy, risks      |
| [docs/recommendations.md](docs/recommendations.md)             | Personalized movie/show rows (TMDB key)            |
| [docs/trakt.md](docs/trakt.md)                                 | Link Trakt: history, watchlist, hide watched       |
| [docs/architecture.md](docs/architecture.md)                   | How the app is put together; adding a row          |
| [docs/debloat.md](docs/debloat.md)                             | Optional: clean unwanted apps off a TV with `adb`  |
| [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md) | Reporting issues, contributing                     |

## Releases

Pushing a `v*` tag builds a signed APK and attaches it to a GitHub release (see [docs/building.md](docs/building.md#ci-and-releases)). Optional YouTube sign-in works in official builds with no setup (see [docs/youtube.md](docs/youtube.md)).

## Disclaimer

FeatherLounge is an independent project. It is not affiliated with or endorsed by Google, YouTube, Stremio or SmartTube; all names and trademarks belong to their owners (including Trakt). The optional YouTube sign-in uses an **unofficial, undocumented** interface and may violate YouTube's Terms of Service. Use it at your own risk (see [docs/youtube.md](docs/youtube.md)).

This product uses the TMDB API but is not endorsed or certified by TMDB.

## License

Code: [MIT](LICENSE). The FeatherLounge name and the artwork in [`branding/`](branding/) are not covered by the MIT license, see [branding/README.md](branding/README.md).

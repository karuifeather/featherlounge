# Personalized movie and show recommendations (optional)

Without this, the Stremio rows are Stremio's public popular lists. With a free **TMDB API key** in the build, FeatherLounge adds rows tuned to you, and a **For you** shortcut in the top bar to set them up with the remote.

## What you get

- **Because you liked …** (up to three rows), from titles you pick.
- **Movies / Shows on your services**, limited to the streaming services you choose and your genres.
- **Hidden gems** (highly rated, less famous) and **Trending this week**.

Cards still open in **Stremio**. Nothing needs typing: pick services, genres and favourites with the D-pad.

## Setup

1. Create a free account at <https://www.themoviedb.org> and request an API key (Settings, API).
2. Build with it:

```bash
TMDB_API_KEY=your_v3_key ./build.sh
# or put it in a git-ignored config.local.js: window.FL_CONFIG = { ytClientId: '', ytClientSecret: '', tmdbKey: '...' };
```

For GitHub releases, add a repository secret named `TMDB_API_KEY`.

The key ends up inside the APK, so anyone can extract it. TMDB keys are free and only identify the app, which is fine, but don't reuse one you care about.

Without a key the app behaves as before and the **For you** shortcut is hidden.

## What is stored, and where

Your region (from the TV's language), services, genres and picked titles stay in the app's private storage on the TV (`localStorage`). Requests go from the TV straight to `api.themoviedb.org` and `image.tmdb.org`; they carry the API key and the titles or filters being asked for. Nothing is sent to any server operated by this project.

Streaming availability data comes from TMDB (provided by JustWatch).

## Limits

- It doesn't know what you've already watched, so a title you've seen can still appear. (Linking a watch history is planned.)
- Availability depends on the region taken from the TV's language setting.

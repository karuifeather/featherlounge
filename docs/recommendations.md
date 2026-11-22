# Top-rated rows from TMDB (optional)

Without this, the Stremio rows are Stremio's public popular lists. With a free **TMDB API key** in the build, FeatherLounge adds quality rows that need no account. For rows built from what _you_ watch, link [Trakt](trakt.md).

## What you get

- **Top rated movies** and **Top rated shows**.
- **Hidden gems** (highly rated, less famous).
- **Trending this week** (only when Trakt is not set up; Trakt has its own trending rows).

Cards still open in **Stremio**. There is nothing to configure on the TV.

## Setup

1. Create a free account at <https://www.themoviedb.org> and request an API key (Settings, API).
2. Build with it:

```bash
TMDB_API_KEY=your_v3_key ./build.sh
# or put it in a git-ignored config.local.js: window.FL_CONFIG = { ytClientId: '', ytClientSecret: '', tmdbKey: '...' };
```

For GitHub releases, add a repository secret named `TMDB_API_KEY`.

The key ends up inside the APK, so anyone can extract it. TMDB keys are free and only identify the app, which is fine, but don't reuse one you care about.

Without a key these rows are simply absent.

## What is stored, and where

Fetched lists are cached in the app's private storage on the TV (`localStorage`). Requests go from the TV straight to `api.themoviedb.org` and `image.tmdb.org`; they carry the API key and the list being asked for. Nothing is sent to any server operated by this project.

## Limits

- It doesn't know what you've already watched, so a title you've seen can still appear. (Linking a watch history is planned.)
- Availability depends on the region taken from the TV's language setting.

# Trakt (optional)

Linking [Trakt](https://trakt.tv) lets FeatherLounge use your watch history: **Recommended movies/shows** from Trakt, **Because you watched …** rows, **Your watchlist**, and it **hides titles you have already watched** from the other Stremio rows. Cards still open in **Stremio**.

Trakt is separate from the [TMDB rows](recommendations.md); you can use either or both.

## Getting your history into Trakt

FeatherLounge only reads Trakt. To fill your history, turn on Stremio's own Trakt link (in your Stremio account settings), and Stremio will scrobble what you watch. No Stremio addon is needed.

## Setup (for whoever builds the app)

1. Create an app at <https://trakt.tv/oauth/applications/new>. Set the redirect URI to `urn:ietf:wg:oauth:2.0:oob`. You get a **Client ID**. An app registered for PKCE has no secret and needs none; an older app also has a **Client Secret**, which you may pass as well.
2. Build with them:

```bash
TRAKT_CLIENT_ID=... ./build.sh
# or in a git-ignored config.local.js: window.FL_CONFIG = { ..., traktId: '...' };
```

For GitHub releases add a repository secret `TRAKT_CLIENT_ID` (and `TRAKT_CLIENT_SECRET` if you have one).

The Client ID ends up inside the APK. Trakt treats it as public: it identifies the app, not a person, and cannot be turned into tokens on its own. Without it the app behaves as before and the **Link Trakt** shortcut is hidden.

## Linking

1. Choose **Link Trakt** (top bar). The TV shows a code.
2. On a phone or computer open the address shown on the TV and enter the code.
3. The TV receives a token and rebuilds the rows.

**Unlink Trakt** (press OK twice) deletes the token and everything cached from your account. You can also revoke access at <https://trakt.tv/oauth/authorized_applications>.

## What is stored, and where

The access and refresh tokens and cached lists (history, recommendations, watchlist; refreshed every 30 minutes) are in the app's private storage on the TV (`localStorage`, not backed up). Requests go from the TV straight to `api.trakt.tv`; artwork comes from Stremio's public image service (`images.metahub.space`). Nothing is sent to any server operated by this project.

## Limits

- A show you have started counts as watched and is hidden from the other rows (your watchlist still shows it).
- Rows need titles with an IMDb id.
- Trakt does not provide artwork, so a title Stremio's image service doesn't know shows without a poster.

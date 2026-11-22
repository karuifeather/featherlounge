# YouTube sign-in (optional)

Without sign-in, YouTube rows show **public trending and search** results. With sign-in they show **your own recommendations**. Either way, a card **opens in SmartTube**.

> **Warning.** Personalized recommendations use an **unofficial, undocumented** YouTube TV interface, the same approach SmartTube and yt-dlp take. It is not an official API, may break at any time, and may violate YouTube's Terms of Service. Use it at your own risk and only with an account you are willing to risk.

## Setup

None. This repository and the APK **do not contain** any OAuth client credentials. The first time sign-in is needed, the app reads the public OAuth client of "YouTube on TV" from YouTube's own TV web app on your device (`assets/youtube-client.js`) and caches it for a week. If that fails (offline, or YouTube changed the page), choosing **Sign in** shows an error and the public rows keep working.

To pin a specific client instead (for example if the discovery stops working), pass it when you build:

```bash
YT_CLIENT_ID=... YT_CLIENT_SECRET=... ./build.sh
# or put them in a git-ignored config.local.js (same shape as assets/config.js)
```

## How sign-in works

1. Choose **Sign in** (top bar or the card in the first row). The TV shows a code.
2. On a phone or computer open **google.com/device** and enter the code.
3. The TV receives a token and loads your feed.

## What is stored, and where

- The discovered YouTube TV client (for a week) and an access token and a refresh token, in the app's private WebView storage on the TV (`localStorage`). `allowBackup` is off, so they are not included in backups.
- Nothing is sent to any server operated by this project. Requests go from your TV straight to Google (the TV client page, sign-in and your feed), YouTube's image CDN, Stremio's public catalog, TMDB and Trakt (only if the build has their keys, see [recommendations.md](recommendations.md) and [trakt.md](trakt.md)) and public Piped instances (fallback trending).

**Sign out** (top bar, press OK twice) deletes the tokens. You can also revoke access at <https://myaccount.google.com/permissions>, or uninstall the app.

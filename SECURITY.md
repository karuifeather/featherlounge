# Security

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private vulnerability reporting (**Security → Report a vulnerability**) on this repository.

## Scope and design notes

- The app has no backend. It talks directly to Google/YouTube (only if you sign in), YouTube's image CDN, Stremio's public catalog and public Piped instances.
- YouTube tokens are stored in the app's private WebView storage; backups are disabled (`allowBackup="false"`). See [docs/youtube.md](docs/youtube.md).
- No OAuth client credentials are committed or bundled in release APKs. The app reads YouTube's own TV client on the device when sign-in is first used.
- The WebView loads only bundled local files (`file:///android_asset`). It enables file-URL cross-origin access so the local UI can fetch public catalogs; do not load remote pages into it.
- Never commit keystores, `.env` files or `config.local.js` (all are git-ignored).

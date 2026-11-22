// Optional build-time overrides. Leave empty: the YouTube sign-in client is then discovered at runtime.
// ./build.sh can pin it from YT_CLIENT_ID / YT_CLIENT_SECRET or config.local.js. See docs/youtube.md.
// traktId (a Trakt API app's Client ID; traktSecret only if the app has one) turns on Trakt linking; see docs/trakt.md.
// tmdbKey (a free TMDB API key) turns on the personalised movie/show rows; see docs/recommendations.md.
window.FL_CONFIG = {
  ytClientId: '',
  ytClientSecret: '',
  tmdbKey: '',
  traktId: '',
  traktSecret: '',
};

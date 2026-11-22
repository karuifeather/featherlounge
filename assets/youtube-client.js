'use strict';
// The OAuth client used for YouTube sign-in. Nothing is bundled with the app: it is read from YouTube's own
// TV web app on the user's device the first time it is needed, then cached.
// (The same unofficial approach other third-party TV apps take. It breaks if YouTube restructures that page.)

const CLIENT_PAGE_URL = 'https://www.youtube.com/tv';
const TV_USER_AGENT = 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version';
const CLIENT_CACHE_KEY = 'yt_client';
const CLIENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Minified names change on every YouTube release, so these anchor on stable pieces: the script tag's id, and the
// client entry that carries the sign-in scope this app requests (see OAUTH.scope).
const BASE_SCRIPT_RE = /<script[^>]*\bid="base-js"[^>]*\bsrc="([^"]+)"/;
const CLIENT_ENTRY_RE =
  /clientId:"([\w.-]+\.apps\.googleusercontent\.com)",\w+:"([\w-]+)",scopes:"http:\/\/gdata\.youtube\.com /;

async function fetchPageText(url) {
  const response = await http('GET', url, { 'User-Agent': TV_USER_AGENT });
  if (response.status !== 200) throw new Error('client page ' + response.status);
  return response.text;
}

async function discoverYoutubeClient() {
  const page = await fetchPageText(CLIENT_PAGE_URL);
  const script = BASE_SCRIPT_RE.exec(page);
  if (!script) throw new Error('client script not found');
  const entry = CLIENT_ENTRY_RE.exec(await fetchPageText(new URL(script[1], CLIENT_PAGE_URL).href));
  if (!entry) throw new Error('client credentials not found');
  return { clientId: entry[1], clientSecret: entry[2] };
}

// A build can pin its own client (FL_CONFIG, see docs/youtube.md); otherwise it is discovered and cached.
const configuredClient = () =>
  CFG.ytClientId && CFG.ytClientSecret ? { clientId: CFG.ytClientId, clientSecret: CFG.ytClientSecret } : null;

let clientInFlight = null;
function youtubeClient() {
  const pinned = configuredClient();
  if (pinned) return Promise.resolve(pinned);
  return (
    clientInFlight ||
    (clientInFlight = cached(CLIENT_CACHE_KEY, discoverYoutubeClient, CLIENT_CACHE_TTL_MS).finally(() => {
      clientInFlight = null;
    }))
  );
}

// Drops the cached client so the next use re-discovers it (Google rejected it: it was probably rotated).
const forgetYoutubeClient = () => storage.remove(CLIENT_CACHE_KEY);

'use strict';
// YouTube account: stored tokens, token refresh, and the Google device-code sign-in overlay.
// Uses the unofficial TV (InnerTube) endpoints, the same approach SmartTube uses. The OAuth client comes from youtube-client.js.

const OAUTH = {
  scope: 'http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content',
  tokenUrl: 'https://www.youtube.com/o/oauth2/token',
  deviceCodeUrl: 'https://www.youtube.com/o/oauth2/device/code',
};
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const AUTH_KEY = 'yt_auth';
const FEED_CACHE_KEY = 'ytfeed3';
const auth = {
  get: () => storage.read(AUTH_KEY),
  set: (tokens) => storage.write(AUTH_KEY, tokens),
  clear: () => storage.remove(AUTH_KEY, FEED_CACHE_KEY),
};

const signedIn = () => !!auth.get();

// ---------- tokens ----------
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;
const REVOKED_ERRORS = ['invalid_grant', 'unauthorized_client'];

const oauthPost = (url, payload) => http('POST', url, JSON_HEADERS, JSON.stringify(payload));
const parseOauthReply = (response) => JSON.parse(response.text || '{}');
const expiryFrom = (reply) => Date.now() + reply.expires_in * 1000;
const clientParams = (client) => ({ client_id: client.clientId, client_secret: client.clientSecret });

// Google rejecting the client means the cached one is stale: forget it so the next attempt re-discovers it.
function checkClientAccepted(reply) {
  if (reply.error === 'invalid_client') forgetYoutubeClient();
}

// Returns a valid access token (refreshing it when needed), or null when signed out.
async function accessToken(forceRefresh) {
  const tokens = auth.get();
  if (!tokens) return null;
  if (!forceRefresh && Date.now() < tokens.exp - TOKEN_EXPIRY_MARGIN_MS) return tokens.access;

  const client = await youtubeClient();
  const reply = parseOauthReply(
    await oauthPost(OAUTH.tokenUrl, {
      ...clientParams(client),
      refresh_token: tokens.refresh,
      grant_type: 'refresh_token',
    }),
  );
  if (!reply.access_token) {
    checkClientAccepted(reply);
    if (REVOKED_ERRORS.includes(reply.error)) {
      auth.clear();
      throw { auth: true };
    }
    throw new Error(reply.error || 'token');
  }
  tokens.access = reply.access_token;
  tokens.exp = expiryFrom(reply);
  auth.set(tokens);
  return tokens.access;
}

// ---------- sign-in overlay (Google device-code flow) ----------
const DEVICE_GRANT_TYPE = 'http://oauth.net/grant_type/device/1.0';
const DEFAULT_POLL_INTERVAL_S = 5;
const SLOW_DOWN_STEP_MS = 5000;
const SIGN_OUT_CONFIRM_MS = 4000;

const MSG_CONTACTING = 'Contacting Google…';
const MSG_WAITING = 'Waiting for you to sign in · Back to cancel';

let loginRun = 0; // bumped on every start/cancel so stale loops stop themselves
const loginOpen = () => !$('#login').hidden;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function showLogin(code, url, message) {
  $('#login').hidden = false;
  $('#lcode').textContent = code;
  $('#lurl').textContent = url;
  $('#lmsg').textContent = message;
}

const newDeviceId = () => (crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-' + Date.now());

async function requestDeviceCode(client) {
  const response = await oauthPost(OAUTH.deviceCodeUrl, {
    client_id: client.clientId,
    scope: OAUTH.scope,
    device_id: newDeviceId(),
    model_name: 'FeatherLounge',
  });
  const device = JSON.parse(response.text);
  if (!device.user_code) {
    checkClientAccepted(device);
    throw new Error('no code');
  }
  return device;
}

function completeSignIn(reply) {
  auth.set({ access: reply.access_token, refresh: reply.refresh_token, exp: expiryFrom(reply) });
  $('#login').hidden = true;
  toast('Signed in to YouTube');
  rebuildAll();
}

// Polls until the user approves the code. Returns quietly if the overlay was cancelled meanwhile.
async function pollForSignIn(client, device, isCurrent) {
  let waitMs = (device.interval || DEFAULT_POLL_INTERVAL_S) * 1000;
  const deadline = Date.now() + device.expires_in * 1000;
  while (isCurrent() && Date.now() < deadline) {
    await sleep(waitMs);
    if (!isCurrent()) return;
    const reply = parseOauthReply(
      await oauthPost(OAUTH.tokenUrl, {
        ...clientParams(client),
        code: device.device_code,
        grant_type: DEVICE_GRANT_TYPE,
      }),
    );
    if (reply.access_token) {
      completeSignIn(reply);
      return;
    }
    checkClientAccepted(reply);
    if (reply.error === 'slow_down') waitMs += SLOW_DOWN_STEP_MS;
    else if (reply.error && reply.error !== 'authorization_pending') throw new Error(reply.error);
  }
  if (isCurrent()) throw new Error('code expired');
}

async function startLogin() {
  const run = ++loginRun;
  const isCurrent = () => run === loginRun;
  $('#ltitle').textContent = 'Sign in to YouTube';
  showLogin('…', '', MSG_CONTACTING);
  try {
    const client = await youtubeClient();
    const device = await requestDeviceCode(client);
    showLogin(device.user_code, device.verification_url.replace('https://', ''), MSG_WAITING);
    await pollForSignIn(client, device, isCurrent);
  } catch (e) {
    if (isCurrent()) $('#lmsg').textContent = 'Sign-in failed (' + (e.message || e) + ') · Back to close';
  }
}

function cancelLogin() {
  loginRun++;
  $('#login').hidden = true;
}

// ---------- account shortcut ----------
let signOutArmedUntil = 0;
function accountAction() {
  if (!auth.get()) {
    startLogin();
    return;
  }
  if (Date.now() < signOutArmedUntil) {
    auth.clear();
    signOutArmedUntil = 0;
    toast('Signed out of YouTube');
    rebuildAll();
  } else {
    signOutArmedUntil = Date.now() + SIGN_OUT_CONFIRM_MS;
    toast('Press OK again to sign out of YouTube');
  }
}

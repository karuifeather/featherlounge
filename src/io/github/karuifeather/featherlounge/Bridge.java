package io.github.karuifeather.featherlounge;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;

import java.util.function.BooleanSupplier;

/** The "FeatherLounge" object exposed to the page's JavaScript. It only delegates to other classes. */
class Bridge {
    private final WebView web;
    private final AppLauncher launcher;
    private final DeviceSetup setup;
    private final Updater updater;
    private final LaunchSound launchSound;
    private final BooleanSupplier onPageReady;
    private final HttpFetcher fetcher = new HttpFetcher();

    Bridge(WebView web, AppLauncher launcher, DeviceSetup setup, Updater updater, LaunchSound launchSound, BooleanSupplier onPageReady) {
        this.web = web;
        this.launcher = launcher;
        this.setup = setup;
        this.updater = updater;
        this.launchSound = launchSound;
        this.onPageReady = onPageReady;
    }

    /**
     * The page has its own splash laid out. True if the system splash is still up and will be released shortly,
     * after which the page is called back on window.onSplashGone; false if there is nothing to wait for.
     */
    @JavascriptInterface public boolean pageReady() {
        return onPageReady.getAsBoolean();
    }

    /** Runs the request off the UI thread, then reports back through window.__http(id, status, text). */
    @JavascriptInterface public void http(final int id, final String method, final String url, final String headers, final String body) {
        new Thread(() -> {
            HttpFetcher.Response response = fetcher.fetch(method, url, headers, body);
            String script = "window.__http(" + id + "," + response.status + "," + JSONObject.quote(response.text) + ")";
            web.post(() -> web.evaluateJavascript(script, null));
        }).start();
    }

    /** Starts the launch chime; true on the first launch of this process (the page then plays the full intro). */
    @JavascriptInterface public boolean playLaunchSound() {
        return launchSound.play();
    }

    @JavascriptInterface public void youtube(String videoId) {
        launcher.openYouTubeVideo(videoId);
    }

    @JavascriptInterface public void stremio(String type, String id) {
        launcher.openStremioDetail(type, id);
    }

    @JavascriptInterface public void app(String which) {
        if ("smarttube".equals(which)) launcher.openSmartTube();
        else if ("stremio".equals(which)) launcher.openStremio();
        else if ("settings".equals(which)) launcher.openSettings();
        else if ("wifi".equals(which)) launcher.openWifiSettings();
    }

    @JavascriptInterface public boolean isDefaultHome() {
        return setup.isDefaultHome();
    }

    @JavascriptInterface public boolean isHomeRoleHeld() {
        return setup.isHomeRoleHeld();
    }

    @JavascriptInterface public void requestHome() {
        setup.requestHome();
    }

    /** JSON array of {pkg, label, system}; never includes protected packages. */
    @JavascriptInterface public String removableApps() {
        return setup.removableApps();
    }

    @JavascriptInterface public void removeApp(String pkg) {
        setup.removeApp(pkg);
    }

    @JavascriptInterface public String version() {
        return updater.version();
    }

    /** Downloads and installs a release APK; the updater only accepts this project's GitHub release URLs. */
    @JavascriptInterface public void installUpdate(String url) {
        updater.install(url);
    }
}

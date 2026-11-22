package io.github.karuifeather.featherlounge;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.window.SplashScreenView;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Full-screen WebView host for the FeatherLounge home screen UI (assets/index.html). */
public class MainActivity extends Activity {
    private static final String PAGE_URL = "file:///android_asset/index.html";
    private static final String BRIDGE_NAME = "FeatherLounge";
    private static final String BACKGROUND_COLOR = "#09090f";

    // The system splash (Android 12+) is kept on screen until the page has painted, so the screen never goes blank
    // while the WebView starts. It is released by the page (see pageReady) or, at worst, by this timeout.
    private static final long SPLASH_HOLD_MAX_MS = 4000;
    private static final long SPLASH_FADE_MS = 250;

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile View splashView; // the held system splash, or null
    private boolean pageDrawn;
    private long visualStateId;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        holdSystemSplash();
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor(BACKGROUND_COLOR));
        configureSettings(web.getSettings());
        // The UI is driven by a remote and never scrolls the page: no native scroll bars or overscroll glow.
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        LaunchSound launchSound = new LaunchSound(this);
        launchSound.setOnStarted(() -> web.post(() -> web.evaluateJavascript("window.onIntroStart&&window.onIntroStart()", null)));
        launchSound.prepare();
        AppLauncher launcher = new AppLauncher(this);
        web.addJavascriptInterface(new Bridge(web, launcher, new DeviceSetup(this, launcher), new Updater(this, web, launcher), launchSound, this::onPageReady), BRIDGE_NAME);
        setContentView(web);
        web.loadUrl(PAGE_URL);
        hideBars();
    }

    /** Asking for the exit callback is what keeps the system splash up until we call remove() on it. */
    private void holdSystemSplash() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        getSplashScreen().setOnExitAnimationListener(view -> {
            splashView = view;
            ui.postDelayed(this::releaseSplash, SPLASH_HOLD_MAX_MS);
            if (pageDrawn) releaseSplash();
        });
    }

    /**
     * The page says it has laid out its own splash. Returns true if the system splash is being held, in which case
     * it is released once the renderer has really drawn that frame and the page is told (window.onSplashGone).
     * Called on a bridge thread.
     */
    private boolean onPageReady() {
        if (splashView == null) return false;
        runOnUiThread(() -> web.postVisualStateCallback(++visualStateId, new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) {
                pageDrawn = true;
                releaseSplash();
            }
        }));
        return true;
    }

    /** Fades the held system splash out, then tells the page. Safe to call more than once. */
    private void releaseSplash() {
        final View view = splashView;
        if (view == null) return;
        splashView = null;
        view.animate().alpha(0f).setDuration(SPLASH_FADE_MS).withEndAction(() -> {
            if (view instanceof SplashScreenView) ((SplashScreenView) view).remove();
            callPageHook("onSplashGone");
        }).start();
    }

    private static void configureSettings(WebSettings s) {
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowUniversalAccessFromFileURLs(true); // lets local UI fetch public catalog APIs
        s.setMediaPlaybackRequiresUserGesture(true);
    }

    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    /** Calls a page hook (window.onWake / window.onHome) if the page defined it. */
    private void callPageHook(String hook) {
        web.evaluateJavascript("window." + hook + "&&window." + hook + "()", null);
    }

    @Override protected void onResume() { super.onResume(); hideBars(); web.onResume(); callPageHook("onWake"); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); callPageHook("onHome"); }

    // This is a home screen: Back never exits it, it just returns focus to the top.
    @Override public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) { callPageHook("onHome"); return true; }
        return super.onKeyDown(code, e);
    }
}

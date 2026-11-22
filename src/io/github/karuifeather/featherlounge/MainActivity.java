package io.github.karuifeather.featherlounge;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;

/** Full-screen WebView host for the FeatherLounge home screen UI (assets/index.html). */
public class MainActivity extends Activity {
    private static final String PAGE_URL = "file:///android_asset/index.html";
    private static final String BRIDGE_NAME = "FeatherLounge";
    private static final String BACKGROUND_COLOR = "#09090f";

    // The window background shows the feather until the first frame, but the WebView needs another second or two to
    // paint its own page. A native copy of that same feather sits over the WebView until the page says it is drawn
    // (see pageReady), so the screen never goes blank in between. HOLD_MAX is the backstop if the page never answers.
    private static final long LAUNCH_HOLD_MAX_MS = 4000;
    private static final long LAUNCH_FADE_MS = 250;
    private static final int LAUNCH_FEATHER_PX = 320; // same size as res/drawable/launch_background.xml

    private WebView web;
    private FrameLayout root;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile View launchOverlay; // the native splash over the page, or null once released
    private long visualStateId;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
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
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor(BACKGROUND_COLOR));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        launchOverlay = buildLaunchOverlay();
        root.addView(launchOverlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ui.postDelayed(this::releaseLaunchOverlay, LAUNCH_HOLD_MAX_MS);
        setContentView(root);
        web.requestFocus();
        web.loadUrl(PAGE_URL);
        hideBars();
    }

    /** The feather on the brand colour, drawn exactly like the launch window so the hand-over is invisible. */
    private View buildLaunchOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.parseColor(BACKGROUND_COLOR));
        int id = getResources().getIdentifier("launch_feather", "drawable", getPackageName());
        if (id != 0) {
            ImageView feather = new ImageView(this);
            feather.setImageResource(id);
            feather.setScaleType(ImageView.ScaleType.FIT_XY);
            overlay.addView(feather, new FrameLayout.LayoutParams(LAUNCH_FEATHER_PX, LAUNCH_FEATHER_PX, Gravity.CENTER));
        }
        return overlay;
    }

    /**
     * The page says its own splash is laid out. Returns true if the native splash is still up, in which case it is
     * released once the renderer has really drawn that frame and the page is told (window.onSplashGone).
     * Called on a bridge thread.
     */
    private boolean onPageReady() {
        Log.i("FLSplash", SystemClock.uptimeMillis() + " pageReady called, held=" + (launchOverlay != null));
        if (launchOverlay == null) return false;
        runOnUiThread(() -> web.postVisualStateCallback(++visualStateId, new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) {
                Log.i("FLSplash", SystemClock.uptimeMillis() + " visual state complete");
                releaseLaunchOverlay();
            }
        }));
        return true;
    }

    /** Fades the native splash out, then tells the page. Safe to call more than once. */
    private void releaseLaunchOverlay() {
        final View overlay = launchOverlay;
        if (overlay == null) return;
        launchOverlay = null;
        Log.i("FLSplash", SystemClock.uptimeMillis() + " releasing (fade)");
        overlay.animate().alpha(0f).setDuration(LAUNCH_FADE_MS).withEndAction(() -> {
            root.removeView(overlay);
            Log.i("FLSplash", SystemClock.uptimeMillis() + " removed, telling page");
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

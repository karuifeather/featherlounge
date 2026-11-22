package io.github.karuifeather.featherlounge;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Full-screen WebView host for the FeatherLounge home screen UI (assets/index.html). */
public class MainActivity extends Activity {
    private static final String PAGE_URL = "file:///android_asset/index.html";
    private static final String BRIDGE_NAME = "FeatherLounge";
    private static final String BACKGROUND_COLOR = "#09090f";

    private WebView web;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor(BACKGROUND_COLOR));
        configureSettings(web.getSettings());
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        LaunchSound launchSound = new LaunchSound(this);
        launchSound.setOnStarted(() -> web.post(() -> web.evaluateJavascript("window.onIntroStart&&window.onIntroStart()", null)));
        launchSound.prepare();
        AppLauncher launcher = new AppLauncher(this);
        web.addJavascriptInterface(new Bridge(web, launcher, new DeviceSetup(this, launcher), new Updater(this, web, launcher), launchSound), BRIDGE_NAME);
        setContentView(web);
        web.loadUrl(PAGE_URL);
        hideBars();
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

package io.github.karuifeather.featherlounge;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

/** Opens the companion apps (SmartTube, Stremio) and system settings screens. */
class AppLauncher {
    static final String SMARTTUBE = "org.smarttube.stable";
    static final String STREMIO = "com.stremio.one";

    private final Context context;

    AppLauncher(Context context) {
        this.context = context;
    }

    void openSmartTube() { openPackage(SMARTTUBE); }
    void openStremio() { openPackage(STREMIO); }
    void openSettings() { launch(new Intent(Settings.ACTION_SETTINGS)); }
    void openWifiSettings() { launch(new Intent(Settings.ACTION_WIFI_SETTINGS)); }

    void openYouTubeVideo(String videoId) {
        openInPackage(SMARTTUBE, "https://www.youtube.com/watch?v=" + Uri.encode(videoId));
    }

    void openStremioDetail(String type, String id) {
        openInPackage(STREMIO, "stremio:///detail/" + Uri.encode(type) + "/" + Uri.encode(id));
    }

    /** Opens the link in the given app, or just launches the app if it can't handle the link. */
    private void openInPackage(String pkg, String uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        intent.setPackage(pkg);
        if (!launch(intent)) openPackage(pkg);
    }

    private void openPackage(String pkg) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(pkg);
        if (intent == null) intent = context.getPackageManager().getLeanbackLaunchIntentForPackage(pkg);
        if (intent != null) launch(intent);
    }

    boolean launch(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }
}

package io.github.karuifeather.featherlounge;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebView;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/**
 * In-app updates: downloads a release APK from this project's GitHub releases and hands it to the
 * system installer. Android verifies the signature (an update must be signed with the same key as the
 * installed app) and asks the user to confirm, so nothing installs silently.
 */
class Updater {
    // Only this project's own release downloads are accepted, whatever the page asks for.
    private static final String ALLOWED_PREFIX = "https://github.com/karuifeather/featherlounge/releases/download/";
    private static final String RESULT_ACTION = "io.github.karuifeather.featherlounge.INSTALL_RESULT";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int PROGRESS_STEP_PERCENT = 5;

    private final Activity activity;
    private final WebView web;
    private final AppLauncher launcher;
    private boolean busy;
    private BroadcastReceiver receiver;

    Updater(Activity activity, WebView web, AppLauncher launcher) {
        this.activity = activity;
        this.web = web;
        this.launcher = launcher;
    }

    /** The installed version name, e.g. "0.1.0". */
    String version() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "0";
        }
    }

    /** Starts the download. Progress is reported to the page through window.__update(state, detail). */
    synchronized void install(String url) {
        if (busy) return;
        if (url == null || !url.startsWith(ALLOWED_PREFIX)) {
            report("failed", "Unsupported update address");
            return;
        }
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            report("permission", "");
            activity.runOnUiThread(() -> launcher.launch(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + activity.getPackageName()))));
            return;
        }
        busy = true;
        new Thread(() -> {
            try {
                downloadAndCommit(url);
            } catch (Exception e) {
                finish("failed", "Download failed (" + e.getClass().getSimpleName() + ")");
            }
        }).start();
    }

    private void downloadAndCommit(String url) throws Exception {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        int id = installer.createSession(new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL));
        try (PackageInstaller.Session session = installer.openSession(id)) {
            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            long total = connection.getContentLengthLong();
            try (InputStream in = connection.getInputStream(); OutputStream out = session.openWrite("update", 0, total > 0 ? total : -1)) {
                byte[] buffer = new byte[64 * 1024];
                long done = 0;
                int lastPercent = -1;
                for (int n; (n = in.read(buffer)) > 0; ) {
                    out.write(buffer, 0, n);
                    done += n;
                    int percent = total > 0 ? (int) (done * 100 / total) : -1;
                    if (percent >= 0 && percent >= lastPercent + PROGRESS_STEP_PERCENT) {
                        lastPercent = percent;
                        report("downloading", String.valueOf(percent));
                    }
                }
                session.fsync(out);
            } finally {
                connection.disconnect();
            }
            registerReceiver();
            Intent result = new Intent(RESULT_ACTION).setPackage(activity.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(activity, id, result, flags).getIntentSender());
        } catch (Exception e) {
            installer.abandonSession(id);
            throw e;
        }
    }

    private void registerReceiver() {
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) launcher.launch(confirm);
                    report("confirm", "");
                } else if (status == PackageInstaller.STATUS_SUCCESS) {
                    finish("done", "");
                } else {
                    String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                    finish("failed", message == null ? "Install failed" : message);
                }
            }
        };
        IntentFilter filter = new IntentFilter(RESULT_ACTION);
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(receiver, filter);
    }

    private synchronized void finish(String state, String detail) {
        busy = false;
        if (receiver != null) {
            try {
                activity.unregisterReceiver(receiver);
            } catch (IllegalArgumentException ignored) {
                // already unregistered
            }
            receiver = null;
        }
        report(state, detail);
    }

    private void report(String state, String detail) {
        String script = "window.__update&&window.__update(" + JSONObject.quote(state) + "," + JSONObject.quote(detail) + ")";
        web.post(() -> web.evaluateJavascript(script, null));
    }
}

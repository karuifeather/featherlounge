package io.github.karuifeather.featherlounge;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * First-run setup helpers: the default home app and cleaning up other apps.
 * Android does not let an app uninstall other apps or pick its own home role silently, so both
 * hand over to the system screens and the user confirms there.
 */
class DeviceSetup {
    private static final int REQUEST_HOME_ROLE = 1;

    /** Packages that must never be offered for removal: removing them can break the TV or this app. */
    private static final String[] PROTECTED_PREFIXES = {
        "com.google.android.gms", "com.android.vending", "com.google.android.webview", "com.android.webview",
        "com.google.android.trichromelibrary", "com.android.settings", "com.android.systemui",
        "com.google.android.tvlauncher", "com.google.android.apps.tv.launcherx", "com.google.android.leanbacklauncher",
        "com.google.android.inputmethod", "com.google.android.tv", "com.google.android.setupwizard",
        "com.google.android.permissioncontroller", "com.android.packageinstaller", "com.google.android.packageinstaller",
        "android", "com.android.providers", "com.android.bluetooth", "com.android.tv",
    };

    private final Activity activity;
    private final AppLauncher launcher;

    DeviceSetup(Activity activity, AppLauncher launcher) {
        this.activity = activity;
        this.launcher = launcher;
    }

    /** True when pressing Home currently opens FeatherLounge. */
    boolean isDefaultHome() {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo found = activity.getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        return found != null && found.activityInfo != null && activity.getPackageName().equals(found.activityInfo.packageName);
    }

    /** True when Android has recorded FeatherLounge as the home app (some TVs still open their own launcher). */
    boolean isHomeRoleHeld() {
        if (Build.VERSION.SDK_INT < 29) return false;
        RoleManager roles = activity.getSystemService(RoleManager.class);
        return roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME) && roles.isRoleHeld(RoleManager.ROLE_HOME);
    }

    /** Asks the system to make FeatherLounge the home app, falling back to the settings screens. */
    void requestHome() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 29 && requestHomeRole()) return;
            if (!launcher.launch(new Intent(Settings.ACTION_HOME_SETTINGS))) launcher.openSettings();
        });
    }

    // Must not use FLAG_ACTIVITY_NEW_TASK: the role dialog needs to know who is asking.
    private boolean requestHomeRole() {
        RoleManager roles = activity.getSystemService(RoleManager.class);
        if (roles == null || !roles.isRoleAvailable(RoleManager.ROLE_HOME)) return false;
        try {
            activity.startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_HOME), REQUEST_HOME_ROLE);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    /** Launchable apps that are safe to offer for removal, as JSON: [{pkg, label, system}]. */
    String removableApps() {
        PackageManager pm = activity.getPackageManager();
        Set<String> protectedNow = protectedPackages(pm);
        Map<String, JSONObject> found = new LinkedHashMap<>();
        for (String category : new String[] {Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
            Intent query = new Intent(Intent.ACTION_MAIN).addCategory(category);
            for (ResolveInfo info : pm.queryIntentActivities(query, 0)) {
                String pkg = info.activityInfo.packageName;
                if (found.containsKey(pkg) || isProtected(pkg, protectedNow)) continue;
                try {
                    JSONObject app = new JSONObject();
                    app.put("pkg", pkg);
                    app.put("label", String.valueOf(info.loadLabel(pm)));
                    app.put("system", (info.activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
                    found.put(pkg, app);
                } catch (JSONException ignored) {
                    // a single bad entry should not hide the others
                }
            }
        }
        return new JSONArray(found.values()).toString();
    }

    /** User apps open the uninstall dialog; system apps open their App info page, where they can be disabled. */
    void removeApp(String pkg) {
        PackageManager pm = activity.getPackageManager();
        if (pkg == null || isProtected(pkg, protectedPackages(pm))) return;
        Uri target = Uri.fromParts("package", pkg, null);
        boolean system;
        try {
            system = (pm.getApplicationInfo(pkg, 0).flags & ApplicationInfo.FLAG_SYSTEM) != 0;
        } catch (PackageManager.NameNotFoundException e) {
            return;
        }
        launcher.launch(new Intent(system ? Settings.ACTION_APPLICATION_DETAILS_SETTINGS : Intent.ACTION_DELETE, target));
    }

    private boolean isProtected(String pkg, Set<String> exact) {
        if (exact.contains(pkg)) return true;
        for (String prefix : PROTECTED_PREFIXES) {
            if (pkg.equals(prefix) || pkg.startsWith(prefix + ".")) return true;
        }
        return false;
    }

    /** This app, its companions, every home app, every keyboard and the WebView provider. */
    private Set<String> protectedPackages(PackageManager pm) {
        Set<String> out = new HashSet<>();
        out.add(activity.getPackageName());
        out.add(AppLauncher.SMARTTUBE);
        out.add(AppLauncher.STREMIO);
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo info : pm.queryIntentActivities(home, 0)) out.add(info.activityInfo.packageName);
        InputMethodManager imm = activity.getSystemService(InputMethodManager.class);
        if (imm != null) for (InputMethodInfo ime : imm.getInputMethodList()) out.add(ime.getPackageName());
        PackageInfo webView = WebView.getCurrentWebViewPackage();
        if (webView != null) out.add(webView.packageName);
        return out;
    }
}

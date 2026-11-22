# Installing

## Quick install: from the TV itself (no computer)

1. On the TV, install **Downloader** (by AFTVnews) from the Play Store.
2. **Settings → Apps → Security & restrictions → Unknown sources**, and allow **Downloader**. The exact menu varies by TV.
3. Open Downloader and enter:

   ```
   github.com/karuifeather/featherlounge/releases/latest/download/FeatherLounge.apk
   ```

4. Choose **Install**. Then open **FeatherLounge** from the apps row. On first run it offers to become your home screen and to help clear unused apps.

That link always points to the newest release. Later updates come from inside FeatherLounge, see [Updates](#updates). To install from a computer instead, continue below.

## Updates

FeatherLounge checks GitHub for a newer release when it starts and every few hours. When one exists, an **Update available** shortcut appears in the top bar. Choose it to read what changed, then **Install update**. The app downloads the APK and Android asks you to confirm. The first time, Android also asks you to allow FeatherLounge to install apps. Nothing installs without your confirmation, and Android only accepts an update signed with the same key as the installed app. If it fails, download `FeatherLounge.apk` from the [releases page](https://github.com/karuifeather/featherlounge/releases/latest) and install it again.

## 1. Enable debugging on the TV

1. **Settings → Device Preferences → About**, click **Build** 7 times.
2. **Settings → Device Preferences → Developer options**, turn on **USB debugging** and **Network debugging**.
3. Note the TV's IP address (**Settings → Network & Internet**).

## 2. Install

```bash
adb connect <tv-ip>:5555        # accept the prompt on the TV, tick "Always allow"
adb install -r featherlounge.apk
```

Use `-r` to update an installed copy. The APK must be signed with the same key as the installed one, otherwise uninstall first (`adb uninstall io.github.karuifeather.featherlounge`), which also signs you out of YouTube.

Start it from the TV's app list, or:

```bash
adb shell am start -n io.github.karuifeather.featherlounge/.MainActivity
```

## 3. First-run setup and home screen

The first time FeatherLounge opens it runs a short setup: it asks Android to make it the home app, then lists apps you can remove. You can skip any step and rerun it from **Setup** in the top bar.

If the setup step does nothing, or pressing **Home** still opens the stock launcher, the firmware ignores the request.

FeatherLounge registers as a home app, but many TV firmwares keep launching their own home screen. You can also set it with adb:

```bash
adb shell cmd role add-role-holder --user 0 android.app.role.HOME io.github.karuifeather.featherlounge
```

If pressing **Home** still opens the stock launcher, your firmware ignores the setting (confirmed on a TCL Google TV, Android 14). Open FeatherLounge from the app list instead. To go back to the stock launcher:

```bash
adb shell cmd role remove-role-holder --user 0 android.app.role.HOME io.github.karuifeather.featherlounge
```

## Troubleshooting

| Problem                              | Fix                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `unauthorized` in `adb devices`      | Accept the debugging prompt on the TV; run `adb kill-server` and reconnect.                                  |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Signed with a different key. `adb uninstall io.github.karuifeather.featherlounge`, then install.             |
| Cards do nothing                     | SmartTube or Stremio is not installed (see README requirements).                                             |
| Rows show "Couldn't load"            | No internet, or a public data service is down. Press OK on the row to retry.                                 |
| No "Sign in to YouTube" works        | The app could not read the YouTube TV client (offline, or YouTube changed it), see [youtube.md](youtube.md). |

# Optional: cleaning up a TV with adb

FeatherLounge's first-run setup (and **Setup** in the top bar) lists apps you can remove, with no computer needed: your own apps open the uninstall dialog, and preinstalled apps open App info, where you can **Disable** them (some firmwares hide that button). It never lists launchers, keyboards, Play services, Settings or the WebView, and keeps SmartTube and Stremio. For a deeper clean, use `adb` as below.

Removals use `pm uninstall --user 0`, which hides an app for your user and is **reversible**; it does not touch the system partition.

```bash
adb shell pm list packages -3 | sort            # user-installed apps
adb shell pm list packages -s | sort            # system apps
adb shell pm list packages -u > packages_before.txt   # save a rollback list first

adb shell pm uninstall --user 0 <package>       # remove for this user
adb shell cmd package install-existing <package>   # restore it
```

## Script and the shared list

`debloat/packages.txt` is the list of known-removable apps. FeatherLounge's setup screen shows the ones installed on your TV, and power users can run the same list over adb:

```bash
scripts/debloat.sh --dry-run          # see what it would ask about
scripts/debloat.sh                    # asks y/N for each installed package, saves a rollback list first
scripts/debloat.sh --category google  # one category only
scripts/debloat.sh --restore          # bring everything in the list back
```

To grow the list, add a line (`package | label | category | note`) and open a pull request. Only add apps that are safe to remove for everyone (see below).

## Rules of thumb

- **Safe to remove:** streaming apps you don't use, vendor promo/ad apps, browser, games, hotel/demo/repair apps.
- **Do not remove:** the launcher, Google Play services/Play Store, WebView, Settings, SystemUI, Bluetooth/Wi-Fi/network stacks, the input method, and the vendor TV/tuner/HAL packages (names usually start with the chip or TV maker). Removing these can leave the TV unable to boot to a home screen.
- Remove a few at a time and check the TV still works.
- A "removed" updated system app may still show up in `pm list packages -3`; use `pm disable-user --user 0 <package>` for those.
- Factory reset restores everything.

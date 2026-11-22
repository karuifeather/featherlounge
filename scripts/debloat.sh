#!/usr/bin/env bash
# Removes the apps listed in debloat/packages.txt from a TV over adb (reversible: `pm uninstall --user 0`).
#
#   scripts/debloat.sh                    # ask about each installed package
#   scripts/debloat.sh --category google  # only one category
#   scripts/debloat.sh --dry-run          # show what would be asked, change nothing
#   scripts/debloat.sh --restore          # bring back everything in the list
#
# Needs adb connected to one device (adb connect <tv-ip>:5555). A rollback list is saved first.
set -euo pipefail
cd "$(dirname "$0")/.."

category=""; dry=0; restore=0
while [ $# -gt 0 ]; do
  case $1 in
    --category) category=${2:?missing category}; shift ;;
    --dry-run) dry=1 ;;
    --restore) restore=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

command -v adb >/dev/null || { echo "error: adb not found" >&2; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "error: no adb device (adb connect <tv-ip>:5555)" >&2; exit 1; }

backup="packages_before_$(date +%Y%m%d-%H%M%S).txt"
if [ "$dry" -eq 0 ] && [ "$restore" -eq 0 ]; then
  adb shell pm list packages -u | tr -d '\r' > "$backup"
  echo "rollback list saved to $backup"
fi
installed=$(adb shell pm list packages | tr -d '\r')

while IFS='|' read -r pkg label cat note; do
  pkg=$(echo "$pkg" | xargs); label=$(echo "$label" | xargs); cat=$(echo "$cat" | xargs)
  [ -z "$pkg" ] && continue
  case $pkg in \#*) continue ;; esac
  [ -n "$category" ] && [ "$cat" != "$category" ] && continue

  if [ "$restore" -eq 1 ]; then
    [ "$dry" -eq 1 ] && { echo "would restore $label ($pkg)"; continue; }
    adb shell cmd package install-existing "$pkg" >/dev/null 2>&1 && echo "restored $label"
    continue
  fi

  echo "$installed" | grep -qx "package:$pkg" || continue
  if [ "$dry" -eq 1 ]; then echo "would ask: $label ($pkg)"; continue; fi
  read -r -p "Remove $label ($pkg)? [y/N] " answer </dev/tty
  [ "$answer" = y ] || [ "$answer" = Y ] || continue
  if adb shell pm uninstall --user 0 "$pkg" | tr -d '\r' | grep -q Success; then echo "  removed"
  else echo "  failed; try: adb shell pm disable-user --user 0 $pkg"; fi
done < debloat/packages.txt

# Contributing

Bug reports, fixes and ideas are welcome.

## Setup

Follow [docs/building.md](docs/building.md). To iterate on the UI without a TV, serve `assets/` in a desktop browser (`python3 -m http.server -d assets 8000`) or install on an Android TV emulator.

## Before opening a pull request

- `for f in assets/*.js; do node --check "$f"; done`
- `./build.sh` succeeds and the app starts.
- UI changes: check on a real TV or emulator with a remote (D-pad), not just a mouse. Keep animations to `transform`/`opacity`; TV GPUs are slow.
- Do not add dependencies or build systems without discussing first; the app itself is dependency-free on purpose (the only dev dependencies are the formatting tools).
- Never include secrets, personal data, device IPs or screenshots of a signed-in YouTube feed.

## Style

Small, readable, comment the _why_. Match the existing code.

Code is formatted with Prettier. Run `pnpm install` once to set up a pre-commit hook that formats staged files, or run `pnpm format` / `pnpm format:check` yourself.

## Adding apps to the debloat list

Edit `debloat/packages.txt` (format at the top of the file). Only add apps that are safe to remove on any TV, never launchers, keyboards, Play services, Settings or vendor TV/tuner packages. See [docs/debloat.md](docs/debloat.md).

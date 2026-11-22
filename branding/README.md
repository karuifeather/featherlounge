# Branding

| File | Use |
|---|---|
| `feather.svg` / `feather-mono.svg` | The feather mark (brand teal / `currentColor`) |
| `icon.svg`, `icon-1024.png` | App icon |
| `icon-foreground.svg` | Android adaptive-icon foreground |
| `lockup-dark.svg`, `lockup-light.svg` | Mark + "FeatherLounge" wordmark for dark / light backgrounds |
| `banner.svg` | Android TV banner (rendered into `res/drawable-xhdpi/banner.png`) |
| `social-preview.svg` / `.png` | GitHub social preview (upload in repo **Settings → Social preview**) |
| `source/feather-icon.png` | Source artwork (karuifeather.com) the mark is traced from |

Palette: primary `#4a7c7c`, light `#669999`, foreground `#f0f9ff`. Wordmark font: Comfortaa Bold (SIL OFL), converted to outlines so the SVGs need no installed font.

## Regenerating

```bash
python3 branding/generate.py                  # from source/feather-icon.png
python3 branding/generate.py path/to/other-feather.png   # from any PNG with transparency
```

Needs ImageMagick, potrace and Inkscape. It rewrites the SVGs here, the launcher icons and banner in `res/`, and `assets/brand/lockup.svg`. The source is only 75x75 px, so the trace follows its slightly ragged edge; a larger or cleaner source gives a cleaner mark.

## Usage

The code is MIT licensed. The FeatherLounge name and this artwork are **not**: they are provided with the project for its own builds. If you fork and redistribute, please use your own name and artwork.

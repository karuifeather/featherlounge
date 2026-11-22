#!/usr/bin/env python3
"""Regenerate every FeatherLounge brand asset from a single source feather PNG.

    python3 branding/generate.py [source.png]     # default: branding/source/feather-icon.png

Maintainer tool - the generated files are committed, so building the app never needs it.
Requires: ImageMagick (magick), potrace, Inkscape (for text-to-outline and PNG export).

Pipeline: source alpha -> smooth 16x upscale -> threshold -> potrace (curve fitting) -> feather.svg,
then every other asset is composed from that one traced path. Text is converted to outlines so the
SVGs never depend on an installed font. Metadata is stripped from every output.
"""
import pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE / "source" / "feather-icon.png"
OUT = HERE
TEAL, TEAL_DK, TEAL_LT, FG, BG = "#4a7c7c", "#3c6666", "#669999", "#f0f9ff", "#09090f"   # brand teal + dark UI bg
FONT, WEIGHT = "Comfortaa", 700


def run(*a, **k):
    return subprocess.run([str(x) for x in a], check=True, capture_output=True, text=True, **k)


# ---------- 1. trace the feather ----------
def trace(src):
    with tempfile.TemporaryDirectory() as t:
        t = pathlib.Path(t)
        run("magick", src, "-alpha", "extract", "-trim", "+repage", "-filter", "Lanczos", "-resize", "1600x1600",
            "-blur", "0x9", "-threshold", "50%", "-negate", t / "t.pbm")
        run("potrace", "-b", "svg", "-a", "1.3", "-O", "0.8", "-t", "1500", "-o", t / "t.svg", t / "t.pbm")
        svg = (t / "t.svg").read_text()
    d = " ".join(re.findall(r'<path d="([^"]+)"', svg, re.S)).replace("\n", " ")
    w, h = (float(x) for x in re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg).groups()) if "viewBox" in svg else \
        (float(x) for x in re.search(r'width="([\d.]+)pt" height="([\d.]+)pt"', svg).groups())
    return re.sub(r"\s+", " ", d).strip(), w, h


def feather_group(d, w, h, size, x, y, fill):
    """Place the traced feather with its bounding box's longest side == size, top-left at (x, y)."""
    k = size / max(w, h)
    ox, oy = x + (size - w * k) / 2, y + (size - h * k) / 2
    return (f'<g transform="translate({ox:.2f} {oy:.2f}) scale({k:.5f})"><g transform="translate(0 {h:.2f}) scale(0.1 -0.1)">'
            f'<path fill="{fill}" d="{d}"/></g></g>')


# ---------- 2. text -> outlines ----------
def outline(svg_text, name):
    """Run an SVG that contains <text> through Inkscape, returning plain SVG with text as paths."""
    with tempfile.TemporaryDirectory() as t:
        t = pathlib.Path(t)
        (t / "in.svg").write_text(svg_text)
        run("inkscape", t / "in.svg", "--export-type=svg", "--export-plain-svg", "--export-text-to-path",
            "--export-filename", t / "out.svg")
        return scrub((t / "out.svg").read_text())


def text_width(text, size):
    with tempfile.TemporaryDirectory() as t:
        t = pathlib.Path(t)
        (t / "m.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="400"><text id="m" x="0" y="200" '
                                 f'font-family="{FONT}" font-weight="{WEIGHT}" font-size="{size}">{text}</text></svg>')
        return float(run("inkscape", "--query-width", "--query-id=m", t / "m.svg").stdout.strip())


def scrub(svg):
    """Remove editor metadata / absolute paths so nothing machine-specific is published."""
    svg = re.sub(r"<metadata.*?</metadata>", "", svg, flags=re.S)
    svg = re.sub(r"<sodipodi:namedview.*?/>|<sodipodi:namedview.*?</sodipodi:namedview>", "", svg, flags=re.S)
    svg = re.sub(r'\s(?:xmlns:(?:inkscape|sodipodi|rdf|cc|dc)|(?:inkscape|sodipodi):[\w-]+)="[^"]*"', "", svg)
    svg = re.sub(r"<\?xml[^>]*\?>\s*", "", svg)
    return svg.strip() + "\n"


def write(name, content):
    p = OUT / name
    p.write_text(content)
    for bad in ("/home/", "/tmp/", "scratchpad", "inkscape", "sodipodi"):
        assert bad not in content, f"{name} contains {bad!r}"
    print("wrote", p.relative_to(ROOT))


def png(svg_name, out, w, h=None, bg=None):
    args = ["inkscape", OUT / svg_name, "--export-type=png", "--export-filename", out, "-w", w] + (["-h", h] if h else [])
    if bg:
        args += ["-b", bg]
    run(*args)
    run("magick", out, "-strip", out)


def lockup(d, fw, fh, feather_fill, word1_fill, word2_fill, bg=None):
    """Horizontal mark + 'FeatherLounge' wordmark, text outlined."""
    size = 120
    wfull = text_width("FeatherLounge", size)
    mark, gap, pad = 220, 56, 40
    W, H = pad * 2 + mark + gap + wfull, 220 + pad * 2 - 40
    tx, ty = pad + mark + gap, H / 2 + size * 0.34
    body = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">'
    if bg:
        body += f'<rect width="100%" height="100%" fill="{bg}"/>'
    body += feather_group(d, fw, fh, mark, pad, (H - mark) / 2, feather_fill)
    body += (f'<text x="{tx:.1f}" y="{ty:.1f}" font-family="{FONT}" font-weight="{WEIGHT}" font-size="{size}">'
             f'<tspan fill="{word1_fill}">Feather</tspan><tspan fill="{word2_fill}">Lounge</tspan></text></svg>')
    return outline(body, "lockup")


def main():
    d, fw, fh = trace(SRC)
    # mark (brand teal) + monochrome (currentColor) versions
    write("feather.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fw:.0f} {fh:.0f}">'
          f'<path fill="{TEAL}" transform="translate(0 {fh:.2f}) scale(0.1 -0.1)" d="{d}"/></svg>\n')
    write("feather-mono.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fw:.0f} {fh:.0f}">'
          f'<path fill="currentColor" transform="translate(0 {fh:.2f}) scale(0.1 -0.1)" d="{d}"/></svg>\n')
    # app icon 1024: brand teal rounded square + light feather
    write("icon.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
          f'<rect width="1024" height="1024" rx="232" fill="{TEAL}"/>' + feather_group(d, fw, fh, 600, 212, 212, FG) + "</svg>\n")
    # adaptive-icon foreground: 108dp canvas, feather inside the 66% safe zone
    write("icon-foreground.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
          + feather_group(d, fw, fh, 500, 262, 262, FG) + "</svg>\n")
    # lockups
    write("lockup-dark.svg", lockup(d, fw, fh, "#85b8b8", FG, "#85b8b8"))     # for dark backgrounds
    write("lockup-light.svg", lockup(d, fw, fh, TEAL, "#1b2b2b", TEAL))   # for light backgrounds
    # Android TV banner 16:9 (rendered at 640x360, used as the 320x180dp banner)
    size, mark, gap = 96, 240, 52
    wt = text_width("FeatherLounge", size)
    x0 = (1280 - (mark + gap + wt)) / 2
    write("banner.svg", outline(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{TEAL}"/><stop offset="1" stop-color="{TEAL_DK}"/></linearGradient></defs>'
        f'<rect width="1280" height="720" fill="url(#g)"/>'
        + feather_group(d, fw, fh, mark, x0, (720 - mark) / 2, FG)
        + f'<text x="{x0 + mark + gap:.1f}" y="{360 + size * 0.34:.1f}" font-family="{FONT}" font-weight="{WEIGHT}" font-size="{size}">'
          f'<tspan fill="{FG}">Feather</tspan><tspan fill="#bfe0e0">Lounge</tspan></text></svg>', "banner"))
    # GitHub social preview 1280x640
    write("social-preview.svg", outline(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" width="1280" height="640">'
        f'<rect width="1280" height="640" fill="{BG}"/>'
        f'<circle cx="1100" cy="40" r="420" fill="{TEAL}" fill-opacity="0.18"/>'
        + feather_group(d, fw, fh, 200, 100, 150, TEAL_LT)
        + f'<text x="340" y="290" font-family="{FONT}" font-weight="{WEIGHT}" font-size="100"><tspan fill="{FG}">Feather</tspan><tspan fill="{TEAL_LT}">Lounge</tspan></text>'
        f'<text x="344" y="360" font-family="{FONT}" font-weight="400" font-size="40" fill="#9b9bb0">A fast, modern home screen for Google TV</text>'
        f'<text x="344" y="420" font-family="{FONT}" font-weight="400" font-size="32" fill="#6c6c82">YouTube + Stremio recommendations in one place</text></svg>', "social"))

    # ---------- raster outputs ----------
    res = ROOT / "res"
    for dpi, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        (res / f"mipmap-{dpi}").mkdir(parents=True, exist_ok=True)
        png("icon.svg", res / f"mipmap-{dpi}" / "ic_launcher.png", px)
    (res / "mipmap-xxxhdpi").mkdir(parents=True, exist_ok=True)
    png("icon-foreground.svg", res / "mipmap-xxxhdpi" / "ic_launcher_foreground.png", 432)
    (res / "drawable-xhdpi").mkdir(parents=True, exist_ok=True)
    png("banner.svg", res / "drawable-xhdpi" / "banner.png", 640, 360)
    png("icon.svg", OUT / "icon-1024.png", 1024)
    png("social-preview.svg", OUT / "social-preview.png", 1280, 640)
    # in-app brand assets
    shutil.copy(OUT / "lockup-dark.svg", ROOT / "assets" / "brand" / "lockup.svg")
    print("done")


if __name__ == "__main__":
    main()

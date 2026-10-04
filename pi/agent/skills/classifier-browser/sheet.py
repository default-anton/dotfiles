import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path


def magick(*arguments):
    return subprocess.run(
        ["magick", *map(str, arguments)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def dimensions(path):
    return tuple(map(int, magick("identify", "-format", "%w %h", path).split()))


def main():
    parser = argparse.ArgumentParser(description="Build a labeled PNG review sheet from source captures.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--font", required=True, type=Path)
    parser.add_argument("--columns", type=int, choices=(1, 2), default=2)
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=1200)
    args = parser.parse_args()
    if not (400 <= args.width <= 2000 and 300 <= args.height <= 2000):
        parser.error("canvas must be 400–2000 × 300–2000, including labels and gutters")
    if not args.font.is_file():
        parser.error("--font must name an installed font file")
    if args.output.suffix.lower() != ".png" or args.output.exists():
        parser.error("output must be a new .png path")
    panels = json.loads(args.manifest.read_text())
    if not isinstance(panels, list) or not 1 <= len(panels) <= 4:
        parser.error("manifest must contain 1–4 panels; split larger sets into multiple sheets")
    columns = min(args.columns, len(panels))
    rows = (len(panels) + columns - 1) // columns
    gutter, label_height = 12, 64
    panel_width = (args.width - (columns + 1) * gutter) // columns
    panel_height = (args.height - (rows + 1) * gutter) // rows
    image_height = panel_height - label_height
    if panel_width < 200 or image_height < 100:
        parser.error("canvas too small for this panel count")
    output = args.output.resolve()
    with tempfile.TemporaryDirectory(prefix="classifier-sheet-") as temporary:
        canvas = ["-size", f"{args.width}x{args.height}", "xc:#e5e7eb"]
        for index, panel in enumerate(panels):
            source = Path(panel["path"]).expanduser()
            if not source.is_absolute():
                source = args.manifest.parent / source
            source = source.resolve(strict=True)
            if source.suffix.lower() != ".png":
                parser.error("use original PNG captures, not previous sheets or lossy derivatives")
            identifier, expected = panel["id"], panel["expected"]
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", identifier):
                parser.error("panel IDs must be 1–32 letters, digits, underscores or hyphens")
            if not isinstance(expected, str) or not expected or any(c in expected for c in "\n\r%@\\"):
                parser.error("expected state must be a short plain-text line without ImageMagick escapes")
            label = Path(temporary) / f"{index}-label.png"
            magick(
                "-background", "#f9fafb", "-fill", "#111827", "-font", args.font.resolve(),
                "-pointsize", "20", f"label:{identifier}\n{expected}", label,
            )
            label_width, actual_label_height = dimensions(label)
            if label_width > panel_width - 16 or actual_label_height > label_height - 8:
                parser.error(f"label {identifier} does not fit: shorten it or use fewer panels")
            crop_arguments = []
            if "crop" in panel:
                crop = panel["crop"]
                if not isinstance(crop, list) or len(crop) != 4 or any(type(n) is not int for n in crop):
                    parser.error("crop must be [x, y, width, height] in source pixels")
                x, y, width, height = crop
                source_width, source_height = dimensions(source)
                if min(x, y) < 0 or min(width, height) <= 0 or x + width > source_width or y + height > source_height:
                    parser.error(f"crop for {identifier} exceeds source bounds")
                crop_arguments = ["-crop", f"{width}x{height}+{x}+{y}", "+repage"]
            image = Path(temporary) / f"{index}-image.png"
            magick(
                source, *crop_arguments, "-resize", f"{panel_width}x{image_height}>",
                "-background", "white", "-gravity", "center",
                "-extent", f"{panel_width}x{image_height}", image,
            )
            tile = Path(temporary) / f"{index}-tile.png"
            magick(
                label, "-gravity", "center", "-background", "#f9fafb",
                "-extent", f"{panel_width}x{label_height}", image, "-append", tile,
            )
            x = gutter + (index % columns) * (panel_width + gutter)
            y = gutter + (index // columns) * (panel_height + gutter)
            canvas.extend([str(tile), "-geometry", f"+{x}+{y}", "-composite"])
        magick(*canvas, output)
    print(json.dumps({"path": str(output), "width": args.width, "height": args.height, "panels": len(panels)}))


if __name__ == "__main__":
    main()

#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10.1"]
# ///

import argparse
import json
import math
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


LIMIT = 2000
GUTTER = 12
PADDING = 8
FONT = ImageFont.load_default(size=20)
LINE_HEIGHT = 26


def wrap_label(text, width):
    lines = []
    for paragraph in text.splitlines():
        line = ""
        for word in paragraph.split():
            candidate = f"{line} {word}" if line else word
            if FONT.getlength(candidate) <= width:
                line = candidate
                continue
            if line:
                lines.append(line)
            line = ""
            for character in word:
                if line and FONT.getlength(line + character) > width:
                    lines.append(line)
                    line = ""
                line += character
        lines.append(line)
    return lines or [""]


def load_panels(manifest):
    records = json.loads(manifest.read_text())
    if not isinstance(records, list) or not records:
        raise ValueError("manifest must be a nonempty list")
    panels = []
    for index, record in enumerate(records, 1):
        if not isinstance(record, dict) or not isinstance(record.get("path"), str):
            raise ValueError(f"panel {index}: path must be a string")
        source = Path(record["path"]).expanduser()
        if not source.is_absolute():
            source = manifest.parent / source
        with Image.open(source) as image:
            if image.format != "PNG":
                raise ValueError(f"panel {index}: use original PNG captures")
            width, height = image.size
        crop = record.get("crop", [0, 0, width, height])
        if not isinstance(crop, list) or len(crop) != 4 or any(type(n) is not int for n in crop):
            raise ValueError(f"panel {index}: crop must be [x, y, width, height]")
        x, y, crop_width, crop_height = crop
        if min(x, y) < 0 or min(crop_width, crop_height) <= 0 or x + crop_width > width or y + crop_height > height:
            raise ValueError(f"panel {index}: crop exceeds source bounds")
        identifier = record.get("id", f"{index:02}")
        expected = record.get("expected")
        if not isinstance(identifier, str) or not identifier.strip():
            raise ValueError(f"panel {index}: id must be nonempty text")
        if not isinstance(expected, str) or not expected.strip():
            raise ValueError(f"panel {index}: expected must be nonempty text")
        panels.append({
            "source": source,
            "crop": (x, y, x + crop_width, y + crop_height),
            "size": (crop_width, crop_height),
            "label": f"{identifier}\n{expected}",
        })
    return panels


def layout(panels, columns):
    cell_width = min(
        (LIMIT - (columns + 1) * GUTTER) // columns,
        max(260, max(panel["size"][0] for panel in panels)),
    )
    labels = [wrap_label(panel["label"], cell_width - 2 * PADDING) for panel in panels]
    label_heights = [len(lines) * LINE_HEIGHT + 2 * PADDING for lines in labels]

    def measure(image_limit):
        sizes = []
        for panel in panels:
            width, height = panel["size"]
            scale = min(1, cell_width / width, image_limit / height)
            sizes.append((max(1, math.floor(width * scale)), max(1, math.floor(height * scale))))
        row_heights = [
            max(label_heights[i] + sizes[i][1] for i in range(start, min(start + columns, len(panels))))
            for start in range(0, len(panels), columns)
        ]
        height = sum(row_heights) + (len(row_heights) + 1) * GUTTER
        return sizes, row_heights, height

    low, high = 1, LIMIT
    if measure(low)[2] > LIMIT:
        raise ValueError("labels exceed the canvas; shorten them or use fewer panels")
    while low < high:
        middle = (low + high + 1) // 2
        if measure(middle)[2] <= LIMIT:
            low = middle
        else:
            high = middle - 1
    sizes, row_heights, height = measure(low)
    return {
        "columns": columns,
        "cell_width": cell_width,
        "labels": labels,
        "label_heights": label_heights,
        "sizes": sizes,
        "row_heights": row_heights,
        "width": columns * cell_width + (columns + 1) * GUTTER,
        "height": height,
        "area": sum(width * height for width, height in sizes),
    }


def best_layout(panels):
    candidates = []
    for columns in range(1, min(2, len(panels)) + 1):
        try:
            candidates.append(layout(panels, columns))
        except ValueError:
            continue
    if not candidates:
        raise ValueError("labels exceed the canvas; shorten them or use fewer panels")
    return max(candidates, key=lambda item: (item["area"], -item["width"] * item["height"]))


def render(panels, plan, output):
    canvas = Image.new("RGB", (plan["width"], plan["height"]), "#e5e7eb")
    draw = ImageDraw.Draw(canvas)
    y = GUTTER
    for index, panel in enumerate(panels):
        column = index % plan["columns"]
        row = index // plan["columns"]
        x = GUTTER + column * (plan["cell_width"] + GUTTER)
        label_height = plan["label_heights"][index]
        draw.rectangle(
            (x, y, x + plan["cell_width"] - 1, y + label_height - 1), fill="#f9fafb"
        )
        for line_index, line in enumerate(plan["labels"][index]):
            draw.text(
                (x + PADDING, y + PADDING + line_index * LINE_HEIGHT),
                line, font=FONT, fill="#111827",
            )
        with Image.open(panel["source"]) as source:
            image = source.crop(panel["crop"]).convert("RGBA")
            image = image.resize(plan["sizes"][index], Image.Resampling.LANCZOS)
            image_x = x + (plan["cell_width"] - image.width) // 2
            draw.rectangle(
                (x, y + label_height, x + plan["cell_width"] - 1,
                 y + plan["row_heights"][row] - 1), fill="white"
            )
            canvas.paste(image, (image_x, y + label_height), image)
        if column == plan["columns"] - 1:
            y += plan["row_heights"][row] + GUTTER
    canvas.save(output, format="PNG")


def main():
    parser = argparse.ArgumentParser(description="Automatically lay out labeled PNG review sheets.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path, help="new PNG path; multiple sheets use -01, -02, …")
    args = parser.parse_args()
    try:
        if args.output.suffix.lower() != ".png" or args.output.exists():
            raise ValueError("output must be a new .png path")
        panels = load_panels(args.manifest)
        batches = [panels[start:start + 4] for start in range(0, len(panels), 4)]
        outputs = [
            args.output if len(batches) == 1 else
            args.output.with_name(f"{args.output.stem}-{index:02}.png")
            for index in range(1, len(batches) + 1)
        ]
        if any(path.exists() for path in outputs):
            raise ValueError("an output sheet already exists; choose a new output path")
        plans = [best_layout(batch) for batch in batches]
        with tempfile.TemporaryDirectory(prefix="classifier-sheet-") as temporary:
            for index, (batch, plan) in enumerate(zip(batches, plans)):
                render(batch, plan, Path(temporary) / f"{index}.png")
            for index, output in enumerate(outputs):
                with output.open("xb") as destination:
                    destination.write((Path(temporary) / f"{index}.png").read_bytes())
        print(json.dumps({"sheets": [
            {"path": str(output.resolve()), "width": plan["width"], "height": plan["height"],
             "panels": len(batch), "columns": plan["columns"]}
            for output, plan, batch in zip(outputs, plans, batches)
        ]}))
    except (OSError, ValueError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()

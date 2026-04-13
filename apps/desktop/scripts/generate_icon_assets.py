#!/usr/bin/env python3

from __future__ import annotations

import math
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = ROOT / "build"
ICONSET_DIR = BUILD_DIR / "icon.iconset"
MASTER_PNG = BUILD_DIR / "icon.png"
MASTER_ICO = BUILD_DIR / "icon.ico"
MASTER_ICNS = BUILD_DIR / "icon.icns"


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def blend(color_a: tuple[int, int, int], color_b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(lerp(component_a, component_b, t)) for component_a, component_b in zip(color_a, color_b))


def create_master_image(size: int = 1024) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    margin = int(size * 0.08)
    radius = int(size * 0.23)
    shadow_draw.rounded_rectangle(
        (margin, margin + int(size * 0.025), size - margin, size - margin + int(size * 0.025)),
        radius=radius,
        fill=(8, 15, 28, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=int(size * 0.035)))
    image.alpha_composite(shadow)

    background = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    background_draw = ImageDraw.Draw(background)
    rect = (margin, margin, size - margin, size - margin)
    background_draw.rounded_rectangle(rect, radius=radius, fill=hex_rgb("#0f172a") + (255,))

    accent = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    accent_draw = ImageDraw.Draw(accent)
    accent_draw.ellipse(
        (
            int(size * 0.58),
            int(size * 0.52),
            int(size * 1.02),
            int(size * 0.98),
        ),
        fill=(34, 197, 167, 38),
    )
    accent = accent.filter(ImageFilter.GaussianBlur(radius=int(size * 0.04)))
    background.alpha_composite(accent)
    image.alpha_composite(background)

    glyph = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glyph_draw = ImageDraw.Draw(glyph)
    glyph_mask = Image.new("L", (size, size), 0)
    glyph_mask_draw = ImageDraw.Draw(glyph_mask)

    glyph_mask_draw.rounded_rectangle(
        (
            int(size * 0.24),
            int(size * 0.23),
            int(size * 0.76),
            int(size * 0.31),
        ),
        radius=int(size * 0.035),
        fill=255,
    )
    glyph_mask_draw.rounded_rectangle(
        (
            int(size * 0.43),
            int(size * 0.23),
            int(size * 0.53),
            int(size * 0.70),
        ),
        radius=int(size * 0.04),
        fill=255,
    )
    glyph_mask_draw.rounded_rectangle(
        (
            int(size * 0.49),
            int(size * 0.48),
            int(size * 0.78),
            int(size * 0.58),
        ),
        radius=int(size * 0.04),
        fill=255,
    )

    gradient_a = hex_rgb("#14b8a6")
    gradient_b = hex_rgb("#38bdf8")
    gradient_c = hex_rgb("#99f6e4")
    for y in range(size):
        vertical_t = y / max(size - 1, 1)
        base_color = blend(gradient_a, gradient_b, min(vertical_t * 1.15, 1.0))
        row_color = blend(base_color, gradient_c, max(0.0, (0.45 - vertical_t) * 0.6))
        glyph_draw.line((0, y, size, y), fill=row_color + (255,), width=1)
    glyph.putalpha(glyph_mask)
    image.alpha_composite(glyph)

    ring_draw = ImageDraw.Draw(image)
    ring_draw.ellipse(
        (
            int(size * 0.66),
            int(size * 0.17),
            int(size * 0.86),
            int(size * 0.37),
        ),
        fill=hex_rgb("#a7f3d0") + (255,),
    )
    ring_draw.ellipse(
        (
            int(size * 0.70),
            int(size * 0.21),
            int(size * 0.82),
            int(size * 0.33),
        ),
        fill=hex_rgb("#0f172a") + (220,),
    )

    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    highlight_draw = ImageDraw.Draw(highlight)
    highlight_draw.rounded_rectangle(
        (
            int(size * 0.13),
            int(size * 0.11),
            int(size * 0.87),
            int(size * 0.50),
        ),
        radius=int(size * 0.20),
        fill=(255, 255, 255, 16),
    )
    highlight = highlight.filter(ImageFilter.GaussianBlur(radius=int(size * 0.08)))
    image.alpha_composite(highlight)

    outline = ImageDraw.Draw(image)
    outline.rounded_rectangle(
        rect,
        radius=radius,
        outline=(255, 255, 255, 34),
        width=max(2, size // 128),
    )

    return image


def write_iconset(master: Image.Image) -> None:
    if ICONSET_DIR.exists():
        shutil.rmtree(ICONSET_DIR)
    ICONSET_DIR.mkdir(parents=True, exist_ok=True)

    sizes = [16, 32, 64, 128, 256, 512]
    for size in sizes:
        output = master.resize((size, size), Image.Resampling.LANCZOS)
        output.save(ICONSET_DIR / f"icon_{size}x{size}.png")
        retina = master.resize((size * 2, size * 2), Image.Resampling.LANCZOS)
        retina.save(ICONSET_DIR / f"icon_{size}x{size}@2x.png")


def build_icns() -> None:
    subprocess.run(["iconutil", "-c", "icns", str(ICONSET_DIR), "-o", str(MASTER_ICNS)], check=True)


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    master = create_master_image()
    master.save(MASTER_PNG)
    master.save(MASTER_ICO, sizes=[(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)])
    write_iconset(master)
    build_icns()

    print(f"Generated {MASTER_PNG}")
    print(f"Generated {MASTER_ICO}")
    print(f"Generated {MASTER_ICNS}")


if __name__ == "__main__":
    main()

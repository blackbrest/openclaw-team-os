from __future__ import annotations

from collections import deque
from math import sqrt
from pathlib import Path

from PIL import Image, ImageFilter


PROJECT_ROOT = Path("/Users/wangliang/Documents/OpenClaw_Team_OS")
SOURCE_DIR = PROJECT_ROOT / "apps/web/public/generated/recruit-avatars"
OUTPUT_DIR = PROJECT_ROOT / "apps/web/public/generated/recruit-avatars-cutout"


def sample_background_color(image: Image.Image) -> tuple[int, int, int]:
    pixels = image.load()
    width, height = image.size
    samples: list[tuple[int, int, int]] = []
    step = max(1, width // 30)

    for x in range(0, width, step):
        samples.append(pixels[x, 0][:3])
        samples.append(pixels[x, height - 1][:3])

    for y in range(0, height, step):
        samples.append(pixels[0, y][:3])
        samples.append(pixels[width - 1, y][:3])

    channels = list(zip(*samples))
    return tuple(sorted(channel)[len(channel) // 2] for channel in channels)


def color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def build_alpha_mask(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    background = sample_background_color(rgba)

    visited = [[False] * height for _ in range(width)]
    mask = Image.new("L", (width, height), 255)
    mask_pixels = mask.load()
    queue: deque[tuple[int, int]] = deque()

    seed_threshold = 38
    grow_threshold = 54
    soften_max = 66

    def enqueue_if_background(x: int, y: int) -> None:
        if visited[x][y]:
            return

        if color_distance(pixels[x, y][:3], background) < seed_threshold:
            visited[x][y] = True
            queue.append((x, y))

    for x in range(width):
        enqueue_if_background(x, 0)
        enqueue_if_background(x, height - 1)

    for y in range(height):
        enqueue_if_background(0, y)
        enqueue_if_background(width - 1, y)

    while queue:
        x, y = queue.popleft()
        mask_pixels[x, y] = 0

        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            if visited[nx][ny]:
                continue
            if color_distance(pixels[nx, ny][:3], background) < grow_threshold:
                visited[nx][ny] = True
                queue.append((nx, ny))

    for x in range(width):
        for y in range(height):
            if mask_pixels[x, y] == 0:
                continue

            distance = color_distance(pixels[x, y][:3], background)
            if distance < soften_max:
                alpha = int(max(0, min(255, (distance - 28) / (soften_max - 28) * 255)))
                if alpha < mask_pixels[x, y]:
                    mask_pixels[x, y] = alpha

    return mask.filter(ImageFilter.GaussianBlur(1.2))


def export_cutout(source_path: Path, target_path: Path) -> None:
    image = Image.open(source_path).convert("RGBA")
    alpha = build_alpha_mask(image)
    bbox = alpha.getbbox()

    if bbox:
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        pad_x = max(10, int(width * 0.07))
        pad_top = max(8, int(height * 0.05))
        pad_bottom = max(12, int(height * 0.08))
        left = max(0, bbox[0] - pad_x)
        top = max(0, bbox[1] - pad_top)
        right = min(image.width, bbox[2] + pad_x)
        bottom = min(image.height, bbox[3] + pad_bottom)
        image = image.crop((left, top, right, bottom))
        alpha = alpha.crop((left, top, right, bottom))

    image.putalpha(alpha)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(target_path)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    for source_path in sorted(SOURCE_DIR.glob("*.jpg")):
        target_path = OUTPUT_DIR / f"{source_path.stem}.png"
        export_cutout(source_path, target_path)
        generated += 1
        print(f"cutout ready: {target_path}")

    print(f"generated {generated} cutout assets")


if __name__ == "__main__":
    main()

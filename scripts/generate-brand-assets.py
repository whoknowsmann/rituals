#!/usr/bin/env python3
"""Generate Rituals brand assets (icon, adaptive icon, splash, favicon).

Dependency-free (stdlib zlib/struct only) so it runs anywhere and the output is
reproducible from source. Re-run after changing the mark:

    python3 scripts/generate-brand-assets.py

The mark: an open gold ring — the recurring commitment — with a solid dot where
the loop closes: you showed up. Colours come from src/theme/tokens.ts.
"""
import math
import struct
import zlib
from pathlib import Path

INK900 = (0x0C, 0x0A, 0x09)
GOLD500 = (0xF5, 0xB8, 0x41)
GOLD600 = (0xD9, 0x97, 0x1B)

ASSETS = Path(__file__).resolve().parent.parent / "assets"


def write_png(path: Path, width: int, height: int, rows: list) -> None:
    raw = b"".join(b"\x00" + bytes(row) for row in rows)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def coverage(distance: float) -> float:
    """Signed distance (negative inside) -> 0..1 coverage with 1px anti-aliasing."""
    return max(0.0, min(1.0, 0.5 - distance))


def mark_alpha(x: float, y: float, cx: float, cy: float, scale: float) -> tuple:
    """Return (alpha, gradient_t) for the mark at pixel centre (x, y).

    scale is the ring's outer radius in pixels.
    """
    ring_r = scale * 0.80          # centreline radius
    stroke = scale * 0.20          # ring thickness
    gap_deg = 58.0                 # opening at the top-right; leaves clear air around the dot
    gap_centre = -50.0             # degrees, screen coords (y down): upper right
    dot_r = scale * 0.17

    dx, dy = x - cx, y - cy
    dist = math.hypot(dx, dy)
    angle = math.degrees(math.atan2(dy, dx))

    # Ring: annulus minus a wedge, with rounded caps at both ends of the gap.
    ring_d = abs(dist - ring_r) - stroke / 2
    rel = (angle - gap_centre + 540) % 360 - 180
    in_gap = abs(rel) < gap_deg / 2
    alpha = 0.0
    if not in_gap:
        alpha = coverage(ring_d)
    for end in (gap_centre - gap_deg / 2, gap_centre + gap_deg / 2):
        ex = cx + ring_r * math.cos(math.radians(end))
        ey = cy + ring_r * math.sin(math.radians(end))
        cap_d = math.hypot(x - ex, y - ey) - stroke / 2
        alpha = max(alpha, coverage(cap_d))

    # Dot: sits in the gap on the ring's path, closing the loop — the check-in.
    gx = cx + ring_r * math.cos(math.radians(gap_centre))
    gy = cy + ring_r * math.sin(math.radians(gap_centre))
    dot_d = math.hypot(x - gx, y - gy) - dot_r
    alpha = max(alpha, coverage(dot_d))

    # Vertical gradient: lighter gold at the top, deeper at the bottom.
    t = max(0.0, min(1.0, (y - (cy - scale)) / (2 * scale)))
    return alpha, t


def render(size_w: int, size_h: int, mark_scale: float, background) -> list:
    """background is an RGB tuple, or None for transparent."""
    cx, cy = size_w / 2, size_h / 2
    rows = []
    for py in range(size_h):
        row = []
        for px in range(size_w):
            a, t = mark_alpha(px + 0.5, py + 0.5, cx, cy, mark_scale)
            gold = tuple(round(GOLD500[i] * (1 - t) + GOLD600[i] * t) for i in range(3))
            if background is None:
                row += [*gold, round(a * 255)]
            else:
                row += [round(background[i] * (1 - a) + gold[i] * a) for i in range(3)] + [255]
        rows.append(row)
    return rows


def main() -> None:
    # App icon: full-bleed dark square; launchers apply their own mask.
    write_png(ASSETS / "icon.png", 1024, 1024, render(1024, 1024, 1024 * 0.30, INK900))
    # Android adaptive foreground: transparent, mark inside the 66% safe zone.
    write_png(ASSETS / "adaptive-icon.png", 1024, 1024, render(1024, 1024, 1024 * 0.24, None))
    # Splash: transparent mark on the configured dark splash background.
    write_png(ASSETS / "splash.png", 1024, 1024, render(1024, 1024, 1024 * 0.22, None))
    write_png(ASSETS / "favicon.png", 48, 48, render(48, 48, 48 * 0.32, INK900))
    print("wrote icon.png, adaptive-icon.png, splash.png, favicon.png to", ASSETS)


if __name__ == "__main__":
    main()

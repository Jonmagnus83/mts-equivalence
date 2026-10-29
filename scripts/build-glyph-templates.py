"""Rasterize DejaVu Sans A–Z, a–z and 0–9 for the squiggle filter.

Checked in so a later run does not depend on the machine font. Rebuild with
this script when the font file below is present.
"""
import json
from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

FONT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
OUT = Path(__file__).resolve().parent / "glyph-templates.json"
SIZE = 48
CHARS = [chr(c) for c in range(ord("A"), ord("Z") + 1)] + [chr(c) for c in range(ord("a"), ord("z") + 1)] + list("0123456789")


def quadratic(p0, p1, p2, steps=5):
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def cubic(p0, p1, p2, p3, steps=5):
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        pts.append((
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ))
    return pts


def sample_qcurve(start, args):
    if not args:
        return []
    on = args[-1]
    offs = list(args[:-1])
    if not offs:
        return [on]
    pts = []
    current = start
    for i, off in enumerate(offs[:-1]):
        nxt = offs[i + 1]
        implied = ((off[0] + nxt[0]) / 2, (off[1] + nxt[1]) / 2)
        pts.extend(quadratic(current, off, implied))
        current = implied
    pts.extend(quadratic(current, offs[-1], on))
    return pts


def contours_of(font, char):
    name = font.getBestCmap().get(ord(char))
    if not name:
        raise SystemExit(f"mangler glyf {char}")
    pen = RecordingPen()
    font.getGlyphSet()[name].draw(pen)
    contours = []
    current = []
    cx = cy = 0.0
    start = None
    for op, args in pen.value:
        if op == "moveTo":
            if current:
                contours.append(current)
            cx, cy = args[0]
            start = (cx, cy)
            current = [(cx, cy)]
        elif op == "lineTo":
            x, y = args[0]
            for i in range(1, 5):
                t = i / 4
                current.append((cx + (x - cx) * t, cy + (y - cy) * t))
            cx, cy = x, y
        elif op == "qCurveTo":
            sampled = sample_qcurve((cx, cy), args)
            current.extend(sampled)
            cx, cy = args[-1]
        elif op == "curveTo":
            c1, c2, p3 = args
            current.extend(cubic((cx, cy), c1, c2, p3))
            cx, cy = p3
        elif op == "closePath" and start is not None:
            current.append(start)
            contours.append(current)
            current = []
            cx, cy = start
    if current:
        contours.append(current)
    return contours


def thin(ink):
    img = [[0] * SIZE for _ in range(SIZE)]
    for index in ink:
        img[index // SIZE][index % SIZE] = 1
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            remove = []
            for y in range(1, SIZE - 1):
                for x in range(1, SIZE - 1):
                    if not img[y][x]:
                        continue
                    p = [
                        img[y - 1][x], img[y - 1][x + 1], img[y][x + 1], img[y + 1][x + 1],
                        img[y + 1][x], img[y + 1][x - 1], img[y][x - 1], img[y - 1][x - 1],
                    ]
                    count = sum(p)
                    if count < 2 or count > 6:
                        continue
                    transitions = sum(p[i] == 0 and p[(i + 1) % 8] == 1 for i in range(8))
                    if transitions != 1:
                        continue
                    if step == 0:
                        if p[0] * p[2] * p[4] != 0 or p[2] * p[4] * p[6] != 0:
                            continue
                    elif p[0] * p[2] * p[6] != 0 or p[0] * p[4] * p[6] != 0:
                        continue
                    remove.append((x, y))
            if remove:
                changed = True
                for x, y in remove:
                    img[y][x] = 0
    skeleton = [y * SIZE + x for y in range(SIZE) for x in range(SIZE) if img[y][x]]
    return skeleton or ink


def raster(contours):
    pts = [p for contour in contours for p in contour]
    minx = min(p[0] for p in pts)
    miny = min(p[1] for p in pts)
    maxx = max(p[0] for p in pts)
    maxy = max(p[1] for p in pts)
    w = maxx - minx or 1
    h = maxy - miny or 1
    scale = 34 / max(w, h)
    cx = (minx + maxx) / 2
    cy = (miny + maxy) / 2

    def project(p):
        return (24 + (p[0] - cx) * scale, 24 - (p[1] - cy) * scale)

    projected = [[project(p) for p in contour] for contour in contours]
    ink = []
    for y in range(SIZE):
        hits = []
        for contour in projected:
            for i in range(len(contour) - 1):
                x0, y0 = contour[i]
                x1, y1 = contour[i + 1]
                if (y0 <= y < y1) or (y1 <= y < y0):
                    hits.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        hits.sort()
        pair = 0
        while pair + 1 < len(hits):
            left = int(hits[pair] + 0.999)
            right = int(hits[pair + 1])
            for x in range(left, right + 1):
                if 0 <= x < SIZE:
                    ink.append(y * SIZE + x)
            pair += 2
    return sorted(set(ink))


def main():
    font = TTFont(FONT)
    glyphs = []
    for char in CHARS:
        ink = thin(raster(contours_of(font, char)))
        if len(ink) < 8:
            continue
        glyphs.append({"char": char, "ink": ink})
    OUT.write_text(
        json.dumps({"font": "DejaVu Sans", "size": SIZE, "glyphs": glyphs}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"skrev {len(glyphs)} glyfer til {OUT}")


if __name__ == "__main__":
    main()

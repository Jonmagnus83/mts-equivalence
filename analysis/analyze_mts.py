#!/usr/bin/env python3
"""Les MTS-resultater og skriv nøyaktighet, binomialtest og enkle figurer.

Leser CSV-filene appen laster ned (semikolon eller komma, UTF-8 med BOM).
Programmerte forsøk er rader der korreksjonsforsøk er 0. Sjansen i
binomialtesten er 1 / antall klasser, lest fra par_klasser når kolonnen finnes.

Bruk:
    python3 analysis/analyze_mts.py resultater/10427.csv
    python3 analysis/analyze_mts.py resultater/ --out analyse
"""

from __future__ import annotations

import argparse
import csv
import math
import sys
from collections import defaultdict
from pathlib import Path


CORNERS = ("øv", "øh", "nv", "nh")


def read_rows(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8-sig")
    if not text.strip():
        return []
    sample = text[:2000]
    delimiter = ";" if sample.count(";") >= sample.count(",") else ","
    return list(csv.DictReader(text.splitlines(), delimiter=delimiter))


def as_int(value: str | None) -> int:
    try:
        return int(float(value or "0"))
    except ValueError:
        return 0


def binom_sf(successes: int, n: int, p: float) -> float:
    """P(X >= successes) for X ~ Binomial(n, p)."""
    if n <= 0:
        return float("nan")
    if p <= 0:
        return 1.0 if successes <= 0 else 0.0
    if p >= 1:
        return 1.0 if successes <= n else 0.0
    total = 0.0
    for k in range(successes, n + 1):
        total += math.comb(n, k) * (p**k) * ((1 - p) ** (n - k))
    return min(1.0, total)


def is_data(rows: list[dict[str, str]]) -> bool:
    if not rows:
        return False
    keys = rows[0].keys()
    return "relasjonstype" in keys and "riktig" in keys


def programmed(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    return [row for row in rows if as_int(row.get("korreksjonsforsøk")) == 0]


def accuracy(rows: list[dict[str, str]]) -> tuple[int, int]:
    correct = sum(as_int(row.get("riktig")) for row in rows)
    return correct, len(rows)


def classes_of(rows: list[dict[str, str]]) -> int:
    for row in rows:
        raw = row.get("par_klasser")
        if raw:
            n = as_int(raw)
            if n >= 2:
                return n
    return 3


def block_key(row: dict[str, str]) -> tuple[str, str, str, str]:
    return (
        row.get("fase", ""),
        row.get("blokk", ""),
        row.get("blokk_gjentakelse", ""),
        row.get("nedtrapping_prosent", ""),
    )


def svg_bars(title: str, labels: list[str], values: list[float]) -> str:
    width, height = 760, 320
    left, bottom = 56, 40
    plot_w = width - left - 20
    plot_h = height - 70
    n = max(1, len(values))
    gap = 12
    bar_w = max(8, (plot_w - gap * (n + 1)) / n)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#fff"/>',
        f'<text x="{left}" y="28" font-family="sans-serif" font-size="16">{escape(title)}</text>',
        f'<line x1="{left}" y1="{height - bottom}" x2="{width - 16}" y2="{height - bottom}" stroke="#111"/>',
        f'<line x1="{left}" y1="44" x2="{left}" y2="{height - bottom}" stroke="#111"/>',
    ]
    for index, (label, value) in enumerate(zip(labels, values)):
        clipped = max(0.0, min(1.0, value))
        bar_h = clipped * plot_h
        x = left + gap + index * (bar_w + gap)
        y = height - bottom - bar_h
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}" fill="#111"/>')
        parts.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{height - 18}" text-anchor="middle" font-family="sans-serif" font-size="12">{escape(label)}</text>'
        )
        parts.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{max(56, y - 6):.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{clipped:.0%}</text>'
        )
    parts.append("</svg>")
    return "\n".join(parts)


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def report_for(path: Path) -> tuple[str, list[tuple[str, str]]]:
    rows = programmed(read_rows(path))
    if not rows:
        return f"{path.name}: ingen programmerte forsøk.\n", []
    participant = rows[0].get("deltakernr", path.stem)
    p = 1 / classes_of(rows)
    lines = [f"Deltaker {participant}", f"Fil: {path.name}", f"Sjanse per forsøk: {p:.3f}", ""]
    figures: list[tuple[str, str]] = []

    lines.append("Nøyaktighet per blokk")
    block_labels: list[str] = []
    block_values: list[float] = []
    blocks: dict[tuple[str, str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        blocks[block_key(row)].append(row)
    for key in sorted(blocks, key=lambda item: (item[0], as_int(item[1]), as_int(item[2]))):
        correct, n = accuracy(blocks[key])
        fase, blokk, attempt, thinning = key
        rate = correct / n if n else 0
        lines.append(
            f"  {fase} blokk {blokk} forsøk {attempt} ({thinning} %): {correct}/{n} = {rate:.1%}"
        )
        block_labels.append(f"{fase[:1]}{blokk}.{attempt}")
        block_values.append(rate)
    lines.append("")

    lines.append("Test og forhåndstest per relasjonstype")
    type_labels: list[str] = []
    type_values: list[float] = []
    by_type: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row.get("fase") in {"test", "forhåndstest"}:
            by_type[row.get("relasjonstype", "")].append(row)
    if not by_type:
        lines.append("  Ingen testforsøk.")
    for kind in ("refleksivitet", "baseline", "symmetri", "transitivitet", "ekvivalens"):
        group = by_type.get(kind)
        if not group:
            continue
        correct, n = accuracy(group)
        sf = binom_sf(correct, n, p)
        rate = correct / n if n else 0
        lines.append(f"  {kind}: {correct}/{n} = {rate:.1%}  P(X>={correct}) mot sjanse = {sf:.4f}")
        type_labels.append(kind[:3])
        type_values.append(rate)
    lines.append("")

    lines.append("Nøyaktighet når S+ står i hvert hjørne")
    pos_labels: list[str] = []
    pos_values: list[float] = []
    for corner in CORNERS:
        group = [row for row in rows if row.get("s_pluss_hjørne") == corner]
        correct, n = accuracy(group)
        rate = correct / n if n else 0
        shown = "–" if n == 0 else f"{correct}/{n} = {rate:.1%}"
        lines.append(f"  {corner}: {shown}")
        if n:
            pos_labels.append(corner)
            pos_values.append(rate)
    lines.append("")

    stem = f"{participant}"
    if block_values:
        figures.append((f"{stem}-blokker.svg", svg_bars(f"Deltaker {participant}: nøyaktighet per blokk", block_labels, block_values)))
    if type_values:
        figures.append((f"{stem}-relasjoner.svg", svg_bars(f"Deltaker {participant}: testtyper", type_labels, type_values)))
    if pos_values:
        figures.append((f"{stem}-posisjon.svg", svg_bars(f"Deltaker {participant}: S+ per hjørne", pos_labels, pos_values)))
    return "\n".join(lines) + "\n", figures


def collect(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            files.extend(sorted(item for item in path.glob("*.csv") if "hendelse" not in item.name))
        elif path.suffix.lower() == ".csv" and "hendelse" not in path.name:
            files.append(path)
    return files


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Analyser MTS-resultater (CSV).")
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, default=Path("mts-analyse"))
    args = parser.parse_args(argv)
    files = collect(args.paths)
    if not files:
        print("Fant ingen data-CSV.", file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "figurer").mkdir(exist_ok=True)
    reports: list[str] = []
    for path in files:
        rows = read_rows(path)
        if not is_data(rows):
            continue
        text, figures = report_for(path)
        reports.append(text)
        print(text)
        for name, svg in figures:
            (args.out / "figurer" / name).write_text(svg, encoding="utf-8")
    if not reports:
        print("Ingen av CSV-filene hadde forsøksrader.", file=sys.stderr)
        return 1
    (args.out / "rapport.txt").write_text("\n".join(reports), encoding="utf-8")
    print(f"Skrev {args.out / 'rapport.txt'} og figurer i {args.out / 'figurer'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

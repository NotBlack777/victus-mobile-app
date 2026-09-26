#!/usr/bin/env python3
"""Regenerates the Victus Cloud launcher/splash PNGs.

Pure Python, zero dependencies (PNG writing is hand-rolled with zlib), so it
runs anywhere — including CI or a phone-side interpreter.

Outputs into app/src/main/res/:
  mipmap-{mdpi..xxxhdpi}/ic_launcher.png        legacy rounded-square icons
  mipmap-{mdpi..xxxhdpi}/ic_launcher_round.png  legacy round icons
  drawable-{mdpi..xxxhdpi}/ic_launcher_foreground.png  adaptive-icon layers
  drawable-nodpi/splash_logo.png                Android 12+ splash icon
"""

import math
import os
import struct
import zlib

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "app", "src", "main", "res"))

# Purple -> Black brand identity (matches ThemeManager's default preset).
BLUE = (192, 132, 252)     # #C084FC bright orchid purple (kept the name BLUE for
VIOLET = (124, 58, 237)    # #7C3AED deep violet                minimal diff below)
TEAL = (11, 0, 20)         # #0B0014 near-black

# "V" stroke geometry, in canvas fractions centered on (0.5, 0.5), y-down.
V_A = (-0.200, -0.185)
V_B = (0.000,  0.210)
V_C = (0.200, -0.185)
V_STROKE = 0.115 * 2  # full thickness as a fraction of the canvas


def _lerp(a, b, t):
    return a + (b - a) * t


def _mix3(c1, c2, t):
    return (_lerp(c1[0], c2[0], t), _lerp(c1[1], c2[1], t), _lerp(c1[2], c2[2], t))


def _brand_gradient(t):
    """purple -> violet -> near-black along a diagonal (t in 0..1)."""
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    if t < 0.5:
        return _mix3(BLUE, VIOLET, t * 2.0)
    return _mix3(VIOLET, TEAL, (t - 0.5) * 2.0)


def _clamp01(x):
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


def _seg_dist(px, py, ax, ay, bx, by):
    dx = bx - ax
    dy = by - ay
    length_sq = dx * dx + dy * dy
    t = 0.0 if length_sq == 0.0 else _clamp01(((px - ax) * dx + (py - ay) * dy) / length_sq)
    cx = ax + dx * t
    cy = ay + dy * t
    return math.hypot(px - cx, py - cy)


def _v_coverage(u, v, aa):
    """Anti-aliased coverage of the V stroke at normalized coords (centered)."""
    d = min(
        _seg_dist(u, v, V_A[0], V_A[1], V_B[0], V_B[1]),
        _seg_dist(u, v, V_B[0], V_B[1], V_C[0], V_C[1]),
    )
    return _clamp01(0.5 + (V_STROKE / 2.0 - d) / aa)


def _rr_coverage(u, v, half, radius, aa):
    """Anti-aliased coverage of a rounded rect centered at origin (coords 0..1 canvas)."""
    qx = abs(u) - (half - radius)
    qy = abs(v) - (half - radius)
    ox = qx if qx > 0.0 else 0.0
    oy = qy if qy > 0.0 else 0.0
    d = math.hypot(ox, oy) - radius
    return _clamp01(0.5 - d / aa)


def _circle_coverage(u, v, radius, aa):
    return _clamp01(0.5 - (math.hypot(u, v) - radius) / aa)


def _paint_mono(size):
    """Monochrome adaptive layer: just the V silhouette's alpha channel."""
    ss = 3 if size <= 216 else 2
    big = size * ss
    aa = ss / size
    rows = []
    for y in range(big):
        row = bytearray(big * 4)
        v = (y + 0.5) / big - 0.5
        for x in range(big):
            u = (x + 0.5) / big - 0.5
            cov = _v_coverage(u / 0.78, v / 0.78, aa / 0.78)
            o = x * 4
            a = int(cov * 255.0 + 0.5)
            row[o] = 255
            row[o + 1] = 255
            row[o + 2] = 255
            row[o + 3] = a
        rows.append(row)
    return rows, ss


def _paint(size, mode):
    """Rasterize one asset. mode: 'square' | 'circle' | 'foreground' | 'splash'."""
    ss = 4 if size <= 72 else (3 if size <= 192 else 2)
    big = size * ss
    aa = ss / size  # 1 output pixel in normalized units, per oversampling axis

    fg_half = 0.39            # adaptive foreground gradient square half-size (78%)
    fg_radius = 0.18          # its corner radius (canvas fraction)

    rows = []
    for y in range(big):
        row = bytearray(big * 4)
        v = (y + 0.5) / big - 0.5
        for x in range(big):
            u = (x + 0.5) / big - 0.5
            r = g = b = 0.0
            a = 0.0

            # ---- background shape -------------------------------------------
            if mode == "foreground":
                bg_cov = _rr_coverage(u, v, fg_half, fg_radius, aa)
                lu, lv = u / 0.78, v / 0.78  # gradient + V in the square's local space
            elif mode == "circle" or mode == "splash":
                bg_cov = _circle_coverage(u, v, 0.5, aa)
                lu, lv = u, v
            else:  # legacy square
                bg_cov = _rr_coverage(u, v, 0.5, 0.225, aa)
                lu, lv = u, v

            if bg_cov > 0.0:
                cr, cg, cb = _brand_gradient((lu + 0.5 + lv + 0.5) / 2.0)
                # soft light from the top-left
                glow = math.exp(-(((lu + 0.22) ** 2) + ((lv + 0.28) ** 2)) / 0.09) * 16.0
                cr += glow
                cg += glow
                cb += glow
                a = bg_cov * 255.0
                r, g, b = cr, cg, cb

            # ---- V drop shadow ----------------------------------------------
            sh_cov = _v_coverage(lu, lv - 0.020, aa * 3.0) * (0.30 if mode != "splash" else 0.25)
            if sh_cov > 0.0 and a > 0.0:
                inv = 1.0 - sh_cov
                r = r * inv + 8.0 * sh_cov
                g = g * inv + 14.0 * sh_cov
                b = b * inv + 32.0 * sh_cov

            # ---- the V --------------------------------------------------------
            v_cov = _v_coverage(lu, lv, aa)
            if v_cov > 0.0:
                shade = (lv + 0.25) / 0.5  # subtle vertical tint
                white = 232.0 + 23.0 * _clamp01(shade)
                ca = v_cov
                # composite over background (or over nothing)
                out_a = ca + (a / 255.0) * (1.0 - ca)
                if out_a <= 0.0:
                    r = g = b = 0.0
                    a = 0.0
                else:
                    r = (white * ca + r * (a / 255.0) * (1.0 - ca)) / out_a
                    g = (white * ca + g * (a / 255.0) * (1.0 - ca)) / out_a
                    b = (white * ca + b * (a / 255.0) * (1.0 - ca)) / out_a
                    a = out_a * 255.0

            o = x * 4
            row[o] = int(min(255.0, max(0.0, r)) + 0.5)
            row[o + 1] = int(min(255.0, max(0.0, g)) + 0.5)
            row[o + 2] = int(min(255.0, max(0.0, b)) + 0.5)
            row[o + 3] = int(min(255.0, max(0.0, a)) + 0.5)
        rows.append(row)

    # box downsample big -> size
    if ss > 1:
        rows = _downsample(rows, size, ss)
    return rows


def _downsample(rows, size, ss):
    out_rows = []
    for y in range(size):
        dst = bytearray(size * 4)
        for x in range(size):
            rr = gg = bb = al = 0
            for sy in range(ss):
                src = rows[y * ss + sy]
                base = (x * ss) * 4
                for sx in range(ss):
                    i = base + sx * 4
                    rr += src[i]
                    gg += src[i + 1]
                    bb += src[i + 2]
                    al += src[i + 3]
            n = ss * ss
            o = x * 4
            dst[o] = rr // n
            dst[o + 1] = gg // n
            dst[o + 2] = bb // n
            dst[o + 3] = al // n
        out_rows.append(dst)
    return out_rows


def _write_png(path, width, rows):
    raw = b"".join(b"\x00" + bytes(row) for row in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, width, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(png)


def _write_xml(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/adaptive_icon_bg" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
"""

DENSITIES_LEGACY = [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]
DENSITIES_FOREGROUND = [("mdpi", 108), ("hdpi", 162), ("xhdpi", 216), ("xxhdpi", 324), ("xxxhdpi", 432)]


def main():
    for bucket, size in DENSITIES_LEGACY:
        _write_png(os.path.join(ROOT, "mipmap-" + bucket, "ic_launcher.png"), size,
                   _paint(size, "square"))
        _write_png(os.path.join(ROOT, "mipmap-" + bucket, "ic_launcher_round.png"), size,
                   _paint(size, "circle"))
        print("legacy", bucket, size)

    for bucket, size in DENSITIES_FOREGROUND:
        _write_png(os.path.join(ROOT, "drawable-" + bucket, "ic_launcher_foreground.png"), size,
                   _paint(size, "foreground"))
        mono_rows, mono_ss = _paint_mono(size)
        if mono_ss > 1:
            mono_rows = _downsample(mono_rows, size, mono_ss)
        _write_png(os.path.join(ROOT, "drawable-" + bucket, "ic_launcher_monochrome.png"), size,
                   mono_rows)
        print("foreground+mono", bucket, size)

    _write_png(os.path.join(ROOT, "drawable-nodpi", "splash_logo.png"), 432,
               _paint(432, "splash"))
    print("splash 432")

    anydpi = os.path.join(ROOT, "mipmap-anydpi-v26")
    _write_xml(os.path.join(anydpi, "ic_launcher.xml"), ADAPTIVE_XML)
    _write_xml(os.path.join(anydpi, "ic_launcher_round.xml"), ADAPTIVE_XML)
    print("adaptive xmls")


if __name__ == "__main__":
    main()

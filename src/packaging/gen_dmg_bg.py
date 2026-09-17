#!/usr/bin/env python3
"""PK Voice Cloner — fond de DMG animé (contrat dmgly 660×400).
Même chorégraphie validée que PKmonitor (tracé pointillés app -> Applications,
tracé lumineux, mini-icône voyageuse qui se dépose, anneau de confirmation,
sparkline de marque) dans la palette du studio : papier chaud, corail, laiton.
Boucle 64 frames @ 70 ms. Sortie : src/packaging/dmg-background.gif (660×400)."""
import math
import os

from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

W, H = 1320, 800            # rendu 2x, GIF final 660x400
APP = (360, 340)            # centres des icônes Finder (create-dmg, x2)
FOLDER = (960, 340)
CORAL = (223, 93, 69)       # --coral
CORAL_DEEP = (185, 69, 52)  # --coral-deep
BRASS = (191, 139, 74)      # --brass
TRACE_FAINT = (227, 207, 194)
INK = (24, 19, 17)          # --ink
MUTED = (141, 129, 120)     # --muted
DIM = (169, 156, 145)       # --faint

N = 64
DUR = 70
TRACE_END = 24
ICON_START, ICON_END = 8, 34
DROP_END = 44
RING_END = 56


def font(size, index=1):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size, index=index)
    except Exception:
        return ImageFont.load_default()


def make_base(glow_strength):
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        t = y / H
        base = (int(250 + (240 - 250) * t), int(246 + (232 - 246) * t), int(240 + (222 - 240) * t))
        for x in range(W):
            px[x, y] = base
    corail_m = Image.new("L", (W, H), 0)
    laiton_m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(corail_m).ellipse([660 - 840, -600, 660 + 840, 280], fill=int(46 * glow_strength[0]))
    ImageDraw.Draw(laiton_m).ellipse([-520, 480, 360, 1120], fill=int(34 * glow_strength[1]))
    ImageDraw.Draw(corail_m).ellipse([1000, 580, 1720, 1120], fill=int(26 * glow_strength[0]))
    corail_m = corail_m.filter(ImageFilter.GaussianBlur(140))
    laiton_m = laiton_m.filter(ImageFilter.GaussianBlur(140))
    out = Image.composite(Image.blend(img, Image.new("RGB", (W, H), (247, 216, 205)), 0.5), img, corail_m)
    out = Image.composite(Image.blend(out, Image.new("RGB", (W, H), (243, 231, 208)), 0.45), out, laiton_m)
    d = ImageDraw.Draw(out)
    for gy in range(120, H, 88):
        for gx in range(60, W, 88):
            d.point((gx, gy), fill=(233, 228, 220))
    return out


BASE_LOW = make_base((0.55, 0.5))
BASE_HIGH = make_base((1.0, 0.9))


def bez(p0, p1, p2, p3, n):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3*p0[0] + 3*mt**2*t*p1[0] + 3*mt*t**2*p2[0] + t**3*p3[0]
        y = mt**3*p0[1] + 3*mt**2*t*p1[1] + 3*mt*t**2*p2[1] + t**3*p3[1]
        pts.append((x, y))
    return pts


PATH = (
    bez((492, 352), (576, 240), (660, 240), (704, 316), 26) +
    bez((704, 316), (744, 380), (784, 420), (824, 380), 18) +
    bez((824, 380), (848, 356), (864, 344), (884, 342), 10)
)
PLEN = len(PATH)


def draw_dashed(d, pts, color, width, dash=22, gap=18, phase=0):
    dist = 0
    prev = pts[0]
    for p in pts[1:]:
        seg = math.hypot(p[0] - prev[0], p[1] - prev[1])
        steps = max(1, int(seg))
        for s in range(steps):
            t = s / steps
            x = prev[0] + (p[0] - prev[0]) * t
            y = prev[1] + (p[1] - prev[1]) * t
            dd = dist + seg * t
            if ((dd + phase) % (dash + gap)) < dash:
                d.point((x, y), fill=color)
                for w in range(1, width):
                    d.point((x, y - w), fill=color)
                    d.point((x, y + w - 1), fill=color)
        dist += seg
        prev = p


def make_overlay():
    ov = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(ov)
    f_title = font(68, 1)
    t = "PK Voice Cloner"
    tw = d.textlength(t, font=f_title)
    d.text(((W - tw) / 2, 52), t, font=f_title, fill=INK)
    f_sub = font(27, 0)
    t2 = "Glissez l’application vers le dossier Applications"
    tw2 = d.textlength(t2, font=f_sub)
    d.text(((W - tw2) / 2, 136), t2, font=f_sub, fill=MUTED)
    f_cap = font(22, 0)
    cap = "macOS 14+ · Apple Silicon · 100 % local · Open source"
    cw = d.textlength(cap, font=f_cap)
    d.text((1200 - cw, 760), cap, font=f_cap, fill=DIM)
    d2 = ImageDraw.Draw(ov)
    draw_dashed(d2, PATH, TRACE_FAINT, 6)
    ex, ey = PATH[-1]
    for k in range(2):
        ox = ex + 8 + k * 18
        d2.line([(ox, ey - 14), (ox + 12, ey), (ox, ey + 14)], fill=BRASS, width=6)
    mask = ov.convert("L").point(lambda v: 255 if v > 8 else 0)
    return ov, mask


OVERLAY, OVERLAY_MASK = make_overlay()

SRC = Image.open(os.path.join(REPO, "src/packaging/icon.png")).convert("RGBA")


def mini_icon(size):
    ic = SRC.resize((size, size), Image.LANCZOS)
    r = int(size * 0.225)
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size, size], radius=r, fill=255)
    return ic, m


SPARK_RAW = [
    (120, 680), (190, 680), (176, 604), (236, 608), (292, 676), (376, 676),
    (464, 688), (536, 688), (608, 700), (680, 700), (744, 676), (808, 676),
    (856, 592), (904, 600), (944, 672), (1016, 676), (1096, 676), (1200, 680),
]


def spark_points():
    pts = []
    for i in range(len(SPARK_RAW) - 1):
        x0, y0 = SPARK_RAW[i]
        x1, y1 = SPARK_RAW[i + 1]
        steps = max(2, int((x1 - x0) / 4))
        for s in range(steps):
            t = s / steps
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    pts.append(SPARK_RAW[-1])
    return pts


SPARK = spark_points()

SPECKS = [(74 * i % W, 180 + (106 * i) % 600, 0.22 + (i % 5) * 0.11, (i % 7) - 3) for i in range(14)]


def path_at(t):
    i = min(PLEN - 1, max(0, int(t * (PLEN - 1))))
    return PATH[i]


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    return 0.5 - math.cos(math.pi * min(1, max(0, t))) / 2


def build_frames():
    raw = []
    for f in range(N):
        breath = 0.5 + 0.5 * math.sin(2 * math.pi * f / N)
        img = Image.blend(BASE_LOW, BASE_HIGH, breath)
        d = ImageDraw.Draw(img)
        for (sx, sy, sp, br) in SPECKS:
            x = (sx + f * sp * 2) % W
            alpha = 0.5 + 0.5 * math.sin(2 * math.pi * (f / N) * 2 + sx)
            c = int(205 - 38 * alpha * (br + 1) / 2)
            d.ellipse([x - 2, sy - 2, x + 2, sy + 2], fill=(c, int(c * 0.94), int(c * 0.88)))
        img.paste(OVERLAY, (0, 0), OVERLAY_MASK)
        d = ImageDraw.Draw(img)
        p = ease(min(1, f / TRACE_END))
        cnt = max(2, int(PLEN * p))
        seg = PATH[:cnt]
        d.line(seg, fill=(240, 186, 168), width=20, joint="curve")
        if f <= TRACE_END:
            line_col = CORAL
        else:
            fade = max(0, (f - (N - 9)) / 8)
            line_col = tuple(int(lerp(a, b, fade)) for a, b in zip(CORAL_DEEP, TRACE_FAINT))
        d.line(seg, fill=line_col, width=8, joint="curve")
        if f <= TRACE_END and p < 1:
            tx, ty = seg[-1]
            d.ellipse([tx - 8, ty - 8, tx + 8, ty + 8], fill=CORAL)
        if ICON_START <= f < ICON_END:
            t = ease((f - ICON_START) / (ICON_END - ICON_START))
            x, y = path_at(t)
            size = 104
            ic, m = mini_icon(size)
            bob = math.sin(f * 0.8) * 4
            img.paste(ic, (int(x - size / 2), int(y - size / 2 + bob)), m)
            d = ImageDraw.Draw(img)
            tx, ty = path_at(max(0, t - 0.07))
            d.ellipse([tx - 6, ty - 6, tx + 6, ty + 6], fill=BRASS)
        elif ICON_END <= f < DROP_END:
            t = ease((f - ICON_END) / (DROP_END - ICON_END))
            x0, y0 = PATH[-1]
            x = lerp(x0, FOLDER[0], t)
            y = lerp(y0, FOLDER[1], t) + math.sin(t * math.pi) * -28
            size = int(lerp(104, 60, t))
            ic, m = mini_icon(size)
            img.paste(ic, (int(x - size / 2), int(y - size / 2)), m)
        if DROP_END <= f < RING_END:
            t = (f - DROP_END) / (RING_END - DROP_END)
            r = lerp(132, 184, t)
            fade = 1 - t
            col = (int(lerp(223, 240, fade)), int(lerp(93, 186, fade)), int(lerp(69, 168, fade)))
            d.ellipse([FOLDER[0] - r, FOLDER[1] - r, FOLDER[0] + r, FOLDER[1] + r], outline=col, width=6)
            r2 = lerp(116, 156, t)
            d.ellipse([FOLDER[0] - r2, FOLDER[1] - r2, FOLDER[0] + r2, FOLDER[1] + r2], outline=TRACE_FAINT, width=4)
        sp_end = ICON_END
        sp = ease(min(1, f / sp_end))
        cnt = max(2, int(len(SPARK) * sp))
        seg = SPARK[:cnt]
        d.line(seg, fill=(214, 205, 196), width=22, joint="curve")
        d.line(seg, fill=INK, width=10, joint="curve")
        if sp < 1:
            tx, ty = seg[-1]
            d.ellipse([tx - 10, ty - 10, tx + 10, ty + 10], fill=CORAL)
        raw.append(img)
    sample = Image.new("RGB", (W, H * 3))
    for i, pick in enumerate((8, 30, 50)):
        sample.paste(raw[pick], (0, i * H))
    pal = sample.quantize(colors=255, method=Image.MEDIANCUT)
    return [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in raw]


if __name__ == "__main__":
    frames = build_frames()
    out_dir = os.path.join(REPO, "src/packaging")
    os.makedirs(out_dir, exist_ok=True)
    petits = [fr.resize((660, 400), Image.LANCZOS) for fr in frames]
    gif = os.path.join(out_dir, "dmg-background.gif")
    petits[0].save(gif, save_all=True, append_images=petits[1:], duration=DUR, loop=0, optimize=True)
    frames[48].convert("RGB").resize((660, 400), Image.LANCZOS).save(
        os.path.join(out_dir, "dmg-background-preview.png"), dpi=(144, 144), optimize=True)
    print("OK", gif, os.path.getsize(gif) // 1024, "Ko")

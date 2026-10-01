"""Build the use-signalr logo kit: badge symbol, small cut, monoline wordmark, lockups. All shapes are filled outlines.

Run from anywhere: python brand/gen_kit.py. It writes the SVGs to apps/docs/public/brand.
"""
import math, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "docs", "public", "brand")

AMBER = "#F5A524"    # badge, brand primary
S_INK = "#1A1203"    # the S on the badge
SIGNAL = "#FFFFFF"   # signal dot
SPACE = "#0B0B0F"    # dark background
INK = "#18181B"      # text on light
PAPER = "#F4F4F5"    # text on dark

def P(x, y):
    return f"{x:.2f} {y:.2f}"

def pt(cx, cy, r, a):
    t = math.radians(a)
    return cx + r * math.cos(t), cy + r * math.sin(t)

# All primitives are traced clockwise on screen (y down), so nonzero fill unions them.
def sector(cx, cy, r, a0, a1, w):
    if a1 < a0:
        a0, a1 = a1, a0
    span = a1 - a0
    h = w / 2
    ro, ri = r + h, r - h
    large = 1 if span > 180 else 0
    o0, o1 = pt(cx, cy, ro, a0), pt(cx, cy, ro, a1)
    i1, i0 = pt(cx, cy, ri, a1), pt(cx, cy, ri, a0)
    return (f"M{P(*o0)} A{ro:.2f} {ro:.2f} 0 {large} 1 {P(*o1)} "
            f"A{h:.2f} {h:.2f} 0 0 1 {P(*i1)} "
            f"A{ri:.2f} {ri:.2f} 0 {large} 0 {P(*i0)} "
            f"A{h:.2f} {h:.2f} 0 0 1 {P(*o0)} Z")

def capsule(x1, y1, x2, y2, w):
    h = w / 2
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * h, dx / L * h
    a, b = (x1 - nx, y1 - ny), (x2 - nx, y2 - ny)
    c, d = (x2 + nx, y2 + ny), (x1 + nx, y1 + ny)
    return (f"M{P(*a)} L{P(*b)} A{h:.2f} {h:.2f} 0 0 1 {P(*c)} "
            f"L{P(*d)} A{h:.2f} {h:.2f} 0 0 1 {P(*a)} Z")

def disc(cx, cy, r, cw=True):
    s = 1 if cw else 0
    return (f"M{P(cx - r, cy)} A{r:.2f} {r:.2f} 0 1 {s} {P(cx + r, cy)} "
            f"A{r:.2f} {r:.2f} 0 1 {s} {P(cx - r, cy)} Z")

def ring(cx, cy, r, w):
    return disc(cx, cy, r + w / 2, True) + " " + disc(cx, cy, r - w / 2, False)

# ---------- symbol ----------
def s_parts(r, off, w, dot, span):
    a0, a1 = span
    top = sector(128, 128 - off, r, a0, a1, w)
    bot = sector(128, 128 + off, r, a0 + 180, a1 + 180, w)
    return top + " " + bot, disc(128, 128, dot)

REG = dict(r=30, off=27, w=21, dot=13.5, span=(-40, -200), R=120)
SMALL = dict(r=35, off=31, w=29, dot=17, span=(-46, -194), R=126)

def symbol_colour(g):
    arcs, d = s_parts(g["r"], g["off"], g["w"], g["dot"], g["span"])
    return (f'<circle cx="128" cy="128" r="{g["R"]}" fill="{AMBER}"/>'
            f'<path d="{arcs}" fill="{S_INK}"/><path d="{d}" fill="{SIGNAL}"/>')

def symbol_knockout(g, col):
    arcs, d = s_parts(g["r"], g["off"], g["w"], g["dot"], g["span"])
    return f'<path fill-rule="evenodd" d="{disc(128, 128, g["R"])} {arcs} {d}" fill="{col}"/>'

def svg(inner, vb, title="use-signalr"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{inner}</svg>\n')

# ---------- wordmark (x-height 60, stroke 12) ----------
W = 12
G = {
    "u": (52, [("line", 0, 0, 0, 34), ("arc", 26, 34, 26, 0, 180), ("line", 52, 0, 52, 60)]),
    "s": (32, [("arc", 16, 15, 15, -270, -32), ("arc", 16, 45, 15, -90, 148)]),
    "e": (60, [("line", 0, 30, 60, 30), ("arc", 30, 30, 30, -320, 0)]),
    "-": (22, [("line", 0, 32, 22, 32)]),
    "i": (0, [("line", 0, 0, 0, 60), ("dot", 0, -20, 8)]),
    "g": (60, [("ring", 30, 30, 30), ("line", 60, 0, 60, 66), ("arc", 34, 66, 26, 0, 140)]),
    "n": (52, [("line", 0, 0, 0, 60), ("arc", 26, 26, 26, 180, 360), ("line", 52, 26, 52, 60)]),
    "a": (60, [("ring", 30, 30, 30), ("line", 60, 0, 60, 60)]),
    "l": (0, [("line", 0, -28, 0, 60)]),
    "r": (40, [("line", 0, 0, 0, 60), ("arc", 26, 26, 26, 180, 296)]),
}
GAP = {"default": 26, "-": 20}

def wordmark_path(text="use-signalr"):
    parts, x = [], 0.0
    for i, ch in enumerate(text):
        w, prims = G[ch]
        for p in prims:
            k = p[0]
            if k == "line":
                parts.append(capsule(x + p[1], p[2], x + p[3], p[4], W))
            elif k == "arc":
                parts.append(sector(x + p[1], p[2], p[3], p[4], p[5], W))
            elif k == "ring":
                parts.append(ring(x + p[1], p[2], p[3], W))
            elif k == "dot":
                parts.append(disc(x + p[1], p[2], p[3]))
        if i < len(text) - 1:
            nxt = text[i + 1]
            x += w + (GAP["-"] if "-" in (ch, nxt) else GAP["default"])
    return " ".join(parts), x + G[text[-1]][0]

def main():
    word, width = wordmark_path()
    top, bottom = -28 - W / 2, 82.7 + W / 2 + 4
    files = {}

    files["symbol.svg"] = svg(symbol_colour(REG), "0 0 256 256")
    files["symbol-small.svg"] = svg(symbol_colour(SMALL), "0 0 256 256")
    files["symbol-black.svg"] = svg(symbol_knockout(REG, "#000000"), "0 0 256 256")
    files["symbol-white.svg"] = svg(symbol_knockout(REG, "#FFFFFF"), "0 0 256 256")
    files["symbol-amber.svg"] = svg(symbol_knockout(REG, AMBER), "0 0 256 256")

    pad = W / 2
    wvb = f"{-pad:.0f} {top:.0f} {width + 2 * pad:.0f} {bottom - top:.0f}"
    for name, col in (("wordmark-on-light.svg", INK), ("wordmark-on-dark.svg", PAPER), ("wordmark-black.svg", "#000000"), ("wordmark-white.svg", "#FFFFFF")):
        files[name] = svg(f'<path d="{word}" fill="{col}"/>', wvb)

    # horizontal: x-height = 0.375 of badge height, centred on the badge centre
    s = 1.6
    tx = 256 + 64
    ty = 128 - 30 * s
    hw = tx + (width + pad) * s
    for mode, col in (("on-light", INK), ("on-dark", PAPER)):
        inner = symbol_colour(REG) + f'<g transform="translate({tx} {ty:.1f}) scale({s})"><path d="{word}" fill="{col}"/></g>'
        files[f"lockup-horizontal-{mode}.svg"] = svg(inner, f"0 0 {hw:.0f} 256")
    for mode, col in (("black", "#000000"), ("white", "#FFFFFF")):
        inner = symbol_knockout(REG, col) + f'<g transform="translate({tx} {ty:.1f}) scale({s})"><path d="{word}" fill="{col}"/></g>'
        files[f"lockup-horizontal-{mode}.svg"] = svg(inner, f"0 0 {hw:.0f} 256")

    # stacked: badge on top, wordmark below
    ss = 0.9
    sw = (width + 2 * pad) * ss
    total_w = max(sw, 256)
    bx = (total_w - 256) / 2
    wy = 256 + 56 - top * ss
    th = wy + bottom * ss
    for mode, col in (("on-light", INK), ("on-dark", PAPER)):
        inner = (f'<g transform="translate({bx:.1f} 0)">{symbol_colour(REG)}</g>'
                 f'<g transform="translate({(total_w - width * ss) / 2:.1f} {wy:.1f}) scale({ss})"><path d="{word}" fill="{col}"/></g>')
        files[f"lockup-stacked-{mode}.svg"] = svg(inner, f"0 0 {total_w:.0f} {th:.0f}")

    os.makedirs(OUT, exist_ok=True)
    for n, c in files.items():
        with open(os.path.join(OUT, n), "w", encoding="utf8") as f:
            f.write(c)
    print("\n".join(files))

if __name__ == "__main__":
    main()

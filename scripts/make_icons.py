"""Draws the app icon: a wooden namliyeh (kitchen cupboard with mesh doors) on olive,
at every size phones ask for."""
from pathlib import Path

from PIL import Image, ImageDraw

OLIVE = (51, 69, 42)
WOOD = (196, 140, 82)
WOOD_DARK = (140, 92, 48)
MESH_BG = (246, 240, 226)
MESH_LINE = (176, 160, 130)
SAFFRON = (230, 164, 52)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def namliyeh(size: int, safe: float, rounded: bool) -> Image.Image:
    """safe = share of the canvas the cupboard may use (maskable icons need a wider margin)."""
    scale = 4  # draw large, then shrink, for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=OLIVE)
    else:
        d.rectangle([0, 0, s, s], fill=OLIVE)

    w = s * safe
    h = w * 1.08
    left = (s - w) / 2
    top = (s - h) / 2
    r = int(w * 0.04)

    # Crown on top, body, and two short legs.
    d.rounded_rectangle([left - w * 0.05, top, left + w * 1.05, top + h * 0.09], radius=r, fill=WOOD_DARK)
    d.rounded_rectangle([left, top + h * 0.07, left + w, top + h * 0.92], radius=r, fill=WOOD)
    d.rectangle([left + w * 0.06, top + h * 0.92, left + w * 0.16, top + h], fill=WOOD_DARK)
    d.rectangle([left + w * 0.84, top + h * 0.92, left + w * 0.94, top + h], fill=WOOD_DARK)

    # Two mesh doors.
    pad = w * 0.08
    gap = w * 0.05
    door_w = (w - 2 * pad - gap) / 2
    door_top = top + h * 0.15
    door_bottom = top + h * 0.84
    for i in range(2):
        x0 = left + pad + i * (door_w + gap)
        x1 = x0 + door_w
        d.rounded_rectangle([x0, door_top, x1, door_bottom], radius=int(r * 0.6), fill=MESH_BG)
        step = door_w / 6
        line = max(1, int(s / 220))
        x = x0 + step
        while x < x1 - step / 2:
            d.line([(x, door_top), (x, door_bottom)], fill=MESH_LINE, width=line)
            x += step
        y = door_top + step
        while y < door_bottom - step / 2:
            d.line([(x0, y), (x1, y)], fill=MESH_LINE, width=line)
            y += step
        d.rounded_rectangle([x0, door_top, x1, door_bottom], radius=int(r * 0.6), outline=WOOD_DARK, width=int(w * 0.025))

    # Saffron knobs.
    knob = w * 0.045
    cy = (door_top + door_bottom) / 2
    for cx in (left + w / 2 - gap / 2 - knob * 1.4, left + w / 2 + gap / 2 + knob * 1.4):
        d.ellipse([cx - knob, cy - knob, cx + knob, cy + knob], fill=SAFFRON)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    namliyeh(192, 0.58, True).save(OUT / "icon-192.png")
    namliyeh(512, 0.58, True).save(OUT / "icon-512.png")
    namliyeh(512, 0.46, False).save(OUT / "icon-maskable-512.png")
    # iOS adds its own rounded corners and dislikes transparency.
    namliyeh(180, 0.58, False).convert("RGB").save(OUT / "apple-touch-icon.png")
    (OUT / "icon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<rect width="100" height="100" rx="22" fill="#33452a"/>'
        '<rect x="18" y="18" width="64" height="6" rx="2" fill="#8c5c30"/>'
        '<rect x="21" y="23" width="58" height="55" rx="2" fill="#c48c52"/>'
        '<rect x="25" y="28" width="24" height="44" rx="1.5" fill="#f6f0e2" stroke="#8c5c30" stroke-width="1.5"/>'
        '<rect x="51" y="28" width="24" height="44" rx="1.5" fill="#f6f0e2" stroke="#8c5c30" stroke-width="1.5"/>'
        '<circle cx="45" cy="50" r="2.6" fill="#e6a434"/><circle cx="55" cy="50" r="2.6" fill="#e6a434"/>'
        '<rect x="24" y="78" width="6" height="5" fill="#8c5c30"/><rect x="70" y="78" width="6" height="5" fill="#8c5c30"/></svg>\n'
    )
    print("icons written to", OUT)


if __name__ == "__main__":
    main()

"""Draws the app icon (a white house with a saffron door on olive) at every size phones ask for."""
from pathlib import Path

from PIL import Image, ImageDraw

OLIVE = (51, 69, 42)
WHITE = (246, 247, 242)
SAFFRON = (230, 164, 52)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def house(size: int, safe: float, rounded: bool) -> Image.Image:
    """safe = share of the canvas the house may use (maskable icons need a wider margin)."""
    scale = 4  # draw large, then shrink, for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=OLIVE)
    else:
        d.rectangle([0, 0, s, s], fill=OLIVE)

    w = s * safe
    left = (s - w) / 2
    top = (s - w) / 2 + w * 0.02
    roof_peak = (s / 2, top)
    roof_l = (left, top + w * 0.46)
    roof_r = (left + w, top + w * 0.46)
    d.polygon([roof_peak, roof_r, roof_l], fill=WHITE)
    body = [left + w * 0.14, top + w * 0.40, left + w * 0.86, top + w * 0.98]
    d.rounded_rectangle(body, radius=int(w * 0.05), fill=WHITE)
    door = [s / 2 - w * 0.12, top + w * 0.62, s / 2 + w * 0.12, top + w * 0.98]
    d.rounded_rectangle(door, radius=int(w * 0.10), fill=SAFFRON)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    house(192, 0.62, True).save(OUT / "icon-192.png")
    house(512, 0.62, True).save(OUT / "icon-512.png")
    house(512, 0.50, False).save(OUT / "icon-maskable-512.png")
    # iOS adds its own rounded corners and dislikes transparency.
    house(180, 0.62, False).convert("RGB").save(OUT / "apple-touch-icon.png")
    (OUT / "icon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<rect width="100" height="100" rx="22" fill="#33452a"/>'
        '<polygon points="50,20 81,48 19,48" fill="#f6f7f2"/>'
        '<rect x="27.7" y="44" width="44.6" height="36" rx="3" fill="#f6f7f2"/>'
        '<rect x="42.6" y="58" width="14.8" height="22" rx="6" fill="#e6a434"/></svg>\n'
    )
    print("icons written to", OUT)


if __name__ == "__main__":
    main()

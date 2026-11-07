# Namliyeh

The household app for supplies and money (النملية). This is style D, approved by the family on 7 November 2026: the original layout people already know, made premium. It is the base every new screen starts from. Code lives in github.com/TariqSharia/namliyeh (`src/styles.css`, `src/ui/Icon.tsx`, `src/ui/ItemArt.tsx`); the branch `design-d-base` marks the approved version (keep it; never commit to it).

## Who it is for

A family: an 8-year-old and a 99-year-old must manage the daily tasks alone. So every screen keeps: three big buttons for the daily tasks, tap before type, a picture beside every item, large text that follows the phone's text size, every action undoable, plain formal Arabic (fuṣḥā) and English, right-to-left from the first screen.

## Content fundamentals

- Formal Arabic everywhere, short sentences. Buttons say what happens: "اشترينا", "استُهلك", "حفظ غرضين".
- Numbers in the reader's digits (Arabic-Indic in Arabic). Show the number of things, not a fill bar: "full" changes from month to month.
- One fact under an item, the one worth knowing: when it expires, or that it is on the shopping list.

## Visual foundations

- **Colour:** `paper` ground, `surface` lists, `ink` text. Three identity colours, each with one job: `olive` (We bought, primary actions), `night` (We used), `saffron` (To buy). `pomegranate` only for warnings: expiring, thrown away, low, spending.
- **The mesh:** the namliyeh's wire mesh, two crossed 45° hairlines every 10px at 7% white (8% brown on saffron), on the three home blocks and the money summary only. It is the one decoration.
- **Type:** Noto Kufi Arabic for headings, block labels and counts; IBM Plex Sans Arabic for everything read. Sizes in rem so the phone's text size applies.
- **Shapes:** flat. Borders (`line`), never shadows or 3D edges. Radii from `radius-sm` to `radius-block`; chips are pills.
- **Layout:** lists grouped in one `surface` box with dividers; sections titled in `muted`; side margin `gutter`; every tap target at least `touch`.

## Iconography

- **Interface icons:** one line set (`src/ui/Icon.tsx`), 24px grid, 1.8 stroke, round caps, `currentColor`. Never emoji for buttons, tabs or actions: emoji look different on iPhone and Samsung and read as childish.
- **Item pictures:** drawn per catalog item (`src/ui/ItemArt.tsx`), 48px grid: white shapes, `olive` outline 2.4, one `saffron` band, on an `olive-soft` square. Until an item has a drawing it shows its catalog picture; typed-in items show their first letter in the heading face.

## Approved screens and decisions

- Home: the three blocks (We bought, We used, To buy with the first names on the list and a count), then "Use soon" rows with Used as the main button and thrown away as a bin icon.
- At home: grouped by place (fridge, pantry, bathroom…), one scrolling row of place chips, the number per item; search covers the whole catalog.
- We bought: shops as one short row; prices in the main currency, other currencies behind the ₪ beside a price; suggestions from the list in `saffron-soft`.
- To buy: no ticks; "We bought these" takes the whole list.
- Money: what is left as the big number on an `olive` mesh card, income and spending under it; tap an entry to edit or delete it (no bin per row).
- Drawings were chosen over emoji for item pictures.

Mock-ups of every approved screen: the Namliyeh redesign canvas (boards named "D.").

## For developers

- Tokens are the CSS custom properties at the top of `src/styles.css` (same names as above: `--paper`, `--olive`, `--night`, `--saffron`, `--pomegranate`, `--heading`…). New colours go there first, never as literals in a component.
- Fonts come from `@fontsource/noto-kufi-arabic` and `@fontsource/ibm-plex-sans-arabic` (self-hosted, work offline), imported in `src/main.tsx`.
- To return to this base: `git checkout origin/design-d-base -- src/styles.css src/ui/Icon.tsx src/ui/ItemArt.tsx`.
- Design system page (tokens, rules, cover): the "Namliyeh" design system artifact on claude.ai.

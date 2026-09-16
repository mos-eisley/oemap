#!/usr/bin/env python3
"""Nyomtatható QR-ív a folyosókra és előterekbe.

Beltérben a GPS nem ad emelet- vagy terem-szintű pontosságot, ezért a „hol
vagyok?" kérdésre a hallgatónak kellene válaszolnia. Egy falra ragasztott QR
ezt leveszi róla: a kód a #from=<terem> mély linkre mutat, így az app már
tudja, honnan indul — csak a célt kell megadni. Se engedélykérés, se hálózat:
a telepített PWA offline is elindul.

Használat:
  python3 tools/make-qr.py https://oemap.maydayprod.app/ qr.html [SZINT ...]
"""
import sys, re, json, html, pathlib
import qrcode
import qrcode.image.svg

# Ahol valaki állhat és tájékozódik.
PLACES = {"KÖZLEKEDŐK", "ELŐTEREK", "KÖZÖSSÉGI TEREK"}


def load_rooms(index_html):
    src = pathlib.Path(index_html).read_text(encoding="utf-8")
    D = json.loads(re.search(r"const D\s*=\s*(\{.*?\});\s*\n", src, re.S).group(1))
    return D


def qr_svg(url):
    """Egy QR SVG-je, a saját viewBoxával.

    A border=4 a szabvány szerinti csendzóna — enélkül a legtöbb olvasó nem
    ismeri fel a kódot. A viewBoxot a generált SVG-ből vesszük: az img.width a
    keret NÉLKÜLI modulszám, a rajz viszont a kerettel együtt értendő, a kettő
    összekeverése levágná a csendzónát. A fehér alap azért kell, hogy sötét
    háttéren se boruljon a kontraszt.
    """
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage,
                      box_size=10, border=4,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    svg = img.to_string(encoding="unicode")
    # A \\s kötelező: a qrcode id="qr-path"-t is tesz a path-ra, és az "id=" végén
    # lévő d=" enélkül elnyelné az illesztést, így a path adat helyett az id-t
    # kapnánk vissza — a kód üresen jelenne meg.
    path = re.search(r'<path[^>]*?\sd="([^"]+)"', svg).group(1)
    vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
    n = vb.split()[2]
    return (f'<svg viewBox="{vb}" role="img" aria-label="QR">'
            f'<rect width="{n}" height="{n}" fill="#fff"/>'
            f'<path d="{path}" fill="#00288C"/></svg>')


def main(base, out, levels=None):
    D = load_rooms("index.html")
    lv = {l["level"]: l["name"] for l in D["levels"]}
    want = set(int(x) for x in levels) if levels else set(lv)

    # Egy kódra egy matrica. A tervlapon akad ismétlődő kód (pl. OA00FK2 az
    # ELŐTÉR-re és az AULÁ-ra is); az app ROOM táblája Object.fromEntries-szel
    # épül, ott az UTOLSÓ nyer — a kétféle matrica közül a korábbi máshova
    # vinné a hallgatót, mint amit a felirat ígér, ezért ugyanígy az utolsót
    # tartjuk meg, és jelezzük az ismétlődést.
    last = {}
    for r in D["rooms"]:
        if r.get("code"):
            last[r["code"]] = id(r)
    dupes = []

    cards = []
    for r in sorted(D["rooms"], key=lambda r: (r["level"], r.get("code") or "")):
        if not r.get("code") or r["level"] not in want or r.get("cat") not in PLACES:
            continue
        if last[r["code"]] != id(r):
            dupes.append(r["code"])
            continue
        url = base.rstrip("/") + "/#from=" + r["code"]
        cards.append(f'''<figure class="c">
  {qr_svg(url)}
  <figcaption>
    <b>{html.escape(r.get("name") or r["cat"])}</b>
    <span class="code">{html.escape(r["code"])}</span>
    <span class="lv">{html.escape(lv[r["level"]])}</span>
    <span class="u">{html.escape(url)}</span>
  </figcaption>
</figure>''')

    page = f"""<!doctype html><html lang="hu"><meta charset="utf-8">
<title>OA épület · helyszíni QR-kódok</title>
<style>
 @page{{size:A4;margin:12mm}}
 body{{font:13px/1.4 system-ui,sans-serif;color:#0d151f;margin:0}}
 h1{{font-size:17px;margin:0 0 4px}}
 p.lead{{color:#61748a;margin:0 0 14px;max-width:62ch}}
 .grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm}}
 .c{{margin:0;border:1px solid #d5dde7;border-radius:8px;padding:7mm 5mm 5mm;text-align:center;
     break-inside:avoid;page-break-inside:avoid}}
 .c svg{{width:44mm;height:44mm;display:block;margin:0 auto 4mm}}
 figcaption b{{display:block;font-size:15px}}
 .code{{display:block;font-family:ui-monospace,monospace;font-size:13px;color:#00288C;margin-top:2px}}
 .lv{{display:block;font-size:11px;color:#61748a}}
 .u{{display:block;font-size:8px;color:#9aa8b8;margin-top:3mm;word-break:break-all}}
 @media print{{ .no{{display:none}} }}
</style>
<h1>OA épület · „itt vagyok” QR-kódok</h1>
<p class="lead">Ragaszd a megfelelő folyosóra vagy előtérbe. Beolvasva a teremkereső
már tudja, honnan indul a hallgató — csak a célt kell megadnia.</p>
<div class="grid">{''.join(cards)}</div>
</html>"""
    pathlib.Path(out).write_text(page, encoding="utf-8")
    if dupes:
        print("ismétlődő kód, a tervlap szerinti utolsó helyiség maradt: "
              + ", ".join(sorted(set(dupes))), file=sys.stderr)
    print(f"{len(cards)} QR-kód -> {out}")
    for c in re.findall(r'<span class="code">([^<]+)</span>', "".join(cards)):
        print("  ", c)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:] or None)

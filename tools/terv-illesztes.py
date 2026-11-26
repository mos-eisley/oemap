#!/usr/bin/env python3
"""Az alaprajz és a térkép összeillesztése: melyik irányba áll, és hol.

Az épületválasztó térképe és az épület alaprajza egy ablakban van: a
térképről befelé nagyítva az épület váza nyílik meg, onnan kifelé nagyítva
a térkép jön vissza. Hogy ez egy mozdulatnak látsszon, a két képnek ugyanott
és ugyanúgy elfordulva kell állnia az átadáskor. A térkép északra áll, az
alaprajz viszont a tervlap rajzolt állásában (a hosszabbik fala vízszintes):
az OA például ~35°-kal el van fordulva a valódi tájoláshoz képest.

Ez az eszköz minden megnyitható, OSM-körvonallal bíró épületre megkeresi azt
a merev transzformot (forgatás, eltolás; a lépték 1 körül, tükrözés nélkül), amely a földszint körvonalát (a helyiségek és falak uniója) az
OSM-körvonalra illeszti, a közös terület arányát (IoU) maximalizálva, és a
`data/helyek.json` épületéhez írja `terv` néven:

    "terv": {"r": szög fokban (az óramutatóval ellentétes, északra álló,
                 y-fölfelé rendszerben), "s": lépték, "m": tükrözött-e,
             "c": [x, y] az alaprajz súlypontja (tervlapi méter, y lefelé),
             "ll": [lon, lat] a súlypont helye a térképen, "iou": a fedés}

Egy tervlapi (x, y) pont térképi helye: a súlypontjától mért eltérés y-ját
megfordítva (és ha "m", az x-ét is), `r` fokkal elforgatva, `s`-sel
szorozva, a `ll` pontból indítva (méterben, kelet és észak felé).

Ahol nincs körvonal (OB, TB, YC: az OSM-ben csak pont), ott nincs `terv`: az
app a pontra teszi az alaprajz közepét, a tervlap állásában.

A `helyek.py` újrafuttatása után ezt is újra kell futtatni (az a fájlt
újraírja, a `terv` mezőt nem ismeri).

Használat:  python3 tools/terv-illesztes.py            (a repó gyökeréből)
"""
import json, math, re, sys
from pathlib import Path
import shapely
from shapely.geometry import Polygon
from shapely import affinity

ROOT = Path(__file__).resolve().parent.parent
# Ennél kisebb fedésnél az illesztés nem megbízható (mérve: OA 0,91, OC 0,89,
# FF 0,94, FK 0,88, OD 0,67 — ezek szemre is jók; KH 0,32, KT 0,46 rosszak)
IOU_MIN = 0.6


def oa_adat():
    src = (ROOT / "index.html").read_text(encoding="utf-8")
    i0 = re.search(r"\b(?:const|let) D = ", src).end()
    return json.JSONDecoder().raw_decode(src, i0)[0]


def epulet_adat(kod):
    if kod == "OA":
        return oa_adat()
    p = ROOT / "data" / "epuletek" / (kod.lower() + ".json")
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def foldszint(D):
    """A földszint (ha nincs, a legnagyobb szint) körvonala, tervlapi méterben,
    a falak közti réseket bezárva."""
    szintek = {l["level"] for l in D["levels"]}
    def unio(lv):
        g = [Polygon(r["poly"]).buffer(0) for r in D["rooms"] if r["level"] == lv and len(r["poly"]) >= 3]
        g += [Polygon(w).buffer(0) for w in D.get("walls", {}).get(str(lv), []) if len(w) >= 3]
        return shapely.union_all(g).buffer(0.4, join_style=2).buffer(-0.4, join_style=2)
    if 0 in szintek:
        return unio(0)
    return max((unio(lv) for lv in szintek), key=lambda g: g.area)


def vetulet(helyek):
    """Ugyanaz a vetület, mint az app jelVetulet()-je: az ország befoglalójának
    közepére álló egyenközű, méterben, x keletre, y északra."""
    g = helyek["terkep"]["orszag"]["hatar"][0]
    xs = [p[0] for p in g]; ys = [p[1] for p in g]
    la0 = (min(ys) + max(ys)) / 2; lo0 = (min(xs) + max(xs)) / 2
    KX = 111320 * math.cos(la0 * math.pi / 180); KY = 110540
    return (lambda lon, lat: ((lon - lo0) * KX, (lat - la0) * KY),
            lambda x, y: (x / KX + lo0, y / KY + la0))


def iou(a, b):
    i = a.intersection(b).area
    return i / (a.area + b.area - i) if i else 0.0


def illeszt(terv, osm):
    """terv: y-fölfelé fordított alaprajz (súlypontja az origóban); osm: a
    körvonal világkoordinátában. Durva szögkeresés, utána finomítás."""
    oc = osm.centroid
    def helyez(g, r, s, dx, dy):
        g = affinity.rotate(g, r, origin=(0, 0))
        g = affinity.scale(g, s, s, origin=(0, 0))
        return affinity.translate(g, oc.x + dx, oc.y + dy)
    legjobb = (0, 0, 1, 0, 0, False)
    # Tükrözés nincs: a tervlap felülnézet, ahogy a térkép is. Próbaként
    # mérve egy téglalap (FF) tükrözve ugyanúgy fed, és a döntetlenben a
    # tükrözött nyert volna.
    for m in (False,):
        g0 = affinity.scale(terv, -1, 1, origin=(0, 0)) if m else terv
        for r10 in range(0, 3600, 5):
            v = iou(helyez(g0, r10 / 10, 1, 0, 0), osm)
            if v > legjobb[0]: legjobb = (v, r10 / 10, 1, 0, 0, m)
    v, r, s, dx, dy, m = legjobb
    g0 = affinity.scale(terv, -1, 1, origin=(0, 0)) if m else terv
    # koordinátánkénti finomítás, csökkenő lépésekkel
    for lep in (1.0, 0.5, 0.2, 0.1, 0.05):
        javult = True
        while javult:
            javult = False
            for d in [(lep, 0, 0, 0), (-lep, 0, 0, 0), (0, lep * .02, 0, 0), (0, -lep * .02, 0, 0),
                      (0, 0, lep, 0), (0, 0, -lep, 0), (0, 0, 0, lep), (0, 0, 0, -lep)]:
                r2, s2, x2, y2 = r + d[0], min(1.08, max(.92, s + d[1])), dx + d[2], dy + d[3]
                v2 = iou(helyez(g0, r2, s2, x2, y2), osm)
                if v2 > v + 1e-6:
                    v, r, s, dx, dy = v2, r2, s2, x2, y2; javult = True
    return {"r": round(r % 360, 2), "s": round(s, 4), "m": m, "iou": round(v, 3),
            "w": (oc.x + dx, oc.y + dy)}


def main():
    hp = ROOT / "data" / "helyek.json"
    helyek = json.loads(hp.read_text(encoding="utf-8"))
    nyilv = json.loads((ROOT / "data" / "epuletek.json").read_text(encoding="utf-8"))["epuletek"]
    p, vissza = vetulet(helyek)
    for kod, e in sorted(nyilv.items()):
        h = helyek["epuletek"].get(kod)
        if not e.get("navigalhato") or not h:
            continue
        h.pop("terv", None)
        if not h.get("kontur"):
            print(f"{kod}: nincs körvonal (csak pont) — az alaprajz a pontra kerül, a tervlap állásában")
            continue
        D = epulet_adat(kod)
        if not D:
            continue
        fsz = foldszint(D)
        c = fsz.centroid
        # tervlap: y lefelé → y fölfelé, súlypont az origóban
        terv = affinity.scale(affinity.translate(fsz, -c.x, -c.y), 1, -1, origin=(0, 0))
        osm = Polygon([p(lon, lat) for lon, lat in h["kontur"][0]]).buffer(0)
        f = illeszt(terv, osm)
        if f["iou"] < IOU_MIN:
            # a KH-nál az OSM-körvonal az épületnek csak egyik tömbje, a KT-nál
            # más alakú: egy rossz szög rosszabb, mint a tervlap állása
            print(f"{kod}: IoU {f['iou']:.2f} < {IOU_MIN} — nem illeszthető, a pontra kerül, a tervlap állásában")
            continue
        lon, lat = vissza(*f["w"])
        h["terv"] = {"r": f["r"], "s": f["s"], "m": f["m"], "c": [round(c.x, 2), round(c.y, 2)],
                     "ll": [round(lon, 7), round(lat, 7)], "iou": f["iou"]}
        figy = "  ← gyengébb, szemre ellenőrizve" if f["iou"] < 0.8 else ""
        print(f"{kod}: {f['r']:6.1f}°  lépték {f['s']:.3f}  tükör {f['m']}  "
              f"IoU {f['iou']:.2f}  (alaprajz {fsz.area:.0f} m², OSM {osm.area:.0f} m²){figy}")
    hp.write_text(json.dumps(helyek, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.exit(__doc__)
    main()

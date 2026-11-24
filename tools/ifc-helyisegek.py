#!/usr/bin/env python3
"""A helyiség-sokszögek pontosítása az épület IFC-modelljének falaiból
(`data/epuletek/<kód>.json`, vagy a `tervlap-batch.py` kimenete).

A `tervlap-uj.py` a tervlap PDF-jéből vágja ki a helyiségeket, és ennek két
ismert hibája van (docs/ATADAS.md, 1.): felső korlát nélkül fogad el
sokszöget, és mivel a folyosót vágja ki utoljára, egy rosszul kivágott apró
helyiség elnyeli a folyosó szabad terét. A maszk a közlekedőkből épül, így egy
rossz folyosó-sokszög a hálózatot viszi el (KB, KT), vagy a homlokzat elé
nyúlik (KH, FK). Az IFC-ben a falak zártak: az ajtó fölött a szemöldök is a
fal része, a vízszintes vetületben tehát a falak gyűrűt adnak, és **a
gyűrűk belseje maga a helyiség**. Ezért:

1. Szintenként az IFC falainak uniója a térképre illesztve (ugyanaz az
   illesztés, mint az ajtóké: `ifc-epulet.illesztes()`), és belőle az üregek:
   a fal-sokszögek lyukai, mínusz a bennük álló szabad falak.
   A falak közti apró réseket előbb bezárja (`ZARAS`).
2. Minden helyiség a pecsétje helyén (`cx`, `cy`) álló üreghez tartozik.
3. **Csak akkor cseréli a sokszöget, ha egyértelmű és jobb**: az üregben
   egyetlen pecsét áll, a területe a táblától legfeljebb `TUR`-ra tér el,
   és közelebb van hozzá, mint a kivágott sokszög. Ahol több pecsét áll egy
   üregben (WC-fülkék válaszfal nélkül, nyitott tér), ott a kivágás marad.
4. A maszkhoz hozzájön (a régit nem veszi el) a javított közlekedők
   maszkja, az `epulet-json.py` szabályával (a közlekedők uniója
   `KOZL_TAG`-gal tágítva, mínusz a térkép falai), és a **gazdátlan padló**: az IFC-üregeknek az a része, amelyet
   egyetlen helyiség sokszöge sem fed, és közlekedőhöz ér. Ez a kivágó
   kihagyott darabja, többnyire előcsarnok vagy lépcsőház-előtér: az YC
   földszintjén a lépcsőház és a fő folyosó közti sáv ilyen volt, és nélküle
   a földszint fele elérhetetlen. Az üreg a külső falon belül van, így ez
   nem nyúlik a homlokzat elé.

A térkép falai (`walls`) maradnak: az app azokat rajzolja, és azokban vannak
az ajtónyílások (az IFC falában a szemöldök miatt nincsenek). Az ajtókat
utána az `ifc-epulet.py` írja.

Használat:  python3 -I tools/ifc-helyisegek.py <OE_XX.ifc> <épület.json>
Az IFC belső anyag: ne tedd a repóba.
"""
import sys, json, base64, importlib.util, collections
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
import ifcopenshell, ifcopenshell.geom as G


def _betolt(nev, fajl):
    sp = importlib.util.spec_from_file_location(nev, Path(__file__).with_name(fajl))
    m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


E = _betolt("ifc_epulet", "ifc-epulet.py")
J = _betolt("epulet_json", "epulet-json.py")

TUR = 0.05          # az üreg területe ennyire térhet el a táblától
ARVA_MIN = 1.0      # m², ennél kisebb gazdátlan padlódarab nem kerül a maszkba
MIN_UREG = 0.5      # m², ennél kisebb üreg falréteg-rés, nem helyiség
ZARAS = 0.08        # m: a falak közti ennyinél (kétszer ennyinél) keskenyebb rés zárva
# A falak sokszor nem érnek össze: a csatlakozásnál centiméteres rés marad, és
# rajta át a szomszédos helyiségek egy üreggé folynak össze. Az OB földszintjén
# zárás nélkül 13 üreg jön ki, 3 cm-rel 16, 8 cm-rel 19 (15 cm-rel sem több).


def uregek(falak):
    """A fal-unió zárt üregei: a sokszögek lyukai, a bennük álló falak nélkül."""
    W = shapely.union_all([g.buffer(0) for g in falak], grid_size=0.001)
    W = W.buffer(ZARAS, join_style=2).buffer(-ZARAS, join_style=2)
    ki = []
    for p in (W.geoms if hasattr(W, "geoms") else [W]):
        if p.geom_type != "Polygon": continue
        for h in p.interiors:
            u = Polygon(h).difference(W)
            for q in (u.geoms if hasattr(u, "geoms") else [u]):
                if q.geom_type == "Polygon" and q.area >= MIN_UREG: ki.append(q)
    return ki


def main(ifc, js):
    D = json.load(open(js, encoding="utf-8"))
    f = ifcopenshell.open(ifc)
    S = G.settings(); S.set(S.USE_WORLD_COORDS, True)
    dlv, hova, falak_ifc, dfal, tr = E.illesztes(f, S, D)

    stat = collections.Counter(); hibak = []; arva = {}
    for Lv in D["levels"]:
        lv = Lv["level"]
        if lv not in falak_ifc: continue
        ur = uregek([tr(g) for g in falak_ifc[lv]])
        arva[lv] = ur
        itt = [r for r in D["rooms"] if r["level"] == lv and r.get("code") and r.get("area")]
        hol = collections.defaultdict(list)
        for r in itt:
            p = Point(r["cx"], r["cy"])
            k = next((i for i, u in enumerate(ur) if u.contains(p)), None)
            if k is not None: hol[k].append(r)
            else: stat["pecsét üregen kívül"] += 1
        for k, rs in hol.items():
            if len(rs) > 1: stat["több pecsét egy üregben"] += len(rs); continue
            r = rs[0]; u = ur[k].simplify(0.02); A_ = r["area"]
            regi = abs(Polygon(r["poly"]).buffer(0).area - A_) / A_
            uj = abs(u.area - A_) / A_
            if uj > TUR or uj >= regi:
                stat["marad (az IFC nem jobb)"] += 1; continue
            r["poly"] = [[round(x, 2), round(y, 2)] for x, y in u.exterior.coords[:-1]]
            stat["cserélve"] += 1
            if regi > 0.03: hibak.append((r["code"], round(regi * 100), round(uj * 100, 1)))

    # a maszk újra, a javított közlekedőkkel (az epulet-json.py szabálya)
    GR = D["grid"]; GW, GH = GR["w"], GR["h"]
    for Lv in D["levels"]:
        lv = Lv["level"]
        fal = unary_union(dfal(lv) or [Polygon()])
        kozl = unary_union([Polygon(r["poly"]).buffer(0) for r in D["rooms"] if r["level"] == lv and r.get("circ")]
                           or [Polygon()])
        if lv in arva:
            # a falakon belüli, egyetlen helyiséghez sem rendelt padló, ha
            # közlekedőhöz ér: a kivágó elhagyta (lásd fent), a maszkba kerül
            mind = unary_union([Polygon(r["poly"]).buffer(0) for r in D["rooms"] if r["level"] == lv] or [Polygon()])
            maradek = unary_union(arva[lv] or [Polygon()]).difference(mind.buffer(0.15, join_style=2))
            pot = [q for q in getattr(maradek, "geoms", [maradek])
                   if q.geom_type == "Polygon" and q.area >= ARVA_MIN and q.distance(kozl) < 0.5]
            if pot:
                kozl = unary_union([kozl] + pot)
                stat["gazdátlan padló a maszkba (m²)"] += round(sum(q.area for q in pot))
        m = J.maszk(kozl, fal, GW, GH)
        # a régi maszkhoz csak HOZZÁAD: az épület adata más tágítással is
        # készülhetett (a KH és a KT `--tag 0.6`-tal), és az alapértelmezettel
        # újraépítve az FK folyosói az ajtónyílásoknál elszakadtak — a
        # helyiségek 2%-a maradt elérhető a 88% helyett
        regi = np.unpackbits(np.frombuffer(base64.b64decode(D["masks"][str(lv)]), np.uint8),
                             bitorder="little")[:GW * GH].reshape(GH, GW)
        m = m | regi
        D["masks"][str(lv)] = base64.b64encode(np.packbits(m.reshape(-1), bitorder="little").tobytes()).decode()

    with open(js, "w", encoding="utf-8") as ki:
        json.dump(E.tiszta(D), ki, ensure_ascii=False, separators=(",", ":"))
    jo = sum(1 for r in D["rooms"] if r.get("area") and abs(Polygon(r["poly"]).buffer(0).area - r["area"]) / r["area"] <= 0.03)
    n = sum(1 for r in D["rooms"] if r.get("area"))
    print("helyiségek: " + ", ".join(f"{k}: {v}" for k, v in stat.items()))
    print(f"±3%-on belül most: {jo}/{n} ({jo / max(n, 1):.1%})")
    print("javult (régi → új hiba, %): " + ", ".join(f"{k} {a}→{b}" for k, a, b in hibak))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])

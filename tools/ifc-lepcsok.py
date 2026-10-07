#!/usr/bin/env python3
"""A lépcsőkarok az épület IFC-modelljéből a térkép adatába (`D.flights`).

A térképen a lépcsőház eddig csak egy jel volt: hogy hol megy a lépcső, merre
indul és fordul, azt nem mutatta. Az IFC-ben (Archicad-export) a lépcső
tárolóelem („LÉPCSŐ”, az export beállítása: Stair export mode: Container
Element): a tárolónak magának nincs geometriája, csak helye — a karok
(„LK SZERKEZET”) a részei, és azoknak van (Brep). Egy korábbi vizsgálat csak a
tárolót nézte, és úgy hitte, a lépcsőknek nincs geometriája.

Karonként a felfelé néző vízszintes lapok magasság szerint csoportosítva a
fokok (és a pihenő); ezek alaprajzi körvonala és a járásvonal (a fokok közepe,
alulról felfelé) kerül a térképbe, a kar induló szintjére. Ami nagyobbrészt a
szint helyiségein kívül esik (külső lépcső, akna), az kimarad. Az illesztés
ugyanaz, mint az ajtóknál (tools/ifc-ajtok.py): a térkép falaira, egyetlen
merev transzform minden szintre.

Sorrend: a szárny (tervlap-szarny.py) és az ajtók (ifc-ajtok.py) után, hogy a
keret már a végleges legyen.

Használat:  python3 tools/ifc-lepcsok.py <OE-OA.ifc> index.html
            (pip install ifcopenshell numpy scipy shapely)
Az IFC belső anyag: ne tedd a repóba.
"""
import sys, json, math, importlib.util, collections
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import Polygon
from shapely import affinity
import ifcopenshell, ifcopenshell.geom as G

# az illesztés és a vetület az ajtók eszközéből jön: ugyanazt a transzformot kapjuk
_spec = importlib.util.spec_from_file_location("ifc_ajtok", Path(__file__).with_name("ifc-ajtok.py"))
A = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(A)

BENT = 0.5          # a kar alapterületének legalább ekkora része essen a szint helyiségeire
FOK_MIN = 0.03      # m², ennél kisebb felfelé néző lapcsoport zaj (élek, lábazat)


def fokok(S, e):
    """A kar felfelé néző vízszintes lapjai magasság szerint: [(z, sokszög)], alulról felfelé."""
    try:
        sh = G.create_shape(S, e)
    except Exception:
        return []
    v = np.array(sh.geometry.verts).reshape(-1, 3); fa = np.array(sh.geometry.faces).reshape(-1, 3)
    cs = collections.defaultdict(list)
    for a, b, c in fa:
        P, Q, R = v[a], v[b], v[c]; n = np.cross(Q - P, R - P); L = np.linalg.norm(n)
        if L < 1e-9 or n[2] / L <= 0.9: continue          # csak a felfelé nézők: a fokok teteje
        t = Polygon([P[:2], Q[:2], R[:2]])
        if t.area > 1e-8: cs[round(float((P[2] + Q[2] + R[2]) / 3), 2)].append(t.buffer(0))
    ki = []
    for z in sorted(cs):
        g = shapely.union_all(cs[z], grid_size=0.001)
        if g.area >= FOK_MIN: ki.append((z, g))
    return ki


def main(ifc, html):
    src = open(html, encoding="utf-8").read()
    i0 = src.index("const D = ") + len("const D = ")
    D, i1 = json.JSONDecoder().raw_decode(src, i0)
    f = ifcopenshell.open(ifc)
    S = G.settings(); S.set(S.USE_WORLD_COORDS, True)
    hova = {e.id(): A.SZINT.get(r.RelatingStructure.Name)
            for r in f.by_type("IfcRelContainedInSpatialStructure") for e in r.RelatedElements}
    for r in f.by_type("IfcRelAggregates"):        # a kar a tárolója szintjét kapja
        for o in r.RelatedObjects:
            if hova.get(o.id()) is None and hova.get(r.RelatingObject.id()) is not None:
                hova[o.id()] = hova[r.RelatingObject.id()]

    falak = [A.vetulet(S, e) for e in f.by_type("IfcBuildingElementProxy")
             if (e.Name or "").startswith("Fal") and hova.get(e.id()) == 2]
    dfal = [Polygon(w).buffer(0) for w in D["walls"]["2"]]
    flip, R, t, jo = A.illeszt([g for g in falak if g is not None], dfal)
    print(f"illesztés: tükör {flip}, szög {math.degrees(math.atan2(R[1, 0], R[0, 0])):.2f}°, "
          f"az I. emelet falainak {jo:.0%}-a 10 cm-en belül")
    tr = lambda g: affinity.affine_transform(affinity.scale(g, 1.0, flip, origin=(0, 0)),
                                             [R[0, 0], R[0, 1], R[1, 0], R[1, 1], t[0], t[1]])
    szint = {lv: shapely.union_all([Polygon(r["poly"]).buffer(0) for r in D["rooms"] if r["level"] == lv]
                                   + [Polygon(w).buffer(0) for w in D["walls"].get(str(lv), [])]).buffer(0.3)
             for lv in {r["level"] for r in D["rooms"]}}

    kerek = lambda p: [round(float(p[0]), 2), round(float(p[1]), 2)]
    karok, kint = collections.defaultdict(list), []
    for e in f.by_type("IfcBuildingElementProxy"):
        if not (e.Name or "").startswith("LK SZERKEZET"): continue
        lv = hova.get(e.id()); fk = fokok(S, e)
        if lv is None or len(fk) < 2: continue
        lapok = [(z, tr(g).simplify(0.01)) for z, g in fk]
        alap = shapely.union_all([g for _, g in lapok])
        if lv not in szint or alap.intersection(szint[lv]).area < BENT * alap.area:
            kint.append(f"{e.Name} (szint {lv}, {alap.centroid.x:.1f};{alap.centroid.y:.1f})"); continue
        sokszogek = [kerek_s for _, g in lapok for p in (g.geoms if hasattr(g, "geoms") else [g])
                     if p.geom_type == "Polygon" for kerek_s in [[kerek(q) for q in p.exterior.coords[:-1]]]]
        # a járásvonal a fokok közepén megy, alulról felfelé: a nyíl a végén a felfelé irány
        jaras = [kerek((g.centroid.x, g.centroid.y)) for _, g in lapok]
        karok[str(lv)].append({"t": sokszogek, "w": jaras})
    D["flights"] = {k: karok[k] for k in sorted(karok, key=int)}

    def tiszta(o):
        if isinstance(o, float): return int(o) if o == int(o) else o
        if isinstance(o, list): return [tiszta(x) for x in o]
        if isinstance(o, dict): return {k: tiszta(v) for k, v in o.items()}
        return o
    uj = json.dumps(tiszta(D), ensure_ascii=False, separators=(",", ":"))
    open(html, "w", encoding="utf-8").write(src[:i0] + uj + src[i1:])
    print("lépcsőkarok szintenként: " + ", ".join(f"{k}: {len(v)}" for k, v in D["flights"].items())
          + f" — összesen {sum(map(len, D['flights'].values()))}, "
          f"{len(json.dumps(D['flights'], separators=(',', ':')))} bájt")
    print("kimaradt (nagyobbrészt a szint helyiségein kívül): " + (", ".join(kint) or "egy sem"))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])

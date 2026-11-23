#!/usr/bin/env python3
"""Ajtók, `via` és lépcsőkarok egy gépi kinyerésű épület IFC-modelljéből
(`data/epuletek/<kód>.json`).

Az OA-hoz ugyanezt a `tools/ifc-ajtok.py` és a `tools/ifc-lepcsok.py` teszi
(az `index.html` beégetett `D`-jébe). Ez a kettő az OA-ra szabott: a szintek
nevét táblából veszi, az ajtót a kitöltő elem nevéből („D…”) ismeri fel, az
illesztést az I. emeleten végzi. A többi épület exportja (2026, ugyanaz az
Archicad-sablon) ebben eltér, ezért ez az eszköz:

- **a szintet a nevéből számolja** (`emelet()`): az IFC „FSZ”, „P1”, „P2”,
  „Félemelet”, „1.emelet”, „I. emelet” szintjét az épület adatának
  szintneveihez („Földszint”, „Pince -1”, „I. emelet”…) párosítja. Ami nem
  emelet (tető, kazán, „6. Szint”, torony), az kimarad.
- **az ajtót a geometriából ismeri fel**, nem a nevéből: az OD-ben az ajtó
  „AJ-…”, az „M…” ablak, az OC-ben az „A…” ablak, az FF-ben a „D…” ajtó. Ajtó
  az a nyílás, amelyik legalább 1,8 m magas, és vagy a gazdafala aljáról
  indul (padlószint), vagy a neve ajtóé („AJ-…”, „D…”: a több szinten átmenő
  falban a nyílás alja nem a fal alja).
- **az illesztés azon a szinten fut, ahol a legtöbb közös fal van**, és
  minden szinten kiírja, a térkép falainak hány százaléka esik 10 cm-en belül
  az IFC falaira.

Az ajtók és a `via` szabálya ugyanaz, mint az OA-é (lásd az `ifc-ajtok.py`
docstringjét): csak az úthálózatra (a lépcsőkkel összekötött legnagyobb
járható részre) nyíló ajtó számít, és ahol a térképen fal áll az ajtó helyén,
ott a térkép nyer. A félemeleten az alatta lévő szint ajtói is számítanak (a
közös falak az IFC-ben az alsó szinthez tartoznak). A lépcsőkarok szabálya
az `ifc-lepcsok.py`-é. Az illesztést, a vetületet és a karok fokait onnan
veszi, hogy ugyanaz a kód adja.

Használat:  python3 -I tools/ifc-epulet.py <OE_XX.ifc> data/epuletek/<kód>.json
Az IFC belső anyag: ne tedd a repóba.
"""
import sys, re, json, math, importlib.util, collections, unicodedata
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
from shapely import affinity
from scipy.spatial import cKDTree
import ifcopenshell, ifcopenshell.geom as G


def _betolt(nev, fajl):
    sp = importlib.util.spec_from_file_location(nev, Path(__file__).with_name(fajl))
    m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


A = _betolt("ifc_ajtok", "ifc-ajtok.py")
L = _betolt("ifc_lepcsok", "ifc-lepcsok.py")

ROM = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10}
AJTO_MAG = 1.8      # m, ennél alacsonyabb nyílás nem ajtó (szellőző, aknaajtó)
PADLO = 0.3         # m, a nyílás alja legfeljebb ennyivel a gazdafal alja fölött


def emelet(nev):
    """A szint neve emeletszámmá: 0 földszint, 0,5 félemelet, -1 pince/alagsor,
    1… emelet, "T" tetőtér; None, ha nem emelet (tető, kazán, torony)."""
    s = unicodedata.normalize("NFC", nev or "").upper().strip()
    if s in ("FSZ", "FÖLDSZINT"): return 0
    if s in ("ALAGSOR", "PINCE", "P1"): return -1
    m = re.fullmatch(r"P(\d)", s) or re.fullmatch(r"PINCE\s*-?\s*(\d)", s)
    if m: return -int(m[1])
    if s == "FÉLEMELET": return 0.5
    m = re.fullmatch(r"(\d+)\.\s*EMELET", s)
    if m: return int(m[1])
    m = re.fullmatch(r"([IVX]+)\.\s*EMELET", s)
    if m: return ROM.get(m[1])
    if s == "TETŐTÉR": return "T"
    return None


def zsav(S, e):
    try:
        v = np.array(G.create_shape(S, e).geometry.verts).reshape(-1, 3)
    except Exception:
        return None
    if not len(v): return None          # üres alak (az FF egyik nyílása)
    return float(v[:, 2].min()), float(v[:, 2].max())


def tiszta(o):
    if isinstance(o, float): return int(o) if o == int(o) else o
    if isinstance(o, list): return [tiszta(x) for x in o]
    if isinstance(o, dict): return {k: tiszta(v) for k, v in o.items()}
    return o


def main(ifc, js):
    D = json.load(open(js, encoding="utf-8"))
    f = ifcopenshell.open(ifc)
    S = G.settings(); S.set(S.USE_WORLD_COORDS, True)

    dlv = {}
    for l in D["levels"]:
        k = emelet(l.get("name"))
        if k is not None: dlv[k] = l["level"]
    hova, parok = {}, {}
    for r in f.by_type("IfcRelContainedInSpatialStructure"):
        lv = dlv.get(emelet(r.RelatingStructure.Name))
        parok[r.RelatingStructure.Name] = lv
        for e in r.RelatedElements: hova[e.id()] = lv
    for r in f.by_type("IfcRelAggregates"):        # a lépcsőkar a tárolója szintjét kapja
        for o in r.RelatedObjects:
            if hova.get(o.id()) is None and hova.get(r.RelatingObject.id()) is not None:
                hova[o.id()] = hova[r.RelatingObject.id()]
    print("szintek (IFC → térkép): " + ", ".join(f"{k} → {v}" for k, v in parok.items()))
    hianyzo = [l["name"] for l in D["levels"] if l["level"] not in parok.values()]
    if hianyzo: print("   a térkép szintjei közül nincs az IFC-ben: " + ", ".join(hianyzo))

    falak_ifc = collections.defaultdict(list)
    for e in f.by_type("IfcBuildingElementProxy"):
        if not (e.Name or "").startswith("Fal") or hova.get(e.id()) is None: continue
        g = A.vetulet(S, e)
        if g is not None: falak_ifc[hova[e.id()]].append(g)
    dfal = lambda lv: [Polygon(w).buffer(0) for w in D["walls"].get(str(lv), [])]
    alap = max(falak_ifc, key=lambda lv: min(len(falak_ifc[lv]), len(dfal(lv))))
    flip, R, t, jo = A.illeszt(falak_ifc[alap], dfal(alap))
    tr = lambda g: affinity.affine_transform(affinity.scale(g, 1.0, flip, origin=(0, 0)),
                                             [R[0, 0], R[0, 1], R[1, 0], R[1, 1], t[0], t[1]])
    print(f"illesztés a(z) {alap}. szinten: tükör {flip}, szög {math.degrees(math.atan2(R[1, 0], R[0, 0])):.2f}°, "
          f"a falak {jo:.0%}-a 10 cm-en belül")
    for lv in sorted(falak_ifc):
        if not dfal(lv): continue
        d, _ = cKDTree(A.mintak([tr(g) for g in falak_ifc[lv]], 0.1)).query(A.mintak(dfal(lv), 0.1))
        print(f"   szint {lv:>2}: {np.mean(d < 0.1):.0%}")

    # --- ajtók ---
    toltes = {r.RelatingOpeningElement.id(): r.RelatedBuildingElement.Name or "" for r in f.by_type("IfcRelFillsElement")}
    ajtok = []
    for r in f.by_type("IfcRelVoidsElement"):
        o, w = r.RelatedOpeningElement, r.RelatingBuildingElement
        if hova.get(w.id()) is None: continue
        a, b = zsav(S, o), zsav(S, w)
        if a is None or b is None or a[1] - a[0] < AJTO_MAG: continue
        nev = toltes.get(o.id(), "")
        if not (a[0] - b[0] < PADLO or re.match(r"AJ-|D\d", nev)): continue
        g, gw = A.vetulet(S, o, vizszintes=False), A.vetulet(S, w)
        if g is not None and gw is not None: ajtok.append((hova[w.id()], g, gw))
    print(f"ajtónyílás az IFC-ben: {len(ajtok)}")

    GR = D["grid"]; RES, GW, GH = GR["res"], GR["w"], GR["h"]
    cimke, halon = A.halozat(D, GW, GH)
    termek = [r for r in D["rooms"] if r.get("code")]
    for r in termek:
        r.pop("doors", None); r.pop("via", None)
    felemelet = {l["level"]: dlv.get(0.5) == l["level"] for l in D["levels"]}
    alatta = {l["level"]: max([m["level"] for m in D["levels"] if m["level"] < l["level"]], default=None) for l in D["levels"]}
    kozvetlen, szomszed = set(), {}
    for Lv in D["levels"]:
        lv = Lv["level"]; c = cimke[lv]
        def folt(p):
            i0_, j0_ = int(p[0] / RES), int(p[1] / RES); jo_ = (1e9, 0)
            for j in range(j0_ - 2, j0_ + 3):
                for i in range(i0_ - 2, i0_ + 3):
                    if 0 <= i < GW and 0 <= j < GH and c[j, i]:
                        d = ((i + .5) * RES - p[0]) ** 2 + ((j + .5) * RES - p[1]) ** 2
                        if d < jo_[0]: jo_ = (d, c[j, i])
            return jo_[1] if jo_[0] < 0.49 else 0
        falak = unary_union(dfal(lv))
        itt = [(r, Polygon(r["poly"]).buffer(0)) for r in termek if r["level"] == lv]
        hol = lambda p: next((r for r, P in itt if P.contains(Point(*p))), None)
        for r, P in itt:
            if r.get("circ") and any(halon(lv, folt(q)) for q in [(r["cx"], r["cy"])] + r["poly"]):
                kozvetlen.add(id(r))
        def mi(z):
            r = hol(z)
            if r is not None and not r.get("circ"): return r
            if halon(lv, folt(z)): return "net"
            return r
        for l, o, w in ajtok:
            if l != lv and not (felemelet[lv] and l == alatta[lv]): continue
            oo = max(A.darabok(tr(o)), key=lambda g: g.area)
            ket = A.oldalak(oo, tr(w))
            if ket is None or LineString(ket).intersection(falak).length > 0.05: continue
            for p, q in (ket, ket[::-1]):
                r, r2 = mi(p), mi(q)
                if not isinstance(r, dict) or r2 is None or r2 is r: continue
                if r2 == "net":
                    pt = [round(float(q[0]), 2), round(float(q[1]), 2)]
                    if all(math.dist(pt, x) > 1.0 for x in r.setdefault("doors", [])):
                        r["doors"].append(pt)
                    kozvetlen.add(id(r))
                else:
                    szomszed.setdefault(id(r), set()).add(id(r2)); szomszed.setdefault(id(r2), set()).add(id(r))
    for r in termek:                                # egy üres lista ne maradjon bent
        if r.get("doors") == []: r.pop("doors")
    kodok = collections.Counter(r["code"] for r in termek)
    rid = {id(r): r for r in termek}
    sor, latott = list(kozvetlen), set(kozvetlen)
    while sor:
        u = sor.pop(0)
        for w in sorted(szomszed.get(u, ()), key=lambda w: rid[w]["code"]):
            if w in latott or kodok[rid[u]["code"]] > 1: continue
            latott.add(w); rid[w]["via"] = rid[u]["code"]; sor.append(w)

    # --- lépcsőkarok ---
    szint = {lv: shapely.union_all([Polygon(r["poly"]).buffer(0) for r in D["rooms"] if r["level"] == lv]
                                   + dfal(lv)).buffer(0.3)
             for lv in {r["level"] for r in D["rooms"]}}
    kerek = lambda p: [round(float(p[0]), 2), round(float(p[1]), 2)]
    karok, kint = collections.defaultdict(list), []
    for e in f.by_type("IfcBuildingElementProxy"):
        if not (e.Name or "").startswith("LK SZERKEZET"): continue
        lv = hova.get(e.id()); fk = L.fokok(S, e)
        if lv is None or len(fk) < 2: continue
        lapok = [(z, tr(g).simplify(0.01)) for z, g in fk]
        alapt = shapely.union_all([g for _, g in lapok])
        if lv not in szint or alapt.intersection(szint[lv]).area < L.BENT * alapt.area:
            kint.append(f"{e.Name} (szint {lv})"); continue
        sokszogek = [[kerek(q) for q in p.exterior.coords[:-1]] for _, g in lapok
                     for p in (g.geoms if hasattr(g, "geoms") else [g]) if p.geom_type == "Polygon"]
        karok[str(lv)].append({"t": sokszogek, "w": [kerek((g.centroid.x, g.centroid.y)) for _, g in lapok]})
    D["flights"] = {k: karok[k] for k in sorted(karok, key=int)}

    with open(js, "w", encoding="utf-8") as ki:
        json.dump(tiszta(D), ki, ensure_ascii=False, separators=(",", ":"))
    ajtos = [r for r in termek if r.get("doors")]
    print(f"ajtó a hálózat felé: {len(ajtos)} helyiség ({sum(len(r['doors']) for r in ajtos)} ajtó), "
          f"más helyiségen át: {sum(1 for r in termek if r.get('via'))}, "
          f"se ajtó, se kapcsolat: {sum(1 for r in termek if id(r) not in latott)} (a {len(termek)}-ból)")
    print("más helyiségen át: " + ", ".join(f"{r['code']} ← {r['via']}" for r in termek if r.get("via")))
    print("lépcsőkarok szintenként: " + ", ".join(f"{k}: {len(v)}" for k, v in D["flights"].items())
          + "; kimaradt: " + (", ".join(kint) or "egy sem"))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])

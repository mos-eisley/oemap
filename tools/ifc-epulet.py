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

A `--lepcso` kapcsolóval a függőleges kapcsolatokat (`stairs`) is az IFC
karjaiból írja (lásd `ifc_lepcsok()`); enélkül a tervlapiak maradnak.

Használat:  python3 -I tools/ifc-epulet.py <OE_XX.ifc> data/epuletek/<kód>.json [--lepcso]
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
# A fal neve exportonként más: „Fal - 012” (OA, OD, OB…), „W112 (…)” (TB, TA-TC).
FAL = re.compile(r"Fal\b|W\d")
# A szint padlója és a kar vége közt ennyi eltérés még ugyanaz a szint: az
# első fok teteje egy fokmagassággal a padló fölött van, és a padló a
# lépcsőnél helyenként eltér a szint magasságától (az OB-ben a pincéből jövő
# kar −0,65 m-en ér fel a 0,00-s földszintre).
TUR_Z = 0.8


def emelet(nev):
    """A szint neve emeletszámmá: 0 földszint, 0,5 félemelet, -1 pince/alagsor,
    1… emelet, "T" tetőtér; None, ha nem emelet (tető, kazán, torony)."""
    s = unicodedata.normalize("NFC", nev or "").upper().strip()
    if s in ("FSZ", "FÖLDSZINT"): return 0
    if s in ("ALAGSOR", "PINCE", "P1"): return -1
    m = re.fullmatch(r"P(\d)", s) or re.fullmatch(r"PINCE\s*-?\s*(\d)", s)
    if m: return -int(m[1])
    if s == "FÉLEMELET": return 0.5
    if s == "EMELET": return 1          # az FC és az FS egyetlen emelete
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


VIZES = re.compile(r"WC|MOSDÓ|MOSD\.|ZUHANY|ZUH\.|PISZOÁR|KÉZMOSÓ")


def mosdon_at(r, v):
    """Megközelíthető-e az `r` helyiség a `v`-n át. Mosdón át csak raktár
    (a takarítószer-raktár sokszor a mosdóból nyílik: OC, OB) vagy maga is
    vizes helyiség (WC az előtere mögött). A TB portája az IFC-ben csak a
    szomszédos NŐI WC felé kapott ajtót, és az útvonal „Kijárat ezen át: NŐI
    WC” lépéssel indult."""
    if not VIZES.search((v.get("name") or "").upper()): return True
    return bool(VIZES.search((r.get("name") or "").upper())) or "RAKTÁR" in (r.get("cat") or "").upper()


def tiszta(o):
    if isinstance(o, float): return int(o) if o == int(o) else o
    if isinstance(o, list): return [tiszta(x) for x in o]
    if isinstance(o, dict): return {k: tiszta(v) for k, v in o.items()}
    return o


def illesztes(f, S, D):
    """Az IFC szintjei a térkép szintjeihez, a falak vetülete szintenként, és
    az IFC → térkép merev transzform. Kiírja, mi mire illeszkedett."""
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
        if not FAL.match(e.Name or "") or hova.get(e.id()) is None: continue
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
    return dlv, hova, falak_ifc, dfal, tr


def ifc_lepcsok(f, S, D, dlv, tr):
    """A függőleges kapcsolatok (`D.stairs`) az IFC lépcsőkaraiból.

    A tervlapból kinyert lépcsőpontok (`epulet-json.py`, a LÉPCSŐK-LIFTEK
    réteg foltjai) sok épületben rossz helyre esnek, vagy egy szinten
    hiányoznak: az OB-ben, az YC-ben és a TG-ben a szintek ettől nem érnek
    össze, és a helyiségek fele elérhetetlen. Az IFC-ben minden kar fokonként
    megvan, magassággal. Ezért:
    - a karokat lépcsőházakba vonjuk össze: ha a vetületük 1 m-en belül ér
      egymáshoz (U alakú lépcső: a karok egymás mellett), vagy az egyik
      felső foka után 6 m-en és 0,6 m magasságon belül indul a másik (egyenes
      lépcső: köztük a pihenő; az OB-ben a két kar vége 3 m-nél messzebb);
    - a lépcsőház minden szintjén ott a pont, ahol egy kar ezen a szinten indul
      (a legalsó foka a szint padlójához legközelebb), vagy ahová megérkezik
      (a legfelső foka a szint padlója alatt legfeljebb egy fokkal);
    - két szomszédos szint akkor kapcsolódik, ha a lépcsőház mindkettőn
      megvan, és a karjai a kettő közti magasságot végig lefedik."""
    import ifcopenshell.util.unit as U
    sk = U.calculate_unit_scale(f)
    szintz = {}
    for st in f.by_type("IfcBuildingStorey"):
        lv = dlv.get(emelet(st.Name))
        if lv is not None and st.Elevation is not None:
            szintz[lv] = min(szintz.get(lv, 1e9), st.Elevation * sk)
    karok = []
    for e in f.by_type("IfcBuildingElementProxy"):
        if not (e.Name or "").startswith("LK SZERKEZET"): continue
        fk = L.fokok(S, e)
        if len(fk) < 2: continue
        lapok = [(z, tr(g)) for z, g in fk]
        alap = shapely.union_all([g for _, g in lapok])
        karok.append({"z0": lapok[0][0], "z1": lapok[-1][0], "alap": alap,
                      "also": (lapok[0][1].centroid.x, lapok[0][1].centroid.y),
                      "felso": (lapok[-1][1].centroid.x, lapok[-1][1].centroid.y)})
    szulo = list(range(len(karok)))
    def gy(a):
        while szulo[a] != a: a = szulo[a]
        return a
    for i in range(len(karok)):
        for j in range(i):
            a_, b_ = karok[i], karok[j]
            folytat = any(0 < y["z0"] - x["z1"] < 0.6 and math.dist(x["felso"], y["also"]) < 6.0
                          for x, y in ((a_, b_), (b_, a_)))
            if folytat or a_["alap"].distance(b_["alap"]) < 1.0: szulo[gy(i)] = gy(j)
    hazak = collections.defaultdict(list)
    for i, k in enumerate(karok): hazak[gy(i)].append(k)
    itt = collections.defaultdict(list)
    for r in D["rooms"]: itt[r["level"]].append((r, Polygon(r["poly"]).buffer(0)))
    def kodja(lv, p):
        P = Point(*p)
        r = next((r for r, g in itt[lv] if g.contains(P)), None)
        return (r or {}).get("code") or ""
    szintek = sorted(szintz)
    ki = []
    for ks in hazak.values():
        pts = {}
        for lv in szintek:
            z = szintz[lv]
            indul = [k for k in ks if abs(k["z0"] - z) < TUR_Z]
            erkez = [k for k in ks if -0.1 < z - k["z1"] < TUR_Z]
            if indul: pts[lv] = min(indul, key=lambda k: abs(k["z0"] - z))["also"]
            elif erkez: pts[lv] = min(erkez, key=lambda k: abs(k["z1"] - z))["felso"]
        sor = [lv for lv in szintek if lv in pts]
        # csak a karokkal lefedett szomszédos szintpárok: a közbülső magasság se maradjon ki
        jo = []
        for a, b in zip(sor, sor[1:]):
            za, zb = szintz[a], szintz[b]
            fed = sorted((k["z0"], k["z1"]) for k in ks if k["z1"] > za and k["z0"] < zb)
            h = za
            for z0, z1 in fed:
                if z0 - h > 0.6: break
                h = max(h, z1)
            if zb - h < TUR_Z: jo.append((a, b))
        if not jo: continue
        # összefüggő láncokra bontva (ahol egy pár hiányzik, ott két külön lépcső)
        lanc = [list(jo[0])]
        for a, b in jo[1:]:
            if a == lanc[-1][-1]: lanc[-1].append(b)
            else: lanc.append([a, b])
        for l in lanc:
            ki.append({"id": len(ki), "pts": [[lv, round(float(pts[lv][0]), 2), round(float(pts[lv][1]), 2),
                                               kodja(lv, pts[lv])] for lv in l]})
    return ki


def main(ifc, js, lepcso=False):
    D = json.load(open(js, encoding="utf-8"))
    f = ifcopenshell.open(ifc)
    S = G.settings(); S.set(S.USE_WORLD_COORDS, True)
    dlv, hova, falak_ifc, dfal, tr = illesztes(f, S, D)

    if lepcso:
        uj = ifc_lepcsok(f, S, D, dlv, tr)
        print(f"lépcsők az IFC-ből: {len(uj)} (a tervlapból {len(D['stairs'])}): "
              + "; ".join("→".join(str(p[0]) for p in st["pts"]) for st in uj))
        if uj: D["stairs"] = uj

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
            if not mosdon_at(rid[w], rid[u]): continue
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
    av = [a for a in sys.argv[1:] if a != "--lepcso"]
    if len(av) != 2:
        sys.exit(__doc__)
    main(*av, lepcso="--lepcso" in sys.argv)

#!/usr/bin/env python3
"""A helyiségek ajtajai az épület IFC-modelljéből a térkép adatába.

A térkép (index.html, `const D`) a helyiséget a hozzá legközelebbi járható
(folyosó-) cellához köti, 6 m-en belül — nem az ajtajához. Emiatt az útvonal
nem az ajtónál ér véget; ahol a legközelebbi folyosó nem az, amelyikre az ajtó
nyílik, ott rossz az útvonal; és ahova csak egy másik helyiségen át lehet
bejutni (laborsor, irodából nyíló iroda), oda nem volt útvonal. Az IFC-ben
(Archicad-export) az ajtók pontos helyen vannak. Ez az eszköz helyiségenként
beírja:
- `doors`: az ajtók előtti pontok, ahol az ajtó az úthálózatra nyílik
  (folyosóra, aulára — nem egy elszigetelt járható foltra);
- `via`: ha egyik ajtaja sem nyílik oda, annak a helyiségnek a kódja, amelyiken
  át megközelíthető (az app láncban követi, és kiírja az útvonal lépéseiben).

Lépések:
1. Az IFC elemeinek alaprajzi vetülete (falak, falnyílások a kitöltő elem
   nevével: D… ajtó, A… ablak). Az export minden elemet általános elemként
   (proxy) ad, a típus a névből derül ki.
2. Illesztés a térkép falaira: raszterezett falak, félfokonkénti forgatás,
   FFT-keresztkorreláció az eltolásra, utána ICP (merev, lépték nélkül; az IFC
   méterben van, a tengelye tükrözött). Egyetlen transzform minden szintre: a
   térkép falainak ~90%-a 10 cm-en belül esik az IFC falaira (a félemeleten
   kevesebb, ott a földszintről felnyúló falak az IFC-ben a földszinthez
   tartoznak) — vagyis a térkép szintjei egymáshoz is ennyire pontosak.
3. Ajtónként a falvastagságú „híd" (a nyílás mélyebb a falnál, ezért a két
   oldali falvég sávjának közös részére vágva), és a két oldala fél méterre:
   helyiség, vagy járható cella. Az úthálózat a járható cellák lépcsőkkel
   összekötött legnagyobb összefüggő része.

Az IFC 2023-as; ahol azóta átépítettek, ott a térkép (2026-os tervlap)
nyer: csak ott kerül be ajtó, ahol a térkép falában tényleg nyílás van.

Használat:  python3 tools/ifc-ajtok.py <OE-OA.ifc> index.html
            (pip install ifcopenshell numpy scipy shapely)
Az IFC belső anyag: ne tedd a repóba.
"""
import sys, re, json, math, base64
import numpy as np
import shapely
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
from shapely import affinity
from scipy.spatial import cKDTree
from scipy import ndimage
import ifcopenshell, ifcopenshell.geom as G

SZINT = {"ALAGSOR": -1, "FÖLDSZINT": 0, "FÉLEMELET": 1, "1.EMELET": 2, "2. EMELET": 3,
         "3. EMELET": 4, "4. EMELET": 5}


def vetulet(S, e, vizszintes=True):
    try:
        sh = G.create_shape(S, e)
    except Exception:
        return None
    v = np.array(sh.geometry.verts).reshape(-1, 3); fa = np.array(sh.geometry.faces).reshape(-1, 3)
    tri = []
    for a, b, c in fa:
        A, B, C = v[a], v[b], v[c]; n = np.cross(B - A, C - A); L = np.linalg.norm(n)
        if L < 1e-9 or (vizszintes and abs(n[2] / L) <= 0.9): continue
        P = Polygon([A[:2], B[:2], C[:2]])
        if P.area > 1e-8: tri.append(P.buffer(0))
    if not tri: return None
    try:
        return shapely.union_all(tri, grid_size=0.001)
    except Exception:
        return shapely.union_all([t.buffer(0.001) for t in tri], grid_size=0.001)


def darabok(g):
    if g.is_empty: return []
    return list(g.geoms) if hasattr(g, "geoms") else [g]


def mintak(polys, lepes):
    pts = []
    for P in polys:
        for g in darabok(P):
            if g.geom_type != "Polygon": continue
            c = np.asarray(g.exterior.coords)
            for a, b in zip(c[:-1], c[1:]):
                n = max(1, int(np.linalg.norm(b - a) / lepes))
                pts += [a + (b - a) * k / n for k in range(n)]
    return np.array(pts)


def merev(P, Q):
    mp, mq = P.mean(0), Q.mean(0); U, _, Vt = np.linalg.svd((Q - mq).T @ (P - mp)); Dg = np.eye(2)
    if np.linalg.det(U @ Vt) < 0: Dg[1, 1] = -1
    R = U @ Dg @ Vt
    return R, mq - R @ mp


def illeszt(ifc_falak, d_falak):
    """IFC (m, tükrözhető) -> térkép (m): FFT a forgatásokra, aztán ICP."""
    Dw = mintak(d_falak, 0.1); Iw = mintak(ifc_falak, 0.1)
    RES, N = 0.25, 512
    def ras(P):
        img = np.zeros((N, N)); ij = np.floor(P / RES).astype(int)
        ok = (ij >= 0).all(1) & (ij < N).all(1); img[ij[ok, 1], ij[ok, 0]] = 1
        return ndimage.gaussian_filter(img, 1.0)
    FA = np.fft.fft2(ras(Dw - Dw.min(0) + 10)); best = None
    for flip in (1, -1):
        for ang in np.arange(0, 360, 0.5):
            a = math.radians(ang); R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
            P = (R @ (Iw * [1, flip]).T).T
            c = np.fft.ifft2(FA * np.conj(np.fft.fft2(ras(P - P.min(0) + 10)))).real
            k = np.unravel_index(np.argmax(c), c.shape)
            if best is None or c[k] > best[0]:
                dy, dx = k; dy -= N if dy > N / 2 else 0; dx -= N if dx > N / 2 else 0
                best = (c[k], flip, R, np.array([dx, dy]) * RES + Dw.min(0) - P.min(0))
    _, flip, R, t = best
    fa = cKDTree(Dw); P = Iw * [1, flip]
    for it in range(40):
        d, idx = fa.query((R @ P.T).T + t)
        m = d < (1.0 if it < 15 else 0.3 if it < 30 else 0.12)
        R, t = merev(P[m], Dw[idx[m]])
    d, _ = cKDTree((R @ P.T).T + t).query(Dw)
    return flip, R, t, float(np.mean(d < 0.1))


def oldalak(nyilas, fal, kint=0.5):
    """Az ajtó két oldala, `kint` méterre a fal síkjától. Az irányt és a
    vastagságot az ajtó gazdafala adja az IFC-ből (a nyílás maga mélyebb a
    falnál, a térkép falai pedig sok helyen hiányosak: a válaszfalak egy része
    nincs meg, és ott a nyílás mellett nincs falvég, amihez igazodni lehetne)."""
    c = np.array(nyilas.centroid.coords[0])
    helyi = fal.intersection(Point(*c).buffer(1.2))
    if helyi.is_empty or helyi.area < 0.02: return None
    r = np.array(helyi.minimum_rotated_rectangle.exterior.coords)[:4]
    e1, e2 = r[1] - r[0], r[2] - r[1]
    if np.linalg.norm(e1) < np.linalg.norm(e2): e1, e2 = e2, e1
    u = e1 / np.linalg.norm(e1); n = np.array([-u[1], u[0]]); t = np.linalg.norm(e2)
    if t > 1.0 or np.linalg.norm(e1) < 2 * t: return None     # nem egyenes falszakasz
    c = c + n * ((r.mean(0) - c) @ n)                           # a fal középvonalára
    return c + n * (t / 2 + kint), c - n * (t / 2 + kint)


def halozat(D, GW, GH):
    """Szintenként a járható cellák 4-szomszédos foltjai, és közülük azok,
    amelyek a lépcsőkön át a legnagyobb összefüggő hálózatot adják."""
    RES = D["grid"]["res"]; folt, cimke = {}, {}
    for L in D["levels"]:
        lv = L["level"]
        b = np.frombuffer(base64.b64decode(D["masks"][str(lv)]), np.uint8)
        m = np.unpackbits(b, bitorder="little")[:GW*GH].reshape(GH, GW).astype(bool)
        cimke[lv], _ = ndimage.label(m)
    szulo = {}
    def gy(a):
        while szulo.setdefault(a, a) != a: a = szulo[a]
        return a
    def legkozelebbi(lv, x, y):
        js, is_ = np.nonzero(cimke[lv])
        if not len(js): return None
        d = ((is_ + .5) * RES - x) ** 2 + ((js + .5) * RES - y) ** 2; k = d.argmin()
        return (lv, int(cimke[lv][js[k], is_[k]])) if d[k] < 49 else None
    for st in D["stairs"]:
        pts = [legkozelebbi(p[0], p[1], p[2]) for p in sorted(st["pts"])]
        pts = [p for p in pts if p]
        for a, b in zip(pts, pts[1:]): szulo[gy(a)] = gy(b)
    meret = {}
    for lv, c in cimke.items():
        for k, n in zip(*np.unique(c[c > 0], return_counts=True)):
            meret[gy((lv, int(k)))] = meret.get(gy((lv, int(k))), 0) + n
    fo = max(meret, key=meret.get)
    return cimke, (lambda lv, k: k > 0 and gy((lv, int(k))) == fo)


def main(ifc, html):
    src = open(html, encoding="utf-8").read()
    i0 = src.index("const D = ") + len("const D = ")
    D, i1 = json.JSONDecoder().raw_decode(src, i0)
    f = ifcopenshell.open(ifc)
    S = G.settings(); S.set(S.USE_WORLD_COORDS, True)
    hova = {e.id(): SZINT.get(r.RelatingStructure.Name)
            for r in f.by_type("IfcRelContainedInSpatialStructure") for e in r.RelatedElements}
    falak_ifc = {}
    for e in f.by_type("IfcBuildingElementProxy"):
        if not (e.Name or "").startswith("Fal") or hova.get(e.id()) is None: continue
        g = vetulet(S, e)
        if g is not None: falak_ifc.setdefault(hova[e.id()], []).append(g)
    toltes = {r.RelatingOpeningElement.id(): r.RelatedBuildingElement.Name for r in f.by_type("IfcRelFillsElement")}
    ajtok = []
    for r in f.by_type("IfcRelVoidsElement"):
        o = r.RelatedOpeningElement
        if not (toltes.get(o.id()) or "").startswith("D"): continue
        g, w = vetulet(S, o, vizszintes=False), vetulet(S, r.RelatingBuildingElement)
        if g is not None and w is not None: ajtok.append((hova.get(r.RelatingBuildingElement.id()), g, w))
    # illesztés az I. emeleten (ott a legtöbb közös fal), ellenőrzés minden szinten
    dfal = lambda lv: [Polygon(w).buffer(0) for w in D["walls"][str(lv)]]
    flip, R, t, jo = illeszt(falak_ifc[2], dfal(2))
    tr = lambda g: affinity.affine_transform(affinity.scale(g, 1.0, flip, origin=(0, 0)),
                                             [R[0, 0], R[0, 1], R[1, 0], R[1, 1], t[0], t[1]])
    print(f"illesztés: tükör {flip}, szög {math.degrees(math.atan2(R[1, 0], R[0, 0])):.2f}°, "
          f"az I. emelet falainak {jo:.0%}-a 10 cm-en belül")
    for lv in sorted(falak_ifc):
        Dw = mintak(dfal(lv), 0.1); d, _ = cKDTree(mintak([tr(g) for g in falak_ifc[lv]], 0.1)).query(Dw)
        print(f"   szint {lv:>2}: {np.mean(d < 0.1):.0%}")

    GR = D["grid"]; RES, GW, GH = GR["res"], GR["w"], GR["h"]
    cimke, halon = halozat(D, GW, GH)
    termek = [r for r in D["rooms"] if r["code"]]
    for r in termek:
        r.pop("doors", None); r.pop("via", None)
    kozvetlen, szomszed = set(), {}
    for L in D["levels"]:
        lv = L["level"]; c = cimke[lv]
        def folt(p):
            """A ponthoz 0,7 m-en belüli járható cella foltja (0: nincs)."""
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
        # a közlekedő helyiség maga is járható: közvetlen, ha a hálózaton van
        for r, P in itt:
            if r.get("circ") and any(halon(lv, folt(q)) for q in [(r["cx"], r["cy"])] + r["poly"]):
                kozvetlen.add(id(r))
        def mi(z):
            """Az ajtó egyik oldala: helyiség, vagy az úthálózat ("net")."""
            r = hol(z)
            if r is not None and not r.get("circ"): return r
            if halon(lv, folt(z)): return "net"
            return r            # elszigetelt közlekedő (pl. egy laborsor előtere), vagy semmi
        for l, o, w in ajtok:
            # a félemelet és a földszint közös falai az IFC-ben a földszinthez tartoznak
            if l != lv and not (lv == 1 and l == 0): continue
            oo = max(darabok(tr(o)), key=lambda g: g.area)
            ket = oldalak(oo, tr(w))
            # ahol a térképen (2026) fal áll az ajtó helyén, ott azóta befalazták
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
    # Ahova nem nyílik ajtó a hálózatról: a legkevesebb helyiségen át vezető lánc
    # első tagja. Az ismétlődő kód (OA00FK2) nem lehet „via": nem egyértelmű.
    kodok = {}
    for r in termek: kodok[r["code"]] = kodok.get(r["code"], 0) + 1
    rid = {id(r): r for r in termek}
    sor, latott = list(kozvetlen), set(kozvetlen)
    while sor:
        u = sor.pop(0)
        for w in sorted(szomszed.get(u, ()), key=lambda w: rid[w]["code"]):
            if w in latott or kodok[rid[u]["code"]] > 1: continue
            latott.add(w); rid[w]["via"] = rid[u]["code"]; sor.append(w)

    def tiszta(o):
        if isinstance(o, float): return int(o) if o == int(o) else o
        if isinstance(o, list): return [tiszta(x) for x in o]
        if isinstance(o, dict): return {k: tiszta(v) for k, v in o.items()}
        return o
    open(html, "w", encoding="utf-8").write(src[:i0] + json.dumps(tiszta(D), ensure_ascii=False, separators=(",", ":")) + src[i1:])
    ajtos = [r for r in termek if r.get("doors")]
    print(f"ajtó a hálózat felé: {len(ajtos)} helyiség ({sum(len(r['doors']) for r in ajtos)} ajtó), "
          f"ebből több ajtós: {sum(len(r['doors']) > 1 for r in ajtos)}")
    print("más helyiségen át: " + ", ".join(f"{r['code']} ← {r['via']}" for r in termek if r.get("via")))
    print("se ajtó, se közvetlen kapcsolat (marad a legközelebbi folyosó): "
          + ", ".join(r["code"] for r in termek if id(r) not in latott))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])

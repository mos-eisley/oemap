#!/usr/bin/env python3
"""A térképről hiányzó helyiségek pótlása a tervtári alaprajz PDF-jéből.

A térkép adata (index.html, `const D`) egy korábbi generátorból jött, és a
keretével levágta a felső szárny északkeleti végét: minden szinten hiányzott
41 helyiség, köztük 10 órarendi terem (F05, F06, 1.13 …), és a keret szélén
átnyúló folyosók is. Ez az eszköz a tervtári alaprajzból (Archicad-PDF,
2026.01.09) pótolja őket, a meglévő adathoz nem nyúl:

1. Szintenként a PDF falkitöltéseit (tartószerkezet, válaszfal) a térkép
   falaira illeszti (ICP, hasonlósági transzform). A hét szint egymáshoz 12
   cm-en belül egyezik, a mostani falak 10 cm-en belül fedik a PDF-et.
2. A hiányzó helyiségeket (a PDF pecsétje szerint) és a keret által
   csonkítottakat kivágja a falak közti szabad térből, a nyílásokat a fal
   síkjában lezárva: két szembenéző falvég közti híd, a falréteg vonalai
   (ajtósík, mellvéd, ha kell, födémél és mobilfal), a függönyfal ajtórése. A
   vágások cellákra bontják a teret; a pecsét cellájához a szomszédok addig
   kerülnek hozzá, amíg a terület a pecsétéhez közelít. Mérve a térkép
   meglévő 139 helyiségén (`kivago()`): 94% egyezik (IoU ≥ 0,97, terület
   ±3%). A szárny 41 helyiségéből 40 jött ki ±1%-on belül; ami ±5%-on kívül
   esik, azt nem veszi fel, hanem kiírja (most az 1,26 m²-es OAX1A07).
   A lyukas helyiség (légtér a folyosó közepén) bevágással fűzve egy gyűrű.
3. Hozzáadja a kereten kívül eső falakat, a helyiségek mellett, és a
   közlekedők celláit a járásrácsba (a régi rács is így áll össze: a
   közlekedők, lépcsőházak, előterek cellái).
4. Kitolja a keretet, és ha kell, az egészet eltolja, hogy minden koordináta
   pozitív maradjon (a rácslépés, 0,45 m egész többszörösével, így a régi rács
   cellára pontosan átvihető).

A nevet, a kategóriát és a kari számot az épületadat-táblából (xls) veszi, az
alapterületet a PDF pecsétjéből. Az eltolás minden koordinátára vonatkozik
(helyiségek, ajtók, falak, lépcsők, lift: `D.lifts`), és ki is írja.

Használat:
  python3 tools/tervlap-szarny.py <oe-oa_tervtari_alaprajzok.pdf> \\
          <oe-oa_tervtar_epuletadatok.xls> index.html [jelentés.json]
  (pip install pymupdf numpy scipy shapely xlrd)
A PDF és az xls belső anyag (a Tervtár a vezetői körnek szól): ne tedd a
repóba.
"""
import sys, re, json, math, base64, collections
import numpy as np
import pymupdf, xlrd
from scipy.spatial import cKDTree
import shapely
from shapely.geometry import Polygon, MultiPolygon, Point, box, LineString
from shapely.geometry.polygon import orient
from shapely.strtree import STRtree
from shapely.ops import unary_union, polylabel
from shapely import affinity
from shapely.prepared import prep

LAPOK = {-1: 1, 0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7}     # szint -> PDF-oldal
FAL = ("TARTÓSZERKEZETEK.2", "VÁLASZFALAK.2")
KOD = re.compile(r"^OA[A-Z0-9]{5}$")
TABLA_X = 3000          # a lap jobb szélén a helyiségtábla áll, az nem rajz
KOZLEKEDO = {"KÖZLEKEDŐK", "ELŐTEREK", "KÖZÖSSÉGI TEREK"}
K_LEPCSO = [0.25, 0.35, 0.45, 0.55, 0.7, 0.85, 1.0, 1.2]
TUR = 0.05


# ------------------------------------------------------------------ PDF
def utak(dr):
    """Egy PDF-rajz alútjai pontlistaként (a görbét 8 ponttal közelítve)."""
    out, cur = [], []
    def add(p):
        if cur and abs(cur[-1][0] - p.x) < 1e-6 and abs(cur[-1][1] - p.y) < 1e-6:
            return
        cur.append((p.x, p.y))
    last = None
    for it in dr["items"]:
        op = it[0]
        if op == "re":
            if len(cur) > 2: out.append(cur)
            r = it[1]; out.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]); cur = []; last = None
            continue
        if op == "qu":
            if len(cur) > 2: out.append(cur)
            q = it[1]; out.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]); cur = []; last = None
            continue
        a = it[1]
        if last is not None and (abs(last.x - a.x) > 1e-3 or abs(last.y - a.y) > 1e-3):
            if len(cur) > 2: out.append(cur)
            cur = []
        add(a)
        if op == "l":
            add(it[2]); last = it[2]
        elif op == "c":
            p0, c1, c2, p3 = it[1], it[2], it[3], it[4]
            for t in np.linspace(0, 1, 9)[1:]:
                x = (1-t)**3*p0.x + 3*(1-t)**2*t*c1.x + 3*(1-t)*t**2*c2.x + t**3*p3.x
                y = (1-t)**3*p0.y + 3*(1-t)**2*t*c1.y + 3*(1-t)*t**2*c2.y + t**3*p3.y
                cur.append((x, y))
            last = p3
    if len(cur) > 2: out.append(cur)
    return out


def lap_elemei(pg):
    """falak (0,44-es kitöltés), akadályok (falak + ablak/üvegfal), pecsétek"""
    falak, akadaly = [], []
    for dr in pg.get_drawings():
        if dr["rect"].x0 > TABLA_X: continue
        lay, f = dr.get("layer"), dr.get("fill")
        if lay in FAL and f and dr["type"] in ("f", "fs"):
            polys = [Polygon(u).buffer(0) for u in utak(dr) if len(u) >= 3]
            if abs(f[0] - 0.44) < 0.02:
                falak += polys; akadaly += polys
            elif min(f) > 0.7:                       # ablak a falban: a szabad teret elvágja
                akadaly += polys
        elif lay == "Függönyfalak.2":
            for u in utak(dr):
                if dr["type"] in ("f", "fs") and len(u) >= 3: akadaly.append(Polygon(u).buffer(0))
                else: akadaly.append(LineString(u + [u[0]] if dr.get("closePath") else u).buffer(1.2))
    spans = []
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if t: spans.append((t, s["bbox"]))
    pecset = []
    for t, bb in spans:
        if not KOD.match(t) or bb[0] > TABLA_X: continue
        cx, cy = (bb[0]+bb[2])/2, (bb[1]+bb[3])/2
        sorok = sorted(((((b2[1]+b2[3])/2 - cy), t2) for t2, b2 in spans
                        if abs((b2[0]+b2[2])/2 - cx) < 40 and -2 < (b2[1]+b2[3])/2 - cy < 45 and t2 != t))
        nev = next((x for _, x in sorok if re.search(r"[A-ZÁÉÍÓÖŐÚÜŰ]{3}", x)), None)
        ter = next((float(m.group(1).replace(",", ".")) for _, x in sorok
                    for m in [re.match(r"^(\d+,\d+) m$", x)] if m), None)
        pecset.append({"kod": t, "x": cx, "y": cy, "nev": nev, "terulet": ter})
    return falak, akadaly, pecset


def vonalak(pg):
    """A falrétegek vonalai (ablakkeret, tok, ajtólap, nyitásív), PDF-pontban:
    ahol a falkitöltés nyitva hagy egy nyílást, ezek mondják meg, hol a síkja."""
    out = []
    for dr in pg.get_drawings():
        if dr["rect"].x0 > TABLA_X or dr.get("layer") not in FAL or dr["type"] != "s": continue
        for it in dr["items"]:
            if it[0] == "l":
                out.append(("l", (it[1].x, it[1].y), (it[2].x, it[2].y), dr.get("width"), dr.get("color")))
            elif it[0] == "c":
                out.append(("c", (it[1].x, it[1].y), (it[4].x, it[4].y), dr.get("width"), dr.get("color"),
                            (it[2].x, it[2].y), (it[3].x, it[3].y)))
            elif it[0] == "re":
                r = it[1]; out.append(("re", (r.x0, r.y0), (r.x1, r.y1), dr.get("width"), dr.get("color")))
    return out


# ------------------------------------------------------------------ illesztés
def umeyama(P, Q):
    mp, mq = P.mean(0), Q.mean(0); A, B = P - mp, Q - mq
    U, S, Vt = np.linalg.svd(B.T @ A / len(P)); Dg = np.eye(2)
    if np.linalg.det(U @ Vt) < 0: Dg[1, 1] = -1
    R = U @ Dg @ Vt; s = np.trace(np.diag(S) @ Dg) / (A**2).sum(1).mean()
    return s, R, mq - s * R @ mp


def mintak(polys, lepes):
    pts = []
    for P in polys:
        for g in (P.geoms if isinstance(P, MultiPolygon) else [P]):
            c = np.asarray(g.exterior.coords)
            for a, b in zip(c[:-1], c[1:]):
                n = max(1, int(np.linalg.norm(b - a) / lepes))
                pts += [a + (b - a) * k / n for k in range(n)]
    return np.array(pts)


def illeszt(falak_pdf, falak_d, pecset, kozep):
    """PDF (pt) -> térkép (m): előbb a pecsétekből durván, aztán ICP a falakon"""
    par = [(p["x"], p["y"], *kozep[p["kod"]]) for p in pecset if p["kod"] in kozep]
    a = np.array(par); s, R, t = umeyama(a[:, :2], a[:, 2:])
    Dw = mintak(falak_d, 0.15); fa = cKDTree(Dw)
    Pw = mintak(falak_pdf, 0.15 / s)
    for it in range(60):
        Q = (s * (R @ Pw.T)).T + t; d, idx = fa.query(Q)
        m = d < (2.0 if it < 10 else 0.6 if it < 30 else 0.25)
        s, R, t = umeyama(Pw[m], Dw[idx[m]])
    Q = (s * (R @ Pw.T)).T + t; d, _ = fa.query(Q)
    return s, R, t, float(np.median(d[d < 0.5]))


def athelyez(g, s, R, t):
    return affinity.affine_transform(g, [s*R[0, 0], s*R[0, 1], s*R[1, 0], s*R[1, 1], t[0], t[1]])


# ------------------------------------------------------------------ kivágás
# A helyiség a falak közti szabad térből, a nyílásait a fal síkjában lezárva —
# a régi adat sokszögei is a fal belső síkjánál zárnak, és enélkül a helyiség
# befut az ablakfülkébe, kifolyik az ajtón. Mérve a térkép meglévő 139
# helyiségén (a többi helyiség foglalt, mint itt): a sokszög IoU-ja ≥ 0,97 és a
# terület ±3%-on belül 130-nál (94%); szomszédok nélkül 126-nál. Az első
# változat (rövid falapok kinyújtása) 49-nél, mert egy shapely 2-es buktató
# miatt (`ring is not A.exterior` mindig igaz) egyetlen hidat sem talált.
ROV = 0.9                       # rövid falap (falvég, pillér oldala): legfeljebb ennyi
FESZ = 3.4                      # a híd legnagyobb fesztávja
ATF = 0.3                       # két szemközti lap oldalirányú átfedése, a rövidebbhez mérve
TOL = 0.03                      # ennyi területhibánál elfogadjuk az első változatot
AJTOSIK = {(0.425, 0.37)}       # a falréteg vonalai: ajtó síkja, mellvéd belső éle
FODEMEL = {(0.425, 0.25)}       # födémél, galéria
SZAGGATOTT = {(0.425, 0.5), (0.425, 0.37)}


def darabok(g):
    if g.is_empty: return []
    return list(g.geoms) if hasattr(g, "geoms") else [g]


def lapok(falak):
    """A falak rövid lapjai: kezdő-, végpont, irány, kifelé mutató normális,
    hossz. Csak az a lap számít, amelynek mindkét sarka kiálló (az anyag felől
    nézve balra fordul): egy szűk akna vagy fülke belső lapja nem falvég."""
    P1, P2 = [], []
    for A in darabok(falak.simplify(0.01)):
        if A.geom_type != "Polygon": continue
        A = orient(A, 1.0)               # külső gyűrű CCW, lyukak CW: az anyag mindig balra
        for ring in [A.exterior, *A.interiors]:
            c = np.asarray(ring.coords)[:-1]; k = len(c)
            for i in range(k):
                p0, p1, p2, p3 = c[i - 1], c[i], c[(i + 1) % k], c[(i + 2) % k]
                L = np.hypot(*(p2 - p1))
                if not 0.05 < L <= ROV: continue
                u = (p2 - p1) / L
                a = p1 - p0; b = p3 - p2
                la, lb = np.hypot(*a), np.hypot(*b)
                # egy vékony sáv (nyitott ajtólap, csonkafal) hosszú oldala nem falvég
                if max(la, lb) < 0.25 * L: continue
                a = a / (la + 1e-12); b = b / (lb + 1e-12)
                if a[0] * u[1] - a[1] * u[0] < 0.6 or u[0] * b[1] - u[1] * b[0] < 0.6: continue
                P1.append(p1); P2.append(p2)
    P1, P2 = np.array(P1), np.array(P2)
    v = P2 - P1; l = np.hypot(v[:, 0], v[:, 1]); v = v / l[:, None]
    return P1, P2, v, np.stack([v[:, 1], -v[:, 0]], 1), l


def hidak(falak):
    """Két egymással szembenéző rövid falap (ajtótok, pillér oldala) közti
    négyszög: egy ajtó vagy egy pillérek közti ablak síkja. Lapként csak a
    legközelebbi, oldalt is átfedő pár, és csak ha a négyszögbe nem lóg fal.
    Előtte nem vált be: a falak lezárása (tágítás-szűkítés) a homlokzat előtti
    párkánnyal vastag sávot töltött ki; a falvégek konvex burka átlósan is
    hidat vert; a rövid lapok kinyújtása egy pillér két oldalán csak egy rést
    látott."""
    P1, P2, v, n, l = lapok(falak)
    m = (P1 + P2) / 2
    fp = falak.buffer(0); shapely.prepare(fp)
    out = []
    fa = STRtree([Point(x) for x in m])
    for i in range(len(m)):
        best = None
        for j in fa.query(Point(m[i]).buffer(FESZ + ROV)):
            if j == i or n[i] @ n[j] > -0.94: continue
            dij = (m[j] - m[i]) @ n[i]; dji = (m[i] - m[j]) @ n[j]
            if not (0.04 < dij < FESZ and 0.04 < dji < FESZ): continue
            a = sorted([(P1[j] - P1[i]) @ v[i], (P2[j] - P1[i]) @ v[i]])
            if min(a[1], l[i]) - max(a[0], 0) < ATF * min(l[i], l[j]): continue
            # a beljebb lógó pillér miatt legfeljebb 0,35 m eltolás
            if max(a[1], l[i]) - min(a[0], 0) > max(l[i], l[j]) + 0.35: continue
            if best is None or dij < best[0]: best = (dij, j)
        if best is None: continue
        Q = Polygon([P1[i], P2[i], P1[best[1]], P2[best[1]]]).convex_hull
        if Q.area < 1e-4 or fp.intersects(Q.buffer(-0.01)): continue
        out.append(Q)
    return unary_union(out).difference(falak) if out else Polygon()


def vonal_vagas(L, stilus):
    """A falréteg adott stílusú (vastagság, szürke) vonalai vékony vágásként."""
    s, R, t = L["transform"]; R = np.array(R); t = np.array(t)
    out = []
    for v in L["vonalak_pdf"]:
        if v[0] != "l" or (round(v[3] or 0, 3), round(v[4][0], 2)) not in stilus: continue
        a = s * R @ np.array(v[1]) + t; b = s * R @ np.array(v[2]) + t
        d = b - a; ln = np.hypot(*d)
        if ln < 0.03: continue
        d = d / ln
        out.append(LineString([a - 0.02 * d, b + 0.02 * d]).buffer(0.008, cap_style="flat"))
    return unary_union(out) if out else Polygon()


def szaggatott(L, rovid=0.3, toldas=0.08):
    """Szaggatott vonal (mobilfal): a rövid szakaszokat a hézagnál hosszabbra
    toldjuk, így összeérnek."""
    s, R, t = L["transform"]; R = np.array(R); t = np.array(t)
    out = []
    for v in L["vonalak_pdf"]:
        if v[0] != "l" or (round(v[3] or 0, 3), round(v[4][0], 2)) not in SZAGGATOTT: continue
        a = s * R @ np.array(v[1]) + t; b = s * R @ np.array(v[2]) + t
        d = b - a; ln = np.hypot(*d)
        if not 0.03 < ln < rovid: continue
        d = d / ln
        out.append(LineString([a - toldas * d, b + toldas * d]).buffer(0.008, cap_style="flat"))
    return unary_union(out) if out else Polygon()


def akadaly_ivek_nelkul(L):
    """Az akadály újra a laprajzból, a függönyfal ajtóinak nyitásíve nélkül. A
    lap_elemei() a függönyfal vonalait ívestül vastagítja: az ajtólap és az íve
    zárt cikket vág ki a szélfogóból, a nyitott ajtón át pedig a szabad tér
    kifolyik. Az ív nem akadály; az ajtólap egyenese lóg, az nem zár le semmit.
    Visszaadja az akadályt és az üvegajtók zárását."""
    s, R, t = L["transform"]; R = np.array(R); t = np.array(t)
    ak, szak, keret = [], [], []
    for dr in L["lap"].get_drawings():
        if dr["rect"].x0 > TABLA_X: continue
        lay, f = dr.get("layer"), dr.get("fill")
        if lay in FAL and f and dr["type"] in ("f", "fs") and min(f) > 0.7:
            ak += [Polygon(u).buffer(0) for u in utak(dr) if len(u) >= 3]
        elif lay == "Függönyfalak.2":
            if dr["type"] in ("f", "fs"):
                ak += [Polygon(u).buffer(0) for u in utak(dr) if len(u) >= 3]
                continue
            for it in dr["items"]:
                if it[0] == "l":
                    ak.append(LineString([(it[1].x, it[1].y), (it[2].x, it[2].y)]).buffer(1.2, cap_style="square"))
                    szak.append(((it[1].x, it[1].y), (it[2].x, it[2].y)))
                elif it[0] == "re":
                    r = it[1]; ak.append(box(r.x0, r.y0, r.x1, r.y1).exterior.buffer(1.2))
                    keret.append(box(r.x0, r.y0, r.x1, r.y1).exterior)
                elif it[0] == "qu":
                    q = it[1]
                    ak.append(LineString([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y),
                                          (q.ll.x, q.ll.y), (q.ul.x, q.ul.y)]).buffer(1.2))
    trg = lambda g: athelyez(g, s, R, t)
    AK = unary_union([L["falak"], trg(unary_union(ak))])
    tr = lambda p: s * R @ np.array(p) + t
    return AK, uvegajtok([(tr(a), tr(b)) for a, b in szak], AK, L["falak"], [trg(k) for k in keret])


def uvegajtok(szak, AK, falak, keret, rmin=0.3, rmax=3.6):
    """A függönyfal ajtónyílása: két egy egyenesbe eső üvegsor-szakasz közti
    rés, a szakaszok vonalában lezárva (a nyitott ajtólap merőleges rá, az nem
    zár)."""
    if not szak: return Polygon()
    A = np.array([a for a, b in szak]); B = np.array([b for a, b in szak])
    d = B - A; l = np.hypot(d[:, 0], d[:, 1]); ok = l > 0.02
    A, B, d, l = A[ok], B[ok], d[ok] / l[ok, None], l[ok]
    fa = STRtree([LineString([a, b]) for a, b in zip(A, B)])
    kt = STRtree(keret) if keret else None
    fp = falak.buffer(0); shapely.prepare(fp)
    def kotott(i, P):
        """a szakasz vége valamihez csatlakozik (keret, másik nem egyirányú
        szakasz, fal); a nyitott ajtólap csúcsa szabad, onnan nem zárunk"""
        pp = Point(P)
        if fp.distance(pp) < 0.03: return True
        if kt is not None and len(kt.query(pp, predicate="dwithin", distance=0.03)): return True
        return any(k != i and abs(d[i] @ d[k]) < 0.999 for k in fa.query(pp, predicate="dwithin", distance=0.03))
    # csak két végén kötött üvegsorból zárunk (és nem a keret mélységét adó rövid
    # szakaszokból: azok a szélfogón át egy vonalba esnek)
    sor = [l[i] >= 0.25 and kotott(i, A[i]) and kotott(i, B[i]) for i in range(len(A))]
    out = []
    for i in range(len(A)):
        if not sor[i]: continue
        for vi, P in ((1, B[i]), (-1, A[i])):
            u = d[i] * vi; best = None
            for j in fa.query(Point(P).buffer(rmax)):
                if j == i or not sor[j] or abs(d[i] @ d[j]) < 0.998: continue
                for Qp in (A[j], B[j]):
                    w = Qp - P; along = w @ u; perp = abs(w[0] * u[1] - w[1] * u[0])
                    if rmin <= along <= rmax and perp < max(0.04, 0.035 * along) and (best is None or along < best[0]):
                        best = (along, Qp)
            if best is None: continue
            seg = LineString([P, best[1]])
            # ne legyen köztük más üvegsor (a középső ajtótok rövid, az lehet)
            if any(k != i and sor[k] and fa.geometries[k].distance(Point((P + best[1]) / 2)) < 0.02 for k in fa.query(seg)):
                continue
            band = seg.buffer(0.03, cap_style="flat")
            if band.difference(AK).area < 0.8 * band.area: continue
            out.append(band)
    return unary_union(out) if out else Polygon()


def szint(L):
    """A szint szabad tere és a vágásváltozatai, szintenként egyszer."""
    if "_szint" not in L:
        AK, UA = akadaly_ivek_nelkul(L)
        vilag = box(*AK.bounds).buffer(2).difference(AK)
        # a falkitöltések közt hajszálrés marad (a PDF-ben fehér varrat): ezen át
        # a szoba összefolyna a szomszéd aknával; a szabad tér nyitása eltünteti
        vilag = vilag.buffer(-0.012, join_style=2).buffer(0.012, join_style=2)
        H = unary_union([hidak(L["falak"]), UA]).difference(AK)
        V, V2, SZ = vonal_vagas(L, AJTOSIK), vonal_vagas(L, FODEMEL), szaggatott(L)
        # előbb a hidak és az ajtósíkok; ha így nem jön ki a terület, a födémél
        # (galériás folyosó), utána a mobilfal is vág
        valt = []
        for cut in (unary_union([H, V]), unary_union([H, V, V2]), unary_union([H, V, V2, SZ]), H):
            cut = cut.intersection(vilag)
            valt.append((vilag.difference(cut), cut))
        L["_szint"] = (vilag, H, valt)
    return L["_szint"]


def osszevon(cellak, vagas, pt, cel):
    """A pecsét cellájához mohón hozzáveszi a vágáson át szomszédos cellákat,
    amíg a terület a pecsétéhez közelít (WC-fülke, kettévágott folyosó)."""
    if not cellak: return None
    ct = STRtree(cellak)
    seed = next(iter(ct.query(pt, predicate="within")), None)
    if seed is None:
        i = ct.nearest(pt)
        if cellak[i].distance(pt) > 1.0: return None
        seed = i
    seed = int(seed)
    erint = [set(int(x) for x in ct.query(c.buffer(0.004), predicate="intersects")) for c in vagas]
    cell_vag = {}
    for ci, s in enumerate(erint):
        for x in s: cell_vag.setdefault(x, set()).add(ci)
    bent = {seed}; vbent = set(); A = cellak[seed].area
    while abs(A - cel) / cel > 0.01 and A < cel:
        jel = []
        for x in bent:
            for ci in cell_vag.get(x, ()):
                if ci in vbent: continue
                for y in erint[ci] - bent:
                    a1 = A + cellak[y].area + vagas[ci].area
                    jel.append((abs(a1 - cel), a1, [ci], [y]))
                    if cellak[y].area < 0.6:      # keskeny rés (egy ajtónyílás két síkja közt): átlépünk rajta
                        for c2 in cell_vag.get(y, ()):
                            if c2 == ci or c2 in vbent: continue
                            for z in erint[c2] - bent - {y}:
                                a2 = a1 + cellak[z].area + vagas[c2].area
                                jel.append((abs(a2 - cel), a2, [ci, c2], [y, z]))
        if not jel: break
        h, a1, cs, ys = min(jel, key=lambda r: r[0])
        if h >= abs(A - cel) or a1 > cel * (1 + TOL): break
        bent |= set(ys); vbent |= set(cs); A = a1
    g = unary_union([cellak[x] for x in bent] + [vagas[c] for c in vbent])
    g = g.buffer(0.005, join_style=2).buffer(-0.005, join_style=2)
    return max(darabok(g), key=lambda q: q.area)


def cellakbol(F, cut, pt, cel, foglalt):
    D_ = pt.buffer(max(12.0, cel / 2))
    fl = foglalt.intersection(D_)
    cellak = [g for g in darabok(F.intersection(D_).difference(fl)) if g.geom_type == "Polygon" and g.area > 1e-4]
    vagas = [g for g in darabok(cut.intersection(D_).difference(fl)) if g.geom_type == "Polygon" and g.area > 1e-6]
    return osszevon(cellak, vagas, pt, cel)


def kivag(szabad, pont, var):
    """Tartalék, ha a vágásokkal nem jön ki a terület: a szabad tér k-val
    szűkítve, a pecsét pontját tartalmazó darab k-val visszatágítva (ez zárja
    az ajtórést); a legkisebb k, amelynél a terület a várt ±TUR-on belül van."""
    legjobb = None
    for k in K_LEPCSO:
        mag = next((g for g in darabok(szabad.buffer(-k, join_style=2)) if g.contains(pont)), None)
        if mag is None:
            # a pecsét a falhoz túl közel áll: a legközelebbi mag-darab, ha 1 m-en belül van
            ds = sorted(((g.distance(pont), g) for g in darabok(szabad.buffer(-k, join_style=2))), key=lambda x: x[0])
            if not ds or ds[0][0] > 1.0: continue
            mag = ds[0][1]
        terem = mag.buffer(k, join_style=2).intersection(szabad)
        terem = max(darabok(terem), key=lambda g: g.area) if not terem.is_empty else None
        if terem is None: continue
        hiba = abs(terem.area - var) / var
        if legjobb is None or hiba < legjobb[1]: legjobb = (terem, hiba)
        if hiba <= TUR: break
    return legjobb[0] if legjobb else None


def kivago(L, pt, var, foglalt):
    """Egy helyiség sokszöge: a vágásváltozatok közül az első, amelyiknek a
    területe a pecsététől legfeljebb TOL-lal tér el; ha egyik sem, a nyitásos
    tartalékkal együtt a legkisebb területhibájú."""
    vilag, H, valt = szint(L)
    jelolt = []
    for F, cut in valt:
        P = cellakbol(F, cut, pt, var, foglalt)
        if P is None: continue
        h = abs(P.area - var) / var
        if h <= TOL: return P
        jelolt.append((h, P))
    sz = vilag.difference(foglalt)
    for szabad in (sz.difference(H), sz):
        P = kivag(szabad, pt, var)
        if P is not None: jelolt.append((abs(P.area - var) / var, P))
    return min(jelolt, key=lambda r: r[0])[1] if jelolt else None


def cimke(P):
    """felirat helye, iránya és doboza, ahogy a régi adatban"""
    pl = polylabel(P, 0.02)
    mr = P.minimum_rotated_rectangle
    xs, ys = mr.exterior.coords.xy
    e = [(xs[i+1]-xs[i], ys[i+1]-ys[i]) for i in range(2)]; L = [math.hypot(*v) for v in e]
    k = 0 if L[0] >= L[1] else 1
    ang = math.degrees(math.atan2(e[k][1], e[k][0]))
    while ang > 90: ang -= 180
    while ang <= -90: ang += 180
    return round(pl.x, 2), round(pl.y, 2), round(ang, 1), round(max(L), 2), round(min(L), 2)


def poli(P):
    """A sokszög egyetlen gyűrűként, ahogy a térkép adata tárolja. A lyukat
    (a II–IV. emeleti folyosók közepén korláttal körbevett légtér) egy nulla
    szélességű bevágással fűzzük a külső gyűrűhöz: az SVG kitöltése, a
    területe és a szint sziluettje így lyukas marad — enélkül a légtér
    járható folyosónak látszana."""
    P = orient(P.simplify(0.03, preserve_topology=True), 1.0)
    c = [tuple(q) for q in P.exterior.coords[:-1]]
    for h in P.interiors:
        hc = [tuple(q) for q in h.coords[:-1]]
        # a bevágás a két gyűrű legközelebbi csúcsai közt
        i, j = min(((i, j) for i in range(len(c)) for j in range(len(hc))),
                   key=lambda ij: math.dist(c[ij[0]], hc[ij[1]]))
        c = c[:i + 1] + hc[j:] + hc[:j + 1] + c[i:]
    return [[round(x, 2), round(y, 2)] for x, y in c]


# ------------------------------------------------------------------ nyilvántartás
def nyilvantartas(xls):
    out = {}
    for sh in xlrd.open_workbook(xls).sheets():
        fej = None
        for r in range(sh.nrows):
            row = [str(c.value).strip() for c in sh.row(r)]
            if fej is None:
                if any(x.startswith("HELYISÉG SZÁMA KARI") for x in row):
                    fej = {n: next(i for i, x in enumerate(row) if x.startswith(n))
                           for n in ("HELYISÉG MEGNEVEZÉSE", "FUNKCIÓ", "ALAPTERÜLET")}
                continue
            if re.fullmatch(r"OA[A-Z0-9]{5}", row[0]):
                try: ter = float(row[fej["ALAPTERÜLET"]])
                except ValueError: ter = None
                out[row[0]] = {"nev": row[fej["HELYISÉG MEGNEVEZÉSE"]], "funkcio": row[fej["FUNKCIÓ"]], "terulet": ter}
    return out


# ------------------------------------------------------------------ fő
def main(pdf, xls, html, jelentes=None):
    src = open(html, encoding="utf-8").read()
    i0 = src.index("const D = ") + len("const D = ")
    D, i1 = json.JSONDecoder().raw_decode(src, i0)
    NY = nyilvantartas(xls)
    RES, GW, GH = D["grid"]["res"], D["grid"]["w"], D["grid"]["h"]
    W0, H0 = D["meta"]["w"], D["meta"]["h"]
    keret = box(0, 0, W0, H0)
    vankod = {r["code"] for r in D["rooms"] if r["code"]}

    # funkció (nyilvántartás) -> kategória (térkép), a meglévő helyiségekből
    par = collections.defaultdict(collections.Counter)
    for r in D["rooms"]:
        if r["code"] in NY: par[NY[r["code"]]["funkcio"]][r["cat"]] += 1
    KAT = {f: c.most_common(1)[0][0] for f, c in par.items()}

    doc = pymupdf.open(pdf)
    uj_termek, uj_falak, uj_kozl, csere, rossz, illesztes = [], {}, {}, {}, [], {}
    for lv, lap in LAPOK.items():
        falak_pdf, akadaly_pdf, pecset = lap_elemei(doc[lap - 1])
        falak_d = [Polygon(w).buffer(0) for w in D["walls"][str(lv)]]
        kozep = {r["code"]: (r["cx"], r["cy"]) for r in D["rooms"] if r["level"] == lv and r["code"]}
        s, R, t, hiba = illeszt(falak_pdf, falak_d, pecset, kozep)
        illesztes[lv] = {"s": s, "szog": math.degrees(math.atan2(R[1, 0], R[0, 0])), "t": t.tolist(), "eltérés_m": hiba}
        falak = unary_union([athelyez(g, s, R, t) for g in falak_pdf])
        akad = unary_union([athelyez(g, s, R, t) for g in akadaly_pdf])
        L = {"lv": lv, "falak": falak, "akadaly": akad, "transform": (s, R.tolist(), t.tolist()),
             "vonalak_pdf": vonalak(doc[lap - 1]), "lap": doc[lap - 1],
             "pecset": [dict(p, X=float((s * R @ np.array([p["x"], p["y"]]) + t)[0]),
                             Y=float((s * R @ np.array([p["x"], p["y"]]) + t)[1])) for p in pecset]}
        # a térképen már meglévő helyiségek nem szabadok: egy folyosó fal nélkül
        # folytatódhat egy meglévőben, és enélkül összeolvadna vele
        regi = unary_union([Polygon(r["poly"]).buffer(0.02) for r in D["rooms"] if r["level"] == lv])

        # mit kell kivágni: a hiányzót, és amit a keret csonkított
        kell = []
        for p in pecset:
            pt = Point(*(s * R @ np.array([p["x"], p["y"]]) + t))
            var = p["terulet"] or (NY.get(p["kod"]) or {}).get("terulet")
            if not var: continue
            if p["kod"] not in vankod:
                kell.append((p, pt, var, "új"))
            else:
                r = next(r for r in D["rooms"] if r["code"] == p["kod"])
                xs = [q[0] for q in r["poly"]]; ys = [q[1] for q in r["poly"]]
                szelen = min(xs) < 0.3 or min(ys) < 0.3 or max(xs) > W0 - 0.3 or max(ys) > H0 - 0.3
                if szelen and r["area"] < 0.97 * var:
                    kell.append((p, pt, var, "csonka"))
        # előbb a termek, utána a folyosók; ami már megvan, az a következőnek nem szabad
        kell.sort(key=lambda x: (x[0]["kod"][5] in "KL", x[0]["kod"]))
        foglalt = regi
        for p, pt, var, mi in kell:
            P = kivago(L, pt, var, foglalt if mi == "új" else foglalt.difference(
                Polygon(next(r["poly"] for r in D["rooms"] if r["code"] == p["kod"])).buffer(0.03)))
            h = abs(P.area - var) / var if P is not None else 1
            k = None
            if P is None or h > TUR:
                rossz.append({"kod": p["kod"], "szint": lv, "mi": mi, "vart": var,
                              "kapott": round(P.area, 2) if P is not None else None})
                continue
            foglalt = foglalt.union(P.buffer(0.02))
            ny = NY.get(p["kod"], {})
            cat = KAT.get(ny.get("funkcio")) or ("KÖZLEKEDŐK" if p["kod"][5] in "KL" else None)
            if mi == "csonka":
                csere[p["kod"]] = (lv, P)
            else:
                uj_termek.append({"level": lv, "code": p["kod"], "name": ny.get("nev") or p["nev"],
                                  "cat": cat, "P": P, "area": round(var, 1), "hiba": round(h, 3)})
        # a keret melletti és azon kívüli falak, az új helyiségek körül
        ujak = unary_union([u["P"] for u in uj_termek if u["level"] == lv] +
                           [P for l2, P in csere.values() if l2 == lv])
        if not ujak.is_empty:
            kint = falak.difference(keret).intersection(ujak.buffer(1.5))
            uj_falak[lv] = [g for g in darabok(kint) if g.area > 0.01]
            uj_kozl[lv] = unary_union([u["P"] for u in uj_termek if u["level"] == lv and u["cat"] in KOZLEKEDO])

    # új keret, eltolás a rácslépés egész többszörösével
    mind = unary_union([u["P"] for u in uj_termek] + [P for _, P in csere.values()] +
                       [g for v in uj_falak.values() for g in v] + [keret])
    x0, y0, x1, y1 = mind.bounds
    ox = math.ceil(max(0, 0.3 - x0) / RES) * RES; oy = math.ceil(max(0, 0.3 - y0) / RES) * RES
    W1 = round(max(W0, x1) + ox + 0.3, 2); H1 = round(max(H0, y1) + oy + 0.3, 2)
    GW1 = max(GW + round(ox / RES), math.ceil(W1 / RES)); GH1 = max(GH + round(oy / RES), math.ceil(H1 / RES))
    di, dj = round(ox / RES), round(oy / RES)
    tol = lambda x, y: [round(x + ox, 2), round(y + oy, 2)]

    # régi adat eltolása
    for r in D["rooms"]:
        r["poly"] = [tol(*p) for p in r["poly"]]; r["cx"], r["cy"] = tol(r["cx"], r["cy"])
        if r.get("doors"): r["doors"] = [tol(*p) for p in r["doors"]]
    for lv in D["walls"]:
        D["walls"][lv] = [[tol(*p) for p in w] for w in D["walls"][lv]]
    for st in D["stairs"]:
        st["pts"] = [[p[0], *tol(p[1], p[2]), p[3]] for p in st["pts"]]
    for lf in D.get("lifts") or []:
        lf["pts"] = [[p[0], *tol(p[1], p[2]), p[3]] for p in lf["pts"]]

    # a csonkított helyiségek új alakja
    for r in D["rooms"]:
        if r["code"] in csere:
            P = affinity.translate(csere[r["code"]][1], ox, oy)
            r["poly"] = poli(P); r["cx"], r["cy"], r["ang"], r["lw"], r["lh"] = cimke(P)
    # új helyiségek
    nid = max(r["id"] for r in D["rooms"]) + 1
    for u in sorted(uj_termek, key=lambda u: (u["level"], u["code"])):
        P = affinity.translate(u["P"], ox, oy)
        cx, cy, ang, lw, lh = cimke(P)
        D["rooms"].append({"id": nid, "level": u["level"], "code": u["code"], "name": u["name"], "cat": u["cat"],
                           "poly": poli(P), "cx": cx, "cy": cy, "area": u["area"], "ang": ang, "lw": lw, "lh": lh,
                           "circ": 1 if u["cat"] in KOZLEKEDO else 0})
        nid += 1
    for lv, gs in uj_falak.items():
        for g in gs:
            D["walls"][str(lv)].append(poli(affinity.translate(g, ox, oy)))

    # járásrács: a régi eltolva, plusz az új közlekedők cellái
    for lv in list(D["masks"]):
        b = np.frombuffer(base64.b64decode(D["masks"][lv]), np.uint8)
        m0 = np.unpackbits(b, bitorder="little")[:GW*GH].reshape(GH, GW)
        m = np.zeros((GH1, GW1), np.uint8); m[dj:dj+GH, di:di+GW] = m0
        K = uj_kozl.get(int(lv))
        if K is not None and not K.is_empty:
            K = affinity.translate(K.buffer(0.35), ox, oy)
            fal = unary_union([Polygon(w).buffer(0) for w in D["walls"][lv]])
            jo = K.difference(fal); pj = prep(jo); x0, y0, x1, y1 = jo.bounds
            for j in range(max(0, int(y0 / RES)), min(GH1, int(y1 / RES) + 1)):
                for i in range(max(0, int(x0 / RES)), min(GW1, int(x1 / RES) + 1)):
                    if not m[j, i] and pj.contains(Point((i + .5) * RES, (j + .5) * RES)): m[j, i] = 1
        D["masks"][lv] = base64.b64encode(np.packbits(m.reshape(-1), bitorder="little").tobytes()).decode()
    D["grid"]["w"], D["grid"]["h"] = GW1, GH1
    D["meta"]["w"], D["meta"]["h"] = W1, H1

    def tiszta(o):
        if isinstance(o, float): return int(o) if o == int(o) else o
        if isinstance(o, list): return [tiszta(x) for x in o]
        if isinstance(o, dict): return {k: tiszta(v) for k, v in o.items()}
        return o
    uj = json.dumps(tiszta(D), ensure_ascii=False, separators=(",", ":"))
    open(html, "w", encoding="utf-8").write(src[:i0] + uj + src[i1:])

    rep = {"eltolas": [ox, oy], "keret": [W1, H1], "racs": [GW1, GH1], "illesztes": illesztes,
           "uj": [{k: v for k, v in u.items() if k != "P"} for u in uj_termek],
           "csonka_javitva": sorted(csere), "nem_sikerult": rossz, "kategoria": KAT,
           "uj_falak": {lv: len(v) for lv, v in uj_falak.items()}}
    if jelentes: json.dump(rep, open(jelentes, "w"), ensure_ascii=False, indent=1)
    print(f"eltolás: x +{ox} m, y +{oy} m")
    print(f"új keret {W1} × {H1} m, rács {GW1} × {GH1}")
    print(f"új helyiség: {len(uj_termek)}, csonkított javítva: {len(csere)}, nem sikerült: {len(rossz)}")
    for x in rossz: print("   nem sikerült:", x)


if __name__ == "__main__":
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    main(*sys.argv[1:])

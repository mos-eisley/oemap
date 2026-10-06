#!/usr/bin/env python3
"""A térképről hiányzó helyiségek pótlása a tervtári alaprajz PDF-jéből.

A térkép adata (index.html, `const D`) egy korábbi generátorból jött, és a
keretével levágta a felső szárny északkeleti végét: minden szinten hiányzott
42 helyiség, köztük 10 órarendi terem (F05, F06, 1.13 …), és a keret szélén
átnyúló folyosók is. Ez az eszköz a tervtári alaprajzból (Archicad-PDF,
2026.01.09) pótolja őket, a meglévő adathoz nem nyúl:

1. Szintenként a PDF falkitöltéseit (tartószerkezet, válaszfal) a térkép
   falaira illeszti (ICP, hasonlósági transzform). A hét szint egymáshoz 12
   cm-en belül egyezik, a mostani falak 10 cm-en belül fedik a PDF-et.
2. A hiányzó helyiségeket (a PDF pecsétje szerint) és a keret által
   csonkítottakat kivágja a falak közti szabad térből. Az ajtórést egy
   „nyitással" zárja (a szabad teret k-val szűkíti, a pecsét pontját
   tartalmazó darabot k-val visszatágítja), k-t helyiségenként választja: a
   legkisebbet, amelynél az alapterület a pecsétén ±5%-on belül van. Ami így
   sem jön ki, azt nem veszi fel, hanem kiírja.
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
from shapely.geometry import Polygon, MultiPolygon, Point, box, LineString
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
def darabok(g):
    if g.is_empty: return []
    return list(g.geoms) if hasattr(g, "geoms") else [g]


def hidak(falak, res=3.3, rov=0.9, fed=0.8):
    """A falak közti nyílások (ajtó, ablak) lezárása a fal síkjában, hogy a
    helyiség ne fusson be az ablakfülkébe és ne folyjon ki az ajtón (a régi
    adat sokszögei is a fal belső síkjánál zárnak; enélkül a terület 7%-kal
    nagyobb lett).
    Minden rövid falapot (falvég, pillér oldala: legfeljebb `rov`) kifelé
    kinyújtunk, legfeljebb `res`-ig. Ha egy szemben álló falba ütközik, amely
    a lap szélességének legalább `fed` részét lefedi, a kinyújtott sáv a híd:
    egy ajtó vagy egy pillérek közti ablak síkja. Két szemközti hosszú fal
    (egy szoba két oldala) nem rövid lap, ferdén pedig nem fed le eleget.
    Előtte három egyszerűbb szabály nem vált be: a falak lezárása
    (tágítás-szűkítés) a homlokzat előtti párkánnyal együtt vastag sávot
    töltött ki; a falvégek környezetének konvex burka átlósan is vékony lett
    két pillér közt; a falpárok legközelebbi pontja pedig két darab közt csak
    egy rést lát, egy pillér két oldalán ablak és ajtó is lehet."""
    out = []
    for A in darabok(falak.simplify(0.01)):
        for ring in [A.exterior, *A.interiors]:
            c = np.asarray(ring.coords); ccw = ring.is_ccw
            for p1, p2 in zip(c[:-1], c[1:]):
                v = p2 - p1; L = np.linalg.norm(v)
                if not 0.05 < L <= rov: continue
                v = v / L
                n = np.array([v[1], -v[0]]) if ccw else np.array([-v[1], v[0]])   # kifelé
                if ring is not A.exterior: n = -n
                q1, q2 = p1 + 0.01 * n, p2 + 0.01 * n
                R = Polygon([tuple(q1), tuple(q2), tuple(q2 + res * n), tuple(q1 + res * n)])
                W = R.intersection(falak)
                if W.is_empty: continue
                pts = np.array([pt for g in darabok(W) if hasattr(g, "exterior") for pt in g.exterior.coords])
                if not len(pts): continue
                t = float(np.min((pts - q1) @ n))
                if t < 0.04: continue
                sav = Polygon([tuple(q1 + (t + .005) * n), tuple(q2 + (t + .005) * n), tuple(q2 + (t + .06) * n), tuple(q1 + (t + .06) * n)])
                if sav.intersection(falak).area < fed * sav.area: continue
                out.append(Polygon([tuple(p1), tuple(p2), tuple(q2 + (t + .02) * n), tuple(q1 + (t + .02) * n)]))
    return unary_union(out).difference(falak) if out else Polygon()


def kivag(szabad, pont, var, zartak=()):
    """Előbb a nyílásaiban lezárt szabad tér darabja (egyre nagyobb
    zárással), ha a területe stimmel; különben nyitással (lásd a fejlécet)."""
    for zart in zartak:
        g = next((g for g in darabok(zart) if g.contains(pont)), None)
        if g is not None and abs(g.area - var) / var <= TUR:
            return g, abs(g.area - var) / var, 0
    """A pecsét pontját tartalmazó helyiség: a legkisebb k-s nyitás, amelynél
    az alapterület a várt ±5%-án belül van."""
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
        if legjobb is None or hiba < legjobb[1]: legjobb = (terem, hiba, k)
        if hiba <= TUR: return terem, hiba, k
    return legjobb if legjobb else (None, 1, None)


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
    P = P.simplify(0.03, preserve_topology=True)
    c = list(P.exterior.coords)[:-1]
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
        vilag = box(*akad.bounds).buffer(2)
        # a térképen már meglévő helyiségek nem szabadok: egy folyosó fal nélkül
        # folytatódhat egy meglévőben, és enélkül összeolvadna vele
        regi = unary_union([Polygon(r["poly"]).buffer(0.02) for r in D["rooms"] if r["level"] == lv])
        szabad = vilag.difference(akad).difference(regi)
        hid = hidak(falak)

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
        foglalt = Polygon()
        for p, pt, var, mi in kell:
            sz = szabad.difference(foglalt)
            # a nyitás is a hidakkal lezárt téren: az ablakfülke így ott is zárva marad
            szh = sz.difference(hid)
            P, h, k = kivag(szh, pt, var, [szh])
            if P is None or h > TUR:          # egy híd kettévághatta: hidak nélkül is
                P2, h2, k2 = kivag(sz, pt, var)
                if P is None or h2 < h: P, h, k = P2, h2, k2
            if P is not None and h <= TUR: foglalt = foglalt.union(P.buffer(0.02))
            if P is None or h > TUR:
                rossz.append({"kod": p["kod"], "szint": lv, "mi": mi, "vart": var,
                              "kapott": round(P.area, 2) if P is not None else None, "k": k})
                continue
            ny = NY.get(p["kod"], {})
            cat = KAT.get(ny.get("funkcio")) or ("KÖZLEKEDŐK" if p["kod"][5] in "KL" else None)
            if mi == "csonka":
                csere[p["kod"]] = (lv, P)
            else:
                uj_termek.append({"level": lv, "code": p["kod"], "name": ny.get("nev") or p["nev"],
                                  "cat": cat, "P": P, "area": round(var, 1), "k": k, "hiba": round(h, 3)})
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

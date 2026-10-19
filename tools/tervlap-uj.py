#!/usr/bin/env python3
"""Helyiség-sokszögek kinyerése egy tervtári alaprajz PDF-jéből, üres lapról.

A `tervlap-szarny.py` egy MEGLÉVŐ térkép falaira illeszti a PDF-et (ICP), és
csak a hiányzó helyiségeket vágja ki. Új épületnél nincs mire illeszteni. Ez az
eszköz azt méri fel, mi marad működőképes nulláról: a kivágót (falvégek közti
hidak + falréteg-vonalak) változatlanul átveszi a szárny-eszközből, és csak a
kalibrációt pótolja a PDF-ből:

- **Szög**: a falkitöltések éleinek hossz szerint súlyozott szöghisztogramja
  (mod 90°). Az OD mind a 9 lapján az élhossz több mint 95%-a
  tengelypárhuzamos, a domináns szög 0,0° — elfordulás nincs.
- **Lépték**: a MÉRETEZÉS réteg vonalhosszaiból és a méretszövegekből. Minden
  méretszöveghez a legközelebbi méretvonal, lépték = érték_m / hossz_pt; a
  medián az eredmény. Az OD-n lapra 107–187 pár, mind ±2%-on belül, a szórás
  0,06%, az eredmény kerekítve pontosan 1:100 (0,0352778 m/pt). Ez a mérce
  helyben van a lapon, térkép nem kell hozzá.
- **Eltolás**: a rajz bal felső sarka a (0,3; 0,3) pontba. A PDF y tengelye
  lefelé mutat, ahogy a térkép SVG-je is, tükrözés tehát nincs.

Amit szintén a lapról olvas ki, nem konstansból (a szárny-eszközben ez mind
OA-ra szabott szám volt):

- **a rajz és a helyiségtábla határa** (`TABLA_X=3000` helyett): a lap jobb
  szélén álló táblában minden kód még egyszer szerepel, és beleszámítva minden
  helyiség kétszer jönne ki. A határ a falkitöltések jobb széle + 20 pt.
- **a falkitöltés szürkéje** (`0,44` helyett): a FAL rétegek kitöltései közül a
  leghosszabb összkörvonalú. Az OD-n 0,435, az OA-n is — de a 28 tervlap között
  van 0,247-es, 0,373-as és 0,498-as is.
- **a pecsét magassága** (`dy < 45` helyett 70): az OD pecsétjében a név alatt
  ott a szervezeti egység is, két sorban, ezért az alapterület 46 pt-tel áll a
  kód alatt, az OA-é 28-cal. 45-tel az OD 98 pecsétjéből 25 adott területet.
- **a szintek és a lapok megfeleltetése** (`LAPOK` dict helyett): a lapon
  szereplő kódok szintjegyeiből. Az OD-n 9 lap, és a lapok helyiségszáma
  pontosan az épületadat-tábla 9 munkalapjáé.

A kivágás maga (hidak, ajtósík, födémél, mobilfal, cellaösszevonás a pecsét
területéhez) változatlan, a `tervlap-szarny.py`-ból importálva.

Nem ír térképet: ez felmérő eszköz. A kimenet szintenként a sokszögek és a
pecsét/tábla területéhez mért hiba, plusz két lefedési szám (átfedés, a szabad
tér hányadát fedik le) — mert a jó terület még lehet rossz alak.

Használat:
  python3 tools/tervlap-uj.py <tervtari_alaprajzok.pdf> <epuletadatok.xls> \\
          <jelentes.json> [--pre OD] [--geo sokszogek.json]
  (pip install pymupdf numpy scipy shapely xlrd)
A PDF és az xls belső anyag: ne tedd a repóba.
"""
import sys, os, re, json, math, collections, importlib.util
import numpy as np
import pymupdf, xlrd
from shapely.geometry import Polygon, Point, box, LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree

# a kivágó a szárny-eszközből (a fájlnévben kötőjel van, ezért kézzel)
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tervlap-szarny.py")
_spec = importlib.util.spec_from_file_location("tervlap_szarny", _p)
sz = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sz)

PT = 0.0352778                  # 1 pt méterben 1:100-as léptéknél (72 dpi, 2,54 cm)
LEPTEKEK = [50, 100, 200, 250, 500]
DY = 70                         # a pecsét alatt ennyi pt-ig keressük a területet
FAL_SAV = 0.7                   # eddig a szürkéig falanyag a FAL rétegen


class Elotag(tuple):
    """Rétegnév-illesztés előtag szerint. A rétegek neve a rajzkészítő
    sablonjától függ: a 2026-os exportokban `TARTÓSZERKEZETEK.2` és
    `MÉRETEZÉS.5`, a 2024-esekben (NA, NB) utótag nélkül `TARTÓSZERKEZETEK`.
    Pontos névre szűrve ez a kettő falkitöltés nélkül maradt; előtagra
    illesztve mindkettőn előjön a fal, és ott, ahol a név amúgy is pontos
    (OA, OD), semmi nem változik: a lapokon nincs más ilyen kezdetű réteg."""
    def __contains__(self, x):
        return bool(x) and any(x.startswith(p) for p in self)


FAL = Elotag(("TARTÓSZERKEZETEK", "VÁLASZFALAK"))
MERETEZES = Elotag(("MÉRETEZÉS",))
sz.FAL = FAL                    # a szárny-eszköz kivágója is ezt nézi


# ------------------------------------------------------------------ kalibráció
def falszurke(pg):
    """A falkitöltés szürkéje: a FAL rétegek kitöltései közül a leghosszabb
    összkörvonalú (nem a legtöbb darab: a fehér ablakfoltok sokan vannak)."""
    h = collections.Counter()
    for dr in pg.get_drawings():
        f = dr.get("fill")
        if dr.get("layer") not in sz.FAL or not f or dr["type"] not in ("f", "fs"):
            continue
        g = round(f[0], 3)
        if g > 0.95:
            continue                            # fehér: ablak a falban, nem falanyag
        r = dr["rect"]
        h[g] += (r.x1 - r.x0) + (r.y1 - r.y0)
    return h.most_common(1)[0][0] if h else None


def falrect(pg, szurke):
    """A falkitöltések befoglalója: ez a rajz, a tőle jobbra álló a tábla."""
    rs = [dr["rect"] for dr in pg.get_drawings()
          if dr.get("layer") in sz.FAL and dr.get("fill") and dr["type"] in ("f", "fs")
          and dr["fill"][0] <= FAL_SAV]     # ugyanaz a szabály, mint a falaknál
    if not rs:
        return None
    return (min(r.x0 for r in rs), min(r.y0 for r in rs),
            max(r.x1 for r in rs), max(r.y1 for r in rs))


def szog(pg, szurke):
    """A falélek hossz szerint súlyozott domináns szöge (mod 90°), és hogy az
    élhossz mekkora része esik rá. 1-hez közeli arány = tengelyhez igazított
    rajz; ha nem, az épület el van forgatva a lapon."""
    h = collections.Counter()
    for dr in pg.get_drawings():
        f = dr.get("fill")
        if (dr.get("layer") not in sz.FAL or not f or dr["type"] not in ("f", "fs")
                or abs(f[0] - szurke) > 0.02):
            continue
        for it in dr["items"]:
            if it[0] == "re":
                r = it[1]
                h[0.0] += (r.x1 - r.x0) + (r.y1 - r.y0)
                continue
            if it[0] != "l":
                continue
            a, b = it[1], it[2]
            L = math.hypot(b.x - a.x, b.y - a.y)
            if L < 1:
                continue
            h[round(math.degrees(math.atan2(b.y - a.y, b.x - a.x)) % 90, 1)] += L
    if not h:
        return 0.0, 0.0
    kozel = lambda k1, k2: min(abs(k1 - k2), 90 - abs(k1 - k2)) < 0.6
    tot = sum(h.values())
    a0 = max(h, key=lambda k: sum(v for k2, v in h.items() if kozel(k2, k)))
    ra = sum(v for k, v in h.items() if kozel(k, a0)) / tot
    return (a0 if a0 <= 45 else a0 - 90), ra


def leptek(pg):
    """Lépték a MÉRETEZÉS rétegből: minden méretszöveghez a legközelebbi
    méretvonal, lépték = érték / hossz. A medián az eredmény; a jelentésbe a
    párok száma és az egyezés szórása is kimegy."""
    segs = []
    for dr in pg.get_drawings():
        if dr.get("layer") not in MERETEZES:
            continue
        for it in dr["items"]:
            if it[0] != "l":
                continue
            a, b = it[1], it[2]
            L = math.hypot(b.x - a.x, b.y - a.y)
            if L > 3:
                segs.append(((a.x, a.y), (b.x, b.y), L))
    txt = []
    for bl in pg.get_text("dict")["blocks"]:
        for l in bl.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if re.fullmatch(r"\d{1,2},\d{2}", t):
                    v = float(t.replace(",", "."))
                    if v >= 0.3:
                        bb = s["bbox"]
                        txt.append((v, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2))
    if not segs or not txt:
        return None, 0, None
    tree = STRtree([LineString([a, b]) for a, b, _ in segs])
    sc = []
    for v, cx, cy in txt:
        P = Point(cx, cy)
        best = None
        for i in tree.query(P.buffer(14)):
            d = tree.geometries[i].distance(P)
            if best is None or d < best[0]:
                best = (d, int(i))
        if best is not None:
            sc.append(v / segs[best[1]][2])
    if len(sc) < 5:
        return None, len(sc), None
    sc = np.array(sc)
    med = float(np.median(sc))
    jo = sc[abs(sc - med) / med < 0.02]
    return med, len(sc), {"par": len(sc), "egyezo": int(len(jo)),
                          "szoras_rel": float(jo.std() / med) if len(jo) else None}


def pecsetek(pg, kodre, tabla_x):
    """A lap pecsétjei: kód, középpont, név, alapterület. A területet a kód
    alatt DY pt-ig keresi, a legközelebbi illeszkedő sorban."""
    spans = []
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if t:
                    spans.append((t, s["bbox"]))
    out = []
    for t, bb in spans:
        if not kodre.match(t) or bb[0] > tabla_x:
            continue
        cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
        sorok = sorted(((((b2[1] + b2[3]) / 2 - cy), t2) for t2, b2 in spans
                        if abs((b2[0] + b2[2]) / 2 - cx) < 40
                        and -2 < (b2[1] + b2[3]) / 2 - cy < DY and t2 != t))
        nev = next((x for _, x in sorok if re.search(r"[A-ZÁÉÍÓÖŐÚÜŰ]{3}", x)), None)
        ter = next((float(m.group(1).replace(",", ".")) for _, x in sorok
                    for m in [re.match(r"^(\d+,\d+) m$", x)] if m), None)
        out.append({"kod": t, "x": cx, "y": cy, "nev": nev, "terulet": ter})
    # ugyanaz a kód két spanban (a pecsét kétszer kiírva): a bal felső marad
    egy = {}
    for p in sorted(out, key=lambda p: (p["y"], p["x"])):
        egy.setdefault(p["kod"], p)
    return list(egy.values())


LEPCSO_LAY = Elotag(("LÉPCSŐK-LIFTEK",))


def magok(pg, tabla_x, s, R, t):
    """A LÉPCSŐK-LIFTEK réteg rajzelemeiből összefüggő foltok, méterben: ezek
    a lépcsőkarok és a liftaknák. Az OD táblájában NINCS külön lépcsőház-
    helyiség (egyetlen `LÉPCSŐ` nevű helyiség van, a -2. szinten), a lépcsők a
    közlekedő belsejében állnak — a függőleges kapcsolat tehát csak innen, a
    rajzból szedhető ki. Egy folt akkor függőleges mag, ha több szomszédos
    szinten ugyanott megvan; ezt a hívó dönti el."""
    rects = []
    for dr in pg.get_drawings():
        if dr.get("layer") not in LEPCSO_LAY: continue
        r = dr["rect"]
        if r.x0 > tabla_x or r.is_empty: continue
        if r.width > 400 or r.height > 400: continue        # lapszintű keret
        rects.append(box(r.x0, r.y0, r.x1, r.y1))
    if not rects: return []
    U = unary_union([g.buffer(6) for g in rects])           # 6 pt ~ 21 cm
    out = []
    for f in (U.geoms if hasattr(U, "geoms") else [U]):
        if f.area < 200: continue                           # pár vonal, nem mag
        b = f.bounds
        c = s * R @ np.array([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]) + t
        out.append({"x": round(float(c[0]), 2), "y": round(float(c[1]), 2),
                    "w": round((b[2] - b[0]) * s, 2), "h": round((b[3] - b[1]) * s, 2),
                    "elem": sum(1 for g in rects if f.contains(g.centroid))})
    return sorted(out, key=lambda m: -m["w"] * m["h"])


def lap_elemei(pg, szurke, tabla_x, mind=True):
    """falak, akadályok (falak + ablak/üvegfal).

    `mind=True`: a FAL rétegek MINDEN nem világos kitöltése fal (szürke
    ≤ FAL_SAV), nem csak a leggyakoribb árnyalaté. Egy lapon ugyanis több
    falszürke is lehet (más anyag: vasbeton, tégla, szigetelés), és csak a
    dominánsat véve a többi falban lyuk marad, amin a helyiségek
    összefolynak. Ez volt a legdrágább hibám; mérve, a ±3%-on belüli
    helyiségek aránya (és a hiba mediánja):

        TG   5% → 82%   (medián 60,4% → 0,4%),  kivágva 65 → 94 / 97
        FC  15% → 67%   (medián 15,5% → 0,8%),  kivágva 31 → 46 / 47
        KB  27% → 94%   (medián  9,6% → 0,4%),  kivágva 377 → 502 / 519

    `mind=False` a régi viselkedés, összehasonlításra."""
    falak, akadaly = [], []
    for dr in pg.get_drawings():
        if dr["rect"].x0 > tabla_x:
            continue
        lay, f = dr.get("layer"), dr.get("fill")
        if lay in sz.FAL and f and dr["type"] in ("f", "fs"):
            polys = [Polygon(u).buffer(0) for u in sz.utak(dr) if len(u) >= 3]
            if (f[0] <= FAL_SAV) if mind else (abs(f[0] - szurke) < 0.02):
                falak += polys
                akadaly += polys
            elif min(f) > 0.7:                  # ablak a falban: a szabad teret elvágja
                akadaly += polys
        elif lay == "Függönyfalak.2":
            for u in sz.utak(dr):
                if dr["type"] in ("f", "fs") and len(u) >= 3:
                    akadaly.append(Polygon(u).buffer(0))
                else:
                    akadaly.append(LineString(u + [u[0]] if dr.get("closePath")
                                              else u).buffer(1.2))
    return falak, akadaly


# ------------------------------------------------------------------ nyilvántartás
def nyilvantartas(forras, pre):
    """Az épületadat-tábla helyiségei: név, funkció, alapterület, munkalap.

    A forrás lehet a nyers `.xls`, vagy a `tervtar-leltar.py` `leltar.json`-ja.
    Több épületnél a leltár a jobb: ott a helyiségek már KÓD szerint vannak
    épületbe sorolva, nem fájlnév szerint — a KB táblájának a fájlneve például
    `…_kd_becsi_ut_…`, a kódjai viszont KB-sek, és fájlnév szerint párosítva a
    KB a KD tábláját kapná meg.
    """
    if forras.lower().endswith(".json"):
        d = json.load(open(forras, encoding="utf-8"))
        ep = (d.get("epuletek") or {}).get(pre)
        if not ep:
            return {}
        return {h["kod"]: {"nev": h.get("nev"), "funkcio": h.get("funkcio"),
                           "terulet": h.get("terulet"), "lap": h.get("lap")}
                for h in ep["helyisegek"]}
    out = {}
    kre = re.compile(rf"{pre}[A-Z0-9]{{5}}")
    for sh in xlrd.open_workbook(forras).sheets():
        fej = None
        for r in range(sh.nrows):
            row = [str(c.value).strip() for c in sh.row(r)]
            if fej is None:
                if any(x.startswith("HELYISÉG SZÁMA KARI") for x in row):
                    fej = {n: next(i for i, x in enumerate(row) if x.startswith(n))
                           for n in ("HELYISÉG MEGNEVEZÉSE", "FUNKCIÓ", "ALAPTERÜLET")}
                continue
            if row and kre.fullmatch(row[0]):
                try:
                    ter = float(row[fej["ALAPTERÜLET"]])
                except ValueError:
                    ter = None
                out[row[0]] = {"nev": row[fej["HELYISÉG MEGNEVEZÉSE"]],
                               "funkcio": row[fej["FUNKCIÓ"]], "terulet": ter,
                               "lap": sh.name}
    return out


# ------------------------------------------------------------------ fő
def main(pdf, xls, jelentes, pre=None, geo=None):
    if not pre:
        pre = re.search(r"oe[-_]([a-z]{2})", os.path.basename(pdf)).group(1).upper()
    kodre = re.compile(rf"^{pre}[A-Z0-9]{{5}}$")
    NY = nyilvantartas(xls, pre)
    doc = pymupdf.open(pdf)
    print(f"{pre}: {len(doc)} lap, nyilvántartás {len(NY)} helyiség")

    lapok = []
    for i, pg in enumerate(doc):
        szur = falszurke(pg)
        fr = falrect(pg, szur) if szur is not None else None
        if fr is None:
            lapok.append({"lap": i + 1, "kihagyva": "nincs falkitöltés"})
            print(f"  lap {i+1}: KIHAGYVA (nincs falkitöltés)")
            continue
        tabla_x = fr[2] + 20
        pec = pecsetek(pg, kodre, tabla_x)
        a0, ra = szog(pg, szur)
        s_pt, npar, stat = leptek(pg)
        L = {"lap": i + 1, "szurke": szur, "tabla_x": round(tabla_x),
             "pecset": len(pec), "terulettel": sum(1 for p in pec if p["terulet"]),
             "szog": a0, "tengely_arany": round(ra, 3),
             "leptek_m_pt": s_pt, "leptek_par": npar, "leptek_stat": stat,
             "szintjegyek": dict(collections.Counter(p["kod"][2:4] for p in pec)),
             "_pec": pec, "_pg": pg, "_szurke": szur, "_tabla_x": tabla_x}
        lapok.append(L)
        # a lépték laponként hiányozhat (nincs méretezés-réteg vagy méretszöveg
        # a lapon); ilyenkor a lapok mediánja ugrik be, lásd lejjebb
        lep = f"{s_pt:.6f} m/pt ({npar} pár)" if s_pt else f"— (nincs mérhető, {npar} pár)"
        print(f"  lap {L['lap']}: pecsét {L['pecset']:3d} (területtel {L['terulettel']:3d}), "
              f"szürke {szur}, szög {a0:+.1f}° ({ra:.0%} tengely), lépték {lep}, "
              f"szintek {L['szintjegyek']}")

    # Lépték: a MÉRT értéket használjuk, laponként. A névleges lépték csak
    # kiírva szerepel — rászabályozni HIBA: az OA lapjai 1:125-ben vannak
    # kinyomva (0,0441 m/pt), és a legközelebbi kerek léptékre (1:100)
    # kerekítve 25%-os zsugorodást kapna az egész épület.
    lp = [L["leptek_m_pt"] for L in lapok if L.get("leptek_m_pt")]
    s_med = float(np.median(lp))
    nevl = min(LEPTEKEK, key=lambda k: abs(s_med - PT * k / 100))
    print(f"\nlépték: mért medián {s_med:.6f} m/pt (= 1:{s_med / PT * 100:.1f}); a "
          f"legközelebbi kerek lépték 1:{nevl}, eltérés {abs(s_med - PT * nevl / 100) / s_med:.2%}"
          f" — a mért értékkel számolunk\n")

    # Az eltolás KÖZÖS, nem laponkénti. Minden lap a saját falbefoglalójához
    # igazítva külön koordinátarendszerbe kerülne, és a szintek nem állnának
    # egymás fölé: az OD lépcsőmagja így a -1. szinten 23,2-re, a földszinten
    # 14,4-re esett, 9 méterrel odébb. A lapok ugyanazzal a léptékkel,
    # ugyanarra a helyre vannak kinyomva, ezért egyetlen eltolás a helyes —
    # a nyers PDF-koordináta maga az összerendezés.
    for L in lapok:
        if "kihagyva" in L:
            continue
        L["_falak_pdf"], L["_akad_pdf"] = lap_elemei(L["_pg"], L["_szurke"], L["_tabla_x"])
    hat = [unary_union([sz.athelyez(g, L["leptek_m_pt"] or s_med, np.eye(2), np.zeros(2))
                        for g in L["_falak_pdf"]]).bounds
           for L in lapok if L.get("_falak_pdf")]
    if not hat:
        # egyetlen lapon sincs falkitöltés: a BD lapjain nincs rétegnév, a
        # KD-n a falak fehérrel vannak kitöltve, nem szürkével — egyik lapról
        # sem lehet szabad teret számolni
        sys.exit(f"{pre}: egyetlen lapon sincs falkitöltés a FAL rétegeken — "
                 f"ebből a tervlapból nem lehet geometriát kinyerni")
    t_kozos = np.array([0.3 - min(b[0] for b in hat), 0.3 - min(b[1] for b in hat)])

    eredmeny, geoout = [], {}
    for L in lapok:
        if "kihagyva" in L:
            continue
        pg, szur, tabla_x = L["_pg"], L["_szurke"], L["_tabla_x"]
        sz.TABLA_X = tabla_x                    # a szárny-eszköz globálisa
        s = L["leptek_m_pt"] or s_med           # a lap saját mért léptéke
        # Forgatás NINCS: a kivágás szögfüggetlen (a küszöbök méterben vannak,
        # a vágások a falak saját irányát követik), és egy lapra egyetlen szög
        # amúgy is rossz volna ott, ahol az épület szárnyai eltérő irányúak —
        # az OA hét lapjából négyen a falhossz csak 30-36%-a esik egy irányba.
        # A helyiségek a tervlap saját állásában jönnek ki; forgatni egy kész
        # térképhez kell, nem a kinyeréshez.
        R = np.eye(2)
        falak_pdf, akad_pdf = L["_falak_pdf"], L["_akad_pdf"]
        if not falak_pdf:
            continue
        t = t_kozos
        falak = unary_union([sz.athelyez(g, s, R, t) for g in falak_pdf])
        akad = unary_union([sz.athelyez(g, s, R, t) for g in akad_pdf])
        Ld = {"lv": L["lap"], "falak": falak, "akadaly": akad,
              "transform": (s, R.tolist(), t.tolist()),
              "vonalak_pdf": sz.vonalak(pg), "lap": pg}

        kell = []
        for p in L["_pec"]:
            var = p["terulet"] or (NY.get(p["kod"]) or {}).get("terulet")
            if not var:
                continue
            kell.append((p, Point(*(s * R @ np.array([p["x"], p["y"]]) + t)), var))
        # előbb a termek, utána a folyosók; ami megvan, a következőnek nem szabad
        kell.sort(key=lambda x: (x[0]["kod"][5] in "KL", x[0]["kod"]))
        foglalt, kiv = Polygon(), []
        for p, pt, var in kell:
            P = sz.kivago(Ld, pt, var, foglalt)
            if P is None:
                kiv.append({"kod": p["kod"], "vart": round(var, 2),
                            "kapott": None, "hiba": None})
                continue
            foglalt = foglalt.union(P.buffer(0.02))
            kiv.append({"kod": p["kod"],
                        "nev": NY.get(p["kod"], {}).get("nev") or p["nev"],
                        "vart": round(var, 2), "kapott": round(P.area, 2),
                        "hiba": round(abs(P.area - var) / var, 4),
                        "csucs": len(P.exterior.coords) - 1, "lyuk": len(P.interiors),
                        "_P": P})

        # lefedés: átfedés a sokszögek közt, és a belső szabad tér hányada
        Ps = [k["_P"] for k in kiv if "_P" in k]
        ossz = sum(p.area for p in Ps)
        uni = unary_union(Ps).area if Ps else 0.0
        vilag, _H, _valt = sz.szint(Ld)
        hat = box(*vilag.bounds).exterior
        szabad = sum(g.area for g in sz.darabok(vilag) if g.distance(hat) > 0.05)
        hs = [r["hiba"] for r in kiv if r["hiba"] is not None]
        j3 = sum(1 for h in hs if h <= 0.03)
        j5 = sum(1 for h in hs if h <= 0.05)
        eredmeny.append({
            "lap": L["lap"], "szintjegyek": L["szintjegyek"], "pecset": L["pecset"],
            "terulettel": L["terulettel"], "kell": len(kell), "kivagva": len(Ps),
            "jo_3szaz": j3, "jo_5szaz": j5,
            "atfedes_m2": round(ossz - uni, 2), "lefedes_m2": round(uni, 2),
            "szabad_m2": round(szabad, 2),
            "lefedes_arany": round(uni / szabad, 4) if szabad else None,
            "helyisegek": [{k: v for k, v in r.items() if k != "_P"} for r in kiv]})
        if geo:
            # a térkép formátumához kell a felirat helye/iránya/doboza is
            # (`cimke()`), és a nyilvántartás szövegmezői — így a jelentésből
            # egy külön eszköz össze tudja rakni az app épületadatát anélkül,
            # hogy a lassú kivágást újra le kellene futtatni
            hl = []
            for k in kiv:
                if "_P" not in k: continue
                ny = NY.get(k["kod"], {})
                cx, cy, ang, lw, lh = sz.cimke(k["_P"])
                hl.append({"kod": k["kod"], "poly": sz.poli(k["_P"]),
                           "nev": ny.get("nev") or k.get("nev"),
                           "funkcio": ny.get("funkcio"), "lap_neve": ny.get("lap"),
                           "terulet": k["vart"], "cx": cx, "cy": cy,
                           "ang": ang, "lw": lw, "lh": lh})
            geoout[str(L["lap"])] = {
                "leptek": s, "transform": {"s": s, "t": t.tolist()},
                "falak": [sz.poli(g) for g in sz.darabok(falak)],
                "magok": magok(pg, tabla_x, s, R, t),
                "helyisegek": hl}
        print(f"  lap {L['lap']}: kell {len(kell):3d}, kivágva {len(Ps):3d}, "
              f"±3% {j3:3d} ({j3 / max(1, len(kell)):.0%}), ±5% {j5:3d}, "
              f"átfedés {ossz - uni:7.2f} m², lefedés {uni:7.1f}/{szabad:7.1f} m² "
              f"({uni / szabad if szabad else 0:.0%})")

    rep = {"epulet": pre, "pdf": os.path.basename(pdf), "xls": os.path.basename(xls),
           "nyilvantartas_helyiseg": len(NY),
           "leptek": {"mert_median_m_pt": s_med, "mert_leptek": f"1:{s_med / PT * 100:.1f}",
                      "legkozelebbi_kerek": f"1:{nevl}",
                      "kerekites_hibaja": abs(s_med - PT * nevl / 100) / s_med},
           "lapok": [{k: v for k, v in L.items() if not k.startswith("_")} for L in lapok],
           "szintek": eredmeny}
    json.dump(rep, open(jelentes, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if geo:
        json.dump(geoout, open(geo, "w", encoding="utf-8"), ensure_ascii=False)

    mindh = [r["hiba"] for e in eredmeny for r in e["helyisegek"] if r["hiba"] is not None]
    print(f"\n=== {pre}: nyilvántartás {len(NY)}, pecsét területtel "
          f"{sum(e['terulettel'] for e in eredmeny)}, kivágni kell "
          f"{sum(e['kell'] for e in eredmeny)}, sikerült {sum(e['kivagva'] for e in eredmeny)}")
    if mindh:
        a = np.array(mindh)
        print(f"    területhiba: ±1% {(a <= .01).sum()}  ±3% {(a <= .03).sum()} "
              f"({(a <= .03).mean():.0%})  ±5% {(a <= .05).sum()} ({(a <= .05).mean():.0%})"
              f"  medián {np.median(a):.1%}")


if __name__ == "__main__":
    av = sys.argv[1:]
    kw = {}
    for f in ("--pre", "--geo"):
        if f in av:
            i = av.index(f)
            kw[f[2:]] = av[i + 1]
            del av[i:i + 2]
    if len(av) != 3:
        sys.exit(__doc__)
    main(*av, **kw)

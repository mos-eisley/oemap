#!/usr/bin/env python3
"""Az app épületadata (`data/epuletek/<kód>.json`) a tervlapi geometriából.

A `tervlap-uj.py` a tervlap PDF-jéből kivágja a helyiség-sokszögeket és a
falakat; ez az eszköz abból rakja össze azt, amit az `index.html` `D`-je vár
(`epuletKesz()`: meta, levels, rooms, grid, masks, walls, stairs). A lassú
rész a kivágás, ezért az két lépés: előbb `tervlap-uj.py … --geo geo.json`,
utána ez.

Amit a formátumról tudni kell, mert egyik sem látszik magától:

- **A maszk a KÖZLEKEDÉS, nem a padló.** Kézenfekvő volna a helyiségek
  uniójából csinálni, de az OA maszkját megmérve a cellák 88%-a (földszint)
  és 71%-a (II. emelet) közlekedőben van, és a maszk területe (1139 m²) a
  közlekedők területéhez (1010 m²) áll közel, nem az összeshez (2278 m²). Ha
  minden helyiség padlója járható volna, az útvonal átvágna az irodákon. A
  közlekedők uniója 0,35 m-rel tágítva (hogy az ajtónyílásba is beérjen),
  mínusz a falak — ugyanaz, ahogy a `tervlap-szarny.py` az új folyosók
  celláit felvette.
- **A funkciónevek épületenként mások.** Az app `CATS` táblája az OA
  tábláját követi (`IRODÁK`, `LABOR`, `VIZES HELYISÉGEK`), az OD táblájában
  viszont `IRODA`, `LABOR-MŰHELY`, `VIZESBLOKK` áll. A 13 OD-funkcióból 7
  nem szerepel a `CATS`-ban, és szín nélkül maradna. A `KAT` tábla fordítja
  őket; ami nincs benne, az megy változatlanul, és a jelentés kiírja.
- **Az OD-ben nincs lépcsőház-helyiség.** A tábla egyetlen `LÉPCSŐ` nevű
  helyiséget ismer (a -2. szinten), `L` betűs kód pedig egy sincs: a lépcsők
  a közlekedő belsejében állnak. A függőleges kapcsolat ezért a tervlap
  `LÉPCSŐK-LIFTEK` rétegéről jön (`tervlap-uj.magok()`): ami több szomszédos
  szinten ugyanott megvan, az egy mag. A magot befoglaló helyiség kódja megy
  a `pts`-be — az app ezt csak a lépés feliratához használja
  („Lépcsőház …”), és a közlekedő kódja ott igaz is.
- **A `levels[].code` mezőt az app nem olvassa** (csak `level`, `short`,
  `name`), ami jól jön: az OD felső lapjain két szintjegy is van (`10` és
  `15`), mert a szárny féllépcsővel el van csúsztatva.

Használat:
  python3 tools/epulet-json.py <geo.json> <leltar.json> <ki.json> --kod OD \\
          [--nev "OD épület"] [--cim "..."] [--jelentes jelentes.json]
A tervlap és a tábla belső anyag; a kimenet helyiséglistát tartalmaz, úgy
kezelendő, mint a leltár.
"""
import sys, os, re, json, io, math, base64, collections
import numpy as np
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely.prepared import prep

RES = 0.45                      # rácslépés méterben, az OA-ból átvéve
MARGO = 0.3                     # a sokszögek és a keret közti sáv
KOZL_TAG = 0.35                 # a közlekedő tágítása az ajtónyílásba
MAG_TAV = 1.5                   # ennyin belül ugyanaz a függőleges mag (m)

# A nyilvántartás funkciói -> az app CATS kulcsai. Az egész egyetemen 21
# különböző funkciónév van, és ebből 11 nem szerepel a CATS-ban: a tábláknak
# nincs közös szótáruk, épületenként más az írásmód. Ami itt áll, az mind
# ugyanannak a kategóriának a másik írásmódja — a zárójeles szám az, hány
# helyiséget érint az egyetemen.
#
# **A `KÖZELEKDŐK` elírás, és drága.** 225 helyiségnél ez áll `KÖZLEKEDŐK`
# helyett, és mivel a járhatósági maszk a közlekedőkből épül, enélkül az
# FK-ban 95-ből 2, a KT-ben 486-ból 2, az OC-ben 158-ból 20 helyiséghez volt
# csak út. A `tervtar-leltar.py` is ismeri ezt az elírást.
KAT = {
    "VIZESBLOKK": "VIZES HELYISÉGEK",          # 894
    "IRODA": "IRODÁK",                         # 787
    "RAKTÁR-TÁROLÓ": "RAKTÁROZÁS/TÁROLÁS",     # 382
    "LABOR-MŰHELY": "LABOR",                   # 260
    "KÖZELEKDŐK": "KÖZLEKEDŐK",                # 225 — elírás a táblákban
    "ELŐADÓ-SZEMINÁRIUM": "ELŐADÓ - SZEMINÁRIUM",   # 187
    "SPORT+ÖLTÖZŐK": "SPORT - ÖLTÖZŐK",        # 42
    "KÖZÖSSÉGI TEREK (1)": "KÖZÖSSÉGI TEREK",  # 2
}
# Amit NEM fordítunk, mert nincs megfelelője: `SZOBA` (440, kollégiumi
# lakószoba), `FOGYASZTÓVÉDELEM` (82), `PARKOLÓ` (4). Ezek valódi, új
# kategóriák, és meglévőre erőltetni őket félrevezető volna. Az épületadat
# `cats` mezejébe kerülnek, saját színnel: az app a `CATS[cat] || D.cats[cat]`
# sorrendet nézi (index.html), tehát az épület a saját kategóriáit hozhatja.
#
# **A `cats` mezőt nem elhagyni!** Üresen hagyva a `D.cats[cat]` kifejezés
# `undefined`-on indexel, és KIVÉTELT dob — az `epuletAllit()` félbemarad, a
# szintválasztó az előző épületé marad, az épület neve sem frissül. Nem
# „szín nélkül rajzolódik ki”, hanem elszáll: a KT-n `PARKOLÓ`, a KH-n
# `SZOBA`, az OC-n egy funkció nélküli helyiség (`null`) akasztotta meg.
#
# A színek a meglévő tervtári kulcs hangulatához igazodnak, de NEM onnan
# valók — az építészekkel jóváhagyatandók.
UJ_CATS = {
    "SZOBA": "#e8cdb5",             # kollégiumi lakószoba
    "FOGYASZTÓVÉDELEM": "#c9a9b4",  # külsős szervezet, a KÜLSŐS SZOLGÁLTATÁS rokona
    "PARKOLÓ": "#aab4bd",
}
KOZLEKEDO = {"KÖZLEKEDŐK", "ELŐTEREK", "KÖZÖSSÉGI TEREK"}
# az app CATS táblájának kulcsai (index.html); ami nem ezek közül való, azt az
# app szín nélkül rajzolná ki, ezért a jelentés külön kiírja
CATS = {"ELŐADÓ - SZEMINÁRIUM", "LABOR", "IRODÁK", "VIZES HELYISÉGEK",
        "SPORT - ÖLTÖZŐK", "HÖK", "KÖZLEKEDŐK", "RAKTÁROZÁS/TÁROLÁS",
        "DOLGOZÓI TERÜLETEK", "ÜZEMELTETÉS", "ELŐTEREK", "KÖNYVTÁR",
        "KÖZÖSSÉGI TEREK", "EGYETEMI SZOLGÁLTATÁS", "KÜLSŐS SZOLGÁLTATÁS"}

# Mikor lépcső egy folt. A rajzi szűrő a valódi lépcsőkart fogja meg; a
# táblából jövő megerősítés (a foltot tartalmazó helyiség neve `LÉPCSŐ`) azért
# kell, mert az OD -2. szintje egy külön pinceszárny, és az oda vezető lépcsőt
# a lap csak egy rövid karral jelzi (1,6×0,7 m, 5 elem) — rajzi szűrővel
# kiesne, és a szint 3 helyisége elérhetetlen maradna.
MAG_MIN_OLDAL = 1.2
MAG_MIN_TER = 3.0
MAG_MIN_ELEM = 10
LEPCSONEV = re.compile(r"LÉPCS", re.I)
LIFTNEV = re.compile(r"LIFT|FELVONÓ", re.I)

# a munkalap nevéből a szint sorszáma és felirata; a félemelet az OA-nál is a
# földszint fölötti egész index (`emelet()` ezt veszi fél emeletnek)
SZINTNEV = [
    (r"PINCE\s*-?\s*2", "P2", "Pince -2"), (r"PINCE\s*-?\s*1", "P1", "Pince -1"),
    (r"ALAGSOR", "A", "Alagsor"), (r"PINCE", "P", "Pince"),
    (r"F[ÖO]LDSZINT", "F", "Földszint"), (r"F[ÉE]LEMELET", "FE", "Félemelet"),
]
ROMAI = ["", "I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII."]


def szintcimke(sz, lapnev):
    """(rövid, hosszú) felirat a szint SZÁMÁBÓL — a leltár már kiolvasta a
    munkalap nevéből, és negyvenféle írásmódot ismer. Csak ahol az sem tudta
    (`TETŐTÉR`, `UDVAR SZINT`, `1-2 felszint`: 4643-ból 252 helyiség), ott
    esünk vissza magára a munkalap nevére. Korábban itt egy saját, szűkebb
    névlista volt, és egész lapokat dobott el: az FS 99 kivágott helyiségéből
    21 maradt, az OB 60-ából 29."""
    if sz is None:
        n = re.sub(r"^MENNYIS[ÉE]GEK[_ ]*", "", lapnev or "", flags=re.I)
        n = n.replace("_", " ").strip() or "?"
        return n[:3].upper(), n[:1].upper() + n[1:].lower()
    if sz == 0.5:
        return "FE", "Félemelet"
    if sz != int(sz):
        return str(sz), f"{sz}. szint"
    i = int(sz)
    if i <= -2: return f"P{-i}", f"Pince {i}"
    if i == -1: return "A", "Alagsor"
    if i == 0: return "F", "Földszint"
    if i < len(ROMAI): return ROMAI[i].rstrip("."), f"{ROMAI[i]} emelet"
    return str(i), f"{i}. emelet"


def szintrend(lapnev):
    """(rendezési kulcs, rövid név, hosszú név) a munkalap nevéből. Tartalék:
    a leltár szintszáma az elsődleges, lásd `szintcimke()`."""
    n = (lapnev or "").upper().replace("_", " ")
    for mint, rov, nev in SZINTNEV:
        if re.search(mint, n):
            k = {"Pince -2": -2, "Pince -1": -1, "Alagsor": -1, "Pince": -1,
                 "Földszint": 0, "Félemelet": 0.5}[nev]
            return k, rov, nev
    m = re.search(r"(\d)\s*\.?\s*EMELET", n)
    if m:
        e = int(m.group(1))
        return float(e), ROMAI[e].rstrip("."), f"{ROMAI[e]} emelet"
    return None


def maszk(kozl, falak, GW, GH):
    """Járhatósági bittérkép: a megadott terület KOZL_TAG-gal tágítva (hogy az
    ajtónyílásba is beérjen), mínusz a falak; cellánként 1 bit, k=j*GW+i,
    LSB-ről."""
    m = np.zeros((GH, GW), np.uint8)
    if kozl is None or kozl.is_empty:
        return m
    jo = kozl.buffer(KOZL_TAG, join_style=2).difference(falak)
    if jo.is_empty:
        return m
    pj = prep(jo)
    x0, y0, x1, y1 = jo.bounds
    for j in range(max(0, int(y0 / RES)), min(GH, int(y1 / RES) + 2)):
        for i in range(max(0, int(x0 / RES)), min(GW, int(x1 / RES) + 2)):
            if pj.contains(Point((i + .5) * RES, (j + .5) * RES)):
                m[j, i] = 1
    return m


def magparositas(lapmagok, lapszint):
    """A lapok magjait függőleges magokká fűzi: ami a szomszédos szinten
    MAG_TAV-on belül ugyanott van, az ugyanaz. Visszaad listát, elemenként
    {szint: (x, y, w, h)}."""
    rend = sorted(lapmagok, key=lambda lp: lapszint[lp])
    magok = []
    for lp in rend:
        lv = lapszint[lp]
        for m in lapmagok[lp]:
            cel = None
            for g in magok:
                last = g[max(g)]
                if max(g) < lv and math.dist((m["x"], m["y"]), (last[0], last[1])) <= MAG_TAV:
                    if lv not in g and (cel is None or
                                        math.dist((m["x"], m["y"]), (last[0], last[1]))
                                        < math.dist((m["x"], m["y"]),
                                                    (cel[max(cel)][0], cel[max(cel)][1]))):
                        cel = g
            if cel is None:
                magok.append({lv: (m["x"], m["y"], m["w"], m["h"], m["elem"])})
            else:
                cel[lv] = (m["x"], m["y"], m["w"], m["h"], m["elem"])
    return magok


def main(geoj, leltarj, kij, kod, nev=None, cim=None, jelentes=None,
         maszk_mod="kozlekedo", tag=None):
    mod = maszk_mod
    global KOZL_TAG
    if tag: KOZL_TAG = float(tag)
    geo = json.load(io.open(geoj, encoding="utf-8"))
    lel = json.load(io.open(leltarj, encoding="utf-8"))
    NY = {h["kod"]: h for h in lel["epuletek"][kod]["helyisegek"]}

    # --- szintek: a lap helyiségeinek leltárbeli szintszáma dönt (modus), a
    # munkalap neve csak feliratnak kell. Egy lap EGY szint (az OD felső
    # lapjain két kódszint is van — féllépcsővel eltolt szárny —, de az
    # ugyanaz a lap, és a térkép formátuma is egy szintet ismer).
    lapszint, lapinfo = {}, {}
    for lp, g in geo.items():
        nevek = collections.Counter(h["lap_neve"] for h in g["helyisegek"] if h.get("lap_neve"))
        szamok = collections.Counter(NY[h["kod"]]["szint"] for h in g["helyisegek"]
                                     if h["kod"] in NY and NY[h["kod"]].get("szint") is not None)
        lapinfo[lp] = (szamok.most_common(1)[0][0] if szamok else None,
                       nevek.most_common(1)[0][0] if nevek else "")
    # Amelyik lapnak nincs szintszáma, azt a PDF LAPSORRENDJE teszi a helyére:
    # a tervlapok alulról fölfelé sorakoznak, így a szomszédos ismert szintek
    # közé esik. Enélkül a `TETŐTÉR` vagy az `UDVAR SZINT` lapja kimaradna.
    lapsor = sorted(geo, key=int)
    kulcs = {}
    for i, lp in enumerate(lapsor):
        sz = lapinfo[lp][0]
        if sz is not None:
            kulcs[lp] = float(sz); continue
        elo = next((lapinfo[q][0] for q in reversed(lapsor[:i]) if lapinfo[q][0] is not None), None)
        kov = next((lapinfo[q][0] for q in lapsor[i + 1:] if lapinfo[q][0] is not None), None)
        kulcs[lp] = ((elo + kov) / 2 if elo is not None and kov is not None
                     else elo + 0.5 if elo is not None
                     else kov - 0.5 if kov is not None else float(i))
    rend = sorted(lapsor, key=lambda lp: (kulcs[lp], int(lp)))
    levels = []
    for lp in rend:
        sz, ln = lapinfo[lp]
        rov, lnev = szintcimke(sz, ln)
        levels.append({"lap": lp, "kulcs": kulcs[lp], "short": rov, "name": lnev,
                       "munkalap": ln, "leltar_szint": sz})
    # az app szintsorszáma egész, a sorrendet követi (a félemelet is egy fok,
    # ahogy az OA-nál); a 0 a földszint, ha van
    nulla = next((i for i, L in enumerate(levels) if L["leltar_szint"] == 0), 0)
    for i, L in enumerate(levels):
        L["level"] = i - nulla
        lapszint[L["lap"]] = L["level"]

    # --- helyiségek
    rooms, ismeretlen_kat, nid = [], collections.Counter(), 0
    for L in levels:
        for h in geo[L["lap"]]["helyisegek"]:
            ny = NY.get(h["kod"], {})
            fn = h.get("funkcio") or ny.get("funkcio")
            # Üres sztring, ha a nyilvántartás nem mond funkciót — `None` NEM
            # mehet: az app keresője `norm(r.cat)`-ot hív (a nevet `||""`-gyel
            # védi, a kategóriát nem), és egy null kategórián a keresés
            # elszáll. Üres kategóriával a helyiség az alapértelmezett szürkét
            # kapja, ami igaz is: a tábla nem tudja, mi ez.
            cat = KAT.get(fn, fn) or ""
            if cat and cat not in CATS:
                ismeretlen_kat[fn] += 1
            elif not cat:
                ismeretlen_kat["(nincs funkció a táblában)"] += 1
            rooms.append({"id": nid, "level": L["level"], "code": h["kod"],
                          "name": h.get("nev") or ny.get("nev"), "cat": cat,
                          "poly": h["poly"], "cx": h["cx"], "cy": h["cy"],
                          "area": round(h["terulet"], 1), "ang": h["ang"],
                          "lw": h["lw"], "lh": h["lh"],
                          "circ": 1 if cat in KOZLEKEDO else 0})
            nid += 1

    # --- keret: minden koordináta pozitív, MARGO sávval
    pts = [p for r in rooms for p in r["poly"]] + \
          [p for L in levels for w in geo[L["lap"]]["falak"] for p in w]
    x0 = min(p[0] for p in pts); y0 = min(p[1] for p in pts)
    ox = max(0.0, MARGO - x0); oy = max(0.0, MARGO - y0)
    tol = lambda p: [round(p[0] + ox, 2), round(p[1] + oy, 2)]
    for r in rooms:
        r["poly"] = [tol(p) for p in r["poly"]]
        r["cx"] = round(r["cx"] + ox, 2); r["cy"] = round(r["cy"] + oy, 2)
    walls = {}
    for L in levels:
        walls[str(L["level"])] = [[tol(p) for p in w] for w in geo[L["lap"]]["falak"]]
    W = round(max(p[0] for r in rooms for p in r["poly"]) + MARGO, 2)
    H = round(max(p[1] for r in rooms for p in r["poly"]) + MARGO, 2)
    for lvw in walls.values():
        for w in lvw:
            W = max(W, round(max(p[0] for p in w) + MARGO, 2))
            H = max(H, round(max(p[1] for p in w) + MARGO, 2))
    GW, GH = math.ceil(W / RES), math.ceil(H / RES)

    # --- maszkok
    masks, maszkstat = {}, {}
    for L in levels:
        lv = L["level"]
        fal = unary_union([Polygon(w).buffer(0) for w in walls[str(lv)]] or [Polygon()])
        # `kozlekedo` (alap): csak a közlekedők járhatók, ahogy az OA maszkja —
        # ott a cellák 88%-a (földszint) közlekedőben van. `padlo`: minden
        # helyiség padlója járható; ilyenkor az útvonal a szobákon is átvág, de
        # az ajtóadat nélkül csak így érhető el a szobából nyíló szoba.
        kozl = unary_union([Polygon(r["poly"]).buffer(0) for r in rooms
                            if r["level"] == lv and (mod == "padlo" or r["circ"])]
                           or [Polygon()])
        m = maszk(kozl, fal, GW, GH)
        masks[str(lv)] = base64.b64encode(
            np.packbits(m.reshape(-1), bitorder="little").tobytes()).decode()
        maszkstat[lv] = {"cella": int(m.sum()), "m2": round(float(m.sum()) * RES * RES, 1),
                         "kozlekedo_m2": round(kozl.area, 1)}

    # --- függőleges magok a lépcső-rétegből
    lapmagok = {L["lap"]: geo[L["lap"]].get("magok", []) for L in levels}
    magok = magparositas(lapmagok, lapszint)
    # helyiség a mag alatt: amelyik sokszög tartalmazza a pontot
    szintroom = collections.defaultdict(list)
    for r in rooms:
        szintroom[r["level"]].append((r, Polygon(r["poly"]).buffer(0)))

    def helyisege(lv, x, y):
        """A foltot tartalmazó helyiség (ha nincs, a 3 m-en belüli legközelebbi)."""
        p = Point(x + ox, y + oy)
        bent = [r for r, g in szintroom.get(lv, []) if g.contains(p)]
        if bent:
            return bent[0]
        kand = sorted(((g.distance(p), r["id"], r) for r, g in szintroom.get(lv, [])),
                      key=lambda z: z[:2])
        return kand[0][2] if kand and kand[0][0] < 3 else None

    stairs, lifts, eldobott = [], [], []
    for g in magok:
        if len(g) < 2:
            eldobott.append({"ok": "csak egy szinten", "szint": sorted(g)}); continue
        w = float(np.median([v[2] for v in g.values()]))
        h = float(np.median([v[3] for v in g.values()]))
        elem = float(np.median([v[4] for v in g.values()]))
        pts_, nevek = [], []
        for lv in sorted(g):
            r = helyisege(lv, g[lv][0], g[lv][1])
            if r is None: continue
            pts_.append([lv, round(g[lv][0] + ox, 2), round(g[lv][1] + oy, 2), r["code"]])
            nevek.append(r["name"] or "")
        if len(pts_) < 2:
            eldobott.append({"ok": "nincs befoglaló helyiség", "szint": sorted(g)}); continue
        rajzi = (w * h >= MAG_MIN_TER and min(w, h) >= MAG_MIN_OLDAL and elem >= MAG_MIN_ELEM)
        tablas = any(LEPCSONEV.search(n) for n in nevek)
        liftnev = any(LIFTNEV.search(n) for n in nevek)
        if not (rajzi or tablas or liftnev):
            eldobott.append({"ok": "se nem lépcső alakú, se a tábla nem mondja",
                             "szint": sorted(g), "meret": [round(w, 2), round(h, 2)],
                             "elem": int(elem)})
            continue
        rek = {"g": g, "pts": pts_, "w": w, "h": h, "elem": elem,
               "forras": "rajz" if rajzi else ("tábla" if tablas else "tábla/lift")}
        (lifts if liftnev and not rajzi else stairs).append(rek)
    stairs.sort(key=lambda s: -len(s["pts"])); lifts.sort(key=lambda s: -len(s["pts"]))
    # a helyiség nélküli szintek a falakból és a maszkokból is kimaradnak
    elo = {r["level"] for r in rooms}
    walls = {k: v for k, v in walls.items() if int(k) in elo}
    masks = {k: v for k, v in masks.items() if int(k) in elo}
    D = {
        "meta": {"building": nev or f"{kod} épület",
                 "address": cim or "", "source": os.path.basename(geoj),
                 "w": W, "h": H},
        # Üres szint nem kerül be: egy közös tervlapon (BF/BB/BA, TA/TC) van
        # olyan lap, amelyen csak a MÁSIK épület helyiségei állnak — annak
        # ehhez az épülethez nincs szintje, és a szintválasztóban sem volna mit
        # mutatnia.
        "levels": [{"level": L["level"], "short": L["short"], "name": L["name"],
                    "code": sorted(kodjai)[0]}
                   for L in levels
                   for kodjai in [{r["code"][2:4] for r in rooms
                                   if r["level"] == L["level"]}] if kodjai],
        # az épület SAJÁT kategóriaszínei: amit az app CATS-a nem ismer
        "cats": {c: UJ_CATS[c] for c in
                 sorted({r["cat"] for r in rooms if r["cat"] and r["cat"] not in CATS})
                 if c in UJ_CATS},
        "rooms": rooms, "walls": walls,
        "grid": {"res": RES, "w": GW, "h": GH}, "masks": masks,
        "stairs": [{"id": i, "pts": s["pts"]} for i, s in enumerate(stairs)],
        "lifts": [{"id": f"LIFT{i+1}", "code": s["pts"][0][3][4:], "pts": s["pts"]}
                  for i, s in enumerate(lifts)],
        "flights": [],
    }

    def tiszta(o):
        if isinstance(o, float): return int(o) if o == int(o) else round(o, 4)
        if isinstance(o, list): return [tiszta(x) for x in o]
        if isinstance(o, dict): return {k: tiszta(v) for k, v in o.items()}
        return o
    json.dump(tiszta(D), io.open(kij, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    rep = {"kod": kod, "keret": [W, H], "racs": [GW, GH], "eltolas": [round(ox, 2), round(oy, 2)],
           "szintek": [{k: v for k, v in L.items() if k != "kulcs"} for L in levels],
           "helyiseg": len(rooms), "maszk_mod": mod, "maszk": maszkstat,
           "ismeretlen_funkcio": dict(ismeretlen_kat),
           "lepcso": [{"pts": s["pts"], "meret": [round(s["w"], 2), round(s["h"], 2)], "forras": s["forras"],
                       "elem": int(s["elem"])} for s in stairs],
           "lift": [{"pts": s["pts"], "meret": [round(s["w"], 2), round(s["h"], 2)], "forras": s["forras"],
                     "elem": int(s["elem"])} for s in lifts],
           "mag_eldobva": eldobott}
    if jelentes:
        json.dump(rep, io.open(jelentes, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"{kod}: {len(rooms)} helyiség, {len(levels)} szint, keret {W}×{H} m, rács {GW}×{GH}, maszk={mod}")
    for L in levels:
        st = maszkstat[L["level"]]
        n = sum(1 for r in rooms if r["level"] == L["level"])
        print(f"  szint {L['level']:>3} {L['short']:<3} {L['name']:<12} "
              f"helyiség {n:3d}  maszk {st['cella']:5d} cella = {st['m2']:7.1f} m² "
              f"(közlekedő {st['kozlekedo_m2']:7.1f} m²)")
    print(f"  lépcső: {len(stairs)}  lift: {len(lifts)}  eldobott mag: {len(eldobott)}")
    for i, s in enumerate(stairs):
        print(f"    lépcső {i}: {len(s['pts'])} szint "
              f"({min(p[0] for p in s['pts'])}…{max(p[0] for p in s['pts'])}), "
              f"{s['w']:.1f}×{s['h']:.1f} m, {s['pts'][0][3]}")
    for i, s in enumerate(lifts):
        print(f"    lift {i+1}: {len(s['pts'])} szint "
              f"({min(p[0] for p in s['pts'])}…{max(p[0] for p in s['pts'])}), "
              f"{s['w']:.1f}×{s['h']:.1f} m, {s['pts'][0][3]}")
    if ismeretlen_kat:
        print(f"  !! a CATS-ban nem szereplő funkció: {dict(ismeretlen_kat)}")


if __name__ == "__main__":
    av = sys.argv[1:]
    kw = {}
    for f in ("--kod", "--nev", "--cim", "--jelentes", "--maszk", "--tag"):
        if f in av:
            i = av.index(f); kw["maszk_mod" if f == "--maszk" else f[2:]] = av[i + 1]; del av[i:i + 2]
    if len(av) != 3 or "kod" not in kw:
        sys.exit(__doc__)
    main(*av, **kw)

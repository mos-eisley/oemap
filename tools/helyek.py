#!/usr/bin/env python3
"""Az épületek földrajzi helye és a választó térképei: data/helyek.json.

    python3 tools/helyek.py data/epuletek.json forras/kivonat/helyszinrajz.json \
            data/helyek.json [--cache <könyvtár>]

Az épületválasztó Magyarország térképéről indul, onnan a településre, ott az
épületre; a „Hol vagyok?” gomb a GPS-helyhez legközelebbi épületet ajánlja.
Mindkettőhöz valódi hely kell, ezt adja ez a fájl. Forrásai:

- **OpenStreetMap, a Nominatimon át** (ODbL: az appban ki kell írni, hogy
  „© OpenStreetMap-közreműködők”). Az egyetem épületeinek nagy része név
  szerint fel van véve (pl. „Óbudai Egyetem NIK (BA épület)” — az OSM a
  Neptun-kódot használja, az OA ott BA). Melyik OSM-objektum melyik épület, azt
  a lenti `OSM` tábla rögzíti: a cím szerinti keresés találataiból, kézzel
  választva, mert egy címen több objektum is áll (épület, büfé, lift,
  telephely). A futás minden választott objektumnál ellenőrzi, hogy a címe
  egyezik-e a nyilvántartáséval.
- **A Tervtár helyszínrajzai** (belső anyag, a `forras/kivonat/helyszinrajz.json`
  kivonata): ahol egy telken több épület áll egy címen (Népszínház u. 8,
  Tavaszmező u. 17, Budai út 45), az OSM nem mondja meg, melyik melyik. A
  helyszínrajzok északra tájoltak és méterben vannak — az Óbudai campuson a
  négy OSM-épülethez illesztve 2–5°-os elforgatás és 0,99–1,02-es lépték jön
  ki, 2–7 m maradékkal —, így a lapon mért eltolással a többi épület is a
  helyére kerül. A kimenetbe csak a kiszámolt földrajzi pont kerül, a lap
  adata nem.

A térképek határa és a Duna is OSM (Nominatim, egyszerűsítve); a
koordináták fokban, öt tizedesre kerekítve (~1 m).
"""
import argparse, json, math, os, sys, time, urllib.error, urllib.parse, urllib.request

UA = "oemap-teremkereso/1.0 (https://github.com/mos-eisley/oemap)"

# Épületkód → OSM-objektum. A megjegyzés a Nominatim-találat neve, amiből
# választottunk; ahol csak címpont van, ott az áll.
OSM = {
    "OA": "W159710379",  # Óbudai Egyetem NIK (BA épület), Bécsi út 96/B
    "OC": "W118433139",  # Óbudai Egyetem KVK (BC épület), Bécsi út 94-96
    "OD": "W165208349",  # Óbudai Egyetem RKK (D épület), Doberdó út 6
    "KD": "W267493714",  # Kiss Árpád Kollégium, Doberdó út 6/A
    "KB": "W251721669",  # Kandó Kálmán Kollégium, Bécsi út 104-108
    "OM": "W310566178",  # név nélküli irodaépület, Bécsi út 122-124
    "KP": "W261301423",  # Óbudai Egyetem Bánki Donát Kollégium, Podmaniczky utca 8
    "TG": "W83276975",   # Óbudai Egyetem - Keleti Károly Gazdasági Kar, Tavaszmező utca 14-18
    "TB": "N9312119334", # Óbudai Egyetem TB épület, Tavaszmező utca 7-15
    "KT": "W246810593",  # Kukac kollégium, Tavaszmező utca 7-15
    "YA": "W707995136",  # Ybl A épület, Thököly út 74
    "YB": "W707995226",  # Ybl B épület, Thököly út 74
    "YC": "N5475637898", # címpont, Thököly út 67
    "BC": "W259687025",  # épület a címen, Csokonai utca 3
    "BD": "R3485531",    # épület a címen, Csokonai utca 6
    "FK": "W211951358",  # Óbudai Egyetem Alba Regia Műszaki Kar, Budai út 45 (lásd HELYSZINRAJZ_DONT)
    "FF": "W211951356",  # Óbudai Egyetem Alba Regia Műszaki Kar, Budai út 45
    "FG": "R4727380",    # Óbudai Egyetem Alba Regia Műszaki Kar Geoinformatikai Intézet, Pirosalma utca 1-3
    "KG": "W212754438",  # Óbudai Egyetem Lébényi Pál Kollégiuma, Gyümölcs utca 10
    "KH": "W216250219",  # Óbudai Egyetem Geo Kollégium, Hosszúsétatér utca 8
    "NA": "N5237896425", # címpont, Váci út 141
    "NB": "N5237896219", # címpont, Váci út 139
}
# A Budai út 45-ön két egyforma nevű OSM-épület áll. A helyszínrajzon az FK-tól
# az FF felé mutató vektor (-77,7; 35,3) m, a két OSM-épület súlypontja közt
# W211951358 → W211951356 (-76,8; 38,5) m: ez a párosítás 3,3 m-re egyezik, a
# fordított 171 m-re (a két épület 86 m-re áll egymástól). A futás ezt
# újraszámolja és kiírja, és leáll, ha a jó párosítás nincs 15 m-en belül,
# vagy a fordított is belül van.
HELYSZINRAJZ_DONT = [("h12", "FK", "FF")]

# Ugyanazon a telken, saját OSM-objektum nélkül: a hely a lapon mért eltolásból
# jön, a lap OSM-ben is meglévő épületeihez illesztett eltolással.
LAPROL = {
    "h09": ["BA", "BB", "BF"],        # Népszínház utca 8 — horgony: BC, BD
    "h06": ["TA", "TC", "TN", "TT"],  # Tavaszmező utca 15-17 — horgony: TG, TB, KT
}

# Az OB címe (Szőlő utca 2-4) az OSM-ben nincs meg. A szomszédos házszámok
# szerint (6-os: 47,53380; 19,03770, a 18-as 47,53500-nál, észak felé nő) az
# utca déli végén áll: ez becslés, és a kimenet így is jelöli.
BECSULT = {"OB": (47.53355, 19.03772)}

HATAR = {  # OSM-reláció, egyszerűsítési küszöb fokban; a név a nyilvántartás telephelyéé
    "orszag": ("R21335", 0.012, "Magyarország"),
    "bp": ("R1244004", 0.0006, "Budapest"),
    "fehervar": ("R1361450", 0.0006, "Székesfehérvár"),
    "nagymaros": ("R1440603", 0.0004, "Nagymaros"),
}
DUNA = {"orszag": ("R89652", 0.008), "telepules": ("R89652", 0.0006)}  # az országos nézethez durvább elég
SZIGET = {"bp": [("R11173422", 0.0002)]}  # Margit-sziget


class Nominatim:
    def __init__(self, cache):
        self.cache = cache
        if cache: os.makedirs(cache, exist_ok=True)

    def get(self, path, params):
        q = urllib.parse.urlencode(params)
        f = self.cache and os.path.join(self.cache, urllib.parse.quote(path + "?" + q, safe="")[:220] + ".json")
        if f and os.path.exists(f):
            with open(f, encoding="utf-8") as h: return json.load(h)
        req = urllib.request.Request("https://nominatim.openstreetmap.org/" + path + "?" + q, headers={"User-Agent": UA})
        for var in (5, 15, 45, 90, None):
            try:
                with urllib.request.urlopen(req, timeout=90) as r: d = json.load(r)
                break
            except urllib.error.HTTPError as e:
                # a Nominatim használati szabálya másodpercenként egy kérés; 429-re várunk
                if e.code not in (429, 502, 503, 504) or var is None: raise
                time.sleep(var)
        time.sleep(2.2)
        if f:
            with open(f, "w", encoding="utf-8") as h: json.dump(d, h, ensure_ascii=False)
        return d

    def lookup(self, ids, threshold=None):
        p = {"osm_ids": ",".join(ids), "format": "jsonv2", "polygon_geojson": 1, "addressdetails": 1}
        if threshold: p["polygon_threshold"] = threshold
        return {r["osm_type"][0].upper() + str(r["osm_id"]): r for r in self.get("lookup", p)}


def kerek(p): return [round(p[0], 5), round(p[1], 5)]


def atfed(a, b):
    """Két házszám (vagy tartomány: „7-15”, „96/B”) közös számot fed-e."""
    def tart(s):
        n = [int("".join(c for c in x if c.isdigit()) or 0) for x in s.split("-")[:2]]
        return n[0], n[-1]
    (a0, a1), (b0, b1) = tart(a), tart(b)
    return a0 <= b1 and b0 <= a1


def gyuruk(g):
    """A GeoJSON külső gyűrűi (a lyukak a választó térképén nem kellenek)."""
    if g["type"] == "Polygon": return [g["coordinates"][0]]
    if g["type"] == "MultiPolygon": return [p[0] for p in g["coordinates"]]
    return []


def vonalak(g):
    if g["type"] == "LineString": return [g["coordinates"]]
    if g["type"] == "MultiLineString": return g["coordinates"]
    return []


def kozep(g, lat, lon):
    """Sokszögnél a terület súlypontja, pontnál maga a pont."""
    r = gyuruk(g)
    if not r: return lat, lon
    gy = max(r, key=len); a = cx = cy = 0
    for (x1, y1), (x2, y2) in zip(gy, gy[1:] + gy[:1]):
        k = x1 * y2 - x2 * y1; a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k
    if abs(a) < 1e-14: return lat, lon
    return cy / (3 * a), cx / (3 * a)


def meter(lat, lon, lat0, lon0):
    return ((lon - lon0) * math.cos(math.radians(lat0)) * 111320, (lat - lat0) * 110540)


def fok(dx, dy, lat0, lon0):
    return lat0 + dy / 110540, lon0 + dx / (math.cos(math.radians(lat0)) * 111320)


def vag(vonal, bb):
    """A vonal bb-be eső darabjai (egy pont ráhagyással, hogy a szélen ne szakadjon)."""
    x0, y0, x1, y1 = bb; ki, cur = [], []
    benn = [x0 <= p[0] <= x1 and y0 <= p[1] <= y1 for p in vonal]
    for i, p in enumerate(vonal):
        if benn[i] or (i > 0 and benn[i - 1]) or (i + 1 < len(vonal) and benn[i + 1]): cur.append(kerek(p))
        elif cur: ki.append(cur); cur = []
    if cur: ki.append(cur)
    return [c for c in ki if len(c) > 1]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("epuletek"); ap.add_argument("helyszinrajz"); ap.add_argument("ki")
    ap.add_argument("--cache", help="a Nominatim-válaszok helyi tárolója (újrafuttatáshoz)")
    a = ap.parse_args()
    reg = json.load(open(a.epuletek, encoding="utf-8"))["epuletek"]
    lapok = {l["fajl"].split("_")[1]: l["epuletek"] for l in json.load(open(a.helyszinrajz, encoding="utf-8"))["lapok"]}
    nom = Nominatim(a.cache)
    hiba = []

    talalt = nom.lookup(OSM.values())
    hely = {}
    for kod, oid in OSM.items():
        r = talalt.get(oid)
        if not r: hiba.append(f"{kod}: {oid} nincs az OSM-ben"); continue
        # a cím ellenőrzése: az utca és a házszám eleje egyezzen a nyilvántartással
        cim = reg[kod]["cim"].split(", ")[-1]
        utca = cim.rsplit(" ", 1)[0].replace("Podmaniczky u", "Podmaniczky utca").replace("Hosszúséta tér", "Hosszúsétatér")
        adr = r.get("address", {})
        if not (adr.get("road", "").startswith(utca.split(" ")[0]) and atfed(adr.get("house_number", ""), cim.rsplit(" ", 1)[1])):
            hiba.append(f"{kod}: az OSM-cím ({adr.get('road')} {adr.get('house_number')}) nem a nyilvántartásé ({cim})")
        lat, lon = kozep(r["geojson"], float(r["lat"]), float(r["lon"]))
        kont = [[kerek(p) for p in g] for g in gyuruk(r["geojson"])]
        hely[kod] = {"lat": round(lat, 6), "lon": round(lon, 6), "pont": "osm", "osm": oid, "kontur": kont or None}

    # ellenőrzés: a helyszínrajz és az OSM ugyanazt az elrendezést mondja-e
    for lap, k1, k2 in HELYSZINRAJZ_DONT:
        L = lapok[lap]; sx, sy = L[k2]["x"] - L[k1]["x"], -(L[k2]["y"] - L[k1]["y"])
        gx, gy = meter(hely[k2]["lat"], hely[k2]["lon"], hely[k1]["lat"], hely[k1]["lon"])
        jo, rossz = math.hypot(sx - gx, sy - gy), math.hypot(sx + gx, sy + gy)
        print(f"{lap}: {k1}→{k2} lapon ({sx:.1f}; {sy:.1f}) m, OSM ({gx:.1f}; {gy:.1f}) m — eltérés {jo:.1f} m, fordítva {rossz:.1f} m")
        if not jo < 15 < rossz: hiba.append(f"{lap}: a {k1}/{k2} párosítás nem igazolható")

    for lap, kodok in LAPROL.items():
        L = lapok[lap]; horgony = [k for k in L if k in hely and k not in kodok]
        lat0, lon0 = hely[horgony[0]]["lat"], hely[horgony[0]]["lon"]
        # csak eltolás: a lap északra áll és méterben van (lásd fent), így a
        # forgatást és a léptéket nem illesztjük — két-három horgonyra az csak zajt illesztene
        ex = sum(meter(hely[k]["lat"], hely[k]["lon"], lat0, lon0)[0] - L[k]["x"] for k in horgony) / len(horgony)
        ey = sum(meter(hely[k]["lat"], hely[k]["lon"], lat0, lon0)[1] + L[k]["y"] for k in horgony) / len(horgony)
        mar = [math.hypot(meter(hely[k]["lat"], hely[k]["lon"], lat0, lon0)[0] - (L[k]["x"] + ex),
                          meter(hely[k]["lat"], hely[k]["lon"], lat0, lon0)[1] - (-L[k]["y"] + ey)) for k in horgony]
        print(f"{lap}: horgonyok {horgony}, maradék {[round(m, 1) for m in mar]} m")
        if max(mar) > 25: hiba.append(f"{lap}: a horgonyok nem illenek a laphoz ({max(mar):.0f} m)")
        for k in kodok:
            la, lo = fok(L[k]["x"] + ex, -L[k]["y"] + ey, lat0, lon0)
            hely[k] = {"lat": round(la, 6), "lon": round(lo, 6), "pont": "helyszinrajz", "osm": None, "kontur": None}

    for k, (la, lo) in BECSULT.items():
        hely[k] = {"lat": la, "lon": lo, "pont": "becsult", "osm": None, "kontur": None}

    # ellenőrzés: minden címmel rendelkező épületnek van helye. Hogy a hely a nyilvántartás
    # telephelyén (a település határán belül) áll-e, azt a tests/valaszto.js nézi.
    for k, e in reg.items():
        if e.get("cim") and k not in hely:
            # a Budai út 43 két egyforma nevű OSM-épületéről nem tudni, melyik az FC és melyik
            # az FS (helyszínrajz sincs róluk): a telek közepére kerülnek, közösen
            if k in ("FC", "FS"): continue
            hiba.append(f"{k}: nincs hely ({e['cim']})")
    fc = nom.lookup(["W211949583", "W211949578"])
    pts = [kozep(r["geojson"], float(r["lat"]), float(r["lon"])) for r in fc.values()]
    for k in ("FC", "FS"):
        hely[k] = {"lat": round(sum(p[0] for p in pts) / 2, 6), "lon": round(sum(p[1] for p in pts) / 2, 6),
                   "pont": "telek", "osm": None, "kontur": None}

    tel = {}
    for nev, (oid, th, nevhu) in HATAR.items():
        r = nom.lookup([oid], th)[oid]
        tel[nev] = {"nev": nevhu, "hatar": [[kerek(p) for p in g] for g in gyuruk(r["geojson"])]}
    for nev in tel:
        oid, th = DUNA["orszag" if nev == "orszag" else "telepules"]
        duna = nom.lookup([oid], th)[oid]
        gy = [p for g in tel[nev]["hatar"] for p in g]
        bb = (min(p[0] for p in gy), min(p[1] for p in gy), max(p[0] for p in gy), max(p[1] for p in gy))
        tel[nev]["duna"] = [d for v in vonalak(duna["geojson"]) for d in vag(v, bb)]
    for nev, lst in SZIGET.items():
        tel[nev]["sziget"] = [[kerek(p) for p in g] for oid, th in lst for g in gyuruk(nom.lookup([oid], th)[oid]["geojson"])]

    if hiba:
        print("\n".join("HIBA: " + h for h in hiba), file=sys.stderr); sys.exit(1)
    ki = {"generated": time.strftime("%Y-%m-%d"),
          "forras": "© OpenStreetMap-közreműködők (ODbL), Nominatim; a közös telken álló épületeknél az Egyetemi Tervtár helyszínrajzai",
          "epuletek": dict(sorted(hely.items())), "terkep": tel}
    with open(a.ki, "w", encoding="utf-8") as h: json.dump(ki, h, ensure_ascii=False, separators=(",", ":"))
    print(f"{a.ki}: {len(hely)} épület, {os.path.getsize(a.ki) / 1024:.1f} KB")
    for k, v in sorted(hely.items()): print(f"  {k} {v['pont']:12} {v['lat']:.6f},{v['lon']:.6f} {v['osm'] or ''}")
    for k, v in tel.items(): print(f"  {k} ({v['nev']}): határ {sum(len(g) for g in v['hatar'])} pont, Duna {sum(len(d) for d in v['duna'])} pont")


if __name__ == "__main__":
    main()

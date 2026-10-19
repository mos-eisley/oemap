#!/usr/bin/env python3
"""Egyetemi szintű helyiség- és ajtószám-leltár a Tervtár épületadat-tábláiból.

A `tervtar-ajtoszam.py` egyetlen épület (OA) ajtószámait adja az app NEPTUN
táblájához. Ez az eszköz ugyanazokból a táblákból az EGÉSZ egyetemet leltározza:
épület, szint, helyiség, alapterület, és ami a legfontosabb, a kari
nyilvántartás szerinti ajtószám — azzal együtt, hogy hol nincs meg.

A táblákról, mert egyik sem látszik első ránézésre:

- **Munkalap = szint**, de negyvenféle írásmóddal: `MENNYISÉGEK_1.EMELET`,
  `_1EMELET`, `_1 EMELET`, `_FOLDSZINT` ékezet nélkül, `_PINCE -1`,
  `_A3.C5.emelet`. Ezért a lap nevét MINDIG megtartjuk nyersen, a számot
  csak ott adjuk meg, ahol egyértelmű; a többi a jelentésbe kerül.
- **Az összesítő lapokon nincs helyiségsor**, viszont az OA összesítőjében az
  "ALAGSOR" szó beleillik egy lazább kódregexbe, és onnan egy nem létező "AL"
  épület született. Ezért a kód alakja szigorú: két betű, szint, betű, kettő.
- **A kari szám oszlopa vegyes.** Van benne igazi ajtószám (`F09`, `1.10`,
  `A5/B`, `P14/2`, `201-202`), de van `<Lakás neve>` sablonszöveg és
  helyiségnév is ("Nyomda", "EHÖK", "konditerem") — ami nem ajtószám, az nem
  mehet ajtószámként tovább, mert a térképen félrevezető feliratot adna.
- **Ugyanaz a kód kétszer is szerepel egy lapon** (15 helyen, a TA
  földszintjén ötször). Leltárban ezt jelenteni kell, nem összevonni: a
  dupla sor vagy elírás, vagy két külön helyiség azonos jellel.
- **A `HASZNÁLÓ` oszlop kimarad.** Most mindenhol üres, de ha egyszer
  személynév kerül bele, annak nincs helye egy továbbadott leltárban.
- Egy tábla (`...kh_gyumolcs_u_lebenyi_kollegium.xls`) az xlrd-t megakasztja
  a saját szövegtáblájával. Nem hal el tőle a futás: a fájl kimarad, és a
  jelentés végén ott áll. Excelből .xlsx-ként újramentve beolvasható.

**A leltár a nyilvántartáshoz hű, nem a Neptunhoz.** Az OA-ra ugyanaz a 112
pár jön ki, mint a `tervtar-ajtoszam.py`-ból (közlekedő és ütköző szám nélkül,
a térképen szereplő helyiségekre), egyetlen szándékos eltéréssel: az `OA10E36`
itt `1.17a`, ott `1.17`. A betű nélküli alak a Neptun alakja, és annak a
felülírása (`NEPTUN_ALAK`) oda tartozik, ahol a Neptun-adat is van — egy
leltárnak azt kell írnia, ami a nyilvántartásban áll.

Belső anyag. A repó privát, ezért a táblák a `forras/`-ban, a leltár a
`forras/kivonat/`-ban van — de a Pages site NEM privát, ezért a deploy a
`forras/`-t kidobja a publikált csomagból. A `data/` alá SEMMI nem kerülhet
belőlük közvetlenül: ami oda megy, az nyilvános URL-en letölthető.

Használat:  python3 tools/tervtar-leltar.py <leltar.json> <tabla.xls|xlsx> [...]
            (pip install xlrd openpyxl — a régi .xls és az új .xlsx miatt)
"""
import json, re, sys, os, datetime, collections

FEJ = "HELYISÉG SZÁMA KARI"
# a helyiség jele: két betű épület, két jegy szint (X = pince/alagsor),
# egy betű szintjelölés, két karakter sorszám — pl. OA00F01, TAX1P01, OA20EK2
KOD = re.compile(r"[A-Z]{2}[0-9X][0-9][A-Z][A-Z0-9]{2}")
# a folyosó száma nem teremszám (a tervtar-ajtoszam.py-ból, ott is így)
KOZLEKEDO = ("KÖZLEKED", "KÖZELEKD")
OSSZESITO = ("ÖSSZESÍTŐ", "ÖSSZES", "HELYISÉG")  # nincs bennük helyiségsor

# a lap nevéből a szint: a leggyakoribb alakok, ékezet és pont nélkül is
SZINT = [
    (r"ALAGSOR", -1), (r"PINCE\s*-?\s*2", -2), (r"PINCE\s*-?\s*1", -1), (r"PINCE", -1),
    (r"F[ÖO]LDSZINT", 0), (r"F[ÉE]LEMELET", 0.5),
    (r"(\d)\s*\.?\s*EMELET", None),            # a szám a találatból jön
    (r"^EMELET$", 1),
]


def szint_szama(lap):
    """A munkalap nevéből a szint száma, vagy None, ha nem egyértelmű."""
    n = re.sub(r"^MENNYIS[ÉE]GEK[_ ]*", "", lap.strip(), flags=re.I).upper()
    n = re.sub(r"\s+", " ", n).strip()
    for minta, ertek in SZINT:
        m = re.search(minta, n)
        if m:
            return int(m[1]) if ertek is None else ertek
    return None


def ajtoszam(k):
    """A kari szám ajtószám-alakja, vagy None, ha nem ajtószám."""
    k = k.strip()
    if not k or k.startswith("<"):            # `<Lakás neve>` sablonszöveg
        return None
    if re.fullmatch(r"F\d\d", k):             # OA földszint: F09
        return k
    if k.upper().startswith("AUDMAX"):
        return "Audmax"
    m = re.fullmatch(r"(\d)\.?(\d\d)\s*([a-zA-Z]?)", k)
    if m:                                     # OA/NIK alak: 1.10, 110, 117a
        return f"{m[1]}.{m[2]}{m[3].lower()}"
    m = re.fullmatch(r"([A-Z])\s*(\d{1,2})\s*(/\s*[A-Z0-9])?", k, re.I)
    if m:                                     # A5/B, U2, N6, P14/2, L10, P01
        return m[1].upper() + m[2] + (m[3].replace(" ", "").upper() if m[3] else "")
    if re.fullmatch(r"\d{3}\s*-\s*\d{3}", k):  # kollégiumi szobapár: 201-202
        return k.replace(" ", "")
    return None


def lapok(p):
    """(lapnév, sorok) a régi .xls és az új .xlsx tábláról egyaránt."""
    if p.lower().endswith("x"):
        import openpyxl
        wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
        try:
            for sh in wb.worksheets:
                yield sh.title, [["" if c is None else str(c).strip() for c in r]
                                 for r in sh.iter_rows(values_only=True)]
        finally:
            wb.close()
    else:
        import xlrd
        for sh in xlrd.open_workbook(p).sheets():
            yield sh.name, [[str(c.value).strip() for c in sh.row(r)] for r in range(sh.nrows)]


def szam(s):
    """Alapterület számként; a táblában van vessző és mértékegységsor is."""
    try:
        return round(float(str(s).replace(",", ".").split()[0]), 2)
    except (ValueError, IndexError):
        return None


def tabla(p, j):
    """Egy tábla helyiségsorai; j a jelentés (hibák, kimaradt sorok)."""
    ki = []
    for lap, sorok in lapok(p):
        if any(o in lap.upper() for o in OSSZESITO):
            continue
        fej = None
        for row in sorok:
            if fej is None:
                if any(x.startswith(FEJ) for x in row):
                    fej = {"kari": next(i for i, x in enumerate(row) if x.startswith(FEJ))}
                    for cim, kulcs in (("HELYISÉG SZÁMA EGYETEMI", "egyetemi"),
                                       ("HELYISÉG MEGNEVEZÉS", "nev"),
                                       ("FUNKCIÓ", "funkcio"),
                                       ("ALAPTERÜLET", "terulet")):
                        fej[kulcs] = next((i for i, x in enumerate(row)
                                           if x.upper().startswith(cim)), None)
                continue
            if not row or not KOD.fullmatch(row[0]):
                continue

            def cella(k):
                i = fej.get(k)
                v = row[i].strip() if i is not None and i < len(row) else ""
                # a kitöltetlen tábla sablonszövege (`<Hely>`, `<Lakás neve>`)
                # nem adat; az ajtoszam() külön is kiszűri, de a többi
                # oszlopban is csak zaj lenne
                return "" if v.startswith("<") and v.endswith(">") else v

            nyers = cella("kari")
            jo = ajtoszam(nyers)
            if nyers and not nyers.startswith("<") and jo is None:
                j["nem_ajtoszam"][f"{row[0]} ({nyers})"] += 1
            # a közlekedőn álló szám alakja jó, de nem ajtószám: a folyosóra
            # kiírva félrevezet, ezért a leltárban benne van, de jelezzük
            funkcio = cella("funkcio")
            if jo and any(f in funkcio.upper() for f in KOZLEKEDO):
                j["kozlekedon"][f"{row[0]} ({nyers}) {funkcio}"] += 1
            sz = szint_szama(lap)
            if sz is None:
                j["ismeretlen_szint"][lap] += 1
            ki.append({"kod": row[0], "epulet": row[0][:2], "lap": lap, "szint": sz,
                       "nev": cella("nev"), "funkcio": cella("funkcio"),
                       "terulet": szam(cella("terulet")),
                       "egyetemi": cella("egyetemi") or None,
                       "kari": jo, "kari_nyers": nyers or None})
        if fej is None and any(r and KOD.fullmatch(r[0]) for r in sorok):
            j["fejlec_nelkul"][f"{os.path.basename(p)} / {lap}"] += 1
    return ki


def main(kimenet, fajlok):
    j = {k: collections.Counter() for k in
         ("nem_ajtoszam", "ismeretlen_szint", "fejlec_nelkul", "olvashatatlan", "kozlekedon")}
    forras, helyisegek = [], []
    for p in fajlok:
        try:
            sorok = tabla(p, j)
        except Exception as e:
            j["olvashatatlan"][f"{os.path.basename(p)}: {type(e).__name__}"] += 1
            continue
        forras.append({"fajl": os.path.basename(p), "helyiseg": len(sorok),
                       "epuletek": sorted({s["epulet"] for s in sorok})})
        helyisegek += sorok

    epuletek = {}
    for s in sorted(helyisegek,
                    key=lambda s: (s["epulet"], s["szint"] is None, s["szint"] or 0, s["kod"])):
        e = epuletek.setdefault(s["epulet"], {"helyiseg": 0, "ajtoszam": 0,
                                              "terulet": 0.0, "szintek": {}, "helyisegek": []})
        e["helyiseg"] += 1
        e["ajtoszam"] += bool(s["kari"])
        e["terulet"] = round(e["terulet"] + (s["terulet"] or 0), 2)
        e["szintek"][s["lap"]] = e["szintek"].get(s["lap"], 0) + 1
        e["helyisegek"].append({k: v for k, v in s.items() if k != "epulet"})

    # ugyanaz a kód két sorban: elírás vagy két helyiség egy jellel — jelentjük
    dupla = {}
    for ep, e in epuletek.items():
        tobb = {k: n for k, n in collections.Counter(h["kod"] for h in e["helyisegek"]).items()
                if n > 1}
        if tobb:
            dupla[ep] = tobb
    # ugyanaz az ajtószám két helyiségen: a térképen félrevezető lenne
    utkozo = {}
    for ep, e in epuletek.items():
        tobb = {k: n for k, n in collections.Counter(h["kari"] for h in e["helyisegek"]
                                                     if h["kari"]).items() if n > 1}
        if tobb:
            utkozo[ep] = tobb

    ki = {"generated": datetime.date.today().isoformat(),
          "forras": forras,
          "osszes": {"epulet": len(epuletek), "helyiseg": len(helyisegek),
                     "ajtoszam": sum(e["ajtoszam"] for e in epuletek.values()),
                     "terulet": round(sum(e["terulet"] for e in epuletek.values()), 2)},
          "dupla_kod": dupla, "utkozo_ajtoszam": utkozo,
          "epuletek": epuletek}
    with open(kimenet, "w", encoding="utf-8") as f:
        json.dump(ki, f, ensure_ascii=False, indent=1)

    def p(*a):
        print(*a, file=sys.stderr)

    p(f"{len(forras)} tábla, {len(epuletek)} épület, {len(helyisegek)} helyiség, "
      f"{ki['osszes']['ajtoszam']} ajtószám, {ki['osszes']['terulet']:.0f} m2 -> {kimenet}")
    p("\népület  helyiség  ajtószám    terület   szint")
    for ep in sorted(epuletek):
        e = epuletek[ep]
        p(f"  {ep:4} {e['helyiseg']:8} {e['ajtoszam']:9} {e['terulet']:10.0f}   {len(e['szintek']):4}")
    for kulcs, cim in (("olvashatatlan", "olvashatatlan tábla"),
                       ("fejlec_nelkul", "lap fejléc nélkül, de van benne helyiség"),
                       ("ismeretlen_szint", "a lap nevéből nem jött ki a szint"),
                       ("kozlekedon", "a szám közlekedőn áll, a térképre nem írható ki")):
        if j[kulcs]:
            p(f"\n{cim} ({len(j[kulcs])}):")
            for k, n in j[kulcs].most_common():
                p(f"  {k}" + (f"  ({n} sor)" if n > 1 else ""))
    if dupla:
        p(f"\nugyanaz a kód több sorban ({sum(len(v) for v in dupla.values())}):")
        for ep, t in sorted(dupla.items()):
            p(f"  {ep}: " + ", ".join(f"{k} x{n}" for k, n in sorted(t.items())))
    if utkozo:
        p(f"\nugyanaz az ajtószám több helyiségen ({sum(len(v) for v in utkozo.values())}) "
          f"— ezeket a térképre így kiírni félrevezető:")
        for ep, t in sorted(utkozo.items()):
            p(f"  {ep}: " + ", ".join(f"{k} x{n}" for k, n in sorted(t.items())))
    if j["nem_ajtoszam"]:
        p(f"\na kari oszlopban nem ajtószám áll ({len(j['nem_ajtoszam'])} helyiségnél), "
          f"az első 25:")
        for k, _ in list(j["nem_ajtoszam"].most_common())[:25]:
            p(f"  {k}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])

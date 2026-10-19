#!/usr/bin/env python3
"""Épület-nyilvántartás: mi hol van az egyetemen, és mi van hozzá meg.

Az app eddig egy épületet ismert, és annak az azonosítója a beépített
`D.meta` (név, kar, cím). Ahhoz, hogy több épület legyen benne, kell egy
lista arról, hogy egyáltalán milyen épületek vannak, hol, és melyikhez
milyen forrásdokumentum áll rendelkezésre. Ez az eszköz azt állítja elő a
tervlapok fejbélyegzőjéből és a `tervtar-leltar.py` leltárából.

Amit a fejbélyegzőről tudni kell:

- **Két cím van minden tervlapon.** Az épület címe `Város, 1234, utca`
  alakú (`Budapest, 1034, Bécsi út 96/b`), a tervezőé viszont postai
  sorrendben, nagybetűs várossal (`1146 BUDAPEST Thököly út 74.`). Utóbbi
  az Ybl Tanácsadó Iroda bélyegzője, és MINDEN lapon ott van — stringre
  kiszűrni nem lehet, mert a Thököly úti campus épületei valóban ott
  vannak. A formátum viszont elválasztja a kettőt.
- **A lap címkéje és a helyiségkód nem mindig egyezik.** A
  `oe_fs_tervtari_alaprajz` fejbélyegzője „FA ÉPÜLET", a tábla kódjai
  viszont FS-ek. Nem választunk helyette: mindkettő bekerül, és az
  eltérés a jelentésbe.
- **Három fájlnév-család van**, és az épületkód nem mindig a második
  helyen áll: `oe-ba-bb-bf_…` (kötőjeles, több épület egy lapon),
  `oe_fc_…` (aláhúzós), és a kollégiumoké `oe_tervtar_kd_becsi_ut_…`,
  ahol a kód a harmadik. Egy lazább minta „TE" épületet olvasna ki a
  „tervtar" szóból.
- A telephely a cím városából és postai kódjából jön: a 1034-es Bécsi úti
  (Óbuda), a 1081/1084-es Tavaszmező–Népszínház (Józsefváros), a 1146-os
  Thököly úti campus, Székesfehérvár és Nagymaros külön telephely.

Belső anyag: a tervlapok a `forras/`-ban vannak, amit a deploy kidob a Pages-re
publikált csomagból. Ez a nyilvántartás viszont mehet a `data/` alá, mert csak
azt tartalmazza, ami egy épületről kívülről is tudható (név, cím, szintek és
helyiségek száma) — a helyiséglista nem.

A kimenet kettő:

- a teljes nyilvántartás (első argumentum) a belső munkához: benne van, melyik
  forrásfájlból jött mi, tehát a `forras/kivonat/`-ba való, nem a `data/`-ba;
- a `--app <út>` az appnak szánt, szűkített változat: csak az, ami egy
  épületről kívülről is tudható (kód, név, telephely, cím, szintek és
  helyiségek száma, terület), a belső fájlnevek nélkül. Ez mehet a `data/`-ba.

Használat:  python3 tools/tervlap-epuletek.py <epuletek.json> <leltar.json> <forrasfajl> [...]
            [--app data/epuletek.json]
"""
import json, re, sys, os, datetime, collections

# az épület címe a fejbélyegzőn: Város, 1234, utca — a tervezőé nem ilyen
CIM = re.compile(r"^([A-ZÁÉÍÓÖŐÚÜŰ][\wáéíóöőúüű]+),\s*(\d{4}),\s*(.+?)\.?$")
# a lap címkéje: „OA ÉPÜLET", „F-A-B ÉPÜLET", „TT-TN ÉPÜLET"
CIMKE = re.compile(r"\b([A-ZÁÉ]{1,2}(?:-[A-ZÁÉ]{1,2})*)\s+ÉPÜLET\b")
# leíró név, ami nem kód: „TANÜGYI ÉPÜLET", „SZÁLLÁS ÉPÜLET", „IRODAÉPÜLET"
LEIRO = re.compile(r"\b([A-ZÁÉÍÓÖŐÚÜŰ]{4,}(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ]+)?\s*ÉPÜLET|IRODAÉPÜLET)\b")

TIPUS = (("tervtari_alaprajz", "terv"), ("funkcio_alaprajz", "funk"),
         ("tervtar_epuletadatok", "xls"), ("helyszinrajz", "hely"))


def tipus(n):
    for kulcs, rov in TIPUS:
        if kulcs in n:
            return rov
    return "xls" if ("kollegium" in n and "tervtar" in n) else None


def epuletek_a_nevbol(n):
    """A fájlnévben szereplő épületkódok, mindhárom névcsaládra."""
    t = re.sub(r"^oe[-_]", "", n)
    t = re.sub(r"^h\d\d[-_]", "", t)
    m = re.match(r"tervtar[-_]([a-z]{2})[-_].*kollegium", t)
    if m:
        return [m[1].upper()]
    m = re.match(r"((?:[a-z]{2})(?:[-_][a-z]{2})*)[-_](?:tervtar|funkcio|helyszinrajz)", t)
    return [e.upper() for e in re.split(r"[-_]", m[1])] if m else []


def fejbelyegzo(p):
    """(cím, címke, leíró nevek, oldalszám) a tervlap első két oldaláról."""
    import pymupdf
    d = pymupdf.open(p)
    try:
        szoveg = "\n".join(d[i].get_text() for i in range(min(2, d.page_count)))
        oldal = d.page_count
    finally:
        d.close()
    cim = cimke = None
    leirok = []
    for s in szoveg.splitlines():
        s = re.sub(r"\s+", " ", s).strip()
        if not s:
            continue
        m = CIM.match(s)
        if m and cim is None:
            cim = {"telepules": m[1], "psz": m[2], "utca": m[3],
                   "cim": f"{m[1]}, {m[2]}, {m[3]}"}
        m = CIMKE.search(s)
        if m and cimke is None:
            cimke = m[1]
        for m in LEIRO.finditer(s):
            nev = m[1].strip()
            if not CIMKE.fullmatch(nev) and nev not in leirok:
                leirok.append(nev)
    return cim, cimke, leirok[:3], oldal


#: az index.html-be beégetett épület: ennek az adata hálózat nélkül is megvan
BEEGETVE = {"OA"}


def app_valtozat(out, app_ut):
    """Az appnak szánt, szűkített nyilvántartás: belső fájlnév nélkül.

    A `navigalhato` azt jelenti, hogy az app ADATA kész az épületről — nem azt,
    hogy van tervlap. A kettőt a felületen sem szabad összemosni: tervlapja 32
    épületnek van, megnyitni egyelőre egyet lehet. Egy épület akkor
    navigálható, ha vagy beégetve van (OA), vagy ott a `data/epuletek/<kód>.json`
    — így az új épület bekapcsolásához elég a fájlját letenni és ezt újrafuttatni,
    nem kell itt listát szerkeszteni.
    """
    mappa = os.path.join(os.path.dirname(os.path.abspath(app_ut)), "epuletek")
    ki = {}
    for kod, e in out["epuletek"].items():
        van = kod in BEEGETVE or os.path.exists(os.path.join(mappa, kod.lower() + ".json"))
        ki[kod] = {"kod": kod, "nev": e["nev"], "telephely": e["telephely"],
                   "cim": e["cim"], "szint": e["szint"], "helyiseg": e["helyiseg"],
                   "terulet": e["terulet"], "ajtoszam": e["ajtoszam"],
                   "terv": bool(e["dokumentum"]["terv"]),
                   "navigalhato": van}
    return {"generated": out["generated"], "osszes": out["osszes"],
            "telephelyek": out["telephelyek"], "epuletek": ki}


def main(kimenet, leltar_ut, fajlok, app_ut=None):
    L = json.load(open(leltar_ut, encoding="utf-8"))
    jelentes = collections.defaultdict(list)

    # 1) dokumentum-lefedettség és a tervlapok útja a fájlnevekből
    dok = collections.defaultdict(dict)
    for p in fajlok:
        n = os.path.basename(p).lower()
        t = tipus(n)
        eps = epuletek_a_nevbol(n)
        if not t or not eps:
            jelentes["nem_sorolhato"].append(os.path.basename(p))
            continue
        for ep in eps:
            dok[ep][t] = os.path.basename(p)

    # 2) a tervtári alaprajzok fejbélyegzője: név és cím
    fej = {}
    for p in fajlok:
        n = os.path.basename(p).lower()
        if tipus(n) != "terv" or not n.endswith(".pdf"):
            continue
        try:
            cim, cimke, leirok, oldal = fejbelyegzo(p)
        except Exception as e:
            jelentes["olvashatatlan"].append(f"{os.path.basename(p)}: {type(e).__name__}")
            continue
        for ep in epuletek_a_nevbol(n):
            fej[ep] = {"cim": cim, "cimke": cimke, "leirok": leirok,
                       "tervlap_oldal": oldal, "tervlap": os.path.basename(p)}

    # 3) összerakás: minden épület, ami bárhol előfordul
    minden = sorted(set(dok) | set(L["epuletek"]) | set(fej))
    ki = {}
    for ep in minden:
        f = fej.get(ep, {})
        lelt = L["epuletek"].get(ep)
        cim = f.get("cim") or {}
        ki[ep] = {
            "kod": ep,
            "nev": f"{ep} épület",
            "tervlap_cimke": f.get("cimke"),
            "leiro_nev": f.get("leirok") or None,
            "telephely": (f"{cim.get('telepules')} {cim.get('psz')}"
                          if cim.get("telepules") else None),
            "cim": cim.get("cim"),
            "helyiseg": lelt["helyiseg"] if lelt else 0,
            "szint": len(lelt["szintek"]) if lelt else 0,
            "terulet": lelt["terulet"] if lelt else 0,
            "ajtoszam": lelt["ajtoszam"] if lelt else 0,
            "dokumentum": {r: dok[ep].get(r) for _, r in TIPUS},
            "tervlap_oldal": f.get("tervlap_oldal"),
        }
        # amit ki kell mondani, nem eldönteni
        if f.get("cimke") and f["cimke"] != ep and ep not in f["cimke"].split("-"):
            jelentes["cimke_nem_egyezik"].append(
                f"{ep}: a tervlap „{f['cimke']} ÉPÜLET”-et mond ({f.get('tervlap')})")
        if not cim:
            jelentes["nincs_cim"].append(ep)
        if lelt and not dok[ep].get("terv"):
            jelentes["leltarban_van_tervlap_nincs"].append(ep)
        if dok[ep].get("terv") and not lelt:
            jelentes["tervlap_van_leltarban_nincs"].append(ep)

    telephelyek = collections.Counter(e["telephely"] for e in ki.values())
    out = {"generated": datetime.date.today().isoformat(),
           "osszes": {"epulet": len(ki),
                      "helyiseg": sum(e["helyiseg"] for e in ki.values()),
                      "terulet": round(sum(e["terulet"] for e in ki.values()), 2),
                      "navigalhato": sum(1 for e in ki.values()
                                         if e["dokumentum"]["terv"] and e["helyiseg"])},
           "telephelyek": {k: v for k, v in telephelyek.most_common() if k},
           "epuletek": ki}
    with open(kimenet, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    if app_ut:
        with open(app_ut, "w", encoding="utf-8") as fh:
            json.dump(app_valtozat(out, app_ut), fh, ensure_ascii=False, indent=1)

    def p(*a):
        print(*a, file=sys.stderr)

    p(f"{len(ki)} épület, {out['osszes']['helyiseg']} helyiség, "
      f"{out['osszes']['terulet']:.0f} m2, ebből tervlappal és leltárral: "
      f"{out['osszes']['navigalhato']} -> {kimenet}")
    p("\nkód  telephely                helyiség  szint  ajtószám  terv funk xls hely")
    for ep, e in ki.items():
        d = e["dokumentum"]
        jel = lambda r: " ok " if d[r] else "  . "
        p(f"{ep:4} {(e['telephely'] or '—'):24} {e['helyiseg']:8} {e['szint']:6} "
          f"{e['ajtoszam']:9}  {jel('terv')}{jel('funk')}{jel('xls')}{jel('hely')}")
    p("\ntelephelyek: " + ", ".join(f"{k} ({v})" for k, v in out["telephelyek"].items()))
    for kulcs, cim in (("cimke_nem_egyezik", "a tervlap címkéje más, mint a helyiségkód"),
                       ("nincs_cim", "a fejbélyegzőn nincs épületcím"),
                       ("leltarban_van_tervlap_nincs", "van leltára, de tervlapja nincs"),
                       ("tervlap_van_leltarban_nincs", "van tervlapja, de leltára nincs"),
                       ("olvashatatlan", "olvashatatlan tervlap"),
                       ("nem_sorolhato", "nem sorolható be fájl")):
        if jelentes[kulcs]:
            p(f"\n{cim} ({len(jelentes[kulcs])}):")
            for s in jelentes[kulcs]:
                p(f"  {s}")


if __name__ == "__main__":
    arg = sys.argv[1:]
    app = None
    if "--app" in arg:
        i = arg.index("--app")
        if i + 1 >= len(arg):
            sys.exit(__doc__)
        app = arg[i + 1]
        arg = arg[:i] + arg[i + 2:]
    if len(arg) < 3:
        sys.exit(__doc__)
    main(arg[0], arg[1], arg[2:], app)

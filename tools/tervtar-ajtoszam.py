#!/usr/bin/env python3
"""Az ajtón álló teremszámok (F09, 1.10, Audmax) a Tervtár épületadataiból.

Az Egyetemi Tervtár épületadat-táblája (oe-oa_tervtar_epuletadatok_*.xls)
szintenként egy munkalap; a „HELYISÉG SZÁMA KARI NYILVÁNT." oszlop a kari
nyilvántartás szerinti számot adja, ami az ajtón és a Neptunban is áll. A
kimenet az index.html NEPTUN táblája, csak a térképen szereplő helyiségekkel.

Amit a tábláról tudni kell:

- A szám alakja vegyes: „F08", „110", „2.10", „216 A", „AUDMAX 1.32". A
  térkép a Neptun alakját írja ki (1.10), ezért egységesítjük.
- Van benne ellentmondás: ugyanaz a szám két helyiségen („216 A", „15",
  „10"), és szám, ami nem terem száma („00", folyosón „2.61"). Ezek
  kimaradnak, és a kimenet végén felsoroljuk őket — nem írhatunk ki olyan
  számot, ami két ajtón is állhat.
- Belső anyag (a Tervtár a vezetői körnek szól): a táblát ne tedd a repóba,
  csak a belőle készült NEPTUN táblát.

Használat:  python3 tools/tervtar-ajtoszam.py <épületadatok.xls> index.html
            (pip install xlrd — a régi .xls formátumhoz kell)
"""
import json, re, sys, collections
import xlrd

FEJ = "HELYISÉG SZÁMA KARI"
# a folyosó száma nem teremszám: egy „2.61" felirat a folyosón félrevezetne
KOZLEKEDO = ("KÖZLEKED", "KÖZELEKD")
# A nyilvántartás betűs alszáma, ahol a Neptunban csak a szám áll: a „117a"
# (OA10E36, SCIENCE LABOR) az egyetlen 117-es terem, a Neptunban pedig
# egyetlen BA.1.17 van. Az ajtón ellenőrizendő.
NEPTUN_ALAK = {"1.17a": "1.17"}


def egyseges(k):
    """A kari szám Neptun-alakja, vagy None, ha nem teremszám."""
    k = k.strip()
    if re.fullmatch(r"F\d\d", k):
        return k
    if k.upper().startswith("AUDMAX"):
        return "Audmax"
    m = re.fullmatch(r"(\d)\.?(\d\d)\s*([a-zA-Z]?)", k)
    if m:
        return f"{m[1]}.{m[2]}{m[3].lower()}"
    return None


def sorok(xls):
    for sh in xlrd.open_workbook(xls).sheets():
        fej = None
        for r in range(sh.nrows):
            row = [str(c.value).strip() for c in sh.row(r)]
            if fej is None:
                if any(x.startswith(FEJ) for x in row):
                    fej = row
                    kod, kari = 0, next(i for i, x in enumerate(row) if x.startswith(FEJ))
                    fun = next((i for i, x in enumerate(row) if x.startswith("FUNKCI")), None)
                continue
            if re.fullmatch(r"OA[A-Z0-9]{5}", row[kod]):
                yield row[kod], row[kari], row[fun] if fun is not None else ""


def main(xls, html):
    src = open(html, encoding="utf-8").read()
    terkep = set(re.findall(r'"code":"(OA[A-Z0-9]{5})"', src))
    jo, kimaradt, hianyzik = {}, [], []
    for kod, kari, fun in sorok(xls):
        if not kari or kari.startswith("<"):
            continue
        n = egyseges(kari)
        if n is None or any(f in fun.upper() for f in KOZLEKEDO):
            kimaradt.append(f"{kod} „{kari}” ({fun or '?'})")
            continue
        jo[kod] = NEPTUN_ALAK.get(n, n)
    # ugyanaz a szám két helyiségen: egyik sem kerül ki
    tobb = {n for n, db in collections.Counter(jo.values()).items() if db > 1}
    for kod in sorted(k for k, n in jo.items() if n in tobb):
        kimaradt.append(f"{kod} „{jo.pop(kod)}” (több helyiségen is)")
    for kod in sorted(jo):
        if kod not in terkep:
            hianyzik.append(f"{kod} {jo[kod]}")
    tabla = sorted((k, n) for k, n in jo.items() if k in terkep)
    sorokba = collections.defaultdict(list)
    for k, n in tabla:
        sorokba[k[:4]].append(f'{k}:"{n}"')
    out = []
    for elemek in sorokba.values():
        line = "  "
        for e in elemek:
            if len(line) + len(e) + 2 > 100:
                out.append(line.rstrip())
                line = "  "
            line += e + ", "
        out.append(line.rstrip())
    print("const NEPTUN={\n" + "\n".join(out).rstrip(",") + "};")
    print(f"\n// {len(tabla)} pár a térképen szereplő helyiségekre", file=sys.stderr)
    print("// kimaradt, mert ellentmondásos:\n//   " + "\n//   ".join(kimaradt), file=sys.stderr)
    print("// a nyilvántartásban van, a térképen nincs:\n//   " + ", ".join(hianyzik), file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

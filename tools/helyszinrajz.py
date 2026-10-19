#!/usr/bin/env python3
"""Melyik épület hol áll a telephelyen — a Tervtár helyszínrajzaiból.

Az épület-nyilvántartás eddig csak postai címet tudott (`tervlap-epuletek.py`),
koordinátát nem. Emiatt arra, hogy „melyik épület merre van”, semmilyen adat
nem volt: a Bécsi úti campus hét épületéről csak annyi látszott, hogy mind a
„Budapest 1034” telephelyen van. Ez az eszköz a helyszínrajzok feliratainak
helyéből adja meg az épületek egymáshoz viszonyított helyzetét, méterben.

Amit a lapokról tudni kell:

- **Nem a körvonalat nyerjük ki, hanem a felirat helyét.** Egy lapon 170–230
  ezer vektorelem van (szintvonalak, növényzet, szomszédos házak, közmű), és
  abból kiválasztani az épület körvonalát ugyanakkora munka, mint egy alaprajz
  feldolgozása. A felirat helye viszont egyértelmű, és a „hol van” kérdésre
  elég. A kimenet ezért PONT, nem sokszög — aki körvonalat vár tőle, téved.
- **A feliratot szavanként kell illeszteni.** A `search_for("OC ÉPÜLET")`
  beletalál a lap „OA ÉS OC ÉPÜLETEK” című feliratába is, és onnan a
  fejbélyegző sarkából adna koordinátát. Ezért a kódszó után pontosan
  „ÉPÜLET” állhat, „ÉPÜLETEK” nem.
- **A méretarány a lapon ki van írva** (mind 1:200), és a tervlapoknál ez a
  kiírt érték mérésre is pontosnak bizonyult. Ellenőrzésnek ott a lapon
  szereplő méretszövegek nagyságrendje, és hogy a szomszédos épületek
  távolsága hihető-e: az OA és az OC felirata 48 m-re van egymástól.
- **Két lap kétszer szerepel** (`_1` végződéssel), bájtra azonos tartalommal.
  Ilyenkor az első marad, a másik a jelentésbe kerül.
- A koordináta a lap bal felső sarkától mért méter, és CSAK egy lapon belül
  összehasonlítható: a lapok közt nincs közös origó. Két telephely egymáshoz
  képesti helyzetét ebből nem lehet megmondani.

Belső anyag: a helyszínrajzok a `forras/`-ban vannak, amit a deploy kidob a
Pages-re publikált csomagból.

Használat:  python3 tools/helyszinrajz.py <kimenet.json> <helyszinrajz.pdf> [...]
            (pip install pymupdf)
"""
import json, re, sys, os, datetime, collections, hashlib

KOD = re.compile(r"^[A-ZÁÉ]{2}$")
ARANY = re.compile(r"1\s*:\s*(\d{2,5})")


def feliratok(pg):
    """(kód, x, y) minden „XX ÉPÜLET” feliratra, a lap pontjaiban."""
    szavak = pg.get_text("words")          # x0, y0, x1, y1, szó, blokk, sor, szó#
    ki = []
    for i, w in enumerate(szavak[:-1]):
        kod = w[4].strip().upper().rstrip(".")
        if not KOD.fullmatch(kod):
            continue
        kov = szavak[i + 1][4].strip().upper()
        # „ÉPÜLETEK” a lap címe („OA ÉS OC ÉPÜLETEK”), nem egy épület jelölése
        if kov != "ÉPÜLET":
            continue
        ki.append((kod, (w[0] + szavak[i + 1][2]) / 2, (w[1] + w[3]) / 2))
    return ki


def lap(p, j):
    import pymupdf
    d = pymupdf.open(p)
    try:
        pg = d[0]
        szoveg = pg.get_text()
        m = ARANY.search(szoveg)
        if not m:
            j["nincs_meretarany"].append(os.path.basename(p))
            return None
        arany = int(m[1])
        # pont -> mm -> méter a terepen
        mpp = 25.4 / 72 / 1000 * arany
        tal = feliratok(pg)
        if not tal:
            j["nincs_felirat"].append(os.path.basename(p))
            return None
        eps = {}
        for kod, x, y in tal:
            # ugyanaz a kód többször: a lap közepéhez közelebbi marad, a
            # fejbélyegzőben álló ismétlés a szélen van
            d2 = (x - pg.rect.width / 2) ** 2 + (y - pg.rect.height / 2) ** 2
            if kod not in eps or d2 < eps[kod]["_d"]:
                eps[kod] = {"x": round(x * mpp, 1), "y": round(y * mpp, 1), "_d": d2}
        for e in eps.values():
            e.pop("_d")
        return {"fajl": os.path.basename(p), "meretarany": arany,
                "lap_mm": [round(pg.rect.width / 72 * 25.4), round(pg.rect.height / 72 * 25.4)],
                "fed_m": [round(pg.rect.width * mpp, 1), round(pg.rect.height * mpp, 1)],
                "epuletek": eps}
    finally:
        d.close()


def main(kimenet, fajlok):
    j = collections.defaultdict(list)
    latott, lapok = {}, []
    for p in sorted(fajlok):
        # a `_1` végű ismétlések bájtra azonosak; egyszer dolgozzuk fel
        h = hashlib.md5(open(p, "rb").read()).hexdigest()
        if h in latott:
            j["ismetlodo_lap"].append(f"{os.path.basename(p)} = {latott[h]}")
            continue
        latott[h] = os.path.basename(p)
        try:
            r = lap(p, j)
        except Exception as e:
            j["olvashatatlan"].append(f"{os.path.basename(p)}: {type(e).__name__}")
            continue
        if r:
            lapok.append(r)

    hol = {}
    for L in lapok:
        for kod, e in L["epuletek"].items():
            hol.setdefault(kod, {"lap": L["fajl"], "x_m": e["x"], "y_m": e["y"]})

    ki = {"generated": datetime.date.today().isoformat(),
          "megjegyzes": ("A koordináta a lap bal felső sarkától mért méter, és csak "
                         "egy lapon belül összehasonlítható. A pont a felirat helye, "
                         "nem az épület körvonala."),
          "lapok": lapok, "epuletek": hol}
    with open(kimenet, "w", encoding="utf-8") as f:
        json.dump(ki, f, ensure_ascii=False, indent=1)

    def p(*a):
        print(*a, file=sys.stderr)

    p(f"{len(lapok)} lap, {len(hol)} épület helye -> {kimenet}")
    for L in lapok:
        p(f"\n  {L['fajl'][:46]:46} 1:{L['meretarany']}  "
          f"{L['lap_mm'][0]}x{L['lap_mm'][1]}mm = {L['fed_m'][0]:.0f}x{L['fed_m'][1]:.0f} m")
        for kod, e in sorted(L["epuletek"].items()):
            p(f"      {kod}  x={e['x']:7.1f} m  y={e['y']:7.1f} m")
    for kulcs, cim in (("ismetlodo_lap", "ismétlődő lap (azonos tartalom)"),
                       ("nincs_felirat", "nincs rajta „XX ÉPÜLET” felirat"),
                       ("nincs_meretarany", "nincs kiírt méretarány"),
                       ("olvashatatlan", "olvashatatlan")):
        if j[kulcs]:
            p(f"\n{cim} ({len(j[kulcs])}):")
            for s in j[kulcs]:
                p(f"  {s}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])

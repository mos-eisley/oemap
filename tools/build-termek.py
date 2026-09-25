#!/usr/bin/env python3
"""Egyesíti az ingatlan-nyilvántartást és a Neptun-órarendet az app számára.

Bemenet:  data/rooms.json      (tools/parse-rooms.py)
          <neptun>.json        (tools/parse-neptun.py)
Kimenet:  data/termek.json

A Neptun teremkódja és a nyilvántartás neve: BA.F.05 = F05, BA.1.13 =
LABOR 1.13, BA.1.32.Audmax = Audmax. A nyilvántartás az F03/F04/F07-et
egyetlen osztható teremként viszi — a felszereltséget mindháromra átvesszük.
Ahol nincs nyilvántartási tétel (F09, 1.17, 4.01), ott a férőhely üres marad.

Az órák heti ismétlődésként kerülnek be, nem napokra kibontva:
[nap (1=hétfő), tól, ig (perc), hetek bitmaszkja, fajta, tárgy sorszáma].
Az app a mai dátumból számolja, hányadik hét van — egy félév így ~20 KB,
és egyszer kell frissíteni, nem hetente. Az 1. hét hétfője nincs benne az
exportban: a régi teremfoglalási tábla szeptember 7-i hetének NIK-előadásaiból
73-ból 70 esik a Neptun szerinti 1. heti órákra, ez adta a 2026-09-07-et.

Használat: python3 tools/build-termek.py data/rooms.json /tmp/neptun.json data/termek.json \\
             --het1 2026-09-07 [--hetek 14] [--szunnap 2026-10-23,...]
"""
import json, re, sys, argparse, datetime, collections

# Ezekben más kar is tart órát: a régi teremfoglalási táblában (2026. szeptember
# eleje) az Audmax és az F-blokk foglalásainak ~30%-a KVK-s és RKK-s volt. Egy
# kar exportjából ezekre nem mondhatjuk, hogy szabadok, csak azt, hogy az adott
# kar órája nincs bennük — az app ott „Szabad?"-ot ír, nem „Szabad"-ot.
SHARED = re.compile(r"^BA\.(F\.\d+|1\.32\.Audmax)$")

# Neptun-teremkód -> tervlapi kód (az alaprajz helyisége). A két számozás
# független: a hivatalos F01 268 férőhelyes, a tervlapi OA00F01 95,7 m², az
# F05, F06, F08 tervlapi névrokona pedig raktár, mosdó, takarítókamra. Ezért
# NEM a névből számoljuk: csak az kerül ide, amit valaki, aki ismeri az
# épületet, megerősített (docs/NYITOTT-KERDESEK.md, 1.). Amelyik terem itt
# szerepel, annál az app a térképen kiválasztott terem adatlapján is mutatja
# a foglaltságot.
PLAN = {
}


def names(code):
    """BA.F.05 -> ('F05', 'F05'); BA.1.13 -> ('1.13', 'LABOR 1.13')"""
    rest = code[3:]
    if rest.lower().endswith(".audmax"):
        return "Audmax", "AUDMAX"
    fl, num = rest.split(".", 1)
    if fl == "F":
        return "F" + num, "F" + num
    return f"{fl}.{num}", f"LABOR {fl}.{num}"


def order(code):
    fl, num = code[3:].split(".")[:2]
    return (0 if fl == "F" else int(fl) + 1, int(num) if num.isdigit() else 99)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rooms"); ap.add_argument("neptun"); ap.add_argument("out")
    ap.add_argument("--het1", required=True, help="az 1. oktatási hét hétfője (ÉÉÉÉ-HH-NN)")
    ap.add_argument("--hetek", type=int, default=14, help="az oktatási hetek száma")
    ap.add_argument("--szunnap", default="", help="óraszünetes napok vesszővel (ünnepnap)")
    a = ap.parse_args()

    het1 = datetime.date.fromisoformat(a.het1)
    if het1.weekday() != 0:
        sys.exit(f"--het1 hétfő legyen, a {het1} {['hétfő','kedd','szerda','csütörtök','péntek','szombat','vasárnap'][het1.weekday()]}")
    szunnap = sorted(d.strip() for d in a.szunnap.split(",") if d.strip())
    for d in szunnap: datetime.date.fromisoformat(d)

    reg = json.load(open(a.rooms, encoding="utf-8"))
    nep = json.load(open(a.neptun, encoding="utf-8"))
    info = {}
    for r in reg:
        for part in [p.strip() for p in r["nev"].split(" - ")]:
            info[part.upper()] = r

    targyak, tidx = [], {}
    def tsz(name):
        if name not in tidx:
            tidx[name] = len(targyak); targyak.append(name)
        return tidx[name]

    by = collections.defaultdict(dict)
    late = 0
    for r in nep["rows"]:
        mask = 0
        for w in r["weeks"]:
            if 1 <= w <= a.hetek: mask |= 1 << (w - 1)
            else: late += 1
        if not mask: continue
        key = (r["day"], r["from"], r["to"], r["kind"], r["subject"])
        # ugyanaz az óra több kurzuskóddal (pl. páros és páratlan heti csoport)
        by[r["room"]][key] = by[r["room"]].get(key, 0) | mask

    rooms = []
    for code in sorted(by, key=order):
        short, regname = names(code)
        rr = info.get(regname.upper()) or {}
        slots = sorted([d, f, t, m, k, tsz(s)] for (d, f, t, k, s), m in by[code].items())
        room = {"nev": short, "neptun": code, "cim": rr.get("nev", short),
                "fero": rr.get("ferohely"), "felsz": rr.get("felszereltseg", []),
                "url": rr.get("url"), "kozos": bool(SHARED.match(code)), "slots": slots}
        if code in PLAN: room["code"] = PLAN[code]
        rooms.append(room)

    fv = nep["felev"]
    out = {"generated": datetime.date.today().isoformat(), "source": nep["source"],
           "felev": f"{fv[:4]}/{fv[4:6]}/{fv[6:]}", "kar": nep.get("kar", []),
           "het1": het1.isoformat(), "hetek": a.hetek, "szunnap": szunnap,
           "targyak": targyak, "rooms": rooms}
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    last = het1 + datetime.timedelta(days=7 * a.hetek - 1)
    print(f"{len(rooms)} terem, {sum(len(r['slots']) for r in rooms)} heti óra, {len(targyak)} tárgy, "
          f"{het1} .. {last} -> {a.out}")
    if late: print(f"figyelem: {late} hét a {a.hetek}. után kimaradt")
    for r in rooms:
        print(f"   {r['nev']:<7} {str(r['fero'] or '–'):>4} fő  {len(r['slots']):>3} óra  "
              f"{'közös' if r['kozos'] else '     '}  "
              f"{'nyilvántartásban' if r['url'] else 'NINCS a nyilvántartásban':<24} {r['cim']}")


if __name__ == "__main__":
    main()

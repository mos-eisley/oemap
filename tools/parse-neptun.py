#!/usr/bin/env python3
"""A Neptun kurzusórarend-exportjából (xlsx) az OA épület órái, egy félévre.

Az export soronként egy kurzus egy időpontja: tárgy, kurzuskód, nap, hetek,
termek, kezdés, vége. Három dolog, amit az exportról tudni kell:

- NEM csak a kért félévet tartalmazza, hanem a tárgyak összes korábbi
  félévét is (2007-ig vissza): a 2026/27/1-es fájl 24 214 sorából 931 az
  idei. Az azonosító közepe a félév (NIROR2SANB-2026271-OR2_EA). Szűrés nélkül
  húsz év órarendje kerül egymásra, és minden terem mindig foglaltnak látszik.
- Dátum nincs benne, csak a félév hetei (1–14); hogy az 1. hét mikor van,
  azt a build-termek.py kapja meg. Ünnepnap sincs benne.
- Csak az adott kar kurzusai vannak benne. Amit más kar tart ugyanabban a
  teremben, az nem látszik (lásd build-termek.py, SHARED).

Az oktató nevét szándékosan nem olvassuk be: személyes adat, és a
nyilvános appnak nincs rá szüksége.

Használat:  python3 tools/parse-neptun.py export.xlsx /tmp/neptun.json [félév]
            (a félév pl. 2026271; alapból a fájlnévből: ...2026-27-1...)
"""
import json, sys, re, collections
import openpyxl

DAYS = {"HÉTFŐ": 1, "KEDD": 2, "SZERDA": 3, "CSÜTÖRTÖK": 4, "PÉNTEK": 5, "SZOMBAT": 6, "VASÁRNAP": 7}
BUILDING = "BA."          # Bécsi út, A épület: az OA


def kind(code):
    """Az óra fajtája a kurzuskódból: ..._EA_..., ..._GY07, ..._LA_01 ..."""
    for tok in re.split(r"[_\s]+", code.upper()):
        if tok.startswith("EA"): return "eloadas"
        if tok.startswith("GY"): return "gyakorlat"
        if tok.startswith("LA"): return "labor"
    return "egyeb"


def minutes(hhmm):
    h, m = str(hhmm).strip().split(":")[:2]
    return int(h) * 60 + int(m)


def main(src, dst, felev=None):
    if not felev:
        m = re.search(r"(\d{4})-(\d{2})-(\d)", src.split("/")[-1])
        if m: felev = m.group(1) + m.group(2) + m.group(3)
    ws = openpyxl.load_workbook(src, read_only=True, data_only=True).worksheets[0]
    rows = ws.iter_rows(values_only=True)
    head = next(rows)
    col = {}
    for i, h in enumerate(head):
        col.setdefault(str(h).strip(), i)          # a kurzuskód kétszer szerepel
    need = ["Azonosító", "Kurzuskód", "Tárgynév", "A hét napja", "Hetek", "Termek", "Tól", "Ig"]
    miss = [n for n in need if n not in col]
    if miss: sys.exit(f"hiányzó oszlop: {', '.join(miss)} — az export fejléce: {head}")
    get = lambda r, n: r[col[n]]

    data = list(rows)
    sem = collections.Counter()
    for r in data:
        parts = str(get(r, "Azonosító") or "").split("-", 2)
        if len(parts) == 3: sem[parts[1]] += 1
    if not felev:
        felev = max(sem)
    if felev not in sem:
        sys.exit(f"a {felev} félév nincs az exportban; ezek vannak: {sorted(sem)[-6:]}")

    out, seen, skipped = [], set(), collections.Counter()
    for r in data:
        parts = str(get(r, "Azonosító") or "").split("-", 2)
        if len(parts) != 3 or parts[1] != felev:
            continue
        rooms = [q.strip() for q in re.split(r"[,;\n]", str(get(r, "Termek") or "")) if q.strip()]
        rooms = [q for q in rooms if q.startswith(BUILDING)]
        if not rooms:
            skipped["nem az OA-ban (vagy terem nélkül)"] += 1
            continue
        day = DAYS.get(str(get(r, "A hét napja") or "").strip().upper())
        weeks = sorted({int(w) for w in str(get(r, "Hetek") or "").split(",") if w.strip().isdigit()})
        if not day or not weeks:
            skipped["nap vagy hét nélkül"] += 1
            continue
        code = str(get(r, "Kurzuskód") or "").strip()
        base = {"day": day, "from": minutes(get(r, "Tól")), "to": minutes(get(r, "Ig")),
                "weeks": weeks, "kind": kind(code),
                "subject": re.sub(r"\s+", " ", str(get(r, "Tárgynév") or "")).strip(), "code": code}
        for room in rooms:
            key = (room, day, base["from"], base["to"], tuple(weeks), base["subject"], code)
            if key in seen:
                skipped["ismétlődő sor"] += 1
                continue
            seen.add(key)
            out.append({"room": room, **base})

    kar = re.findall(r"-([A-ZÁÉÍÓÖŐÚÜŰ]{2,5})-kurzus", src.split("/")[-1])
    data_out = {"source": src.split("/")[-1], "felev": felev, "kar": kar, "rows": out}
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(data_out, fh, ensure_ascii=False, separators=(",", ":"))
    per_room = collections.Counter(o["room"] for o in out)
    print(f"{felev}: {sem[felev]} sor a {sum(sem.values())}-ból (a többi korábbi félév), "
          f"{len(out)} OA-óra {len(per_room)} teremben -> {dst}")
    print("kihagyva:", dict(skipped))
    print("fajták:", dict(collections.Counter(o["kind"] for o in out)))
    print("termek:", ", ".join(f"{k} ({v})" for k, v in sorted(per_room.items())))


if __name__ == "__main__":
    main(*sys.argv[1:])

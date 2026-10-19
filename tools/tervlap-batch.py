#!/usr/bin/env python3
"""Az egész egyetem végigfuttatása a tervlap-láncon, épületenként.

A `tervlap-uj.py` egy épületet nyer ki egy tervlapból, az `epulet-json.py`
abból az app épületadatát. Ez a kettőt futtatja végig a `MUNKA` listán, és
összegyűjti a mércét épületenként: hány helyiség jött ki a tábla hányából,
a terület hány százaléka esik ±3%-on belül, mennyi az átfedés.

Amit a listáról tudni kell:

- **Egy tervlapon több épület is lehet**, és a helyiségkód prefixe választja
  szét őket (`oe_bf-ba-bb_…` → BF, BB, BA). Ilyenkor ugyanaz a PDF többször
  fut le, épületenként egyszer; a kivágás csak a saját prefixű pecsétekre
  megy, a többi helyiség helye nem foglalt — ez pontatlanabb volna, ha a
  szomszéd épület a lapon hozzáér, de a gyakorlatban külön tömbök.
- **A leltárt KÓD szerint kell párosítani, nem fájlnév szerint.** A KB
  táblájának a fájlneve `…_kd_becsi_ut_…`, a kódjai viszont KB-sek: fájlnév
  szerint a KB a KD tábláját kapná. Ezért megy mindkét eszköznek a közös
  `leltar.json`, és a prefix választ belőle.
- **Nem mind a 29 épület szerepel.** Amelyiknek nincs leltára (BC, KG, NA,
  NB), amelyikről csak helyszínrajz van (FA, FB, KM, SA, SB, SC), és az UV
  (van leltára, nincs tervlapja) kimarad.

A futás hosszú (4000+ helyiség kivágása), ezért épületenként külön
folyamatban megy, párhuzamosan; ami elszáll, az nem viszi el a többit.

Használat:
  python3 tools/tervlap-batch.py <kimeneti mappa> [--jobs 6] [--csak OC,FK]
"""
import sys, os, re, json, io, subprocess, concurrent.futures, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = os.path.join(ROOT, ".venv", "Scripts", "python.exe")
if not os.path.exists(PY):
    PY = sys.executable
FORRAS = os.path.join(ROOT, "forras")
LELTAR = os.path.join(FORRAS, "kivonat", "leltar.json")
EPULETEK = os.path.join(FORRAS, "kivonat", "epuletek.json")

# (tervlap, [épületkódok a lapon]) — a kódok sorrendje a helyiségszám szerint
MUNKA = [
    ("oe_bf-ba-bb_tervtari_alaprajzok_2026_0108.pdf", ["BF", "BB", "BA"]),
    ("oe_kt_tervtari_alaprajzok_2025_0708.pdf", ["KT"]),
    ("oe_kb_tervtari_alaprajzok_2025_0731.pdf", ["KB"]),
    ("oe_kd_tervtari_alaprajzok_2024_0110.pdf", ["KD"]),
    ("oe_kh_tervtari_alaprajzok_2024_0116.pdf", ["KH"]),
    ("oe-ta-tc_tervtari_alaprajzok_2026_0106.pdf", ["TA", "TC"]),
    ("oe-ya_tervtari_alaprajz_2026_0106.pdf", ["YA"]),
    ("oe_fg_tervtari_alaprajzok_2026_0205.pdf", ["FG"]),
    ("oe-oc_tervtari_alaprajz_2026_0109.pdf", ["OC"]),
    ("oe_kp_tervtari_alaprajzok_2025_0714.pdf", ["KP"]),
    ("oe-om_tervtari_alaprajzok_2026_0512.pdf", ["OM"]),
    ("oe_fs_tervtari_alaprajz_2026_0526.pdf", ["FS"]),
    ("oe-yb_tervtari_alaprajz_2026_0106.pdf", ["YB"]),
    ("oe-tb_tervtari_alaprajzok_2026_0106.pdf", ["TB"]),
    ("oe-tg_tervtari_alaprajzok_2026_0106.pdf", ["TG"]),
    ("oe-fk_tervtari_alaprajzok_2026_0202.pdf", ["FK"]),
    ("oe-ff_tervtari_alaprajzok_2026_0202.pdf", ["FF"]),
    ("oe-bd_tervtari_alaprajzok_2026_0108.pdf", ["BD"]),
    ("oe_yc_tervtari_alaprajzok_2026_0108.pdf", ["YC"]),
    ("oe_ob_tervtari_alaprajzok_2026_0109.pdf", ["OB"]),
    ("oe_fc_tervtari_alaprajzok_2026_0526.pdf", ["FC"]),
    ("oe-tt-tn_tervtari_alaprajz_2026_0106.pdf", ["TT", "TN"]),
]


def egy(pdf, kod, ki, nev, cim):
    """Egy épület: kinyerés + összeállítás. Visszaadja a mércét."""
    t0 = time.time()
    geo = os.path.join(ki, f"{kod}-geo.json")
    jel = os.path.join(ki, f"{kod}-kinyeres.json")
    out = os.path.join(ki, f"{kod}.json")
    ejel = os.path.join(ki, f"{kod}-epulet.json")
    log = os.path.join(ki, f"{kod}.log")
    r = {"kod": kod, "pdf": os.path.basename(pdf), "nev": nev}
    with io.open(log, "w", encoding="utf-8") as lf:
        p = subprocess.run([PY, "-I", "-X", "utf8", os.path.join(ROOT, "tools", "tervlap-uj.py"),
                            pdf, LELTAR, jel, "--pre", kod, "--geo", geo],
                           cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
        lf.write("=== tervlap-uj ===\n" + (p.stdout or "") + (p.stderr or ""))
        if p.returncode != 0 or not os.path.exists(geo):
            r["hiba"] = "kinyerés: " + (p.stderr or "")[-300:].strip()
            r["perc"] = round((time.time() - t0) / 60, 1)
            return r
        q = subprocess.run([PY, "-I", "-X", "utf8", os.path.join(ROOT, "tools", "epulet-json.py"),
                            geo, LELTAR, out, "--kod", kod, "--nev", nev, "--cim", cim,
                            "--jelentes", ejel],
                           cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
        lf.write("\n=== epulet-json ===\n" + (q.stdout or "") + (q.stderr or ""))
        if q.returncode != 0 or not os.path.exists(out):
            r["hiba"] = "összeállítás: " + (q.stderr or "")[-300:].strip()
            r["perc"] = round((time.time() - t0) / 60, 1)
            return r
    try:
        k = json.load(io.open(jel, encoding="utf-8"))
        hib = [x["hiba"] for e in k["szintek"] for x in e["helyisegek"] if x["hiba"] is not None]
        r.update({
            "lap": len(k["lapok"]), "leptek": k["leptek"]["mert_leptek"],
            "tabla": k["nyilvantartas_helyiseg"],
            "kell": sum(e["kell"] for e in k["szintek"]),
            "kivagva": sum(e["kivagva"] for e in k["szintek"]),
            "jo3": sum(1 for h in hib if h <= 0.03),
            "jo5": sum(1 for h in hib if h <= 0.05),
            "median_hiba": round(sorted(hib)[len(hib) // 2], 4) if hib else None,
            "atfedes": round(sum(e["atfedes_m2"] for e in k["szintek"]), 2),
        })
        e = json.load(io.open(ejel, encoding="utf-8"))
        r.update({"szint": len(e["szintek"]), "helyiseg": e["helyiseg"],
                  "lepcso": len(e["lepcso"]), "lift": len(e["lift"]),
                  "ismeretlen_funkcio": e.get("ismeretlen_funkcio") or {}})
        r["arany3"] = round(r["jo3"] / r["kell"], 3) if r.get("kell") else None
        r["fajl"] = out
    except Exception as ex:
        r["hiba"] = "jelentés: " + str(ex)[:200]
    r["perc"] = round((time.time() - t0) / 60, 1)
    return r


def main(ki, jobs=6, csak=None):
    os.makedirs(ki, exist_ok=True)
    EP = json.load(io.open(EPULETEK, encoding="utf-8"))["epuletek"]
    feladat = []
    for pdf, kodok in MUNKA:
        for kod in kodok:
            if csak and kod not in csak:
                continue
            e = EP.get(kod) or {}
            feladat.append((os.path.join(FORRAS, pdf), kod,
                            e.get("nev") or f"{kod} épület", e.get("cim") or ""))
    print(f"{len(feladat)} épület, {jobs} párhuzamos folyamat\n")
    out = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as ex:
        futs = {ex.submit(egy, p, k, ki, n, c): k for p, k, n, c in feladat}
        for f in concurrent.futures.as_completed(futs):
            r = f.result(); out.append(r)
            if "hiba" in r:
                print(f"  {r['kod']:<3} HIBA ({r['perc']} perc): {r['hiba'][:110]}")
            else:
                print(f"  {r['kod']:<3} {r['kivagva']:4d}/{r['tabla']:<4d} helyiség  "
                      f"±3% {r['arany3']:.0%}  medián {r['median_hiba']:.1%}  "
                      f"átfedés {r['atfedes']:7.2f} m²  {r['szint']} szint  "
                      f"lépcső {r['lepcso']}  ({r['perc']} perc)")
    out.sort(key=lambda r: r["kod"])
    json.dump(out, io.open(os.path.join(ki, "_osszegzes.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    jo = [r for r in out if "hiba" not in r]
    print(f"\nkész: {len(jo)}/{len(out)} épület, "
          f"{sum(r['kivagva'] for r in jo)} helyiség a tábla "
          f"{sum(r['tabla'] for r in jo)}-ából")


if __name__ == "__main__":
    av = sys.argv[1:]
    kw = {}
    for f in ("--jobs", "--csak"):
        if f in av:
            i = av.index(f); kw[f[2:]] = av[i + 1]; del av[i:i + 2]
    if len(av) != 1:
        sys.exit(__doc__)
    main(av[0], jobs=int(kw.get("jobs", 6)),
         csak=set(kw["csak"].split(",")) if kw.get("csak") else None)

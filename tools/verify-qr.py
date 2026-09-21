#!/usr/bin/env python3
"""Visszaolvassa a legenerált QR-ívet, és ellenőrzi, hogy a kódok tényleg azt
a linket viszik, amit a felirat ígér.

Ez nem elméleti óvatosság. A generátor kétszer is olyan ívet adott, ami
hibátlanul NÉZETT ki, de nem volt beolvasható:

  1. border=0 — hiányzott a szabvány szerinti csendzóna, és a legtöbb olvasó
     így nem ismeri fel a kódot;
  2. a viewBox az img.width-ből jött, ami a keret NÉLKÜLI modulszám, így a
     rajz széle levágódott;
  3. a path-illesztő regex az id="qr-path" attribútumra is ráfutott, és a
     rajz helyett a literál "qr-path" sztringet tette be — az ív üres volt.

Mindhármat csak az fogta meg, hogy egy tényleges olvasóval visszanéztük.
Nyomtatás előtt futtasd le.

Kell hozzá: pip install opencv-python-headless, és npm install (a rajzolást a
repó Node playwrightja végzi a tools/render-qr.js-en át).

Használat:
  python3 tools/make-qr.py https://mayydayy99.github.io/oemap/ /tmp/qr.html
  python3 tools/verify-qr.py /tmp/qr.html https://mayydayy99.github.io/oemap/
"""
import sys, re, json, glob, os, subprocess, tempfile, pathlib

HERE = pathlib.Path(__file__).resolve().parent


def render(sheet, outdir):
    """Minden QR-t külön képpé rajzol, ahogy egy telefon kamerája látná."""
    r = subprocess.run(["node", str(HERE / "render-qr.js"), sheet, outdir],
                       capture_output=True, text=True, cwd=HERE.parent)
    if r.returncode != 0:
        raise SystemExit("a rajzolás nem sikerult (npm install megvan?):\n" + r.stderr.strip())
    return int(r.stdout.strip())


def expected(base):
    """Ugyanaz a lista, amit a generátor nyomtatott — egy forrásból."""
    out = subprocess.run([sys.executable, str(HERE / "make-qr.py"), base, os.devnull],
                         capture_output=True, text=True, cwd=HERE.parent)
    return [l.strip() for l in out.stdout.splitlines()[1:] if l.strip()]


def main(sheet, base):
    import cv2
    with tempfile.TemporaryDirectory() as tmp:
        n = render(sheet, tmp)
        codes = expected(base)
        if n != len(codes):
            print(f"az íven {n} kártya van, a generátor {len(codes)} kódot sorolt fel", file=sys.stderr)
            return 2
        det = cv2.QRCodeDetector()
        ok, bad = 0, []
        for i, f in enumerate(sorted(glob.glob(tmp + "/*.png"))):
            txt, *_ = det.detectAndDecode(cv2.imread(f))
            want = base.rstrip("/") + "/#from=" + codes[i]
            if txt == want:
                ok += 1
            else:
                bad.append((codes[i], txt))
    print(f"{ok}/{ok + len(bad)} kód olvasható és a várt linkre mutat")
    for code, got in bad:
        print(f"  HIBA {code} -> {got!r}")
    return 1 if bad else 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2]))

# OA Épület Teremkereső — fejlesztői jegyzet

Teremkereső és útvonaltervező az Óbudai Egyetem OA épületéhez (Neumann János
Informatikai Kar, Bécsi út 96/b). **Élő oldal:** https://mayydayy99.github.io/oemap/

A felhasználói dokumentáció a [README.md](README.md)-ben van. Ez a fájl azt
gyűjti össze, amit egy új munkamenetnek tudnia kell, mielőtt hozzányúl.

## Két vezérelv

A projekt meetingjén ez a kettő lett kimondva, és minden vitás kérdést ez dönt el:

- **Hallgató first.** Ami nem a hallgatónak szól, az zaj. Ezért van halványítva
  a 183 helyiségből 87 (irodák, üzemeltetés, raktárak, dolgozói területek),
  ezért nincs rektori réteg, és ezért nem indul demó útvonallal az app.
- **Telefon first.** Minden döntésnél a telefon a mérce, nem az asztali gép.
  Ezért indul alaprajzzal (telefonon 76 fps a 3D 13-ával szemben), és ezért
  mobil az alapértelmezett nézet a tesztekben is.

## Felépítés

`index.html` (245 KB) **maga a teljes alkalmazás** — HTML, CSS és JS egy
fájlban, build lépés és futásidejű függőség nélkül. Ez szándékos: a
GitHub Pages statikusan szolgálja ki, és offline is működik. Az egyetlen külső
fájl a `fonts/`, az `icons/`, a `data/` és a `sw.js`.

A beépített `const D = {...}` tartalmazza az épületet:

| kulcs | mi | méret |
| --- | --- | --- |
| `levels` | 7 szint, az Alagsortól (−1) a IV. emeletig (5) | |
| `rooms` | helyiségek: `code`, `name`, `cat`, `level`, `area`, poligon | 183 |
| `cats` | 15 helyiség-kategória és a színük | |
| `walls`, `masks` | falgeometria és a szint sziluettje | |
| `grid` | a járásrács, ezen fut a Dijkstra | |
| `stairs`, `lifts` | függőleges átjárók a szintek közt | |

Az `S` objektum az egész futásidejű állapot (nyelv, téma, nézet, szint,
honnan/hova, útvonal, forgatás, panelállás). Aki ezt megérti, érti az appot.

## Kipróbálás

```
npm install          # playwright (a böngésző a képen már megvan)
npm test             # mind a 10 tesztfájl
node tests/run.js url share     # csak egy-kettő
```

A tesztek saját szervert és saját böngészőt indítanak szabad porton, így nem
kell előre semmit elindítani. **Fix portot ne használj**: egy ottfelejtett
szerver miatt egyszer egy RÉGI build ellen futottak a tesztek, és zölden
hagytak egy hibás kódot.

| fájl | mit őriz |
| --- | --- |
| `tests/view.js` | alaprajz/épület váltás, szintváltás, kiválasztás |
| `tests/url.js` | mély linkek, a vissza gomb, hibás link |
| `tests/share.js` | megosztás gomb mindkét ága |
| `tests/gestures.js` | csippentés, forgatás, tolás — **élesben bejelentett fagyás** |
| `tests/lift.js` | lépcső vs. lift alternatíva |
| `tests/sheet.js` | az alsó panel aljának elérhetősége |
| `tests/staff.js` | hallgatói/minden szűrő |
| `tests/termek.js` | foglalható termek, és a lejárt adat kezelése |
| `tests/pwa.js` | manifest, service worker, **offline indulás** |
| `tests/a11y.js` | billentyűzetes bejárás, felolvasónak szóló jelölés |

## Amit érdemes tudni, mielőtt hozzányúlsz

**A gesztusok érzékenyek.** A húzás-állapotot egyetlen `startDrag()` állítja
elő. Volt, hogy két helyen épült, és az egyik ág nem vitte át a forgatás
kiindulóértékeit — NaN lett a szögből, a térkép befagyott, a feliratok
elmásztak. A `tests/gestures.js` pont ezt az esetet játssza le (az egyik ujj
előbb emelkedik fel, mint a másik). Ha a pointer-kezeléshez nyúlsz, ez a teszt
a hálód.

**A halványított helyiségeket nem szabad eltüntetni.** A szint sziluettje az
ÖSSZES helyiség poligonjából áll össze; ha kivennéd őket, lyukas lenne az
alaprajz. Halványítás igen, törlés nem — és keresésből, kiválasztásból sem
eshetnek ki.

**A 2D-ben csak az aktív szint van kifestve.** Ez a mobil teljesítmény ára.
Szintváltáskor a NÉZETET is frissíteni kell, különben az új szint láthatatlan
marad. A `tests/view.js` ezt méri.

**3D-ben a fölöttes szintek takarnak.** A `+Z` a néző felé mutat, tehát a
magasabb emelet van ELÖL. Egyenként 0,82-es födémmel öt emelet alatt a
földszint alaprajzából 0,02% jött át — gyakorlatilag eltűnt. A
`floorOpacity()` ezért szintenként halványítja a fölöttes emeleteket, és a
dőléssel adja vissza őket (élből nézve elcsúsznak, nem takarnak). Két buktató:
az érték a dőléstől függ, ezért a `syncFloorOpacity()`-t a gesztus `paint()`-je
is hívja képkockánként, és a `.navving .floor{transition:none}` nélkül a
0,55s-os áttűnés minden képkockán újraindulna.

**Az Alaprajz is forgatható**, két ujjal csavarva. A `bearing()` adja meg az
irányt: 3D-ben nyersen `rot.z`, alaprajzon `rot.z - ROT0.z`, hogy a kiinduló
állapot elforgatatlan tervlapot mutasson. **2D-ben sima `rotate()` megy, nem
`rotateZ()`** — az utóbbi 3D kontextust kérne, és elvinné a `.flat2d` lapos
gyorsútvonalát, amin a telefonos 76 fps múlik. A `projBBox()` ugyanezt a
`bearing()`-et használja, különben a ⤢ az elforgatott tervlapra rosszul
illesztene.

**A lejárt órarendi adat nem „szabad”.** A `tmNow()` az érvényességi ablakon
kívül `nodata`-t ad, és a sor egy `–` jelet kap `tmb none` osztállyal. Aki egy
üres teremre számít és órára érkezik, rosszabbul jár, mintha meg se kérdezte
volna. Ezt a `tests/termek.js` kötelezővé teszi.

**A QR-ívet nyomtatás előtt vissza kell olvasni.** A generátor kétszer adott
hibátlanul KINÉZŐ, de olvashatatlan ívet (hiányzó csendzóna; rossz viewBox;
majd egy regex, ami az `id="qr-path"`-ra futott rá a rajz helyett).
`python3 tools/verify-qr.py <ív> <base-url>` — ez mindhármat megfogta volna.

**A térkép egyetlen tab-állomás.** A helyiségek `role="button"`-ok, de
`tabindex="-1"`-gyel: fókuszt csak a nyilaktól kapnak (roving tabindex). Ha
bármelyik `tabindex="0"`-t kapna, a billentyűzetes felhasználónak 182-szer
kellene tabbolnia, hogy a térképen túljusson. A `tests/a11y.js` ezt számolja.

**A fókusz nem maradhat `aria-hidden` ágon.** Csak az aktív szint látszik a
felolvasónak; az `updateView()` ezért mielőtt elrejtene egy szintet,
megnézi, benne áll-e a fókusz, és kihozza a térképre. Aki a szintváltáshoz
nyúl, ezt vigye tovább — enélkül a felolvasó némán áll egy olyan elemen,
amiről a felhasználó semmit nem tud meg.

**Ismétlődő teremkód.** A tervlapon az `OA00FK2` kétszer szerepel (ELŐTÉR és
AULA). Az app `ROOM` táblája `Object.fromEntries`-szel épül, ott az UTOLSÓ nyer;
a QR-generátor ugyanígy dönt, különben a matrica felirata mást ígérne, mint
ahová visz. Ha új kódütközés jön be, ezt a szabályt tartsd.

## Adatfolyam

```
ingatlan.uni-obuda.hu/termek (mentett lapok) --parse-rooms.py--> data/rooms.json
terem.xlsx (teremfoglalási tábla)         --parse-timetable.py--> /tmp/tt.json
                                     rooms.json + tt.json --build-termek.py--> data/termek.json
```

A `parse-timetable.py` a cellák **kitöltőszínét** olvassa adatként (ez kódolja a
foglalás típusát: előadás, vizsga, levelezős, távos, foglalás). A
`build-termek.py` utolsó paramétere a kezdődátum — enélkül a teljes munkafüzet
bekerülne (919 KB); egy-két héttel 6 KB.

A `data/timetable.json` szándékosan `.gitignore`-ban van (896 KB, nem kell a
kliensnek).

## Deploy

Push a `main`-re → `deploy-pages.yml` → GitHub Pages. Kézzel:
Actions → Deploy to GitHub Pages → Run workflow.

**Ha egy deploy elszáll, az EGÉSZ workflow-t indítsd újra, ne csak a bukott
job-ot.** A feltöltés lépés az első próbán már sikerülhetett, és a retry egy
MÁSODIK `github-pages` artifactot hoz létre — a `deploy-pages` ilyenkor
„Artifact count is 2" hibával elhasal. (A workflow-ban is ott a figyelmeztetés.)

## Szokások

- **A nyelvhatár a kód és a git-történet közt húzódik.** A kódkommentek, a
  dokumentáció (README, ez a fájl, `docs/`) és a tesztek leírásai magyarul
  vannak, mert a projekt magyar csapatnak készül; a **commit üzenetek angolul**,
  mert a repó egész története így épült fel. A felhasználói felület külön eset:
  az kétnyelvű, az `I18N` tömb `hu`/`en` ága adja — ha új szöveget veszel fel,
  mindkettőbe kerüljön be.
- A kommentek azt mondják el, hogy MIÉRT, nem azt, hogy mit.
- **Commit üzenet: mit old meg és miért**, nem a fájlok felsorolása.
- **Mérj, ne tippelj.** A teljesítmény-döntések (2D vs 3D, render sűrűség)
  mind mért számokon állnak, nem érzésen. Ha optimalizálsz, előbb mérd meg.
- **A hibát reprodukáld, mielőtt javítod.** A csippentés-fagyást, a panel
  görgetését és a QR-hibákat mind így fogtuk meg.
- A GitHub e-mail-védelem miatt a commit szerzője `noreply@anthropic.com`
  legyen, különben a push `email privacy restrictions`-szel visszapattan.

## Ami nyitott

Lásd [docs/NYITOTT-KERDESEK.md](docs/NYITOTT-KERDESEK.md) — négy dolog vár
külső információra, és ezek közül kettő valódi funkcióhiányt okoz.

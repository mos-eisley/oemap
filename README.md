# OA Épület Teremkereső

Interaktív teremkereső és útvonaltervező az OA épülethez. Egyetlen, önálló HTML
fájl — nincs build lépés, nincs függőség, nincs csomagkezelő.

**Élő oldal:** https://mayydayy99.github.io/oemap/

## Felépítés

| Fájl | Szerep |
| --- | --- |
| `index.html` | Maga az alkalmazás (HTML + CSS + JS egy fájlban) |
| `fonts/` | Saját kiszolgálású betűtípusok + licencek |
| `icons/` | Alkalmazásikonok (a Metropolisszal generálva) |
| `manifest.webmanifest` | PWA leíró — telepíthetőség |
| `sw.js` | Service worker — offline működés |
| `data/` | Foglalható termek és foglaltságuk (generált) |
| `tools/` | Az adatot előállító szkriptek és a QR-ív generátora |
| `tests/` | Böngészős regressziós tesztek (`npm test`) |
| `CLAUDE.md` | Fejlesztői jegyzet — ezt olvasd, mielőtt hozzányúlsz |
| `docs/` | Nyitott kérdések, amik külső információra várnak |
| `.github/workflows/deploy-pages.yml` | Automatikus deploy GitHub Pages-re |
| `.nojekyll` | Kikapcsolja a Jekyll feldolgozást |

**Nincs külső hivatkozás.** A betűtípusok a `fonts/` mappából jönnek, minden más
— a teremadatok, az alaprajz geometriája, az útvonalkeresés — az `index.html`-en
belül van. Így az oldal külső szolgáltató nélkül, offline is működik.

## Nézetek

Az app **Alaprajzzal indul** — telefonon ez a nézet 76 fps az Épület 13-ával
szemben, és nagyításkor éles marad, mert nincs 3D kontextus. Az Épület nézet
gombbal érhető el.

Épület nézetben az **aktív szint alaprajza mindig olvasható marad**: a fölötte
lévő emeletek födémje halványodik, mert az a néző felé esik, és egymásra
rétegződve kitakarná. Minél meredekebben nézed, annál inkább visszajönnek —
élből úgysem takarnak, és ott a köteg mondja el, hogy hány emeletes az épület.
Az aktív szint alatti emeletek végig teljes erősséggel maradnak.

A fejlécben a **Hallgatói / Minden** kapcsoló dönti el, mely helyiségek
látszanak. Hallgatói nézetben az irodák, üzemeltetési terek, raktárak és
dolgozói területek semleges szürkén, felirat nélkül jelennek meg — ez a 183
helyiségből 87. Nem tűnnek el: a födém sziluettje az összes poligonból áll
össze, kivéve őket lyukas lenne az alaprajz. Keresésből és kiválasztásból sem
esnek ki, csak nem versenyeznek a figyelemért.

## Kezelés

| | Alaprajz | Épület |
| --- | --- | --- |
| egy ujj / egér húzás | tolás | **forgatás** — vízszintesen a tengely körül, függőlegesen a dőlés (15°–85°) |
| két ujj: húzás | tolás | tolás |
| két ujj: csippentés | nagyítás | nagyítás |
| két ujj: **csavarás** | **forgatás** az ujjak közepe körül | forgatás |
| két ujj: **függőleges húzás** | **felemel Épület nézetbe** és dönteni kezd | **dőlés** (15°–85°) |
| görgő | nagyítás | nagyítás |
| Shift + húzás (egérrel) | tolás | tolás |
| ⤢ gomb | képre igazít **és visszaforgatja** a tervlap rajzolt állásába | képre igazít **és visszaállítja az alapállást** |

A tolás, a nagyítás és a forgatás egyszerre is mehet, ahogy a
térképalkalmazásokban megszokott: csippentés közben csavarva a térkép egyszerre
nagyít és fordul. A forgatás 8° elcsavarás után indul — enélkül minden
csippentés fordítana is egy keveset, mert a két ujj sosem pontosan egy tengely
mentén mozdul.

**A döntés kivétel: az kizárja a többit.** Ugyanaz a függőleges elmozdulás
tolásnak is olvasható, a kettő nem mehet egyszerre, ezért a mozdulat az első
határozott mozzanatnál eldől, és a fogás végéig ott marad. Döntésnek az számít,
ha mindkét ujj legalább 16 px-et mozdul függőlegesen, azonos irányba, a
függőlegeshez képest ~19°-os kúpon belül, és közben a távolságuk alig változik.
Ennek ára van: **Épület nézetben a majdnem függőleges kétujjas húzás már nem
tol, hanem dönt** — így működik a Google Maps is. Tolni ferdén vagy vízszintesen
lehet, asztali gépen Shift + húzással is.

A döntés oda-vissza jár. Az Alaprajzon nincs dőlés, ezért a felfelé húzás
átemel Épület nézetbe, és onnan folytatja — a nézet a kéz alatt marad, nem
illeszt újra. Ha a mozdulat a legalsó dőlésen ér véget, az ujjak felemelésekor
visszakapcsol Alaprajzra. A döntés közben nem vált oda-vissza, csak a végén, így
a határon nem billeg. Az Épület nézet egyujjas mozdulata körbejárás marad, attól
nem esel ki a nézetből.

Az irányt a csavarás mindkét nézetben ugyanannyival fordítja, és a váltás
megtartja. A két nézet alapállása közt 30° eltérés van: az Alaprajz úgy áll,
ahogy a tervlap meg van rajzolva, az Épület pedig az izometrikus nézetben —
a felemelkedés is ide érkezik, ugyanoda, ahova az Épület gomb visz.

Az alsó lapot a fejléc bármely pontjáról lehet húzni, és a lista tetejéről lefelé
is. Az elengedés sebessége számít: egy határozott pöccintés a mozgás irányában
lép a következő állásra.

### Billentyűzettel

A térkép **egy** tab-állomás — nem 182 —, és onnan a nyilak viszik tovább:

| billentyű | mit csinál |
| --- | --- |
| Tab | a térképre lép (a fejléc, a kereső és a gyorsgombok után) |
| nyilak | a szomszédos helyiségre lép abban az irányban |
| Enter / szóköz | kiválasztja a fókuszált helyiséget |
| Home / End | a szint első, illetve utolsó helyisége |
| Page Up / Page Down | szintet vált |
| Esc | vissza a térképre, majd törli a kiválasztást |
| `/` | a keresőmezőbe ugrik |

A helyiségek gombok, a nevük a teremkód és a funkció, a kiválasztott terem
`aria-pressed`-et kap. A kiválasztás, az útvonal eredménye és a szintváltás
élő régióban is elhangzik, így képernyőolvasóval is követhető. A felolvasó az
aktív szintet látja: a födém, a falak, a feliratok és az útvonalrajz
`aria-hidden`, mert ugyanazt mondanák el, amit a panel szövegesen.

A nyilas bejárás azokat a helyiségeket járja be, amelyek látszanak is —
hallgatói nézetben a hallgatóiakat. A halványított termek kereséssel és
megosztott linkkel ugyanúgy elérhetők, a fejléc kapcsolója pedig egy tabbal
odébb van.

## Telepítés a kezdőképernyőre

Az oldal telepíthető webalkalmazás. Androidon a böngésző menüjében „Alkalmazás
telepítése", iOS-en Safari → Megosztás → „Hozzáadás a főképernyőhöz". Telepítés
után a teljes app offline is elindul — a service worker az első betöltéskor
elteszi a HTML-t, a betűket és az ikonokat. Az épületben, gyenge térerővel is
működik.

Frissítés: a dokumentumot hálózat-először kéri le, így egy új deploy a következő
indításnál azonnal megérkezik; offline a gyorsítótárazott példány jön.

## Megosztható link

Az állapot a címsorban él, így az útvonal megosztható, könyvjelzőzhető, és a
vissza gomb visszalép benne — telepített appban e nélkül a vissza egyszerűen
kilépne:

| link | mit jelent |
| --- | --- |
| `#OA10E18` | ez a terem ki van választva |
| `#from=OA00FK1` | „itt vagyok" — az indulás megvan, a célt a hallgató adja meg |
| `#from=OA00FK1&to=OA10E18` | kész útvonal |

Ismeretlen kódot a link csendben elhagy: az app elindul, csak épp kiválasztás
nélkül. A panelben a megosztás gomb a pillanatnyi állapot linkjét adja —
`navigator.share`-rel, ahol van, különben vágólapra.

## „Itt vagyok" QR-kódok

Beltérben a GPS nem ad emelet- vagy teremszintű pontosságot, ezért a „hol
vagyok?" kérdésre a hallgatónak kellene válaszolnia. Egy falra ragasztott QR
ezt leveszi róla: a kód a `#from=<terem>` linkre mutat, így az app már tudja,
honnan indul. Se engedélykérés, se hálózat — a telepített PWA offline is
elindul.

```
python3 tools/make-qr.py https://mayydayy99.github.io/oemap/ qr.html
```

Nyomtatható A4-es ív lesz belőle, szintenként csoportosítva: 41 kód a
közlekedőkre, előterekbe és közösségi terekre. Egy-egy szintre szűkíthető a
szintszámok megadásával (`... qr.html 0 1`).

## Foglalható termek

A kereső alatti gyorsgombok közt a **Foglalható termek** megmutatja, melyik terem
szabad vagy foglalt éppen, kinyitva pedig a napi sávokat és a felszereltséget.

Az adat két forrásból áll össze, a hivatalos teremnéven:

| forrás | mit ad | feldolgozó |
| --- | --- | --- |
| `ingatlan.uni-obuda.hu/termek` mentett lapjai | név, férőhely, felszereltség | `tools/parse-rooms.py` |
| teremfoglalási tábla (`terem.xlsx`) | napi/óránkénti foglaltság, kar, típus | `tools/parse-timetable.py` |

```
python3 tools/parse-rooms.py mentett*.htm > data/rooms.json
python3 tools/parse-timetable.py terem.xlsx /tmp/tt.json
python3 tools/build-termek.py data/rooms.json /tmp/tt.json data/termek.json 2026-08-31
```

A `build-termek.py` utolsó paramétere a kezdődátum — enélkül az egész
munkafüzet bekerülne (919 KB); egy-két héttel 6 KB.

**Az adat lejár.** A `termek.json` `from`/`to` mezői mondják meg, meddig érvényes;
azon kívüli napra az app „nincs adat"-ot ír, nem „szabad"-ot. Új tábla érkezésekor
a fenti három parancs újrafuttatandó.

**Ezek nem az alaprajz kódjai.** Az `F01…F09` és az `Audmax` az egyetem hivatalos
teremnevei; a tervlap más (üzemeltetési) számozást használ, és a kettő
összerendelése még nincs meg. Például a hivatalos `F01` 268 fős, míg a tervlap
`OA00F01`-e 95,7 m². Ezért a foglalható termek nem jelennek meg a térképen.
Részletek és a teendők: [docs/NYITOTT-KERDESEK.md](docs/NYITOTT-KERDESEK.md).

## Arculat

Az Óbudai Egyetem Brand Guide 2026 / 1.0 szerint:

| | |
| --- | --- |
| Elsődleges szín | `#00288C` (sötét téma: `#799AEC`, a brand kék világosított változata) |
| Cím / rövid szöveg | **Metropolis** (400/600/700) |
| Folyó szöveg | **Open Sans** (400/600) |
| Teremkódok | IBM Plex Mono — a `0`/`O` megkülönböztetése tájékozódásnál funkcionális |

Az útvonal narancs marad: tájékozódási szín, nem arculati elem, és a kézikönyv
másodlagos színei közül egyik sem ad elég kontrasztot a világos alaprajzon.
A helyiség-kategóriák színei szintén változatlanok — azok a jelmagyarázathoz
tartoznak, nem a márkamegjelenéshez.

A betűtípusok szabadon terjeszthetők (Metropolis: public domain, Open Sans és
IBM Plex Mono: SIL Open Font License); a licencfájlok a `fonts/` mappában vannak.

## Deploy

A `deploy-pages.yml` workflow minden pusholásnál lefut, és a repó tartalmát
kirakja GitHub Pages-re. Kézzel is indítható: **Actions → Deploy to GitHub Pages
→ Run workflow**.

### Egyszeri beállítás — ezt kézzel kell megtenni

1. **Settings → Pages**
2. **Build and deployment → Source:** válaszd a **GitHub Actions** opciót

Ezt egyszer kell megcsinálni, és nem lehet automatizálni: az Actions
`GITHUB_TOKEN` deployolni tud a Pages-re, de magát a Pages site-ot létrehozni
nem — ahhoz repo admin jog kell. Amíg ez nincs kész, a workflow a *Setup Pages*
lépésnél `Get Pages site failed` hibával leáll.

Ha megvan, indítsd újra a legutóbbi futást (**Actions → Deploy to GitHub Pages →
Re-run jobs**), vagy pusholj egyet. Az élő URL az Actions futás összegzésében és
a **Settings → Pages** oldalon is megjelenik.

> Ha a deploy `Branch not allowed to deploy` hibával áll meg, akkor a
> `github-pages` environment ághoz van kötve: **Settings → Environments →
> github-pages → Deployment branches** alatt engedélyezd az ágat, amelyikről
> deployolsz.

## Helyi futtatás

Elég megnyitni a fájlt a böngészőben:

```
open index.html
```

Vagy egy helyi szerverrel:

```
python3 -m http.server 8000
# majd http://localhost:8000
```

## Tesztek

```
npm install     # playwright
npm test        # mind a 10 tesztfájl
```

A tesztek maguk indítanak szervert és böngészőt szabad porton, így nem kell
előre semmit elindítani. Egy-egy fájl külön is futtatható:
`node tests/run.js url share`.

Mit őriznek, és miért pont azt, arról a [CLAUDE.md](CLAUDE.md) ír. A rövid
verzió: mindegyik teszt egy valódi, egyszer már bejelentett hibát tart távol —
a befagyó térképet, az elérhetetlen panelaljat, a hamisan „szabad" termet.

## Frissítés

Az alkalmazás cseréjéhez írd felül az `index.html` fájlt, és pushold — a deploy
magától lefut. Ha a fájl újragenerált változatát teszed be, ne felejtsd el a
`fonts/` mappára mutató `@font-face` blokkot és az arculati színeket átvinni.

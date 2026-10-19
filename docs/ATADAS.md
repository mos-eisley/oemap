# Átadás — hol tart az egyetem-szintű bővítés, és mi van hátra

Ez a fájl egy új munkamenetnek szól, amelyik nem látta az eddigi beszélgetést.
A projekt általános tudnivalói a [CLAUDE.md](../CLAUDE.md)-ben vannak — azt
olvasd el először. Ez itt csak azt rögzíti, ami ebben a munkában történt, és
hogy mi a következő lépés.

Állapot a készítés pillanatában: **39 épület a nyilvántartásban, ebből 7
megnyitható** (OA, OD, FF, FK, KH, KT, OC), összesen 1528 helyiséggel. Mind a
23 tesztfájl zöld.

## Egy mondatban

Az app eddig egyetlen épületet (OA) ismert, beégetve; most ismeri az egyetem
mind a 39 épületét, tud köztük váltani, és amelyik épületnek elkészül az
adata, az magától megnyithatóvá válik.

## Mi készült el

**Az app oldalán** (`index.html`):

- **Épületválasztó**: a fejléc épületneve a nyitógomb, a lista telephely
  szerint csoportosít. Aminek kész az adata, az megnyitható; a többi adatlap
  (cím, szintek, helyiségszám, terület). A kettőt nem szabad összemosni.
- **Futásidejű épületváltás**: a `D`-ből tizenkilenc modulszintű érték épül,
  és váltáskor mind újraépül öt függvénnyel (`epuletGeo`, `epuletStart`,
  `epuletRacs`, `epuletRcell`, `epuletPortal`). A részletek és a buktatók a
  CLAUDE.md „Felépítés” szakaszában.
- **Más épület kódjára mutató link** (`…#OD20E01`) átvált arra az épületre és
  kiválasztja a termet; ha az épület nem megnyitható, megnevezi.
- **`PORTA` tábla**: épületenként az indulás helye, 23 épületre kitöltve.
- Az alcím és a használó kar az adott épületé, nem az OA-é.

**Az adat oldalán**:

| mi | hol | miből |
| --- | --- | --- |
| 39 épület nyilvántartása | `data/epuletek.json` | tervlapok fejbélyegzője + leltár |
| épületek geometriája | `data/epuletek/<kód>.json` | tervtári alaprajz + tábla |
| 4643 helyiség leltára | `forras/kivonat/leltar.json` | 25 épületadat-tábla |
| 34 épület helye | `forras/kivonat/helyszinrajz.json` | 18 helyszínrajz |

**Eszközök** (`tools/`, mind dokumentált docstringgel):

- `tervtar-leltar.py` — mind a 26 épületadat-tábla (régi `.xls` és új `.xlsx`)
- `tervlap-epuletek.py` — a 39 épület nyilvántartása, a kar a funkció lapról
- `helyszinrajz.py` — melyik épület hol áll a telephelyen
- `tervlap-uj.py` + `epulet-json.py` + `tervlap-batch.py` — geometria a
  tervlapokból, üres lapról, önkalibrálóan
- `epulet-ellenoriz.js` — **ez a mérce**: betölti az appot, végigvált minden
  megnyitható épületen, és megmondja, hány helyiséghez van út a portától

## Mi van hátra, sorrendben

### 1. A küszöb eldöntése — ez nyit ki a legtöbbet

A 26 épületből 24 geometriája kijött, de csak 5 ment be, mert az OD 94%-os
szintjéhez mértük. A mérőszám: a helyiségek hány százalékánál egyezik a
kivágott sokszög területe a tábla pecsétjével ±3%-on belül.

| ±3%-on belül | épületek |
| --- | --- |
| 100% | TN, TT |
| 89–96% | FF, FK, OC, KH, KB, KT |
| 80–86% | YC, KP, OB, BF, TB, TA, BB |
| 70–79% | TG, BA, YB, FG, YA |
| 41–66% | FC, FS, TC, OM |

Küszöbönként (ahol porta is van): ≥89% → 6, **≥80% → 12**, ≥70% → 15,
≥60% → 17 épület. Minden helyiség ki van rajzolva és feliratozva a küszöb
alatt is; a különbség az alak pontossága. A batch összegzése a
`tervlap-batch.py` kimenetében (`_osszegzes.json`), az `arany3` mező.

### 2. Két konkrét hiba, ami épületeket tart vissza

- **A KB portája nem jött ki a kivágásból** (91%-os minőség, 502 helyiség — a
  második legnagyobb). A 23 portából kettő hiányzik az adatból; az
  `epuletKesz()` ezért jogosan visszautasítja. Meg kell nézni, miért esik ki
  épp az a helyiség.
- **A BD és a KD kinyerése numpy-kivétellel elszáll.** Ez programhiba, nem
  adathiba — javítás után mindkettő bejöhet.

### 3. Porta nélküli épületek

- **TN, TT**: a geometriájuk hibátlan (100%), csak portájuk nincs. Apró,
  egyszintes melléképületek (8 és 19 helyiség), ahol az `ELŐTÉR` szinte
  biztosan a bejárat. Az OD-ben azért nem fogadtuk el az ELŐTÉR-t, mert ott a
  mosdók előtere volt az — itt más a helyzet. Egy döntés kell hozzá.
- **BB, TC, YB**: ezeknél valószínűleg nincs saját bejárat. A BB a BF–BA–BB,
  a TC a TA–TC komplexum része: a szomszéd épületen át lehet bemenni, ami
  **épületek közti útvonal** lenne — az app ma minden épületet zárt világként
  kezel. Az YB egyetlen szélfogója a IV. emeleten, a könyvtárban van.

### 4. A pinceszintek mintázata

Minden eddig feldolgozott épületben a kimaradó helyiségek túlnyomórészt
pinceszintiek (`X1`, `X2` kódúak): az OD −2. szintje teljesen elvágva, az
FF, FK, KH ugyanígy. A pincébe vezető lépcső vagy bejárat nem jön ki a
tervlapról. Ez egy ok, nem huszonöt külön hiba — érdemes egyben megnézni.

### 5. Amit csak ember tud megszerezni

- **`forras/oe_tervtar_kh_gyumolcs_u_lebenyi_kollegium.xls` friss példánya.**
  A mostani csonka: a szövegtáblája 1235 stringet ígér 3299 bájtban. Nem
  olvasási hiba, a fájl sérült. Excelből `.xlsx`-ként újramentve használható.
- **BC, KG, NB épületadat-táblája** — tervlapjuk van, táblájuk nincs, ezért
  helyiségnév, funkció és alapterület nélkül maradnak.
- **FC, FS, NA, NB helyszínrajza** — egyik lap sem fedi le őket.
- **NA/UV**: a nagymarosi épület tervlapja `oe-na_…`, a táblája viszont `UV`
  kódokkal dolgozik. Ha ugyanaz az épület, egy sorral összeköthető.
- **Lift**: az OA-n kívül egyetlen épületben sem sikerült liftet azonosítani a
  helyiségnevekből. Egy kilencszintes épületben valószínűleg van — helyszíni
  ellenőrzés kérdése.
- **Ajtók**: IFC-modell csak az OA-hoz van, ezért máshol az útvonal a
  legközelebbi cellánál ér véget, nem az ajtónál.

### 6. Amit a mostani forrásokból sosem lehet megcsinálni

Hét épületnek (FA, FB, KM, SA, SB, SC, UV) nincs alaprajza, csak
helyszínrajza — a helyük megvan, több nem nyerhető ki belőlük.

### 7. Termékoldali kérdés

Az app ma nem ismeri a „megrajzolt, de nem navigálható” állapotot: az
`epuletKesz()` lépcsőt és portát is megkövetel, tehát egy épület vagy teljesen
megnyílik, vagy adatlap marad. Ha a porta nélküli vagy tábla nélküli
épületeket legalább *nézegetni* lehetne, az külön üzemmód — nem nagy munka,
de új funkció.

## Döntések, amik már megszülettek

Ezeket ne kelljen újra végiggondolni:

- **Az OA adata beégetve marad**, a többi épületé `data/epuletek/<kód>.json`-ból
  jön. Így az offline indulás és a „egy fájl az egész app” elv sértetlen, és
  az OA-ra hálózat nélkül is vissza lehet váltani.
- **A `navigalhato` azt jelenti, hogy az app adata kész**, nem azt, hogy van
  tervlap. A `tervlap-epuletek.py` abból állítja elő, hogy létezik-e a
  `data/epuletek/<kód>.json` — nincs kézi lista.
- **Hiányos adattal nem váltunk.** Falak nélkül a Dijkstra mindenen átmenne,
  lépcső nélkül a szintek nem érnének össze, porta nélkül a gyorsgombok rossz
  helyről indítanának. Inkább maradjon adatlap.
- **A portát nem találjuk ki.** Ahol a tervlapon van „PORTA” nevű helyiség, az
  a porta; ahol nincs, a bejárati tér (ELŐCSARNOK > AULA > SZÉLFOGÓ). A
  földszint alatti szint is számít: az OA portája maga is alagsori.
- **A források a `forras/`-ban vannak**, és a deploy kidobja őket a Pages-re
  publikált csomagból. A repó privát, a Pages site **nem az** — ami a `data/`
  alá kerül, az nyilvános.
- **A forrásbeli elírást jelentjük, nem javítjuk** (pl. a `bf-ba-bb` lapon
  „Biztonságtecnikai”).

## Hogyan indulj

```
git clone <repó>
npm install                               # playwright
pip install -r tools/requirements.txt     # a tools/ szkriptjeihez
npm test                                  # mind a 23 tesztfájl
node tools/epulet-ellenoriz.js            # minden megnyitható épület mérése
```

Felhős munkamenetben a `.claude/hooks/session-start.sh` mindkét telepítést
elvégzi.

## Amibe bele fogsz futni

- **Az élő oldal nem él.** A repó privátra állítása kikapcsolta a GitHub
  Pages-t (ingyenes csomagban privát repóból nem publikálható), ezért a deploy
  a `Setup Pages` lépésnél elhasal. Fontos: a feltöltés ELŐTT hasal el, tehát
  belső anyag nem került ki. Az oldal visszaélesztéséhez a Pages-t be kell
  kapcsolni egy olyan csomagon, ami privát repóból is publikál — vagy a
  publikálandó részt külön, publikus repóba tenni.
- **A `git push`-t a jogosultság-ellenőrző letilthatja** („Out-of-Place
  Publication” vagy „Data Exfiltration”), mert a `forras/` 97 MB belső
  dokumentum. Feloldás: `Bash(git push:*)` engedély a beállításokban — ami
  menet közben létrehozva nem feltétlenül lép életbe, új munkamenet kell
  hozzá.
- **A klón ~230 MB** (97 MB forrás + a `.git` korábbi terhe). A `.git`-ben egy
  régebbi, azóta törölt képkönyvtár is benne maradt.
- **Nyelvhatár**: a kód, a kommentek és a dokumentáció magyarul, a **commit
  üzenetek angolul**. A commit szerzőjének e-mailje `noreply@anthropic.com`
  legyen, különben a push e-mail-védelmi hibával visszapattan.
- A geometria-kinyerést eddig egy külön helyi munkamenet végezte; az eszközei
  (`tervlap-uj.py`, `epulet-json.py`, `tervlap-batch.py`) commitolva vannak,
  tehát a munka onnan folytatható, ahol abbamaradt.

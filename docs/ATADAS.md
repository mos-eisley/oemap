# Átadás — hol tart az egyetem-szintű bővítés, és mi van hátra

Ez a fájl egy új munkamenetnek szól, amelyik nem látta az eddigi beszélgetést.
A projekt általános tudnivalói a [CLAUDE.md](../CLAUDE.md)-ben vannak — azt
olvasd el először. Ez itt csak azt rögzíti, ami ebben a munkában történt, és
hogy mi a következő lépés.

Állapot (2026-10-29, a térképes épületválasztó és annak átnézése után): **39
épület a nyilvántartásban, ebből 7 megnyitható** (OA, OD, FF, FK, KH, KT, OC),
összesen 1515 helyiséggel. Mind a 26 tesztfájl zöld.

## Egy mondatban

Az app eddig egyetlen épületet (OA) ismert, beégetve; most ismeri az egyetem
mind a 39 épületét, tud köztük váltani, és amelyik épületnek elkészül az
adata — és a `PORTA` táblában a portája —, az megnyithatóvá válik.

## Mi készült el

**Az app oldalán** (`index.html`):

- **Épületválasztó, térképpel** (2026-10-26): a fejléc épületneve a
  nyitógomb, egy modális ablakot nyit. Magyarország térképe a települések
  jelölőivel → a település térképe az épületekkel a valódi helyükön
  (Budapesten kerületenként csoportosítva) → az épület. Mellette mindig a
  lista. Aminek kész az adata, az megnyitható; a többi adatlap (cím, szintek,
  helyiségszám, terület, kar). A kettőt nem szabad összemosni.
- **Az épületek helye** a `data/helyek.json` (`tools/helyek.py`): 32 épület az
  OSM-ből (Nominatim, kézzel rögzített OSM-azonosítókkal), a közös telken
  állóknál a helyszínrajzokból számolt eltolással; hét épületnek (FA, FB, KM,
  SA, SB, SC, UV) nincs helye (a hat a helyszínrajzon szerepel, de nincs mihez
  illeszteni, az UV valószínűleg az NA; lásd `docs/NYITOTT-KERDESEK.md`, 6.).
  Az FC és az FS nem különíthető el (közös pont), az OB becsült. A térkép ODbL-es, a forrásmegjelölés a választó alján.
- **Alapértelmezett épület** (`localStorage`): induláskor ez nyílik meg, a
  fejléc házikója visszavisz rá; a link, a totem, a párosító és a mérő mód
  előbbre való, és amit a hallgató a betöltés közben választ, az is. A
  totemen nincs. **GPS-javaslat** koppintásra: a legközelebbi épület az
  OSM-körvonaltól mérve, 250 m-en belül.
- Az átnézésben (2026-10-26) talált hibák a választóban mind javítva, köztük
  a korábban itt nyitottként felsorolt **két épületet vegyítő link** végtelen
  ingázása (`#from=OD…&to=OA…`) is: most egyszer vált, a másik épület kódja
  elmarad.
- **Futásidejű épületváltás**: a `D`-ből huszonkét modulszintű érték épül, és
  váltáskor mind újraépül öt függvénnyel (`epuletGeo`, `epuletStart`,
  `epuletRacs`, `epuletRcell`, `epuletPortal`). A részletek és a buktatók a
  CLAUDE.md „Felépítés” szakaszában.
- **Más épület kódjára mutató link** (`…#OD20E01`) átvált arra az épületre és
  kiválasztja a termet; ha az épület nem megnyitható, megnevezi.
- **`PORTA` tábla**: épületenként az indulás helye, 23 épületre kitöltve.
- Az alcím és a használó kar az adott épületé, nem az OA-é.

**Az átnézés után javítva** (2026-10-20). Az appban és a deployban minden
hiba reprodukálva, teszttel, és a teszt szabotázzsal ellenőrizve (a javítást
visszarontva a teszt elbukik); az eszközök javítása nem, lásd a pont végén.

- **A service worker nem tárolja el a hibaoldalt.** Minden betöltött lapot
  offline példánynak tett el, a 404-et is: a kikapcsolt Pages mellett a
  telepített app és a totem offline is a „Site not found” oldalt mutatta
  volna. Most csak ép válasz és csak maga az app kerül a helyére, hibánál
  (4xx, 5xx) a tárolt app jön, az átirányítást viszont követi (egy költözés
  után a telepített app különben a régi címen ragadna). A telepítéshez maga
  az app kötelező, aktiváláskor csak a saját régi tárolói törlődnek, és a
  `?v=`-s adat-újrakérés a paraméter nélküli kulcs alá kerül (`sw.js`,
  `tests/pwa.js`: hibát, átirányítást és megszakadó telepítést adó saját
  szerverrel; a „hálózat nélküli” próbák a service worker saját kéréseit is
  elvágják, mert a `setOffline` magában azokat nem mind).
- **A deploy engedélylistát publikál** (`tools/pages-csomag.js`, 32 fájl,
  `tests/csomag.js`), nem a repó gyökerét a `forras/` nélkül. Az összeállító
  azt is ellenőrzi, hogy minden, amire a lapok és a manifest hivatkoznak,
  bekerült-e (az `icon-180.png`-t a böngészős teszt nem kéri le), és nem ír
  olyan célba, ami nem üres és nem korábbi csomag (minden fájlját nézi, nem
  csak a legfelső neveket, és a saját `.oemap-csomag` jelzőfájlját kéri) — a
  célt előbb törli, és egy elírt `.` vagy `data` a munkapéldányt vitte volna.
  Azt is, hogy minden megnyitható épület adatfájlja kint legyen, a git
  szerint: egy elfelejtett `git add` helyben is látsszon, ne csak a CI-ben; és
  hogy egy hivatkozás se legyen gyökér-abszolút. A teszt az őrt a CLI-n át,
  repómásolaton elrontott esetekkel is futtatja.
- **Hat OA-ra szabott hiba más épületekben** (`tests/masepulet.js`): a
  foglalható termek az OD-ben és a KT-ban az OA 24 termét mutatták „Szabad”
  jelzéssel; az útvonal lépései a sorszám szerint nevezték meg a szintet (KT:
  „fel a félemeletre” az I. emelet helyett, OD: „fel undefined”); a liftes
  megjegyzés mindenhol az OA FL3 magjáról szólt; a mosdóválasztó a nemre nem
  jelölt WC-t (a kollégiumban egy lakóegységét) „Női” és „Férfi” mosdóként is
  kiírta (most külön, semleges sorban jön); a KH „M.K. WC”-je és a KT „M.S.
  MOSDÓ”-ja nem számított akadálymentesnek, az OC két kategória nélküli WC-je
  (`OC10E28`, `OC10E29`) mosdónak sem; a Büfé gomb ott is kint volt, ahol
  nincs büfé, és koppintásra semmit nem tett. Mellette, az OA-ban is: a 3D-s
  szintfeliratok és a szintek felolvasói neve angolul is magyar maradt.
- **A szint fajtája a nevéből jön, a kód csak tartalék — de ha a kettő
  ellentmond, vagy a sor nem nő alulról felfelé, az épület nem nyílik meg.**
  A szint kódja nem mindenhol emelet (a BA, BB és YB földszintjéé 10, a KD
  félemeletéé 15 — a második kör kódra épülő változata ebből „I. emelet
  fölötti félemeletet” és dupla lépcsőzést csinált), és a név sem mindig jó (a
  TA a TC-vel közös lapjain a TC emeletszámait kapta). Ma egyik megnyitható
  épületet sem érinti; a leltárból képzett szintsorral a BA, BB, BF, YB (a név
  nélküli, 00-s udvarszint egy második földszint lenne), a KD és a TA adatlap
  marad, amíg az `epulet-json.py` a szint fajtáját és emeletszámát
  egyértelműen ki nem írja. A mosdónevek
  leltárbeli írásmódjait (MK., MS., AKM., N/NŐ/F/FF, MOSD., PISZOÁR) és a
  személyzeti WC-ket is már most kezeli, mielőtt azok az épületek megnyílnának.
- **A váltás mércéje valódi épületeken mér** (`tests/epuletek.js`): az addigi
  „OA más kód alatt” mérce ugyanazt a rácsot adta, és akkor is átment, ha
  váltáskor semmi nem épült újra. Most épületenként négy szám a portától az
  aranyérték: az elérhetetlen helyiségek (ma, az IFC-ajtók után: OA 3, FF 1,
  FK 11, KH 14, KT 8, OC 5, OD 6), az útvonalak összhossza és a lépcsős meg a liftes gráf élszáma —
  új épületnél vagy adatjavításnál itt kell átírni. Mellette a váltás után
  egyetlen tárolóban sem maradhat régi bejegyzés: bármelyik ürítő ciklus
  hiányán elbukik. Ez meg is fogott egyet: a szintdobozok tábláját (`FLOOR`)
  a `buildFloors()` nem ürítette, és a régi épület magasabb szintjei
  bennmaradtak.
- A D-t író eszközök (`ifc-ajtok.py`, `ifc-lepcsok.py`, `tervlap-szarny.py`,
  `make-qr.py`) a `const D`-t keresték, és a `let D` óta elszálltak volna.
  Kézzel javítva: a belső IFC és PDF nélkül tesztben nem futtathatók. Az
  `ifc-lepcsok.py` egy másolaton bájtra ugyanazt a `D`-t adja, mint előtte.

**Az adat oldalán**:

| mi | hol | miből |
| --- | --- | --- |
| 39 épület nyilvántartása | `data/epuletek.json` | tervlapok fejbélyegzője + leltár |
| épületek geometriája | `data/epuletek/<kód>.json` | tervtári alaprajz + tábla |
| 4643 helyiség leltára | `forras/kivonat/leltar.json` | 25 épületadat-tábla |
| 34 épület helye | `forras/kivonat/helyszinrajz.json` | 18 helyszínrajz |
| 32 épület földrajzi helye, a választó térképei | `data/helyek.json` | OSM (Nominatim) + a helyszínrajzok eltolása |

**Eszközök** (`tools/`, mind dokumentált docstringgel):

- `tervtar-leltar.py` — az épületadat-táblák (régi `.xls` és új `.xlsx`; a
  parancs a CLAUDE.md „Adatfolyam” szakaszában, a várt eredménnyel)
- `tervlap-epuletek.py` — a 39 épület nyilvántartása, a kar a funkció lapról
- `helyszinrajz.py` — melyik épület hol áll a telephelyen
- `helyek.py` — az épületek földrajzi helye (OSM, a közös telkeken a
  helyszínrajzokból) és a választó térképei; a Nominatim-válaszokat
  gyorsítótárazza, és a Nominatim szabálya szerint másodpercenként legfeljebb
  egyszer kérdez
- `tervlap-uj.py` + `epulet-json.py` + `tervlap-batch.py` — geometria a
  tervlapokból, üres lapról, önkalibrálóan
- `epulet-ellenoriz.js` — betölti az appot, végigvált minden megnyitható
  épületen, és megmondja, hány helyiséghez van út a portától. Mérőeszköz, nem
  teszt (mindig 0-val lép ki); ugyanezt a számot a `tests/epuletek.js`
  aranyértékként őrzi.
- `pages-csomag.js` — a Pages-re publikált csomag engedélylistája

## Mi van hátra, sorrendben

### 1. A kivágó két hibája — ez nyit ki a legtöbbet, és ez kell a küszöb előtt

A 26 épületből 24 geometriája kijött. A mérőszám: a helyiségek hány
százalékánál egyezik a kivágott sokszög területe a tábla pecsétjével ±3%-on
belül (`tervlap-batch.py` kimenete, `_osszegzes.json`, `arany3` mező; a fájl
nincs a repóban, újrafuttatással áll elő, és bájtra nem azonos).

| ±3%-on belül | épületek |
| --- | --- |
| 100% | TN, TT |
| 89–96% | FF, FK, OC, KH, KB, KT |
| 80–86% | YC, KP, OB, BF, TB, TA, BB |
| 70–79% | TG, BA, YB, FG |
| 70% alatt | YA (69,6%), FC, FS, TC, OM (41–66%) |

A megnyitott hat (az OA-n kívül) gyakorlatilag a ≥89%-os sávból jött (OD
93,1%, OC 93,0%, KH 91,3%, KT 89,1%) — nem „az OD 94%-ához mérve”, ahogy itt
korábban állt. Küszöbönként (ahol porta is van): ≥89% → 6, ≥80% → 12, ≥70% →
15, ≥60% → 17 épület. **Mielőtt a küszöb lejjebb megy, két hibát kell
javítani**, mert a lentebbi sávokban mindkettő gyakoribb:

- **A kivágó felső korlát nélkül fogad el sokszöget.** A legkisebb
  területhibájú jelöltet akkor is elfogadja, ha a hiba többszörös, és mivel a
  folyosókat vágja ki utoljára, egy rosszul kivágott apró helyiség elnyeli a
  folyosó szabad terét. A **KB-t ez tartja vissza** (nem a portája: a KB00F01
  rendben kijön, 6,91 m² a 6,96-ból): a 2–6. emeleti folyosók elvesznek, és a
  helyiségek ~12%-ához van út. **A már megnyitott KT-ban is benne van**: 19
  helyiség hibája >50%, négy emeleti folyosó (KT10EK5–KT40EK5) a valósnak
  ~6,8-szorosa, és 47 útvonal az
  épületen kívüli területen vagy a belső udvaron vezet át. Egy 50%-os
  elvetési küszöbbel a KB-ban 450/485 helyiséghez van út, de ára van:
  lavinaszerűen hat (az elvetett helyiség után a következő viszi el a
  folyosót), és az elvetett helyiségek a térképről és a keresőből is
  eltűnnek (KB 34, KT 26, KH 4). A jó javítás valószínűleg az, hogy a
  folyosó a kivágásban előbb kapja meg a helyét.
- **Az azonos kódú pecsétek összemosódnak.** Az OC 4. emeletén két helyiség
  viseli az OC40E23 kódot (FFI PISZOÁR 3,69 m² és RAKTÁR 7,52 m²): a kivágó a
  bal felsőt tartja meg (a piszoárt), a név a táblából kód szerint jön (a
  raktáré) — így a piszoár halványított raktárként áll a térképen, a raktár
  hiányzik. A leltár `dupla_kod` listája szerint nyolc épületet érint, a
  küszöb alatt bejövők közül a TA-t (öt-öt WC-fülke egy kódon), a BF-et, a
  KD-t, az OM-ot, a TG-t és az YB-t.

### 2. A BD és a KD

Nem programhiba, ahogy itt korábban állt: a két lap más formátumú, és az
eszköz szándékosan kilép („egyetlen lapon sincs falkitöltés”; a korábbi
változatnál ez `min() arg is an empty sequence` kivétel volt). A BD PDF-jében
egyetlen réteg sincs, a KD-ben a falak nincsenek kitöltve, csak körvonal és
45°-os sraffozás — a `tervlap-uj.py` kommentje, hogy fehérrel kitöltöttek,
téves. Az átnézés során egy javítással mindkettő lefutott (arany3: BD 63%,
KD 70%), de navigálhatónak még egyik sem jó.

### 3. Porta nélküli épületek

- **TN, TT**: a geometriájuk hibátlan (100%), csak portájuk nincs. Apró
  melléképületek (8 és 19 helyiség), ahol az `ELŐTÉR` (TN00F01, TT00F13,
  TT00F16) szinte biztosan a bejárat. Az OD-ben azért nem fogadtuk el az
  ELŐTÉR-t, mert ott a mosdók előtere volt az — itt más a helyzet. Egy döntés
  kell hozzá. Figyelem: az `index.html` `PORTA` melletti kommentje szerint itt
  „egyetlen bejárat-szerű helyiség sincs”; ez a porta-szabályra (PORTA >
  ELŐCSARNOK > AULA > SZÉLFOGÓ) igaz, az ELŐTÉR-re nem.
- **BB, TC, YB**: ezeknél valószínűleg nincs saját bejárat. A BB a BF–BA–BB,
  a TC a TA–TC komplexum része: a szomszéd épületen át lehet bemenni, ami
  **épületek közti útvonal** lenne — az app ma minden épületet zárt világként
  kezel. Az YB egyetlen szélfogója a IV. emeleten, a könyvtárban van.

### 4. A kimaradó helyiségek

A megnyitott épületekben 48 kódolt helyiséghez nincs út a portától (a
kötés javítása előtt 68, az IFC-ajtók előtt 57 volt; az alábbi felsorolás az
ajtók előtti állapotot írja, azóta elérhető az OD nyugati szárnya és az
`OD00F03`, az FF-ben kettő és az OC-ben egy helyiség). Az ajtók előtt ebből 26 pinceszinti (`X1`,
`X2`): az OD −2. szintje teljesen elvágva, az FF, FK, KH pincéje részben, az
OA-ban egy alagsori helyiség. A KH földszintjén hat helyiség (`KH00F36`–`F39`,
`F41`, `F42`) a homlokzat felőli oldalon áll, és a maszk csak a homlokzat
előtti gyűrűn és az ablakréseken át érné el őket — oda a kötés szándékosan
nem köt. A KT-ben és az OC-ben viszont egy sem pinceszinti. A KT-ben a földszinti TMK-blokk (három műhely, közlekedő, mosdó, öltöző, zuhanyzó) és
egy I. emeleti szoba (`KT10E99`): az előtere és a WC-je a kötéssel elérhető
lett, maga a szoba az előtéren át nyílik — ez `via`-adat volna, nem kötés. Az
OC-ben egy földszinti mosdóblokk (NŐI WC, BETEG WC, KÉZMOSÓ, ELŐTÉR) és két
üzemeltetési helyiség (KAPCSOLÓTÉR, ELMŰ). Ez tehát nem
egy ok — épületenként a hiányzó nyílást vagy lépcsőt kell megtalálni, és
utána a `tests/epuletek.js` aranyértékét átírni.

Az **OD**-ben az ok nem egy hiányzó nyílás. A −2. szint lépcsője megvan, de a
−1-es vége 8,9 m-re esik a járható maszktól (a `nodesOf()` 7 m-nél
kiejti). A kilenc elvágott földszinti helyiségből hét a nyugati szárny 123
cellás foltjában áll — a szárny `OD00FK4` közlekedője megvan és járható,
csak semmi nem köti a fő hálózathoz (köztük a könyvtár helyiségei állnak, a
bejárata valószínűleg azokon át vezet: `via`- vagy ajtóadat) —, az `OD00F03`
a saját, 33 cellás foltjában, a fő hálózatot csak a sarkánál közelítve meg,
egynek (`OD00F28`) pedig 6 m-en belül cellája sincs. Ugyanígy esik ki a
földszint–félemelet közti 2-es lépcső (`OD00F15` ↔ `OD05E04`), aminek
elérhetőségi hatása nincs.

**Javítva (2026-10-21): a kötés.** Két OD-helyiség — az `OD00F02` rajzterem
és az `OD35E04` iroda — a fő folyosó mellett áll (a fő hálózat cellái a
sokszögüket érintik), mégsem volt elérhető: az `epuletRcell()` ajtóadat
nélkül a csúcsokhoz legközelebbi cellához kötötte őket, és az egy leszakadt,
4, illetve 32 cellás szilánkba esett. Most ha a cella nincs a fő
úthálózaton, a régi cella mellé a fő hálózat legközelebbi cellája is
bekerül, ha egy élétől (nem a sarkától) legfeljebb egy falnyira (1,2 m) van,
és onnan a szintjén az épületen belül is el lehet jutni a portáig vagy egy
lépcsőig. Ez 11 helyiséget kötött be (OD 2, FK 2, KH 4 — köztük a két
tetőtéri vizes helyiség —, KT 3), az OC-ben egyet sem; a helyiségpárok közti
utakból egy sem veszett el, és az OA kötései mérve azonosak maradtak. Az első
változat a KH-ban még három szobát a homlokzat előtti gyűrűn és ablakrésen át
kötött be; ezt az átnézés fogta meg, és a teszt most külön méri. A részletek
a CLAUDE.md-ben. Az OD maradék 12 helyisége az adaton múlik, nem a kötésen
(lásd fent).

Ami elérhető, az is mehet rossz úton, ha a rács kettévág egy szintet: a **KT
földszintje** ilyen. A portától (KT00F22) a földszinti női és férfi mosdó
légvonalban 37–40 m, az útvonal mégis a II. emeleten át vezet (44 m, 122 s,
0→1→2→1→0), ezért a mosdóválasztó az I. emeletieket ajánlja. Valószínűleg itt
is egy hiányzó nyílás; a tervlapon kell megkeresni.

Rossz úton megy az is, ami **az épületen kívül fut**: a kinyert maszkon a
homlokzat előtt egy cella széles járható gyűrű van, és a Dijkstra ezt is
használja. Mérve (pontos geometriával, mint a `tests/epuletek.js`, a
portától): a KH-ban 11 földszinti helyiség útvonala fut 1–45 cellányit
(legfeljebb ~20 m) a homlokzat előtt (pl. `KH00F01`, `KH00F40`,
`KH00F43`–`F45`); az FK-ban minden útvonal a porta utáni 4 cellán (a
bejárat sokszög nélküli előtere), a pincei `FKX1P11` és `FKX1P12` pedig
hosszan is. Az OA-ban, OD-ben, FF-ben, KT-ben és OC-ben egy sem. A gyűrű a
kinyerés mellékterméke; a javítása az eszközben van (a maszkot a helyiségek
és falak burkára kell vágni), nem az appban.

### 5. Amit csak ember tud megszerezni

- **A KG épületadat-táblájának ép példánya.** A
  `forras/oe_tervtar_kh_gyumolcs_u_lebenyi_kollegium.xls` a neve ellenére a
  KG épületé (a kiolvasható kódok mind KG-k), és sérült: a szövegtáblája 1235
  stringet ígér 3299 bájtban. Excelből `.xlsx`-ként újramentve használható. (A
  `tervlap-epuletek.py` a fájlnévből KH-nak sorolja — javítandó.)
- **BC és NB épületadat-táblája** — tervlapjuk van, táblájuk nincs, ezért
  helyiségnév, funkció és alapterület nélkül maradnak.
- **FC, FS, NA, NB helyszínrajza** — egyik lap sem fedi le őket.
- **NA/UV**: a nagymarosi épület tervlapja `oe-na_…`, a táblája viszont `UV`
  kódokkal dolgozik. Ha ugyanaz az épület, egy sorral összeköthető.
- **Liftek.** Liftfülkét egyik tervlap sem jelöl, liftre utaló helyiség
  viszont több épületben van: liftgépház vagy liftkapcsoló az OD-ben
  (OD50E02), az OC-ben (OC50E03) és a KT-ban (KT00F05), „LIFT” nevű helyiség
  az YA-ban (YAX1PK0), „FELVONÓ ELŐTÉR” a KB-ben, liftelőtér és gépház az
  YB-ben; a KP-ben az `epulet-json.py` fel is vett egyet. Hogy hol áll a
  fülke, és használhatják-e a hallgatók, az helyszíni ellenőrzés kérdése —
  addig ezekben az épületekben nincs lépcső nélküli útvonal, és az app ezt
  meg is mondja.
- **Ajtók**: 2026-11-ben megjött 14 IFC (OD, FF, FK, OC, OB, FC, FS, YC,
  TA-TC, TB, TG, TT-TN, CS3, CS6; a feltöltött fájlok, nem a repóban). A
  négy megnyitható épületben (OD, FF, FK, OC) az ajtók, a `via` és a
  lépcsőkarok már ezekből jönnek (`tools/ifc-epulet.py`, CLAUDE.md „Ajtók más
  épületben”). A KH-nak és a KT-nak nincs IFC-je: ott az útvonal a
  legközelebbi cellánál ér véget, vagy ha az leszakadt foltban áll, a fő
  hálózat egy falnyira eső cellájánál. A CS3 és a CS6 nincs a 39 épület
  nyilvántartásában.

### 6. Amit a mostani forrásokból sosem lehet megcsinálni

Hat épületnek (FA, FB, KM, SA, SB, SC) csak helyszínrajza van — a helyük
megvan, több nem nyerhető ki belőlük. Az UV-nek csak táblája van (valószínűleg
azonos az NA-val).

### 7. Termékoldali kérdés

Az app ma nem ismeri a „megrajzolt, de nem navigálható” állapotot: az
`epuletKesz()` lépcsőt és portát is megkövetel, tehát egy épület vagy teljesen
megnyílik, vagy adatlap marad. Ha a porta nélküli vagy tábla nélküli
épületeket legalább *nézegetni* lehetne, az külön üzemmód — nem nagy munka,
de új funkció.

### 8. Ismert, még javítatlan hibák (átnézés, 2026-10-19)

Ezek az átnézésben megerősített hibák, súlyosság szerint; egyik sem az OA
alapműködését érinti.

- **A választott épület nincs a címben**: újratöltéskor, a lap eldobása vagy
  a PWA újraindítása után az alapértelmezett épület jön (ha nincs beállítva,
  az OA), nem az utoljára nézett (a kiválasztott terem kódja visszavisz).
  Totem módban ez helyes; máshol az alapértelmezett épület enyhíti.
- **A Büfé gomb csak a pontosan „BÜFÉ” nevű helyiséget ismeri**: ma az OA-ban
  és az FK-ban (`FKX1P10`) van kint, a KT kávézója (és más néven futó büfé)
  nem számít.
- **Apró OA-ra szabott szövegek**: a megosztás szövege más épületben is
  „· OA épület”; a lapcím és a manifest mindenhol OA; az FF-ben a portának
  vett szélfogó is „Porta”; az F01–F09 rövid kódra írt OA-szabály más
  épületben is teljes kódra cseréli a feliratot; a jelmagyarázatból hiányzik a
  kollégiumok SZOBA kategóriája. (A forrássorban álló munkafájlnév — „FF-geo.json”
  — javítva: az öt gépi kinyerésű épületnél a Tervtár áll, az eszköz is ezt írja.)
- **Totem `?totem` `from` nélkül** épületváltás után nem áll vissza a totem
  épületére (a dokumentált alak `?totem#from=…`, azzal jó).
- **Telefonos költség más épületben nincs mérve**: a KT (513 helyiség)
  relatív mérésben többszörösen lassabb az OA-nál, az OD 9 szintjével Épület
  nézetben képkockánként 12 renderpass van (OA: 10). A `tests/perf.js` és a
  `meres.html` csak az OA-t méri.
- **Adat- és eszközapróságok**: a `data/epuletek.json` `osszes.navigalhato`
  mezője 28 (a tervlappal és leltárral rendelkezők), nem a megnyithatók
  száma; a kinyerés bájtra nem reprodukálható, az `od.json` metaadata
  kézzel írt, a `kh.json` és a `kt.json` `--tag 0.6`-tal készült (az OD az
  alapértelmezett 0,35-tel); a `tervtar-leltar.py` a kétszárnyú munkalapnévből
  a C-szárny szintjét veszi (TA); a `forras/kivonat/leltar-jelentes.txt` első
  sora egy helyi Windows-útvonal; a session-start hook verzió nélkül ~500 MB-ot
  tesz fel (a pymupdf 2.0-s főverziója az onnxruntime-ot is behúzza).
- **A CI csak a statikus őrt futtatja.** A deploy előtt a `pages-csomag.js`
  ellenőrzése fut (tiltott fájl, a service worker készlete, a lapok
  hivatkozásai, a megnyitható épületek adatfájlja), a böngészős
  `tests/csomag.js` nem. Amit csak egy futó app kér le, és egyik lap sem
  hivatkozik rá szövegesen (egy JS-ben összerakott útvonal), azt csak a
  böngészős teszt látja; ma minden futásidejű fájl a csomagban van.

## Döntések, amik már megszülettek

Ezeket ne kelljen újra végiggondolni:

- **Az OA adata beégetve marad**, a többi épületé `data/epuletek/<kód>.json`-ból
  jön. Így az offline indulás és a „egy fájl az egész app” elv sértetlen, és
  az OA-ra hálózat nélkül is vissza lehet váltani.
- **A `navigalhato` azt jelenti, hogy az app adata kész**, nem azt, hogy van
  tervlap. A `tervlap-epuletek.py` abból állítja elő, hogy létezik-e a
  `data/epuletek/<kód>.json` — nincs kézi lista. A portát viszont kézzel kell
  felvenni a `PORTA` táblába: nélküle az épület a listán megnyithatónak
  látszik, kattintásra pedig „nem érhető el” üzenetet ad.
- **Hiányos adattal nem váltunk.** Falak nélkül a Dijkstra mindenen átmenne,
  lépcső nélkül a szintek nem érnének össze, porta nélkül a gyorsgombok rossz
  helyről indítanának. Inkább maradjon adatlap.
- **A portát nem találjuk ki.** Ahol a tervlapon van „PORTA” nevű helyiség, az
  a porta; ahol nincs, a bejárati tér (ELŐCSARNOK > AULA > SZÉLFOGÓ). A
  földszint alatti szint is számít: az OA portája maga is alagsori.
- **A források a `forras/`-ban vannak, a nyilvános oldalra csak egy
  engedélylista kerül** (`tools/pages-csomag.js`): az app, a service worker, a
  manifest, a mérőlap, a betűk, az ikonok és a `data/` futásidejű fájljai.
  Minden más — `forras/`, `docs/`, `CLAUDE.md`, `tools/`, `tests/` — kint
  marad. **A `forras/` benne van a git-történetben**: ezt a repót nyilvánossá
  tenni, forkolni vagy a történetével együtt nyilvános repóba tolni tilos.
  Hogy a `forras/` itt maradjon-e, azt a felhasználó dönti el.
- **A forrásbeli elírást jelentjük, nem javítjuk** (pl. a `bf-ba-bb` lapon
  „Biztonságtecnikai”).
- **Más épületben semmi nem állíthat OA-ra szabott dolgot**: a szint neve az
  épület saját szintjeiből jön, a foglalható termek (az OA órarendje) csak az
  OA-ban látszanak, a liftes megjegyzés csak ott szól az FL3-ról, és a nemre
  nem jelölt WC nem „Női” vagy „Férfi” mosdó (CLAUDE.md, „Más épületben az
  OA-ra szabott szöveg és adat hamis”).

## Hogyan indulj

```
git clone <repó>
npm install                               # playwright
pip install -r tools/requirements.txt     # a tools/ szkriptjeihez
npm test                                  # mind a 26 tesztfájl
node tools/epulet-ellenoriz.js            # minden megnyitható épület mérése
```

Felhős munkamenetben a `.claude/hooks/session-start.sh` mindkét telepítést
elvégzi.

## Amibe bele fogsz futni

- **Az élő oldal nem él.** A repó privátra állítása kikapcsolta a GitHub
  Pages-t (ingyenes csomagban privát repóból nem publikálható), ezért a deploy
  a `Setup Pages` lépésnél elhasal, a feltöltés előtt — a `forras/` és a
  leltár ezért nem került ki. Ami kikerült: amíg a Pages élt (az utolsó
  sikeres deploy a 040a474, 2026-10-12), a deploy a munkafát tette ki
  (`path: .`; a `forras/` akkor még nem volt a repóban), a `.git` és a
  `.github` kivételével mindent: a CLAUDE.md-t, a README-t, a `docs/`-t, a
  `tools/`-t, a `tests/`-et, a `.claude/`-ot, a `package*.json`-t és a
  `data/rooms.json`-t, bennük a belső forrásfájlok nevét és leírását. Az oldal visszaélesztéséhez a Pages-t be kell
  kapcsolni egy olyan csomagon, ami privát repóból is publikál — vagy a
  `tools/pages-csomag.js` csomagját külön, nyilvános repóba tenni, friss
  történettel. Az új helynek azt a címet kell adnia, amit a kiragasztott
  QR-matricák és a totemek kódolnak, különben azok halott linkre mutatnak. A
  deploy-napló szerint a kiszolgált cím az `oemap.maydayprod.app` saját domain
  volt (a repó homepage-mezője is ez); a régi `mayydayy99.github.io/oemap/` a
  repó `mos-eisley` alá kerülésével megszűnt, ebből a repóból nem is
  szolgálható ki. Melyik van a matricákon, azt meg kell nézni: a `make-qr.py`
  docstringje a saját domaint írta, a README nyomtatási példája korábban a
  github.io-sat. A kiesés alatt még a
  régi service worker fut, amelyik a 404-oldalt eltette: a telefonok a
  visszaállítás után maguktól rendbe jönnek, **a totemeket viszont kézzel újra
  kell tölteni**. Ha az app elköltözik, **a régi címen maradjon átirányítás**
  (vagy egy önmagát törlő `sw.js`): az új service worker a 404-re a tárolt
  appot adja, a telepített kliensek egy szó nélkül megszűnő cím mögött örökre
  a befagyott appot futtatnák.
- **A `git push`-t a jogosultság-ellenőrző letilthatja** („Out-of-Place
  Publication” vagy „Data Exfiltration”), mert a `forras/` belső dokumentum.
  Ez az ellenőrzés jogos. Ilyenkor a felhasználó hagyja jóvá az adott pusht;
  ne vegyél fel általános push-engedélyt, és ne szerkeszd ennek megkerülésére
  a beállításokat.
- **A `.git` ~215 MB**, ebből ~132 MB a `claude/ingatlan-teremlapok-b` ág
  teremfotói (az egyetem nyilvános teremlapjairól; a `main`-be sosem
  kerültek be). `git clone --single-branch -b main` jóval kisebb; az ág
  törlésével a teher megszűnik.
- **Nyelvhatár**: a kód, a kommentek és a dokumentáció magyarul, a **commit
  üzenetek angolul**. A commit szerzőjének e-mailje `noreply@anthropic.com`
  legyen, különben a push e-mail-védelmi hibával visszapattan.
- A geometria-kinyerést eddig egy külön helyi munkamenet végezte; az eszközei
  (`tervlap-uj.py`, `epulet-json.py`, `tervlap-batch.py`) commitolva vannak,
  tehát a munka onnan folytatható, ahol abbamaradt.

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
npm test             # mind a 11 tesztfájl
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
| `tests/gestures.js` | csippentés, forgatás, tolás, a kétujjas felemelés — **élesben bejelentett fagyás** és „csúnya átmenet" |
| `tests/labels.js` | teremszámok Épület nézetben: ott vannak, állnak, a termük fölött, élből nézve is, és nem villognak |
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
az érték a dőléstől függ, ezért a `syncFloors()`-t a gesztus `paint()`-je
is hívja képkockánként, és a `.navving .floor{transition:none}` nélkül a
0,55s-os áttűnés minden képkockán újraindulna.

**A ritkás aktív szint elveszhet az alatta lévők fölött.** Az alatta lévő
szintek nem takarnak, de vizuálisan elnyomhatják az aktívat: a Félemelet 9
apró pihenője (160 m², mind szürke közlekedő vagy halványított raktár) nyom
nélkül eltűnt a földszint 1733 m²-es födémje fölött — ezt jelentették úgy,
hogy „bizonyos szögnél eltűnik az alaprajz". Ezért Épület nézetben az aktív
födém akcentszínű kontúrt kap. A környezet halványítását is kipróbáltuk,
de a felső szinteknél szétfolyt tőle az épület formája. Tanulság a
méréshez: `elementsFromPoint` 3D-ben megbízhatatlan (a rajzolt szintet is
„hiányzónak" mondta), és egy szint minden eleme (födém, SVG, doboz) külön
szerepel a veremben — szintenként egyszer, csak a `.hit`-et számold.

**Egy kamera, két állás.** Az Alaprajz ugyanaz a 3D-s jelenet, egyenesen
felülről nézve (`rotateX(0)`), így a nézetváltás mindkét végén ugyanaz a
függvénylista áll, és a böngésző a dőlést és az irányt külön úsztatja át.
Eltérő listáknál (`rotate()` ↔ `rotateX() rotateZ()`) mátrixként
interpolálna. Nyugalomban viszont az alaprajz LELAPUL (`flat`, sima
`rotate()` + `.flat2d`) — ugyanaz a kép, de 3D kontextus nélkül, és ezen
múlik a telefonos 76 fps. A `setMode()` a lapos formából előbb a vele azonos
3D-s formára vált (`setWorldInstant()`, áttűnés nélkül), a `syncFlat()` az
átmenet után vissza. A `tests/view.js` a böngésző saját kulcskockáiból
ellenőrzi, hogy a váltás tényleg azonos formákon megy.

**Nézetváltás közben SVG-n BELÜL semmi nem animálhat.** A szintdoboz
(`.floor`) és a világ saját kompozitor-rétegen mozog: a böngésző egyszer
megrajzolja, utána csak tologatja. Ha viszont az SVG egy belső eleme áttűnik
(`.rooms`, `.walls`, `.slabsh`, `.glabel` átlátszósága, vagy a pulzáló
`.ring`), az egész szintet újra kell festeni minden képkockán, amíg tart — hét
szinten, a mozgás közepén. Ez volt a döccenés: a böngésző saját nyomkövetése
szerint 500–600 ms-nál 70–84 ms raszterezés esett a mozgás közepére. A
`markSwitching()` a váltás idejére felteszi a `.switching` osztályt, ami
ezeket azonnal ugratja, a gyűrűt megállítja. Azóta az animáció alatt a
raszterezés telefonon 0–5 ms. A `tests/view.js` ezt elvként kéri számon, nem
CSS-tulajdonságként: a `getAnimations()` szerint a váltás alatt semmi nem
futhat SVG-n belül — ha új belső animáció kerül be, az is pirosra fut.

Tanulság a korábbi próbálkozásból: előbb `contain:paint` került az SVG-re.
Az elszigetelte a koszolódó rétegeket, és javított is, de tünetkezelés volt:
a levételekor újabb raszterezés jött, közben pedig textúraként elmosta a
nagyítást. Az ok megszüntetésével egyikre sincs szükség. **Teljesítménynél
ne a képkockaidőt nézd, hanem a raszterezés időbeli eloszlását** (CDP
`Tracing`, `RasterTask` események a váltáshoz képest): az mondja meg, hogy a
munka a mozgás közepére esik-e, és ez a mérés a szoftveres renderelőn is
megbízható.

Asztalon még marad raszterezés a mozgás első felében: ott `SS=2`, szintenként
1314×1600 px, és az újonnan láthatóvá váló szinteket a böngésző nem tudja egy
képkockában megrajzolni. Ennek teljes megoldása az `SS` csökkentése lenne, ami élességbe
kerül — lásd `docs/NYITOTT-KERDESEK.md`.

**A mérőkörnyezet szoftveres.** A tesztböngésző SwiftShaderrel fut, GPU
nélkül. Teljesítménymérésnél az abszolút számok jóval rosszabbak egy valódi
eszköznél, és a rétegpromóciós trükkök hatása is eltérhet — a RELATÍV
összehasonlítás megbízható, az abszolút nem.

**Az Alaprajz is forgatható**, két ujjal csavarva. Az irány (`bearing()`,
vagyis `rot.z`) a két nézetben KÖZÖS, és az alapállása 0: a tervlap rajzolt
állása. Egy kamera dőlése nem forgatja a képet. Korábban az Épület nézet
−30°-kal elforgatva, izometrikusan indult, és a kétujjas felemelés első
pillanatában ennyit ugrott a kép. **Nyugvó alaprajzon sima `rotate()`
megy, nem `rotateZ()`** — az utóbbi 3D kontextust kérne, és elvinné a
`.flat2d` lapos gyorsútvonalát, amin a telefonos 76 fps múlik (a váltás
idejére ettől eltérünk, lásd „Egy kamera, két állás"). A `projBBox()` ugyanezt a
`bearing()`-et használja, különben a ⤢ az elforgatott tervlapra rosszul
illesztene.

**A kétujjas döntés kizárja a többi mozdulatot.** Ugyanaz a függőleges
elmozdulás tolásnak is olvasható, ezért a `pinch.lock` az első határozott
mozzanatnál eldől (`"tilt"` vagy `"map"`), és a fogás végéig ott marad. A
küszöbök (`TILT_TAKE`, `TILT_SKEW`, `PINCH_BAND`, `PAN_TAKE`) ezt a döntést
teszik határozottá — ha lazítasz rajtuk, a döntés elkezdi ellopni a tolást és a
csippentést. A `tests/gestures.js` három állítása pont ezt méri, és mindegyik
ferde vagy függőleges összetevőt is tartalmazó mozdulatot játszik le: egy
tisztán vízszintes húzást a „mindkét ujj azonos irányba, függőlegesen" feltétel
egyedül is elintézne, és a küszöbök meglazulása észrevétlen maradna.

**A döntés nézetet vált, és ez az egyetlen gesztus, ami ezt teszi.** Alaprajzról
felfelé húzva `setMode(3,true)` emel át — a `keepView` ág azért kell, hogy a
`fit()` ne rántsa ki a térképet a kéz alól. Vissza csak az ujjak felemelésekor
kapcsol, nem menet közben: a határon különben billegne a két nézet közt. A
visszakapcsolás a `.navving` levétele után fut, hogy a szintek összezáródása
átúszhasson.

**A felemelés folytonos, 0°-ról indul.** Élesben jelentett hiba volt, hogy
„csúnya az átmenet": a felemelés 15°-on indult, a kép 30°-ot fordult, a többi
szint egy csapásra bukkant elő, és a sík az épület közepe körül billent. Ami
most ezt adja, és amit ezért ne bonts meg:

- Az alaprajz maga a 0°-os kamera. A lezáráskor a `rot.x`-et a `setMode()`
  ELŐTT nullázzuk, különben a váltás egy képkockát még a régi 58°-kal írna ki.
- Minden „3D-sség" a dőlésből jön, nem a módból: a `reveal()` 0 és 15°
  (`REVEAL_DEG = TILT_MIN`) közt nyitja szét a köteget. Félúton (`DEEP_AT`)
  billen át a 3D-s megjelenés (`.deep`: kontúr, árnyék, szintfeliratok, a
  síkbeli feliratok helyett az álló teremszámok), és a többi szint is csak
  innen úszik be. A kettő szándékosan egy ponton van, mert mindkettő
  rajzolással jár — a `.deep` az SVG-n belül vált, a beúszó szinteket pedig
  most kell először kifesteni. Így a mozdulat alatt egyszer kell rajzolni, és
  a felemelés első fele olyan olcsó, mint maga az alaprajz. A 15° fölötti
  nyugvó állásokon mindez már teljesen kinyitva áll, ott semmi nem változott.
- A félúti határ kétirányú: fölfelé 7,5°-nál (`DEEP_AT`) billen át, lefelé
  csak 5°-nál (`DEEP_OFF`) vissza. Egyetlen határon a remegő ujj minden
  képkockában át-vissza billentette, és vele villogott a kontúr, az árnyék és
  a teremszámok (élesben jelentették: „bizonyos szögben villog").
- A sík az ujjak alatti pont körül billen, nem az épület közepe körül:
  nagyítva az utóbbi messze a képen kívül lehet, és a látott részt
  százpixelnyit elhúzta volna. A `planeAt`/`viewKeeping` a böngésző saját
  leképezését számolja vissza (`camK`/`screenOf`: a világ
  `translate·scale·rotateX·rotateZ` transzformja, utána a színpad
  perspektívája); ugyanebből kapják a helyüket a teremszámok is. Ha ehhez a
  lánchoz nyúlsz, a leképezést is vidd.
- A döntés felismeréséig megtett tolás marad, nem rántjuk vissza, és a
  lezáró mozdulatot még a két ujj szerint vesszük át: az események ujjanként
  jönnek, és csak az első ujjéig jutva fél lépést ugrott volna a kép.
- Elengedve oda úszik, aminek a kép épp mutatja magát, ezért a `.deep`
  állapota dönt, nem a szög: nélküle vissza Alaprajzra — pontosan oda,
  ahonnan felemelted —, vele föl 15°-ra.

Mérve (CDP `Tracing`, SwiftShader, tehát csak arányaiban): a régi felemelés
a lezáráskor egyszerre rajzolt mindent, telefonprofilon két 130–140 ms-os
lépéssel. Az új az elején csak az aktív szintet rajzolja újra (a lapos
útvonalról 3D-be lépve, ~14 ms), a többit a `.deep`-nél, három-négy lépésre
elosztva, utána semmit; a lépésidők átlaga telefonon és asztalon is a felére
esett. A `tests/gestures.js` a felemelést a síkra tett apró körökkel méri, a
böngésző `getBoundingClientRect()`-jével — nem a kód saját képletével, mert az
a saját hibáját nem látná.

**3D-ben a síkbeli felirat olvashatatlan — ott álló teremszámok vannak.**
Perspektívánál a böngésző a megdöntött szintet a nézet nagyításától független
felbontással rajzolja textúrába: a szöveg nagyítva elmosódott folt, illesztve
pár pixeles. Az első verzió ezért 3D-ben egyszerűen elrejtette a feliratokat,
amit élesben úgy jelentettek, hogy „eltűntek a teremszámok". Most az aktív
szint teremszámai egy lapos, a jeleneten kívüli rétegben állnak (`.tlabels`,
`syncLabels()`), a helyüket a közös leképezés (`camK`/`screenOf`) adja.
Ami ezt működteti, és amit ezért ne bonts meg:

- Gesztus közben (`.now`) a `paint()` képkockánként, a világgal egy írásban
  teszi őket a helyükre. Animált mozgásnál (gomb, illesztés, szintváltás, a
  panel) a világot a kompozitor úsztatja, azt innen nem lehet képkockára
  követni: a mozgás idejére eltűnnek, és a végén úsznak be. Csak ha a kamera
  tényleg mozdult (`camSig`) — különben minden frissítés elvillantaná őket.
- Hogy egy terem elég nagy-e a számához, azt a nagyítás és a mélység dönti
  el, a dőlés és az irány NEM (`placeTlabels()`). Az első változat a terem
  vetületéhez mérte, és élből nézve, ahol a terem vékony csík, a számok
  eltűntek (58°-on 16, 85°-on 1), a határon pedig ki-be kapcsoltak — ezt
  jelentették úgy, hogy „bizonyos szögben villog, és nagyon lapos szögben
  eltűnnek a számok". Most 85°-on is 14–16 marad.
- Élből nézve a számok egy keskeny sávba torlódnak: amelyik egy nagyobb
  terem számával ütközne, az kimarad, így sosem lógnak egymásra.
- Mindkét döntés kétirányú: megjelenni nagyobb terem (15%) és szabad hely
  (6 px) kell, mint ottmaradni, és ami már látszik, azt egy újonnan beférő
  nem szoríthatja ki. Hiszterézis nélkül a remegő ujj alatt 24 lépésből
  120-szor kapcsoltak; bármelyik egyedül is elég, együtt biztos. Egy
  időzítős várakozást is kipróbáltunk, az mérhetően nem segített, ezért
  nincs benne.
- A kép szélén a szám a térképpel együtt lép ki és be, a keret levágja —
  ahogy magát a termet is —, ezért addig látszik, amíg bármelyik része bent
  van. Egy változat a szélen is döntött (új szám csak egészen bent), és
  erős nagyításnál a remegő ujj alatt ott ingázott.
- A tesztben villogásnak az számít, ha ugyanaz a szám pár lépésen belül
  újra vált, miközben végig a képen belül áll. A kép szélén át ki-be lépő,
  vagy egy nagyobb terem száma mögé egyszer elbújó szám jogosan vált.
- Mindegyik saját rétegen van (`will-change`), így a mozgatásuk csak
  tologatás. Mérve (SwiftShader) Épület nézetes gesztus közben 30 lépésre
  összesen ~1 ms festést adnak, a lépésidő a mérési zajon belül marad.

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

# OA Épület Teremkereső — fejlesztői jegyzet

Teremkereső és útvonaltervező az Óbudai Egyetem OA épületéhez (Neumann János
Informatikai Kar, Bécsi út 96/b). **Élő oldal:** https://mayydayy99.github.io/oemap/

A felhasználói dokumentáció a [README.md](README.md)-ben van. Ez a fájl azt
gyűjti össze, amit egy új munkamenetnek tudnia kell, mielőtt hozzányúl.

## Két vezérelv

A projekt meetingjén ez a kettő lett kimondva, és minden vitás kérdést ez dönt el:

- **Hallgató first.** Ami nem a hallgatónak szól, az zaj. Ezért van halványítva
  a 223 helyiségből 109 (irodák, üzemeltetés, raktárak, dolgozói területek),
  ezért nincs rektori réteg, és ezért nem indul demó útvonallal az app.
- **Telefon first.** Minden döntésnél a telefon a mérce, nem az asztali gép.
  Ezért indul alaprajzzal (telefonon 76 fps a 3D 13-ával szemben), és ezért
  mobil az alapértelmezett nézet a tesztekben is.

## Felépítés

`index.html` (~410 KB, tömörítve ~113 KB) **maga a teljes alkalmazás** — HTML, CSS és JS egy
fájlban, build lépés és futásidejű függőség nélkül. Ez szándékos: a
GitHub Pages statikusan szolgálja ki, és offline is működik. Az egyetlen külső
fájl a `fonts/`, az `icons/`, a `data/` és a `sw.js`. A `meres.html` nem az app
része: telefonos mérőlap (lásd „Körbejárás közben rejtett felső szintek”).

A beépített `const D = {...}` tartalmazza az épületet:

| kulcs | mi | méret |
| --- | --- | --- |
| `levels` | 7 szint, az Alagsortól (−1) a IV. emeletig (5) | |
| `rooms` | helyiségek: `code`, `name`, `cat`, `level`, `area`, poligon (lyukas helyiségnél bevágással egy gyűrű), `doors`, `via` | 223 |
| `cats` | 15 helyiség-kategória (a színüket a kód `CATS` táblája adja, a tervtári színkulcsból) | |
| `walls`, `masks` | falgeometria és a szint sziluettje | |
| `grid` | a járásrács, ezen fut a Dijkstra | |
| `stairs`, `lifts` | függőleges átjárók a szintek közt | |
| `flights` | lépcsőkarok az induló szintjükön (a fokok körvonala és a járásvonal); csak rajz, az útvonal a `stairs`-en fut | 38 |

Az `S` objektum az egész futásidejű állapot (nyelv, téma, nézet, szint,
honnan/hova, útvonal, forgatás, panelállás). Aki ezt megérti, érti az appot.

## Kipróbálás

```
npm install          # playwright (a böngésző a képen már megvan)
npm test             # mind a 22 tesztfájl
node tests/run.js url share     # csak egy-kettő
```

A tesztek saját szervert és saját böngészőt indítanak szabad porton, így nem
kell előre semmit elindítani. **Fix portot ne használj**: egy ottfelejtett
szerver miatt egyszer egy RÉGI build ellen futottak a tesztek, és zölden
hagytak egy hibás kódot.

| fájl | mit őriz |
| --- | --- |
| `tests/view.js` | alaprajz/épület váltás, szintváltás, kiválasztás valódi egérrel és érintéssel (Épület nézetben is), a falak oldallapja — **élesben bejelentett: asztalon kattintásra nem jött elő a terem** |
| `tests/url.js` | mély linkek, a vissza gomb, hibás link; indulás nélkül a portáról (`START`) tervez — linkből, az „Ide” gombbal, a gyorsgombokkal; a mosdóválasztó (női, férfi, akadálymentes, a dolgozói és a csak más helyiségen át megközelíthető mosdók nélkül) és a büfé gomb célja |
| `tests/share.js` | megosztás gomb mindkét ága |
| `tests/gestures.js` | csippentés, forgatás, tolás, a kétujjas felemelés, akadozó képnél is — **élesben bejelentett fagyás**, „csúnya átmenet" és a vissza nem váltó lefelé húzás |
| `tests/labels.js` | teremszámok Épület nézetben: ott vannak, állnak, a termük fölött, élből nézve is, és nem villognak |
| `tests/lift.js` | lépcső vs. lift alternatíva |
| `tests/sheet.js` | az alsó panel aljának elérhetősége |
| `tests/staff.js` | hallgatói/minden szűrő; a tervtári színkulcs (minden helyiség, a halványított is a saját színében; a jelmagyarázat sorrendje) |
| `tests/termek.js` | foglalható termek: heti órák, páros/páratlan hét, ünnepnap, a félév előtti és utáni nap, a más karral közös termek, a térképen kiválasztott terem adatlapja, a sorrend (ami most szabad, elöl; az indulástól menetidő szerint), és a deploy után a régi service workerben ragadt fájl |
| `tests/pwa.js` | manifest, service worker, **offline indulás**, a teremadat frissessége |
| `tests/a11y.js` | billentyűzetes bejárás, felolvasónak szóló jelölés; a panel és a szintválasztó újrarajzolása, a téma váltása nem dobja el a fókuszt |
| `tests/perf.js` | Épület nézet: képkockánként hány renderpass, a telefon (GPU-s) kódútján — **élesben bejelentett akadozás** |
| `tests/neptun.js` | ajtószámok (Neptun-nevek) a térképen, a keresőben (pont nélkül is: „110”) és az adatlapon; az F06 nem állhat az OA00F03-on (az F09); a földszinten Neptun-névnek látszó tervlapi kód (a büfé „F04”-e) nem állhat feliratként; a foglalható termek listájából a térképre ugrás; a párosító mód (`?parosit`) |
| `tests/ajtok.js` | az útvonal az ajtó előtt ér véget, több ajtó közül a közelebbinél; a csak más helyiségen át megközelíthető termekhez (I. emelet E03–E07, II. emelet E03, E04) is van útvonal, és a lépések kiírják, min át |
| `tests/lepesek.js` | az útvonal lépései: a lépcsőzés egy lépésben, nevén nevezett célszinttel („Lépcsőn fel a II. emeletre”, angolul „…to the 2nd floor”), a félemelet fél emelet, a cél az ajtószámmal |
| `tests/eler.js` | minden helyiséghez van-e út (lépcsőn a portától, lifttel a földszintről); a kivételek listája két irányba szigorú |
| `tests/lepcsok.js` | a lépcsőkarok rajza: minden lépcsőház minden szintváltásánál ott a kar, karonként egy kis path a falak alatt, és a vonalára kattintva a lépcsőház jön elő, nem törlődik a kijelölés |
| `tests/ikonok.js` | mosdó-, lépcső- és liftjel: minden mosdón és lépcsőházon a jó jel, a teremszám helyett, a feliratpontján; Épület nézetben magonként egy jelvény, alapnagyításon mind kint, teremszámra nem lógva |
| `tests/sharp.js` | Épület nézet asztalon, nagyítva: éles-e a kép, nem mozdul-e a sűrűségtől, nem vált-e mozgás közben, csak az aktív szintnél, telefonon és más motorban nem, Firefoxban a saját kódútján (3D-ben minden szint saját transzformmal, a lapos alaprajzon egyik sem) — **élesben bejelentett „irgalmatlan életlen" asztali 3D, Chrome-ban és Firefoxban, és a Firefoxos „éles, homályos, megint éles" váltás** |
| `tests/totem.js` | totem mód: egy perc tétlenség után alaphelyzet, tíz másodperccel előtte szól, gesztus közben soha, naponta újratölt — a Playwright órájával, percekig várás nélkül; a link végére, a # után írt `?totem` is bekapcsolja — **élesben bejelentett: „nem működik az alaphelyzet"** |
| `tests/kuld.js` | telefonra küldés: a QR-kódot a képernyőképből olvassa vissza (jsQR), a csendzónát és a sérült kódot külön méri, sötét témában is; a beolvasott link telefonon ugyanazt az útvonalat nyitja meg, lifttel; a totemről `?totem` nélkül |
| `tests/meres.js` | a telefonos mérőlap (`meres.html`) végigfut a valódi appon |

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
szint falai alatt világos oldallap van, amitől kiemelkedőnek látszanak (lásd
lejjebb). Előtte akcentszínű kontúr tette ezt, de az minden falat élénk
kékkel húzott ki, és élesben tolakodónak találták. A környezet halványítását is kipróbáltuk,
de a felső szinteknél szétfolyt tőle az épület formája. Tanulság a
méréshez: `elementsFromPoint` 3D-ben megbízhatatlan (a rajzolt szintet is
„hiányzónak" mondta), és egy szint minden eleme (födém, SVG, doboz) külön
szerepel a veremben — szintenként egyszer, csak a `.hit`-et számold.

**A falak kiemelése a szint saját rajzában van, nem külön 3D-s rétegben.**
Egy ideig valódi, kiemelkedő fal volt: a fal alakja ötször, egymás fölötti
3D-s rétegekben. A szoftveres tesztböngészőben ez 10–15% lépésidőnek látszott,
telefonon viszont akadozott tőle az Épület nézet, és a lassú képkockák a
kétujjas döntést is elrontották (élesben jelentették). A GPU-s kódúton látszott
az ok: **minden raszterezett 3D-s sík egy külön renderpass** — egy teljesen
átlátszatlan is —, és a kép 10 helyett 15-ből állt össze. Csempés telefonos
GPU-n a renderpass a legdrágább dolgok egyike. A `tests/perf.js` ezt
számolja: Épület nézetben szintenként egy és még három, alaprajzon kettő.
Egy üres, egyszínű sík ingyen van; ami raszterezett tartalmat hordoz, nem.

Most a falak alatt világos oldallap van (`bandOf()`): a fal alakja a néző felé
— a tervlap +y irányába, ami alapállásban lefelé esik — végigsöpörve, a szint
SVG-jében. Alapállásban (58°) ugyanúgy néz ki, mint a valódi kiemelkedés, és
nincs képkockánkénti költsége. Az ára: nincs rajta dőlésfüggés (a valódi fal
oldala meredekebb nézetben nőne, ez a sáv laposodik), és elforgatva a fal
egyik oldalán marad — ott megvilágított élnek hat.

A raszterezés olcsósága itt a döntő, mert **Épület nézetben forgatás közben a
böngésző a szinteket csempénként újrarajzolja** (a GPU-s úton; a szoftveresen
ez nem látszik), és egy csempe minden path-t feldolgoz, amelyik átfedi. Mérve
(GPU-s út, SwiftShader, körbejárás lépésideje):
- a fal eltolt, körvonalas másolataiból rakott sáv: kétszeres;
- ugyanez két, az egész szintet átfogó kitöltésként: +20–38%;
- konvex falnál (95%) egyetlen sokszög, a fal és eltolt másolatának burka, és
  a sáv cellákra bontva, cellánként külön path-ban: a mérési zajon belül.
A `tests/view.js` ezért azt is számon kéri, hogy a sáv kis darabokból álljon,
körvonal nélkül.

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
képkockában megrajzolni. Ennek teljes megoldása az `SS` csökkentése lenne. A
nagyított élességet már nem az `SS` adja (lásd a következő pontot), így ez
olcsóbb döntés lett — lásd `docs/NYITOTT-KERDESEK.md`.

**Nagyítva az aktív szint rajza sűrűsödik (asztalon, Chromiumban és Firefoxban).**
Perspektívánál a Chromium a megdöntött szintet nem a nagyításhoz raszterezi:
a perspektivikus ágon (`GetIdealContentsScale`) egy méretkorlát (5×5 csempe a
réteg hosszabbik oldalán) a mi nagy rétegünknél 1 alá vinné a skálát, így az
alsó határ marad, a réteg minden képpontjára egy eszközpixel. A nagyítás ezt
a bitmapet nyújtja fel: asztalon az alapnézet több mint húszszorosáig lehet
nagyítani, és élesben „irgalmatlan életlen" lett a 3D (mérve: az élek
meredeksége a nagyítással arányosan esett, k=8,6-nál a hatodára). A
`syncDens()` ezért nyugvó képen az aktív szint SVG-jének CSS-méretét
d-szeresre veszi (a viewBox marad), a saját `scale(1/d)`-je pedig
visszakicsinyíti: a kép ugyanaz, a textúra d-szer sűrűbb. Amit tudni kell:
- A d a sík legnagyobb nagyítása a képen (`planeZoom()`: a nagyítás és a
  perspektíva nagyítása a kép alsó szélén, ahol a sík a legközelebb van),
  √2-es lépcsőkben, 10% tűréssel. A pixelarány kiesik: HiDPI kijelzőn a
  textúra eleve annyiszor sűrűbb.
- **A Playwright `deviceScaleFactor`-emulációja itt félrevezet:** emulált
  DPR 2-n a textúra CSS-pixelenként egy, valódi DSF-fel
  (`--force-device-scale-factor=2`, `viewport:null`) kettő. HiDPI
  3D-rasztert a kapcsolóval mérj.
- Csak nyugvó képen vált: a mozdulat (`.now`) és a véges animációk végét
  megvárja, mert a váltás a látható szintet újraraszterezi. Csak az aktív
  szintnél, telefonon soha, és csak Chromiumban (`navigator.userAgentData`)
  meg Firefoxban (`mozInnerScreenX`) — a Safarit nem mértük.
- **Firefoxban más a szabály.** Ha az SVG-nek nincs saját transzformja, az
  aktív szintet már alapnézetben is kockásra raszterezi, a falai ki is
  maradnak, nagyítva pedig egyetlen elmosódott folt (k=8-nál az élek
  meredeksége 0,03). Saját transzformmal (akár csak `scale(1)`) a
  Chromiuméhoz hasonlóan viselkedik, de ugyanahhoz az élességhez kétszer
  akkora d kell (`DENS_GAIN`). 3D-ben a transzformot minden szint kapja, nem
  csak az aktív: különben szintváltáskor az új aktív a mozgás végétől a nyugvó
  képig kockás volt (élesben: „váltásnál először éles, utána kicsit homályos,
  utána megint éles"). Ára szoftveres WebRenderen: alapnézetben +7–12%
  körbejárási idő, nagyítva annyi, mint alapnézetben; hogy a többi szint is
  kapja, az a mérési zajon belül van.
- **Firefoxban a lapos alaprajz SVG-je nem kaphat saját transzformot.** Ha
  induláskor kapott (`scale(1)` vagy `translateZ(0)`), a lapos alaprajzon
  (`.flat2d`) a Firefox nem talált bele: a kattintás a szintdobozé lett, a
  teremé nem. Ezért a `syncOwn()` csak a lapos formán kívül adja (a
  `syncFlat()` hívja, a lelapuláskor leveszi, a 3D-be lépéskor visszateszi),
  d=1-nél `translateZ(0)`-val. Nagyított alaprajzon a `scale(1/d)` nem zavar.
  A Chromiumos tesztek ezt nem látják; valódi Firefoxban mérve (lásd
  lejjebb) alaprajzon, nagyított alaprajzon és 3D-ben is a terem kapja.
- **Firefoxot valódi ablakban mérj.** A headless képernyőkép (Puppeteer,
  WebDriver BiDi) a 3D-t nem úgy rajzolja, ahogy a képernyőn látszik: egy
  másik szintet mutatott az aktív helyett. Xvfb alatti ablak kell, a képet
  `xwd`-vel fotózva, a tartalom helye `mozInnerScreenX/Y`. A Firefox a
  `http://ppa.launchpad.net/mozillateam` tükréről tölthető le (a Mozilla
  szerverei a proxyn nem érhetők el), mellé újabb `libnss3` és `libnspr4`
  kell az `archive.ubuntu.com` poolból (`LD_LIBRARY_PATH`), vezérlésre a
  `puppeteer-core` (`browser: "firefox"`). A `tests/sharp.js` a Firefox
  kódútját Chromiumban, álcázott motorral őrzi; a rajzát csak így látod.
- Alaprajzon is a nagyítást követi: ott a böngésző amúgy is a nagyításhoz
  raszterez, a d se a képen, se a költségen nem változtat, 3D-be emelve viszont
  már a helyén van.
- Költség (GPU-s út, SwiftShader, asztal, körbejárás): nagyítva annyi, mint
  alapnagyításon, ~160 ms/lépés. A régi, felnyújtott textúra nagyítva olcsóbb
  volt (77 ms) — kevés texelt kellett mintázni —, és pont ettől volt életlen.
- A sűrűségtől a kép nem mozdulhat: a `tests/sharp.js` a terem helyét is
  méri, nem csak az éleket.

**A mérőkörnyezet szoftveres.** A tesztböngésző SwiftShaderrel fut, GPU
nélkül. Teljesítménymérésnél az abszolút számok jóval rosszabbak egy valódi
eszköznél — a RELATÍV összehasonlítás megbízható, az abszolút nem. **És
alapból szoftveres kompozitorral fut, a telefon viszont GPU-val**: a kettő a
3D-s rétegekkel másképp bánik, és ami a szoftveres úton +10–15%, az telefonon
akadozás lehet (a kiemelkedő falakkal így jártunk). Rétegekhez, renderpassokhoz,
raszterezéshez indítsd a böngészőt
`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
kapcsolókkal: ez a GPU-s kódút SwiftShaderen — lassú, de a szerkezete a
telefoné (`chrome://gpu`: „Compositing: Hardware accelerated"). A
renderpassokat a `DirectRenderer::DrawRenderPass` eseményekből számold
`DirectRenderer::DrawFrame`-enként, ahogy a `tests/perf.js`. Időzítésre se építs: a lapos
alaprajzból 3D-be lépve a hét szint újrarajzolása itt 0,6–1,6 s-ig is
eltarthat (a `main`-en is), és addig egy animáció sem indul el (`pending`,
még a `requestAnimationFrame` is vár). Tesztben a váltás végét a
böngészőtől kérdezd (`getAnimations()` … `finished`), egy köztes állapotot
pedig megállított animációkon mérj (`pause()`, `currentTime`).

**Körbejárás közben rejtett felső szintek — mérve, nem került be.** Az aktív
fölötti szintek halványak, elforgatva viszont a kép nagy részét fedik, és a
körbejárás ideje a renderpassokon múlik. Körbejárás közben elrejtve
(átlátszóság 0) tényleg kevesebb a renderpass (képkockánként 5,4 a 10,1
helyett), és a körbejárás gyorsul (GPU-s tesztút, telefon: 437 → 352
ms/lépés, három kör mediánja). Csakhogy a Chromium a 0 átlátszóságú réteg
csempéit eldobja, és elengedéskor mind az öt szintet újra kell raszterezni: a
tesztúton ez egyetlen 5,3 s-os képkocka, és ha a következő mozdulat ebbe esik,
az 77%-kal lassabb (162 → 286 ms/lépés). `will-change: opacity`-vel és
`visibility: hidden`-nel ugyanígy. Hogy egy valódi telefonon melyik nyom
többet — a gyorsabb körbejárás vagy az elengedés utáni akadás —, azt a
szoftveres GPU nem mondja meg. Erre van a **`meres.html`**: a valódi appot
tölti be, ugyanezt a mozdulatsort játssza le mindkét változattal, és
táblázatba írja (a `tests/meres.js` csak azt őrzi, hogy végigfut). Tanulság a
méréshez: a GPU-s úton a `RasterTask` csak rögzít, a raszterezés a
GPU-folyamatban fut (`RasterDecoderImpl::DoEndRasterCHROMIUM`). A körbejárás
GPU-ideje ~80%-ban `SwapBuffers` (a renderpassok rajza), ~13%-ban
csempe-raszterezés.

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

**A kétujjas mozdulatot képkockánként egyszer értékeljük** (`pinchStep()` a
`paint()`-ben), a két ujj együttes állásán; a `pointermove` csak feljegyzi az
ujjak helyét. Az események ujjanként jönnek, és eseményenként számolva az egyik
ujj már az új helyén állt, a másik még a régin. Akadozó képnél egy lépés
30–75 px, és ettől a fél lépéstől a két ujj távolsága és szöge egy pillanatra
annyit változott, hogy a döntést csippentésnek és csavarásnak vette: élesben a
lefelé húzás alig akart visszaváltani Alaprajzra, amikor a kiemelkedő falak
lelassították az Épület nézetet (mérve: 110 px-re lévő ujjakkal 15 px-es
lépéseknél még váltott, 30 px-esnél már nem; egy 16 px-es fél lépés a
`TWIST_DEAD` 8°-ánál nagyobb szöget ad). Felemeléskor az `end` még a két ujj
utolsó állásán lép egyet, mielőtt az egyik kiesne. A `tests/gestures.js`
ezt nagy lépésekkel játssza le, közeli ujjakkal.

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
  billen át a 3D-s megjelenés (`.deep`: a falak oldallapja, árnyék,
  szintfeliratok, a síkbeli feliratok helyett az álló teremszámok), és a
  többi szint is csak innen úszik be. A kettő szándékosan egy ponton van, mert mindkettő
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
  (6 px, élhez közel 14 px-ig: `pSzam`) kell, mint ottmaradni, és ami már
  látszik, azt egy újonnan beférő nem szoríthatja ki. Élhez közel két
  különböző mélységű szám egy remegésnyi dőlésre egymáshoz képest is 7 px-t
  mozdul (81° és 82,5° közt a földszinti F03 és az aula felirata), és 6
  px-nél minden lépésben ki-be kapcsolt. Hiszterézis nélkül a remegő ujj alatt 24 lépésből
  120-szor kapcsoltak; bármelyik egyedül is elég, együtt biztos. Egy
  időzítős várakozást is kipróbáltunk, az mérhetően nem segített, ezért
  nincs benne.
- A kép szélén a szám a térképpel együtt lép ki és be, a keret levágja —
  ahogy magát a termet is —, ezért addig látszik, amíg bármelyik része bent
  van. Egy változat a szélen is döntött (új szám csak egészen bent), és
  erős nagyításnál a remegő ujj alatt ott ingázott.
- A tesztben villogásnak az számít, ha egy szám egy-két lépésre eltűnik vagy
  előjön (pislog), vagy hat lépésen belül háromszor vált, miközben végig a
  képen belül áll. A kép szélén át ki-be lépő, vagy egy nagyobb terem száma
  mögé egyszer elbújó szám jogosan vált — körbejáráskor az F08 öt lépésig
  takarja az F07-et, amíg elhalad mellette.
- Mindegyik saját rétegen van (`will-change`), így a mozgatásuk csak
  tologatás. Mérve (SwiftShader) Épület nézetes gesztus közben 30 lépésre
  összesen ~1 ms festést adnak, a lépésidő a mérési zajon belül marad.

**Mosdó, lépcső, lift: piktogram a teremszám helyett** (az építészek kérése,
ezeket keresik a legtöbben). Melyik helyiségnek mi jár, azt a neve dönti el
(`iconsOf()`); a lift a tervlapon nem helyiség, a `D.lifts` lépcsőmagjában
jár, ott a lépcső mellé kerül. Alaprajzon a szint rajzában áll, helyiségenként
(`iconBadge()`, a jelek `<symbol>`-ok, `<use>`-zal). Épület nézetben az álló
feliratok közt, de **magonként egy jelvényben** (`MAG_M` = 10 m-en belül egy
mag): egyenként a szomszédos jelek a képernyőn egymásra estek, és telefonon a
II. emeleten 10-ből 3 látszott — épp a lépcső maradt ki. A jelvény a terem
méretétől függetlenül kint van, és elsőbbséget kap a számokkal szemben. Körülötte
meredek szögben nagyobb a megjelenési tartalék (`pIco`, 6 → 18 px 65° és 85°
közt): 80°-nál a mellette álló szám egy remegésnyi dőlésre 13 px-t ugrik, és
6 px-nél ki-be kapcsolt; laposabb szögben a nagy tartalék csak számokat vinne
el (telefonon a földszinten 12-ből 6-ot).

**A lejárt vagy hiányos órarendi adat nem „szabad”.** A `tmNow()` a félév
oktatási hetein kívül `nodata`-t ad, ünnepnapon `holiday`-t (mindkettő `–`
jelet kap, `tmb none`), és a más karral közös termekben (`kozos`: az F-blokk és
az Audmax) óra híján `maybe`-t: „Szabad?", keretes jelvénnyel, nem teli zölddel
— ott a KVK és az RKK órái nincsenek benne az adatban. Aki egy üres teremre
számít és órára érkezik, rosszabbul jár, mintha meg se kérdezte volna. Ezt a
`tests/termek.js` kötelezővé teszi, szabotázzsal ellenőrizve mind a négy
szabályt (félévhatár, hetek bitmaszkja, közös termek, ünnepnap).

**A QR-ívet nyomtatás előtt vissza kell olvasni.** A generátor kétszer adott
hibátlanul KINÉZŐ, de olvashatatlan ívet (hiányzó csendzóna; rossz viewBox;
majd egy regex, ami az `id="qr-path"`-ra futott rá a rajz helyett).
`python3 tools/verify-qr.py <ív> <base-url>` — ez mindhármat megfogta volna.

**A kattintás a teremé — a mutatót csak húzáskor vesszük át.** A gesztus
korábban már a lenyomáskor `setPointerCapture`-rel átvette a mutatót, és
feltette a `.navving`-et (a szintek nem kapnak kattintást). Egérrel így a
felengedés és a kattintás a színpadra ment, nem a teremre: asztalon egyetlen
termet sem lehetett kiválasztani, a színpadra kattintás pedig még a kijelölést
is törölte. Érintésnél ez nem látszott, ott a koppintás a koppintott elemet
kapja — és a tesztek szintetikus `click`-kel dolgoztak, ami egyenesen a
teremnek szól. Most a `take()` csak `CLICK_SLOP` (6 px) elmozdulás után veszi
át a mutatót, és a `tests/view.js` valódi egérrel és érintéssel kattint.
Épület nézetben az aktív szint termére koppintva is az adatai jönnek elő (egy
e-totemen ez az első mozdulat); a fölötte lévő szintek elöl vannak és
halványak, ezért átengedik a kattintást (`.floor.above`) — előtte egy II.
emeleti fal kapta el a földszinti terem elől. Az alsó szintekre kattintva
továbbra is belemerül, a fölsőkre a szintválasztó visz.

**A térkép egyetlen tab-állomás.** A helyiségek `role="button"`-ok, de
`tabindex="-1"`-gyel: fókuszt csak a nyilaktól kapnak (roving tabindex). Ha
bármelyik `tabindex="0"`-t kapna, a billentyűzetes felhasználónak 222-szer
kellene tabbolnia, hogy a térképen túljusson. A `tests/a11y.js` ezt számolja.

**A fókusz nem maradhat `aria-hidden` ágon.** Csak az aktív szint látszik a
felolvasónak; az `updateView()` ezért mielőtt elrejtene egy szintet,
megnézi, benne áll-e a fókusz, és kihozza a térképre. Aki a szintváltáshoz
nyúl, ezt vigye tovább — enélkül a felolvasó némán áll egy olyan elemen,
amiről a felhasználó semmit nem tud meg.

**Az újrarajzolás sem dobhatja el a fókuszt.** A panel (`renderPanel()`), a
foglalható termek listája (`renderTermek()`) és a szintválasztó
(`renderRail()`) `innerHTML`-lel épül újra, a szintek a téma váltásakor
(`applyTheme()`). Ha a fókusz ezekben állt, az elem kikerül alóla, a fókusz a
`<body>`-ra esik, és a következő Tab (Chromiumban mérve) a panel elejére visz
vissza, nem a megnyomott gomb utánra. Ezért újraépítés előtt a
`fokuszElotte()` megjegyzi, min állt (`id`, vagy a `FOKUSZ_KULCS` egyik
`data-*` kulcsa), a `fokuszUtana()` pedig utána ugyanarra teszi vissza; ha az
már nincs (a választott mosdósor eltűnt, mert kész az útvonal), a doboz első
gombjára. Ha közben a kód maga vitte máshová a fókuszt (térkép, kereső), azt
nem írja felül. A téma váltása után az `applyTheme()` a térképen álló fókuszt
ugyanarra a teremre adja vissza. Új panelgombnál adj `id`-t vagy
`FOKUSZ_KULCS`-beli `data-*` kulcsot, különben az első gombra kerül vissza a
fókusz. A `tests/a11y.js` valódi billentyűvel nyomja végig.

**Totem mód (`?totem#from=<a totem helye>`).** Az e-totemen ott maradt az
előző ember útvonala, nyelve, nézete. Egy perc tétlenség után a `totemAlap()`
mindent visszaállít: a címben megadott „itt vagyok”, magyar nyelv, alaprajz, a
tervlap rajzolt állása, zárt panel, hallgatói nézet, zárt QR-ablak. Tíz
másodperccel előtte szól, és bármilyen valódi bevitel megállítja (a `window`-on,
capture fázisban figyelt mutató-, billentyű- és görgőesemény); **gesztus közben
(`.navving`) soha**, mert a kéz alól rántaná ki a képet. Amit senki nem
használt, ahhoz nem nyúl; 20 óránként, nyugvó állapotban újratölt, hogy a
friss adat és kód is megjöjjön. A `tests/totem.js` a Playwright órájával
ugratja az időt (`clock.install`, `fastForward`), és valódi kattintással
használja az appot, mert csak a valódi bevitel számít.

Élesben jelentették, hogy „nem működik az alaphelyzet". Valós órával,
egérrel, érintéssel, csippentéssel és befagyasztott háttérlappal is
visszaállt; egy esetben nem: ha a `?totem` egy meglévő link végére, a `#`
után került (`#from=OA00FK1?totem`). Ott a böngésző a hash részének veszi, a
totem mód csendben nem kapcsolt be, és a from is elveszett. Ezért a `TOTEM` a
hash-ben is keresi (`?totem` és `&totem` is), és átírja a címet a kereső
részbe — a hash-t az app minden lépésnél újraírja, onnan egy újratöltés után
elveszne. A `readUrl()` a `?`-et is elválasztónak veszi, így más toldalék sem
viszi el a from-ot. Induláskor egy rövid felirat mondja, hogy totem módban fut:
enélkül kívülről semmi nem mutatta, kért-e a cím totem módot.

**Telefonra küldés: a kódot a képernyőről olvassuk vissza.** Asztalon és a
totemen (`!MOB() || TOTEM`) az útvonal összesítője alatt a „Küldd el a
telefonodra” QR-kódot mutat a mély linkkel (`qrLink()`: az `urlOf()`, a cím
`?totem` és `?parosit` része nélkül — a telefon ne váljon totemmé). A liftes
változat is a link része (`via=lift`): a `setVia()` cserével írja a
címsorba, hogy a vissza gomb ne a lépcsős változatra vigyen, az `applyUrl()`
pedig a `recompute()` után állítja be, mert az lépcsőre áll. A kódoló
(`qrMatrix()`, `qrPath()`) saját: bájt mód, M szint, 1–10. verzió. A
fejlesztéskor 4653 mátrixon modulra egyezett a python-qrcode-dal — azzal
készülnek a falra ragasztott matricák is, így ugyanarra a linkre ugyanaz a
kép —, és a ZXing meg az OpenCV is olvasta, sérülten is. A `tests/kuld.js` a
képernyőképből olvas (jsQR, fejlesztői függőség), és két dolgot külön mér,
mert a jsQR elnézőbb egy telefon kamerájánál: a **csendzónát** (a kivágott
képen legalább 4 modulnyi világos sáv; a jsQR egymodulnyival is olvas) és a
**hibajavítást** (25 átfordított modul a közepén). Sötét témában is fehér
alapon fekete a kód: a fordított kódot a kamerák többnyire nem olvassák. A
nyitott ablakban az Esc csak az ablakot zárja (a globális billentyűkezelő
ilyenkor kiszáll), a kiválasztás marad; a vissza gomb és a totem alaphelyzete
bezárja (`qrBezar()`), mert a kód már nem a látott útvonalra mutatna.

**Az útvonal az ajtónál ér véget — az ajtók az IFC-modellből jönnek.** A
helyiségek `doors` (az ajtók előtti pontok) és `via` (a helyiség, amelyiken
át megközelíthető) mezőit a `tools/ifc-ajtok.py` írja be az épület
IFC-modelljéből (Archicad-export, 2023; belső anyag, nem a repóba). Előtte a
helyiség a hozzá legközelebbi folyosócellához kötődött 6 m-en belül: az
Audmax útvonala a déli falánál ért véget, ahol nincs ajtó, és hét
helyiséghez — laborsor, irodából nyíló iroda — nem volt útvonal. Amit tudni
kell:
- Az IFC minden elemet általános elemként (proxy) ad, a típus a névből jön
  (`Fal`, `D…` ajtó, `A…` ablak). Tükrözött, ~23°-kal elforgatott, méterben;
  egyetlen merev transzform illeszti minden szintre, és a térkép falainak
  ~90%-a 10 cm-en belül esik rá (a félemeleten 41%: ott a földszintről
  felnyúló falak az IFC-ben a földszinthez tartoznak). Ez független
  megerősítés arra is, hogy a térkép szintjei egymáshoz képest pontosak.
- Az ajtó irányát és a fal vastagságát az ajtó **gazdafala** adja az IFC-ből,
  nem a térkép fala: a térképről a válaszfalak egy része hiányzik, ott a
  nyílás mellett nincs falvég, amihez igazodni lehetne (az első változat így
  a 314 ajtóból alig 130-at talált meg). A térkép falai csak ellenőriznek: ahol
  az ajtó két oldala közti szakasz térképi falat metsz, ott azóta befalazták —
  az IFC 2023-as, a térkép 2026-os, és a térkép nyer.
- Csak az úthálózatra nyíló ajtó számít: a járható cellák lépcsőkkel
  összekötött legnagyobb része. Egy elszigetelt járható folt (az I. emeleti
  E03 közösségi tér, amit csak az E01 laboron át lehet megközelíteni) nem az.
- A `via` láncban is állhat (II. emelet: E04 ← E03 ← E01). Az app követi
  (`entryOf()`), az útvonal a lánc utolsó helyiségének ajtajáig vezet, és a
  lépésekben kiírja, min át („Bejárat ezen át:"). Több ajtónál a keresés
  mindegyikből indul, és bármelyik célajtónál megáll — a közelebbit kapod.
- A lépcső és a lift is benne van az IFC-ben, csak nem név szerint
  kereshetően: lásd a következő pontot. A félemeleti FL4 és FL5 az IFC
  szerint a földszintről az Audmax alsó szintjére visz; nincs összekötve,
  mert akkor az útvonal az Audmaxon át vághatna rövidebbet.
- Sorrend: előbb a szárny (`tervlap-szarny.py`), utána ez, hogy az új
  helyiségek ajtói is bekerüljenek. A `tests/ajtok.js` őrzi; ha az app nem
  veszi figyelembe a `doors`-t és a `via`-t, tízből hat állítása elbukik.

**A lépcső és a lift az IFC-ben: benne van, csak nem ott, ahol keresnéd.**
Ez a fájl korábban azt írta, hogy az IFC-ben nincs lift, és a lépcsőknek
nincs geometriája, csak helye. Ez téves volt: a vizsgálat a lépcsőnek csak a
tárolóját nézte, liftet pedig név szerint keresett. Amit tudni kell:
- A lépcső **tárolóelem** (`LÉPCSŐ`; az export beállítása: „Stair export
  mode: Container Element"). A tárolónak csak helye van, a geometria a
  részeiben, a 44 karban (`LK SZERKEZET`, Brep). A kar az `IfcRelAggregates`
  révén tartozik a tárolóhoz, és saját szintje sincs: a tárolóét örökli.
- **Lift nevű elem nincs**, és `IfcTransportElement` sincs. A fülke névtelen
  könyvtári elem (`Tárgy`), egy 2,5 m magas doboz, amit csak a méretéről és a
  helyéről lehet felismerni. Az aknát a födémek mutatják: nyíláselem
  (`IfcOpeningElement`) nincs rajtuk, de a szint födémjeinek egyesített
  körvonalában ott a lyuk. Az FL3 magban két 1,26×1,56 m-es fülke áll, az
  akna 15,7 m² a földszint, az I., a II. és a III. emelet födémjében (a
  IV.-ben 19,3 m²). Van egy **második lift** is, amit az app nem ismer: egy
  1,26×2,56 m-es fülke a földszinten, az alagsori OAX1A25 LIFT GÉPÉSZET
  fölött, és egy 7,9 m²-es akna az I. és a II. emelet födémjében (a III.
  emeleté már zárja).
- Az export csak a **kijelölt elemeket** tartalmazza („Elements to export:
  Selected elements only"). Ha valamit nem találsz benne, attól az még
  lehet az épületben.
- A karokat a `tools/ifc-lepcsok.py` írja a térképbe (`D.flights`). A
  karonként felfelé néző vízszintes lapokat magasság szerint csoportosítja,
  ezek a fokok; a járásvonal a fokok közepén fut alulról felfelé, a végén
  nyílheggyel. A kar az induló szintjén áll. Ami nagyobbrészt a szint
  helyiségein kívül esik (az épület szélén, kívül álló lépcsők), az
  kimarad: 44-ből 38 kar kerül a térképre. **Ez csak rajz:** az útvonal
  továbbra is a `D.stairs` magjain fut, a lift a kézzel felvett `D.lifts`-en.
- A rajz karonként egy kis path a szint SVG-jében, a falak alatt (lásd a
  falak oldallapját: egy csempe minden átfedő path-t feldolgoz), és átengedi
  a kattintást (`pointer-events:none`): különben a vonalára kattintás a
  színpadig buborékozna, és a lépcsőház kiválasztása helyett a kijelölést
  törölné. Az ára a mérési zajon belül van (GPU-s tesztút, telefonprofil):
  az alaprajzi tolás előtte és utána is 32,5–32,8 ms/lépés, a körbejárás
  208,5 → 209,1 ms/lépés (öt kör mediánja), egy külön, hatkörös mérésben
  226,5 → 222,4. Egy korai mérés +7%-ot mutatott a körbejárásra; két
  ismétlés, amely alatt semmi más nem futott, nem hozta vissza. Azt is
  kipróbáltuk, hogy 3D-ben csak az aktív szinten álljon: nem lett mérhetően
  gyorsabb, ezért minden szinten ott van, és Épület nézetben a lépcsőházak
  egymás fölött is kirajzolódnak.
- Az IFC-ben három átjáró van, ami az útvonaltervezésből hiányzik: a második
  lift; egy folyosói lépcső a földszinttől az I. emeletig (az OA00FK5, OA01FK1
  és OA10EK2 folyosón); és egy lépcső az alagsorból a földszintre, az FL1 mag
  mellett. A két lépcső a rajzon már látszik. Hogy hallgatók használhatják-e
  őket, azt az építészek és az üzemeltetés tudja megmondani (lásd
  `docs/NYITOTT-KERDESEK.md`, 3.); addig nincsenek bekötve.

**Az útvonal lépései nevén nevezik a szintet, és egyben lépcsőznek.** Előtte a
portától a II. emeletig négy külön sor jött („Lépcsőn fel a(z) földszint
szintre”, „…a(z) félemelet szintre”…), az angol felületen is magyar
szintnévvel, és a célnál a tervlapi kód állt, nem az ajtón álló szám. Most az
egymást követő, azonos irányú és fajtájú szintváltások egy lépésbe olvadnak, ha
köztük 6 m-nél kevesebbet kell menni (ugyanabban a lépcsőházban maradsz). A
lépés a célszintet ragozva mondja (`lvTo`: „a II. emeletre”, „to the 2nd
floor”), mellette a lépcsőház kódját és azt, hány szint. **A félemelet a
lépcsőházak pihenője, nem emelet**: az `emelet()` fél emeletnek veszi, így a
szintváltások száma és a lépcsőzés ideje (22 s emeletenként) sem duplázódik. A
cél és az átjárók az ajtószámmal állnak (`neptunOf`).

**Egy keresés, sok cél: `dijkstra()` és `routeTo()`.** A mosdóválasztó, a
foglalható termek menetideje és az elérhetőségi teszt egy indulásból sok célhoz
kér útvonalat. Célonként külön keresés helyett egy cél nélküli Dijkstra fut
(`dijkstra(r1, portals, null)`), és a `routeTo()` ebből olvassa ki bármelyik
helyiség útját, a `via`-láncot az `entryOf()`-fal követve. A `findRoute()`
ugyanez a mag, céllal: az az első célajtónál megáll.

**A mosdóválasztó a nemet is kérdezi.** Egyetlen „legközelebbi mosdó” egy nőt
is egy férfi mosdóhoz vitt, ha az volt közelebb. Most a gomb három sort ad —
női, férfi, akadálymentes —, mindegyikből a menetidő szerint legközelebbit, az
indulástól (ha nincs, a portától); a nemre nem jelölt mosdó mindkét sorba
számít. Kimarad, amibe csak egy másik helyiségen át lehet bejutni (`via`:
irodából nyíló mosdók), és az alagsori dolgozói öltöző két mosdója
(`DOLGOZOI_WC`). A `tests/url.js` mindkét kizárást számon kéri.

**A foglalható termek közül ami most szabad, elöl.** Szabad, utána „Szabad?”,
végül foglalt; a szabadok közt, ha az indulás megvan (QR, totem, „Innen”), a
menetidő dönt — minden sorban ott a perc —, indulás nélkül az, hogy meddig
marad szabad; a foglaltak közt az, amelyik hamarabb felszabadul. A
menetidőket indulásonként egyszer számoljuk (`tmIdok()`: egy keresés), nem
soronként.

**Minden helyiséghez van út — és a kivételek nem avulhatnak el.** A
`tests/eler.js` minden kódolt helyiséget végignéz lépcsőn a portától és
lifttel a földszintről. A kivételek listája két irányba szigorú: egy új
elérhetetlen helyiség és egy közben elérhetővé vált kivétel is bukás. Lifttel
nem érhető el a félemelet (a többi lépcsőház pihenője) és **a II. emelet déli
tömbje** (OA20E01–E12): oda csak az EL1 lépcső visz (lásd
`docs/NYITOTT-KERDESEK.md`, 3.). Az órarendi termek közül egyik sem ilyen.

**Ismétlődő teremkód.** A tervlapon az `OA00FK2` kétszer szerepel (ELŐTÉR és
AULA). Az app `ROOM` táblája `Object.fromEntries`-szel épül, ott az UTOLSÓ nyer;
a QR-generátor ugyanígy dönt, különben a matrica felirata mást ígérne, mint
ahová visz. Ha új kódütközés jön be, ezt a szabályt tartsd. A két tervtári
forrás itt eltér: a térkép a 2026.01.09-i alaprajzot követi (ott az FK2
kétszer áll, és nincs FK6), a 2025.08.21-i épületadat-táblában viszont az
ELŐTÉR az OA00FK3, és onnan a folyosók egy hellyel eltolva számozódnak
(FK3–FK6). Hogy melyik a helyes, azt az építészek döntik el; javítani csak a
QR-matricákkal együtt szabad, mert azok a mostani kódra mutatnak.

## Adatfolyam

```
ingatlan.uni-obuda.hu/termek (mentett lapok) --parse-rooms.py--> data/rooms.json
Neptun kurzusórarend-export (xlsx)           --parse-neptun.py--> /tmp/neptun.json
                         rooms.json + neptun.json --build-termek.py--> data/termek.json
Tervtár OA épületadatok (xls)          --tervtar-ajtoszam.py--> az index.html NEPTUN táblája
Tervtár OA alaprajzok (PDF) + épületadatok --tervlap-szarny.py--> D: a hiányzó szárny
OE-OA.ifc (Archicad-export, 2023)            --ifc-ajtok.py--> D: doors, via
OE-OA.ifc                                  --ifc-lepcsok.py--> D: flights
```

A térkép (`D`) kézzel nem szerkesztendő: a régi generátor adatára a fenti
három eszköz épít, ebben a sorrendben (a szárny után az ajtók, hogy az új
helyiségek is megkapják, és a lépcsőkarok, amelyek a szárnnyal megnőtt
kerethez illeszkednek), utána a `tervtar-ajtoszam.py` az ajtószámokat. A
PDF, az xls és az IFC belső anyag, egyik se kerüljön a repóba. A szárnyról:
- A régi adat keretével levágta a felső szárny északkeleti végét (41
  helyiség, 10 órarendi terem). Az eszköz a PDF falait a térkép falaira
  illeszti, a helyiségeket a falak közti szabad térből vágja ki, és ahol a
  keret nő, mindent eltol (a rácslépés egész többszörösével, a lifttel és az
  ajtókkal együtt).
- A kivágás módszerét a térkép meglévő 139 helyiségén mértük, ahol a
  helyes sokszög ismert (IoU ≥ 0,97 és terület ±3%): négy független
  módszerből a falvégek közti hidakra és a falréteg vonalaira épülő nyert
  (94%). A négy kombinációja a mércén három helyiséggel többet adott (96%),
  a szárnyon viszont semmit: ott mind a 40-et az első adta, ±1%-on belül.
  Ezért csak az van benne (a másik három együtt ~1200 sor lett volna).
- **A lyukas helyiség egy gyűrű, bevágással.** A II–IV. emeleti folyosók
  közepén korláttal körbevett légtér van; a térkép formátuma egyetlen
  gyűrűt ismer, ezért a lyuk egy nulla szélességű bevágással fűződik a
  külső gyűrűhöz (`poli()`). Enélkül a légtér járható folyosónak látszana,
  a folyosó területe pedig 245 m² lenne a pecsét 177-e helyett.
- **Ára az Épület nézetben, telefonon.** A GPU-s tesztúton (SwiftShader,
  telefonprofil, 5 futás mediánja) a körbejárás lépésideje 78 ms-ról 188-ra
  nőtt; a kétujjas döntés (71 → 74) és az alaprajzi tolás (33 → 33) nem
  változott. Nem a nagyobb keret (üres szárnnyal 76 ms) és nem a
  raszterezés (~3 ms): a kompozitálás (`SwapBuffers`). A szárny a felső
  szinteken is tartalmat ad, és elforgatva ezek a halvány szintek a kép
  jóval nagyobb részét fedik. A szobák alakja (lyuk, csúcsszám) nem számít
  (±7%). Valódi telefonon mérendő (erre van a `meres.html`); ha ott is
  akad, a nem aktív szintek rajzán kell faragni, nem a szárnyon.

```
python3 tools/parse-neptun.py 2026-27-1-NIK-kurzus-orarend-adatok-v1.xlsx /tmp/neptun.json
python3 tools/build-termek.py data/rooms.json /tmp/neptun.json data/termek.json \
        --het1 2026-09-07 --hetek 14 --szunnap 2026-10-23
```

Félévente egyszer kell futtatni. Amit az exportról tudni kell, mert egyik
sem látszik rajta első ránézésre:

- **Nem csak a kért félévet tartalmazza**, hanem a tárgyak összes korábbi
  félévét is, 2007-ig vissza: a 2026/27/1-es fájl 24 214 sorából 931 az idei.
  Az azonosító közepe a félév (`NIROR2SANB-2026271-OR2_EA`). Szűrés nélkül húsz
  év órarendje kerül egymásra: minden OA-terem 93–100%-ban foglaltnak
  látszott, egy 25 fős laborban egyszerre 31 tárgy. A `parse-neptun.py` a
  fájlnévből veszi a félévet (`2026-27-1` → `2026271`).
- **Dátum nincs benne**, csak a félév hetei (1–14), és ünnepnap sincs. Az 1.
  hét hétfőjét a `--het1` adja: a régi teremfoglalási tábla (2026. szept.)
  NIK-előadásaiból 73-ból 70 esik a Neptun szerinti 1. heti órákra, ez adta a
  2026-09-07-et. Az ünnepnapokat (és ha van, a rektori szünetet) a
  `--szunnap` kapja.
- **Csak egy kar kurzusai vannak benne.** A NIK-exportban nincs benne, amit a
  KVK vagy az RKK tart az F-blokkban és az Audmaxban (a régi táblában az ottani
  foglalások ~30%-a) — ezért azok a termek `kozos`-ok, lásd fent.
- **Az oktató neve benne van, a `termek.json`-ba nem kerül be:** személyes
  adat, és a hallgatónak nem kell ahhoz, hogy üres termet találjon.
- A teremkód `BA.F.05` / `BA.1.13` / `BA.1.32.Audmax`: a `BA` maga az OA
  épület. Ezek a nyilvántartás `F05`, `LABOR 1.13`, `Audmax` termei — de nem
  az alaprajz kódjai (lásd `docs/NYITOTT-KERDESEK.md`, 1.). Az óra fajtája a
  kurzuskódból jön (`_EA` előadás, `_GY` gyakorlat, `_LA` labor).
- **A tervlapi kód és az ajtószám (Neptun-név) megfeleltetése az app
  `NEPTUN` táblája** (`index.html`, a `ROOM` mellett), nem a teremadaté: a
  feliratok már induláskor abból dolgoznak. Forrása az Egyetemi Tervtár OA
  épületadat-táblája (2025.08.21), a „HELYISÉG SZÁMA KARI NYILVÁNT." oszlop;
  a `tools/tervtar-ajtoszam.py` állítja elő, csak a térképen szereplő
  helyiségekre (most 112 pár; a nyilvántartás minden számozott helyisége a
  térképen van, és mind a 24 órarendi terem párt kapott). A táblát magát ne tedd a repóba: belső anyag.
  Ami a nyilvántartásban ellentmondásos (ugyanaz a szám két helyiségen,
  folyosón teremszám), az kimarad, az eszköz kiírja. Ahol van pár, a térkép
  felirata, a kereső és az adatlap címe az ajtószám, az adatlapon ott a
  foglaltság (`tmCard()`, ugyanazzal a sorral és napi órákkal, mint a
  listában: `tmRow()`, `tmDetail()`).
- **Méretből ne következtess párt.** Előtte négy pár volt, a méretből és az
  egyetemi teremlap fotóiból kikövetkeztetve, és az egyik téves lett: a
  144 fős F06-ot a 146 m²-es OA00F03-ra tettük, mert „utána csak ez marad" —
  a nyilvántartás szerint az OA00F03 az F09, az F06 pedig az OA00F16, a felső
  szárny északkeleti végén, ami akkor hiányzott a térképről. A kizárásos
  érvelés a hiányos tervlapon csúszott el. A másik három (F01, F02, Audmax) egyezik a
  nyilvántartással.
- **A földszinten a tervlapi rövid kód Neptun-névnek látszik.** A tervlap is
  F01…F14-nek számozza a helyiségeit, de a tervlapi F04 a büfé, az F07 a női
  mosdó — a Neptun F04-e és F07-e tanterem. Amíg minden felirat tervlapi kód
  volt, ez csak zavart; a valódi Neptun-nevek mellett megtéveszt. Ezért a
  `roomLabel()` az F01…F09 alakú tervlapi kód helyett a teljes kódot írja ki
  (OA00F04), amíg a teremnek nincs párja; ugyanígy, ha egy rövid kód egy
  másik terem kiosztott Neptun-nevével ütközne.
- **A párosító mód** (`?parosit` a címben) a nyilvántartásból hiányzó vagy
  vitatott pároknál segít: teremre kattintás, a Neptun-név kiválasztása (elöl
  az azonos emeletiek, férőhellyel), a lista kimásolása. A helyben megadott
  párok (`localStorage`) csak ebben a módban élnek, és felülírják a
  beépítettet; a kimásolt listát kell a `NEPTUN` táblába írni.

Az órák heti ismétlődésként kerülnek a `termek.json`-ba (`[nap, tól, ig,
hetek bitmaszkja, fajta, tárgy sorszáma]`), nem napokra kibontva: egy félév
~30 KB, és az app a mai dátumból számolja a hetet. Az előző forrás egy heti
teremfoglalási tábla (`terem.xlsx`) volt, amit a cellák kitöltőszínéből
olvastunk; két hétre szólt, és lejárt — a feldolgozója a git-történetben van.

**A `data/` hálózat-először jön** a service workerből (`sw.js`), mint maga a
dokumentum; a betűk és ikonok gyorsítótár-először. A `termek.json` neve
félévről félévre ugyanaz, gyorsítótár-először egy telepített app sosem kapná
meg az újat. Ha a formátuma változik, a `CACHE` nevét is emeld: az dobja el a
régi példányt. Az app a nem várt formátumú adatot „nincs adat"-nak veszi
(`tmLoad()`), nem omlik el tőle. **Egy deploy utáni első megnyitáskor még a
régi service worker válaszol**, a régi gyorsítótárából: ha az régi formátumú
fájlt ad, a `tmLoad()` egyszer újrakéri, egyedi paraméterrel a cím végén —
azt a régi gyorsítótár nem ismeri, így a hálózatról jön.

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

Lásd [docs/NYITOTT-KERDESEK.md](docs/NYITOTT-KERDESEK.md) — öt pont vár
külső információra; valódi funkcióhiányt közülük a más karok hiányzó órarendje
okoz.

# OA Épület Teremkereső — fejlesztői jegyzet

Teremkereső és útvonaltervező az Óbudai Egyetem épületeihez (a kiindulás az OA
volt: Neumann János Informatikai Kar, Bécsi út 96/b).
**Élő oldal:** https://mos-eisley.github.io/oemap/ — a repó visszakerült
publikusra, a Pages újra megy. A **saját domain** (`oemap.maydayprod.app`)
viszont NEM szolgálja ki: a DNS-e a Pages-re mutat, de a custom domain kiesett
a repó Pages-beállításából, így `*.github.io` tanúsítványt kap, és a böngésző
visszautasítja. **A kiragasztott QR-matricák és a totemek ezt a címet
kódolják**, tehát amíg vissza nem kerül (Settings → Pages → Custom domain),
azok tanúsítványhibára futnak.

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

`index.html` (~490 KB, tömörítve ~140 KB) **maga a teljes alkalmazás** — HTML, CSS és JS egy
fájlban, build lépés és futásidejű függőség nélkül. Ez szándékos: a
GitHub Pages statikusan szolgálja ki, és offline is működik. Az egyetlen külső
fájl a `fonts/`, az `icons/`, a `data/` és a `sw.js`. A `meres.html` nem az app
része: telefonos mérőlap (lásd „Körbejárás közben rejtett felső szintek”).

A beégetett `let D = {...}` az OA épület (a `D_OA` is ezt őrzi); épületváltáskor az
`epuletAllit()` köti újra egy másik épület adatára (lásd lejjebb). Egy épület adata:

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
honnan/hova, útvonal, forgatás, panelállás). Aki ezt megérti, érti az appot. Az
aktuális épület nem az `S`-ben van, hanem a `D`-ben és a `ROOM`-ban (`epItt()`).

**A `D` EGY épület, az egyetemnek viszont 39 van.** A `data/epuletek.json`
(12 KB, `tools/tervlap-epuletek.py`) a nyilvántartás mind a 39-ről: név, cím,
telephely, szintek és helyiségek száma, terület. A fejléc épületneve maga a
választógomb — és a választó **nem mossa össze a
„van alaprajza” és a „létezik” állapotot**: amelyik épületnek nincs geometriája
az appban, az adatlapként látszik, megnyitás nélkül (`navigalhato` — ezt a
`tervlap-epuletek.py` abból állítja elő, hogy létezik-e a
`data/epuletek/<kód>.json`, nem kézi listából). Ha ki sem
írnánk, a hallgató azt hihetné, nincs is ilyen épület; ha megnyithatónak
látszana, hiába kattintana.

**A választó NEM felugró ablak, hanem ugyanannak az ablaknak a kifelé
nagyított képe**: a térkép (`#terkep`, benne az `#epvScene`) az alaprajz
helyén áll, ugyanakkorán, a lista a panelben (`#epvlist`, a kereső helyén;
telefonon az alsó lapon). Élesben a háttérre tett, középre úszó `<dialog>`-ot
„borzalmasnak” találták, a kérés szó szerint „egy homogén ablak a térképtől
egészen az épület vázáig” volt. Az épületből kifelé nagyítva a térkép veszi
át, a térképen egy házra nagyítva (vagy koppintva) az épület — lásd „Az
épület és a térkép egy kép”. A térképen EGY, folytonosan nagyítható jelenet
van: Magyarország határától a házak tömegéig ugyanaz a tér, ugyanaz a
vetület, ugyanaz a kamera — nincs külön „ország-térkép” és „város-térkép”, és
nincsenek a térképre tett kártyák. A hallgató húzza, csippenti, görgeti (a
+/− ugyanaz a két gomb, mint az alaprajzon), és a részletesség a NAGYÍTÁSSAL
lép. Mellette mindig ott a lista is, ugyanazokkal a célokkal; a listából
választva a kamera ODAREPÜL, a jelenetből választva a lista szűkül — a kettő
ugyanazt az állapotot mutatja, csak más úton. A helyek a `data/helyek.json`-ból
jönnek (28 KB, `tools/helyek.py`): az OSM épületkörvonalai és címpontjai
(Nominatim), a közös telken álló épületeknél a helyszínrajzokból számolt
eltolással, a határ, a Duna és a Margit-sziget egyszerűsítve. Amit tudni kell:
- **A térkép OSM-adat, tehát kötelező a forrásmegjelölés**, a licenccel:
  „© OpenStreetMap-közreműködők (ODbL)”, a térkép sarkában (`#terkepInfo
  .epvforras`, asztalon a nagyítógombok mellett, telefonon fönt — lent az alsó
  lap takarná),
  az openstreetmap.org/copyright oldalra mutatva. **A totemen nem
  hivatkozás** (`epvOsm()`): egy koppintás elvinné a kioszkot az appról, és
  onnan a tétlenségi alaphelyzet már nem hozná vissza.
- **SZEMLÉLTETŐ, nem méretarányos** — ez a lényeg, és ezt a mérés
  kényszerítette ki. A valódi elrendezésben egy 60 m-es ház az ország
  térképén 0,2 képpont, a város egészén 1–3: se látni, se megkoppintani nem
  lehet. Ezt élesben kétszer jelentették „használhatatlan”-ként. Ezért a
  nagyítás három lépcsőjén háromféle dolog áll a képen, és mindegyik a
  VALÓDI HELYÉN:
  | m/képpont | mi áll a képen | mi a kérdés |
  | --- | --- | --- |
  | 300 fölött | a TELEPÜLÉSEK kis mása | melyik városban |
  | 6–300 | a CSOPORTOK (kerület, telephely) kis mása | melyik campuson |
  | 6 alatt | a VALÓDI házak, a valódi helyükön | melyik ház |
  A két modell-lépcső ugyanazzal a kóddal készül (`jelVarosAdat`,
  `jelVarosSvg`), csak más halmazra; a háznál a HELY igaz, a MÉRET nem.
  A határok ott vannak, ahol a következő lépcső már értelmes méretű: 6
  m/képponton egy 800 m-es campus 133 képpont, ott már a házak a téma.
- **A kamera rögzített FOKOKRA áll be** (`jelFokLe`, `jelFokRa`,
  `jelBeakad()`): minden campus és minden város ugyanúgy, ugyanakkora
  házakkal nyílik meg, és a hallgató onnan nagyít tovább. A fokok √2-es
  lépcsők (mint a 3D-s rajz sűrűségéé), tehát a legrosszabb eset is 19%
  eltérés a kívánt kivágattól. Odarepüléskor LEFELÉ kerekítünk (kijjebb),
  hogy a cél sose lógjon ki; kézi nagyítás (görgő, csippentés) után a
  legközelebbire, az ujj alatti pontot a helyén tartva — ettől „akad be” a
  mozdulat. A +/− gomb egész oktávot lép a már beállt fokról.
- **A valódi házak is nagyítva vannak, de EGYSÉGESEN** (`gEgy`): a tipikus
  60 m-es ház a célméretig (46 px) nő, és minden ház ugyanannyiszorosára —
  házanként a célmérethez igazítva a 101 m-es OA és a 24 m-es KD egyforma
  nagy lett volna, a magasságuk meg (a nagyítással együtt nőve) megfordult:
  a hétszintes OA alacsonyabb lett a hatszintes OC-nél. A legkisebbek
  kapnak csak külön ráadást (16 px alá egy ház sem mehet), hogy
  koppinthatók legyenek; a MAGASSÁG mindig az egységes szorzóval megy, így
  az emeletek aránya igaz marad. Campus-közelben a szorzó 1 körül van —
  ott a rajz méretarányos.
- **A ház neve akkor van kint**, ha elég nagyra nőtt (24 px), ha
  megnyitható (azt keresi a hallgató a nevén), vagy ha kevesen vannak a
  képen (12-ig mindegyiké): a campus hét házát mind meg kell nevezni, ott
  épp az a kérdés, melyik melyik; Budapest 23 chipje viszont olvashatatlan.
- **Az egységes szorzónak külön, kisebb korlátja van** (`JEL_EGY_MAX` = 4):
  campus-közelben a szomszédos házak (OA, OC és OD egymás mellett állnak)
  négyszeresnél jobban nagyítva egyetlen tömbbé olvadnak, és épp azt nem
  lehet megkülönböztetni, ami ott a kérdés.
- **A szár a címke dobozának legközelebbi SZÉLÉIG megy**, nem a közepéig:
  a közepéig húzva átszelte a modellt, mintha vonalat húztunk volna a
  házakra.
- **A dőlés is a nagyításból jön** (`jelDol()`): 60 m/px fölött felülnézet (a
  ferde országtérkép értelmetlen), 4 alatt 52°, köztük logaritmikusan. Így a
  kamera magától „leszáll”, a hallgatónak nincs mit kapcsolgatnia.
- **A vetület síkbeli (equirectangular), az ország közepének szélességére.**
  Magyarország 3°-os sávjában ez néhány százalék torzítás — a tájékozódáshoz
  bőven elég —, cserébe a TELJES nagyítási tartományban egy koordináta-
  rendszer van, méterben. Enélkül minden lépték saját vetületet kért volna,
  és a folytonos nagyítás nem lenne folytonos.
- **Ezt a mérés kényszerítette ki.** Fix léptéken egy budapesti ház az ország
  térképén 1,3 képpont lenne (a város épületei 5168 m-en szórnak szét, egy ház
  tipikusan 62 m). Az előző változat ezért tett a jelek mellé kis 3D-s
  modelleket — és pont ettől nézett ki ragasztottnak. Folytonos nagyításban a
  ház magától nő akkorára, amekkora: nincs mit ragasztani.
- **Körvonal nélkül nincs kitalált tömeg** (a 32-ből 14): lapos jel áll a
  helyén (`jelPont()`). Egy korábbi változat egyszerűen kihagyta őket, és
  közelről eltűnt az épület — a listában ott volt, a jelenetben nem —, a
  kamera meg egy üres helyre illesztett. A magasság a nyilvántartás
  szintszáma, az alaprajz az OSM körvonala: egyik sem becslés.
- **Hátlapvágás**: csak az a fal rajzolódik, amelyiknek a kifelé mutató
  normálisa a kamera felé néz, különben a ház belseje látszana át. Mérni az
  ARÁNYT kell, nem azt, hogy „kevesebb, mint az élek száma”: az OSM-gyűrű
  záró pontja miatt egy él vágás nélkül is kimarad, és az utóbbi állítás
  vágás nélkül is igaz (mérve 0,15–0,75 vágással, ~0,98 anélkül).
- **A címkék helyét a kirajzolt képen méri** (`jelCimkek()`: négy oldal,
  növekvő távolságon, az első teljesen tiszta hely nyer), és a JEL a helyén
  marad: a pont az SVG-ben van, a chip HTML-gomb, ami elmozdulhat; messzire
  tolt chiphez szár köti őket össze. Egyszerű függőleges széttolás nem elég:
  Nagymaros és Budapest az ország térképén 22 képpontra van egymástól, és a
  széttolt chip 200 képpontra szállt el a saját pontjától. A címke a saját
  jelét sem takarhatja (azon ülve nem látszik, hová mutat), és ha egyetlen
  hely sem tiszta, a keretbe szorítva marad — egy kilógó címke rosszabb, mint
  egy takaró. A keret a térkép SZABAD része (`JEL.sz`: asztalon a lebegő
  panel, telefonon az alsó lap takarása levonva): a térkép az egész
  térképdobozt kitölti, de a panel alá szorított címke nem látszana, és nem
  lehetne megkoppintani. A kamera közepe is a szabad rész közepe (`JEL.ox`,
  `JEL.oy`). A megnyitás, minden újrarajzolás és átméretezés után fut; a
  `tests/valaszto.js` hat képernyőméreten, négy nézetben nézi, és
  átméretezés után is.
- **A húzás a kameráé, a koppintás a házé** — ugyanaz a szabály, mint a
  teremnél (lásd „A kattintás a teremé”): 4 képpontnyi elmozdulás fölött a
  felengedés már nem választ, különben egy elhúzott ujj vége épületet nyitott. A billentyűs
  kattintás (`detail` 0) erre nem néz: a húzás elmozdulása csak a következő
  lenyomáskor nullázódik, és addig a címkén az Enter semmit nem tett.
- **A színkeverés (`color-mix()`) mellett mindig van tartalék**: a jelenet
  egyszerű tulajdonságainál egy előtte álló sima szín, az egyedi
  tulajdonságokban kevert tömegszíneknél egy `@supports not` ág — azoknál a
  korábbi deklaráció nem segít, és régebbi böngészőn (Safari 16.2, Chrome
  111 előtt) a ház fekete lett volna.
- **A doboz magassága a képernyőhöz igazodik**, nem a tartalom arányához: a
  régi, arányt tartó térkép `--epvh`-ja telefonon 662 képpontot adott egy
  844-esen, és a jelenet fele a lap alján lógott. Fekve a sticky oszlop maga
  számol a biztonsági sávokkal (170 px: fejléc + a doboz és a hasáb
  paddingja) — a régi 140 azért volt elég, mert az arányt tartó térkép ritkán
  érte el a `--epvh`-t.
- **A közeli nézetben csak a település saját Duna-szakasza fut**: az országos
  vonal durvább, és a kettő egymásra rajzolva kereszteződő szalagoknak
  látszott. A folyó szélessége a nagyítással nő (a valódi ~350 m), a sziget
  pedig a víz FÖLÉ kerül, különben a szélesített Duna elnyelte.
- **Hét épületnek nincs helye.** Az FA, FB, KM, SA, SB és SC a
  helyszínrajzokon szerepel (a felirata helye megvan), de a lapjukon nincs
  OSM-ben azonosított épület, amihez illeszteni lehetne, és a nyilvántartásban
  címük sincs; az UV a táblája szerint valószínűleg azonos az NA-val (lásd
  lejjebb), annak a helyét kaphatná. Ezek a listában „Hely nélkül” alatt
  állnak, a térképen nem. A többi 32 közül 22 egyenesen OSM (`pont:"osm"`),
  hét a helyszínrajzról számolt (`"helyszinrajz"`), az FC és az FS egy telken,
  közös ponton (`"telek"`), az OB becsült a szomszédos házszámokból
  (`"becsult"`). Körvonala (`kontur`) csak 18-nak van: a YC, az NA, az NB és a
  TB az OSM-ben is csak pont, és a nem OSM-ből jövőknek sincs.
- **Az OSM a Neptun-kódokat használja** („… (BA épület)”), nem a tervtáriakat:
  az OA ott BA. Ezért a `helyek.py` OSM-azonosítókat rögzít kézzel (`OSM`
  tábla), nem név szerint keres; az FK és az FF párosítását a h12-es
  helyszínrajz dönti el (3,3 m eltérés, fordítva 171 m — a futás kiírja, és
  elbukik, ha nem így jön ki).
- **`helyek.json` nélkül csak a lista van** (`.epvtest.egy`): a fájl
  hálózat-először jön, első offline indulásra hiányozhat.
- **GPS csak koppintásra** (`epvGps()`, „Hol vagyok?”): az engedélykérés nem
  ugorhat fel magától. A távolság az OSM-körvonaltól számít (benne 0), ha
  van (a 32-ből 18-nak), különben a ponttól; 250 m-en belül javasol, azon túl a legközelebbit
  távolsággal mondja. Csak javasol: beltérben a GPS tíz métereket téved, a
  pontos helyet a QR-kód adja. Minden kérésnek sorszáma van: a bezárt
  választónál késve érkező helyet eldobja (különben órákkal később egy régi
  „a közeledben” jött elő). A gomb és az eredmény ugyanazt az id-t kapja
  (`epvGps`), így a fókusz az eredményre megy át — előtte a Bezárásra esett, és
  a következő Enter bezárta a választót; a javaslat megnyitó gombja is saját
  id-t kap (`epvGpsNyit`), mert az alapértelmezett doboz gombja ugyanazt a
  `data-epv`-t viseli. A totemen nincs GPS.
- **Alapértelmezett épület** (`alapEpulet()`, `localStorage` `oemap-alap`):
  az adatlapon állítható be, induláskor ez nyílik meg, csendben (ha nem jön
  le, egy felirat szól, és az OA marad),
  és a fejléc házikója (`#epvHaza`) bárhonnan visszavisz rá. Nem nyit meg
  induláskor, ha a cím mond valamit (hash, kiválasztás, indulás, cél), totem,
  párosító vagy mérő (`?meres`) módban, és ha az adata nem jön le, az OA
  marad. Ha a tároló nem érhető el, az OA az alapértelmezett. **A totem közös
  készülék**: ott se házikó, se csillag, se alapértelmezett-doboz — egy arra
  járó beállítása minden későbbi látogatónak megmaradna.
- **A csendes betöltés alatt a hallgató az erősebb** (`epuletValt()`,
  `epvKeres`): lassú hálózaton a betöltés másodpercekig tart. Egy közben
  választott másik épület leváltja (a letöltést megszakítja), a házikó
  ugyanarra az épületre kifejezetté teszi (nem tölt újra); ha pedig közben
  termet választott, linket nyitott, nyitva a választó, vagy **bármilyen
  valódi bevitel** volt (koppintás, csippentés, görgetés, billentyű, gépelés:
  `epvHasznalt`), a csendes eredmény eldobódik (`epvMegelozte()`), és az
  alapértelmezettre a házikó visz. Korábban a betöltés vége mindent
  felülírt — a keze alól rántotta ki a képet, a keresőbe gépeltet törölte —,
  és addig minden kifejezett váltást elnyelt. A csendes betöltést a választó
  nem mutatja „Betöltés…”-nek (`epvToltKi()`): nyitott választónál úgyis
  eldobódik, a hallgató hiába várna rá.
- **Két kifejezett váltás közül az első nyer**: amíg egy fut (legfeljebb
  20 s), a többi kérés elmarad, nem indul párhuzamos letöltés. A „Betöltés…”
  minden gombon látszik, amelyik ezt az épületet nyitja (lista, adatlap, az
  alapértelmezett doboza, a GPS-javaslat).
- **Egy linkről indult váltás** (beírt cím, Vissza gomb) megjegyzi, honnan
  indult (`ker.hely`): ha a hallgató a betöltés alatt továbblépett (termet
  választott, másik címre ment), az eredmény eldobódik. Különben a késő
  betöltés az újabb állapotát és — a link útján nincs közbülső bejegyzés —
  az újabb history-bejegyzését is felülírta.
- **Egy linkről indult, elakadt váltás** a címét megjegyzi (`epvUjra`): az
  adatlapról újra megnyitva a QR-kód terme is kiválasztva nyílik. A cím a
  hibát mutató választóhoz tartozik: bezárva elfelejtődik, különben órákkal
  később egy régi QR-kód „itt vagyok”-ja jött vissza.
- **Két épületet vegyítő link** (`#from=OD…&to=OA…`): visszajátszáskor a másik
  épület kódja elmarad (`epvVisszajatszas`), nem indít újabb váltást —
  korábban a két épület közt ingázott a végtelenségig. A link útján a váltás
  nem tesz közbülső bejegyzést a history-ba, és utána a cím a tényleges
  állapotot mondja (`urlOf()`): a bejegyzésben maradt idegen kód miatt a
  Vissza gomb újra átváltott.
- **A választó nem modális**: a panel másik nézete, nem ablak. A nyitott
  térkép logikai állapota az `.app.terkep` osztály (`epvNyitva()`), a
  látványé a `.terkeplat` — a kettő a kilépéskor válik el: a panel azonnal
  az épületé, a térkép még berepül és áttűnik (lásd lent). Ami ebből
  következik:
  - **Az Esc a térképet zárja** (a globális billentyűkezelő nyitott
    térképnél csak ezt teszi, a „/” sem keres), a kijelölés marad, a fókusz
    a nyitógombra tér vissza, ha a panelben vagy a térképen állt (ha a gomb,
    ahonnan nyílt, azóta rejtve van, a választó gombjára). A panel × gombja
    ugyanez: „Vissza az épületbe”. A zárt lista rejtett, nem tab-állomás.
  - **Nyitva a Tab nem jut a rejtett alaprajzra**: az alaprajz, a szintsín,
    a teremszámok és a fejléc-táblák a térkép alatt `visibility:hidden`-nel
    állnak — ettől a böngésző a rejtett 3D-s jelenetet nem is kompozitálja.
  - **A térkép nem háttér**: az üres részére kattintva vagy rajta húzva
    nyitva marad (a régi `<dialog>` háttérre kattintós zárása megszűnt).
  - **A felirat (`toast()`) a body-ban marad**, és a térkép meg az alsó lap
    fölött látszik (z-index). Méréskor vigyázz: a felirat
    `pointer-events:none`, az `elementFromPoint` sosem találja meg — a
    mérés idejére kapcsold vissza.
  - **Ugyanazon a nézeten újrarajzolva a görgetés marad** (töltés,
    GPS-eredmény): az innerHTML a görgető dobozt (`.epvlista`) újraépíti, és
    a Safari a megnyomott gombot nem fókuszálja, így a fókusz sem hozza
    vissza. A „Hol vagyok?” eredménye és az alapértelmezett doboza a lista
    görgető tömbjében van, nem fölötte: egy régi változatban egy külön
    oszlop teteje volt, és fekvő telefonon a listát nullára nyomta.
  - **Telefonon** a kifejezett nyitás (fejléc, link) a lapot félig nyitja
    (`mid`), hogy a lista látsszon, és záráskor visszaállítja; kifelé
    nagyítva a térkép a fontos, ott a lap marad. A lap a panel fejlécéről
    és a lista tetejéről is húzható, mint a keresőé. A térképen a +/−
    telefonon is kint van: a csippentés mellé egyujjas út is kell (WCAG
    2.5.1).
  - **A totem alaphelyzete a térképet is bezárja, áttűnés nélkül**
    (`totemAlap()` → `epvZar({azonnal:true})`): nyitva a következő látogató
    az előző térképét látta volna az alaprajz helyett.
  - A térkép jele és a lista sora ugyanazt a `data-epv`-t viseli, és egy
    kezelő szolgálja ki mindkettőt (`epvKattint`). Töltés közben a gomb
    `aria-disabled`, nem `disabled`: a letiltott gombról a fókusz a
    `<body>`-ra esne.

**Az épület és a térkép egy kép** (`terkepBe()`, `terkepKi()`,
`epuletbe()`): a térkép és az alaprajz ugyanannak a helynek két
felbontása, és a kettő egymásba úszik.
- **Kifelé**: az alaprajz kicsinyítése (görgő, csippentés, −) az illesztett
  méret `TERKEP_KUSZOB` (0,6) részéig megy; az ezen túllépő lépést már a
  térkép kapja (`epvKifele()`). A térkép az ELSŐ képkockán pontosan ott áll,
  ahol az alaprajz: ugyanakkora (`k = S.view.k·PXM/s`), ugyanúgy elfordulva
  (`rot` = az alaprajz iránya + az illesztés szöge), ugyanabban a dőlésben
  (alaprajzon 0°), és áttűnik (0,32 s). Onnan repül a ház telephelyére,
  közben északra fordul, és a dőlést visszaadja a nagyításnak — a tömegek
  ettől „kelnek fel”. A lista a telephely házait mutatja. Mérve (OA, telefon):
  a közép az átló 1%-án belül, a méret ±2%-on belül egyezik.
- **Befelé**: a térképen egy megnyitható házra nagyítva (a nagyítás
  középpontja alatt a ház a szabad kép `JEL_BELEP` (0,55) részét kitölti, vagy
  a nagyítás a végére ért), a jelére koppintva vagy a sorát választva a
  kamera a ház fölé repül, a tervlap állására fordul és fölé áll (dőlés 0),
  közben töltődik az adat; a betöltés után a `terkepKi()` a pontos
  illesztésre repül, és ott tűnik át az alaprajzba. A térképről belépve az
  új épület a tervlap rajzolt állásában nyílik (`S.rot = ROT0`): a régi ház
  elforgatása az újban értelmetlen. A küszöbök egymáshoz illenek: a
  térkép 0,6-nál veszi át, és onnan egy lépés befelé visz vissza.
- **Az illesztés a `helyek.json` `terv` mezője** (`tools/terv-illesztes.py`):
  az alaprajz földszintjének (a helyiségek és falak uniója) merev illesztése
  az OSM-körvonalra, az átfedés (IoU) maximalizálásával, tükrözés nélkül
  (egy téglalapnál a tükrözött is ugyanúgy fed, és a döntetlenben az nyert
  volna). Mérve: OA 0,91, FF 0,94, OC 0,89, FK 0,88, OD 0,67. A KH (0,32) és a
  KT (0,46) körvonala nem az épületé, az OB, a TB és az YC az OSM-ben csak pont:
  ezeknél nincs `terv`, az alaprajz közepe a ház pontjára kerül, a tervlap
  állásában (az áttűnés takarja a különbséget). A `helyek.py` újrafuttatása
  után ezt is futtatni kell (az a fájlt újraírja).
- **A kamera két átmeneti állása**: irány (`JEL.rot`, a CSS `rotate()`
  értelmében) és a dőlés felülírása (`JEL.dolX`). Egy repülés (`jelRepul`)
  mindkettőt viheti; ha a hallgató közben átveszi a kamerát (húzás, görgő,
  gomb), a repülés megáll, és a kettő 0,42 s alatt visszalazul északra és a
  nagyításból jövő dőlésre (`jelMegszakit`). Egyetlen képkocka-hurok viszi
  mindkettőt (`jelTick`): képkockánként egy rajz. A repülés közepe a KÉPEN
  halad egyenletesen, nem a világban: befelé a cél egyenletesen csúszik
  középre, kifelé az indulási pont egyenletesen el — világban egyenletesen,
  mértani nagyítás mellett a cél sokáig a kép szélén maradt, és a végén
  rántódott be.
- **Épület nézetben** a dőlést követjük, a perspektívát nem: ott az
  áttűnés takarja a különbséget. Alaprajzon az egyezés pontos.
- **helyek.json nélkül** (első offline indulás) nincs térkép: a panel a
  listát mutatja, az alaprajz látszik, és a kicsinyítés a régi alsó határig
  megy.
**A települések és a campusok kis 3D-s mása** (`jelVarosAdat()`,
`jelVarosSvg()`): ahol az egyes ház pöttynyi lenne, ott NEM méretarányos rajz
kell, hanem MODELL — az adott hely jellemző házai egymás mellé állítva.
Ugyanaz a kód szolgálja ki az ország térképén a városokat és a városén a
campusokat. Az ALAK és a MAGASSÁGOK ARÁNYA igaz (ugyanaz az OSM-körvonal
és szintszám, mint közelről), a HELYÜK a modellen belül nem az; a darabszámot
a címke mondja meg. Amit tudni kell:
- **A modell a település SAJÁT PONTJÁN áll**, a jelenet talaján, saját
  árnyékkal — nem egy kártyában a jel mellett. Egy korábbi változat kártyába
  tette, és „csempékre tett” rátétnek látszott; ez a különbség, nem a rajz.
- **Fix, ferde saját kamerával rajzolódik** (52°), mert a térkép dőlése
  országos léptéken 0: így a lapos térképen is állónak látszik, mint a régi,
  képes térképek házikói. A talpa kerül a pontra.
- **Két sorba, mélységben összeérve** (0,62): egy sorban mérve a modell
  92×27 képpont lett, vékony szalag, amin a 3D nem látszik; teljes mélységgel
  viszont a hosszú házak két külön kupacnak látszottak egy település helyett.
  Az átfedést a festőalgoritmus kezeli, és ettől lesz sűrű város.
  Házanként saját kis árnyék van, nem egy közös folt: azon a hátsó sor
  a levegőben lógott.
- **Legfeljebb 5 ház** (`VAROS_MAX`), előbb a megnyithatók, aztán a nagyobb
  alapterületűek; **körvonal nélküli településnek nincs modellje**
  (Nagymaros): marad a sima jel, kitalált házakat nem rajzolunk.
- **A modell ELMOZDULHAT a pontjától** (`jelCimkek()` első menete): Budapest
  és Székesfehérvár jele az ország térképén 38 képpontra van egymástól, a
  modellek 60–90 szélesek — egymásra ültek, és egy házkupacnak látszottak két
  város helyett. A pont a helyén marad, a modell a mért elhelyezéssel (négy
  oldal, növekvő távolság, 9 képpont köz) odébb kerül, és szár köti vissza.
  **Másik település jelére nem ülhet rá** — a sajátjára igen, azon áll.
- **A modelles település neve a házai ALATT áll** (`.jTel.alatt`), nem
  fölöttük: a név fölött a modell, alatta a név, egy egység — és a chip így
  nem takarja el a saját jelét.
- **A modell szélessége a BENNE álló házak számából** jön
  (`jelModellSzel()`), nem a csoport méretéből: különben a VI. kerület
  egyetlen háza akkorára nőtt, mint a III. kerület öt háza együtt, és a kép
  azt hazudta, hogy ott van a nagyobb telephely.
- **A csoport (telephely) bejárata a listában a fejléc gombja**
  (`.epvcsop`): a jelenetben a campus modellje a célpont, de ahol már a
  valódi házak állnak, ott a ház maga az — a lista fejléce viszont mindig
  ott van, ha a hallgató egy campusra akar szűkíteni.

- Egy épület letöltése 20 s után feladja (`EPV_VARAKOZAS`), és üzenetet ad,
  különben egy elakadt kérés örökre „Betöltés…”-en hagyná.

A nyilvántartás a `/data/` ágon hálózat-először jön, tehát **meg sem érkezhet**
(offline első indulás). Ezért a fejlécben a gomb mellett ott a statikus
épületnév is: az egyik vagy a másik látszik, és nyilvántartás nélkül az app
pontosan úgy viselkedik, mint azelőtt. A `tests/epuletek.js` ezt az ágat
szándékosan letiltott kéréssel is méri.

**Az épületváltás a `D`-ből számolt EGÉSZ állapotot újraépíti.** Betöltéskor
huszonkét modulszintű érték épül fel a `D`-ből, és váltáskor mindegyiket
újra kell építeni — öt függvény teszi, ugyanabban a sorrendben, ahogy
betöltéskor is lefut (`epuletGeo`, `epuletStart`, `epuletRacs`, `epuletRcell`,
`epuletPortal`), és ugyanezeket hívja az `epuletAllit()`:

| függvény | mit épít újra |
| --- | --- |
| `epuletGeo` | `LV`/`LVI`, `GW`/`GH`/`RES`/`CELLS`, `PW`/`PH`, `BB`, `OFFX`/`OFFY`, `ROOM` |
| `epuletStart` | `START` — a porta, a `PORTA` táblából (épületenként kézzel felvéve) |
| `epuletRacs` | `MASK`, `CELLLIST`, `CLEAR` — a járhatóság |
| `epuletRcell` | `RCELL` — melyik cellákon kapcsolódik a helyiség az úthálózatra |
| `epuletPortal` | `LIFTS`, `PORTAL`, `PORTAL_LIFT`, `STAIRXY`, `LIFT_LEVELS` |

Két dolog, amit itt el lehet rontani:

- **A gráf és a gyorsítótárak (`PORTAL`, `MASK`, `CELLLIST`, `CLEAR`, `RCELL`)
  váltáskor HELYBEN ürülnek, egyetlen régi bejegyzés sem maradhat bennük.** Ha
  bármelyik kimarad, a keresés csendben a RÉGI épület rácsán vagy élein fut, és
  egy látszólag hibátlan útvonalat ad egy másik házból. (Korábban itt az állt,
  hogy egy újrakötött `Map`-et „a régi hivatkozások nem látnának meg” — ilyen
  modulszinten elkapott hivatkozás nincs, mindegyik híváskor frissen olvasódik;
  a helyben ürítés a régi bejegyzések miatt kell.)
- **Az `epuletAllit()` ugyanazt a sorrendet futtatja, mint az indulás**
  (`buildFloors` → `placeTags` → `applyLang` → `recompute` → `fit`), hogy ne
  legyen külön, csak váltáskor futó kódút, amit a tesztek nem őriznek.

A váltás mércéje a `tests/epuletek.js`-ben **valódi épületeken mért aranyérték**,
épületenként négy szám a portától: hány kódolt helyiséghez nincs út (OA 3, FF
1, FK 11, KH 14, KT 8, OC 5, OD 6, OB 1, TB 3, YC 1), az elérhetők útvonalainak összhossza
méterre, és a lépcsős meg a liftes gráf élszáma. Pontos egyezést kér, mint a
`tests/eler.js` kivétellistája — ha egy adatjavítás bekötött egy helyiséget,
vagy új épület nyílik meg, ott kell átírni. Az élszám a `D.stairs`-ből
képlettel nem jön ki: az OD-ben három lépcsőpont 7 m-nél messzebb esik a
járható maszktól, a `nodesOf()` kiejti őket, és így a −2. szint lépcsője meg
a földszint–félemelet közti 2-es lépcső nem kerül a gráfba (lásd lejjebb) —
ezért az is mért érték. Mellette **tisztaság**: OA → OD és a hétszintes OA IV.
emeletéről a háromszintes FK-ra váltva egyetlen tárolóban sem maradhat régi
bejegyzés. A teszt maga üríti a tárolókat, és maga hívja újra az öt építő
függvényt ugyanarra az adatra; ha az eredmény eltér, valamelyik ürítő ciklus
hiányzik (a lustán töltött `CLEAR`-é is). A szintdobozok (`FLOOR`) pontosan
az új épület szintjei, és mind a lapon — korábban a `buildFloors()` nem
ürítette, és a régi épület magasabb szintjeinek (a DOM-ból már kivett)
dobozai bent maradtak. Amit ez nem fog meg: egy építő elavult bemenetét (ha
pl. a `LIFTS` újrakötése maradna ki) — arra az aranyérték a háló. Továbbá: OD → KT → OD
ugyanazt méri, az OA hálózat nélkül is visszajön, és az `epuletKesz()` a valódi
OD-adaton, egyenként egy-egy hiányzó elemmel nem kész. (Egy „friss OD-betöltés”
nem mérce: az app mindig a beégetett OA-val indul, a más épületre mutató link
is váltással nyitja meg az OD-t.) **Korábban** az OA
adata volt a mérce más kód alatt: ugyanaz a rács, ugyanazok a cellák, ezért
egy ottmaradt gyorsítótár is ugyanazt az útvonalat adta — a teszt akkor is
zöld volt, ha váltáskor a rács, a helyiség-cellák és a gráf egyáltalán nem
épült újra (élesben ettől a többi épületben a helyiségek 0–1%-a lett volna
elérhető). Átnevezett adattal mérni nem lehet.

**Hiányos vagy ellentmondó adattal nem váltunk** (`epuletKesz()`): a szintek
nevéből és kódjából alulról felfelé növő emeletsornak kell kijönnie (lásd a
szintneveknél), és kell `meta`, `levels`,
`rooms`, `grid`, `masks`, `walls`, `stairs`, és a `PORTA`-ban egy porta. Falak
nélkül a Dijkstra mindenen átmenne, lépcső nélkül a szintek nem érnének össze,
porta nélkül a gyorsgombok rossz helyről indítanának — ilyenkor az épület
marad adatlap, és a lista megmondja, hogy nem érhető el. A szerkezetet is
nézi (`epuletEp()`: sokszög, szint, maszk, lépcsőpontok): egy sokszög nélküli
helyiség korábban az építés KÖZEPÉN dobott hibát, és az app félig váltott (a
`D` az új épület, a `ROOM` és a kép a régi). Ha az építés ennek ellenére
elbukik, az `epuletValt()` a régi épületet építi vissza, és üzen. **Ezért a `navigalhato`
nem azt jelenti, hogy van tervlap**, hanem hogy az app adata kész.

**Tíz épület nyitható meg: az OA (beégetve), és a `data/epuletek/`-ből az OD,
FF, FK, KH, KT, OC, OB, TB és YC** (a tervlapokból gépi úton kinyerve, lásd
`docs/ATADAS.md`; az OB, a TB és az YC az IFC-modelljük segítségével, lásd
„Új épület az IFC-vel”). Az OD volt az első. Ami mind a kilencre áll:

- **Ajtóadat az OD-ben, FF-ben, FK-ban, OC-ben, OB-ben, TB-ben és YC-ben van** (az épület IFC-jéből,
  `tools/ifc-epulet.py`, lásd „Ajtók más épületben”), a KH-ban és a KT-ban
  nincs (nincs IFC-jük). Ajtó nélkül az útvonal nem az ajtónál ér véget,
  hanem a helyiséghez legközelebbi cellánál — ha az egy leszakadt foltban
  áll, a fő hálózat egy falnyira eső cellájánál (lásd „A helyiség kötése
  ajtóadat nélkül”) —, ahogy az OA-nál is volt az `ifc-ajtok.py` előtt.
- **Lift sincs az adatban**: a tervlap helyiségnevei közt nem volt azonosítható
  liftfülke, így liftes alternatíva sincs. Ez ellenőrizendő a helyszínen; ha
  van, a `lifts` tömbbe kell felvenni.
- **Egy épület csak akkor nyílik meg, ha a `data/epuletek/<kód>.json` mellett
  a `PORTA` táblában is van portája** — kézzel felvett érték. Ahol a tervlapon
  van „PORTA" nevű helyiség, az (az OD-ben `OD00F01`, DOLGOZÓI TERÜLETEK
  kategóriában, a SZÉLFOGÓ `OD00FK1` és az ELŐCSARNOK `OD00FK2` mellett —
  ugyanaz a minta, mint az OA-é); ahol nincs, a bejárati tér (az FF-ben a
  szélfogó, `FF00FK1`).

**A helyiség kötése ajtóadat nélkül** (`epuletRcell()`): a helyiség a
csúcsaihoz vagy a középpontjához legközelebbi járható cellához kötődik. Ez a
cella egy leszakadt, pár cellás foltba is eshet — a kinyert maszk
szilánkjába —, akkor is, ha a fő folyosó a fal túloldalán áll. Az OD-ben az
`OD00F02` rajzterem és az `OD35E04` iroda így nem volt elérhető, pedig a fő
hálózat cellái a sokszögüket érintik, az `OD35E04`-ébe bele is nyúlnak (egy
4, illetve 32 cellás szilánk csúcsa volt hozzájuk közelebb). Ezért egy
második menet: ha a cella nincs a **fő úthálózaton** (`foHalozat()`: a
szintenkénti 4-szomszédos foltok, amelyeket a `D.stairs` a porta foltjával
egy rendszerbe köt; porta nélkül a legnagyobb rendszer), a régi cella MELLÉ
felveszi a fő hálózat legközelebbi celláját, ha az a helyiség egy élének
belsejétől legfeljebb `KOTES_TAV` = 1,2 m-re van (a sokszögön belüli cella
0), vagyis egy falnyira, és ha onnan a saját szintjén az épületen belül is
el lehet jutni a portáig vagy egy lépcsőig (`bentrolVizsgalo()`). Amit tudni
kell:
- **A régi cella marad.** Kicserélve elveszett volna minden út, ami a saját
  foltján belül vezetett a helyiséghez (a KH pincéjének nagyobbik, 497
  cellás, a lépcsőháztól egyetlen falcellával elvágott részén a `KHX1PK2`
  előtérből a `KHX1P03` műhelybe); a `tests/epuletek.js` ezt külön méri.
- **Kívülről nem köt.** A kinyert maszkon az épület körül egy cella széles
  járható gyűrű fut, és a homlokzat ablakrésein át a szobákba is bevezet; a
  fő hálózatnak ez is része. Egy korábbi változat így kötött be három
  KH-szobát (`KH00F36`, `KH00F37`, `KH00F42`): az útvonal a fal túloldalán,
  a homlokzat előtt ért célba, vagy ablakon át ment be. Kint az a sokszögön
  kívüli járható cella, amelyikből nyolc irányból legalább háromban semmibe
  nem ütközve ki lehet látni a tervlap széléig (`kintVizsgalo()`); a két fal
  közti sáv (a KT lakóegységei előtt) és a sokszög nélküli belső csarnokrész
  (az OD előcsarnokában) így bent marad. Egy 6 m-es sugár ez utóbbit még
  kintnek vette; a kötéseken nem változtatott, de a szabály így pontosabb.
- **Csak él, csúcs nem.** A sarkon túli cella többnyire olyan helyiségben
  áll, amellyel a célnak nincs (`KHX1PK1` folyosó, `KHX1PL1` lépcsőház) vagy
  csak arasznyi közös fala (az `OC00F32` BETEG WC a zsibongóval 0,5 m-en; a
  bejárata az előtere). Az `OD00F03` rajzteremnél viszont túl szigorú: ott a
  sarki cella abban az `OD00FK2` előcsarnokban van, amellyel 7 m-en közös a
  körvonala. Ha ezt lazítani kell, a közös körvonal hossza a jó mérce, nem a
  távolság.
- **A küszöb 1,2 m.** A leghosszabb bekötés 1,18 m (KT10E97/98, egyetlen
  fal), a következő jelölt 1,385 m-en már egy másik helyiség túloldala lett
  volna, és az útvonal hamisan érne célba. Az 1,2 m óvatos választás e kettő
  közt, nem levezetett érték.
- **Az ajtós és a `via`-n át megközelíthető helyiséghez nem nyúl.** Az OA 68
  olyan helyiségére, amelynek se ajtaja, se `via`-ja nincs (ajtó nélküli 94
  van), viszont lefut; ott mérve egyetlen kötés sem változott (az OA és az FF
  `RCELL`-je bájtra azonos) — ez mérés, nem szerkezeti garancia: egy
  OA-adatjavítás után az aranyérték mutatja meg.
- Elérhető lett az OD-ben 2, az FK-ban 2, a KH-ban 4, a KT-ban 3 helyiség, az
  OC-ben egy sem (az OD-ben és az FK-ban azóta az IFC-ajtók kötik be őket, a
  kötés ott nem fut; a `tests/epuletek.js` az OD szabályát ajtók nélkül,
  a `doors`/`via` levételével méri); a helyiségpárok közti utak közül (mind a hét épületben,
  minden kódolt helyiségből mindegyikbe) egy sem veszett el, és a
  mosdóválasztó sorai a portától nem változtak.
- A fő hálózatot épületenként egyszer számolja (2–8 ms); egy korábbi,
  helyiségenkénti foltkeresés az OA indulását +60 ms-mal lassította. Most az
  OA hideg indulása ~18 ms-mal hosszabb (öt váltakozó kör mediánja a
  tesztgépen, a DOMContentLoaded a válasz végétől). A kint-vizsgálat csak
  akkor fut, ha egy jelölt már a fő hálózaton van: az OA-ban egy sincs ilyen,
  máshol a váltás 3–40 ms-mal hosszabb (a KH-ban a legtöbb, a tesztgépen).
- **A legközelebbi cella keresése ablakos** (`nearestCell()`, az első menet,
  `kotesJeloltek()`): csak a 7, 6 m-es, illetve `KOTES_TAV`-os körön belüli
  cellákat nézi, nem a szint mind a több tízezer celláját, a CELLLIST
  sorrendjében (soronként, sorszám szerint), így egyenlő távolságnál is
  ugyanaz a cella nyer. Az `RCELL`, a `PORTAL` és a kötésjelöltek mind a hét
  épületen bájtra azonosak a teljes bejárásúval (mérve); az OA-n az
  `epuletRcell()` 4× lassított CPU-val 240 → 49 ms.
- A `tests/epuletek.js` minden többcellás kötést ellenőriz: a felvett cella a
  helyiségen belül vagy egy élétől legfeljebb `KOTES_TAV`-ra van, a kettő
  közt nincs harmadik, nem közlekedő helyiség, és a portától odavezető út a
  célszinten nem megy az épületen kívül (ezt az app raszterétől függetlenül,
  pontos geometriával méri); épületenként mind a hétben rögzített a
  bekötések száma, és a három KH-szobához nincs útvonal.

Ami csak az OD-re áll: **a 229 helyiségből 223-hoz van út a portától** (az
IFC-ajtók előtt 217-hez). Ami kimarad (a valódi appban mérve): a −2. szint
három helyisége és a földszinti öltözőblokk (`OD00F24`–`F26`). Az ajtók előtt
így állt:
- a −2. szint három helyisége. A `D.stairs`-ben VAN lépcső a −2. és a −1.
  szint közt (`ODX2PK1` → `ODX1P09`), de a −1-es vége 8,9 m-re esik a
  legközelebbi járható cellától, és a `nodesOf()` 7 m-es korlátja kiejti; az
  `ODX2P01`-nek 6 m-en belül cellája sincs;
- kilenc földszinti helyiség: hét nyugati (F22–F26, a `OD00FK4` közlekedő és
  az `OD00FK5` raktár) egy 123 cellás foltban. A szárny `OD00FK4` közlekedője
  megvan és járható, de a foltja 21,6 m-re van a fő hálózattól, és egyetlen
  közlekedő sem köti hozzá: a bejárat valószínűleg helyiségeken át vezet, ami
  `via`- vagy ajtóadat kérdése, nem a kötésé; az `OD00F28`-nak 6 m-en belül
  egyetlen járható cellája sincs; az `OD00F03` rajzterem saját, 33 cellás
  foltja (az alsó éle mentén, az előcsarnok körvonalán belül) el van vágva,
  és a fő hálózat legközelebbi cellája 1,05 m-re, de a sarkánál van, ahová a
  kötés nem nyúl — itt a szabály a szigorúbb oldalon téved (lásd fent).
Az OD 2-es lépcsője (`OD00F15` ↔ `OD05E04`, földszint–félemelet) is kiesik a
gráfból: mindkét vége 7 m-nél messzebb van a maszktól (9,2 és 7,7 m). Mivel
két, egyébként elérhető labort köt össze, elérhetőségi hatása nincs. Ezt mérni
kell, nem tippelni — a mérés egy sorban megvan:
`dijkstra(ROOM[START],PORTAL,null)` után `routeTo()` minden kódolt
helyiségre. A többi épület elérhetetlen helyiségei a `docs/ATADAS.md`-ben.

**Más épületben az OA-ra szabott szöveg és adat hamis.** Hat ilyen hiba
vitte rossz helyre a hallgatót vagy hagyta segítség nélkül, mind javítva, a
`tests/masepulet.js` őrzi:
- **A szint neve és helye az épület saját szintjeiből jön**, nem a
  sorszámból (`szintAdatL()`). Az OA-ban az 1-es szint a félemelet, máshol
  többnyire már az I. emelet, az OD-ben a 6-os az V. emelet: a sorszámra írt
  táblák ott „Lépcsőn fel a félemeletre”-t mondtak az I. emelet helyett, az
  OD V. emeletére „undefined”-ot, és rosszul számolták a szinteket. **A szint
  neve az elsődleges** (Alagsor, Pince -N, Földszint, Félemelet, I…X. emelet,
  Tetőtér), mert a szintválasztó is azt mutatja; a félemelet az alatta lévő
  szint fölötti fél, a tetőtér az alatta lévő fölötti egész emelet. A kód
  (X2, X1, 00, 10…90, a második jegy nem 0: félszint) csak az ismeretlen nevű
  szintnél dönt („Udvar szint”, „1-2 felszint”). **Ha a név és a kód is mond
  emeletet, és mást mond, vagy a sor nem nő alulról felfelé, az épület nem
  nyílik meg** (`szintekRendben()`): nem tudni, melyik a jó. A kód nem
  mindenhol emelet — a BA, BB és YB táblájában a földszint kódja 10 —, a név
  sem mindig — a TA a TC-vel közös lapjain a TC emeletszámait kapta —, és a
  KD félemeletének kódja 15, holott a földszint fölött áll. A leltár szintjeit
  az `epulet-json.py` módján képezve ma ezért maradna adatlap a BA, BB, BF,
  YB (a név nélküli, 00-s kódú udvarszint egy második földszint lenne), a KD
  és a TA; a 10 megnyitható épület mind átmegy. A javítás az eszközben van:
  írja ki egyértelműen a szint fajtáját és emeletszámát. A ragozott célszint
  (`lvTo()`), az angol szintnév (`lvName()`) és a 3D-s szintfelirat meg a
  szint felolvasói neve is ebből készül (ez utóbbi kettő az OA-ban is magyar
  maradt angolul); az „az” az I. és az V. előtt áll.
- **A foglalható termek az OA-é** (a `data/termek.json` a NIK-órarendből): más
  épületben a gomb nincs kint, a lista és a terem adatlapjának foglaltsága
  sem jön. Korábban az OD-ben és a KT kollégiumban is az OA 24 terme állt
  „Szabad” jelzéssel.
- **A liftes megjegyzés** (`liftMegj()`) az OA-ban az FL3 magról szól, máshol
  feltételesen fogalmaz: a liftek — ha vannak — még nincsenek a térképen.
  Liftre utaló helyiség három épületben van (OD50E02 és OC50E03 gépház, KT00F05
  liftkapcsoló), az FF, FK és KH adatában és leltárában semmi; fülke-helyet
  egyik tervlap sem ad, gépház hiánya pedig nem bizonyítja, hogy nincs lift.
  Lifttel felvett más épületre külön szöveg áll készen (`liftOther`,
  `noLiftOther`), ma ez az ág nem fut.
- **A nemre nem jelölt mosdó** („WC”, „MOSDÓ”) sosem kerül a női vagy a
  férfi sorba: ha valamelyik jelölt sor hiányzik, egy külön, semleges sor
  mutatja („Mosdó (nemre nem jelölt)”). Ajtóadat nélkül egy kollégiumi
  lakóegység saját WC-je nem különböztethető meg egy nyilvános mosdótól, és
  korábban az jött „Női” és „Férfi” mosdóként is (KT, FF, FK, KH) — két sorban
  ugyanaz a helyiség.
- **A mosdó neve épületenként másképp áll** (`iconsOf()`): az akadálymentes
  az OA-ban „AK. MENT.”, a KH-ban „M.K. WC” (mozgáskorlátozott), a KT-ban
  „M.S. MOSDÓ” (mozgássérült), a leltár más épületeiben „MK.”, „MS.”, „AKM.”;
  a nő „NŐI”, „NŐ”, „N”, a férfi „FFI”, „FF”, „F”; a „FFI PISZOÁR” is férfi
  mosdó; a mosdó „MOSD.” is lehet. Az első változat csak az OA alakját
  ismerte, és a KH meg a KT akadálymentes mosdója eltűnt a mosdóválasztóból.
  A kategória nélküli helyiségnél (a táblából hiányzik, csak a tervlapon van
  meg: az OC I. emeleti `OC10E28` FFI WC és `OC10E29` NŐI WC) a név dönt; más
  kategóriában (KÜLSŐS SZOLGÁLTATÁS: személyzeti, beteg WC) nem mosdó. A név
  szerint személyzeti (TANÁRI, OKTATÓI, TAKARÍTÓI, SZEMÉLYZETI, DOLGOZÓI)
  mosdót a mosdóválasztó nem kínálja (`SZEMELYZETI_WC`).
- **A Büfé gyorsgomb** csak ott van kint, ahol van pontosan „BÜFÉ” nevű
  helyiség (ma az OA-ban és az FK-ban, `FKX1P10`): máshol koppintásra semmi
  nem történt volna.

## Kipróbálás

```
npm install          # playwright (a böngésző a képen már megvan)
npm test             # mind a 27 tesztfájl (fájlonként legfeljebb 15 perc)
node tools/ellenor.js  # böngésző nélkül, másodpercek alatt: a szkriptek fordulnak, az adat ép (a CI is ezt futtatja)
pip install -r tools/requirements.txt   # csak a tools/ szkriptjeihez
node tests/run.js url share     # csak egy-kettő
```

A tesztek saját szervert és saját böngészőt indítanak szabad porton, így nem
kell előre semmit elindítani. **Fix portot ne használj**: egy ottfelejtett
szerver miatt egyszer egy RÉGI build ellen futottak a tesztek, és zölden
hagytak egy hibás kódot.

| fájl | mit őriz |
| --- | --- |
| `tests/view.js` | alaprajz/épület váltás, szintváltás, kiválasztás valódi egérrel és érintéssel (Épület nézetben is), a falak oldallapja — **élesben bejelentett: asztalon kattintásra nem jött elő a terem** |
| `tests/url.js` | mély linkek, a vissza gomb, hibás link; indulás nélkül a portáról (`START`) tervez — linkből, az „Ide” gombbal, a gyorsgombokkal; a mosdóválasztó (női, férfi, akadálymentes, a dolgozói és a csak más helyiségen át megközelíthető mosdók nélkül) és a büfé gomb célja; a csonka „%”-os link (az indulás végigfut, a service worker regisztrál, a címsor nem ragad zárva), a rövid alak toldalékkal (`#OA10E18?utm…`), az Esc a címből is törli a kijelölést, az OA nem létező kódjára felirat szól; a Porta gomb CÉL (az indulás marad); a foglalható termek listájának Vissza gombja, és a rendszer Vissza gombja a listát zárja, nem az appot; a listából választás után nincs holt Vissza-lépés; az „Ide megyek” után az útvonal eleje a képernyőn van (az Audmax órarendi kártyájával görgetés nélkül 1176 px-en kezdődött) |
| `tests/share.js` | megosztás gomb mindkét ága; vágólap nélkül lapon belüli linkablak (nem `prompt()`); a totemen nincs megosztás gomb |
| `tests/gestures.js` | csippentés, forgatás, tolás, a kétujjas felemelés, akadozó képnél is — **élesben bejelentett fagyás**, „csúnya átmenet" és a vissza nem váltó lefelé húzás |
| `tests/labels.js` | teremszámok Épület nézetben: ott vannak, állnak, a termük fölött, élből nézve is, és nem villognak |
| `tests/lift.js` | lépcső vs. lift alternatíva |
| `tests/sheet.js` | az alsó panel aljának elérhetősége; fekvő telefonon (844×390, 667×375) és alacsony asztali ablakban (932×430) a szintsín a fejléc alatt, a +/− gombokon kívül, görgetve, az aktív szint látszik; a zárt menü rejtett, az Esc bezárja, a fókusz a menü gombjára tér vissza |
| `tests/staff.js` | hallgatói/minden szűrő; a tervtári színkulcs (minden helyiség, a halványított is a saját színében; a jelmagyarázat sorrendje) |
| `tests/termek.js` | foglalható termek: heti órák, páros/páratlan hét, ünnepnap, a félév előtti és utáni nap, a más karral közös termek, a térképen kiválasztott terem adatlapja, a sorrend (ami most szabad, elöl; az indulástól menetidő szerint), és a deploy után a régi service workerben ragadt fájl; a szabad terem sora a következő óráig szól („10:45-ig”, nem „-tól”); elbukott letöltésnél „nem sikerült betölteni” (nem „nincs adat”), és a lista újranyitása újrapróbál |
| `tests/pwa.js` | manifest, service worker, **offline indulás** (a service worker saját kéréseit is elvágva), a teremadat frissessége és `?v=`-s újrakérése (a friss példány a paraméter nélküli kulcs alá kerül); alkönyvtáras hatókörrel is (`/oemap/`, a régi github.io-s cím alakja; a saját domain gyökérhatókörét az első szakasz méri): a szerver 404-e (kikapcsolt Pages) és egy másik lap (mérőlap) nem kerül a tárolt app helyére, egy másik lap 404-e 404 marad, az átirányítást viszont követi; app nélkül nem települ; aktiváláskor csak a saját régi tárolóit törli; lassú (8 s-os) hálózaton ~3 s alatt a tárolt app és teremadat jön (mindkettő időre mérve); egy 200-as, de nem JSON adatválasz nem írja felül a tárolt példányt (a teszt megvárja, hogy a hibás válasz tényleg kiszolgálódjon: a böngésző ugyanarra a címre sorba állítja a kéréseket, és egy függő lassú kérés mögött a hibás válasz az ellenőrzés után jött volna); offline egy másik (elgépelt) lap nem az appot kapja |
| `tests/a11y.js` | billentyűzetes bejárás, felolvasónak szóló jelölés; a panel és a szintválasztó újrarajzolása, a téma váltása nem dobja el a fókuszt; az indulás/cél törlése önálló, megnevezett gomb, billentyűvel is, a fókusz a sorára kerül; a zárt jelmagyarázat rejtett, `aria-expanded`, az Esc a gombjára adja vissza a fókuszt; a lap nyelve (`lang`), címe, h1-e és statikus címkéi a nyelvvel váltanak, a kereső a `<main>`-ben; nagyítva a nyíllal fókuszált terem a képen belül van, a térkép doboza nem görget |
| `tests/perf.js` | Épület nézet: képkockánként hány renderpass, a telefon (GPU-s) kódútján — **élesben bejelentett akadozás** |
| `tests/neptun.js` | ajtószámok (Neptun-nevek) a térképen, a keresőben (pont nélkül is: „110”) és az adatlapon; az F06 nem állhat az OA00F03-on (az F09); a földszinten Neptun-névnek látszó tervlapi kód (a büfé „F04”-e) nem állhat feliratként; a foglalható termek listájából a térképre ugrás; a kereső a hallgató szavaival (mosdó, női, akadálymentes, toilet, kávé, bejárat), a dolgozói és a raktárból nyíló mosdó nem elöl, egy kétbetűs töredék nem hoz mosdót; a párosító mód (`?parosit`) |
| `tests/ajtok.js` | az útvonal az ajtó előtt ér véget, több ajtó közül a közelebbinél; a csak más helyiségen át megközelíthető termekhez (I. emelet E03–E07, II. emelet E03, E04) is van útvonal, és a lépések kiírják, min át |
| `tests/lepesek.js` | az útvonal lépései: a lépcsőzés egy lépésben, nevén nevezett célszinttel („Lépcsőn fel a II. emeletre”, angolul „…to the 2nd floor”), a félemelet fél emelet, a cél az ajtószámmal; a fordulás lépése azt mondja, mennyi egyenes UTÁN kell fordulni („Fordulj jobbra · ~48 m után”), és a lépések méterei kiadják a szakaszok hosszát |
| `tests/eler.js` | minden helyiséghez van-e út (lépcsőn a portától, lifttel a földszintről); a kivételek listája két irányba szigorú |
| `tests/lepcsok.js` | a lépcsőkarok rajza: minden lépcsőház minden szintváltásánál ott a kar, karonként egy kis path a falak alatt, és a vonalára kattintva a lépcsőház jön elő, nem törlődik a kijelölés |
| `tests/ikonok.js` | mosdó-, lépcső- és liftjel: minden mosdón és lépcsőházon a jó jel, a teremszám helyett, a feliratpontján; Épület nézetben magonként egy jelvény, alapnagyításon mind kint, teremszámra nem lógva |
| `tests/sharp.js` | Épület nézet asztalon, nagyítva: éles-e a kép, nem mozdul-e a sűrűségtől, nem vált-e mozgás közben, csak az aktív szintnél, telefonon és más motorban nem, Firefoxban a saját kódútján (3D-ben minden szint saját transzformmal, a lapos alaprajzon egyik sem) — **élesben bejelentett „irgalmatlan életlen" asztali 3D, Chrome-ban és Firefoxban, és a Firefoxos „éles, homályos, megint éles" váltás** |
| `tests/totem.js` | totem mód: egy perc tétlenség után alaphelyzet, húsz másodperccel előtte szól, gesztus közben soha, naponta újratölt — a Playwright órájával, percekig várás nélkül; a nyitott épületválasztó térképét is bezárja (áttűnés nélkül: az alaprajz rögtön látszik), a figyelmeztetés a térkép fölött is látszik, a totem választójában nincs alapértelmezett, csillag és GPS, és a forrás nem hivatkozás; egy alaprajz nélküli épület (BA) totemjén az alaphelyzet után a választó nyitva marad az üzenetével; a link végére, a # után írt `?totem` is bekapcsolja — **élesben bejelentett: „nem működik az alaphelyzet"** |
| `tests/kuld.js` | telefonra küldés: a QR-kódot a képernyőképből olvassa vissza (jsQR), a csendzónát és a sérült kódot külön méri, sötét témában is; a beolvasott link telefonon ugyanazt az útvonalat nyitja meg, lifttel; a totemről `?totem` nélkül |
| `tests/meres.js` | a telefonos mérőlap (`meres.html`) végigfut a valódi appon, az OA-n akkor is, ha a készüléken más az alapértelmezett épület |
| `tests/epuletek.js` | épületválasztó és **épületváltás**: mind a 39 épület bent van (településenként végigjárva, mindegyik pontosan egyszer), de csak az nyitható meg, aminek kész az adata; a Tervtár adatai a soron, az adatlapon a nem megnyithatónál nincs megnyitó és alapértelmezett gomb; az Esc csak a választót zárja, a kijelölés marad; más épület kódjára mutató link megnevezi az épületet, nem tűnik el csendben; a váltás mércéje **valódi épületeken mért aranyérték** (épületenként az elérhetetlen helyiségek, az útvonalak összhossza és a gráf élszáma a portától), a váltás utáni **tisztaság** (egyetlen tárolóban, a szintdobozokban sem marad régi bejegyzés), OD → KT → OD (a KT betöltésével); az OD IFC-ajtókkal: a két terem ajtaja a hálózatra nyílik, az OD00F03 az OD00F02-n át érhető el; ajtók nélkül (a teszt leveszi őket) a fő folyosó mellé, de leszakadt szilánkhoz kötött OD-helyiségek (OD00F02, OD35E04) elérhetők, a csak sarkával érintkező OD00F03 nem; minden többcellás kötés egy falnyira van, harmadik helyiség nélkül, és odáig a célszinten az épületen belül vezet az út (pontos geometriával mérve); a homlokzat előtti gyűrűn és ablakrésen át nincs útvonal (KH00F36, KH00F37, KH00F42); a bekötések száma mind a tíz épületben rögzített; a portáról egyik épületben sem mosdón át indul az út (TB), és a saját foltján belüli út (KHX1PK2 → KHX1P03) megmarad; offline vissza az OA-ra; az `epuletKesz()` egyenként mind a hét kötelező elemre és a portára, és hibás szerkezetre (sokszög nélküli helyiség, maszk nélküli szint, hibás lépcsőpont…); ha az építés mégis elbukik, a régi épület épül vissza (nem félig vált); az ablakos cellakeresés véletlen pontokon és minden helyiségen ugyanazt adja, mint a teljes bejárás (OA, OD) — az aranyértékek egy szűkebb ablakot nem vennének észre; a nem elérhető adat üzenete angolul is a kóddal; **nyilvántartás nélkül** (első indulás, letiltott kérés) a gomb el sem jelenik meg, és az app elindul |
| `tests/valaszto.js` | a választó: **egy ablak** — a térkép az alaprajz helyén áll, ugyanakkorán, nyitott `<dialog>` nélkül (hat képernyőméreten); kifelé görgetve az alaprajz az illesztett méret 0,6-áig megy, ott a térkép veszi át, az átadás pillanatában a ház az alaprajz helyén (a közép az átló 4%-án, a méret ±10%-on belül), ugyanúgy elfordulva, felülnézetben; utána északra fordul, a lista a telephely házait mutatja, az alaprajz és a szintsín rejtve; egy megnyitható házra görgetve belép, a sorára kattintva a ház fölé repülve (az alaprajz állására fordulva) tűnik át; az Esc visszavisz (a panel azonnal, a kép áttűnve); minden címmel bíró épület helye a saját települése és az ország határán belül; Budapesten a csoportok jele a Duna jó oldalán (a III. kerületé Budán), a Duna a képen fut a nagyításhoz mért szélességgel, a III. kerület csoportja a hét óbudai épület; a címkék hat képernyőméreten (telefon, keskeny, fekvő, asztal, alacsony és kis asztali ablak), négy nézetben nem fedik egymást és más jelét, és a térkép szabad részén (a panel és az alsó lap nélkül) maradnak, átméretezés után sem; a biztonsági sávokkal (CDP-vel emulálva) a forrás a képen, a fejléc alatt, a lap és a kezdősáv fölött; a házikó felirata telefonon is látszik; az OSM-forrás (ODbL, hivatkozással) a felületen; **alapértelmezett épület**: beállítás, a házikó, induláskor megnyílik, a link, a totem (cím nélkül is) és a párosító mód elsőbbsége, kikapcsolás, hálózat nélkül az OA marad, letiltott tárolóval is fut; **a csendes betöltés közben** választott terem marad, az ugyanarra az épületre mutató link érvényesül, a választott másik épület nyílik meg, a nyitott választó nem csukódik be (és nem mutat „Betöltés…”-t), egy görgetés megállítja, a házikó nem tölt újra; **GPS**: az OD körvonalán belül, a faltól 9 m-re „itt vagy”, előtte a körvonaltól mért távolság, a már nyitott épületnél nincs megnyitás, az YA-nál az YB is, messziről km, letiltott engedélynél üzenet, a bezárt választónál késve jött hely eldobódik; `helyek.json` nélkül csak a lista; a fókusz (zárt választóban nincs tab-állomás, nyitva a Tab nem jut a rejtett alaprajzra, a szintsínre és a kereső panelére, zárva visszatér, a sorról nem ugrik a jelenet címkéjére, a GPS-eredményre megy, a házikó, a töltés és egy azóta rejtetté vált nyitógomb után sem esik a `<body>`-ra); angolul „1 building”; a felirat a térkép és az alsó lap fölött látszik, és újrarajzolás után is megvan; a térkép üres részére kattintva és rajta húzva nyitva marad, a fejléc gombja zárja; fekvő telefonon (844×340 és a 900 px-nél szélesebb 932×380) a GPS-eredmény után is elérhető a lista; ugyanazon a nézeten újrarajzolva a görgetés marad; az alapértelmezett doboz gombja „Betöltés…”-t mutat; a linkről indult betöltés alatt választott terem marad; egy soha be nem fejeződő letöltés 20 s után üzenetet ad; az elakadt linkes váltás újrapróbálva a link termét nyitja, a hibalap bezárása után már nem; a két épületet vegyítő link egyszer vált, a history-ba nem tesz közbülső bejegyzést, és a címben sem marad a másik épület kódja |
| `tests/jelenet.js` | a folytonosan nagyítható jelenet és a három lépcsője: országos léptéken a települések kis mása (Budapest, Székesfehérvár — Nagymarosnak nincs körvonalas épülete, tehát modellje sem), a város fölött a kerületek modellje a valódi helyükön (egyetlen valódi ház sem, az a következő lépcső), a campus fölött a valódi házak mind megnevezve; a modellek jól láthatók (≥30 px), nem fedik egymást, nem lógnak ki és nem takarnak másik jelet, és a többházas campusé szélesebb az egyházasénál; a magasság a szintszámból jön (OD > OA > OC); a hátrafelé néző falak kimaradnak (ARÁNYRA mérve); a húzás a kamerát mozdítja és nem nyit épületet, a koppintás megnyitja (alaprajz nélkülinél az adatlapját: a VIII. kerület TA-ja, mert a címke szára nem kaphatja el a koppintást a jel elől); a +/− gomb (ugyanaz, mint az alaprajzon, telefonon is kint) nagyít-kicsinyít és fokon marad, a kézi nagyítás után a kamera beakad a legközelebbi fokra, és az országnál kijjebb nem lehet menni; a címkék és a modellek telefonon, keskeny telefonon és asztalon sem fednek és nem lógnak ki a szabad részből, a doboz a képernyőn belül van; a jelenet csoportjára koppintva (FG) a lista szűkül és a kamera odarepül (a lista és a jelenet ugyanazzal a csoportosítással: `epvCsoportok(l,JELVET,CSOP_M)`), húzás után is működik a billentyűs Enter a címkén, sötét témában a kiválasztott címke kontrasztja ≥ 4,5 (`--accent-ink`) |
| `tests/masepulet.js` | más épületben nincs OA-ra szabott dolog: a foglalható termek (az OA órarendje) nincs kint, a Büfé gomb csak ahol van büfé (OA, FK; az OD-ben nincs); a szintnév és az emeletszám az épület saját szintjeiből (KT I. és IV. emelet, KH tetőtér, OD V. emelet, egy félszint és egy „Pince”, angolul is), a név az elsődleges (a KD-alak félemelete a földszint fölött, a kötőjel nélküli „Pince 2”), de ahol a név és a kód ellentmond (KD, TA) vagy két földszint jönne ki (BA), az épület nem nyílik meg; a 3D-s szintfelirat és a felolvasói név angolul (OA, KT); a liftes megjegyzés a lift nélküli szöveg; a nemre nem jelölt WC nem „Női” és „Férfi” mosdó, hanem semleges sor; a mosdónevek írásmódjai, a kategória nélküli OC-mosdók, a személyzeti WC kizárása, a mosdó-előtér mögötti WC (OC I. emelet) számít; a KH és a KT akadálymentes mosdója ott van; vissza az OA-ra minden OA-s dolog visszajön |
| `tests/csomag.js` | a Pages-re publikált csomag (`tools/pages-csomag.js`): csak engedélylistás fájl, belső anyag és fejlesztői fájl nincs benne, minden, amire a lapok és a manifest hivatkoznak, benne van; a célkönyvtár nem lehet a repó, a szülője, egy forráskönyvtár, sem egy csomagnevű, de idegen tartalmú könyvtár (a repó-szabály külön is mérve); és az app ebből a csomagból minden épületen végigváltva, a service workerrel együtt egyetlen sikertelen kérés nélkül fut |

## Amit érdemes tudni, mielőtt hozzányúlsz

**A gesztusok érzékenyek.** A húzás-állapotot egyetlen `startDrag()` állítja
elő. Volt, hogy két helyen épült, és az egyik ág nem vitte át a forgatás
kiindulóértékeit — NaN lett a szögből, a térkép befagyott, a feliratok
elmásztak. A `tests/gestures.js` pont ezt az esetet játssza le (az egyik ujj
előbb emelkedik fel, mint a másik). Ha a pointer-kezeléshez nyúlsz, ez a teszt
a hálód.

**Asztalon a panel lebegő kártya, nem oszlop.** Élesben „túlságosan
kijön”-nek találták a teljes magasságú, tömör oldalsávot: most a térkép a
teljes szélességen fut, a panel (kereső, gyorsgombok, adatlap) bal felül
lebeg, a tartalmához igazodó magassággal, áttetsző háttérrel; a
gyorsgombok keret nélküli sorok. Ami ebből következik: a térkép egy részét
a panel takarja, ezért az illesztés (`fit()`) és a teremre igazítás
(`lathatova()`) a SZABAD területre számol (`szabad()`: asztalon a panel a
bal, a szintsín a jobb szélét takarja, telefonon az alsó lap az alját) — a
panel mögé illesztett épület fele nem látszana. A térkép (választó) ugyanezt
használja a kamera közepéhez.

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
tervlap rajzolt állása, zárt panel, hallgatói nézet, zárt QR-ablak. Húsz
másodperccel előtte szól (a WCAG 2.2.1 legalább 20 s-ot kér; korábban 10 volt), és bármilyen valódi bevitel megállítja (a `window`-on,
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

**Ajtók más épületben: `tools/ifc-epulet.py`.** 2026-ban megjött tizennégy
épület IFC-je (ugyanaz az Archicad-sablon, „Visible elements”, mm-ben). A
négy megnyithatónál (OD, FF, FK, OC) ez írja a `doors`-t, a `via`-t és a
`flights`-t a `data/epuletek/<kód>.json`-ba, az OA eszközeinek (`ifc-ajtok.py`,
`ifc-lepcsok.py`) szabályával és kódjával — azokhoz nem nyúl, az OA IFC-je
nélkül nem futtathatók újra. Ami eltér:
- **A szint a nevéből jön** (`emelet()`: „FSZ”, „P1”, „Félemelet”, „1.emelet”,
  „I. emelet”), és az épület adatának szintneveihez párosul. A tető, a
  kazán, a „6. Szint” kimarad; az OC V. emelete az IFC-ben nincs meg.
- **Az ajtót a geometria ismeri fel, nem a név**: az OD-ben az ajtó „AJ-…”,
  az „M…” ablak, az OC-ben az „A…” ablak, az FF-ben a „D…” ajtó. Ajtó a
  legalább 1,8 m magas nyílás, ha a gazdafala aljáról indul, vagy a neve
  ajtóé.
- **Az illesztés** a legtöbb közös falú szinten fut; a térkép falainak
  91–96%-a 10 cm-en belül esik az IFC falaira (az OD −2. szintjén és
  félemeletén 75%). Mind a négy épületben tükrözött, 22,9°-kal elforgatott,
  mint az OA.
- **Mit hozott** (a portától, a valódi appban): elérhetetlen helyiség FF 3 →
  1, OC 6 → 5, OD 12 → 6 (a nyugati szárny és az `OD00F03` az ajtaik és a
  `via` révén). Az FK-ban a szám nem változott, de az útvonalak összhossza
  20%-kal csökkent: korábban az `FK00F13`-hoz az út a homlokzat előtti
  gyűrűn kerülte meg az épületet (104 m), most az ajtaján át megy (28 m).

**Új épület az IFC-vel: OB, TB, YC.** A tervlapból kinyert geometria
(`tervlap-batch.py`) ezekben a házakban önmagában nem volt navigálható: a
portától a helyiségek 37% (OB), 71% (TB), 41% (YC) volt elérhető. Az IFC
három dolgot pótol, mindhármat mérve:
- **A lépcsőket** (`ifc-epulet.py --lepcso`, `ifc_lepcsok()`): a tervlap
  lépcsőrétegének foltjai rossz helyre estek vagy egy szinten hiányoztak, és
  a szintek nem értek össze. Az IFC-ben minden kar fokonként megvan,
  magassággal: a karok lépcsőházakba állnak össze (egymás mellett, vagy
  pihenőn át folytatva), és a szint ott kap pontot, ahol egy kar a padlóján
  indul vagy oda érkezik (`TUR_Z` = 0,8 m tűréssel: az OB-ben a pincéből jövő
  kar −0,65 m-en ér fel). Két szomszédos szint csak akkor kapcsolódik, ha a
  karok a köztük lévő magasságot végig lefedik. Az OB-ben ettől 9 helyett 19
  helyiség ajtaja nyílik a hálózatra.
- **A gazdátlan padlót** (`ifc-helyisegek.py`): az IFC falai zártak (az ajtó
  fölött a szemöldök is fal), a falgyűrűk belseje a helyiség. Ami ebből
  egyetlen kivágott helyiséghez sem tartozik, és közlekedőhöz ér, az a
  kivágó kihagyott darabja (előcsarnok, lépcsőház-előtér), és a maszkba
  kerül. Az YC földszintjén a lépcsőház és a folyosó közti sáv ilyen volt.
  Mivel az üreg a külső falon belül van, ez nem nyúlik a homlokzat elé.
  Mellette ugyanez az eszköz a helyiség sokszögét az üregére cseréli, ha az
  egyértelmű (egy pecsét egy üregben) és a táblához közelebb van — ennek a
  hatása kicsi (a ±3%-os arány 0–2 ponttal nő), a tervlap-kivágó hibáit nem
  ez javítja. A falak közti centis réseket 8 cm-es zárással tömi (`ZARAS`).
  **A maszkhoz csak hozzáad**, a régit nem építi újra: az épület adata más
  tágítással is készülhetett, és az FK-n az alapértelmezettel újraépítve a
  folyosók az ajtónyílásoknál elszakadtak (88% helyett 2% elérhető).
- **Az ajtókat**, ahogy fent. Egy szabály itt jött elő: **mosdón át csak
  raktár vagy vizes helyiség közelíthető meg** (`mosdon_at()`). A TB portája
  az IFC-ben csak a szomszédos NŐI WC felé kapott ajtót, és az útvonal
  „Kijárat ezen át: NŐI WC” lépéssel indult; az OC és az OB mosdóból nyíló
  takarítószer-raktára viszont valódi. A `tests/epuletek.js` minden
  épületben megnézi, hogy a portáról nem mosdón át indul az út.
Eredmény (a portától, a valódi appban): OB 98%, TB 97%, YC 99% elérhető.
Az elérhetetlen helyiség az OB-ben egy pincei kamra, a TB-ben a földszinti
pihenő, tároló és közlekedő (`TB00F24`, `F25`, `FK4`), az YC-ben egy.
A TB-ben a mosdós porta-via idején a portától az I. emeletre az út a II.
emeleten át ment (0→1→2→1, az útvonalak összhossza 5080 m); a via nélkül
egyenesen megy (3865 m).

**A régi négyre (OD, FF, FK, OC) nem futtattuk le**, mert mérve nem jobb:
az OD, az FF és az FK elérhetősége ugyanannyi (97, 99, 88%), az OC-é 97-ről
95%-ra esik — az OC IFC-jében nincs V. emelet, így az IFC-ből jött lépcsők
oda nem érnek fel. Az OD −2. szintjét sem hozza be: az IFC karjai sem kötik
össze a −1.-gyel. A `--lepcso` tehát a tervlapi lépcsőket CSERÉLI, nem
egészíti ki: ahol az IFC-ből szint hiányzik, ott ne használd.

A többi IFC-s épület, és hogy miért nem nyílt meg, a `docs/ATADAS.md`-ben.
A sorrend: `tervlap-batch.py` → `ifc-helyisegek.py` → `ifc-epulet.py --lepcso`.

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

**A fordulás lépése azt mondja, mennyi egyenes UTÁN kell fordulni**
(„Fordulj jobbra · ~48 m után”). Korábban „Fordulj jobbra · Haladj tovább ~48
m” állt, amit úgy olvastak, hogy előbb fordulj, aztán menj 48 métert — holott
a 48 m a fordulás előtti szakasz.

**A link hibatűrő** (`readUrl()`, `dekod()`). Egy csonka „%” (kézzel írt,
levágott link) korábban URIError-t dobott, és az indulás fele elmaradt: a
service worker nem regisztrált, a `urlLock` zárva ragadt, és a kiválasztás
többé nem került a címbe. Most részenként, hibatűrően dekódol, az
`applyUrl()` zárja `finally`-ben old fel, a service worker pedig az indulás
elején regisztrál. A rövid alak toldalékkal (`#OA10E18?utm_source=qr`) is
kiválaszt (csak kódalakú részt fogad el kiválasztásnak). A saját épület nem
létező kódjára felirat szól (`linkNincs`), nem tűnik el csendben. A kijelölés
törlése (Esc, a térképre koppintás: `kijelolesTorol()`) a címet is üríti —
korábban újratöltve visszajött a letett terem. A Vissza gomb popstate-et és
hashchange-et is ad: a hashchange csak akkor állítja vissza, ha a cím azóta
más (`urlKesz`), különben kétszer futott az útvonalkeresés.

**A listák saját history-bejegyzést kapnak** (`listaNyit()`): a foglalható
termek listája telefonon zsákutca volt — se vissza gomb, se bejegyzés, a
rendszer Vissza gombja kilépett az appból. Most van Vissza gombja, és a
rendszeré is a listát zárja. A mosdóválasztó ugyanígy. Ha a listából
választ (mosdó, „Ugrás a térképre”), a `pushUrl()` a lista bejegyzését
CSERÉLI, nem tesz föléje újat: különben egy holt Vissza-lépés maradt utána
(ugyanaz a cím, semmi nem változik).

**A kereső a hallgató szavait is érti** (`KERESO_SZO`): a tervlap „NŐI WC”,
„AK. MENT. WC”, „BÜFÉ” alakot ír, a hallgató „mosdó”, „akadálymentes”,
„kávé”, „toilet” szót — ezekre korábban nem volt találat. A dolgozói (iroda,
raktár, öltöző, személyzeti mosdó) és a csak más helyiségen át megközelíthető
helyiség egy szinttel hátrébb kerül (kódra keresve elöl marad). Rövid
töredéknél csak a teljes egyezés számít, különben gépelés közben a „ma” is a
férfi mosdókat hozta.

**Egy keresés, sok cél: `dijkstra()` és `routeTo()`.** A mosdóválasztó, a
foglalható termek menetideje és az elérhetőségi teszt egy indulásból sok célhoz
kér útvonalat. Célonként külön keresés helyett egy cél nélküli Dijkstra fut
(`dijkstra(r1, portals, null)`), és a `routeTo()` ebből olvassa ki bármelyik
helyiség útját, a `via`-láncot az `entryOf()`-fal követve. A `findRoute()`
ugyanez a mag, céllal: az az első célajtónál megáll.

**A mosdóválasztó a nemet is kérdezi.** Egyetlen „legközelebbi mosdó” egy nőt
is egy férfi mosdóhoz vitt, ha az volt közelebb. Most a gomb három sort ad —
női, férfi, akadálymentes —, mindegyikből a menetidő szerint legközelebbit, az
indulástól (ha nincs, a portától). A nemre nem jelölt mosdó nem kerül a női
vagy a férfi sorba: ha valamelyik jelölt sor hiányzik, egy külön, semleges sor
mutatja (lásd „Más épületben az OA-ra szabott…”). Kimarad, amibe csak egy
másik helyiségen át lehet bejutni (`via`: irodából, raktárból nyíló mosdók) —
kivéve, ha az a helyiség a mosdó előtere (`wcEloter()`: ELŐTÉR vagy MOSDÓ
nevű, maga nem más mögött): így épül a legtöbb mosdóblokk, és az OC I.
emeletén az IFC szerint a NŐI WC és az FFI WC is egy ELŐTÉR mögött van —, az alagsori
dolgozói öltöző két mosdója (`DOLGOZOI_WC`), és a név szerint személyzeti
mosdó (`SZEMELYZETI_WC`). A `tests/url.js` az első kettőt, a
`tests/masepulet.js` a harmadikat kéri számon.

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
Tervtár épületadatok, mind (xls/xlsx)     --tervtar-leltar.py--> leltár: 29 épület, 4643 helyiség (belső)
    a leltár + a tervlapok fejbélyegzője --tervlap-epuletek.py--> data/epuletek.json (39 épület)
    epuletek.json + OSM (Nominatim) + helyszínrajzok --helyek.py--> data/helyek.json (32 épület helye)
    helyek.json + a megnyitható épületek alaprajza --terv-illesztes.py--> helyek.json: terv (az alaprajz a térképen)
Tervtár helyszínrajzok (PDF)              --helyszinrajz.py--> melyik épület hol áll (belső)
Tervtár tervtári alaprajz (PDF) + tábla     --tervlap-uj.py--> helyiség-sokszögek
    a sokszögek + a tábla                 --epulet-json.py--> data/epuletek/<kód>.json
Tervtár OA alaprajzok (PDF) + épületadatok --tervlap-szarny.py--> D: a hiányzó szárny
OE-OA.ifc (Archicad-export, 2023)            --ifc-ajtok.py--> D: doors, via
OE-OA.ifc                                  --ifc-lepcsok.py--> D: flights
OE_OD.ifc, OE_FF.ifc, OE_FK.ifc, OE_OC.ifc (2026) --ifc-epulet.py--> data/epuletek/<kód>.json: doors, via, flights
    tervlap-batch.py kimenete + OE_OB/TB/YC.ifc --ifc-helyisegek.py--> sokszögek, maszk (gazdátlan padló)
                                            --ifc-epulet.py --lepcso--> + stairs az IFC karjaiból
```

A térkép (`D`) kézzel nem szerkesztendő: a régi generátor adatára a fenti
három eszköz épít, ebben a sorrendben (a szárny után az ajtók, hogy az új
helyiségek is megkapják, és a lépcsőkarok, amelyek a szárnnyal megnőtt
kerethez illeszkednek), utána a `tervtar-ajtoszam.py` az ajtószámokat. A
PDF, az xls és az IFC belső anyag. A PDF-ek és a táblák a privát repó
`forras/` könyvtárában vannak, az IFC (`OE-OA.ifc`) nincs a repóban. A Pages-re
csak az engedélylista kerül ki (lásd „Deploy”). A szárnyról:
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

**Az egész egyetem a Tervtárból.** A `tervtar-leltar.py` a 26 épületadat-
táblából 25-öt olvas be (a KG-é sérült, lásd lent; 29 épület, 4643 helyiség,
105 204 m²), a `tervlap-epuletek.py`
ebből és a tervlapok fejbélyegzőjéből állítja elő a `data/epuletek.json`-t.
Amit a forrásokról tudni kell, mert egyik sem látszik első ránézésre:

- **Három fájlnév-család van**, és az épületkód nem mindig a második helyen áll:
  `oe-ba-bb-bf_…` (kötőjeles, több épület egy táblában), `oe_fc_…` (aláhúzós),
  és a kollégiumoké `oe_tervtar_kd_becsi_ut_…`, ahol a harmadik. Egy lazább
  minta a „tervtar" szóból olvas ki „TE" épületet.
- **Két táblaformátum**: 22 régi `.xls` és 4 `.xlsx` (FC, FG, FS, YC). A
  `tervtar-ajtoszam.py` csak `xlrd`-t használ, az újakat nem nyitja meg.
- **A kitöltetlen tábla sablonszöveget tartalmaz** (`<Lakás neve>`, `<Hely>`),
  nem adatot — ezért szűr a `<` jelre minden olvasó.
- **A kódregex nem lehet laza.** Az OA összesítő lapján az „ALAGSOR" szó
  beleillik egy `[A-Z]{2}[A-Z0-9]{5}` mintába, és ebből egy nem létező „AL"
  épület született. A helyes alak: két betű, szint, betű, kettő.
- **Egy tábla olvashatatlan**: a `…kh_gyumolcs_u_lebenyi_kollegium.xls` — a
  neve ellenére a KG épületé, a kiolvasható kódok mind KG-k — az
  xlrd-t a saját szövegtáblájával akasztja meg (a corruption-toleráns mód sem
  viszi át). Excelből `.xlsx`-ként újramentve beolvasható; addig kimarad, és a
  jelentés kiírja.
- **Ajtószám kevesebb van, mint helyiség.** 1403 ajtószám-alakú értékből 118
  közlekedőn áll, 326 pedig több helyiségen is szerepel: 956 a használható, és
  a 29 épületből 15-ben egy sincs. A BF és az OD ütközései (116 és 108)
  gyanúsak, valószínűleg tábla-szerkezeti okból — ellenőrizendő.
- **Minden tervlapon két cím van.** Az épületé `Város, 1234, utca` alakú, a
  tervezőé postai sorrendben, nagybetűs várossal (`1146 BUDAPEST Thököly út
  74.`). Stringre kiszűrni nem lehet: a Thököly úti campus épületei valóban ott
  vannak. A formátum választja el őket.
- **Az `UV` és az `NA` ugyanaz az épület** (nagymarosi szállás): a tervlapja
  `oe-na_…`, a táblájában viszont minden kód `UV…`. Az `FC` tervlapja „FB
  ÉPÜLET"-et, az `FS`-é „FA ÉPÜLET"-et címkéz — ez a kettő valódi ütközés, a
  többi eltérés csak annyi, hogy a lap campuson belül „A ÉPÜLET"-nek hívja azt,
  ami kódban YA.
- A `HASZNÁLÓ` oszlop kimarad a leltárból: hét táblában ki van töltve
  (szervezeti egységek, teremnevek), és ha személynév kerül bele, annak nincs
  helye egy továbbadott listában.
- **A használó kart csak a FUNKCIÓ szerinti lap tudja.** A tervtári lapon és a
  táblában sincs benne; a funkció lap fejbélyegzőjében áll, 2-3 sorba tördelve
  („NEUMANN JÁNOS" / „INFORMATIKAI KAR"), és a `tervlap-epuletek.py` onnan
  szedi (`kar`, 21 épületnél van). Ellenőrzésnek ott az OA: a kinyert név
  bájtra az `I18N`-ben beégetett „Neumann János Informatikai Kar". Kollégiumnál,
  irodaépületnél és Nagymaroson nincs kar — ez nem hiba. A forrásban van egy
  elírás (a `bf-ba-bb` lapon „Biztonságtecnikai", a `bc` lapon helyesen); az
  eszköz jelenti, de NEM javítja.
- **Egyébként a funkció lap ugyanazt tudja, mint a tervtári**: ugyanazok a
  helyiségkódok (nulla eltérés mindkét irányban), kisebb lapon, harmadannyi
  vonallal. Geometriát tehát a tervtári lapból érdemes kinyerni.
- **A helyszínrajzokból a felirat HELYE jön ki, nem a körvonal**
  (`helyszinrajz.py`): egy lapon 170–230 ezer vektorelem van, abból a körvonalat
  kiválasztani ugyanakkora munka, mint egy alaprajz. A „melyik épület merre
  van" kérdésre a felirat helye elég: 18 lapról 34 épület, méterben, a lap bal
  felső sarkától — és csak egy lapon belül összehasonlítható. Ellenőrzésnek ott
  van, hogy a `h01` és a `h02` ugyanarról a négy épületről szól, más origóval,
  és az OA–OC távolság mindkettőn 48,1 m. Hat épületnek (FA, FB, KM, SA, SB,
  SC) ez az EGYETLEN adata.
- **A leltár a `forras/kivonat/`-ban van, nem a `data/`-ban** (1,1 MB, az egész
  egyetem helyiséglistája a Tervtár belső anyagából): a `forras/` kimarad a
  Pages-re publikált csomagból, a `data/` nem. A `data/epuletek.json` és a
  `data/epuletek/*.json` is a Tervtár anyagából készül (név, cím, szintek,
  helyiségnév, funkció, terület, alaprajz) — ugyanolyan adat, amilyen az OA-é
  az `index.html`-ben eddig is nyilvános volt. Ami ezen túl megy (a teljes
  leltár, az ajtószámok, a `HASZNÁLÓ`), az a `forras/`-ban marad.

```
python3 tools/tervtar-leltar.py forras/kivonat/leltar.json \
        forras/oe[-_]*epuletadatok*.xls* forras/oe_tervtar_*kollegium*.xls
# várt eredmény: 25 tábla (a 26-ból a sérült KG-tábla kimarad), 29 épület, 4643 helyiség
python3 tools/tervlap-epuletek.py forras/kivonat/epuletek.json forras/kivonat/leltar.json \
        --app data/epuletek.json forras/oe-* forras/oe_*
```

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
  térképen van, és mind a 24 órarendi terem párt kapott). A tábla a `forras/`-ban van: belső anyag, a publikált csomagba nem kerül bele.
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
dokumentum; a betűk és ikonok gyorsítótár-először. **A tárolt app helyére csak
maga az app kerülhet, ép válaszból**: korábban a navigációs ág minden választ
eltett, és a Pages kikapcsolásakor a 404-oldal felülírta az offline példányt
(utána offline is az jött, és egy totem a JS nélküli hibaoldalon magától már
nem töltött volna újra); egy másik lap (a mérőlap) ugyanígy átvette az app
helyét. Most hibaválasznál (4xx, 5xx) — a dokumentumnál és a `data/`-nál is
— a tárolt példány jön, az **átirányítást** viszont a böngésző követi: ha a
site új címre költözik, a régi címen a telepített app különben sosem tudná
meg. A telepítésnél maga az app kötelező (a betűk és ikonok nem): ha az nem
jön le, a régi service worker marad a régi, működő tárolójával. Aktiváláskor
csak az `oemap-` kezdetű régi tárolók törlődnek — egy github.io-s címen a
felhasználó összes projektoldala egy origin. A `data/` `?v=`-s újrakérése a
paraméter nélküli kulcs alá kerül. A `tests/pwa.js` ezt mind egy saját,
hibát, átirányítást és megszakadó telepítést adó szerverrel méri. A `termek.json` neve
félévről félévre ugyanaz, gyorsítótár-először egy telepített app sosem kapná
meg az újat. Ha a formátuma változik, a `CACHE` nevét is emeld: az dobja el a
régi példányt. Az app a nem várt formátumú adatot „nincs adat"-nak veszi
(`tmLoad()`), nem omlik el tőle. **Egy deploy utáni első megnyitáskor még a
régi service worker válaszol**, a régi gyorsítótárából: ha az régi formátumú
fájlt ad, a `tmLoad()` egyszer újrakéri, egyedi paraméterrel a cím végén —
azt a régi gyorsítótár nem ismeri, így a hálózatról jön.

**A hálózat-először időkorláttal megy** (`VARAKOZAS` = 3 s): ha a hálózat
addig nem válaszol, és van tárolt példány, az jön (az app és a `data/`
is); a hálózati válasz a háttérben (`waitUntil`) frissíti a tárolót.
Időkorlát nélkül egy lassú, de élő kapcsolaton (pince, tele előadó) az app
fél percig sem indult el. Amit még tudni kell:
- **A `data/` tárolójába csak ép JSON kerül**: egy 200-as, de nem JSON
  válasz (Wi-Fi-portál, csonka letöltés) korábban felülírta a jó példányt.
- **Offline egy másik lap nem az appot kapja** (csak az app címe és a
  hatókör gyökere): a mérőlap vagy egy elgépelt cím a saját címén, rossz
  alapcímmel indult volna.
- **A manifest és az ikonok a háttérben frissülnek** (stale-while-revalidate),
  a betűk nem: a nevük NEM a tartalmukhoz kötött, egy betűcseréhez a `CACHE`
  nevét is emelni kell.
- **A telepítés `cache:"no-cache"`-sel kér, és a „./” nincs a készletben**:
  korábban az első látogatás háromszor töltötte le a ~500 KB-os dokumentumot.
- Egy elbukott letöltés nem végleges: a teremadatot a lista újranyitása és az
  `online` esemény, a nyilvántartást és a térképet az `online` esemény
  próbálja újra, és a hibának saját üzenete van („nem sikerült betölteni”),
  nem „nincs adat”.

## Deploy

Push a `main`-re → `deploy-pages.yml` → GitHub Pages. Kézzel:
Actions → Deploy to GitHub Pages → Run workflow.

**A deploy előtt egy böngésző nélküli kapu fut** (`check` job, pull requesten
is): `node tools/ellenor.js` (az `index.html` és a `meres.html` beágyazott
szkriptje és a `sw.js` lefordul, a `data/` minden fájlja ép JSON, a három
alapfájl és az épületadatok a várt alakúak) és az összeállító őre. Korábban a
`main` teszt nélkül ment élesbe: egy elírás a beágyazott szkriptben üres appot
adott volna minden telefonon. A böngészős tesztsor (`npm test`) továbbra is
helyben fut — a CI-ben nincs böngésző. A `concurrency` csoport (`pages`) a
deploy JOBÉ, nem a workflow-é: workflow-szinten egy pull request ellenőrzése
kiszorította volna a sorban álló main-deployt (csoportonként egy futó és egy
várakozó futás lehet, az újabb várakozó a régit törli). Az ellenőrző ugyanazt
a szerkezetet kéri az épületadattól, mint az app `epuletEp()`-je: ami a
CI-n átmegy, az élesben is megnyílik.

**A repó privát, a Pages site NEM az.** Ez a kettő független, és könnyű
összekeverni: ami bekerül a Pages artifactba, azt bárki letöltheti az oldal
URL-jéről, akkor is, ha a repóhoz nincs hozzáférése. **Ezért csak egy
engedélylista kerül ki** (`tools/pages-csomag.js`, a workflow ezzel állítja
össze a `_site`-ot): az app, a service worker, a manifest, a mérőlap, a betűk,
az ikonok és a `data/` futásidejű fájljai — 32 fájl, 1,8 MB. Ami nincs a
listán (CLAUDE.md, `docs/`, `tools/`, `tests/`, `.claude/`, `forras/`), az nem
kerül ki. **Korábban a munkafa ment ki** (`path: .`), amíg a Pages élt; a
`forras/` akkor még nem volt a repóban. Az utolsó sikeres, 040a474-es deploy
(2026-10-12) artifactjában a `.git` és a `.github` kivételével minden benne
volt — a CLAUDE.md, a README, a `docs/`, a `tools/`, a `tests/`, a `.claude/`,
a `package*.json` és a `data/rooms.json` is —, bennük a belső forrásfájlok
NEVÉVEL (a tervtári alaprajz-PDF, az épületadat-tábla, az `OE-OA.ifc`, a
Neptun-export) és a leírásukkal. Maga a belső anyag (`forras/`) és a leltár
nem került ki: azok olyan commitokkal kerültek a `main`-re, amelyeknek a
deployja már a feltöltés előtt bukott (a Pages addigra kikapcsolt).

**Az összeállító őr** (a CI-ben is, böngésző nélkül) elbukik, ha a csomagban
tiltott fájl van; ha a service worker készletéből vagy abból, amire egy lap
vagy a manifest hivatkozik (a HTML-tagek href/src-je és srcset-je, a CSS
`url()`; a JS-kód és a kommentek nem), valami hiányzik, vagy egy hivatkozás
gyökér-abszolút (`/icons/…`: alkönyvtár alól nem a csomagra mutat); vagy ha a
nyilvántartás egy épületet megnyithatónak mond, és nincs kint az adatfájlja.
A könyvtárak tartalmát a git indexe szerint veszi (`git ls-files`, ha a repó
teteje a gyökér), hogy egy elfelejtett `git add` helyben is látsszon, ne csak
a CI-ben. A célt előbb törli, ezért csak üres vagy korábbi csomag lehet,
és nem lehet a futtatás könyvtára: korábbi csomag az, amit ő írt (a
gyökerében a `.oemap-csomag` jelzőfájl, ez a Pages-re is kikerül), és amiben
minden fájl a csomag alakjába illik. A `tests/csomag.js` az őrt a CLI-n át,
egy repómásolaton elrontott esetekkel is futtatja. A böngészős ellenőrzés
(`tests/csomag.js`: az app a csomagból egyetlen sikertelen kérés nélkül fut)
csak helyben fut, a workflow nem. **Új futásidejű fájlt fel kell venni a
listára**, különben élesben 404-et kap.

**A `forras/` benne van a git-történetben** (a 101 tervlap és tábla, 95 MB,
és a belőlük készült leltár). Ezt a repót ezért **nem szabad nyilvánossá
tenni, forkolni vagy a történetével együtt nyilvános repóba tolni**: az
azonnal kiadná a teljes belső anyagot. Ha a nyilvános oldalhoz külön
nyilvános repó kell, az csak a `tools/pages-csomag.js` csomagjából épülhet,
friss történettel. Hogy a `forras/` maradjon-e ebben a repóban, vagy
kiköltözzön (és a történetből is kitisztuljon), azt a felhasználó dönti el.

**A privátra állítás kikapcsolta a Pages-t** (ingyenes csomagban privát
repóból nem publikálható), és az oldal 404-et adott mindkét címen. Ha a
teremkeresőnek élnie kell, a Pages-t újra be kell kapcsolni egy olyan
csomagon, ami privát repóból is publikál — vagy a publikálandó csomagot
külön, publikus repóba kell tenni (friss történettel, lásd fent). Az új
helynek ugyanazt a címet kell adnia, amit a kiragasztott QR-matricák és a
totemek kódolnak, különben azok halott linkre mutatnak. **A kiszolgált cím a
deploy-napló szerint az `oemap.maydayprod.app` saját domain volt** (az utolsó
sikeres deploy „Evaluated environment url”-je `http://oemap.maydayprod.app/`,
a repó homepage-mezője is ez). A régi `mayydayy99.github.io/oemap/` cím a repó
`mos-eisley` alá kerülésével megszűnt: ebből a repóból újra bekapcsolt
Pages-szel sem szolgálható ki. Hogy a matricák és a totemek melyiket kódolják,
azt a helyszínen kell megnézni — a `make-qr.py` docstringje a saját domaint
írta, a README matricanyomtató példája korábban a github.io-sat; ha a régit,
azokat újra kell nyomtatni, vagy a régi címre átirányítás kell. A kiesés alatt még a régi service
worker fut, ami a 404-oldalt eltette offline példánynak: a telefonok a
visszaállítás után maguktól rendbe jönnek (a dokumentum hálózat-először jön),
egy **totem viszont a JS nélküli hibaoldalon ragadhatott, azt kézzel újra kell
tölteni**. **Ha az app elköltözik, a régi címen maradjon kiszolgáló**: az új
service worker a 404-re a tárolt appot adja, tehát egy átirányítás nélkül
megszűnő cím mögött a telepített kliensek örökre a befagyott appot futtatnák.
Átirányítás (301) mellett az új címre mennek; ha az nem megoldható, a régi
helyen egy önmagát törlő `sw.js` (unregister + a tárolók törlése) és egy
átirányító `index.html` kell.

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

Az egyetem-szintű bővítés állása, a már megszületett döntések és a következő
lépések: [docs/ATADAS.md](docs/ATADAS.md). Ha az épületek adatán dolgozol,
azzal kezdd.

Lásd [docs/NYITOTT-KERDESEK.md](docs/NYITOTT-KERDESEK.md) — hat pont vár
külső információra; valódi funkcióhiányt közülük a más karok hiányzó órarendje
okoz.

# Nyitott kérdések

Négy dolog vár külső információra. Kettő valódi funkcióhiányt okoz, kettő
üzemeltetési. Mindegyiknél ott van, hogy **mi hiányzik**, **kitől**, és
**mit kell majd csinálni**, ha megjön.

A számok a `main` aktuális állapotából származnak, nem emlékezetből — a
végén megtalálod, hogyan futtathatod újra őket.

---

## 1. A Neptun-teremszámok hiánya — a foglalható termek többsége nincs a térképen

**Mi a baj.** Két, egymástól független teremszámozás van, és nincs köztük
megfeleltetés:

| | honnan | példa |
| --- | --- | --- |
| hivatalos, foglalható teremnév | `ingatlan.uni-obuda.hu`, Neptun | `F01`, `F05`, `Audmax` |
| tervlapi (üzemeltetési) kód | az épület alaprajza | `OA00F01`, `OA10E18` |

A névazonosság csapda, nem segítség: a hivatalos **F01 268 férőhelyes**, míg a
tervlap **OA00F01-e 95,7 m²** — nem ugyanaz a helyiség. Az `F05`, `F06` és
`F08` tervlapi névrokona pedig raktár, mosdó és takarítószeres kamra.

**Következmény.** Ahol nincs pár, ott a terem **nem jelölhető a térképen**,
útvonalat sem lehet hozzá tervezni, és a teremre kattintva az adatlapja nem
mutatja a foglaltságot — ezt a felhasználó kifejezetten kérte (2026. szept.),
és azt is, hogy a térkép alapból a Neptun-számot írja ki.

**Ami megvan (2026. szept. 28.).** Három pár, amelyet a méret kényszerít ki,
és a megrendelő jóváhagyott: **F01 = OA00F11** (268 fő; a földszinten csak ez a
255,8 m²-es terem elég nagy, a következő 146 m²), **F06 = OA00F03** (144 fő;
utána csak ez marad) és **Audmax = OA10E18** (330 fő; az I. emelet kerek,
304,6 m²-es nagyelőadója). Ezeknél a térkép, a kereső és az adatlap a
Neptun-nevet mutatja, az adatlapon a foglaltsággal.

**Amit a minta még ad, de nem dönt el.** Egymás mellé téve a méretet, a
férőhelyet, a felszereltséget és azt, melyik terem melyiknek a fölött áll:
- Az F03-F04-F07 az egyetemi listán egyetlen lap; a tervlapon a felső
  földszinti szárny három egyforma terme (OA00F12/F13/F14, 54–57,5 m²) áll
  így egymás mellett. A sorrendjük semmiből nem jön ki.
- Az F05 (105 fő) és az F08 (84 fő) csak két helyiségbe fér: az OA00F01-be
  (95,7 m²) és a kerek végű OA00F04-be (93,1 m²), amit a tervlap **büfének**
  ír. Ha az tényleg büfé, az F08 nincs rajta a tervlapon.
- Az F02 (40 fő) valószínűleg az OA00F02 (62 m²) — de ha az F03-F04-F07 nem
  egy osztható terem, csak egyforma termek közös lapja, az F02 a felső szárny
  54 m²-es termében is lehet.
- Az I. emelet két kis labora (1.12: 12 fő, 1.16: 13 fő) méretre a két
  32 m²-es PC LABOR (OA10E32, OA10E43); ebben a félévben nincs bennük óra.
- A 25 fős laborok mérete és felszereltsége egyforma. Három labor az I. és a
  II. emeleten pontosan egymás fölött áll (OA10E31/OA20E35, OA10E45/OA20E49,
  OA10E43/OA20E47); ha az ajtószámok emeletenként ismétlődnek, egyik emelet
  párjaiból a másiké kijön.
- A II. emeleten a tervlap és a lista nem fedi egymást: a tervlapon két kis
  (32 m²-es) PC LABOR van, a listán egy kis labor sincs, és az OA20E03
  (108,6 m²) valószínűleg két labor egyben.

Találgatni nem szabad: egy rossz pár egy foglalt termet mutatna szabadnak.

**A tervlapi kód megtévesztő.** A tervlap a földszinten ugyanúgy F01…F14-nek
számozza a helyiségeit, mint a Neptun a termeit, de mást jelöl vele (a büfé
F04, a női mosdó F07). Ezért ahol nincs pár, ott a térkép a teljes tervlapi
kódot írja ki (OA00F04), nem a rövidet.

**Kitől kell.** Attól, aki az ajtókat látja: a megrendelőtől ígéret van rá
(„Neptun/órarend szerinti teremszám: nemsokára megadom"). A megadást a
párosító mód könnyíti meg (`?parosit`, lásd lent). Az egyetemi teremlap
(`ingatlan.uni-obuda.hu/terem/...`) talán mutatja a terem helyét; a
fejlesztői környezet hálózati szabálya ezt a címet most letiltja, a
környezet beállításaiban engedélyezhető.

**Mit kell csinálni, ha megjön.** Az app oldala kész: a feliratok, a
kereső (az `„audmax"` is) és az adatlap a Neptun-nevet mutatja, az adatlapon
ott a foglaltság — a `tests/neptun.js` és a `tests/termek.js` próbakötéssel
őrzi. A párokat a párosító mód adja: `?parosit` a címben, teremre kattintás,
a Neptun-név kiválasztása, végül **Lista másolása** (`F01 = OA00F11` sorok).
1. A kimásolt listát írd az `index.html` `NEPTUN` táblájába
   (`"OA00F11":"F01"` alakban).
2. Az osztható F03-F04-F07 és a 4.01 külön kérdés lehet: a tábla egy
   tervlapi teremhez egy Neptun-nevet rendel. Ha a valóság más (egy tervlapi
   terem három Neptun-névvel), azt a párosítónak kell jeleznie.
3. A foglalható termek panelján a sor legyen kattintható → ugorjon a térképre.
4. A `tests/termek.js`-be jöjjön egy eset a valódi megfeleltetésből: a
   hivatalos névre keresve a megfelelő tervlapi kód jön vissza, és annak az
   adatlapján a foglaltság.

---

## 2. Hiányzó ajtók a járásrácson — 10 helyiség elérhetetlen

**Mi a baj.** A járásrács a falgeometriából épül. Ahol a tervlapon nincs
bejelölve ajtó, ott a rács szerint nincs átjárás, és a Dijkstra nem talál utat.
A fő bejárattól (`OA00FK1`) **182 kódolt helyiségből 10-hez nem vezet út**, se
lépcsőn, se lifttel:

| kód | helyiség | szint | méret | hallgatót érint? |
| --- | --- | --- | --- | --- |
| `OA00F14` | ELŐADÓ | Földszint | 57,5 m² | **igen** |
| `OA20E03` | LABOR | II. emelet | 108,6 m² | **igen** |
| `OA20E04` | LABOR | II. emelet | 63,8 m² | **igen** |
| `OA10E03` | KÖZÖSSÉGI TÉR | I. emelet | 22,8 m² | **igen** |
| `OA01FL4` | KÖZLEKEDŐ | Félemelet | 18,8 m² | igen (átjáró) |
| `OA01FL5` | KÖZLEKEDŐ | Félemelet | 18,8 m² | igen (átjáró) |
| `OA10E04` | IRODA | I. emelet | 14,5 m² | nem |
| `OA10E05` | IRODA | I. emelet | 15,8 m² | nem |
| `OA10E07` | IRODA | I. emelet | 17,0 m² | nem |
| `OA01F02` | SZERVER SZOBA | Félemelet | 19,5 m² | nem |

Egy 108 m²-es labor és egy 57 m²-es előadó nem apróság — ezekre a hallgató
rákeres, és nem kap útvonalat.

**Kitől kell.** Valakitől, aki ismeri az épületet: hol van tényleges ajtó a
felsorolt helyiségek és a szomszédos közlekedők között. Egy bejárás elég.

**Mit kell csinálni, ha megjön.** A `D.walls` megfelelő szakaszába kell ajtónyílás
(vagy a maszkba átjárás). Utána a lenti ellenőrzőnek 0-t kell adnia.

---

## 3. A földszinti hallgatói lift gyalog nem érhető el

**Mi a baj.** A hallgatók csak az **FL3 magban** lévő liftet használhatják. A
tervlap a liftet nem jelöli külön helyiségként (`D.lifts` üres), ezért az
`index.html` az FL3 lépcsőmag pontjain veszi fel. A földszinten viszont ez a
pont a rács szerint nem érhető el gyalog, így **a földszintről nincs liftes
alternatíva** — az app korrektül meg is írja ezt, ahelyett hogy hamis
útvonalat adna.

Ez valószínűleg ugyanannak a hiányzó ajtónak a következménye, mint a 2. pont,
úgyhogy a kettő együtt megoldható.

**Mit kell csinálni.** Ha a tervlap megkapja a liftet, az `index.html`-ben a
kézi `LIFTS` lista elhagyható — a kód már úgy van megírva, hogy `D.lifts`-et
használja, amint az nem üres.

---

## 4. Más karok órái hiányoznak a közös termekből

**Mi volt.** Az órarendi adat egy heti teremfoglalási táblából jött, két hétre
szólt, és 2026-09-11-én lejárt. **Megoldva:** most a Neptun
kurzusórarend-exportjából jön, egy egész félévre (2026/27/1, 1–14. hét, 24
OA-terem), félévente egy frissítéssel:

```
python3 tools/parse-neptun.py <export>.xlsx /tmp/neptun.json
python3 tools/build-termek.py data/rooms.json /tmp/neptun.json data/termek.json \
        --het1 <az 1. hét hétfője> --hetek 14 --szunnap <ünnepnapok>
```

**Mi a baj.** Az export csak a NIK kurzusait tartalmazza. Az F-blokkban és az
Audmaxban a KVK és az RKK is tart órát (a régi táblában az ottani foglalások
~30%-a az övék volt), ezekről most semmit nem tudunk. Az app ott óra híján
„Szabad?"-ot ír, nem „Szabad"-ot — nem állít hamisat, de nem is teljes.

**Kitől kell.** A KVK és az RKK ugyanilyen Neptun-exportja. A
`parse-neptun.py` ugyanúgy feldolgozza.

**Mit kell csinálni, ha megjön.** A `build-termek.py` fogadjon több
`neptun.json`-t, és amelyik termet minden használó kar exportja lefedi, abból
kerüljön ki a `kozos` jelzés (`SHARED`). Az egyetemi szünnapokat (rektori
szünet, TDK) a `--szunnap`-nak kell megadni — ezek sincsenek az exportban.

---

## Ami nem külső információra vár — ezeket bármikor meg lehet csinálni

**~~Akadálymentesség.~~ Kész.** A térkép billentyűzettel bejárható és
felolvasóval követhető. Amit a számok mondanak: `aria-live` 0 → 1,
`tabindex` 0 → 183, a 182 helyiség `role="button"` névvel. A térkép **egy**
tab-állomás, a termek közt a nyilak léptetnek, az Enter választ, a Page
Up/Down szintet vált; a kiválasztás, az útvonal eredménye és a szintváltás
élő régióban is elhangzik. A díszítő SVG-rétegek és a nem aktív szintek
`aria-hidden`-ök, így a felolvasó az aktív szint helyiségeit látja, nem
mind a hétét. Őrzője a `tests/a11y.js` (29 állítás).

Ami ebből még hátravan, és nem külső információra vár: a panel
újrarajzolása (`renderPanel`) minden kiválasztáskor eldobja a benne lévő
fókuszt, és a téma váltása újraépíti a szinteket, amitől a térképen álló
fókusz elveszik. Egyik sem teszi használhatatlanná a felületet — a kurzor
állapota megmarad, a következő nyíl ugyanoda tér vissza —, de egy
billentyűzetes felhasználónak felesleges visszaút.

**A nézetváltás asztalon még akad.** Telefonon megoldva: a váltás alatt SVG-n
belül már semmi nem animál, így a mozgás közben a raszterezés 0–5 ms (előtte
70–84 ms esett a mozgás közepére). Minden rajzolás az első 100 ms-ra kerül,
utána a mozgás tisztán kompozitoros.

Asztalon viszont a mozgás első felében még 120–280 ms raszterezés marad. Oka a
raszter mérete: asztalon `SS=2`, szintenként 1314×1600 px, és a böngésző nem
tudja egy képkockában megrajzolni az újonnan láthatóvá váló szinteket. A
negyedére csökkentett raszter a leghosszabb képkockát is negyedére vitte.

**A döntés, ami ezen múlik:** az `SS=2` eredetileg azért került be, hogy az
Épület nézet nagyításkor éles maradjon. Ezt most már a `syncDens()` adja:
nyugvó képen az aktív szint a nagyításhoz illő sűrűséggel rajzolódik újra
(lásd CLAUDE.md). A csökkentés így olcsóbb döntés lett, a nagyított aktív
szint éles marad tőle. Ami ára maradt: a halványított szintek textúrája
alapnagyításon a felére ritkul (ezt valódi eszközön még nem néztük), és a
nagyítás határai (k: 0,15–10) a PXM-hez mérve értendők — `SS=1`-nél asztalon
a legnagyobb nagyítás méterben a felére esne, azt vele együtt emelni kell.
Maga a változtatás a `const SS = ...` sor az `index.html` adat-szakaszában.

A számok szoftveres renderelőből (SwiftShader) jönnek — valódi GPU-n
mindkét érték jobb, és a kettő aránya is eltolódhat. Mielőtt a fenti
döntést meghozzuk, érdemes valódi eszközön megmérni.

**Épületválasztó.** A meetingen eldőlt, hogy GPS-alapú épületválasztó kell —
de csak akkor, ha lesz több épület. Addig nincs mit választani. A beltéri
„hol vagyok?" kérdést a QR-kódok már megoldják.

---

## Az itteni számok újraellenőrzése

Ez a fájl elavulhat. A benne szereplő állítások így futtathatók újra:

```js
// node -e "..." vagy egy tests/-beli fájlba másolva:
//   elérhetetlen helyiségek a fő bejárattól
const start = ROOM["OA00FK1"];
D.rooms.filter(r => r.code &&
  !findRoute(start, r, PORTAL) && !findRoute(start, r, PORTAL_LIFT))
  .map(r => `${r.code} ${r.name||r.cat} ${r.area}m²`);

//   keres-e az "audmax"
search("audmax").length;            // most: 0

//   akadálymentességi számlálók
document.querySelectorAll("[aria-live]").length;          // most: 1
document.querySelectorAll("[tabindex]").length;           // most: 183
document.querySelectorAll(".room[role='button']").length; // most: 182
document.querySelectorAll("#stage [tabindex='0']").length;// most: 0 — egy tab-állomás
```

# Nyitott kérdések

Négy pont maradt nyitva. Valódi funkcióhiányt a 4. okoz (más karok órái a
közös termekben); a többi apróság vagy döntés, amihez külső információ kell.
Mindegyiknél ott van, hogy **mi hiányzik**, **kitől**, és **mit kell majd
csinálni**, ha megjön.

A számok a `main` aktuális állapotából származnak, nem emlékezetből — a
végén megtalálod, hogyan futtathatod újra őket.

---

## 1. Ajtószámok és a felső szárny — kész, három kérdés maradt

**Ami megvan (2026. okt. 6.).**
- **A felső szárny északkeleti vége** minden szintről hiányzott (41
  helyiség, köztük 10 órarendi terem). A tervtári alaprajz PDF-jéből
  (2026.01.09) pótoltuk (`tools/tervlap-szarny.py`): 40 helyiség, mind a
  pecsétje szerinti terület ±1%-án belül. Kimaradt az 1,26 m²-es OAX1A07
  (alagsor), ezt az eszköz nem tudta kivágni. A II–IV. emeleti folyosók
  közepén korláttal körbevett légtér van; a térképen ez lyuk, nem járható.
- **Az ajtószámok** az Egyetemi Tervtár OA épületadat-táblájából (2025.08.21,
  a „HELYISÉG SZÁMA KARI NYILVÁNT." oszlop) jönnek: **112 pár**
  (`tools/tervtar-ajtoszam.py`), és a nyilvántartás minden számozott
  helyisége rajta van a térképen. **Mind a 24 órarendi terem a térképen
  van**, ajtószámmal és foglaltsággal. A két számozás tényleg független: a
  tervlapi OA00F01 az F08, az F01 a tervlap OA00F11-e.
- **Az F06 korábbi párja téves volt.** Szept. 28-án a méretből
  következtettünk: a 144 fős F06 „csak" a 146 m²-es OA00F03-ba fér. A
  nyilvántartás szerint az OA00F03 az F09, az F06 pedig az OA00F16 — a
  szárnyban, ami akkor hiányzott a tervlapról, ezért csúszott el a kizárás.
  Tanulság: párt csak a nyilvántartásból vagy az ajtóról.

**Ami nyitott.**
- **Ellentmondások a nyilvántartásban**, ezek kimaradtak: az OA20E36 és az
  OA20E37 is „216 A"; az OA10E03 és az OA10E09 is „15"; az OA01F01 és az
  OA01F02 is „10"; az OA00F10 „00"; az OA20EK2 folyosó „2.61".
- **Az 1.17:** az OA10E36 (SCIENCE LABOR) a nyilvántartásban „117a", a
  Neptunban „BA.1.17". A térkép 1.17-nek veszi, mert ez az egyetlen 117-es
  terem; az ajtón érdemes ellenőrizni.
- **Egy férőhely gyanús:** a 2.12 a teremlap szerint 30 fős, a terme
  (OA20E47) 32 m².

**Kitől kell.** A nyilvántartás gazdájától; az 1.17-hez és a 2.12-höz egy
pillantás az ajtóra elég.

**Ha egy pár mégis hiányzik vagy vitatott,** a párosító mód (`?parosit`)
helyben felülírja: teremre kattintás, a Neptun-név kiválasztása, végül
**Lista másolása** (`F01 = OA00F11` sorok), és a listát a `NEPTUN` táblába
kell írni. Egy tervlapi teremhez egy név tartozik.

---

## 2. Ajtók — megoldva az épület IFC-modelljéből, két kivétellel

**Mi volt.** A helyiség a hozzá legközelebbi folyosócellához kötődött, nem az
ajtajához. Az útvonal így nem az ajtónál ért véget (az Audmaxé egy ajtó
nélküli falnál), és a portától 182 kódolt helyiségből 10-hez nem vezetett
út: a II. emeleti E03 és E04 laborhoz, az I. emeleti E03–E07-hez (ezekbe
csak egy másik helyiségen át lehet bejutni), az F14-hez (a folyosója a
szárnnyal együtt hiányzott), és három félemeleti helyiséghez.

**Megoldva.** Az épület IFC-modelljéből (Archicad-export, 2023)
`tools/ifc-ajtok.py` helyiségenként beírja az ajtók helyét, és ahol egyik
ajtó sem nyílik az úthálózatra, azt, hogy melyik helyiségen át lehet
bejutni. Az útvonal azóta az ajtónál ér véget, és kiírja, min át vezet
(„Bejárat ezen át: OA20E01 · LABOR → OA20E03 · LABOR"). A szárnnyal együtt
222 kódolt helyiségből **3-hoz nem vezet út**:

| kód | helyiség | szint | miért |
| --- | --- | --- | --- |
| `OA01FL4`, `OA01FL5` | KÖZLEKEDŐ | Félemelet | Az IFC szerint a földszintről az Audmax alsó szintjére vezető lépcsők. Szándékosan nincsenek bekötve: akkor az útvonal az Audmaxon át vághatna rövidebbet. |
| `OAX1A24` | HŰTŐGÉPHÁZ | Alagsor | Üzemi helyiség a szárny alatt; az IFC-ben nincs ajtaja. |

**Kitől kell.** Egyiknek sincs hallgatói haszna; ha mégis kell, egy bejárás
megmondja, hol van az ajtó. Az IFC 2023-as: ha az építészek a 2026-os
modellt is kiadják (a helyiségekkel, `IfcSpace`), az eszköz újrafuttatható.

---

## 3. A lift a földszintről már elérhető — az alagsorból nem

**Mi volt.** A hallgatók csak az **FL3 magban** lévő liftet használhatják
(`D.lifts`; se a tervlap, se az IFC nem jelöli külön). A földszinten ez a
pont a régi adat szerint gyalog nem volt elérhető, mert a hozzá vezető
folyosó (OA00FK7) a szárnnyal együtt hiányzott.

**Most.** A földszintről van liftes útvonal (pl. OA00FK1 → IV. emelet, az
FL3 lifttel). Az alagsorból — a portáról — nincs: a lift nem megy le
odáig, és az app ezt meg is írja.

**Kitől kell.** Az üzemeltetéstől: van-e hallgatók által használható lift az
alagsorból (a tervlap az AL1 magban is jelöl liftet). Ha van, a `D.lifts`-be
kell felvenni.

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
`tabindex` 0 → 223, a 222 helyiség `role="button"` névvel. A térkép **egy**
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
//   elérhetetlen helyiségek a portától
const start = ROOM[START];
D.rooms.filter(r => r.code &&
  !findRoute(start, r, PORTAL) && !findRoute(start, r, PORTAL_LIFT))
  .map(r => `${r.code} ${r.name||r.cat} ${r.area}m²`);

//   keres-e az "audmax"
search("audmax").length;            // most: 1 (az OA10E18)

//   akadálymentességi számlálók
document.querySelectorAll("[aria-live]").length;          // most: 1
document.querySelectorAll("[tabindex]").length;           // most: 223
document.querySelectorAll(".room[role='button']").length; // most: 222
document.querySelectorAll("#stage [tabindex='0']").length;// most: 0 — egy tab-állomás
```

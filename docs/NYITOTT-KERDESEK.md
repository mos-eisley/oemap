# Nyitott kérdések

Négy dolog vár külső információra. Kettő valódi funkcióhiányt okoz, kettő
üzemeltetési. Mindegyiknél ott van, hogy **mi hiányzik**, **kitől**, és
**mit kell majd csinálni**, ha megjön.

A számok a `main` aktuális állapotából származnak, nem emlékezetből — a
végén megtalálod, hogyan futtathatod újra őket.

---

## 1. A Neptun-teremszámok hiánya — a foglalható termek nincsenek a térképen

**Mi a baj.** Két, egymástól független teremszámozás van, és nincs köztük
megfeleltetés:

| | honnan | példa |
| --- | --- | --- |
| hivatalos, foglalható teremnév | `ingatlan.uni-obuda.hu`, Neptun | `F01`, `F05`, `Audmax` |
| tervlapi (üzemeltetési) kód | az épület alaprajza | `OA00F01`, `OA10E18` |

A névazonosság csapda, nem segítség: a hivatalos **F01 268 férőhelyes**, míg a
tervlap **OA00F01-e 95,7 m²** — nem ugyanaz a helyiség. Az `F05`, `F06` és
`F08` tervlapi névrokona pedig raktár, mosdó és takarítószeres kamra.

**Következmény.** A foglalható termek panelje működik, de a termek **nem
jelölhetők a térképen**, és útvonalat sem lehet hozzájuk tervezni. Az
`„audmax"` keresés **0 találatot** ad (ahogy az `„AM"` is).

**Kitől kell.** A megrendelőtől ígéret van rá: „Neptun/órarend szerinti
teremszám: nemsokára megadom".

**Mit kell csinálni, ha megjön.**
1. A megfeleltetést (Neptun-kód → tervlapi kód) tedd a
   `tools/build-termek.py`-ba, a `names()` mellé.
2. Vedd fel a `code` mezőt a `data/termek.json` soraiba.
3. A keresésbe kerüljön be a hivatalos név aliasként, hogy az `„audmax"`
   találjon.
4. A foglalható termek panelján a sor legyen kattintható → ugorjon a térképre.
5. A `tests/termek.js`-be jöjjön egy eset: a hivatalos névre keresve a
   megfelelő tervlapi kód jön vissza.

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

**A döntés, ami ezen múlik:** az `SS=2` azért van, hogy az Épület nézet
nagyításkor éles maradjon. Csökkentése megoldaná az asztali akadást, de
elmosná a nagyított 3D-t. Egyszer már élesség felé döntöttünk; ha a
simaság fontosabb, ez egysoros változtatás (`const SS = ...` az
`index.html` adat-szakaszában).

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

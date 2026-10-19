#!/usr/bin/env node
/* Minden megnyitható épület ellenőrzése a VALÓDI appban, nem a kimeneti fájlon.

   Egy kinyert épületadatról a fájl mérete és a helyiségszám semmit nem mond:
   attól még lehet a maszk rossz (az útvonal falon megy át vagy el sem indul),
   hiányozhat a porta helyisége a kivágásból, vagy eshet szét a szintek
   összekötése. Ez a szkript betölti az appot, végigvált minden megnyitható
   épületen, és azt méri, ami számít: hány kódolt helyiséghez van út a portától.
   Ugyanazt a mérést futtatja, amit a tests/eler.js az OA-ra.

   Nem teszt: a kimenete táblázat, nem bukás. Egy épületben lehet jogosan
   elérhetetlen helyiség (önálló pincerész, másik épületen át nyíló szárny) —
   azt embernek kell megnéznie. A teszt csak annyit őrizhet, hogy az app
   egyáltalán működik; azt a tests/epuletek.js teszi.

   Használat:  node tools/epulet-ellenoriz.js [KÓD ...]
               (argumentum nélkül: minden navigálható épület)
*/
const { serve, open, chromePath, DESKTOP } = require("../tests/lib");
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");

const meres = (page, kod) => page.evaluate(async kod => {
  const most = () => (Object.keys(ROOM)[0] || "").slice(0, 2);
  if (most() !== kod) {
    epuletValt(kod);
    for (let i = 0; i < 150 && most() !== kod; i++)
      await new Promise(r => setTimeout(r, 100));
  }
  if (most() !== kod) return { hiba: "nem váltott át (hiányos vagy hibás adat)" };
  const r1 = ROOM[START];
  if (!r1) return { hiba: `a porta (${START}) nincs benne a betöltött adatban` };
  const k = dijkstra(r1, PORTAL, null);
  const rooms = D.rooms.filter(r => r.code);
  const bad = rooms.filter(r => !routeTo(k, r1, r));
  return {
    szint: D.levels.length, osszes: D.rooms.length, kodolt: rooms.length,
    nincsUt: bad.length, porta: START, lepcso: (D.stairs || []).length,
    lift: (D.lifts || []).length,
    pelda: bad.slice(0, 3).map(r => `${r.code} ${r.name || "?"}`)
  };
}, kod);

(async () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "data/epuletek.json"), "utf8"));
  const kertek = process.argv.slice(2).map(s => s.toUpperCase());
  const kodok = Object.values(reg.epuletek)
    .filter(e => e.navigalhato && (!kertek.length || kertek.includes(e.kod)))
    .map(e => e.kod).sort();
  if (!kodok.length) { console.error("nincs ellenőrizhető épület"); process.exit(2); }

  const srv = await serve();
  const browser = await chromium.launch({ executablePath: chromePath() });
  const ctx = await browser.newContext(DESKTOP);
  const page = await open(ctx, srv.url + "index.html", { settle: 1200 });

  console.log(`${"ép".padEnd(4)}${"szint".padStart(6)}${"helyiség".padStart(10)}` +
              `${"kódolt".padStart(8)}${"nincs út".padStart(9)}${"lépcső".padStart(8)}` +
              `${"lift".padStart(6)}  porta`);
  console.log("-".repeat(78));
  const baj = [];
  for (const kod of kodok) {
    const m = await meres(page, kod);
    if (m.hiba) { console.log(`${kod.padEnd(4)}  HIBA: ${m.hiba}`); baj.push(kod); continue; }
    const arany = m.kodolt ? (100 * (m.kodolt - m.nincsUt) / m.kodolt).toFixed(0) : "–";
    console.log(`${kod.padEnd(4)}${String(m.szint).padStart(6)}${String(m.osszes).padStart(10)}` +
                `${String(m.kodolt).padStart(8)}${String(m.nincsUt).padStart(9)}` +
                `${String(m.lepcso).padStart(8)}${String(m.lift).padStart(6)}  ${m.porta}  (${arany}% elérhető)`);
    if (m.nincsUt) console.log(`      pl. ${m.pelda.join(" | ")}`);
  }
  const hibak = page.jsErrors.filter(s => !/favicon/.test(s));
  console.log("-".repeat(78));
  console.log(`${kodok.length} épület ellenőrizve` +
              (baj.length ? `, ebből ${baj.length} nem váltott át: ${baj.join(", ")}` : ""));
  console.log(hibak.length ? `JS hiba (${hibak.length}): ${hibak.slice(0, 3).join(" | ")}`
                           : "JS hiba nincs");
  await browser.close(); await srv.close();
})();

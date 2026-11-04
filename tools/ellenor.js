#!/usr/bin/env node
/* Gyors ellenőrzés böngésző nélkül — a CI-ben a deploy ELŐTT fut, hogy egy
   szintaktikai hiba vagy egy elrontott adatfájl ne kerüljön ki élesbe.
   Korábban a main-re tolt commit teszt nélkül ment a Pages-re: egy hibás
   karakter az index.html beágyazott szkriptjében üres appot adott volna
   minden telefonon (és a service worker ezt is eltette volna).

   Amit néz:
   - az index.html és a meres.html minden beágyazott <script>-je és a sw.js
     lefordítható-e (vm.Script: csak fordít, nem futtat);
   - a data/ minden .json fájlja ép JSON-e, és a három, amire az app épít,
     a várt alakú-e (nyilvántartás, helyek, órarend, épületadat).

   Használat: node tools/ellenor.js   (kilépési kód 1, ha bármi hibás) */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const hibak = [];
const hiba = (hol, mi) => hibak.push(`${hol}: ${mi}`);

function fordit(nev, kod) {
  try { new vm.Script(kod, { filename: nev }); }
  catch (e) { hiba(nev, e.message); }
}

for (const lap of ["index.html", "meres.html"]) {
  const html = fs.readFileSync(path.join(ROOT, lap), "utf8");
  // csak a beágyazott, futtatható szkriptek (src nélküli, nem JSON/ld típusú)
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const attr = m[1] || "";
    if (/\bsrc=/.test(attr) || /type=["']?(application\/(ld\+)?json|text\/plain)/i.test(attr)) continue;
    n++; fordit(`${lap} <script> #${n}`, m[2]);
  }
  if (lap === "index.html" && n === 0) hiba(lap, "nincs beágyazott szkript — ez nem az app");
}
fordit("sw.js", fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"));

const json = rel => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
  catch (e) { hiba(rel, "nem ép JSON: " + e.message); return null; }
};
const bejar = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? bejar(path.join(dir, d.name)) : d.name.endsWith(".json") ? [path.join(dir, d.name)] : []);
const adat = Object.fromEntries(bejar("data").map(f => [f.split(path.sep).join("/"), json(f)]));

// az alak, amire az app épít (lásd tmOk, az epvNyilv és az epuletEp az index.html-ben)
const ep = adat["data/epuletek.json"];
if (ep && !(ep.epuletek && Object.keys(ep.epuletek).length)) hiba("data/epuletek.json", "nincs benne épület");
const hely = adat["data/helyek.json"];
if (hely && !(hely.epuletek && hely.terkep)) hiba("data/helyek.json", "hiányzik az epuletek vagy a terkep");
const tm = adat["data/termek.json"];
if (tm && !(tm.het1 && tm.rooms && tm.targyak)) hiba("data/termek.json", "nem a várt formátum (het1, rooms, targyak)");
/* Ugyanaz a szerkezet, amit az app epuletEp()-je megkövetel: ami itt átmegy,
   az ott is megnyílik — különben egy megnyithatónak jelölt épület élesben
   „nem érhető el” lenne. */
const szam = x => typeof x === "number" && isFinite(x);
const pont = p => Array.isArray(p) && szam(p[0]) && szam(p[1]);
for (const [f, d] of Object.entries(adat)) {
  if (!/^data\/epuletek\/[a-z]{2}\.json$/.test(f) || !d) continue;
  const hiany = ["meta", "levels", "rooms", "grid", "masks", "walls", "stairs"].filter(k => !d[k]);
  if (hiany.length) { hiba(f, `hiányzik: ${hiany.join(", ")}`); continue; }
  if (!Array.isArray(d.levels) || !d.levels.length || !Array.isArray(d.rooms) || !d.rooms.length || !Array.isArray(d.stairs))
    { hiba(f, "a levels, a rooms és a stairs nem (nem üres) tömb"); continue; }
  if (!szam(d.meta.w) || !szam(d.meta.h)) hiba(f, "a meta.w / meta.h nem szám");
  if (!(d.grid.w > 0 && d.grid.h > 0 && d.grid.res > 0)) hiba(f, "a rács mérete nem pozitív");
  const lv = new Set(d.levels.map(l => l && l.level));
  if (lv.has(undefined)) hiba(f, "van szint level nélkül");
  for (const l of lv) if (l !== undefined && typeof d.masks[l] !== "string") hiba(f, `a(z) ${l}. szintnek nincs maszkja`);
  const rossz = d.rooms.filter(r => !r || r.id == null || !lv.has(r.level) || !Array.isArray(r.poly) || r.poly.length < 3 ||
    !r.poly.every(pont) || (r.doors && (!Array.isArray(r.doors) || !r.doors.every(pont))));
  if (rossz.length) hiba(f, `${rossz.length} helyiség szerkezete hibás (id, szint, sokszög, ajtók), pl. ${(rossz[0] && rossz[0].code) || "?"}`);
  const atjaro = x => x && x.id != null && Array.isArray(x.pts) && x.pts.every(q => Array.isArray(q) && lv.has(q[0]) && szam(q[1]) && szam(q[2]));
  if (!d.stairs.every(atjaro)) hiba(f, "van hibás lépcső (id, pontok)");
  if (d.lifts != null && !(Array.isArray(d.lifts) && d.lifts.every(atjaro))) hiba(f, "van hibás lift (id, pontok)");
}
// amit a nyilvántartás megnyithatónak mond, annak az adatfájlja is legyen meg
if (ep && ep.epuletek) for (const [kod, e] of Object.entries(ep.epuletek))
  if (e.navigalhato && kod !== "OA" && !adat[`data/epuletek/${kod.toLowerCase()}.json`])
    hiba("data/epuletek.json", `${kod} megnyithatónak van jelölve, de nincs data/epuletek/${kod.toLowerCase()}.json`);

if (hibak.length) { console.error(hibak.map(h => "HIBA  " + h).join("\n")); process.exit(1); }
console.log(`rendben: ${Object.keys(adat).length} adatfájl, a szkriptek lefordulnak`);

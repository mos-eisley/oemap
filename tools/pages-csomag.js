#!/usr/bin/env node
/* A Pages-re publikált csomag összeállítása: CSAK az, amire az appnak futás
   közben szüksége van — engedélylista, nem tiltólista.

   Miért így: a repó privát, a Pages site viszont nem az, és ami a csomagba
   kerül, azt bárki letöltheti az oldal címéről. Korábban a deploy a repó
   gyökerét tette ki (`path: .`): amíg a Pages élt, a .git és a .github
   kivételével minden kint volt — a CLAUDE.md, a README, a docs/, a tools/, a
   tests/ és a .claude/ is, bennük a belső forrásfájlok nevével és a
   munkafolyamattal. Az engedélylistánál egy új fájl csak akkor kerül ki, ha
   valaki ide felveszi.

   Ha az appnak új futásidejű fájl kell (új adat, új ikon), ide kell felvenni.
   Az őr elbukik, ha valami hiányzik, amire a lapok vagy a manifest
   hivatkoznak, vagy egy megnyitható épület adatfájlja; a tests/csomag.js a
   csomagból ki is szolgálja az appot, és minden kérést figyel, amit a
   bejárása közben lát.

   Használat:  node tools/pages-csomag.js <cél könyvtár>
   A deploy-pages.yml ezzel állítja össze a _site-ot. */
const fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "..");
// egyenként felsorolt fájlok, és könyvtárak a bennük engedett fájlfajtákkal
const FAJLOK = ["index.html", "sw.js", "manifest.webmanifest", "meres.html",
                "data/termek.json", "data/epuletek.json", "data/helyek.json"];
const KONYVTARAK = [["icons", /\.png$/], ["fonts", /\.(woff2|txt)$/], ["data/epuletek", /\.json$/]];
/* Második védvonal, ha valaki a fenti listába mégis belső fájlt venne fel:
   ezek a fájlfajták és a forras/ biztosan nem mehetnek ki. Egy forras/-on
   kívülre került belső JSON-t nem ismer fel — az ellen az engedélylista véd. */
const TILOS = /(^|\/)forras(\/|$)|\.(pdf|xlsx?|ifc|md|py|sh|pkl)$/i;
// a lapok és a manifest helyi hivatkozásai: ezeknek mind a csomagban kell lenniük
const HIVATKOZO = ["index.html", "meres.html", "manifest.webmanifest"];
/* Amit egy lap betölthet: a HTML-tagek href/src attribútuma (mindkét
   idézőjellel) és srcset-je (vesszőnként az első tag), a CSS url() a
   <style>-ban és a style= attribútumban, a service worker regisztrációja; a
   manifestben a "src". A JS-kód és a kommentek nem: egy `src` nevű
   változó vagy egy kikommentezett tag nem hivatkozás. A # és a ? utáni rész
   nem a fájl neve; a „./” és a „.” a lap könyvtárának index.html-je. A
   /-rel kezdődő (gyökér-abszolút) út külön jelölve jön vissza: a Pages egy
   alkönyvtár alól is kiszolgálhat, és ott az ilyen út nem a csomagra mutat. */
const ABSZOLUT = "abszolút:";
function hivatkozasok(rel) {
  const t = fs.readFileSync(path.join(ROOT, rel), "utf8"), ki = new Set(), nyers = [];
  if (rel.endsWith(".webmanifest")) for (const m of t.matchAll(/"src"\s*:\s*"([^"]+)"/g)) nyers.push(m[1]);
  else {
    const html = t.replace(/<!--[\s\S]*?-->/g, "");
    const attr = (tag, nev) => [...tag.matchAll(new RegExp(`\\s${nev}\\s*=\\s*(["'])(.*?)\\1`, "g"))].map(m => m[2]);
    const css = c => [...c.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\burl\(\s*(["']?)([^"')]+)\1\s*\)/g)].map(m => m[2]);
    for (const [tag] of html.replace(/<script\b[\s\S]*?<\/script>/gi, m => m.match(/^<script\b[^>]*>/i)[0])
                            .matchAll(/<[a-zA-Z][^>]*>/g)) {
      nyers.push(...attr(tag, "href"), ...attr(tag, "src"), ...attr(tag, "style").flatMap(css));
      for (const s of attr(tag, "srcset")) for (const x of s.split(",")) nyers.push(x.trim().split(/\s+/)[0]);
    }
    for (const [, c] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) nyers.push(...css(c));
    for (const m of html.matchAll(/serviceWorker\.register\(\s*(["'])(.*?)\1/g)) nyers.push(m[2]);
  }
  for (const n of nyers) {
    let u = (n || "").split(/[?#]/)[0].trim();
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u) || /[`${}<>\s+]/.test(u)) continue;
    if (!u && !/^[?]/.test(n || "")) continue;            // csak „#…”: a lapon belül
    if (u.startsWith("/")) { ki.add(ABSZOLUT + u); continue; }
    if (!u || u === "." || u.endsWith("/")) u = (u === "." ? "" : u) + "index.html";
    ki.add(path.posix.normalize(path.posix.join(path.posix.dirname(rel), u)));
  }
  return [...ki];
}

/* A cél előbb törlődik, ezért csak olyan könyvtár lehet, amit nyugodtan el
   lehet dobni: nem létező, üres, vagy egy korábbi csomag. Korábbi csomag az,
   amit ez az eszköz írt — a gyökerében ott a JELZO —, és amiben minden fájl
   a csomag alakjába illik. A nevek egyezése kevés: egy saját statikus oldal
   is állhat index.html-ből, sw.js-ből és egy icons/ mappából. A repó, a
   szülői, a saját home, a data/ vagy a futtatás könyvtára így nem törölhető
   el egy elírt argumentummal. A gyökér azért paraméter, hogy a
   tests/csomag.js a repó-szabályt külön is mérhesse. */
const JELZO = ".oemap-csomag";
const csomagbaIllik = rel => rel === JELZO || FAJLOK.includes(rel) ||
  KONYVTARAK.some(([k, minta]) => path.posix.dirname(rel) === k && minta.test(path.posix.basename(rel)));
const csomagKonyvtar = rel => KONYVTARAK.some(([k]) => k === rel || k.startsWith(rel + "/")) ||
  FAJLOK.some(f => f.startsWith(rel + "/"));
function idegenElemek(c, rel = "") {
  const ki = [];
  for (const f of fs.readdirSync(path.join(c, rel)).sort()) {
    const r = rel ? rel + "/" + f : f, st = fs.lstatSync(path.join(c, r));
    if (st.isSymbolicLink()) ki.push(r);
    else if (st.isDirectory()) { if (csomagKonyvtar(r)) ki.push(...idegenElemek(c, r)); else ki.push(r + "/"); }
    else if (!csomagbaIllik(r)) ki.push(r);
  }
  return ki;
}
function celRendben(cel, gyoker = ROOT) {
  const c = path.resolve(cel), cwd = process.cwd();
  if (c === gyoker || gyoker.startsWith(c + path.sep) || c === path.parse(c).root)
    throw new Error("a cél nem lehet a repó vagy annak szülője: " + c);
  if (cwd === c || cwd.startsWith(c + path.sep))
    throw new Error("a cél nem lehet a futtatás könyvtára vagy annak szülője: " + c);
  if (fs.existsSync(c)) {
    if (fs.lstatSync(c).isSymbolicLink() || !fs.statSync(c).isDirectory()) throw new Error("a cél nem könyvtár: " + c);
    const elemek = fs.readdirSync(c);
    if (elemek.length && !elemek.includes(JELZO))
      throw new Error(`a cél nem üres, és nem korábbi csomag (nincs benne ${JELZO}): ` + c);
    const idegen = idegenElemek(c);
    if (idegen.length) throw new Error(`a cél nem üres, és nem korábbi csomag (${idegen.slice(0, 3).join(", ")}…): ` + c);
  }
  return c;
}

/* A könyvtárak tartalma a git indexe szerint: a CI egy friss checkoutból
   épít, és ami helyben megvan, de nincs a gitben (egy elfelejtett `git add`),
   az ott hiányozna — helyben pedig a teszt is zöld lenne. Ha a ROOT nem egy
   git-repó teteje (kicsomagolt példány, akár egy másik repó munkafáján belül),
   vagy nincs git, a könyvtár listája. */
let gitben;
function konyvtarFajljai(k) {
  const helyben = fs.readdirSync(path.join(ROOT, k)).sort()
    .filter(f => fs.statSync(path.join(ROOT, k, f)).isFile());
  const git = args => require("child_process").execFileSync("git", ["-C", ROOT, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (gitben === undefined)
    try { gitben = fs.realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) === fs.realpathSync(ROOT); }
    catch (e) { gitben = false; }
  if (!gitben) return helyben;
  const kovetett = new Set(git(["ls-files", "-z", "--", k]).split("\0").filter(Boolean));
  return helyben.filter(f => kovetett.has(k + "/" + f));
}

/* Amit a nyilvántartás megnyithatónak mond, annak az adata is legyen kint
   (az OA-é be van égetve): különben a választó egy meg nem nyitható épületet
   kínálna. Ezt a CI is látja, böngésző nélkül. */
const hianyzoEpuletek = (ki, reg, beegetett) => Object.values(reg.epuletek || {})
  .filter(e => e.navigalhato && e.kod !== beegetett && !ki.includes(`data/epuletek/${e.kod.toLowerCase()}.json`))
  .map(e => `a nyilvántartás megnyithatónak mondja, de nincs a csomagban: data/epuletek/${e.kod.toLowerCase()}.json`);

function osszeallit(cel) {
  cel = celRendben(cel);
  fs.rmSync(cel, { recursive: true, force: true });
  fs.mkdirSync(cel, { recursive: true });
  fs.writeFileSync(path.join(cel, JELZO), "tools/pages-csomag.js\n");
  const ki = [];
  const masol = rel => {
    const hova = path.join(cel, rel);
    fs.mkdirSync(path.dirname(hova), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), hova);
    ki.push(rel);
  };
  for (const f of FAJLOK) masol(f);
  for (const [k, minta] of KONYVTARAK)
    for (const f of konyvtarFajljai(k)) if (minta.test(f)) masol(k + "/" + f);

  const hibak = [];
  for (const f of ki) if (TILOS.test(f)) hibak.push("tiltott fájl a csomagban: " + f);
  /* A service worker telepítőkészletének minden eleme legyen kint: ami
     hiányzik, azt a telepítés csendben kihagyja, és offline nem lesz meg. */
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shell = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [, ""])[1];
  for (const [, u] of shell.matchAll(/"\.\/([^"]*)"/g)) {
    const rel = u || "index.html";
    if (!ki.includes(rel)) hibak.push("a service worker készletéből hiányzik: " + rel);
  }
  // amire egy lap vagy a manifest hivatkozik (ikon, manifest, a service worker, CSS url())
  for (const lap of HIVATKOZO) {
    if (!ki.includes(lap)) continue;
    for (const rel of hivatkozasok(lap))
      if (rel.startsWith(ABSZOLUT))
        hibak.push(`a(z) ${lap} gyökér-abszolút úttal hivatkozik (alkönyvtár alól nem a csomagra mutat): ${rel.slice(ABSZOLUT.length)}`);
      else if (!ki.includes(rel) && rel !== lap) hibak.push(`a(z) ${lap} hivatkozik rá, de nincs a csomagban: ${rel}`);
  }
  for (const kell of ["index.html", "sw.js"])
    if (!ki.includes(kell)) hibak.push("nélküle nincs app: " + kell);
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "epuletek.json"), "utf8"));
    const beegetett = (fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/"code"\s*:\s*"([A-Z]{2})/) || [])[1];
    hibak.push(...hianyzoEpuletek(ki, reg, beegetett));
  } catch (e) { hibak.push("a data/epuletek.json nem olvasható: " + e.message); }
  return { fajlok: ki, hibak };
}

module.exports = { osszeallit, celRendben, hivatkozasok, hianyzoEpuletek, FAJLOK, KONYVTARAK, TILOS, JELZO };

if (require.main === module) {
  const cel = process.argv[2];
  if (!cel) { console.error("Használat: node tools/pages-csomag.js <cél könyvtár>"); process.exit(2); }
  const c = path.resolve(cel);
  let fajlok, hibak, meret;
  try {
    ({ fajlok, hibak } = osszeallit(c));
    meret = fajlok.reduce((n, f) => n + fs.statSync(path.join(c, f)).size, 0);
  } catch (e) { console.error(e.message); process.exit(2); }
  console.log(`${fajlok.length} fájl, ${(meret / 1048576).toFixed(1)} MB → ${c}`);
  if (hibak.length) { console.error(hibak.join("\n")); process.exit(1); }
}

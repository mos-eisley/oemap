/* A Pages-re publikált csomag (tools/pages-csomag.js): csak engedélylistás
   fájlok kerülnek bele, és az app ebből a csomagból maradéktalanul fut.

   A kettő együtt számít. A repó privát, a Pages site nem az: ami a csomagba
   kerül, azt bárki letöltheti. Korábban a deploy a munkafát tette ki
   (`path: .`), és amíg a Pages élt, a CLAUDE.md, a README, a docs/, a tools/,
   a tests/ és a .claude/ is kint volt. Az engedélylista viszont csak addig
   jó, amíg az appnak semmi nem
   hiányzik belőle: ha egy új futásidejű fájl kimarad, élesben 404-et kap.
   Ezért itt a csomagból szolgáljuk ki az appot, végigváltunk minden
   megnyitható épületen, és minden sikertelen kérés bukás. (Ami a bejárás
   közben nem kérődik le — az apple-touch-icon, egy CSS-ben hivatkozott, de
   épp nem használt betű —, azt az összeállító saját hivatkozás-ellenőrzése
   fogja meg, böngésző nélkül, a CI-ben is.) */
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const { chromePath, serve, harness, PHONE } = require("./lib");
const { osszeallit, celRendben, hivatkozasok, hianyzoEpuletek } = require("../tools/pages-csomag");

(async () => {
  const t = harness("publikált csomag");
  const cel = fs.mkdtempSync(path.join(os.tmpdir(), "oemap-csomag-"));
  const { fajlok, hibak } = osszeallit(cel);
  t("a csomag összeáll, az őr nem talál hibát", hibak.length === 0, hibak.join(" | "));
  t("belső anyag és fejlesztői fájl nincs benne",
    !fajlok.some(f => /forras|\.(md|py|pdf|xlsx?|ifc)$|^(tools|tests|docs|\.claude|\.github)\//.test(f)),
    fajlok.filter(f => /\.(md|py)$|\//.test(f) && !/^(data|fonts|icons)\//.test(f)).join(", "));
  t("benne van az app, a service worker és az adat", ["index.html", "sw.js", "manifest.webmanifest",
    "data/termek.json", "data/epuletek.json"].every(f => fajlok.includes(f)), fajlok.join(", "));
  /* Az összeállító a célt előbb törli: egy elírt argumentum ne vigye el a
     repót, a home-ot vagy a data/-t. Csak a célellenőrt hívjuk, magát a
     törlést nem — egy elromlott őr itt különben tényleg törölne. */
  const ROOT = path.resolve(__dirname, "..");
  const indok = (c, gy) => { try { celRendben(c, gy); return ""; } catch (e) { return e.message; } };
  const elutasit = c => !!indok(c);
  const tilos = [ROOT, path.dirname(ROOT), path.parse(ROOT).root, path.join(ROOT, "data"), path.join(ROOT, "icons"),
                 path.join(ROOT, "index.html")];
  t("a célkönyvtár nem lehet a repó, a szülője, a gyökér, egy forráskönyvtár vagy egy fájl",
    tilos.every(elutasit), tilos.filter(c => !elutasit(c)).join(", "));
  /* Egy saját könyvtár, amiben csak csomagnevű elemek állnak (index.html,
     data/), de bennük más is van: nem korábbi csomag, nem törölhető. */
  const sajat = fs.mkdtempSync(path.join(os.tmpdir(), "oemap-sajat-"));
  fs.writeFileSync(path.join(sajat, "index.html"), "<p>saját</p>");
  fs.mkdirSync(path.join(sajat, "data")); fs.writeFileSync(path.join(sajat, "data", "sajat.csv"), "a;b\n");
  // egy saját statikus oldal, ami csupa csomag alakú fájlból áll: a jelzőfájl dönt
  const oldal = fs.mkdtempSync(path.join(os.tmpdir(), "oemap-oldal-"));
  fs.writeFileSync(path.join(oldal, "index.html"), "<h1>másik oldalam</h1>");
  fs.mkdirSync(path.join(oldal, "icons")); fs.writeFileSync(path.join(oldal, "icons", "logo.png"), "png");
  t("csomagnevű, de idegen tartalmú könyvtárat nem fogad el célnak (a tartalmát és a jelzőfájlt nézi, nem a neveket)",
    /nem korábbi csomag/.test(indok(sajat)) && /nem korábbi csomag/.test(indok(oldal)),
    `${indok(sajat) || "elfogadta"} | ${indok(oldal) || "elfogadta"}`);
  fs.rmSync(oldal, { recursive: true, force: true });
  /* A repó-szabályt külön: egy „data” nevű repó, a szülőjében semmi más — ezt
     csak az az egy szabály utasíthatja el, a tartalom-ellenőrzés nem. */
  const fa = fs.mkdtempSync(path.join(os.tmpdir(), "oemap-fa-")), alrepo = path.join(fa, "data");
  fs.mkdirSync(alrepo);
  t("a repó és a szülője a saját szabálya miatt tilos, nem csak a tartalma miatt",
    /nem lehet a repó/.test(indok(alrepo, alrepo)) && /nem lehet a repó/.test(indok(fa, alrepo)),
    `${indok(alrepo, alrepo)} | ${indok(fa, alrepo)}`);
  fs.rmSync(sajat, { recursive: true, force: true }); fs.rmSync(fa, { recursive: true, force: true });
  t("korábbi csomagba és nem létező könyvtárba szabad összeállítani",
    !elutasit(cel) && !elutasit(path.join(cel, "nincs-ilyen")));
  /* A hivatkozás-ellenőrzés a CSS url()-t (betűk) és az apple-touch-icont is
     látja: ezeket a böngészős bejárás nem feltétlenül kéri le. */
  const ref = hivatkozasok("index.html");
  t("a hivatkozás-ellenőrzés a CSS url()-es betűket és az apple-touch-icont is látja",
    ref.includes("fonts/metropolis-latin-400-normal.woff2") && ref.includes("icons/icon-180.png") && ref.includes("sw.js"),
    ref.join(", "));
  /* Megnyithatónak mondott épület adat nélkül: egy elfelejtett `git add` a CI-ben
     ezt adná. Az OA be van égetve, annak nem kell fájl. */
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "epuletek.json"), "utf8"));
  const hiany = hianyzoEpuletek(fajlok.filter(f => f !== "data/epuletek/od.json"), reg, "OA");
  t("ha egy megnyitható épület adatfájlja hiányzik, az őr szól (az OA-nál nem kell fájl)",
    hiany.length === 1 && /od\.json/.test(hiany[0]) && hianyzoEpuletek(fajlok, reg, "OA").length === 0, hiany.join(" | "));

  /* Az őr egészben, a CLI-n át, ahogy a CI futtatja: egy repómásolatban
     elrontunk egy-egy dolgot, és a parancsnak hibával kell kilépnie, a hibát
     megnevezve. Így az is mérve van, hogy az osszeallit() tényleg használja az
     ellenőrzéseket, nem csak a segédfüggvények jók. */
  const { spawnSync } = require("child_process");
  const masolat = () => {
    const m = fs.mkdtempSync(path.join(os.tmpdir(), "oemap-masolat-"));
    for (const f of ["index.html", "sw.js", "manifest.webmanifest", "meres.html", "data", "icons", "fonts", "tools/pages-csomag.js"])
      fs.cpSync(path.join(ROOT, f), path.join(m, f), { recursive: true });
    return m;
  };
  const futtat = m => { const r = spawnSync(process.execPath, [path.join(m, "tools", "pages-csomag.js"), path.join(m, "_site")],
    { cwd: m, encoding: "utf8" }); return { kod: r.status, ki: (r.stdout || "") + (r.stderr || "") }; };
  const esetek = {
    "ép másolat": [m => {}, r => r.kod === 0],
    "hiányzó épületfájl": [m => fs.rmSync(path.join(m, "data", "epuletek", "od.json")), r => r.kod === 1 && /od\.json/.test(r.ki)],
    "CSS url() hiányzó betűre": [m => fs.writeFileSync(path.join(m, "index.html"), fs.readFileSync(path.join(m, "index.html"), "utf8")
      .replace("</style>", "@font-face{font-family:x;src:url(fonts/nincs-ilyen.woff2)}</style>")), r => r.kod === 1 && /nincs-ilyen\.woff2/.test(r.ki)],
    "gyökér-abszolút hivatkozás": [m => fs.writeFileSync(path.join(m, "index.html"), fs.readFileSync(path.join(m, "index.html"), "utf8")
      .replace("</head>", '<link rel="preload" as="image" href="/icons/icon-512.png"></head>')), r => r.kod === 1 && /gyökér-abszolút/.test(r.ki)],
    "érvényes „vissza” link és kikommentezett tag": [m => fs.writeFileSync(path.join(m, "meres.html"), fs.readFileSync(path.join(m, "meres.html"), "utf8")
      .replace("</body>", '<a href="./">vissza</a><!-- <img src="icons/regi.png"> --></body>')), r => r.kod === 0],
    "a git szerint hiányzó épületfájl (elfelejtett git add)": [m => {
      const g = a => spawnSync("git", ["-C", m, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" });
      g(["init", "-q"]); g(["add", "-A"]); g(["rm", "-q", "--cached", "data/epuletek/od.json"]); g(["commit", "-q", "-m", "x"]);
    }, r => r.kod === 1 && /od\.json/.test(r.ki)],
  };
  const eredm = {};
  for (const [nev, [ront, jo]] of Object.entries(esetek)) {
    const m = masolat();
    try { ront(m); const r = futtat(m); eredm[nev] = jo(r) ? "ok" : `HIBA (kilépés ${r.kod}): ${r.ki.trim().split("\n").slice(-2).join(" / ")}`; }
    finally { fs.rmSync(m, { recursive: true, force: true }); }
  }
  t("a CLI-n át az őr minden elrontott esetet hibával utasít el, az épet és az érvényes linket átengedi",
    Object.values(eredm).every(v => v === "ok"), JSON.stringify(eredm));

  const srv = await serve(cel);
  const browser = await chromium.launch({ executablePath: chromePath() });
  const ctx = await browser.newContext(PHONE);
  const rossz = [], errs = [];
  ctx.on("response", r => { if (r.status() >= 400) rossz.push(`${r.status()} ${r.url().replace(srv.url, "")}`); });
  ctx.on("requestfailed", r => rossz.push(`hiba ${r.url().replace(srv.url, "")}`));
  try {
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(e.message));
    await p.goto(srv.url + "index.html", { waitUntil: "load" });
    await p.waitForFunction(() => document.querySelectorAll(".floor").length > 0 && typeof EPULETEK !== "undefined"
      && EPULETEK, null, { timeout: 15000 });
    const nyithato = await p.evaluate(() =>
      Object.entries(EPULETEK.epuletek).filter(([, e]) => e.navigalhato).map(([k]) => k));
    const bejart = [];
    for (const kod of nyithato.concat(nyithato[0])) {
      await p.evaluate(k => epuletValt(k), kod);
      try {
        await p.waitForFunction(k => epItt() === k && document.querySelectorAll(".floor").length > 0, kod,
          { timeout: 15000 });
        bejart.push(kod);
      } catch (e) { bejart.push(kod + "?"); }
    }
    t("a csomagból minden megnyitható épület betölt", bejart.every(k => !k.endsWith("?")) && nyithato.length >= 2,
      bejart.join(" → "));
    /* A service worker telepítőkészlete is a csomagból jön: ami hiányzik, az
       404 lenne. Ha a telepítés elbukik, a ready sosem teljesül — ezért
       időkorláttal várjuk, és az is bukás. */
    const swKesz = await p.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true),
      new Promise(r => setTimeout(() => r(false), 15000))]));
    t("a service worker a csomagból települ", swKesz);
    await p.waitForTimeout(1500);
    await p.goto(srv.url + "meres.html", { waitUntil: "load" });
    t("a mérőlap is betölt", (await p.title()).length > 0);
    // a mérőlap késve kért fájljai (ikon, betű) is beérjenek, mielőtt összesítünk
    await p.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    t("a csomagból egyetlen kérés sem bukik el (404, hálózati hiba)", rossz.length === 0, rossz.join(" | "));
    t("nincs JS hiba", errs.length === 0, errs.join(" | "));
  } catch (e) {
    // a csomagból el sem indult az app (pl. hiányzik a nyilvántartás): bukás, olvasható okkal
    t("az app a csomagból elindul", false, e.message.split("\n")[0] + (rossz.length ? " · " + rossz.join(" | ") : ""));
  } finally {
    await browser.close();
    await srv.close();
    fs.rmSync(cel, { recursive: true, force: true });
  }
  console.log(t.title);
  process.exitCode = t.report() ? 1 : 0;
})();

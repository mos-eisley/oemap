/* PWA: telepíthetőség és offline működés. Az épületben gyenge a térerő, és a
   teremkereső pont akkor kell, amikor a hallgató már bent van — ezért az
   offline indulás nem kényelmi extra, hanem az alapkövetelmény. */
const { chromium, } = require("playwright");
const { chromePath, serve, harness, PHONE } = require("./lib");
const fs = require("fs"), os = require("os"), path = require("path");

/* Hálózat nélkül. A setOffline magában nem elég: Chromiumban a service worker
   saját kérései egy része így is kimegy, és akkor a „hálózat nélküli” próba
   valójában a szervertől kapja meg az appot. Ezért minden kérés el is bukik. */
const halozat = async (ctx, van) => {
  await ctx.setOffline(!van);
  if (van) await ctx.unroute("**/*");
  else await ctx.route("**/*", r => r.abort("internetdisconnected"));
};
/* A serviceWorker.ready örökre várhat, ha a telepítés elbukik (pl. hiányzik
   egy kötelező fájl): akkor a teszt ne akadjon el, hanem bukjon. */
const swKesz = p => p.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true),
  new Promise(r => setTimeout(() => r(false), 15000))]));
const termekVan = p => p.evaluate(async () => {
  try { return !!(await (await fetch("data/termek.json")).json()).het1; } catch (e) { return false; } });

(async () => {
  const t = harness("PWA és offline");
  const srv = await serve();
  // Perzisztens profil kell: a service worker regisztrációja és a cache
  // különben nem élné túl az újratöltést.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "oemap-pwa-"));
  const ctx = await chromium.launchPersistentContext(profile,
    { executablePath: chromePath(), ...PHONE });
  try {
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto(srv.url + "index.html", { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1500);

    const man = await p.evaluate(async () => {
      const l = document.querySelector("link[rel=manifest]");
      if (!l) return null;
      const m = await (await fetch(l.href)).json();
      return { name:m.name, display:m.display, start:m.start_url, scope:m.scope,
               theme:m.theme_color, icons:m.icons.map(i => `${i.sizes} ${i.purpose||""}`.trim()) };
    });
    t("van webmanifest", !!man);
    t("önálló ablakban indul", man && man.display === "standalone", man && man.display);
    t("van maskable ikon is", man && man.icons.some(i => /maskable/.test(i)), man && man.icons.join(", "));
    t("van apple-touch-icon (iOS)", await p.evaluate(() => !!document.querySelector("link[rel=apple-touch-icon]")));
    t("van theme-color", (await p.evaluate(() =>
      [...document.querySelectorAll("meta[name=theme-color]")].length)) > 0);

    await p.waitForTimeout(2500);
    const kesz = await swKesz(p);
    const sw = await p.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      if (!r) return null;
      return { active: !!r.active, state: r.active && r.active.state };
    });
    t("a service worker aktív", kesz && sw && sw.active && sw.state === "activated", JSON.stringify({ kesz, sw }));

    const cached = await p.evaluate(async () => {
      const ks = await caches.keys();
      if (!ks.length) return null;
      return { cache: ks[0], db: (await (await caches.open(ks[0])).keys()).length };
    });
    t("eltette a fájlokat a gyorsítótárba", cached && cached.db > 0, JSON.stringify(cached));

    /* A teremadat félévente cserélődik, a neve viszont nem. Gyorsítótár-először
       a telepített app örökre a régit látná — a lejárt, kéthetes adat így
       ragadt volna a telefonokon. Hálózat-először kell: a service worker
       online a szerverhez forduljon érte. */
    const swKeres = [];
    ctx.on("request", r => { if (r.serviceWorker() && /termek\.json/.test(r.url())) swKeres.push(r.url()); });
    const friss = await p.evaluate(async () => (await (await fetch("data/termek.json")).json()).het1);
    await p.waitForTimeout(300);
    t("a teremadat online a hálózatról jön, nem a gyorsítótárból", swKeres.length > 0 && !!friss,
      `${swKeres.length} hálózati kérés, het1=${friss}`);
    /* A tmLoad() régi formátumnál `?v=`-vel kéri újra: a friss példány a
       paraméter nélküli kulcs alá kerüljön, különben offline megint a régi
       jönne, és a sosem olvasott bejegyzések gyűlnének. A kulcs neve kevés: a
       telepítéskor eltett példány mindig ott van. Ezért a `?v=`-s válasz
       megjelölt, és azt nézzük, hogy a paraméter nélküli kulcs alatt ez áll-e. */
    await ctx.route(/data\/termek\.json\?v=proba/, async r => {
      const v = await r.fetch(); const j = await v.json(); j.proba = "v-kulcs";
      await r.fulfill({ response: v, json: j }); });
    await p.evaluate(() => fetch("data/termek.json?v=proba").then(r => r.text()));
    await p.waitForTimeout(500);
    await ctx.unroute(/data\/termek\.json\?v=proba/);
    const kulcsok = await p.evaluate(async () => {
      const ki = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) ki.push(r.url);
      const h = await caches.match("data/termek.json");
      return { ki, proba: h ? (await h.json()).proba : null }; });
    t("a ?v= paraméteres újrakérés a paraméter nélküli kulcs alá kerül, és ott a friss példány áll",
      !kulcsok.ki.some(u => /[?&]v=/.test(u)) && kulcsok.proba === "v-kulcs",
      `proba=${kulcsok.proba}; ` + kulcsok.ki.filter(u => /termek/.test(u)).join(", "));

    // Az igazi próba: hálózat nélkül is elindul-e.
    await halozat(ctx, false);
    let ok = false, title = "", fonts = 0, adat = false;
    try {
      await p.goto(srv.url + "index.html", { waitUntil: "load", timeout: 15000 });
      title = await p.title();
      ok = await p.evaluate(() => document.querySelectorAll(".floor").length > 0
                                && !!document.querySelector(".floor svg"));
      if (ok) fonts = await p.evaluate(() => [...document.fonts].filter(f => f.status === "loaded").length);
      if (ok) adat = await termekVan(p);
    } catch (e) { title = "hiba: " + e.message.split("\n")[0]; }
    finally { await halozat(ctx, true); }

    t("offline is elindul", ok, title);
    t("offline is megvan az alaprajz", ok);
    t("offline a betűk is betöltenek", fonts > 0, "betű=" + fonts);
    t("offline a teremadat is megvan", adat);
    t("nincs JS hiba", errs.length === 0, errs.join(" | "));
  } finally {
    await ctx.close();
    await srv.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }

  /* A szerver hibaoldala nem írhatja felül a tárolt appot. Élesben ez történt
     volna: a Pages kikapcsolásakor minden cím 404-et ad, és a service worker
     ezt tette el offline példánynak — utána offline is a hibaoldal jött, és a
     totem, amin a hibaoldalon nincs JS, magától már nem töltött volna újra.
     Ugyanígy egy másik lap (meres.html) sem kerülhet az app helyére. Az
     átirányítást viszont követni kell, nem a tárolt appot adni helyette: ha a
     site új címre költözik, a régin a telepített app különben sosem tudná meg.
     Ez a szerver egy alkönyvtár alatt szolgál ki (/oemap/, a /oemap →
     /oemap/ átirányítással, ahogy a Pages a github.io-s címen tette): a
     service worker az app címét a hatóköréből ismeri fel, és egy rossz
     felismerés gyökérhatókörrel nem látszana. A saját domain (gyökérhatókör)
     esetét az első szakasz méri. */
  let mod = "ok";
  const MIME = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json",
    ".woff2":"font/woff2", ".png":"image/png", ".webmanifest":"application/manifest+json" };
  const ROOT = path.resolve(__dirname, "..");
  const ELO = "/oemap";
  const srv2 = require("http").createServer((req, res) => {
    const ut = req.url.split("?")[0];
    if (ut === "/uj/index.html") { res.writeHead(200, { "content-type":"text/html; charset=utf-8" });
      return res.end("<title>Új hely</title><p>az app új címe</p>"); }
    if (mod === "404") { res.writeHead(404, { "content-type":"text/html; charset=utf-8" });
      return res.end("<title>Site not found · GitHub Pages</title><h1>404</h1>"); }
    if (ut === ELO) { res.writeHead(301, { location: ELO + "/" }); return res.end(); }
    if (!ut.startsWith(ELO + "/")) { res.writeHead(404); return res.end(); }
    const app = ut === ELO + "/" || ut === ELO + "/index.html";
    if (mod === "301" && app) { res.writeHead(301, { location: "/uj/index.html" }); return res.end(); }
    // a lap megkapja az appot, a service worker telepítéskor viszont nem (megszakadó kapcsolat)
    if (mod === "telepites" && app && req.headers["sec-fetch-dest"] !== "document") {
      res.writeHead(503); return res.end(); }
    const rel = decodeURIComponent(ut.slice(ELO.length)).replace(/^\/+/, "") || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control":"no-store" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => srv2.listen(0, "127.0.0.1", r));
  const gyoker2 = "http://127.0.0.1:" + srv2.address().port + "/", base2 = gyoker2 + "oemap/";
  const profile2 = fs.mkdtempSync(path.join(os.tmpdir(), "oemap-pwa-"));
  const ctx2 = await chromium.launchPersistentContext(profile2, { executablePath: chromePath(), ...PHONE });
  const app = async (p, u) => {
    try { await p.goto(base2 + u, { waitUntil: "load", timeout: 15000 });
      await p.waitForFunction(() => document.querySelectorAll(".floor").length > 0, null, { timeout: 8000 });
      return true; } catch (e) { return false; } };
  const cim = async p => { try { return await p.title(); } catch (e) { return "(nincs cím)"; } };
  try {
    const p = await ctx2.newPage();
    await p.goto(base2 + "index.html", { waitUntil: "load" });
    t("a második profilban is települ a service worker, a /oemap/ hatókörrel", await swKesz(p) &&
      /\/oemap\/$/.test(await p.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope)));
    await p.waitForTimeout(1500);
    mod = "404";
    t("a szerver 404-et ad: online is a tárolt app indul, nem a hibaoldal", await app(p, "index.html"),
      await cim(p));
    t("… a hatókör gyökerén és paraméterrel is", await app(p, "") && await app(p, "index.html?totem"), await cim(p));
    let masik = "";
    try { await p.goto(base2 + "nincs-ilyen.html", { waitUntil: "load", timeout: 15000 }); masik = await cim(p); }
    catch (e) { masik = "hiba: " + e.message.split("\n")[0]; }
    t("… egy másik lap 404-e viszont 404 marad (nem kap app-alapcímet)", /Site not found/.test(masik), masik);
    t("a 404 alatt a teremadat a tárolt példányból jön", await termekVan(p));
    await halozat(ctx2, false);
    try {
      t("a 404 után offline is az app indul", await app(p, "index.html"), await cim(p));
      t("… a totem címén is", await app(p, "index.html?totem#from=OA00FK1"), await cim(p));
      t("… és a hatókör gyökerén, paraméterrel", await app(p, "?parosit"), await cim(p));
      t("… és a teremadat is megvan", await termekVan(p));
    } finally { await halozat(ctx2, true); }
    mod = "ok";
    await p.goto(base2 + "meres.html", { waitUntil: "load" });
    await halozat(ctx2, false);
    try {
      t("a mérőlap megnyitása után offline is az app indul, nem a mérőlap", await app(p, "index.html"),
        await cim(p));
    } finally { await halozat(ctx2, true); }
    mod = "301";
    let hova = "", cimke = "";
    try { await p.goto(base2 + "index.html", { waitUntil: "load", timeout: 15000 });
      hova = p.url(); cimke = await cim(p); } catch (e) { hova = "hiba: " + e.message.split("\n")[0]; }
    t("átirányításnál az új címre megy, nem a tárolt app jön", /\/uj\/index\.html$/.test(hova) && cimke === "Új hely",
      `${hova} — ${cimke}`);
    mod = "ok";
    await halozat(ctx2, false);
    try {
      t("az átirányítás nem írta felül a tárolt appot", await app(p, "index.html"), await cim(p));
    } finally { await halozat(ctx2, true); }
  } finally {
    await ctx2.close();
  }

  /* Telepítés: az app maga kötelező, a többi nem. Ha az app nem jön le, a
     telepítés bukjon el — különben egy app nélküli tároló lépne a régi
     helyére, és offline semmi nem indulna. Aktiváláskor pedig csak a saját
     régi tárolóinkat töröljük: egy github.io-s címen a felhasználó összes
     projektoldala egy origin. */
  const profile3 = fs.mkdtempSync(path.join(os.tmpdir(), "oemap-pwa-"));
  const ctx3 = await chromium.launchPersistentContext(profile3, { executablePath: chromePath(), ...PHONE });
  try {
    const p = await ctx3.newPage();
    // egy service worker nélküli lapon előre: egy másik projekt tárolója és a mi régi tárolónk
    await p.goto(gyoker2 + "uj/index.html", { waitUntil: "load" });
    await p.evaluate(async () => { await caches.open("masik-projekt"); await caches.open("oemap-v1"); });
    mod = "telepites";
    await p.goto(base2 + "index.html", { waitUntil: "load" });
    await p.waitForTimeout(3000);
    const aktiv = await p.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.waiting)); });
    t("ha telepítéskor az app nem jön le, a service worker nem települ", !aktiv, "aktív=" + aktiv);
    mod = "ok";
    await p.goto(base2 + "index.html", { waitUntil: "load" });
    t("a következő indulás már telepít", await swKesz(p));
    await p.waitForTimeout(1500);
    const tarolok = await p.evaluate(() => caches.keys());
    t("aktiváláskor a saját régi tárolónk törlődik, a más projekté megmarad",
      tarolok.includes("masik-projekt") && !tarolok.includes("oemap-v1") && tarolok.some(k => /^oemap-v\d+$/.test(k)),
      tarolok.join(", "));
  } finally {
    await ctx3.close();
    await new Promise(r => srv2.close(r));
    fs.rmSync(profile2, { recursive: true, force: true });
    fs.rmSync(profile3, { recursive: true, force: true });
  }
  console.log(t.title);
  process.exitCode = t.report() ? 1 : 0;
})();

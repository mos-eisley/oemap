/* PWA: telepíthetőség és offline működés. Az épületben gyenge a térerő, és a
   teremkereső pont akkor kell, amikor a hallgató már bent van — ezért az
   offline indulás nem kényelmi extra, hanem az alapkövetelmény. */
const { chromium, } = require("playwright");
const { chromePath, serve, harness, PHONE } = require("./lib");
const fs = require("fs"), os = require("os"), path = require("path");

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
    const sw = await p.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      if (!r) return null;
      await navigator.serviceWorker.ready;
      return { active: !!r.active, state: r.active && r.active.state };
    });
    t("a service worker aktív", sw && sw.active && sw.state === "activated", JSON.stringify(sw));

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

    // Az igazi próba: hálózat nélkül is elindul-e.
    await ctx.setOffline(true);
    let ok = false, title = "", fonts = 0, adat = false;
    try {
      await p.goto(srv.url + "index.html", { waitUntil: "load", timeout: 15000 });
      title = await p.title();
      ok = await p.evaluate(() => document.querySelectorAll(".floor").length > 0
                                && !!document.querySelector(".floor svg"));
      if (ok) fonts = await p.evaluate(() => [...document.fonts].filter(f => f.status === "loaded").length);
      if (ok) adat = await p.evaluate(async () => {
        try { return !!(await (await fetch("data/termek.json")).json()).het1; } catch (e) { return false; } });
    } catch (e) { title = "hiba: " + e.message.split("\n")[0]; }
    await ctx.setOffline(false);

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
  console.log(t.title);
  process.exitCode = t.report() ? 1 : 0;
})();

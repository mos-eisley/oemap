/* A térképes épületválasztó: Magyarország → település → épület, az
   alapértelmezett épület és a „Hol vagyok?”. A választó NEM felugró ablak:
   a térkép az alaprajz helyén áll, a lista a panelben (telefonon az alsó
   lapon). Amit őriz:

   - a helyadat (data/helyek.json) épsége: minden címmel bíró épületnek van
     helye, és az a saját települése határán belül áll — egy rossz geokódolás
     (másik városba tett cím) így nem csúszhat át;
   - a térkép földrajza a KIRAJZOLT képen: az óbudai csoport a Duna budai,
     a többi budapesti a pesti oldalán; ez a vetületet és az adatot együtt méri;
   - az alapértelmezett épület induláskor megnyílik, a házikó visszavisz rá, és
     semmi nem írja felül, amit a hallgató kért (link, QR, totem); letiltott
     tárolóval és offline is elindul az app;
   - a „Hol vagyok?” a legközelebbi épületet ajánlja, a megtagadott engedélyt és
     a távoli helyet kimondja;
   - a címkék helye a térkép TÉNYLEGES méretéből jön: telefonon, fekvő
     telefonon és alacsony asztali ablakban sem fedik egymást és más jelét;
   - amit a hallgató az alapértelmezett betöltése KÖZBEN választ (terem, másik
     épület, a választó), az erősebb a csendes betöltésnél;
   - helyadat nélkül ugyanez a sorrend listákkal megy;
   - a fókusz: nyitáskor a címre, zárva nincs tab-állomás, nyitva a rejtett
     alaprajzon sincs, záráskor vissza, és újrarajzoláskor (GPS-eredmény,
     töltés, házikó) sem esik a <body>-ra;
   - egy soha le nem záruló letöltés nem bénítja meg a választót, egy elakadt
     linkes váltás újrapróbálva is odavisz, ahová a link mutat;
   - az OSM-forrásmegjelölés (ODbL) a felületen áll, nem csak az adatban. */
const { run, open, PHONE, DESKTOP, ROOT } = require("./lib");
const fs = require("fs"), path = require("path");

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "epuletek.json"), "utf8")).epuletek;
const hely = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "helyek.json"), "utf8"));
const bent = (P, x, y) => { let b = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
  const a = P[j], c = P[i]; if ((a[1] > y) !== (c[1] > y) && x < (c[0] - a[0]) * (y - a[1]) / (c[1] - a[1]) + a[0]) b = !b; } return b; };

const nyitva = pg => pg.evaluate(() => epvNyitva());
// két szög eltérése fokban (a −47,85° és a 312,15° ugyanaz az irány)
const szogEl = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
/* A kamera repülése (és az átadás utáni lazulás) végét várja: a címkék a
   nyugvó képen mérhetők. */
const nyugodt = pg => pg.waitForFunction(() => !JEL.fly && !JEL.lazit, null, { timeout: 6000 }).catch(() => {});
/* Telefonon a lista az alsó lapon van: a lap állása dönti el, mi látszik
   belőle (a sorokhoz fölhúzzuk, ahogy a hallgató tenné; a térképhez le). */
const lap = (pg, n) => pg.evaluate(n => { if (MOB()) setSnap(n); }, n).then(() => pg.waitForTimeout(80));
async function nyit(pg) { await pg.click("#epvBtn"); await pg.waitForTimeout(150); await nyugodt(pg); }
const ep = pg => pg.evaluate(() => epItt());
const varEp = (pg, k, ms) => pg.waitForFunction(k => epItt() === k && !epvTolt, k, { timeout: ms || 15000 }).then(() => true, () => false);
const alapTar = pg => pg.evaluate(() => { try { return localStorage.getItem("oemap-alap"); } catch (e) { return "tiltva"; } });
/* Látszik-e a felirat (toast), vagy takarja valami (a modális választó)? A
   felirat nem kap kattintást (pointer-events:none), így az elementFromPoint
   sosem találná meg: a mérés idejére visszakapcsoljuk — a találat sorrendje a
   rajzolásé, ebből látszik, mi van felül. */
const felulVan = () => { const el = document.getElementById("toast"); if (!el || !el.classList.contains("on")) return "nincs";
  el.style.pointerEvents = "auto";
  const r = el.getBoundingClientRect(), x = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  el.style.pointerEvents = "";
  return x && (x === el || el.contains(x)) ? "látszik" : "takarja: " + (x && x.className); };
async function kartya(pg, kod) {
  await nyit(pg); await lap(pg, "full");
  await pg.click(`#epvlist [data-epv="tel:${await pg.evaluate(k => epvTel(EPULETEK.epuletek[k]), kod)}"]`); await pg.waitForTimeout(100);
  await pg.click(`#epvlist [data-epv="kartya:${kod}"]`); await pg.waitForTimeout(150);
}

run("térképes választó", async ({ t, ctx, browser, base }) => {
  /* ---- az adat ---- */
  const cimes = Object.values(reg).filter(e => e.cim);
  t("minden címmel bíró épületnek van helye", cimes.every(e => hely.epuletek[e.kod]),
    cimes.filter(e => !hely.epuletek[e.kod]).map(e => e.kod).join(", "));
  const telKulcs = e => Object.keys(hely.terkep).find(k => k !== "orszag" && hely.terkep[k].nev === e.telephely.replace(/\s*\d{4}$/, ""));
  const kint = cimes.filter(e => { const h = hely.epuletek[e.kod], k = telKulcs(e);
    return !h || !k || !hely.terkep[k].hatar.some(g => bent(g, h.lon, h.lat)); });
  t("és mindegyik a saját települése határán belül áll", !kint.length, kint.map(e => e.kod).join(", "));
  t("és az ország határán belül", cimes.every(e => hely.terkep.orszag.hatar.some(g => bent(g, hely.epuletek[e.kod].lon, hely.epuletek[e.kod].lat))));
  t("a forrás (ODbL) ki van írva az adatban", /OpenStreetMap/.test(hely.forras || ""), hely.forras);

  /* ---- a térkép földrajza, a kirajzolt képen ---- */
  const p = await open(ctx, base, { settle: 600 });
  await p.waitForFunction(() => typeof HELYEK !== "undefined" && HELYEK && EPULETEK, null, { timeout: 10000 });
  await nyit(p);
  const orszag = await p.evaluate(() => [...document.querySelectorAll("#epvScene .jTel")].map(b => b.dataset.epv));
  t.eq("Magyarország térképén a három település jele", orszag.sort(), ["tel:Budapest", "tel:Nagymaros", "tel:Székesfehérvár"]);
  const helyNelkul = await p.evaluate(() => (document.querySelector('#epvlist .epvsor[data-epv="tel:"]') || {}).textContent || "");
  // az UV egyik helyszínrajzon sincs rajta: a felirat mindegyikükre igaz legyen
  // (korábban „a nyilvántartásban nincs címük” — igaz, de hivatali; a hallgatónak az számít, hogy a térképen nincsenek rajta)
  t("a hely nélküli épületek csoportja azt mondja, ami mindegyikre igaz (a térképen nem szerepelnek)", /térképen még nem szerepelnek/.test(helyNelkul), helyNelkul);
  await p.click('#epvScene .jTel[data-epv="tel:Budapest"]'); await p.waitForTimeout(150); await nyugodt(p);
  /* A csoport jele a saját pontján ül (a chip ettől elmozdulhat, lásd
     jelCimkek), ezért a földrajzot a PONTON mérjük, nem a chipen. */
  const part = await p.evaluate(() => {
    const h = document.getElementById("epvScene"), H = h.getBoundingClientRect();
    const d = [...h.querySelectorAll("path.jViz")], pont = [];
    for (const u of d) { const L = u.getTotalLength(), m = u.getScreenCTM();
      for (let i = 0; i <= 200; i++) { const q = u.getPointAtLength(L * i / 200).matrixTransform(m); pont.push([q.x, q.y]); } }
    return [...h.querySelectorAll(".jTel.csop")].map(b => {
      const x = H.left + parseFloat(b.style.left), y = H.top + parseFloat(b.style.top);
      const f = pont.reduce((a, q) => Math.abs(q[1] - y) < Math.abs(a[1] - y) ? q : a);
      return { nev: b.textContent.trim(), oldal: x < f[0] ? "Buda" : "Pest" };
    });
  });
  // rendezve: a jelek sorrendje a mélységtől függ, az állítás nem arról szól
  const oldal = Object.fromEntries(part.map(x => [x.nev.replace(/\s+\d+$/, ""), x.oldal])
    .sort((a, b) => a[0].localeCompare(b[0], "hu")));
  t.eq("Budapesten kerületenként egy jel: az óbudai Budán, a többi Pesten", oldal,
    { "III. kerület": "Buda", "VI. kerület": "Pest", "VIII. kerület": "Pest", "XIV. kerület": "Pest" });
  /* A tájékozódást a folyó adja: a városi léptéken a település saját, részletes
     Duna-szakasza fut (az országos, durvább vonal nem, mert a kettő egymásra
     rajzolva kereszteződő szalagoknak látszott). */
  const viz = await p.evaluate(() => {
    const h = document.getElementById("epvScene");
    const d = [...h.querySelectorAll("path.jViz")], H = h.getBoundingClientRect();
    let bent = 0;
    for (const u of d) { const L = u.getTotalLength(), m = u.getScreenCTM();
      for (let i = 0; i <= 100; i++) { const q = u.getPointAtLength(L * i / 100).matrixTransform(m);
        if (q.x >= H.left && q.x <= H.right && q.y >= H.top && q.y <= H.bottom) bent++; } }
    return { db: d.length, bent, szel: d.length ? parseFloat(getComputedStyle(d[0]).strokeWidth) : 0 };
  });
  t("Budapest fölött a Duna a képen fut, a nagyításhoz mért szélességgel",
    viz.db === 3 && viz.bent > 20 && viz.szel > 6 && viz.szel <= 44, JSON.stringify(viz));
  const forras = await p.evaluate(() => { const f = document.querySelector("#terkepInfo .epvforras"), a = f && f.querySelector("a");
    return { szoveg: f ? f.textContent : "", href: a ? a.getAttribute("href") : "" }; });
  t("a felületen ott a forrásmegjelölés: OpenStreetMap, ODbL, a szerzői jogi oldalra mutatva",
    /OpenStreetMap/.test(forras.szoveg) && /ODbL/.test(forras.szoveg) && forras.href === "https://www.openstreetmap.org/copyright", JSON.stringify(forras));
  // a jel a csoportot választja: a lista a csoport épületeire szűkül
  await p.click('#epvScene .jTel.csop[data-epv="csop:KB"]'); await p.waitForTimeout(150); await nyugodt(p);
  const csop = await p.evaluate(() => ({ sorok: [...document.querySelectorAll("#epvlist .epvrow")].map(b => b.dataset.ep).sort().join(),
    fokusz: document.activeElement && document.activeElement.id }));
  t("a III. kerület jele a hét óbudai épületet listázza, és a lista címére visz",
    csop.sorok === "KB,KD,OA,OB,OC,OD,OM" && csop.fokusz === "epvCsopCim", JSON.stringify(csop));
  // a megnyitható épület sora rögtön nyit (ahogy kérték: „ha az épületre kattintunk, jöhet a térkép”)
  await p.click('#epvlist .epvrow[data-ep="OD"]');
  t("a megnyitható épület sora rögtön az alaprajzát nyitja", await varEp(p, "OD"));
  t("és a választó bezárul", !(await nyitva(p)));
  /* A térkép nem ugrik el: az épület fölé repül, és ott tűnik át az
     alaprajzba — a réteg a végén eltűnik, az alaprajz látszik. */
  await p.waitForFunction(() => !document.getElementById("app").classList.contains("terkeplat"), null, { timeout: 4000 }).catch(() => {});
  const vegen = await p.evaluate(() => ({ lat: document.getElementById("app").classList.contains("terkeplat"),
    stage: getComputedStyle(document.getElementById("stage")).visibility, rot: JEL.rot, dol: JEL.dolX }));
  t("a térkép az épület fölé repülve (az alaprajz állására fordulva, felülnézetben) adja át a képet az alaprajznak",
    !vegen.lat && vegen.stage === "visible" && vegen.dol === 0 && szogEl(vegen.rot, hely.epuletek.OD.terv.r) < 0.5, JSON.stringify(vegen));
  await p.close();

  /* ---- egy ablak: az épületből kifelé a térkép, a térképről befelé az épület ----
     Élesben a felugró választót „borzalmasnak” találták: a kérés egy homogén
     ablak volt, a térképtől az épület vázáig. Kifelé nagyítva az alaprajz
     helyén a térkép jön — az átadás pillanatában UGYANOTT, ugyanakkorán,
     ugyanúgy elfordulva (a helyek.json `terv` illesztése) —, a házra
     nagyítva pedig az épület. */
  const pe = await open(ctx, base, { settle: 600 });
  await pe.waitForFunction(() => typeof HELYEK !== "undefined" && HELYEK && EPULETEK, null, { timeout: 10000 });
  /* Az átadás pillanata, a kirajzolt képen: az alaprajz (a földszint
     helyiségei) és a térkép OA-tömbjének befoglalója. A repülést megállítjuk,
     hogy az ELSŐ képkocka legyen mérhető. */
  const atadas = await pe.evaluate(async () => {
    const kepkocka = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const bb = els => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
      for (const e of els) { const r = e.getBoundingClientRect(); if (!r.width) continue;
        a = Math.min(a, r.left); b = Math.min(b, r.top); c = Math.max(c, r.right); d = Math.max(d, r.bottom); }
      return { x: (a + c) / 2, y: (b + d) / 2, w: c - a, h: d - b }; };
    S.view = { k: S.view.k * 0.62, x: S.view.x * 0.62, y: S.view.y * 0.62 }; setWorldInstant(); await kepkocka();
    const terv = bb(document.querySelectorAll("#world .floor.on .room"));
    epvKifele(); JEL.fly = null; JEL.lazit = null; jelFrissit();
    const ter = bb(document.querySelectorAll("#epvScene g.jHaz.most .tet"));
    return { terv, ter, rot: JEL.rot, dol: JEL.dolX, r: HELYEK.epuletek.OA.terv.r };
  });
  const elt = Math.hypot(atadas.terv.x - atadas.ter.x, atadas.terv.y - atadas.ter.y) / Math.hypot(atadas.terv.w, atadas.terv.h);
  const ar = [atadas.ter.w / atadas.terv.w, atadas.ter.h / atadas.terv.h];
  t("az átadás pillanatában a térkép háza az alaprajz helyén áll (a közép az átló 4%-án belül, a méret ±10%)",
    elt < 0.04 && ar.every(x => x > 0.9 && x < 1.1), JSON.stringify({ elt: +elt.toFixed(3), ar: ar.map(x => +x.toFixed(3)), ...atadas }));
  t("ugyanúgy elfordulva (a tervlap állása + az illesztés szöge), felülnézetben", szogEl(atadas.rot, atadas.r) < 0.5 && atadas.dol === 0,
    `${atadas.rot} vs ${atadas.r}, dőlés ${atadas.dol}`);
  await pe.close();

  // ugyanez valódi mozdulattal: kifelé görgetve az alaprajzból
  const pg2 = await open(ctx, base, { settle: 600 });
  await pg2.waitForFunction(() => typeof HELYEK !== "undefined" && HELYEK && EPULETEK, null, { timeout: 10000 });
  const sk = await pg2.evaluate(() => { const r = document.getElementById("stage").getBoundingClientRect(); return [r.x + r.width * 0.62, r.y + r.height / 2]; });
  await pg2.mouse.move(sk[0], sk[1]);
  for (let i = 0; i < 12 && !(await nyitva(pg2)); i++) { await pg2.mouse.wheel(0, 120); await pg2.waitForTimeout(70); }
  const ki = await pg2.evaluate(() => ({ nyitva: epvNyitva(), lat: document.getElementById("app").classList.contains("terkeplat"),
    tel: EPV.tel, csop: EPV.csop, sorok: [...document.querySelectorAll("#epvlist .epvrow")].map(b => b.dataset.ep).sort().join(),
    k: S.view.k / S.kFit, fokusz: document.activeElement && document.activeElement.id }));
  t("kifelé görgetve az alaprajz az illesztett méret 0,6-áig megy, utána a térkép veszi át",
    ki.nyitva && ki.lat && ki.k >= 0.6 && ki.k < 0.75, JSON.stringify(ki));
  t("és a lista az épület telephelyét mutatja (a III. kerület hét épülete)", ki.tel === "Budapest" && ki.sorok === "KB,KD,OA,OB,OC,OD,OM", JSON.stringify(ki));
  t("a mozdulat nem viszi el a fókuszt a panel címére (a kéz a térképen van)", ki.fokusz !== "epvCim", ki.fokusz);
  await nyugodt(pg2);
  const allo = await pg2.evaluate(() => ({ rot: JEL.rot, dol: JEL.dolX, mpp: 1 / JEL.k,
    alaprajz: getComputedStyle(document.getElementById("stage")).visibility, sin: getComputedStyle(document.getElementById("rail")).visibility }));
  t("a térkép utána északra fordul, a dőlést a nagyításra bízza, és az alaprajz meg a szintsín rejtve van",
    Math.abs(allo.rot) < 0.01 && allo.dol === null && allo.alaprajz === "hidden" && allo.sin === "hidden", JSON.stringify(allo));
  // befelé: az OC tömbje fölött görgetve belép az OC-ba
  for (let i = 0; i < 30 && (await pg2.evaluate(() => epItt() !== "OC" && !epvTolt)); i++) {
    const oc = await pg2.evaluate(() => { const tv = epvTerv("OC"), h = document.getElementById("epvScene").getBoundingClientRect();
      const q = jelKam().p(tv.w[0], tv.w[1], 0); return [h.left + q[0], h.top + q[1]]; });
    await pg2.mouse.move(oc[0], oc[1]); await pg2.mouse.wheel(0, -120); await pg2.waitForTimeout(60);
  }
  t("a térképen egy megnyitható házra nagyítva belép az épületbe", await varEp(pg2, "OC"), await ep(pg2));
  t("és a térkép bezárul", !(await nyitva(pg2)));
  // Esc a térképről: vissza az épületbe, áttűnéssel
  await pg2.click("#epvBtn"); await pg2.waitForTimeout(100);
  await pg2.keyboard.press("Escape");
  const esc1 = await nyitva(pg2);
  await pg2.waitForFunction(() => !document.getElementById("app").classList.contains("terkeplat"), null, { timeout: 4000 }).catch(() => {});
  const esc2 = await pg2.evaluate(() => ({ lat: document.getElementById("app").classList.contains("terkeplat"), ep: epItt(),
    alaprajz: getComputedStyle(document.getElementById("stage")).visibility }));
  t("az Esc a térképről visszavisz az épületbe (a panel azonnal, a kép áttűnve)", !esc1 && !esc2.lat && esc2.ep === "OC" && esc2.alaprajz === "visible",
    JSON.stringify({ esc1, ...esc2 }));
  t("nincs JS hiba az átmeneteken", !pg2.jsErrors.length, pg2.jsErrors.join(" | "));
  await pg2.close();

  /* ---- a címkék a térkép tényleges méretén (mind a négy térképen) ----
     A címke helyét a kód választja ki (jobbra, balra, fölé, alá), a térkép
     képpontszélességéből. Egy állandó becslés alacsony asztali ablakban, ahol
     a magasság köti a térképet, a felére tévedett, és a címkék egymásra meg a
     szomszéd jelére estek. Mindhárom térképen, a kirajzolt képen mérjük. */
  /* A címke helyét a kód a kirajzolt képen méri ki (négy oldal, növekvő
     távolság). Egy állandó becslés alacsony asztali ablakban a felére
     tévedett, és a címkék egymásra meg a szomszéd jelére estek. A jelet most
     a chip `left/top`-ja adja: a pont ott marad, a chip elmozdulhat. */
  /* A térkép az egész térképdobozt kitölti, de a panel (asztalon) és az alsó
     lap (telefonon) takar belőle: a címkének a SZABAD részen kell maradnia. */
  const cimkeHiba = pg => pg.evaluate(() => {
    const m = document.getElementById("epvScene"); if (!m || !m.querySelector("svg")) return ["nincs jelenet"];
    const H = m.getBoundingClientRect(), h = [];
    const R = { left: H.left + JEL.sz.l, right: H.right - JEL.sz.r, top: H.top + JEL.sz.t, bottom: H.bottom - JEL.sz.b };
    const fed = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const ps = [...m.querySelectorAll(".jTel,.jNev")].map(b => ({ n: b.textContent.trim(),
      s: b.getBoundingClientRect(),
      p: { x: H.left + parseFloat(b.style.left), y: H.top + parseFloat(b.style.top) } }));
    for (const a of ps) {
      if (a.s.left < R.left - 1 || a.s.right > R.right + 1 || a.s.top < R.top - 1 || a.s.bottom > R.bottom + 1) h.push(a.n + " kilóg");
      for (const b of ps) {
        if (b.p.x > a.s.left - 5 && b.p.x < a.s.right + 5 && b.p.y > a.s.top - 5 && b.p.y < a.s.bottom + 5) h.push(a.n + " takarja: " + b.n + " jelét");
        if (a !== b && a.n < b.n && fed(a.s, b.s)) h.push(a.n + " × " + b.n);
      }
    }
    return h;
  });
  const MERETEK = [["telefon (390)", PHONE], ["keskeny telefon (360)", { ...PHONE, viewport: { width: 360, height: 740 } }],
    ["fekvő telefon (844×390)", { ...PHONE, viewport: { width: 844, height: 390 } }], ["asztal (1280×860)", DESKTOP],
    ["alacsony asztali ablak (1280×590)", { viewport: { width: 1280, height: 590 } }],
    ["kis asztali ablak (1100×560)", { viewport: { width: 1100, height: 560 } }]];
  for (const [nev, opt] of MERETEK) {
    const c = await browser.newContext(opt);
    const g = await open(c, base, { settle: 300 });
    await g.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
    await nyit(g);
    const h = [];
    let hol = null;
    for (const tel of [null, "Budapest", "Székesfehérvár", "Nagymaros"]) {
      if (tel) { await lap(g, "full"); await g.click(`#epvlist .epvsor[data-epv="tel:${tel}"]`); await g.waitForTimeout(150); await lap(g, "mid"); }
      await nyugodt(g); await g.waitForTimeout(120);
      h.push(...(await cimkeHiba(g)).map(x => (tel || "ország") + ": " + x));
      if (tel === "Budapest") hol = await g.evaluate(() => { const a = document.getElementById("epvScene").getBoundingClientRect(),
        b = document.getElementById("mapwrap").getBoundingClientRect();
        return { jelenet: [a.x, a.y, a.width, a.height].map(Math.round), terkep: [b.x, b.y, b.width, b.height].map(Math.round),
          dialog: !!document.querySelector("dialog[open]") }; });
      if (tel) { await lap(g, "full"); await g.click('#epvlist [data-epv="vissza"]'); await g.waitForTimeout(150); await lap(g, "mid"); await nyugodt(g); }
    }
    t(`${nev}: a címkék nem fedik egymást és más jelét, és a térkép szabad részén belül maradnak`, !h.length, h.join("; "));
    /* Élesben „borzalmasnak” találták a felugró dobozt: a térkép ugyanott áll,
       ahol az alaprajz, ugyanakkorán, és nincs nyitott ablak. */
    t(`${nev}: a térkép az alaprajz helyén áll (nem felugró ablak)`, hol && !hol.dialog && hol.jelenet.join() === hol.terkep.join(), JSON.stringify(hol));
    await c.close();
  }

  /* ---- alapértelmezett épület ---- */
  const cA = await browser.newContext(PHONE);
  let q = await open(cA, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  t("alapból az OA az alapértelmezett, a házikó nem látszik", (await q.evaluate(() => alapEpulet())) === "OA"
    && await q.evaluate(() => document.getElementById("epvHaza").hidden));
  await kartya(q, "OD");
  await q.click('#epvlist [data-epv="alap:OD"]'); await q.waitForTimeout(200);
  t("a csillaggal az OD lesz az alapértelmezett, a tárolóban is", (await alapTar(q)) === "OD"
    && await q.evaluate(() => document.querySelector('#epvlist [data-epv="alap:OD"]').getAttribute("aria-pressed") === "true"));
  t("és a házikó megjelenik (most az OA van nyitva)", await q.evaluate(() => !document.getElementById("epvHaza").hidden
    && /OD/.test(document.getElementById("epvHaza").textContent)));
  // a fejléc alcímét telefonon rejtő szabály (.brand span) korábban a házikó feliratát is elrejtette
  t("telefonon is látszik, melyik épületre visz (a felirata nem rejtett)", await q.evaluate(() => {
    const s = document.querySelector("#epvHaza span"); return getComputedStyle(s).display !== "none" && s.getBoundingClientRect().width > 0; }));
  await q.click('#epvlist [data-epv="zar"]'); await q.waitForTimeout(150);
  await q.click("#epvHaza");
  t("a házikó az alapértelmezettre visz", await varEp(q, "OD"));
  t("ott a házikó eltűnik", await q.evaluate(() => document.getElementById("epvHaza").hidden));
  await q.close();
  // újraindítva az alapértelmezett nyílik meg
  q = await open(cA, base, { settle: 300 });
  t("induláskor az alapértelmezett épület nyílik meg", await varEp(q, "OD"));
  t("a fejléc is azt mondja", /OD/.test(await q.evaluate(() => document.getElementById("epvNev").textContent)));
  t("nincs JS hiba az alapértelmezett útján", q.jsErrors.length === 0, q.jsErrors.join(" | "));
  await q.close();
  // amit a hallgató kért, az előbbre való: link, totem
  q = await open(cA, base + "#OA10E18", { settle: 2500 });
  t("egy link (QR) az alapértelmezett elé kerül: az OA terme nyílik", (await ep(q)) === "OA"
    && (await q.evaluate(() => S.sel)) === "OA10E18", `${await ep(q)} ${await q.evaluate(() => S.sel)}`);
  await q.close();
  q = await open(cA, base.replace("index.html", "index.html?totem") + "#from=OA00FK1", { settle: 2500 });
  t("a totem a saját helyén marad, és nem kínál házikót", (await ep(q)) === "OA"
    && await q.evaluate(() => document.getElementById("epvHaza").hidden));
  await q.close();
  // a fenti totemnél a cím (#from) magában is megállítaná: cím nélkül is a totem dönt, nem a készülék
  q = await open(cA, base.replace("index.html", "index.html?totem"), { settle: 2500 });
  t("a totem cím nélkül sem nyitja meg a készülék alapértelmezettjét", (await ep(q)) === "OA", await ep(q));
  await q.close();
  q = await open(cA, base.replace("index.html", "index.html?parosit"), { settle: 2500 });
  t("a párosító mód (az OA termeinek Neptun-neve) sem", (await ep(q)) === "OA", await ep(q));
  await q.close();
  // visszavonás: újra csillag → az OA az alapértelmezett, a tároló üres
  q = await open(cA, base, { settle: 300 }); await varEp(q, "OD");
  await kartya(q, "OD");
  await q.click('#epvlist [data-epv="alap:OD"]'); await q.waitForTimeout(200);
  t("a csillag újra megnyomva visszavonja (az OA lesz)", (await alapTar(q)) === null && (await q.evaluate(() => alapEpulet())) === "OA");
  await q.close();
  // offline az alapértelmezett adata nem jön le: marad az OA, a választó nem ugrik fel
  await cA.route("**/data/epuletek/kt.json", r => r.abort());
  await cA.addInitScript(() => { try { localStorage.setItem("oemap-alap", "KT"); } catch (e) {} });
  q = await open(cA, base, { settle: 2500 });
  t("ha az alapértelmezett nem tölthető le, marad az OA, és nem nyílik rá a választó",
    (await ep(q)) === "OA" && !(await nyitva(q)), `${await ep(q)} ${await nyitva(q)}`);
  // az elvágott kérés a konzolon „Failed to load resource”: az a szándékos hiba, nem a kódé
  const valodi = l => l.filter(e => !/Failed to load resource/.test(e));
  t("nincs JS hiba az offline alapértelmezett útján", !valodi(q.jsErrors).length, valodi(q.jsErrors).join(" | "));
  await q.close(); await cA.close();

  /* ---- amit a hallgató az alapértelmezett betöltése közben választ ----
     A csendes betöltés lassú hálózaton másodpercekig tart. Ami közben jön (egy
     terem, egy másik épület, a nyitott választó), az a hallgató döntése: a
     betöltés vége nem írhatja felül, és nem nyelheti el. */
  const cR = await browser.newContext({ ...PHONE, serviceWorkers: "block" });
  await cR.addInitScript(() => { try { localStorage.setItem("oemap-alap", "OD"); } catch (e) {} });
  await cR.route("**/data/epuletek/od.json", r => setTimeout(() => r.continue().catch(() => {}), 3000));
  const tolt = async () => { const g = await open(cR, base, { settle: false });
    await g.waitForFunction(() => typeof epvTolt !== "undefined" && epvTolt === "OD", null, { timeout: 10000 }); return g; };
  /* A késleltetett válasz megérkezését várjuk meg, nem egy rögzített időt:
     ha a lassú gépen a 3 s-os válasz még nem jött meg, az állítás a betöltés
     VÉGE nélkül, üresen lett volna igaz. */
  const lefutott = g => g.waitForFunction(() => epvKeres === null, null, { timeout: 15000 }).then(() => true, () => false);
  q = await tolt();
  await q.evaluate(() => select("OA10E18"));
  await q.waitForTimeout(4000);
  const terem = await q.evaluate(() => ({ ep: epItt(), sel: S.sel, hash: location.hash, tolt: epvTolt }));
  t("a betöltés közben választott terem marad, az app nem ugrik át az alapértelmezettre",
    terem.ep === "OA" && terem.sel === "OA10E18" && terem.hash === "#OA10E18" && terem.tolt === false, JSON.stringify(terem));
  await q.close();
  q = await tolt();
  await nyit(q); await lap(q, "full");
  await q.click('#epvlist .epvsor[data-epv="tel:Budapest"]'); await q.waitForTimeout(150);
  await q.click('#epvlist .epvrow[data-ep="OC"]');
  t("a betöltés közben választott másik épület nyílik meg (nem nyeli el a töltés)", await varEp(q, "OC", 8000), await ep(q));
  await q.waitForTimeout(3500);
  t("és a lassú alapértelmezett utána sem írja felül", (await ep(q)) === "OC", await ep(q));
  await q.close();
  q = await tolt();
  await nyit(q); await lap(q, "full");
  await q.click('#epvlist .epvsor[data-epv="tel:Budapest"]'); await q.waitForTimeout(150);
  const csendSor = await q.evaluate(() => { const r = document.querySelector('#epvlist .epvrow[data-ep="OD"]');
    return { busy: r.getAttribute("aria-busy"), szoveg: r.textContent }; });
  // a nyitott választó a csendes eredményt úgyis eldobja: töltőnek mutatva a hallgató hiába várna rá
  t("a csendes betöltést a választó nem mutatja „Betöltés…”-nek", !csendSor.busy && !/Betöltés/.test(csendSor.szoveg), JSON.stringify(csendSor));
  const vege1 = await lefutott(q); await q.waitForTimeout(200);
  t("a betöltés közben megnyitott választó nyitva marad, és nem vált alatta", vege1 && (await nyitva(q)) && (await ep(q)) === "OA",
    `lefutott=${vege1} ${await nyitva(q)} ${await ep(q)}`);
  await q.close();
  // ugyanarra az épületre mutató link a betöltés közben (beírt cím): a link érvényesül, nem dobódik el
  q = await tolt();
  await q.evaluate(() => { location.hash = "#OD10E05"; });
  t("az alapértelmezett betöltése közben érkező, ugyanarra az épületre mutató link érvényesül",
    (await varEp(q, "OD", 8000)) && (await q.evaluate(() => S.sel)) === "OD10E05", JSON.stringify(await q.evaluate(() => ({ ep: epItt(), sel: S.sel }))));
  await q.close();
  // a választó dobozában megnyomva a csendes betöltés kifejezett lesz: a gomb ezt mutatja is
  q = await tolt();
  await nyit(q);
  await q.click('#epvlist .epvdoboz [data-epv="nyit:OD"]'); await q.waitForTimeout(150);
  const dobozGomb = await q.evaluate(() => { const b = document.querySelector('#epvlist .epvdoboz [data-epv="nyit:OD"]');
    return b ? { szoveg: b.textContent, ad: b.getAttribute("aria-disabled") } : null; });
  t("az alapértelmezett doboz gombja megnyomva „Betöltés…”-t mutat", !!dobozGomb && /Betöltés/.test(dobozGomb.szoveg) && dobozGomb.ad === "true",
    JSON.stringify(dobozGomb));
  t("és utána megnyílik", await varEp(q, "OD", 8000));
  await q.close();
  // bármilyen valódi bevitel (itt görgetés a térképen) a hallgatóé: a betöltés vége nem rántja ki a keze alól
  q = await tolt();
  const kozep = await q.evaluate(() => { const r = document.getElementById("stage").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await q.mouse.move(kozep[0], kozep[1]); await q.mouse.wheel(0, -120);
  const vege2 = await lefutott(q); await q.waitForTimeout(200);
  t("ha a hallgató a betöltés közben a térképhez nyúl, az alaprajz marad (a házikó viszi át)",
    vege2 && (await ep(q)) === "OA" && await q.evaluate(() => !document.getElementById("epvHaza").hidden), `lefutott=${vege2} ${await ep(q)}`);
  await q.close();
  // a házikóval kért ugyanaz az épület: nem tölt újra, de már nem is csendes (a választó nem állítja meg)
  const kerdes = [];
  cR.on("request", r => { if (/od\.json/.test(r.url())) kerdes.push(r.url()); });
  q = await tolt();
  await q.click("#epvHaza");
  await q.click("#epvBtn").catch(() => {});
  t("a házikó a csendes betöltést kifejezetté teszi: a választó nyitása után is átvált", await varEp(q, "OD", 8000), await ep(q));
  t("és nem tölti le még egyszer", kerdes.length === 1, kerdes.length);
  t("nincs JS hiba a betöltés közbeni választásoknál", !valodi(q.jsErrors).length, valodi(q.jsErrors).join(" | "));
  await q.close(); await cR.close();

  // letiltott tároló (privát ablak, sütik tiltva): minden megy, csak nem emlékszik
  const cT = await browser.newContext(PHONE);
  await cT.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("SecurityError"); } }); });
  q = await open(cT, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK, null, { timeout: 10000 });
  await kartya(q, "OD");
  await q.click('#epvlist [data-epv="alap:OD"]'); await q.waitForTimeout(200);
  t("letiltott tárolóval is elindul, és a csillag sem dob hibát", q.jsErrors.length === 0 && (await ep(q)) === "OA", q.jsErrors.join(" | "));
  await q.close(); await cT.close();

  /* ---- Hol vagyok? ---- */
  const gps = async (geo, perm) => {
    const c = await browser.newContext({ ...PHONE, geolocation: geo, permissions: perm === false ? [] : ["geolocation"] });
    const g = await open(c, base, { settle: 600 });
    await g.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
    await nyit(g);
    await g.click('#epvlist [data-epv="gps"]');
    await g.waitForFunction(() => EPV.gps && EPV.gps.allapot !== "keres", null, { timeout: 10000 }).catch(() => {});
    const r = await g.evaluate(() => ({ szoveg: (document.querySelector("#epvlist .epvgpsok") || {}).textContent || "",
      gomb: (document.querySelector('#epvlist .epvgpsok .epvgomb') || {}).dataset || {} }));
    r.oldal = g; r.ctx = c; return r;
  };
  const odH = hely.epuletek.OD;
  /* Az OD körvonalán belül, a falaktól ~9 m-re (az OD helypontja 2,7 m-re
     van a faltól: ott az „5 m-en belül itt vagy” szabály elfedné, ha a
     körvonalon belüliség elromlana). */
  let G = await gps({ latitude: 47.533321, longitude: 19.033662, accuracy: 20 });
  t("az OD közepén állva az OD-t ajánlja, megnyitással", /OD épület/.test(G.szoveg) && G.gomb.epv === "nyit:OD", G.szoveg);
  t("és azt mondja, hogy benne vagy (a körvonalon belül, nem egy pont távolsága)", /itt vagy/.test(G.szoveg), G.szoveg);
  t("és kimondja, hogy épületen belül a QR-kód a pontos", /QR-kód/.test(G.szoveg));
  await G.oldal.click('#epvlist .epvgpsok .epvgomb');
  t("a javaslatból megnyílik", await varEp(G.oldal, "OD"));
  await G.ctx.close();
  G = await gps({ latitude: 47.532734, longitude: 19.033562, accuracy: 20 });   // az OD déli homlokzata előtt, ~37 m-re
  t("az épületen kívül a körvonaltól mért távolságot mondja (OD, kb. 35 m)", /OD épület · kb\. 35 m/.test(G.szoveg), G.szoveg);
  await G.ctx.close();
  G = await gps({ latitude: 47.53387, longitude: 19.03432, accuracy: 20 });   // az OA közepén, a falaktól ~12 m-re
  t("ha a javasolt épület már nyitva van, nem kínál megnyitást, hanem kimondja (és hogy benne vagy)",
    /ez van nyitva/.test(G.szoveg) && /itt vagy/.test(G.szoveg) && !G.gomb.epv, G.szoveg);
  await G.ctx.close();
  const yaH = hely.epuletek.YA;
  G = await gps({ latitude: yaH.lat, longitude: yaH.lon, accuracy: 30 });
  t("az Ybl A épületnél a YA-t ajánlja (adatlappal, mert nincs alaprajza), a YB-t mellette",
    /YA épület/.test(G.szoveg) && G.gomb.epv === "kartya:YA" && /YB/.test(G.szoveg), G.szoveg);
  await G.ctx.close();
  G = await gps({ latitude: 47.5316, longitude: 21.6273, accuracy: 30 });   // Debrecen
  t("messze minden épülettől kimondja, és km-ben adja a legközelebbit", /Egyik épületünk sincs a közelben/.test(G.szoveg) && /km/.test(G.szoveg), G.szoveg);
  await G.ctx.close();
  G = await gps({ latitude: odH.lat, longitude: odH.lon }, false);
  t("megtagadott engedélynél megmondja, hol engedélyezheti", /engedély/.test(G.szoveg), G.szoveg);
  t("nincs JS hiba a GPS útjain", G.oldal.jsErrors.length === 0, G.oldal.jsErrors.join(" | "));
  await G.ctx.close();

  /* ---- helyadat nélkül: ugyanaz a sorrend, listákkal ---- */
  const cN = await browser.newContext({ ...PHONE, serviceWorkers: "block" });
  await cN.route("**/data/helyek.json", r => r.fulfill({ status: 404, body: "" }));
  q = await open(cN, base, { settle: 800 });
  await q.click("#epvBtn"); await q.waitForTimeout(200);
  const nt = await q.evaluate(() => ({ terkep: document.getElementById("app").classList.contains("terkeplat") || !!document.querySelector("#epvScene svg"),
    alaprajz: getComputedStyle(document.getElementById("stage")).visibility, gps: !!document.querySelector('#epvlist [data-epv="gps"]'),
    tel: [...document.querySelectorAll('#epvlist .epvsor[data-epv^="tel:"]')].length, forras: !!document.querySelector("#terkepInfo .epvforras") }));
  t("helyadat nélkül nincs térkép (az alaprajz marad), GPS és OSM-forrás, de a települések ott vannak",
    !nt.terkep && nt.alaprajz === "visible" && !nt.gps && !nt.forras && nt.tel === 4, JSON.stringify(nt));
  await lap(q, "full");
  await q.click('#epvlist [data-epv="tel:Budapest"]'); await q.waitForTimeout(150);
  await q.click('#epvlist .epvrow[data-ep="OD"]');
  t("és listából is megnyílik az épület", await varEp(q, "OD"));
  t("nincs JS hiba helyadat nélkül", !valodi(q.jsErrors).length, valodi(q.jsErrors).join(" | "));
  await q.close(); await cN.close();

  /* ---- fókusz és tab-állomások ---- */
  const cF = await browser.newContext(DESKTOP);
  q = await open(cF, base, { settle: 800 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  const zartban = await q.evaluate(() => [...document.querySelectorAll("#epvlist button")].filter(b => b.offsetParent !== null).length);
  t("zárva a választóban nincs látható (tabbal elérhető) elem", zartban === 0, zartban);
  await q.focus("#epvBtn"); await q.keyboard.press("Enter"); await q.waitForTimeout(250);
  t("nyitáskor a fókusz a címre kerül", await q.evaluate(() => document.activeElement.id === "epvCim"));
  /* Nem modális: a Tab a fejlécre, a listára, a térkép címkéire és a
     nagyítógombokra jut — de a térkép alatt rejtett alaprajzra, a
     szintsínre és a kereső panelére nem (azok nincsenek kint). */
  const rossz = [];
  for (let i = 0; i < 70; i++) { await q.keyboard.press("Tab");
    const h = await q.evaluate(() => { const a = document.activeElement;
      return a.closest("#stage,#rail,.hud,#legBtn,#scroll,.search,#foot") ? (a.id || a.className || a.tagName) : ""; });
    if (h) rossz.push(h); }
  t("nyitva a Tab nem jut a rejtett alaprajzra, a szintsínre és a kereső panelére", !rossz.length, [...new Set(rossz)].join(", "));
  await q.focus("#epvCim"); await q.keyboard.press("Escape"); await q.waitForTimeout(200);
  t("záráskor (Esc) a fókusz visszakerül a gombra", await q.evaluate(() => document.activeElement.id === "epvBtn"));
  // újrarajzoláskor (töltés, GPS-eredmény) a lista görgetése marad: a Safari a gombot nem fókuszálja, a fókusz nem hozná vissza
  await nyit(q);
  await q.click('#epvlist .epvsor[data-epv="tel:Budapest"]'); await q.waitForTimeout(150);
  const gorgElotte = await q.evaluate(() => { const l = document.querySelector("#epvlist .epvlista"); l.scrollTop = 400; return l.scrollTop; });
  await q.evaluate(() => { document.activeElement.blur(); epvRender(); });
  const gorgUtana = await q.evaluate(() => document.querySelector("#epvlist .epvlista").scrollTop);
  t("ugyanazon a nézeten újrarajzolva a lista görgetése marad", gorgElotte > 100 && gorgUtana === gorgElotte, `${gorgElotte} → ${gorgUtana}`);
  await q.keyboard.press("Escape"); await q.waitForTimeout(150);
  // a térkép jele és a lista sora ugyanazt teszi: újrarajzoláskor a fókusz azon marad, amin állt
  await nyit(q);
  await q.focus('#epvlist .epvsor[data-epv="tel:Budapest"]');
  await q.evaluate(() => epvRender());
  t("újrarajzoláskor a fókusz a lista során marad, nem ugrik a térkép jelére",
    await q.evaluate(() => document.activeElement.classList.contains("epvsor") && document.activeElement.dataset.epv === "tel:Budapest"));
  await q.keyboard.press("Escape"); await q.waitForTimeout(150);
  await q.close(); await cF.close();

  // „Hol vagyok?” billentyűvel: a fókusz az eredményre megy, a második Enter nem zárja be
  const cG = await browser.newContext({ ...DESKTOP, geolocation: { latitude: odH.lat, longitude: odH.lon, accuracy: 20 }, permissions: ["geolocation"] });
  q = await open(cG, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await q.focus("#epvBtn"); await q.keyboard.press("Enter"); await q.waitForTimeout(200);
  await q.focus('#epvlist [data-epv="gps"]'); await q.keyboard.press("Enter");
  await q.waitForFunction(() => EPV.gps && EPV.gps.allapot === "kesz", null, { timeout: 10000 }).catch(() => {});
  await q.waitForTimeout(100);
  t("a „Hol vagyok?” után a fókusz az eredményen áll, nem a Bezáráson", await q.evaluate(() => document.activeElement.id === "epvGps"),
    await q.evaluate(() => document.activeElement.outerHTML.slice(0, 80)));
  await q.keyboard.press("Enter"); await q.waitForTimeout(150);
  t("és egy újabb Enter nem zárja be a választót", await nyitva(q));
  await q.close(); await cG.close();

  /* A térkép nem háttér (nincs ablak, ami mögött állna): az üres részére
     kattintva vagy rajta húzva nyitva marad, a fejléc gombja és a Bezárás zárja. */
  const cB = await browser.newContext(DESKTOP);
  q = await open(cB, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await nyit(q);
  const ures = await q.evaluate(() => { const r = document.getElementById("epvScene").getBoundingClientRect(); return [r.right - 90, r.top + 30]; });
  await q.mouse.click(ures[0], ures[1]); await q.waitForTimeout(200);
  await q.mouse.move(ures[0], ures[1] + 40); await q.mouse.down(); await q.mouse.move(ures[0] - 200, ures[1] + 120, { steps: 6 }); await q.mouse.up();
  await q.waitForTimeout(200);
  t("a térkép üres részére kattintva és rajta húzva nyitva marad", await nyitva(q));
  await q.click("#epvBtn"); await q.waitForTimeout(150);
  t("a fejléc gombja bezárja", !(await nyitva(q)));
  await q.close(); await cB.close();

  // átméretezett ablakban a címkék helye újramérődik (a térkép mérete a CSS-ből változik)
  const cW = await browser.newContext(DESKTOP);
  q = await open(cW, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await nyit(q);
  await q.click('#epvScene .jTel[data-epv="tel:Budapest"]'); await q.waitForTimeout(150); await nyugodt(q);
  await q.setViewportSize({ width: 1100, height: 560 }); await q.waitForTimeout(500);
  await nyugodt(q);
  const atmer = await cimkeHiba(q);
  t("átméretezés után is: a címkék nem fedik egymást és más jelét", !atmer.length, atmer.join("; "));
  await q.close(); await cW.close();

  /* A biztonsági sávok (iPhone: kivágás, kezdősáv): a forrásmegjelölés nem
     kerülhet a kezdősáv alá, a fejléc mögé vagy az alsó lap alá. A Chromium
     magától nem ad biztonsági sávot: CDP-vel adjuk meg. */
  for (const [nev, vp, sav] of [["álló telefon", { width: 390, height: 844 }, { top: 47, bottom: 34, left: 0, right: 0 }],
    ["fekvő telefon", { width: 844, height: 390 }, { top: 0, bottom: 21, left: 47, right: 47 }]]) {
    const cS = await browser.newContext({ ...PHONE, viewport: vp });
    q = await open(cS, base, { settle: 600 });
    const cdp = await cS.newCDPSession(q);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: sav });
    await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
    await nyit(q);
    const savos = await q.evaluate(sav => { const f = document.querySelector("#terkepInfo .epvforras").getBoundingClientRect();
      const fej = document.querySelector(".head").getBoundingClientRect(), lapTeteje = document.getElementById("side").getBoundingClientRect().top;
      return { forras: [Math.round(f.left), Math.round(f.top), Math.round(f.right), Math.round(f.bottom)], hatar: innerHeight - sav.bottom,
        fejAlja: Math.round(fej.bottom), lapTeteje: Math.round(lapTeteje), bal: sav.left, jobb: innerWidth - sav.right }; }, sav);
    const [fl, ft, fr, fb] = savos.forras;
    t(`${nev}, biztonsági sávokkal: a forrás a képen, a fejléc alatt, a lap és a kezdősáv fölött, a kivágáson kívül`,
      ft >= savos.fejAlja && fb <= Math.min(savos.hatar, savos.lapTeteje) + 1 && fl >= savos.bal && fr <= savos.jobb, JSON.stringify(savos));
    await q.close(); await cS.close();
  }

  // ha a választót nyitó gomb azóta rejtve van (a házikó: sikertelen váltás, majd sikeres újrapróbálás), a fókusz a választó gombjára kerül
  const cR2 = await browser.newContext({ ...DESKTOP, serviceWorkers: "block" });
  await cR2.addInitScript(() => { try { localStorage.setItem("oemap-alap", "OD"); } catch (e) {} });
  let odElso = true;
  await cR2.route("**/data/epuletek/od.json", r => { if (odElso) { odElso = false; r.abort(); } else r.continue(); });
  q = await open(cR2, base + "#OA10E18", { settle: 1200 });
  await q.focus("#epvHaza"); await q.keyboard.press("Enter");
  await q.waitForFunction(() => epvNyitva(), null, { timeout: 10000 }).catch(() => {});
  await q.focus('#epvlist [data-epv="nyit:OD"]'); await q.keyboard.press("Enter");
  await varEp(q, "OD");
  t("a rejtetté vált nyitógomb helyett a fókusz a választó gombjára kerül, nem a <body>-ra",
    await q.evaluate(() => document.activeElement.id === "epvBtn"), await q.evaluate(() => document.activeElement.tagName + "#" + document.activeElement.id));
  await q.close(); await cR2.close();

  // a GPS-javaslat gombja töltés közben is fókuszban marad (az alapértelmezett doboz gombja ugyanazt teszi, oda nem ugorhat)
  const cJ = await browser.newContext({ ...DESKTOP, serviceWorkers: "block", geolocation: { latitude: 47.533321, longitude: 19.033662, accuracy: 20 }, permissions: ["geolocation"] });
  await cJ.addInitScript(() => { try { localStorage.setItem("oemap-alap", "OD"); } catch (e) {} });
  await cJ.route("**/data/epuletek/od.json", r => setTimeout(() => r.continue().catch(() => {}), 2000));
  q = await open(cJ, base + "#OA10E18", { settle: 1200 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await nyit(q);
  await q.click('#epvlist [data-epv="gps"]');
  await q.waitForFunction(() => document.getElementById("epvGpsNyit"), null, { timeout: 10000 }).catch(() => {});
  await q.focus("#epvGpsNyit"); await q.keyboard.press("Enter"); await q.waitForTimeout(300);
  t("a GPS-javaslat megnyitó gombja töltés közben is fókuszban marad (nem ugrik az alapértelmezett doboz gombjára)",
    await q.evaluate(() => document.activeElement.id === "epvGpsNyit"), await q.evaluate(() => document.activeElement.outerHTML.slice(0, 90)));
  t("és „Betöltés…”-t mutat", await q.evaluate(() => { const b = document.getElementById("epvGpsNyit");
    return !!b && /Betöltés/.test(b.textContent) && b.getAttribute("aria-disabled") === "true"; }));
  await varEp(q, "OD");
  await q.close(); await cJ.close();

  /* Fekvő telefonon egy GPS-eredmény után is elérhető a lista, és a térkép a
     helyén marad. A GPS-eredmény a lista görgető tömbjében van, nem fölötte:
     egy régi változatban egy külön oszlop teteje volt, és a listát nullára
     nyomta. 844×340: fekvő telefon a böngésző címsorával (alsó lap, a
     hallgató fölhúzza); 932×380: nagy iPhone fekve (900 px-nél szélesebb:
     asztali elrendezés, lebegő panel). */
  for (const [fw, fh] of [[844, 340], [932, 380]]) {
  const cX = await browser.newContext({ ...PHONE, viewport: { width: fw, height: fh }, geolocation: { latitude: 47.533321, longitude: 19.033662, accuracy: 90 }, permissions: ["geolocation"] });
  q = await open(cX, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await nyit(q); await lap(q, "full");
  await q.click('#epvlist [data-epv="gps"]');
  await q.waitForFunction(() => EPV.gps && EPV.gps.allapot === "kesz", null, { timeout: 10000 }).catch(() => {});
  /* A sor látható része: a sor téglalapja, a levágó (nem visible overflow-jú)
     ősök és a képernyő metszete — a sor saját magassága akkor is teljes, ha
     egy nullára nyomott, görgethetetlen oszlop levágja. */
  const fekvo = await q.evaluate(() => { const sor = document.querySelector('#epvlist .epvsor[data-epv="tel:Budapest"]');
    sor.scrollIntoView({ block: "nearest" });
    let { top, bottom } = sor.getBoundingClientRect(); bottom = Math.min(bottom, innerHeight); top = Math.max(top, 0);
    for (let a = sor.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a);
      if (cs.overflowY !== "visible" || cs.overflowX !== "visible") { const r = a.getBoundingClientRect(); top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); } }
    const m = document.getElementById("epvScene").getBoundingClientRect();
    return { sorLathato: Math.round(Math.max(0, bottom - top)), terkep: [Math.round(m.top), Math.round(m.bottom)], ih: innerHeight }; });
  t(`fekvő telefonon (${fw}×${fh}) a GPS-eredmény után is odagörgethető a településlista, és a térkép a képen marad`,
    fekvo.sorLathato >= 40 && fekvo.terkep[0] >= 0 && fekvo.terkep[1] <= fekvo.ih, JSON.stringify(fekvo));
  await q.close(); await cX.close();
  }

  // a bezárt választónál késve érkező hely eldobódik: később nyitva nem mond régi „a közeledben”-t
  const cK = await browser.newContext({ ...PHONE, geolocation: { latitude: odH.lat, longitude: odH.lon, accuracy: 20 }, permissions: ["geolocation"] });
  await cK.addInitScript(() => { const g = navigator.geolocation, eredeti = g.getCurrentPosition.bind(g);
    g.getCurrentPosition = (ok, hiba, o) => setTimeout(() => eredeti(ok, hiba, o), 1500); });
  q = await open(cK, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await nyit(q);
  await q.click('#epvlist [data-epv="gps"]'); await q.waitForTimeout(100);
  await q.keyboard.press("Escape"); await q.waitForTimeout(2500);
  await nyit(q);
  t("a bezárt választónál késve érkező hely nem jelenik meg a következő nyitáskor",
    await q.evaluate(() => !!document.querySelector('#epvlist [data-epv="gps"]') && !document.querySelector("#epvlist .epvgpsok")));
  await q.close(); await cK.close();

  // a házikó billentyűvel: váltás után eltűnik, a fókusz a választó gombjára kerül
  const cH = await browser.newContext(DESKTOP);
  await cH.addInitScript(() => { try { localStorage.setItem("oemap-alap", "OD"); } catch (e) {} });
  q = await open(cH, base + "#OA10E18", { settle: 1500 });
  await q.focus("#epvHaza"); await q.keyboard.press("Enter");
  await varEp(q, "OD");
  t("a házikóval váltva a fókusz nem esik a <body>-ra, hanem a választó gombjára kerül",
    await q.evaluate(() => document.activeElement.id === "epvBtn"), await q.evaluate(() => document.activeElement.tagName));
  await q.close(); await cH.close();

  // töltés közben a megnyomott gomb fókuszban marad (aria-disabled, nem disabled)
  const cD = await browser.newContext({ ...DESKTOP, serviceWorkers: "block" });
  await cD.route("**/data/epuletek/od.json", r => setTimeout(() => r.continue().catch(() => {}), 2000));
  q = await open(cD, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await kartya(q, "OD");
  await q.focus('#epvlist [data-epv="nyit:OD"]'); await q.keyboard.press("Enter"); await q.waitForTimeout(300);
  const tolto = await q.evaluate(() => ({ epv: document.activeElement.dataset.epv, ad: document.activeElement.getAttribute("aria-disabled"),
    szoveg: document.activeElement.textContent }));
  t("letöltés közben a fókusz a gombon marad, és az „Betöltés…”-t mond", tolto.epv === "nyit:OD" && tolto.ad === "true" && /Betöltés/.test(tolto.szoveg),
    JSON.stringify(tolto));
  t("és utána megnyílik", await varEp(q, "OD"));
  await q.close(); await cD.close();

  // angolul az egy épületes jel felolvasói neve is egyes számú
  const cE = await browser.newContext(PHONE);
  q = await open(cE, base, { settle: 600 });
  await q.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await q.evaluate(() => { const b = document.getElementById("langEn"); b && b.click(); });
  await nyit(q); await lap(q, "full");
  await q.click('#epvlist .epvsor[data-epv="tel:Budapest"]'); await q.waitForTimeout(150); await lap(q, "mid"); await nyugodt(q);
  const angol = await q.evaluate(() => [...document.querySelectorAll("#epvScene .jTel")].map(b => b.getAttribute("aria-label")));
  t("angolul a jel neve „1 building”, nem „1 buildings”", angol.some(a => /\b1 building,/.test(a)) && !angol.some(a => /\b1 buildings/.test(a)), angol.join(" | "));
  // a csillag felirata a térkép és az alsó lap fölött látszik (nem alatta)
  await lap(q, "full");
  await q.click('#epvlist [data-epv="kartya:OD"]'); await q.waitForTimeout(150);
  await q.click('#epvlist [data-epv="alap:OD"]'); await q.waitForTimeout(400);
  const felul = await q.evaluate(felulVan);
  t("telefonon a választóban adott visszajelzés (a csillag felirata) látszik, nem a lap alatt van", felul === "látszik", felul);
  await q.evaluate(() => epvRender());
  t("és egy újrarajzolás után is megvan (ugyanaz az élő régió marad)", await q.evaluate(() => { const el = document.getElementById("toast");
    return !!el && el.classList.contains("on") && el.parentNode === document.body; }));
  await q.close(); await cE.close();

  /* ---- egy soha le nem záruló letöltés ---- */
  const cL = await browser.newContext(PHONE);
  await cL.route("**/data/epuletek/kt.json", () => {});            // soha nem válaszol
  q = await cL.newPage();
  await q.clock.install();
  const errs = []; q.on("pageerror", e => errs.push(e.message));
  await q.goto(base); await q.waitForFunction(() => document.querySelectorAll(".floor").length > 0 && EPULETEK, null, { timeout: 15000 });
  await q.evaluate(() => epuletValt("KT"));
  await q.waitForTimeout(100);
  t("letöltés közben töltésjelzés van", await q.evaluate(() => epvTolt === "KT"));
  await q.clock.fastForward(21000); await q.waitForTimeout(300);
  const lejart = await q.evaluate(() => ({ tolt: epvTolt, nyitva: epvNyitva(),
    uzenet: (document.getElementById("epvMsg") || {}).textContent || "" }));
  t("20 s után feladja: nem tölt tovább, és megmondja, hogy nem érhető el", lejart.tolt === false && lejart.nyitva && /KT/.test(lejart.uzenet), JSON.stringify(lejart));
  await q.evaluate(() => epuletValt("OD"));
  t("utána másik épületre lehet váltani", await varEp(q, "OD"));
  t("nincs JS hiba a lejárt letöltés útján", errs.length === 0, errs.join(" | "));
  await cL.close();

  /* ---- egy linkről indult, elakadt váltás újrapróbálva ----
     A QR-kód a terem miatt visz oda: ha az épület első letöltése elakad, az
     adatlapról újra megnyitva is a link termének kell kiválasztva lennie. */
  const cU = await browser.newContext({ ...PHONE, serviceWorkers: "block" });
  let elso = true;
  await cU.route("**/data/epuletek/od.json", r => { if (elso) { elso = false; r.abort(); } else r.continue(); });
  q = await open(cU, base + "#OD00F02", { settle: 1500 });
  await q.waitForFunction(() => epvNyitva() && /OD/.test((document.getElementById("epvMsg") || {}).textContent || ""),
    null, { timeout: 10000 }).catch(() => {});
  await lap(q, "full");
  await q.click('#epvlist [data-epv="nyit:OD"]');
  await varEp(q, "OD");
  const ujra = await q.evaluate(() => ({ ep: epItt(), sel: S.sel }));
  t("az elakadt linkes váltást újrapróbálva a link terme is kiválasztva nyílik", ujra.ep === "OD" && ujra.sel === "OD00F02", JSON.stringify(ujra));
  await q.close();
  // a hibalapot bezárva a link célja elfelejtődik: később a listából nyitva nem jön vissza egy régi QR-kód terme
  elso = true;
  q = await open(cU, base + "#OD00F02", { settle: 1500 });
  await q.waitForFunction(() => epvNyitva(), null, { timeout: 10000 }).catch(() => {});
  await q.keyboard.press("Escape"); await q.waitForTimeout(200);
  await nyit(q); await lap(q, "full");
  await q.click('#epvlist .epvsor[data-epv="tel:Budapest"]'); await q.waitForTimeout(150);
  await q.click('#epvlist .epvrow[data-ep="OD"]');
  await varEp(q, "OD");
  t("a bezárt hibalap után a listából nyitott épületben nincs régi link-kiválasztás", (await q.evaluate(() => S.sel)) === null,
    await q.evaluate(() => S.sel));
  await q.close(); await cU.close();

  /* ---- egy linkről (beírt cím, Vissza gomb) indult betöltés alatt a hallgató továbblép ----
     A betöltés vége nem írhatja felül, amit közben választott (és a
     history-bejegyzését sem). */
  const cV = await browser.newContext({ ...PHONE, serviceWorkers: "block" });
  await cV.route("**/data/epuletek/od.json", r => setTimeout(() => r.continue().catch(() => {}), 2500));
  q = await open(cV, base, { settle: 900 });
  await q.waitForFunction(() => EPULETEK, null, { timeout: 10000 });
  await q.evaluate(() => { location.hash = "#OD20E01"; });
  await q.waitForFunction(() => epvTolt === "OD", null, { timeout: 5000 }).catch(() => {});
  await q.evaluate(() => select("OA10E18"));
  await q.waitForTimeout(3500);
  const tovabb = await q.evaluate(() => ({ ep: epItt(), sel: S.sel, hash: location.hash }));
  t("a linkről indult betöltés alatt választott terem marad (a késő betöltés nem váltja át)",
    tovabb.ep === "OA" && tovabb.sel === "OA10E18" && tovabb.hash === "#OA10E18", JSON.stringify(tovabb));
  await q.close(); await cV.close();

  /* ---- két épületet vegyítő link ----
     #from=OD…&to=OA…: korábban a két épület közt ingázott a végtelenségig
     (másodpercenként több letöltés). Most egyszer vált, a másik épület kódja
     elmarad. */
  const cP = await browser.newContext({ ...PHONE, serviceWorkers: "block" });
  let odKer = 0; cP.on("request", r => { if (/od\.json/.test(r.url())) odKer++; });
  const h0 = await (async () => { const g = await open(cP, base, { settle: 300 }); const n = await g.evaluate(() => history.length); await g.close(); return n; })();
  odKer = 0;
  q = await open(cP, base + "#from=OD00F02&to=OA10E18", { settle: 4000 });
  t("a link útján a váltás nem tesz közbülső bejegyzést a history-ba (a Vissza nem váltana vissza)",
    (await q.evaluate(() => history.length)) === h0, `${await q.evaluate(() => history.length)} vs ${h0}`);
  const veg = await q.evaluate(() => ({ ep: epItt(), from: S.from, to: S.to, hash: location.hash }));
  t("a két épületet vegyítő link egyszer vált, és ott marad", odKer === 1 && veg.ep === "OD" && veg.from === "OD00F02" && !veg.to,
    JSON.stringify({ odKer, ...veg }));
  // a címben sem marad a másik épület kódja: a Vissza gomb különben újra átváltott
  t("a cím a tényleges állapotot mondja (a másik épület kódja nélkül)", veg.hash === "#from=OD00F02", veg.hash);
  await q.close(); await cP.close();
});

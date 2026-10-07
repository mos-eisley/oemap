/* Totem-mód (?totem). Az e-totemen ott maradt az előző ember útvonala,
   nyelve, nézete. Egy perc tétlenség után alaphelyzet: a totem saját „itt
   vagyok"-ja (#from=…), magyar nyelv, alaprajz; tíz másodperccel előtte szól,
   és egy érintés megállítja. Gesztus közben soha, és totem-mód nélkül soha.
   Naponta egyszer újratölt. Az időt a Playwright órája ugratja, nem várunk
   percekig; a használat valódi kattintás, mert csak a valódi bevitel számít. */
const { run, DESKTOP } = require("./lib");

run("totem-mód", async ({ t, ctx, base }) => {
  const nyit = async url => {
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.clock.install();
    await p.goto(url, { waitUntil: "load" });
    await p.waitForFunction(() => document.querySelectorAll(".floor").length > 0);
    await p.waitForTimeout(1200); p.jsErrors = errs; return p;
  };
  const allapot = p => p.evaluate(() => ({ from:S.from, to:S.to, lang:S.lang, mode:S.mode, hash:location.hash,
    wc:!!S.wc, toast:!!document.querySelector("#toast.on"), szoveg:(document.querySelector("#toast.on") || {}).textContent || "" }));
  const hasznal = async p => {
    await p.click('[data-q="WC"]'); await p.waitForTimeout(300);
    await p.click("[data-wc]"); await p.waitForTimeout(500);
    await p.click("#langEn"); await p.click("#m3"); await p.waitForTimeout(1500);
  };

  const p = await nyit(base + "?totem#from=OA00FK1");
  const indul = await allapot(p);
  t("a totem a saját helyéről indul", indul.from === "OA00FK1" && !indul.to, JSON.stringify(indul));
  await hasznal(p);
  const hasznalva = await allapot(p);
  t("használat közben útvonal, angol nyelv, Épület nézet", hasznalva.to && hasznalva.lang === "en" && hasznalva.mode === 3,
    JSON.stringify(hasznalva));

  // az utolsó bevitel most legyen, hogy a számolás innen induljon
  await p.mouse.move(700, 400);
  await p.clock.fastForward(48000);
  const negyvenkilenc = await allapot(p);
  t("48 másodperc után még semmi", negyvenkilenc.to === hasznalva.to && !negyvenkilenc.toast, JSON.stringify(negyvenkilenc));
  await p.clock.fastForward(3000);
  const otvenegy = await allapot(p);
  t("50 másodperc után szól, hogy 10 másodperc múlva visszaáll", otvenegy.toast && /10/.test(otvenegy.szoveg) &&
    otvenegy.to === hasznalva.to, JSON.stringify(otvenegy));
  await p.mouse.move(640, 300); await p.mouse.move(660, 320);
  const megallit = await allapot(p);
  t("egy mozdulat megállítja, és újraindul a perc", !megallit.toast && megallit.to === hasznalva.to, JSON.stringify(megallit));
  await p.clock.fastForward(55000);
  t("a megállítás után 55 másodperccel még nem áll vissza", (await allapot(p)).to === hasznalva.to);
  await p.clock.fastForward(6000); await p.waitForTimeout(1500);
  const vissza = await allapot(p);
  t("egy perc tétlenség után alaphelyzet: a totem helye, magyar nyelv, alaprajz, cél nélkül",
    vissza.from === "OA00FK1" && !vissza.to && vissza.lang === "hu" && vissza.mode === 2 && vissza.hash === "#from=OA00FK1" &&
    !vissza.wc && !vissza.toast, JSON.stringify(vissza));
  const panel = await p.evaluate(() => ({ cim:document.getElementById("fname").textContent,
    gyors:!!document.querySelector(".qgrid"), angol:document.getElementById("langEn").getAttribute("aria-pressed") }));
  t("a felület is magyarul áll, a gyorsgombokkal", /helyiség/.test(panel.cim) && panel.gyors && panel.angol === "false",
    JSON.stringify(panel));

  // gesztus közben soha: a lenyomott, mozgó egér alatt nem áll vissza
  await hasznal(p);
  const box = await p.evaluate(() => { const b = document.getElementById("stage").getBoundingClientRect();
    return { x:b.x + b.width / 2, y:b.y + b.height / 2 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x + 40, box.y + 10, { steps:4 });
  const fogva = await p.evaluate(() => app.classList.contains("navving"));
  await p.clock.fastForward(70000);
  const gesztus = await allapot(p);
  t("gesztus közben nem áll vissza", fogva && gesztus.to === hasznalva.to, JSON.stringify({ fogva, ...gesztus }));
  await p.mouse.up(); await p.waitForTimeout(300);
  await p.clock.fastForward(61000); await p.waitForTimeout(1500);
  t("a gesztus után egy perccel visszaáll", !(await allapot(p)).to);

  // naponta egyszer újratölt, nyugvó állapotban is
  await p.evaluate(() => { window.__regi = 1; });
  await p.clock.fastForward(21 * 3600e3); await p.waitForTimeout(500);
  await p.waitForFunction(() => document.querySelectorAll(".floor").length > 0, null, { timeout:15000 });
  const ujra = await p.evaluate(() => ({ regi:window.__regi || 0, hash:location.hash, totem:location.search }));
  t("egy nap után újratölt, a totem címével", ujra.regi === 0 && ujra.hash === "#from=OA00FK1" && ujra.totem === "?totem",
    JSON.stringify(ujra));
  t("a totemen nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await p.close();

  // totem-mód nélkül soha nem áll vissza
  const q = await nyit(base + "#from=OA00FK1");
  await hasznal(q);
  const elotte = await allapot(q);
  await q.clock.fastForward(5 * 60000); await q.waitForTimeout(500);
  const utana = await allapot(q);
  t("totem-mód nélkül öt perc tétlenség után is marad minden", utana.to === elotte.to && utana.lang === "en" && utana.mode === 3,
    JSON.stringify(utana));
  t("nincs JS hiba", q.jsErrors.length === 0, q.jsErrors.join(" | "));
  await q.close();
}, DESKTOP);

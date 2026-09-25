/* Neptun-nevek a térképen, és a párosító mód.

   A hallgató az órarendjében a Neptun-nevet látja (F01, 1.13, Audmax), a
   tervlap a saját kódját (OA00F11) — a kettő független számozás. Ahol van
   megerősített pár (NEPTUN tábla), ott a térkép felirata, a kereső és az
   adatlap is a Neptun-nevet mutatja. A párokat a párosító mód (?parosit)
   állítja elő: teremre kattintás, a Neptun-név kiválasztása, a lista
   kimásolása. A valódi párok még nem érkeztek meg, ezért a teszt maga köt be
   egyet-kettőt. */
const { run, open, DESKTOP } = require("./lib");

run("Neptun-nevek és párosítás", async ({ t, ctx, browser, base }) => {
  const p = await open(ctx, base, { settle: 1500 });
  const lefut = q => q.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().endTime !== Infinity)
      .map(a => a.finished.catch(() => {})));
    await new Promise(r => setTimeout(r, 300)); });

  // Beépített pár: a feliratok, a kereső és az adatlap is a Neptun-nevet mutatja
  const r = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const feliratok = () => [...document.querySelectorAll(".floor.on .glabel .lbl")].map(x => x.textContent);
    const elotte = feliratok();
    NEPTUN.OA00F11 = "F01"; NEPTUN.OA10E18 = "Audmax"; relabel(); await w(200);
    const utana = feliratok();
    select("OA00F11"); await w(200);
    const cim = document.querySelector(".rcard .name").textContent;
    const db = n => utana.filter(x => x === n).length;
    return { elotte:elotte.includes("F11"), utana:{ f01:db("F01"), f11:db("F11"), teljes:db("OA00F01") }, cim,
             keres:search("F01").slice(0, 2).map(x => x.code), audmax:search("audmax")[0] && search("audmax")[0].code };
  });
  t("pár nélkül a tervlapi kód a felirat", r.elotte);
  t("párosított teremnél a térkép felirata a Neptun-név", r.utana.f01 === 1 && r.utana.f11 === 0, JSON.stringify(r.utana));
  /* A tervlapi rövid kód ütközhet egy másik terem Neptun-nevével: az OA00F01
     nem maradhat szintén „F01", ott a teljes kód áll. */
  t("a Neptun-névvel ütköző tervlapi felirat teljes kódra vált, így nincs két „F01”", r.utana.teljes === 1,
    JSON.stringify(r.utana));
  t("az adatlap címe is a Neptun-név", r.cim === "F01", r.cim);
  t("a Neptun-névre keresve a párosított terem jön elsőnek, a tervlapi névrokon előtt",
    r.keres[0] === "OA00F11", r.keres.join(", "));
  t("az „audmax” keresés is megtalálja", r.audmax === "OA10E18", r.audmax);

  // Épület nézetben az álló teremszámok is
  await p.evaluate(() => { S.sel = null; renderPanel(); setMode(3); }); await lefut(p);
  const tl = await p.evaluate(() => { const x = LABS.find(l => l.r.code === "OA00F11"); return x && x.e.textContent; });
  t("Épület nézetben az álló teremszám is a Neptun-név", tl === "F01", tl);
  await p.evaluate(() => { delete NEPTUN.OA00F11; delete NEPTUN.OA10E18; relabel(); setMode(2); });
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));

  /* Párosító mód, valódi egérrel: teremre kattintás, a Neptun-név
     kiválasztása. A helyben megadott pár megmarad újratöltéskor, de csak
     ebben a módban él — egy sima látogatónál nem jelenhet meg. */
  const pctx = await browser.newContext(DESKTOP);
  const q = await open(pctx, base + "?parosit", { settle: 1500 });
  const kozep = c => q.evaluate(c => { const b = document.querySelector(`.floor.on [data-code="${c}"]`).getBoundingClientRect();
    return { x:b.x + b.width / 2, y:b.y + b.height / 2 }; }, c);
  await q.waitForFunction(() => document.querySelector(".pairbar") && tmDone);
  let c = await kozep("OA00F11");
  await q.mouse.click(c.x, c.y);
  await q.waitForSelector('[data-pair="F01"]');
  await q.click('[data-pair="F01"]'); await q.waitForTimeout(300);
  const par = await q.evaluate(() => ({ tarolt:JSON.parse(localStorage.getItem("oemap-parok") || "{}"),
    cim:document.querySelector(".rcard .name").textContent, lista:document.getElementById("pText").value,
    felirat:[...document.querySelectorAll(".floor.on .glabel .lbl")].map(x => x.textContent) }));
  t("párosító módban a teremre kattintva kiválasztható a Neptun-neve",
    par.tarolt.OA00F11 === "F01" && par.cim === "F01" && par.felirat.includes("F01") && !par.felirat.includes("F11"),
    JSON.stringify(par).slice(0, 200));
  t("a kimásolható lista tartalmazza a párt", /^F01 = OA00F11$/m.test(par.lista), par.lista);

  // ugyanaz a Neptun-név egy másik teremhez: az előzőtől elkerül
  c = await kozep("OA00F03");
  await q.mouse.click(c.x, c.y);
  await q.waitForSelector('[data-pair="F01"]');
  await q.click('[data-pair="F01"]'); await q.waitForTimeout(300);
  const at = await q.evaluate(() => JSON.parse(localStorage.getItem("oemap-parok") || "{}"));
  t("egy Neptun-név egy teremhez tartozik: máshová téve az előzőtől elkerül", at.OA00F03 === "F01" && !at.OA00F11,
    JSON.stringify(at));

  await q.reload(); await q.waitForFunction(() => document.querySelector(".floor"));
  await q.waitForTimeout(1200);
  const ujra = await q.evaluate(() => neptunOf("OA00F03"));
  t("újratöltés után is megmarad", ujra === "F01", ujra);

  const sima = await open(pctx, base, { settle: 1200 });
  const simaR = await sima.evaluate(() => ({ nev:neptunOf("OA00F03"), sav:!!document.querySelector(".pairbar"),
    felirat:[...document.querySelectorAll(".floor.on .glabel .lbl")].some(x => x.textContent === "F03") }));
  // az OA00F03 a saját tervlapi feliratát viseli, nem a helyben adott „F01"-et
  t("párosító mód nélkül a helyi pár nem jelenik meg", !simaR.nev && !simaR.sav && simaR.felirat, JSON.stringify(simaR));
  t("a párosító módban sincs JS hiba", q.jsErrors.length === 0 && sima.jsErrors.length === 0,
    q.jsErrors.concat(sima.jsErrors).join(" | "));
  await pctx.close();
}, DESKTOP);

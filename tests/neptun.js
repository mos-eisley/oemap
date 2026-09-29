/* Neptun-nevek a térképen, és a párosító mód.

   A hallgató az órarendjében a Neptun-nevet látja (F01, 1.13, Audmax), a
   tervlap a saját kódját (OA00F11) — a kettő független számozás. Ahol van
   megerősített pár (NEPTUN tábla), ott a térkép felirata, a kereső és az
   adatlap is a Neptun-nevet mutatja, az adatlapon a foglaltsággal. Négy pár
   beépített (F01, F06, Audmax: a méret kényszeríti ki őket; F02: az egyetemi
   teremlap fotói); a többit a
   párosító mód (?parosit) állítja elő: teremre kattintás, a Neptun-név
   kiválasztása, a lista kimásolása. */
const { run, open, DESKTOP } = require("./lib");

run("Neptun-nevek és párosítás", async ({ t, ctx, browser, base }) => {
  const p = await open(ctx, base, { settle: 1500 });
  const lefut = q => q.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().endTime !== Infinity)
      .map(a => a.finished.catch(() => {})));
    await new Promise(r => setTimeout(r, 300)); });

  // A beépített párok: a feliratok, a kereső és az adatlap is a Neptun-nevet mutatja
  const r = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const feliratok = () => [...document.querySelectorAll(".floor.on .glabel .lbl")].map(x => x.textContent);
    const f = feliratok(), db = n => f.filter(x => x === n).length;
    // melyik terem viseli a feliratot: a felirat a terme közepén áll
    const kie = n => { const e = [...document.querySelectorAll(".floor.on .glabel .lbl")].find(x => x.textContent === n);
      if (!e) return null; const b = e.getBoundingClientRect();
      return [...document.querySelectorAll(".floor.on [data-code]")].map(x => [x.dataset.code, x.getBoundingClientRect()])
        .filter(([, q]) => q.left <= b.x + b.width / 2 && b.x + b.width / 2 <= q.right && q.top <= b.y + b.height / 2 && b.y + b.height / 2 <= q.bottom)
        .map(([c]) => c); };
    const fold = { f01:db("F01"), f02:db("F02"), f06:db("F06"), f11:db("F11"), f12:db("F12"), f03:db("F03"), teljes:db("OA00F01"),
      f13:db("F13"), alak:f.filter(x => /^F0\d$/.test(x)), kie01:kie("F01"), kie02:kie("F02"), kie06:kie("F06"),
      bufe:kie("OA00F04"), wc:kie("OA00F07") };
    select("OA00F11"); await w(1500);
    const kartya = { cim:document.querySelector(".rcard .name").textContent,
      tm:(document.querySelector(".rcard .rtm") || {}).textContent || "" };
    S.sel = null; renderPanel(); setLevel(2); await w(900);
    return { fold, kartya, emelet1:[...document.querySelectorAll(".floor.on .glabel .lbl")].map(x => x.textContent),
             keres:search("F01").slice(0, 2).map(x => x.code), keres06:search("F06")[0].code,
             audmax:search("audmax")[0] && search("audmax")[0].code };
  });
  t("a beépített pároknál a térkép felirata a Neptun-név: F01 a nagyelőadón, F06 a 146 m²-es teremben, F02 a felső szárny szélén",
    r.fold.f01 === 1 && r.fold.f06 === 1 && r.fold.f02 === 1 && r.fold.f11 === 0 && r.fold.f03 === 0 && r.fold.f12 === 0
      && (r.fold.kie01 || []).includes("OA00F11") && (r.fold.kie06 || []).includes("OA00F03")
      && (r.fold.kie02 || []).includes("OA00F12"), JSON.stringify(r.fold));
  t("pár nélkül a tervlapi kód a felirat", r.fold.f13 === 1, JSON.stringify(r.fold));
  /* A tervlapi rövid kód alakra egyezik a földszinti Neptun-nevekkel: a büfé
     a tervlapon F04, a női mosdó F07. A valódi Neptun-nevek mellett ezek
     megtévesztenének, ezért a földszinten F01…F09 alakú felirat csak
     párosított teremen állhat, a többin a teljes tervlapi kód. */
  t("a földszinten Neptun-névnek látszó felirat csak párosított teremen áll",
    r.fold.alak.every(x => ["F01", "F02", "F06"].includes(x)), r.fold.alak.join(", "));
  t("a Neptun-névnek látszó tervlapi kód helyén a teljes kód: a büfén OA00F04, a női mosdón OA00F07, a névrokon teremben OA00F01",
    r.fold.teljes === 1 && (r.fold.bufe || []).includes("OA00F04") && (r.fold.wc || []).includes("OA00F07"), JSON.stringify(r.fold));
  t("az adatlap címe a Neptun-név, és ott a foglaltsága", r.kartya.cim === "F01" && r.kartya.tm.includes("BA.F.01"),
    JSON.stringify(r.kartya).slice(0, 200));
  t("az I. emeleten az Audmax felirata a Neptun-név", r.emelet1.includes("Audmax"), r.emelet1.join(" "));
  t("a Neptun-névre keresve a párosított terem jön elsőnek, a tervlapi névrokon előtt",
    r.keres[0] === "OA00F11" && r.keres06 === "OA00F03", r.keres.join(", ") + " | " + r.keres06);
  t("az „audmax” keresés is megtalálja", r.audmax === "OA10E18", r.audmax);

  // Épület nézetben az álló teremszámok is
  await p.evaluate(() => { setLevel(0); setMode(3); }); await lefut(p);
  const tl = await p.evaluate(() => { const x = LABS.find(l => l.r.code === "OA00F11"); return x && x.e.textContent; });
  t("Épület nézetben az álló teremszám is a Neptun-név", tl === "F01", tl);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));

  /* Párosító mód, valódi egérrel: teremre kattintás, a Neptun-név
     kiválasztása. A helyben megadott pár megmarad újratöltéskor, de csak
     ebben a módban él — egy sima látogatónál nem jelenhet meg. */
  const pctx = await browser.newContext(DESKTOP);
  const q = await open(pctx, base + "?parosit", { settle: 1500 });
  const kozep = c => q.evaluate(c => { const b = document.querySelector(`.floor.on [data-code="${c}"]`).getBoundingClientRect();
    return { x:b.x + b.width / 2, y:b.y + b.height / 2 }; }, c);
  await q.waitForFunction(() => document.querySelector(".pairbar") && tmDone);
  let c = await kozep("OA00F13");
  await q.mouse.click(c.x, c.y);
  await q.waitForSelector('[data-pair="F03"]');
  await q.click('[data-pair="F03"]'); await q.waitForTimeout(300);
  const par = await q.evaluate(() => ({ tarolt:JSON.parse(localStorage.getItem("oemap-parok") || "{}"),
    cim:document.querySelector(".rcard .name").textContent, lista:document.getElementById("pText").value,
    felirat:[...document.querySelectorAll(".floor.on .glabel .lbl")].map(x => x.textContent) }));
  t("párosító módban a teremre kattintva kiválasztható a Neptun-neve",
    par.tarolt.OA00F13 === "F03" && par.cim === "F03" && par.felirat.includes("F03") && !par.felirat.includes("F13"),
    JSON.stringify(par).slice(0, 200));
  t("a kimásolható lista tartalmazza az új és a beépített párokat is",
    /^F03 = OA00F13$/m.test(par.lista) && /^F01 = OA00F11$/m.test(par.lista) && /^F02 = OA00F12$/m.test(par.lista)
      && /^Audmax = OA10E18$/m.test(par.lista), par.lista);

  // ugyanaz a Neptun-név egy másik teremhez: az előzőtől elkerül
  c = await kozep("OA00F14");
  await q.mouse.click(c.x, c.y);
  await q.waitForSelector('[data-pair="F03"]');
  await q.click('[data-pair="F03"]'); await q.waitForTimeout(300);
  const at = await q.evaluate(() => JSON.parse(localStorage.getItem("oemap-parok") || "{}"));
  t("egy Neptun-név egy teremhez tartozik: máshová téve az előzőtől elkerül", at.OA00F14 === "F03" && !at.OA00F13,
    JSON.stringify(at));

  await q.reload(); await q.waitForFunction(() => document.querySelector(".floor"));
  await q.waitForTimeout(1200);
  const ujra = await q.evaluate(() => neptunOf("OA00F14"));
  t("újratöltés után is megmarad", ujra === "F03", ujra);

  const sima = await open(pctx, base, { settle: 1200 });
  const simaR = await sima.evaluate(() => ({ nev:neptunOf("OA00F14"), sav:!!document.querySelector(".pairbar"),
    felirat:[...document.querySelectorAll(".floor.on .glabel .lbl")].some(x => x.textContent === "F14") }));
  // az OA00F14 a saját tervlapi feliratát viseli, nem a helyben adott „F03"-at
  t("párosító mód nélkül a helyi pár nem jelenik meg", !simaR.nev && !simaR.sav && simaR.felirat, JSON.stringify(simaR));
  t("a párosító módban sincs JS hiba", q.jsErrors.length === 0 && sima.jsErrors.length === 0,
    q.jsErrors.concat(sima.jsErrors).join(" | "));
  await pctx.close();
}, DESKTOP);

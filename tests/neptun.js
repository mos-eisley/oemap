/* Ajtószámok (Neptun-nevek) a térképen, és a párosító mód.

   A hallgató az ajtón és az órarendjében ugyanazt a számot látja (F01, 1.10,
   Audmax), a tervlap a saját kódját (OA00F11) — a kettő független számozás.
   A megfeleltetés a NEPTUN tábla, a Tervtár OA épületadatainak kari
   nyilvántartásából. Ahol van pár, ott a térkép felirata, a kereső és az
   adatlap is ezt a számot mutatja, az adatlapon a foglaltsággal. A
   párosító mód (?parosit) helyben felülírhatja: teremre kattintás, a
   Neptun-név kiválasztása, a lista kimásolása. */
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
    const alak = f.filter(x => /^F0\d$/.test(x));
    const fold = { f01:db("F01"), f02:db("F02"), f09:db("F09"), f06:db("F06"), f11:db("F11"), f12:db("F12"), f03:db("F03"),
      f10:db("F10"), alak, alakPar:alak.every(x => Object.values(NEPTUN).includes(x)),
      kie01:kie("F01"), kie02:kie("F02"), kie09:kie("F09"), kie08:kie("F08"),
      bufe:kie("OA00F04"), raktar:kie("OA00F05") };
    select("OA00F11"); await w(1500);
    const kartya = { cim:document.querySelector(".rcard .name").textContent,
      tm:(document.querySelector(".rcard .rtm") || {}).textContent || "" };
    S.sel = null; renderPanel(); setLevel(2); await w(900);
    return { fold, kartya, emelet1:[...document.querySelectorAll(".floor.on .glabel .lbl")].map(x => x.textContent),
             keres:search("F01").slice(0, 2).map(x => x.code), keres09:search("F09")[0].code,
             pont:["1.10", "110", "BA.1.10"].map(q => (search(q)[0] || {}).code),
             audmax:search("audmax")[0] && search("audmax")[0].code };
  });
  t("a térkép felirata az ajtószám: F01 a nagyelőadón, F02 a felső szárny szélén, F09 a 146 m²-es teremben, F08 az OA00F01-en",
    r.fold.f01 === 1 && r.fold.f02 === 1 && r.fold.f09 === 1 && r.fold.f11 === 0 && r.fold.f12 === 0
      && (r.fold.kie01 || []).includes("OA00F11") && (r.fold.kie02 || []).includes("OA00F12")
      && (r.fold.kie09 || []).includes("OA00F03") && (r.fold.kie08 || []).includes("OA00F01"), JSON.stringify(r.fold));
  /* Az F06 a nyilvántartás szerint az OA00F16, a felső szárny északkeleti
     végén, ami nincs rajta a térképen; az OA00F03-on korábban tévesen állt. */
  t("az F06 felirat nem áll a térképen (a terme hiányzik a tervlapról)", r.fold.f06 === 0, JSON.stringify(r.fold));
  t("pár nélkül a tervlapi kód a felirat", r.fold.f10 === 1, JSON.stringify(r.fold));
  /* A tervlapi rövid kód alakra egyezik a földszinti Neptun-nevekkel: a büfé
     a tervlapon F04, a raktára F05. A valódi Neptun-nevek mellett ezek
     megtévesztenének, ezért a földszinten F01…F09 alakú felirat csak
     párosított teremen állhat, a többin a teljes tervlapi kód. (A női mosdó,
     a tervlapi F07, piktogramot kap, feliratot nem.) */
  t("a földszinten Neptun-névnek látszó felirat csak párosított teremen áll",
    r.fold.alakPar && r.fold.alak.length >= 7, r.fold.alak.join(", "));
  t("a Neptun-névnek látszó tervlapi kód helyén a teljes kód: a büfén OA00F04, a raktárán OA00F05",
    (r.fold.bufe || []).includes("OA00F04") && (r.fold.raktar || []).includes("OA00F05"), JSON.stringify(r.fold));
  t("az adatlap címe a Neptun-név, és ott a foglaltsága", r.kartya.cim === "F01" && r.kartya.tm.includes("BA.F.01"),
    JSON.stringify(r.kartya).slice(0, 200));
  t("az I. emeleten is az ajtószám a felirat: Audmax, 1.10", r.emelet1.includes("Audmax") && r.emelet1.includes("1.10"),
    r.emelet1.join(" "));
  t("a Neptun-névre keresve a párosított terem jön elsőnek, a tervlapi névrokon előtt",
    r.keres[0] === "OA00F11" && r.keres09 === "OA00F03", r.keres.join(", ") + " | " + r.keres09);
  t("az ajtószám pont nélkül és a Neptun teljes alakjában is megtalálható (1.10, 110, BA.1.10)",
    r.pont.every(c => c === "OA10E45"), r.pont.join(", "));
  t("az „audmax” keresés is megtalálja", r.audmax === "OA10E18", r.audmax);

  // Épület nézetben az álló teremszámok is
  await p.evaluate(() => { setLevel(0); setMode(3); }); await lefut(p);
  const tl = await p.evaluate(() => { const x = LABS.find(l => l.r.code === "OA00F11"); return x && x.e.textContent; });
  t("Épület nézetben az álló teremszám is a Neptun-név", tl === "F01", tl);

  /* A foglalható termek listájából a kinyitott sor a térképre visz, ha a
     terem rajta van; a hiányzó szárny termeinél (F05) nincs ilyen gomb. */
  const ugras = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    await tmLoad(); quick("@ROOMS"); await w(200);
    S.tmOpen = "F05"; renderTermek(); const f05 = !!document.querySelector("[data-goto]");
    S.tmOpen = "1.10"; renderTermek(); const b = document.querySelector("[data-goto]");
    const felirat = b && b.textContent; b && b.click(); await w(400);
    return { f05, felirat, sel:S.sel, szint:S.level, cim:(document.querySelector(".rcard .name") || {}).textContent };
  });
  t("a foglalható termek listájából a terem a térképre visz", ugras.sel === "OA10E45" && ugras.szint === 2
    && ugras.cim === "1.10" && !!ugras.felirat && !ugras.f05, JSON.stringify(ugras));
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
  await q.waitForSelector('[data-pair="F05"]');
  await q.click('[data-pair="F05"]'); await q.waitForTimeout(300);
  const par = await q.evaluate(() => ({ tarolt:JSON.parse(localStorage.getItem("oemap-parok") || "{}"),
    cim:document.querySelector(".rcard .name").textContent, lista:document.getElementById("pText").value,
    felirat:[...document.querySelectorAll(".floor.on .glabel .lbl")].map(x => x.textContent) }));
  t("párosító módban a teremre kattintva kiválasztható a Neptun-neve",
    par.tarolt.OA00F13 === "F05" && par.cim === "F05" && par.felirat.includes("F05") && !par.felirat.includes("F03"),
    JSON.stringify(par).slice(0, 200));
  t("a kimásolható lista tartalmazza az új és a beépített párokat is",
    /^F05 = OA00F13$/m.test(par.lista) && /^F01 = OA00F11$/m.test(par.lista) && /^F02 = OA00F12$/m.test(par.lista)
      && /^Audmax = OA10E18$/m.test(par.lista) && /^1\.10 = OA10E45$/m.test(par.lista) && !/^F03 = /m.test(par.lista),
    par.lista);

  // ugyanaz a Neptun-név egy másik teremhez: az előzőtől elkerül
  c = await kozep("OA00F14");
  await q.mouse.click(c.x, c.y);
  await q.waitForSelector('[data-pair="F05"]');
  await q.click('[data-pair="F05"]'); await q.waitForTimeout(300);
  const at = await q.evaluate(() => JSON.parse(localStorage.getItem("oemap-parok") || "{}"));
  t("egy Neptun-név egy teremhez tartozik: máshová téve az előzőtől elkerül", at.OA00F14 === "F05" && !at.OA00F13,
    JSON.stringify(at));

  await q.reload(); await q.waitForFunction(() => document.querySelector(".floor"));
  await q.waitForTimeout(1200);
  const ujra = await q.evaluate(() => neptunOf("OA00F14"));
  t("újratöltés után is megmarad", ujra === "F05", ujra);

  const sima = await open(pctx, base, { settle: 1200 });
  const simaR = await sima.evaluate(() => { const f = [...document.querySelectorAll(".floor.on .glabel .lbl")].map(x => x.textContent);
    return { nev:neptunOf("OA00F14"), sav:!!document.querySelector(".pairbar"), f04:f.includes("F04"), f05:f.includes("F05") }; });
  // az OA00F14 a beépített számát viseli (F04), nem a helyben adott „F05"-öt
  t("párosító mód nélkül a helyi pár nem jelenik meg", simaR.nev === "F04" && !simaR.sav && simaR.f04 && !simaR.f05,
    JSON.stringify(simaR));
  t("a párosító módban sincs JS hiba", q.jsErrors.length === 0 && sima.jsErrors.length === 0,
    q.jsErrors.concat(sima.jsErrors).join(" | "));
  await pctx.close();
}, DESKTOP);

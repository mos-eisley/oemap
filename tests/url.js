/* Mély linkek: az állapot a címsorban él. Ez tartja meg a megosztott
   útvonalat, és ettől lép vissza a telepített PWA-ban a vissza gomb
   ahelyett, hogy kilépne. */
const { run, open } = require("./lib");

run("mély link (URL-állapot)", async ({ t, ctx, base }) => {
  const st = p => p.evaluate(() => ({ from:S.from, to:S.to, sel:S.sel, lv:S.level,
                                      hash:location.hash, ut:!!S.route }));

  // A) üres indulás — se kiválasztás, se bedrótozott demó útvonal
  let p = await open(ctx, base, { settle: 1400 });
  let a = await st(p);
  t("üresen indul, kiválasztás nélkül", !a.from && !a.to && !a.sel, JSON.stringify(a));
  t("a gyorsgombok fogadják a hallgatót", await p.evaluate(() => !!document.querySelector(".qgrid")));
  t.eq("üresen nincs hash", a.hash, "");
  await p.close();

  // B) QR-alak: az "itt vagyok" csak az indulást adja meg
  p = await open(ctx, base + "#from=OA00FK1", { settle: 1400 });
  let b = await st(p);
  t.eq("#from= beállítja az indulást", b.from, "OA00FK1");
  t("cél nélkül még nincs útvonal", !b.to && !b.ut, JSON.stringify(b));
  await p.close();

  // C) teljes útvonal
  p = await open(ctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1400 });
  let c = await st(p);
  t("#from=&to= kiszámolja az útvonalat", c.from==="OA00FK1" && c.to==="OA10E18" && c.ut, JSON.stringify(c));
  await p.close();

  /* C2) A megrendelő kérése: ha nincs megadva indulás, a navigáció a
     portáról indul — linkből, az „Ide” gombbal és a gyorsgombokkal is.
     Amit a hallgató maga ad meg (QR, „Innen”), az felülírja. */
  p = await open(ctx, base + "#to=OA10E18", { settle: 1400 });
  let c2 = await st(p);
  t("csak cél: a portáról indul, és van útvonal", c2.from === "OAX1A02" && c2.to === "OA10E18" && c2.ut, JSON.stringify(c2));
  const x = await p.evaluate(() => [...document.querySelectorAll("[data-ep='from'] .x")].length);
  t("a portáról induló útvonalnál az indulás nem törölhető (azonnal visszajönne)", x === 0, "× gomb: " + x);
  await p.close();
  p = await open(ctx, base, { settle: 1400 });
  await p.evaluate(() => select("OA20E01")); await p.waitForTimeout(300);
  await p.click("#bT"); await p.waitForTimeout(400);
  const ide = await st(p);
  t("az „Ide” gomb a portáról tervez", ide.from === "OAX1A02" && ide.to === "OA20E01" && ide.ut, JSON.stringify(ide));
  await p.evaluate(() => { S.from = S.to = S.sel = null; S.route = null; renderPanel(); });
  /* A mosdó gomb fajtánként egy sort ad (női, férfi, akadálymentes), a
     menetidő szerint a legközelebbit, a lépcsőzéssel együtt — nem a porta
     mögötti dolgozói öltözők WC-jét, és nem a raktárból nyíló mosdót. A sorra
     koppintva indul az útvonal, a portáról. */
  const wc = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    quick("WC"); await w(300);
    const sorok = [...document.querySelectorAll("[data-wc]")].map(e => ({ c:e.dataset.wc, t:e.querySelector("b").textContent }));
    document.querySelector("[data-wc]").click(); await w(400);
    const ut = { from:S.from, to:S.to, ut:!!S.route };
    // a III. emeletről: ott nincs női mosdó, a sor a II. emeletit adja
    S.from = "OA30E01"; S.to = S.sel = null; S.route = null; renderPanel(); await w(100);
    const qr = document.querySelector(".qgrid small") && document.querySelector(".qgrid small").textContent;
    quick("WC"); await w(300);
    const harmadik = [...document.querySelectorAll("[data-wc]")].map(e => ({ c:e.dataset.wc, lv:ROOM[e.dataset.wc].level }));
    return { sorok, ut, qr, harmadik, szint:Object.fromEntries(sorok.map(x => [x.c, ROOM[x.c].level])) };
  });
  t("a mosdó gomb három sort ad: női, férfi, akadálymentes", wc.sorok.map(x => x.t).join("|") === "Női mosdó|Férfi mosdó|Akadálymentes mosdó",
    JSON.stringify(wc.sorok));
  t("egyik sem dolgozói vagy raktárból nyíló mosdó", !wc.sorok.some(x => ["OAX1A09", "OAX1A12", "OA20E26"].includes(x.c)),
    JSON.stringify(wc.sorok));
  t("a portához a földszinti női és akadálymentes mosdó a legközelebbi", wc.szint.OA00F07 === 0 && wc.szint.OA00F06 === 0,
    JSON.stringify(wc.szint));
  t("a sorra koppintva a portáról indul az útvonal", wc.ut.from === "OAX1A02" && wc.ut.to === wc.sorok[0].c && wc.ut.ut,
    JSON.stringify(wc.ut));
  t("ha csak az indulás adott (QR), a gyorsgombok onnan számolnak", /^innen: /.test(wc.qr || ""), wc.qr);
  t("a III. emeletről a női mosdó a II. emeleten, a férfi és az akadálymentes helyben",
    wc.harmadik.length === 3 && wc.harmadik[0].lv === 3 && wc.harmadik[1].lv === 4 && wc.harmadik[2].lv === 4,
    JSON.stringify(wc.harmadik));
  await p.evaluate(() => { S.from = S.to = S.sel = null; S.route = null; quick("BÜFÉ"); }); await p.waitForTimeout(300);
  t.eq("a büfé gomb a büfébe visz", (await st(p)).to, "OA00F04");
  const sub = await p.evaluate(() => { S.from = S.to = S.sel = null; S.route = null; renderPanel();
    return document.querySelector(".qgrid small") && document.querySelector(".qgrid small").textContent; });
  t("a gyorsgombok alcíme a portát mondja", sub === "a portától", sub);
  await p.close();
  p = await open(ctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1400 });
  t.eq("a megadott indulás felülírja a portát", (await st(p)).from, "OA00FK1");
  await p.close();

  // D) rövid alak, és a jó szintre ugrás
  p = await open(ctx, base + "#OA20E01", { settle: 1400 });
  let d = await st(p);
  t.eq("#KÓD kiválasztja a termet", d.sel, "OA20E01");
  t("a terem szintjére ugrik", d.lv === 3, "szint=" + d.lv);
  await p.close();

  // E) elgépelt vagy elavult link ne akassza meg az indulást
  p = await open(ctx, base + "#to=NINCSILYEN&from=SEM", { settle: 1400 });
  let e = await st(p);
  t("ismeretlen kódot elhagy", !e.from && !e.to && !e.sel, JSON.stringify(e));
  t("az app ettől még elindul", await p.evaluate(() => document.querySelectorAll(".floor").length > 0));
  await p.close();

  // a link végére írt paraméter (?utm=…, ?totem) a # után kerül: ne vigye el a célt
  p = await open(ctx, base + "#from=OA00FK1&to=OA10E18?utm_source=qr", { settle: 1400 });
  const vege = await st(p);
  t("a # utáni ?-es toldalék nem viszi el az útvonalat", vege.from === "OA00FK1" && vege.to === "OA10E18" && vege.ut,
    JSON.stringify(vege));
  await p.close();

  // F) a kiválasztás írja a címsort, a vissza gomb visszalép
  p = await open(ctx, base, { settle: 1400 });
  await p.evaluate(() => select("OA00F01")); await p.waitForTimeout(400);
  const h1 = (await st(p)).hash;
  await p.evaluate(() => select("OA00F03")); await p.waitForTimeout(400);
  const h2 = (await st(p)).hash;
  await p.goBack(); await p.waitForTimeout(700);
  const back = await st(p);
  t.eq("a kiválasztás a címsorba kerül", [h1, h2], ["#OA00F01", "#OA00F03"]);
  t("a vissza gomb az előző teremre lép", back.hash==="#OA00F01" && back.sel==="OA00F01", JSON.stringify(back));

  /* A kijelölés törlése (Esc, a térképre koppintás) a címet is üríti: a
     #OA00F01 korábban a címben maradt, és újratöltve visszajött a terem. */
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const esc = await st(p);
  t("Esc-re a kijelölés a címből is törlődik", !esc.sel && esc.hash === "", JSON.stringify(esc));
  await p.reload(); await p.waitForTimeout(1400);
  t("újratöltve sem jön vissza", !(await st(p)).sel);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await p.close();

  /* G) Egy csonka „%” (kézzel írt, levágott link) korábban URIError-t
     dobott: az indulás fele elmaradt — a service worker nem regisztrált, a
     címsor zárva maradt, és a kiválasztás többé nem került a címbe. */
  for (const [h, var_] of [["#from=OA00FK1%", { from:"OA00FK1" }], ["#%", {}],
                           ["#from=OA00FK1&to=OA10E18%E9", { from:"OA00FK1", to:"OA10E18" }]]) {
    p = await open(ctx, base + h, { settle: 1400 });
    const g = await p.evaluate(async () => ({ from:S.from, to:S.to, zar:urlLock,
      sw: !!(await navigator.serviceWorker.getRegistration()), lap: app.classList.contains("flat2d") }));
    await p.evaluate(() => select("OA20E01")); await p.waitForTimeout(300);
    const cim = await p.evaluate(() => location.hash);
    t(`${h}: a link ép része érvényesül`, g.from == (var_.from || null) && g.to == (var_.to || null), JSON.stringify(g));
    t(`${h}: az indulás végigfut (service worker, lapos alaprajz, nyitott címsor)`, g.sw && g.lap && !g.zar && cim.includes("OA20E01"),
      JSON.stringify({ ...g, cim }));
    t(`${h}: nincs JS hiba`, p.jsErrors.length === 0, p.jsErrors.join(" | "));
    await p.close();
  }

  // H) a rövid alak toldalékkal (#OA10E18?utm_source=qr) is kiválaszt
  p = await open(ctx, base + "#OA10E18?utm_source=qr", { settle: 1400 });
  t.eq("a rövid alak a toldalék mellett is kiválaszt", (await st(p)).sel, "OA10E18");
  await p.close();

  // I) a saját épület nem létező kódja nem tűnik el szó nélkül
  p = await open(ctx, base + "#OA99X99", { settle: 1400 });
  const tos = await p.evaluate(() => { const e = document.getElementById("toast"); return e ? e.textContent : ""; });
  t("az OA nem létező kódjára felirat szól", tos.includes("OA99X99"), tos);
  await p.close();

  /* J) A Porta gomb is CÉL, mint a társai: korábban az indulást írta át, és a
     totemen vagy egy QR-kód után elveszett, hol áll a hallgató. */
  p = await open(ctx, base + "#from=OA30E01", { settle: 1400 });
  await p.click('.qbtn[data-q="@ENTRY"]'); await p.waitForTimeout(500);
  const po = await p.evaluate(() => ({ from:S.from, to:S.to, start:START, ut:!!S.route }));
  t("indulással a Porta gomb a portához tervez, az indulás marad", po.from === "OA30E01" && po.to === po.start && po.ut, JSON.stringify(po));
  await p.close();
  p = await open(ctx, base, { settle: 1400 });
  await p.click('.qbtn[data-q="@ENTRY"]'); await p.waitForTimeout(500);
  const po2 = await p.evaluate(() => ({ from:S.from, to:S.to, sel:S.sel, start:START }));
  t("indulás nélkül megmutatja a portát, de nem állítja indulásnak", !po2.from && !po2.to && po2.sel === po2.start, JSON.stringify(po2));

  /* K) A foglalható termek listája telefonon zsákutca volt: vissza gomb nem
     volt, és a rendszer Vissza gombja kilépett az appból. */
  await p.evaluate(() => kijelolesTorol());
  await p.click('.qbtn[data-q="@ROOMS"]'); await p.waitForTimeout(600);
  const lista = await p.evaluate(() => ({ termek: S.termek, gomb: !!document.getElementById("listaVissza") }));
  await p.goBack(); await p.waitForTimeout(500);
  const visszaL = await p.evaluate(() => ({ termek: S.termek, gyors: !!document.querySelector(".qgrid"), url: location.pathname }));
  t("a listán van Vissza gomb, és a rendszer Vissza gombja a listát zárja, nem az appot",
    lista.termek && lista.gomb && !visszaL.termek && visszaL.gyors && /index\.html$/.test(visszaL.url), JSON.stringify({ lista, visszaL }));
  await p.click('.qbtn[data-q="@ROOMS"]'); await p.waitForTimeout(600);
  await p.click("#listaVissza"); await p.waitForTimeout(500);
  t("a lista Vissza gombja is a kezdőpanelre visz", await p.evaluate(() => !S.termek && !!document.querySelector(".qgrid")));
  /* A listából választva a lista bejegyzése cserélődik: korábban utána egy
     holt Vissza-lépés maradt (ugyanaz a cím, semmi nem változott). */
  await p.click('.qbtn[data-q="WC"]'); await p.waitForTimeout(500);
  await p.click("[data-wc]"); await p.waitForTimeout(600);
  const valasztva = await p.evaluate(() => ({ to: S.to, lista: !!(history.state && history.state.lista) }));
  await p.goBack(); await p.waitForTimeout(500);
  const vissza1 = await p.evaluate(() => ({ to: S.to, lista: !!(history.state && history.state.lista), hash: location.hash }));
  t("a listából választás után az első Vissza a lista előtti állapotra visz, nem egy holt lépésre",
    !!valasztva.to && !valasztva.lista && !vissza1.to && !vissza1.lista, JSON.stringify({ valasztva, vissza1 }));

  /* L) Az „Ide megyek” után az útvonal a teremkártya alatt, telefonon a
     képernyő alján túl jelent meg: úgy tűnt, nem történt semmi. Most a panel
     odagörget, és az útvonal eleje a képernyőn van. */
  // az Audmax: az órarendi kártyájával az útvonal görgetés nélkül 1176 px-en, a 844 px-es képernyőn túl kezdődött
  await p.evaluate(() => select("OA10E18")); await p.waitForTimeout(900);
  await p.click("#bT"); await p.waitForTimeout(700);
  const ideUt = await p.evaluate(() => { const s = document.getElementById("routeSec"), b = s && s.getBoundingClientRect();
    return { van: !!s, to: S.to, teteje: b ? Math.round(b.top) : null, alja: innerHeight }; });
  t("az „Ide megyek” után az útvonal eleje a képernyőn látszik", ideUt.van && ideUt.to === "OA10E18" && ideUt.teteje >= 0 && ideUt.teteje < ideUt.alja - 200,
    JSON.stringify(ideUt));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await p.close();
});

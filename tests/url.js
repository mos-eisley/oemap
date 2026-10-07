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
  t("ismeretlen kódot csendben elhagy", !e.from && !e.to && !e.sel, JSON.stringify(e));
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
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await p.close();
});

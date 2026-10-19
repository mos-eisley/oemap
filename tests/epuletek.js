/* Épületválasztó: az egyetem mind a 39 épülete bekerül, de alaprajz egyelőre
   csak az OA-hoz van. Két dolgot őriz ez a fájl.

   Az egyik, hogy a lista NEM mossa össze a kettőt: aminek nincs alaprajza, az
   látszik (cím, szintek, helyiségek), de nem nyitható meg — különben a
   hallgató hiába kattintana rá, és azt hinné, elromlott az app. Ha pedig ki
   sem írnánk, azt hihetné, nincs is ilyen épület.

   A másik, hogy a nyilvántartás nélkül is működik az app. A data/epuletek.json
   a /data/ ágon hálózat-először jön; ha nem érkezik meg (offline első indulás,
   hálózati hiba), a választógomb el sem jelenik meg, és a fejlécben a statikus
   épületnév marad — pontosan a nyilvántartás előtti viselkedés. */
const { run, open, DESKTOP } = require("./lib");

const lista = page => page.evaluate(() => {
  const sorok = [...document.querySelectorAll("#epvlist .epvrow")];
  return {
    nyitva: document.getElementById("epvlist").classList.contains("open"),
    gomb: !document.getElementById("epvBtn").hidden,
    statikus: !document.getElementById("epvStat").hidden,
    nev: document.getElementById("epvNev").textContent.trim(),
    db: sorok.length,
    telephely: [...document.querySelectorAll("#epvlist h4")].map(h => h.textContent.trim()),
    nyithato: sorok.filter(b => !b.classList.contains("off")).map(b => b.dataset.ep),
    itt: sorok.filter(b => b.getAttribute("aria-current") === "true").map(b => b.dataset.ep),
    tiltott: sorok.filter(b => b.getAttribute("aria-disabled") === "true").length,
    szoveg: Object.fromEntries(sorok.map(b => [b.dataset.ep, b.textContent.replace(/\s+/g, " ").trim()])),
    uzenet: (document.getElementById("epvMsg") || {}).hidden === false
      ? document.getElementById("epvMsg").textContent.trim() : ""
  };
});

run("épületválasztó", async ({ t, ctx, base }) => {
  const p = await open(ctx, base);

  // a nyilvántartás megjött: a gomb veszi át a statikus név helyét
  let L = await lista(p);
  t("a nyilvántartás betöltött, és a gomb vette át a fejlécet",
    L.gomb && !L.statikus, `gomb=${L.gomb}, statikus=${L.statikus}`);
  t("a gomb a mostani épületet mutatja", L.nev === "OA épület", L.nev);
  t("zárva indul", !L.nyitva);

  await p.click("#epvBtn");
  await p.waitForTimeout(250);
  L = await lista(p);
  t("kattintásra kinyílik", L.nyitva);
  t("mind a 39 épület bent van", L.db === 39, L.db + " sor");
  t("telephely szerint csoportosít", L.telephely.length === 8,
    L.telephely.join(" | "));
  t("a Bécsi úti telephely is ott van",
    L.telephely.some(s => /1034/.test(s)), L.telephely.join(" | "));

  /* Ez a lényeg: akinek kész az adata, az megnyitható, a többi csak adatlap.
     A listát nem írjuk be kézzel — az épületek száma nő, ahogy a geometriájuk
     elkészül —, hanem a nyilvántartáshoz mérjük: a felület pontosan azt
     mutassa megnyithatónak, amit az adat annak mond. */
  const reg = JSON.parse(require("fs").readFileSync(
    require("path").join(__dirname, "..", "data", "epuletek.json"), "utf8"));
  const navReg = Object.values(reg.epuletek).filter(e => e.navigalhato)
    .map(e => e.kod).sort();
  // a lista telephely szerint csoportosít, nem ábécé szerint: a halmaz számít
  t.eq("pontosan a nyilvántartás szerinti épületek nyithatók meg",
    L.nyithato.slice().sort(), navReg);
  t.eq("és az OA van megjelölve mostaniként", L.itt, ["OA"]);
  t("a többi sor tiltott", L.tiltott === L.db - navReg.length,
    `${L.tiltott} tiltott, ${L.db} sorból ${navReg.length} nyitható`);

  t("az OA sora az „itt vagy”-ot mondja", /itt vagy/.test(L.szoveg.OA || ""), L.szoveg.OA);
  t("az OD soráról lekerült az „alaprajz még nincs”",
    !/alaprajz még nincs/.test(L.szoveg.OD || ""), L.szoveg.OD);
  /* SA-nak csak helyszínrajza van, alaprajza sosem lesz ezekből a forrásokból:
     ezért biztos mérce arra, hogy a „nincs alaprajz” állapot kiíródik. */
  t("akinek nincs adata, annál ott marad (SA)",
    /alaprajz még nincs/.test(L.szoveg.SA || ""), L.szoveg.SA);

  // a Tervtár adatai: cím, szint, helyiség — ezért érdemes kiírni a sort
  t("az OD sorában ott a címe és a méretei",
    /Doberdó/.test(L.szoveg.OD || "") && /9 szint/.test(L.szoveg.OD || "")
      && /231 helyiség/.test(L.szoveg.OD || ""), L.szoveg.OD);
  t("amiről csak helyszínrajz van, az is ott van (SA)",
    !!L.szoveg.SA && /alaprajz még nincs/.test(L.szoveg.SA), L.szoveg.SA);

  // a megnyitható sor bezárja a listát (ma ez mindig a mostani épület)
  await p.click('#epvlist .epvrow[data-ep="OA"]');
  await p.waitForTimeout(250);
  t("a megnyitható sorra kattintva bezárul", !(await lista(p)).nyitva);

  // Escape és kívülre kattintás is zár
  await p.click("#epvBtn"); await p.waitForTimeout(200);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  t("Escape zárja", !(await lista(p)).nyitva);

  // nyelvvel együtt újraépül
  await p.click("#epvBtn"); await p.waitForTimeout(150);
  await p.click("#langEn"); await p.waitForTimeout(250);
  L = await lista(p);
  t("angolul is a saját szövegét adja",
    /no floor plan yet/.test(L.szoveg.SA || ""), L.szoveg.SA);
  await p.click("#langHu"); await p.waitForTimeout(200);
  await p.close();

  /* Egy másik épület helyiségkódjára mutató link eddig csendben eltűnt: az
     applyUrl() elhagyta az ismeretlen kódot, és a hallgató ugyanezt az
     alaprajzot látta, minden jelzés nélkül. Amelyik épület nem nyitható meg,
     ott legalább megnevezzük. */
  const p2 = await open(ctx, base + "#SA00F01");
  const L2 = await lista(p2);
  t("nem megnyitható épület kódjára mutató link megnyitja a listát", L2.nyitva);
  t("és megmondja, melyik épületé a kód",
    /SA épület/.test(L2.uzenet), L2.uzenet || "(nincs üzenet)");
  t("a saját alaprajz közben megmarad",
    (await p2.evaluate(() => document.querySelectorAll(".floor").length)) > 0);
  t("nincs JS hiba a linkes úton", p2.jsErrors.length === 0, p2.jsErrors.join(" | "));
  await p2.close();

  /* Megnyitható épület kódjára mutató link viszont ÉRVÉNYESÜL: a falra
     ragasztott QR-kód a másik épületben is odavisz, ahová mutat. */
  const p3b = await open(ctx, base + "#OD20E01", { settle: 1800 });
  const Lb = await p3b.evaluate(() => ({
    epulet: (Object.keys(ROOM)[0] || "").slice(0, 2),
    sel: S.sel, level: S.level, nev: document.getElementById("epvNev").textContent.trim(),
    hash: location.hash, alcim: document.getElementById("sub").textContent.trim()
  }));
  t("megnyitható épület kódja átvált arra az épületre", Lb.epulet === "OD", Lb.epulet);
  t("és a linkben megadott termet ki is választja", Lb.sel === "OD20E01", String(Lb.sel));
  t("a terem szintjére ugrik", Lb.level === 3, "szint " + Lb.level);
  t("a fejléc az OD-t mondja", /OD/.test(Lb.nev), Lb.nev);
  t("a cím megmarad", /OD20E01/.test(Lb.hash), Lb.hash);
  /* A fejléc alcíme az OA-nál beégetett szöveg volt: a Doberdó úton állva a
     Bécsi utat hirdette. */
  t("az alcím az új épület címét mondja, nem az OA-ét",
    /Doberdó/.test(Lb.alcim) && !/Bécsi/.test(Lb.alcim), Lb.alcim);
  /* A kart a funkció szerinti tervlap fejbélyegzőjéből nyerjük ki; az OD-é a
     Rejtő Sándor kar, nem a NIK. Máshol ez az adat nincs meg. */
  t("és a használó kart is, a sajátját",
    /Rejtő/.test(Lb.alcim) && !/Neumann/.test(Lb.alcim), Lb.alcim);
  t("nincs JS hiba az átváltó linken", p3b.jsErrors.length === 0, p3b.jsErrors.join(" | "));
  await p3b.close();

  /* Épületváltás. Valódi második épület geometriája még nincs, ezért a mérce
     maga az OA adata, MÁS KÓD ALATT kiszolgálva: ha a rács, a járhatósági
     maszkok és a portálgráf helyesen épülnek újra, az átnevezett épületben
     ugyanannak az útvonalnak kell kijönnie, méterre. Ez a váltás legszigorúbb
     próbája — egy ottmaradt gyorsítótártól vagy egy újrakötött Map-től
     csendben a RÉGI épület gráfján futna a keresés. */
  const p4 = await open(ctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1500 });
  const sumOf = pg => pg.$eval(".sum", el => el.textContent.replace(/\s+/g, " ").trim());
  const epOf = pg => pg.evaluate(() => (Object.keys(ROOM)[0] || "").slice(0, 2));
  const oaSum = await sumOf(p4);
  t("van mérhető referencia-útvonal az OA-ban", /\d/.test(oaSum), oaSum);

  // az OA adata OD kód alatt: csak a kódok íródnak át, minden más változatlan
  const fix = await p4.evaluate(() => JSON.stringify(D_OA).replace(/"OA/g, '"OD'));
  await ctx.route("**/data/epuletek/od.json",
    r => r.fulfill({ contentType: "application/json", body: fix }));
  /* Amit egy valódi második épületnél is fel kell venni: a portája és a
     nyilvántartásban a megnyithatóság. A teszt ugyanazt teszi, amit a
     fejlesztő tenne — nem kerüli meg az app ellenőrzését. */
  await p4.evaluate(() => { PORTA.OD = "ODX1A02";
    EPULETEK.epuletek.OD.navigalhato = true; epvRender(); });

  await p4.click("#epvBtn"); await p4.waitForTimeout(200);
  await p4.click('#epvlist .epvrow[data-ep="OD"]');
  await p4.waitForTimeout(1500);

  const u = await p4.evaluate(() => ({
    nev: document.getElementById("epvNev").textContent.trim(),
    szint: document.getElementById("rail").children.length,
    from: S.from, to: S.to, hash: location.hash, lista: document.getElementById("epvlist").classList.contains("open")
  }));
  t("a váltás után az OD van betöltve", (await epOf(p4)) === "OD", await epOf(p4));
  t("a fejléc az új épületet mondja", /OD/.test(u.nev), u.nev);
  t("a lista bezárult", !u.lista);
  t("a régi épület útvonala és címsora törlődött",
    !u.from && !u.to && !u.hash, JSON.stringify(u));
  t("a szintválasztó újraépült", u.szint === 7, u.szint + " szint");

  await p4.evaluate(() => { location.hash = "#from=OD00FK1&to=OD10E18"; });
  await p4.waitForTimeout(1200);
  const odSum = await sumOf(p4);
  t("az átnevezett épületben méterre ugyanaz az útvonal jön ki",
    odSum === oaSum, `OA: ${oaSum}  |  OD: ${odSum}`);

  // vissza az OA-ra: annak az adata beégetve van, hálózat nélkül is megy
  await p4.click("#epvBtn"); await p4.waitForTimeout(250);
  await p4.click('#epvlist .epvrow[data-ep="OA"]');
  await p4.waitForTimeout(1500);
  t("vissza lehet váltani az OA-ra", (await epOf(p4)) === "OA", await epOf(p4));

  /* Hiányos adattal NEM váltunk: falak nélkül a Dijkstra mindenen átmenne,
     lépcső nélkül a szintek nem érnének össze. Inkább marad adatlap. */
  await ctx.route("**/data/epuletek/oc.json", r => r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ meta: { w: 10, h: 10 }, levels: [{ level: 0 }],
                           rooms: [{ id: 0, code: "OC00F01", poly: [[0,0]] }] }) }));
  await p4.evaluate(() => { PORTA.OC = "OCX1A02";
    EPULETEK.epuletek.OC.navigalhato = true; epvRender(); });
  await p4.click("#epvBtn"); await p4.waitForTimeout(250);
  await p4.click('#epvlist .epvrow[data-ep="OC"]');
  await p4.waitForTimeout(900);
  const L4 = await lista(p4);
  t("hiányos adattal nem vált át", (await epOf(p4)) === "OA", await epOf(p4));
  t("és megmondja, hogy nem érhető el",
    /nem érhető el/.test(L4.uzenet), L4.uzenet || "(nincs üzenet)");
  t("nincs JS hiba a váltás egyik ágán sem",
    p4.jsErrors.length === 0, p4.jsErrors.join(" | "));
  await p4.close();

  /* A nyilvántartás nélkül is el kell indulnia: ez a /data/ ágon hálózat-először
     jön, tehát egy offline első indulás vagy egy hálózati hiba valóban előfordul. */
  await ctx.route("**/data/epuletek.json", r => r.fulfill({ status: 404, body: "" }));
  const p3 = await open(ctx, base);
  const L3 = await lista(p3);
  t("nyilvántartás nélkül nincs gomb, marad a statikus név",
    !L3.gomb && L3.statikus, `gomb=${L3.gomb}, statikus=${L3.statikus}`);
  t("és az app ettől még elindul",
    (await p3.evaluate(() => document.querySelectorAll(".floor").length)) > 0);
  /* A letiltott kérés maga naplóz egy 404-et — azt vártuk. Ami nem várt: egy
     kivétel vagy bármi más hiba a nyilvántartás nélküli úton. */
  const maradek = p3.jsErrors.filter(s => !/epuletek\.json|404/.test(s));
  t("a 404-en kívül nincs hiba a nyilvántartás nélküli úton",
    maradek.length === 0, maradek.join(" | "));
  await p3.close();
}, DESKTOP);

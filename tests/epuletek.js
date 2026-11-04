/* Épületválasztó: az egyetem mind a 39 épülete bekerül, de megnyitni csak azt
   lehet, aminek kész az adata (most hetet). Három dolgot őriz ez a fájl.

   Az egyik, hogy a választó NEM mossa össze a kettőt: aminek nincs alaprajza,
   az látszik (cím, szintek, helyiségek), de nem nyitható meg — különben a
   hallgató hiába kattintana rá, és azt hinné, elromlott az app. Ha pedig ki
   sem írnánk, azt hihetné, nincs is ilyen épület.

   A másik, hogy a nyilvántartás nélkül is működik az app. A data/epuletek.json
   a /data/ ágon hálózat-először jön; ha nem érkezik meg (offline első indulás,
   hálózati hiba), a választógomb el sem jelenik meg, és a fejlécben a statikus
   épületnév marad — pontosan a nyilvántartás előtti viselkedés.

   A harmadik, hogy a váltás a teljes állapotot újraépíti: ezt valódi
   épületeken mért aranyértékekkel nézzük (lent). A térkép maga, az
   alapértelmezett épület és a GPS-javaslat a tests/valaszto.js-ben. */
const { run, open, DESKTOP } = require("./lib");

/* A választó Magyarország térképéről indul: település → épület. A felületet
   úgy járjuk be, ahogy a hallgató: a településsorokra kattintva, és minden
   településen összeszedjük az épületsorokat. Így az is kiderül, ha egy épület
   egyik településhez sem kerülne (és sehonnan nem lehetne elérni). */
const allapot = page => page.evaluate(() => ({
  nyitva: document.getElementById("epvlist").open,
  gomb: !document.getElementById("epvBtn").hidden,
  statikus: !document.getElementById("epvStat").hidden,
  nev: document.getElementById("epvNev").textContent.trim(),
  cim: ((document.getElementById("epvCim") || {}).textContent || "").trim(),
  telepulesek: [...document.querySelectorAll('#epvlist .epvsor[data-epv^="tel:"]')].map(b => b.dataset.epv.slice(4)),
  uzenet: (document.getElementById("epvMsg") || {}).hidden === false
    ? document.getElementById("epvMsg").textContent.trim() : ""
}));
const sorok = page => page.evaluate(() => [...document.querySelectorAll("#epvlist .epvrow")].map(b => ({
  kod: b.dataset.ep, off: b.classList.contains("off"), most: b.getAttribute("aria-current") === "true",
  szoveg: b.textContent.replace(/\s+/g, " ").trim() })));
async function bejar(page) {
  const { telepulesek } = await allapot(page), ki = {};
  for (const tl of telepulesek) {
    await page.click(`#epvlist [data-epv="tel:${tl}"]`); await page.waitForTimeout(80);
    for (const s of await sorok(page)) (ki[s.kod] = ki[s.kod] || []).push({ ...s, tel: tl });
    await page.click('#epvlist [data-epv="vissza"]'); await page.waitForTimeout(80);
  }
  return ki;
}

run("épületválasztó", async ({ t, ctx, browser, base }) => {
  const p = await open(ctx, base);

  // a nyilvántartás megjött: a gomb veszi át a statikus név helyét
  let L = await allapot(p);
  t("a nyilvántartás betöltött, és a gomb vette át a fejlécet",
    L.gomb && !L.statikus, `gomb=${L.gomb}, statikus=${L.statikus}`);
  t("a gomb a mostani épületet mutatja", L.nev === "OA épület", L.nev);
  t("zárva indul", !L.nyitva);

  await p.click("#epvBtn");
  await p.waitForTimeout(250);
  L = await allapot(p);
  t("kattintásra kinyílik, Magyarországgal", L.nyitva && L.cim === "Épület választása", L.cim);
  t("a települések: Budapest, Székesfehérvár, Nagymaros és a hely nélküliek",
    L.telepulesek.join("|") === "Budapest|Székesfehérvár|Nagymaros|", L.telepulesek.join("|"));

  /* Ez a lényeg: akinek kész az adata, az megnyitható, a többi csak adatlap.
     A listát nem írjuk be kézzel — az épületek száma nő, ahogy a geometriájuk
     elkészül —, hanem a nyilvántartáshoz mérjük: a felület pontosan azt
     mutassa megnyithatónak, amit az adat annak mond. */
  const reg = JSON.parse(require("fs").readFileSync(
    require("path").join(__dirname, "..", "data", "epuletek.json"), "utf8"));
  const navReg = Object.values(reg.epuletek).filter(e => e.navigalhato)
    .map(e => e.kod).sort();
  const B = await bejar(p);
  const egyszer = Object.keys(B).filter(k => B[k].length === 1);
  t("mind a 39 épület pontosan egy településnél van (sehonnan nem hiányzik, kétszer sem áll)",
    Object.keys(reg.epuletek).every(k => B[k] && B[k].length === 1) && egyszer.length === 39,
    Object.keys(reg.epuletek).filter(k => !B[k] || B[k].length !== 1).join(", ") || egyszer.length);
  const sor = k => (B[k] || [{}])[0];
  t.eq("pontosan a nyilvántartás szerinti épületek nyithatók meg",
    Object.keys(B).filter(k => !sor(k).off).sort(), navReg);
  t.eq("és az OA van megjelölve mostaniként", Object.keys(B).filter(k => sor(k).most), ["OA"]);
  t("az OA sora mondja, hogy most az van nyitva", /most ez van nyitva/.test(sor("OA").szoveg || ""), sor("OA").szoveg);
  t("az OD sorában nincs „alaprajz még nincs”", !/alaprajz még nincs/.test(sor("OD").szoveg || ""), sor("OD").szoveg);
  /* SA-nak csak helyszínrajza van, alaprajza sosem lesz ezekből a forrásokból:
     ezért biztos mérce arra, hogy a „nincs alaprajz” állapot kiíródik. */
  t("akinek nincs adata, annál ott áll (SA), és a hely nélküliek közt van",
    /alaprajz még nincs/.test(sor("SA").szoveg || "") && sor("SA").tel === "", JSON.stringify(sor("SA")));
  // a Tervtár adatai: cím, szint, helyiség — ezért érdemes kiírni a sort
  t("az OD sorában ott a címe és a méretei, és Budapestnél áll",
    /Doberdó/.test(sor("OD").szoveg || "") && /9 szint/.test(sor("OD").szoveg || "")
      && /231 helyiség/.test(sor("OD").szoveg || "") && sor("OD").tel === "Budapest", JSON.stringify(sor("OD")));

  /* Ami nem nyitható meg, annak az adatlapja jön (cím, szintek), megnyitó gomb
     nélkül; különben a hallgató hiába kattintana, és azt hinné, elromlott. */
  await p.click('#epvlist [data-epv="tel:Budapest"]'); await p.waitForTimeout(100);
  await p.click('#epvlist .epvrow[data-ep="KB"]'); await p.waitForTimeout(150);
  const kb = await p.evaluate(() => ({ cim: document.getElementById("epvCim").textContent,
    nyit: !!document.querySelector('#epvlist [data-epv^="nyit:"]'), alap: !!document.querySelector('#epvlist [data-epv^="alap:"]'),
    szoveg: document.querySelector("#epvlist .epvkartya").textContent.replace(/\s+/g, " ") }));
  t("a megnyithatatlan épület sora az adatlapját nyitja, megnyitó és alapértelmezett-gomb nélkül",
    kb.cim === "KB épület" && !kb.nyit && !kb.alap && /Bécsi út 104/.test(kb.szoveg) && /nincs alaprajz/.test(kb.szoveg), JSON.stringify(kb));
  t("és az épület semmit nem váltott", (await p.evaluate(() => epItt())) === "OA");

  // a megnyitható sor bezárja a választót (ma ez a mostani épület)
  await p.click('#epvlist [data-epv="vissza"]'); await p.waitForTimeout(100);
  await p.click('#epvlist .epvrow[data-ep="OA"]');
  await p.waitForTimeout(250);
  t("a mostani épület sorára kattintva bezárul", !(await allapot(p)).nyitva);

  /* Az Esc csak az ablakot zárja: a kiválasztott terem marad. Korábban a lista
     Esc-je a globális kezelőig jutott, és a termet is törölte. */
  await p.evaluate(() => select("OA10E18")); await p.waitForTimeout(150);
  await p.click("#epvBtn"); await p.waitForTimeout(200);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const esc = await p.evaluate(() => ({ nyitva: document.getElementById("epvlist").open, sel: S.sel,
    fokusz: document.activeElement && document.activeElement.id }));
  t("Escape zárja, a kiválasztott terem marad, a fókusz a gombra kerül vissza",
    !esc.nyitva && esc.sel === "OA10E18" && esc.fokusz === "epvBtn", JSON.stringify(esc));
  // a háttérre kattintva is zár (asztalon a doboz körül; telefonon a doboz az egész kép, ott a ×)
  await p.click("#epvBtn"); await p.waitForTimeout(200);
  await p.click('#epvlist [data-epv="zar"]'); await p.waitForTimeout(200);
  t("a × zárja", !(await allapot(p)).nyitva);

  // nyelvvel együtt újraépül
  await p.click("#langEn").catch(() => p.evaluate(() => { S.lang = "en"; applyLang(); }));
  await p.evaluate(() => { if (S.lang !== "en") { S.lang = "en"; applyLang(); } });
  await p.click("#epvBtn"); await p.waitForTimeout(150);
  await p.click('#epvlist [data-epv="tel:"]'); await p.waitForTimeout(150);
  const en = await p.evaluate(() => ({ cim: document.getElementById("epvCim").textContent,
    sa: (document.querySelector('#epvlist .epvrow[data-ep="SA"]') || {}).textContent || "" }));
  t("angolul is a saját szövegét adja", en.cim === "No location" && /no floor plan yet/.test(en.sa), JSON.stringify(en));
  await p.click('#epvlist [data-epv="zar"]'); await p.waitForTimeout(150);
  await p.evaluate(() => { S.lang = "hu"; applyLang(); });
  t("nincs JS hiba a választóban", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await p.close();

  /* Egy másik épület helyiségkódjára mutató link eddig csendben eltűnt: az
     applyUrl() elhagyta az ismeretlen kódot, és a hallgató ugyanezt az
     alaprajzot látta, minden jelzés nélkül. Amelyik épület nem nyitható meg,
     ott legalább megnevezzük, és az adatlapját mutatjuk. */
  const p2 = await open(ctx, base + "#SA00F01");
  await p2.waitForFunction(() => document.getElementById("epvlist").open, null, { timeout: 8000 }).catch(() => {});
  const L2 = await allapot(p2);
  t("nem megnyitható épület kódjára mutató link megnyitja a választót", L2.nyitva);
  t("és megmondja, melyik épületé a kód", /SA épület/.test(L2.uzenet), L2.uzenet || "(nincs üzenet)");
  t("az adatlapján", L2.cim === "SA épület", L2.cim);
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

  /* Épületváltás valódi épületeken, aranyértékekkel. Korábban a mérce az OA
     adata volt más kód alatt: ugyanaz a rács, ugyanazok a cellák, ezért egy
     ottmaradt gyorsítótár is ugyanazt az útvonalat adta — a fájl akkor is
     zöld volt, ha váltáskor a rács, a helyiség-cellák és a portálgráf
     egyáltalán nem épült újra (élesben ettől a többi épületben a helyiségek
     0–1%-a lett volna elérhető). Most minden megnyitható épületben négy
     számot mérünk a portától: hány kódolt helyiséghez NINCS út (ki), az
     elérhetők útvonalainak összhossza méterre (hossz), és a lépcsős meg a
     liftes gráf éleinek száma (el, lel). Az élszám a D.stairs-ből nem
     vezethető le képlettel: az OD-ben három lépcsőpont 7 m-nél messzebb esik a
     járható maszktól, és a nodesOf() kiejti őket (így a −2. szint lépcsője és
     a földszint–félemelet közti 2-es lépcső nem kerül a gráfba), ezért ez is
     mért érték. Két irányba szigorú, mint a tests/eler.js kivétellistája:
     ha egy adatjavítás bekötött egy helyiséget, vagy egy új épület nyílik meg,
     itt kell átírni. */
  const ARANY = {
    OA: { ki: 3, hossz: 13223, el: 26, lel: 30 }, FF: { ki: 3, hossz: 1003, el: 18, lel: 0 },
    FK: { ki: 11, hossz: 3686, el: 8, lel: 0 }, KH: { ki: 14, hossz: 7270, el: 22, lel: 0 },
    KT: { ki: 8, hossz: 15059, el: 86, lel: 0 }, OC: { ki: 6, hossz: 2466, el: 28, lel: 0 },
    OD: { ki: 12, hossz: 4103, el: 14, lel: 0 }
  };
  const aranyOf = m => ({ ki: m.ki, hossz: m.hossz, el: m.el, lel: m.lel });
  const p4 = await open(ctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1500 });
  const epOf = pg => pg.evaluate(() => epItt());
  /* A váltás végét várjuk, nem az elejét: az epItt() már az epuletAllit()
     első lépésében átáll, a szintdobozok viszont csak a végén lesznek az új
     épületéi. Hogy megtörtént-e, azt a hívó méri (ep), nem itt nyeljük el. */
  const kesz = (pg, kod) => pg.waitForFunction(k => epItt() === k && !epvTolt &&
      [...document.querySelectorAll(".floor")].map(f => f.dataset.lv).join() === LV.join(),
    kod, { timeout: 15000 }).then(() => pg.waitForTimeout(300).then(() => true), () => false);
  // a felületen át: a település sora, aztán az épületé (ami megnyitható, rögtön nyílik)
  const valtUI = async (pg, kod) => {
    await pg.click("#epvBtn"); await pg.waitForTimeout(200);
    const tel = await pg.evaluate(k => epvTel(EPULETEK.epuletek[k]), kod);
    await pg.click(`#epvlist [data-epv="tel:${tel}"]`); await pg.waitForTimeout(100);
    await pg.click(`#epvlist .epvrow[data-ep="${kod}"]`);
    return kesz(pg, kod);
  };
  // a gráf aláírása: csúcsonként az élek száma — egy ki nem ürített gráf több élt hordoz
  const meres = pg => pg.evaluate(() => {
    const r1 = ROOM[START]; if (!r1) return { hiba: "nincs porta: " + START };
    const k = dijkstra(r1, PORTAL, null), kodolt = D.rooms.filter(r => r.code);
    let ki = 0, hossz = 0;
    for (const r of kodolt) { const rt = routeTo(k, r1, r); if (!rt) ki++; else hossz += analyse(rt).dist; }
    const elek = m => [...m.values()].reduce((n, v) => n + v.length, 0);
    return { ep: epItt(), porta: START, kodolt: kodolt.length, ki, hossz: Math.round(hossz),
      el: elek(PORTAL), lel: elek(PORTAL_LIFT),
      graf: [...PORTAL].map(([c, v]) => c + ":" + v.length).sort().join(","),
      szint: S.level, szintek: LV.join(","), rail: document.getElementById("rail").children.length,
      itt: epItt(),
      aktivLatszik: !!(FLOOR[S.level] && FLOOR[S.level].box.isConnected
        && FLOOR[S.level].box.getAttribute("aria-hidden") !== "true") };
  });
  /* Tisztaság: a váltás után egyetlen tárolóban sem maradhat régi bejegyzés.
     A teszt maga üríti a tárolókat, és maga hívja újra az öt építő
     függvényt ugyanerre az adatra; ha az eredmény eltér a váltás utánitól,
     valamelyik ürítő ciklus hiányzik. A CLEAR lustán töltődik: ami benne volt,
     azt újraszámolva kell visszakapni, és ami nem az új épület szintje, annak
     benne sem lehetett. Amit ez NEM fog meg: egy építő elavult bemenetét
     (pl. ha a LIFTS újrakötése maradna ki) — arra az aranyérték a háló. A
     szintdobozokat (FLOOR) a buildFloors építi: azoknak pontosan az új
     épület szintjeinek kell lenniük, és mind a lapon. */
  const tiszta = pg => pg.evaluate(() => { try {
    const jel = v => {
      if (v == null || typeof v !== "object") return String(v);
      if (ArrayBuffer.isView(v)) { let h = 0; for (let i = 0; i < v.length; i++) h = (h * 31 + v[i]) | 0; return v.length + "#" + h; }
      return JSON.stringify(v);
    };
    const obj = o => Object.keys(o).sort().map(k => k + "=" + jel(o[k])).join(";");
    const map = m => [...m].map(([k, v]) => k + "=" + jel(v)).sort().join(";");
    const kep = () => ({
      geo: JSON.stringify({ LV, LVI, GW, GH, RES, CELLS, PW, PH, BB, OFFX, OFFY, START }),
      ROOM: Object.keys(ROOM).sort().join(), MASK: obj(MASK), CELLLIST: obj(CELLLIST), CLEAR: obj(CLEAR),
      RCELL: obj(RCELL), STAIRXY: obj(STAIRXY), PORTAL: map(PORTAL), PORTAL_LIFT: map(PORTAL_LIFT),
      LIFT_LEVELS: [...LIFT_LEVELS].sort().join(), LIFTS: jel(LIFTS)
    });
    const elotte = kep(), lusta = Object.keys(CLEAR);
    for (const o of [MASK, CELLLIST, CLEAR, RCELL, STAIRXY]) for (const k of Object.keys(o)) delete o[k];
    PORTAL.clear(); PORTAL_LIFT.clear(); LIFT_LEVELS.clear();
    epuletGeo(D); epuletStart(D); epuletRacs(D); epuletRcell(D); epuletPortal(D);
    for (const k of lusta) if (LV.some(l => String(l) === k)) clearance(LV.find(l => String(l) === k));
    const utana = kep();
    const elter = Object.keys(elotte).filter(k => elotte[k] !== utana[k]);
    const fl = Object.keys(FLOOR).sort().join(), lv = LV.map(String).sort().join();
    if (fl !== lv || !Object.values(FLOOR).every(F => F.box.isConnected)) elter.push("FLOOR");
    return { elter, clear: lusta.length };
  } catch (e) { return { elter: ["kivétel: " + e.message] }; } });
  const oa0 = await meres(p4);
  t.eq("OA: a portától mért aranyértékek", { porta: oa0.porta, ...aranyOf(oa0) }, { porta: "OAX1A02", ...ARANY.OA });

  await valtUI(p4, "OD");
  const u = await p4.evaluate(() => ({
    nev: document.getElementById("epvNev").textContent.trim(),
    from: S.from, to: S.to, hash: location.hash, lista: document.getElementById("epvlist").open
  }));
  t("a váltás után az OD van betöltve", (await epOf(p4)) === "OD", await epOf(p4));
  t("a fejléc az új épületet mondja", /OD/.test(u.nev), u.nev);
  t("a lista bezárult", !u.lista);
  t("a régi épület útvonala és címsora törlődött", !u.from && !u.to && !u.hash, JSON.stringify(u));
  const od1 = await meres(p4);
  t("OD: a porta a sajátja, és mind a 229 kódolt helyiség bent van", od1.porta === "OD00F01" && od1.kodolt === 229,
    JSON.stringify({ porta: od1.porta, kodolt: od1.kodolt }));
  t.eq("OD: a portától mért aranyértékek, az OA után", aranyOf(od1), ARANY.OD);
  /* Ajtóadat nélkül a helyiség a legközelebbi cellához kötődik, és az egy
     leszakadt szilánkba is eshet: az OD00F02 rajzterem és az OD35E04 iroda
     így nem volt elérhető, pedig a fő folyosó ott van mellettük (3 cm-re,
     illetve az iroda sokszögébe nyúlva). Most a fő hálózat egy cellája is
     melléjük kerül, de csak egy él mentén, egy falnyira (KOTES_TAV). Az
     OD00F03 rajzterem fő hálózati cellája viszont csak a sarkánál áll, oda
     nem köt (itt ez a szabály a szigorúbb oldalon téved: a sarki cella abban
     az előcsarnokban van, amelyikkel 7 m-en közös a körvonala). */
  const kotes = await p4.evaluate(() => {
    const r1 = ROOM[START], k = dijkstra(r1, PORTAL, null);
    return ["OD00F02", "OD35E04", "OD00F03"].map(c => { const r = ROOM[c], cs = RCELL[r.id] || [];
      return { kod: c, ut: !!routeTo(k, r1, r), cellak: cs.length }; });
  });
  t("OD: a fő folyosó mellett álló rajzterem és iroda (OD00F02, OD35E04) elérhető; a csak sarkával érintkező OD00F03 nem",
    kotes[0].ut && kotes[1].ut && !kotes[2].ut && kotes[2].cellak === 1, JSON.stringify(kotes));
  t("a szintválasztó az OD kilenc szintjét mutatja, a lista az OD-t jelöli", od1.rail === 9 && od1.itt === "OD",
    `${od1.rail} szint, itt: ${od1.itt}`);
  t("az aktív szint az OD egyik szintje, és látszik", String(od1.szintek || "").split(",").includes(String(od1.szint)) && od1.aktivLatszik,
    JSON.stringify(od1));
  const t1 = await tiszta(p4);
  t.eq("OA → OD után minden számolt tároló olyan, mintha üres lapról épült volna (nincs ottmaradt bejegyzés)",
    t1.elter, []);

  const ktBe = await valtUI(p4, "KT") && (await epOf(p4)) === "KT";
  t("közben a KT tényleg betöltött (különben a második OD-látogatás semmit nem mérne)", ktBe, await epOf(p4));
  await valtUI(p4, "OD");
  t.eq("OD → KT → OD: a második látogatás ugyanazt méri, a gráffal együtt", await meres(p4), od1);

  /* A kötés szabálya minden épületben, az összes új kötésre: a második
     cella a helyiség egy élétől legfeljebb KOTES_TAV-ra (vagy a helyiségen
     belül) áll, és a kettő közé nem esik harmadik, nem közlekedő helyiség —
     különben az útvonal egy másik helyiség túloldalán érne célba. A régi cella
     is megmarad (a saját foltjából oda vezet az út).
     És az útvonal a célszinten nem mehet az épületen kívül: a kinyert maszkon
     a homlokzat előtt egy cella széles járható gyűrű fut, és az ablakrésein át
     a szobákba is bevezet. Egy korábbi változat így kötött be három KH-szobát
     (az útvonal a fal túloldalán ért célba, vagy ablakon át ment be), és a
     egyenes szakaszt néző ellenőrzés ezt nem látta. Ez itt nem az app raszterével,
     hanem pontos geometriával méri: a célszinti útszakasz minden sokszögön
     kívüli pontjából nyolc irányba húzott sugár közül legfeljebb kettő juthat
     ki a tervlap széléig helyiség- vagy falél metszése nélkül. Csak a
     célszintet nézi: az FK-ban minden útvonal a porta utáni négy cellán, a
     bejárat sokszög nélküli előterén indul (az FK két új kötésének útja is),
     az nem a kötés műve. */
  const kotesHiba = p => p.evaluate(() => {
    const bent = (P, x, y) => { let be = false; for (let e = 0, o = P.length - 1; e < P.length; o = e++) { const a = P[o], b = P[e];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) be = !be; } return be; };
    const metsz = (x, y, ex, ey, a, b) => { const d1x = ex - x, d1y = ey - y, d2x = b[0] - a[0], d2y = b[1] - a[1], de = d1x * d2y - d1y * d2x;
      if (!de) return false; const u = ((a[0] - x) * d2y - (a[1] - y) * d2x) / de, v = ((a[0] - x) * d1y - (a[1] - y) * d1x) / de;
      return u > 0 && u <= 1 && v >= 0 && v <= 1; };
    const sokszogek = lv => D.rooms.filter(q => q.level === lv).map(q => q.poly).concat((D.walls && D.walls[lv]) || []);
    const L = Math.hypot(GW, GH) * RES;
    const kint = (P, x, y) => {
      if (P.some(Q => bent(Q, x, y))) return false;
      let n = 0;
      for (let a = 0; a < 8; a++) { const ex = x + Math.cos(a * Math.PI / 4) * L, ey = y + Math.sin(a * Math.PI / 4) * L;
        if (!P.some(Q => Q.some((q, e) => metsz(x, y, ex, ey, Q[(e + Q.length - 1) % Q.length], q)))) n++; }
      return n >= 3;
    };
    const r1 = ROOM[START], kk = dijkstra(r1, PORTAL, null);
    const hiba = []; let db = 0;
    for (const r of D.rooms) {
      const cs = RCELL[r.id]; if (!cs || cs.length < 2 || (r.doors || []).length) continue;
      db++;
      const rt = routeTo(kk, r1, r);
      if (rt) { const P = sokszogek(r.level), cel = LVI[r.level];
        let n0 = rt.path.length; while (n0 > 0 && ((rt.path[n0 - 1] / CELLS) | 0) === cel) n0--;
        const ki = rt.path.slice(n0).map(nXY).filter(q => kint(P, q.x, q.y));
        if (ki.length) hiba.push(`${r.code}: az útvonal ${ki.length} ponton az épületen kívül`); }
      const k = cs[cs.length - 1], i = k % GW, j = (k - i) / GW, x = (i + .5) * RES, y = (j + .5) * RES;
      if (bent(r.poly, x, y)) continue;
      let m = 1e9, pt = null;
      for (let e = 0, o = r.poly.length - 1; e < r.poly.length; o = e++) { const a = r.poly[o], b = r.poly[e], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
        const tt = l ? ((x - a[0]) * dx + (y - a[1]) * dy) / l : -1;
        if (tt > 1e-6 && tt < 1 - 1e-6) { const d = Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / Math.sqrt(l); if (d < m) { m = d; pt = [a[0] + tt * dx, a[1] + tt * dy]; } } }
      if (!(m <= KOTES_TAV)) { hiba.push(`${r.code}: ${m === 1e9 ? "csak sarkon" : m.toFixed(2) + " m"}`); continue; }
      const sajat = D.rooms.filter(q => q.level === r.level && q !== r && bent(q.poly, x, y));
      for (let s = 1; s < 20; s++) { const sx = x + (pt[0] - x) * s / 20, sy = y + (pt[1] - y) * s / 20;
        const q = D.rooms.find(q => q.level === r.level && q !== r && !sajat.includes(q) && q.cat !== "KÖZLEKEDŐK" && bent(q.poly, sx, sy));
        if (q) { hiba.push(`${r.code}: közte ${q.code || q.name}`); break; } }
    }
    return { db, hiba };
  });
  const kapott = {}, kotesek = {};
  for (const kod of Object.keys(ARANY)) {
    await p4.evaluate(k => epuletValt(k), kod); await kesz(p4, kod);
    const m = await meres(p4); kapott[kod] = m.ep === kod ? aranyOf(m) : "nem nyílt meg";
    kotesek[kod] = await kotesHiba(p4);
    if (kod === "KH") kotesek.KHpince = await p4.evaluate(() => {
      const r1 = ROOM[START], k = dijkstra(r1, PORTAL, null);
      return { pince: !!findRoute(ROOM.KHX1PK2, ROOM.KHX1P03, PORTAL),
        kint: ["KH00F36", "KH00F37", "KH00F42"].filter(c => routeTo(k, r1, ROOM[c])) };
    });
  }
  const db = {}; for (const kod of Object.keys(ARANY)) db[kod] = kotesek[kod].db;
  t("a kötés minden épületben csak egy élen át, egy falnyira köt, harmadik helyiség nélkül, és a célszinten az épületen belül",
    Object.keys(ARANY).every(k => !kotesek[k].hiba.length), JSON.stringify(kotesek));
  t.eq("új kötés épületenként (OD 2, FK 2, KH 4, KT 3)", db, { OA: 0, FF: 0, FK: 2, KH: 4, KT: 3, OC: 0, OD: 2 });
  t("a régi kötés megmarad: a KH pincéjében az előtérből a műhelyhez továbbra is van út (KHX1PK2 → KHX1P03)",
    kotesek.KHpince.pince === true);
  t("a homlokzat előtti gyűrűn vagy ablakrésen át nincs útvonal (KH00F36, KH00F37, KH00F42)",
    !kotesek.KHpince.kint.length, kotesek.KHpince.kint.join());
  t.eq("minden megnyitható épületben a portától mért aranyértékek (elérhetetlen, összhossz, élek)", kapott, ARANY);
  const nyithato = await p4.evaluate(() => Object.keys(EPULETEK.epuletek).filter(k => EPULETEK.epuletek[k].navigalhato).sort());
  t("a nyilvántartás pontosan ezeket az épületeket nyitja meg (új épületnél az aranyérték is kell)",
    nyithato.join() === Object.keys(ARANY).sort().join(), nyithato.join());

  // az OA IV. emeletéről a háromszintes FK-ra: a szint érvényes lesz, és látszik
  await valtUI(p4, "OA");
  await p4.evaluate(() => { S.level = 5; renderRail(); updateView(); });
  await valtUI(p4, "FK");
  const fk = await meres(p4);
  t("OA IV. emeletéről az FK-ra: a szint az FK egyik szintje, és látszik",
    String(fk.szintek || "").split(",").includes(String(fk.szint)) && fk.aktivLatszik, JSON.stringify(fk));
  t.eq("FK: a portától mért aranyértékek, a hétszintes OA után", aranyOf(fk), ARANY.FK);
  const t2 = await tiszta(p4);
  t.eq("OA → FK után sem marad bejegyzés a nagyobb épület szintjeiről", t2.elter, []);

  /* Vissza az OA-ra: annak az adata beégetve van, hálózat nélkül is ugyanazt
     kell mérnie. A kérések letiltása a finally-ben áll vissza, hogy egy
     elbukó váltás ne hagyja a többi állítást hálózat nélkül. */
  let oa1;
  await ctx.setOffline(true);
  try { await valtUI(p4, "OA"); oa1 = await meres(p4); } finally { await ctx.setOffline(false); }
  t("hálózat nélkül is vissza lehet váltani az OA-ra, és ugyanazt méri", oa1.ep === "OA" && oa1.ki === oa0.ki &&
    oa1.hossz === oa0.hossz && oa1.graf === oa0.graf && oa1.rail === 7,
    JSON.stringify({ ki: oa1.ki, hossz: oa1.hossz, rail: oa1.rail, ep: oa1.ep }));

  /* Az ablakos keresés (nearestCell, az első menet, kotesJeloltek) csak a
     hatótávon belüli cellákat nézi: ugyanazt kell adnia, mint a szint minden
     celláján végigmenő régi változatnak. Az aranyértékek ezt nem látják (a
     valódi ajtók és lépcsőpontok 2 m-en belül vannak egy cellához), ezért itt
     közvetlenül: véletlen pontokon és minden helyiségen. */
  const ablak = await p4.evaluate(async () => {
    const teljes = (lv, x, y) => { const list = CELLLIST[lv]; let best = -1, bd = 1e9;
      for (let n = 0; n < list.length; n++) { const k = list[n], i = k % GW, j = (k - i) / GW;
        const dd = ((i + .5) * RES - x) ** 2 + ((j + .5) * RES - y) ** 2; if (dd < bd) { bd = dd; best = k; } }
      return bd < 49 ? best : -1; };
    const elsoMenet = r => { const list = CELLLIST[r.level]; if (!list) return null; let best = -1, bd = 1e9;
      const cs = r.poly.concat([[r.cx, r.cy]]);
      for (let n = 0; n < list.length; n++) { const k = list[n], i = k % GW, j = (k - i) / GW, x = (i + .5) * RES, y = (j + .5) * RES;
        for (const p of cs) { const dd = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (dd < bd) { bd = dd; best = k; } } }
      return best >= 0 && bd < 36 ? best : null; };
    const jeloltek = r => { const P = r.poly, L = P.length, xs = P.map(p => p[0]), ys = P.map(p => p[1]), E = 1e-6;
      const x0 = Math.min(...xs) - KOTES_TAV, x1 = Math.max(...xs) + KOTES_TAV, y0 = Math.min(...ys) - KOTES_TAV, y1 = Math.max(...ys) + KOTES_TAV;
      const ki = [], list = CELLLIST[r.level] || [];
      for (let n = 0; n < list.length; n++) { const k = list[n], i = k % GW, j = (k - i) / GW, x = (i + .5) * RES, y = (j + .5) * RES;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue; let m = 1e9, be = false;
        for (let e = 0, o = L - 1; e < L; o = e++) { const a = P[o], b = P[e], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
          if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) be = !be; if (!l) continue;
          const t = ((x - a[0]) * dx + (y - a[1]) * dy) / l; if (t > E && t < 1 - E) m = Math.min(m, Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / Math.sqrt(l)); }
        const tav = be ? 0 : m; if (tav <= KOTES_TAV) ki.push([k, tav]); } return ki; };
    let mag = 7; const rnd = () => (mag = (mag * 16807) % 2147483647) / 2147483647;
    const o = {};
    for (const kod of ["OA", "OD"]) {
      const d = kod === "OA" ? D_OA : await (await fetch("data/epuletek/od.json")).json();
      epuletAllit(d);
      let pont = 0, cellaval = 0, elter = 0;
      for (const lv of LV) for (let q = 0; q < 300; q++) { const x = rnd() * GW * RES, y = rnd() * GH * RES, b = teljes(lv, x, y);
        pont++; if (b >= 0) cellaval++; if (nearestCell(lv, x, y) !== b) elter++; }
      // az első menet: az ajtó nélküli helyiségek kötése (a második menet csak bővít, a régi cella marad)
      const menet = d.rooms.filter(r => !(r.doors || []).length).filter(r => { const v = elsoMenet(r);
        return v === null ? false : !(RCELL[r.id] || []).includes(v); }).length;
      const jel = d.rooms.filter(r => JSON.stringify(kotesJeloltek(r)) !== JSON.stringify(jeloltek(r))).length;
      o[kod] = { pont, cellaval, elter, menet, jel };
    }
    epuletAllit(D_OA);
    return o;
  });
  t("az ablakos cellakeresés ugyanazt adja, mint a teljes bejárás (véletlen pontokon, minden helyiség első kötésén és kötésjelöltjein, OA és OD)",
    Object.values(ablak).every(x => x.elter === 0 && x.menet === 0 && x.jel === 0 && x.cellaval > 50), JSON.stringify(ablak));

  /* Az epuletKesz() a valódi OD-adaton, egyenként egy-egy hiányzó elemmel: egy
     szinte üres adat bármelyik követelmény lazítását elfedné, mert egy
     másikon úgyis elbukna. */
  const kk = await p4.evaluate(async () => {
    const od = await (await fetch("data/epuletek/od.json")).json();
    // egy kivétel sem „nem kész”: az is hiba, és a soron olvasható legyen
    const kesz = d => { try { return epuletKesz(d); } catch (e) { return "kivétel: " + e.message; } };
    const nelkul = k => { const c = JSON.parse(JSON.stringify(od)); delete c[k]; return kesz(c); };
    const portaSzobaNelkul = (() => { const c = JSON.parse(JSON.stringify(od));
      c.rooms = c.rooms.filter(r => r.code !== PORTA.OD); return kesz(c); })();
    const portaNelkul = (() => { const v = PORTA.OD; delete PORTA.OD; const r = kesz(od); PORTA.OD = v; return r; })();
    /* A szerkezet is számít: egy sokszög nélküli helyiség, egy maszk nélküli
       szint vagy egy hibás lépcsőpont korábban az építés KÖZEPÉN dobott hibát. */
    const ront = f => { const c = JSON.parse(JSON.stringify(od)); f(c); return kesz(c); };
    const szerk = { sokszogNelkul: ront(c => { delete c.rooms[5].poly; }),
      kurtaSokszog: ront(c => { c.rooms[5].poly = c.rooms[5].poly.slice(0, 2); }),
      rosszPont: ront(c => { c.rooms[5].poly[1] = ["x", 3]; }),
      idegenSzint: ront(c => { c.rooms[5].level = 99; }),
      maszkNelkuliSzint: ront(c => { delete c.masks[c.levels[0].level]; }),
      rosszLepcso: ront(c => { c.stairs[0].pts[0] = [c.levels[0].level, null, 2]; }),
      racsNulla: ront(c => { c.grid.res = 0; }) };
    return { teljes: kesz(od), meta: nelkul("meta"), rooms: nelkul("rooms"), walls: nelkul("walls"),
             stairs: nelkul("stairs"), masks: nelkul("masks"), grid: nelkul("grid"), levels: nelkul("levels"),
             portaSzobaNelkul, portaNelkul, szerk };
  });
  t("epuletKesz: a teljes OD-adat kész", kk.teljes === true, JSON.stringify(kk));
  t("epuletKesz: bármelyik kötelező elem (meta, helyiségek, falak, lépcsők, maszk, rács, szintek, a porta helyisége, a PORTA-bejegyzés) hiányával nem kész",
    ["meta", "rooms", "walls", "stairs", "masks", "grid", "levels", "portaSzobaNelkul", "portaNelkul"].every(k => kk[k] === false),
    JSON.stringify(kk));

  t("epuletKesz: hibás szerkezettel (sokszög nélküli vagy kétpontos helyiség, nem szám koordináta, ismeretlen szint, maszk nélküli szint, hibás lépcsőpont, nulla rácsméret) sem kész",
    Object.values(kk.szerk).every(v => v === false), JSON.stringify(kk.szerk));

  /* Ha az építés mégis elbukik (az epuletKesz() nem lát mindent), a régi
     épület épül vissza. Korábban az app félig váltott: a D az új épület, a
     ROOM és a kép a régi, és az útvonalak a kettő keverékén futottak. A hibát
     az egyik építő szabotálásával idézzük elő, csak az új adatra. */
  const felig = await p4.evaluate(async () => {
    const eredeti = epuletPortal;
    epuletPortal = d => { if (d !== D_OA) throw new Error("szabotált építés"); return eredeti(d); };
    try {
      epuletValt("OD");
      for (let i = 0; i < 100 && !(document.getElementById("epvlist").open && document.getElementById("epvMsg").textContent.trim()); i++)
        await new Promise(r => setTimeout(r, 100));
    } finally { epuletPortal = eredeti; }
    const uz = document.getElementById("epvMsg").textContent.trim();
    epvZar();
    const rt = findRoute(ROOM.OAX1A02, ROOM.OA10E18);
    return { oa: D === D_OA, room: Object.keys(ROOM)[0].slice(0, 2), padlo: document.querySelectorAll(".floor").length,
             szint: D.levels.length, ut: !!rt, uz, zar: urlLock };
  });
  t("ha az építés elbukik, a régi épület épül vissza (nem félig váltott), és működik",
    felig.oa && felig.room === "OA" && felig.padlo === felig.szint && felig.ut && !felig.zar, JSON.stringify(felig));
  t("és megmondja, hogy az épület nem érhető el", /nem érhető el/.test(felig.uz), felig.uz);
  // a szándékosan előidézett hibát az app a konzolra írja: az nem az app hibája
  p4.jsErrors.splice(0, p4.jsErrors.length, ...p4.jsErrors.filter(m => !m.includes("szabotált építés")));

  /* Hiányos adattal NEM váltunk: falak nélkül a Dijkstra mindenen átmenne,
     lépcső nélkül a szintek nem érnének össze. Inkább marad adatlap. */
  await ctx.route("**/data/epuletek/oc.json", r => r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ meta: { w: 10, h: 10 }, levels: [{ level: 0 }],
                           rooms: [{ id: 0, code: "OC00F01", poly: [[0,0]] }] }) }));
  await p4.evaluate(() => { PORTA.OC = "OCX1A02";
    EPULETEK.epuletek.OC.navigalhato = true; epvRender(); });
  await p4.click("#epvBtn"); await p4.waitForTimeout(250);
  await p4.click('#epvlist [data-epv="tel:Budapest"]'); await p4.waitForTimeout(100);
  await p4.click('#epvlist .epvrow[data-ep="OC"]');
  // a hibaüzenetet várjuk meg, nem egy rögzített időt: a lassú gépen a letöltés tovább tart
  await p4.waitForFunction(() => { const m = document.getElementById("epvMsg"); return m && !m.hidden && m.textContent.trim(); },
    null, { timeout: 15000 }).catch(() => {});
  const L4 = await allapot(p4);
  t("hiányos adattal nem vált át", (await epOf(p4)) === "OA", await epOf(p4));
  t("és megmondja, hogy nem érhető el",
    /nem érhető el/.test(L4.uzenet), L4.uzenet || "(nincs üzenet)");
  // angolul az épület kódjával, nem a magyar „OC épület” névvel („The floor plan of OC épület…”)
  await p4.evaluate(() => { S.lang = "en"; applyLang(); epuletValt("OC"); });
  await p4.waitForFunction(() => /building OC/.test((document.getElementById("epvMsg") || {}).textContent || ""),
    null, { timeout: 15000 }).catch(() => {});
  const L4en = await allapot(p4);
  await p4.evaluate(() => { S.lang = "hu"; applyLang(); });
  t("angolul is: „The floor plan of building OC is not available…”", /^The floor plan of building OC is not available/.test(L4en.uzenet),
    L4en.uzenet || "(nincs üzenet)");
  t("nincs JS hiba a váltás egyik ágán sem",
    p4.jsErrors.length === 0, p4.jsErrors.join(" | "));
  await p4.close();

  /* A nyilvántartás nélkül is el kell indulnia: ez a /data/ ágon hálózat-először
     jön, tehát egy offline első indulás vagy egy hálózati hiba valóban előfordul.
     Friss kontextusban, service worker nélkül: ahol már van tárolt példány,
     ott a service worker a szerver hibájára azt adja (sw.js), és a
     nyilvántartás jogosan megjön — az első indulásnál viszont nincs mit adnia. */
  const ctx3 = await browser.newContext({ ...DESKTOP, serviceWorkers: "block" });
  await ctx3.route("**/data/epuletek.json", r => r.fulfill({ status: 404, body: "" }));
  const p3 = await open(ctx3, base);
  const L3 = await allapot(p3);
  t("nyilvántartás nélkül nincs gomb, marad a statikus név",
    !L3.gomb && L3.statikus, `gomb=${L3.gomb}, statikus=${L3.statikus}`);
  t("és az app ettől még elindul",
    (await p3.evaluate(() => document.querySelectorAll(".floor").length)) > 0);
  /* A letiltott kérés maga naplóz egy 404-et — azt vártuk. Ami nem várt: egy
     kivétel vagy bármi más hiba a nyilvántartás nélküli úton. */
  const maradek = p3.jsErrors.filter(s => !/epuletek\.json|404/.test(s));
  t("a 404-en kívül nincs hiba a nyilvántartás nélküli úton",
    maradek.length === 0, maradek.join(" | "));
  await ctx3.close();
}, DESKTOP);

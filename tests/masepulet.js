/* Más épületben az app ne mondjon OA-ra szabott dolgot. Hat ilyen hiba volt,
   és mind a hallgatót vitte rossz helyre vagy hagyta segítség nélkül:
   - a „Foglalható termek” az OD-ben és a KT kollégiumban is az OA 24
     NIK-termét mutatta „Szabad” jelzéssel — az órarendi adat csak az OA-é;
   - az útvonal lépései az OA szintszámozásával nevezték meg a célszintet
     („Lépcsőn fel a félemeletre” az I. emelet helyett, az OD V. emeletére
     „Lépcsőn fel undefined”), és rosszul számolták a szinteket;
   - a liftes megjegyzés minden épületben az OA FL3 magjára hivatkozott;
   - a mosdóválasztó a nemre nem jelölt WC-t „Női” és „Férfi” mosdónak is
     kiírta — a kollégiumban egy lakóegység saját WC-jét;
   - a KH és a KT akadálymentes mosdóját (más írásmód) nem ismerte fel;
   - a Büfé gomb ott is kint volt, ahol nincs büfé, és koppintásra semmit nem
     tett.
   Mellette a 3D-s szintfeliratok és a szintek felolvasói neve, ami az OA-ban
   is magyar maradt angolul.
   Az OA viselkedését a többi tesztfájl őrzi (lepesek, lift, url, termek); itt
   csak az, hogy visszaváltva az OA-ra minden OA-s dolog visszajön. */
const { run, open } = require("./lib");

// a szint neve és a ragozott célszint épületenként, magyarul és angolul — minden ágra
const SZINTEK = {
  OA: ["Alagsor | az alagsorba || Basement | to the basement", "Földszint | a földszintre || Ground floor | to the ground floor",
       "Félemelet | a félemeletre || Mezzanine | to the mezzanine", "I. emelet | az I. emeletre || 1st floor | to the 1st floor",
       "II. emelet | a II. emeletre || 2nd floor | to the 2nd floor", "III. emelet | a III. emeletre || 3rd floor | to the 3rd floor",
       "IV. emelet | a IV. emeletre || 4th floor | to the 4th floor"],
  OD: ["Pince -2 | a −2. pinceszintre || Basement level 2 | to basement level 2",
       "Pince -1 | a −1. pinceszintre || Basement level 1 | to basement level 1",
       "Földszint | a földszintre || Ground floor | to the ground floor", "Félemelet | a félemeletre || Mezzanine | to the mezzanine",
       "I. emelet | az I. emeletre || 1st floor | to the 1st floor", "II. emelet | a II. emeletre || 2nd floor | to the 2nd floor",
       "III. emelet | a III. emeletre || 3rd floor | to the 3rd floor", "IV. emelet | a IV. emeletre || 4th floor | to the 4th floor",
       "V. emelet | az V. emeletre || 5th floor | to the 5th floor"],
  KH: ["Alagsor | az alagsorba || Basement | to the basement", "Földszint | a földszintre || Ground floor | to the ground floor",
       "I. emelet | az I. emeletre || 1st floor | to the 1st floor", "Tetőtér | a tetőtérre || Attic | to the attic"],
};
const szintTabla = p => p.evaluate(() => D.levels.map(l => {
  const o = {}; for (const lang of ["hu", "en"]) { S.lang = lang; o[lang] = lvName(l.level) + " | " + lvTo(l.level); }
  S.lang = "hu"; return o.hu + " || " + o.en; }));

run("más épületben", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1400 });
  await p.waitForFunction(() => typeof EPULETEK !== "undefined" && EPULETEK, null, { timeout: 15000 });
  // a váltás végét várjuk: a szintdobozok is az új épületéi (az epItt() már a váltás elején átáll)
  const valt = async kod => {
    await p.evaluate(k => epuletValt(k), kod);
    await p.waitForFunction(k => epItt() === k && !epvTolt &&
      [...document.querySelectorAll(".floor")].map(f => f.dataset.lv).join() === LV.join(), kod, { timeout: 15000 });
  };
  const ut = (f, to, lang) => p.evaluate(([f, to, lang]) => {
    S.lang = lang || "hu";
    const rt = ROOM[f] && ROOM[to] && findRoute(ROOM[f], ROOM[to]);
    const o = rt ? (() => { const mm = analyse(rt), st = steps(rt, mm);
      return { vert: mm.vert, fugg: st.filter(x => x.v).map(x => x.t + " | " + x.d) }; })() : null;
    S.lang = "hu"; return o;
  }, [f, to, lang]);
  const megj = (f, to) => p.evaluate(([f, to]) => {
    S.from = f; S.to = to; S.sel = to; recompute(); renderPanel();
    return [...document.querySelectorAll("#scroll .note")].map(e => e.textContent).join(" | ");
  }, [f, to]);
  const wc = from => p.evaluate(f => mosdok(ROOM[f]).map(x => ({ f: x.f, kod: x.r.code, nev: x.r.name || "" })), from);
  const nemes = l => l.every(x => x.f === "wcw" ? /N[ŐÖ]I/.test(x.nev) : x.f === "wcm" ? /FFI/.test(x.nev) : true);

  t.eq("OA: a szintek neve és a célszint, magyarul és angolul", await szintTabla(p), SZINTEK.OA);
  /* A következő épületekben (BF, KD, OM) 15-ös félszint és egyetlen „Pince” is
     van: a szintAdat() ezeket is kezelje, akkor is, ha ma egyik megnyitott
     épületben sincs ilyen. */
  const kesobbi = await p.evaluate(() => {
    const regi = D.levels; D.levels = regi.concat([{ level: 98, code: "15", name: "1.5. szint", short: "1.5" },
                                                    { level: 99, code: "X1", name: "Pince", short: "P" }]);
    const o = {}; try { for (const lang of ["hu", "en"]) { S.lang = lang; o[lang] = [lvTo(98), lvName(99), lvTo(99), emelet(98)]; } }
    finally { S.lang = "hu"; D.levels = regi; } return o; });
  t.eq("a 15-ös félszint és az egyetlen pince is jó nevet kap", kesobbi,
    { hu: ["az I. emelet fölötti félemeletre", "Pince", "a pincébe", 1.5],
      en: ["to the mezzanine above the 1st floor", "Basement", "to the basement", 1.5] });
  /* A szint neve az elsődleges, a kód csak tartalék — de ha mindkettő mond
     emeletet, és mást, az épület nem nyílik meg: nem tudni, melyik a jó. A KD
     félemeletének kódja 15, mégis a földszint és az I. emelet közt áll (a
     neve szerint 0,5, a kódja szerint 1,5); a BA-ban a földszint kódja 10, egy
     udvarszinté 00 (két földszint); a TA közös lapján a név a TC emeletét
     mondja (III. emelet, kód 20). Mindhárom adatlap marad, különben a lépések
     rossz emeletre küldenének. */
  const szintSor = await p.evaluate(async () => {
    const kd = [{ level: -1, code: "X1", name: "Pince -1" }, { level: 0, code: "00", name: "Földszint" },
                { level: 1, code: "15", name: "Félemelet" }, { level: 2, code: "10", name: "I. emelet" },
                { level: 3, code: "20", name: "II. emelet" }];
    const ba = [{ level: -1, code: "X1", name: "Alagsor" }, { level: 0, code: "00", name: "Udvar szint" },
                { level: 1, code: "10", name: "Földszint" }, { level: 2, code: "20", name: "I. emelet" }];
    const ta = [{ level: 0, code: "00", name: "Földszint" }, { level: 1, code: "10", name: "I. emelet" },
                { level: 2, code: "20", name: "III. emelet" }];
    const pince = [{ level: -2, code: "X2", name: "Pince 2" }, { level: -1, code: "X1", name: "Pince 1" },
                   { level: 0, code: "00", name: "Földszint" }];
    const od = await (await fetch("data/epuletek/od.json")).json();
    const odBa = JSON.parse(JSON.stringify(od));
    Object.assign(odBa.levels.find(l => l.code === "05"), { name: "Udvar szint", short: "UDV", code: "00" });
    return { kdN: kd.map(l => szintAdatL(kd, l.level).n), kdRend: szintekRendben(kd),
             baRend: szintekRendben(ba), taRend: szintekRendben(ta),
             pinceN: pince.map(l => { const a = szintAdatL(pince, l.level); return a.fajta + " " + a.n; }),
             pinceRend: szintekRendben(pince),
             od: epuletKesz(od), odBa: epuletKesz(odBa) };
  });
  t.eq("a szint neve az elsődleges: a KD „Félemelet”-e a földszint fölötti, a kötőjel nélküli „Pince 2” a −2. szint",
    [szintSor.kdN, szintSor.pinceN, szintSor.pinceRend], [[-1, 0, 0.5, 1, 2], ["pince -2", "pince -1", "fsz 0"], true]);
  t("ha a név és a kód mást mond (KD, TA), vagy két földszint jönne ki (BA), az épület nem nyílik meg; az OD igen",
    !szintSor.kdRend && !szintSor.baRend && !szintSor.taRend && szintSor.od === true && szintSor.odBa === false,
    JSON.stringify(szintSor));

  /* A mosdónevek írásmódja épületenként más (a leltárból): mindegyik a saját
     sorába kerüljön, a személyzeti WC pedig a hallgatói sorokba ne. */
  const NEVEK = {
    acc: ["AK. MENT. WC", "AKMENT.WC", "M.K. WC", "M.S. MOSDÓ", "MK. WC", "MS. WC", "AKM. WC"],
    wcw: ["NŐI WC", "N WC", "N MOSDÓ", "NŐ WC", "NŐ MOSDÓ"],
    wcm: ["FFI WC", "F WC", "FF WC", "FFI PISZOÁR"],
    wc: ["WC", "MOSDÓ", "MOSD."],
    nincs: ["M.K. FÜRDŐ", "ZUHANYZÓ", "TAKARÍTÓ"]
  };
  const nevSor = await p.evaluate(N => Object.fromEntries(Object.entries(N).map(([k, l]) =>
    [k, l.map(n => (iconsOf({ name: n, cat: "VIZES HELYISÉGEK" }) || ["nincs"])[0])])), NEVEK);
  t.eq("a mosdónevek írásmódjai a saját sorukba kerülnek", nevSor,
    Object.fromEntries(Object.entries(NEVEK).map(([k, l]) => [k, l.map(() => k)])));
  const kulon = await p.evaluate(() => ({
    kulsos: iconsOf({ name: "SZEMÉLYZETI WC", cat: "KÜLSŐS SZOLGÁLTATÁS" }),
    uresKat: iconsOf({ name: "NŐI WC", cat: "" }),
    szemelyzeti: ["TANÁRI WC", "OKTATÓI WC", "TAKARÍTÓI MOSDÓ", "SZEMÉLYZETI WC"].every(n => SZEMELYZETI_WC.test(n)),
    hallgatoi: ["NŐI WC", "FFI WC", "AK. MENT. WC"].some(n => SZEMELYZETI_WC.test(n)) }));
  t("más kategóriában a WC nem mosdó, kategória nélkül a név dönt, a személyzeti WC kimarad a sorokból",
    kulon.kulsos === null && JSON.stringify(kulon.uresKat) === '["wcw"]' && kulon.szemelyzeti && !kulon.hallgatoi,
    JSON.stringify(kulon));
  /* És a valódi mosdóválasztóban: ha a portához legközelebbi női mosdó neve
     tanárit mondana, azt ne kínálja. (A nevet utána visszaállítjuk.) */
  const tanari = await p.evaluate(() => {
    const elso = mosdok(ROOM[START]).find(s => s.f === "wcw").r, regi = elso.name;
    elso.name = "TANÁRI NŐI WC";
    try { const uj = mosdok(ROOM[START]).find(s => s.f === "wcw"); return { elso: elso.code, uj: uj && uj.r.code }; }
    finally { elso.name = regi; } });
  t("a mosdóválasztó a tanári mosdót nem kínálja, a következő női mosdóra vált",
    tanari.uj && tanari.uj !== tanari.elso, JSON.stringify(tanari));

  /* A 3D-s szintfelirat és a szint felolvasói neve angolul is az épület
     szintjeiből jön: előtte az OA-ban is magyar maradt. */
  const angolCimke = () => p.evaluate(() => {
    S.lang = "en"; applyLang();
    const o = { tag: LV.map(l => FLOOR[l].tag.firstChild.textContent), aria: LV.map(l => FLOOR[l].box.getAttribute("aria-label")),
                varas: LV.map(lvName) };
    S.lang = "hu"; applyLang(); return o; });
  const oaCimke = await angolCimke();
  t("OA angolul: a 3D-s szintfelirat és a felolvasói név is angol",
    oaCimke.tag.join() === oaCimke.varas.join() && oaCimke.aria.join() === oaCimke.varas.join()
    && oaCimke.varas[1] === "Ground floor", JSON.stringify(oaCimke));
  const bufeGomb = () => p.evaluate(() => !!document.querySelector('[data-q="BÜFÉ"]'));
  const oaBufe = await bufeGomb();

  // 1. Foglalható termek: az adat az OA-é
  const gomb = () => p.evaluate(() => !!document.querySelector('[data-q="@ROOMS"]'));
  const oaGomb = await gomb();
  await valt("OD");
  const odGomb = await gomb();
  const odLista = await p.evaluate(async () => { quick("@ROOMS"); await tmLoad();
    await new Promise(r => setTimeout(r, 300)); renderTermek();
    return { sor: document.querySelectorAll("#scroll .tmrow").length, szoveg: document.getElementById("scroll").textContent.trim().slice(0, 120) }; });
  t("a foglalható termek gombja csak az OA-ban van ott (az órarendi adat az OA-é)", oaGomb && !odGomb,
    `OA: ${oaGomb}, OD: ${odGomb}`);
  t("más épületben a foglalható termek listája nem mutatja az OA termeit", odLista.sor === 0, JSON.stringify(odLista));
  await p.evaluate(() => { S.termek = false; renderPanel(); });

  // a Büfé gomb is csak ott, ahol van büfé (különben koppintásra semmi nem történt)
  const odBufe = await bufeGomb();
  t("a Büfé gomb ott van, ahol van büfé (OA), és ott nincs, ahol nincs (OD)", oaBufe && !odBufe,
    `OA: ${oaBufe}, OD: ${odBufe}`);
  await valt("FK");
  const fkBufe = await bufeGomb();
  t("az FK-ban is van büfé (FKX1P10), ott a gomb kint van", fkBufe, `FK: ${fkBufe}`);
  await valt("OD");

  // 2. Szintnevek az épület saját szintjeiből
  t.eq("OD: a szintek neve és a célszint, a pincékkel és a félemelettel", await szintTabla(p), SZINTEK.OD);
  const odV = await ut("OD00F01", "OD50E01");
  t("OD: a V. emeletre „az V. emeletre”, nem „undefined”, és 5 emelet",
    odV && odV.fugg.some(x => x.startsWith("Lépcsőn fel az V. emeletre")) && !odV.fugg.some(x => /undefined/.test(x))
    && odV.vert === 5, JSON.stringify(odV));
  await valt("KT");
  const kt1 = await ut("KT00F22", "KT10E08"), kt4 = await ut("KT00F22", "KT40E03"), kt4en = await ut("KT00F22", "KT40E03", "en");
  t("KT: az I. emeletre „az I. emeletre”, nem „a félemeletre”, és 1 emelet",
    kt1 && kt1.fugg[0].startsWith("Lépcsőn fel az I. emeletre") && kt1.vert === 1, JSON.stringify(kt1));
  t("KT: a IV. emeletre „a IV. emeletre · 4 szint”, és 4 emelet",
    kt4 && kt4.fugg.some(x => x.startsWith("Lépcsőn fel a IV. emeletre") && /4 szint/.test(x)) && kt4.vert === 4,
    JSON.stringify(kt4));
  t("KT angolul: „to the 4th floor”", kt4en && kt4en.fugg.some(x => x.startsWith("Take the stairs up to the 4th floor")),
    JSON.stringify(kt4en));
  const ktRail = await p.evaluate(() => { S.lang = "en"; const o = LV.map(lvName); S.lang = "hu"; return o; });
  t("KT angolul a szintválasztó is az épület szintjeit nevezi meg", ktRail.join(",") ===
    "Basement,Ground floor,1st floor,2nd floor,3rd floor,4th floor,5th floor", ktRail.join(","));
  const ktCimke = await angolCimke();
  t("KT angolul: a 3D-s szintfelirat és a felolvasói név is az épület szintjeiből",
    ktCimke.tag.join() === ktRail.join() && ktCimke.aria.join() === ktRail.join(), JSON.stringify(ktCimke));

  await valt("KH");
  t.eq("KH: a szintek neve és a célszint, a tetőtérrel", await szintTabla(p), SZINTEK.KH);
  const khAcc = (await wc("KH00F02")).find(x => x.f === "acc");
  t("KH: az akadálymentes sorban a mozgáskorlátozott WC (M.K. WC)", khAcc && khAcc.kod === "KH00F28", JSON.stringify(khAcc));
  const kh = await ut("KH00F02", "KH20E02");
  t("KH: a tetőtérre „a tetőtérre”, nem „az I. emeletre”", kh && kh.fugg.some(x => x.startsWith("Lépcsőn fel a tetőtérre")),
    JSON.stringify(kh));
  await valt("KT");

  // 3. Liftes megjegyzés: az FL3 mag az OA-é
  const ktMegj = await megj("KT00F22", "KT40E03");
  t("KT: a liftes megjegyzés azt mondja, hogy a lift nincs a térképen — nem az OA FL3 magját, és nem „lifttel vezet”",
    ktMegj === await p.evaluate(() => T().noLiftData), ktMegj);

  // 4. Mosdóválasztó: nemre nem jelölt WC nem „Női” vagy „Férfi” mosdó
  const ktWc = await wc("KT20EK1");
  t("KT: a Női és a Férfi sor kifejezetten női és férfi mosdó, nem egy lakóegység WC-je", ktWc.length > 0 && nemes(ktWc)
    && !ktWc.some(x => x.f === "wc"), JSON.stringify(ktWc));
  const ktAcc = (await wc("KT00F22")).find(x => x.f === "acc");
  t("KT: az akadálymentes sorban a mozgássérült mosdó (M.S. MOSDÓ)", ktAcc && ktAcc.kod === "KT00F08", JSON.stringify(ktAcc));
  /* Ahonnan jelölt női vagy férfi mosdó nem érhető el, ott sem lehet egy
     jelöletlen WC „Női” és „Férfi” mosdó: egy semleges sor jön helyette. */
  const ktJel = await wc("KT00F15");
  t("KT: ahonnan nincs elérhető jelölt mosdó, ott a jelöletlen semleges sorban jön, nem női/férfi címkével",
    ktJel.some(x => x.f === "wc") && nemes(ktJel), JSON.stringify(ktJel));
  /* Az OC I. emeleti WC-i (E28, E29) csak a tervlapon vannak meg, a táblában
     nem, ezért kategóriájuk sincs: a név alapján mosdók, és az I. emeletről a
     legközelebbiek. */
  await valt("OC");
  const ocWc = await wc("OC10E01");
  t("OC: a kategória nélküli FFI WC és NŐI WC is mosdó, és az I. emeletről ezek a legközelebbiek",
    ocWc.some(x => x.f === "wcw" && x.kod === "OC10E29") && ocWc.some(x => x.f === "wcm" && x.kod === "OC10E28"),
    JSON.stringify(ocWc));
  await valt("FF");
  const ffWc = await wc("FF00FK1");
  t("FF: a Női és a Férfi sor jelölt mosdó", ffWc.some(x => x.f === "wcw") && ffWc.some(x => x.f === "wcm") && nemes(ffWc),
    JSON.stringify(ffWc));
  await valt("OA");
  // visszaváltva az OA-ra minden OA-s dolog visszajön: a foglalható termek, a büfé, az FL3-ról szóló megjegyzés
  const oaVissza = { termek: await gomb(), bufe: await bufeGomb(), megj: await megj("OA00FK1", "OA30E01"),
    fl3: await p.evaluate(() => [T().noLiftHere, T().lift]) };
  t("visszaváltva az OA-ra a foglalható termek, a Büfé és az FL3-ról szóló megjegyzés is visszajön",
    oaVissza.termek && oaVissza.bufe && oaVissza.fl3.includes(oaVissza.megj), JSON.stringify(oaVissza));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});

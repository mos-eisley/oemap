/* Foglalható termek panel. A legfontosabb állítás nem az, hogy mit ír ki,
   hanem hogy MIKOR NEM ír ki „szabad"-ot. Egy hallgató, aki egy üres teremre
   számít és órára érkezik, rosszabbul jár, mintha meg se kérdezte volna.
   Ezért: a félév oktatási hetein kívül „nincs adat", ünnepnapon „nincs óra",
   és ahol más kar is tart órát, amiről az adatnak nincs tudomása, ott
   legfeljebb „Szabad?".

   Az adat a Neptun heti órarendje (hetek bitmaszkjával). Az időpontokat az
   adatból választjuk, nem beégetve — így a teszt a következő félév
   exportjával is működik. */
const { run, open } = require("./lib");

// Az órát a kívánt időpontra állítjuk; a panel minden rajzoláskor new Date()-et kér.
const freeze = iso => `
  const Real = Date, fixed = new Real(${JSON.stringify(iso)});
  Date = class extends Real { constructor(...a){ super(...(a.length?a:[fixed])); }
                              static now(){ return fixed.getTime(); } };`;

run("foglalható termek", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1400 });
  p.on("requestfailed", r => { if (/termek\.json/.test(r.url())) p.jsErrors.push("nem tölt: " + r.url()); });

  const adat = await p.evaluate(async () => { quick("@ROOMS");
    await new Promise(r => setTimeout(r, 900));
    return typeof TM !== "undefined" && TM ? { het1:TM.het1, hetek:TM.hetek, felev:TM.felev,
      szunnap:TM.szunnap, db:TM.rooms.length, kozos:TM.rooms.filter(r => r.kozos).length } : null; });
  t("a teremadat betöltődik, egy egész félévre", !!adat && adat.db >= 10 && adat.hetek >= 10,
    JSON.stringify(adat));
  if (!adat) return;

  // A panel sorai egy adott időpontban.
  const panel = (iso, nyit) => p.evaluate(async ([js, nyit]) => {
    eval(js);
    const w = ms => new Promise(r => setTimeout(r, ms));
    quick("@ROOMS"); await w(400);
    if (nyit) { document.querySelector(`[data-tm="${nyit}"]`).click(); await w(200); }
    const sorok = [...document.querySelectorAll(".tmrow")].map(x => {
      const b = x.querySelector(".tmb");
      return { nev:x.dataset.tm, jel:b.className.replace("tmb", "").trim(), felirat:b.textContent,
               al:x.querySelector(".tms").textContent }; });
    return { sorok, sav:document.querySelectorAll(".tmd .tmr:not(.empty2)").length,
             felsz:document.querySelectorAll(".tmd .tmf .tag").length };
  }, [freeze(iso), nyit]);

  /* Esetek az adatból: egy nem közös terem egy órája, annak az első hete és a
     közepe; ugyanez egy olyan héten, amikor az óra nincs (páros/páratlan),
     és ugyanaznap egy lyukas időpont. */
  const eset = await p.evaluate(() => {
    const napja = (w, nap) => new Date(Date.UTC(...TM.het1.split("-").map((v, i) => i === 1 ? v - 1 : +v))
      + ((w - 1) * 7 + nap - 1) * 864e5).toISOString().slice(0, 10);
    const hetei = m => [...Array(TM.hetek)].map((_, i) => i + 1).filter(w => (m >> (w - 1)) & 1);
    const fedi = (r, nap, m, w) => r.slots.some(s => s[0] === nap && (s[3] >> (w - 1)) & 1 && s[1] <= m && m < s[2]);
    const hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    let foglalt = null, lyuk = null, parite = null;
    for (const r of TM.rooms) {
      if (r.kozos) continue;
      for (const s of r.slots) {
        const hs = hetei(s[3]); if (!hs.length) continue;
        const w = hs[0], nap = s[0], m = s[1] + 5;
        if (s[0] > 5 || TM.szunnap.includes(napja(w, nap))) continue;
        if (!foglalt && r.felsz.length) {
          foglalt = { nev:r.nev, targy:TM.targyak[s[5]], ido:napja(w, nap) + "T" + hhmm(m) + ":00" };
          for (let x = 8 * 60; x < 20 * 60; x += 15)
            if (!fedi(r, nap, x, w)) { lyuk = { nev:r.nev, ido:napja(w, nap) + "T" + hhmm(x) + ":00" }; break; }
        }
        if (!parite) {
          const nincs = [...Array(TM.hetek)].map((_, i) => i + 1)
            .find(v => !((s[3] >> (v - 1)) & 1) && !fedi(r, nap, m, v) && !TM.szunnap.includes(napja(v, nap)));
          if (nincs) parite = { nev:r.nev, van:napja(w, nap) + "T" + hhmm(m) + ":00",
                                nincs:napja(nincs, nap) + "T" + hhmm(m) + ":00" };
        }
      }
      if (foglalt && lyuk && parite) break;
    }
    const utolso = new Date(Date.UTC(...TM.het1.split("-").map((v, i) => i === 1 ? v - 1 : +v)) + (7 * TM.hetek - 1) * 864e5);
    return { foglalt, lyuk, parite,
             elotte: napja(0, 1) + "T10:00:00",
             utana: new Date(utolso.getTime() + 30 * 864e5).toISOString().slice(0, 10) + "T10:00:00" };
  });
  t("az adatban van foglalt óra, lyuk és páros/páratlan heti óra", eset.foglalt && eset.lyuk && eset.parite,
    JSON.stringify(eset));
  if (!eset.foglalt || !eset.lyuk || !eset.parite) return;

  // foglalt órában foglalt, a tárggyal; kinyitva a napi órák és a felszereltség
  const a = await panel(eset.foglalt.ido, eset.foglalt.nev);
  const ta = a.sorok.find(x => x.nev === eset.foglalt.nev);
  t("foglalt órában foglaltnak mutatja, a tárgy nevével", ta && ta.jel === "busy" && ta.al.includes(eset.foglalt.targy),
    JSON.stringify(ta) + " @ " + eset.foglalt.ido);
  t("kinyitva látszanak a napi órák és a felszereltség", a.sav > 0 && a.felsz > 0, `óra=${a.sav}, tag=${a.felsz}`);
  // A közös termekről az adat csak a saját kar óráit ismeri: ott soha nem mondhat
  // teli „szabad"-ot, csak „Szabad?"-ot.
  const kozosSzabad = a.sorok.filter(x => x.jel === "free" && /^F\d|Audmax/.test(x.nev));
  t("a közös termek (F-blokk, Audmax) soha nem teli „szabadok”", kozosSzabad.length === 0,
    JSON.stringify(kozosSzabad.slice(0, 3)));
  const reggel = await panel(eset.foglalt.ido.slice(0, 10) + "T07:00:00");
  t("óra nélkül a közös terem „Szabad?”, a saját labor „Szabad”",
    reggel.sorok.some(x => x.jel === "maybe" && x.felirat === "Szabad?") && reggel.sorok.some(x => x.jel === "free"),
    [...new Set(reggel.sorok.map(x => x.jel + ":" + x.felirat))].join(" | "));

  // ugyanaznap egy lyukas időpontban szabad
  const l = await panel(eset.lyuk.ido);
  const tl = l.sorok.find(x => x.nev === eset.lyuk.nev);
  t("két óra közt szabadnak mutatja", tl && tl.jel === "free", JSON.stringify(tl) + " @ " + eset.lyuk.ido);

  // a hetek bitmaszkja: amelyik héten az óra nincs, ugyanakkor szabad
  const pv = (await panel(eset.parite.van)).sorok.find(x => x.nev === eset.parite.nev);
  const pn = (await panel(eset.parite.nincs)).sorok.find(x => x.nev === eset.parite.nev);
  t("a páros/páratlan heti óra csak a saját hetein foglal", pv && pv.jel === "busy" && pn && pn.jel === "free",
    JSON.stringify({ van:[eset.parite.van, pv && pv.jel], nincs:[eset.parite.nincs, pn && pn.jel] }));

  // ünnepnapon nincs óra — de „szabad"-ot sem mond
  if (adat.szunnap.length) {
    const u = await panel(adat.szunnap[0] + "T10:00:00");
    t("ünnepnapon egyetlen terem sem foglalt vagy szabad, és kiírja, miért",
      u.sorok.every(x => x.jel === "none" && /nnepnap/.test(x.al)),
      [...new Set(u.sorok.map(x => x.jel + ":" + x.al))].join(" | "));
  }

  // A lényeg: az oktatási heteken kívül NE mondjon szabadot.
  for (const [mikor, iso] of [["a félév előtt", eset.elotte], ["a félév után", eset.utana]]) {
    const k = await panel(iso);
    t(`${mikor} egyetlen terem sem „szabad”, mindegyik „nincs adat”`,
      k.sorok.every(x => x.jel === "none" && /nincs adat/i.test(x.al)),
      iso + ": " + [...new Set(k.sorok.map(x => x.jel + ":" + x.al))].join(" | "));
  }
  /* Egy deploy utáni első megnyitáskor még a régi service worker válaszol, és
     a régi formátumú fájlt adja a gyorsítótárából. Útvonal-elfogással
     játsszuk le: a sima címre a régi (kéthetes táblás) formátum jön, minden
     másra a valódi fájl. Az appnak a frisset kell mutatnia, nem „nincs
     adat"-ot. */
  await ctx.route(/\/data\/termek\.json$/, r => r.fulfill({ json: { generated:"2026-09-10",
    from:"2026-08-31", to:"2026-09-11", periods:{ 1:"8.00 - 8.45" }, rooms:[{ nev:"AM", cim:"Audmax", fero:330, felsz:[] }] } }));
  const p2 = await open(ctx, base, { settle: 900 });
  const regi = await p2.evaluate(async () => { quick("@ROOMS"); await new Promise(r => setTimeout(r, 900));
    return { het1:TM && TM.het1, termek:document.querySelectorAll(".tmrow").length }; });
  t("a gyorsítótárban ragadt régi fájl helyett a frisset tölti be", regi.het1 === adat.het1 && regi.termek === adat.db,
    JSON.stringify(regi));
  t("nincs JS hiba", !p.jsErrors.length && !p2.jsErrors.length, p.jsErrors.concat(p2.jsErrors).join(" | "));
});

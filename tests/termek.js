/* Foglalható termek panel. A legfontosabb állítás nem az, hogy mit ír ki,
   hanem hogy MIKOR NEM ír ki semmit: a tábla egy adott hétre szól, és lejárt
   adatnál "nincs adat"-ot kell mondania, nem "szabad"-ot. Egy hallgató, aki
   egy üres teremre számít és órára érkezik, rosszabbul jár, mintha meg se
   kérdezte volna. */
const { run, open } = require("./lib");

// Az órát a tábla érvényességi hetére állítjuk, különben a teszt magától
// elavulna, és onnantól nem mondana semmit.
const freeze = iso => `
  const Real = Date, fixed = new Real(${JSON.stringify(iso)});
  Date = class extends Real { constructor(...a){ super(...(a.length?a:[fixed])); }
                              static now(){ return fixed.getTime(); } };`;

run("foglalható termek", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1400 });
  p.on("requestfailed", r => { if (/termek\.json/.test(r.url())) p.jsErrors.push("nem tölt: " + r.url()); });

  // a beépített adat érvényességi ablaka
  const span = await p.evaluate(async () => { quick("@ROOMS");
    await new Promise(r => setTimeout(r, 900));
    return typeof TM !== "undefined" && TM ? { tol:TM.from, ig:TM.to, db:TM.rooms.length } : null; });
  t("a teremadat betöltődik", !!span, JSON.stringify(span));
  if (!span) return;

  // A legforgalmasabb napot és egy ott ténylegesen foglalt órát az adatból
  // szedjük ki, nem beégetve — így a teszt túléli a heti frissítést.
  const busyAt = await p.evaluate(() => {
    const perDay = {};
    for (const r of TM.rooms) for (const [d] of r.slots) perDay[d] = (perDay[d]||0) + 1;
    const day = Object.entries(perDay).sort((a,b) => b[1]-a[1])[0][0];
    for (const r of TM.rooms) for (const b of tmDay(r, day))
      return { day, min: b.from + 5 };            // az első foglalás kellős közepe
    return { day, min: 10*60 };
  });
  const hh = String(Math.floor(busyAt.min/60)).padStart(2,"0");
  const mm = String(busyAt.min%60).padStart(2,"0");
  const wed = `${busyAt.day}T${hh}:${mm}:00`;
  const r = await p.evaluate(async (js) => {
    eval(js);
    const w = ms => new Promise(r => setTimeout(r,ms));
    quick("@ROOMS"); await w(900);
    const rows = [...document.querySelectorAll(".tmrow")].map(x => ({
      nev: x.querySelector(".tmn b").textContent,
      allapot: (x.querySelector(".tmb")||{}).textContent || "" }));
    const out = { sorok: rows, jegyzet: (document.querySelector(".note")||{}).textContent || "" };
    const busy = [...document.querySelectorAll(".tmrow")].find(x => /Foglalt/.test(x.textContent));
    if (busy) { busy.click(); await w(300);
      out.kinyitva = { savok:[...document.querySelectorAll(".tmd .tmr")].length,
                       felszereltseg:[...document.querySelectorAll(".tmf .tag")].length }; }
    return out;
  }, freeze(wed));

  t("felsorolja a termeket", r.sorok.length > 0, r.sorok.length + " sor");
  t("minden sorhoz tartozik állapot", r.sorok.every(x => x.allapot.length > 0),
    JSON.stringify(r.sorok.slice(0,3)));
  t("van foglalt és/vagy szabad állapot", r.sorok.some(x => /Foglalt|Szabad/.test(x.allapot)),
    [...new Set(r.sorok.map(x => x.allapot))].join(" | "));
  t("foglalt órában foglaltnak is mutatja", !!r.kinyitva, wed);
  if (r.kinyitva) {
    t("kinyitva látszanak a napi sávok", r.kinyitva.savok > 0, "sáv=" + r.kinyitva.savok);
    t("és a felszereltség", r.kinyitva.felszereltseg > 0, "tag=" + r.kinyitva.felszereltseg);
  }

  // A lényeg: az érvényességi ablakon kívül NE mondjon szabadot.
  const after = new Date(new Date(span.ig).getTime() + 30*864e5).toISOString().slice(0,10);
  const lejart = await p.evaluate(async (js) => {
    eval(js);
    const w = ms => new Promise(r => setTimeout(r,ms));
    quick("@ROOMS"); await w(900);
    return { allapotok: [...new Set([...document.querySelectorAll(".tmrow .tmb")].map(x => x.textContent))],
             sorDb: document.querySelectorAll(".tmrow").length,
             nodataDb: document.querySelectorAll(".tmrow .tmb.none").length,
             alcimek: [...new Set([...document.querySelectorAll(".tmrow .tms")].map(x => x.textContent))] };
  }, freeze(after + "T10:00:00"));

  t("lejárt adatnál egyetlen terem sem „szabad”", !lejart.allapotok.some(x => /Szabad/.test(x)),
    lejart.allapotok.join(" | "));
  t("mindegyik a „nincs adat” jelzést kapja", lejart.nodataDb === lejart.sorDb,
    `${lejart.nodataDb}/${lejart.sorDb}`);
  t("és ki is írja, hogy erre a napra nincs adat", /nincs adat/i.test(lejart.alcimek.join(" ")),
    lejart.alcimek.slice(0,2).join(" | "));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});

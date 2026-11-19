/* A telephely 3D-s tömegrajza. Amit őriz:

   - a campus a CSOPORT nézetében áll, nem az országén vagy a településén:
     ott még az a kérdés, hol van a csoport, itt már az, melyik ház melyik;
   - minden épület megjelenik: amelyiknek van OSM-körvonala, tömegként,
     amelyiknek nincs, lapos jelként — kitalált alaprajzot egyik sem kap;
   - a magasság a szintszámból jön, és az ARÁNYOK igazak: a hétszintes OA
     magasabb, mint a hatszintes OC (a túlzás mindkettőt egyformán éri);
   - a hátrafelé néző falak nem rajzolódnak ki (különben a ház belseje
     látszana át a tetőn), és a házak hátulról előre jönnek;
   - a házra kattintva megnyílik az épület, ha van alaprajza, különben az
     adatlapja — ugyanaz a szabály, mint a lista sorainál;
   - a forgatás ugyanazokat a házakat rajzolja újra, más állásban;
   - a TALAJ sosem kap kattintást: a vetülete forgatás közben messze
     túlnyúlik a kereten, és egy korábbi változatban elnyelte a
     jelmagyarázat gombjainak kattintását is (mérve, ezért van itt);
   - a címkék a kirajzolt képen mérve nem fedik egymást. */
const { run, open, PHONE, DESKTOP, ROOT } = require("./lib");
const fs = require("fs"), path = require("path");

const hely = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "helyek.json"), "utf8"));
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "epuletek.json"), "utf8")).epuletek;

/* Odáig, hogy az óbudai (III. kerületi) csoport campusa látszik: ez a
   legnagyobb csoport, és mindkét fajta épület van benne (körvonalas és
   körvonal nélküli, megnyitható és adatlap). */
async function campusra(pg) {
  await pg.click("#epvBtn"); await pg.waitForTimeout(250);
  // a sor a települést viseli, irányítószám nélkül („Budapest 1034” → „Budapest”)
  await pg.click('#epvlist [data-epv="tel:Budapest"]'); await pg.waitForTimeout(300);
  const kulcs = await pg.evaluate(() => {
    const j = [...document.querySelectorAll('#epvlist [data-epv^="csop:"]')]
      .filter(x => x.dataset.epv !== "csop:");
    const b = j.find(x => /III/.test(x.textContent)) || j[0];
    return b ? b.dataset.epv : null;
  });
  if (kulcs) { await pg.click(`#epvlist [data-epv="${kulcs}"]`); await pg.waitForTimeout(450); }
  return kulcs;
}

run("telephely 3D-ben", async ({ t, ctx, browser, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  /* ---- hol áll a campus ---- */
  await p.click("#epvBtn"); await p.waitForTimeout(300);
  t("az ország nézetében nincs campus", !(await p.evaluate(() => !!document.querySelector(".epvcam"))));
  await p.click('#epvlist [data-epv="tel:Budapest"]'); await p.waitForTimeout(300);
  t("a település nézetében sincs", !(await p.evaluate(() => !!document.querySelector(".epvcam"))));
  await p.evaluate(() => epvZar());

  const kulcs = await campusra(p);
  t("csoportot választva előjön a campus", await p.evaluate(() => !!document.querySelector(".epvcam")), String(kulcs));

  /* ---- minden épület kint van, a megfelelő formában ---- */
  const r = await p.evaluate(() => {
    const cam = document.querySelector(".epvcam");
    const g = [...cam.querySelectorAll(".epvep")];
    return {
      kodok: g.map(x => x.dataset.epv.split(":")[1]),
      tomeg: g.filter(x => x.querySelector(".tet")).map(x => x.dataset.epv.split(":")[1]),
      jel: g.filter(x => x.classList.contains("pont")).map(x => x.dataset.epv.split(":")[1]),
      van: g.filter(x => x.classList.contains("van")).map(x => x.dataset.epv.split(":")[1]),
      cimkek: [...cam.querySelectorAll(".epvcimke")].map(x => x.textContent),
      talaj: cam.querySelectorAll(".epvtalaj").length,
    };
  });
  const csoport = Object.values(reg).filter(e => e.telephely === "Budapest 1034").map(e => e.kod).sort();
  t.eq("a csoport minden épülete kint van", r.kodok.slice().sort(), csoport);
  t.eq("mindegyiknek van címkéje", r.cimkek.length, r.kodok.length);
  const kontur = csoport.filter(k => hely.epuletek[k] && hely.epuletek[k].kontur);
  t.eq("tömeget pontosan a körvonalasak kapnak", r.tomeg.slice().sort(), kontur.slice().sort());
  t.eq("a többi lapos jel, nem kitalált ház", r.jel.slice().sort(),
    csoport.filter(k => !kontur.includes(k)).sort());
  t.eq("az akcentszínt a megnyithatók kapják", r.van.slice().sort(),
    csoport.filter(k => reg[k].navigalhato).sort());
  t.eq("van talaj a házak alatt", r.talaj, 1);

  /* ---- a magasság a szintszámból jön ---- */
  const mag = await p.evaluate(() => {
    const h = {};
    for (const g of document.querySelectorAll(".epvep")) {
      const tet = g.querySelector(".tet"), alap = g.querySelector(".arny");
      if (!tet || !alap) continue;
      // a tető és a vetett árnyék függőleges távolsága arányos a magassággal
      h[g.dataset.epv.split(":")[1]] = alap.getBBox().y - tet.getBBox().y;
    }
    return h;
  });
  t("a hétszintes OA magasabb a hatszintes OC-nél", mag.OA > mag.OC,
    `OA ${mag.OA && mag.OA.toFixed(0)}, OC ${mag.OC && mag.OC.toFixed(0)}`);
  t("a kilencszintes OD a legmagasabb a háromnál", mag.OD > mag.OA && mag.OA > mag.OC,
    `OD ${mag.OD && mag.OD.toFixed(0)}, OA ${mag.OA && mag.OA.toFixed(0)}, OC ${mag.OC && mag.OC.toFixed(0)}`);

  /* ---- hátrafelé néző falak nem rajzolódnak ki ---- */
  const fal = await p.evaluate(() => [...document.querySelectorAll(".epvep")]
    .map(g => { const k = g.dataset.epv.split(":")[1], kont = HELYEK.epuletek[k].kontur;
      return kont ? { kod: k, rajzolt: g.querySelectorAll(".fal path").length, elek: kont[0].length } : null; })
    .filter(Boolean));
  t("minden háznak van kirajzolt fala", fal.every(x => x.rajzolt > 0),
    fal.map(x => x.kod + ":" + x.rajzolt).join(" "));
  t("de a hátrafelé nézők kimaradnak", fal.every(x => x.rajzolt / x.elek <= .75),
    fal.map(x => `${x.kod} ${x.rajzolt}/${x.elek}`).join("  "));

  /* ---- a talaj nem nyel el kattintást ---- */
  const talajAtenged = await p.evaluate(() => {
    const t = document.querySelector(".epvtalaj");
    const r = t.getBoundingClientRect();
    return getComputedStyle(t).pointerEvents === "none";
  });
  t("a talaj átengedi a kattintást", talajAtenged);

  /* A széttolás a kiinduló álláson számít: mérve a III. kerületben 3, a
     VIII.-ban 13 ütközés van nélküle. A forgatott állásban véletlenül nem
     volt egy sem, és az állítás így vakon átment. */
  const fedAlap = await p.evaluate(() => {
    const el = [...document.querySelectorAll(".epvcimke")].map(e => e.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++) {
      const a = el[i], b = el[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) n++;
    }
    return n;
  });
  t.eq("a címkék alaphelyzetben sem fedik egymást", fedAlap, 0);

  /* ---- forgatás ---- */
  const elotte = await p.evaluate(() => document.querySelector(".epvcam svg").innerHTML.length);
  await p.click('[data-epv="forg:30"]'); await p.waitForTimeout(400);
  const utana = await p.evaluate(() => ({
    irany: EPV.irany,
    hossz: document.querySelector(".epvcam svg").innerHTML.length,
    hazak: document.querySelectorAll(".epvep").length,
  }));
  t.eq("a forgatás gombja elfordítja a campust", utana.irany, 30);
  t("más állás, de ugyanannyi ház", utana.hossz !== elotte && utana.hazak === r.kodok.length,
    `${elotte} → ${utana.hossz}, ${utana.hazak} ház`);
  // forgatás után is kattintható marad minden gomb (ez bukott el a talajtól)
  await p.click('[data-epv="forg:30"]'); await p.waitForTimeout(400);
  t.eq("forgatás után is működik a gomb", await p.evaluate(() => EPV.irany), 60);

  /* ---- a címkék nem fednek ---- */
  const fed = await p.evaluate(() => {
    const el = [...document.querySelectorAll(".epvcimke")].map(e => e.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++) {
      const a = el[i], b = el[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) n++;
    }
    return n;
  });
  t.eq("a címkék nem fedik egymást", fed, 0);

  /* Nem csak ezen a csoporton: a VIII. kerületben négy ház címkéje torlódik
     (széttolás nélkül mérve 13 ütközés), Székesfehérváron öté. */
  const mind = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const ki = [];
    for (const [tel, k] of [["Budapest","BA"],["Budapest","YA"],["Székesfehérvár","FC"]]) {
      epvLep({ tel, csop: null, kod: null }); await w(250);
      epvLep({ csop: k }); await w(400);
      if (!document.querySelector(".epvcam")) { ki.push([k, "nincs campus"]); continue; }
      const el = [...document.querySelectorAll(".epvcimke")].map(e => e.getBoundingClientRect());
      let n = 0;
      for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++)
        if (el[i].left < el[j].right && el[j].left < el[i].right
            && el[i].top < el[j].bottom && el[j].top < el[i].bottom) n++;
      ki.push([k, n]);
    }
    return ki;
  });
  t("egyik csoport címkéi sem fednek", mind.every(([, n]) => n === 0),
    mind.map(([k, n]) => k + ":" + n).join(" "));

  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await p.close();

  /* ---- kattintás: megnyitható ház megnyílik ---- */
  let c2 = await browser.newContext(PHONE);
  let q = await open(c2, base, { settle: 1600 });
  await campusra(q);
  await q.click('.epvep[data-epv="ep:OD"]');
  const nyilt = await q.waitForFunction(() => epItt() === "OD" && !epvTolt, null, { timeout: 20000 })
    .then(() => true, () => false);
  t("a 3D-s házra kattintva megnyílik az épület", nyilt, await q.evaluate(() => epItt()));
  await c2.close();

  /* ---- kattintás: alaprajz nélkülinél az adatlap jön ---- */
  c2 = await browser.newContext(PHONE);
  q = await open(c2, base, { settle: 1600 });
  await campusra(q);
  await q.click('.epvep[data-epv="ep:KB"]');
  await q.waitForTimeout(500);
  t("alaprajz nélküli háznál az adatlapja jön", await q.evaluate(() => EPV.kod), "KB");
  t("és az app marad az OA-n", await q.evaluate(() => epItt()), "OA");
  await c2.close();

  /* ---- dioráma az ország térképén ----
     Keskeny telefonon is: 360-on a térkép 328 px széles, és ott a
     „Székesfehérvár” kártyája 11,5 px-es betűvel nem fért el a jel bal
     oldalán — lecsúszott Budapest kártyája alá. 390-en ez nem látszott. */
  for (const szel of [360, 390]) {
  let c3 = await browser.newContext({ viewport: { width: szel, height: 780 }, isMobile: true, hasTouch: true });
  let r3 = await open(c3, base, { settle: 1600 });
  await r3.click("#epvBtn"); await r3.waitForTimeout(600);
  const dio = await r3.evaluate(() => {
    const jel = [...document.querySelectorAll(".epvmap.orszag .epvpin")];
    const kartya = jel.map(b => b.querySelector("span").getBoundingClientRect());
    let fed = 0;
    for (let i = 0; i < kartya.length; i++) for (let j = i + 1; j < kartya.length; j++) {
      const a = kartya[i], b = kartya[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) fed++;
    }
    const m = document.querySelector(".epvmap.orszag").getBoundingClientRect();
    return {
      jelek: jel.map(b => b.dataset.epv),
      dios: jel.filter(b => b.classList.contains("dio")).map(b => b.dataset.epv),
      hazak: document.querySelectorAll(".epvdio .epvep").length,
      falak: document.querySelectorAll(".epvdio .fal path").length,
      fed,
      kilog: kartya.some(r => r.left < m.left - 1 || r.right > m.right + 1
                           || r.top < m.top - 1 || r.bottom > m.bottom + 1),
      // a modell a kártyán belül marad, nem lóg a térképre
      bent: [...document.querySelectorAll(".epvdio")].every(sv => {
        const a = sv.getBoundingClientRect(), b = sv.closest("span").getBoundingClientRect();
        return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
      }),
    };
  });
  t(`${szel}: minden településnek van jele az ország térképén`, dio.jelek.length >= 3, dio.jelek.join(" "));
  t(`${szel}: modellt az kap, ahol van körvonalas épület`,
    dio.dios.length >= 2 && !dio.dios.includes("tel:Nagymaros"), dio.dios.join(" "));
  t(`${szel}: a modellek valódi házakból állnak`, dio.hazak > 0 && dio.falak > 0,
    `${dio.hazak} ház, ${dio.falak} fal`);
  t.eq(`${szel}: a kártyák nem fedik egymást`, dio.fed, 0);
  t(`${szel}: és nem lógnak ki a térképből`, !dio.kilog);
  t(`${szel}: a modell a kártyáján belül marad`, dio.bent);
  t(`${szel}: nincs JS hiba az ország nézetében`, r3.jsErrors.length === 0, r3.jsErrors.join(" | "));
  await c3.close();
  }

  /* ---- asztalon is ott van ---- */
  const d = await browser.newContext(DESKTOP);
  const w = await open(d, base, { settle: 1600 });
  await campusra(w);
  t("asztalon is megjelenik a campus", await w.evaluate(() => {
    const c = document.querySelector(".epvcam");
    return !!c && c.getBoundingClientRect().width > 200;
  }));
  t("asztalon sincs JS hiba", w.jsErrors.length === 0, w.jsErrors.join(" | "));
  await d.close();
});

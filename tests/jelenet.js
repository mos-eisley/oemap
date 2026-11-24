/* A folytonosan nagyítható jelenet: az ország határától a házak tömegéig
   EGY tér, egy vetület, egy kamera — nincs külön „ország-térkép” és
   „város-térkép”, és nincsenek a térképre tett kártyák. Amit őriz:

   - a RÉSZLETESSÉG a nagyítással lép: országos léptéken a települések jele,
     közelebb a csoportoké, még közelebb a házak tömege és neve. Ezt a mérés
     kényszerítette ki: fix léptéken egy budapesti ház az ország térképén
     1,3 képpont lenne (a város épületei 5168 m-en szórnak szét, egy ház
     tipikusan 62 m) — ezért nézett ki ragasztottnak a jelekre tett modell;
   - a DŐLÉS is a nagyításból jön: az ország fölött felülnézet (a ferde
     országtérkép értelmetlen), a házak közt 52°, mert ott a tömeg a lényeg;
   - minden épület ott van: körvonallal tömegként, anélkül lapos jelként —
     kitalált alaprajzot egyik sem kap. Enélkül közelről egyszerűen eltűnt
     az épület, és a kamera egy üres helyre illesztett;
   - a magasság a szintszámból jön, és az ARÁNYOK igazak: a hétszintes OA
     magasabb, mint a hatszintes OC;
   - a hátrafelé néző falak kimaradnak, különben a ház belseje látszana át;
   - a listából és a jelenetből ugyanoda jut a hallgató, és a kamera ODAREPÜL;
   - a HÚZÁS a kameráé, a koppintás a házé (ugyanaz a szabály, mint a
     teremnél: egy elhúzott ujj vége ne nyisson meg véletlenül egy épületet);
   - a címkék a kirajzolt képen mérve nem fedik egymást, más jelét, és nem
     lógnak ki a keretből. */
const { run, open, PHONE, DESKTOP, ROOT } = require("./lib");
const fs = require("fs"), path = require("path");

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "epuletek.json"), "utf8")).epuletek;
const hely = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "helyek.json"), "utf8"));

const nyugodt = pg => pg.waitForFunction(() => !JEL.anim, null, { timeout: 6000 }).catch(() => {});
const allapot = pg => pg.evaluate(() => ({
  mpp: +document.querySelector(".epvjel3d").dataset.mpp,
  dol: +jelDol().toFixed(1),
  tel: [...document.querySelectorAll(".jTel:not(.csop)")].map(b => b.dataset.epv).sort(),
  csop: [...document.querySelectorAll(".jTel.csop")].map(b => b.textContent.trim()).sort(),
  // a modell házai NEM a világ házai: a modell a jel helyén álló kis más
  tomeg: [...document.querySelectorAll(".epvjel3d > svg > g.jHaz")].map(g => g.dataset.epv.slice(3)).sort(),
  pont: [...document.querySelectorAll("circle.jHaz.pont")].map(g => g.dataset.epv.slice(3)).sort(),
  modell: [...document.querySelectorAll("g.jVar")].map(g => g.dataset.epv.replace(/^[a-z]+:/, "")).sort(),
  modellHaz: [...document.querySelectorAll("g.jVar g.jHaz")].length,
  nev: [...document.querySelectorAll(".jNev")].map(b => b.textContent.trim()).sort(),
}));

/* Odáig, hogy az óbudai (III. kerületi) csoport látszik: ez a legnagyobb
   csoport, és mindkét fajta épület van benne (körvonalas és körvonal
   nélküli, megnyitható és adatlap). */
async function csoportra(pg) {
  await pg.click("#epvBtn"); await pg.waitForTimeout(250);
  await pg.click('#epvlist .jTel[data-epv="tel:Budapest"]'); await nyugodt(pg);
  // a csoport (telephely) bejárata a lista fejléce; a jelenetben a házak már
  // a nevükkel állnak, ott a ház maga a célpont
  await pg.click('#epvlist .epvcsop[data-epv="csop:KB"]'); await nyugodt(pg);
  await pg.waitForTimeout(150);
}

run("jelenet", async ({ t, browser, base }) => {
  const ctx = await browser.newContext(PHONE);
  const p = await open(ctx, base, { settle: 600 });
  await p.waitForFunction(() => typeof HELYEK !== "undefined" && HELYEK && EPULETEK, null, { timeout: 10000 });
  await p.click("#epvBtn"); await p.waitForTimeout(400);

  /* ---- a részletesség a nagyítással lép ---- */
  const o = await allapot(p);
  t.eq("országos léptéken a települések jele látszik", o.tel,
    ["tel:Budapest", "tel:Nagymaros", "tel:Székesfehérvár"]);
  t("és se csoport, se a világban álló ház, se házról szóló név", !o.csop.length && !o.tomeg.length && !o.pont.length && !o.nev.length,
    JSON.stringify(o));
  /* A városok kis 3D-s mása: ott áll a saját pontjukon. Nagymarosnak nincs
     körvonalas épülete, tehát modellje sem — kitalált házat nem rajzolunk. */
  t.eq("a körvonalas épülettel bíró településnek 3D-s modellje van", o.modell, ["Budapest", "Székesfehérvár"]);
  t("a modellben legfeljebb 5-5 ház áll (ennél több ekkora jelben pacni)",
    o.modellHaz > 3 && o.modellHaz <= 10, String(o.modellHaz));
  const modellek = await p.evaluate(() => {
    const H = document.querySelector(".epvjel3d").getBoundingClientRect();
    const r = [...document.querySelectorAll("g.jVar")].map(g => {
      const b = g.getBoundingClientRect();
      return { n: g.dataset.epv.replace(/^[a-z]+:/, ""), l: b.left - H.left, t: b.top - H.top, w: b.width, h: b.height };
    });
    const jel = [...document.querySelectorAll("circle.jPont")].map(c => [+c.getAttribute("cx"), +c.getAttribute("cy")]);
    const sajatJel = g => +g.dataset.x;
    const baj = [];
    for (const a of r) {
      if (a.w < 30) baj.push(a.n + " modellje apró: " + Math.round(a.w));
      if (a.l < 0 || a.t < 0 || a.l + a.w > H.width || a.t + a.h > H.height) baj.push(a.n + " modellje kilóg");
      for (const b of r) if (a !== b && a.n < b.n && a.l < b.l + b.w && b.l < a.l + a.w && a.t < b.t + b.h && b.t < a.t + a.h)
        baj.push(a.n + " × " + b.n + " modellje fedi egymást");
    }
    // egy modell nem ülhet rá MÁSIK település jelére (a sajátján áll)
    [...document.querySelectorAll("g.jVar")].forEach((g, i) => {
      const a = r[i];
      for (const [x, y] of jel) {
        if (Math.abs(x - sajatJel(g)) < 2) continue;         // a saját jele
        if (x > a.l && x < a.l + a.w && y > a.t && y < a.t + a.h) baj.push(a.n + " modellje takarja a (" + Math.round(x) + "," + Math.round(y) + ") jelet");
      }
    });
    return baj;
  });
  t("a modellek jól láthatók: nem fedik egymást, nem lógnak ki, és nem takarnak másik jelet",
    !modellek.length, modellek.join("; "));
  t("az ország fölött a kép felülnézet (a ferde országtérkép értelmetlen)", o.dol === 0, String(o.dol));

  await p.click('#epvlist .jTel[data-epv="tel:Budapest"]'); await nyugodt(p); await p.waitForTimeout(150);
  const b = await allapot(p);
  t("Budapest fölé érve a kamera megdől", b.dol > 10 && b.dol <= 52, String(b.dol));
  t("a nagyítás nőtt (kevesebb méter esik egy képpontra)", b.mpp < o.mpp / 10, `${o.mpp} → ${b.mpp}`);
  /* SZEMLÉLTETŐ, nem méretarányos — a város egészén az egyes ház pöttynyi
     (a 23 budapesti épület 10 km-en szór szét), ezért ott a CAMPUSOK kis
     mása áll, a campus valódi helyén. Élesben a szétszórt pöttyöket
     jelentették „használhatatlan”-ként. */
  // a csoport kulcsa az első épületkódja (kód szerint rendezve)
  t.eq("a város fölött a kerületek modellje áll, nem a szétszórt házak", b.modell,
    ["BA", "KB", "KP", "YA"]);
  t("és egyetlen valódi ház sincs kirajzolva (az a következő lépcsőfok)",
    !b.tomeg.length && !b.pont.length && !b.nev.length, JSON.stringify(b));
  t.eq("mindegyik modell meg van nevezve", b.csop,
    ["III. kerület", "VI. kerület", "VIII. kerület", "XIV. kerület"]);
  const cmod = await p.evaluate(() => [...document.querySelectorAll("g.jVar")].map(g => {
    const r = g.getBoundingClientRect();
    return { n: g.dataset.epv, w: Math.round(r.width), haz: g.querySelectorAll("g.jHaz").length };
  }));
  t("a modellek jól láthatók (≥30 px) és valódi házakból állnak",
    cmod.length === 4 && cmod.every(m => m.w >= 30 && m.haz >= 1), JSON.stringify(cmod));
  /* A modell szélessége a BENNE álló házak számából: különben a VI. kerület
     egyetlen háza akkora lett, mint a III. kerület öt háza együtt, és a kép
     azt hazudta, hogy ott a nagyobb telephely. */
  const hatom = cmod.find(m => m.haz >= 4), egy = cmod.find(m => m.haz === 1);
  t("a többházas campus modellje szélesebb az egyházasénál",
    hatom && egy && hatom.w > egy.w * 1.4, JSON.stringify([hatom, egy]));

  /* ---- a csoport: valódi tömegek, valódi arányokkal ---- */
  await p.click('#epvlist .epvcsop[data-epv="csop:KB"]'); await nyugodt(p); await p.waitForTimeout(150);
  const c = await allapot(p);
  const obudai = Object.values(reg).filter(e => (e.telephely || "").startsWith("Budapest 103")).map(e => e.kod);
  const konturos = obudai.filter(k => hely.epuletek[k] && hely.epuletek[k].kontur);
  t.eq("a csoport minden épülete kint van", [...c.tomeg, ...c.pont].sort(), obudai.slice().sort());
  t.eq("tömegként csak a körvonalasak — a többi lapos jel, nem kitalált ház", c.tomeg, konturos.slice().sort());
  t("és a nevük is kint van", c.nev.length === obudai.length, c.nev.join(","));
  t("a kamera teljesen megdőlt", c.dol === 52, String(c.dol));

  const magas = await p.evaluate(() => {
    const m = k => { const g = document.querySelector(`g.jHaz[data-epv="ep:${k}"]`); if (!g) return null;
      const r = g.getBoundingClientRect(), tet = g.querySelector(".tet").getBoundingClientRect();
      return +(r.bottom - tet.bottom).toFixed(1); };
    return { OA: m("OA"), OC: m("OC"), OD: m("OD") };
  });
  // az OD 8, az OA 7, az OC 6 szintes: a túlzás mindhármat egyformán éri
  t("a magasság a szintszámból jön: OD > OA > OC", magas.OD > magas.OA && magas.OA > magas.OC, JSON.stringify(magas));

  // hátlapvágás: ARÁNYRA mérve, mert az OSM-gyűrű záró pontja vágás nélkül is kiejt egy élt
  const vagas = await p.evaluate(() => [...document.querySelectorAll("g.jHaz")].map(g => {
    const kod = g.dataset.epv.slice(3), fal = g.querySelectorAll(".fal path").length;
    const el = (HELYEK.epuletek[kod].kontur[0] || []).length;
    return { kod, arany: +(fal / el).toFixed(2) };
  }));
  t("a hátrafelé néző falak kimaradnak (arányra mérve, nem élszámra)",
    vagas.length && vagas.every(v => v.arany > 0.15 && v.arany <= 0.75), JSON.stringify(vagas));

  /* ---- a címkék: mért elhelyezés ---- */
  const cimkeHiba = pg => pg.evaluate(() => {
    const m = document.querySelector(".epvjel3d"), R = m.getBoundingClientRect(), h = [];
    const fed = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const ps = [...m.querySelectorAll(".jTel,.jNev")].map(e => ({ n: e.textContent.trim(),
      s: e.getBoundingClientRect(), p: { x: R.left + parseFloat(e.style.left), y: R.top + parseFloat(e.style.top) } }));
    for (const a of ps) {
      if (a.s.left < R.left - 1 || a.s.right > R.right + 1 || a.s.top < R.top - 1 || a.s.bottom > R.bottom + 1) h.push(a.n + " kilóg");
      for (const b of ps) {
        if (b.p.x > a.s.left - 5 && b.p.x < a.s.right + 5 && b.p.y > a.s.top - 5 && b.p.y < a.s.bottom + 5) h.push(a.n + " takarja " + b.n + " jelét");
        if (a !== b && a.n < b.n && fed(a.s, b.s)) h.push(a.n + " × " + b.n);
      }
    }
    return h;
  });
  const h1 = await cimkeHiba(p);
  t("a csoport fölött a címkék nem fedik egymást és nem lógnak ki", !h1.length, h1.join("; "));

  /* ---- a húzás a kameráé, a koppintás a házé ---- */
  const elotte = await p.evaluate(() => [JEL.cx, JEL.cy, JEL.k]);
  const box = await p.evaluate(() => { const r = document.querySelector(".epvjel3d").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(box.x - i * 9, box.y + i * 5); await p.waitForTimeout(16); }
  await p.mouse.up(); await p.waitForTimeout(120);
  const utana = await p.evaluate(() => [JEL.cx, JEL.cy, JEL.k]);
  t("húzásra a kamera elmozdul, a nagyítás marad",
    Math.abs(utana[0] - elotte[0]) > 10 && utana[2] === elotte[2], JSON.stringify([elotte, utana]));
  t("és a húzás vége nem nyit meg épületet", await p.evaluate(() => $("epvlist").open));

  /* ---- a nagyítás gombja, és a koppintás a házra ---- */
  const k0 = await p.evaluate(() => JEL.k);
  await p.click('[data-epv="zoom:be"]'); await p.waitForTimeout(200);
  t("a + gomb nagyít", (await p.evaluate(() => JEL.k)) > k0 * 1.5);
  await p.click('[data-epv="zoom:ki"]'); await p.waitForTimeout(200);
  t("a − gomb vissza", Math.abs((await p.evaluate(() => JEL.k)) - k0) < k0 * 0.02);
  /* A kamera RÖGZÍTETT FOKOKRA áll be: minden campus és minden város
     ugyanúgy, ugyanakkora házakkal nyílik meg, és a hallgató onnan nagyít
     tovább. A fokok √2-es lépcsők. */
  const fokon = k => Math.abs(Math.log(k) / Math.log(Math.SQRT2) - Math.round(Math.log(k) / Math.log(Math.SQRT2))) < 0.01;
  t("a gombbal lépve a nagyítás fokon marad", fokon(await p.evaluate(() => JEL.k)));
  const beakadt = await p.evaluate(async () => {
    jelNagyit(1.27, JEL.W / 2, JEL.H / 2);          // fokok közé állunk
    const kozott = JEL.k;
    const h = jelHost();
    h.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 900));
    return { kozott, utana: JEL.k };
  });
  t("és a kézi nagyítás után beakad a legközelebbi fokra",
    !fokon(beakadt.kozott) && fokon(beakadt.utana), JSON.stringify(beakadt));
  t("az országnál kijjebb nem lehet menni", await p.evaluate(() => {
    for (let i = 0; i < 30; i++) jelNagyit(1 / 1.9, JEL.W / 2, JEL.H / 2);
    return Math.abs(JEL.k - JEL.kMin) < JEL.kMin * 0.01;
  }));
  await p.close(); await ctx.close();

  /* ---- a házra koppintva megnyílik, alaprajz nélkülinél az adatlapja ---- */
  const c2 = await browser.newContext(PHONE);
  const p2 = await open(c2, base, { settle: 600 });
  await p2.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await csoportra(p2);
  /* A ház egy részét takarhatja egy szomszéd címkéje; a teszt azt a pontot
     keresi meg, ahol a ház tényleg a legfelső elem — ugyanazt, amit az ujj
     is eltalálna. */
  const pont = await p2.evaluate(() => {
    const g = document.querySelector('g.jHaz[data-epv="ep:OD"]'), r = g.getBoundingClientRect();
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
      const x = r.left + r.width * i / 10, y = r.top + r.height * j / 10;
      const e = document.elementFromPoint(x, y);
      if (e && g.contains(e)) return { x, y };
    }
    return null;
  });
  if (!pont) throw new Error("az OD tömegén nincs szabad pont");
  await p2.mouse.click(pont.x, pont.y);
  const nyilt = await p2.waitForFunction(() => epItt() === "OD" && !epvTolt, null, { timeout: 15000 })
    .then(() => true, () => false);
  t("a tömegre koppintva megnyílik az épület alaprajza", nyilt,
    JSON.stringify(await p2.evaluate(() => ({ itt: epItt(), kod: EPV.kod, nyitva: $("epvlist").open }))));
  await p2.close(); await c2.close();

  const c3 = await browser.newContext(PHONE);
  const p3 = await open(c3, base, { settle: 600 });
  await p3.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  /* Az OB-nek 2026-11 óta van alaprajza (a III. kerület csoportjában az
     volt az egyetlen körvonal nélküli, alaprajz nélküli ház), ezért a mérce a
     VIII. kerület TA-ja: körvonal nélküli, lapos jel, és nem megnyitható. */
  await p3.click("#epvBtn"); await p3.waitForTimeout(250);
  await p3.click('#epvlist .jTel[data-epv="tel:Budapest"]'); await nyugodt(p3);
  await p3.click('#epvlist .epvcsop[data-epv="csop:BA"]'); await nyugodt(p3); await p3.waitForTimeout(1200);
  // a jel fölött a saját címkéje vagy egy szomszédé állhat: a képernyő pontjára koppintunk, ahogy egy ujj
  const ta = await p3.locator('circle.jHaz.pont[data-epv="ep:TA"]').boundingBox();
  const fent = await p3.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.dataset.epv; },
    [ta.x + ta.width / 2, ta.y + ta.height / 2]);
  await p3.mouse.click(ta.x + ta.width / 2, ta.y + ta.height / 2); await p3.waitForTimeout(600);
  t("alaprajz nélküli épület lapos jelére koppintva az adatlapja jön",
    fent === "ep:TA" && await p3.evaluate(() => EPV.kod === "TA" && epItt() === "OA" && !EPULETEK.epuletek.TA.navigalhato),
    fent + " " + await p3.evaluate(() => JSON.stringify({ kod: EPV.kod, itt: epItt() })));
  await p3.close(); await c3.close();

  /* ---- asztalon is: a címkék és a keret ---- */
  for (const [nev, opt] of [["asztal (1280×860)", DESKTOP], ["keskeny telefon (360)", { ...PHONE, viewport: { width: 360, height: 740 } }]]) {
    const c4 = await browser.newContext(opt);
    const p4 = await open(c4, base, { settle: 400 });
    await p4.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
    await csoportra(p4);
    const h = await cimkeHiba(p4);
    t(`${nev}: a címkék nem fedik egymást és nem lógnak ki`, !h.length, h.join("; "));
    const bent = await p4.evaluate(() => { const r = document.querySelector(".epvjel3d").getBoundingClientRect();
      return r.height > 200 && r.bottom <= innerHeight + 1; });
    t(`${nev}: a jelenet doboza a képernyőn belül van`, bent);
    await p4.close(); await c4.close();
  }

  /* ---- az átnézésben talált három hiba ---- */
  const c5 = await browser.newContext({ ...DESKTOP, colorScheme: "dark" });
  const p5 = await open(c5, base, { settle: 400 });
  await p5.waitForFunction(() => EPULETEK && HELYEK, null, { timeout: 10000 });
  await p5.click("#epvBtn"); await p5.waitForTimeout(500);
  /* A lista és a jelenet csoportjai ugyanazok: korábban a lista egy kivágatra
     vetített, 80 egységes csoportosítást használt, és Székesfehérváron a
     jelenet FG-campusára koppintva a lista nem szűkült, a kamera sem mozdult. */
  await p5.click('#epvScene .jTel[data-epv="tel:Székesfehérvár"]'); await nyugodt(p5);
  await p5.evaluate(() => { jelRepul({ k: 1 / 12, cx: JEL.cx, cy: JEL.cy }, 50); }); await p5.waitForTimeout(600); await nyugodt(p5);
  const fk0 = await p5.evaluate(() => [JEL.k, JEL.cx, JEL.cy]);
  const fg = await p5.$('#epvScene .jTel[data-epv="csop:FG"]');
  if (fg) { await fg.click(); await p5.waitForTimeout(400); await nyugodt(p5); }
  const fgAll = await p5.evaluate(k0 => ({ csop: EPV.csop,
    mozdult: Math.abs(JEL.k - k0[0]) > 1e-9 || Math.hypot(JEL.cx - k0[1], JEL.cy - k0[2]) > 1,
    sorok: [...document.querySelectorAll("#epvlist .epvrow")].map(b => b.dataset.ep).sort() }), fk0);
  t("a jelenet csoportjára koppintva (FG) a lista a csoportra szűkül, és a kamera odarepül",
    !!fg && fgAll.csop === "FG" && fgAll.mozdult && fgAll.sorok.includes("FG") && !fgAll.sorok.includes("FF"),
    JSON.stringify(fgAll));
  /* Billentyűvel húzás után is: a húzás elmozdulása csak a következő
     lenyomáskor nullázódott, és addig a címkén az Enter semmit nem tett. */
  await p5.evaluate(() => { epvLep({ tel: null, csop: null, kod: null }); epvOda("orszag"); }); await nyugodt(p5);
  const sb = await p5.evaluate(() => { const r = document.getElementById("epvScene").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p5.mouse.move(sb.x, sb.y); await p5.mouse.down(); await p5.mouse.move(sb.x + 30, sb.y + 10, { steps: 5 }); await p5.mouse.up();
  await p5.waitForTimeout(300);
  await p5.locator('#epvScene .jTel[data-epv="tel:Budapest"]').focus(); await p5.keyboard.press("Enter"); await p5.waitForTimeout(500);
  t("húzás után a jelenet címkéjén az Enter megnyitja a települést", await p5.evaluate(() => EPV.tel) === "Budapest");
  /* A kiválasztott ház címkéje sötét témában: fehér betű a világos kiemelő
     színen 2,75-ös kontrasztot adott. */
  await p5.evaluate(() => epvOda("ep", "OA")); await p5.waitForTimeout(400); await nyugodt(p5);
  const kontr = await p5.evaluate(() => { const b = document.querySelector("#epvScene .jNev.most"); if (!b) return 0;
    const s = getComputedStyle(b), rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const L = c => { const v = rgb(c).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const a = L(s.color), g = L(s.backgroundColor); return +((Math.max(a, g) + .05) / (Math.min(a, g) + .05)).toFixed(2); });
  t("sötét témában a kiválasztott ház címkéjének kontrasztja legalább 4,5", kontr >= 4.5, String(kontr));
  await p5.close(); await c5.close();
});

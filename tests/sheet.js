/* Az alulról felcsúszó panel. Egyszer bejelentett hiba: telefonon nem lehetett
   letekerni a navigáció aljáig — az utolsó lépés 213 képponttal a képernyő
   alatt maradt. A panel alsó belső margóját a pillanatnyi állás szabja meg,
   ezért mindhárom állást külön kell nézni, és a hosszú találati listát is. */
const { run, open, DESKTOP } = require("./lib");

const reach = page => page.evaluate(async () => {
  const out = {};
  const sc = document.querySelector(".scroll");
  for (const snap of ["peek", "mid", "full"]) {
    setSnap(snap);
    await new Promise(r => setTimeout(r, 550));
    sc.scrollTop = sc.scrollHeight;
    await new Promise(r => setTimeout(r, 200));
    const items = [...sc.querySelectorAll(".step,.res-item")];
    if (!items.length) { out[snap] = null; continue; }
    const last = items[items.length - 1].getBoundingClientRect();
    out[snap] = { db: items.length,
                  elerheto: last.bottom <= innerHeight + 1,
                  alatta: +Math.max(0, last.bottom - innerHeight).toFixed(0),
                  pad: getComputedStyle(sc).paddingBottom };
  }
  return out;
});

run("alsó panel görgethetősége", async ({ t, ctx, browser, base }) => {
  const p = await open(ctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1400 });

  const steps = await reach(p);
  for (const snap of ["peek", "mid", "full"]) {
    const s = steps[snap];
    t(`útvonal-lépések: "${snap}" állásban az utolsó is elérhető`,
      s && s.elerheto, s ? s.alatta + "px a képernyő alatt" : "nincs elem");
  }

  // hosszú találati lista — más renderág, ugyanaz a kérdés
  await p.evaluate(async () => { const q = document.getElementById("q");
    q.value = "a"; q.dispatchEvent(new Event("input", { bubbles:true }));
    await new Promise(r => setTimeout(r, 400)); });
  const res = await reach(p);
  for (const snap of ["peek", "mid", "full"]) {
    const s = res[snap];
    t(`találati lista: "${snap}" állásban az utolsó is elérhető`,
      s && s.elerheto, s ? s.alatta + "px a képernyő alatt" : "nincs elem");
  }
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await p.close();

  /* Fekvő telefonon (844×390, 667×375) a szintsín felső gombjai a fejléc
     mögé kerültek, elérhetetlenül; 932×430-on (asztali elrendezés) a +/−
     gombok takarták az alsókat. Most a sín a helyére korlátozva görget. */
  for (const [w, h] of [[844, 390], [667, 375], [932, 430]]) {
    const fctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w <= 900, hasTouch: true, deviceScaleFactor: 1 });
    const f = await open(fctx, base + "#OA40E01", { settle: 1400 });
    const sin = await f.evaluate(() => {
      const fej = document.querySelector(".head").getBoundingClientRect(), r = document.getElementById("rail");
      const gombok = [...r.querySelectorAll(".lv")];
      const fedi = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const rr = r.getBoundingClientRect(), tools = [...document.querySelectorAll("#tools button")].map(b => b.getBoundingClientRect()).filter(x => x.width);
      const aktiv = r.querySelector('[aria-pressed="true"]').getBoundingClientRect();
      return { fejAlatt: rr.top >= fej.bottom - 1, toolsNem: !tools.some(x => fedi(x, rr)),
               aktivLatszik: aktiv.top >= rr.top - 1 && aktiv.bottom <= rr.bottom + 1, n: gombok.length,
               gorget: r.scrollHeight > r.clientHeight };
    });
    t(`${w}×${h}: a szintsín a fejléc alatt, a +/− gomboktól szabadon, az aktív szint látszik`,
      sin.fejAlatt && sin.toolsNem && sin.aktivLatszik, JSON.stringify(sin));
    await fctx.close();
  }

  /* A beállítások menüje zárva rejtett (nem csak átlátszó), az Esc bezárja,
     és a fókusz a nyitógombra tér vissza. */
  const mctx = await browser.newContext(require("./lib").PHONE);
  const m = await open(mctx, base, { settle: 1200 });
  const zarva = await m.evaluate(() => getComputedStyle(document.getElementById("optbar")).visibility);
  await m.click("#menuBtn"); await m.waitForTimeout(300);
  await m.locator("#langEn").focus();
  await m.keyboard.press("Escape"); await m.waitForTimeout(300);
  const menu = await m.evaluate(() => ({ nyitva: document.getElementById("optbar").classList.contains("open"),
    fokusz: document.activeElement.id, allapot: document.getElementById("menuBtn").getAttribute("aria-expanded") }));
  t("a zárt menü rejtett; az Esc bezárja, a fókusz a menü gombjára kerül",
    zarva === "hidden" && !menu.nyitva && menu.fokusz === "menuBtn" && menu.allapot === "false", JSON.stringify({ zarva, ...menu }));
  await mctx.close();

  // asztali nézetben nem kell a mobilos alsó margó
  const dctx = await browser.newContext(DESKTOP);
  const d = await open(dctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1400 });
  t.eq("asztali nézetben nincs fölösleges alsó margó",
    await d.evaluate(() => getComputedStyle(document.querySelector(".scroll")).paddingBottom), "0px");
  await dctx.close();
});

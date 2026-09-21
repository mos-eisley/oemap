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

  // asztali nézetben nem kell a mobilos alsó margó
  const dctx = await browser.newContext(DESKTOP);
  const d = await open(dctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1400 });
  t.eq("asztali nézetben nincs fölösleges alsó margó",
    await d.evaluate(() => getComputedStyle(document.querySelector(".scroll")).paddingBottom), "0px");
  await dctx.close();
});

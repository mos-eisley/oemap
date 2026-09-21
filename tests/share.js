/* Megosztás gomb: navigator.share, ahol van, különben vágólap.
   A gomb abban a szakaszban ül, amelyik épp látszik — egy kiválasztott terem
   önmagában is megosztható link, nem csak a kész útvonal. */
const { run, open, PHONE, DESKTOP } = require("./lib");

run("megosztás", async ({ t, browser, base }) => {
  // 1) mobil: navigator.share ág
  let ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(() => { window.__shared = null; navigator.share = async d => { window.__shared = d; }; });
  let p = await open(ctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1200 });
  const box = await p.evaluate(() => { const e=document.querySelector(".shr");
    if(!e) return null; const r=e.getBoundingClientRect(); return {w:r.width,h:r.height}; });
  t("a gomb látszik és elég nagy ujjal", box && box.w>=28 && box.h>=28, JSON.stringify(box));
  await p.click(".shr"); await p.waitForTimeout(300);
  const sh = await p.evaluate(() => window.__shared);
  t("navigator.share-t hívja, ahol van", !!sh);
  t("a megosztott URL a mély link", sh && sh.url.includes("#from=OA00FK1&to=OA10E18"), sh && sh.url);
  t("a cím mindkét termet megnevezi", sh && sh.title.includes("OA00FK1") && sh.title.includes("OA10E18"), sh && sh.title);
  await ctx.close();

  // 2) asztali: nincs navigator.share -> vágólap + visszajelzés
  ctx = await browser.newContext(DESKTOP);
  await ctx.addInitScript(() => { delete Navigator.prototype.share; window.__clip = null;
    Object.defineProperty(navigator, "clipboard", { value:{ writeText: async x => { window.__clip = x; } }, configurable:true }); });
  p = await open(ctx, base + "#OA20E01", { settle: 1200 });
  await p.click(".shr"); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => window.__clip);
  t("share nélkül vágólapra másol", !!clip, clip);
  t("egy teremnél a rövid alakot adja", clip && clip.endsWith("#OA20E01"), clip);
  const toast = await p.evaluate(() => { const e=document.getElementById("toast");
    return e && { on:e.classList.contains("on"), op:getComputedStyle(e).opacity }; });
  t("van látható visszajelzés", toast && toast.on && parseFloat(toast.op) > 0.5, JSON.stringify(toast));
  await p.waitForTimeout(2400);
  t("a visszajelzés magától eltűnik",
    await p.evaluate(() => !document.getElementById("toast").classList.contains("on")));
  await ctx.close();

  // 3) elvetett megosztás ne essen vágólapra — az AbortError nem hiba
  ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(() => { window.__clip = null;
    navigator.share = async () => { const e = new Error("x"); e.name = "AbortError"; throw e; };
    Object.defineProperty(navigator, "clipboard", { value:{ writeText: async x => { window.__clip = x; } }, configurable:true }); });
  p = await open(ctx, base + "#OA20E01", { settle: 1200 });
  await p.click(".shr"); await p.waitForTimeout(400);
  t("elvetett megosztás nem másol vágólapra", (await p.evaluate(() => window.__clip)) === null);
  await ctx.close();

  // 4) üres állapotban nincs mit megosztani
  ctx = await browser.newContext(DESKTOP);
  p = await open(ctx, base, { settle: 1200 });
  t("üres indulásnál nincs gomb", !(await p.evaluate(() => !!document.querySelector(".shr"))));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await ctx.close();
});

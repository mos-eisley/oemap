/* Élesség Épület nézetben, nagyítva — asztalon.

   Perspektívánál a böngésző a megdöntött szintet a nagyítástól független
   felbontással raszterezi, és a nagyítás ezt a bitmapet nyújtja fel. Asztalon
   tízszeresig lehet nagyítani, és élesben „irgalmatlan életlen" lett tőle a
   3D: a falak lépcsős, elmosott sávok. A javítás (syncDens()) nyugvó képen a
   nagyításhoz igazítja az aktív szint rajzának sűrűségét. Ez a teszt a
   hatást a böngésző képén méri, nem a kód képletén:
   - nagyítva is olyan élesek az élek, mint alapnagyításon;
   - a sűrűség nem mozdítja el a képet, és alaprajzon semmit nem változtat;
   - mozgás és áttűnés közben nem vált, mert a váltás újraraszterez;
   - csak az aktív szintnél, és telefonon nem. */
const { run, open, DESKTOP, PHONE } = require("./lib");

/* A legélesebb élek egy képpontnyi lépése a kivágás kontrasztjához képest
   (a gradiens 99,9. percentilise / a fényesség terjedelme). Éles élnél ~0,7–0,9,
   m-szeresen felnyújtott textúránál nagyjából 1/m-ed része. */
async function elesseg(p, clip) {
  const png = (await p.screenshot({ clip })).toString("base64");
  const q = await p.context().newPage();
  const v = await q.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const { data, width:w, height:h } = g.getImageData(0, 0, c.width, c.height);
    const L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) L[i] = .299 * data[4*i] + .587 * data[4*i+1] + .114 * data[4*i+2];
    const gr = [];
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const i = y * w + x; gr.push(Math.abs(L[i+1] - L[i]), Math.abs(L[i+w] - L[i])); }
    gr.sort((a, b) => a - b);
    const s = Array.from(L).sort((a, b) => a - b);
    return { el:gr[Math.floor(gr.length * .999)] / (s[Math.floor(s.length * .998)] - s[Math.floor(s.length * .002)]), L:Array.from(L) };
  }, "data:image/png;base64," + png);
  await q.close();
  return v;
}

run("élesség nagyítva", async ({ t, ctx, browser, base }) => {
  const p = await open(ctx, base, { settle: 1600 });
  await p.evaluate(() => {
    // minden sűrűségváltás idejét és pillanatnyi állapotát feljegyezzük
    window.__valt = []; window.__mozdult = 0;
    const stage = document.getElementById("stage");
    stage.addEventListener("wheel", () => { __mozdult = performance.now(); }, { capture:true });
    new MutationObserver(ms => { for (const m of ms) __valt.push({ t:performance.now(), lv:+m.target.closest(".floor").dataset.lv,
      now:world.classList.contains("now"),
      anim:world.getAnimations({ subtree:true }).filter(a => a.playState === "running" &&
        a.effect.getTiming().iterations !== Infinity).length }); })
      .observe(world, { attributes:true, attributeFilter:["width"], subtree:true });
  });
  // a váltás végét a böngészőtől kérdezzük, utána a sűrűség 250 ms-mal később áll be
  const nyugszik = () => p.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter(a => a.effect && a.effect.getComputedTiming().endTime !== Infinity)
      .map(a => a.finished.catch(() => {})));
    await new Promise(r => setTimeout(r, 700));
  });
  const F10 = () => p.evaluate(() => { const r = document.querySelector('.floor.on [data-code="OA00F10"]').getBoundingClientRect();
    return { x:r.x, y:r.y, w:r.width, h:r.height, cx:Math.round(r.x + r.width / 2), cy:Math.round(r.y + r.height / 2) }; });
  // 400×260-as kivágás a pont körül, a képen belül tartva — egy elcsúszott
  // térkép bukást adjon, ne a képernyőkép hibáját
  const korul = q => ({ x:Math.min(Math.max(0, q.cx - 200), DESKTOP.viewport.width - 400),
                        y:Math.min(Math.max(0, q.cy - 130), DESKTOP.viewport.height - 260), width:400, height:260 });

  await p.evaluate(() => { setMode(3); document.getElementById("zfit").click(); });
  await nyugszik();
  const f = await F10();
  const kivag = korul(f);
  const alap = await elesseg(p, kivag);

  // egérgörgővel rá a teremre, kb. négyszeresre — gyorsan egymás után, mint a kéz
  let n = 0;
  while (await p.evaluate(() => S.view.k) < 4 && n++ < 40) {
    await p.mouse.move(f.cx, f.cy); await p.mouse.wheel(0, -100); await p.waitForTimeout(40); }
  const utolso = await p.evaluate(() => __mozdult);
  await nyugszik();
  const nagy = await p.evaluate(() => ({ k:+S.view.k.toFixed(2), d:FLOOR[S.level].dens || 1,
    tobbi:LV.filter(lv => lv !== S.level).map(lv => +FLOOR[lv].svg.getAttribute("width") === PW) }));
  const zoom = await elesseg(p, kivag);
  t("nagyítva is éles a 3D, nem felnyújtott textúra", zoom.el >= .8 * alap.el,
    `alapnagyításon ${alap.el.toFixed(2)}, ${nagy.k}×-esen ${zoom.el.toFixed(2)} (sűrűség ${nagy.d})`);
  t("csak az aktív szint rajzolódik sűrűbben", nagy.d > 1 && nagy.tobbi.every(Boolean), JSON.stringify(nagy));

  // ugyanaz a kép sűrűbben: a terem ugyanott marad
  const most = await F10();
  const ritka = await p.evaluate(async () => { setDens(S.level, 1); await new Promise(r => setTimeout(r, 300));
    const r = document.querySelector('.floor.on [data-code="OA00F10"]').getBoundingClientRect();
    return { x:r.x, y:r.y, w:r.width, h:r.height }; });
  const elter = Math.max(...["x", "y", "w", "h"].map(k => Math.abs(most[k] - ritka[k])));
  t("a sűrűség nem mozdítja el a képet", elter < .5, `${elter.toFixed(2)} px eltérés`);
  await p.evaluate(() => syncDens()); await nyugszik();

  /* Gombbal nagyítva a világ 1 s-ig úszik; a váltásnak utána kell jönnie.
     Két kattintás 1,22×-ével már egy √2-es lépcsőt átlép. */
  const dElotte = await p.evaluate(() => FLOOR[S.level].dens);
  await p.evaluate(() => { document.getElementById("zin").click(); document.getElementById("zin").click(); });
  await nyugszik();
  const gomb = await p.evaluate(() => FLOOR[S.level].dens);

  const valt = await p.evaluate(() => __valt);
  const mozgasKozben = valt.filter(v => v.now || v.anim > 0);
  t("görgetés közben nem vált sűrűséget, csak utána", valt.length > 0 && valt[0].t > utolso + 200,
    `utolsó görgetés után ${valt.length ? (valt[0].t - utolso).toFixed(0) : "–"} ms`);
  t("mozdulat és áttűnés közben soha nem vált", mozgasKozben.length === 0 && gomb !== dElotte,
    JSON.stringify({ mozgasKozben, gomb, dElotte }));

  // szintváltáskor az új aktív szint kapja meg, a régi visszaáll
  const sv = await p.evaluate(async () => { const regi = S.level, uj = LV[LVI[regi] + 1];
    setLevel(uj); return { regi, uj }; });
  await nyugszik();
  const svUtan = await p.evaluate(({ regi, uj }) => ({ uj:FLOOR[uj].dens || 1, regi:FLOOR[regi].dens || 1 }), sv);
  t("szintváltáskor az új szint kapja a sűrűséget, a régi visszaáll", svUtan.uj > 1 && svUtan.regi === 1,
    JSON.stringify(svUtan));
  await p.evaluate(l => setLevel(l), sv.regi); await nyugszik();

  /* Alaprajzon a böngésző amúgy is a nagyításhoz raszterez: a sűrűség ott
     semmit nem változtathat a képen. */
  await p.evaluate(() => setMode(2, true)); await nyugszik(); await p.waitForTimeout(1200);
  const g = await F10();
  const sik = korul(g);
  const surun = await p.evaluate(() => FLOOR[S.level].dens || 1);
  const a2 = await elesseg(p, sik);
  await p.evaluate(async () => { setDens(S.level, 1); await new Promise(r => setTimeout(r, 400)); });
  const b2 = await elesseg(p, sik);
  let kul = 0; for (let i = 0; i < a2.L.length; i++) kul += Math.abs(a2.L[i] - b2.L[i]);
  t("alaprajzon is a nagyítást követi, de a kép ugyanaz marad", surun > 1 && kul / a2.L.length < 1.5,
    `sűrűség ${surun}, átlagos eltérés ${(kul / a2.L.length).toFixed(2)} (0–255)`);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));

  // telefonon nem: ott a legszűkebb a raszterkeret
  const tel = await open(await browser.newContext(PHONE), base, { settle: 1200 });
  const telD = await tel.evaluate(async () => { setMode(3); await new Promise(r => setTimeout(r, 1500));
    S.view.k *= 5; updateView(); await new Promise(r => setTimeout(r, 1800));
    return LV.map(lv => FLOOR[lv].dens || 1); });
  t("telefonon a szintek sűrűsége nem változik", telD.every(d => d === 1), JSON.stringify(telD));
  t("telefonon sincs JS hiba", tel.jsErrors.length === 0, tel.jsErrors.join(" | "));

  /* A szabályt Chromiumban mértük; a többi motor másképp raszterezi a 3D-t,
     ott a trükk haszna és ára is ismeretlen, ezért ott nem kapcsol be. A
     motort a navigator.userAgentData-ból ismeri fel, azt vesszük el. */
  const mctx = await browser.newContext(DESKTOP);
  await mctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "userAgentData", { get:() => undefined }));
  const mas = await open(mctx, base, { settle: 1200 });
  const masD = await mas.evaluate(async () => { setMode(3); await new Promise(r => setTimeout(r, 1500));
    S.view.k *= 5; updateView(); await new Promise(r => setTimeout(r, 1800));
    return LV.map(lv => FLOOR[lv].dens || 1); });
  t("más böngészőmotorban a szintek sűrűsége nem változik", masD.every(d => d === 1), JSON.stringify(masD));
}, DESKTOP);

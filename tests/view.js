/* Nézetek: alaprajz (2D) és épület (3D), szintváltás, kiválasztás.
   A 2D-ben csak az aktív szint van kifestve — ez a mobil teljesítmény ára és
   haszna egyszerre, ezért figyeljük, hogy váltáskor tényleg visszajön. */
const { run, open, DESKTOP } = require("./lib");

run("nézetek és szintváltás", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  const r = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const vis = () => [...document.querySelectorAll(".floor")]
      .map(f => ({ lv:f.dataset.lv, on:f.classList.contains("on"), v:getComputedStyle(f).visibility }));
    const out = {};

    out.induloMode = S.mode;                       // alapból alaprajz kell legyen
    out.induloFlat = document.getElementById("app").classList.contains("flat2d");

    // 3D-ben egy födémre kattintva bele kell merülni abba a szintbe
    setMode(3); await w(1300);
    document.querySelector('.floor[data-lv="2"] .hit')
      .dispatchEvent(new MouseEvent("click", { bubbles:true }));
    await w(1400);
    out.merules = { mode:S.mode, level:S.level };

    out.latszo2D = vis().filter(f => f.v !== "hidden").map(f => f.lv);

    // szintváltás 2D-ben: az új szintnek újra láthatóvá kell válnia
    dive(4); await w(1400);
    const v4 = vis();
    out.negyedik = { lv:S.level, latszo:v4.filter(f=>f.v!=="hidden").map(f=>f.lv),
                     aktivKifestve: v4.find(f=>f.on).v !== "hidden" };
    dive(0); await w(1400);
    const v0 = vis();
    out.foldszint = { lv:S.level, latszo:v0.filter(f=>f.v!=="hidden").map(f=>f.lv),
                      aktivKifestve: v0.find(f=>f.on).v !== "hidden" };

    // vissza 3D-be: minden szint legyen újra kifestve
    setMode(3); await w(1300);
    out.vissza3D = { flat:document.getElementById("app").classList.contains("flat2d"),
                     rejtett: vis().filter(f=>f.v==="hidden").length,
                     perspektiva: getComputedStyle(document.getElementById("stage")).perspective };

    // kiválasztás 2D-ben
    setMode(2); await w(1300);
    document.querySelector(".floor.on .room.pick")
      .dispatchEvent(new MouseEvent("click", { bubbles:true }));
    await w(300);
    out.kivalasztas = document.querySelectorAll(".room.sel").length > 0;
    return out;
  });

  t("alaprajzzal indul, nem 3D-vel", r.induloMode === 2 && r.induloFlat, JSON.stringify({m:r.induloMode,f:r.induloFlat}));
  t.eq("födémre kattintva belemerül a szintbe", r.merules, { mode:2, level:2 });
  t.eq("2D-ben csak az aktív szint van kifestve", r.latszo2D, ["2"]);
  t("felső szintre váltva az új szint látszik", r.negyedik.lv===4 && r.negyedik.aktivKifestve, JSON.stringify(r.negyedik));
  t("földszintre váltva is", r.foldszint.lv===0 && r.foldszint.aktivKifestve, JSON.stringify(r.foldszint));
  t("3D-ben újra minden szint kifestve", !r.vissza3D.flat && r.vissza3D.rejtett===0, JSON.stringify(r.vissza3D));
  t("3D-ben van perspektíva", /px/.test(r.vissza3D.perspektiva), r.vissza3D.perspektiva);
  t("alaprajzon is lehet termet választani", r.kivalasztas);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
}, DESKTOP);

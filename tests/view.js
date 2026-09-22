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

    /* Takarás. A +Z a néző felé mutat, tehát a magasabb emelet van elöl, és a
       födémje ráfekszik az aktív szint alaprajzára. Egyenként 0,82-es
       födémekkel a földszint gyakorlatilag eltűnt — laposabb dőlésnél teljesen.
       Itt a földszintre állunk, ahol öt szint van fölöttünk, és azt mérjük,
       mennyi jut át rajtuk. */
    dive(0); await w(1200);
    setMode(3); await w(1300);
    const ai = LVI[S.level];
    const atjut = tilt => {                 // a fölöttes rétegek áteresztése
      const volt = S.rot.x; S.rot.x = tilt;
      let T = 1;
      for (const lv of LV) if (FLOOR[lv].idx > ai) T *= 1 - floorOpacity(FLOOR[lv].idx, ai);
      S.rot.x = volt;
      return T;
    };
    out.takaras = {
      folotte1: +floorOpacity(ai+1, ai).toFixed(3),
      alatta1:  +floorOpacity(ai-1, ai).toFixed(3),
      aktiv:    floorOpacity(ai, ai),
      laposan:  +atjut(15).toFixed(3),      // itt takarna a legjobban
      alap:     +atjut(58).toFixed(3),
      elbol:    +atjut(85).toFixed(3),
    };
    /* A dőlés tényleg mozgatja, és a syncFloorOpacity() ki is írja: döntés
       közben a paint() ezt hívja képkockánként. A beírt (inline) értéket
       olvassuk, nem a számítottat — az utóbbi az áttűnés közepét adná. */
    const felsoOp = () => +(+FLOOR[LV[ai+1]].box.style.opacity).toFixed(3);
    S.rot.x = 20; syncFloorOpacity(); const lapos = felsoOp();
    S.rot.x = 80; syncFloorOpacity(); const meredek = felsoOp();
    S.rot.x = 58; syncFloorOpacity();
    out.dolesKoveti = { lapos, meredek };

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
  t("az aktív szint teljesen átlátszatlan", r.takaras.aktiv === 1);
  t("a fölötte lévő szint halványabb, mint az alatta lévő",
    r.takaras.folotte1 < r.takaras.alatta1,
    `fölötte=${r.takaras.folotte1}, alatta=${r.takaras.alatta1}`);
  t("laposan a köteg átengedi az aktív alaprajzot", r.takaras.laposan > 0.4,
    `${(r.takaras.laposan*100).toFixed(0)}% jut át 5 szinten keresztül`);
  t("az alapállásban is átjön", r.takaras.alap > 0.15,
    `${(r.takaras.alap*100).toFixed(0)}%`);
  t("a takarás a dőléssel mozog", r.dolesKoveti.lapos < r.dolesKoveti.meredek,
    `20°-on ${r.dolesKoveti.lapos}, 80°-on ${r.dolesKoveti.meredek}`);
  t("alaprajzon is lehet termet választani", r.kivalasztas);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
}, DESKTOP);

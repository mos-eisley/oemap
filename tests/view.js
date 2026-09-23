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
    /* A dőlés tényleg mozgatja, és a syncFloors() ki is írja: döntés
       közben a paint() ezt hívja képkockánként. A beírt (inline) értéket
       olvassuk, nem a számítottat — az utóbbi az áttűnés közepét adná. */
    const felsoOp = () => +(+FLOOR[LV[ai+1]].box.style.opacity).toFixed(3);
    S.rot.x = 20; syncFloors(); const lapos = felsoOp();
    S.rot.x = 80; syncFloors(); const meredek = felsoOp();
    S.rot.x = 58; syncFloors();
    out.dolesKoveti = { lapos, meredek };

    /* Nézetváltás közben SVG-n BELÜL semmi nem animálhat. Egy belső elem
       áttűnése (helyiségek, falak, födémárnyék, feliratok) az egész szintet
       képkockánként újrafesteti, hét szinten, a mozgás közepén — ez volt a
       döccenés. A mozgást a szintdobozok és a világ adják, azok saját rétegen
       mennek. Nem egy CSS-tulajdonságot kérünk számon, hanem magát az elvet:
       a böngésző megmondja, mi animál éppen.
       Útvonallal mérjük, mert akkor a pulzáló célgyűrű is kint van — az is
       SVG-n belül van, és ugyanúgy koszolná a réteget.

       Csak azt kérjük számon, amit a váltás INDÍT, plusz a végtelen
       ismétlődésűeket. Egy frissen kirajzolt útvonal beúszása és a végpontok
       beugrása egyszeri, az útvonal rajzolásához tartozik, nem a váltáshoz —
       lassú gépen még futhat a mérés pillanatában, és az első változat ettől
       pelyhes volt. A getAnimations() maga kiüríti a függő stílusváltozásokat,
       így a váltás által indított áttűnések a hívás pillanatában már léteznek:
       ez az ellenőrzés nem függ az időzítéstől. */
    /* Kétszer nézünk rá: azonnal, és két képkockával később. Terhelt gépen a
       böngésző néha csak a következő képkockában hozza létre az áttűnéseket,
       egy túl lassú képkocka alatt viszont egy fél másodperces áttűnés le is
       futhat — a kettő uniója egyiken sem csúszik át.
       Csak a váltási ablakon BELÜL számít, amíg a .switching fent van: a
       szoftveres renderelőn a 3D-be lépés utáni két képkocka túlnyúlhat az
       1,15 s-os ablakon, és utána a célgyűrű jogosan pulzál újra. */
    const ket = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const appEl = document.getElementById("app");
    async function valtas(mode){
      const elotte = new Set(document.getAnimations());
      const svgBelso = new Set();
      const nez = () => { if (!appEl.classList.contains("switching")) return;
        for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (a.playState === "running" && el && el.ownerSVGElement &&
            (!elotte.has(a) || a.effect.getComputedTiming().iterations === Infinity))
          svgBelso.add(el.getAttribute("class") || el.tagName);
      } };
      setMode(mode);
      nez(); await ket(); nez();
      return { mode:S.mode, svgBelso:[...svgBelso] };
    }
    S.from = "OA00FK1"; S.to = "OA10E18"; recompute(); await w(1500);
    setMode(2); await w(1600);
    out.valtas3 = await valtas(3); await w(1600);
    out.valtas2 = await valtas(2); await w(1600);
    /* Egy kamera, két állás. A váltás mindkét végén ugyanaz a függvénylista
       kell álljon (rotateX … rotateZ), különben a böngésző mátrixként
       interpolál, és a dőlés meg a fordulás egyetlen átlós lendítéssé mosódik.
       Nem azt nézzük, mit írt a kód, hanem hogy a böngésző MIT animál: a futó
       áttűnés kulcskockáit. */
    const vilagKf = () => document.getAnimations()
      .filter(a => a.effect && a.effect.target === world && a.transitionProperty === "transform")
      .map(a => a.effect.getKeyframes().map(k => k.transform))[0] || [];
    const illeszkedik = kf => kf.length === 2 && kf.every(s => /rotateX\(.*rotateZ\(/.test(s));
    setMode(3); out.kfEpuletre = vilagKf(); await w(1600);
    /* Visszafelé a kiírt CÉLformát nézzük, nem a kulcskockát: a szoftveres
       renderelő torlódásakor a böngésző néha csak később rögzíti a kiinduló
       állapotot, és egy pillanatra nincs mit kiolvasni — valódi eszközön ez nem
       fordul elő (12 váltásból 12-szer elindult). A régi hiba épp a cél volt:
       rotate() a rotateX…rotateZ helyett. */
    setMode(2); out.kfAlaprajzra = [world.style.transform, world.style.transform]; await w(1600);
    // nyugalomban az alaprajz lelapul: ugyanaz a kép, de 3D kontextus nélkül
    out.nyugvoAlaprajz = { forma:world.style.transform.replace(/translate\([^)]*\)\s*|scale\([^)]*\)\s*/g, ""),
                           flat2d:document.getElementById("app").classList.contains("flat2d") };
    out.illeszkedik = { be:illeszkedik(out.kfEpuletre), ki:illeszkedik(out.kfAlaprajzra) };

    /* Az aktív szint kontúrja: Épület nézetben ez különbözteti meg a többi
       fehér födémtől, ha a helyiségei mind szürkék (a Félemelet ilyen). */
    setMode(3); await w(1500);
    const minta = document.createElement("i"); minta.style.color = "var(--accent)";
    document.body.appendChild(minta); const akcent = getComputedStyle(minta).color; minta.remove();
    const korvonal = lv => getComputedStyle(FLOOR[lv].svg.querySelector(".slab")).stroke;
    out.kontur = { aktiv:korvonal(S.level), akcent,
                   masik:korvonal(LV.find(lv => lv !== S.level)) };
    setMode(2); await w(1600);
    out.kontur.alaprajzon = korvonal(S.level);

    // nyugalomban minden visszaáll: a gyűrű újra pulzál
    out.utana = { switching:document.getElementById("app").classList.contains("switching"),
                  gyuru:document.getAnimations().some(a => a.playState === "running" &&
                    a.effect && a.effect.target && a.effect.target.classList.contains("ring")) };
    S.from = S.to = null; recompute(); await w(300);

    // kiválasztás 2D-ben
    setMode(2); await w(1600);
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
  t("Épületre vált", r.valtas3.mode === 3, "mód=" + r.valtas3.mode);
  t("de SVG-n belül semmi nem animál közben", r.valtas3.svgBelso.length === 0,
    r.valtas3.svgBelso.join(", "));
  t("Alaprajzra vált", r.valtas2.mode === 2, "mód=" + r.valtas2.mode);
  t("és ott sem animál semmi SVG-n belül", r.valtas2.svgBelso.length === 0,
    r.valtas2.svgBelso.join(", "));
  t("a váltás után a célgyűrű újra pulzál", !r.utana.switching && r.utana.gyuru,
    JSON.stringify(r.utana));
  t("Épületre: a kamera ugyanazon a függvénylistán dől fel", r.illeszkedik.be,
    r.kfEpuletre.join("  →  "));
  t("Alaprajzra: ugyanúgy, visszafelé", r.illeszkedik.ki, r.kfAlaprajzra.join("  →  "));
  t("nyugalomban az alaprajz lapos 2D-s formát kap",
    /^rotate\(/.test(r.nyugvoAlaprajz.forma) && r.nyugvoAlaprajz.flat2d, JSON.stringify(r.nyugvoAlaprajz));
  t("Épület nézetben az aktív szint akcentszínű kontúrt kap",
    r.kontur.aktiv === r.kontur.akcent && r.kontur.masik !== r.kontur.akcent, JSON.stringify(r.kontur));
  t("alaprajzon nincs kontúr — ott úgyis csak egy szint látszik",
    r.kontur.alaprajzon !== r.kontur.akcent, r.kontur.alaprajzon);
  t("alaprajzon is lehet termet választani", r.kivalasztas);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
}, DESKTOP);

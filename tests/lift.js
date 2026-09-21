/* Lépcső vs. lift. Az épületben a hallgatók csak az FL3 magban lévő liftet
   használhatják, ezért az alapértelmezés a lépcső, és a lift csak alternatíva.
   Ahol a lift gyalog nem érhető el (földszint), ott nem szabad felkínálni. */
const { run, open } = require("./lib");

run("lift mint alternatíva", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  const r = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r,ms));
    const set = async (f,to) => { S.from=f; S.to=to; recompute(); await w(500); };
    const out = {};
    const IV = D.rooms.find(r => r.code && r.level === 5).code;

    await set("OA10E18", IV);
    out.A = { valaszto: !!document.querySelector(".viasw"), alap: S.via,
      lepcso: S.mms.stairs && { tav:S.mms.stairs.dist, vert:S.mms.stairs.vert },
      lift:   S.mms.lift   && { tav:S.mms.lift.dist,   vert:S.mms.lift.vert },
      gombok: [...document.querySelectorAll(".via")].map(x => x.dataset.via) };

    document.querySelector('[data-via="lift"]').click(); await w(600);
    out.B = { via:S.via, aktiv:[...document.querySelectorAll(".via.on")].map(x=>x.dataset.via),
      vonalak: document.querySelectorAll(".rl").length,
      lepesek: [...document.querySelectorAll(".step.v .t")].map(e=>e.textContent) };

    document.querySelector('[data-via="stairs"]').click(); await w(600);
    out.C = { via:S.via };

    // új útvonalnál újra a lépcső legyen az alapértelmezés
    document.querySelector('[data-via="lift"]').click(); await w(400);
    await set("OA10E18", D.rooms.find(r => r.code && r.level === 4).code);
    out.D = S.via;

    // földszintről a hallgatói lift gyalog nem érhető el
    await set("OA00FK1", IV);
    out.E = { hasLift:S.hasLift, valaszto:!!document.querySelector(".viasw"),
              jegyzet:(document.querySelector(".note")||{}).textContent || "" };

    // azonos szinten nincs mit választani
    await set("OA00F01", "OA00F03");
    out.F = { hasLift:S.hasLift, valaszto:!!document.querySelector(".viasw") };
    return out;
  });

  t("emeletek közt felkínálja a liftet", r.A.valaszto, JSON.stringify(r.A.gombok));
  t.eq("de alapból a lépcsőt javasolja", r.A.alap, "stairs");
  t("mindkét változatra van távolság és szintszám", !!(r.A.lepcso && r.A.lift), JSON.stringify(r.A));
  t("liftre váltva az lesz az aktív", r.B.via === "lift" && r.B.aktiv.join() === "lift", JSON.stringify(r.B.aktiv));
  t("a liftes útvonal ki is rajzolódik", r.B.vonalak > 0, "vonal=" + r.B.vonalak);
  t("a lépések a liftet említik", r.B.lepesek.some(x => /lift/i.test(x)), r.B.lepesek.join(" / "));
  t.eq("vissza lehet váltani lépcsőre", r.C.via, "stairs");
  t.eq("új útvonalnál újra a lépcső az alap", r.D, "stairs");
  t("földszintről nincs liftes alternatíva", !r.E.hasLift && !r.E.valaszto, JSON.stringify(r.E));
  t("és ezt meg is indokolja", /lift/i.test(r.E.jegyzet), r.E.jegyzet.slice(0, 60));
  t("azonos szinten nincs választó", !r.F.hasLift && !r.F.valaszto, JSON.stringify(r.F));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});

/* Az útvonal lépései. Előtte a portától a II. emeletig négy külön sor jött
   („Lépcsőn fel a(z) földszint szintre", „…a(z) félemelet szintre", „…a(z)
   i. emelet szintre"…), kisbetűs szintnévvel, az angol felületen is magyarul,
   és a célnál a tervlapi kód állt, nem az ajtón álló szám. A félemelet a
   lépcsőházak pihenője, nem külön emelet: a szintváltások száma sem számolja
   egésznek. */
const { run, open } = require("./lib");

run("útvonal lépései", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1400 });
  const r = await p.evaluate(() => {
    const ut = (f, to, lang) => { S.lang = lang || "hu";
      const rt = findRoute(ROOM[f], ROOM[to]), mm = analyse(rt), st = steps(rt, mm);
      return { vert: mm.vert, fugg: st.filter(x => x.v).map(x => x.t + " | " + x.d), cel: st[st.length - 1].d, mind: st.map(x => x.t + " " + x.d) }; };
    const o = { fel: ut("OAX1A02", "OA20E44"), en: ut("OAX1A02", "OA20E44", "en"),
      le: ut("OA30E01", "OAX1A02"), fele: ut("OA00FK1", "OA01F03"), audmax: ut("OAX1A02", "OA10E18") };
    /* A fordulás lépése: mennyi egyenes UTÁN kell fordulni. Szintenként a
       lépések méterei kiadják a szint szakaszának hosszát (kerekítéssel). */
    const fordul = (f, to, lang) => { S.lang = lang;
      const rt = findRoute(ROOM[f], ROOM[to]), mm = analyse(rt), st = steps(rt, mm);
      const ford = st.filter(x => x.ico === "↷" || x.ico === "↶");
      const m = x => +((x.d || x.t).match(/~(\d+)/) || [0, 0])[1];
      const szintek = mm.segs.map(s => ({ lv: s.lv, hossz: s.pts.reduce((d, p, i) => i ? d + Math.hypot(p[0] - s.pts[i - 1][0], p[1] - s.pts[i - 1][1]) : 0, 0),
        lepes: st.filter(x => x.lv === s.lv && !x.v && (x.ico === "↷" || x.ico === "↶" || x.ico === "↑")).reduce((d, x) => d + m(x), 0) }));
      return { ford: ford.map(x => x.t + " | " + x.d), szintek }; };
    o.fordHu = fordul("OAX1A02", "OA20E44", "hu"); o.fordEn = fordul("OA00FK1", "OA30E01", "en");
    S.lang = "en"; renderRail(); o.kartyaEn = document.getElementById("fname").textContent;
    S.lang = "hu"; renderRail(); o.kartyaHu = document.getElementById("fname").textContent;
    return o;
  });

  t("a lépcsőházban felfelé egy lépés, nem szintenként egy-egy", r.fel.fugg.length === 2 &&
    r.fel.fugg[1].startsWith("Lépcsőn fel a II. emeletre"), r.fel.fugg.join(" / "));
  t("a félemelet nem külön emelet: a portától a II. emeletig 3", r.fel.vert === 3 && r.audmax.vert === 2,
    `II.: ${r.fel.vert}, Audmax: ${r.audmax.vert}`);
  t("a lépés megmondja, hány szintet kell lépcsőzni", r.fel.fugg[1].includes("2 szint") || r.fel.fugg[1].includes("3 szint"),
    r.fel.fugg.join(" / "));
  t("lefelé is egy lépés, és a kiinduló szint lépcsőházának kódja áll mellette",
    r.le.fugg[0].startsWith("Lépcsőn le a földszintre") && r.le.fugg[0].includes("OA30EL1"), r.le.fugg.join(" / "));
  t("a félemeletre is helyes alakban", r.fele.fugg[0].startsWith("Lépcsőn fel a félemeletre"), r.fele.fugg.join(" / "));
  t("nincs kisbetűs, ragozatlan szintnév („a(z) i. emelet szintre”)",
    ![r.fel, r.le, r.fele, r.audmax].some(u => u.mind.some(x => /a\(z\)| szintre|(^|\s)i+\. emelet/.test(x))),
    [r.fel, r.le].map(u => u.mind.join(" / ")).join(" || "));
  t("a cél az ajtón álló számmal: 2.20, Audmax", r.fel.cel.startsWith("2.20 ") && r.audmax.cel.startsWith("Audmax "),
    r.fel.cel + " | " + r.audmax.cel);
  t("angolul angol szintnévvel", r.en.fugg.some(x => x.startsWith("Take the stairs up to the 2nd floor")) &&
    !r.en.mind.some(x => /emelet|földszint/i.test(x)), r.en.fugg.join(" / "));
  t("a szintkártya is a nyelvet követi", /^Ground floor/.test(r.kartyaEn) && /rooms/.test(r.kartyaEn) &&
    /^Földszint/.test(r.kartyaHu) && /helyiség/.test(r.kartyaHu), r.kartyaEn + " | " + r.kartyaHu);
  /* Élesben a „Fordulj jobbra · Haladj tovább ~48 m” úgy olvasódott, hogy
     előbb fordulj, aztán menj 48 métert — holott fordítva. */
  t("a fordulás lépése azt mondja, mennyi egyenes UTÁN kell fordulni", r.fordHu.ford.length > 0 &&
    r.fordHu.ford.every(x => /^Fordulj (jobbra|balra) \| ~\d+ m után$/.test(x)), r.fordHu.ford.join(" / "));
  t("angolul is: „Turn right | after ~N m”", r.fordEn.ford.length > 0 &&
    r.fordEn.ford.every(x => /^Turn (right|left) \| after ~\d+ m$/.test(x)), r.fordEn.ford.join(" / "));
  t("a lépések méterei szintenként kiadják a szakasz hosszát",
    [...r.fordHu.szintek, ...r.fordEn.szintek].every(s => s.hossz < 4 || Math.abs(s.lepes - s.hossz) <= 3 + s.hossz * .05),
    JSON.stringify([...r.fordHu.szintek, ...r.fordEn.szintek].map(s => [s.lv, Math.round(s.hossz), s.lepes])));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});

/* Ajtók az épület IFC-modelljéből (tools/ifc-ajtok.py). Előtte az útvonal a
   helyiséghez legközelebbi folyosócellánál ért véget, nem az ajtónál — az
   Audmaxnál a déli falnál, ahol nincs ajtó —, és ahova csak egy másik
   helyiségen át lehet bejutni (laborsor, irodából nyíló iroda), oda nem volt
   útvonal: a II. emeleti E03-as és E04-es laborba, az I. emeleti E03–E07-be. */
const { run, open } = require("./lib");

run("ajtók és átjárók", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1400 });

  const adat = await p.evaluate(() => {
    const ajtos = D.rooms.filter(r => r.doors && r.doors.length);
    const rossz = [], kor = [];
    for (const r of ajtos) for (const d of r.doors)
      if (nearestCell(r.level, d[0], d[1]) < 0) rossz.push(r.code);
    for (const r of D.rooms.filter(r => r.via)) {
      const v = ROOM[r.via];
      if (!v || v.level !== r.level) rossz.push(r.code + "→" + r.via);
      const latott = new Set([r.code]);
      for (let x = r; x && x.via; x = ROOM[x.via]) {
        if (latott.has(x.via)) { kor.push(r.code); break; }
        latott.add(x.via);
      }
    }
    return { ajtos: ajtos.length, via: D.rooms.filter(r => r.via).length, rossz, kor };
  });
  t("a helyiségek fele ajtóval kötődik a hálózatra", adat.ajtos >= 80, "ajtós: " + adat.ajtos);
  t("minden ajtó járható cellára nyílik, minden „via” létező, azonos szintű helyiség",
    adat.rossz.length === 0, adat.rossz.join(" "));
  t("a „via” láncban nincs kör", adat.kor.length === 0, adat.kor.join(" "));

  /* A más helyiségen át megközelíthetők: van útvonal a portáról, a lépések
     kiírják, min át (bejárási sorrendben), és az útvonal az átjáró helyiség
     ajtajánál ér véget. */
  const at = await p.evaluate(() => {
    const o = {};
    for (const c of ["OA10E03", "OA10E04", "OA10E05", "OA10E07", "OA20E03", "OA20E04"]) {
      const rt = findRoute(ROOM["OAX1A02"], ROOM[c]);
      if (!rt) { o[c] = null; continue; }
      const st = steps(rt, analyse(rt)), be = st.find(s => s.t === T().inThru);
      o[c] = { at: be && be.d, utolso: st[st.length - 1].d };
    }
    return o;
  });
  t("a csak más helyiségen át elérhető termekhez is van útvonal",
    Object.values(at).every(Boolean), JSON.stringify(at));
  t.eq("a lépésekben a bejárat sorrendben: előbb az E01, aztán az E03",
    at.OA20E04 && at.OA20E04.at, "OA20E01 · LABOR → OA20E03 · LABOR");
  t("a cél utána is maga a terem", at.OA20E04 && /^OA20E04/.test(at.OA20E04.utolso), JSON.stringify(at.OA20E04));

  const ki = await p.evaluate(() => {
    const rt = findRoute(ROOM["OA10E07"], ROOM["OAX1A02"]);
    const st = rt && steps(rt, analyse(rt)), k = st && st.find(s => s.t === T().outThru);
    return k && k.d;
  });
  t("onnan indulva a kijáratot írja ki", /^OA10E06/.test(ki || ""), ki);

  /* Az útvonal ajtónál ér véget; több ajtó közül annál, amelyik az induláshoz
     közelebb esik. Ajtónként azt az egyajtós forrást választjuk, amelyiknek
     az ajtaja ehhez az ajtóhoz a legközelebbi (a többajtós forrásnál a két
     ajtópár közül bármelyik lehet a rövidebb). */
  const veg = await p.evaluate(() => {
    const vegpont = rt => { const s = analyse(rt).segs; const l = s[s.length - 1].pts; return l[l.length - 1]; };
    const kozel = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const o = { ajtonal: [], tobb: [] };
    for (const c of ["OA10E18", "OA00F01", "OA10E45", "OA00F07"]) {
      const rt = findRoute(ROOM["OAX1A02"], ROOM[c]);
      const e = rt && vegpont(rt);
      o.ajtonal.push([c, e && Math.min(...ROOM[c].doors.map(d => kozel(d, e))).toFixed(2)]);
    }
    for (const c of ["OA10E18", "OA10E45", "OA10E31"]) {
      const X = ROOM[c];
      for (const d of X.doors) {
        const Y = D.rooms.filter(r => r.code && r !== X && !r.via && r.doors && r.doors.length === 1 && r.level === X.level)
          .sort((a, b) => Math.min(...a.doors.map(q => kozel(q, d))) - Math.min(...b.doors.map(q => kozel(q, d))))[0];
        const rt = findRoute(Y, X), e = rt && vegpont(rt);
        const legk = e && X.doors.slice().sort((a, b) => kozel(a, e) - kozel(b, e))[0];
        o.tobb.push([c, Y.code, legk === d]);
      }
    }
    return o;
  });
  t("az útvonal az ajtó előtt ér véget (egy cellán belül)",
    veg.ajtonal.every(([, d]) => d !== null && +d < 0.7), JSON.stringify(veg.ajtonal));
  t("több ajtó közül a közelebbinél", veg.tobb.length >= 6 && veg.tobb.every(x => x[2]), JSON.stringify(veg.tobb));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});

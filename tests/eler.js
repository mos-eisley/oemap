/* Elérhetőség: minden helyiséghez vezet-e útvonal. A térkép adata több
   eszközből áll össze (a régi generátor, a pótolt szárny, az IFC ajtói), és
   egy elcsúszott ajtó vagy folyosó csendben vihet el egy termet: a hallgató
   rákeres, és nem kap útvonalat. Ez a teszt minden helyiséget végignéz, és a
   kivételek listája két irányba is szigorú: új elérhetetlen helyiség és egy
   már elérhetővé vált kivétel is bukás — a lista nem avulhat el. */
const { run, open } = require("./lib");

// Lépcsőn a portától — mindegyiknek oka van (lásd docs/NYITOTT-KERDESEK.md, 2.)
const LEPCSON_NEM = {
  OA01FL4: "a földszintről az Audmax alsó szintjére vezető lépcső; bekötve az útvonal az Audmaxon át vághatna",
  OA01FL5: "ugyanaz, a másik oldalon",
  OAX1A24: "üzemi helyiség a szárny alatt, az IFC-ben nincs ajtaja",
};
/* Lifttel a földszintről (a hallgatói lift az FL3 magban jár, az alagsorba
   nem): a félemelet a többi lépcsőház pihenője, a II. emelet déli tömbje pedig
   csak az EL1 lépcsőn közelíthető meg. */
const LIFTTEL_NEM = new Set(["OA01F01", "OA01F02", "OA01F03", "OA01FK1", "OA01FL1", "OA01FL2", "OA01FL4", "OA01FL5",
  "OA20E01", "OA20E02", "OA20E03", "OA20E04", "OA20E05", "OA20E06", "OA20E07", "OA20E08", "OA20E09", "OA20E10",
  "OA20E11", "OA20E12", "OA20EK1", "OA20EL1"]);

run("elérhetőség", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1400 });
  const r = await p.evaluate(async () => {
    // helyiségenként egy-egy keresés helyett egy: utána bármelyikhez kiolvasható az út
    const ki = (src, portals, szur) => { const k = dijkstra(ROOM[src], portals, null);
      return D.rooms.filter(r => r.code && r.code !== src && szur(r) && !routeTo(k, ROOM[src], r)).map(r => r.code).sort(); };
    if (!TM) await tmLoad();
    const lepcso = ki(START, PORTAL, () => true), lift = ki("OA00FK1", PORTAL_LIFT, r => r.level >= 0);
    const orarendi = TM.rooms.map(r => ({ nev:r.nev, c:codeOfNev(r.nev) }));
    return { lepcso, lift, orarendi, kodolt:D.rooms.filter(r => r.code).length };
  });

  const ujLepcso = r.lepcso.filter(c => !LEPCSON_NEM[c]), elavult = Object.keys(LEPCSON_NEM).filter(c => !r.lepcso.includes(c));
  t(`a portától lépcsőn minden helyiséghez van út (${r.kodolt} kódolt), a három ismert kivételen kívül`,
    ujLepcso.length === 0, "új elérhetetlen: " + ujLepcso.join(" "));
  t("a lépcsős kivételek közül egyik sem lett elérhető (különben ki kell venni a listából)",
    elavult.length === 0, "már elérhető: " + elavult.join(" "));
  const ujLift = r.lift.filter(c => !LIFTTEL_NEM.has(c)), elavultLift = [...LIFTTEL_NEM].filter(c => !r.lift.includes(c));
  t("a földszintről lifttel is minden emeletre és helyiségre, az ismert kivételeken kívül",
    ujLift.length === 0, "új elérhetetlen: " + ujLift.join(" "));
  t("a liftes kivételek közül egyik sem lett elérhető", elavultLift.length === 0, "már elérhető: " + elavultLift.join(" "));

  const parNelkul = r.orarendi.filter(x => !x.c).map(x => x.nev);
  t("minden órarendi terem a térképen van, ajtószámmal", parNelkul.length === 0 && r.orarendi.length >= 20,
    `${r.orarendi.length} terem, pár nélkül: ${parNelkul.join(" ")}`);
  const orarendiKi = r.orarendi.filter(x => x.c && (r.lepcso.includes(x.c) || r.lift.includes(x.c))).map(x => x.nev);
  t("minden órarendi teremhez van út lépcsőn a portától és lifttel a földszintről", orarendiKi.length === 0,
    orarendiKi.join(" "));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});

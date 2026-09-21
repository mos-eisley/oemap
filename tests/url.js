/* Mély linkek: az állapot a címsorban él. Ez tartja meg a megosztott
   útvonalat, és ettől lép vissza a telepített PWA-ban a vissza gomb
   ahelyett, hogy kilépne. */
const { run, open } = require("./lib");

run("mély link (URL-állapot)", async ({ t, ctx, base }) => {
  const st = p => p.evaluate(() => ({ from:S.from, to:S.to, sel:S.sel, lv:S.level,
                                      hash:location.hash, ut:!!S.route }));

  // A) üres indulás — se kiválasztás, se bedrótozott demó útvonal
  let p = await open(ctx, base, { settle: 1400 });
  let a = await st(p);
  t("üresen indul, kiválasztás nélkül", !a.from && !a.to && !a.sel, JSON.stringify(a));
  t("a gyorsgombok fogadják a hallgatót", await p.evaluate(() => !!document.querySelector(".qgrid")));
  t.eq("üresen nincs hash", a.hash, "");
  await p.close();

  // B) QR-alak: az "itt vagyok" csak az indulást adja meg
  p = await open(ctx, base + "#from=OA00FK1", { settle: 1400 });
  let b = await st(p);
  t.eq("#from= beállítja az indulást", b.from, "OA00FK1");
  t("cél nélkül még nincs útvonal", !b.to && !b.ut, JSON.stringify(b));
  await p.close();

  // C) teljes útvonal
  p = await open(ctx, base + "#from=OA00FK1&to=OA10E18", { settle: 1400 });
  let c = await st(p);
  t("#from=&to= kiszámolja az útvonalat", c.from==="OA00FK1" && c.to==="OA10E18" && c.ut, JSON.stringify(c));
  await p.close();

  // D) rövid alak, és a jó szintre ugrás
  p = await open(ctx, base + "#OA20E01", { settle: 1400 });
  let d = await st(p);
  t.eq("#KÓD kiválasztja a termet", d.sel, "OA20E01");
  t("a terem szintjére ugrik", d.lv === 3, "szint=" + d.lv);
  await p.close();

  // E) elgépelt vagy elavult link ne akassza meg az indulást
  p = await open(ctx, base + "#to=NINCSILYEN&from=SEM", { settle: 1400 });
  let e = await st(p);
  t("ismeretlen kódot csendben elhagy", !e.from && !e.to && !e.sel, JSON.stringify(e));
  t("az app ettől még elindul", await p.evaluate(() => document.querySelectorAll(".floor").length > 0));
  await p.close();

  // F) a kiválasztás írja a címsort, a vissza gomb visszalép
  p = await open(ctx, base, { settle: 1400 });
  await p.evaluate(() => select("OA00F01")); await p.waitForTimeout(400);
  const h1 = (await st(p)).hash;
  await p.evaluate(() => select("OA00F03")); await p.waitForTimeout(400);
  const h2 = (await st(p)).hash;
  await p.goBack(); await p.waitForTimeout(700);
  const back = await st(p);
  t.eq("a kiválasztás a címsorba kerül", [h1, h2], ["#OA00F01", "#OA00F03"]);
  t("a vissza gomb az előző teremre lép", back.hash==="#OA00F01" && back.sel==="OA00F01", JSON.stringify(back));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
  await p.close();
});

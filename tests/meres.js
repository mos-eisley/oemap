/* A telefonos mérőlap (meres.html) a valódi appot hajtja, belülről: a
   setMode()-ot, a #stage mutatóeseményeit és a .floor.above szinteket
   használja. Ha ezek közül bármelyik átnevezve elmarad, a lap csendben
   értelmetlen számokat adna — ez a teszt egy rövid futással (egy kör, három
   lépés) ellenőrzi, hogy végigmegy és értelmes eredményt ad. */
const { run } = require("./lib");

run("telefonos mérőlap", async ({ t, ctx, url }) => {
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(url + "meres.html?korok=1&lepes=3", { waitUntil: "load" });
  await p.click("#indit");
  await p.waitForSelector("#adat", { timeout: 120000 });
  const r = await p.evaluate(() => ({
    cellak: [...document.querySelectorAll("#tabla td[data-k]")].map(td => +td.textContent),
    hiba: (document.getElementById("hiba") || {}).textContent || "",
    adat: JSON.parse(document.getElementById("adat").textContent),
    rejtve: (() => { const d = document.getElementById("app").contentDocument;
      return { szintek: d.querySelectorAll(".floor").length, felso: d.querySelectorAll(".floor.above").length }; })(),
  }));
  t("végigmegy, mindkét változatra három értelmes szám", r.cellak.length === 6 && r.cellak.every(x => x > 0 && x < 60000),
    JSON.stringify(r.cellak));
  t("a lap nem jelez hibát", !r.hiba && r.adat.hibak.length === 0, r.hiba);
  t("van mit elrejteni: a földszint fölött felső szintek állnak", r.rejtve.szintek === 7 && r.rejtve.felso >= 4,
    JSON.stringify(r.rejtve));
  t("nincs JS hiba", errs.length === 0, errs.join(" | "));
});

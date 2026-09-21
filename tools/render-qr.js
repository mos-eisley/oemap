/* A QR-ív minden kódját külön képpé rajzolja, hogy a verify-qr.py egy valódi
   olvasóval visszanézhesse őket. Külön fájl, mert a repó a Node playwrightot
   használja — így nem kell egy második (python) playwright telepítés is. */
const { chromium } = require("playwright");
const { chromePath } = require("../tests/lib");
const fs = require("fs"), path = require("path");

const [sheet, outdir] = process.argv.slice(2);
if (!sheet || !outdir) { console.error("használat: render-qr.js <ív.html> <kimeneti mappa>"); process.exit(2); }

(async () => {
  fs.mkdirSync(outdir, { recursive: true });
  const b = await chromium.launch({ executablePath: chromePath() });
  const p = await b.newPage({ viewport:{width:1000,height:1400}, deviceScaleFactor:2 });
  await p.goto("file://" + path.resolve(sheet), { waitUntil: "load" });
  await p.waitForTimeout(700);
  const cards = await p.$$(".c");
  for (let i = 0; i < cards.length; i++)
    await (await cards[i].$("svg")).screenshot({ path: path.join(outdir, String(i).padStart(3,"0") + ".png") });
  await b.close();
  console.log(cards.length);
})();

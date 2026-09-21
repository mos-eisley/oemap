/* Közös váz a böngészős tesztekhez.
   A tesztek maguk indítanak statikus szervert és böngészőt, így egyetlen
   `node tests/run.js` parancs elég — felhős munkamenetben is. */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/* A Chromiumot három helyen keressük, ebben a sorrendben:
   1. CHROMIUM env — ha valaki kézzel akarja megmondani,
   2. a PLAYWRIGHT_BROWSERS_PATH alatti chromium-* (a felhős képen itt van,
      és a verziószám buildenként változik, ezért nem drótozzuk be),
   3. a playwright saját keresése — helyi gépen ez a normális eset. */
function chromePath() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    // A headless_shell nem teljes böngésző, és ábécésorrendben a chromium-* UTÁN
    // jön, szóval kifejezetten ki kell zárni, különben azt találnánk meg.
    const dirs = fs.readdirSync(base)
      .filter(d => /^chromium(-\d+)?$/.test(d))
      .sort();
    for (const dir of dirs.reverse()) {
      for (const rel of ["chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = path.join(base, dir, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* nincs ilyen mappa — menjünk tovább */ }
  return undefined;                         // playwright dönt
}

const MIME = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json",
  ".css":"text/css", ".woff2":"font/woff2", ".png":"image/png", ".svg":"image/svg+xml",
  ".webmanifest":"application/manifest+json", ".txt":"text/plain" };

/* Port 0: a rendszer ad szabad portot. Fix port ütközne egy ottfelejtett
   szerverrel, és akkor a teszt egy RÉGI build ellen futna — ez egyszer már
   megtörtént, és zöld tesztek mellett hagyott hibás kódot. */
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end("nincs ilyen");
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream",
                           "cache-control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({
      url: "http://127.0.0.1:" + srv.address().port + "/",
      close: () => new Promise(r => srv.close(r)),
    }));
  });
}

/* Mobil az alapértelmezett: az app telefonra készült, a legtöbb regresszió is
   ott jött elő. */
const PHONE  = { viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 };
const DESKTOP= { viewport:{width:1280,height:860} };

/* Betöltés + várakozás, amíg az app tényleg kész: a betűk betöltenek, és
   megjelenik legalább egy szint. Fix waitForTimeout helyett feltételre várunk,
   hogy lassabb futtatón se billenjen. */
async function open(ctx, url, opts = {}) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("console", m => { if (m.type()==="error" && !/favicon/.test(m.text())) errs.push("console: "+m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelectorAll(".floor").length > 0, null, { timeout: 15000 });
  if (opts.settle !== false) await page.waitForTimeout(opts.settle || 900);
  page.jsErrors = errs;
  return page;
}

/* Pici assert-készlet. Nem futtató keretrendszer: egy teszt egy fájl, és a
   run.js számolja össze őket. */
function harness(name) {
  const rows = [];
  const t = (label, pass, detail) => {
    rows.push({ label, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
    return !!pass;
  };
  t.eq  = (label, got, want) => t(label, JSON.stringify(got)===JSON.stringify(want), `kapott ${JSON.stringify(got)}, várt ${JSON.stringify(want)}`);
  t.rows = rows;
  t.title = name;
  t.report = () => {
    for (const r of rows) console.log(`  ${r.pass ? "ok  " : "HIBA"}  ${r.label}${r.detail && !r.pass ? "   — "+r.detail : ""}`);
    const bad = rows.filter(r => !r.pass).length;
    console.log(`  ${rows.length - bad}/${rows.length} ${name}`);
    return bad;
  };
  return t;
}

/* Minden teszt ugyanígy indul és zár, és a végén a JS hibák is bukást
   jelentenek — egy néma kivétel épp annyira regresszió, mint egy rossz érték. */
async function run(name, body, ctxOpts = PHONE) {
  const t = harness(name);
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: chromePath() });
  const ctx = await browser.newContext(ctxOpts);
  try {
    await body({ t, ctx, browser, url: srv.url, base: srv.url + "index.html" });
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log(name);
  const bad = t.report();
  process.exitCode = bad ? 1 : 0;
  return bad;
}

module.exports = { chromePath, serve, open, harness, run, PHONE, DESKTOP, ROOT };

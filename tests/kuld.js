/* Telefonra küldés: asztalon és a totemen a kész útvonal QR-kódja. A kódot a
   képernyőképből olvassuk vissza, ahogy egy telefon kamerája látná — egy
   hibátlannak KINÉZŐ, de olvashatatlan QR-ív már kétszer készült (lásd
   tools/verify-qr.py). Utána a beolvasott linket telefonon nyitjuk meg: ott
   ugyanannak az útvonalnak kell állnia, a lift választásával együtt. */
const path = require("path");
const { run, open, PHONE } = require("./lib");
const JSQR = path.join(__dirname, "..", "node_modules", "jsqr", "dist", "jsQR.js");

run("telefonra küldés", async ({ t, ctx, browser, base }) => {
  // a dekódoló külön, üres lapon fut, a képernyőképből — nem a mi kódunkból
  const dek = await ctx.newPage();
  await dek.setContent("<canvas id=c></canvas>");
  await dek.addScriptTag({ path: JSQR });
  /* A szöveg mellé a csendzónát is: hány modulnyi világos sáv van a kód körül
     a kivágott képen belül. A szabvány 4-et kér; a jsQR enélkül is olvas, egy
     telefon kamerája vagy egy szigorúbb olvasó nem mindig. */
  const olvas = async (loc, csendis, serulten) => {
    const png = (await loc.screenshot()).toString("base64");
    const r = await dek.evaluate(async ([b64, serulten]) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.getElementById("c"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      // csak sötét a világoson: a fordított kódot a telefonok kamerája többnyire nem olvassa
      const q = jsQR(d.data, d.width, d.height, { inversionAttempts: "dontInvert" });
      if (!q) return { data:null, csend:0 };
      const L = q.location, n = 17 + 4 * q.version;
      const x0 = Math.min(L.topLeftCorner.x, L.bottomLeftCorner.x), x1 = Math.max(L.topRightCorner.x, L.bottomRightCorner.x);
      const y0 = Math.min(L.topLeftCorner.y, L.topRightCorner.y), y1 = Math.max(L.bottomLeftCorner.y, L.bottomRightCorner.y);
      const mod = (x1 - x0) / n;
      const vilagos = (x, y) => { x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= d.width || y >= d.height) return false;
        const i = (y * d.width + x) * 4; return d.data[i] + d.data[i + 1] + d.data[i + 2] > 3 * 160; };
      let csend = 0;
      for (let k = 1; k <= 6; k++, csend++) {
        const t = (k - 0.5) * mod, pont = [];
        for (let s = -t; s <= x1 - x0 + t; s += mod / 3) pont.push([x0 + s, y0 - t], [x0 + s, y1 + t]);
        for (let s = -t; s <= y1 - y0 + t; s += mod / 3) pont.push([x0 - t, y0 + s], [x1 + t, y0 + s]);
        if (!pont.every(([x, y]) => vilagos(x, y))) break;
      }
      /* Ép képen a hibajavítás nem dolgozik; egy csillanás vagy maszat a
         kijelzőn viszont modulokat fordít át. A közepén (az 1–6. verzióban ez
         adatterület) 5×5 modult átfordítunk: az M szintű kódnak ezt ki kell
         bírnia. (Egy elrontott javítókódot már az ép kép olvasása is megfog:
         rossz testpolinommal, fordított vagy rossz adatból számolt javító-
         bájtokkal a jsQR semmit vagy mást olvas.) */
      let serult = null;
      if (serulten) {
        const k0 = Math.floor(n / 2) - 2, a = v => Math.round(v);
        for (let y = a(y0 + k0 * mod); y < a(y0 + (k0 + 5) * mod); y++)
          for (let x = a(x0 + k0 * mod); x < a(x0 + (k0 + 5) * mod); x++)
            for (let j = 0; j < 3; j++) d.data[(y * d.width + x) * 4 + j] ^= 255;
        const q2 = jsQR(d.data, d.width, d.height, { inversionAttempts: "dontInvert" });
        serult = q2 ? q2.data : null;
      }
      return { data:q.data, csend, serult, v:q.version };
    }, [png, !!serulten]);
    if (csendis) csendis.push(r.csend);
    if (serulten) serulten.push(r.serult, r.v);
    return r.data;
  };
  const csendek = [];
  const nyit = async p => { await p.click("#qrSend"); await p.waitForSelector("#qrDlg[open]"); await p.waitForTimeout(200); };

  // asztal: útvonal a földszinti folyosóról a II. emeletre, lifttel
  const p = await open(ctx, base + "#from=OA00FK1&to=OA20E44", { settle: 1400 });
  if (!t("asztalon az útvonal mellett ott a küldés gomb", await p.locator("#qrSend").count() === 1)) return;
  await p.click('[data-via="lift"]'); await p.waitForTimeout(300);
  const cim = await p.evaluate(() => location.hash);
  t("a lift választása a címsorba is bekerül", /&via=lift/.test(cim), cim);
  await nyit(p);
  const varUrl = await p.evaluate(() => location.origin + location.pathname + "#from=OA00FK1&to=OA20E44&via=lift");
  const serult = [];
  const kod = await olvas(p.locator("#qrDlg .qrimg"), csendek, serult);
  t("a kód beolvasható, és az útvonal linkje van benne, a lifttel", kod === varUrl, `kapott ${kod}, várt ${varUrl}`);
  t("sérülten is: 25 átfordított modullal a közepén is ugyanazt adja (a hibajavítás dolgozik)",
    serult[0] === varUrl && serult[1] <= 6, `${serult[1]}. verzió: ${serult[0]}`);
  const ablak = await p.evaluate(() => { const d = document.getElementById("qrDlg");
    return { cim:document.getElementById(d.getAttribute("aria-labelledby")).textContent, szoveg:d.textContent,
      fokusz:d.contains(document.activeElement), modal:d.matches(":modal") }; });
  t("felugró ablak, címmel, a fókusz benne", ablak.modal && ablak.fokusz && /Olvasd be/.test(ablak.cim), JSON.stringify(ablak));
  t("az ablak megmondja, honnan hova (az ajtón álló számmal) és hogy lifttel", /OA00FK1 · .+ → 2\.20 · /.test(ablak.szoveg) &&
    / · Lift/.test(ablak.szoveg), ablak.szoveg.replace(/\s+/g, " "));

  // Esc: az ablak bezárul, a kiválasztás és az útvonal marad, a fókusz visszajön
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const esc = await p.evaluate(() => ({ nyitva:document.getElementById("qrDlg").open, to:S.to, sel:S.sel, via:S.via,
    fokusz:document.activeElement && document.activeElement.id }));
  t("Escre bezárul, az útvonal és a kiválasztás marad, a fókusz a gombra kerül vissza",
    !esc.nyitva && esc.to === "OA20E44" && esc.sel === "OA20E44" && esc.via === "lift" && esc.fokusz === "qrSend", JSON.stringify(esc));
  await nyit(p);
  await p.mouse.click(8, 8); await p.waitForTimeout(200);
  t("a háttérre kattintva is bezárul", !(await p.evaluate(() => document.getElementById("qrDlg").open)));

  // sötét témában is olvasható: a kód fehér alapon marad, a csendzónával
  await p.evaluate(() => { S.theme = "dark"; applyTheme(false); });
  await p.waitForTimeout(300); await nyit(p);
  const sotet = await olvas(p.locator("#qrDlg"));
  t("sötét témában is beolvasható (az egész ablakról)", sotet === varUrl, sotet);
  await p.keyboard.press("Escape"); await nyit(p);
  await olvas(p.locator("#qrDlg .qrimg"), csendek);
  await p.keyboard.press("Escape");
  await p.evaluate(() => { S.lang = "en"; applyLang(); });
  await nyit(p);
  t("angolul is", await p.evaluate(() => document.getElementById("qrH").textContent) === "Scan with your phone");
  await p.keyboard.press("Escape");
  t("nincs JS hiba asztalon", p.jsErrors.length === 0, p.jsErrors.join(" | "));

  // a beolvasott link telefonon: ugyanaz az útvonal, lifttel, kirajzolva
  const tel = await browser.newContext(PHONE);
  const q = await open(tel, kod || varUrl, { settle: 1400 });
  const telAll = await q.evaluate(() => ({ from:S.from, to:S.to, via:S.via, rajz:!!S.route,
    gomb:document.querySelector(".via.on") && document.querySelector(".via.on").dataset.via,
    lift:(window.__steps || []).some(s => /^Lifttel/.test(s.t)), kuld:!!document.getElementById("qrSend") }));
  t("telefonon ugyanaz az útvonal nyílik meg, a lifttel", telAll.from === "OA00FK1" && telAll.to === "OA20E44" &&
    telAll.via === "lift" && telAll.rajz && telAll.gomb === "lift" && telAll.lift, JSON.stringify(telAll));
  t("telefonon nincs küldés gomb (ott a megosztás tudja)", !telAll.kuld);
  t("nincs JS hiba telefonon", q.jsErrors.length === 0, q.jsErrors.join(" | "));

  // totem: a linkből nem lesz totem (?totem nélkül), és az alaphelyzet bezárja az ablakot
  for (const [nev, kor] of [["asztali totem", ctx], ["álló totem (keskeny kijelző)", tel]]) {
    const r = await open(kor, base + "?totem#from=OA00FK1", { settle: 1400 });
    await r.click('[data-q="WC"]'); await r.waitForTimeout(300);
    await r.click("[data-wc]"); await r.waitForTimeout(600);
    if (!t(`${nev}: ott a küldés gomb`, await r.locator("#qrSend").count() === 1)) { await r.close(); continue; }
    await nyit(r);
    const tk = await olvas(r.locator("#qrDlg .qrimg"), csendek);
    const varT = await r.evaluate(() => location.origin + location.pathname + "#from=OA00FK1&to=" + S.to);
    t(`${nev}: a kód a totem helyéről indul, ?totem nélkül`, tk === varT, `kapott ${tk}, várt ${varT}`);
    await r.evaluate(() => totemAlap()); await r.waitForTimeout(300);
    t(`${nev}: az alaphelyzet bezárja az ablakot`, !(await r.evaluate(() => document.getElementById("qrDlg").open)));
    t(`${nev}: nincs JS hiba`, r.jsErrors.length === 0, r.jsErrors.join(" | "));
    await r.close();
  }

  t("a kód körül mindenhol legalább 4 modulnyi világos csendzóna (a szabvány kéri)",
    csendek.length === 4 && csendek.every(c => c >= 4), JSON.stringify(csendek));

  // a vissza gomb: a régi útvonal QR-ja nem maradhat a képernyőn
  await p.evaluate(() => { S.lang = "hu"; applyLang(); select("OA10E18"); });
  await p.waitForTimeout(300);
  await p.click("#bT"); await p.waitForTimeout(500);
  await nyit(p);
  await p.goBack(); await p.waitForTimeout(500);
  t("a vissza gomb bezárja a már nem érvényes kódot", !(await p.evaluate(() => document.getElementById("qrDlg").open)));
  await tel.close();
}, { viewport:{ width:1280, height:860 } });

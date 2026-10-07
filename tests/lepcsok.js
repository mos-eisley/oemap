/* Lépcsőkarok az alaprajzon, az épület IFC-modelljéből (tools/ifc-lepcsok.py,
   `D.flights`). Ami számít:
   - minden szintváltásnál, ahol az útvonal lépcsőn megy (`D.stairs`), ott a
     kar is a rajzon — ha az adat elveszne vagy rossz szintre kerülne, ez bukik;
   - a kar a szint saját SVG-jében, a falak alatt áll, karonként egy kis path:
     forgatás közben a böngésző csempénként rajzol újra, és egy csempe minden
     átfedő path-t feldolgoz (lásd CLAUDE.md, a falak oldallapja);
   - a rajz dísz: a kattintás a lépcsőházé marad, a felolvasó nem látja. */
const { run, open, DESKTOP } = require("./lib");

run("lépcsőkarok", async ({ t, ctx, browser, base }) => {
  const p = await open(ctx, base, { settle: 1200 });
  const r = await p.evaluate(() => {
    const out = { szintek: [], hianyzik: [], nagy: [], felul: [], aria: 0, osszes: 0, egybe: 0 };
    const doboz = {};
    for (const L of D.levels) {
      const F = FLOOR[L.level], k = [...F.svg.querySelectorAll(".flight")];
      out.szintek.push({ lv: L.level, rajz: k.length, adat: ((D.flights || {})[L.level] || []).length });
      out.osszes += k.length;
      doboz[L.level] = k.map(n => n.getBBox());
      for (const n of k) {
        const b = n.getBBox();
        if (Math.max(b.width, b.height) > 5) out.nagy.push(`${L.level}: ${b.width.toFixed(1)}×${b.height.toFixed(1)} m`);
        if (n.getAttribute("aria-hidden") !== "true") out.aria++;
        if (n.tagName !== "path" || n.parentNode !== F.svg) out.egybe++;
        // a falak a kar fölé rajzolódnak: a falréteg később jön a szint rajzában
        if (!(n.compareDocumentPosition(F.walls) & Node.DOCUMENT_POSITION_FOLLOWING)) out.felul.push(L.level);
      }
    }
    // minden lépcsőmag minden szintváltása: az alsó szinten egy kirajzolt kar a mag pontjától 3 m-en belül
    for (const st of D.stairs) {
      const pts = st.pts.slice().sort((a, b) => a[0] - b[0]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [lv, x, y, kod] = pts[i];
        const van = (doboz[lv] || []).some(b => Math.hypot(b.x + b.width / 2 - x, b.y + b.height / 2 - y) < 3);
        if (!van) out.hianyzik.push(`${kod} → ${pts[i + 1][3]}`);
      }
    }
    // az aktív szinten látszik
    setLevel(0);
    const n = FLOOR[0].svg.querySelector(".flight"), cs = n && getComputedStyle(n);
    out.latszik = !!cs && cs.display !== "none" && cs.visibility !== "hidden" && +cs.strokeOpacity > 0 &&
      cs.stroke !== "none" && FLOOR[0].box.classList.contains("on");
    return out;
  });

  t("minden szinten annyi kar van kirajzolva, amennyi az adatban", r.osszes > 0 && r.szintek.every(s => s.rajz === s.adat),
    JSON.stringify(r.szintek));
  t("minden lépcsőház minden szintváltásánál ott a kar", r.hianyzik.length === 0, r.hianyzik.join(", "));
  t("karonként egy kis path a szint saját rajzában (legfeljebb 5 m)", r.nagy.length === 0 && r.egybe === 0,
    r.nagy.join(", ") + (r.egybe ? ` · ${r.egybe} nem a szint path-ja` : ""));
  t("a falak a kar fölé rajzolódnak", r.felul.length === 0, r.felul.join(", "));
  t("a felolvasó nem látja (aria-hidden)", r.aria === 0, `${r.aria} kar látszik a felolvasónak`);
  t("az aktív szinten látszik", r.latszik);
  t("nincs JS hiba telefonon", p.jsErrors.length === 0, p.jsErrors.join(" | "));

  /* Asztalon egérrel: a kar vonalára kattintva a lépcsőháznak kell előjönnie.
     Ha a rajz elkapná a kattintást, az a színpadig buborékozna, és az a
     kijelölést törli, nem a lépcsőházat választja ki. Nagyítva, hogy a vonal
     több képpont széles legyen, és pontosan a járásvonal egy töréspontjára. */
  const d = await open(await browser.newContext(DESKTOP), base, { settle: 1400 });
  const cel = await d.evaluate(() => {
    setLevel(0);
    for (const k of D.flights[0] || []) for (const q of k.w.slice(1, -1)) {
      const po = [...FLOOR[0].rooms.querySelectorAll(".room[data-code]")]
        .find(e => e.isPointInFill(new DOMPoint(q[0], q[1])));
      if (po) return { x: q[0], y: q[1], code: po.dataset.code };
    }
    return null;
  });
  if (!t("van kar egy kódolt helyiségben a földszinten", cel)) return;
  const kep = () => d.evaluate(([x, y]) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", .01);
    FLOOR[0].svg.appendChild(c); const b = c.getBoundingClientRect(); c.remove();
    return [b.x + b.width / 2, b.y + b.height / 2];
  }, [cel.x, cel.y]);
  await d.waitForTimeout(1500);
  let [x, y] = await kep();
  await d.mouse.move(x, y);
  for (let i = 0; i < 8; i++) { await d.mouse.wheel(0, -240); await d.waitForTimeout(80); }
  await d.waitForTimeout(1500);
  [x, y] = await kep();
  const alatta = await d.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y);
    return e ? e.dataset.code || e.getAttribute("class") : null; }, [x, y]);
  await d.mouse.click(x, y); await d.waitForTimeout(300);
  const sel = await d.evaluate(() => S.sel);
  t("a kar vonalára kattintva a lépcsőház jön elő, a rajz nem veszi el a kattintást",
    alatta === cel.code && sel === cel.code, `${cel.code} járásvonalán: alatta ${alatta}, kiválasztva ${sel}`);
  t("nincs JS hiba asztalon", d.jsErrors.length === 0, d.jsErrors.join(" | "));
});

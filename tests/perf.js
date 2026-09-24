/* Az Épület nézet kompozitálási költsége — a telefon kódútján.

   A tesztböngésző alapból szoftveres kompozitorral fut, a telefon GPU-val, és
   a kettő a 3D-s rétegekkel másképp bánik. A kiemelkedő falak (öt egymás
   fölötti 3D-s sík) a szoftveres úton 10–15% lépésidőt mutattak, élesben
   viszont akadozott tőlük az Épület nézet, és a lassú képkockák a kétujjas
   döntést is elrontották. A GPU-s úton látszott az ok: minden raszterezett
   3D-s sík egy külön renderpass, és a kép 10 helyett 15-ből állt össze.
   Ez a teszt ezért SwiftShaderen át a GPU-s kódutat indítja: lassú, de hogy
   hány renderpassból áll egy képkocka, az ugyanaz, mint a telefonon. */
const { run, open } = require("./lib");

const GPU = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

run("kompozitálás a telefon kódútján", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });
  await p.evaluate(() => {
    const st = document.getElementById("stage");
    st.setPointerCapture = () => {}; st.releasePointerCapture = () => {};
    window.__s = (type, x, y) => st.dispatchEvent(new PointerEvent(type,
      { pointerId:1, clientX:x, clientY:y, bubbles:true, pointerType:"touch", isPrimary:true }));
  });
  const cdp = await ctx.newCDPSession(p);

  /* Egyujjas mozdulat közben (a .navving ilyenkor leveszi a panelek
     háttérmosását, ami maga is renderpass), képkockánként megszámolva. */
  async function passok(mode) {
    await p.evaluate(async m => { setMode(m); await new Promise(r => setTimeout(r, 2600)); }, mode);
    const ev = [], gyujt = d => ev.push(...d.value);
    cdp.on("Tracing.dataCollected", gyujt);
    const kesz = new Promise(r => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.start", { categories: "viz,devtools.timeline", transferMode: "ReportEvents" });
    await p.evaluate(async () => {
      __s("pointerdown", 195, 330); console.timeStamp("G0");
      for (let i = 1; i <= 24; i++) { __s("pointermove", 195 + i*5, 330 + i*2); await new Promise(r => requestAnimationFrame(r)); }
      console.timeStamp("G1"); __s("pointerup", 315, 378);
    });
    await cdp.send("Tracing.end"); await kesz; cdp.off("Tracing.dataCollected", gyujt);
    const jel = m => ev.find(e => e.name === "TimeStamp" && e.args && e.args.data && e.args.data.message === m).ts;
    const a = jel("G0"), b = jel("G1");
    const kockak = ev.filter(e => e.name === "DirectRenderer::DrawFrame" && e.ts >= a && e.ts < b);
    const passes = ev.filter(e => e.name === "DirectRenderer::DrawRenderPass");
    const n = kockak.map(k => passes.filter(q => q.ts >= k.ts && q.ts <= k.ts + k.dur).length).sort((x, y) => x - y);
    return { median: n[Math.floor(n.length / 2)] || 0, n: n.length,
             gpu: !ev.some(e => /^SoftwareRenderer::/.test(e.name)) };
  }

  const szintek = await p.evaluate(() => LV.length);
  const epulet = await passok(3);
  await p.evaluate(() => { const s = document.createElement("style"); s.id = "nosav";
    s.textContent = ".wband{display:none!important}"; document.head.appendChild(s); });
  const savNelkul = await passok(3);
  await p.evaluate(() => document.getElementById("nosav").remove());
  const alaprajz = await passok(2);

  t("a mérés a GPU-s kódúton fut, nem a szoftveres kompozitoron", epulet.gpu && epulet.n > 10,
    JSON.stringify(epulet));
  /* Szintenként egy, és még három (a lap maga és a talaj). A falak előtt is
     ennyi volt: minden újabb 3D-s réteg ezen felül egy-egy teljes renderpass. */
  t("Épület nézetben képkockánként szintenként egy renderpass, és semmi több",
    epulet.median <= szintek + 3, `${epulet.median} renderpass, ${szintek} szint`);
  t("az aktív szint falainak oldallapja nem hoz be renderpasst",
    epulet.median === savNelkul.median, `oldallappal ${epulet.median}, nélküle ${savNelkul.median}`);
  // a lapos alaprajz a telefonos 76 fps útja: ott a szintek nem külön rétegek
  t("alaprajzon képkockánként két renderpass", alaprajz.median <= 2, JSON.stringify(alaprajz));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
}, undefined, GPU);

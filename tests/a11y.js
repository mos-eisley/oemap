/* Billentyűzet és képernyőolvasó.

   Kiindulás: a térkép 182 kattintható helyisége <polygon> volt, szerep és
   fókusz nélkül — billentyűzettel elérhetetlen, felolvasóval bejárhatatlan.
   Élő régió sem volt, így a kiválasztásról, az útvonalról és a szintváltásról
   a felolvasó semmit nem mondott.

   Két dolgot őriz ez a fájl. Az egyik, hogy a térkép EGYETLEN tab-állomás
   maradjon: ha minden poligon külön állomás lenne, a billentyűzetes
   felhasználónak 182-szer kellene tabbolnia, hogy a térképen túljusson — az
   rosszabb annál, mintha meg se lehetne közelíteni. A másik, hogy a fókusz
   soha ne kerüljön aria-hidden ágra: a felolvasó olyankor néma marad, és a
   felhasználó egy olyan elemen áll, amiről semmit nem tud meg.

   Asztali nézetben fut, a többivel ellentétben: a nyilas bejárás fizikai
   billentyűzetet feltételez. A felolvasónak szóló jelölést ez nem érinti,
   az mobilon ugyanaz. */
const { run, open, DESKTOP } = require("./lib");

const w = 260;   // az élő régió szándékosan késleltetve ír, lásd say()

run("billentyűzet és felolvasó", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  /* ---- a jelölés: szerepek, nevek, elrejtett díszítés ---- */
  const mark = await p.evaluate(() => {
    const q = s => document.querySelectorAll(s);
    const F = () => document.querySelector(".floor.on");
    return {
      stageRole: document.getElementById("stage").getAttribute("role"),
      stageLabel: document.getElementById("stage").getAttribute("aria-label"),
      stageTab: document.getElementById("stage").getAttribute("tabindex"),
      hint: document.getElementById("mapHint").textContent.trim().length,
      live: !!document.querySelector("#live[aria-live]"),
      // egyetlen tab-állomás a térképen: a színpad maga
      tabStops: q("#stage [tabindex='0']").length,
      roomsTabbable: q(".room[tabindex='0']").length,
      pickRooms: q(".floor.on .room.pick").length,
      pickWithRole: q(".floor.on .room.pick[role='button']").length,
      pickNamed: [...q(".floor.on .room.pick")].filter(e =>
        (e.getAttribute("aria-label") || "").length > 3).length,
      // a díszítés nem jut el a felolvasóig
      decor: ["slab", "slabsh", "walls", "glabel", "rt", "hit"]
        .map(c => [c, !!F().querySelector("." + c + "[aria-hidden='true']")]),
      // csak az aktív szint látszik
      hiddenFloors: q(".floor[aria-hidden='true']").length,
      floors: q(".floor").length,
    };
  });

  t("a térképnek van szerepe és neve", mark.stageRole === "group" && !!mark.stageLabel,
    `${mark.stageRole} / ${mark.stageLabel}`);
  t("a neve megmondja, melyik szintet mutatja", /\w/.test(mark.stageLabel || "") &&
    mark.stageLabel.includes("Földszint"), mark.stageLabel);
  t("a használata le van írva a felolvasónak", mark.hint > 20, mark.hint + " karakter");
  t("van élő régió", mark.live);
  t("a térkép EGY tab-állomás, nem 182", mark.stageTab === "0" && mark.tabStops === 0 &&
    mark.roomsTabbable === 0, `stage=${mark.stageTab}, benne ${mark.tabStops}, termek ${mark.roomsTabbable}`);
  t("minden választható helyiség gomb", mark.pickRooms > 0 && mark.pickWithRole === mark.pickRooms,
    `${mark.pickWithRole}/${mark.pickRooms}`);
  t("és mindegyiknek van neve", mark.pickNamed === mark.pickRooms,
    `${mark.pickNamed}/${mark.pickRooms}`);
  for (const [c, ok] of mark.decor) t(`a(z) .${c} el van rejtve a felolvasó elől`, ok);
  t("a nem aktív szintek el vannak rejtve", mark.hiddenFloors === mark.floors - 1,
    `${mark.hiddenFloors}/${mark.floors}`);

  /* ---- a nyilas bejárás ---- */
  await p.locator("#stage").focus();
  const onStage = await p.evaluate(() => document.activeElement.id);
  t("a térkép fókuszálható", onStage === "stage", onStage);

  await p.keyboard.press("ArrowDown");
  const first = await p.evaluate(() => ({
    tag: document.activeElement.tagName,
    code: document.activeElement.dataset.code,
    label: document.activeElement.getAttribute("aria-label"),
  }));
  t("az első nyíl belép a térképre", first.tag === "polygon" && !!first.code,
    `${first.tag} ${first.code || ""}`);
  t("a fókuszált helyiségnek kimondható neve van", (first.label || "").includes("·"), first.label);

  /* Négy irányba lépünk, majd vissza — nem azt kérjük számon, hogy melyik
     terembe, hanem hogy a lépés tényleg mozdít, és nem esik ki a térképről. */
  const moves = [];
  for (const k of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
    await p.keyboard.press(k);
    moves.push(await p.evaluate(() => ({
      code: document.activeElement.dataset.code,
      tag: document.activeElement.tagName,
    })));
  }
  t("a nyilak a térképen belül léptetnek", moves.every(m => m.tag === "polygon" && m.code),
    JSON.stringify(moves.map(m => m.code)));
  t("és tényleg mozdítanak", new Set(moves.map(m => m.code)).size > 1,
    moves.map(m => m.code).join(" → "));

  /* ---- Enter választ, és a felolvasó meg is tudja ---- */
  const before = await p.evaluate(() => S.sel);
  const focused = await p.evaluate(() => document.activeElement.dataset.code);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(w);
  const after = await p.evaluate(() => ({ sel: S.sel, live: document.getElementById("live").textContent,
    pressed: document.querySelector(".room.sel")?.getAttribute("aria-pressed") }));
  t("az Enter kiválasztja a fókuszált termet", after.sel === focused && after.sel !== before,
    `${before} → ${after.sel} (fókusz: ${focused})`);
  t("a kiválasztást a felolvasó is megkapja", after.live.includes(focused), after.live);
  t("a kiválasztott termet a jelölés is mutatja", after.pressed === "true", after.pressed);

  /* ---- szintváltás billentyűvel ---- */
  const lv0 = await p.evaluate(() => S.level);
  await p.keyboard.press("PageUp");
  await p.waitForTimeout(700);
  const up = await p.evaluate(() => ({
    level: S.level,
    live: document.getElementById("live").textContent,
    label: document.getElementById("stage").getAttribute("aria-label"),
    // a fókusz nem maradhat egy elrejtett szinten
    inHidden: !!document.activeElement.closest("[aria-hidden='true']"),
    onActive: !!document.activeElement.closest(".floor.on") ||
              document.activeElement.id === "stage",
  }));
  t("a Page Up szintet vált", up.level === lv0 + 1, `${lv0} → ${up.level}`);
  t("a szintváltást bemondja", up.live.length > 0 && up.live !== after.live, up.live);
  t("a térkép neve követi a szintet", up.label.includes("emelet") || up.label !== mark.stageLabel,
    up.label);
  t("a fókusz nem ragad elrejtett szinten", !up.inHidden && up.onActive,
    `elrejtetten=${up.inHidden}, aktívon=${up.onActive}`);

  /* ---- az Esc két lépés, nem egy ----
     Aki a fókuszt akarja visszavenni a térképről, annak ne dobjuk el közben a
     kiválasztott termét is. */
  await p.keyboard.press("ArrowDown");             // vissza egy terembe
  const inRoom = await p.evaluate(() => S.sel);
  await p.keyboard.press("Escape");
  const esc1 = await p.evaluate(() => ({ focus: document.activeElement.id, sel: S.sel }));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(w);
  const esc2 = await p.evaluate(() => ({ sel: S.sel, live: document.getElementById("live").textContent }));
  t("az első Esc a térképre hozza a fókuszt, a kiválasztás marad",
    esc1.focus === "stage" && esc1.sel === inRoom, JSON.stringify(esc1));
  t("a második Esc törli a kiválasztást", esc2.sel === null, JSON.stringify(esc2));
  t("a törlést is bemondja", esc2.live.length > 0, esc2.live);

  /* ---- útvonal bemondása ---- */
  const route = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    S.from = "OA00FK1"; S.to = "OA00F01"; recompute();
    await wait(300);
    return { live: document.getElementById("live").textContent, van: !!S.route };
  });
  t("az útvonal eredményét bemondja", route.live.length > 0 && /\d/.test(route.live), route.live);

  /* ---- a keresési találat jelölése ---- */
  const res = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const q = document.getElementById("q");
    q.value = "OA00F"; q.dispatchEvent(new Event("input"));
    await wait(200);
    const b = document.querySelector(".res-item");
    return { current: b && b.hasAttribute("aria-current"), selected: b && b.hasAttribute("aria-selected") };
  });
  t("a találati sor aria-current-öt használ, nem aria-selected",
    res.current && !res.selected, JSON.stringify(res));

  /* ---- az újrarajzolás nem dobja el a fókuszt ----
     A panel, a foglalható termek listája és a szintválasztó innerHTML-lel
     épül újra, a szintek a téma váltásakor. Előtte egy gombnyomás után a
     fókusz a <body>-ra esett, és a következő Tab a panel elejére vitt vissza,
     nem a megnyomott gomb utánra. Valódi billentyűvel, mert a szintetikus
     kattintás nem ugyanazt az utat járja. */
  const fokusz = () => p.evaluate(() => { const a = document.activeElement;
    return { id: a.id, q: a.dataset.q, l: a.dataset.l, code: a.dataset.code, tag: a.tagName,
      panelben: document.getElementById("scroll").contains(a), to: S.to, lv: S.level }; });
  await p.evaluate(() => { S.from = S.to = null; S.wc = null; select("OA00F01"); });
  await p.waitForTimeout(300);
  await p.locator("#bT").focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  const ide = await fokusz();
  t("az „Ide megyek” után a fókusz ugyanazon a gombon marad", ide.to === "OA00F01" && ide.id === "bT", JSON.stringify(ide));

  await p.evaluate(() => { S.from = S.to = S.sel = null; S.wc = null; recompute(); refreshSel(); renderPanel(); });
  await p.locator('[data-q="WC"]').focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  const wc = await fokusz();
  t("a mosdó gomb után a fókusz a gombon marad, fölötte a lista", wc.q === "WC" &&
    await p.evaluate(() => !!document.querySelector("[data-wc]")), JSON.stringify(wc));
  await p.locator("[data-wc]").first().focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(400);
  const sor = await fokusz();
  t("ha a választott sor eltűnik (kész az útvonal), a fókusz a panelben marad", !!sor.to && sor.panelben,
    JSON.stringify(sor));

  // a foglalható termek listája: a sor kinyitása után a fókusz ugyanazon a soron
  await p.evaluate(() => { S.from = S.to = S.sel = null; quick("@ROOMS"); });
  await p.waitForSelector("[data-tm]");
  const nev = await p.locator("[data-tm]").nth(1).getAttribute("data-tm");
  await p.locator(`[data-tm="${nev}"]`).focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  const tm = await p.evaluate(() => ({ tm: document.activeElement.dataset.tm, nyitva: S.tmOpen }));
  t("a foglalható termek listájában a kinyitott sor marad fókuszban", tm.nyitva === nev && tm.tm === nev,
    JSON.stringify({ nev, ...tm }));

  await p.locator('#rail [data-l="2"]').focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(600);
  const sint = await fokusz();
  t("a szintválasztó gombja a szintváltás után is fókuszban marad", sint.lv === 2 && sint.l === "2", JSON.stringify(sint));

  await p.locator("#stage").focus(); await p.keyboard.press("ArrowDown");
  const kod = (await fokusz()).code;
  await p.emulateMedia({ colorScheme: "dark" }); await p.waitForTimeout(600);
  const tema = await fokusz();
  t("a rendszer témájának váltása után a fókusz ugyanazon a termen marad", !!kod && tema.code === kod &&
    await p.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches), JSON.stringify({ kod, ...tema }));
  await p.emulateMedia({ colorScheme: "light" });

  /* Az indulás és a cél törlése külön gomb: korábban egy <span> volt a sor
     gombjában, billentyűzettel elérhetetlen, és a sor neve „Ide … ×” lett. */
  await p.evaluate(() => { S.from = "OA00F01"; S.to = "OA10E18"; S.sel = null; recompute(); refreshSel(); });
  await p.waitForTimeout(300);
  const torlo = await p.evaluate(() => { const b = document.querySelector('[data-clear="to"]'), sor = document.querySelector('[data-ep="to"]');
    const r = b && b.getBoundingClientRect();
    return { gomb: !!b && b.tagName === "BUTTON" && !sor.contains(b), nev: b && b.getAttribute("aria-label"),
             sorNev: sor.textContent.replace(/\s+/g, " ").trim(), meret: r ? [Math.round(r.width), Math.round(r.height)] : null }; });
  t("a cél törlése önálló, megnevezett gomb, legalább 24×24 px, a sor nevében nincs „×”",
    torlo.gomb && /törlése/.test(torlo.nev) && !/×/.test(torlo.sorNev) && torlo.meret[0] >= 24 && torlo.meret[1] >= 24, JSON.stringify(torlo));
  await p.locator('[data-clear="to"]').focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  const torolve = await p.evaluate(() => ({ to: S.to, fokusz: document.activeElement.dataset.ep }));
  t("billentyűvel törölhető, és a fókusz a sorára kerül", !torolve.to && torolve.fokusz === "to", JSON.stringify(torolve));

  /* A zárt jelmagyarázat nem tab-állomás és nem olvasható fel (csak átlátszó
     volt); az állapota a gombján, és az Esc a gombra adja vissza a fókuszt. */
  const leg = await p.evaluate(() => ({ lathato: getComputedStyle(document.getElementById("legPop")).visibility,
    allapot: document.getElementById("legBtn").getAttribute("aria-expanded") }));
  t("a zárt jelmagyarázat rejtett (visibility), a gombja aria-expanded=false", leg.lathato === "hidden" && leg.allapot === "false", JSON.stringify(leg));
  await p.locator("#legBtn").focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(350);
  const nyit = await p.evaluate(() => ({ lathato: getComputedStyle(document.getElementById("legPop")).visibility,
    allapot: document.getElementById("legBtn").getAttribute("aria-expanded") }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(350);
  const zar = await p.evaluate(() => ({ nyitva: S.leg, fokusz: document.activeElement.id }));
  t("nyitva látszik és aria-expanded=true; az Esc bezárja, a fókusz a gombra kerül",
    nyit.lathato === "visible" && nyit.allapot === "true" && !zar.nyitva && zar.fokusz === "legBtn", JSON.stringify({ nyit, zar }));

  /* A lap nyelve és címe a felülettel vált: a felolvasó a lang szerint ejt, és
     a fül címe más épületben is az OA-t mondta. */
  await p.click("#langEn"); await p.waitForTimeout(200);
  const en = await p.evaluate(() => ({ lang: document.documentElement.lang, cim: document.title,
    kereso: document.getElementById("q").getAttribute("aria-label"), tema: document.getElementById("thDark").getAttribute("aria-label"),
    h1: document.querySelector("h1").textContent }));
  await p.click("#langHu"); await p.waitForTimeout(200);
  const hu = await p.evaluate(() => ({ lang: document.documentElement.lang, cim: document.title, main: !!document.querySelector("main #q") }));
  t("angolul a lap nyelve „en”, a címe, a h1 és a statikus címkék angolok",
    en.lang === "en" && /Room finder/.test(en.cim) && en.h1 === en.cim && en.kereso === "Search" && en.tema === "Dark", JSON.stringify(en));
  t("magyarul vissza; a kereső a fő tájékozódási pontban (main) áll", hu.lang === "hu" && /Teremkereső/.test(hu.cim) && hu.main, JSON.stringify(hu));

  /* Nagyítva a nyíllal fókuszált terem a képen kívül állt: a böngésző a térkép
     dobozát görgette el (overflow:hidden), és a ⤢ sem hozta vissza. */
  await p.evaluate(() => { S.sel = null; refreshSel(); setLevel(0); S.view.k = 6; S.dirty = true; updateView(); });
  await p.waitForTimeout(500);
  await p.locator("#stage").focus();
  for (let i = 0; i < 12; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(40); }
  await p.waitForTimeout(700);
  const lat = await p.evaluate(() => { const m = document.getElementById("mapwrap"), w = m.getBoundingClientRect(),
    b = document.activeElement.getBoundingClientRect(), cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
    return { gorgetve: m.scrollTop + m.scrollLeft, bent: cx > w.left && cx < w.right && cy > w.top && cy < w.bottom,
             kod: document.activeElement.dataset.code }; });
  t("nagyítva a nyíllal fókuszált terem a képen belül van, a térkép doboza nem görget", lat.gorgetve === 0 && lat.bent && !!lat.kod, JSON.stringify(lat));

  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
}, DESKTOP);

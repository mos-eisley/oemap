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

  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
}, DESKTOP);

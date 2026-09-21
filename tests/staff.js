/* Hallgatói / Minden szűrő. A meeting döntése: a hallgatónak nem kell látnia az
   irodákat, üzemeltetést, raktárakat — azok "zaj". Halványítjuk, nem töröljük:
   a szint sziluettje MINDEN helyiség poligonjából áll össze, kivéve őket lyukas
   lenne az alaprajz. Keresésből és kiválasztásból sem eshetnek ki. */
const { run, open } = require("./lib");

run("hallgatói szűrő", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  const r = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r,ms));
    const cnt = s => document.querySelectorAll(s).length;
    const cs = e => getComputedStyle(e);
    const out = {};
    dive(2); await w(1400);                          // I. emelet: itt a legtöbb iroda
    out.szint = lvName(S.level);
    const staffEl = () => document.querySelector(".floor.on .room.staff");

    out.hallgatoi = { osszes:cnt(".floor.on .room"), halvany:cnt(".floor.on .room.staff"),
                      feliratok:cnt(".floor.on .glabel text"), opacity:+cs(staffEl()).opacity };
    document.getElementById("stOn").click(); await w(700);
    out.minden = { feliratok:cnt(".floor.on .glabel text"), opacity:+cs(staffEl()).opacity };
    document.getElementById("stOff").click(); await w(700);
    out.vissza = { feliratok:cnt(".floor.on .glabel text"), opacity:+cs(staffEl()).opacity };

    const iroda = D.rooms.find(x => x.code && x.cat === "IRODÁK" && x.level === S.level);
    out.iroda = iroda.code;
    out.keresheto = search(iroda.code).length > 0;
    select(iroda.code); await w(300);
    out.kivalaszthato = S.sel === iroda.code && !!document.querySelector(".room.sel");
    return out;
  });

  t("az I. emeleten vannak halványított helyiségek", r.hallgatoi.halvany > 0,
    `${r.hallgatoi.halvany}/${r.hallgatoi.osszes}`);
  t("a halványítás nem tünteti el őket", r.hallgatoi.opacity > 0 && r.hallgatoi.opacity < 1,
    "opacity=" + r.hallgatoi.opacity);
  t("„Minden”-re váltva több felirat jelenik meg", r.minden.feliratok > r.hallgatoi.feliratok,
    `${r.hallgatoi.feliratok} -> ${r.minden.feliratok}`);
  t("és visszaáll a teljes átlátszatlanság", r.minden.opacity === 1, "opacity=" + r.minden.opacity);
  t("visszakapcsolva újra halványak", r.vissza.opacity === r.hallgatoi.opacity &&
    r.vissza.feliratok === r.hallgatoi.feliratok, JSON.stringify(r.vissza));
  t("a halvány iroda kereséssel megtalálható", r.keresheto, r.iroda);
  t("és ki is választható", r.kivalaszthato, r.iroda);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});

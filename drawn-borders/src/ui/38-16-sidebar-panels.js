/* =====================================================================
   16. Sidebar panels
   ===================================================================== */
/* ---------- Icons: game-icons.net (CC BY 3.0: Lorc, Delapouite, Skoll, sbed, Willdabeast, Faithtoken, Cathelineau) ----------
   One set of drawings for the whole game: in the panels as inline SVG (they take the colour of the text around
   them), on the map as shapes with a dark outline so they read on any ground. The path data is in section 21. */
const GI_PATHS = artIconPaths();
function giSvg(name) {
  const ps = GI_PATHS[name] || [];
  return `<svg viewBox="-12 -12 536 536" fill="currentColor" aria-hidden="true">${ps.map(d => `<path d="${d}"/>`).join("")}</svg>`;
}
const GI_SHAPES = new Map();
function giShapes(name) {
  let p = GI_SHAPES.get(name);
  if (!p) { p = (GI_PATHS[name] || []).map(d => new Path2D(d)); GI_SHAPES.set(name, p); }
  return p;
}
/* Draw an icon centred on (cx, cy), size pixels across; an outline (in pixels) is painted under the fill.
   Each icon is drawn once into a small picture at the screen's real pixel size and then copied, which is cheap
   enough to do for every marker in every frame. */
function giPaint(g, ps, cx, cy, size, fill, outline, outlineW) {
  const k = size / 512;
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(k, k);
  if (outline) {
    g.strokeStyle = outline; g.lineWidth = (outlineW || 2) / k; g.lineJoin = "round";
    for (const p of ps) g.stroke(p);
  }
  g.fillStyle = fill;
  for (const p of ps) g.fill(p);
  g.restore();
}
const GI_SPRITES = new Map();
function giDraw(c, name, cx, cy, size, fill, outline, outlineW) {
  const ps = giShapes(name);
  if (!ps.length || !(size > 0)) return;
  const m = c.getTransform ? c.getTransform() : null;
  const scale = m ? Math.hypot(m.a, m.b) || 1 : 1;
  const q = Math.max(1, Math.round(size * 2) / 2);
  const pad = Math.ceil((outline ? (outlineW || 2) : 0) + 1);
  const key = `${name}|${q}|${fill}|${outline || ""}|${outlineW || 0}|${scale.toFixed(2)}`;
  let sp = GI_SPRITES.get(key);
  if (!sp) {
    const box = q + pad * 2;
    sp = document.createElement("canvas");
    sp.width = sp.height = Math.ceil(box * scale);
    const g = sp.getContext("2d");
    g.scale(scale, scale);
    giPaint(g, ps, box / 2, box / 2, q, fill, outline, outlineW);
    GI_SPRITES.set(key, sp);
    if (GI_SPRITES.size > 400) GI_SPRITES.delete(GI_SPRITES.keys().next().value);
  }
  const w = sp.width / scale;
  c.drawImage(sp, cx - w / 2, cy - w / 2, w, w);
}
const ICONS = {
  res: giSvg("lorc/mining"),
  coin: giSvg("lorc/crown-coin"),
  people: giSvg("delapouite/three-friends"),
  hall: giSvg("lorc/capitol"),
  crown: giSvg("lorc/queen-crown"),
  globe: giSvg("delapouite/wireframe-globe"),
  scroll: giSvg("lorc/scroll-unfurled"),
  chart: giSvg("delapouite/histogram"),
  output: giSvg("delapouite/factory"),
  stability: giSvg("lorc/scales"),
  army: giSvg("lorc/crossed-swords"),
  food: giSvg("delapouite/grain-bundle"),
  select: giSvg("delapouite/arrow-cursor"),
  mail: giSvg("lorc/quill-ink"),
  road: giSvg("delapouite/road"),
  town: giSvg("delapouite/house"),
};

Object.assign(ICONS, {
  anchor: giSvg("lorc/anchor"), freighter: giSvg("delapouite/cargo-ship"), destroyer: giSvg("cathelineau/cruiser"), cruiser: giSvg("cathelineau/battleship"),
  yard: giSvg("delapouite/crane"), splash: giSvg("lorc/water-splash"), wreck: giSvg("delapouite/sinking-ship"),
});
function hudHtml() {
  if (!game) return `<div class="brand">Drawn Borders</div><div class="hud-date">Founding · World ${ui.seed}</div>`;
  const n = game.nations[PLAYER];
  const econ = economies()[PLAYER];
  const fc = forecast(world, game, PLAYER, n.laws);
  const h = n.history, prev = h.length >= 2 ? h[h.length - 2] : null;
  const gdpD = prev ? econ.gdp / prev.gdp - 1 : 0;
  const popD = prev ? econ.pop / prev.pop - 1 : 0;
  const stat = (icon, k, v, small, tone, tab = "realm") => `
    <button class="hud-stat" type="button" data-tab="${tab}" ${["Treasury", "Output", "Population", "Food", "Stability", "Army", "Prestige"].includes(k) ? `data-why="${k.toLowerCase()}" aria-label="${k}"` : `title="${k}"`}><span>${ICONS[icon]}</span>
      <span class="k">${k}</span><span class="v">${v}${small ? `<small class="tone-${tone}">${small}</small>` : ""}</span></button>`;
  const treasury = n.treasury >= 0 ? fmtMoney(n.treasury) : `Debt ${fmtMoney(-n.treasury)}`;
  const foodRatio = econ.food / econ.pop;
  return `
    <div class="brand">Drawn Borders</div>
    <div class="realm"><span class="crest" style="background:${n.color}"></span><span class="realm-name">${escapeHtml(n.name)}</span></div>
    <div class="hud-stats">
      ${stat("coin", "Treasury", treasury, `${fmtSignedMoney(fc.budget.balance - myWorkPay())}/season`, toneOf(fc.budget.balance - myWorkPay(), 0.05))}
      ${stat("output", "Output", `${fmtMoney(econ.gdp)}/yr`, prev ? signedPct(gdpD, 1) : "", toneOf(gdpD, 0.0005), "economy")}
      ${stat("people", "Population", fmtPop(econ.pop), prev ? signedPct(popD, 1) : "", toneOf(popD, 0.0002))}
      ${stat("food", "Food", pct(foodRatio), econ.famineShare > 0.01 ? "shortage" : econ.granary && econ.granary.release > 0.0005 ? "+ store" : (econ.foodIn || 0) > 0.01 * econ.pop ? "+ imports" : "of need", econ.famineShare > 0.01 ? "bad" : foodRatio < 1.1 || (econ.granary && econ.granary.release > 0.0005) ? "warn" : "neutral")}
      ${stat("stability", "Stability", `${Math.round(n.stability)}`, `→ ${Math.round(fc.target)}`, toneOf(fc.target - n.stability, 0.5))}
      ${stat("army", "Army", `${game.divisions.filter(d => d.owner === PLAYER).length} div`, enemiesOf(game, PLAYER).length ? "at war" : fmtCount(n.soldiers), enemiesOf(game, PLAYER).length ? "bad" : "neutral", "army")}
      ${stat("star", "Prestige", `${n.prestige || 0}`, liveNations(game).some(z => (z.prestige || 0) > 0) ? ordinal(legacyRank(game, PLAYER).rank) : "", legacyRank(game, PLAYER).rank === 1 ? "good" : "neutral", "agenda")}
      ${game.inbox.some(it => it.status === "open") ? stat("mail", "Envoys", `${game.inbox.filter(it => it.status === "open").length}`, "waiting", "warn", "letters") : ""}
    </div>`;
}

function introSidebarHtml() {
  return `<div class="side-body">
    <div class="block">
      <span class="eyebrow">Founding</span>
      <h2 class="side-title">Draw your nation</h2>
      <p>Press and drag on the map to trace your borders, then release.</p>
    </div>
    <ul class="factors">
      <li><span>Plains feed the most people</span></li>
      <li><span>Forests, hills and mountains supply industry</span></li>
      <li><span>A coast on the open sea gives fishing, harbors, sea trade and a navy; a lake gives fishing only</span></li>
      <li><span>Colored patches are deposits: blue-gray metal ore, brown coal, purple oil and gas, yellow gold. Zoom in (mouse wheel) to read how much each holds</span></li>
      <li><span>Compact shapes are easier to govern</span></li>
      <li><span>Set your nation ambitions, face hard choices, and race your rivals to build the world's great works</span></li>
      <li><span>Four rival powers and a handful of small city-states will settle elsewhere, with wild land between you</span></li>
    </ul>
    ${ui.error ? `<p class="notice">${escapeHtml(ui.error)}</p>` : ""}
    <div class="actions">
      <button class="btn" type="button" data-action="sample">Try a sample shape</button>
      <button class="btn" type="button" data-action="new-world">New world</button>
      <button class="btn" type="button" data-action="saves-open">Load a saved game</button>
    </div>
  </div>`;
}

function previewSidebarHtml() {
  const p = ui.preview;
  const kinds = [T.PLAINS, T.FOREST, T.HILLS, T.MOUNTAIN].filter(t => p.counts[t] > 0);
  const bar = kinds.map(t => `<span style="width:${(p.counts[t] / p.area) * 100}%;background:${TERRAIN[t].color}"></span>`).join("");
  const legend = kinds.map(t => `<span><i class="swatch" style="background:${TERRAIN[t].color}"></i>${TERRAIN[t].name} ${pct(p.counts[t] / p.area)}</span>`).join("");
  const factors = foundingFactors(p).map(f => `<li><span>${escapeHtml(f.text)}</span><span class="num tone-${f.tone}">${escapeHtml(f.effect)}</span></li>`).join("");
  return `<div class="side-body">
    <div class="block">
      <span class="eyebrow">Founding</span>
      <label class="muted small" for="nation-name">Name your nation</label>
      <input type="text" id="nation-name" maxlength="32" value="${escapeHtml(ui.name)}" autocomplete="off">
    </div>
    ${ui.note ? `<p class="notice info">${escapeHtml(ui.note)}</p>` : ""}
    <div class="stats-grid">
      <div class="stat-cell"><span class="k">Area</span><span class="v">${fmtArea(p.area)}</span></div>
      <div class="stat-cell"><span class="k">Population</span><span class="v">${fmtPop(p.econ.pop)}</span></div>
      <div class="stat-cell"><span class="k">Output</span><span class="v">${fmtMoney(p.econ.gdp)}/yr</span></div>
      <div class="stat-cell"><span class="k">Towns</span><span class="v">${p.towns.length}</span></div>
      <div class="stat-cell"><span class="k">Stability</span><span class="v">${p.traits.stability}</span></div>
      <div class="stat-cell"><span class="k">Defense</span><span class="v">${p.traits.defense}</span></div>
    </div>
    <div class="block"><span class="eyebrow">Land</span><div class="terrain-bar">${bar}</div><div class="legend">${legend}</div></div>
    <div class="block"><span class="eyebrow">What your borders give you</span><ul class="factors">${factors}</ul></div>
    <div class="actions">
      <button class="btn primary" type="button" data-action="found">Found this nation</button>
      <button class="btn" type="button" data-action="redraw">Redraw</button>
    </div>
    <p class="muted small">Draw again on the map to replace these borders.</p>
  </div>`;
}

/* --- Realm tab --- */
function lawEffectText(law, value) {
  const base = lawEffectTextBase(law, value);
  const n = game.nations[PLAYER];
  if (!n.groups || String(value) === String(n.laws[law])) return base;
  const words = groupDeltaWords(groupLawDelta(world, game, n, law, value));
  return words ? `${base}. Groups: ${words}` : base;
}
function lawEffectTextBase(law, value) {
  if (LABOUR[law]) return labourLawText(law, value);
  if (law === "education") return educationLawText(value);
  const n = game.nations[PLAYER];
  const now = forecast(world, game, PLAYER, n.laws);
  if (value === n.laws[law]) {
    if (law === "tax") return `Collects ${fmtMoney(now.budget.revenue)} a season`;
    if (law === "services") return `Costs ${fmtMoney(now.budget.services)} a season`;
    if (law === "education") return `Skill heading to ${pct(EDU_LAWS[value].skill)} · ${fmtMoney(now.budget.education)} a season`;
    if (law === "research") return `${fmtNum(researchPoints(n, now.econ))} research a season · ${fmtMoney(now.budget.research)}`;
    if (law === "trade") return tradeBookReady() ? tradeLawText(now, value, true) : now.econ.access > 0 ? `Tariffs ${fmtMoney(now.budget.tariffs)} a season` : "No port or trade partner yet";
    if (law === "finance") return `Investors put ${fmtMoney((now.econ.gdp / 4) * FINANCE_LAWS[value].invest)} a season into industry`;
    if (law === "arms") return `${fmtMoney(now.budget.arms.spend)} a season on equipment`;
    if (law === "granary") return granaryLawText(now, value, true);
    return `Up to ${fmtCount(manpowerCap({ ...n, laws: { ...n.laws, army: value } }, now.econ))} may serve`;
  }
  const alt = forecast(world, game, PLAYER, { ...n.laws, [law]: value });
  if (law === "granary") return granaryLawText(now, value, false);
  if (law === "army") return `If chosen: up to ${fmtCount(manpowerCap({ ...n, laws: { ...n.laws, army: value } }, now.econ))} may serve, stability target ${signed1(alt.target - now.target)}`;
  if (law === "finance") return `If chosen: investors put ${fmtMoney((now.econ.gdp / 4) * FINANCE_LAWS[value].invest)} a season into industry${FINANCE_LAWS[value].crisis > 0.01 ? "; banking crises become likely" : FINANCE_LAWS[value].crisis === 0 ? "; no banking crises" : ""}`;
  if (law === "trade" && tradeBookReady()) return tradeLawText(now, value, false);
  if (law === "trade") return `If chosen: imports up to ×${TRADE_LAWS[value].imports}, exports ×${TRADE_LAWS[value].exports}, tariff ${pct(TRADE_LAWS[value].tariff)}, stability ${signed1(alt.target - now.target)}`;
  if (law === "arms") return `If chosen: ${fmtMoney(alt.budget.arms.spend)} on equipment (${fmtSignedMoney(alt.budget.balance - now.budget.balance)}), stability target ${signed1(alt.target - now.target)}`;
  return `If chosen: ${fmtSignedMoney(alt.budget.balance - now.budget.balance)} a season, stability target ${signed1(alt.target - now.target)}`;
}

function lawHtml(law, title, options) {
  const n = game.nations[PLAYER];
  const buttons = options.map(o => {
    const on = String(n.laws[law]) === String(o.value);
    return `<button type="button" data-law="${law}" data-value="${o.value}" class="${on ? "on" : ""}" aria-pressed="${on}">${o.label}<small>${o.sub}</small></button>`;
  }).join("");
  return `<div class="law">
    <div class="law-head"><strong>${title}</strong><span class="law-effect" id="law-effect-${law}">${escapeHtml(lawEffectText(law, n.laws[law]))}</span></div>
    <div class="seg" role="group" aria-label="${title}"${options.length !== 4 ? ` style="grid-template-columns:repeat(${options.length},minmax(0,1fr))"` : ""}>${buttons}</div>
  </div>`;
}

function realmTabHtml() {
  const n = game.nations[PLAYER];
  const fc = forecast(world, game, PLAYER, n.laws);
  const b = fc.budget;
  const econ = economies()[PLAYER];
  const laws = `
    <div class="block">
      <span class="eyebrow">Laws · take effect when the season ends</span>
      ${lawHtml("tax", "Taxes", TAX_LAWS.map(t => ({ value: t.v, label: t.label, sub: `${t.v}%` })))}
      ${lawHtml("services", "Healthcare", SERVICE_ORDER.map(k => ({ value: k, label: SERVICE_LAWS[k].label, sub: `$${SERVICE_LAWS[k].costK}k/head` })))}
      <p class="muted small">Education, research, trade and finance are set in the <button class="linkbtn" type="button" data-tab="economy">Economy</button> panel; conscription and arms production in the <button class="linkbtn" type="button" data-tab="army">Army</button> panel.</p>
    </div>`;
  const budget = `
    <div class="block">
      <span class="eyebrow">Budget for ${seasonLabel(game.turn)}</span>
      <div class="rows">
        <div class="row"><span>Taxes collected${b.collection < 0.995 ? `<span class="sub">Only ${pct(b.collection)} collected at stability ${Math.round(n.stability)}</span>` : ""}</span><span class="num tone-good">+${fmtMoney(b.revenue)}</span></div>
        ${b.tariffs > 0.005 ? `<div class="row"><span>Tariffs on imports</span><span class="num tone-good">+${fmtMoney(b.tariffs)}</span></div>` : ""}
        <div class="row"><span>Healthcare<span class="sub">Healthier people grow faster and work better; needs chemicals for medicine</span></span><span class="num">${fmtMoney(-b.services)}</span></div>
        <div class="row"><span>Education<span class="sub">Raises workforce skill toward ${pct(EDU_LAWS[n.laws.education].skill)}</span></span><span class="num">${fmtMoney(-b.education)}</span></div>
        ${b.research > 0.005 ? `<div class="row"><span>Research funding</span><span class="num">${fmtMoney(-b.research)}</span></div>` : ""}
        <div class="row"><span>Army pay and upkeep<span class="sub">${fmtCount(n.mil ? n.mil.men : 0)} soldiers, ${fmtCount(game.airwings.filter(a => a.owner === PLAYER).reduce((s, a) => s + a.planes, 0))} aircraft</span></span><span class="num">${fmtMoney(-b.armyUpkeep)}</span></div>
        <div class="row"><span>Arms production<span class="sub">${ARMS_LAWS[n.laws.arms].label} · ${b.arms.limit === "factories" ? "limited by factories" : "limited by budget"}</span></span><span class="num">${fmtMoney(-b.arms.spend)}</span></div>
        <div class="row"><span>Road, harbor and wharf upkeep</span><span class="num">${fmtMoney(-b.upkeep)}</span></div>
        ${(b.ministries || 0) > 0.0005 ? `<div class="row"><span>Ministries<span class="sub">${MIN_ORDER.filter(k => ministry(n, k) && !ministry(n, k).pending).length} ministries and their staff</span></span><span class="num">${fmtMoneyFine(-b.ministries)}</span></div>` : ""}
        ${(b.navy || 0) > 0.0005 ? `<div class="row"><span>Navy<span class="sub">Crews, fuel and repairs: ${escapeHtml(shipsText(navyCounts(game, PLAYER)))}</span></span><span class="num">${fmtMoneyFine(-b.navy)}</span></div>` : ""}
        ${(b.granary || 0) > 0.0005 ? `<div class="row"><span>Grain for the food reserve<span class="sub">${fmtNum(monthsOfFood((n.granary && n.granary.stock) || 0, econ.pop))} months in store; the law asks for ${GRANARY_LAWS[n.laws.granary || "none"].months}</span></span><span class="num">${fmtMoneyFine(-b.granary)}</span></div>` : ""}
        ${(b.programs || 0) > 0.0005 ? `<div class="row"><span>City programs and province governments<span class="sub">${game.cities.filter(c => c.owner === PLAYER && (activeFocus(game, c) || provSeat(game, c))).map(c => `${c.name}: ${activeFocus(game, c) ? FOCI[c.focus].label.toLowerCase() : "province capital"}`).join(", ")}</span></span><span class="num">${fmtMoneyFine(-b.programs)}</span></div>` : ""}
        ${worksBudgetRowHtml()}
        ${b.interest > 0.005 ? `<div class="row"><span>Interest<span class="sub">${pct(b.interestRate)} a year on ${fmtMoney(b.debt)} of debt</span></span><span class="num">${fmtMoney(-b.interest)}</span></div>` : ""}
        <div class="row total"><span>${b.balance - myWorkPay() >= 0 ? "Surplus" : "Deficit"}</span><span class="num tone-${b.balance - myWorkPay() >= 0 ? "good" : "bad"}">${fmtSignedMoney(b.balance - myWorkPay())}</span></div>
      </div>
      <p class="muted small">Building projects are paid from the treasury when you order them. Treasury now: ${n.treasury >= 0 ? fmtMoney(n.treasury) : `debt of ${fmtMoney(-n.treasury)}`}.</p>
    </div>`;
  const stabTerms = fc.terms.map(t => `<li><span>${escapeHtml(t.label)}</span><span class="num ${t.base ? "muted" : `tone-${toneOf(t.value, 0.05)}`}">${t.base ? Math.round(t.value) : signed1(t.value)}</span></li>`).join("");
  const stability = `
    <div class="block">
      <span class="eyebrow">Stability ${Math.round(n.stability)} · heading toward ${Math.round(fc.target)}</span>
      <div class="meter"><span style="width:${n.stability}%"></span><i style="left:calc(${fc.target}% - 1px)"></i></div>
      <ul class="factors">${stabTerms}</ul>
      <p class="muted small">Each season stability closes a quarter of the gap to its target. At zero, the government falls.</p>
    </div>`;
  const projects = game.projects.filter(p => p.nid === PLAYER);
  const projectsHtml = projects.length ? `
    <div class="block">
      <span class="eyebrow">Under construction</span>
      ${projects.map(p => `<div class="project"><div class="project-head"><span>${escapeHtml(p.label)}</span><span class="num muted">${p.seasons - p.progress} season${p.seasons - p.progress > 1 ? "s" : ""} left</span></div><div class="bar"><span style="width:${(p.progress / p.seasons) * 100}%"></span></div></div>`).join("")}
    </div>` : "";
  const regions = `
    <div class="block">
      <span class="eyebrow">Towns and their land</span>
      <table class="regions"><thead><tr><th>Town</th><th class="num">People</th><th class="num">Food</th><th class="num">$k each</th><th class="num">No job</th><th class="num">Mood</th></tr></thead><tbody>
      ${econ.regions.map(r => `<tr data-city="${r.city.id}"><td>${r.city.capital ? "★ " : ""}${escapeHtml(r.city.name)}${econ.networks[r.net].capital ? (econ.bySea && econ.bySea.has(r.city.id) ? ` <span class="tone-good small">by sea</span>` : "") : ` <span class="tone-warn small">cut off</span>`}</td>
        <td class="num">${r.pop.toFixed(2)}M</td><td class="num tone-${r.foodRatio < ECON.famineLine ? "bad" : r.foodRatio < 1.1 ? "warn" : "good"}">${pct(r.foodRatio)}</td><td class="num">${r.outputK.toFixed(1)}</td><td class="num tone-${townURate(r) > 0.12 ? "bad" : townURate(r) > JOBS.natural + 0.01 ? "warn" : "good"}">${pct1(townURate(r))}</td><td class="num tone-${moodTone(r.city.mood ?? 55)}">${Math.round(r.city.mood ?? 55)}</td></tr>`).join("")}
      </tbody></table>
      <p class="muted small">Towns joined by road share food, materials and one market. Click a town for details and building options; the <button class="linkbtn" type="button" data-tab="cities">Cities</button> panel (C) ranks them by importance.</p>
    </div>`;
  return laws + budget + stability + projectsHtml + regions;
}

/* --- Economy tab --- */
const GOOD_USES = {
  food: "Feeds people; surplus feeds food processing or is sold abroad.",
  timber: "Construction and light industry.",
  metals: "Steel works, electronics, construction, weapons.",
  coal: "Coal power stations and steel works.",
  oil: "Gas power stations, chemicals, fuel for tanks and aircraft.",
  gold: "Sold abroad; reserves lower interest and steady the banks.",
  power: "Every factory, office and home. Cannot be imported.",
  goods: "What people buy. Full shops lift stability and shopkeepers' earnings.",
  machinery: "Mechanizes farms, speeds construction, equips arms factories.",
  chemicals: "Fertilizer, medicine and explosives.",
  electronics: "Tech parks, households, aircraft.",
};

function goodStatus(econ, k) {
  const d = econ.goods.demand[k], s = econ.goods.supply[k], imp = econ.goods.imports[k], exp = econ.goods.exports[k];
  if (d < 0.02 && s < 0.02) return { text: "—", tone: "muted" };
  if (econ.sat[k] < 0.95) return { text: `Short · ${pct(econ.sat[k])} met`, tone: "bad" };
  if (imp > 0.05 * d) return { text: `Imported ${pct(imp / Math.max(0.01, d))}`, tone: "warn" };
  if (econ.goods.util[k] < 0.9) return { text: `${k === "power" ? "Unused" : "Unsold"} ${pct(1 - econ.goods.util[k])}`, tone: "warn" };
  if (exp > 0.05) return { text: `Exported ${fmtNum(exp)}`, tone: "good" };
  return { text: "Balanced", tone: "good" };
}
function fmtNum(v) { return v >= 10 ? Math.round(v).toString() : v.toFixed(1); }

function sectorBarHtml(econ, field) {
  const total = Object.values(econ.sectors).reduce((s, x) => s + x[field], 0) || 1;
  return `<div class="sector-bar">${Object.entries(econ.sectors).map(([k, v]) => `<span style="width:${(v[field] / total) * 100}%;background:${SECTORS[k].color}" title="${SECTORS[k].label} ${pct(v[field] / total)}"></span>`).join("")}</div>`;
}

function sectorsHtml(econ) {
  const total = econ.gdp || 1;
  const workers = Object.values(econ.sectors).reduce((s, x) => s + x.workers, 0) || 1;
  const groups = Object.entries(SECTORS).map(([k, S]) => {
    const sec = econ.sectors[k];
    const subs = econ.subs.filter(x => x.sector === k && (x.va > 0.05 || x.workers > 0.001)).sort((a, b) => b.va - a.va);
    const rows = subs.map(x => `<li><span>${escapeHtml(x.sub)}<span class="sub">${fmtWorkers(x.workers)} workers</span></span><span class="num">${fmtMoney(x.va)}</span></li>`).join("");
    return `<details class="sector" ${k === "secondary" || k === "quaternary" ? "open" : ""}>
      <summary><i class="swatch" style="background:${S.color}"></i><strong>${S.label}</strong><span class="muted small"> ${pct(sec.va / total)} of output · ${pct(sec.workers / workers)} of workers</span><span class="num">${fmtMoney(sec.va)}</span></summary>
      <p class="muted small">${S.blurb}</p>
      ${rows ? `<ul class="factors">${rows}</ul>` : `<p class="muted small">Nothing yet. ${k === "quaternary" ? "Needs research, educated workers and the technology to build tech parks, media and business districts." : ""}</p>`}
    </details>`;
  }).join("");
  return `<div class="block">
    <span class="eyebrow">Where the wealth comes from</span>
    <div class="bar-label"><span class="muted small">Output</span>${sectorBarHtml(econ, "va")}</div>
    <div class="bar-label"><span class="muted small">Workers</span>${sectorBarHtml(econ, "workers")}</div>
    <div class="legend">${Object.entries(SECTORS).map(([k, S]) => `<span><i class="swatch" style="background:${S.color}"></i>${S.label}</span>`).join("")}</div>
    ${groups}
  </div>`;
}
function fmtWorkers(m) { return m >= 1 ? `${m.toFixed(1)}M` : `${Math.round(m * 1000)}k`; }

function goodsHtml(econ) {
  const rows = GOOD_ORDER.map(k => {
    const st = goodStatus(econ, k);
    const T = econ.trade || {}, im = econ.goods.imports[k], ex = econ.goods.exports[k];
    const trade = im > 0.01 ? `−${fmtNum(im)}` : ex > 0.01 ? `+${fmtNum(ex)}` : "";
    const who = tradeBookReady() ? (im > 0.01 ? tradeWhoShort(T.importsFrom && T.importsFrom[k], "from", im, 1) : ex > 0.01 ? tradeWhoShort(T.exportsTo && T.exportsTo[k], "to", ex, 1) : "") : "";
    return `<tr title="${escapeHtml(GOOD_USES[k])}"><td>${GOODS[k].label}<span class="sub">${escapeHtml(GOOD_USES[k])}</span></td><td class="num">${fmtNum(econ.goods.supply[k])}</td><td class="num">${fmtNum(econ.goods.demand[k])}</td><td class="num small">${trade}${who ? `<span class="sub">${escapeHtml(who)}</span>` : ""}</td><td class="small tone-${st.tone}">${st.text}</td></tr>`;
  }).join("");
  const access = tradeBookReady() ? tradeAccessShort(econ) : econ.access > 0 ? `Your ports and trade partners let you buy up to ${pct(Math.min(1, econ.access * TRADE_LAWS[game.nations[PLAYER].laws.trade].imports))} of what you lack, at a premium.` : "You have no port and no trade partner, so nothing can be imported or sold abroad. Build a port or sign a trade agreement.";
  return `<div class="block">
    <span class="eyebrow">Goods · a year</span>
    <table class="regions goods"><thead><tr><th>Good</th><th class="num">Made</th><th class="num">Wanted</th><th class="num">Trade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">${access} Imports cost ${fmtMoney(econ.importBill)} a year; exports earn ${fmtMoney(econ.exportValue)}.${tradeBookReady() ? ` <button class="linkbtn" type="button" data-tab="trade">Trade panel</button>` : ""}</p>
  </div>`;
}

function researchHtml(econ) {
  const n = game.nations[PLAYER];
  const R = n.research || { target: null, progress: 0 };
  const pts = researchPoints(n, econ);
  const cur = R.target ? TECHS[R.target] : null;
  const rows = TECH_ORDER.map(t => {
    const T_ = TECHS[t];
    const done = hasTech(n, t), avail = techAvailable(n, t), on = R.target === t;
    const state = done ? `<span class="tone-good small">Known</span>` : on ? `<span class="tone-warn small">Researching</span>` : avail ? `<span class="muted small">${Math.max(1, Math.ceil((T_.cost - (on ? R.progress : 0)) / Math.max(0.1, pts)))} seasons</span>` : `<span class="muted small">Needs ${TECHS[T_.needs].label}</span>`;
    return `<li class="tech ${done ? "done" : ""} ${on ? "on" : ""}">${avail && !on ? `<button class="linkbtn tech-pick" type="button" data-action="research" data-tech="${t}">${T_.label}</button>` : `<strong>${T_.label}</strong>`}${state}<span class="muted small tech-does">${T_.does}</span></li>`;
  }).join("");
  return `<div class="block">
    <span class="eyebrow">Research · ${fmtNum(pts)} points a season</span>
    ${cur ? `<div class="project"><div class="project-head"><span>${cur.label}${R.auto ? ' <span class="muted small">(chosen by your scientists)</span>' : ""}</span><span class="num muted">${Math.floor(R.progress)} / ${cur.cost}</span></div><div class="bar"><span style="width:${Math.min(100, (R.progress / cur.cost) * 100)}%"></span></div></div>` : `<p class="muted small">Everything has been discovered.</p>`}
    <ul class="techs">${rows}</ul>
    <p class="muted small">Points come from research funding (scaled by your workers' skill), universities and tech parks. Click a technology to work on it next.</p>
  </div>`;
}

function econPoliciesHtml() {
  return `<div class="block">
    <span class="eyebrow">Economic policy · takes effect when the season ends</span>
    ${lawHtml("education", "Education", EDU_ORDER.map(k => ({ value: k, label: EDU_LAWS[k].label, sub: `$${EDU_LAWS[k].costK}k/head` })))}
    ${lawHtml("research", "Research funding", RESEARCH_ORDER.map(k => ({ value: k, label: RESEARCH_LAWS[k].label, sub: `${+(RESEARCH_LAWS[k].share * 100).toFixed(1)}% of output` })))}
    ${lawHtml("trade", "Trade policy", TRADE_ORDER.map(k => ({ value: k, label: TRADE_LAWS[k].label.replace(" trade", ""), sub: `tariff ${pct(TRADE_LAWS[k].tariff)}` })))}
    ${lawHtml("finance", "Financial regulation", FINANCE_ORDER.map(k => ({ value: k, label: FINANCE_LAWS[k].label, sub: k === "strict" ? "safe, slow" : k === "loose" ? "fast, risky" : "middle way" })))}
  </div>`;
}

function industryMapHtml(econ) {
  const rows = econ.regions.map(r => {
    const chips = r.ind.filter(x => x.kind !== "smelter").map(x => `<span class="chip tone-neutral" title="${escapeHtml(INDUSTRIES[x.kind].does)}">${INDUSTRIES[x.kind].label}${x.lvl > 1 ? ` ×${x.lvl}` : ""}${(x.rate ?? 1) < 0.9 ? ` <span class="tone-bad">${pct(x.rate ?? 0)}</span>` : ""}</span>`).join("");
    return `<div class="town-ind"><button class="linkbtn" type="button" data-city-pick="${r.city.id}">${escapeHtml(r.city.name)}</button><span class="muted small"> ${r.pop.toFixed(1)}M · ${fmtMoney(r.gdp)}</span><div class="chips">${chips || '<span class="muted small">Farms and services only</span>'}</div></div>`;
  }).join("");
  const n = game.nations[PLAYER];
  return `<div class="block">
    <span class="eyebrow">Industry by town</span>
    ${rows}
    <p class="muted small">Click a town to build there. Private investors also build on their own: they hold ${fmtMoney(n.capital || 0)} and put it wherever it earns at least 7% a year. Looser finance, higher stability and lower taxes give them more.</p>
  </div>`;
}

function econTabHtml() {
  const n = game.nations[PLAYER];
  const econ = economies()[PLAYER];
  const h = n.history, prev = h.length >= 5 ? h[h.length - 5] : null;
  const growth = prev && prev.gdp ? econ.gdp / prev.gdp - 1 : null;
  const top = `<div class="stats-grid">
      <div class="stat-cell"><span class="k">Output</span><span class="v">${fmtMoney(econ.gdp)}/yr</span><span class="muted small">${growth !== null ? `${signedPct(growth, 1)} over a year` : "first year"}</span></div>
      <div class="stat-cell"><span class="k">Per person</span><span class="v">$${(econ.gdp / Math.max(0.01, econ.pop)).toFixed(1)}k</span><span class="muted small">a year</span></div>
      <div class="stat-cell"><span class="k">Workforce skill</span><span class="v">${pct(n.skill ?? 0.35)}</span><span class="muted small">${pct(eduOf(n).s)} skilled, ${pct(eduOf(n).e)} educated</span></div>
      <div class="stat-cell"><span class="k">Without a job</span><span class="v tone-${econ.unemployment > 0.08 ? "bad" : econ.unemployment > JOBS.natural ? "warn" : "good"}">${pct(econ.unemployment || 0)}</span><span class="muted small">farms and mines employ ${pct(econ.sectors.primary.workers / Math.max(0.01, econ.workforce || econ.workers))}</span></div>
    </div>`;
  return top + jobsBlockHtml(econ) + resourcesPanelHtml(econ) + sectorsHtml(econ) + goodsHtml(econ) + granaryBlockHtml(econ) + seaTradeHtml(econ) + econPoliciesHtml() + researchHtml(econ) + industryMapHtml(econ);
}

/* --- Industries in a town (Inspect tab) --- */
function resourcesText(r) {
  // deposits, forests and fishing grounds are worked from the map; what is left are rivers for dams and scenery for resorts
  const caps = [["power_hydro", "dams"], ["resort", "resorts"]]
    .map(([k, l]) => [industryCap(k, r.res, r.pop, r.city.port), l]).filter(([c]) => c > 0).map(([c, l]) => `room for ${c} ${c === 1 ? l.replace(/s$/, "") : l}`);
  return caps.join(" · ");
}

function industryRowHtml(x) {
  const def = INDUSTRIES[x.kind];
  const rate = x.rate ?? 0;
  let why = "";
  if (rate < 0.95) {
    const e = economies()[game.cities.find(c => c.id === x.region.city.id).owner];
    const missing = [];
    if (x.fill < 0.95) missing.push(lackWord(x));
    for (const k of Object.keys(def.in || {})) if (k !== "food" && e.sat[k] < 0.95) missing.push(GOODS[k].label.toLowerCase());
    if (def.in && def.in.food && rate < 0.95) missing.push("surplus food");
    if ((def.power || def.sector !== "primary") && e.sat.power < 0.95) missing.push("electricity");
    if (x.kind === "resort" && rate < 0.95) missing.push("peace and stability");
    why = missing.length ? ` · short of ${missing.join(", ")}` : "";
  }
  const out = Object.entries(def.out || {}).map(([k, v]) => `${fmtNum(v * x.lvl * rate)} ${GOODS[k].label.toLowerCase()}`).join(", ");
  return `<li><span><strong>${def.label}</strong>${x.lvl > 1 ? ` ×${x.lvl}` : ""}<span class="sub">${out ? `${out} a year · ` : ""}${fmtMoney(x.va || 0)} output${why ? `<span class="tone-bad">${escapeHtml(why)}</span>` : ""}</span></span><span class="num ${rate < 0.95 ? "tone-bad" : "muted"}">${pct(rate)}</span></li>`;
}

function townIndustryHtml(city, r) {
  const mine = city.owner === PLAYER;
  const econ = economies()[city.owner];
  const list = r.ind.filter(x => !SITE_KINDS[x.kind] && x.kind !== "smelter").map(industryRowHtml).join("");
  const land = resourcesText(r);
  let build = "";
  if (mine) {
    const options = [], blocked = [];
    for (const k of INDUSTRY_ORDER) {
      if (SITE_KINDS[k]) continue;
      const why = industryBlock(world, game, PLAYER, city, k, econ);
      const def = INDUSTRIES[k];
      if (why) { if (!(def.tech && !hasTech(game.nations[PLAYER], def.tech)) && !/land has no/.test(why)) blocked.push([def.label, why]); continue; }
      const lvl = cityLevels(city)[k] || 0;
      const cost = def.costB * (1 + 0.15 * lvl) * econ.constructionIndex * (def.urban && cityFocusOn(game, city, "industry") ? 0.8 : 1);
      options.push(`<button class="build-opt" type="button" data-action="quote-industry" data-city="${city.id}" data-kind="${k}"><span><strong>${def.label}</strong><span class="sub">${escapeHtml(def.does)}</span></span><span class="num">${fmtMoney(cost)}</span></button>`);
    }
    const locked = INDUSTRY_ORDER.filter(k => INDUSTRIES[k].tech && !hasTech(game.nations[PLAYER], INDUSTRIES[k].tech)).map(k => `${INDUSTRIES[k].label} (${TECHS[INDUSTRIES[k].tech].label})`);
    build = `<div class="block">
      <span class="eyebrow">Build industry here${econ.constructionIndex > 1.05 ? ` · costs +${pct(econ.constructionIndex - 1)} (building materials short)` : ""}</span>
      ${options.length ? `<div class="build-list">${options.join("")}</div>` : `<p class="muted small">Nothing more can be built here right now.</p>`}
      ${blocked.length ? `<details><summary>Why not other industries</summary><ul class="factors">${blocked.map(([l, w]) => `<li><span>${escapeHtml(l)}<span class="sub">${escapeHtml(w)}</span></span></li>`).join("")}</ul></details>` : ""}
      ${locked.length ? `<p class="muted small">Locked until researched: ${escapeHtml(locked.join(", "))}.</p>` : ""}
    </div>`;
  }
  return `${townSitesHtml(city)}
    ${land ? `<div class="block"><span class="eyebrow">Land</span><p class="small">${escapeHtml(land)}</p></div>` : ""}
    <div class="block">
      <span class="eyebrow">Industry · ${fmtWorkers(r.farmWorkers)} on farms, ${fmtWorkers(r.serviceWorkers)} in services ($${(r.serviceK || 0).toFixed(0)}k each)</span>
      ${list ? `<ul class="factors">${list}</ul>` : `<p class="muted small">No industry yet. People here farm and work in shops and services.</p>`}
    </div>
    ${build}`;
}

/* --- Resources on the map --- */
function drawDeposit(c, type, x, y, s) {
  c.lineWidth = Math.max(1, s * 0.14); c.strokeStyle = "rgba(14,10,8,0.95)";
  c.beginPath();
  if (type === 1) { c.fillStyle = "#9fb4c8"; c.moveTo(x, y - s); c.lineTo(x + s * 0.8, y - s * 0.1); c.lineTo(x + s * 0.3, y + s * 0.8); c.lineTo(x - s * 0.6, y + s * 0.6); c.lineTo(x - s * 0.8, y - s * 0.3); c.closePath(); }
  else if (type === 2) { c.fillStyle = "#2b2622"; c.moveTo(x - s * 0.8, y + s * 0.5); c.lineTo(x - s * 0.5, y - s * 0.6); c.lineTo(x + s * 0.4, y - s * 0.8); c.lineTo(x + s * 0.9, y + s * 0.1); c.lineTo(x + s * 0.3, y + s * 0.8); c.closePath(); }
  else if (type === 3) { c.fillStyle = "#14110f"; c.moveTo(x, y - s); c.bezierCurveTo(x + s * 0.9, y + s * 0.1, x + s * 0.7, y + s * 0.85, x, y + s * 0.85); c.bezierCurveTo(x - s * 0.7, y + s * 0.85, x - s * 0.9, y + s * 0.1, x, y - s); }
  else { c.fillStyle = "#e9c247"; c.arc(x, y, s * 0.75, 0, Math.PI * 2); }
  c.fill(); c.stroke();
  if (type === 3) { c.fillStyle = "rgba(255,255,255,0.5)"; c.beginPath(); c.arc(x - s * 0.25, y + s * 0.2, s * 0.18, 0, Math.PI * 2); c.fill(); }
}
function drawDeposits(c, cs) {
  if (!world.dep || cs < (game ? 34 : 19)) return;
  const s = clamp(cs * 0.14, 2.8, 6);
  for (let i = 0; i < N_CELLS; i++) {
    const d = world.dep[i];
    if (!d) continue;
    const x = (cellX(i) + 0.25 + 0.5 * hash2(i, 1, world.seed)) * cs, y = (cellY(i) + 0.25 + 0.5 * hash2(i, 2, world.seed)) * cs;
    c.globalAlpha = 0.8;
    drawDeposit(c, d, x, y, s);
    c.globalAlpha = 1;
  }
}
function drawFactory(c, x, y, s, color) {
  // a works with its stacks, its owner's colour along the yard, and smoke drifting from the chimney
  giDraw(c, "delapouite/factory", x, y - s * 0.8, s * 2.1, "#d8cfbd", "rgba(20,14,10,0.95)", 1.8);
  c.fillStyle = color; c.fillRect(x - s * 0.9, y + s * 0.12, s * 1.8, Math.max(1.2, s * 0.17));
  const t = motion.on ? motion.now / 1000 : 0;
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.45 + k / 3 + (x % 7) * 0.05) % 1;
    c.fillStyle = `rgba(225,225,222,${0.6 * (1 - ph)})`;
    c.beginPath(); c.arc(x + s * (0.72 + ph * 0.9), y - s * (1.95 + ph * 1.6), s * (0.22 + ph * 0.4), 0, Math.PI * 2); c.fill();
  }
}
function drawIndustryGlyphs(c, cs, r, x, y, color) {
  const n = r.ind.filter(k => ["secondary", "quaternary"].includes(INDUSTRIES[k.kind].sector)).reduce((s, k) => s + k.lvl, 0);
  if (!n) return;
  const s = clamp(cs * 0.17, 4, 11);
  const count = Math.min(5, Math.ceil(n / 2));
  for (let k = 0; k < count; k++) drawFactory(c, x + cs * 0.85 + k * s * 2.4, y + s * 0.3, s, color);
}

/* --- Selected tab --- */
function cityDetailHtml(city) {
  const n = game.nations[city.owner];
  const econ = economies()[city.owner];
  const rk = econ.regions.findIndex(x => x.city.id === city.id);
  const r = econ.regions[rk];
  if (!r) {
    const by = game.occ[city.cell];
    const po = cityProf(city);
    return `<div class="block"><span class="eyebrow" style="color:${n.color}">${escapeHtml(n.name)}${city.capital ? " · Capital" : ""}</span><h2 class="side-title">${escapeHtml(city.name)}</h2></div>
      <p class="notice">${by >= 0 ? `Occupied by the ${escapeHtml(nameOf(game, by))}. It produces nothing for its owner until it is retaken or peace is made.` : "This town is cut off."}</p>
      ${po ? `<div class="block cityfile"><div class="cf-head"><span class="cf-class">${escapeHtml(cityClass(po.imp).label)}</span><span class="cf-imp num">${po.imp}</span></div>${po.roles.length ? roleChipsHtml(po) : ""}<p class="muted small">Its importance, last known: losing it weighs on the ${escapeHtml(n.name)} in proportion.</p></div>` : ""}
      ${cityHistHtml(city)}`;
  }
  const cp = cityProf(city);
  const net = econ.networks[r.net];
  const others = net.regions.filter(k => k !== rk).map(k => econ.regions[k].city.name);
  const mine = city.owner === PLAYER;
  const busy = game.projects.filter(p => p.cityId === city.id);
  const actions = mine ? `
    <div class="block">
      <span class="eyebrow">Build here</span>
      <div class="actions">
        <button class="btn" type="button" data-action="road-from" data-city="${city.id}">Road from here</button>
        <button class="btn" type="button" data-action="quote-irrigation" data-city="${city.id}" ${city.irrigated ? "disabled" : ""}>Irrigate fields</button>
        ${city.capital ? "" : `<button class="btn" type="button" data-action="quote-capital" data-city="${city.id}">Make it the capital</button>`}
      </div>
      <p class="muted small">Harbors, shipyards and river wharves are in the "Harbor and river" section above. Mines, logging camps and fishing harbors are opened on the map: click a deposit, a forest or the coast.</p>
      ${busy.length ? `<p class="muted small">In progress: ${busy.map(p => escapeHtml(p.label)).join(", ")}.</p>` : ""}
    </div>` : "";
  return `
    <div class="block">
      <span class="eyebrow" style="color:${n.color}">${escapeHtml(n.name)}${city.capital ? " · Capital" : ""}${provinceOfCity(game, city) ? ` · ${escapeHtml(provinceOfCity(game, city).name)}${provSeat(game, city) ? " (its capital)" : ""}` : ""}</span>
      <h2 class="side-title">${escapeHtml(city.name)}</h2>
      <p class="muted small">${escapeHtml(cityTier(r.pop).label)} of ${fmtPop(r.pop)}, counting the farms and villages around it</p>
    </div>
    ${cp ? cityFileHtml(city, cp) : ""}
    ${cp ? cityMoodHtml(city, cp) : ""}
    ${cp ? cityLoyaltyHtml(city, cp) : ""}
    <div class="stats-grid">
      <div class="stat-cell"><span class="k">People</span><span class="v">${r.pop.toFixed(2)}M</span></div>
      <div class="stat-cell"><span class="k">Output</span><span class="v">${fmtMoney(r.gdp)}/yr</span></div>
      <div class="stat-cell"><span class="k">Food grown here</span><span class="v">${r.food.toFixed(2)}M fed</span></div>
      <div class="stat-cell"><span class="k">Food on its network</span><span class="v tone-${r.foodRatio < ECON.famineLine ? "bad" : "good"}">${pct(r.foodRatio)}</span></div>
    </div>
    ${cp ? cityProgramsHtml(city, cp, r) : ""}
    ${townWorkHtml(city, r)}
    ${townIndustryHtml(city, r)}
    ${portSectionHtml(city)}
    <div class="block">
      <span class="eyebrow">Connections</span>
      <p class="small">${others.length ? `Joined ${econ.bySea && econ.bySea.has(city.id) ? "by road and sea" : econ.byRiver && econ.byRiver.has(city.id) ? "by road and river barges" : "by road"} to ${others.map(escapeHtml).join(", ")}.` : "Not joined to any other town by road."}${net.capital ? (econ.bySea && econ.bySea.has(city.id) ? ` <span class="tone-good">Freighters join it to the capital's market.</span>` : "") : ` <span class="tone-warn">Cut off from the capital.</span>`}</p>
      <p class="muted small">${r.cells.length} cells of land · ${city.irrigated ? "irrigated fields" : "no irrigation"}</p>
    </div>
    ${actions}
    ${cityHistHtml(city)}`;
}

function selectedTabHtml() {
  if (ui.selectedCity) {
    const city = game.cities.find(c => c.id === ui.selectedCity);
    if (city) return cityDetailHtml(city);
  }
  if (ui.selectedCell >= 0) {
    const i = ui.selectedCell;
    const site = siteAt(i);
    if (site) return siteDetailHtml(site);
    const dt = knownDepositAt(i);
    if (dt && game.depLeft[i] > 0.01) return depositDetailHtml(i, dt);
    const t = world.terrain[i];
    if (t === T.SEA) return seaCellHtml(i);
    const owner = game.owner[i];
    return `<div class="block"><span class="eyebrow">${owner >= 0 ? escapeHtml(game.nations[owner].name) : "Wild land"}</span>
      <h2 class="side-title">${t === T.SEA ? "Sea" : TERRAIN[t].name}</h2></div>
      ${t === T.SEA ? "" : `<div class="stats-grid">
        <div class="stat-cell"><span class="k">People</span><span class="v">${(game.pop[i] * 1000).toFixed(0)}k</span></div>
        <div class="stat-cell"><span class="k">Food grown</span><span class="v">${(cellFood(world, game, i) * 1000).toFixed(0)}k fed</span></div>
        <div class="stat-cell"><span class="k">Deposit</span><span class="v">${dt ? "Worked out" : "None known"}</span></div>
        <div class="stat-cell"><span class="k">Road cost</span><span class="v">×${TERRAIN[t].roadCost}</span></div>
      </div>`}
      ${owner === -1 && t !== T.SEA ? `<p class="muted small">Unclaimed. Found a town within 2 cells of your border to claim land like this.</p>` : ""}
      ${game.occ[i] >= 0 ? `<p class="notice">Occupied by the ${escapeHtml(nameOf(game, game.occ[i]))}.</p>` : ""}
      ${t === T.SEA ? "" : landResourceHtml(i)}
      ${owner > 0 && game.nations[owner].alive ? `<div class="actions"><button class="btn" type="button" data-action="nation-view" data-nid="${owner}">About the ${escapeHtml(game.nations[owner].name)}</button></div>` : ""}`;
  }
  return `<div class="block"><span class="eyebrow">Nothing selected</span><p class="muted">Click a town or any land on the map to inspect it.</p></div>`;
}

/* --- Rivals tab --- */




/* --- Chronicle tab --- */
function chronicleTabHtml() {
  const items = game.chronicle.slice(0, 60).map(c => {
    const color = c.nid !== null && c.nid !== undefined ? NATION_COLORS[c.nid] : "var(--muted)";
    return `<li><span class="dot" style="background:${color}"></span><span><span class="num muted small">${seasonLabel(c.turn)}</span><br><span class="${c.tone !== "neutral" ? `tone-${c.tone}` : ""}">${escapeHtml(c.text)}</span></span></li>`;
  }).join("");
  return `<ul class="news">${items || `<li><span></span><span class="muted">Nothing has happened yet.</span></li>`}</ul>`;
}

/* --- Confirmation card for a planned project --- */
function confirmHtml(q) {
  const n = game.nations[PLAYER];
  const econ = economies()[PLAYER];
  const afford = canAfford(n, econ.gdp, q.cost);
  const lines = [];
  if (q.dGdp > 0.05) lines.push(`Output <span class="tone-good">+${fmtMoney(q.dGdp)} a year</span> once complete`);
  else if (q.kind === "industry" && q.dGdp < -0.05) lines.push(`Output <span class="tone-bad">${fmtMoney(q.dGdp)} a year</span>: what it makes can't all be used or sold, and its workers earned more in services`);
  if (q.dFood > 0.01) lines.push(`Food for <span class="tone-good">${q.dFood.toFixed(2)}M</span> more people, so towns can grow`);
  if (q.famineRelief > 0.01) lines.push(`Ends the food shortage for <span class="tone-good">${q.famineRelief.toFixed(2)}M</span> people`);
  if (q.kind === "road" && q.trade !== undefined) lines.push(`A trade road to the ${escapeHtml(nameOf(game, q.trade))}: goods can flow between you, opening imports, exports and a bigger market for both.${q.partnerCost > 0.05 ? ` They build the ${fmtMoney(q.partnerCost)} stretch inside their land.` : ""}`);
  else if (q.kind === "road" && q.access) lines.push(`Reaches ${escapeHtml(siteOrDepositName(world, game, PLAYER, q.toCell))}. Mines, camps and harbors need a road to a town: it brings the workers in and carries what they produce out.`);
  else if (q.kind === "road") lines.push(`${q.newEdges.length} new road segments. Joined towns share food, materials and one market.`);
  if (q.kind === "survey") lines.push(`Geologists map the ground about 2 cells around this spot. They measure the deposits you know of exactly (how much, and how rich) and may find deposits hidden under the surface.`);
  if (q.kind === "site") {
    const ind = INDUSTRIES[q.siteKind], def = SITE_KINDS[q.siteKind];
    const diff = DIFFICULTY[world.terrain[q.cell]] || 1;
    const sure = !def.res || knowsSize(world, game, PLAYER, q.cell);
    const per = ind.out[def.good] * (def.res && sure ? world.depGrade[q.cell] : 1);
    const near = nearestCity(game, q.cell, PLAYER);
    lines.unshift(escapeHtml(ind.does));
    lines.push(`${q.siteId ? "The new level employs" : "Employs"} about ${fmtWorkers(ind.workers * (0.85 + 0.15 * diff))} workers${near ? ` from ${escapeHtml(near.name)}` : ""}`);
    lines.push(`${q.siteId ? "Adds" : "Produces"} ${sure ? "" : "roughly "}${escapeHtml(fmtSiteOutput(q.siteKind, per))}${def.res ? "" : " at most"} at a normal pace`);
    if (def.res) {
      const left = game.depLeft[q.cell];
      const yrs = left / Math.max(0.0001, per * q.level);
      lines.push(sure ? `The deposit holds ${escapeHtml(fmtAmount(def.res, left))}: at level ${q.level} that lasts about ${Math.max(1, Math.round(yrs))} years` : `The deposit holds ${escapeHtml(reserveText(q.cell, def.res))}. A survey first would tell you exactly.`);
    }
    if (diff > 1.2) lines.push(`${TERRAIN[world.terrain[q.cell]].name} ground: dearer to build and needs more workers`);
  }
  if (q.kind === "town") lines.push(`Claims ${q.claim.length} cells of wild land for your nation`);
  if (q.kind === "town" && q.overseas) lines.push(`Settlers sail from ${escapeHtml((cityById(q.fromPort) || { name: "your harbor" }).name)} on ${SEA.settlerFreighters} of your freighters, with tools and seed for the first year. It starts cut off from your market: a road, or a harbor there with your freighters on the run, joins it.`);
  if (q.kind === "port") lines.push(`Sea trade and the world market for every town on its road network, a base for fishing fleets, and freighters bought abroad · room for ${PORT_LEVELS[1].tradeMt} Mt of trade a year · ${PORT_LEVELS[1].berths} berths where troopships load ${fmtCount(PORT_LEVELS[1].berths * SEA.berthTonsDay)} tons of military cargo a day · upkeep ${fmtMoneyFine(PORT_LEVELS[1].upkeepB)} a season`);
  if (q.kind === "portup") {
    const P = PORT_LEVELS[q.level];
    lines.unshift(escapeHtml(P.does));
    lines.push(`Room for ${P.tradeMt} Mt of trade a year · ${P.berths} berths where troopships load ${fmtCount(P.berths * SEA.berthTonsDay)} tons of military cargo a day · ${P.slips} slipways · upkeep ${fmtMoneyFine(P.upkeepB)} a season`);
    if (q.room > 0.05) lines.push(`Your harbors were full: the extra room lets more trade through`);
  }
  if (q.kind === "wharf") lines.push(`Barges carry goods along the river to every town that has a wharf on it, as a road would · upkeep ${fmtMoneyFine(SEA.wharfUpkeepB)} a season`);
  if (q.kind === "ships") {
    const t = SHIP_TYPES[q.ship], at = cityById(q.cityId);
    lines.push(escapeHtml(t.does));
    lines.push(`Like ${t.like}: ${t.attack ? `${fmtCount(t.disp)} tons, ${t.knots} knots` : `carries ${fmtCount(t.tons)} tons at ${t.knots} knots`}, a crew of ${fmtCount(t.crew)}`);
    lines.push(q.seller === undefined ? `Built on ${q.slips} of the slipways at ${escapeHtml(at ? at.name : "your yard")}; ready in ${q.seasons} season${q.seasons > 1 ? "s" : ""}`
      : q.seller === -1 ? `Bought from shipowners abroad, delivered to ${escapeHtml(at ? at.name : "your harbor")} next season`
      : `Built in the ${escapeHtml(nameOf(game, q.seller))}'s yards (they are paid now) and delivered to ${escapeHtml(at ? at.name : "your harbor")} in ${q.seasons} season${q.seasons > 1 ? "s" : ""}`);
    lines.push(`Upkeep ${fmtMoneyFine(t.upkeepB * q.count)} a season once in service${t.oil ? `, and fuel oil` : ""}`);
  }
  if (q.kind === "smelter") {
    lines.unshift(escapeHtml(INDUSTRIES.smelter.does));
    lines.push(`Smelts about ${fmtNum(q.units * RES[1].perUnit)} Mt of ore a year, as much as the mine digs`);
    lines.push(`Burns about ${fmtNum(q.coal * RES[2].perUnit)} Mt of coal a year, and needs electricity`);
    lines.push(`Employs about ${fmtWorkers(q.workersNeed)} workers`);
    if (q.dGdp < -0.05) lines.push(`<span class="tone-bad">Output ${fmtMoney(q.dGdp)} a year for now.</span> ${escapeHtml(smelterLossText(q))}`);
  }
  if (q.kind === "industry") {
    const def = INDUSTRIES[q.ind];
    lines.unshift(escapeHtml(def.does));
    lines.push(industryJobsLine(q, def));
    if (def.in) lines.push(`Needs ${Object.keys(def.in).map(k => GOODS[k].label.toLowerCase()).join(" and ")}${def.power ? " and electricity" : ""}`);
    else if (def.power) lines.push("Needs electricity");
    for (const c of q.satChanges || []) lines.push(`${GOODS[c.good].label}: <span class="tone-good">${pct(c.from)} → ${pct(c.to)}</span> of what the nation wants`);
  }
  if (q.kind === "focus") {
    const F = FOCI[q.focus], c = cityById(q.cityId);
    lines.unshift(escapeHtml(F.does));
    lines.push(`Upkeep ${fmtMoneyFine(q.upkeep)} a season while it runs`);
    if (q.replaces && FOCI[q.replaces]) lines.push(`Replaces the ${escapeHtml(FOCI[q.replaces].label.toLowerCase())} once it is ready`);
    if (c) lines.push(`Ready in ${q.seasons} season${q.seasons > 1 ? "s" : ""}; one program per city`);
  }
  if (q.kind === "province") lines.push(...provConfirmLines(q));
  if (q.kind === "capital") {
    const c = cityById(q.cityId), old = q.from !== null ? cityById(q.from) : null;
    lines.push(`The ministries, parliament and the national food reserve move to ${escapeHtml(c ? c.name : "the city")}. It becomes the seat of government: more public jobs, pride (+15 importance), and the prize every enemy wants.`);
    lines.push(`<span class="tone-bad">While the government moves: −3 stability for ${q.seasons} seasons</span>`);
    if (old) lines.push(`${escapeHtml(old.name)} becomes a former capital; its people will miss the government for a while (mood −8)`);
  }
  if (!lines.length) lines.push("Little immediate effect.");
  const payback = q.dGdp > 0.05 && q.kind !== "capital" ? q.cost / (q.dGdp * n.laws.tax / 100) : null;
  return `<div class="confirm">
    <span class="eyebrow">${q.kind === "focus" ? "City program" : q.kind === "capital" ? "A new capital" : q.kind === "province" ? "Provinces" : "Planned project"}</span>
    <h3>${escapeHtml(q.label)}</h3>
    <div class="rows">
      <div class="row"><span>Cost</span><span class="num">${fmtMoneyFine(q.cost)}</span></div>
      <div class="row"><span>Time</span><span class="num">${q.seasons} season${q.seasons > 1 ? "s" : ""}</span></div>
      ${payback ? `<div class="row"><span>Pays for itself through taxes</span><span class="num">${payback < 40 ? `about ${Math.ceil(payback)} year${Math.ceil(payback) > 1 ? "s" : ""}` : "very slowly"}</span></div>` : ""}
    </div>
    <ul class="factors">${lines.map(l => `<li><span>${l}</span></li>`).join("")}</ul>
    ${afford.ok ? "" : `<p class="bad">${escapeHtml(afford.reason)}</p>`}
    <div class="actions">
      <button class="btn primary" type="button" data-action="confirm-build" ${afford.ok ? "" : "disabled"}>${q.kind === "ships" ? (q.seller !== undefined ? "Buy" : "Order") : q.kind === "focus" || q.kind === "capital" || q.kind === "province" ? "Start" : "Build"} for ${fmtMoneyFine(q.cost)}</button>
      <button class="btn" type="button" data-action="cancel-build">Cancel</button>
    </div>
  </div>`;
}

function collapsedHtml() {
  const n = game.nations[PLAYER];
  const peak = Math.max(...n.history.map(h => h.gdp));
  return `<div class="side-body">
    <div class="block"><span class="eyebrow">${seasonLabel(Math.max(0, game.turn - 1))}</span>
      <h2 class="side-title">${escapeHtml(n.name)} has ${n.alive ? "fallen" : "been conquered"}</h2>
      <p>${n.alive ? "Stability reached zero and the government lost control." : "Every town fell to enemy armies, and the government surrendered."}</p></div>
    <div class="stats-grid">
      <div class="stat-cell"><span class="k">Seasons survived</span><span class="v">${game.turn}</span></div>
      <div class="stat-cell"><span class="k">Peak output</span><span class="v">${fmtMoney(peak)}</span></div>
    </div>
    <div class="actions"><button class="btn primary" type="button" data-action="restart-now">Found a new nation</button><button class="btn" type="button" data-action="saves-open">Load a saved game</button></div>
  </div>`;
}

function sidebarHtml() {
  if (ui.phase === "draw") return ui.drawCells ? previewSidebarHtml() : introSidebarHtml();
  if (ui.phase === "provinces") return foundingProvincesHtml();
  if (ui.phase === "collapsed") return collapsedHtml();
  if (!PANELS.some(([k]) => k === ui.tab)) { ui.tab = null; return ""; }
  const panel = PANELS.find(([k]) => k === ui.tab);
  const body = { realm: realmTabHtml, cities: citiesTabHtml, provinces: provincesTabHtml, groups: groupsTabHtml, people: peopleTabHtml, cabinet: cabinetTabHtml, agenda: agendaTabHtml, economy: econTabHtml, trade: tradeTabHtml, army: armyTabHtml, selected: selectedTabHtml, nations: nationsTabHtml, letters: lettersTabHtml, chronicle: chronicleTabHtml, navy: navyTabHtml }[ui.tab]();
  const restart = ui.confirmRestart
    ? `<div class="confirm"><p>Start a new world? ${escapeHtml(game.nations[PLAYER].name)} stays in Saved games as an earlier game, so you can come back to it.</p><div class="actions"><button class="btn danger" type="button" data-action="restart-now">New world</button><button class="btn" type="button" data-action="restart-cancel">Keep playing</button></div></div>`
    : `<button class="btn" type="button" data-action="restart-ask" style="justify-self:start">New game</button>`;
  return `<header class="panel-head"><h2>${ICONS[panel[1]]}${panel[2]}</h2><button class="panel-close" type="button" data-action="panel-close" aria-label="Close panel" title="Close (Esc)">×</button></header>
    <div class="side-body">${ui.pending ? confirmHtml(ui.pending) : ""}${body}${ui.tab === "realm" ? restart : ""}</div>`;
}



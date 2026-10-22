/* =====================================================================
   11c. Decisions: situations that arise from the world as it is, each with a hard choice
   Borrowed ideas: Crusader Kings and Stellaris (events with choices and follow-ups), Frostpunk (no perfect
   answer), Old World (events only fire when their conditions are true), RimWorld (a storyteller that paces
   crises: it hurts but does not kill), Into the Breach (every consequence shown before you choose).
   ===================================================================== */
const DECISION_SEASONS = 2;   // a decision waits this many seasons before your ministers choose for you

/* ---------- Effects: plain data, shown before you choose and applied exactly as shown ---------- */
function regionOf(econ, cityId) { return econ.regions.find(r => r.city.id === cityId) || null; }
function effectText(g, e, nid) {
  const n = g.nations[nid];
  const city = id => { const c = g.cities.find(x => x.id === id); return c ? c.name : "the town"; };
  const site = id => { const s = g.sites.find(x => x.id === id); return s ? s.name : "the site"; };
  switch (e.t) {
    case "money": return { text: `${e.v >= 0 ? "+" : "−"}${fmtMoney(Math.abs(e.v))}`, tone: e.v >= 0 ? "good" : "bad" };
    case "stab": return { text: `${signed(e.v)} stability`, tone: toneOf(e.v) };
    case "mod": {
      const parts = [];
      if (e.stab) parts.push(`${signed(e.stab)} stability`);
      if (e.output) parts.push(`${signedPct(e.output, 0)} output`);
      if (e.growth) parts.push(`${signedPct(e.growth * 4, 1)} population growth a year`);
      if (e.research) parts.push(`${signedPct(e.research, 0)} research`);
      if (e.build) parts.push(`${signedPct(e.build, 0)} cost of new factories and mines`);
      if (e.revenue) parts.push(`${signedPct(e.revenue, 0)} tax revenue`);
      if (e.invest) parts.push(`${signedPct(e.invest, 0)} private investment`);
      if (e.strike) parts.push(`${industryWord(e.strike).toLowerCase()} output −${pct(e.strikeCut || 0.5)}`);
      if (e.wage) parts.push(`workers' pay ${signed(Math.round(e.wage * 100))} points of output`);
      if (e.famineShield) parts.push(`food shortages hurt ${pct(e.famineShield)} less`);
      if (e.jobs) parts.push(`public jobs for ${pct(e.jobs)} of workers`);
      if (e.jobRelief) parts.push(`unemployment angers people ${pct(e.jobRelief)} less`);
      if (e.noFast) parts.push("no intensive mining");
      if (e.food) parts.push(`${signedPct(e.food, 0)} food from the farms`);
      const good = (e.stab || 0) + 100 * (e.output || 0) + 100 * (e.research || 0) - 100 * (e.build || 0) + 100 * (e.revenue || 0) + (e.famineShield ? 2 : 0) + (e.growth ? 400 * e.growth : 0) - (e.noFast ? 1 : 0) + (e.jobs ? 3 : 0) + (e.jobRelief ? 2 : 0) + (e.food ? 100 * e.food : 0);
      return { text: `${parts.join(", ")} for ${e.seasons} season${e.seasons > 1 ? "s" : ""}`, tone: toneOf(good) };
    }
    case "pop": return { text: `${e.share >= 0 ? "+" : "−"}${fmtPeople(Math.abs(e.people))} people in ${city(e.cityId)}`, tone: toneOf(e.share) };
    case "popAll": return { text: `${e.share >= 0 ? "+" : "−"}${fmtPeople(Math.abs(e.people))} people`, tone: toneOf(e.share) };
    case "opinion": return { text: `The ${nameOf(g, e.from)}: opinion of you ${signed(e.v)}`, tone: toneOf(e.v) };
    case "claim": return { text: `A just cause against the ${nameOf(g, e.against)} (an insult to your honor)`, tone: "neutral" };
    case "sitePause": return { text: `${site(e.siteId)} stops work for ${e.seasons} season${e.seasons > 1 ? "s" : ""}`, tone: "bad" };
    case "sitePace": return { text: `${site(e.siteId)} switches to ${SITE_KINDS[(g.sites.find(x => x.id === e.siteId) || { kind: "mine" }).kind].paces[PACE_KEYS.indexOf(e.pace)].toLowerCase()} work`, tone: "neutral" };
    case "siteLevel": return { text: `${site(e.siteId)} grows to level ${e.level}, free`, tone: "good" };
    case "forest": return { text: e.share < 0 ? `${pct(-e.share)} of the forest around it ${e.share <= -0.4 ? "burns down" : "is lost"}` : `forest grows back ${pct(e.share)}`, tone: toneOf(e.share) };
    case "fish": return { text: `fish stocks nearby ${signedPct(e.share, 0)}`, tone: toneOf(e.share) };
    case "law": return { text: `${LAW_NAMES[e.law] || e.law}: ${lawValueLabel(e.law, e.value)}`, tone: "neutral" };
    case "research": return { text: `+${Math.round(e.v)} research points${e.tech ? ` toward ${TECHS[e.tech].label}` : ""}`, tone: "good" };
    case "rivalResearch": return { text: `the ${nameOf(g, e.nid)} gains +${Math.round(e.v)} research points`, tone: "bad" };
    case "skill": return { text: `workforce skill ${signedPct(e.v, 0).replace("%", " points")}`, tone: toneOf(e.v) };
    case "capital": return { text: `private investors ${e.v >= 0 ? "gain" : "lose"} ${fmtMoney(Math.abs(e.v))} to invest`, tone: toneOf(e.v) };
    case "industry": return { text: `a free ${INDUSTRIES[e.kind].label.toLowerCase()} in ${city(e.cityId)}`, tone: "good" };
    case "prestige": return { text: `${signed(e.v)} prestige`, tone: toneOf(e.v) };
    case "follow": return { text: `a ${pct(e.chance)} risk that ${e.risk}`, tone: "bad" };
    case "traitRemove": return { text: `${n.leader ? n.leader.name : "your leader"} gives up being ${LEADER_TRAITS[e.trait].label.toLowerCase()}`, tone: "good" };
    case "levee": return { text: `${city(e.cityId)} will not flood again`, tone: "good" };
    case "successor": return { text: e.leader.traits.map(t => TRAIT_EFFECTS[t]).join("; "), tone: "neutral" };
    case "granary": return { text: `${e.months > 0 ? "+" : "−"}${Math.abs(e.months)} month${Math.abs(e.months) === 1 ? "" : "s"} of food ${e.months > 0 ? "stored in" : "taken from"} the national reserve`, tone: e.months > 0 ? "good" : "neutral" };
    case "drill": return { text: `every trained division gains ${pct(e.v)} experience (up to ${pct(e.cap)})`, tone: "good" };
    case "cityMod": {
      const parts = [];
      if (e.mood) parts.push(`mood ${signed(e.mood)}`);
      if (e.out) parts.push(`output ${signedPct(e.out, 0)}`);
      if (e.def) parts.push(`defenders ${signedPct(e.def, 0)}`);
      if (e.loyal) parts.push(`loyalty ${signed(e.loyal)} a season`);
      if (e.growth) parts.push(`${signedPct(e.growth * 4, 1)} growth a year`);
      if (e.noIntake) parts.push("no newcomers allowed");
      return { text: `${city(e.cityId)}: ${parts.join(", ")}${e.seasons ? ` for ${e.seasons} season${e.seasons > 1 ? "s" : ""}` : " for good"}`, tone: toneOf((e.mood || 0) + 100 * (e.out || 0) + 10 * (e.def || 0) + (e.loyal || 0) - (e.noIntake ? 1 : 0)) };
    }
    case "cityLoyalty": return { text: `${city(e.cityId)}: loyalty ${signed(e.v)}`, tone: toneOf(e.v) };
    case "group": return groupEffectText(e);
    case "general": return { text: "a general becomes Minister of Defence", tone: "neutral" };
    // trade between nations (10s): the same engine actions the Trade panel and rival governments use
    case "embargo": return { text: embargoEffectText(g, e), tone: "bad" };
    case "lift": {
      const x = ((g.trade && g.trade.embargoes) || []).find(y => y.id === e.id);
      const on = x ? x.on : e.on, what = x ? (x.k === "all" ? "all trade" : goodWord(x.k)) : e.what || "trade";
      const young = x && g.turn - x.since < TRADE.minEmbargo;
      return { text: `Lift our embargo on the ${nameOf(g, on)} (${what})${young ? ": no goodwill, it began less than a year ago" : ": their opinion of you rises a little, and their grudge halves"}`, tone: "good" };
    }
    case "foodAid": {
      const mo = e.got ?? e.months ?? 1;   // months of their food it covers (less than asked when our reserve is small)
      return { text: `Send grain from our reserve to the ${nameOf(g, e.to)}: food for ${fmtPeople((e.q || 0) * 12 / Math.max(0.01, mo))} people for ${monthsText(mo)}${e.ours ? ` (${monthsText(e.ours)} of our own reserve)` : ""}${e.opinion > 0 ? `; their opinion of you +${Math.round(e.opinion)}` : ""}`, tone: "neutral" };
    }
    case "prefer": return e.from !== null && e.from !== undefined && e.from >= 0
      ? { text: `Our merchants buy ${goodWord(e.k)} from the ${nameOf(g, e.from)} first: they count its price ${pct(TRADE.prefer)} lower when they sign contracts`, tone: "neutral" }
      : { text: `Our merchants buy ${goodWord(e.k)} wherever it is cheapest (no preferred seller)`, tone: "neutral" };
    case "envoy": return e.terms
      ? { text: `Our envoy proposes ${termsText(g, e.terms)} to the ${nameOf(g, e.to)}: they answer at once, and may refuse`, tone: "neutral" }
      : { text: `Our envoy proposes a ${TREATY_INFO[e.type] ? TREATY_INFO[e.type].label.toLowerCase() : e.type} to the ${nameOf(g, e.to)}: they answer at once`, tone: "neutral" };
    default: return { text: "", tone: "neutral" };
  }
}
/* "Stop selling metals to the X: their output −$0.4B a year, ours −$0.2B; their opinion of you −1 → −16 (wary)". */
function embargoEffectText(g, e) {
  const X = nameOf(g, e.on), good = e.k === "all" ? null : goodWord(e.k);
  const base = e.k === "all"
    ? `${e.dir === "sell" ? `Stop selling anything to the ${X}` : e.dir === "buy" ? `Stop buying anything from the ${X}` : `Stop all trade with the ${X}`} (${e.food ? "food too" : "food still allowed"})`
    : e.dir === "sell" ? `Stop selling ${good} to the ${X}` : e.dir === "buy" ? `Stop buying ${good} from the ${X}` : `Stop all trade in ${good} with the ${X}`;
  const pv = e.pv;
  if (!pv) return base;
  return `${base}: their output ${bSigned(pv.them)} a year, ours ${bSigned(pv.self)}; their opinion of you ${signed(pv.op0)} → ${signed(pv.op1)} (${pv.word.toLowerCase()})${pv.ends ? "; it ends our treaty with them" : ""}${pv.broken ? "; it BREAKS our promise to them" : ""}`;
}
/* The few numbers of an embargo preview an effect keeps, to show them before you choose. */
function embargoPv(pv) {
  return { them: sr(pv.dGdpThem, 3), self: sr(pv.dGdpSelf, 3), op0: Math.round(pv.opinion.before), op1: Math.round(pv.opinion.after), word: pv.opinion.word, ends: !!pv.endsTreaty, broken: !!pv.breaksPromise,
    arms: pv.arms.map(x => sr(x, 3)), fuel: pv.fuel.map(x => sr(x, 3)), food: pv.food.map(x => sr(x, 3)), war: pv.warWish || 0, lost: sr(pv.lostSales || 0, 3) };
}
/* What an embargo would do to their army and people, in short lines (for orders and objections). */
function embargoPvLines(pv) {
  const out = [];
  if (pv.arms[0] - pv.arms[1] > 0.01) out.push(`Their arms factories: ${pct(pv.arms[0])} → ${pct(pv.arms[1])} of the metal and parts they need`);
  if (pv.fuel[0] - pv.fuel[1] > 0.01) out.push(`Fuel for their army: ${pct(pv.fuel[0])} → ${pct(pv.fuel[1])}`);
  if (pv.food[0] - pv.food[1] > 0.01) out.push(`Their people fed: ${pct(pv.food[0])} → ${pct(pv.food[1])}`);
  if (pv.war > 0) out.push(`Their wish for war with us +${pv.war}`);
  return out;
}
function monthsText(m) { return `${fmt1(m)} month${Math.abs(m - 1) < 0.05 ? "" : "s"}`; }
function fmtPeople(m) { return m >= 1 ? `${m.toFixed(1)}M` : `${Math.max(1, Math.round(m * 1000))}k`; }

function applyEffects(w, g, nid, effects) {
  const n = g.nations[nid];
  if (!n || !n.alive) return;
  const econ = computeEconomy(w, g, nid);
  for (const e of effects) {
    switch (e.t) {
      case "money": n.treasury += e.v; break;
      case "stab": n.stability = clamp(n.stability + e.v, 0, 100); break;
      case "mod": { const { t, ...m } = e; addNationMod(g, n, m); break; }
      case "pop": { const r = regionOf(econ, e.cityId); if (r) { scalePopulation(g, r.cells, 1 + e.share); n.popEvents = (n.popEvents || 0) + r.pop * e.share; } break; }
      case "popAll": for (const r of econ.regions) { scalePopulation(g, r.cells, 1 + e.share); n.popEvents = (n.popEvents || 0) + r.pop * e.share; } break;
      case "granary": { const G = n.granary || (n.granary = { stock: 0 }); G.stock = Math.max(0, (G.stock || 0) + e.months / 12 * econ.pop); break; }
      case "drill": for (const d of g.divisions) if (d.owner === nid && !d.training && (d.exp || 0) < e.cap) d.exp = Math.min(e.cap, (d.exp || 0) + e.v); break;
      case "opinion": if (g.nations[e.from] && g.nations[e.from].alive) addMod(g, e.from, nid, e.key, e.label, e.v, 0.5, e.v > 0 ? (e.cap ?? 25) : -30); break;
      case "claim": addMod(g, nid, e.against, "insult", "Insulted our honor at the border", -6, 0.3, -20); break;
      case "sitePause": { const s = g.sites.find(x => x.id === e.siteId); if (s && !s.exhausted && g.owner[s.cell] === nid) { s.paused = true; s.pausedUntil = g.turn + e.seasons; } break; }
      case "sitePace": { const s = g.sites.find(x => x.id === e.siteId); if (s && g.owner[s.cell] === nid) s.pace = e.pace; break; }
      case "siteLevel": { const s = g.sites.find(x => x.id === e.siteId); if (s && !s.exhausted && g.owner[s.cell] === nid && s.level < siteMaxLevel(w, s)) s.level += 1; break; }
      case "forest": {
        for (const c of forestArea(w, e.cell)) {
          if (!(g.forest[c] > 0) && e.share < 0) continue;
          if (w.terrain[c] !== T.FOREST && e.share > 0) continue;
          g.forest[c] = e.share < 0 ? g.forest[c] * (1 + e.share) : Math.min(1, g.forest[c] + e.share * (1 - g.forest[c]));
          if (g.forest[c] < NATURE.forestClear && w.terrain[c] === T.FOREST) clearForestCell(w, g, c);
        }
        break;
      }
      case "fish": for (const c of fishArea(w, e.cell)) g.fish[c] = clamp(g.fish[c] * (1 + e.share), 0, 1); break;
      case "law": n.laws = { ...n.laws, [e.law]: e.value }; break;
      case "research": n.research = n.research || { target: null, progress: 0, queue: [] }; n.research.progress += e.v; break;
      case "rivalResearch": { const r = g.nations[e.nid]; if (r && r.alive) { r.research = r.research || { target: null, progress: 0 }; r.research.progress += e.v; } break; }
      case "skill": peopleSkillAdd(n, e.v); break;
      case "capital": n.capital = Math.max(0, (n.capital || 0) + e.v); break;
      case "industry": { const c = g.cities.find(x => x.id === e.cityId); if (c && c.owner === nid) { c.ind = { ...(c.ind || {}) }; c.ind[e.kind] = (c.ind[e.kind] || 0) + 1; } break; }
      case "prestige": addPrestige(g, nid, e.v, e.cat || "people", e.why || "A decision"); break;
      case "follow": g.story.queue.push({ key: e.key, nid, at: g.turn + e.inMin + ((g.turn * 7 + nid * 13) % (e.inMax - e.inMin + 1)), chance: e.chance, ctx: e.ctx || {} }); break;
      case "traitRemove": if (n.leader) n.leader.traits = n.leader.traits.filter(t => t !== e.trait); break;
      case "levee": { const c = g.cities.find(x => x.id === e.cityId); if (c && c.owner === nid) c.levee = true; break; }
      case "successor": n.leader = { ...e.leader, since: g.turn, deeds: {}, gdpStart: econ.gdp }; delete n.leader.role; break;
      case "cityMod": { const c = g.cities.find(x => x.id === e.cityId); if (c && c.owner === nid) addCityMod(g, c, e); break; }
      case "cityLoyalty": { const c = g.cities.find(x => x.id === e.cityId); if (c && c.owner === nid) c.loyalty = clamp((c.loyalty ?? CITY.loyalNative) + e.v, 0, 100); break; }
      case "group": applyGroupEffect(g, n, e); break;
      case "general": {
        const M = ministry(n, "defence");
        if (!M) break;
        const m = makeMinister(g, n, "defence", mulberry32((g.turn * 977 + nid * 31 + 7) >>> 0), 0.15);
        m.group = "army"; m.general = true;
        m.name = `General ${m.name}`;
        m.traits = ["bold", m.traits.find(t => !["careful", "stubborn", "bold"].includes(t)) || "loyal"];
        M.minister = m; M.pending = false; M.chat = [];
        if (nid === PLAYER) addChronicle(g, `${m.name} became Minister of Defence.`, "warn", PLAYER);
        break;
      }
      // trade between nations (10s): each goes through the engine's own action, which checks it again
      case "embargo": if (g.nations[e.on] && g.nations[e.on].alive) declareEmbargo(w, g, nid, e.on, e.k, e.dir, e.why || "choice", { food: !!e.food, answers: e.answers ?? null }); break;
      case "lift": liftEmbargo(w, g, e.id, nid); break;
      case "foodAid": sendFoodAid(w, g, nid, e.to, e.months || 1); break;
      case "prefer": setPreferredSeller(g, nid, e.k, e.from ?? null); break;
      case "envoy": if (nid === PLAYER) sendEnvoy(w, g, nid, e.to, e.terms || [{ type: e.type }], null); break;
    }
  }
  bumpWorld(g);
}

/* ---------- The situations ---------- */
function workingSites(c, pred) { return (c.econ.sites || []).filter(x => x.status === "working" && x.outUnits > 0 && (!pred || pred(x))); }
function cost(c, share, min = 0.2) { return -Math.max(min, Math.round(c.Y * share * 10) / 10); }
function townNear(c, cell) { return nearestCity(c.g, cell, c.nid) || c.econ.cities[0]; }
function pickBy(rng, list, weight) {
  const ws = list.map(weight), tot = ws.reduce((s, v) => s + v, 0);
  if (!(tot > 0)) return null;
  let r = rng() * tot;
  for (let k = 0; k < list.length; k++) { r -= ws[k]; if (r <= 0) return list[k]; }
  return list[list.length - 1];
}
function popEffect(c, cityId, share) {
  const r = regionOf(c.econ, cityId);
  return { t: "pop", cityId, share, people: (r ? r.pop : 0.5) * share };
}
function popAllEffect(c, share) { return { t: "popAll", share, people: c.econ.pop * share }; }

const DECISIONS = {
  strike: {
    cat: "Labor", icon: "fist", tone: "bad",
    find: c => {
      const list = workingSites(c, x => SITE_KINDS[x.kind].res);
      if (!list.length) return null;
      const hot = list.filter(x => (x.site.pace || "normal") === "fast");
      if (!hot.length && c.n.laws.tax < 35 && c.n.stability >= 45) return null;
      const x = (hot.length ? hot : list).slice().sort((a, b) => (b.workers || 0) - (a.workers || 0))[0];
      return { x, w: 1 + hot.length * 1.5 + (c.n.laws.tax >= 35 ? 0.5 : 0) };
    },
    make: (c, f) => {
      const s = f.x.site, fast = (s.pace || "normal") === "fast";
      return {
        title: `Strike at ${s.name}`, cell: s.cell,
        body: `${fmtPeople(f.x.workers || 0.02)} miners at ${s.name} have downed tools. They want better pay and shorter shifts${fast ? " after months of intensive digging" : ""}. Every season they stay out, the mine produces nothing.`,
        options: [
          { id: "a", tag: "kind", label: "Meet their demands", effects: [{ t: "money", v: -Math.max(0.3, Math.round((f.x.va || 1) * 0.5 * 10) / 10) }, { t: "stab", v: 1 }, ...(fast ? [{ t: "sitePace", siteId: s.id, pace: "normal" }] : [])] },
          { id: "b", tag: "force", label: "Send in the police", effects: [{ t: "stab", v: -4 }, { t: "mod", key: "bitter_miners", label: "Miners remember the police", stab: -1, seasons: 8 }] },
          { id: "c", tag: "thrift", label: "Wait them out", effects: [{ t: "sitePause", siteId: s.id, seasons: 2 }] },
        ], def: "c",
      };
    },
  },
  collapse: {
    cat: "Disaster", icon: "mine", tone: "bad",
    find: c => {
      if (modFlag(c.n, "noFast")) return null;
      const list = workingSites(c, x => ["mine", "coalmine", "goldmine"].includes(x.kind) && ((x.site.pace || "normal") === "fast" || x.site.level >= 3));
      if (!list.length) return null;
      const x = list.slice().sort((a, b) => ((b.site.pace === "fast") - (a.site.pace === "fast")) || b.site.level - a.site.level)[0];
      return { x, w: x.site.pace === "fast" ? 2 : 0.6 };
    },
    make: (c, f) => {
      const s = f.x.site;
      return {
        title: `Collapse at ${s.name}`, cell: s.cell,
        body: `A tunnel has collapsed deep inside ${s.name}. Dozens of miners are trapped underground, and the whole country is waiting for news.`,
        options: [
          { id: "a", tag: "kind", label: "Spare no expense to rescue them", effects: [{ t: "money", v: cost(c, 0.004, 0.4) }, { t: "stab", v: 2 }, { t: "sitePause", siteId: s.id, seasons: 1 }] },
          { id: "b", tag: "kind", label: "Rescue them, and pass a mine safety law", effects: [{ t: "money", v: cost(c, 0.005, 0.5) }, { t: "stab", v: 3 }, { t: "sitePause", siteId: s.id, seasons: 1 }, { t: "mod", key: "safety_law", label: "Mine safety law", noFast: true, seasons: 16 }] },
          { id: "c", tag: "force", label: "Seal the tunnel and keep digging", effects: [{ t: "stab", v: -6 }, { t: "mod", key: "sealed_mine", label: `The miners sealed in ${s.name}`, stab: -1, seasons: 8 }] },
        ], def: "a",
      };
    },
  },
  goldrush: {
    cat: "Opportunity", icon: "gold", tone: "good",
    find: c => {
      const gold = workingSites(c, x => x.kind === "goldmine");
      if (!gold.length) return null;
      const x = gold.find(y => c.g.turn - (y.site.opened || 0) <= 6) || (priceOf(c.g, "gold") >= 1.25 ? gold[0] : null);
      return x ? { x, w: 1.5 } : null;
    },
    make: (c, f) => {
      const s = f.x.site, town = townNear(c, s.cell);
      const canGrow = s.level < siteMaxLevel(c.w, s);
      const merch = liveNations(c.g).filter(z => z.id !== c.nid && z.archetype === "mercantile").map(z => z.id);
      return {
        title: `Gold fever in ${town.name}`, cell: s.cell,
        body: `Word of the gold at ${s.name} has spread. Fortune seekers are pouring into ${town.name} with shovels, tents and big dreams. Saloons and claim offices open every week.`,
        options: [
          { id: "a", tag: "bold", label: "Let them come", effects: [popEffect(c, town.id, 0.04), { t: "mod", key: "gold_camps", label: "Lawless gold camps", stab: -1, seasons: 4 }] },
          { id: "b", tag: "thrift", label: "Sell digging licenses", effects: [{ t: "money", v: Math.max(0.3, Math.round(c.Y * 0.003 * 10) / 10) }] },
          ...(canGrow ? [{ id: "c", tag: "force", label: "Put the gold fields under state control", effects: [{ t: "siteLevel", siteId: s.id, level: s.level + 1 }, { t: "capital", v: -Math.round((c.n.capital || 0) * 0.4 * 10) / 10 }, ...merch.slice(0, 2).map(z => ({ t: "opinion", from: z, v: -6, key: "nationalized", label: "Seized private gold claims" }))] }] : []),
        ], def: "b",
      };
    },
  },
  oilspill: {
    cat: "Disaster", icon: "oil", tone: "bad",
    find: c => {
      const list = workingSites(c, x => x.kind === "oilfield");
      for (const x of list) {
        let sea = -1, best = 99;
        for (let i = 0; i < N_CELLS; i++) if (c.w.fishK[i] > 0 && dist(i, x.site.cell) <= 3.2 && dist(i, x.site.cell) < best) { best = dist(i, x.site.cell); sea = i; }
        if (sea >= 0) return { x, sea, w: 0.8 };
      }
      return null;
    },
    make: (c, f) => {
      const s = f.x.site;
      const coastal = liveNations(c.g).filter(z => z.id !== c.nid && c.g.cities.some(t => t.owner === z.id && c.w.coastal[t.cell] && dist(t.cell, f.sea) <= 9)).map(z => z.id);
      return {
        title: `Oil spill off ${s.name}`, cell: f.sea,
        body: `A blowout at ${s.name} has sent oil into the sea. Black waves are washing onto the beaches and over the fishing grounds.`,
        options: [
          { id: "a", tag: "kind", label: "Pay for a full clean-up", effects: [{ t: "money", v: cost(c, 0.004, 0.4) }, { t: "fish", cell: f.sea, share: -0.1 }] },
          { id: "b", tag: "thrift", label: "Make the oil company pay, slowly", effects: [{ t: "money", v: cost(c, 0.001) }, { t: "fish", cell: f.sea, share: -0.3 }, { t: "stab", v: -1 }] },
          { id: "c", tag: "force", label: "Keep pumping and say nothing", effects: [{ t: "fish", cell: f.sea, share: -0.55 }, { t: "stab", v: -3 }, ...coastal.map(z => ({ t: "opinion", from: z, v: -8, key: "oil_spill", label: "Fouled our shared sea with oil" }))] },
        ], def: "b",
      };
    },
  },
  fire: {
    cat: "Disaster", icon: "fire", tone: "bad",
    find: c => {
      if (c.g.turn % 4 !== 1 && c.g.turn % 4 !== 2) return null;
      let best = null, bs = 0;
      for (const r of c.econ.regions) for (const i of r.cells) {
        if (c.w.terrain[i] !== T.FOREST || !(c.g.forest[i] > 0.6)) continue;
        const sc = c.g.forest[i] * (1 + (c.g.sites.some(s => s.kind === "logging" && dist(s.cell, i) < 3) ? 1 : 0)) / (1 + dist(i, r.city.cell) * 0.2);
        if (sc > bs) { bs = sc; best = i; }
      }
      return best !== null ? { cell: best, w: 0.9 } : null;
    },
    make: (c, f) => {
      const town = townNear(c, f.cell);
      return {
        title: `Wildfire near ${town.name}`, cell: f.cell,
        body: `A hot, dry ${SEASONS[c.g.turn % 4].toLowerCase()} has turned the forests near ${town.name} into tinder. A fire is racing through the trees, and the smoke can be seen from the town.`,
        options: [
          { id: "a", tag: "kind", label: "Send soldiers and fire crews", effects: [{ t: "money", v: cost(c, 0.0015) }, { t: "forest", cell: f.cell, share: -0.08 }] },
          { id: "b", tag: "thrift", label: "Let it burn itself out", effects: [{ t: "forest", cell: f.cell, share: -0.45 }, { t: "stab", v: -1 }] },
        ], def: "a",
      };
    },
  },
  drought: {
    cat: "Disaster", icon: "sun", tone: "bad",
    find: c => (c.g.turn % 4 === 1 ? { w: 0.5 + (c.econ.food / Math.max(0.1, c.econ.pop) < 1.15 ? 0.6 : 0) } : null),
    make: c => {
      // grain bought abroad goes into the reserve before the poor harvest: from the cheapest seller we can reach (10s)
      const offer = tradeOpen(c.econ) ? (c.g.trade && c.g.trade.v ? grainOffers(c.w, c.g, c.nid)[0] || null : { nid: -1, p: GRAN.priceB * (1 + ECON7.importPremium) }) : null;
      const months = 1.5, q = c.econ.pop * months / 12;
      return {
        title: "Drought", cell: c.econ.cities[0].cell,
        body: `No rain has fallen for weeks. The wheat is withering in the fields and the rivers are low. Farmers are asking the government for help.${offer ? ` Grain can be bought from ${whoName(c.g, offer.nid)} at ${bMoney(offer.p)} for a year's food for a million people, at our border.` : tradeOpen(c.econ) ? " No nation we can reach has grain to spare, and the world market is closed to us." : ""}`,
        options: [
          { id: "a", tag: "kind", label: "Relief for the farmers", effects: [{ t: "money", v: cost(c, 0.0025) }, popAllEffect(c, -0.002)] },
          ...(offer ? [{ id: "b", tag: "kind", label: offer.nid < 0 ? "Buy grain on the world market" : `Buy grain from the ${nameOf(c.g, offer.nid)}`, effects: [{ t: "money", v: -Math.max(0.1, round1(q * offer.p)) }, { t: "granary", months }, { t: "stab", v: 1 }] }] : []),
          ...(monthsOfFood((c.n.granary && c.n.granary.stock) || 0, c.econ.pop) >= 1.5 ? [{ id: "d", tag: "thrift", label: "Open the national granaries", effects: [{ t: "granary", months: -1.5 }, { t: "stab", v: 1 }] }] : []),
          { id: "c", tag: "thrift", label: "No relief: they must manage", effects: [popAllEffect(c, -0.01), { t: "stab", v: -5 }] },
        ], def: monthsOfFood((c.n.granary && c.n.granary.stock) || 0, c.econ.pop) >= 1.5 ? "d" : "a",
      };
    },
  },
  genstrike: {
    cat: "Labor", icon: "fist", tone: "bad",
    find: c => {
      const L = c.n.laws;
      if (!(L.tax >= 35 && SERVICE_ORDER.indexOf(L.services) <= 1) && !(c.n.stability < 38 && L.tax >= 25)) return null;
      return { w: 1 + (L.tax - 30) * 0.05 };
    },
    make: c => {
      const L = c.n.laws;
      const up = SERVICE_ORDER[SERVICE_ORDER.indexOf(L.services) + 1];
      const lower = TAX_LAWS[TAX_LAWS.findIndex(t => t.v === L.tax) - 1];
      return {
        title: "General strike", cell: c.econ.cities[0].cell,
        body: `The unions have called a general strike. Trains stand still and factories are silent. They blame ${taxLaw(L.tax).label.toLowerCase()} taxes and ${SERVICE_LAWS[L.services].label.toLowerCase()} healthcare.`,
        options: [
          ...(up ? [{ id: "a", tag: "kind", label: `Raise healthcare to ${SERVICE_LAWS[up].label.toLowerCase()}`, effects: [{ t: "law", law: "services", value: up }, { t: "stab", v: 2 }] }] : []),
          ...(lower ? [{ id: "b", tag: "kind", label: `Cut taxes to ${lower.label.toLowerCase()}`, effects: [{ t: "law", law: "tax", value: lower.v }, { t: "stab", v: 2 }] }] : []),
          { id: "c", tag: "force", label: "Break the strike", effects: [{ t: "stab", v: -6 }, { t: "mod", key: "strike_broken", label: "Strike broken by force", output: -0.03, seasons: 1 }] },
        ], def: "c",
      };
    },
  },
  jobless: {
    cat: "Labor", icon: "fist", tone: "bad",
    find: c => {
      const u = c.econ.unemployment || 0;
      const capNet = c.econ.networks.findIndex(x => x.capital);
      const worst = c.econ.regions.filter(r => r.pop > 0.3 && (capNet < 0 || r.net === capNet)).sort((a, b) => townURate(b) - townURate(a))[0];
      if (!worst || (u < 0.09 && townURate(worst) < 0.16)) return null;
      return { r: worst, w: 0.7 + Math.min(2, Math.max(0, u - 0.06) * 12) };
    },
    make: (c, f) => {
      const town = f.r.city, u = c.econ.unemployment || 0;
      const capital = c.econ.cities.find(x => x.capital) || c.econ.cities[0];
      return {
        title: `Jobless march from ${town.name}`, cell: town.cell,
        body: `${fmtPeople(f.r.unemployed || 0.01)} people in ${town.name} have no work${town.id !== capital.id ? `, and thousands of them are marching on ${capital.name}` : ", and they fill the streets"}. Their banners say "We want work, not charity". Across the nation ${pct1(u)} of workers have no job.`,
        options: [
          { id: "a", tag: "kind", label: "Public works: roads, dams and schools", effects: [{ t: "money", v: cost(c, 0.015, 0.8) }, { t: "mod", key: "public_works", label: "Public works", jobs: 0.03, stab: 1, seasons: 6 }] },
          { id: "b", tag: "thrift", label: "Pay unemployment relief", effects: [{ t: "mod", key: "relief", label: "Unemployment relief", jobRelief: 0.5, revenue: -0.02, seasons: 8 }] },
          { id: "c", tag: "force", label: "Disperse the march", effects: [{ t: "stab", v: -5 }, { t: "mod", key: "bitter_jobless", label: "The dispersed march is remembered", stab: -1, seasons: 8 }] },
        ], def: "b",
      };
    },
  },
  refugees: {
    cat: "War abroad", icon: "people", tone: "neutral",
    find: c => {
      if (!c.player) return null;
      for (const z of liveNations(c.g)) {
        if (z.id === c.nid || atWar(c.g, c.nid, z.id) || !enemiesOf(c.g, z.id).length) continue;
        if (gap(c.w, c.g, c.nid, z.id) > 3) continue;
        let occ = 0, by = -1;
        for (let i = 0; i < N_CELLS; i++) if (c.g.owner[i] === z.id && c.g.occ[i] >= 0) { occ++; by = c.g.occ[i]; }
        if (occ >= 3) return { victim: z.id, aggressor: by, w: 1.2 };
      }
      return null;
    },
    make: (c, f) => {
      const Z = c.g.nations[f.victim];
      let town = c.econ.cities[0], bd = 99;
      for (const t of c.econ.cities) { const d = distanceToNation(c.g, f.victim, t.cell); if (d < bd) { bd = d; town = t; } }
      const many = Math.min(0.06, nationPop(c.g, f.victim) * 0.012) / Math.max(0.2, regionOf(c.econ, town.id) ? regionOf(c.econ, town.id).pop : 1);
      return {
        title: `Refugees from the ${Z.name}`, cell: town.cell,
        body: `Families fleeing the fighting in the ${Z.name} are crossing into ${town.name}. They carry what they could save. Thousands more are on the roads behind them.`,
        options: [
          { id: "a", tag: "kind", label: "Open the border", effects: [popEffect(c, town.id, Math.min(0.08, many)), { t: "mod", key: "refugee_camps", label: "Crowded refugee camps", stab: -2, seasons: 4 }, { t: "opinion", from: f.victim, v: 12, key: "sheltered", label: "Sheltered our people from the war" }, ...(f.aggressor >= 0 && f.aggressor !== c.nid ? [{ t: "opinion", from: f.aggressor, v: -4, key: "sheltered_enemy", label: "Sheltered our enemy's people" }] : [])] },
          { id: "b", tag: "thrift", label: "Take in skilled workers only", effects: [popEffect(c, town.id, Math.min(0.015, many * 0.2)), { t: "skill", v: 0.01 }, { t: "opinion", from: f.victim, v: 4, key: "sheltered", label: "Took in some of our people" }] },
          { id: "c", tag: "force", label: "Close the border", effects: [{ t: "opinion", from: f.victim, v: -8, key: "closed_border", label: "Closed the border to our refugees" }] },
        ], def: "c",
      };
    },
  },
  incident: {
    cat: "Border", icon: "shield", tone: "bad",
    find: c => {
      const cands = liveNations(c.g).filter(z => z.id !== c.nid && !atWar(c.g, c.nid, z.id) && sharesBorder(c.g, c.nid, z.id) && opinionDetail(c.g, z.id, c.nid).value < 0);
      if (!cands.length) return null;
      const z = cands.slice().sort((a, b) => opinionDetail(c.g, a.id, c.nid).value - opinionDetail(c.g, b.id, c.nid).value)[0];
      return { z: z.id, w: 0.8 + Math.min(1, -opinionDetail(c.g, z.id, c.nid).value / 40) };
    },
    make: (c, f) => {
      const Z = c.g.nations[f.z];
      let town = c.econ.cities[0], bd = 99;
      for (const t of c.econ.cities) { const d = distanceToNation(c.g, f.z, t.cell); if (d < bd) { bd = d; town = t; } }
      const proud = hasTrait(c.n, "proud");
      return {
        title: `Shots on the border with the ${Z.name}`, cell: town.cell,
        body: `Border guards of the ${Z.name} and ours exchanged fire near ${town.name} last night. Two soldiers are wounded. Each side says the other fired first.`,
        options: [
          { id: "a", tag: "proud", label: "Demand an apology", effects: [{ t: "claim", against: f.z }, { t: "opinion", from: f.z, v: -6, key: "border_demand", label: "Demanded an apology over a border incident" }, { t: "stab", v: proud ? 2 : 1 }] },
          { id: "b", tag: "kind", label: "Apologize to keep the peace", effects: [{ t: "opinion", from: f.z, v: 8, key: "border_apology", label: "Apologized for a border incident" }, { t: "stab", v: proud ? -4 : -2 }] },
          { id: "c", tag: "thrift", label: "Keep it quiet", effects: [] },
        ], def: "c",
      };
    },
  },
  investors: {
    cat: "Opportunity", icon: "coin", tone: "good",
    find: c => {
      if (c.n.stability < 50 || enemiesOf(c.g, c.nid).length) return null;
      const foreign = liveNations(c.g).filter(z => z.id !== c.nid && !z.minor && (z.archetype === "mercantile" || hasTreaty(c.g, c.nid, z.id, "trade")));
      return foreign.length ? { from: foreign[0].id, w: 0.8 } : null;
    },
    make: (c, f) => {
      f.q = f.q || industryCandidates(c.w, c.g, c.n, c.econ, true).filter(q => q.dGdp > 0.3).sort((a, b) => b.dGdp - a.dGdp)[0];
      if (!f.q) return null;
      const city = c.g.cities.find(t => t.id === f.q.cityId);
      return {
        title: `Bankers from the ${nameOf(c.g, f.from)}`, cell: city.cell,
        body: `A group of bankers from the ${nameOf(c.g, f.from)} offers to build ${aOrAn(INDUSTRIES[f.q.ind].label)} ${INDUSTRIES[f.q.ind].label.toLowerCase()} in ${city.name} with their own money (about ${fmtMoney(f.q.cost)}). In return they want a break on their taxes.`,
        options: [
          { id: "a", tag: "thrift", label: "Accept their offer", effects: [{ t: "industry", cityId: city.id, kind: f.q.ind }, { t: "mod", key: "tax_break", label: "Tax break for foreign investors", revenue: -0.03, seasons: 12 }] },
          { id: "b", tag: "proud", label: "Decline: we build our own industry", effects: [{ t: "stab", v: 1 }] },
        ], def: "b",
      };
    },
  },
  epidemic: {
    cat: "Health", icon: "plus", tone: "bad",
    find: c => {
      const big = c.econ.regions.filter(r => r.pop > 2).sort((a, b) => b.pop - a.pop)[0];
      if (!big) return null;
      const care = SERVICE_ORDER.indexOf(c.n.laws.services);
      return { r: big, w: (care <= 1 ? 1 : 0.35) * (hasTech(c.n, "medicine") ? 0.5 : 1) };
    },
    make: (c, f) => {
      const town = f.r.city;
      return {
        title: `Fever in ${town.name}`, cell: town.cell,
        body: `A fever is spreading through the crowded streets of ${town.name}. The hospitals are full, and people in other towns are afraid of travellers from there.`,
        options: [
          { id: "a", tag: "force", label: `Quarantine ${town.name}`, effects: [{ t: "mod", key: "quarantine", label: `Quarantine of ${town.name}`, output: -0.03, seasons: 2 }, popEffect(c, town.id, -0.003)] },
          { id: "b", tag: "kind", label: "Build emergency hospitals", effects: [{ t: "money", v: cost(c, 0.003) }, popEffect(c, town.id, -0.005), { t: "stab", v: 1 }] },
          { id: "c", tag: "thrift", label: "Keep the town open", effects: [popEffect(c, town.id, -0.025), { t: "stab", v: -4 }] },
        ], def: "b",
      };
    },
  },
  scientist: {
    cat: "Science", icon: "flask", tone: "good",
    find: c => {
      const R = c.n.research;
      if (!R || !R.target || hasTech(c.n, R.target)) return null;
      if (RESEARCH_ORDER.indexOf(c.n.laws.research) < 1 && !(c.econ.levels.university > 0)) return null;
      const other = liveNations(c.g).filter(z => z.id !== c.nid).sort((a, b) => Object.keys(b.techs || {}).length - Object.keys(a.techs || {}).length)[0];
      return other ? { tech: R.target, other: other.id, w: 0.9 } : null;
    },
    make: (c, f) => {
      const names = ["Ilse Marrow", "Teodor Vance", "Amara Quist", "Lev Orlov", "Hana Brecht", "Oskar Lind", "Mira Solano"];
      const who = names[(c.g.turn + c.nid) % names.length];
      const pts = Math.round(TECHS[f.tech].cost * 0.35);
      return {
        title: `Dr. ${who} asks for a laboratory`, cell: c.econ.cities[0].cell,
        body: `Dr. ${who}, the most brilliant scientist of our time, asks the government for a laboratory of their own. They believe they can speed up our work on ${TECHS[f.tech].label.toLowerCase()} by years.`,
        options: [
          { id: "a", tag: "kind", label: "Build the laboratory", effects: [{ t: "money", v: cost(c, 0.003) }, { t: "research", v: pts, tech: f.tech }] },
          { id: "b", tag: "thrift", label: "We cannot afford it", effects: [{ t: "rivalResearch", nid: f.other, v: pts }] },
        ], def: "b",
      };
    },
  },
  scandal: {
    cat: "Politics", icon: "scroll", tone: "bad",
    find: c => (c.n.stability < 55 || hasTrait(c.n, "corrupt") ? { w: hasTrait(c.n, "corrupt") ? 1.4 : 0.6 } : null),
    make: c => {
      const corrupt = hasTrait(c.n, "corrupt");
      return {
        title: "A corruption scandal", cell: c.econ.cities[0].cell,
        body: `A newspaper has found that ministers took bribes for building contracts${corrupt ? `, and the trail leads toward ${c.n.leader ? leaderName(c.n) : "the top"}` : ""}. The whole country is talking about it.`,
        options: [
          { id: "a", tag: "kind", label: "Open a public inquiry", effects: [{ t: "stab", v: -4 }, { t: "mod", key: "clean_govt", label: "Cleaner government", stab: 2, seasons: 8 }, { t: "money", v: Math.max(0.2, Math.round(c.Y * 0.001 * 10) / 10) }, ...(corrupt ? [{ t: "traitRemove", trait: "corrupt" }] : [])] },
          { id: "b", tag: "force", label: "Cover it up", effects: [{ t: "follow", key: "scandal_out", chance: 0.5, inMin: 3, inMax: 6, risk: "the cover-up comes out later (−8 stability)" }] },
        ], def: "b",
      };
    },
  },
  scandal_out: {
    cat: "Politics", icon: "scroll", tone: "bad", followOnly: true,
    find: () => ({ w: 1 }),
    make: c => ({
      title: "The cover-up is exposed", cell: c.econ.cities[0].cell,
      body: "Secret papers show that the government buried the bribery scandal. Crowds have gathered outside the parliament.",
      options: [
        { id: "a", tag: "kind", label: "Dismiss the ministers involved", effects: [{ t: "stab", v: -5 }] },
        { id: "b", tag: "force", label: "Deny everything", effects: [{ t: "stab", v: -8 }, { t: "prestige", v: -5, cat: "people", why: "A government caught lying" }] },
      ], def: "b",
    }),
  },
  harvest: {
    cat: "Opportunity", icon: "food", tone: "good",
    find: c => (c.g.turn % 4 === 2 && harvestFactor(c.n) >= 1.05 && c.econ.food / Math.max(0.1, c.econ.pop) > 1.08 ? { w: 1.5 } : null),
    make: c => {
      const buyer = grainBuyer(c.g, c.nid, c.econ);
      return {
        title: "A record harvest", cell: c.econ.cities[0].cell,
        body: "The weather was perfect this year. The granaries are overflowing and the markets are full of bread, fruit and meat.",
        options: [
          ...(buyer !== null ? [{ id: "a", tag: "thrift", label: buyer >= 0 ? `Sell the surplus to the ${nameOf(c.g, buyer)}` : "Sell the surplus abroad", effects: [{ t: "money", v: Math.max(0.3, Math.round(c.Y * 0.003 * 10) / 10) }] }] : []),
          { id: "b", tag: "kind", label: "Hold harvest festivals", effects: [{ t: "stab", v: 3 }] },
          { id: "c", tag: "thrift", label: "Fill the national granaries", effects: [{ t: "granary", months: 2 }] },
        ], def: "c",
      };
    },
  },
  embargoed: {
    // never drawn by chance: made at the end of the season in which a nation embargoes us (see embargoDecisions)
    cat: "Trade", icon: "coin", tone: "bad", followOnly: true,
    find: () => null,
    make: (c, f) => {
      const g = c.g, nid = c.nid;
      const E = ((g.trade && g.trade.embargoes) || []).filter(e => (f.ids || []).includes(e.id) && e.on === nid);
      if (!E.length) return null;
      const by = E[0].by, X = nameOf(g, by);
      // what the old contracts carried (noted before the new ones were signed), and where we stand now
      const cutIn = (f.cut || []).filter(x => x.dir === "in" && x.q > 1e-4).sort((a, b) => b.v - a.v);
      const cutOut = (f.cut || []).filter(x => x.dir === "out" && x.q > 1e-4).sort((a, b) => b.v - a.v);
      const T = c.econ.trade || {};
      const now = cutIn.slice(0, 3).map(x => { const from = tradeShareText(g, T.importsFrom && T.importsFrom[x.k], "from", 0); return `${pct(c.econ.sat[x.k] ?? (x.k === "food" ? 1 - c.econ.famineShare : 1))} of our ${goodWord(x.k)} need is met now${from ? ` (bought from ${from})` : ""}`; });
      const why = EMBARGO_WHY[E[0].why] ? ` It says it did so ${EMBARGO_WHY[E[0].why]}.` : "";
      let town = c.econ.cities[0], bd = 99;
      for (const t of c.econ.cities) { const d = distanceToNation(g, by, t.cell); if (d < bd) { bd = d; town = t; } }
      const options = [];
      // a: other sellers for the most valuable good they stopped selling us
      const main = cutIn[0];
      let noAlt = "";
      if (main) {
        const alt = tradeOffers(c.w, g, nid, main.k).sellers.filter(s => s.nid >= 0 && s.nid !== by && !s.whyNot && s.offered > 1e-3 && s.price).sort((a, b) => a.price.p - b.price.p || a.nid - b.nid)[0];
        if (!alt) noAlt = ` No other nation we can reach has ${goodWord(main.k)} to sell${T.worldImportCapRaw > 0 ? "; the world market sells some, at the middlemen's price" : ", and the world market is closed to us (we need a harbor on the ocean, or a trade partner who has one)"}.`;
        if (alt) {
          const envoy = !hasTreaty(g, nid, alt.nid, "trade") && !validateDeal(g, c.w, nid, alt.nid, [{ type: "trade" }]) && nid === PLAYER;
          options.push({ id: "a", tag: "thrift", label: `Buy ${goodWord(main.k)} from the ${nameOf(g, alt.nid)} instead${envoy ? ", and offer them a trade agreement" : ""}`,
            effects: [{ t: "prefer", k: main.k, from: alt.nid }, ...(envoy ? [{ t: "envoy", to: alt.nid, type: "trade" }] : [])] });
        }
      }
      // b: talk them round (a better opinion of us is what makes a government lift an embargo)
      options.push({ id: "b", tag: "kind", label: "Send an envoy to talk them round", effects: [{ t: "money", v: cost(c, 0.0015) }, { t: "opinion", from: by, key: "trade_talks", label: "Sent an envoy to settle our trade dispute", v: 6, cap: 12 }] });
      // c: answer in kind: stop selling them what they buy most from us (a ban on buying from them would hurt our
      //    own buyers first); food only when their embargo covers food. With nothing to sell them, stop buying.
      const tw = tradeWith(g, nid, by);
      const food = E.some(e => e.k === "food" || (e.k === "all" && e.food));
      const pick = o => Object.keys(o).filter(k => !o[k].blocked && o[k].q > 1e-4 && (k !== "food" || food)).sort((a, b) => o[b].v - o[a].v || TRADE_GOODS.indexOf(a) - TRADE_GOODS.indexOf(b))[0];
      let k2 = pick(tw.aSells), dir2 = "sell";
      if (!k2) { k2 = pick(tw.bSells); dir2 = "buy"; }
      if (k2 && !embargoBlock(g, nid, by, k2, dir2)) {
        const pv = embargoPreview(c.w, g, nid, by, k2, dir2, false);
        options.push({ id: "c", tag: "proud", label: `Answer in kind: stop ${dir2 === "sell" ? `selling them ${goodWord(k2)}` : `buying their ${goodWord(k2)}`}`, effects: [{ t: "embargo", on: by, k: k2, dir: dir2, why: "retaliation", answers: E[0].id, pv: embargoPv(pv) }] });
      }
      // e: pay them to lift it, as much as their government would want (weighed exactly as a letter would be), but
      //    never more than the trade it cut is worth over the years nations plan for (DIPLO.horizonYears)
      const offer = nid === PLAYER ? liftOffer(c.w, g, nid, by) : null;
      const cutV = (f.cut || []).reduce((s, x) => s + (x.v || 0), 0) * DIPLO.horizonYears;
      let price = "";
      if (offer && offer.amount <= Math.max(cutV, 0.1)) options.push({ id: "e", tag: "kind", label: offer.amount > 0 ? `Offer them ${fmtMoney(offer.amount)} to lift it` : "Ask them to lift it", effects: [{ t: "envoy", to: by, terms: offer.terms }] });
      else if (offer) price = ` Their government would want about ${fmtMoney(offer.amount)} to lift it: more than ${DIPLO.horizonYears} years of the trade it cut (${bMoney(cutV)}).`;
      options.push({ id: "d", tag: "thrift", label: "Wait: our merchants will look for other sellers and buyers", effects: [] });
      // what our sales to them became under the new contracts
      const unsold = cutOut.slice(0, 3).map(x => ({ k: x.k, q: Math.min(x.q, ((g.trade.unsold[x.k] || [])[nid]) || 0) })).filter(x => x.q > 1e-4);
      const sales = cutOut.length ? (unsold.length ? ` No other buyer was found for ${bJoin(unsold.map(x => tradeQtyText(g, x.k, x.q)))} a year of it.` : " Our merchants found other buyers for it.") : "";
      return {
        title: `The ${X} ${embargoVerb(E[0])} us`, cell: town.cell, by,
        body: `The ${X} ${E.map(e => `${embargoVerb(e)} us`).join(", and ")}.${why}${cutIn.length ? ` Under the old contracts they sold us ${bJoin(cutIn.slice(0, 3).map(x => `${tradeQtyText(g, x.k, x.q)} a year (${pct(Math.min(1, x.share))} of our need)`))}.` : ""}${cutOut.length ? ` They bought ${bJoin(cutOut.slice(0, 3).map(x => `${tradeQtyText(g, x.k, x.q)} a year`))} from us.${sales}` : ""}${now.length ? ` With the new contracts, ${bJoin(now)}.` : ""}${noAlt}${price}`,
        options, def: "d",
      };
    },
  },
  veterans: {
    cat: "Society", icon: "army", tone: "neutral",
    find: c => {
      const ended = (c.g.stats.wars || []).filter(e => e.ended !== null && c.g.turn - e.ended <= 3 && (e.a.includes(c.nid) || e.b.includes(c.nid)) && !(c.g.story.vets || []).includes(`${c.nid}:${e.id}`));
      return ended.length ? { war: ended[0], w: 2 } : null;
    },
    make: (c, f) => {
      (c.g.story.vets = c.g.story.vets || []).push(`${c.nid}:${f.war.id}`);
      return {
        title: "The soldiers come home", cell: c.econ.cities[0].cell,
        body: `The war is over and the soldiers are coming home. Many are wounded, and many have no work to return to.`,
        options: [
          { id: "a", tag: "kind", label: "Pay soldiers' pensions", effects: [{ t: "mod", key: "pensions", label: "War pensions", revenue: -0.02, stab: 2, seasons: 12 }] },
          { id: "b", tag: "thrift", label: "Thank them with a victory parade", effects: [{ t: "money", v: cost(c, 0.0005) }, { t: "stab", v: 1 }] },
          { id: "c", tag: "force", label: "Nothing more: they did their duty", effects: [{ t: "stab", v: -3 }] },
        ], def: "b",
      };
    },
  },
  overfish: {
    cat: "Nature", icon: "fish", tone: "bad",
    find: c => {
      const x = (c.econ.sites || []).find(y => y.kind === "fishing" && !y.site.paused && !y.site.exhausted && fishStock(c.w, c.g, y.site.cell).share < 0.45);
      return x ? { x, w: 1.4 } : null;
    },
    make: (c, f) => {
      const s = f.x.site;
      return {
        title: `Empty nets off ${s.name}`, cell: s.cell,
        body: `The fishermen of ${s.name} come home with half-empty nets. Old sailors say they have never seen the fish so scarce. Scientists warn the stocks may collapse.`,
        options: [
          { id: "a", tag: "kind", label: "Ban fishing for a year", effects: [{ t: "sitePause", siteId: s.id, seasons: 4 }] },
          { id: "b", tag: "thrift", label: "Set catch quotas", effects: [{ t: "sitePace", siteId: s.id, pace: "slow" }] },
          { id: "c", tag: "force", label: "Keep fishing", effects: [{ t: "fish", cell: s.cell, share: -0.1 }] },
        ], def: "b",
      };
    },
  },
  clearcut: {
    cat: "Nature", icon: "tree", tone: "bad",
    find: c => {
      const x = (c.econ.sites || []).find(y => y.kind === "logging" && !y.site.exhausted && ((y.site.pace || "normal") === "fast" || forestStock(c.w, c.g, y.site.cell).share < 0.5));
      return x ? { x, w: 1.2 } : null;
    },
    make: (c, f) => {
      const s = f.x.site;
      return {
        title: `Bare hills above ${s.name}`, cell: s.cell,
        body: `Villagers near ${s.name} are protesting: whole hillsides have been cut bare, and the first mudslide has already buried a road.`,
        options: [
          { id: "a", tag: "kind", label: "Replant the hills", effects: [{ t: "money", v: cost(c, 0.0015) }, { t: "forest", cell: s.cell, share: 0.2 }, { t: "sitePace", siteId: s.id, pace: "slow" }] },
          { id: "b", tag: "force", label: "The country needs timber", effects: [{ t: "stab", v: -2 }] },
        ], def: "b",
      };
    },
  },
  flood: {
    cat: "Disaster", icon: "wave", tone: "bad",
    find: c => {
      if (c.g.turn % 4 !== 0) return null;
      const rv = riverCells(c.w);
      const towns = c.econ.cities.filter(t => !t.levee && rv[t.cell] >= 2);
      if (!towns.length) return null;
      return { town: towns[Math.floor(c.rng() * towns.length)], w: 0.9 };
    },
    make: (c, f) => {
      const t = f.town;
      return {
        title: `${t.name} under water`, cell: t.cell,
        body: `Spring rains and melting snow have swollen the river. It has burst its banks and flooded the lower streets of ${t.name}.`,
        options: [
          { id: "a", tag: "kind", label: "Rebuild, and raise levees", effects: [{ t: "money", v: cost(c, 0.003) }, popEffect(c, t.id, -0.002), { t: "levee", cityId: t.id }] },
          { id: "b", tag: "kind", label: "Relief for the flooded families", effects: [{ t: "money", v: cost(c, 0.001) }, popEffect(c, t.id, -0.004)] },
          { id: "c", tag: "thrift", label: "Let the town rebuild itself", effects: [popEffect(c, t.id, -0.012), { t: "stab", v: -3 }] },
        ], def: "b",
      };
    },
  },
  windfall: {
    cat: "Economy", icon: "coin", tone: "good",
    find: c => {
      const k = TRADED.filter(k => priceOf(c.g, k) >= 1.45 && (c.econ.goods.exports[k] || 0) > 0.05).sort((a, b) => priceOf(c.g, b) - priceOf(c.g, a))[0];
      return k ? { k, w: 1.2 } : null;
    },
    make: (c, f) => {
      const v = Math.max(0.4, Math.round(c.Y * 0.004 * 10) / 10);
      return {
        title: `${PRICE_LABEL_ENGINE[f.k]} boom`, cell: c.econ.cities[0].cell,
        body: `The world price of ${PRICE_LABEL_ENGINE[f.k].toLowerCase()} is ${priceOf(c.g, f.k).toFixed(2)}× normal, and we sell it abroad. Money is flowing in faster than anyone expected. How should we use it?`,
        options: [
          { id: "a", tag: "thrift", label: "Save it in a national fund", effects: [{ t: "money", v }] },
          { id: "b", tag: "kind", label: "Spend it on the people", effects: [{ t: "stab", v: 3 }] },
          { id: "c", tag: "bold", label: "Let investors build more", effects: [{ t: "capital", v: Math.round(v * 1.4 * 10) / 10 }] },
        ], def: "a",
      };
    },
  },
};
const PRICE_LABEL_ENGINE = { timber: "Timber", metals: "Metal", coal: "Coal", oil: "Oil", gold: "Gold" };

/* ---------- Choosing for a rival: their character decides, the numbers weigh in ---------- */
function effectScore(c, e) {
  const per = personality(c.n);
  const onePct = Math.max(0.5, c.Y * 0.01);
  switch (e.t) {
    case "money": return (e.v / onePct) * 3 * per.moneyWeight;
    case "stab": return e.v * (c.n.stability < 40 ? 1.8 : 1.1);
    case "mod": return ((e.stab || 0) * 0.8 + (e.output || 0) * 300 + (e.research || 0) * 30 - (e.build || 0) * 30 + (e.revenue || 0) * 300 + (e.famineShield || 0) * 2 + (e.growth || 0) * 800 - (e.noFast ? 1 : 0) + (e.jobs || 0) * 80 + (e.jobRelief || 0) * 3 + (e.food || 0) * 120 + (e.invest || 0) * 4) * Math.min(8, e.seasons) / 4;
    case "granary": return e.months * 0.8;
    case "pop": case "popAll": return e.share * 300;
    case "opinion": return e.v * 0.12 * (per.tradeWeight || 1);
    case "claim": return 1 * per.aggression;
    case "sitePause": return -2;
    case "siteLevel": return 4;
    case "forest": case "fish": return e.share * 6;
    case "research": return 3;
    case "rivalResearch": return -1;
    case "skill": return e.v * 200;
    case "capital": return (e.v / onePct) * 2;
    case "industry": return 4;
    case "prestige": return e.v * 0.3;
    case "follow": return -4 * e.chance;
    case "traitRemove": return 2;
    case "levee": return 2;
    case "cityMod": return ((e.mood || 0) * 0.12 + (e.out || 0) * 120 + (e.def || 0) * 8 + (e.loyal || 0) * 0.5 + (e.growth || 0) * 300 - (e.noIntake ? 0.5 : 0)) * Math.min(8, e.seasons || 12) / 4;
    case "cityLoyalty": return e.v * 0.15;
    case "group": return groupEffectScore(c.n, e);
    case "general": return c.n.groups && c.n.groups.army && c.n.groups.army.approval < 35 ? 1 : -1;
    // trade (10s): an embargo costs our own output and their goodwill; aid costs grain and earns goodwill
    case "embargo": return (((e.pv && e.pv.self) || 0) / onePct) * 3 * per.moneyWeight - 1;
    case "lift": return 1;
    case "foodAid": return (e.opinion || 0) * 0.12 * (per.tradeWeight || 1) - (e.ours || 1) * 0.8;
    case "prefer": return 0;
    case "envoy": return 0.5 - ((e.terms || []).filter(t => t.type === "payment" && t.from === c.nid).reduce((x, t) => x + t.amount, 0) / onePct) * 2 * per.moneyWeight;
    default: return 0;
  }
}
const TAG_TASTE = {
  force:  per => 2.5 * (per.aggression - 0.8) - 1.5 * (per.caution - 1),
  kind:   per => 1.5 * (per.caution - 0.9),
  thrift: per => 2 * (per.moneyWeight - 1),
  bold:   per => 2 * (per.landWeight - 1) + (per.aggression - 0.8),
  proud:  per => 3 * (per.pride - 1),
};
function aiPickOption(c, d) {
  const per = personality(c.n);
  let best = d.options[0], bs = -Infinity;
  for (const o of d.options) {
    const s = o.effects.reduce((sum, e) => sum + effectScore(c, e), 0) + (TAG_TASTE[o.tag] ? TAG_TASTE[o.tag](per) : 0) + (c.rng() - 0.5);
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}

/* ---------- Making, choosing and expiring decisions ---------- */
function decisionCtx(w, g, nid, rng) {
  const econ = computeEconomy(w, g, nid);
  return { w, g, nid, n: g.nations[nid], econ, Y: econ.gdp, rng, player: nid === PLAYER };
}
function makeDecision(c, key, found) {
  const T = DECISIONS[key];
  const f = found || T.find(c);
  if (!f || !c.econ.cities.length) return null;
  const d = T.make(c, f);
  if (!d || !d.options || d.options.length < 2) return null;
  decisionGroupEffects(key, d);
  if (key === "drought" && c.n) c.n.droughtTurn = c.g.turn;   // the dry summer will show in the autumn harvest
  return { id: c.g.nextId++, key, nid: c.nid, turn: c.g.turn, expires: c.g.turn + DECISION_SEASONS - 1, cat: T.cat, icon: T.icon, tone: T.tone, ...d };
}
function decide(w, g, d, optId, auto) {
  const o = d.options.find(x => x.id === optId) || d.options.find(x => x.id === d.def) || d.options[0];
  applyEffects(w, g, d.nid, o.effects);
  g.decisions = g.decisions.filter(x => x.id !== d.id);
  const n = g.nations[d.nid];
  const text = `${d.title}: ${auto ? "your ministers chose to " : ""}${o.label.charAt(0).toLowerCase()}${o.label.slice(1)}.`;
  if (d.nid === PLAYER) addChronicle(g, text, d.tone === "good" ? "good" : d.tone === "bad" ? "warn" : "neutral", PLAYER);
  if (d.cityId !== undefined) { const c = g.cities.find(x => x.id === d.cityId); if (c) cityHist(g, c, `${d.title}: ${auto ? "the ministers chose to " : ""}${o.label.charAt(0).toLowerCase()}${o.label.slice(1)}.`, d.tone === "good" ? "good" : d.tone === "bad" ? "warn" : "neutral"); }
  (g.story.past = g.story.past || []).unshift({ turn: g.turn, nid: d.nid, key: d.key, title: d.title, choice: o.label, auto: !!auto });
  if (g.story.past.length > 60) g.story.past.length = 60;
  void n;
  return { option: o, text };
}
function expireDecisions(w, g, dispatch) {
  for (const d of g.decisions.slice()) {
    if (d.expires > g.turn) continue;
    const r = decide(w, g, d, d.def, true);
    if (d.nid === PLAYER) dispatch.economy.push({ text: `You did not decide on “${d.title}”, so your ministers did: ${r.option.label.charAt(0).toLowerCase()}${r.option.label.slice(1)}.`, tone: "neutral" });
  }
}

/* Who would buy our spare grain: the hungriest nation we can reach, else the world market (-1), else nobody (null). */
function grainBuyer(g, nid, econ) {
  if (!tradeOpen(econ)) return null;
  if (!g.trade || !g.trade.v) return -1;   // no merchants' book: the old rule, the world market
  const T = econ.trade || {};
  let best = null, bq = 1e-3;
  for (const o of Object.keys(T.links || {}).map(Number).sort((a, b) => a - b)) {
    const q = (g.trade.unmet.food || [])[o] || 0;
    if (q > bq && !tradeBlocked(g, nid, o, "food")) { best = o; bq = q; }
  }
  if (best !== null) return best;
  return T.worldExportCapRaw > 0 ? -1 : null;
}
/* What it would take for `by` to lift its embargoes on us: the lift term alone if they would accept it, else the
   payment that makes their government say yes (evaluateDeal: a point is 1% of their output a year, a payment counts
   once times how much they care for money), plus one point to spare. Null when the deal cannot be offered. */
function liftOffer(w, g, nid, by) {
  if (typeof REQUEST_TYPES === "undefined" || !REQUEST_TYPES.includes("lift_embargo")) return null;   // letters cannot ask for it (10f)
  const lift = { type: "lift_embargo", by };
  if (validateDeal(g, w, nid, by, [lift])) return null;
  const ev = evaluateDeal(g, w, by, nid, [lift], { noCounter: true });
  if (ev.points >= 1) return { terms: [lift], amount: 0 };
  const gdpE = Math.max(1, computeEconomy(w, g, by).gdp), mw = Math.max(0.3, personality(g.nations[by]).moneyWeight);
  const amount = Math.max(0.1, Math.ceil((1 - ev.points) / 100 * gdpE / mw * 10) / 10);
  const terms = [lift, { type: "payment", from: nid, amount }];
  return validateDeal(g, w, nid, by, terms) ? null : { terms, amount };
}
/* An embargo on us always asks the government for an answer (no chance involved). The engine notes each one in
   g.trade.pendingDecisions when it is declared; the decision is made at the end of that season, once the new
   contracts show what it costs us. One decision per nation that embargoes us, and only if it cut real trade. */
function embargoDecisions(w, g, rng) {
  const T = g.trade;
  if (!T || !T.pendingDecisions || !T.pendingDecisions.length) return [];
  const pend = T.pendingDecisions;
  T.pendingDecisions = [];
  if (!g.nations[PLAYER].alive) return [];
  const byNation = new Map();
  for (const p of pend) {
    const e = (T.embargoes || []).find(x => x.id === p.id && x.on === PLAYER);
    if (!e) continue;   // lifted already
    const f = byNation.get(e.by) || { ids: [], cut: [], hurt: 0 };
    f.ids.push(e.id); f.cut.push(...(p.cut || [])); f.hurt = Math.max(f.hurt, e.hurt || 0);
    byNation.set(e.by, f);
  }
  const out = [];
  for (const by of [...byNation.keys()].sort((a, b) => a - b)) {
    const f = byNation.get(by);
    if (g.decisions.some(d => d.key === "embargoed" && d.by === by)) continue;   // one open question per nation
    if (!f.cut.some(x => x.v >= 0.005) && f.hurt < 0.1) continue;               // it cut nothing that matters
    const d = makeDecision(decisionCtx(w, g, PLAYER, rng), "embargoed", { w: 1, ...f });
    if (d) out.push(d);
  }
  return out;
}

/* The storyteller: how often something happens depends on how long it has been quiet, and on how the nation
   is doing. A nation on its knees is spared new disasters; a run of bad news is followed by some good. */
function storyteller(w, g, rng, dispatch) {
  const S = g.story;
  const out = [];
  const n = g.nations[PLAYER];
  for (const d of embargoDecisions(w, g, rng)) { g.decisions.push(d); out.push(d); S.last = g.turn; S.lastTone = d.tone; }
  // stories that continue: a cover-up that may come out, and so on
  for (const q of S.queue.slice()) {
    if (q.at > g.turn) continue;
    S.queue = S.queue.filter(x => x !== q);
    if (!g.nations[q.nid] || !g.nations[q.nid].alive || rng() >= q.chance) continue;
    const c = decisionCtx(w, g, q.nid, rng);
    const d = makeDecision(c, q.key, { w: 1, ...q.ctx });
    if (!d) continue;
    if (q.nid === PLAYER) { g.decisions.push(d); out.push(d); S.last = g.turn; S.lastTone = d.tone; }
    else { const o = aiPickOption(c, d); decide(w, g, d, o.id, false); }
  }
  if (n.alive && g.turn >= 3 && g.decisions.filter(d => d.nid === PLAYER).length < 2 && !out.length) {
    const since = g.turn - (S.last ?? -99);
    const p = clamp(0.15 + 0.15 * (since - 2), 0, 0.8);
    if (since >= 2 && rng() < p) {
      const c = decisionCtx(w, g, PLAYER, rng);
      const hurting = n.stability < 30 || (n.treasury < 0 && -n.treasury > 0.8 * c.Y);
      const cands = [];
      for (const key in DECISIONS) {
        const T = DECISIONS[key];
        if (T.followOnly) continue;
        if (S.recent[key] !== undefined && g.turn - S.recent[key] < 10) continue;
        const f = T.find(c);
        if (!f) continue;
        let wgt = f.w;
        if (T.tone === "bad" && hurting) wgt *= 0.25;
        if (S.lastTone === "bad" && T.tone !== "bad") wgt *= 1.7;
        if (S.lastTone === "good" && T.tone === "good") wgt *= 0.6;
        cands.push({ key, f, wgt });
      }
      const pick = pickBy(rng, cands, x => x.wgt);
      const d = pick && makeDecision(c, pick.key, pick.f);
      if (d) { g.decisions.push(d); out.push(d); S.last = g.turn; S.lastTone = d.tone; S.recent[pick.key] = g.turn; }
    }
  }
  // rivals face their own troubles, and choose by their character
  for (const z of liveNations(g)) {
    if (z.isPlayer || rng() >= 0.1) continue;
    const c = decisionCtx(w, g, z.id, rng);
    if (!c.econ.cities.length) continue;
    const cands = [];
    for (const key in DECISIONS) {
      const T = DECISIONS[key];
      if (T.followOnly || key === "refugees") continue;
      const f = T.find(c);
      if (f) cands.push({ key, f, wgt: f.w * (T.tone === "bad" && z.stability < 30 ? 0.3 : 1) });
    }
    const pick = pickBy(rng, cands, x => x.wgt);
    const d = pick && makeDecision(c, pick.key, pick.f);
    if (!d) continue;
    const o = aiPickOption(c, d);
    decide(w, g, d, o.id, false);
    const text = `${d.title}: chose to ${o.label.charAt(0).toLowerCase()}${o.label.slice(1)}.`;
    noteFor(z, g, text, null);
    if (d.tone === "bad" || d.key === "goldrush") addChronicle(g, `${z.name}: ${text}`, d.tone === "bad" ? "warn" : "neutral", z.id);
    if (sharesBorder(g, PLAYER, z.id)) dispatch.abroad.push({ nid: z.id, text, why: null });
  }
  return out;
}


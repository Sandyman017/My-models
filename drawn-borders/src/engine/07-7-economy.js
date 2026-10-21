/* =====================================================================
   7. Economy (pure: reads the map, returns numbers and their reasons)
      Four sectors. People work the farms first, then the mines, plants and offices built in their
      town, and everyone else works in services. Goods move on one national market; a port or a
      trade partner opens the world market for what is missing or left over.
   ===================================================================== */
const GOODS = {
  food:        { label: "Food",           price: 1.0, unit: "M fed" },
  timber:      { label: "Timber",         price: 1.0 },
  metals:      { label: "Metals",         price: 1.6 },
  coal:        { label: "Coal",           price: 1.0 },
  oil:         { label: "Oil and gas",    price: 2.2 },
  gold:        { label: "Gold",           price: 3.0 },
  power:       { label: "Electricity",    price: 1.5, local: true },
  goods:       { label: "Consumer goods", price: 1.6 },
  machinery:   { label: "Machinery",      price: 2.6 },
  chemicals:   { label: "Chemicals",      price: 2.4 },
  electronics: { label: "Electronics",    price: 4.0 },
};
const GOOD_ORDER = ["food", "timber", "metals", "coal", "oil", "gold", "power", "goods", "machinery", "chemicals", "electronics"];

const SECTORS = {
  primary:    { label: "Primary",    blurb: "Farming, mining, oil, logging, fishing", color: "#9db262" },
  secondary:  { label: "Secondary",  blurb: "Manufacturing, construction, energy, food processing", color: "#d08a4a" },
  tertiary:   { label: "Tertiary",   blurb: "Trade, transport, finance, health, education, tourism", color: "#5d9fc4" },
  quaternary: { label: "Quaternary", blurb: "Technology, research, media, consulting", color: "#b07ad6" },
};

// Per level: workers (millions), value added per worker ($k a year), inputs and outputs (units a year).
const INDUSTRIES = {
  fishing:      { sector: "primary", sub: "Fishing", label: "Fishing fleet", workers: 0.04, va: 24, out: { food: 0.35 }, cap: "fish", costB: 3, seasons: 1,
                  does: "Feeds 350k people from the sea and frees farmland." },
  logging:      { sector: "primary", sub: "Forestry", label: "Logging camp", workers: 0.04, va: 22, out: { timber: 1 }, cap: "forest", costB: 2.5, seasons: 1,
                  does: "Timber for construction and light industry." },
  mine:         { sector: "primary", sub: "Mining", label: "Metal mine", workers: 0.05, va: 38, power: 0.05, out: { metals: 1 }, cap: "metals", costB: 5, seasons: 2,
                  does: "Metals for steel works, electronics, construction and weapons." },
  coalmine:     { sector: "primary", sub: "Mining", label: "Coal mine", workers: 0.05, va: 32, out: { coal: 1.2 }, cap: "coal", costB: 4, seasons: 2,
                  does: "Coal for power stations and steel works." },
  goldmine:     { sector: "primary", sub: "Mining", label: "Gold mine", workers: 0.04, va: 60, out: { gold: 0.6 }, cap: "gold", costB: 6, seasons: 2,
                  does: "Gold sold abroad, and reserves that steady your banks and lower interest." },
  oilfield:     { sector: "primary", sub: "Oil and gas", label: "Oil and gas field", workers: 0.02, va: 110, out: { oil: 1.4 }, cap: "oil", costB: 8, seasons: 2,
                  does: "Fuel for tanks, aircraft and power stations, and feedstock for chemicals." },
  power_coal:   { sector: "secondary", sub: "Energy", label: "Coal power station", workers: 0.02, va: 70, in: { coal: 0.8 }, out: { power: 2 }, costB: 6, seasons: 2,
                  does: "Electricity from coal." },
  power_gas:    { sector: "secondary", sub: "Energy", label: "Gas power station", workers: 0.02, va: 72, in: { oil: 0.6 }, out: { power: 2 }, costB: 6, seasons: 2,
                  does: "Electricity from oil and gas." },
  power_hydro:  { sector: "secondary", sub: "Energy", label: "Hydro dam", workers: 0.01, va: 80, out: { power: 1.5 }, cap: "hydro", costB: 9, seasons: 3,
                  does: "Electricity from mountain rivers. Needs no fuel." },
  power_nuclear:{ sector: "secondary", sub: "Energy", label: "Nuclear power station", workers: 0.02, va: 95, out: { power: 4.5 }, costB: 20, seasons: 4, tech: "nuclear", perNation: 3,
                  does: "Huge amounts of electricity with no fuel at all." },
  light:        { sector: "secondary", sub: "Manufacturing", label: "Textile and light industry", workers: 0.06, va: 36, in: { timber: 0.25 }, power: 0.15, out: { goods: 1 }, costB: 3, seasons: 1, urban: true,
                  does: "Clothes, furniture and household goods. Full shops keep people content." },
  foodproc:     { sector: "secondary", sub: "Food processing", label: "Food processing plant", workers: 0.04, va: 32, in: { food: 0.5 }, power: 0.1, out: { goods: 0.7 }, costB: 3, seasons: 1, urban: true,
                  does: "Turns surplus harvests into packaged food and keeps a reserve against famine." },
  heavy:        { sector: "secondary", sub: "Manufacturing", label: "Steel, machinery and motor works", workers: 0.06, va: 55, in: { metals: 0.6, coal: 0.4 }, power: 0.35, out: { machinery: 1 }, costB: 6, seasons: 2, urban: true,
                  does: "Machinery mechanizes farms, speeds construction and is the backbone of arms factories." },
  chemical:     { sector: "secondary", sub: "Manufacturing", label: "Chemical plant", workers: 0.04, va: 60, in: { oil: 0.6 }, power: 0.3, out: { chemicals: 1 }, costB: 6, seasons: 2, urban: true,
                  does: "Fertilizer for farms, medicine for hospitals, explosives for the army." },
  electronics:  { sector: "secondary", sub: "Manufacturing", label: "Electronics plant", workers: 0.05, va: 80, in: { metals: 0.3 }, power: 0.35, out: { electronics: 1 }, costB: 8, seasons: 2, urban: true, tech: "electronics", skill: 0.4,
                  does: "Radios, computers and avionics: needed by tech parks and aircraft factories." },
  resort:       { sector: "tertiary", sub: "Tourism", label: "Resort and hotels", workers: 0.04, va: 40, power: 0.05, cap: "scenery", costB: 4, seasons: 1,
                  does: "Visitors from abroad. Earns most in peace and stability; other nations warm to you." },
  university:   { sector: "quaternary", sub: "Research", label: "University", workers: 0.03, va: 36, power: 0.05, costB: 5, seasons: 2, urban: true, research: 2.5, state: true,
                  does: "Research for new technology and a more skilled workforce." },
  techpark:     { sector: "quaternary", sub: "Information technology", label: "Tech park", workers: 0.04, va: 80, power: 0.25, in: { electronics: 0.25 }, costB: 9, seasons: 2, urban: true, tech: "computing", skill: 0.55, research: 0.8,
                  does: "Software and computing. Raises productivity across all services and adds research." },
  broadcast:    { sector: "quaternary", sub: "Media", label: "Broadcasting network", workers: 0.02, va: 50, power: 0.1, costB: 6, seasons: 2, urban: true, tech: "media", perNation: 3,
                  does: "Radio, newspapers and television. Steadies the nation, softens war weariness, wins friends abroad." },
  business:     { sector: "quaternary", sub: "Consulting and management", label: "Business district", workers: 0.03, va: 70, power: 0.1, costB: 8, seasons: 2, urban: true, tech: "finance", minMarket: 5,
                  does: "Banks, consultants and head offices. Every industry runs more efficiently and projects cost less." },
};
const INDUSTRY_ORDER = ["fishing", "logging", "mine", "coalmine", "goldmine", "oilfield", "power_coal", "power_gas", "power_hydro", "power_nuclear",
  "light", "foodproc", "heavy", "chemical", "electronics", "resort", "university", "techpark", "broadcast", "business"];

const DEPOSITS = { 1: { key: "metals", label: "Metal ore" }, 2: { key: "coal", label: "Coal" }, 3: { key: "oil", label: "Oil and gas" }, 4: { key: "gold", label: "Gold" } };

const ECON7 = {
  workShare: 0.5,            // share of people who work
  farmLabor: 0.14,           // farm workers (M) per 1M people fed, before machinery
  farmValueB: 1.3,           // $B of value a year per 1M people fed
  serviceK: 22,              // $k a year per service worker before multipliers
  urbanLevelsPerM: 4,        // manufacturing and office levels a town can hold per million people
  isolatedRate: 0.6,         // industries cut off from the capital's road network
  importPremium: 0.25,
};


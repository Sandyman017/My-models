/* =====================================================================
   1. Constants
   ===================================================================== */
const GRID_W = 96;
const GRID_H = 64;
const N_CELLS = GRID_W * GRID_H;
const KM2_PER_CELL = 2500;
const SUB = 8;                                   // terrain pixels per cell when painting the map
const T = { SEA: 0, PLAINS: 1, FOREST: 2, HILLS: 3, MOUNTAIN: 4 };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const SAVE_KEY = "drawn-borders/save-v5";
const PLAYER = 0;

// Per cell: people living there at founding (millions), food it can grow (millions fed),
// raw materials for industry, and how hard it is to build a road across.
const TERRAIN = {
  [T.PLAINS]:   { name: "Plains",    density: 0.30,  food: 0.45, materials: 0, roadCost: 1, color: "#a9b96b" },
  [T.FOREST]:   { name: "Forest",    density: 0.10,  food: 0.15, materials: 2, roadCost: 2, color: "#557a45" },
  [T.HILLS]:    { name: "Hills",     density: 0.075, food: 0.12, materials: 2, roadCost: 3, color: "#a68d63" },
  [T.MOUNTAIN]: { name: "Mountains", density: 0.015, food: 0.03, materials: 3, roadCost: 6, color: "#8a7d73" },
};

const LIMITS = { minCells: 25, maxLandShare: 0.12 };

const FOUNDING = {
  stabilityBase: 60, compactRef: 0.6, compactWeight: 40, sizeThreshold: 180, sizePerPoint: 20,
  defenseBase: 50, ruggedWeight: 40, exposureWeight: 30,
};

const ECON = {
  baseOutputK: 8,              // $k output per person before bonuses
  industryMaxK: 4,             // full bonus at 2 units of materials per million people in a road network
  materialsForFull: 2,
  tradeMaxK: 6, tradeScaleM: 15,   // market bonus grows with the people reachable by road
  seaTradeK: 3,                // every region in a network with a port
  coastalFood: 0.08,
  irrigationBoost: 0.35,
  growthMax: 0.008, growthHeadroom: 0.3, famineFloor: -3,
  famineLine: 0.97,
  techBase: 0.0025, taxDrag: 0.03, unrestDrag: 0.0004, armyLaborDrag: 0.4, shockSd: 0.002,
  collectFloor: 0.6, collectFullAt: 70,
  interestBase: 0.05, interestRisk: 0.08, riskRef: 0.6, lendersCloseAt: 1.2,
  upkeepK: 90, recruitK: 120, armyAdjust: 0.25,
  roadUpkeepB: 0.012, portUpkeepB: 0.25,
  stabPull: 0.25, moodWeight: 150, moodCap: 8, famineWeight: 40,
  isolationEach: 1.5, isolationCap: 8, debtWeight: 25, lendersClosedStab: 5,
  startTreasuryShare: 0.12,
  futureFoodWeight: 0.3,
};

const BUILD = {
  roadUnitB: 2.0, roadEdgesPerSeason: 4, roadMaxReach: 18,
  townBaseB: 8, townPerCellB: 0.5, townMinSpacing: 4, townReach: 2, townClaimRadius: 2.6, wildPopShare: 0.25,
  portB: 12,
  irrigationBaseB: 6, irrigationPerPlainsB: 0.3, irrigationSeasons: 2, irrigationMinPlains: 3,
  creditFloorShare: -0.4,      // you can order projects until the treasury would fall below −40% of GDP
};

const TAX_LAWS = [
  { v: 15, label: "Low", stab: 6 },
  { v: 25, label: "Moderate", stab: 0 },
  { v: 35, label: "High", stab: -7 },
  { v: 45, label: "Harsh", stab: -15 },
];
const SERVICE_ORDER = ["minimal", "basic", "good", "generous"];
// Healthcare and welfare (the law's key is still "services").
const SERVICE_LAWS = {
  minimal:  { label: "Minimal",   costK: 0.5, stab: -6, growth: -0.002, prod: -0.04 },
  basic:    { label: "Basic",     costK: 1.2, stab: 0,  growth: 0,      prod: 0 },
  good:     { label: "Good",      costK: 2.0, stab: 4,  growth: 0.0015, prod: 0.03 },
  generous: { label: "Universal", costK: 3.0, stab: 7,  growth: 0.003,  prod: 0.05 },
};
const ARMY_ORDER = ["small", "standard", "large", "mobilized"];
// Conscription: the share of the population that may be called up to serve.
const ARMY_LAWS = {
  small:     { label: "Volunteers",    share: 0.0025, stab: 0 },
  standard:  { label: "Limited draft", share: 0.005,  stab: 0 },
  large:     { label: "Broad draft",   share: 0.01,   stab: -2 },
  mobilized: { label: "Total mobilization", share: 0.02, stab: -7 },
};

// You, four great powers, and four small states.
const NATION_COLORS = ["#d4503d", "#3a7fd9", "#c08af0", "#2fa59f", "#e0892e", "#e3cf5a", "#d6619e", "#8fd0ea", "#b9a27c"];

const ARCHETYPES = {
  expansionist: {
    label: "Expansionist", title: n => `${n} Dominion`,
    blurb: "Wants land above all. Settles wild territory fast and keeps a large army.",
    weights: { road: 0.8, town: 1.9, port: 0.6, irrigation: 0.8 },
    laws: { tax: 35, services: "basic", army: "large", arms: "medium", education: "basic", research: "low", trade: "balanced", finance: "balanced", granary: "small" },
  },
  mercantile: {
    label: "Mercantile", title: n => `Republic of ${n}`,
    blurb: "Lives by trade. Builds ports and roads first and keeps its people comfortable.",
    weights: { road: 1.6, town: 0.8, port: 1.9, irrigation: 0.7 },
    laws: { tax: 25, services: "good", army: "small", arms: "low", education: "good", research: "medium", trade: "free", finance: "loose", granary: "small" },
  },
  agrarian: {
    label: "Agrarian", title: n => `Kingdom of ${n}`,
    blurb: "A cautious farming kingdom. Irrigates its fields and keeps a modest army.",
    weights: { road: 1.0, town: 1.0, port: 0.5, irrigation: 1.9 },
    laws: { tax: 25, services: "basic", army: "standard", arms: "low", education: "basic", research: "low", trade: "balanced", finance: "strict", granary: "large" },
  },
  militarist: {
    label: "Militarist", title: n => `${n} Directorate`,
    blurb: "Ruled by generals. Heavy taxes pay for a large army; welfare comes last.",
    weights: { road: 1.2, town: 1.3, port: 0.6, irrigation: 0.7 },
    laws: { tax: 35, services: "minimal", army: "large", arms: "high", education: "basic", research: "medium", trade: "protect", finance: "balanced", granary: "medium" },
  },
};

const NAME_HEADS = ["Kar", "Vel", "Ost", "Dun", "Mar", "Sel", "Tor", "Ar", "Bel", "Cor", "Est", "Hal", "Lun", "Nor", "Ryn", "Sav", "Tal", "Val", "Zor", "Mer", "Ash", "Bryn", "Cal", "Dor", "Fen", "Gal", "Kel", "Lor", "Pel", "Ser", "Thal", "Vor", "Ister", "Mol", "Quen", "Rav"];
const NAME_TAILS = ["a", "en", "ia", "or", "ar", "is", "um", "eth", "wyn", "ova", "ane", "ica", "ard", "mere", "hold", "ford", "stad", "grad", "burg", "mark", "ven", "dale", "port", "ton", "via", "esh"];
const PLAYER_NAMES = ["Velmora", "Kestrel Republic", "Dunmark", "Arvenna", "Saltmere", "Corvane", "Highreach", "Ostmark Union"];
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];


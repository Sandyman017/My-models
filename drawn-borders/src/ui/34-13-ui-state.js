/* =====================================================================
   13. UI state
   ===================================================================== */
const ui = {
  phase: "draw",          // "draw" → "play" → "collapsed"
  seed: 0,
  drawCells: null,
  drawCellSet: null,
  preview: null,
  name: "",
  error: null,
  note: null,
  tab: "realm",
  tool: "select",          // "select" | "road" | "town"
  roadFrom: null,          // city id where a road starts
  pending: null,           // a quote awaiting confirmation
  hoverCell: -1,
  hoverQuote: null,
  selectedCity: null,
  selectedCell: -1,
  selectedVillage: null,   // a village's page is open (16n)
  provColor: "own",        // what the Provinces panel colours the map by (16m)
  hoverXY: null,           // the map point under the mouse, in cells
  resView: false,
  dispatch: null,
  confirmRestart: false,
  compose: null,           // letter being written
  composeDirty: false,
  confirmWar: null,
  confirmCancel: null,
  minds: "claude",         // "claude" or "rules"
  mindsBlocked: false,
  mindsNote: null,
  waiting: false,
  ending: false,
  skipWait: null,
  play: null,              // a season being played out on the map
  lastPlayback: null,
  sel: [],                 // selected division ids
  press: null,             // where a left click started, to tell clicks from box drags
  box: null,               // selection box being dragged, in map pixels
  hoverPath: null,
  raiseCity: null,
  confirmDisband: false,
  fleetSel: [],            // selected fleet ids
  fleetHover: null,        // a fleet's route under the mouse
};
let world = null;
let game = null;
let drawingPath = null;


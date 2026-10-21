/* =====================================================================
   12. Formatting
   ===================================================================== */
function fmtArea(cells) { return `${(cells * KM2_PER_CELL).toLocaleString("en-US")} km²`; }
function fmtPop(m) { return `${m.toFixed(1)}M`; }
function fmtMoney(b) {
  const a = Math.abs(b);
  const s = a < 100 ? a.toFixed(1) : Math.round(a).toLocaleString("en-US");
  return `${b < 0 ? "−" : ""}$${s}B`;
}
function fmtSignedMoney(b) { return b >= 0 ? `+${fmtMoney(b)}` : fmtMoney(b); }
function fmtCount(n) { return Math.round(n).toLocaleString("en-US"); }
function pct(x) { return `${Math.round(x * 100)}%`; }
function signedPct(x, digits = 2) {
  const v = (Math.abs(x) * 100).toFixed(digits);
  if (Number(v) === 0) return `±${v}%`;
  return x > 0 ? `+${v}%` : `−${v}%`;
}
function signed(n) { const r = Math.round(n); return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "±0"; }
function signed1(n) { const v = Math.abs(n).toFixed(1); return v === "0.0" ? "±0.0" : n > 0 ? `+${v}` : `−${v}`; }
function toneOf(n, eps = 0) { return n > eps ? "good" : n < -eps ? "bad" : "neutral"; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); }
function cleanName(raw) { return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 32) || "Unnamed Nation"; }
function seasonLabel(turn) { return `${SEASONS[turn % 4]}, Year ${Math.floor(turn / 4) + 1}`; }



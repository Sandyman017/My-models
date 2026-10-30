/* What the game's engine needs from its host that a bare JavaScript engine (V8 inside Unity) may lack.
   It runs before the engine in the bundle (Tools/js-engine/bundle.js). Each piece is used only when the host has none of its
   own, so in a browser or Node nothing changes; globalThis.__polyfilled lists the pieces that were used. */
(function (G) {
  const used = G.__polyfilled = [];
  const force = Object.assign(Object.create(null), G.__forcePolyfill);   // the Node check sets this to test the stand-ins against the real thing

  if (typeof G.console === "undefined") {
    const quiet = () => {};
    G.console = { log: quiet, info: quiet, warn: quiet, error: quiet, debug: quiet };
    used.push("console");
  }

  // Numbers written the American way, as the engine asks with x.toLocaleString("en-US"): groups of three, at most 3 decimals.
  // Like the browser (ICU), it rounds the shortest decimal that reads back as x (String(x)), half away from zero:
  // 1.0005 gives "1.001", although the double is a hair under 1.0005. A negative number that rounds to 0 gives "-0".
  function enUS(x) {
    if (Number.isNaN(x)) return "NaN";
    const neg = x < 0 || Object.is(x, -0);
    x = Math.abs(x);
    if (x === Infinity) return (neg ? "-" : "") + "∞";
    const [mant, exp = "0"] = String(x).split("e");
    const [a, b = ""] = mant.split(".");
    let digits = a + b, point = a.length + Number(exp);   // the decimal point sits after `point` digits
    if (point < 1) { digits = "0".repeat(1 - point) + digits; point = 1; }
    if (point > digits.length) digits += "0".repeat(point - digits.length);
    let whole = digits.slice(0, point), frac = digits.slice(point);
    if (frac.length > 3) {
      const up = frac.charCodeAt(3) >= 53;   // "5"
      frac = frac.slice(0, 3);
      if (up) {
        const d = (whole + frac).split("");
        let i = d.length - 1;
        while (i >= 0 && d[i] === "9") d[i--] = "0";
        if (i < 0) d.unshift("1"); else d[i] = String(Number(d[i]) + 1);
        whole = d.slice(0, d.length - 3).join("");
        frac = d.slice(d.length - 3).join("");
      }
    }
    frac = frac.replace(/0+$/, "");
    whole = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + whole + (frac ? "." + frac : "");
  }
  G.__enUS = enUS;
  if (force.toLocaleString || (1234567.8915).toLocaleString("en-US") !== "1,234,567.892") {
    const native = Number.prototype.toLocaleString;
    Number.prototype.toLocaleString = function (locales, options) {
      return options === undefined ? enUS(Number(this)) : native.call(this, locales, options);
    };
    used.push("toLocaleString");
  }

  // A deep copy of plain data (the engine does not use it today; the Node tests give their engine one).
  if (force.structuredClone || typeof G.structuredClone !== "function") {
    G.structuredClone = function structuredClone(value) {
      const seen = new Map();
      const copy = v => {
        if (v === null || typeof v !== "object") return v;
        if (seen.has(v)) return seen.get(v);
        let out;
        if (Array.isArray(v)) { out = []; seen.set(v, out); for (let i = 0; i < v.length; i++) out[i] = copy(v[i]); return out; }
        if (ArrayBuffer.isView(v)) { out = v.slice(); seen.set(v, out); return out; }
        if (v instanceof Date) { out = new Date(v.getTime()); seen.set(v, out); return out; }
        if (v instanceof Map) { out = new Map(); seen.set(v, out); for (const [k, x] of v) out.set(copy(k), copy(x)); return out; }
        if (v instanceof Set) { out = new Set(); seen.set(v, out); for (const x of v) out.add(copy(x)); return out; }
        out = {}; seen.set(v, out);
        for (const k of Object.keys(v)) out[k] = copy(v[k]);
        return out;
      };
      return copy(value);
    };
    used.push("structuredClone");
  }
})(globalThis);

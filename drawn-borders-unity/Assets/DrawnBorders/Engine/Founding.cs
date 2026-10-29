// What your borders give you, as in the web game's founding preview (ui section 15) and town placing (engine 5).
// The full economy has not moved to Unity yet, so the preview shows what the land itself decides:
// area, people, farmland, towns, deposits, coast, shape, stability and defense.
using System;
using System.Collections.Generic;
using System.Globalization;

namespace DrawnBorders.Engine
{
    public enum Tone { Good, Neutral, Bad }

    public sealed class Factor { public string Text, Effect; public Tone Tone; }

    public sealed class Town { public int Cell; public string Name; public bool Capital; }

    public sealed class FoundingPreview
    {
        public int Area;
        public double People;        // millions
        public double Farmland;      // millions the land can feed
        public List<Town> Towns = new List<Town>();
        public ShapeTraits Traits;
        public int Materials, CoastalCells, OceanCells;
        public int[] Counts = new int[5];      // by terrain
        public int[] Deposits = new int[5];    // by deposit type
        public int Rivers;                     // cells with a river (class 2+)

        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static FoundingPreview Make(World w, List<int> cells)
        {
            var p = new FoundingPreview { Area = cells.Count, Traits = Borders.Traits(w, cells) };
            double people = 0;
            foreach (int c in cells)
            {
                people += (float)w.CellDensity(c);   // the web game keeps people per cell as 32-bit numbers
                p.Farmland += w.CellFood(c);
                p.Materials += Rules.Info(w.Terrain[c]).Materials;
                if (w.Coastal[c] != 0) p.CoastalCells++;
                if (w.Sea.BeachSeaCell(w, c) >= 0) p.OceanCells++;
                p.Counts[(int)w.Terrain[c]]++;
                if (w.Dep[c] != 0) p.Deposits[w.Dep[c]]++;
                if (w.Rivers.Cells[c] >= 2) p.Rivers++;
            }
            p.People = people;
            p.Towns = PlaceTowns(w, cells, new Rng(7));
            return p;
        }

        static double FoodWithin(World w, HashSet<int> own, int cell, double r)
        {
            double food = 0;
            int cx = Rules.CellX(cell), cy = Rules.CellY(cell), R = (int)Math.Ceiling(r);
            for (int dy = -R; dy <= R; dy++) for (int dx = -R; dx <= R; dx++)
            {
                int x = cx + dx, y = cy + dy;
                if (!Rules.InBounds(x, y) || dx * dx + dy * dy > r * r) continue;
                int i = Rules.Idx(x, y);
                if (!own.Contains(i)) continue;
                food += w.CellFood(i);
            }
            return food;
        }

        /// <summary>A capital near the middle and towns on the best farmland, spread apart.</summary>
        public static List<Town> PlaceTowns(World w, List<int> cells, Rng rng)
        {
            double mx = 0, my = 0;
            foreach (int c in cells) { mx += Rules.CellX(c); my += Rules.CellY(c); }
            mx /= cells.Count; my /= cells.Count;
            var own = new HashSet<int>(cells);
            Func<int, double> score = c => FoodWithin(w, own, c, 2.2) + (w.Sea.PortSeaCell(c) >= 0 ? 1.2 : 0) + (w.RiverGeo.Nav[c] >= 0 ? 0.6 : 0);
            var scores = new Dictionary<int, double>();
            foreach (int c in cells) scores[c] = score(c);
            int capital = cells[0]; double best = double.NegativeInfinity;
            foreach (int c in cells)
            {
                double dx = Rules.CellX(c) - mx, dy = Rules.CellY(c) - my;
                double s = scores[c] - 0.35 * Math.Sqrt(dx * dx + dy * dy);
                if (s > best) { best = s; capital = c; }
            }
            var sites = new List<int> { capital };
            int count = Noise.Clamp(cells.Count / 40, 2, 5);
            while (sites.Count < count)
            {
                int pickCell = -1; double pickScore = double.NegativeInfinity;
                foreach (int c in cells)
                {
                    double nearest = double.PositiveInfinity;
                    foreach (int s in sites) nearest = Math.Min(nearest, Rules.Dist(s, c));
                    if (nearest < 5) continue;
                    double sc = scores[c] + 0.25 * Math.Min(nearest, 10);
                    if (sc > pickScore) { pickScore = sc; pickCell = c; }
                }
                if (pickCell < 0) break;
                sites.Add(pickCell);
            }
            var used = new HashSet<string>();
            var towns = new List<Town>();
            for (int k = 0; k < sites.Count; k++)
            {
                string name = null;
                for (int t = 0; t < 200 && name == null; t++)
                {
                    string n = rng.Pick(Rules.NameHeads) + rng.Pick(Rules.NameTails);
                    if (used.Add(n)) name = n;
                }
                towns.Add(new Town { Cell = sites[k], Name = name ?? "New Town " + (used.Count + 1), Capital = k == 0 });
            }
            return towns;
        }

        public static string FmtPop(double m) { return m.ToString("0.0", Inv) + "M"; }
        public static string Pct(double x) { return Noise.JsRound(x * 100).ToString(Inv) + "%"; }
        public static string Signed(double n) { int r = Noise.JsRound(n); return r > 0 ? "+" + r : r < 0 ? "−" + Math.Abs(r) : "±0"; }
        static Tone ToneOf(double n) { return n > 0 ? Tone.Good : n < 0 ? Tone.Bad : Tone.Neutral; }

        /// <summary>The list under "What your borders give you", worded as in the web game.</summary>
        public List<Factor> Factors()
        {
            var f = new List<Factor>();
            double room = Farmland / People - 1;
            f.Add(new Factor { Text = "Farmland can feed " + Farmland.ToString("0.0", Inv) + "M; " + People.ToString("0.0", Inv) + "M live here now", Effect = room > 0 ? "room to grow " + Pct(room) : "already crowded", Tone = room > 0.2 ? Tone.Good : Tone.Bad });
            var dep = Deposits;
            var found = new List<string>();
            for (int k = 1; k <= 4; k++) if (dep[k] > 0) found.Add(dep[k] + " " + Rules.DepositNames[k]);
            bool heavy = dep[1] > 0 && (dep[2] > 0 || dep[3] > 0), fuel = dep[2] > 0 || dep[3] > 0;
            f.Add(new Factor { Text = found.Count > 0 ? "Deposits: " + string.Join(", ", found) : "No mineral, coal or oil deposits", Effect = heavy ? "can build heavy industry" : fuel ? "has fuel for power" : "must import", Tone = heavy ? Tone.Good : fuel ? Tone.Neutral : Tone.Bad });
            int forest = Counts[(int)Terrain.Forest];
            f.Add(new Factor { Text = forest > 0 ? forest + " forest cells for timber" : "No forest for timber", Effect = forest >= 6 ? "logging" : "little timber", Tone = forest >= 6 ? Tone.Good : Tone.Bad });
            if (OceanCells > 0) f.Add(new Factor { Text = OceanCells + " cells on the open sea: harbors, sea trade, fishing and a navy", Effect = "can reach the world by sea", Tone = Tone.Good });
            else if (CoastalCells > 0) f.Add(new Factor { Text = "Coast only on a lake: fishing, but ships from the sea can't reach it", Effect = "no sea harbor", Tone = Tone.Bad });
            else f.Add(new Factor { Text = "Landlocked: no fishing, harbors or ships", Effect = "no sea trade", Tone = Tone.Bad });
            var t = Traits;
            f.Add(new Factor { Text = t.ShapeTerm >= 0 ? "Compact shape is easy to govern" : "Stretched shape is hard to govern", Effect = Signed(t.ShapeTerm) + " stability", Tone = ToneOf(t.ShapeTerm) });
            if (t.SizeTerm < 0) f.Add(new Factor { Text = "Large territory strains your administration", Effect = Signed(t.SizeTerm) + " stability", Tone = Tone.Bad });
            if (t.RuggedTerm > 0) f.Add(new Factor { Text = "Hills and mountains guard your border", Effect = Signed(t.RuggedTerm) + " defense", Tone = Tone.Good });
            f.Add(new Factor { Text = t.Shape.LandBorder == 0 ? "An island: no land border" : t.ExposureTerm < 0 ? "Long land border to defend" : "Short land border", Effect = Signed(t.ExposureTerm) + " defense", Tone = ToneOf(t.ExposureTerm) });
            return f;
        }

        /// <summary>The web game's "Try a sample shape": a wobbly oval on good land.</summary>
        public static List<Pt> SampleShape(World w, uint seed, out Claim claim)
        {
            var rng = new Rng(seed);
            for (int tries = 0; tries < 400; tries++)
            {
                double cx = 8 + rng.Next() * (Rules.GridW - 16), cy = 7 + rng.Next() * (Rules.GridH - 14);
                double rx = 6 + rng.Next() * 4, ry = 4.5 + rng.Next() * 3;
                var pts = new List<Pt>();
                for (int k = 0; k < 28; k++)
                {
                    double a = (k / 28.0) * Math.PI * 2, wobble = 0.82 + 0.36 * rng.Next();
                    pts.Add(new Pt(cx + Math.Cos(a) * rx * wobble, cy + Math.Sin(a) * ry * wobble));
                }
                var res = Borders.ClaimFromPath(w, pts);
                if (res.Ok && res.DroppedCells < 4 && res.Cells.Count >= 70) { claim = res; return pts; }
            }
            claim = new Claim { Error = "Couldn't find a good sample spot on this world. Draw by hand or try a new world." };
            return null;
        }
    }
}

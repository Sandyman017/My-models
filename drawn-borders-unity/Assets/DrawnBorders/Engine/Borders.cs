// Drawing your borders, as in the web game (engine section 4): the loop you draw becomes land cells,
// and the shape of that land sets your starting stability and defense.
using System;
using System.Collections.Generic;

namespace DrawnBorders.Engine
{
    public struct Pt { public double X, Y; public Pt(double x, double y) { X = x; Y = y; } }

    public sealed class Claim
    {
        public bool Ok; public string Error;
        public List<int> Cells; public int DroppedCells;
    }

    public sealed class ShapeMeasure
    {
        public int Area, Coast, LandBorder;
        public double Compactness, RuggedBorderShare, Exposure;
    }

    public sealed class ShapeTraits
    {
        public ShapeMeasure Shape;
        public int ShapeTerm, SizeTerm, RuggedTerm, ExposureTerm, Base, Stability, Defense;
    }

    public static class Borders
    {
        public static bool PointInPolygon(double px, double py, IList<Pt> pts)
        {
            bool inside = false;
            for (int i = 0, j = pts.Count - 1; i < pts.Count; j = i++)
            {
                double xi = pts[i].X, yi = pts[i].Y, xj = pts[j].X, yj = pts[j].Y;
                if ((yi > py) != (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
            }
            return inside;
        }

        public static List<int> LandCellsInsidePath(World w, IList<Pt> pts)
        {
            double minX = double.MaxValue, maxX = double.MinValue, minY = double.MaxValue, maxY = double.MinValue;
            foreach (var p in pts) { minX = Math.Min(minX, p.X); maxX = Math.Max(maxX, p.X); minY = Math.Min(minY, p.Y); maxY = Math.Max(maxY, p.Y); }
            int x0 = Math.Max(0, (int)Math.Floor(minX)), x1 = Math.Min(Rules.GridW - 1, (int)Math.Ceiling(maxX));
            int y0 = Math.Max(0, (int)Math.Floor(minY)), y1 = Math.Min(Rules.GridH - 1, (int)Math.Ceiling(maxY));
            var cells = new List<int>();
            for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++)
            {
                int i = Rules.Idx(x, y);
                if (w.IsLand(i) && PointInPolygon(x + 0.5, y + 0.5, pts)) cells.Add(i);
            }
            return cells;
        }

        public static List<int> LargestConnectedGroup(List<int> cells)
        {
            var set = new HashSet<int>(cells); var seen = new HashSet<int>();
            var best = new List<int>();
            var queue = new Stack<int>();
            foreach (int start in cells)
            {
                if (seen.Contains(start)) continue;
                var group = new List<int>();
                queue.Push(start); seen.Add(start);
                while (queue.Count > 0)
                {
                    int c = queue.Pop();
                    group.Add(c);
                    foreach (var d in Rules.Dirs4)
                    {
                        int nx = Rules.CellX(c) + d[0], ny = Rules.CellY(c) + d[1];
                        if (!Rules.InBounds(nx, ny)) continue;
                        int k = Rules.Idx(nx, ny);
                        if (set.Contains(k) && !seen.Contains(k)) { seen.Add(k); queue.Push(k); }
                    }
                }
                if (group.Count > best.Count) best = group;
            }
            return best;
        }

        public static string FmtArea(int cells) { return (cells * Rules.Km2PerCell).ToString("N0", System.Globalization.CultureInfo.InvariantCulture) + " km²"; }

        public static Claim ClaimFromPath(World w, IList<Pt> pts)
        {
            if (pts.Count < 6) return new Claim { Error = "Draw a larger loop: press, drag around an area, and release." };
            var inside = LandCellsInsidePath(w, pts);
            if (inside.Count == 0) return new Claim { Error = "Your borders contain no land. Draw over the continent, not the sea." };
            var main = LargestConnectedGroup(inside);
            if (main.Count < Rules.MinCells) return new Claim { Error = "Too small: " + FmtArea(main.Count) + ". A nation needs at least " + FmtArea(Rules.MinCells) + "." };
            if (main.Count > w.MaxCells()) return new Claim { Error = "Too large: " + FmtArea(main.Count) + ". Leave room for two rivals and wild land. The limit here is " + FmtArea(w.MaxCells()) + "." };
            main.Sort();
            return new Claim { Ok = true, Cells = main, DroppedCells = inside.Count - main.Count };
        }

        public static ShapeMeasure MeasureShape(World w, List<int> cells)
        {
            var set = new HashSet<int>(cells);
            int coast = 0, landBorder = 0, borderCells = 0, rugged = 0;
            foreach (int c in cells)
            {
                bool onBorder = false;
                foreach (var d in Rules.Dirs4)
                {
                    int nx = Rules.CellX(c) + d[0], ny = Rules.CellY(c) + d[1];
                    if (w.IsSeaXY(nx, ny)) coast++;
                    else if (!set.Contains(Rules.Idx(nx, ny))) { landBorder++; onBorder = true; }
                }
                if (onBorder) { borderCells++; if (w.Terrain[c] >= Terrain.Hills) rugged++; }
            }
            int area = cells.Count, perimeter = coast + landBorder;
            return new ShapeMeasure
            {
                Area = area, Coast = coast, LandBorder = landBorder,
                Compactness = Math.Min(1, (16.0 * area) / ((double)perimeter * perimeter)),
                RuggedBorderShare = borderCells > 0 ? (double)rugged / borderCells : 0,
                Exposure = landBorder / (4 * Math.Sqrt(area)),
            };
        }

        public static ShapeTraits Traits(World w, List<int> cells)
        {
            var s = MeasureShape(w, cells);
            int shapeTerm = Noise.JsRound((s.Compactness - Rules.CompactRef) * Rules.CompactWeight);
            int sizeTerm = -Noise.JsRound(Math.Max(0, s.Area - Rules.SizeThreshold) / Rules.SizePerPoint);
            int ruggedTerm = Noise.JsRound(Rules.RuggedWeight * s.RuggedBorderShare);
            int exposureTerm = Noise.JsRound(-Rules.ExposureWeight * (s.Exposure - 0.5));
            return new ShapeTraits
            {
                Shape = s, ShapeTerm = shapeTerm, SizeTerm = sizeTerm, RuggedTerm = ruggedTerm, ExposureTerm = exposureTerm,
                Base = (int)Rules.StabilityBase + shapeTerm,
                Stability = Noise.Clamp((int)Rules.StabilityBase + shapeTerm + sizeTerm, 10, 95),
                Defense = Noise.Clamp((int)Rules.DefenseBase + ruggedTerm + exposureTerm, 5, 95),
            };
        }
    }
}

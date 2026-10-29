// The world: terrain from continuous noise (web engine sections 1 and 3) and the land's deposits (7c).
using System;
using System.Collections.Generic;

namespace DrawnBorders.Engine
{
    public enum Terrain : byte { Sea = 0, Plains = 1, Forest = 2, Hills = 3, Mountain = 4 }

    public sealed class TerrainInfo
    {
        public string Name; public double Density, Food; public int Materials; public string Color;
        public TerrainInfo(string name, double density, double food, int materials, string color)
        { Name = name; Density = density; Food = food; Materials = materials; Color = color; }
    }

    public static class Rules
    {
        public const int GridW = 96, GridH = 64, NCells = GridW * GridH;
        public const int Km2PerCell = 2500;
        public const int Player = 0;
        public const double MaxLandShare = 0.12;
        public const int MinCells = 25;
        public const double CoastalFood = 0.08;

        public static readonly int[][] Dirs4 = { new[] { 1, 0 }, new[] { -1, 0 }, new[] { 0, 1 }, new[] { 0, -1 } };
        public static readonly int[][] Dirs8 = { new[] { 1, 0 }, new[] { -1, 0 }, new[] { 0, 1 }, new[] { 0, -1 }, new[] { 1, 1 }, new[] { 1, -1 }, new[] { -1, 1 }, new[] { -1, -1 } };

        static readonly TerrainInfo[] terrains =
        {
            new TerrainInfo("Sea", 0, 0, 0, "#22677f"),
            new TerrainInfo("Plains", 0.30, 0.45, 0, "#a9b96b"),
            new TerrainInfo("Forest", 0.10, 0.15, 2, "#557a45"),
            new TerrainInfo("Hills", 0.075, 0.12, 2, "#a68d63"),
            new TerrainInfo("Mountains", 0.015, 0.03, 3, "#8a7d73"),
        };
        public static TerrainInfo Info(Terrain t) { return terrains[(int)t]; }

        // Founding: shape → stability and defense.
        public const double StabilityBase = 60, CompactRef = 0.6, CompactWeight = 40, SizeThreshold = 180, SizePerPoint = 20;
        public const double DefenseBase = 50, RuggedWeight = 40, ExposureWeight = 30;

        public static readonly string[] NameHeads = { "Kar", "Vel", "Ost", "Dun", "Mar", "Sel", "Tor", "Ar", "Bel", "Cor", "Est", "Hal", "Lun", "Nor", "Ryn", "Sav", "Tal", "Val", "Zor", "Mer", "Ash", "Bryn", "Cal", "Dor", "Fen", "Gal", "Kel", "Lor", "Pel", "Ser", "Thal", "Vor", "Ister", "Mol", "Quen", "Rav" };
        public static readonly string[] NameTails = { "a", "en", "ia", "or", "ar", "is", "um", "eth", "wyn", "ova", "ane", "ica", "ard", "mere", "hold", "ford", "stad", "grad", "burg", "mark", "ven", "dale", "port", "ton", "via", "esh" };
        public static readonly string[] PlayerNames = { "Velmora", "Kestrel Republic", "Dunmark", "Arvenna", "Saltmere", "Corvane", "Highreach", "Ostmark Union" };
        public static readonly string[] NationColors = { "#d4503d", "#3a7fd9", "#c08af0", "#2fa59f", "#e0892e", "#e3cf5a", "#d6619e", "#8fd0ea", "#b9a27c" };

        // Deposits: 1 metal ore, 2 coal, 3 oil and gas, 4 gold.
        public static readonly string[] DepositNames = { "", "metal ore", "coal", "oil and gas", "gold" };
        public static readonly string[] DepositLabels = { "", "Metal ore", "Coal", "Oil and gas", "Gold" };

        public static int Idx(int x, int y) { return y * GridW + x; }
        public static int CellX(int i) { return i % GridW; }
        public static int CellY(int i) { return i / GridW; }
        public static bool InBounds(int x, int y) { return x >= 0 && y >= 0 && x < GridW && y < GridH; }
        public static double Dist(int a, int b) { double dx = CellX(a) - CellX(b), dy = CellY(a) - CellY(b); return Math.Sqrt(dx * dx + dy * dy); }
    }

    public sealed class World
    {
        public int Seed;
        public float SeaLevel, HillLevel, MountainLevel;
        public double MoistLevel = 0.53;
        public Terrain[] Terrain = new Terrain[Rules.NCells];
        public byte[] Coastal = new byte[Rules.NCells];
        public byte[] Dep = new byte[Rules.NCells];   // visible deposits
        public byte[] Hid = new byte[Rules.NCells];   // deeper finds, not shown at founding
        public int LandCount;

        RiverField rivers; SeaGeo sea; RiverGeo riverGeo;
        public RiverField Rivers { get { return rivers ?? (rivers = RiverField.Build(this)); } }
        public SeaGeo Sea { get { return sea ?? (sea = SeaGeo.Build(this)); } }
        public RiverGeo RiverGeo { get { return riverGeo ?? (riverGeo = RiverGeo.Build(this)); } }

        public static double ElevationAt(int seed, double x, double y)
        {
            double nx = (x / Rules.GridW) * 2 - 1, ny = (y / Rules.GridH) * 2 - 1;
            double radial = Math.Sqrt(nx * nx * 0.85 + ny * ny);
            double edge = Math.Max(Math.Abs(nx), Math.Abs(ny));
            double edgeFall = edge > 0.88 ? (edge - 0.88) * 6 : 0;
            return Noise.Fbm(x / 13, y / 13, seed) - 0.6 * Math.Pow(radial, 2.4) - edgeFall;
        }
        public static double MoistureAt(int seed, double x, double y) { return Noise.Fbm(x / 8, y / 8, seed + 977, 3); }

        static float Percentile(List<float> values, double p)
        {
            var sorted = values.ToArray();
            Array.Sort(sorted);
            return sorted[(int)Math.Floor(p * (sorted.Length - 1))];
        }

        Terrain Classify(float e, double m)
        {
            if (e <= SeaLevel) return Engine.Terrain.Sea;
            if (e >= MountainLevel) return Engine.Terrain.Mountain;
            if (e >= HillLevel) return Engine.Terrain.Hills;
            return m > MoistLevel ? Engine.Terrain.Forest : Engine.Terrain.Plains;
        }

        public static World Generate(int seed)
        {
            var w = new World { Seed = seed };
            var elev = new float[Rules.NCells];
            var all = new List<float>(Rules.NCells);
            for (int i = 0; i < Rules.NCells; i++)
            {
                elev[i] = (float)ElevationAt(seed, Rules.CellX(i) + 0.5, Rules.CellY(i) + 0.5);
                all.Add(elev[i]);
            }
            w.SeaLevel = Percentile(all, 0.42);
            var land = new List<float>();
            foreach (var e in all) if (e > w.SeaLevel) land.Add(e);
            w.HillLevel = Percentile(land, 0.79);
            w.MountainLevel = Percentile(land, 0.93);
            for (int i = 0; i < Rules.NCells; i++)
            {
                int x = Rules.CellX(i), y = Rules.CellY(i);
                bool edge = x < 1 || y < 1 || x >= Rules.GridW - 1 || y >= Rules.GridH - 1;
                w.Terrain[i] = edge ? Engine.Terrain.Sea : w.Classify(elev[i], MoistureAt(seed, x + 0.5, y + 0.5));
                if (w.Terrain[i] != Engine.Terrain.Sea) w.LandCount++;
            }
            w.PlaceDeposits();
            for (int i = 0; i < Rules.NCells; i++)
            {
                if (w.Terrain[i] == Engine.Terrain.Sea) continue;
                bool c = false;
                foreach (var d in Rules.Dirs4) if (w.IsSeaXY(Rules.CellX(i) + d[0], Rules.CellY(i) + d[1])) { c = true; break; }
                w.Coastal[i] = (byte)(c ? 1 : 0);
            }
            return w;
        }

        public bool IsSeaXY(int x, int y) { return !Rules.InBounds(x, y) || Terrain[Rules.Idx(x, y)] == Engine.Terrain.Sea; }
        public bool IsLand(int i) { return Terrain[i] != Engine.Terrain.Sea; }

        /// <summary>Food a cell grows (millions fed), before any irrigation.</summary>
        public double CellFood(int i)
        {
            var t = Terrain[i];
            if (t == Engine.Terrain.Sea) return 0;
            double f = Rules.Info(t).Food;
            if (Coastal[i] != 0) f += Rules.CoastalFood;
            return f;
        }
        /// <summary>People living in a cell at founding (millions).</summary>
        public double CellDensity(int i)
        {
            var t = Terrain[i];
            return t == Engine.Terrain.Sea ? 0 : Rules.Info(t).Density + (Coastal[i] != 0 ? 0.04 : 0);
        }
        public int MaxCells() { return (int)Math.Floor(LandCount * Rules.MaxLandShare); }

        struct Cand { public int I; public double V; }

        void Pick(List<Cand> cands, double share, int min, double hiddenShare, byte type)
        {
            // the web game's sort is stable: equal values keep their order (by cell)
            cands.Sort((p, q) => p.V != q.V ? q.V.CompareTo(p.V) : p.I.CompareTo(q.I));
            int n = Math.Max(min, Noise.JsRound(cands.Count * share));
            int k = 0, placed = 0;
            for (; k < cands.Count && placed < n; k++) if (Dep[cands[k].I] == 0) { Dep[cands[k].I] = type; placed++; }
            int nh = Noise.JsRound(n * hiddenShare), hidden = 0;
            for (; k < cands.Count && hidden < nh; k++)
            {
                int i = cands[k].I;
                if (Dep[i] != 0 || Hid[i] != 0 || Noise.Hash2(i, type, Seed + 77) < 0.35) continue;
                Hid[i] = type; hidden++;
            }
        }

        void PlaceDeposits()
        {
            var metals = new List<Cand>(); var coal = new List<Cand>(); var oil = new List<Cand>(); var gold = new List<Cand>();
            for (int i = 0; i < Rules.NCells; i++)
            {
                var t = Terrain[i];
                if (t == Engine.Terrain.Sea) continue;
                double x = Rules.CellX(i) + 0.5, y = Rules.CellY(i) + 0.5;
                // (the coast is not known yet here, as in the web game: Coastal is all 0)
                bool coastal = Coastal[i] != 0;
                if (t == Engine.Terrain.Hills || t == Engine.Terrain.Mountain || t == Engine.Terrain.Forest)
                    metals.Add(new Cand { I = i, V = Noise.Fbm(x / 3.5, y / 3.5, Seed + 501, 2) + (t == Engine.Terrain.Mountain ? 0.08 : t == Engine.Terrain.Hills ? 0.05 : 0) });
                if (t == Engine.Terrain.Hills || t == Engine.Terrain.Forest)
                    coal.Add(new Cand { I = i, V = Noise.Fbm(x / 4, y / 4, Seed + 502, 2) + (t == Engine.Terrain.Hills ? 0.08 : 0) });
                if (t == Engine.Terrain.Plains || (t == Engine.Terrain.Forest && coastal))
                    oil.Add(new Cand { I = i, V = Noise.Fbm(x / 5, y / 5, Seed + 503, 2) + (coastal ? 0.04 : 0) });
                if (t == Engine.Terrain.Mountain || t == Engine.Terrain.Hills)
                    gold.Add(new Cand { I = i, V = Noise.Fbm(x / 2.5, y / 2.5, Seed + 504, 2) + (t == Engine.Terrain.Mountain ? 0.1 : 0) });
            }
            Pick(metals, 0.07, 6, 0.7, 1);
            Pick(coal, 0.08, 6, 0.6, 2);
            Pick(oil, 0.035, 4, 0.8, 3);
            Pick(gold, 0.05, 2, 0.9, 4);
        }
    }
}

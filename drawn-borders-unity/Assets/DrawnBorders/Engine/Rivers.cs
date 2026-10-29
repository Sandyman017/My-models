// Rivers and the open sea, as in the web game (engine 11e riverField, 10k riverGeo and seaGeo).
using System;
using System.Collections.Generic;

namespace DrawnBorders.Engine
{
    /// <summary>Rain runs downhill to the sea on a grid 4× finer than the cells.</summary>
    public sealed class RiverField
    {
        public const int R = 4, GW = Rules.GridW * R, GH = Rules.GridH * R, N = GW * GH;
        public float[] H;          // height of each river pixel
        public byte[] Land;
        public int[] Down;         // the pixel each one drains to (-1 none)
        public float[] Acc;        // water gathered from upstream
        public byte[] Cells;       // per map cell: biggest river crossing it (0 none, 1 stream … 4 great river)

        public static int ClassOf(float a) { return a < 190 ? 1 : a < 520 ? 2 : a < 1400 ? 3 : 4; }

        public static RiverField Build(World w)
        {
            float L = w.SeaLevel; int seed = w.Seed;
            var f = new RiverField { H = new float[N], Land = new byte[N], Down = new int[N], Acc = new float[N], Cells = new byte[Rules.NCells] };
            var h = f.H; var land = f.Land;
            for (int py = 0; py < GH; py++) for (int px = 0; px < GW; px++)
            {
                double x = (px + 0.5) / R, y = (py + 0.5) / R; int p = py * GW + px;
                h[p] = (float)(World.ElevationAt(seed, x, y) + 0.03 * (Noise.Fbm(x * 1.9, y * 1.9, seed + 333, 3) - 0.5));
                int gx = (int)Math.Floor(x), gy = (int)Math.Floor(y);
                land[p] = (byte)(h[p] > L && gx >= 1 && gy >= 1 && gx < Rules.GridW - 1 && gy < Rules.GridH - 1 ? 1 : 0);
            }
            // priority flood from the coast: every land pixel finds its way down to the sea
            var heapK = new float[N]; var heapV = new int[N]; int hn = 0;
            Action<int, float> push = (v, key) =>
            {
                int i = hn++;
                while (i > 0) { int pa = (i - 1) >> 1; if (heapK[pa] <= key) break; heapK[i] = heapK[pa]; heapV[i] = heapV[pa]; i = pa; }
                heapK[i] = key; heapV[i] = v;
            };
            Func<int> pop = () =>
            {
                int v = heapV[0]; float lk = heapK[--hn]; int lv = heapV[hn];
                int i = 0;
                while (true) { int c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && heapK[c + 1] < heapK[c]) c++; if (heapK[c] >= lk) break; heapK[i] = heapK[c]; heapV[i] = heapV[c]; i = c; }
                heapK[i] = lk; heapV[i] = lv;
                return v;
            };
            var filled = new float[N]; var down = f.Down; var order = new int[N]; var done = new byte[N];
            for (int p = 0; p < N; p++) down[p] = -1;
            int oc = 0;
            var NB = Rules.Dirs8;
            for (int p = 0; p < N; p++)
            {
                if (land[p] != 0) continue;
                done[p] = 1; filled[p] = L;
                int px = p % GW, py = p / GW;
                foreach (var d in NB)
                {
                    int qx = px + d[0], qy = py + d[1];
                    if (qx >= 0 && qy >= 0 && qx < GW && qy < GH && land[qy * GW + qx] != 0) { push(p, L); break; }
                }
            }
            while (hn > 0)
            {
                int p = pop(), px = p % GW, py = p / GW;
                foreach (var d in NB)
                {
                    int qx = px + d[0], qy = py + d[1];
                    if (qx < 0 || qy < 0 || qx >= GW || qy >= GH) continue;
                    int q = qy * GW + qx;
                    if (done[q] != 0) continue;
                    done[q] = 1;
                    filled[q] = (float)Math.Max((double)h[q], (double)filled[p] + 1e-6);
                    down[q] = p;
                    order[oc++] = q;
                    push(q, filled[q]);
                }
            }
            // rain gathers downstream
            var acc = f.Acc;
            for (int p = 0; p < N; p++) if (land[p] != 0) acc[p] = (float)(0.4 + World.MoistureAt(seed, ((p % GW) + 0.5) / R, ((p / GW) + 0.5) / R));
            for (int i = oc - 1; i >= 0; i--) { int q = order[i]; if (down[q] >= 0 && land[down[q]] != 0) acc[down[q]] = acc[down[q]] + acc[q]; }
            for (int p = 0; p < N; p++)
            {
                if (land[p] == 0 || acc[p] < 75) continue;
                int cls = ClassOf(acc[p]);
                int i = Rules.Idx((p % GW) / R, (p / GW) / R);
                if (cls > f.Cells[i]) f.Cells[i] = (byte)cls;
            }
            return f;
        }
    }

    /// <summary>Navigable water: cells crossed by a big river (class 3+), joined into systems.</summary>
    public sealed class RiverGeo
    {
        public short[] Nav = new short[Rules.NCells];
        public int Systems;

        public static RiverGeo Build(World w)
        {
            var g = new RiverGeo();
            var cls = w.Rivers.Cells;
            for (int i = 0; i < Rules.NCells; i++) g.Nav[i] = -1;
            var stack = new Stack<int>();
            for (int i = 0; i < Rules.NCells; i++)
            {
                if (cls[i] < 3 || g.Nav[i] >= 0 || !w.IsLand(i)) continue;
                short id = (short)g.Systems++;
                g.Nav[i] = id; stack.Push(i);
                while (stack.Count > 0)
                {
                    int c = stack.Pop();
                    foreach (var d in Rules.Dirs8)
                    {
                        int X = Rules.CellX(c) + d[0], Y = Rules.CellY(c) + d[1];
                        if (!Rules.InBounds(X, Y)) continue;
                        int k = Rules.Idx(X, Y);
                        if (g.Nav[k] < 0 && cls[k] >= 3 && w.IsLand(k)) { g.Nav[k] = id; stack.Push(k); }
                    }
                }
            }
            return g;
        }
    }

    /// <summary>The open ocean (water that reaches the edge of the map; lakes are not navigable) and distance from land.</summary>
    public sealed class SeaGeo
    {
        public byte[] Ocean = new byte[Rules.NCells];
        public float[] Shore = new float[Rules.NCells];

        public static SeaGeo Build(World w)
        {
            var s = new SeaGeo();
            var body = new int[Rules.NCells];
            for (int i = 0; i < Rules.NCells; i++) body[i] = -1;
            int nb = 0;
            var q = new Stack<int>(); var cells = new List<int>();
            for (int i = 0; i < Rules.NCells; i++)
            {
                if (w.Terrain[i] != Terrain.Sea || body[i] >= 0) continue;
                int id = nb++; cells.Clear(); q.Push(i); body[i] = id;
                bool edge = false;
                while (q.Count > 0)
                {
                    int c = q.Pop(); cells.Add(c);
                    int x = Rules.CellX(c), y = Rules.CellY(c);
                    if (x == 0 || y == 0 || x == Rules.GridW - 1 || y == Rules.GridH - 1) edge = true;
                    foreach (var d in Rules.Dirs4)
                    {
                        int X = x + d[0], Y = y + d[1];
                        if (!Rules.InBounds(X, Y)) continue;
                        int k = Rules.Idx(X, Y);
                        if (w.Terrain[k] == Terrain.Sea && body[k] < 0) { body[k] = id; q.Push(k); }
                    }
                }
                if (edge) foreach (var c in cells) s.Ocean[c] = 1;
            }
            var sq = new List<int>();
            for (int i = 0; i < Rules.NCells; i++)
            {
                s.Shore[i] = float.PositiveInfinity;
                if (s.Ocean[i] == 0) continue;
                foreach (var d in Rules.Dirs8)
                {
                    int X = Rules.CellX(i) + d[0], Y = Rules.CellY(i) + d[1];
                    if (Rules.InBounds(X, Y) && w.Terrain[Rules.Idx(X, Y)] != Terrain.Sea) { s.Shore[i] = 1; sq.Add(i); break; }
                }
            }
            for (int qi = 0; qi < sq.Count; qi++)
            {
                int c = sq[qi], x = Rules.CellX(c), y = Rules.CellY(c);
                foreach (var d in Rules.Dirs8)
                {
                    int X = x + d[0], Y = y + d[1];
                    if (!Rules.InBounds(X, Y)) continue;
                    int k = Rules.Idx(X, Y);
                    if (s.Ocean[k] == 0) continue;
                    if (d[0] != 0 && d[1] != 0 && (s.Ocean[Rules.Idx(x + d[0], y)] == 0 || s.Ocean[Rules.Idx(x, y + d[1])] == 0)) continue;
                    if (float.IsPositiveInfinity(s.Shore[k])) { s.Shore[k] = s.Shore[c] + 1; sq.Add(k); }
                }
            }
            return s;
        }

        /// <summary>Where a town meets the open sea: the most open ocean cell beside it, or -1.</summary>
        public int PortSeaCell(int cell)
        {
            int best = -1; double bs = -1;
            foreach (var d in Rules.Dirs8)
            {
                int X = Rules.CellX(cell) + d[0], Y = Rules.CellY(cell) + d[1];
                if (!Rules.InBounds(X, Y)) continue;
                int k = Rules.Idx(X, Y);
                if (Ocean[k] == 0) continue;
                double sc = Shore[k] + (d[0] != 0 && d[1] != 0 ? 0 : 0.5);
                if (sc > bs) { bs = sc; best = k; }
            }
            return best;
        }

        /// <summary>A coast on the open sea (4 directions): the sea cell beside it, or -1.</summary>
        public int BeachSeaCell(World w, int cell)
        {
            if (!w.IsLand(cell)) return -1;
            foreach (var d in Rules.Dirs4)
            {
                int X = Rules.CellX(cell) + d[0], Y = Rules.CellY(cell) + d[1];
                if (Rules.InBounds(X, Y) && Ocean[Rules.Idx(X, Y)] != 0) return PortSeaCell(cell);
            }
            return -1;
        }
    }
}

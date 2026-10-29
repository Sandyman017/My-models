// Paints the world into the pictures the 3D map is drawn from: the colours of the land (as the web map paints them),
// its heights, the light falling on it, the coastline and the rivers. Pure C# (no Unity), so it runs on a
// background thread and can be checked outside Unity.
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using DrawnBorders.Engine;

namespace DrawnBorders.Bake
{
    public sealed class BakedMap
    {
        public int Res, W, H;              // pixels per cell, picture size
        public float HeightScale;
        public byte[] Color;               // RGBA: colour of the land (sRGB), alpha = sunlight (1) or shadow (0)
        public byte[] Data;                // RGBA: coast (0.5 = the shoreline), distance to a river, the river's half width, open sky
        public byte[] Normal;              // RGBA: which way the ground faces
        public float[] Height;             // map units above the sea (negative under water), one per pixel

        /// <summary>Height at a point in cells (x right, y down), between pixels.</summary>
        public float HeightAt(double x, double y)
        {
            double fx = x * Res - 0.5, fy = y * Res - 0.5;
            int x0 = (int)Math.Floor(fx), y0 = (int)Math.Floor(fy);
            double tx = fx - x0, ty = fy - y0;
            float a = Px(x0, y0), b = Px(x0 + 1, y0), c = Px(x0, y0 + 1), d = Px(x0 + 1, y0 + 1);
            return (float)(a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        }
        float Px(int x, int y) { x = Math.Max(0, Math.Min(W - 1, x)); y = Math.Max(0, Math.Min(H - 1, y)); return Height[y * W + x]; }
    }

    public static class MapBaker
    {
        public const float HeightScale = 3.2f;      // how tall the relief stands (map units per unit of the world's elevation)
        public const float SeaDepthScale = 1.6f;
        public const double ReliefZ = 7.5;          // the web map's relief exaggeration, for where rock and snow lie
        public const double DataK = 1.25;           // coast channel: 0.5 + (elevation − sea level) × DataK
        public const double RiverDistMax = 0.3, RiverHalfMax = 0.1;
        // half widths of a stream, a river, a big river and a great river, in cells (the web map's widths ÷ 2)
        public static readonly double[] RiverHalf = { 0.015, 0.025, 0.0375, 0.055 };

        // The web map's colours of the land seen from orbit
        static readonly double[] deep = Hex("#0a2236"), shoal = Hex("#3f8c92"), shelf = Hex("#22677f");
        static readonly double[] sand = Hex("#c9b98c"), wetSand = Hex("#8d8462");
        static readonly double[] steppe = Hex("#9c9763"), dryGrass = Hex("#7f874f"), grass = Hex("#647a42"), lush = Hex("#4a6735");
        static readonly double[] forestDark = Hex("#1b321d"), forest = Hex("#2a4628"), forestLight = Hex("#3d5d32");
        static readonly double[] hillGrass = Hex("#6e7548"), hillSoil = Hex("#7d6e50"), scrub = Hex("#56653b");
        static readonly double[] rock = Hex("#6b645b"), rockLight = Hex("#9a9184"), rockDark = Hex("#3f3a34"), snowC = Hex("#eef1f3");
        static readonly double[] riverBed = Hex("#4f5a3a");

        // The sun stands in the north-west, as on the web map (x right, y down, z up)
        public static readonly double[] Sun = Norm(new[] { -0.62, -0.72, 0.7 });

        static double[] Hex(string h)
        {
            int v = Convert.ToInt32(h.Substring(1), 16);
            return new double[] { (v >> 16) & 255, (v >> 8) & 255, v & 255 };
        }
        static double[] Norm(double[] v) { double l = Math.Sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return new[] { v[0] / l, v[1] / l, v[2] / l }; }
        static double S01(double a, double b, double v) { return Noise.Smooth01(a, b, v); }
        static void Mix(double[] g, double[] c, double t)
        {
            t = Math.Max(0, Math.Min(1, t));
            g[0] += (c[0] - g[0]) * t; g[1] += (c[1] - g[1]) * t; g[2] += (c[2] - g[2]) * t;
        }
        static double[] Lerp(double[] a, double[] b, double t)
        {
            t = Math.Max(0, Math.Min(1, t));
            return new[] { a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t };
        }
        static byte B(double v) { return (byte)Math.Max(0, Math.Min(255, Math.Round(v))); }

        public static BakedMap Bake(World w, int res, Action<string> progress = null)
        {
            int W = Rules.GridW * res, H = Rules.GridH * res, N = W * H, seed = w.Seed;
            double L = w.SeaLevel, hillL = w.HillLevel, mtnL = w.MountainLevel;
            var elev = new float[N]; var rel = new float[N]; var moist = new float[N]; var hg = new float[N];
            progress?.Invoke("Raising the land");
            Parallel.For(0, H, py =>
            {
                for (int px = 0; px < W; px++)
                {
                    double x = (px + 0.5) / res, y = (py + 0.5) / res; int k = py * W + px;
                    double det = Noise.Fbm(x * 1.9, y * 1.9, seed + 333, 4) - 0.5;
                    double e = World.ElevationAt(seed, x, y) + 0.03 * det;
                    int gx = (int)Math.Floor(x), gy = (int)Math.Floor(y);
                    if (gx < 1 || gy < 1 || gx >= Rules.GridW - 1 || gy >= Rules.GridH - 1) e = Math.Min(e, L - 0.004);
                    double up = Noise.Clamp((e - hillL) / (mtnL - hillL), 0, 1.6);
                    double r = 0;
                    if (up > 0)
                    {
                        // rolling hills, turning into branching ridges (sharp crests, valleys between) toward the mountains
                        double bump = Noise.Fbm(x * 0.9, y * 0.9, seed + 640, 3);
                        r = bump + (Ridges(x, y, seed) - bump) * S01(0.45, 1.05, up);
                    }
                    elev[k] = (float)e; rel[k] = (float)r;
                    moist[k] = (float)(World.MoistureAt(seed, x, y) + 0.07 * (Noise.ValueNoise(x * 2.1, y * 2.1, seed + 88) - 0.5));
                    hg[k] = (float)(e > L ? e + Math.Min(up, 1.3) * 0.085 * r + 0.007 * det : e);
                }
            });

            progress?.Invoke("Tracing the rivers");
            var riverDist = new float[N]; var riverHalf = new float[N];
            TraceRivers(w, res, W, H, riverDist, riverHalf);

            // heights in map units; rivers cut a little valley into the land
            var height = new float[N];
            Parallel.For(0, N, k =>
            {
                double e = elev[k];
                if (e <= L) { height[k] = (float)((e - L) * SeaDepthScale); return; }
                double h = (hg[k] - L) * HeightScale;
                double hw = riverHalf[k];
                if (hw > 0)
                {
                    double t = 1 - S01(hw, hw * 4 + 0.04, riverDist[k]);
                    h = Math.Max(0.004, h - t * Math.Min(h * 0.6, 0.02 + hw * 1.2));
                }
                height[k] = (float)h;
            });

            progress?.Invoke("Painting the land");
            var color = new byte[N * 4]; var data = new byte[N * 4]; var normal = new byte[N * 4];
            double cell = 1.0 / res;
            Parallel.For(0, H, py =>
            {
                var g = new double[3];
                for (int px = 0; px < W; px++)
                {
                    int k = py * W + px, o = k * 4;
                    double x = (px + 0.5) / res, y = (py + 0.5) / res;
                    int kl = py * W + Math.Max(0, px - 1), kr = py * W + Math.Min(W - 1, px + 1);
                    int ku = Math.Max(0, py - 1) * W + px, kd = Math.Min(H - 1, py + 1) * W + px;
                    double e = elev[k], m = moist[k], r = rel[k];

                    // which way the ground faces (water: the sea floor)
                    double hx = (Math.Max(height[kr], 0) - Math.Max(height[kl], 0)) / (2 * cell), hy = (Math.Max(height[kd], 0) - Math.Max(height[ku], 0)) / (2 * cell);
                    if (e <= L) { hx = (height[kr] - height[kl]) / (2 * cell); hy = (height[kd] - height[ku]) / (2 * cell); }
                    double nl = Math.Sqrt(hx * hx + hy * hy + 1);
                    // stored as Unity sees it: x right, y up, z north (= −y on the map)
                    normal[o] = B((-hx / nl * 0.5 + 0.5) * 255); normal[o + 1] = B((1 / nl * 0.5 + 0.5) * 255); normal[o + 2] = B((hy / nl * 0.5 + 0.5) * 255); normal[o + 3] = 255;

                    data[o] = B((0.5 + (e - L) * DataK) * 255);
                    data[o + 1] = B(Math.Min(1, riverDist[k] / RiverDistMax) * 255);
                    data[o + 2] = B(Math.Min(1, riverHalf[k] / RiverHalfMax) * 255);
                    data[o + 3] = 255;

                    if (e <= L)
                    {
                        // the sea floor, seen through shallow water
                        double d = L - e;
                        var sb = d < 0.01 ? Lerp(sand, wetSand, d / 0.01) : d < 0.04 ? Lerp(wetSand, shoal, (d - 0.01) / 0.03) : d < 0.12 ? Lerp(shoal, shelf, (d - 0.04) / 0.08) : Lerp(shelf, deep, (d - 0.12) / 0.2);
                        color[o] = B(sb[0]); color[o + 1] = B(sb[1]); color[o + 2] = B(sb[2]); color[o + 3] = 255;
                        continue;
                    }
                    double dzx = (hg[kr] - hg[kl]) / (2 * cell), dzy = (hg[kd] - hg[ku]) / (2 * cell);
                    double slope = Math.Sqrt(dzx * dzx + dzy * dzy) * ReliefZ;
                    double hillW = S01(hillL - 0.012, hillL + 0.022, e), mtnW = S01(mtnL - 0.01, mtnL + 0.035, e);
                    // ground cover by moisture: steppe → meadow → lush grass
                    double wet = S01(0.24, 0.62, m);
                    var g0 = wet < 0.5 ? Lerp(steppe, dryGrass, wet * 2) : wet < 0.8 ? Lerp(dryGrass, grass, (wet - 0.5) / 0.3) : Lerp(grass, lush, (wet - 0.8) / 0.2);
                    g[0] = g0[0]; g[1] = g0[1]; g[2] = g0[2];
                    double mott = Noise.ValueNoise(x * 3.3, y * 3.3, seed + 120) - 0.5;
                    Mix(g, mott > 0 ? scrub : steppe, Math.Abs(mott) * 0.35);
                    Mix(g, Lerp(hillGrass, hillSoil, S01(0.2, 0.7, r + (1 - wet) * 0.3)), hillW * 0.85);
                    // forest: a canopy of crowns, darker in its folds
                    double fw = S01(w.MoistLevel - 0.035, w.MoistLevel + 0.035, m) * (1 - mtnW) * (1 - 0.35 * hillW);
                    if (fw > 0.01)
                    {
                        double c1 = Noise.ValueNoise(x * 9, y * 9, seed + 77), c2 = Noise.ValueNoise(x * 19, y * 19, seed + 78);
                        double canopy = Noise.Clamp(0.25 + 0.75 * c1 + 0.3 * (c2 - 0.5) + 0.25 * (Noise.ValueNoise(x * 1.4, y * 1.4, seed + 79) - 0.5), 0, 1);
                        Mix(g, canopy < 0.5 ? Lerp(forestDark, forest, canopy * 2) : Lerp(forest, forestLight, (canopy - 0.5) * 2), fw);
                    }
                    // bare rock on mountains and on steep hillsides, lighter on the crests
                    double rockAmt = Math.Max(mtnW * (0.65 + 0.35 * S01(0.1, 0.5, slope)), hillW * S01(0.55, 1.2, slope) * 0.6);
                    if (rockAmt > 0.01) Mix(g, Lerp(Lerp(rockDark, rock, S01(0.1, 0.5, r)), rockLight, S01(0.55, 0.95, r)), rockAmt);
                    // snow on the high peaks, thinner on the steepest faces
                    double snow = S01(mtnL + 0.075, mtnL + 0.14, e + 0.05 * r) * S01(0.5, 0.85, r) * (1 - 0.6 * S01(1.0, 2.0, slope));
                    if (snow > 0.01) Mix(g, snowC, snow * 0.95);
                    // sand at the water's edge
                    double ce = e - L;
                    if (ce < 0.007 && slope < 1.2) Mix(g, ce < 0.0025 ? wetSand : sand, (1 - ce / 0.007) * 0.75);
                    // darker, wetter ground along the rivers (the water itself is drawn by the map's shader)
                    double hw = riverHalf[k];
                    if (hw > 0) Mix(g, riverBed, (1 - S01(hw, hw * 3 + 0.03, riverDist[k])) * 0.5);
                    color[o] = B(g[0]); color[o + 1] = B(g[1]); color[o + 2] = B(g[2]); color[o + 3] = 255;
                }
            });

            progress?.Invoke("Casting the shadows");
            BakeLight(height, W, H, res, color, data);

            return new BakedMap { Res = res, W = W, H = H, HeightScale = HeightScale, Color = color, Data = data, Normal = normal, Height = height };
        }

        /// <summary>Gradient noise (about −0.7 … 0.7): its zero lines run as long branching lines, which makes good mountain crests.</summary>
        public static double Perlin(double x, double y, int seed)
        {
            double fx0 = Math.Floor(x), fy0 = Math.Floor(y);
            int ix = (int)fx0, iy = (int)fy0;
            double fx = x - fx0, fy = y - fy0;
            Func<int, int, double, double, double> grad = (gx, gy, dx, dy) =>
            {
                double a = Noise.Hash2(gx, gy, seed) * Math.PI * 2;
                return Math.Cos(a) * dx + Math.Sin(a) * dy;
            };
            double u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
            double n00 = grad(ix, iy, fx, fy), n10 = grad(ix + 1, iy, fx - 1, fy), n01 = grad(ix, iy + 1, fx, fy - 1), n11 = grad(ix + 1, iy + 1, fx - 1, fy - 1);
            double nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
            return nx0 + (nx1 - nx0) * v;
        }

        /// <summary>Mountain crests (0 … 1): ridged gradient noise over a warped plane, finer ridges growing on the big ones.</summary>
        public static double Ridges(double x, double y, int seed)
        {
            double wx = x + 1.1 * (Noise.Fbm(x * 0.3, y * 0.3, seed + 41, 2) - 0.5), wy = y + 1.1 * (Noise.Fbm(x * 0.3 + 5.3, y * 0.3, seed + 42, 2) - 0.5);
            double sum = 0, amp = 1, norm = 0, freq = 0.55, weight = 1;
            for (int o = 0; o < 5; o++)
            {
                double n = Perlin(wx * freq, wy * freq, seed + 611 + o);
                double sg = Math.Max(0, 1 - Math.Abs(n) * 1.7);
                sg *= sg * weight;
                weight = Noise.Clamp(sg * 1.8, 0, 1);
                sum += sg * amp; norm += amp;
                amp *= 0.5; freq *= 2.07;
            }
            return Noise.Clamp(sum / norm * 1.35, 0, 1);
        }

        /// <summary>Shadows of the mountains from the low north-west sun (colour alpha) and how open each spot is to the sky (data alpha).</summary>
        static void BakeLight(float[] height, int W, int H, int res, byte[] color, byte[] data)
        {
            double sx = Sun[0], sy = Sun[1], horiz = Math.Sqrt(sx * sx + sy * sy);
            double dirX = sx / horiz, dirY = sy / horiz, tanSun = Sun[2] / horiz;
            int steps = 40; double stepCells = 3.0 / steps;
            Func<int, int, float> h = (x, y) => Math.Max(0f, height[Math.Max(0, Math.Min(H - 1, y)) * W + Math.Max(0, Math.Min(W - 1, x))]);
            Parallel.For(0, H, py =>
            {
                for (int px = 0; px < W; px++)
                {
                    float h0 = h(px, py);
                    double occ = -1;
                    for (int s = 1; s <= steps; s++)
                    {
                        double dist = s * stepCells;
                        int qx = (int)Math.Round(px + dirX * dist * res), qy = (int)Math.Round(py + dirY * dist * res);
                        if (qx < 0 || qy < 0 || qx >= W || qy >= H) break;
                        occ = Math.Max(occ, (h(qx, qy) - h0) / dist - tanSun);
                    }
                    double lit = 1 - S01(-0.04, 0.12, occ);
                    color[(py * W + px) * 4 + 3] = B(lit * 255);
                }
            });
            // open sky: lower than the land around it means less light from the sky
            int rad = Math.Max(1, res / 2);
            var tmp = new float[W * H]; var blur = new float[W * H];
            Parallel.For(0, H, py =>
            {
                double sum = 0; int n = 0;
                for (int px = -rad; px < W; px++)
                {
                    int add = px + rad; if (add < W) { sum += h(add, py); n++; }
                    int sub = px - rad - 1; if (sub >= 0) { sum -= h(sub, py); n--; }
                    if (px >= 0) tmp[py * W + px] = (float)(sum / n);
                }
            });
            Parallel.For(0, W, px =>
            {
                double sum = 0; int n = 0;
                for (int py = -rad; py < H; py++)
                {
                    int add = py + rad; if (add < H) { sum += tmp[add * W + px]; n++; }
                    int sub = py - rad - 1; if (sub >= 0) { sum -= tmp[sub * W + px]; n--; }
                    if (py >= 0) blur[py * W + px] = (float)(sum / n);
                }
            });
            Parallel.For(0, W * H, k =>
            {
                double cavity = blur[k] - Math.Max(0f, height[k]);
                data[k * 4 + 3] = B(Noise.Clamp(1 - cavity * 2.2, 0.45, 1) * 255);
            });
        }

        // ---------- Rivers: traced from the same river field as the rules, smoothed as on the web map ----------
        public sealed class RiverLine { public List<double[]> Pts = new List<double[]>(); public int Cls; }

        public static List<RiverLine> RiverLines(World w)
        {
            var F = w.Rivers; int GW = RiverField.GW, N = RiverField.N, R = RiverField.R, seed = w.Seed;
            const float TH = 75;
            var inflow = new byte[N];
            for (int p = 0; p < N; p++) if (F.Land[p] != 0 && F.Acc[p] >= TH && F.Down[p] >= 0) inflow[F.Down[p]] = 1;
            var traced = new byte[N];
            Func<float, int> classOf = a => a < 190 ? 0 : a < 520 ? 1 : a < 1400 ? 2 : 3;
            var lines = new List<RiverLine>();
            for (int s = 0; s < N; s++)
            {
                if (F.Land[s] == 0 || F.Acc[s] < TH || inflow[s] != 0) continue;
                var pts = new List<int>();
                int p = s;
                while (p >= 0)
                {
                    pts.Add(p);
                    if (traced[p] != 0 || F.Land[p] == 0) break;
                    traced[p] = 1;
                    p = F.Down[p];
                }
                if (pts.Count < 4) continue;
                var xy = new List<double[]>();
                for (int i = 0; i < pts.Count; i++)
                {
                    int q = pts[i];
                    double x = ((q % GW) + 0.5) / R, y = ((q / GW) + 0.5) / R;
                    double j = i == 0 || i == pts.Count - 1 ? 0 : 0.42;
                    xy.Add(new[] {
                        x + j * (Noise.ValueNoise(x * 1.4, y * 1.4, seed + 801) - 0.5) + 0.12 * (Noise.ValueNoise(x * 4, y * 4, seed + 803) - 0.5),
                        y + j * (Noise.ValueNoise(x * 1.4, y * 1.4, seed + 802) - 0.5) + 0.12 * (Noise.ValueNoise(x * 4, y * 4, seed + 804) - 0.5) });
                }
                var sm = Chaikin(xy, 2);
                // split into pieces by width, so a river widens as it flows
                int cur = classOf(F.Acc[pts[0]]), start = 0;
                double per = (double)sm.Count / pts.Count;
                for (int i = 1; i <= sm.Count; i++)
                {
                    int cls = i < sm.Count ? classOf(F.Acc[pts[Math.Min(pts.Count - 1, (int)Math.Floor(i / per))]]) : -1;
                    if (cls != cur)
                    {
                        var line = new RiverLine { Cls = cur };
                        for (int k = start; k < Math.Min(sm.Count, i + 1); k++) line.Pts.Add(sm[k]);
                        lines.Add(line);
                        start = i; cur = cls;
                    }
                }
            }
            return lines;
        }

        static List<double[]> Chaikin(List<double[]> p, int rounds)
        {
            for (int r = 0; r < rounds; r++)
            {
                var o = new List<double[]>(p.Count * 2) { p[0] };
                for (int i = 0; i < p.Count - 1; i++)
                {
                    var a = p[i]; var b = p[i + 1];
                    o.Add(new[] { a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25 });
                    o.Add(new[] { a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75 });
                }
                o.Add(p[p.Count - 1]);
                p = o;
            }
            return p;
        }

        /// <summary>For every pixel: the distance to the nearest river (in cells) and that river's half width.</summary>
        static void TraceRivers(World w, int res, int W, int H, float[] dist, float[] half)
        {
            for (int k = 0; k < dist.Length; k++) { dist[k] = (float)RiverDistMax; half[k] = 0; }
            var cover = new float[dist.Length];   // distance minus half width: which river is "nearest" where two meet
            for (int k = 0; k < cover.Length; k++) cover[k] = float.MaxValue;
            foreach (var line in RiverLines(w))
            {
                double hw = RiverHalf[line.Cls];
                for (int i = 0; i + 1 < line.Pts.Count; i++)
                {
                    double ax = line.Pts[i][0], ay = line.Pts[i][1], bx = line.Pts[i + 1][0], by = line.Pts[i + 1][1];
                    double m = RiverDistMax;
                    int x0 = Math.Max(0, (int)Math.Floor((Math.Min(ax, bx) - m) * res)), x1 = Math.Min(W - 1, (int)Math.Ceiling((Math.Max(ax, bx) + m) * res));
                    int y0 = Math.Max(0, (int)Math.Floor((Math.Min(ay, by) - m) * res)), y1 = Math.Min(H - 1, (int)Math.Ceiling((Math.Max(ay, by) + m) * res));
                    double vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy;
                    for (int py = y0; py <= y1; py++) for (int px = x0; px <= x1; px++)
                    {
                        double x = (px + 0.5) / res, y = (py + 0.5) / res;
                        double t = vv > 0 ? Noise.Clamp(((x - ax) * vx + (y - ay) * vy) / vv, 0, 1) : 0;
                        double dx = x - (ax + vx * t), dy = y - (ay + vy * t);
                        double d = Math.Sqrt(dx * dx + dy * dy);
                        if (d >= RiverDistMax) continue;
                        int k = py * W + px;
                        double c = d - hw;
                        if (c < cover[k]) { cover[k] = (float)c; dist[k] = (float)d; half[k] = (float)hw; }
                    }
                }
            }
        }

        /// <summary>A small picture of soft noise that repeats seamlessly, for fine grain on the land and ripples on the water.</summary>
        public static byte[] DetailNoise(int size, int seed)
        {
            var o = new byte[size * size * 4];
            Func<double, double, int, int, double> tiled = (x, y, period, s) =>
            {
                double fx0 = Math.Floor(x), fy0 = Math.Floor(y);
                int ix = (int)fx0, iy = (int)fy0;
                double fx = Noise.Smoothstep(x - fx0), fy = Noise.Smoothstep(y - fy0);
                Func<int, int, double> hsh = (a, b) => Noise.Hash2(((a % period) + period) % period, ((b % period) + period) % period, s);
                double A = hsh(ix, iy), Bv = hsh(ix + 1, iy), C = hsh(ix, iy + 1), D = hsh(ix + 1, iy + 1);
                return A + (Bv - A) * fx + (C - A) * fy + (A - Bv - C + D) * fx * fy;
            };
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
            {
                double u = (double)x / size, v = (double)y / size;
                for (int ch = 0; ch < 4; ch++)
                {
                    double sum = 0, amp = 1, norm = 0;
                    for (int oc = 0; oc < 4; oc++)
                    {
                        int period = 8 << oc;
                        sum += amp * tiled(u * period, v * period, period, seed + ch * 31 + oc * 7);
                        norm += amp; amp *= 0.55;
                    }
                    o[(y * size + x) * 4 + ch] = B(sum / norm * 255);
                }
            }
            return o;
        }
    }
}

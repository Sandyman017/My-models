// Who owns the land, drawn in smooth curves, with sharp border lines at any zoom. Each nation (and the wild land) gets a
// soft mask of its cells, blurred, and every pixel (8 a cell) belongs to the strongest mask: that rounds the cells' corners
// into curves. Then each pixel gets its distance to the nearest border of its own land. The shader reads the four pixels
// around a point itself and works out, from those distances, on which side of a border the point is and how far from it
// (Terrain.shader). Provinces the same way, inside each nation. The sea beside a coast counts for the land beside it, so a
// coast is never a line.
using System;
using System.Collections.Generic;
using DrawnBorders.Engine;
using UnityEngine;

namespace DrawnBorders.Game
{
    public sealed class PoliticalMap
    {
        public const int Res = 8;                       // pixels a cell
        public const int W = Rules.GridW * Res, H = Rules.GridH * Res;
        public const int MaxClasses = 255;
        public const float DistRange = 1.5f;            // distances are kept up to this many cells

        public byte[] Ids = new byte[W * H * 4];        // r: the nation here (0: wild land), g: the province (0: none); bottom row first
        public byte[] Dist = new byte[W * H * 4];       // r, g: distance to the nearest national / province border, 255 = DistRange cells
        public byte[] Palette = new byte[256 * 2 * 4];  // row 0: each nation's colour (alpha 0: wild land); row 1: province tints (alpha 0: none)

        /// <param name="owner">nation id for every cell (-1: nobody)</param>
        /// <param name="prov">province id for every cell (-1: none), or null</param>
        /// <param name="nationColors">colour of each nation id, "#rrggbb"</param>
        /// <param name="provinces">the provinces, or null</param>
        /// <param name="tintOwner">whose provinces get their tint (the player), -1 for nobody's</param>
        public static PoliticalMap Build(World world, int[] owner, int[] prov, IList<string> nationColors, IList<ProvinceInfo> provinces, int tintOwner)
        {
            var pm = new PoliticalMap();
            var cls = new int[Rules.NCells];

            // nations: class = nation id + 1, wild land 0
            int nationClasses = Math.Min(MaxClasses, nationColors.Count + 1);
            for (int c = 0; c < Rules.NCells; c++) cls[c] = world.IsLand(c) ? Math.Min(nationClasses - 1, owner[c] + 1) : -1;
            Pack(pm, Layer(cls, nationClasses, 0), 0);
            // (Layer gives the strongest and second-strongest class at every pixel; Pack measures the distances)
            for (int k = 1; k < nationClasses; k++) PaletteSet(pm, 0, k, MapView.Hex(nationColors[k - 1]), 1);

            // provinces: class 1, 2, … in list order; 0 for land in no province (it gets no mask)
            if (prov != null && provinces != null && provinces.Count > 0)
            {
                var index = new Dictionary<int, int>();
                var ownerOf = new Dictionary<int, int>();
                for (int i = 0; i < provinces.Count && i < MaxClasses - 1; i++)
                {
                    var p = provinces[i];
                    index[p.id] = i + 1;
                    ownerOf[p.id] = p.owner;
                    PaletteSet(pm, 1, i + 1, MapView.Hex(p.tint), p.owner == tintOwner ? 1 : 0);
                }
                for (int c = 0; c < Rules.NCells; c++)
                {
                    int k, o;
                    cls[c] = !world.IsLand(c) ? -1 : prov[c] >= 0 && index.TryGetValue(prov[c], out k) && ownerOf.TryGetValue(prov[c], out o) && o == owner[c] ? k : 0;
                }
                Pack(pm, Layer(cls, Math.Min(MaxClasses, provinces.Count + 1), 1), 1);
            }
            else Pack(pm, new Top(), 1);
            return pm;
        }

        sealed class Top { public float[] V1 = new float[W * H], V2 = new float[W * H]; public byte[] C1 = new byte[W * H], C2 = new byte[W * H]; }

        // The strongest and second-strongest class at every pixel (0 where no class reaches). Classes below `first` get no mask.
        static Top Layer(int[] cls, int classes, int first)
        {
            var top = new Top();
            var mask = new byte[Rules.NCells];
            var a = new float[W * H]; var tmp = new float[W * H];
            for (int k = first; k < classes; k++)
            {
                // the class's cells, and the sea beside them
                Array.Clear(mask, 0, mask.Length);
                int x0 = int.MaxValue, y0 = int.MaxValue, x1 = -1, y1 = -1;
                for (int c = 0; c < Rules.NCells; c++)
                {
                    if (cls[c] != k) continue;
                    int cx = Rules.CellX(c), cy = Rules.CellY(c);
                    mask[c] = 1;
                    foreach (var d in Rules.Dirs8)
                    {
                        int x = cx + d[0], y = cy + d[1];
                        if (Rules.InBounds(x, y) && cls[Rules.Idx(x, y)] < 0) mask[Rules.Idx(x, y)] = 1;
                    }
                    x0 = Math.Min(x0, cx - 1); x1 = Math.Max(x1, cx + 1); y0 = Math.Min(y0, cy - 1); y1 = Math.Max(y1, cy + 1);
                }
                if (x1 < 0) continue;
                // the pixels it can reach: its cells, the bilinear spread and the blur, with room to spare
                int px0 = Math.Max(0, (x0 - 1) * Res), px1 = Math.Min(W, (x1 + 2) * Res);
                int py0 = Math.Max(0, (y0 - 1) * Res), py1 = Math.Min(H, (y1 + 2) * Res);
                int rw = px1 - px0, rh = py1 - py0;
                for (int py = 0; py < rh; py++)
                {
                    float fy = (py0 + py + 0.5f) / Res - 0.5f;
                    int cy0 = Mathf.FloorToInt(fy); float ty = fy - cy0;
                    for (int px = 0; px < rw; px++)
                    {
                        // between cell centres, so the edge sits on the line between this class's cells and the others
                        float fx = (px0 + px + 0.5f) / Res - 0.5f;
                        int cx0 = Mathf.FloorToInt(fx); float tx = fx - cx0;
                        float m00 = M(mask, cx0, cy0), m10 = M(mask, cx0 + 1, cy0), m01 = M(mask, cx0, cy0 + 1), m11 = M(mask, cx0 + 1, cy0 + 1);
                        a[py * rw + px] = (m00 + (m10 - m00) * tx) * (1 - ty) + (m01 + (m11 - m01) * tx) * ty;
                    }
                }
                for (int pass = 0; pass < 2; pass++) { Blur(a, tmp, rw, rh, 3, true); Blur(tmp, a, rw, rh, 3, false); }
                for (int py = 0; py < rh; py++)
                    for (int px = 0; px < rw; px++)
                    {
                        float v = a[py * rw + px];
                        if (v <= 0) continue;
                        int i = (py0 + py) * W + px0 + px;
                        if (v > top.V1[i]) { top.V2[i] = top.V1[i]; top.C2[i] = top.C1[i]; top.V1[i] = v; top.C1[i] = (byte)k; }
                        else if (v > top.V2[i]) { top.V2[i] = v; top.C2[i] = (byte)k; }
                    }
            }
            return top;
        }

        static float M(byte[] mask, int x, int y)
        {
            x = Mathf.Clamp(x, 0, Rules.GridW - 1); y = Mathf.Clamp(y, 0, Rules.GridH - 1);
            return mask[y * Rules.GridW + x];
        }

        static void Blur(float[] src, float[] dst, int w, int h, int r, bool horizontal)
        {
            int n = 2 * r + 1;
            if (horizontal)
                for (int y = 0; y < h; y++)
                {
                    float sum = 0;
                    for (int k = -r; k <= r; k++) sum += src[y * w + Mathf.Clamp(k, 0, w - 1)];
                    for (int x = 0; x < w; x++)
                    {
                        dst[y * w + x] = sum / n;
                        sum += src[y * w + Math.Min(w - 1, x + r + 1)] - src[y * w + Math.Max(0, x - r)];
                    }
                }
            else
                for (int x = 0; x < w; x++)
                {
                    float sum = 0;
                    for (int k = -r; k <= r; k++) sum += src[Mathf.Clamp(k, 0, h - 1) * w + x];
                    for (int y = 0; y < h; y++)
                    {
                        dst[y * w + x] = sum / n;
                        sum += src[Math.Min(h - 1, y + r + 1) * w + x] - src[Math.Max(0, y - r) * w + x];
                    }
                }
        }

        // Each pixel's distance (in pixels) to the nearest border of its class. Far from a border: half a pixel more than the
        // distance to the nearest pixel on any border (one with a neighbour of another class), by Felzenszwalb's two passes.
        // Near one, more exactly, between pixels: how much stronger its own class is than the one across (their masks'
        // difference) over how fast that difference changes, so a border running at a slant comes out smooth, not in steps.
        static float[] Distances(Top t)
        {
            const float Inf = 1e12f;
            var top = t.C1;
            var f = new float[W * H];
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    int i = y * W + x; byte k = top[i];
                    bool edge = (x > 0 && top[i - 1] != k) || (x < W - 1 && top[i + 1] != k) || (y > 0 && top[i - W] != k) || (y < H - 1 && top[i + W] != k);
                    f[i] = edge ? 0 : Inf;
                }
            int n = Math.Max(W, H);
            var line = new float[n]; var outp = new float[n]; var v = new int[n]; var z = new float[n + 1];
            for (int x = 0; x < W; x++)
            {
                for (int y = 0; y < H; y++) line[y] = f[y * W + x];
                Edt1(line, outp, H, v, z);
                for (int y = 0; y < H; y++) f[y * W + x] = outp[y];
            }
            for (int y = 0; y < H; y++)
            {
                Array.Copy(f, y * W, line, 0, W);
                Edt1(line, outp, W, v, z);
                Array.Copy(outp, 0, f, y * W, W);
            }
            for (int i = 0; i < f.Length; i++) f[i] = Mathf.Sqrt(f[i]) + 0.5f;
            // close to a border: the exact distance from the two masks
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    int i = y * W + x;
                    if (f[i] > 2.5f || t.V2[i] <= 0 || t.C2[i] == t.C1[i]) continue;
                    byte a = t.C1[i], b = t.C2[i];
                    float here = t.V1[i] - t.V2[i];
                    float gx = Slope(t, a, b, i, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, here);
                    float gy = Slope(t, a, b, i, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1, here);
                    float g = Mathf.Sqrt(gx * gx + gy * gy);
                    if (g > 1e-4f) f[i] = Mathf.Min(f[i] + 0.5f, here / g);
                }
            return f;
        }

        // the difference of classes a and b at pixel i, or NaN where one of them is not among the pixel's two strongest
        static float Diff(Top t, byte a, byte b, int i)
        {
            float va = t.C1[i] == a ? t.V1[i] : t.C2[i] == a ? t.V2[i] : float.NaN;
            float vb = t.C1[i] == b ? t.V1[i] : t.C2[i] == b ? t.V2[i] : float.NaN;
            return va - vb;
        }

        // how fast the difference changes along one direction, in mask units a pixel (from both neighbours, or one)
        static float Slope(Top t, byte a, byte b, int i, int before, int after, float here)
        {
            float p = before >= 0 ? Diff(t, a, b, before) : float.NaN, n = after >= 0 ? Diff(t, a, b, after) : float.NaN;
            if (!float.IsNaN(p) && !float.IsNaN(n)) return (n - p) * 0.5f;
            if (!float.IsNaN(n)) return n - here;
            if (!float.IsNaN(p)) return here - p;
            return 0;
        }

        static void Edt1(float[] f, float[] d, int n, int[] v, float[] z)
        {
            int k = 0;
            v[0] = 0; z[0] = float.NegativeInfinity; z[1] = float.PositiveInfinity;
            for (int q = 1; q < n; q++)
            {
                float s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2f * (q - v[k]));
                while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2f * (q - v[k])); }
                k++; v[k] = q; z[k] = s; z[k + 1] = float.PositiveInfinity;
            }
            k = 0;
            for (int q = 0; q < n; q++)
            {
                while (z[k + 1] < q) k++;
                int p = v[k];
                d[q] = (q - p) * (q - p) + f[p];
            }
        }

        // the classes and their distances into the textures' bytes (channel r for nations, g for provinces)
        static void Pack(PoliticalMap pm, Top top, int channel)
        {
            var dist = Distances(top);
            for (int py = 0; py < H; py++)
                for (int px = 0; px < W; px++)
                {
                    int i = py * W + px, o = ((H - 1 - py) * W + px) * 4;
                    pm.Ids[o + channel] = top.C1[i];
                    pm.Dist[o + channel] = (byte)Mathf.Clamp(Mathf.RoundToInt(dist[i] / Res / DistRange * 255), 0, 255);
                }
        }

        static void PaletteSet(PoliticalMap pm, int row, int k, Color c, float alpha)
        {
            int o = (row * 256 + k) * 4;
            pm.Palette[o] = (byte)(c.r * 255); pm.Palette[o + 1] = (byte)(c.g * 255); pm.Palette[o + 2] = (byte)(c.b * 255); pm.Palette[o + 3] = (byte)(alpha * 255);
        }
    }
}

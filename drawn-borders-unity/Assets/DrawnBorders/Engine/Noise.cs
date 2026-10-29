// Random numbers and noise, exactly as in the web game (engine section 2), so the same seed makes the same world.
// Pure C#: no Unity here, so the engine can be tested outside Unity.
using System;

namespace DrawnBorders.Engine
{
    /// <summary>mulberry32: the game's seeded random numbers (0 ≤ x &lt; 1).</summary>
    public sealed class Rng
    {
        uint a;
        public Rng(uint seed) { a = seed; }
        public double Next()
        {
            unchecked
            {
                a += 0x6D2B79F5u;
                uint t = a;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
        public T Pick<T>(T[] arr) { return arr[(int)Math.Floor(Next() * arr.Length)]; }
    }

    public static class Noise
    {
        public static double Hash2(int ix, int iy, int seed)
        {
            unchecked
            {
                uint h = (uint)ix * 374761393u + (uint)iy * 668265263u + (uint)seed * 1442695041u;
                h = (h ^ (h >> 13)) * 1274126177u;
                h ^= h >> 16;
                return h / 4294967296.0;
            }
        }

        public static double Smoothstep(double t) { return t * t * (3 - 2 * t); }

        public static double ValueNoise(double x, double y, int seed)
        {
            double fx0 = Math.Floor(x), fy0 = Math.Floor(y);
            int ix = (int)fx0, iy = (int)fy0;
            double fx = Smoothstep(x - fx0), fy = Smoothstep(y - fy0);
            double a = Hash2(ix, iy, seed), b = Hash2(ix + 1, iy, seed);
            double c = Hash2(ix, iy + 1, seed), d = Hash2(ix + 1, iy + 1, seed);
            return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
        }

        public static double Fbm(double x, double y, int seed, int octaves = 4)
        {
            double sum = 0, amp = 1, norm = 0, freq = 1;
            for (int o = 0; o < octaves; o++)
            {
                sum += amp * ValueNoise(x * freq, y * freq, seed + o * 101);
                norm += amp; amp *= 0.5; freq *= 2;
            }
            return sum / norm;
        }

        /// <summary>Sharp crests and valleys between (the web map painter's ridges).</summary>
        public static double Ridged(double x, double y, int seed) { return 1 - Math.Abs(2 * ValueNoise(x, y, seed) - 1); }

        public static double Clamp(double v, double lo, double hi) { return Math.Max(lo, Math.Min(hi, v)); }
        public static int Clamp(int v, int lo, int hi) { return Math.Max(lo, Math.Min(hi, v)); }
        public static double Smooth01(double a, double b, double v) { double t = Clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

        /// <summary>JavaScript's Math.round (halves go up), which C#'s Math.Round does not do.</summary>
        public static int JsRound(double v) { return (int)Math.Floor(v + 0.5); }
    }
}

// Saves the baked map as pictures, lit roughly as the Unity shader lights it, so the look can be checked without Unity.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using DrawnBorders.Bake;
using DrawnBorders.Engine;

static class Pictures
{
    public static void Save(string folder, int seed)
    {
        Directory.CreateDirectory(folder);
        var w = World.Generate(seed);
        var sw = Stopwatch.StartNew();
        var map = MapBaker.Bake(w, 24, s => Console.WriteLine($"  {s} ({sw.ElapsedMilliseconds} ms)"));
        Console.WriteLine($"baked {map.W}×{map.H} in {sw.ElapsedMilliseconds} ms");
        var sun = new[] { MapBaker.Sun[0], MapBaker.Sun[2], -MapBaker.Sun[1] };   // in Unity's axes: x right, y up, z north
        var rgb = new byte[map.W * map.H * 3];
        for (int k = 0; k < map.W * map.H; k++)
        {
            int o = k * 4;
            double coast = map.Data[o] / 255.0, rd = map.Data[o + 1] / 255.0 * MapBaker.RiverDistMax, rh = map.Data[o + 2] / 255.0 * MapBaker.RiverHalfMax, sky = map.Data[o + 3] / 255.0;
            double nx = map.Normal[o] / 255.0 * 2 - 1, ny = map.Normal[o + 1] / 255.0 * 2 - 1, nz = map.Normal[o + 2] / 255.0 * 2 - 1;
            double lit = map.Color[o + 3] / 255.0;
            double diff = Math.Max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]) * lit;
            double light = 0.42 * sky * (0.75 + 0.25 * ny) + 0.95 * diff;
            double r = map.Color[o] * light, g = map.Color[o + 1] * light, b = map.Color[o + 2] * light;
            if (rh > 0 && rd < Math.Max(rh, 0.02)) { r = 50; g = 104; b = 122; }
            if (coast < 0.5)
            {
                // water over the sea floor, deeper is darker and less clear
                double depth = (0.5 - coast) / MapBaker.DataK, clear = Math.Exp(-depth * 40);
                r = r * clear + 14 * (1 - clear); g = g * clear + 49 * (1 - clear); b = b * clear + 80 * (1 - clear);
            }
            rgb[k * 3] = (byte)Math.Min(255, r); rgb[k * 3 + 1] = (byte)Math.Min(255, g); rgb[k * 3 + 2] = (byte)Math.Min(255, b);
        }
        WritePng(Path.Combine(folder, $"map-{seed}.png"), map.W, map.H, rgb);
        Console.WriteLine($"saved {Path.Combine(folder, $"map-{seed}.png")}");
    }

    static void WritePng(string path, int w, int h, byte[] rgb)
    {
        using var fs = File.Create(path);
        fs.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var ihdr = new byte[13];
        Be(ihdr, 0, w); Be(ihdr, 4, h); ihdr[8] = 8; ihdr[9] = 2;
        Chunk(fs, "IHDR", ihdr);
        var raw = new MemoryStream();
        for (int y = 0; y < h; y++) { raw.WriteByte(0); raw.Write(rgb, y * w * 3, w * 3); }
        var comp = new MemoryStream();
        using (var z = new ZLibStream(comp, CompressionLevel.Fastest, true)) raw.WriteTo(z);
        Chunk(fs, "IDAT", comp.ToArray());
        Chunk(fs, "IEND", new byte[0]);
    }
    static void Be(byte[] b, int at, int v) { b[at] = (byte)(v >> 24); b[at + 1] = (byte)(v >> 16); b[at + 2] = (byte)(v >> 8); b[at + 3] = (byte)v; }
    static void Chunk(Stream s, string type, byte[] data)
    {
        var len = new byte[4]; Be(len, 0, data.Length); s.Write(len);
        var td = new byte[4 + data.Length];
        for (int i = 0; i < 4; i++) td[i] = (byte)type[i];
        Array.Copy(data, 0, td, 4, data.Length);
        s.Write(td);
        var crc = new byte[4]; Be(crc, 0, (int)Crc(td)); s.Write(crc);
    }
    static uint Crc(byte[] d)
    {
        uint c = 0xFFFFFFFF;
        foreach (byte x in d) { c ^= x; for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1; }
        return c ^ 0xFFFFFFFF;
    }
}

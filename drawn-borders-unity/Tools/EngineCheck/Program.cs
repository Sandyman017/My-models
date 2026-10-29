// Checks the C# engine against the web game's own output (Tools/js-reference.js), and can save the baked map as pictures.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.Json;
using DrawnBorders.Engine;

static class Program
{
    static int failures;
    static void Check(string what, string a, string b)
    {
        if (a == b) return;
        failures++;
        int at = 0; while (at < Math.Min(a.Length, b.Length) && a[at] == b[at]) at++;
        Console.WriteLine($"  DIFFERENT {what}: first at {at} (js {Snip(a, at)} / c# {Snip(b, at)})");
    }
    static string Snip(string s, int at) => at < s.Length ? s.Substring(at, Math.Min(12, s.Length - at)) : "<end>";
    static string Join(IEnumerable<byte> v) => string.Concat(v.Select(x => x.ToString()));

    static List<Pt> Loop(double cx, double cy, double rx, double ry)
    {
        var p = new List<Pt>();
        for (int k = 0; k < 28; k++) { double a = k / 28.0 * Math.PI * 2; p.Add(new Pt(cx + Math.Cos(a) * rx * (1 + 0.15 * Math.Sin(3 * a)), cy + Math.Sin(a) * ry)); }
        return p;
    }

    static int Main(string[] args)
    {
        if (args.Length < 1) { Console.WriteLine("usage: EngineCheck ref.json [png folder]"); return 2; }
        var doc = JsonDocument.Parse(System.IO.File.ReadAllText(args[0]));
        double[][] loops = { new double[] { 40, 32, 8, 6 }, new double[] { 30, 25, 7, 5 }, new double[] { 55, 35, 9, 6 }, new double[] { 48, 30, 5, 4 }, new double[] { 62, 28, 10, 7 } };
        foreach (var r in doc.RootElement.EnumerateArray())
        {
            int seed = r.GetProperty("seed").GetInt32();
            var sw = Stopwatch.StartNew();
            var w = World.Generate(seed);
            var sea = w.Sea; var rg = w.RiverGeo;
            Console.WriteLine($"seed {seed}: world in {sw.ElapsedMilliseconds} ms");
            Check("sea level", r.GetProperty("seaLevel").GetDouble().ToString("R"), ((double)w.SeaLevel).ToString("R"));
            Check("hill level", r.GetProperty("hillLevel").GetDouble().ToString("R"), ((double)w.HillLevel).ToString("R"));
            Check("mountain level", r.GetProperty("mountainLevel").GetDouble().ToString("R"), ((double)w.MountainLevel).ToString("R"));
            Check("land count", r.GetProperty("landCount").GetInt32().ToString(), w.LandCount.ToString());
            Check("terrain", r.GetProperty("terrain").GetString(), Join(w.Terrain.Select(t => (byte)t)));
            Check("deposits", r.GetProperty("dep").GetString(), Join(w.Dep));
            Check("hidden deposits", r.GetProperty("hid").GetString(), Join(w.Hid));
            Check("coast", r.GetProperty("coastal").GetString(), Join(w.Coastal));
            Check("rivers", r.GetProperty("rivers").GetString(), Join(w.Rivers.Cells));
            Check("ocean", r.GetProperty("ocean").GetString(), Join(sea.Ocean));
            Check("navigable rivers", r.GetProperty("nav").GetString(), string.Concat(rg.Nav.Select(v => v < 0 ? "." : ((char)(65 + v % 26)).ToString())));
            int li = 0;
            foreach (var c in r.GetProperty("claims").EnumerateArray())
            {
                var L = loops[li++];
                var res = Borders.ClaimFromPath(w, Loop(L[0], L[1], L[2], L[3]));
                bool ok = c.GetProperty("ok").GetBoolean();
                Check($"claim {li} ok", ok.ToString(), res.Ok.ToString());
                if (!ok) { if (!res.Ok) Check($"claim {li} error", c.GetProperty("error").GetString(), res.Error); continue; }
                if (!res.Ok) continue;
                var p = FoundingPreview.Make(w, res.Cells);
                Check($"claim {li} cells", c.GetProperty("cells").GetString(), string.Join(",", res.Cells));
                Check($"claim {li} dropped", c.GetProperty("dropped").GetInt32().ToString(), res.DroppedCells.ToString());
                string js = $"{c.GetProperty("stability")} {c.GetProperty("defense")} {c.GetProperty("shapeTerm")} {c.GetProperty("sizeTerm")} {c.GetProperty("ruggedTerm")} {c.GetProperty("exposureTerm")}";
                var t = p.Traits;
                Check($"claim {li} traits", js, $"{t.Stability} {t.Defense} {t.ShapeTerm} {t.SizeTerm} {t.RuggedTerm} {t.ExposureTerm}");
                Check($"claim {li} people", c.GetProperty("people").GetString(), p.People.ToString("0.0000", System.Globalization.CultureInfo.InvariantCulture));
                Check($"claim {li} farmland", c.GetProperty("farmland").GetString(), p.Farmland.ToString("0.0000", System.Globalization.CultureInfo.InvariantCulture));
                Check($"claim {li} open-sea cells", c.GetProperty("ocean").GetInt32().ToString(), p.OceanCells.ToString());
                Check($"claim {li} towns", c.GetProperty("towns").GetString(), string.Join(",", p.Towns.Select(x => $"{x.Cell}:{x.Name}")));
            }
        }
        if (args.Length > 1) Pictures.Save(args[1], doc.RootElement.EnumerateArray().First().GetProperty("seed").GetInt32());
        Console.WriteLine(failures == 0 ? "ALL THE SAME as the web game" : $"{failures} differences");
        return failures == 0 ? 0 : 1;
    }
}

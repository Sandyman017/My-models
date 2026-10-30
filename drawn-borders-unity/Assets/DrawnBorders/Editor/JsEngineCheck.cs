// The same-results check, Unity's side: plays the worlds of Tools/js-engine/check.js with the engine running in Unity (JsEngine)
// and writes the same summary Node writes, with Unity's times. Batch mode (Unity closed):
//   Unity.exe -batchmode -quit -projectPath . -executeMethod DrawnBorders.JsEngineCheck.Run -logFile unity.log -checkOut unity.txt
// or the menu Drawn Borders > Check the JS engine (writes Temp/js-check/unity.txt). Then compare with Node:
//   node Tools/js-engine/node-check.js --compare node.txt unity.txt
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using DrawnBorders.Js;
using UnityEditor;
using Debug = UnityEngine.Debug;

namespace DrawnBorders
{
    public static class JsEngineCheck
    {
        static string ProjectDir => Path.GetDirectoryName(UnityEngine.Application.dataPath);

        /// <summary>For -executeMethod: writes the summary to the file after -checkOut and quits with 0, or 1 on any error.</summary>
        public static void Run()
        {
            int code = 1;
            try
            {
                string outFile = Path.Combine(ProjectDir, "Temp", "js-check", "unity.txt");
                string[] args = Environment.GetCommandLineArgs();
                for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "-checkOut") outFile = Path.GetFullPath(args[i + 1]);
                Play(outFile);
                code = 0;
            }
            catch (Exception e) { Debug.LogError("JS engine check failed: " + e); }
            EditorApplication.Exit(code);
        }

        [MenuItem("Drawn Borders/Check the JS engine (same as Node)")]
        static void RunFromMenu()
        {
            try { Play(Path.Combine(ProjectDir, "Temp", "js-check", "unity.txt")); }
            catch (Exception e) { Debug.LogError("JS engine check failed: " + e); }
        }

        static void Play(string outFile)
        {
            var notes = new List<string>();
            var body = new List<string>();
            var sw = Stopwatch.StartNew();
            using (var js = new JsEngine())
            {
                js.Run(File.ReadAllText(Path.Combine(ProjectDir, "Tools", "js-engine", "check.js")), "check.js");
                double load = sw.Elapsed.TotalMilliseconds;
                notes.Add($"# host: Unity {UnityEngine.Application.unityVersion} · PuerTS V8 · {js.Eval<string>("SameCheck.hostNote()")} · engine loaded in {load:0} ms");
                int seasons = js.Eval<int>("SameCheck.seasons");
                foreach (string s in js.Eval<string>("SameCheck.seeds.join(',')").Split(','))
                {
                    int seed = int.Parse(s);
                    sw.Restart();
                    js.Run($"SameCheck.start({seed})");
                    double start = sw.Elapsed.TotalMilliseconds;
                    var times = new List<string>();
                    double total = 0;
                    for (int k = 0; k < seasons; k++)
                    {
                        sw.Restart();
                        js.Run("SameCheck.season()");
                        double t = sw.Elapsed.TotalMilliseconds;
                        total += t;
                        times.Add(t.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture));
                    }
                    body.Add(js.Eval<string>("SameCheck.finish()"));
                    notes.Add($"# time world {seed}: start {start.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)} ms · seasons {string.Join(" ", times)} ms");
                    Debug.Log($"JS engine check: world {seed}: {seasons} seasons, {total / seasons:0} ms a season");
                }
            }
            Directory.CreateDirectory(Path.GetDirectoryName(outFile));
            var all = new List<string>(notes);
            all.AddRange(body);
            File.WriteAllText(outFile, string.Join("\n", all) + "\n");
            Debug.Log("JS engine check: wrote " + outFile);
        }
    }
}

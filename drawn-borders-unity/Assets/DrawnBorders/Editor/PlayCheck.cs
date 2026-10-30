// A look at the game with nobody at the keyboard: Unity in batch mode presses Play and goes through the founding (a sample
// shape, Found this nation, the provinces divided in five, a province drawn with the pen, a name changed, Start), plays 8
// seasons (the first option of every decision) and saves a picture of the map after each step. The panels and names (IMGUI) are not in the pictures: batch mode draws no windows.
//   Unity.exe -batchmode -projectPath <project> -executeMethod DrawnBorders.PlayCheck.Run -logFile <log> -shotDir <folder>
// (without -quit: it quits by itself, with exit code 1 if anything went wrong). The project must not be open in the editor.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using DrawnBorders.Engine;
using DrawnBorders.Game;
using DrawnBorders.Js;
using UnityEditor;
using UnityEngine;

namespace DrawnBorders
{
    public static class PlayCheck
    {
        const string Active = "DrawnBorders.PlayCheck.active", Dir = "DrawnBorders.PlayCheck.dir";
        static int step, errors, seasonsPlayed;
        static double waitUntil, started;
        static readonly BindingFlags Any = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;

        public static void Run()
        {
            string dir = Path.Combine(Path.GetDirectoryName(Application.dataPath), "Temp", "play-check");
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "-shotDir") dir = Path.GetFullPath(args[i + 1]);
            Directory.CreateDirectory(dir);
            SessionState.SetString(Dir, dir);
            SessionState.SetBool(Active, true);
            EditorApplication.EnterPlaymode();
        }

        // entering Play reloads the scripts: this hooks the steps in again afterwards
        [InitializeOnLoadMethod]
        static void Hook()
        {
            if (!SessionState.GetBool(Active, false)) return;
            EditorApplication.update += Tick;
            Application.logMessageReceived += (msg, stack, type) =>
            {
                // (Unity's own search index sometimes fails as batch mode starts: not the game's)
                if ((type == LogType.Error || type == LogType.Exception || type == LogType.Assert) && !(stack ?? "").Contains("UnityEditor.Search")) errors++;
            };
        }

        static void Finish(int code, string why)
        {
            Debug.Log("Play check: " + why + (errors > 0 ? " · " + errors + " error(s) in the log" : ""));
            SessionState.SetBool(Active, false);
            EditorApplication.update -= Tick;
            EditorApplication.Exit(code != 0 || errors > 0 ? 1 : 0);
        }

        static object Get(object o, string name) { return o.GetType().GetField(name, Any).GetValue(o); }
        static object Call(object o, string name, params object[] args) { return o.GetType().GetMethod(name, Any).Invoke(o, args); }

        static void Tick()
        {
            if (!EditorApplication.isPlaying) return;
            double now = EditorApplication.timeSinceStartup;
            if (started == 0) started = now;
            if (now - started > 240) { Finish(1, "timed out at step " + step); return; }
            if (now < waitUntil) return;
            var game = FoundingGame.Instance;
            if (game == null) return;
            string phase = Get(game, "phase").ToString();
            var engine = (EngineThread)Get(game, "engine");
            try
            {
                switch (step)
                {
                    case 0:
                        if (phase != "Draw" || engine == null || !engine.Ready) { if (engine != null && engine.Error != null) Finish(1, "the engine did not start: " + engine.Error); return; }
                        Call(game, "TrySample");
                        Next(2.5, "a sample shape drawn");
                        break;
                    case 1:
                        Shot(game, "1-borders");
                        Call(game, "Found");
                        Next(0, "Found this nation pressed");
                        break;
                    case 2:
                        if (phase != "Provinces") { if (phase == "Draw") Finish(1, "founding failed: " + Get(game, "engineError")); return; }
                        Report(game);
                        Next(3, "the provinces step is open");
                        break;
                    case 3:
                        Shot(game, "2-provinces");
                        Call(game, "Do", "U.autoDivide(5)");
                        Next(0.5, "divided into 5");
                        break;
                    case 4:
                        Shot(game, "3-five-provinces");
                        Report(game);
                        // a line with the pen around the national capital
                        var st = (GameState)Get(game, "state");
                        var cap = Array.Find(st.towns, t => t.owner == Rules.Player && t.capital);
                        var path = (List<Pt>)Get(game, "path");
                        path.Clear();
                        for (int k = 0; k < 24; k++)
                        {
                            double a = k / 24.0 * Math.PI * 2;
                            path.Add(new Pt(Rules.CellX(cap.cell) + 0.5 + Math.Cos(a) * 3.2, Rules.CellY(cap.cell) + 0.5 + Math.Sin(a) * 2.6));
                        }
                        Call(game, "PenDone");
                        var pen = (PenReply)Get(game, "pen");
                        if (pen == null) { Finish(1, "the pen found no land: " + Get(game, "provHint")); return; }
                        Debug.Log("Play check: the pen drew " + pen.area + " · " + pen.people + " · towns " + string.Join(", ", pen.towns) + " · new province allowed: " + pen.canNew);
                        Call(game, "PenChoose", -1);
                        Next(0.5, "a new province from the pen");
                        break;
                    case 5:
                        Shot(game, "4-pen-province");
                        var rows = (ProvinceRows)Get(game, "rows");
                        Call(game, "Do", "U.rename(" + rows.rows[0].id + ", \"Northmarch\")");
                        Report(game);
                        if (Get(game, "provHint") != null) Debug.LogWarning("Play check: hint after the changes: " + Get(game, "provHint"));
                        Call(game, "StartPlaying");
                        Next(3.5, "Start with these provinces pressed");
                        break;
                    case 6:
                        if (phase != "Play") { Finish(1, "Start did not work: " + Get(game, "provHint")); return; }
                        foreach (var l in (string[])Get(game, "startLines")) Debug.Log("Play check: story: " + l);
                        Shot(game, "5-started-whole-map");
                        Hud(game);
                        Call(game, "EndSeasonNow");
                        Next(0, "the first season is ending");
                        break;
                    case 7:
                        // seasons one after another; the first option of every decision that opens
                        if (Get(game, "seasonTask") != null) return;
                        var hudInfo = (HudInfo)Get(game, "hud");
                        int open = (int)Get(game, "openDecision");
                        if (open >= 0)
                        {
                            var d = Array.Find((DecisionInfo[])Get(game, "decisionsOpen"), x => x.id == open);
                            Debug.Log("Play check: decision “" + d.title + "”: " + d.options[0].label + " (" + d.options.Length + " options)");
                            Call(game, "Decide", d.id, d.options[0].id);
                        }
                        if (Get(game, "pauseWhy") != null) Debug.Log("Play check: paused by the game: " + Get(game, "pauseWhy"));
                        Hud(game);
                        if ((bool)Get(game, "collapsed")) { Debug.Log("Play check: the government fell"); Next(0.5, "the end"); break; }
                        if (++seasonsPlayed < 8) { Call(game, "EndSeasonNow"); return; }
                        Next(0.5, seasonsPlayed + " seasons played (" + hudInfo.season + ")");
                        break;
                    case 8:
                        Shot(game, "6-after-8-seasons");
                        var st2 = (GameState)Get(game, "state");
                        var cap2 = Array.Find(st2.towns, t => t.owner == Rules.Player && t.capital) ?? st2.towns[0];
                        var rig = (CameraRig)Get(game, "rig");
                        var map = (MapView)Get(game, "map");
                        rig.LookAt(map.CellCentre(cap2.cell), 12);
                        Next(3.5, "close to the capital");
                        break;
                    case 9:
                        Shot(game, "7-close");
                        Finish(0, "all steps done, pictures in " + SessionState.GetString(Dir, ""));
                        break;
                }
            }
            catch (Exception e)
            {
                Debug.LogException(e is TargetInvocationException && e.InnerException != null ? e.InnerException : e);
                Finish(1, "failed at step " + step);
            }
        }

        static void Next(double wait, string what)
        {
            Debug.Log("Play check: step " + step + ": " + what);
            step++;
            waitUntil = EditorApplication.timeSinceStartup + wait;
        }

        static void Hud(FoundingGame game)
        {
            var h = (HudInfo)Get(game, "hud");
            if (h == null) { Debug.LogWarning("Play check: no top bar"); return; }
            var parts = new List<string>();
            foreach (var s in h.stats) parts.Add(s.key + " " + s.value + (s.note != "" ? " (" + s.note + ")" : ""));
            Debug.Log("Play check: " + h.season + " · " + string.Join(" · ", parts));
        }

        static void Report(FoundingGame game)
        {
            var st = (GameState)Get(game, "state");
            var rows = (ProvinceRows)Get(game, "rows");
            var names = new List<string>();
            if (rows != null && rows.rows != null) foreach (var r in rows.rows) names.Add(r.name + " (" + r.area + ", " + r.people + ", " + (r.towns.Length == 0 ? "territory" : r.towns.Length + " towns") + ")");
            Debug.Log("Play check: " + st.nations.Length + " nations, " + st.provinces.Length + " provinces, " + st.towns.Length + " towns · yours: " + string.Join("; ", names));
        }

        // the map as the camera sees it, 1600 × 900
        static void Shot(FoundingGame game, string name)
        {
            var cam = ((CameraRig)Get(game, "rig")).Cam;
            var rt = new RenderTexture(1600, 900, 24);
            var old = cam.targetTexture;
            float aspect = cam.aspect;
            cam.targetTexture = rt; cam.aspect = 1600f / 900f;
            cam.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(1600, 900, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, 1600, 900), 0, 0);
            tex.Apply();
            RenderTexture.active = null;
            cam.targetTexture = old; cam.aspect = aspect;
            string file = Path.Combine(SessionState.GetString(Dir, ""), name + ".png");
            File.WriteAllBytes(file, tex.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(tex);
            rt.Release(); UnityEngine.Object.DestroyImmediate(rt);
            Debug.Log("Play check: saved " + file);
        }
    }
}

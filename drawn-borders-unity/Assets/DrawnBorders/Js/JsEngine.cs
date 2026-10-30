// The web game's rules engine (drawn-borders/src/engine, JavaScript) running inside Unity on V8, the browser's own engine,
// through PuerTS (Assets/ThirdParty/PuerTS). The engine is one script, Resources/DrawnBorders/engine-bundle.txt, written by
// Tools/js-engine/bundle.js; once it is loaded, every function and constant of the engine is a global that Run and Eval can use.
// One JsEngine is one JavaScript world: make it and use it on one thread, and Dispose it there when done.
using System;
using System.Collections.Generic;
using Puerts;
using UnityEngine;

namespace DrawnBorders.Js
{
    public sealed class JsEngine : IDisposable
    {
        /// <summary>The texts an engine starts from: the bundle and PuerTS's own start-up modules. Read them on the main
        /// thread (Unity's Resources work only there); the engine can then start on any thread.</summary>
        public sealed class Sources : ILoader, IModuleChecker
        {
            public readonly string Bundle;
            readonly Dictionary<string, string> modules = new Dictionary<string, string>();

            Sources(string bundle) { Bundle = bundle; }

            public static Sources Load()
            {
                var bundle = Resources.Load<TextAsset>("DrawnBorders/engine-bundle");
                if (bundle == null) throw new InvalidOperationException("Resources/DrawnBorders/engine-bundle.txt is missing: run  node Tools/js-engine/bundle.js");
                var s = new Sources(bundle.text);
                foreach (var t in Resources.LoadAll<TextAsset>("puerts")) s.modules[t.name] = t.text;
                return s;
            }

            // "puerts/log.mjs" is the asset "log" (PuerTS's importers drop .mjs and .cjs)
            static string Key(string path)
            {
                int slash = path.LastIndexOf('/');
                string n = slash >= 0 ? path.Substring(slash + 1) : path;
                return n.EndsWith(".mjs") || n.EndsWith(".cjs") ? n.Substring(0, n.Length - 4) : n;
            }

            public bool FileExists(string path) { return modules.ContainsKey(Key(path)); }

            public string ReadFile(string path, out string debugPath)
            {
                debugPath = path;
                string text;
                return modules.TryGetValue(Key(path), out text) ? text : null;
            }

            public bool IsESM(string path) { return path.Length >= 4 && !path.EndsWith(".cjs"); }
        }

        readonly ScriptEnv env;

        /// <summary>On the main thread.</summary>
        public JsEngine() : this(Sources.Load()) { }

        /// <summary>On any thread (about 1.5 s).</summary>
        public JsEngine(Sources sources)
        {
            env = new ScriptEnv(new BackendV8(sources));
            env.Eval(sources.Bundle, "engine-bundle.txt");
        }

        /// <summary>Runs JavaScript in the engine's world. A JavaScript error is thrown as InvalidOperationException.</summary>
        public void Run(string code, string name = "chunk") => env.Eval(code, name);

        /// <summary>Runs a JavaScript expression and returns its value (string, double, int, bool).</summary>
        public T Eval<T>(string code, string name = "chunk") => env.Eval<T>(code, name);

        public void Dispose() => env.Dispose();
    }
}

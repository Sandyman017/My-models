// The web game's rules engine (drawn-borders/src/engine, JavaScript) running inside Unity on V8, the browser's own engine,
// through PuerTS (Assets/ThirdParty/PuerTS). The engine is one script, Resources/DrawnBorders/engine-bundle.txt, written by
// Tools/js-engine/bundle.js; once it is loaded, every function and constant of the engine is a global that Run and Eval can use.
// One JsEngine is one JavaScript world: use it from one thread, and Dispose it when done.
using System;
using Puerts;
using UnityEngine;

namespace DrawnBorders.Js
{
    public sealed class JsEngine : IDisposable
    {
        readonly ScriptEnv env;

        public JsEngine()
        {
            var bundle = Resources.Load<TextAsset>("DrawnBorders/engine-bundle");
            if (bundle == null) throw new InvalidOperationException("Resources/DrawnBorders/engine-bundle.txt is missing: run  node Tools/js-engine/bundle.js");
            env = new ScriptEnv(new BackendV8());
            env.Eval(bundle.text, "engine-bundle.txt");
        }

        /// <summary>Runs JavaScript in the engine's world. A JavaScript error is thrown as InvalidOperationException.</summary>
        public void Run(string code, string name = "chunk") => env.Eval(code, name);

        /// <summary>Runs a JavaScript expression and returns its value (string, double, int, bool).</summary>
        public T Eval<T>(string code, string name = "chunk") => env.Eval<T>(code, name);

        public void Dispose() => env.Dispose();
    }
}

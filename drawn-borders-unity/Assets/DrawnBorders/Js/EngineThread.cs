// The game's engine on a thread of its own, so starting it (1.5 s) or playing a season (half a second) never freezes the
// screen. Every call goes through one queue, in order; the answer comes back as a Task to check in Update, or at once
// with CallNow for quick calls.
using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace DrawnBorders.Js
{
    public sealed class EngineThread : IDisposable
    {
        readonly BlockingCollection<Action<JsEngine>> work = new BlockingCollection<Action<JsEngine>>();
        volatile bool ready;
        volatile string error;

        /// <summary>The engine has started.</summary>
        public bool Ready => ready;
        /// <summary>Why the engine could not start, or null.</summary>
        public string Error => error;

        /// <summary>On the main thread: reads the engine's texts here, then starts it on its own thread.</summary>
        public EngineThread()
        {
            var sources = JsEngine.Sources.Load();
            // a roomy stack: V8 counts on one, and a deep search in the rules must not run out of it
            var thread = new Thread(() => Loop(sources), 16 * 1024 * 1024) { IsBackground = true, Name = "Drawn Borders engine" };
            thread.Start();
        }

        void Loop(JsEngine.Sources sources)
        {
            JsEngine js = null;
            try { js = new JsEngine(sources); ready = true; }
            catch (Exception e) { error = e.Message; UnityEngine.Debug.LogException(e); }
            foreach (var job in work.GetConsumingEnumerable()) job(js);
            if (js != null) js.Dispose();
        }

        /// <summary>Runs a JavaScript expression that gives text (the bridge's U.… calls give JSON).</summary>
        public Task<string> Call(string code)
        {
            var done = new TaskCompletionSource<string>();
            try
            {
                work.Add(js =>
                {
                    if (js == null) { done.SetException(new InvalidOperationException("The game's engine did not start: " + error)); return; }
                    try { done.SetResult(js.Eval<string>(code)); }
                    catch (Exception e) { done.SetException(e); }
                });
            }
            catch (InvalidOperationException) { done.SetException(new ObjectDisposedException("EngineThread")); }
            return done.Task;
        }

        /// <summary>Call and wait for the answer: for quick calls only.</summary>
        public string CallNow(string code)
        {
            try { return Call(code).Result; }
            catch (AggregateException e) { throw e.GetBaseException(); }
        }

        public void Dispose() { work.CompleteAdding(); }

        /// <summary>A C# text as a JavaScript string literal.</summary>
        public static string Str(string s)
        {
            var b = new StringBuilder("\"");
            foreach (char c in s ?? "")
            {
                if (c == '"' || c == '\\') b.Append('\\').Append(c);
                else if (c < 32 || c == 0x2028 || c == 0x2029) b.Append("\\u").Append(((int)c).ToString("x4"));
                else b.Append(c);
            }
            return b.Append('"').ToString();
        }

        /// <summary>A number as JavaScript writes it (always with a dot).</summary>
        public static string Num(double v) { return v.ToString("R", CultureInfo.InvariantCulture); }
    }
}

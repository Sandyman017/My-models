// Time that runs, as in the web game (ui/51-17e-…): each season lasts 36, 18 or 8 seconds (speed 1, 2, 3), Space pauses,
// and the game pauses by itself when something needs you. The season itself is the engine's (U.endSeason, on the engine's
// thread, so the screen never freezes); this file shows it: the bar at the top, the news, the decision cards, the report.
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using DrawnBorders.Js;
using UnityEngine;

namespace DrawnBorders.Game
{
    public sealed partial class FoundingGame
    {
        static readonly float[] SeasonSeconds = { 0, 36, 18, 8 };

        sealed class NewsEntry { public NewsItem Item; public string Season; public int Turn; }
        sealed class Report { public string Season; public int Turn; public NewsItem[] Items; }

        int speed = 1, turnNow;
        bool paused = true, collapsed;
        float clock;
        string pauseWhy;                                 // why time stopped by itself
        Task<string> seasonTask;                         // U.endSeason, while it runs
        HudInfo hud;
        DecisionInfo[] decisionsOpen = new DecisionInfo[0];
        int openDecision = -1;                           // the decision card on screen
        readonly HashSet<int> seenDecisions = new HashSet<int>();
        readonly List<NewsEntry> news = new List<NewsEntry>();
        readonly List<Report> reports = new List<Report>();
        Report openReport;
        string hint; float hintUntil;
        Vector2 reportScroll;
        readonly List<Rect> uiRects = new List<Rect>();  // what covers the map, in screen pixels (bottom-left origin)

        /// <summary>After "Start with these provinces": time is ready, paused.</summary>
        void BeginPlay(SeasonResult first)
        {
            phase = Phase.Play;
            paused = true; collapsed = false; clock = 0; pauseWhy = null; openDecision = -1; openReport = null;
            news.Clear(); reports.Clear(); seenDecisions.Clear();
            turnNow = state.turn;
            AddNews(first);
            LoadHud();
            LoadDecisions();
        }

        void ForgetPlay()
        {
            seasonTask = null; hud = null; decisionsOpen = new DecisionInfo[0]; openDecision = -1; openReport = null;
            news.Clear(); reports.Clear(); seenDecisions.Clear(); uiRects.Clear(); pauseWhy = null; hint = null; collapsed = false;
        }

        void LoadHud()
        {
            try { hud = JsonUtility.FromJson<HudInfo>(engine.CallNow("U.hud()")); }
            catch (Exception e) { Debug.LogException(e); }
        }

        void LoadDecisions()
        {
            try { decisionsOpen = JsonUtility.FromJson<DecisionList>(engine.CallNow("U.decisions()")).list ?? new DecisionInfo[0]; }
            catch (Exception e) { Debug.LogException(e); decisionsOpen = new DecisionInfo[0]; }
            if (openDecision >= 0 && Array.Find(decisionsOpen, d => d.id == openDecision) == null) openDecision = -1;
            // a new decision opens by itself (autoOpenDecision)
            if (openDecision < 0)
                foreach (var d in decisionsOpen)
                    if (seenDecisions.Add(d.id)) { openDecision = d.id; break; }
        }

        void AddNews(SeasonResult r)
        {
            if (r.news != null) for (int i = r.news.Length - 1; i >= 0; i--) news.Insert(0, new NewsEntry { Item = r.news[i], Season = r.season, Turn = turnNow });
            if (news.Count > 40) news.RemoveRange(40, news.Count - 40);
            if (r.report != null && r.report.Length > 0)
            {
                reports.Insert(0, new Report { Season = r.season, Turn = turnNow, Items = r.report });
                if (reports.Count > 8) reports.RemoveAt(reports.Count - 1);
            }
        }

        void TickTime()
        {
            if (seasonTask != null) { if (seasonTask.IsCompleted) FinishSeason(); return; }
            if (!typing && InputState.KeyDown(KeyCode.Space)) TogglePause();
            if (InputState.KeyDown(KeyCode.Escape)) { openDecision = -1; openReport = null; }
            bool blocked = collapsed || openDecision >= 0 || openReport != null;
            if (paused || blocked) return;
            clock += Mathf.Min(0.25f, Time.unscaledDeltaTime);
            if (clock >= SeasonSeconds[speed]) EndSeasonNow();
        }

        void EndSeasonNow()
        {
            if (seasonTask != null || collapsed) return;
            clock = 0; pauseWhy = null;
            seasonTask = engine.Call("U.endSeason()");
        }

        void TogglePause()
        {
            if (collapsed) return;
            paused = !paused;
            if (!paused) pauseWhy = null;
        }

        void SetSpeed(int v)
        {
            clock = clock / SeasonSeconds[speed] * SeasonSeconds[v];
            speed = v;
            if (paused) { paused = false; pauseWhy = null; }
        }

        void FinishSeason()
        {
            var task = seasonTask;
            seasonTask = null;
            if (task.IsFaulted)
            {
                var ex = task.Exception != null ? task.Exception.GetBaseException() : null;
                Debug.LogException(ex ?? new Exception("the season failed"));
                paused = true;
                pauseWhy = "Something went wrong while the season was ending: " + (ex != null ? ex.Message : "unknown error");
                return;
            }
            var r = JsonUtility.FromJson<SeasonResult>(task.Result);
            try { ApplyState(JsonUtility.FromJson<GameState>(engine.CallNow("U.state()"))); }
            catch (Exception e) { Debug.LogException(e); }
            turnNow = state.turn;
            AddNews(r);
            LoadHud();
            LoadDecisions();
            if (!string.IsNullOrEmpty(r.pause)) { paused = true; pauseWhy = r.pause; }
            if (r.collapsed) { collapsed = true; paused = true; pauseWhy = null; openDecision = -1; }
        }

        void Decide(int id, string optId)
        {
            try
            {
                var r = JsonUtility.FromJson<DecideReply>(engine.CallNow("U.decide(" + id + ", " + EngineThread.Str(optId) + ")"));
                ShowHint(r.ok ? r.text : r.reason);
            }
            catch (Exception e) { ShowHint(e.Message); Debug.LogException(e); }
            openDecision = -1;
            LoadHud();
            LoadDecisions();
            try { ApplyState(JsonUtility.FromJson<GameState>(engine.CallNow("U.state()"))); }
            catch (Exception e) { Debug.LogException(e); }
        }

        void ShowHint(string text) { hint = text; hintUntil = Time.unscaledTime + 5; }

        void OpenNews(NewsEntry e)
        {
            if (e.Item.go == "decision" && Array.Find(decisionsOpen, d => d.id == e.Item.id) != null) { openDecision = e.Item.id; return; }
            openReport = reports.Find(r => r.Turn == e.Turn) ?? (reports.Count > 0 ? reports[0] : null);
        }

        // ---------- on screen ----------

        Color ToneColor(string tone)
        {
            return tone == "good" ? Good : tone == "bad" ? Bad : tone == "warn" ? MapView.Hex("#e8b35a") : Neutral;
        }

        void AddUiRect(Rect r)
        {
            if (Event.current.type == EventType.Repaint) uiRects.Add(new Rect(r.x * uiScale, Screen.height - (r.y + r.height) * uiScale, r.width * uiScale, r.height * uiScale));
        }

        void PlayGui(float vw, float vh)
        {
            if (Event.current.type == EventType.Repaint) uiRects.Clear();
            GameLabels();
            TopBar(vw);
            NewsPanel(vw, vh);
            KeysHelp(vh);
            if (pauseWhy != null) PauseBanner(vw);
            if (hint != null && Time.unscaledTime < hintUntil) HintLine(vw, vh);
            if (collapsed) CollapsedCard(vw, vh);
            else if (openDecision >= 0) DecisionCard(vw, vh);
            else if (openReport != null) ReportCard(vw, vh);
        }

        bool ModalOpen => phase == Phase.Play && (collapsed || openDecision >= 0 || openReport != null);

        void Box(Rect r, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, white);
            GUI.color = old;
        }

        void TopBar(float vw)
        {
            var bar = new Rect(0, 0, vw, 52);
            Box(bar, new Color(0.05f, 0.075f, 0.1f, 0.92f));
            AddUiRect(bar);
            if (hud == null) return;
            float x = 14;
            Box(new Rect(x, 17, 14, 18), MapView.Hex(hud.color));
            x += 22;
            var name = new GUIContent(hud.name);
            float nw = Mathf.Min(220, barName.CalcSize(name).x);
            GUI.Label(new Rect(x, 14, nw, 24), name, barName);
            x += nw + 18;
            // the clock on the right
            float right = vw - 12;
            for (int v = 3; v >= 1; v--)
            {
                right -= 34;
                var st = !paused && speed == v ? speedOn : speedOff;
                if (GUI.Button(new Rect(right, 12, 32, 28), new string('▶', v), st)) SetSpeed(v);
            }
            right -= 84;
            if (GUI.Button(new Rect(right, 12, 80, 28), paused ? "▶ Play" : "❚❚ Pause", paused ? primary : button)) TogglePause();
            right -= 8;
            float cw = 150;
            right -= cw;
            GUI.Label(new Rect(right, 6, cw, 20), hud.season, barSeason);
            GUI.Label(new Rect(right, 24, cw, 16), hud.era, barEra);
            var track = new Rect(right, 42, cw, 4);
            Box(track, new Color(1, 1, 1, 0.12f));
            Box(new Rect(track.x, track.y, track.width * Mathf.Clamp01(seasonTask != null ? 1 : clock / SeasonSeconds[speed]), track.height), seasonTask != null ? Gold : new Color(1, 1, 1, 0.55f));
            // the figures between
            float avail = right - 16 - x;
            int n = hud.stats != null ? hud.stats.Length : 0;
            if (n == 0) return;
            float w = Mathf.Max(70, avail / n);
            for (int i = 0; i < n && x + w <= right; i++)
            {
                var s = hud.stats[i];
                GUI.Label(new Rect(x, 7, w, 14), s.key.ToUpperInvariant(), statKey);
                GUI.Label(new Rect(x, 21, w, 20), s.value, barValue);
                if (!string.IsNullOrEmpty(s.note))
                {
                    var st = new GUIStyle(barNote);
                    st.normal.textColor = ToneColor(s.tone);
                    GUI.Label(new Rect(x, 37, w, 14), s.note, st);
                }
                x += w;
            }
        }

        void NewsPanel(float vw, float vh)
        {
            float pw = Mathf.Min(360, vw * 0.3f);
            var area = new Rect(vw - pw - 12, 64, pw, vh - 80);
            GUILayout.BeginArea(area);
            GUILayout.BeginVertical(panel);
            GUILayout.BeginHorizontal();
            GUILayout.Label("NEWS", eyebrow, GUILayout.ExpandWidth(false));
            GUILayout.FlexibleSpace();
            if (reports.Count > 0 && GUILayout.Button("Season report", linkButton, GUILayout.ExpandWidth(false))) openReport = reports[0];
            GUILayout.EndHorizontal();
            GUILayout.Space(4);
            int latest = news.Count > 0 ? news[0].Turn : -1, shown = 0;
            foreach (var e in news)
            {
                if (shown++ >= 7) break;
                var st = new GUIStyle(newsItem);
                var c = ToneColor(e.Item.tone);
                st.normal.textColor = e.Turn == latest ? Color.Lerp(c, Ink, 0.35f) : Color.Lerp(c, Soft, 0.6f);
                GUILayout.BeginHorizontal();
                var dot = GUILayoutUtility.GetRect(6, 18, GUILayout.Width(6));
                Box(new Rect(dot.x, dot.y + 6, 5, 5), c);
                GUILayout.Space(6);
                if (GUILayout.Button(e.Item.text, st)) OpenNews(e);
                GUILayout.EndHorizontal();
                GUILayout.Space(2);
            }
            if (seasonTask != null) GUILayout.Label("The season is ending…", muted);
            GUILayout.EndVertical();
            var used = GUILayoutUtility.GetLastRect();
            GUILayout.EndArea();
            AddUiRect(new Rect(area.x, area.y, area.width, used.height));
        }

        void KeysHelp(float vh)
        {
            const string keys = "Space: pause / play   Right-drag: move   Wheel or R / F: zoom   Q / E: turn   Home: whole map";
            var size = help.CalcSize(new GUIContent(keys));
            var box = new Rect(12, vh - size.y - 20, size.x + 20, size.y + 10);
            Box(box, new Color(0.04f, 0.06f, 0.08f, 0.55f));
            GUI.Label(new Rect(box.x + 10, box.y + 5, size.x, size.y), keys, help);
        }

        void PauseBanner(float vw)
        {
            var size = notice.CalcSize(new GUIContent(pauseWhy));
            float w = Mathf.Min(size.x + 4, vw * 0.5f);
            float h = notice.CalcHeight(new GUIContent(pauseWhy), w);
            var r = new Rect((vw - w) / 2, 62, w, h);
            GUI.Label(r, pauseWhy, notice);
            GUI.Label(new Rect(r.x, r.yMax + 2, w, 16), "Paused. Space or ▶ Play to go on.", centeredMuted);
            AddUiRect(r);
        }

        void HintLine(float vw, float vh)
        {
            var size = info.CalcSize(new GUIContent(hint));
            float w = Mathf.Min(size.x + 4, vw * 0.5f);
            GUI.Label(new Rect((vw - w) / 2, vh - 80, w, info.CalcHeight(new GUIContent(hint), w)), hint, info);
        }

        void DecisionCard(float vw, float vh)
        {
            var d = Array.Find(decisionsOpen, x => x.id == openDecision);
            if (d == null) { openDecision = -1; return; }
            Box(new Rect(0, 0, vw, vh), new Color(0, 0, 0, 0.35f));
            AddUiRect(new Rect(0, 0, vw, vh));
            float w = Mathf.Min(600, vw - 40);
            var area = new Rect((vw - w) / 2, Mathf.Max(70, vh * 0.12f), w, vh * 0.8f);
            GUILayout.BeginArea(area);
            GUILayout.BeginVertical(panel);
            GUILayout.Label((d.cat + (d.place != "" ? " · " + d.place : "") + " · decide by " + d.by).ToUpperInvariant(), eyebrow);
            GUILayout.Label(d.title, title);
            GUILayout.Space(4);
            GUILayout.Label(d.body, body);
            GUILayout.Space(10);
            for (int i = 0; i < d.options.Length; i++)
            {
                var o = d.options[i];
                GUILayout.BeginVertical(card);
                GUILayout.BeginHorizontal();
                GUILayout.Label((i + 1) + ".  " + o.label, optLabel);
                GUILayout.FlexibleSpace();
                int id = d.id; string opt = o.id;
                if (GUILayout.Button("Choose", i == 0 ? primary : button, GUILayout.ExpandWidth(false))) queued = () => Decide(id, opt);
                GUILayout.EndHorizontal();
                if (o.sub != "") GUILayout.Label(o.sub, small);
                GUILayout.BeginHorizontal();
                float lineW = 0, maxW = w - 70;
                foreach (var c in o.chips)
                {
                    var st = new GUIStyle(chip);
                    st.normal.textColor = ToneColor(c.tone);
                    var size = st.CalcSize(new GUIContent(c.text));
                    if (lineW > 0 && lineW + size.x > maxW) { GUILayout.EndHorizontal(); GUILayout.BeginHorizontal(); lineW = 0; }
                    GUILayout.Label(c.text, st, GUILayout.Width(Mathf.Min(size.x, maxW)));
                    lineW += size.x + 6;
                }
                GUILayout.EndHorizontal();
                GUILayout.EndVertical();
                GUILayout.Space(4);
            }
            int more = decisionsOpen.Length - 1;
            GUILayout.Label("If you don't decide by " + d.by + ", your ministers will choose “" + d.def + "”." + (more > 0 ? " " + more + " more decision" + (more > 1 ? "s" : "") + " waiting." : ""), muted);
            GUILayout.Space(6);
            GUILayout.BeginHorizontal();
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Decide later (Esc)", button, GUILayout.ExpandWidth(false))) openDecision = -1;
            GUILayout.EndHorizontal();
            GUILayout.EndVertical();
            GUILayout.EndArea();
        }

        void ReportCard(float vw, float vh)
        {
            Box(new Rect(0, 0, vw, vh), new Color(0, 0, 0, 0.35f));
            AddUiRect(new Rect(0, 0, vw, vh));
            float w = Mathf.Min(640, vw - 40);
            var area = new Rect((vw - w) / 2, 70, w, vh - 110);
            GUILayout.BeginArea(area);
            GUILayout.BeginVertical(panel);
            GUILayout.Label("SEASON REPORT", eyebrow);
            GUILayout.Label(openReport.Season, title);
            GUILayout.Space(6);
            reportScroll = GUILayout.BeginScrollView(reportScroll, false, false, GUIStyle.none, GUI.skin.verticalScrollbar, GUILayout.MaxHeight(vh - 260));
            foreach (var it in openReport.Items)
            {
                GUILayout.BeginHorizontal();
                var dot = GUILayoutUtility.GetRect(6, 18, GUILayout.Width(6));
                Box(new Rect(dot.x, dot.y + 6, 5, 5), ToneColor(it.tone));
                GUILayout.Space(8);
                GUILayout.Label(it.text, factorText);
                GUILayout.EndHorizontal();
                GUILayout.Space(3);
            }
            GUILayout.EndScrollView();
            GUILayout.Space(8);
            GUILayout.BeginHorizontal();
            int k = reports.IndexOf(openReport);
            if (k + 1 < reports.Count && GUILayout.Button("◀ " + reports[k + 1].Season, button, GUILayout.ExpandWidth(false))) { openReport = reports[k + 1]; reportScroll = Vector2.zero; }
            if (k > 0 && GUILayout.Button(reports[k - 1].Season + " ▶", button, GUILayout.ExpandWidth(false))) { openReport = reports[k - 1]; reportScroll = Vector2.zero; }
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Close (Esc)", primary, GUILayout.ExpandWidth(false))) openReport = null;
            GUILayout.EndHorizontal();
            GUILayout.EndVertical();
            GUILayout.EndArea();
        }

        void CollapsedCard(float vw, float vh)
        {
            Box(new Rect(0, 0, vw, vh), new Color(0, 0, 0, 0.45f));
            AddUiRect(new Rect(0, 0, vw, vh));
            float w = Mathf.Min(520, vw - 40);
            GUILayout.BeginArea(new Rect((vw - w) / 2, vh * 0.3f, w, vh * 0.5f));
            GUILayout.BeginVertical(panel);
            GUILayout.Label("THE END OF " + nationName.ToUpperInvariant(), eyebrow);
            GUILayout.Label("Your government has fallen", title);
            GUILayout.Space(6);
            GUILayout.Label("Your nation was conquered, or its people lost all faith in the government. You can start again in a new world.", body);
            GUILayout.Space(10);
            if (GUILayout.Button("New world", primary)) queued = () => NewWorld(UnityEngine.Random.Range(10000, 100000));
            GUILayout.EndVertical();
            GUILayout.EndArea();
        }
    }
}

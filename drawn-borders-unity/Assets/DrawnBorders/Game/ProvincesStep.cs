// The founding's second step: divide your country into provinces (as the web game's founding step 2, ui/52b-16m-…).
// Every change is the engine's (Tools/js-engine/bridge.js: U.autoDivide, U.rename, U.setCapital, U.penCells,
// U.drawProvince, U.start); this file shows the result: every nation on the map, the province lines and names, the panel.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using DrawnBorders.Engine;
using DrawnBorders.Js;
using UnityEngine;

namespace DrawnBorders.Game
{
    public sealed partial class FoundingGame
    {
        GameState state;                // the game as the engine last sent it
        ProvinceRows rows;              // the player's provinces, for the panel
        PenReply pen;                   // the land drawn with the province pen, waiting for a choice
        string provHint;                // why the last change could not be made
        string[] startLines;            // the first lines of the nation's story
        string focusedControl = "";
        readonly Dictionary<int, string> nameEdits = new Dictionary<int, string>();
        readonly Dictionary<int, Vector2> provLabels = new Dictionary<int, Vector2>();   // province id → label spot, in cells
        readonly List<KeyValuePair<int, Vector2>> nationLabels = new List<KeyValuePair<int, Vector2>>();     // nation id → label spot
        Vector2 provScroll;

        void ForgetGame()
        {
            founding = null; state = null; rows = null; pen = null; provHint = null; startLines = null;
            nameEdits.Clear(); provLabels.Clear(); nationLabels.Clear();
        }

        /// <summary>Shows the game as the engine sent it: every nation, the provinces, the towns.</summary>
        void ApplyState(GameState s)
        {
            state = s;
            var colors = new List<string>();
            foreach (var n in s.nations) colors.Add(n.color);
            map.SetPolitics(PoliticalMap.Build(world, s.owner, s.prov, colors, s.provinces, phase == Phase.Provinces ? Rules.Player : -1));
            map.SetPoliticsLook(1, 0.3f, phase == Phase.Provinces, true);
            var towns = new List<Town>();
            foreach (var t in s.towns) if (t.owner >= 0) towns.Add(new Town { Cell = t.cell, Name = t.name, Capital = t.capital });
            map.ShowTowns(towns);
            PlaceLabels();
        }

        // where province and nation names go: the cell nearest the middle, away from towns (whose names come first)
        void PlaceLabels()
        {
            provLabels.Clear(); nationLabels.Clear();
            var sum = new Dictionary<int, Vector3>();
            for (int c = 0; c < Rules.NCells; c++)
            {
                int p = state.prov[c];
                if (p < 0 || state.owner[c] < 0) continue;
                Vector3 v; sum.TryGetValue(p, out v);
                sum[p] = v + new Vector3(Rules.CellX(c) + 0.5f, Rules.CellY(c) + 0.5f, 1);
            }
            foreach (var p in state.provinces)
            {
                Vector3 v;
                if (p.owner != Rules.Player || !sum.TryGetValue(p.id, out v) || v.z == 0) continue;
                float mx = v.x / v.z, my = v.y / v.z, best = float.MaxValue;
                int bestCell = -1;
                for (int c = 0; c < Rules.NCells; c++)
                {
                    if (state.prov[c] != p.id || state.owner[c] != p.owner) continue;
                    float d = Mathf.Sqrt((Rules.CellX(c) + 0.5f - mx) * (Rules.CellX(c) + 0.5f - mx) + (Rules.CellY(c) + 0.5f - my) * (Rules.CellY(c) + 0.5f - my));
                    foreach (var t in state.towns) if (Mathf.Abs(Rules.CellX(t.cell) - Rules.CellX(c)) <= 2 && Mathf.Abs(Rules.CellY(t.cell) - Rules.CellY(c)) <= 1) { d += 4; break; }
                    if (d < best) { best = d; bestCell = c; }
                }
                if (bestCell >= 0) provLabels[p.id] = new Vector2(Rules.CellX(bestCell) + 0.5f, Rules.CellY(bestCell) + 0.5f);
            }
            foreach (var n in state.nations)
            {
                if (!n.alive) continue;
                float sx = 0, sy = 0; int k = 0;
                for (int c = 0; c < Rules.NCells; c++) if (state.owner[c] == n.id) { sx += Rules.CellX(c) + 0.5f; sy += Rules.CellY(c) + 0.5f; k++; }
                if (k > 0) nationLabels.Add(new KeyValuePair<int, Vector2>(n.id, new Vector2(sx / k, sy / k)));
            }
        }

        void LoadRows()
        {
            try { rows = JsonUtility.FromJson<ProvinceRows>(engine.CallNow("U.provinces()")); }
            catch (Exception e) { provHint = e.Message; Debug.LogException(e); }
        }

        /// <summary>A change through the engine; on success the map and the panel are made again.</summary>
        void Do(string code)
        {
            try
            {
                var r = JsonUtility.FromJson<Reply>(engine.CallNow(code));
                if (!r.ok) { provHint = r.reason; return; }
                provHint = null;
                ApplyState(JsonUtility.FromJson<GameState>(engine.CallNow("U.state()")));
                LoadRows();
            }
            catch (Exception e) { provHint = e.Message; Debug.LogException(e); }
        }

        // bring the new country into view, left of the panel
        void FocusOwnLand()
        {
            int x0 = Rules.GridW, x1 = 0, y0 = Rules.GridH, y1 = 0;
            for (int c = 0; c < Rules.NCells; c++)
            {
                if (state.owner[c] != Rules.Player) continue;
                x0 = Math.Min(x0, Rules.CellX(c)); x1 = Math.Max(x1, Rules.CellX(c));
                y0 = Math.Min(y0, Rules.CellY(c)); y1 = Math.Max(y1, Rules.CellY(c));
            }
            if (x1 < x0) return;
            float w = x1 - x0 + 4, h = y1 - y0 + 4;
            float d = Mathf.Clamp(Mathf.Max(w, h * 1.5f) * 1.3f, 14, 70);
            rig.LookAt(new Vector3((x0 + x1) * 0.5f + 0.5f + d * 0.16f, 0, Rules.GridH - ((y0 + y1) * 0.5f + 0.5f)), d);
        }

        // the pen: the land inside the line, then a card to choose what it becomes
        void PenDone()
        {
            var b = new StringBuilder("[");
            for (int i = 0; i < path.Count; i++)
            {
                if (i > 0) b.Append(',');
                b.Append('[').Append(EngineThread.Num(path[i].X)).Append(',').Append(EngineThread.Num(path[i].Y)).Append(']');
            }
            b.Append(']');
            try
            {
                var r = JsonUtility.FromJson<PenReply>(engine.CallNow("U.penCells(" + b + ")"));
                if (r.ok) pen = r; else { pen = null; provHint = r.reason; line.positionCount = 0; }
            }
            catch (Exception e) { provHint = e.Message; Debug.LogException(e); line.positionCount = 0; }
        }

        void PenChoose(int to)
        {
            if (pen == null) return;
            var b = new StringBuilder("[");
            for (int i = 0; i < pen.cells.Length; i++) { if (i > 0) b.Append(','); b.Append(pen.cells[i]); }
            b.Append(']');
            pen = null; line.positionCount = 0;
            Do("U.drawProvince(" + b + ", " + to + ")");
        }

        void PenCancel() { pen = null; line.positionCount = 0; }

        // a province name is saved when you press Enter or click elsewhere (all of them when you start)
        void CommitNameEdits(bool all = false)
        {
            if (nameEdits.Count == 0) return;
            foreach (var kv in new List<KeyValuePair<int, string>>(nameEdits))
            {
                if (!all && focusedControl == "prov-name-" + kv.Key) continue;
                nameEdits.Remove(kv.Key);
                var row = rows != null ? Array.Find(rows.rows, r => r.id == kv.Key) : null;
                if (row != null && row.name != kv.Value) Do("U.rename(" + kv.Key + ", " + EngineThread.Str(kv.Value) + ")");
            }
        }

        void StartPlaying()
        {
            CommitNameEdits(true);
            try
            {
                startLines = JsonUtility.FromJson<StartReply>(engine.CallNow("U.start()")).lines;
                phase = Phase.Started;
                pen = null; line.positionCount = 0;
                ApplyState(JsonUtility.FromJson<GameState>(engine.CallNow("U.state()")));
                rig.Home(false);
            }
            catch (Exception e) { provHint = e.Message; Debug.LogException(e); }
        }

        // ---------- the panels ----------

        void FoundingWaitPanel()
        {
            GUILayout.Label("FOUNDING", eyebrow);
            GUILayout.Label(nationName, title);
            GUILayout.Space(6);
            GUILayout.Label(engine != null && !engine.Ready ? "Starting the game's engine…" : "Founding your nation and placing your rivals…", body);
        }

        void ProvincesPanel(float inner)
        {
            if (Event.current.type == EventType.KeyDown && (Event.current.keyCode == KeyCode.Return || Event.current.keyCode == KeyCode.KeypadEnter)
                && GUI.GetNameOfFocusedControl().StartsWith("prov-name-")) GUI.FocusControl(null);

            GUILayout.Label("FOUNDING · STEP 2 OF 2", eyebrow);
            GUILayout.Label("Divide your country into provinces", title);
            GUILayout.Space(4);
            GUILayout.Label("Like the states of a country: each province has a capital and its own towns and villages. A province with no town yet is a territory, run from the national capital, until a town grows there.", small);
            GUILayout.Space(4);
            GUILayout.Label("Draw on the map around some land to make it a province, or let the game divide it. You can change them later (that costs money and time, as in real life).", small);

            if (pen != null) PenCard();
            if (provHint != null) { GUILayout.Space(6); GUILayout.Label(provHint, notice); }

            GUILayout.Space(10);
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Divide it for me", button)) queued = () => Do("U.autoDivide(0)");
            GUILayout.Label("or into", small, GUILayout.ExpandWidth(false));
            for (int k = 1; k <= 5; k++)
            {
                int kk = k;
                if (GUILayout.Button(k.ToString(), button, GUILayout.Width(34))) queued = () => Do("U.autoDivide(" + kk + ")");
            }
            GUILayout.EndHorizontal();
            GUILayout.Space(4);
            if (GUILayout.Button("Start with these provinces", primary)) queued = StartPlaying;

            GUILayout.Space(10);
            int count = rows != null && rows.rows != null ? rows.rows.Length : 0;
            GUILayout.Label(count + (count == 1 ? " PROVINCE" : " PROVINCES") + " · CLICK A NAME TO CHANGE IT", eyebrow);
            provScroll = GUILayout.BeginScrollView(provScroll, false, false, GUIStyle.none, GUI.skin.verticalScrollbar, GUILayout.MaxHeight(Mathf.Max(160, Screen.height / uiScale - 560)));
            if (count > 0) foreach (var r in rows.rows) ProvinceRow(r, inner);
            GUILayout.EndScrollView();
            GUILayout.Space(6);
            GUILayout.Label("Province capitals govern their province: more public jobs, more loyal and prouder people, and if the national capital ever falls, the government carries on from the biggest one. Their offices cost a little upkeep.", muted);
            GUILayout.Space(8);
            if (GUILayout.Button("Draw my borders again", button)) queued = Unfound;
        }

        void ProvinceRow(ProvinceRow r, float inner)
        {
            GUILayout.BeginHorizontal();
            var sw = GUILayoutUtility.GetRect(12, 12, GUILayout.Width(12), GUILayout.Height(30));
            var old = GUI.color;
            GUI.color = MapView.Hex(r.tint);
            GUI.DrawTexture(new Rect(sw.x, sw.y + 9, 12, 12), white);
            GUI.color = old;
            GUILayout.Space(6);
            string ctrl = "prov-name-" + r.id, cur;
            if (!nameEdits.TryGetValue(r.id, out cur)) cur = r.name;
            GUI.SetNextControlName(ctrl);
            string next = GUILayout.TextField(cur, 32, rowField);
            if (next != cur) nameEdits[r.id] = next;
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            GUILayout.Space(18);
            GUILayout.Label(r.area + " · " + r.people, small, GUILayout.ExpandWidth(false));
            GUILayout.Space(8);
            if (r.towns == null || r.towns.Length == 0) GUILayout.Label("Territory: no town yet", warn);
            else
            {
                var cap = Array.Find(r.towns, t => t.id == r.capital);
                GUILayout.Label("Capital: " + (cap != null ? cap.name + (cap.natCapital ? " (national capital)" : "") : "none yet"), small, GUILayout.ExpandWidth(false));
                if (r.towns.Length > 1 || cap == null)
                {
                    // the next town of the province becomes its capital
                    int i = cap == null ? 0 : (Array.IndexOf(r.towns, cap) + 1) % r.towns.Length;
                    int pid = r.id, town = r.towns[i].id;
                    if (GUILayout.Button("change", linkButton, GUILayout.ExpandWidth(false))) queued = () => Do("U.setCapital(" + pid + ", " + town + ")");
                }
            }
            GUILayout.EndHorizontal();
            GUILayout.Space(6);
        }

        void PenCard()
        {
            GUILayout.Space(8);
            GUILayout.BeginVertical(card);
            GUILayout.Label("THE LAND YOU DREW", eyebrow);
            GUILayout.Label(pen.area + " · " + pen.people + " · " + (pen.towns != null && pen.towns.Length > 0 ? string.Join(", ", pen.towns) : "no town"), small);
            GUILayout.Space(4);
            GUI.enabled = pen.canNew;
            if (GUILayout.Button("Make it a new province", primary)) queued = () => PenChoose(-1);
            GUI.enabled = true;
            if (pen.targets != null) foreach (var t in pen.targets)
                {
                    int id = t.id;
                    if (GUILayout.Button("Add it to " + t.name, button)) queued = () => PenChoose(id);
                }
            if (GUILayout.Button("Cancel", button)) queued = PenCancel;
            if (!pen.canNew) GUILayout.Label("A new province needs at least " + pen.minArea + ".", muted);
            GUILayout.EndVertical();
        }

        void StartedPanel()
        {
            GUILayout.Label("YOUR NATION BEGINS", eyebrow);
            GUILayout.Label(nationName, title);
            GUILayout.Space(6);
            if (startLines != null) foreach (var l in startLines) { GUILayout.Label(l, body); GUILayout.Space(4); }
            GUILayout.Space(8);
            GUILayout.Label("The seasons come in the next part of the Unity version.", muted);
            GUILayout.Space(8);
            if (GUILayout.Button("New world", button)) NewWorld(UnityEngine.Random.Range(10000, 100000));
        }

        // ---------- names on the map ----------

        void GameLabels()
        {
            if (state == null || Event.current.type != EventType.Repaint) return;
            float dist = rig.Distance;
            // nation names when far out (yours not while you divide it: the province names are there)
            if (dist > 28)
                foreach (var kv in nationLabels)
                    if (!(phase == Phase.Provinces && kv.Key == Rules.Player))
                        MapLabel(state.nations[kv.Key].name.ToUpperInvariant(), CellPoint(kv.Value), nationLabel, 0.62f);
            // province names when dividing, or close in
            if (phase == Phase.Provinces || dist < 30)
                foreach (var p in state.provinces)
                {
                    Vector2 at;
                    if (!provLabels.TryGetValue(p.id, out at)) continue;
                    MapLabel(Spaced(p.name.ToUpperInvariant()), CellPoint(at), provLabel, 0.5f);
                }
            // towns: capitals always, the others closer in
            foreach (var t in state.towns)
            {
                if (t.owner < 0 || (!t.capital && dist > 45)) continue;
                var w = map.CellCentre(t.cell) + Vector3.up * 0.35f;
                MapLabel(t.capital ? "★ " + t.name : t.name, w, t.capital ? label : townLabel, 0.45f, 14);
            }
        }

        Vector3 CellPoint(Vector2 cell)
        {
            float x = cell.x, z = Rules.GridH - cell.y;
            return new Vector3(x, map.GroundAt(x, z) + 0.3f, z);
        }

        static string Spaced(string s)
        {
            var b = new StringBuilder();
            foreach (char c in s) { if (b.Length > 0) b.Append(c == ' ' ? "  " : " "); if (c != ' ') b.Append(c); }
            return b.ToString();
        }

        void MapLabel(string text, Vector3 world, GUIStyle style, float shade, float lift = 0)
        {
            var s = rig.Cam.WorldToScreenPoint(world);
            if (s.z <= 0) return;
            var size = style.CalcSize(new GUIContent(text));
            float x = s.x / uiScale - size.x / 2, y = (Screen.height - s.y) / uiScale - size.y / 2 - lift;
            if (shade > 0)
            {
                var old = GUI.color;
                GUI.color = new Color(0, 0, 0, shade * 0.6f);
                GUI.DrawTexture(new Rect(x - 5, y, size.x + 10, size.y), white);
                GUI.color = old;
            }
            GUI.Label(new Rect(x, y, size.x, size.y), text, style);
        }

        // what the hover line says about a cell's nation and province
        void GameHoverParts(int c, List<string> parts)
        {
            if (state == null) return;
            int o = state.owner[c];
            if (o < 0) { parts.Add("wild land"); return; }
            string nation = o < state.nations.Length ? state.nations[o].name : "?";
            var p = Array.Find(state.provinces, q => q.id == state.prov[c] && q.owner == o);
            parts.Add(p != null ? p.name + ", " + nation : nation);
        }
    }
}

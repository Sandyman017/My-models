// The founding panel and the labels on the map, drawn with Unity's built-in GUI (no extra packages needed).
// Words and numbers follow the web game's founding panel.
using System.Collections.Generic;
using DrawnBorders.Engine;
using UnityEngine;
using Terrain = DrawnBorders.Engine.Terrain;

namespace DrawnBorders.Game
{
    public sealed partial class FoundingGame
    {
        float uiScale = 1;
        Rect panelScreen;              // where the panel is, in screen pixels (bottom-left origin, like the mouse)
        bool typing;
        bool stylesReady;
        GUIStyle panel, eyebrow, title, body, small, muted, statKey, statValue, factorText, factorEffect, button, primary, field, notice, info, tip, help, label, loadingTitle;
        GUIStyle rowField, warn, linkButton, card, nationLabel, provLabel, townLabel;
        GUIStyle barName, barSeason, barEra, barValue, barNote, speedOn, speedOff, newsItem, centeredMuted, optLabel, chip;
        Texture2D white;

        static readonly Color Good = MapView.Hex("#86d08f"), Bad = MapView.Hex("#ec8a73"), Neutral = MapView.Hex("#c9d0d6");
        static readonly Color Gold = MapView.Hex("#d9b35f"), Ink = MapView.Hex("#e9edf0"), Soft = MapView.Hex("#aeb8c2");

        Texture2D Solid(Color c)
        {
            var t = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            t.SetPixel(0, 0, c); t.Apply(); t.hideFlags = HideFlags.DontSave;
            return t;
        }

        GUIStyle Style(int size, Color color, FontStyle fs = FontStyle.Normal, bool wrap = true)
        {
            var s = new GUIStyle(GUI.skin.label) { fontSize = size, fontStyle = fs, wordWrap = wrap, richText = false };
            s.normal.textColor = color;
            s.margin = new RectOffset(0, 0, 2, 2); s.padding = new RectOffset(0, 0, 0, 0);
            return s;
        }

        GUIStyle ButtonStyle(Color bg, Color hover, Color text)
        {
            var s = new GUIStyle(GUI.skin.button) { fontSize = 14, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            s.normal.background = Solid(bg); s.hover.background = Solid(hover); s.active.background = Solid(Color.Lerp(bg, Color.black, 0.2f));
            s.focused.background = s.normal.background;
            s.normal.textColor = s.hover.textColor = s.active.textColor = s.focused.textColor = text;
            s.border = new RectOffset(0, 0, 0, 0);
            s.padding = new RectOffset(12, 12, 9, 9); s.margin = new RectOffset(0, 6, 4, 4);
            return s;
        }

        void MakeStyles()
        {
            if (stylesReady) return;
            stylesReady = true;
            white = Solid(Color.white);
            panel = new GUIStyle { padding = new RectOffset(20, 20, 18, 18) };
            panel.normal.background = Solid(new Color(0.06f, 0.085f, 0.11f, 0.9f));
            eyebrow = Style(11, Gold, FontStyle.Bold);
            title = Style(24, Ink, FontStyle.Bold);
            body = Style(14, Ink);
            small = Style(12, Soft);
            muted = Style(12, MapView.Hex("#8794a1"));
            statKey = Style(11, MapView.Hex("#93a0ad"), FontStyle.Bold);
            statValue = Style(18, Ink, FontStyle.Bold, false);
            factorText = Style(13, MapView.Hex("#d6dce1"));
            factorEffect = Style(12, Neutral, FontStyle.Bold);
            factorEffect.alignment = TextAnchor.UpperRight;
            button = ButtonStyle(MapView.Hex("#25313b"), MapView.Hex("#31404c"), Ink);
            primary = ButtonStyle(Color.Lerp(nationColor, Color.black, 0.15f), nationColor, Color.white);
            field = new GUIStyle(GUI.skin.textField) { fontSize = 18, fontStyle = FontStyle.Bold, padding = new RectOffset(10, 10, 8, 8) };
            field.normal.background = Solid(MapView.Hex("#1a242d")); field.focused.background = Solid(MapView.Hex("#202d38")); field.hover.background = field.normal.background;
            field.normal.textColor = field.focused.textColor = field.hover.textColor = Ink;
            notice = Style(13, MapView.Hex("#ffd9cf")); notice.normal.background = Solid(new Color(0.55f, 0.18f, 0.12f, 0.55f)); notice.padding = new RectOffset(10, 10, 8, 8);
            info = Style(13, MapView.Hex("#d9e7f5")); info.normal.background = Solid(new Color(0.16f, 0.3f, 0.45f, 0.5f)); info.padding = new RectOffset(10, 10, 8, 8);
            tip = Style(13, Ink, FontStyle.Normal, false); tip.normal.background = Solid(new Color(0.04f, 0.06f, 0.08f, 0.88f)); tip.padding = new RectOffset(10, 10, 7, 7);
            help = Style(12, MapView.Hex("#dfe6ec"), FontStyle.Normal, false);
            label = Style(14, Color.white, FontStyle.Bold, false); label.alignment = TextAnchor.MiddleCenter;
            loadingTitle = Style(34, Ink, FontStyle.Bold, false); loadingTitle.alignment = TextAnchor.MiddleCenter;
            // the provinces step
            rowField = new GUIStyle(field) { fontSize = 14, padding = new RectOffset(8, 8, 5, 5) };
            warn = Style(12, MapView.Hex("#e8b35a"));
            linkButton = Style(12, MapView.Hex("#9cc7ef"), FontStyle.Bold, false);
            linkButton.hover.textColor = Color.white;
            card = new GUIStyle { padding = new RectOffset(12, 12, 10, 10) };
            card.normal.background = Solid(new Color(0.16f, 0.22f, 0.28f, 0.7f));
            nationLabel = Style(15, new Color(1, 1, 1, 0.92f), FontStyle.Bold, false); nationLabel.alignment = TextAnchor.MiddleCenter;
            provLabel = Style(12, MapView.Hex("#f6efd9"), FontStyle.Bold, false); provLabel.alignment = TextAnchor.MiddleCenter;
            townLabel = Style(12, Color.white, FontStyle.Normal, false); townLabel.alignment = TextAnchor.MiddleCenter;
            // time and the seasons
            barName = Style(17, Ink, FontStyle.Bold, false);
            barSeason = Style(14, Ink, FontStyle.Bold, false); barSeason.alignment = TextAnchor.UpperRight;
            barEra = Style(11, Soft, FontStyle.Normal, false); barEra.alignment = TextAnchor.UpperRight;
            barValue = Style(15, Ink, FontStyle.Bold, false);
            barNote = Style(11, Neutral, FontStyle.Normal, false);
            speedOff = ButtonStyle(MapView.Hex("#1d2831"), MapView.Hex("#2b3945"), Soft);
            speedOff.fontSize = 11; speedOff.padding = new RectOffset(2, 2, 4, 4); speedOff.margin = new RectOffset(0, 0, 0, 0);
            speedOn = ButtonStyle(Color.Lerp(nationColor, Color.black, 0.15f), nationColor, Color.white);
            speedOn.fontSize = 11; speedOn.padding = speedOff.padding; speedOn.margin = speedOff.margin;
            newsItem = Style(13, Ink, FontStyle.Normal, true);
            newsItem.hover.textColor = Color.white;
            centeredMuted = Style(11, MapView.Hex("#c7d0d8"), FontStyle.Normal, false); centeredMuted.alignment = TextAnchor.UpperCenter;
            optLabel = Style(15, Ink, FontStyle.Bold, true);
            chip = Style(12, Neutral, FontStyle.Bold, false);
            chip.normal.background = Solid(new Color(1, 1, 1, 0.07f)); chip.padding = new RectOffset(6, 6, 2, 2); chip.margin = new RectOffset(0, 6, 2, 2);
        }

        bool OverUi(Vector2 mouse)
        {
            if (panelScreen.Contains(mouse) || ModalOpen) return true;
            foreach (var r in uiRects) if (r.Contains(mouse)) return true;
            return false;
        }

        void OnGUI()
        {
            InputState.Feed(Event.current);
            MakeStyles();
            uiScale = Mathf.Clamp(Screen.height / 1000f, 0.8f, 2.4f);
            GUI.matrix = Matrix4x4.TRS(Vector3.zero, Quaternion.identity, new Vector3(uiScale, uiScale, 1));
            float vw = Screen.width / uiScale, vh = Screen.height / uiScale;

            if (phase == Phase.Loading) { LoadingScreen(vw, vh); panelScreen = new Rect(0, 0, Screen.width, Screen.height); return; }

            if (phase == Phase.Play)
            {
                PlayGui(vw, vh);
                if (Event.current.type == EventType.Repaint) { panelScreen = Rect.zero; focusedControl = GUI.GetNameOfFocusedControl(); typing = false; }
                if (!ModalOpen) HoverTip(vw, vh);
                return;
            }
            if (state != null) GameLabels(); else MapLabels();
            TopLeft();

            float pw = Mathf.Min(phase == Phase.Provinces ? 430 : 400, vw * 0.42f);
            var area = new Rect(vw - pw - 16, 16, pw, vh - 32);
            GUILayout.BeginArea(area);
            GUILayout.BeginVertical(panel);
            if (phase == Phase.Founding) FoundingWaitPanel();
            else if (phase == Phase.Provinces) ProvincesPanel(pw - 40);
            else if (preview != null) PreviewPanel(pw - 40);
            else IntroPanel();
            GUILayout.EndVertical();
            var used = GUILayoutUtility.GetLastRect();
            GUILayout.EndArea();
            if (Event.current.type == EventType.Repaint)
            {
                // the panel's real height, so clicks below it still reach the map
                var r = new Rect(area.x, area.y, area.width, used.height);
                panelScreen = new Rect(r.x * uiScale, Screen.height - (r.y + r.height) * uiScale, r.width * uiScale, r.height * uiScale);
                focusedControl = GUI.GetNameOfFocusedControl();
                typing = focusedControl == "nation-name" || focusedControl.StartsWith("prov-name-");
            }

            HoverTip(vw, vh);
        }

        void LoadingScreen(float vw, float vh)
        {
            var old = GUI.color;
            GUI.color = new Color(0.05f, 0.08f, 0.1f, world == null ? 1f : 0.7f);
            GUI.DrawTexture(new Rect(0, 0, vw, vh), white);
            GUI.color = old;
            GUI.Label(new Rect(0, vh * 0.42f, vw, 50), "Drawn Borders", loadingTitle);
            var sub = Style(15, Soft, FontStyle.Normal, false); sub.alignment = TextAnchor.MiddleCenter;
            GUI.Label(new Rect(0, vh * 0.42f + 54, vw, 26), loadError != null ? "The world could not be made: " + loadError : progress + "…", sub);
            if (loadError != null && GUI.Button(new Rect(vw / 2 - 80, vh * 0.42f + 96, 160, 38), "Try another world", button)) NewWorld(Random.Range(10000, 100000));
        }

        void TopLeft()
        {
            string keys = (phase == Phase.Provinces ? "Left-drag: draw a province   " : "Left-drag: draw borders   ")
                + "Right-drag: move   Wheel or R / F: zoom   Q / E: turn   Home: whole map";
            // as wide as the help line, so it is not cut off
            var box = new Rect(16, 16, Mathf.Max(470, help.CalcSize(new GUIContent(keys)).x + 24), 66);
            var old = GUI.color;
            GUI.color = new Color(0.04f, 0.06f, 0.08f, 0.62f);
            GUI.DrawTexture(box, white);
            GUI.color = old;
            GUILayout.BeginArea(new Rect(box.x + 12, box.y + 8, box.width - 24, box.height - 12));
            GUILayout.Label("DRAWN BORDERS  ·  WORLD " + seed, eyebrow);
            GUILayout.Label(keys, help);
            GUILayout.EndArea();
        }

        void IntroPanel()
        {
            GUILayout.Label("FOUNDING", eyebrow);
            GUILayout.Label("Draw your nation", title);
            GUILayout.Space(4);
            GUILayout.Label("Press and drag on the map to trace your borders, then release.", body);
            GUILayout.Space(10);
            Bullet("Plains feed the most people");
            Bullet("Forests, hills and mountains supply industry");
            Bullet("A coast on the open sea gives fishing, harbors, sea trade and a navy; a lake gives fishing only");
            Bullet("Colored patches are deposits: blue-gray metal ore, brown coal, purple oil and gas, yellow gold");
            Bullet("Compact shapes are easier to govern");
            Bullet("Four rival powers and a handful of small city-states will settle elsewhere, with wild land between you");
            if (error != null) { GUILayout.Space(8); GUILayout.Label(error, notice); }
            GUILayout.Space(12);
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Try a sample shape", button)) TrySample();
            if (GUILayout.Button("New world", button)) NewWorld(Random.Range(10000, 100000));
            GUILayout.EndHorizontal();
        }

        void Bullet(string text)
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("•", factorText, GUILayout.Width(12));
            GUILayout.Label(text, factorText);
            GUILayout.EndHorizontal();
        }

        void PreviewPanel(float inner)
        {
            var p = preview;
            GUILayout.Label("FOUNDING", eyebrow);
            GUILayout.Label("Name your nation", small);
            GUI.SetNextControlName("nation-name");
            nationName = GUILayout.TextField(nationName ?? "", 32, field);
            if (note != null) { GUILayout.Space(6); GUILayout.Label(note, info); }
            GUILayout.Space(10);
            float col = (inner - 12) / 2;
            GUILayout.BeginHorizontal();
            Stat("AREA", Borders.FmtArea(p.Area), col); Stat("PEOPLE", FoundingPreview.FmtPop(p.People), col);
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            Stat("FARMLAND FEEDS", FoundingPreview.FmtPop(p.Farmland), col); Stat("TOWNS", p.Towns.Count.ToString(), col);
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            Stat("STABILITY", p.Traits.Stability.ToString(), col); Stat("DEFENSE", p.Traits.Defense.ToString(), col);
            GUILayout.EndHorizontal();

            GUILayout.Space(10);
            GUILayout.Label("LAND", eyebrow);
            var bar = GUILayoutUtility.GetRect(inner, 10);
            float x = bar.x;
            var old = GUI.color;
            var kinds = new[] { Terrain.Plains, Terrain.Forest, Terrain.Hills, Terrain.Mountain };
            foreach (var t in kinds)
            {
                int n = p.Counts[(int)t]; if (n == 0) continue;
                float wdt = bar.width * n / p.Area;
                GUI.color = MapView.Hex(Rules.Info(t).Color);
                GUI.DrawTexture(new Rect(x, bar.y, wdt, bar.height), white);
                x += wdt;
            }
            GUI.color = old;
            var legend = new List<string>();
            foreach (var t in kinds) if (p.Counts[(int)t] > 0) legend.Add(Rules.Info(t).Name + " " + FoundingPreview.Pct((double)p.Counts[(int)t] / p.Area));
            GUILayout.Label(string.Join("   ", legend), small);

            GUILayout.Space(10);
            GUILayout.Label("WHAT YOUR BORDERS GIVE YOU", eyebrow);
            foreach (var f in p.Factors())
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label(f.Text, factorText, GUILayout.Width(inner * 0.64f));
                var st = new GUIStyle(factorEffect);
                st.normal.textColor = f.Tone == Tone.Good ? Good : f.Tone == Tone.Bad ? Bad : Neutral;
                GUILayout.Label(f.Effect, st);
                GUILayout.EndHorizontal();
                GUILayout.Space(3);
            }
            if (engineError != null) { GUILayout.Space(8); GUILayout.Label("The game's engine could not start: " + engineError, notice); }
            GUILayout.Space(12);
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Found this nation", primary)) queued = Found;
            if (GUILayout.Button("Redraw", button)) queued = ClearClaim;
            GUILayout.EndHorizontal();
            GUILayout.Label("Draw again on the map to replace these borders.", muted);
        }

        void Stat(string key, string value, float width)
        {
            GUILayout.BeginVertical(GUILayout.Width(width));
            GUILayout.Label(key, statKey);
            GUILayout.Label(value, statValue);
            GUILayout.EndVertical();
            GUILayout.Space(12);
        }

        void HoverTip(float vw, float vh)
        {
            if (hoverCell < 0 || drawing || world == null || OverUi(InputState.Mouse)) return;
            int c = hoverCell;
            var parts = new List<string>();
            var t = world.Terrain[c];
            parts.Add(t == Terrain.Sea ? (world.Sea.Ocean[c] != 0 ? "Open sea" : "Lake") : Rules.Info(t).Name);
            if (t != Terrain.Sea)
            {
                if (world.Coastal[c] != 0) parts.Add(world.Sea.BeachSeaCell(world, c) >= 0 ? "coast" : "lakeshore");
                int r = world.Rivers.Cells[c];
                if (r >= 2) parts.Add(r == 2 ? "river" : r == 3 ? "big river" : "great river");
                else if (r == 1) parts.Add("stream");
                if (world.Dep[c] != 0) parts.Add(Rules.DepositLabels[world.Dep[c]]);
                if (state != null) GameHoverParts(c, parts);
                else if (cellSet != null && cellSet.Contains(c)) parts.Add("inside your borders");
            }
            string text = string.Join(" · ", parts);
            var m = InputState.Mouse;
            var size = tip.CalcSize(new GUIContent(text));
            float x = m.x / uiScale + 16, y = (Screen.height - m.y) / uiScale + 18;
            if (x + size.x > vw) x = vw - size.x - 4;
            if (y + size.y > vh) y = vh - size.y - 4;
            GUI.Label(new Rect(x, y, size.x, size.y), text, tip);
        }

        void MapLabels()
        {
            if (preview == null || Event.current.type != EventType.Repaint) return;
            foreach (var t in preview.Towns)
            {
                if (!t.Capital) continue;
                var w = map.CellCentre(t.Cell) + Vector3.up * 0.4f;
                var s = rig.Cam.WorldToScreenPoint(w);
                if (s.z <= 0) continue;
                const string text = "Capital";
                var size = label.CalcSize(new GUIContent(text));
                float x = s.x / uiScale - size.x / 2, y = (Screen.height - s.y) / uiScale - size.y - 4;
                var old = GUI.color;
                GUI.color = new Color(0, 0, 0, 0.45f);
                GUI.DrawTexture(new Rect(x - 6, y - 1, size.x + 12, size.y + 2), white);
                GUI.color = old;
                GUI.Label(new Rect(x, y, size.x, size.y), text, label);
            }
        }
    }
}

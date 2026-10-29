// Mouse and keys. Uses Unity's classic Input; if the project is set to the new Input System only (where classic
// Input throws), it switches to the events the on-screen panel receives, which work with either setting.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace DrawnBorders.Game
{
    public static class InputState
    {
        public static bool Classic = true;
        static readonly bool[] held = new bool[3], down = new bool[3], up = new bool[3];
        static readonly HashSet<KeyCode> keys = new HashSet<KeyCode>();
        static Vector2 mouse;          // pixels from the bottom left, like Input.mousePosition
        static float scroll;
        static float pendingScroll;
        static readonly bool[] pendingDown = new bool[3], pendingUp = new bool[3];

        /// <summary>Call once at the start of each frame.</summary>
        public static void Poll()
        {
            if (Classic)
            {
                try
                {
                    mouse = Input.mousePosition;
                    scroll = Input.mouseScrollDelta.y;
                    for (int b = 0; b < 3; b++) { held[b] = Input.GetMouseButton(b); down[b] = Input.GetMouseButtonDown(b); up[b] = Input.GetMouseButtonUp(b); }
                    return;
                }
                catch (InvalidOperationException)
                {
                    Classic = false;
                    Debug.Log("Drawn Borders: classic Input is off in this project, so the map reads the mouse from on-screen events instead.");
                }
            }
            scroll = pendingScroll; pendingScroll = 0;
            for (int b = 0; b < 3; b++)
            {
                down[b] = pendingDown[b]; up[b] = pendingUp[b];
                pendingDown[b] = false; pendingUp[b] = false;
            }
        }

        /// <summary>Call from OnGUI with every event (only used when classic Input is off).</summary>
        public static void Feed(Event e)
        {
            if (Classic || e == null) return;
            mouse = new Vector2(e.mousePosition.x, Screen.height - e.mousePosition.y);
            switch (e.type)
            {
                case EventType.MouseDown: if (e.button < 3) { held[e.button] = true; pendingDown[e.button] = true; } break;
                case EventType.MouseUp: if (e.button < 3) { held[e.button] = false; pendingUp[e.button] = true; } break;
                case EventType.ScrollWheel: pendingScroll -= e.delta.y / 3f; break;
                case EventType.KeyDown: if (e.keyCode != KeyCode.None) keys.Add(e.keyCode); break;
                case EventType.KeyUp: keys.Remove(e.keyCode); break;
            }
        }

        public static Vector2 Mouse { get { return mouse; } }
        public static float Scroll { get { return scroll; } }
        public static bool Held(int b) { return held[b]; }
        public static bool Down(int b) { return down[b]; }
        public static bool Up(int b) { return up[b]; }
        public static bool Key(KeyCode k)
        {
            if (Classic) { try { return Input.GetKey(k); } catch (InvalidOperationException) { return false; } }
            return keys.Contains(k);
        }
        public static bool KeyDown(KeyCode k)
        {
            if (Classic) { try { return Input.GetKeyDown(k); } catch (InvalidOperationException) { return false; } }
            return false;
        }
    }
}

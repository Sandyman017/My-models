// The camera: looks down on the whole continent from far away and tilts toward the horizon as you zoom in.
// Wheel: zoom toward the mouse. Right or middle drag: move the map. WASD / arrows: move. Q / E: turn. Home: the whole map.
using DrawnBorders.Engine;
using UnityEngine;

namespace DrawnBorders.Game
{
    public sealed class CameraRig : MonoBehaviour
    {
        public Camera Cam;
        public MapView Map;
        public const float MinDist = 3.5f, MaxDist = 95f;

        Vector3 target, targetGoal;      // the point on the map the camera looks at (y = 0)
        float dist, distGoal, yaw, yawGoal;
        bool panning; Vector3 panGrab;

        public float Distance { get { return dist; } }

        public void Init(Camera cam, MapView map)
        {
            Cam = cam; Map = map;
            Cam.fieldOfView = 38;
            Cam.nearClipPlane = 0.05f;
            Cam.farClipPlane = 900;
            Home(true);
        }

        public void Home(bool now)
        {
            targetGoal = new Vector3(Rules.GridW * 0.5f, 0, Rules.GridH * 0.47f);
            distGoal = 82; yawGoal = 0;
            if (now) { target = targetGoal; dist = distGoal; yaw = yawGoal; Place(); }
        }

        public void LookAt(Vector3 p, float d)
        {
            targetGoal = new Vector3(p.x, 0, p.z);
            distGoal = Mathf.Clamp(d, MinDist, MaxDist);
        }

        static float PitchFor(float d) { return Mathf.Lerp(36f, 68f, Mathf.InverseLerp(MinDist + 2, 70, d)); }

        void Place()
        {
            var rot = Quaternion.Euler(PitchFor(dist), yaw, 0);
            var pos = target - rot * Vector3.forward * dist;
            // never inside a mountain when close
            float ground = Map != null ? Map.GroundAt(pos.x, pos.z) : 0;
            if (pos.y < ground + 0.6f) pos.y = ground + 0.6f;
            Cam.transform.position = pos;
            Cam.transform.rotation = Quaternion.LookRotation(target - pos, Vector3.up);
        }

        static bool GroundPoint(Camera cam, Vector2 screen, out Vector3 p)
        {
            var ray = cam.ScreenPointToRay(screen);
            var plane = new Plane(Vector3.up, Vector3.zero);
            float t;
            if (plane.Raycast(ray, out t)) { p = ray.GetPoint(t); return true; }
            p = Vector3.zero; return false;
        }

        /// <summary>Moves the camera from this frame's input. overUi: the mouse is over a panel, so the wheel and drags are not the map's.</summary>
        public void Tick(bool overUi, bool typing)
        {
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            var mouse = InputState.Mouse;

            // zoom toward the point under the mouse
            float wheel = overUi ? 0 : InputState.Scroll;
            if (Mathf.Abs(wheel) > 0.01f)
            {
                Vector3 before;
                bool has = GroundPoint(Cam, mouse, out before);
                float newDist = Mathf.Clamp(distGoal * Mathf.Pow(0.85f, wheel), MinDist, MaxDist);
                if (has)
                {
                    // keep that point under the mouse once the zoom has happened
                    float k = 1 - newDist / distGoal;
                    targetGoal += (new Vector3(before.x, 0, before.z) - targetGoal) * k;
                }
                distGoal = newDist;
            }

            // drag with the right or middle button
            bool panButton = InputState.Held(1) || InputState.Held(2);
            if (!panning && !overUi && (InputState.Down(1) || InputState.Down(2)))
            {
                Vector3 g;
                if (GroundPoint(Cam, mouse, out g)) { panning = true; panGrab = g; }
            }
            if (panning)
            {
                if (!panButton) panning = false;
                else
                {
                    Vector3 now;
                    if (GroundPoint(Cam, mouse, out now))
                    {
                        var move = panGrab - now; move.y = 0;
                        target += move; targetGoal = target;
                    }
                }
            }

            if (!typing)
            {
                var fwd = Quaternion.Euler(0, yaw, 0) * Vector3.forward; var right = Quaternion.Euler(0, yaw, 0) * Vector3.right;
                var mv = Vector3.zero;
                if (InputState.Key(KeyCode.W) || InputState.Key(KeyCode.UpArrow)) mv += fwd;
                if (InputState.Key(KeyCode.S) || InputState.Key(KeyCode.DownArrow)) mv -= fwd;
                if (InputState.Key(KeyCode.D) || InputState.Key(KeyCode.RightArrow)) mv += right;
                if (InputState.Key(KeyCode.A) || InputState.Key(KeyCode.LeftArrow)) mv -= right;
                if (mv != Vector3.zero) targetGoal += mv.normalized * distGoal * 0.9f * dt;
                if (InputState.Key(KeyCode.Q)) yawGoal += 70 * dt;
                if (InputState.Key(KeyCode.E)) yawGoal -= 70 * dt;
                if (InputState.KeyDown(KeyCode.Home)) Home(false);
            }

            targetGoal.x = Mathf.Clamp(targetGoal.x, -4, Rules.GridW + 4);
            targetGoal.z = Mathf.Clamp(targetGoal.z, -4, Rules.GridH + 4);
            float f = 1 - Mathf.Exp(-dt * 12);
            if (!panning) target = Vector3.Lerp(target, targetGoal, f);
            dist = Mathf.Lerp(dist, distGoal, f);
            yaw = Mathf.LerpAngle(yaw, yawGoal, f);
            Place();
            if (Map != null) Map.SetFog(dist * 1.6f + 30, dist * 3.2f + 140);
        }
    }
}

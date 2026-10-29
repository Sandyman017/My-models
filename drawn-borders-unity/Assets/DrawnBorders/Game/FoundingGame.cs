// The founding step of Drawn Borders: a new world, you draw your borders on it, see what they give you, name your
// nation and found it. The rules are the web game's own (Engine), the look is new (MapView, the shaders).
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using DrawnBorders.Engine;
using UnityEngine;

namespace DrawnBorders.Game
{
    public sealed partial class FoundingGame : MonoBehaviour
    {
        enum Phase { Loading, Draw, Founded }

        Phase phase = Phase.Loading;
        int seed;
        Task<MapBuild> building;
        volatile string progress = "";
        string loadError;

        MapView map;
        CameraRig rig;
        LineRenderer line;
        Material lineMat;

        World world;
        readonly List<Pt> path = new List<Pt>();
        bool drawing;
        List<int> cells;
        HashSet<int> cellSet;
        FoundingPreview preview;
        string nationName = "", error, note;
        int hoverCell = -1;
        Color nationColor;
        readonly System.Random random = new System.Random();

        public static FoundingGame Instance { get; private set; }

        void Awake() { Instance = this; }

        void Start()
        {
            Application.targetFrameRate = 120;
            nationColor = MapView.Hex(Rules.NationColors[Rules.Player]);
            var cam = Camera.main;
            if (cam == null) { var go = new GameObject("Main Camera"); go.tag = "MainCamera"; cam = go.AddComponent<Camera>(); }
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = MapView.Hex("#8fa7b8");
            map = new GameObject("Map").AddComponent<MapView>();
            rig = cam.gameObject.GetComponent<CameraRig>();
            if (rig == null) rig = cam.gameObject.AddComponent<CameraRig>();
            rig.Init(cam, map);

            var lg = new GameObject("Your border, as you draw it");
            line = lg.AddComponent<LineRenderer>();
            var lineShader = Resources.Load<Shader>("DrawnBorders/Line");
            if (lineShader == null) lineShader = Shader.Find("DrawnBorders/Line");
            lineMat = new Material(lineShader);
            line.sharedMaterial = lineMat;
            line.useWorldSpace = true;
            line.numCapVertices = 3; line.numCornerVertices = 3;
            line.alignment = LineAlignment.View;
            line.positionCount = 0;
            line.startColor = line.endColor = Color.white;
            line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            line.receiveShadows = false;
            lineMat.SetColor("_Color", Color.Lerp(nationColor, Color.white, 0.35f));

            NewWorld(UnityEngine.Random.Range(10000, 100000));
        }

        void NewWorld(int newSeed)
        {
            seed = newSeed;
            phase = Phase.Loading;
            loadError = null;
            progress = "Shaping the continent";
            ClearClaim();
            building = Task.Run(() => MapBuild.Prepare(newSeed, s => progress = s));
        }

        void Update()
        {
            InputState.Poll();
            if (phase == Phase.Loading) { FinishLoading(); }

            bool overUi = OverUi(InputState.Mouse) || phase == Phase.Loading;
            rig.Tick(overUi && !drawing, typing);
            map.SetTime(Time.time);
            line.widthMultiplier = rig.Distance * 0.0042f;

            if (world == null || phase == Phase.Loading) return;

            // the cell under the mouse
            Vector3 hit = Vector3.zero;
            hoverCell = -1;
            bool onMap = !overUi && map.Raycast(rig.Cam.ScreenPointToRay(InputState.Mouse), out hit);
            float cx = 0, cy = 0;
            if (onMap)
            {
                cx = hit.x; cy = Rules.GridH - hit.z;
                if (Rules.InBounds((int)Mathf.Floor(cx), (int)Mathf.Floor(cy))) hoverCell = Rules.Idx((int)Mathf.Floor(cx), (int)Mathf.Floor(cy));
            }
            map.SetHover(drawing ? -1 : hoverCell);

            if (phase != Phase.Draw) return;
            // draw your borders: press, drag around the land you want, release
            if (!drawing && onMap && InputState.Down(0))
            {
                drawing = true; path.Clear(); line.positionCount = 0;
                error = null; note = null;
                AddPoint(cx, cy);
            }
            if (drawing)
            {
                if (InputState.KeyDown(KeyCode.Escape)) { drawing = false; path.Clear(); line.positionCount = 0; return; }
                if (InputState.Held(0))
                {
                    Vector3 h2;
                    if (map.Raycast(rig.Cam.ScreenPointToRay(InputState.Mouse), out h2))
                    {
                        float x = h2.x, y = Rules.GridH - h2.z;
                        var last = path[path.Count - 1];
                        if (Math.Sqrt((x - last.X) * (x - last.X) + (y - last.Y) * (y - last.Y)) > 0.35) AddPoint(x, y);
                    }
                }
                else
                {
                    drawing = false;
                    ApplyClaim(Borders.ClaimFromPath(world, path));
                    line.positionCount = 0;
                }
            }
        }

        void AddPoint(float x, float y)
        {
            path.Add(new Pt(x, y));
            line.positionCount = path.Count;
            line.SetPosition(path.Count - 1, new Vector3(x, map.GroundAt(x, Rules.GridH - y) + 0.06f, Rules.GridH - y));
        }

        void FinishLoading()
        {
            if (building == null || !building.IsCompleted) return;
            if (building.IsFaulted)
            {
                var ex = building.Exception != null ? building.Exception.GetBaseException() : null;
                loadError = ex != null ? ex.Message : "unknown error";
                Debug.LogException(ex ?? new Exception(loadError));
                building = null;
                return;
            }
            var b = building.Result;
            building = null;
            world = b.World;
            map.Show(b);
            rig.Home(true);
            phase = Phase.Draw;
        }

        void ApplyClaim(Claim res)
        {
            if (res.Ok)
            {
                cells = res.Cells;
                cellSet = new HashSet<int>(cells);
                error = null;
                note = res.DroppedCells > 0 ? Borders.FmtArea(res.DroppedCells) + " of land was cut off from the rest of your borders, so it was left out." : null;
                if (string.IsNullOrEmpty(nationName)) nationName = Rules.PlayerNames[random.Next(Rules.PlayerNames.Length)];
                preview = FoundingPreview.Make(world, cells);
                map.SetOwner(cells);
                map.SetOwnerLook(nationColor, 1, false);
                map.ShowTowns(preview.Towns);
            }
            else
            {
                ClearClaim();
                error = res.Error;
            }
        }

        void ClearClaim()
        {
            cells = null; cellSet = null; preview = null; error = null; note = null;
            drawing = false; path.Clear();
            if (line != null) line.positionCount = 0;
            if (map != null && map.World != null) { map.SetOwner(null); map.SetOwnerLook(nationColor, 0, false); map.ShowTowns(null); }
        }

        void TrySample()
        {
            Claim res;
            FoundingPreview.SampleShape(world, (uint)Environment.TickCount, out res);
            ApplyClaim(res);
            if (res.Ok)
            {
                // look at the new borders
                float sx = 0, sz = 0;
                foreach (int c in res.Cells) { var p = map.CellCentre(c); sx += p.x; sz += p.z; }
                rig.LookAt(new Vector3(sx / res.Cells.Count, 0, sz / res.Cells.Count), 34);
            }
        }

        void Found()
        {
            if (cells == null) return;
            nationName = CleanName(nationName);
            phase = Phase.Founded;
            map.SetOwnerLook(nationColor, 1, true);
        }

        void Unfound()
        {
            phase = Phase.Draw;
            map.SetOwnerLook(nationColor, 1, false);
        }

        static string CleanName(string raw)
        {
            var s = string.Join(" ", (raw ?? "").Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries));
            if (s.Length > 32) s = s.Substring(0, 32);
            return s.Length > 0 ? s : "Unnamed Nation";
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (lineMat != null) Destroy(lineMat);
        }
    }
}

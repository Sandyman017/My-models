// The 3D map: the land as a mesh lifted by its heights, the sea as a moving water surface, and what is drawn on top
// (every nation's land and borders, province lines, the deposits, the cell under the mouse, the towns).
using System;
using System.Collections.Generic;
using DrawnBorders.Bake;
using DrawnBorders.Engine;
using UnityEngine;
using UnityEngine.Rendering;

namespace DrawnBorders.Game
{
    /// <summary>Everything about a new world that can be worked out away from the main thread.</summary>
    public sealed class MapBuild
    {
        public World World;
        public BakedMap Map;
        public byte[] Color, Data, Normal;     // the baked pictures, bottom row first as Unity wants them
        public Vector3[] Verts;
        public int[] Tris;
        public byte[] Detail;

        public const int Res = 24;             // picture pixels per cell
        public const int MeshRes = 8;          // mesh points per cell
        public const int DetailSize = 256;

        public static MapBuild Prepare(int seed, Action<string> progress)
        {
            var b = new MapBuild();
            progress("Shaping the continent");
            b.World = World.Generate(seed);
            _ = b.World.Sea; _ = b.World.RiverGeo;
            b.Map = MapBaker.Bake(b.World, Res, progress);
            progress("Building the land");
            b.Color = FlipRows(b.Map.Color, b.Map.W, b.Map.H, 4);
            b.Data = FlipRows(b.Map.Data, b.Map.W, b.Map.H, 4);
            b.Normal = FlipRows(b.Map.Normal, b.Map.W, b.Map.H, 4);
            int nx = Rules.GridW * MeshRes + 1, nz = Rules.GridH * MeshRes + 1;
            b.Verts = new Vector3[nx * nz];
            for (int j = 0; j < nz; j++) for (int i = 0; i < nx; i++)
            {
                float x = (float)i / MeshRes, z = (float)j / MeshRes;
                b.Verts[j * nx + i] = new Vector3(x, b.Map.HeightAt(x, Rules.GridH - z), z);
            }
            b.Tris = new int[(nx - 1) * (nz - 1) * 6];
            int t = 0;
            for (int j = 0; j < nz - 1; j++) for (int i = 0; i < nx - 1; i++)
            {
                int a = j * nx + i, c = a + nx;
                b.Tris[t++] = a; b.Tris[t++] = c; b.Tris[t++] = a + 1;
                b.Tris[t++] = a + 1; b.Tris[t++] = c; b.Tris[t++] = c + 1;
            }
            b.Detail = MapBaker.DetailNoise(DetailSize, 4242);
            return b;
        }

        public static byte[] FlipRows(byte[] src, int w, int h, int bpp)
        {
            var o = new byte[src.Length];
            int row = w * bpp;
            for (int y = 0; y < h; y++) Buffer.BlockCopy(src, y * row, o, (h - 1 - y) * row, row);
            return o;
        }
    }

    public sealed class MapView : MonoBehaviour
    {
        public World World { get; private set; }
        public BakedMap Map { get; private set; }

        Material terrainMat, waterMat, markerMat, capitalMat;
        readonly List<UnityEngine.Object> owned = new List<UnityEngine.Object>();
        Texture2D polIds, polDist, palette;
        GameObject terrainGo, waterGo, townsRoot;

        public static readonly Color[] DepositColors =
        {
            new Color(0, 0, 0, 0),
            Hex("#8ea3b8"),   // metal ore: blue-gray
            Hex("#5a4636"),   // coal: brown
            Hex("#9a68d0"),   // oil and gas: purple
            Hex("#efcc4e"),   // gold: yellow
        };

        public static Color Hex(string h)
        {
            Color c; ColorUtility.TryParseHtmlString(h, out c); return c;
        }

        static Shader LoadShader(string name)
        {
            var s = Resources.Load<Shader>("DrawnBorders/" + name);
            if (s == null) s = Shader.Find("DrawnBorders/" + name);
            if (s == null) Debug.LogError("Drawn Borders: shader " + name + " is missing (Assets/DrawnBorders/Resources/DrawnBorders).");
            return s;
        }

        Texture2D Tex(int w, int h, byte[] rgba, bool linear, bool mips, FilterMode filter, TextureWrapMode wrap, bool keepReadable = false)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, mips, linear);
            t.wrapMode = wrap; t.filterMode = filter; t.anisoLevel = mips ? 8 : 1;
            // only the full-size level: LoadRawTextureData wants every mip level when the texture has them
            t.SetPixelData(rgba, 0);
            t.Apply(mips, !keepReadable);
            owned.Add(t);
            return t;
        }

        public void Show(MapBuild b)
        {
            Clear();
            World = b.World; Map = b.Map;
            var map = b.Map;
            var colorTex = Tex(map.W, map.H, b.Color, false, true, FilterMode.Trilinear, TextureWrapMode.Clamp);
            var dataTex = Tex(map.W, map.H, b.Data, true, true, FilterMode.Trilinear, TextureWrapMode.Clamp);
            var normalTex = Tex(map.W, map.H, b.Normal, true, true, FilterMode.Trilinear, TextureWrapMode.Clamp);
            var detailTex = Tex(MapBuild.DetailSize, MapBuild.DetailSize, b.Detail, true, true, FilterMode.Trilinear, TextureWrapMode.Repeat);

            // the sea's colour by depth (the web map's water colours)
            var grad = new byte[256 * 4];
            Color[] stops = { Hex("#4a9a9c"), Hex("#2a7486"), Hex("#17506f"), Hex("#0e3150"), Hex("#0a2236") };
            float[] at = { 0, 0.012f, 0.05f, 0.14f, 0.34f };
            for (int i = 0; i < 256; i++)
            {
                float d = i / 255f * 0.35f; int s = 0;
                while (s < stops.Length - 2 && d > at[s + 1]) s++;
                var c = Color.Lerp(stops[s], stops[s + 1], Mathf.InverseLerp(at[s], at[s + 1], d));
                grad[i * 4] = (byte)(c.r * 255); grad[i * 4 + 1] = (byte)(c.g * 255); grad[i * 4 + 2] = (byte)(c.b * 255); grad[i * 4 + 3] = 255;
            }
            var gradTex = Tex(256, 1, grad, false, false, FilterMode.Bilinear, TextureWrapMode.Clamp);

            // deposits: one pixel a cell
            var dep = new byte[Rules.NCells * 4];
            for (int i = 0; i < Rules.NCells; i++)
            {
                int k = World.Dep[i]; if (k == 0) continue;
                int row = Rules.GridH - 1 - Rules.CellY(i), o = (row * Rules.GridW + Rules.CellX(i)) * 4;
                var c = DepositColors[k];
                dep[o] = (byte)(c.r * 255); dep[o + 1] = (byte)(c.g * 255); dep[o + 2] = (byte)(c.b * 255); dep[o + 3] = 255;
            }
            var depTex = Tex(Rules.GridW, Rules.GridH, dep, false, false, FilterMode.Point, TextureWrapMode.Clamp);

            // nations and provinces (PoliticalMap): filled by SetPolitics
            // (the shader blends the four pixels around a point itself, so both are read pixel by pixel)
            polIds = Tex(PoliticalMap.W, PoliticalMap.H, new byte[PoliticalMap.W * PoliticalMap.H * 4], true, false, FilterMode.Point, TextureWrapMode.Clamp, true);
            polDist = Tex(PoliticalMap.W, PoliticalMap.H, new byte[PoliticalMap.W * PoliticalMap.H * 4], true, false, FilterMode.Point, TextureWrapMode.Clamp, true);
            palette = Tex(256, 2, new byte[256 * 2 * 4], false, false, FilterMode.Point, TextureWrapMode.Clamp, true);

            terrainMat = new Material(LoadShader("Terrain")); owned.Add(terrainMat);
            waterMat = new Material(LoadShader("Water")); owned.Add(waterMat);
            markerMat = new Material(LoadShader("Marker")); owned.Add(markerMat);
            capitalMat = new Material(LoadShader("Marker")); owned.Add(capitalMat);
            markerMat.SetColor("_Color", Hex("#f2ede2"));
            capitalMat.SetColor("_Color", Hex("#e8c35a"));

            terrainMat.SetTexture("_ColorTex", colorTex);
            terrainMat.SetTexture("_DataTex", dataTex);
            terrainMat.SetTexture("_NormalTex", normalTex);
            terrainMat.SetTexture("_DetailTex", detailTex);
            terrainMat.SetTexture("_PolIds", polIds);
            terrainMat.SetTexture("_PolDist", polDist);
            terrainMat.SetVector("_PolSize", new Vector4(PoliticalMap.W, PoliticalMap.H, 1f / PoliticalMap.W, 1f / PoliticalMap.H));
            terrainMat.SetFloat("_DistRange", PoliticalMap.DistRange);
            terrainMat.SetTexture("_Palette", palette);
            terrainMat.SetTexture("_DepTex", depTex);
            terrainMat.SetColor("_RiverColor", Hex("#3a7f95"));
            waterMat.SetTexture("_DataTex", dataTex);
            waterMat.SetTexture("_DetailTex", detailTex);
            waterMat.SetTexture("_WaterGrad", gradTex);
            SetPoliticsLook(0, 0.22f, false, false);
            SetHover(-1);
            ApplyLight();

            // the land
            var mesh = new Mesh { name = "Land", indexFormat = IndexFormat.UInt32 };
            mesh.vertices = b.Verts;
            mesh.triangles = b.Tris;
            mesh.RecalculateBounds();
            owned.Add(mesh);
            terrainGo = new GameObject("Land");
            terrainGo.transform.SetParent(transform, false);
            terrainGo.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = terrainGo.AddComponent<MeshRenderer>();
            mr.sharedMaterial = terrainMat; mr.shadowCastingMode = ShadowCastingMode.Off; mr.receiveShadows = false;

            // the sea: one wide sheet of water at sea level, reaching far past the map
            var wm = new Mesh { name = "Sea" };
            float x0 = -260, x1 = Rules.GridW + 260, z0 = -260, z1 = Rules.GridH + 260;
            wm.vertices = new[] { new Vector3(x0, 0, z0), new Vector3(x1, 0, z0), new Vector3(x0, 0, z1), new Vector3(x1, 0, z1) };
            wm.triangles = new[] { 0, 2, 1, 1, 2, 3 };
            wm.RecalculateBounds();
            owned.Add(wm);
            waterGo = new GameObject("Sea");
            waterGo.transform.SetParent(transform, false);
            waterGo.AddComponent<MeshFilter>().sharedMesh = wm;
            var wr = waterGo.AddComponent<MeshRenderer>();
            wr.sharedMaterial = waterMat; wr.shadowCastingMode = ShadowCastingMode.Off; wr.receiveShadows = false;

            townsRoot = new GameObject("Towns");
            townsRoot.transform.SetParent(transform, false);
        }

        /// <summary>The light: the sun in the north-west as on the web map, a pale sky, haze in the distance.</summary>
        void ApplyLight()
        {
            var s = MapBaker.Sun;
            var sun = new Vector4((float)s[0], (float)s[2], (float)-s[1], 0);
            bool linear = QualitySettings.activeColorSpace == ColorSpace.Linear;
            foreach (var m in new[] { terrainMat, waterMat, markerMat, capitalMat })
            {
                m.SetVector("_SunDir", sun);
                m.SetVector("_SunLight", new Vector4(0.98f, 0.93f, 0.84f, 1));
                m.SetVector("_SkyLight", new Vector4(0.36f, 0.42f, 0.5f, 1));
                m.SetVector("_GroundLight", new Vector4(0.2f, 0.19f, 0.16f, 1));
                m.SetFloat("_LinearSpace", linear ? 1 : 0);
                m.SetColor("_FogColor", Hex("#8fa7b8"));
                m.SetVector("_MapSize", new Vector4(Rules.GridW, Rules.GridH, 0, 0));
            }
        }

        public void SetFog(float near, float far)
        {
            foreach (var m in new[] { terrainMat, waterMat, markerMat, capitalMat })
            {
                if (m == null) continue;
                m.SetFloat("_FogNear", near); m.SetFloat("_FogFar", far);
            }
        }

        /// <summary>Who owns the land and the provinces, as worked out by PoliticalMap.Build.</summary>
        public void SetPolitics(PoliticalMap pm)
        {
            if (polIds == null) return;
            polIds.LoadRawTextureData(pm.Ids); polIds.Apply(false, false);
            polDist.LoadRawTextureData(pm.Dist); polDist.Apply(false, false);
            palette.LoadRawTextureData(pm.Palette); palette.Apply(false, false);
        }

        /// <summary>How nations are shown: how strongly (0 hidden … 1 shown), the fill's strength, the player's provinces
        /// tinted (while dividing the country), province lines.</summary>
        public void SetPoliticsLook(float shown, float fill, bool provTints, bool provLines)
        {
            if (terrainMat == null) return;
            terrainMat.SetFloat("_OwnerShown", shown);
            terrainMat.SetFloat("_OwnerFill", fill);
            terrainMat.SetFloat("_ProvTint", provTints ? 1 : 0);
            terrainMat.SetFloat("_ProvLines", provLines ? 1 : 0);
        }

        public void SetHover(int cell)
        {
            if (terrainMat == null) return;
            terrainMat.SetVector("_HoverCell", cell < 0 ? new Vector4(-10, -10, 0, 0) : new Vector4(Rules.CellX(cell), Rules.CellY(cell), 1, 0));
        }

        public void SetTime(float t)
        {
            if (waterMat != null) waterMat.SetFloat("_Clock", t);
            if (terrainMat != null) terrainMat.SetFloat("_Clock", t);
        }

        /// <summary>Where a cell's centre stands in the 3D world.</summary>
        public Vector3 CellCentre(int cell)
        {
            float x = Rules.CellX(cell) + 0.5f, y = Rules.CellY(cell) + 0.5f;
            return new Vector3(x, Mathf.Max(0, Map.HeightAt(x, y)), Rules.GridH - y);
        }

        public float GroundAt(float x, float z) { return Map == null ? 0 : Mathf.Max(0, Map.HeightAt(x, Rules.GridH - z)); }

        /// <summary>The point of the land or sea under a ray from the camera.</summary>
        public bool Raycast(Ray ray, out Vector3 hit)
        {
            hit = Vector3.zero;
            if (Map == null) return false;
            const float top = 2.5f;
            if (ray.direction.y >= -1e-4f) return false;
            float t0 = ray.origin.y > top ? (ray.origin.y - top) / -ray.direction.y : 0;
            float t1 = ray.origin.y / -ray.direction.y;   // where it meets the sea
            float step = 0.05f, prev = t0;
            for (float t = t0; t <= t1 + step; t += step)
            {
                var p = ray.GetPoint(Mathf.Min(t, t1));
                if (p.y <= GroundAt(p.x, p.z))
                {
                    float lo = prev, hi = Mathf.Min(t, t1);
                    for (int i = 0; i < 10; i++)
                    {
                        float mid = (lo + hi) * 0.5f; var q = ray.GetPoint(mid);
                        if (q.y <= GroundAt(q.x, q.z)) hi = mid; else lo = mid;
                    }
                    hit = ray.GetPoint(hi);
                    return true;
                }
                prev = t;
                if (t >= t1) break;
            }
            hit = ray.GetPoint(t1);
            return true;
        }

        /// <summary>Small 3D towns where your borders would put them; the capital is gold and larger.</summary>
        public void ShowTowns(List<Town> towns)
        {
            if (townsRoot == null) return;
            for (int i = townsRoot.transform.childCount - 1; i >= 0; i--) Destroy(townsRoot.transform.GetChild(i).gameObject);
            if (towns == null) return;
            foreach (var t in towns)
            {
                var root = new GameObject(t.Capital ? "Capital" : "Town");
                root.transform.SetParent(townsRoot.transform, false);
                var c = CellCentre(t.Cell);
                root.transform.localPosition = c;
                var rng = new Rng((uint)(t.Cell * 7919 + 13));
                int houses = t.Capital ? 9 : 5;
                for (int h = 0; h < houses; h++)
                {
                    double ang = rng.Next() * Math.PI * 2, rad = Math.Sqrt(rng.Next()) * (t.Capital ? 0.24 : 0.17);
                    float sx = (float)(0.05 + rng.Next() * 0.05), sz = (float)(0.05 + rng.Next() * 0.05), sy = (float)(0.04 + rng.Next() * (t.Capital ? 0.1 : 0.05));
                    if (t.Capital && h == 0) { sx = 0.07f; sz = 0.07f; sy = 0.26f; ang = 0; rad = 0; }
                    float px = (float)(Math.Cos(ang) * rad), pz = (float)(Math.Sin(ang) * rad);
                    var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    var col = g.GetComponent<Collider>(); if (col != null) Destroy(col);
                    g.transform.SetParent(root.transform, false);
                    float ground = GroundAt(c.x + px, c.z + pz) - c.y;
                    g.transform.localPosition = new Vector3(px, ground + sy * 0.5f - 0.01f, pz);
                    g.transform.localRotation = Quaternion.Euler(0, (float)(rng.Next() * 90), 0);
                    g.transform.localScale = new Vector3(sx, sy, sz);
                    var r = g.GetComponent<MeshRenderer>();
                    r.sharedMaterial = t.Capital && h == 0 ? capitalMat : markerMat;
                    r.shadowCastingMode = ShadowCastingMode.Off; r.receiveShadows = false;
                }
            }
        }

        void Clear()
        {
            if (terrainGo != null) Destroy(terrainGo);
            if (waterGo != null) Destroy(waterGo);
            if (townsRoot != null) Destroy(townsRoot);
            foreach (var o in owned) if (o != null) Destroy(o);
            owned.Clear();
            terrainMat = waterMat = markerMat = capitalMat = null;
            polIds = polDist = palette = null;
        }

        void OnDestroy() { Clear(); }
    }
}

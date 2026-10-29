# Checks without Unity

Run from `drawn-borders-unity/` (needs `dotnet` 8, Node, and `glslang-tools` for the shaders).

1. **The rules are the web game's**:
   `node Tools/js-reference.js ref.json` (the web engine's worlds, borders, traits and towns for 6 seeds), then
   `dotnet run -c Release --project Tools/EngineCheck -- ref.json [picture folder]`.
   It must say `ALL THE SAME as the web game`. With a picture folder it also bakes the first world and saves `map-<seed>.png`, lit roughly as the Unity shader lights it, to look at the map without Unity.
2. **Every Unity script compiles**: `dotnet build -c Release Tools/UnityCompile` (against Unity's reference libraries from NuGet, Unity 2021.3; no Unity needed).
3. **The shaders compile**: `python3 Tools/check-shaders.py` (each pass's vertex and fragment program through glslangValidator, with a small stand-in for UnityCG.cginc; it does not know `tex2Dlod`, so the shaders use `tex2D`).

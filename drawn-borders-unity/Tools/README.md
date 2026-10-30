# Checks

Run from `drawn-borders-unity/` (needs `dotnet` 8, Node, and `glslang-tools` for the shaders). Maz's PC has no Node of its own, but Unity ships one: `"C:\Program Files\Unity\Hub\Editor\6000.6.7f1\Editor\Data\PlaybackEngines\WebGLSupport\BuildTools\Emscripten\node\node.exe"` (Node 22).

## The game's JavaScript engine runs the same in Unity (`js-engine/`)

0. **After every change to `../drawn-borders/src/engine`**: `node Tools/js-engine/bundle.js` writes the engine into `Assets/DrawnBorders/Resources/DrawnBorders/engine-bundle.txt` (`polyfill.js` first, then `engineSource()` from `../drawn-borders/build.js`); commit it with the change. `--check` fails if it is out of date.
1. `node Tools/js-engine/node-check.js node.txt`: plays the worlds of `js-engine/check.js` (seeds 1000, 8919, 16838; the sample claim of `drawn-borders/tests/engine.test.js`; 12 seasons) in Node and writes the summary: each nation's people, output, stability and treasury every season, and a hash of the whole game. It also checks that the polyfill's number writer matches Node's `toLocaleString("en-US")` on 100,000 numbers.
2. Unity's side, in batch mode (the project must be closed in the editor; or copy `Assets`, `Packages`, `ProjectSettings` and `Tools` to another folder, such as `D:\Games\db-js-batch`, and run it there):
   `Start-Process "C:\Program Files\Unity\Hub\Editor\6000.6.7f1\Editor\Unity.exe" -ArgumentList "-batchmode","-quit","-projectPath",<project>,"-executeMethod","DrawnBorders.JsEngineCheck.Run","-logFile",<log>,"-checkOut",<unity.txt> -PassThru`, then `WaitForExit()` (exit code 1 on any error; about 90 s on a fresh copy, most of it importing). In the open editor: menu **Drawn Borders → Check the JS engine (same as Node)** writes `Temp/js-check/unity.txt`.
3. `node Tools/js-engine/node-check.js --compare node.txt unity.txt` must say `ALL THE SAME`. It also prints the season times side by side.

First result (30 Oct 2026, Unity 6000.6.7f1, PuerTS 3.0.3 V8 against Node 22.16): all 366 lines the same; a season took 601 / 357 / 328 ms in Unity and 578 / 358 / 312 ms in Node; loading the engine takes 1.5 s in Unity. Unity's V8 has no `Intl`, so the polyfill writes the numbers there (Node's own `Intl` gives the same game).

The engine calls `Math.random` once (the ministers' salt `g.cabSalt`, on the first season); `check.js` seeds it from the world's seed in both. It uses no `Date`. Node runs the bundle as a plain script, as a browser page does: in a context made with `vm.createContext` (as `drawn-borders/tests/*.test.js` do) every season is about 5 times slower, so those tests' times are not the browser's.

## Playing the founding through in batch mode, with pictures (`Assets/DrawnBorders/Editor/PlayCheck.cs`)

`Start-Process <Unity.exe> -ArgumentList "-batchmode","-projectPath",<project>,"-executeMethod","DrawnBorders.PlayCheck.Run","-logFile",<log>,"-shotDir",<folder> -PassThru`, then `WaitForExit()` (no `-quit`: it quits by itself; exit code 1 if a step failed or the game logged an error; about 40 s on a warm copy). It presses Play, draws a sample shape, founds the nation, divides it in five, draws a province with the pen around the capital, renames one, starts, and saves `1-borders.png` … `6-close.png` (the map only: the panels and names are IMGUI, which batch mode does not draw; the white square in a corner is the cell under the mouse). Its log lines start with `Play check:` (nations, provinces, the pen's land, the first lines of the story). Use the project copy (`D:\Games\db-js-batch`; refresh it with `robocopy Assets <copy>\Assets /MIR /XF *.meta` and the same for `Tools`) while Maz has the project open.

## Checks without Unity

1. **The C# port (founding step) is the web game's**:
   `node Tools/js-reference.js ref.json` (the web engine's worlds, borders, traits and towns for 6 seeds), then
   `dotnet run -c Release --project Tools/EngineCheck -- ref.json [picture folder]`.
   It must say `ALL THE SAME as the web game`. With a picture folder it also bakes the first world and saves `map-<seed>.png`, lit roughly as the Unity shader lights it, to look at the map without Unity.
2. **Every Unity script compiles**: `dotnet build -c Release Tools/UnityCompile` (against Unity's reference libraries from NuGet, Unity 2021.3; no Unity needed). It compiles PuerTS too, but not the `Editor` folders (UnityEditor is not on NuGet): only Unity checks those.
3. **The shaders compile**: `python3 Tools/check-shaders.py` (each pass's vertex and fragment program through glslangValidator, with a small stand-in for UnityCG.cginc; it does not know `tex2Dlod`, so the shaders use `tex2D`).

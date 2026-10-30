# Drawn Borders in Unity

The first step of Drawn Borders, made in Unity: a new world in 3D, you draw your borders on it, see what they give you, name your nation and found it.

The rules are the web game's own, moved to C#: the same world number makes the same continent, deposits, rivers, borders, stability, defense and towns as in the web game. The look is new: the land stands in 3D with real mountains, shadows from the sun, rivers, and a moving sea.

## How to open it

1. Get this folder onto your PC: pull the branch `claude/sleepy-newton-3rfvjr` of `My-models` (GitHub Desktop), or download it as a ZIP from GitHub.
2. Open **Unity Hub** → **Add** → **Add project from disk** → choose the folder `drawn-borders-unity`.
3. If Unity Hub asks which Unity version to use, pick **Unity 6** (the one you made the truck game with). If Unity shows warnings about the Input System or the render pipeline, you can close them: the game works with either setting.
4. Open it. The first time, Unity sets up the project (a minute or two).
5. Press **Play** (the ▶ button at the top). The game starts by itself; there is no scene to set up.

Tip: in the Game window, choose **Maximize on Play**, so the map fills the screen.

## How to play

- **Left mouse, drag**: draw your borders around the land you want, then let go.
- **Right or middle mouse, drag**: move the map.
- **Mouse wheel**, or hold **R / F** (or **+ / −**): zoom (the camera tilts toward the horizon as you get closer).
- **W A S D** or the arrow keys: move. **Q / E**: turn. **Home**: the whole map again.
- The panel on the right shows what your borders give you. Name your nation, then **Found this nation**.
- Then your rivals appear, and you divide your country into provinces: **Divide it for me** (or into 1 to 5), or draw around some of your land with the left mouse to make it a province. Click a province's name to change it, and **change** to pick its capital. Then **Start with these provinces**.
- **Space** starts and pauses time (or **▶ Play** at the top right; ▶ ▶▶ ▶▶▶ are the speeds: a season every 36, 18 or 8 seconds). The bar at the top shows your treasury, output, people, food, stability, army and prestige. The news is on the right: click a line for the season report. When something needs you (a war, a letter, a decision), the game pauses by itself. Decisions open as cards: choose one, or **Decide later**.

## If something goes wrong

Open **Window → General → Console**, and send Claude the red lines.

If Unity Hub will not add the folder: make a new empty 3D project in Unity Hub, then copy the folder `Assets/DrawnBorders` from here into the new project's `Assets` folder and press Play.

## What is in here

- `Assets/DrawnBorders/Engine` — the rules (world, rivers, deposits, borders, the founding preview), the same as the web game.
- `Assets/DrawnBorders/Bake` — paints the world into the pictures the 3D map is made from.
- `Assets/DrawnBorders/Game` — the 3D map, the camera, drawing your borders, the founding panel.
- `Assets/DrawnBorders/Resources/DrawnBorders` — the shaders: how the land, the sea, the border and the towns are drawn.
- `Tools` — checks Claude runs without Unity (see `Tools/README.md`).

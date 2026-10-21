/* The Windows program: opens the built game (drawn-borders.html) in its own window.
   The game itself is unchanged; this file only adds what a program has and a browser tab does not:
   its own window and icon, full screen on F11, and save files written straight to Documents\Drawn Borders\Saves. */
"use strict";
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const savesFolder = () => path.join(app.getPath("documents"), "Drawn Borders", "Saves");

// One copy at a time: two windows would overwrite each other's autosave.
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1100, minHeight: 680,
    title: "Drawn Borders",
    backgroundColor: "#0c1116",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.setMenu(null);
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  // links (Credits, licenses) open in the normal browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadFile(path.join(__dirname, "..", "drawn-borders.html"));
}

ipcMain.on("saves-folder", e => { e.returnValue = savesFolder(); });
ipcMain.handle("save-file", async (_e, name, data) => {
  const dir = savesFolder();
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, path.basename(String(name))), String(data), "utf8");
  return dir;
});

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

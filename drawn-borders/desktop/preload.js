/* What the game may ask of the Windows program (see the save-file code in src/ui/57-20b-saved-games.js). */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  savesFolder: ipcRenderer.sendSync("saves-folder"),
  saveFile: (name, data) => ipcRenderer.invoke("save-file", name, data),
});

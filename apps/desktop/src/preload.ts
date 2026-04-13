import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("openclawTeamOs", {
  platform: process.platform
});

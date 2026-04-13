import { app, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { APP_NAME } from "@openclaw-team-os/config";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const customUserDataPath = process.env.OPENCLAW_TEAM_OS_USER_DATA_DIR;

if (customUserDataPath) {
  app.setPath("userData", customUserDataPath);
}

function resolveRendererIndexPath(): string {
  const packagedRendererPath = path.resolve(currentDir, "renderer/index.html");

  if (app.isPackaged && existsSync(packagedRendererPath)) {
    return packagedRendererPath;
  }

  return path.resolve(currentDir, "../../web/dist/index.html");
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    title: APP_NAME,
    backgroundColor: "#f8fafc"
  });

  const devUrl = process.env.OPENCLAW_TEAM_OS_WEB_URL;

  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(resolveRendererIndexPath());
  }

  return window;
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

#!/usr/bin/env node

import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMAND_PATH = path.join(ROOT_DIR, "OpenClaw Team OS.command");
const ICON_PATH = path.join(ROOT_DIR, "apps", "desktop", "build", "icon.icns");
const OUTPUT_PATH = path.join(ROOT_DIR, "OpenClaw Team OS Launcher.app");

function log(message) {
  process.stdout.write(`[mac-launcher] ${message}\n`);
}

function quotedAppleScriptString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

if (process.platform !== "darwin") {
  throw new Error("The macOS launcher can only be built on macOS.");
}

if (!existsSync(COMMAND_PATH)) {
  throw new Error(`Missing launcher command file: ${COMMAND_PATH}`);
}

if (!existsSync(ICON_PATH)) {
  throw new Error(`Missing launcher icon: ${ICON_PATH}`);
}

const repoPath = `${ROOT_DIR}/`;
const command = `cd ${quotedAppleScriptString(repoPath)} && ${quotedAppleScriptString(COMMAND_PATH)}`;

await rm(OUTPUT_PATH, {
  force: true,
  recursive: true
});

log("Compiling launcher app");
await runCommand("/usr/bin/osacompile", [
  "-o",
  OUTPUT_PATH,
  "-e",
  "on run",
  "-e",
  'tell application "Terminal"',
  "-e",
  "activate",
  "-e",
  "if (count of windows) = 0 then reopen",
  "-e",
  `do script ${quotedAppleScriptString(command)}`,
  "-e",
  "end tell",
  "-e",
  "end run"
]);

const bundleIconPath = path.join(OUTPUT_PATH, "Contents", "Resources", "applet.icns");
log("Applying launcher icon");
await cp(ICON_PATH, bundleIconPath, {
  force: true
});

log(`Created ${OUTPUT_PATH}`);

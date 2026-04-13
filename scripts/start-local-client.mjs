#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const APP_NAME = "OpenClaw Team OS";
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = process.env.OPENCLAW_TEAM_OS_API_URL ?? "http://127.0.0.1:4000";
const AUTO_EXIT_MS = Number(process.env.OPENCLAW_TEAM_OS_EXIT_AFTER_BOOT_MS ?? "0");
const SHOULD_USE_NATIVE_MAC_FEEDBACK = process.platform === "darwin" && AUTO_EXIT_MS === 0;

let startedApiProcess = null;
let desktopProcess = null;
let shuttingDown = false;

function log(message) {
  process.stdout.write(`[local-launch] ${message}\n`);
}

function printBanner() {
  process.stdout.write(
    `\n${APP_NAME}\n` +
      "Desktop-first local launcher\n" +
      "----------------------------------------\n"
  );
}

function createChild(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: "inherit"
  });

  child.on("error", (error) => {
    log(`${command} failed to start: ${error instanceof Error ? error.message : String(error)}`);
  });

  return child;
}

async function runCommand(command, args, label) {
  log(label);

  await new Promise((resolve, reject) => {
    const child = createChild(command, args);

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function runOsascript(lines) {
  await new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/osascript", lines.flatMap((line) => ["-e", line]), {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: "ignore"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`osascript failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

function escapeAppleScriptText(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function notifyMac(title, message) {
  if (!SHOULD_USE_NATIVE_MAC_FEEDBACK) {
    return;
  }

  try {
    await runOsascript([
      `display notification "${escapeAppleScriptText(message)}" with title "${escapeAppleScriptText(title)}"`
    ]);
  } catch {
    // Notifications are nice-to-have only.
  }
}

async function alertMac(title, message) {
  if (!SHOULD_USE_NATIVE_MAC_FEEDBACK) {
    return;
  }

  try {
    await runOsascript([
      `display alert "${escapeAppleScriptText(title)}" message "${escapeAppleScriptText(message)}" as critical`
    ]);
  } catch {
    // Alerts are best-effort only.
  }
}

async function isReachable(url) {
  try {
    const response = await fetch(url, {
      redirect: "manual"
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, label, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isReachable(url)) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}.`);
}

async function stopProcess(child, label) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5000).then(() => {
      child.kill("SIGKILL");
    })
  ]);
  log(`Stopped ${label}`);
}

async function cleanup(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await stopProcess(desktopProcess, "desktop client");
  await stopProcess(startedApiProcess, "local API");
  process.exit(exitCode);
}

async function ensurePnpm() {
  await runCommand("pnpm", ["--version"], "Checking pnpm");
}

function ensureNodeVersion() {
  const [major] = process.versions.node.split(".").map(Number);

  if (Number.isNaN(major) || major < 20) {
    throw new Error(`Node.js 20+ is required. Current version: ${process.versions.node}`);
  }
}

async function ensureDependencies() {
  const pnpmStoreDir = path.join(ROOT_DIR, "node_modules", ".pnpm");

  if (existsSync(pnpmStoreDir)) {
    return;
  }

  await runCommand("pnpm", ["install"], "Installing dependencies");
}

async function ensureApi() {
  if (await isReachable(`${API_URL}/health`)) {
    log(`Reusing API at ${API_URL}`);
    return;
  }

  log(`Starting API at ${API_URL}`);
  startedApiProcess = createChild("node", ["apps/api/dist/index.js"]);
  await waitForUrl(`${API_URL}/health`, "API health");
}

async function launchDesktop() {
  log("Opening desktop client");
  desktopProcess = createChild(
    "pnpm",
    ["--filter", "@openclaw-team-os/desktop", "start"],
    {
      OPENCLAW_TEAM_OS_WEB_URL: ""
    }
  );

  if (AUTO_EXIT_MS > 0) {
    log(`Auto-exit is enabled. Closing after ${AUTO_EXIT_MS} ms.`);
    await delay(AUTO_EXIT_MS);
    await stopProcess(desktopProcess, "desktop client");
    desktopProcess = null;
    return;
  }

  await new Promise((resolve, reject) => {
    desktopProcess.once("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
        return;
      }

      reject(new Error(`Desktop client exited with code ${code}.`));
    });
  });
}

process.on("SIGINT", () => {
  void cleanup(130);
});

process.on("SIGTERM", () => {
  void cleanup(143);
});

try {
  printBanner();
  ensureNodeVersion();
  await ensurePnpm();
  await ensureDependencies();
  await runCommand("pnpm", ["build"], "Building desktop client");
  await ensureApi();
  await notifyMac(APP_NAME, "本地 API 已就绪，正在打开桌面客户端。");
  await launchDesktop();
  await cleanup(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log(message);
  await alertMac(`${APP_NAME} 启动失败`, message);
  await cleanup(1);
}

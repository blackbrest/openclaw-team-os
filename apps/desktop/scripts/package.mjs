#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(desktopDir, "../..");
const webDistDir = path.resolve(rootDir, "apps/web/dist");
const desktopDistDir = path.resolve(desktopDir, "dist");
const rendererTargetDir = path.resolve(desktopDistDir, "renderer");
const releaseDir = path.resolve(rootDir, "output/releases/desktop");

function log(message) {
  process.stdout.write(`[desktop-package] ${message}\n`);
}

async function runCommand(command, args, cwd, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv
      },
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

async function syncRendererBundle() {
  log("Syncing web dist into desktop dist/renderer");
  await rm(rendererTargetDir, {
    force: true,
    recursive: true
  });
  await mkdir(desktopDistDir, {
    recursive: true
  });
  await cp(webDistDir, rendererTargetDir, {
    recursive: true
  });
}

function resolveBuilderArgs() {
  if (process.platform === "darwin") {
    return ["exec", "electron-builder", "--publish", "never", "--mac", "zip"];
  }

  if (process.platform === "win32") {
    return ["exec", "electron-builder", "--publish", "never", "--win", "portable"];
  }

  return ["exec", "electron-builder", "--publish", "never", "--linux", "AppImage"];
}

async function sha256(filePath) {
  const hash = createHash("sha256");

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function writeReleaseManifest() {
  const entries = await readdir(releaseDir, {
    withFileTypes: true
  });
  const files = entries.filter((entry) => entry.isFile());
  const artifacts = [];

  for (const file of files) {
    const filePath = path.join(releaseDir, file.name);
    const fileStat = await stat(filePath);

    artifacts.push({
      name: file.name,
      path: filePath,
      sizeBytes: fileStat.size,
      sha256: await sha256(filePath)
    });
  }

  const manifestPath = path.join(releaseDir, "release-manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        platform: process.platform,
        artifacts
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  log(`Wrote release manifest to ${manifestPath}`);
}

async function main() {
  log("Building workspace");
  await runCommand("pnpm", ["build"], rootDir);

  await syncRendererBundle();

  log("Packaging desktop app");
  await runCommand("pnpm", resolveBuilderArgs(), desktopDir);

  await writeReleaseManifest();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

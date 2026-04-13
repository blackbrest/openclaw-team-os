#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { _electron as electron } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright", "e2e-desktop-smoke");
const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";

let startedApiProcess = null;

function log(message) {
  process.stdout.write(`[desktop-e2e] ${message}\n`);
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

function spawnLoggedProcess(command, args, logPath, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logStream = createWriteStream(logPath, {
    flags: "a"
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  return child;
}

async function runCommand(command, args, label) {
  log(label);

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

      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function ensureApi() {
  await runCommand("pnpm", ["build"], "Building workspace");

  if (await isReachable(`${API_URL}/health`)) {
    log(`Reusing API at ${API_URL}`);
    return;
  }

  const apiLogPath = path.join(OUTPUT_DIR, "api.log");
  log(`Starting API at ${API_URL}`);
  startedApiProcess = spawnLoggedProcess("node", ["apps/api/dist/index.js"], apiLogPath);
  await waitForUrl(`${API_URL}/health`, "API health");
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

async function saveScreenshot(page, name) {
  const screenshotPath = path.join(OUTPUT_DIR, name);
  try {
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: screenshotPath,
      timeout: 60000
    });
  } catch {
    await page.screenshot({
      animations: "disabled",
      path: screenshotPath,
      timeout: 15000
    });
  }
  return screenshotPath;
}

async function clickWhenStable(locator, retries = 6) {
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await locator.click();
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes("detached from the DOM")) {
        throw error;
      }

      await delay(300);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? ""
    };
  }

  return {
    message: String(error),
    stack: ""
  };
}

function resolveElectronExecutablePath() {
  const requireFromDesktop = createRequire(path.join(ROOT_DIR, "apps/desktop/package.json"));
  return requireFromDesktop("electron");
}

async function runDesktopFlow() {
  const screenshots = [];
  const consoleErrors = [];
  const pageErrors = [];
  const userDataDir = path.join(OUTPUT_DIR, "user-data");

  const electronApp = await electron.launch({
    args: [path.join(ROOT_DIR, "apps/desktop")],
    executablePath: resolveElectronExecutablePath(),
    env: {
      ...process.env,
      OPENCLAW_TEAM_OS_USER_DATA_DIR: userDataDir,
      OPENCLAW_TEAM_OS_WEB_URL: ""
    }
  });

  const page = await electronApp.firstWindow();

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  });

  try {
    const runId = Date.now().toString().slice(-6);
    const organizationName = `Desktop Smoke Org ${runId}`;
    const hiredUnitName = "游戏制作团队";
    const projectName = `Roguelike 首发项目 ${runId}`;
    const projectBrief = "请为一款两人团队可做的像素风 Roguelike 游戏输出首周制作计划与首版原型建议。";

    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload({
      waitUntil: "networkidle"
    });

    screenshots.push(await saveScreenshot(page, "01-launchpad.png"));

    log("Creating organization in desktop app");
    await page.getByRole("button", { name: /新组织/ }).click();
    await page.getByLabel("组织名称").fill(organizationName);
    await page.getByLabel("管理员名称").fill("Desktop Founder");
    await page.getByLabel("管理员邮箱").fill(`desktop+${runId}@example.com`);
    await page.getByRole("button", { name: "创建组织并进入" }).click();
    await page.getByRole("heading", { name: "招聘", exact: true }).waitFor({
      timeout: 15000
    });
    await page.getByRole("button", { name: "AI短剧制作" }).waitFor({
      timeout: 15000
    });
    screenshots.push(await saveScreenshot(page, "02-organization-created.png"));
    await page.getByRole("button", { name: `招聘${hiredUnitName}`, exact: true }).waitFor({
      timeout: 15000
    });

    log("Recruiting first bot team in desktop app");
    const recruitButton = page.getByRole("button", { name: `招聘${hiredUnitName}`, exact: true });
    await recruitButton.waitFor({
      state: "visible",
      timeout: 15000
    });
    await delay(500);
    await clickWhenStable(recruitButton);
    await page.getByRole("button", { name: "确认招聘", exact: true }).waitFor({
      state: "visible",
      timeout: 15000
    });
    await clickWhenStable(page.getByRole("button", { name: "确认招聘", exact: true }));
    await page.getByText(`${hiredUnitName} 已加入编制。`).waitFor({
      timeout: 15000
    });

    screenshots.push(await saveScreenshot(page, "03-team-recruited.png"));

    log("Switching to team workspace in desktop app");
    await page.getByRole("button", { name: /^团队$/ }).click();
    await page.getByText("团队").first().waitFor({
      timeout: 15000
    });
    await page.getByText(hiredUnitName).first().waitFor({
      timeout: 15000
    });

    screenshots.push(await saveScreenshot(page, "04-team-workspace.png"));

    log("Submitting first task in desktop app");
    await page.getByRole("button", { name: "去派任务" }).click();
    await page.getByText("项目列表", { exact: true }).waitFor({
      timeout: 15000
    });
    await page.getByRole("button", { name: "创建项目" }).first().click();
    const projectDialog = page.getByRole("dialog", { name: "创建项目" });
    await page.getByRole("heading", { name: "创建项目", exact: true }).waitFor({
      timeout: 15000
    });
    await projectDialog.getByRole("textbox", { name: /项目名称/ }).fill(projectName);
    await projectDialog.getByRole("button", { name: "游戏创作" }).click();
    await projectDialog.getByRole("button", { name: "团队执行" }).click();
    await projectDialog.getByRole("textbox", { name: /项目说明/ }).fill(projectBrief);
    await projectDialog.getByRole("button", { name: "创建项目", exact: true }).click();
    await page.getByText(projectName).first().waitFor({
      timeout: 15000
    });
    await page.getByRole("button", { name: new RegExp(projectName) }).click();
    await page.getByRole("heading", { name: "任务派发", exact: true }).waitFor({
      timeout: 15000
    });
    await page.getByLabel("一句话目标").fill(projectBrief);
    await page.getByRole("button", { name: "智能推荐单位" }).click();
    await page.getByText(`AI 已将当前任务匹配到 ${hiredUnitName}。`).waitFor({
      timeout: 15000
    });
    await page.getByRole("button", { name: "自动补全 Brief" }).click();
    await page.getByText(`${hiredUnitName} 结构化任务单`).waitFor({
      timeout: 15000
    });
    await page.getByLabel("任务目标").fill(projectBrief);
    await page.getByRole("button", { name: "发送给当前单位" }).click();
    await page.getByText("待审批").first().waitFor({
      timeout: 15000
    });
    await page.getByText(projectName).first().waitFor({
      timeout: 15000
    });

    screenshots.push(await saveScreenshot(page, "05-task-submitted.png"));

    log("Approving task in desktop app");
    await page.getByRole("button", { name: "去审批" }).click();
    await page.getByText("待审批").first().waitFor({
      timeout: 15000
    });
    await page.getByText(projectName).first().waitFor({
      timeout: 15000
    });
    await page.getByRole("button", { name: "批准" }).click();
    await page.getByText("审批已通过。").waitFor({
      timeout: 15000
    });

    screenshots.push(await saveScreenshot(page, "06-approval-completed.png"));

    log("Checking deliverables in desktop app");
    await page.getByRole("button", { name: /^任务台$/ }).click();
    await page.getByText("结果工作区").waitFor({
      timeout: 15000
    });
    await page.locator(".result-inspector h3").first().waitFor({
      timeout: 15000
    });
    await page.getByRole("button", { name: "带回任务输入区" }).waitFor({
      timeout: 15000
    });
    await page.getByText(projectName).first().waitFor({
      timeout: 15000
    });
    await page
      .getByText("Mock runtime 已生成可直接使用的内容草稿、审核备注与发布建议。")
      .first()
      .waitFor({
      timeout: 15000
      });

    screenshots.push(await saveScreenshot(page, "07-deliverables.png"));

    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) => !message.includes("react-devtools")
    );

    if (unexpectedConsoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        [
          "Unexpected Electron renderer errors detected.",
          ...unexpectedConsoleErrors.map((message) => `console: ${message}`),
          ...pageErrors.map((message) => `pageerror: ${message}`)
        ].join("\n")
      );
    }

    return {
      organizationName,
      hiredUnitName,
      screenshots,
      consoleErrors: unexpectedConsoleErrors,
      pageErrors
    };
  } catch (error) {
    try {
      screenshots.push(await saveScreenshot(page, "failure.png"));
    } catch {
      // Preserve the original desktop-flow failure when the window can no longer be captured.
    }
    throw error;
  } finally {
    await electronApp.close();
  }
}

async function main() {
  await rm(OUTPUT_DIR, {
    force: true,
    recursive: true
  });
  await mkdir(OUTPUT_DIR, {
    recursive: true
  });

  log(`Artifacts will be written to ${OUTPUT_DIR}`);
  await ensureApi();

  const summary = await runDesktopFlow();
  const summaryPath = path.join(OUTPUT_DIR, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  log(`Desktop smoke flow passed. Summary saved to ${summaryPath}`);
}

main()
  .catch(async (error) => {
    const failurePath = path.join(OUTPUT_DIR, "failure.json");
    await writeFile(failurePath, `${JSON.stringify(serializeError(error), null, 2)}\n`, "utf8");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopProcess(startedApiProcess, "API");
  });

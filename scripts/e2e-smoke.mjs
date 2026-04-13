#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright", "e2e-smoke");
const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const HEADLESS = process.env.E2E_HEADED === "1" ? false : true;
const DEFAULT_WEB_URL = process.env.E2E_WEB_URL ?? "http://127.0.0.1:4273";

let startedApiProcess = null;
let startedWebProcess = null;
let runtimeWebUrl = DEFAULT_WEB_URL;

function log(message) {
  process.stdout.write(`[e2e] ${message}\n`);
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

async function findAvailablePort(startPort, host = "127.0.0.1") {
  const tryPort = (port) =>
    new Promise((resolve, reject) => {
      const server = net.createServer();

      server.unref();
      server.on("error", reject);
      server.listen(port, host, () => {
        const address = server.address();
        const resolvedPort =
          typeof address === "object" && address && "port" in address ? address.port : port;
        server.close(() => resolve(resolvedPort));
      });
    });

  let port = startPort;

  while (port < startPort + 200) {
    try {
      return await tryPort(port);
    } catch {
      port += 1;
    }
  }

  return tryPort(0);
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

async function ensureServices() {
  const explicitWebUrl = Boolean(process.env.E2E_WEB_URL);
  const apiHealthy = await isReachable(`${API_URL}/health`);
  const webHealthy = await isReachable(runtimeWebUrl);

  if (!apiHealthy || !webHealthy) {
    await runCommand("pnpm", ["build"], "Building workspace");
  }

  if (!apiHealthy) {
    const apiLogPath = path.join(OUTPUT_DIR, "api.log");
    log(`Starting API at ${API_URL}`);
    startedApiProcess = spawnLoggedProcess("node", ["apps/api/dist/index.js"], apiLogPath);
    await waitForUrl(`${API_URL}/health`, "API health");
  } else {
    log(`Reusing API at ${API_URL}`);
  }

  if (explicitWebUrl && webHealthy) {
    log(`Reusing web app at ${runtimeWebUrl}`);
  } else {
    const desiredPort = Number(new URL(DEFAULT_WEB_URL).port || "4273");
    const webPort = await findAvailablePort(desiredPort);
    runtimeWebUrl = `http://127.0.0.1:${webPort}`;
    const webLogPath = path.join(OUTPUT_DIR, "web.log");
    log(`Starting web preview at ${runtimeWebUrl}`);
    startedWebProcess = spawnLoggedProcess(
      "pnpm",
      [
        "--filter",
        "@openclaw-team-os/web",
        "exec",
        "vite",
        "preview",
        "--host",
        "127.0.0.1",
        "--strictPort",
        "--port",
        String(webPort)
      ],
      webLogPath
    );
    await waitForUrl(runtimeWebUrl, "web preview");
  }
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
  await page.screenshot({
    fullPage: true,
    path: screenshotPath
  });
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

async function runBrowserFlow() {
  const browser = await chromium.launch({
    headless: HEADLESS
  });

  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 1024
    }
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const screenshots = [];

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
    const organizationName = `E2E Smoke Org ${runId}`;
    const hiredUnitNames = ["AI 编剧", "AI 导演"];
    const projectName = `短剧项目 ${runId}`;

    log("Opening launchpad");
    await page.goto(runtimeWebUrl, {
      waitUntil: "networkidle"
    });
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload({
      waitUntil: "networkidle"
    });

    screenshots.push(await saveScreenshot(page, "01-launchpad.png"));

    log("Creating organization");
    await page.getByRole("button", { name: /新组织/ }).click();
    await page.getByLabel("组织名称").fill(organizationName);
    await page.getByLabel("管理员名称").fill("Smoke Founder");
    await page.getByLabel("管理员邮箱").fill(`founder+${runId}@example.com`);
    await page.getByRole("button", { name: "创建组织并进入" }).click();
    await page.getByRole("heading", { name: "招聘", exact: true }).waitFor({
      timeout: 15000
    });
    await page.getByRole("button", { name: "AI短剧制作" }).waitFor({
      timeout: 15000
    });

    screenshots.push(await saveScreenshot(page, "02-organization-created.png"));

    log("Switching to AI short drama recruitment");
    await clickWhenStable(page.getByRole("button", { name: "AI短剧制作" }));
    await page.getByText("当前方向：AI短剧制作").waitFor({
      timeout: 15000
    });

    log("Recruiting AI short drama employees");
    for (const unitName of hiredUnitNames) {
      const recruitButton = page.getByRole("button", { name: `招聘${unitName}`, exact: true });
      await recruitButton.waitFor({
        state: "visible",
        timeout: 15000
      });
      await clickWhenStable(recruitButton);
      await page.getByRole("button", { name: "确认招聘", exact: true }).waitFor({
        state: "visible",
        timeout: 15000
      });
      await clickWhenStable(page.getByRole("button", { name: "确认招聘", exact: true }));
      await page.getByText(`${unitName} 已加入编制。`).waitFor({
        timeout: 15000
      });
    }

    screenshots.push(await saveScreenshot(page, "03-employees-recruited.png"));

    log("Opening project workspace");
    await clickWhenStable(page.getByRole("button", { name: /^任务台$/ }));
    await page.getByRole("heading", { name: "任务台", exact: true }).waitFor({
      timeout: 15000
    });
    await clickWhenStable(page.getByRole("button", { name: "创建项目", exact: true }));
    await page.getByRole("heading", { name: "创建项目", exact: true }).waitFor({
      timeout: 15000
    });
    await page.getByRole("textbox", { name: /^项目名称/ }).fill(projectName);
    await clickWhenStable(page.getByRole("button", { name: "AI短剧制作" }));
    const projectUnitGrids = page.locator(".project-unit-grid");
    for (const unitName of hiredUnitNames) {
      await clickWhenStable(projectUnitGrids.nth(0).getByRole("button", { name: new RegExp(unitName) }));
    }
    await clickWhenStable(projectUnitGrids.nth(1).getByRole("button", { name: /AI 导演/ }));
    await page
      .getByLabel("项目说明")
      .fill("先由 AI 编剧产出剧情与对白，再由 AI 导演拆镜头，所有进展先向项目主管汇报。");
    await clickWhenStable(page.getByRole("button", { name: "创建项目", exact: true }).last());
    await page.getByRole("heading", { name: projectName, exact: true }).waitFor({
      timeout: 15000
    });
    await page.getByText("CEO → 项目主管 → AI员工").waitFor({
      timeout: 15000
    });

    screenshots.push(await saveScreenshot(page, "04-project-created.png"));

    log("Verifying project workspace");
    await page.locator(".project-chat-thread").getByText(`项目 ${projectName} 已创建`).waitFor({
      timeout: 15000
    });
    const composer = page.locator(".project-chat-composer");
    await composer.locator("textarea").waitFor({
      timeout: 15000
    });
    await page.getByRole("heading", { name: /主管派工/ }).waitFor({
      timeout: 15000
    });
    await page.getByRole("heading", { name: "CEO 汇总", exact: true }).waitFor({
      timeout: 15000
    });

    screenshots.push(await saveScreenshot(page, "05-project-chat.png"));

    log("Creating first managed assignment");
    await page.getByLabel("负责人").selectOption({ label: "AI 编剧" });
    await page.getByLabel("任务标题").fill("第一版剧情与对白");
    await page
      .getByLabel("任务说明")
      .fill("先输出三幕结构、关键对白和最后三秒钩子，完成后优先向项目主管汇报。");
    await page.getByLabel("交付要求").fill("剧情大纲、对白草稿、风险说明");
    await clickWhenStable(page.getByRole("button", { name: "由主管派工" }));
    const createdAssignmentCard = page
      .locator(".project-assignment-list")
      .getByRole("button", { name: /^第一版剧情与对白/ })
      .first();
    await createdAssignmentCard.waitFor({
      timeout: 15000
    });
    await clickWhenStable(createdAssignmentCard);

    log("Submitting employee progress report");
    await page.getByLabel("当前状态").selectOption({ label: "待主管查看" });
    await page
      .getByLabel("本轮回报")
      .fill("剧情三幕结构已完成，关键对白已补到 70%，当前风险是女主职业背景还需要再定一次。");
    await clickWhenStable(page.getByRole("button", { name: "代员工提交回报" }));
    await page
      .locator(".project-report-history")
      .getByText("剧情三幕结构已完成，关键对白已补到 70%，当前风险是女主职业背景还需要再定一次。", {
        exact: true
      })
      .waitFor({
      timeout: 15000
    });

    log("Inspecting direct employee chat");
    await clickWhenStable(page.getByRole("button", { name: /^AI 编剧/ }).first());
    await page.getByRole("heading", { name: "AI 编剧", exact: true }).waitFor({
      timeout: 15000
    });
    await page.locator(".project-chat-thread").getByText(`AI 编剧 已加入项目 ${projectName}`).waitFor({
      timeout: 15000
    });
    await page.locator(".project-chat-thread").getByText("关于「第一版剧情与对白」的进展回报").waitFor({
      timeout: 15000
    });

    screenshots.push(await saveScreenshot(page, "06-direct-chat.png"));

    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) => !message.includes("react-devtools")
    );

    if (unexpectedConsoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        [
          "Unexpected browser errors detected.",
          ...unexpectedConsoleErrors.map((message) => `console: ${message}`),
          ...pageErrors.map((message) => `pageerror: ${message}`)
        ].join("\n")
      );
    }

    return {
      organizationName,
      hiredUnitNames,
      projectName,
      screenshots,
      consoleErrors: unexpectedConsoleErrors,
      pageErrors
    };
  } catch (error) {
    try {
      screenshots.push(await saveScreenshot(page, "failure.png"));
    } catch {
      // Preserve the original browser-flow failure when the page can no longer be captured.
    }
    throw error;
  } finally {
    await context.close();
    await browser.close();
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
  await ensureServices();

  const summary = await runBrowserFlow();
  const summaryPath = path.join(OUTPUT_DIR, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  log(`Smoke flow passed. Summary saved to ${summaryPath}`);
}

main()
  .catch(async (error) => {
    const failurePath = path.join(OUTPUT_DIR, "failure.json");
    await writeFile(failurePath, `${JSON.stringify(serializeError(error), null, 2)}\n`, "utf8");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopProcess(startedWebProcess, "web preview");
    await stopProcess(startedApiProcess, "API");
  });

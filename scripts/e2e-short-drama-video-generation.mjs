#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { _electron as electron } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright", "short-drama-video-generation");
const API_URL = "http://127.0.0.1:4000";
const MODELARK_PORT = 4888;
const MODELARK_BASE_URL = `http://127.0.0.1:${MODELARK_PORT}/api/v3`;
const REQUESTED_VIDEO_PROVIDER = (process.env.VIDEO_PROVIDER || "").trim().toLowerCase();
const USE_SHORTAPI = REQUESTED_VIDEO_PROVIDER === "shortapi" || Boolean(process.env.SHORTAPI_KEY);

let startedApiProcess = null;
let mockModelArkServer = null;

function log(message) {
  process.stdout.write(`[short-drama-video] ${message}\n`);
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

function resolveElectronExecutablePath() {
  const requireFromDesktop = createRequire(path.join(ROOT_DIR, "apps/desktop/package.json"));
  return requireFromDesktop("electron");
}

async function waitForNotice(page, text, timeout = 15000) {
  await page.getByText(text).waitFor({ timeout });
}

async function waitForBannerNotice(page, pattern, timeout = 15000) {
  const locator = page.locator(".banner.notice").filter({
    hasText: pattern
  });
  await locator.waitFor({ timeout });
  return (await locator.first().textContent())?.trim() ?? "";
}

async function waitForBannerMessage(page, timeout = 15000) {
  const noticeLocator = page.locator(".banner.notice");
  const errorLocator = page.locator(".banner.error");

  const winner = await Promise.race([
    noticeLocator
      .first()
      .waitFor({ timeout })
      .then(() => "notice")
      .catch(() => null),
    errorLocator
      .first()
      .waitFor({ timeout })
      .then(() => "error")
      .catch(() => null),
    delay(timeout).then(() => "timeout")
  ]);

  if (!winner || winner === "timeout") {
    throw new Error(`Timed out waiting for a banner message after ${timeout}ms.`);
  }

  if (await errorLocator.count()) {
    const text = (await errorLocator.first().textContent())?.trim() ?? "";

    if (text) {
      return {
        kind: "error",
        text
      };
    }
  }

  return {
    kind: "notice",
    text: (await noticeLocator.first().textContent())?.trim() ?? ""
  };
}

function createMockModelArkServer() {
  let taskCounter = 0;
  const tasks = new Map();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${MODELARK_PORT}`);

    if (request.method === "POST" && url.pathname === "/api/v3/contents/generations/tasks") {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }

      const bodyText = Buffer.concat(chunks).toString("utf8");
      const payload = bodyText ? JSON.parse(bodyText) : {};
      taskCounter += 1;
      const id = `mock_video_${taskCounter}`;
      tasks.set(id, {
        id,
        polls: 0,
        prompt: payload?.content?.[0]?.text ?? "",
        duration: payload?.duration ?? 5
      });

      response.writeHead(200, {
        "Content-Type": "application/json"
      });
      response.end(
        JSON.stringify({
          id,
          status: "queued"
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/v3/contents/generations/tasks/")) {
      const taskId = url.pathname.split("/").at(-1);
      const task = taskId ? tasks.get(taskId) : null;

      if (!task) {
        response.writeHead(404, {
          "Content-Type": "application/json"
        });
        response.end(
          JSON.stringify({
            error: {
              message: "Task not found."
            }
          })
        );
        return;
      }

      task.polls += 1;
      const status = task.polls >= 1 ? "succeeded" : "running";

      response.writeHead(200, {
        "Content-Type": "application/json"
      });
      response.end(
        JSON.stringify({
          id: task.id,
          status,
          content: {
            video_url: `https://example.com/mock-videos/${task.id}.mp4`,
            last_frame_url: `https://example.com/mock-videos/${task.id}.png`
          }
        })
      );
      return;
    }

    response.writeHead(404, {
      "Content-Type": "application/json"
    });
    response.end(
      JSON.stringify({
        error: {
          message: "Not found."
        }
      })
    );
  });

  return server;
}

async function ensureFreshApi() {
  if (await isReachable(`${API_URL}/health`)) {
    throw new Error("Port 4000 is already in use by another API process. Please stop it before running this video generation test.");
  }

  await runCommand("pnpm", ["build"], "Building workspace");

  const apiLogPath = path.join(OUTPUT_DIR, "api.log");
  log(`Starting API at ${API_URL}`);
  startedApiProcess = spawnLoggedProcess(
    "node",
    ["apps/api/dist/index.js"],
    apiLogPath,
    USE_SHORTAPI
      ? {
          VIDEO_PROVIDER: "shortapi"
        }
      : {
          VIDEO_PROVIDER: "modelark",
          SHORTAPI_KEY: "",
          ARK_API_KEY: "mock-modelark-key",
          MODELARK_BASE_URL,
          MODELARK_VIDEO_MODEL: "seedance-1-5-pro-251215",
          MODELARK_VIDEO_RESOLUTION: "720p"
        }
  );
  await waitForUrl(`${API_URL}/health`, "API health");
}

async function startMockProvider() {
  log(`Starting mock ModelArk server at ${MODELARK_BASE_URL}`);
  mockModelArkServer = createMockModelArkServer();
  await new Promise((resolve, reject) => {
    mockModelArkServer.once("error", reject);
    mockModelArkServer.listen(MODELARK_PORT, "127.0.0.1", resolve);
  });
}

async function stopMockProvider() {
  if (!mockModelArkServer) {
    return;
  }

  await new Promise((resolve, reject) => {
    mockModelArkServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  log("Stopped mock ModelArk server");
}

async function recruitShortDramaUnit(page, unitName, screenshotName) {
  await page.getByRole("button", { name: /^招聘$/ }).click();
  await page.getByRole("button", { name: "AI短剧制作" }).click();
  await page.getByText(unitName).first().waitFor({ timeout: 15000 });
  const recruitButton = page.getByRole("button", { name: `招募`, exact: true }).filter({
    has: page.getByText(unitName)
  });

  if (await recruitButton.count()) {
    await clickWhenStable(recruitButton.first());
  } else {
    await clickWhenStable(page.getByRole("button", { name: `招聘${unitName}`, exact: true }));
  }

  await page.getByRole("button", { name: "确认招聘", exact: true }).waitFor({ timeout: 15000 });
  await clickWhenStable(page.getByRole("button", { name: "确认招聘", exact: true }));
  await waitForNotice(page, `${unitName} 已加入编制。`);
  return saveScreenshot(page, screenshotName);
}

async function openUnitWorkspace(page, navLabel, unitName, screenshotName) {
  await page.getByRole("button", { name: new RegExp(`^${navLabel}$`) }).click();
  await page.getByText(unitName).first().waitFor({ timeout: 15000 });
  return saveScreenshot(page, screenshotName);
}

async function completeVideoGeneration(page, prefix) {
  await page.getByText("视频生成控制台").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /提交到视频生成器|重新提交/ }).click();
  const submitBanner = await waitForBannerMessage(page, 90000);

  if (submitBanner.kind === "error") {
    const screenshot = await saveScreenshot(page, `${prefix}-video-generation-error.png`);

    return {
      submitNotice: "",
      refreshNotice: "",
      clipStatuses: [],
      videoLinks: [],
      errorMessage: submitBanner.text,
      screenshot
    };
  }

  const submitNotice = submitBanner.text;
  let refreshNotice = "";
  let videoLinks = [];
  let clipStatuses = [];

  for (let attempt = 1; attempt <= (USE_SHORTAPI ? 50 : 3); attempt += 1) {
    await page.getByRole("button", { name: "刷新状态" }).click();
    refreshNotice = await waitForBannerNotice(page, /已刷新 .* 视频状态。/, 15000);
    await delay(USE_SHORTAPI ? 5000 : 1000);

    videoLinks = await page
      .locator(".video-run-item a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") || ""));
    clipStatuses = await page
      .locator(".video-run-item .status-pill")
      .evaluateAll((items) => items.map((item) => item.textContent?.trim() || ""));

    if (videoLinks.length > 0) {
      break;
    }

    if (clipStatuses.length > 0 && clipStatuses.every((status) => status === "失败")) {
      break;
    }

    if (USE_SHORTAPI) {
      log(`Waiting for ShortAPI clips (${attempt}/${50})`);
      await delay(10000);
    }
  }

  const screenshot = await saveScreenshot(page, `${prefix}-video-generation.png`);

  return {
    submitNotice,
    refreshNotice,
    clipStatuses,
    videoLinks,
    errorMessage: "",
    screenshot
  };
}

async function submitAndApproveTask(page, { unitName, brief, prefix }) {
  log(`Submitting task for ${unitName}`);
  await page.getByRole("button", { name: "去派任务" }).click();
  await page.getByRole("heading", { name: "任务派发", exact: true }).waitFor({ timeout: 15000 });
  await page.getByLabel("一句话目标").fill(brief);
  await page.getByRole("button", { name: "智能推荐单位" }).click();
  await waitForNotice(page, `AI 已将当前任务匹配到 ${unitName}。`);
  await page.getByRole("button", { name: "自动补全 Brief" }).click();
  await page.getByLabel("任务目标").fill(brief);
  await page.getByRole("button", { name: "发送给当前单位" }).click();
  await page.getByText(`${unitName} 任务`).first().waitFor({ timeout: 15000 });
  await page.getByText("待审批").first().waitFor({ timeout: 15000 });
  const taskSubmittedShot = await saveScreenshot(page, `${prefix}-task-submitted.png`);

  log(`Approving task for ${unitName}`);
  await page.getByRole("button", { name: "去审批" }).click();
  await page.getByText(`审批 ${unitName} 任务`).waitFor({ timeout: 15000 });
  const approvalSummary = (await page.locator(".approval-card p").first().textContent())?.trim() ?? "";
  await page.getByRole("button", { name: "批准" }).click();
  await waitForNotice(page, "审批已通过。");
  const approvalShot = await saveScreenshot(page, `${prefix}-approval-completed.png`);

  log(`Inspecting deliverables for ${unitName}`);
  await page.getByRole("button", { name: /^任务台$/ }).click();
  await page.getByText("结果工作区").waitFor({ timeout: 15000 });
  await page.locator(".result-inspector h3").first().waitFor({ timeout: 15000 });
  const resultHeading = (await page.locator(".result-inspector h3").first().textContent())?.trim() ?? "";
  const resultLead = (await page.locator(".result-lead strong").first().textContent())?.trim() ?? "";
  const operatorNote = (await page.locator(".result-block").nth(1).textContent())?.trim() ?? "";
  const visibleBody = (await page.locator(".result-inspector").first().textContent())?.trim() ?? "";
  const handoffProvider =
    (await page.locator(".short-drama-hero h4").first().textContent().catch(() => ""))?.trim() ?? "";
  const handoffPromptVisible = await page
    .getByText("视频生成接力包", { exact: true })
    .isVisible()
    .catch(() => false);
  const deliverableShot = await saveScreenshot(page, `${prefix}-deliverables.png`);
  const videoGeneration = await completeVideoGeneration(page, `${prefix}-video`);

  return {
    approvalSummary,
    resultHeading,
    resultLead,
    operatorNote,
    visibleBody,
    handoffProvider,
    handoffPromptVisible,
    videoGeneration,
    screenshots: [taskSubmittedShot, approvalShot, deliverableShot, videoGeneration.screenshot]
  };
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
    if (message.type() === "error" && !message.text().includes("react-devtools")) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  });

  try {
    const runId = Date.now().toString().slice(-6);
    const organizationName = `Short Drama Video Lab ${runId}`;
    const writerName = "短剧编导员工";
    const teamName = "AI 短剧制作团队";
    const writerBrief =
      "请围绕 30 秒霸总题材短剧片段，输出三幕结构、人物关系、关键对白、8 镜头分镜，以及可直接用于 Seedance 2.0 的镜头提示词。";
    const teamBrief =
      "请基于一支 30 秒霸总题材 AI 短剧片段，输出整包交付：剧情梗概、镜头节奏、字幕建议、BGM 情绪、封面标题和 Seedance 2.0 出片提示词。";

    await page.waitForLoadState("domcontentloaded");
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
    await page.getByLabel("管理员名称").fill("Short Drama Producer");
    await page.getByLabel("管理员邮箱").fill(`shortdrama-video+${runId}@example.com`);
    await page.getByRole("button", { name: "创建组织并进入" }).click();
    await page.getByRole("heading", { name: "招聘", exact: true }).waitFor({ timeout: 15000 });
    screenshots.push(await saveScreenshot(page, "02-organization-created.png"));

    log("Recruiting writer and team");
    screenshots.push(await recruitShortDramaUnit(page, writerName, "03-writer-recruited.png"));
    screenshots.push(await recruitShortDramaUnit(page, teamName, "04-team-recruited.png"));

    log("Opening employee workspace");
    screenshots.push(await openUnitWorkspace(page, "员工", writerName, "05-writer-workspace.png"));
    const writerResult = await submitAndApproveTask(page, {
      unitName: writerName,
      brief: writerBrief,
      prefix: "06-writer"
    });

    log("Opening team workspace");
    screenshots.push(await openUnitWorkspace(page, "团队", teamName, "07-team-workspace.png"));
    const teamResult = await submitAndApproveTask(page, {
      unitName: teamName,
      brief: teamBrief,
      prefix: "08-team"
    });

    const summary = {
      organizationName,
      runtimeMode: USE_SHORTAPI ? "shortapi" : "mock",
      videoGenerationProvider: USE_SHORTAPI ? "ShortAPI Seedance 2.0" : "Mock ModelArk Video",
      videoGenerationIntegrated: true,
      recruitedUnits: [writerName, teamName],
      writerBrief,
      teamBrief,
      writerResult,
      teamResult,
      screenshots,
      consoleErrors,
      pageErrors
    };

    const summaryPath = path.join(OUTPUT_DIR, "summary.json");
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    log(`Summary saved to ${summaryPath}`);
  } finally {
    await electronApp.close();
  }
}

async function main() {
  await rm(OUTPUT_DIR, {
    recursive: true,
    force: true
  });
  await mkdir(OUTPUT_DIR, {
    recursive: true
  });

  log(`Artifacts will be written to ${OUTPUT_DIR}`);
  if (!USE_SHORTAPI) {
    await startMockProvider();
  }
  await ensureFreshApi();
  await runDesktopFlow();
}

main()
  .catch(async (error) => {
    await writeFile(
      path.join(OUTPUT_DIR, "failure.json"),
      `${JSON.stringify(
        {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack ?? "" : ""
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopProcess(startedApiProcess, "API");
    if (!USE_SHORTAPI) {
      await stopMockProvider();
    }
  });

#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { _electron as electron } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright", "short-drama-flow");
const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";

let startedApiProcess = null;

function log(message) {
  process.stdout.write(`[short-drama-test] ${message}\n`);
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

async function recruitShortDramaUnit(page, unitName, screenshotName) {
  await page.getByRole("button", { name: /^招聘$/ }).click();
  await page.getByRole("button", { name: "AI短剧制作" }).click();
  await page.getByText(unitName).first().waitFor({ timeout: 15000 });
  const recruitButton = page.getByRole("button", { name: `招聘${unitName}`, exact: true });
  await recruitButton.waitFor({ timeout: 15000 });
  await clickWhenStable(recruitButton);
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

async function createShortDramaProject(page, { projectName, unitName, description, prefix }) {
  log(`Creating short drama project ${projectName}`);
  await page.getByRole("button", { name: /^任务台$/ }).click();
  await page.getByText("项目列表", { exact: true }).waitFor({ timeout: 15000 });
  const projectListShot = await saveScreenshot(page, `${prefix}-project-list.png`);

  await clickWhenStable(page.getByRole("button", { name: "创建项目" }).first());
  const dialog = page.getByRole("dialog", { name: "创建项目" });
  await dialog.waitFor({ timeout: 15000 });
  await dialog.getByRole("textbox", { name: /项目名称/ }).fill(projectName);
  await clickWhenStable(dialog.getByRole("button", { name: "AI短剧制作" }));
  await clickWhenStable(dialog.getByRole("button", { name: "单独员工" }));
  await dialog.getByRole("textbox", { name: /项目说明/ }).fill(description);
  const projectModalShot = await saveScreenshot(page, `${prefix}-project-modal.png`);

  await clickWhenStable(dialog.getByRole("button", { name: "创建项目", exact: true }).last());
  await page.locator(".dispatch-project-card").filter({ hasText: projectName }).first().waitFor({
    timeout: 15000
  });
  const projectCreatedShot = await saveScreenshot(page, `${prefix}-project-created.png`);

  await clickWhenStable(page.locator(".dispatch-project-card").filter({ hasText: projectName }).first());
  await page.getByRole("heading", { name: "短剧项目工作流", exact: true }).waitFor({
    timeout: 15000
  });
  await page.getByText(projectName, { exact: true }).first().waitFor({ timeout: 15000 });
  const projectWorkflowShot = await saveScreenshot(page, `${prefix}-project-workflow.png`);

  return {
    screenshots: [projectListShot, projectModalShot, projectCreatedShot, projectWorkflowShot]
  };
}

async function fillShortDramaIntake(
  page,
  { premise, hook, mustHaveMoments, durationSeconds, screenshotName }
) {
  log("Filling short drama intake");
  await page.getByLabel("一句话剧情").fill(premise);
  await page.getByLabel("目标时长").selectOption(String(durationSeconds));
  await page.getByLabel("强钩子").fill(hook);
  await page.getByLabel("必须出现的反转 / 场景").fill(mustHaveMoments);
  return saveScreenshot(page, screenshotName);
}

async function submitAndApproveShortDramaTask(page, { unitName, prefix, openVideoStage = false, switchLane = true }) {
  log(`Submitting short drama task for ${unitName}`);
  if (switchLane) {
    const laneCard = page.locator(".lane-card").filter({ hasText: unitName }).first();
    await clickWhenStable(laneCard);
    await page.locator(".lane-card.active").filter({ hasText: unitName }).first().waitFor({ timeout: 15000 });
  }

  await saveScreenshot(page, `${prefix}-stage-switch.png`);
  const hiddenComposer = page.locator(".dispatch-form.visually-hidden").first();
  await hiddenComposer.waitFor({ state: "attached", timeout: 15000 });
  await hiddenComposer.evaluate((form) => {
    form.requestSubmit();
  });
  await page.locator(".short-drama-approval-card").waitFor({ timeout: 15000 });
  await page.getByText(`${unitName} 任务`).first().waitFor({ timeout: 15000 });
  const submittedBrief =
    (await page.locator(".dispatch-form.visually-hidden textarea").first().inputValue().catch(() => ""))?.trim() ??
    "";
  const approvalSummary = (await page.locator(".short-drama-approval-card p").first().textContent())?.trim() ?? "";
  const taskSubmittedShot = await saveScreenshot(page, `${prefix}-task-submitted.png`);

  log(`Approving short drama task for ${unitName}`);
  await clickWhenStable(page.locator(".short-drama-approval-card .primary-button").first());
  await waitForNotice(page, "审批已通过。", 30000);
  await saveScreenshot(page, `${prefix}-post-approval-state.png`);
  await page.locator(".result-inspector.cinematic h3").first().waitFor({ timeout: 30000 });
  const approvalShot = await saveScreenshot(page, `${prefix}-approval-completed.png`);

  log(`Inspecting short drama deliverables for ${unitName}`);
  const resultHeading = (await page.locator(".result-inspector.cinematic h3").first().textContent())?.trim() ?? "";
  const resultLead =
    (await page.locator(".review-pillar .result-list li").first().textContent().catch(() => ""))?.trim() ?? "";
  const operatorNote =
    (await page.locator(".result-block.short-drama-block").first().textContent())?.trim() ?? "";
  const visibleBody = (await page.locator(".result-inspector.cinematic").first().textContent())?.trim() ?? "";

  let handoffProvider = "";
  let handoffPromptVisible = false;

  if (openVideoStage) {
    await clickWhenStable(page.locator(".stage-chip").filter({ hasText: "视频制作" }).first());

    const handoffProviderLocator = page.locator(".short-drama-hero h4").first();
    const handoffVisible = await handoffProviderLocator
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (handoffVisible) {
      handoffProvider = (await handoffProviderLocator.textContent().catch(() => ""))?.trim() ?? "";
      handoffPromptVisible = await page
        .getByText("镜头接力清单", { exact: true })
        .isVisible()
        .catch(() => false);
    }
  }

  const deliverableShot = await saveScreenshot(page, `${prefix}-deliverables.png`);

  return {
    submittedBrief,
    approvalSummary,
    resultHeading,
    resultLead,
    operatorNote,
    visibleBody,
    handoffProvider,
    handoffPromptVisible,
    screenshots: [taskSubmittedShot, approvalShot, deliverableShot]
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
    const organizationName = `Short Drama Lab ${runId}`;
    const projectName = `短剧项目 ${runId}`;
    const writerName = "短剧编导员工";
    const teamName = "AI 短剧制作团队";
    const projectDescription =
      "围绕一支 30 秒职场反转 AI 短剧，完成立项、人物定稿、分镜拆解、制作接力和可出片的短剧交付。";
    const shortDramaIntake = {
      premise: "30 秒职场反转短剧片段，秘书在会议室被甩锅后，用隐藏身份完成绝地翻盘。",
      durationSeconds: 30,
      hook: "前 3 秒直接抛出当众甩锅与压迫感，结尾 3 秒必须给出身份反转和关系升级。",
      mustHaveMoments: "会议室压迫、电梯拦截、关键客户认出女主、结尾留续集钩子。"
    };

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
    await page.getByLabel("管理员名称").fill("Short Drama Founder");
    await page.getByLabel("管理员邮箱").fill(`shortdrama+${runId}@example.com`);
    await page.getByRole("button", { name: "创建组织并进入" }).click();
    await page.getByRole("heading", { name: "招聘", exact: true }).waitFor({ timeout: 15000 });
    screenshots.push(await saveScreenshot(page, "02-organization-created.png"));

    log("Recruiting writer and team");
    screenshots.push(await recruitShortDramaUnit(page, writerName, "03-writer-recruited.png"));
    screenshots.push(await recruitShortDramaUnit(page, teamName, "04-team-recruited.png"));

    log("Opening employee workspace");
    screenshots.push(await openUnitWorkspace(page, "员工", writerName, "05-writer-workspace.png"));

    log("Opening team workspace");
    screenshots.push(await openUnitWorkspace(page, "团队", teamName, "06-team-workspace.png"));

    const projectFlow = await createShortDramaProject(page, {
      projectName,
      unitName: writerName,
      description: projectDescription,
      prefix: "07"
    });
    screenshots.push(...projectFlow.screenshots);

    screenshots.push(
      await fillShortDramaIntake(page, {
        ...shortDramaIntake,
        screenshotName: "08-project-intake.png"
      })
    );

    const writerResult = await submitAndApproveShortDramaTask(page, {
      unitName: writerName,
      prefix: "09-writer",
      switchLane: false
    });

    const teamResult = await submitAndApproveShortDramaTask(page, {
      unitName: teamName,
      prefix: "10-team",
      openVideoStage: true
    });

    const summary = {
      organizationName,
      projectName,
      runtimeMode: "mock",
      seedanceIntegrated: false,
      seedanceReason:
        "当前桌面客户端已输出 Seedance 2.0 手动接力包，但尚未接入真实视频 API，因此本轮仍停在可投喂的出片包阶段。",
      recruitedUnits: [writerName, teamName],
      projectDescription,
      shortDramaIntake,
      writerBrief: writerResult.submittedBrief,
      teamBrief: teamResult.submittedBrief,
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
  await ensureApi();
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
  });

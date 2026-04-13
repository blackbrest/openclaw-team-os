import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const projectRoot = "/Users/wangliang/Documents/OpenClaw_Team_OS";
const envFiles = [
  path.join(projectRoot, ".env.local"),
  path.join(projectRoot, ".env")
];
const outputDir = path.join(projectRoot, "apps/web/public/generated/recruit-avatars");
const tmpDir = path.join(projectRoot, "output/recruit-avatar-jobs");

const models = [
  "google/nano-banana/text-to-image",
  "shortapi/z-image/text-to-image"
];

const avatarSpecs = [
  {
    id: "design-bot",
    prompt:
      "Cute premium 3D mascot for a UI and brand designer employee, full body standing pose, holding a stylus and color cards, glossy soft material, cyan and violet palette, clean silhouette, toy-like but professional, dark studio background"
  },
  {
    id: "game-dev-bot",
    prompt:
      "Cute premium 3D mascot for a gameplay developer employee, full body standing pose, holding a compact gamepad and tool tablet, glossy material, cyan and electric blue palette, toy-like but capable, dark studio background"
  },
  {
    id: "art-bot",
    prompt:
      "Cute premium 3D mascot for a 3D artist employee, full body standing pose, holding a tiny sculpting visor and asset orb, glossy material, amber violet palette, toy-like and creative, dark studio background"
  },
  {
    id: "ops-copy-bot",
    prompt:
      "Cute premium 3D mascot for a campaign copywriter employee, full body standing pose, holding a message card and megaphone icon, glossy material, teal violet palette, toy-like but smart, dark studio background"
  },
  {
    id: "short-drama-writer-bot",
    prompt:
      "Cute premium 3D mascot for a short drama writer-director employee, full body standing pose, holding a script page and small clapperboard, glossy material, purple cyan palette, cinematic feeling, dark studio background"
  },
  {
    id: "game-production-team",
    prompt:
      "Cute premium 3D mascot representing a game production team, full body standing lead character with subtle teammate badges, glossy material, cyan blue palette, toy-like but organized, dark studio background"
  },
  {
    id: "creative-studio-team",
    prompt:
      "Cute premium 3D mascot representing a creative studio team, full body standing lead character with poster board and design badge, glossy material, violet amber palette, toy-like but elegant, dark studio background"
  },
  {
    id: "growth-content-team",
    prompt:
      "Cute premium 3D mascot representing a content growth team, full body standing lead character with chat bubbles and trend arrow icon, glossy material, teal cyan palette, toy-like but sharp, dark studio background"
  },
  {
    id: "short-drama-studio-team",
    prompt:
      "Cute premium 3D mascot representing an AI short drama studio team, full body standing lead character with clapperboard and cinema cue cards, glossy material, violet cyan palette, toy-like cinematic style, dark studio background"
  }
];

function parseDotEnv(source) {
  const entries = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [rawKey, ...rest] = line.split("=");
    const key = rawKey.trim();
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    entries[key] = value;
  }
  return entries;
}

async function loadEnv() {
  const loaded = {};
  for (const file of envFiles) {
    try {
      const source = await readFile(file, "utf8");
      Object.assign(loaded, parseDotEnv(source));
    } catch {
      // ignore missing env files
    }
  }
  return { ...loaded, ...process.env };
}

function mask(value) {
  if (!value) return "missing";
  if (value.length < 10) return "***";
  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.info ?? data?.message ?? `Request failed with status ${response.status}`);
  }
  return data;
}

async function createJob(baseUrl, apiKey, model, prompt) {
  return requestJson(`${baseUrl}/api/v1/job/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      args: {
        prompt,
        aspect_ratio: "3:4"
      }
    })
  });
}

async function queryJob(baseUrl, apiKey, jobId) {
  return requestJson(`${baseUrl}/api/v1/job/query?id=${jobId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
}

async function waitForJob(baseUrl, apiKey, jobId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const payload = await queryJob(baseUrl, apiKey, jobId);
    const job = payload?.data ?? {};

    if (job.status === 2) {
      return job;
    }

    if (job.status === 3) {
      throw new Error(job.error ?? "Image generation failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Timed out while waiting for image generation.");
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

async function convertToJpeg(sourcePath, destinationPath) {
  try {
    await execFile("sips", ["-s", "format", "jpeg", "-Z", "420", sourcePath, "--out", destinationPath]);
  } catch (error) {
    console.warn(`sips conversion failed for ${sourcePath}, keeping original file.`);
    await writeFile(destinationPath, await readFile(sourcePath));
  }
}

async function generateAvatar(baseUrl, apiKey, spec) {
  const errors = [];

  for (const model of models) {
    try {
      console.log(`Generating ${spec.id} via ${model}`);
      const created = await createJob(baseUrl, apiKey, model, spec.prompt);
      const jobId = created?.data?.job_id;

      if (!jobId) {
        throw new Error(`No job_id returned for ${model}`);
      }

      const finished = await waitForJob(baseUrl, apiKey, jobId);
      const imageUrl = finished?.result?.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error(`No image url returned for ${model}`);
      }

      const tmpPath = path.join(tmpDir, `${spec.id}.source`);
      const targetPath = path.join(outputDir, `${spec.id}.jpg`);
      await downloadFile(imageUrl, tmpPath);
      await convertToJpeg(tmpPath, targetPath);
      await rm(tmpPath, { force: true });

      return {
        id: spec.id,
        model,
        imageUrl,
        outputPath: targetPath
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ model, message });
      console.warn(`Failed ${spec.id} via ${model}: ${message}`);
    }
  }

  throw new Error(`All models failed for ${spec.id}: ${errors.map((item) => `${item.model}: ${item.message}`).join(" | ")}`);
}

async function main() {
  const env = await loadEnv();
  const apiKey = env.SHORTAPI_KEY?.trim();
  const baseUrl = env.SHORTAPI_BASE_URL?.trim() || "https://api.shortapi.ai";

  if (!apiKey) {
    throw new Error("SHORTAPI_KEY is required to generate recruit avatar assets.");
  }

  console.log(`Using ShortAPI key ${mask(apiKey)} at ${baseUrl}`);
  await mkdir(outputDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const manifest = [];
  for (const spec of avatarSpecs) {
    const generated = await generateAvatar(baseUrl, apiKey, spec);
    manifest.push(generated);
  }

  await writeFile(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        items: manifest
      },
      null,
      2
    )
  );

  console.log(`Generated ${manifest.length} avatar assets in ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

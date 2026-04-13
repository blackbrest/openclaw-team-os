import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const apiBaseUrl = process.argv[2]?.trim();

if (!apiBaseUrl) {
  console.error("Usage: node scripts/release-web-prod.mjs <https://api.example.com>");
  process.exit(1);
}

let parsedUrl;

try {
  parsedUrl = new URL(apiBaseUrl);
} catch {
  console.error(`Invalid API URL: ${apiBaseUrl}`);
  process.exit(1);
}

if (!["http:", "https:"].includes(parsedUrl.protocol)) {
  console.error(`API URL must start with http:// or https://. Received: ${apiBaseUrl}`);
  process.exit(1);
}

const normalizedApiBaseUrl = parsedUrl.toString().replace(/\/$/, "");

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

await run("npx", [
  "vercel",
  "env",
  "add",
  "VITE_API_BASE_URL",
  "production",
  "--value",
  normalizedApiBaseUrl,
  "--force",
  "--yes"
]);

await run("npx", ["vercel", "build", "--prod", "--yes", "--local-config", "vercel.json"]);
await run("npx", ["vercel", "deploy", "--prebuilt", "--prod", "--yes"]);

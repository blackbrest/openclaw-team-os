import dotenv from "dotenv";
import path from "node:path";

let loaded = false;

export function loadAppEnv(): void {
  if (loaded) {
    return;
  }

  dotenv.config({
    path: path.resolve(process.cwd(), ".env")
  });

  dotenv.config({
    path: path.resolve(process.cwd(), ".env.local"),
    override: true
  });

  loaded = true;
}

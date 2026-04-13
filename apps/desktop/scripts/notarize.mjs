import path from "node:path";

import { notarize } from "@electron/notarize";

function log(message) {
  process.stdout.write(`[desktop-notarize] ${message}\n`);
}

function hasSigningConfig() {
  return Boolean(process.env.CSC_LINK || process.env.CSC_NAME || process.env.APPLE_SIGNING_IDENTITY);
}

export default async function notarizeIfConfigured(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    log("Skipping notarization because APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID are not fully set.");
    return;
  }

  if (!hasSigningConfig()) {
    log("Skipping notarization because no signing identity is configured. Set CSC_LINK, CSC_NAME, or APPLE_SIGNING_IDENTITY.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  log(`Submitting ${appName}.app for notarization`);
  await notarize({
    appBundleId: context.packager.appInfo.id,
    appPath,
    appleId,
    appleIdPassword,
    teamId
  });
  log("Notarization finished");
}

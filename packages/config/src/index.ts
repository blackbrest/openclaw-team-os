export const API_PREFIX = "/api/v1";
export const DEFAULT_API_PORT = 4000;
export const DEFAULT_WEB_PORT = 5173;
export const DEFAULT_API_BASE_URL = `http://localhost:${DEFAULT_API_PORT}`;
export const DEFAULT_WEB_BASE_URL = `http://localhost:${DEFAULT_WEB_PORT}`;

export const APP_NAME = "OpenClaw Team OS";
export const APP_TAGLINE = "Hire, govern, and scale AI teams like a real org.";

export function buildApiUrl(path: string, baseUrl = DEFAULT_API_BASE_URL): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}


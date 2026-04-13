import type { FastifyRequest } from "fastify";

import type { MePayload, OrganizationRole } from "@openclaw-team-os/domain";

export type RequestContext = MePayload;

const defaultContext: RequestContext = {
  user: {
    id: "user_wang_liang",
    name: "Wang Liang",
    email: "demo@example.com"
  },
  currentOrganization: {
    id: "org_openclaw_studio",
    name: "OpenClaw Studio",
    role: "org_admin"
  }
};

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0) {
    return value[0].trim();
  }

  return undefined;
}

function readQuery(request: FastifyRequest, name: string): string | undefined {
  const query = request.query as Record<string, unknown> | undefined;
  const value = query?.[name];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0) {
    return value[0].trim();
  }

  return undefined;
}

function readRequestValue(
  request: FastifyRequest,
  headerName: string,
  queryName: string
): string | undefined {
  return readHeader(request, headerName) ?? readQuery(request, queryName);
}

export function getSessionToken(request: FastifyRequest): string | undefined {
  const authorization = readHeader(request, "authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();

    if (token.length > 0) {
      return token;
    }
  }

  return readRequestValue(request, "x-session-token", "sessionToken");
}

function toOrganizationRole(value: string | undefined): OrganizationRole | undefined {
  if (value === "org_admin" || value === "operator" || value === "approver") {
    return value;
  }

  return undefined;
}

export function getDefaultRequestContext(): RequestContext {
  return {
    user: { ...defaultContext.user },
    currentOrganization: { ...defaultContext.currentOrganization }
  };
}

export function getRequestContext(request: FastifyRequest): RequestContext {
  const fallback = getDefaultRequestContext();

  return {
    user: {
      id: readRequestValue(request, "x-user-id", "userId") ?? fallback.user.id,
      name: readRequestValue(request, "x-user-name", "userName") ?? fallback.user.name,
      email: readRequestValue(request, "x-user-email", "userEmail") ?? fallback.user.email
    },
    currentOrganization: {
      id: readRequestValue(request, "x-org-id", "orgId") ?? fallback.currentOrganization.id,
      name: readRequestValue(request, "x-org-name", "orgName") ?? fallback.currentOrganization.name,
      role:
        toOrganizationRole(readRequestValue(request, "x-org-role", "orgRole")) ??
        fallback.currentOrganization.role
    }
  };
}

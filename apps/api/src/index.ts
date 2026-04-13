import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";

import { API_PREFIX, DEFAULT_API_PORT } from "@openclaw-team-os/config";
import type { ApiEnvelope, MePayload, OrganizationRole } from "@openclaw-team-os/domain";

import { getRequestContext, getSessionToken } from "./auth.js";
import { loadAppEnv } from "./env.js";
import { createProjectChatServiceFromEnv } from "./project-chat.js";
import { AppStore } from "./store.js";

loadAppEnv();

const app = Fastify({
  logger: true
});
const store = new AppStore();
const projectChatService = createProjectChatServiceFromEnv();

function envelope<T>(data: T): ApiEnvelope<T> {
  return {
    data,
    meta: {},
    error: null
  };
}

function forbidden(message: string) {
  return {
    data: null,
    meta: {},
    error: {
      code: "FORBIDDEN",
      message
    }
  } as const;
}

async function requireContext(request: FastifyRequest, reply: FastifyReply) {
  const context = await store.resolveRequestContext(
    getRequestContext(request),
    getSessionToken(request)
  );

  if (!context) {
    reply.code(401);
    return {
      data: null,
      meta: {},
      error: {
        code: "UNAUTHORIZED",
        message: "A valid session token is required."
      }
    } as const;
  }

  return context;
}

function hasRole(context: MePayload, roles: OrganizationRole[]): boolean {
  return roles.includes(context.currentOrganization.role);
}

await app.register(cors, {
  origin: true,
  credentials: true
});

await store.init();

app.get("/health", async () => {
  return {
    ok: true
  };
});

app.get(`${API_PREFIX}/me`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  return envelope(store.getMe(context));
});

app.get(`${API_PREFIX}/runtime-status`, async () => envelope(store.getRuntimeStatus()));

app.post(`${API_PREFIX}/project-chat/reply`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  return envelope(await projectChatService.reply(request.body as never));
});

app.get(`${API_PREFIX}/team-templates`, async () => envelope(store.listTeamTemplates()));

app.get(`${API_PREFIX}/team-templates/:templateId`, async (request, reply) => {
  const { templateId } = request.params as { templateId: string };
  const template = store.getTeamTemplate(templateId);

  if (!template) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "TEAM_TEMPLATE_NOT_FOUND",
        message: `Template ${templateId} was not found.`
      }
    };
  }

  return envelope(template);
});

app.post(`${API_PREFIX}/onboarding/organizations`, async (request, reply) => {
  const body = request.body as {
    organizationName?: string;
    adminName?: string;
    adminEmail?: string;
  };

  if (!body.organizationName?.trim() || !body.adminName?.trim() || !body.adminEmail?.trim()) {
    reply.code(400);
    return {
      data: null,
      meta: {},
      error: {
        code: "INVALID_ONBOARDING_INPUT",
        message: "Organization name, admin name, and admin email are required."
      }
    };
  }

  const organization = await store.createOrganization({
    organizationName: body.organizationName,
    adminName: body.adminName,
    adminEmail: body.adminEmail
  });
  reply.code(201);
  return envelope(organization);
});

app.get(`${API_PREFIX}/organizations/:organizationId/members`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  const { organizationId } = request.params as { organizationId: string };
  const members = await store.listOrganizationMembers(organizationId, context);

  if (!members) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "ORGANIZATION_NOT_FOUND",
        message: `Organization ${organizationId} was not found.`
      }
    };
  }

  return envelope(members);
});

app.get(`${API_PREFIX}/organizations/:organizationId/invitations`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  const { organizationId } = request.params as { organizationId: string };
  const invitations = await store.listOrganizationInvitations(organizationId, context);

  if (!invitations) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "ORGANIZATION_NOT_FOUND",
        message: `Organization ${organizationId} was not found.`
      }
    };
  }

  return envelope(invitations);
});

app.post(`${API_PREFIX}/organizations/:organizationId/invitations`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  if (!hasRole(context, ["org_admin"])) {
    reply.code(403);
    return forbidden("Only organization admins can create invitations.");
  }

  const { organizationId } = request.params as { organizationId: string };
  const invitation = await store.createOrganizationInvitation(
    organizationId,
    request.body as never,
    context
  );

  if (!invitation) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "ORGANIZATION_NOT_FOUND",
        message: `Organization ${organizationId} was not found.`
      }
    };
  }

  reply.code(201);
  return envelope(invitation);
});

app.post(`${API_PREFIX}/invitations/:invitationId/accept`, async (request, reply) => {
  const { invitationId } = request.params as { invitationId: string };
  const result = await store.acceptInvitation(invitationId, request.body as never);

  if (!result) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "INVITATION_NOT_FOUND",
        message: `Invitation ${invitationId} was not found.`
      }
    };
  }

  return envelope(result);
});

app.get(`${API_PREFIX}/team-instances`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  return envelope(await store.listTeamInstances(context));
});

app.post(`${API_PREFIX}/team-instances`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  if (!hasRole(context, ["org_admin"])) {
    reply.code(403);
    return forbidden("Only organization admins can create team instances.");
  }

  return envelope(await store.createTeamInstance(request.body as never, context));
});

app.patch(`${API_PREFIX}/team-instances/:teamInstanceId`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  if (!hasRole(context, ["org_admin"])) {
    reply.code(403);
    return forbidden("Only organization admins can update team instances.");
  }

  const { teamInstanceId } = request.params as { teamInstanceId: string };
  const team = await store.updateTeamInstance(teamInstanceId, request.body as never, context);

  if (!team) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "TEAM_INSTANCE_NOT_FOUND",
        message: `Team ${teamInstanceId} was not found.`
      }
    };
  }

  return envelope(team);
});

app.get(`${API_PREFIX}/team-instances/:teamInstanceId/dashboard`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  const { teamInstanceId } = request.params as { teamInstanceId: string };
  const dashboard = await store.getDashboard(teamInstanceId, context);

  if (!dashboard) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "TEAM_INSTANCE_NOT_FOUND",
        message: `Team ${teamInstanceId} was not found.`
      }
    };
  }

  return envelope(dashboard);
});

app.post(`${API_PREFIX}/team-instances/:teamInstanceId/tasks`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  if (!hasRole(context, ["org_admin", "operator"])) {
    reply.code(403);
    return forbidden("Only organization admins and operators can create tasks.");
  }

  const { teamInstanceId } = request.params as { teamInstanceId: string };
  const task = await store.createTask(teamInstanceId, request.body as never, context);

  if (!task) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "TEAM_INSTANCE_NOT_FOUND",
        message: `Team ${teamInstanceId} was not found.`
      }
    };
  }

  reply.code(201);
  return envelope(task);
});

app.get(`${API_PREFIX}/tasks/:taskId`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  const { taskId } = request.params as { taskId: string };
  const task = await store.getTask(taskId, context);

  if (!task) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "TASK_NOT_FOUND",
        message: `Task ${taskId} was not found.`
      }
    };
  }

  return envelope(task);
});

app.get(`${API_PREFIX}/tasks/:taskId/video-generation`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  const { taskId } = request.params as { taskId: string };
  const { deliverableId } = request.query as { deliverableId?: string };
  const session = await store.getTaskVideoGeneration(taskId, deliverableId, context);

  if (session) {
    return envelope(session);
  }

  const task = await store.getTask(taskId, context);

  if (!task) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "TASK_NOT_FOUND",
        message: `Task ${taskId} was not found.`
      }
    };
  }

  return envelope(null);
});

app.post(`${API_PREFIX}/tasks/:taskId/video-generation`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  if (!hasRole(context, ["org_admin", "operator"])) {
    reply.code(403);
    return forbidden("Only organization admins and operators can start video generation.");
  }

  const { taskId } = request.params as { taskId: string };

  try {
    const session = await store.createTaskVideoGeneration(taskId, request.body as never, context);

    if (!session) {
      reply.code(404);
      return {
        data: null,
        meta: {},
        error: {
          code: "TASK_NOT_FOUND",
          message: `Task ${taskId} was not found.`
        }
      };
    }

    reply.code(201);
    return envelope(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video generation could not be started.";
    const isConfigError = message.includes("ARK_API_KEY") || message.includes("not configured");
    reply.code(isConfigError ? 503 : 400);
    return {
      data: null,
      meta: {},
      error: {
        code: isConfigError ? "VIDEO_PROVIDER_NOT_CONFIGURED" : "VIDEO_GENERATION_FAILED",
        message
      }
    };
  }
});

app.get(`${API_PREFIX}/approvals`, async (request, reply) => {
  const context = await requireContext(request, reply);
  if ("error" in context) {
    return context;
  }
  const { status } = request.query as { status?: "pending" | "all" };
  return envelope(await store.listApprovals(context, status ?? "pending"));
});

app.post(`${API_PREFIX}/approvals/:approvalId/approve`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  if (!hasRole(context, ["org_admin", "approver"])) {
    reply.code(403);
    return forbidden("Only organization admins and approvers can resolve approvals.");
  }

  const { approvalId } = request.params as { approvalId: string };
  const approval = await store.approveApproval(approvalId, context);

  if (!approval) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "APPROVAL_NOT_FOUND",
        message: `Approval ${approvalId} was not found.`
      }
    };
  }

  return envelope({
    approvalId: approval.id,
    status: approval.status
  });
});

app.post(`${API_PREFIX}/approvals/:approvalId/reject`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  if (!hasRole(context, ["org_admin", "approver"])) {
    reply.code(403);
    return forbidden("Only organization admins and approvers can resolve approvals.");
  }

  const { approvalId } = request.params as { approvalId: string };
  const approval = await store.rejectApproval(approvalId, context);

  if (!approval) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "APPROVAL_NOT_FOUND",
        message: `Approval ${approvalId} was not found.`
      }
    };
  }

  return envelope({
    approvalId: approval.id,
    status: approval.status
  });
});

app.get(`${API_PREFIX}/organizations/:organizationId/budget`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  const { organizationId } = request.params as { organizationId: string };
  const budget = await store.getOrganizationBudget(organizationId, context);

  if (!budget) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "ORGANIZATION_NOT_FOUND",
        message: `Organization ${organizationId} was not found.`
      }
    };
  }

  return envelope(budget);
});

app.patch(`${API_PREFIX}/organizations/:organizationId/budget`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  if (!hasRole(context, ["org_admin"])) {
    reply.code(403);
    return forbidden("Only organization admins can update organization budget policies.");
  }

  const { organizationId } = request.params as { organizationId: string };
  const budget = await store.updateOrganizationBudget(
    organizationId,
    request.body as never,
    context
  );

  if (!budget) {
    reply.code(404);
    return {
      data: null,
      meta: {},
      error: {
        code: "ORGANIZATION_NOT_FOUND",
        message: `Organization ${organizationId} was not found.`
      }
    };
  }

  return envelope(budget);
});

app.get(`${API_PREFIX}/audit-logs`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  return envelope(await store.listAuditLogs(context));
});

app.get(`${API_PREFIX}/stream`, async (request, reply) => {
  const context = await requireContext(request, reply);

  if ("error" in context) {
    return context;
  }

  const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;

  reply.hijack();
  reply.raw.statusCode = 200;
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("Access-Control-Allow-Origin", requestOrigin ?? "*");
  reply.raw.setHeader("Vary", "Origin");
  reply.raw.flushHeaders?.();

  const writeEvent = (type: string, data: unknown) => {
    reply.raw.write(`event: ${type}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  writeEvent("stream.ready", {
    connectedAt: new Date().toISOString()
  });

  const unsubscribe = store.subscribe((event) => {
    if (event.organizationId === context.currentOrganization.id) {
      writeEvent(event.type, event);
    }
  });

  const heartbeat = setInterval(() => {
    writeEvent("stream.ping", {
      now: new Date().toISOString()
    });
  }, 15000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

const port = Number(process.env.PORT ?? DEFAULT_API_PORT);

await app.listen({
  host: "0.0.0.0",
  port
});

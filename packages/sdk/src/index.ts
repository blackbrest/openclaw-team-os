import { API_PREFIX, DEFAULT_API_BASE_URL, buildApiUrl } from "@openclaw-team-os/config";
import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
  ApiEnvelope,
  ApprovalItem,
  BudgetSummary,
  CreateOrganizationInput,
  CreateOrganizationResult,
  CreateTeamInstanceInput,
  CreateVideoGenerationInput,
  CreateInvitationInput,
  CreateTaskInput,
  DashboardPayload,
  MePayload,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
  ProjectChatReplyInput,
  ProjectChatReplyResult,
  RuntimeStatusPayload,
  TaskDetailPayload,
  TeamInstanceSummary,
  TeamTemplateDetail,
  TeamTemplateSummary,
  UpdateTeamInstanceInput,
  VideoGenerationSession
} from "@openclaw-team-os/domain";

export interface ApiAuthContext {
  sessionToken?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  orgId?: string;
  orgName?: string;
  orgRole?: OrganizationRole;
}

export interface ApiClientOptions {
  baseUrl?: string;
  auth?: ApiAuthContext;
}

function buildAuthHeaders(auth?: ApiAuthContext): HeadersInit {
  if (!auth) {
    return {};
  }

  return {
    ...(auth.sessionToken ? { "x-session-token": auth.sessionToken } : {}),
    ...(auth.userId ? { "x-user-id": auth.userId } : {}),
    ...(auth.userName ? { "x-user-name": auth.userName } : {}),
    ...(auth.userEmail ? { "x-user-email": auth.userEmail } : {}),
    ...(auth.orgId ? { "x-org-id": auth.orgId } : {}),
    ...(auth.orgName ? { "x-org-name": auth.orgName } : {}),
    ...(auth.orgRole ? { "x-org-role": auth.orgRole } : {})
  };
}

function buildStreamUrl(path: string, baseUrl: string, auth?: ApiAuthContext): string {
  const url = new URL(buildApiUrl(path, baseUrl));

  if (auth?.userId) {
    url.searchParams.set("userId", auth.userId);
  }

  if (auth?.sessionToken) {
    url.searchParams.set("sessionToken", auth.sessionToken);
  }

  if (auth?.userName) {
    url.searchParams.set("userName", auth.userName);
  }

  if (auth?.userEmail) {
    url.searchParams.set("userEmail", auth.userEmail);
  }

  if (auth?.orgId) {
    url.searchParams.set("orgId", auth.orgId);
  }

  if (auth?.orgName) {
    url.searchParams.set("orgName", auth.orgName);
  }

  if (auth?.orgRole) {
    url.searchParams.set("orgRole", auth.orgRole);
  }

  return url.toString();
}

async function request<T>(
  path: string,
  init?: RequestInit,
  baseUrl = DEFAULT_API_BASE_URL,
  auth?: ApiAuthContext
): Promise<T> {
  const response = await fetch(buildApiUrl(path, baseUrl), {
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(auth),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let errorMessage = `Request failed with ${response.status}`;

    try {
      const payload = (await response.json()) as ApiEnvelope<unknown>;
      if (payload.error?.message) {
        errorMessage = payload.error.message;
      }
    } catch {
      // Ignore JSON parsing errors and keep the default HTTP status message.
    }

    throw new Error(errorMessage);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_API_BASE_URL;
  const auth = options.auth;

  return {
    getMe: () => request<MePayload>(`${API_PREFIX}/me`, undefined, baseUrl, auth),
    getTeamTemplates: () =>
      request<TeamTemplateSummary[]>(`${API_PREFIX}/team-templates`, undefined, baseUrl, auth),
    getTeamTemplate: (templateId: string) =>
      request<TeamTemplateDetail>(`${API_PREFIX}/team-templates/${templateId}`, undefined, baseUrl, auth),
    getOrganizationMembers: (organizationId: string) =>
      request<OrganizationMember[]>(
        `${API_PREFIX}/organizations/${organizationId}/members`,
        undefined,
        baseUrl,
        auth
      ),
    getOrganizationInvitations: (organizationId: string) =>
      request<OrganizationInvitation[]>(
        `${API_PREFIX}/organizations/${organizationId}/invitations`,
        undefined,
        baseUrl,
        auth
      ),
    createOrganizationInvitation: (organizationId: string, input: CreateInvitationInput) =>
      request<OrganizationInvitation>(
        `${API_PREFIX}/organizations/${organizationId}/invitations`,
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        baseUrl,
        auth
      ),
    createOrganization: (input: CreateOrganizationInput) =>
      request<CreateOrganizationResult>(
        `${API_PREFIX}/onboarding/organizations`,
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        baseUrl,
        auth
      ),
    acceptInvitation: (invitationId: string, input: AcceptInvitationInput) =>
      request<AcceptInvitationResult>(
        `${API_PREFIX}/invitations/${invitationId}/accept`,
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        baseUrl,
        auth
      ),
    createTeamInstance: (input: CreateTeamInstanceInput) =>
      request<TeamInstanceSummary>(
        `${API_PREFIX}/team-instances`,
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        baseUrl,
        auth
      ),
    updateTeamInstance: (teamInstanceId: string, input: UpdateTeamInstanceInput) =>
      request<TeamInstanceSummary>(
        `${API_PREFIX}/team-instances/${teamInstanceId}`,
        {
          method: "PATCH",
          body: JSON.stringify(input)
        },
        baseUrl,
        auth
      ),
    getTeamInstances: () =>
      request<TeamInstanceSummary[]>(`${API_PREFIX}/team-instances`, undefined, baseUrl, auth),
    getDashboard: (teamInstanceId: string) =>
      request<DashboardPayload>(
        `${API_PREFIX}/team-instances/${teamInstanceId}/dashboard`,
        undefined,
        baseUrl,
        auth
      ),
    createTask: (teamInstanceId: string, input: CreateTaskInput) =>
      request<{ taskId: string }>(
        `${API_PREFIX}/team-instances/${teamInstanceId}/tasks`,
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        baseUrl,
        auth
      ),
    getTask: (taskId: string) =>
      request<TaskDetailPayload>(`${API_PREFIX}/tasks/${taskId}`, undefined, baseUrl, auth),
    getTaskVideoGeneration: (taskId: string, deliverableId?: string) =>
      request<VideoGenerationSession | null>(
        `${API_PREFIX}/tasks/${taskId}/video-generation${
          deliverableId ? `?deliverableId=${encodeURIComponent(deliverableId)}` : ""
        }`,
        undefined,
        baseUrl,
        auth
      ),
    createTaskVideoGeneration: (taskId: string, input: CreateVideoGenerationInput = {}) =>
      request<VideoGenerationSession>(
        `${API_PREFIX}/tasks/${taskId}/video-generation`,
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        baseUrl,
        auth
      ),
    getApprovals: () =>
      request<ApprovalItem[]>(`${API_PREFIX}/approvals?status=pending`, undefined, baseUrl, auth),
    approveApproval: (approvalId: string, comment: string) =>
      request<{ approvalId: string; status: string }>(
        `${API_PREFIX}/approvals/${approvalId}/approve`,
        {
          method: "POST",
          body: JSON.stringify({ comment })
        },
        baseUrl,
        auth
      ),
    rejectApproval: (approvalId: string, comment: string) =>
      request<{ approvalId: string; status: string }>(
        `${API_PREFIX}/approvals/${approvalId}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ comment })
        },
        baseUrl,
        auth
      ),
    getBudget: (organizationId: string) =>
      request<BudgetSummary>(
        `${API_PREFIX}/organizations/${organizationId}/budget`,
        undefined,
        baseUrl,
        auth
      ),
    updateBudget: (
      organizationId: string,
      changes: Partial<Pick<BudgetSummary, "monthlyLimitCny" | "taskLimitCny" | "pauseOnLimit">>
    ) =>
      request<BudgetSummary>(
        `${API_PREFIX}/organizations/${organizationId}/budget`,
        {
          method: "PATCH",
          body: JSON.stringify(changes)
        },
        baseUrl,
        auth
      ),
    getRuntimeStatus: () =>
      request<RuntimeStatusPayload>(`${API_PREFIX}/runtime-status`, undefined, baseUrl, auth),
    createProjectChatReply: (input: ProjectChatReplyInput) =>
      request<ProjectChatReplyResult>(
        `${API_PREFIX}/project-chat/reply`,
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        baseUrl,
        auth
      ),
    streamUrl: () => buildStreamUrl(`${API_PREFIX}/stream`, baseUrl, auth)
  };
}

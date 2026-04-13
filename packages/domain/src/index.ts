export type OrganizationRole = "org_admin" | "operator" | "approver";
export type RuntimeRoleId =
  | "manager"
  | "researcher"
  | "planner"
  | "writer"
  | "reviewer"
  | "publisher";

export type TaskStatus =
  | "draft"
  | "queued"
  | "running"
  | "waiting_approval"
  | "approved"
  | "rejected"
  | "paused_budget_guard"
  | "failed"
  | "completed"
  | "cancelled";

export type TaskStepStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "expired";

export type RuntimeMode = "mock" | "openclaw-llm-task";

export interface ApiEnvelope<T> {
  data: T;
  meta: Record<string, unknown>;
  error: null | {
    code: string;
    message: string;
  };
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  role: OrganizationRole;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface MePayload {
  user: UserSummary;
  currentOrganization: OrganizationSummary;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  status: "active";
  createdAt: string;
}

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedByName: string;
  createdAt: string;
  acceptedAt?: string;
}

export interface SessionRecord {
  token: string;
  memberId: string;
  organizationId: string;
  createdAt: string;
  expiresAt?: string;
}

export interface TeamTemplateSummary {
  id: string;
  name: string;
  tagline: string;
  scenarioType: string;
  roleCount: number;
  estimatedCostRange: string;
  estimatedTurnaround: string;
  official: boolean;
}

export interface RoleDefinition {
  id: RuntimeRoleId;
  title: string;
  summary: string;
}

export interface TeamTemplateDetail extends TeamTemplateSummary {
  description: string;
  approvalStages: string[];
  budgetDefaults: {
    monthlyLimitCny: number;
    taskLimitCny: number;
  };
  roles: RoleDefinition[];
  sampleDeliverables: string[];
}

export interface TeamInstanceSummary {
  id: string;
  organizationId: string;
  templateId: string;
  name: string;
  status: "active" | "paused";
}

export interface UpdateTeamInstanceInput {
  name?: string;
  status?: TeamInstanceSummary["status"];
}

export interface OrgChartNode {
  id: string;
  roleId: RuntimeRoleId;
  title: string;
  summary: string;
  status: "idle" | "running" | "waiting_approval";
}

export interface BudgetSummary {
  monthlyLimitCny: number;
  monthlySpentCny: number;
  taskLimitCny: number;
  pauseOnLimit: boolean;
}

export interface RuntimeStatusPayload {
  mode: RuntimeMode;
  label: string;
  ready: boolean;
  note?: string;
  gatewayUrl?: string;
  sessionKey?: string;
  provider?: string;
  model?: string;
}

export type ProjectChatIntent =
  | "availability"
  | "discussion"
  | "progress"
  | "execution";

export interface ProjectChatMemberSummary {
  id: string;
  displayName: string;
  roleLabel: string;
  summary: string;
  outputs: string[];
}

export interface ProjectChatHistoryMessage {
  authorKind: "ceo" | "lead" | "employee" | "system";
  authorLabel: string;
  body: string;
  createdAt: string;
}

export interface ProjectChatAssignmentSummary {
  ownerUnitId: string;
  title: string;
  status: string;
  latestReport?: string;
  updatedAt: string;
}

export interface ProjectChatReplyInput {
  projectName: string;
  projectDescription: string;
  projectCategoryId: string;
  channelKind: "all-hands" | "lead" | "direct" | "group";
  channelName: string;
  leadUnitId: string;
  leadName: string;
  currentTargetUnitId?: string;
  currentTargetName?: string;
  currentTargetRoleLabel?: string;
  currentTargetSummary?: string;
  members: ProjectChatMemberSummary[];
  assignments: ProjectChatAssignmentSummary[];
  recentMessages: ProjectChatHistoryMessage[];
  userMessage: string;
}

export interface ProjectChatExecutionDraftSection {
  title: string;
  bullets: string[];
}

export interface ProjectChatExecutionDraft {
  stageId: string;
  stageTitle: string;
  deliverableTitle: string;
  summary: string;
  sections: ProjectChatExecutionDraftSection[];
  nextActions: string[];
  needsReview: boolean;
}

export interface ProjectChatReplyResult {
  mode: "model" | "fallback";
  providerLabel: string;
  intent: ProjectChatIntent;
  shouldStartExecution: boolean;
  reply: string;
  understanding: string;
  executionDraft: ProjectChatExecutionDraft | null;
}

export interface Task {
  id: string;
  teamInstanceId: string;
  title: string;
  businessGoal: string;
  deliverableType: string;
  constraints?: Record<string, unknown>;
  status: TaskStatus;
  currentRoleId?: RuntimeRoleId;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStep {
  id: string;
  taskId: string;
  roleId: RuntimeRoleId;
  label: string;
  status: TaskStepStatus;
}

export interface Deliverable {
  id: string;
  taskId: string;
  title: string;
  type: string;
  summary: string;
  content?: DeliverableContent;
  createdAt: string;
}

export interface DeliverableContentSection {
  id: string;
  title: string;
  body?: string;
  lines?: string[];
}

export interface DeliverableVideoScene {
  id: string;
  title: string;
  durationSeconds: number;
  prompt: string;
  visualGoal: string;
  dialogue?: string;
}

export interface DeliverableVideoHandoff {
  provider: string;
  mode: "manual_handoff" | "api_ready" | "blocked";
  status: "ready" | "submitted" | "blocked";
  note: string;
  durationSeconds: number;
  aspectRatio: string;
  visualStyle: string;
  masterPrompt: string;
  negativePrompt?: string;
  scenes: DeliverableVideoScene[];
}

export interface DeliverableContent {
  kind: "generic_pack" | "short_drama_pack";
  headline?: string;
  sections: DeliverableContentSection[];
  nextActions?: string[];
  videoHandoff?: DeliverableVideoHandoff;
}

export type VideoGenerationClipStatus =
  | "pending"
  | "submitted"
  | "processing"
  | "succeeded"
  | "failed";

export interface VideoGenerationClip {
  id: string;
  sceneId: string;
  sceneTitle: string;
  prompt: string;
  durationSeconds: number;
  providerTaskId?: string;
  status: VideoGenerationClipStatus;
  videoUrl?: string;
  previewImageUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoGenerationSession {
  id: string;
  taskId: string;
  deliverableId: string;
  provider: string;
  providerModel: string;
  mode: "scene_batch";
  status: "idle" | "submitted" | "processing" | "partial" | "completed" | "failed";
  note: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  completedAt?: string;
  clips: VideoGenerationClip[];
}

export interface ApprovalItem {
  id: string;
  taskId: string;
  teamInstanceId: string;
  title: string;
  stage: string;
  summary: string;
  status: ApprovalStatus;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorLabel: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface DashboardPayload {
  team: TeamInstanceSummary;
  summary: {
    activeTasks: number;
    pendingApprovals: number;
    monthlySpendCny: number;
    completedThisWeek: number;
  };
  orgChart: OrgChartNode[];
  todayProgress: string[];
  pendingApprovals: ApprovalItem[];
  recentTasks: Task[];
  recentDeliverables: Deliverable[];
  budgetSummary: BudgetSummary;
  runtime: RuntimeStatusPayload;
}

export interface TaskDetailPayload {
  task: Task;
  steps: TaskStep[];
  approvals: ApprovalItem[];
  deliverables: Deliverable[];
  videoGeneration?: VideoGenerationSession;
  auditTrail: AuditLogEntry[];
  budgetSummary: BudgetSummary;
}

export interface CreateTaskInput {
  title: string;
  businessGoal: string;
  deliverableType: string;
  deadlineAt?: string;
  constraints?: Record<string, unknown>;
}

export interface CreateTeamInstanceInput {
  organizationId: string;
  templateId: string;
  name: string;
  budgetPolicy: {
    monthlyLimitCny: number;
    taskLimitCny: number;
    pauseOnLimit: boolean;
  };
  approvalPolicy: {
    enabled: boolean;
    approverUserIds: string[];
    requiredStages: string[];
  };
}

export interface CreateVideoGenerationInput {
  deliverableId?: string;
}

export interface CreateInvitationInput {
  email: string;
  role: OrganizationRole;
}

export interface CreateOrganizationInput {
  organizationName: string;
  adminName: string;
  adminEmail: string;
}

export interface AcceptInvitationInput {
  name: string;
}

export interface CreateOrganizationResult {
  organization: OrganizationRecord;
  member: OrganizationMember;
  session: SessionRecord;
  me: MePayload;
}

export interface AcceptInvitationResult {
  invitation: OrganizationInvitation;
  member: OrganizationMember;
  session: SessionRecord;
  me: MePayload;
}

export interface DomainEvent<T = Record<string, unknown>> {
  type: string;
  organizationId: string;
  occurredAt: string;
  data: T;
}

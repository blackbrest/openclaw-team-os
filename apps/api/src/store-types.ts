import type {
  ApprovalItem,
  AuditLogEntry,
  BudgetSummary,
  Deliverable,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRecord,
  SessionRecord,
  Task,
  TaskStep,
  TeamInstanceSummary
} from "@openclaw-team-os/domain";
import type { RuntimeDeliverableDraft } from "@openclaw-team-os/runtime-adapter";

export interface InternalTaskRecord {
  task: Task;
  steps: TaskStep[];
  approvals: ApprovalItem[];
  deliverables: Deliverable[];
  auditTrail: AuditLogEntry[];
  stepOutputs: Record<string, unknown>;
  pendingDeliverableDraft?: RuntimeDeliverableDraft;
}

export interface PersistenceSeedBundle {
  organizations: OrganizationRecord[];
  members: OrganizationMember[];
  invitations: OrganizationInvitation[];
  sessions: SessionRecord[];
  teamInstances: Array<{
    team: TeamInstanceSummary;
    budget: BudgetSummary;
  }>;
  taskRecords: InternalTaskRecord[];
  auditLogs: AuditLogEntry[];
}

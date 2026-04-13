import type {
  MePayload,
  AuditLogEntry,
  BudgetSummary,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRecord,
  SessionRecord,
  TeamInstanceSummary
} from "@openclaw-team-os/domain";
import { Pool } from "pg";

import { runPendingMigrations } from "./migrations.js";
import type { InternalTaskRecord, PersistenceSeedBundle } from "./store-types.js";

export interface AppPersistence {
  readonly mode: "memory" | "postgres";
  readonly note?: string;
  init(seed: PersistenceSeedBundle): Promise<void>;
  getOrganization(organizationId: string): Promise<OrganizationRecord | undefined>;
  upsertOrganization(organization: OrganizationRecord): Promise<void>;
  listOrganizationMembers(organizationId: string): Promise<OrganizationMember[]>;
  findOrganizationMemberByUserId(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMember | undefined>;
  findOrganizationMemberByEmail(
    organizationId: string,
    email: string
  ): Promise<OrganizationMember | undefined>;
  upsertOrganizationMember(member: OrganizationMember): Promise<void>;
  listOrganizationInvitations(organizationId: string): Promise<OrganizationInvitation[]>;
  getInvitation(invitationId: string): Promise<OrganizationInvitation | undefined>;
  upsertInvitation(invitation: OrganizationInvitation): Promise<void>;
  upsertSession(session: SessionRecord): Promise<void>;
  getSessionContext(sessionToken: string): Promise<MePayload | undefined>;
  listTeamInstances(): Promise<TeamInstanceSummary[]>;
  getTeamInstance(teamInstanceId: string): Promise<TeamInstanceSummary | undefined>;
  upsertTeamInstance(team: TeamInstanceSummary): Promise<void>;
  getBudget(teamInstanceId: string): Promise<BudgetSummary | undefined>;
  upsertBudget(teamInstanceId: string, budget: BudgetSummary): Promise<void>;
  listTaskRecords(): Promise<InternalTaskRecord[]>;
  getTaskRecord(taskId: string): Promise<InternalTaskRecord | undefined>;
  upsertTaskRecord(record: InternalTaskRecord): Promise<void>;
  listAuditLogs(): Promise<AuditLogEntry[]>;
  appendAuditLog(entry: AuditLogEntry): Promise<void>;
}

interface PersistenceEnv {
  DATABASE_URL?: string;
}

type TaskRow = {
  id: string;
  team_instance_id: string;
  title: string;
  business_goal: string;
  deliverable_type: string;
  constraints: Record<string, unknown> | null;
  status: string;
  current_role_id: string | null;
  created_at: string;
  updated_at: string;
  step_outputs: Record<string, unknown> | null;
  pending_deliverable_draft: Record<string, unknown> | null;
};

type StepRow = {
  id: string;
  task_id: string;
  role_id: string;
  label: string;
  status: string;
};

type ApprovalRow = {
  id: string;
  task_id: string;
  team_instance_id: string;
  title: string;
  stage: string;
  summary: string;
  status: string;
  created_at: string;
};

type DeliverableRow = {
  id: string;
  task_id: string;
  title: string;
  type: string;
  summary: string;
  content: Record<string, unknown> | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_label: string;
  created_at: string;
};

type TeamRow = {
  id: string;
  organization_id: string;
  template_id: string;
  name: string;
  status: string;
};

type BudgetRow = {
  team_instance_id: string;
  monthly_limit_cny: number;
  monthly_spent_cny: number;
  task_limit_cny: number;
  pause_on_limit: boolean;
};

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
};

type OrganizationMemberRow = {
  id: string;
  user_id: string;
  organization_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  status: string;
  invited_by_name: string;
  created_at: string;
  accepted_at: string | null;
};

type SessionContextRow = {
  user_id: string;
  user_name: string;
  user_email: string;
  organization_id: string;
  organization_name: string;
  role: string;
};

function taskAuditTrail(auditLogs: AuditLogEntry[], taskId: string): AuditLogEntry[] {
  return auditLogs
    .filter((entry) => entry.entityType === "task" && entry.entityId === taskId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function mapAuditRow(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorLabel: row.actor_label,
    createdAt: row.created_at
  };
}

function mapTeamRow(row: TeamRow): TeamInstanceSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    templateId: row.template_id,
    name: row.name,
    status: row.status as TeamInstanceSummary["status"]
  };
}

function mapBudgetRow(row: BudgetRow): BudgetSummary {
  return {
    monthlyLimitCny: row.monthly_limit_cny,
    monthlySpentCny: row.monthly_spent_cny,
    taskLimitCny: row.task_limit_cny,
    pauseOnLimit: row.pause_on_limit
  };
}

function mapOrganizationRow(row: OrganizationRow): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at
  };
}

function mapOrganizationMemberRow(row: OrganizationMemberRow): OrganizationMember {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    name: row.name,
    email: row.email,
    role: row.role as OrganizationMember["role"],
    status: row.status as OrganizationMember["status"],
    createdAt: row.created_at
  };
}

function mapInvitationRow(row: InvitationRow): OrganizationInvitation {
  const invitation: OrganizationInvitation = {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role as OrganizationInvitation["role"],
    status: row.status as OrganizationInvitation["status"],
    invitedByName: row.invited_by_name,
    createdAt: row.created_at
  };

  if (row.accepted_at) {
    invitation.acceptedAt = row.accepted_at;
  }

  return invitation;
}

function mapSessionContextRow(row: SessionContextRow): MePayload {
  return {
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email
    },
    currentOrganization: {
      id: row.organization_id,
      name: row.organization_name,
      role: row.role as MePayload["currentOrganization"]["role"]
    }
  };
}

function toPendingDeliverableDraft(
  value: Record<string, unknown> | null
): InternalTaskRecord["pendingDeliverableDraft"] {
  if (!value) {
    return undefined;
  }

  const title = typeof value.title === "string" ? value.title : undefined;
  const type = typeof value.type === "string" ? value.type : undefined;
  const summary = typeof value.summary === "string" ? value.summary : undefined;
  const content =
    value.content && typeof value.content === "object"
      ? (value.content as InternalTaskRecord["deliverables"][number]["content"])
      : undefined;

  if (!title || !type || !summary) {
    return undefined;
  }

  const draft: InternalTaskRecord["pendingDeliverableDraft"] = {
    title,
    type,
    summary
  };

  if (content) {
    draft.content = content;
  }

  return draft;
}

function toDeliverableContent(
  value: Record<string, unknown> | null
): InternalTaskRecord["deliverables"][number]["content"] {
  if (!value) {
    return undefined;
  }

  if (typeof value.kind !== "string" || !Array.isArray(value.sections)) {
    return undefined;
  }

  return value as unknown as InternalTaskRecord["deliverables"][number]["content"];
}

function mapTaskRecord(
  taskRow: TaskRow,
  steps: StepRow[],
  approvals: ApprovalRow[],
  deliverables: DeliverableRow[],
  auditLogs: AuditLogEntry[]
): InternalTaskRecord {
  const task: InternalTaskRecord["task"] = {
    id: taskRow.id,
    teamInstanceId: taskRow.team_instance_id,
    title: taskRow.title,
    businessGoal: taskRow.business_goal,
    deliverableType: taskRow.deliverable_type,
    constraints: taskRow.constraints ?? {},
    status: taskRow.status as InternalTaskRecord["task"]["status"],
    createdAt: taskRow.created_at,
    updatedAt: taskRow.updated_at
  };

  if (taskRow.current_role_id) {
    task.currentRoleId = taskRow.current_role_id as InternalTaskRecord["steps"][number]["roleId"];
  }

  const record: InternalTaskRecord = {
    task,
    steps: steps.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      roleId: row.role_id as InternalTaskRecord["steps"][number]["roleId"],
      label: row.label,
      status: row.status as InternalTaskRecord["steps"][number]["status"]
    })),
    approvals: approvals.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      teamInstanceId: row.team_instance_id,
      title: row.title,
      stage: row.stage,
      summary: row.summary,
      status: row.status as InternalTaskRecord["approvals"][number]["status"],
      createdAt: row.created_at
    })),
    deliverables: deliverables.map((row) => {
      const content = toDeliverableContent(row.content);

      return {
        id: row.id,
        taskId: row.task_id,
        title: row.title,
        type: row.type,
        summary: row.summary,
        ...(content ? { content } : {}),
        createdAt: row.created_at
      };
    }),
    auditTrail: taskAuditTrail(auditLogs, taskRow.id),
    stepOutputs: taskRow.step_outputs ?? {}
  };

  const pendingDeliverableDraft = toPendingDeliverableDraft(taskRow.pending_deliverable_draft);

  if (pendingDeliverableDraft) {
    record.pendingDeliverableDraft = pendingDeliverableDraft;
  }

  return record;
}

class MemoryPersistence implements AppPersistence {
  readonly mode = "memory" as const;
  readonly note?: string;

  private readonly organizations = new Map<string, OrganizationRecord>();
  private readonly members = new Map<string, OrganizationMember>();
  private readonly invitations = new Map<string, OrganizationInvitation>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly teamInstances = new Map<string, TeamInstanceSummary>();
  private readonly budgets = new Map<string, BudgetSummary>();
  private readonly taskRecords = new Map<string, InternalTaskRecord>();
  private readonly auditLogs: AuditLogEntry[] = [];

  constructor(note?: string) {
    if (note) {
      this.note = note;
    }
  }

  async init(seed: PersistenceSeedBundle): Promise<void> {
    if (this.organizations.size === 0) {
      for (const organization of seed.organizations) {
        this.organizations.set(organization.id, organization);
      }
    }

    if (this.members.size === 0) {
      for (const member of seed.members) {
        this.members.set(member.id, member);
      }
    }

    if (this.invitations.size === 0) {
      for (const invitation of seed.invitations) {
        this.invitations.set(invitation.id, invitation);
      }
    }

    if (this.sessions.size === 0) {
      for (const session of seed.sessions) {
        this.sessions.set(session.token, session);
      }
    }

    if (this.teamInstances.size === 0) {
      for (const item of seed.teamInstances) {
        this.teamInstances.set(item.team.id, item.team);
        this.budgets.set(item.team.id, item.budget);
      }
    }

    if (this.taskRecords.size === 0) {
      for (const record of seed.taskRecords) {
        this.taskRecords.set(record.task.id, {
          ...record,
          auditTrail: []
        });
      }
    }

    if (this.auditLogs.length === 0) {
      this.auditLogs.push(...seed.auditLogs);
    }
  }

  async getOrganization(organizationId: string): Promise<OrganizationRecord | undefined> {
    return this.organizations.get(organizationId);
  }

  async upsertOrganization(organization: OrganizationRecord): Promise<void> {
    this.organizations.set(organization.id, organization);
  }

  async listOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
    return [...this.members.values()]
      .filter((member) => member.organizationId === organizationId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async findOrganizationMemberByUserId(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMember | undefined> {
    return [...this.members.values()].find(
      (member) => member.organizationId === organizationId && member.userId === userId
    );
  }

  async findOrganizationMemberByEmail(
    organizationId: string,
    email: string
  ): Promise<OrganizationMember | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    return [...this.members.values()].find(
      (member) => member.organizationId === organizationId && member.email.toLowerCase() === normalizedEmail
    );
  }

  async upsertOrganizationMember(member: OrganizationMember): Promise<void> {
    this.members.set(member.id, member);
  }

  async listOrganizationInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    return [...this.invitations.values()]
      .filter((invitation) => invitation.organizationId === organizationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getInvitation(invitationId: string): Promise<OrganizationInvitation | undefined> {
    return this.invitations.get(invitationId);
  }

  async upsertInvitation(invitation: OrganizationInvitation): Promise<void> {
    this.invitations.set(invitation.id, invitation);
  }

  async upsertSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.token, session);
  }

  async getSessionContext(sessionToken: string): Promise<MePayload | undefined> {
    const session = this.sessions.get(sessionToken);

    if (!session) {
      return undefined;
    }

    const member = this.members.get(session.memberId);
    const organization = this.organizations.get(session.organizationId);

    if (!member || !organization) {
      return undefined;
    }

    return {
      user: {
        id: member.userId,
        name: member.name,
        email: member.email
      },
      currentOrganization: {
        id: organization.id,
        name: organization.name,
        role: member.role
      }
    };
  }

  async listTeamInstances(): Promise<TeamInstanceSummary[]> {
    return [...this.teamInstances.values()];
  }

  async getTeamInstance(teamInstanceId: string): Promise<TeamInstanceSummary | undefined> {
    return this.teamInstances.get(teamInstanceId);
  }

  async upsertTeamInstance(team: TeamInstanceSummary): Promise<void> {
    this.teamInstances.set(team.id, team);
  }

  async getBudget(teamInstanceId: string): Promise<BudgetSummary | undefined> {
    return this.budgets.get(teamInstanceId);
  }

  async upsertBudget(teamInstanceId: string, budget: BudgetSummary): Promise<void> {
    this.budgets.set(teamInstanceId, budget);
  }

  async listTaskRecords(): Promise<InternalTaskRecord[]> {
    return [...this.taskRecords.values()].map((record) => ({
      ...record,
      auditTrail: taskAuditTrail(this.auditLogs, record.task.id)
    }));
  }

  async getTaskRecord(taskId: string): Promise<InternalTaskRecord | undefined> {
    const record = this.taskRecords.get(taskId);

    if (!record) {
      return undefined;
    }

    return {
      ...record,
      auditTrail: taskAuditTrail(this.auditLogs, taskId)
    };
  }

  async upsertTaskRecord(record: InternalTaskRecord): Promise<void> {
    this.taskRecords.set(record.task.id, {
      ...record,
      auditTrail: []
    });
  }

  async listAuditLogs(): Promise<AuditLogEntry[]> {
    return [...this.auditLogs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async appendAuditLog(entry: AuditLogEntry): Promise<void> {
    this.auditLogs.unshift(entry);
  }
}

class PostgresPersistence implements AppPersistence {
  readonly mode = "postgres" as const;

  constructor(private readonly pool: Pool) {}

  async init(seed: PersistenceSeedBundle): Promise<void> {
    await runPendingMigrations(this.pool);

    const organizationCount = await this.scalarCount("organizations");
    if (organizationCount === 0) {
      for (const organization of seed.organizations) {
        await this.upsertOrganization(organization);
      }
    }

    const memberCount = await this.scalarCount("organization_members");
    if (memberCount === 0) {
      for (const member of seed.members) {
        await this.upsertOrganizationMember(member);
      }
    }

    const invitationCount = await this.scalarCount("organization_invitations");
    if (invitationCount === 0) {
      for (const invitation of seed.invitations) {
        await this.upsertInvitation(invitation);
      }
    }

    const sessionCount = await this.scalarCount("user_sessions");
    if (sessionCount === 0) {
      for (const session of seed.sessions) {
        await this.upsertSession(session);
      }
    }

    const teamCount = await this.scalarCount("team_instances");
    if (teamCount === 0) {
      for (const item of seed.teamInstances) {
        await this.upsertTeamInstance(item.team);
        await this.upsertBudget(item.team.id, item.budget);
      }
    }

    const taskCount = await this.scalarCount("tasks");
    if (taskCount === 0) {
      for (const record of seed.taskRecords) {
        await this.upsertTaskRecord(record);
      }
    }

    const auditCount = await this.scalarCount("audit_logs");
    if (auditCount === 0) {
      for (const entry of seed.auditLogs) {
        await this.appendAuditLog(entry);
      }
    }
  }

  async getOrganization(organizationId: string): Promise<OrganizationRecord | undefined> {
    const { rows } = await this.pool.query<OrganizationRow>(
      `
        select id, name, created_at::text
        from organizations
        where id = $1
        limit 1
      `,
      [organizationId]
    );

    return rows[0] ? mapOrganizationRow(rows[0]) : undefined;
  }

  async upsertOrganization(organization: OrganizationRecord): Promise<void> {
    await this.pool.query(
      `
        insert into organizations (id, name, created_at)
        values ($1, $2, $3::timestamptz)
        on conflict (id) do update
        set name = excluded.name,
            created_at = excluded.created_at
      `,
      [organization.id, organization.name, organization.createdAt]
    );
  }

  async listOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
    const { rows } = await this.pool.query<OrganizationMemberRow>(
      `
        select id, user_id, organization_id, name, email, role, status, created_at::text
        from organization_members
        where organization_id = $1
        order by created_at asc
      `,
      [organizationId]
    );

    return rows.map(mapOrganizationMemberRow);
  }

  async findOrganizationMemberByUserId(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMember | undefined> {
    const { rows } = await this.pool.query<OrganizationMemberRow>(
      `
        select id, user_id, organization_id, name, email, role, status, created_at::text
        from organization_members
        where organization_id = $1 and user_id = $2
        limit 1
      `,
      [organizationId, userId]
    );

    return rows[0] ? mapOrganizationMemberRow(rows[0]) : undefined;
  }

  async findOrganizationMemberByEmail(
    organizationId: string,
    email: string
  ): Promise<OrganizationMember | undefined> {
    const { rows } = await this.pool.query<OrganizationMemberRow>(
      `
        select id, user_id, organization_id, name, email, role, status, created_at::text
        from organization_members
        where organization_id = $1 and lower(email) = lower($2)
        limit 1
      `,
      [organizationId, email]
    );

    return rows[0] ? mapOrganizationMemberRow(rows[0]) : undefined;
  }

  async upsertOrganizationMember(member: OrganizationMember): Promise<void> {
    await this.pool.query(
      `
        insert into organization_members (
          id,
          user_id,
          organization_id,
          name,
          email,
          role,
          status,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
        on conflict (id) do update
        set user_id = excluded.user_id,
            organization_id = excluded.organization_id,
            name = excluded.name,
            email = excluded.email,
            role = excluded.role,
            status = excluded.status,
            created_at = excluded.created_at
      `,
      [
        member.id,
        member.userId,
        member.organizationId,
        member.name,
        member.email,
        member.role,
        member.status,
        member.createdAt
      ]
    );
  }

  async listOrganizationInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    const { rows } = await this.pool.query<InvitationRow>(
      `
        select id, organization_id, email, role, status, invited_by_name, created_at::text, accepted_at::text
        from organization_invitations
        where organization_id = $1
        order by created_at desc
      `,
      [organizationId]
    );

    return rows.map(mapInvitationRow);
  }

  async getInvitation(invitationId: string): Promise<OrganizationInvitation | undefined> {
    const { rows } = await this.pool.query<InvitationRow>(
      `
        select id, organization_id, email, role, status, invited_by_name, created_at::text, accepted_at::text
        from organization_invitations
        where id = $1
        limit 1
      `,
      [invitationId]
    );

    return rows[0] ? mapInvitationRow(rows[0]) : undefined;
  }

  async upsertInvitation(invitation: OrganizationInvitation): Promise<void> {
    await this.pool.query(
      `
        insert into organization_invitations (
          id,
          organization_id,
          email,
          role,
          status,
          invited_by_name,
          created_at,
          accepted_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz)
        on conflict (id) do update
        set organization_id = excluded.organization_id,
            email = excluded.email,
            role = excluded.role,
            status = excluded.status,
            invited_by_name = excluded.invited_by_name,
            created_at = excluded.created_at,
            accepted_at = excluded.accepted_at
      `,
      [
        invitation.id,
        invitation.organizationId,
        invitation.email,
        invitation.role,
        invitation.status,
        invitation.invitedByName,
        invitation.createdAt,
        invitation.acceptedAt ?? null
      ]
    );
  }

  async upsertSession(session: SessionRecord): Promise<void> {
    await this.pool.query(
      `
        insert into user_sessions (token, member_id, organization_id, created_at, expires_at)
        values ($1, $2, $3, $4::timestamptz, $5::timestamptz)
        on conflict (token) do update
        set member_id = excluded.member_id,
            organization_id = excluded.organization_id,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
      `,
      [
        session.token,
        session.memberId,
        session.organizationId,
        session.createdAt,
        session.expiresAt ?? null
      ]
    );
  }

  async getSessionContext(sessionToken: string): Promise<MePayload | undefined> {
    const { rows } = await this.pool.query<SessionContextRow>(
      `
        select
          members.user_id,
          members.name as user_name,
          members.email as user_email,
          organizations.id as organization_id,
          organizations.name as organization_name,
          members.role
        from user_sessions sessions
        join organization_members members on members.id = sessions.member_id
        join organizations on organizations.id = sessions.organization_id
        where sessions.token = $1
          and (sessions.expires_at is null or sessions.expires_at > now())
        limit 1
      `,
      [sessionToken]
    );

    return rows[0] ? mapSessionContextRow(rows[0]) : undefined;
  }

  async listTeamInstances(): Promise<TeamInstanceSummary[]> {
    const { rows } = await this.pool.query<TeamRow>(
      "select id, organization_id, template_id, name, status from team_instances order by name asc"
    );

    return rows.map(mapTeamRow);
  }

  async getTeamInstance(teamInstanceId: string): Promise<TeamInstanceSummary | undefined> {
    const { rows } = await this.pool.query<TeamRow>(
      "select id, organization_id, template_id, name, status from team_instances where id = $1 limit 1",
      [teamInstanceId]
    );

    return rows[0] ? mapTeamRow(rows[0]) : undefined;
  }

  async upsertTeamInstance(team: TeamInstanceSummary): Promise<void> {
    await this.pool.query(
      `
        insert into team_instances (id, organization_id, template_id, name, status)
        values ($1, $2, $3, $4, $5)
        on conflict (id) do update
        set organization_id = excluded.organization_id,
            template_id = excluded.template_id,
            name = excluded.name,
            status = excluded.status
      `,
      [team.id, team.organizationId, team.templateId, team.name, team.status]
    );
  }

  async getBudget(teamInstanceId: string): Promise<BudgetSummary | undefined> {
    const { rows } = await this.pool.query<BudgetRow>(
      `
        select team_instance_id, monthly_limit_cny, monthly_spent_cny, task_limit_cny, pause_on_limit
        from team_budgets
        where team_instance_id = $1
        limit 1
      `,
      [teamInstanceId]
    );

    return rows[0] ? mapBudgetRow(rows[0]) : undefined;
  }

  async upsertBudget(teamInstanceId: string, budget: BudgetSummary): Promise<void> {
    await this.pool.query(
      `
        insert into team_budgets (
          team_instance_id,
          monthly_limit_cny,
          monthly_spent_cny,
          task_limit_cny,
          pause_on_limit
        )
        values ($1, $2, $3, $4, $5)
        on conflict (team_instance_id) do update
        set monthly_limit_cny = excluded.monthly_limit_cny,
            monthly_spent_cny = excluded.monthly_spent_cny,
            task_limit_cny = excluded.task_limit_cny,
            pause_on_limit = excluded.pause_on_limit
      `,
      [
        teamInstanceId,
        budget.monthlyLimitCny,
        budget.monthlySpentCny,
        budget.taskLimitCny,
        budget.pauseOnLimit
      ]
    );
  }

  async listTaskRecords(): Promise<InternalTaskRecord[]> {
    const taskRows = await this.fetchTaskRows();
    return this.hydrateTaskRecords(taskRows);
  }

  async getTaskRecord(taskId: string): Promise<InternalTaskRecord | undefined> {
    const { rows } = await this.pool.query<TaskRow>(
      `
        select
          id,
          team_instance_id,
          title,
          business_goal,
          deliverable_type,
          constraints,
          status,
          current_role_id,
          created_at::text,
          updated_at::text,
          step_outputs,
          pending_deliverable_draft
        from tasks
        where id = $1
        limit 1
      `,
      [taskId]
    );

    if (rows.length === 0) {
      return undefined;
    }

    const records = await this.hydrateTaskRecords(rows);
    return records[0];
  }

  async upsertTaskRecord(record: InternalTaskRecord): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      await client.query(
        `
          insert into tasks (
            id,
            team_instance_id,
            title,
            business_goal,
            deliverable_type,
            constraints,
            status,
            current_role_id,
            created_at,
            updated_at,
            step_outputs,
            pending_deliverable_draft
          )
          values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz, $10::timestamptz, $11::jsonb, $12::jsonb)
          on conflict (id) do update
          set team_instance_id = excluded.team_instance_id,
              title = excluded.title,
              business_goal = excluded.business_goal,
              deliverable_type = excluded.deliverable_type,
              constraints = excluded.constraints,
              status = excluded.status,
              current_role_id = excluded.current_role_id,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              step_outputs = excluded.step_outputs,
              pending_deliverable_draft = excluded.pending_deliverable_draft
        `,
        [
          record.task.id,
          record.task.teamInstanceId,
          record.task.title,
          record.task.businessGoal,
          record.task.deliverableType,
          JSON.stringify(record.task.constraints ?? {}),
          record.task.status,
          record.task.currentRoleId ?? null,
          record.task.createdAt,
          record.task.updatedAt,
          JSON.stringify(record.stepOutputs ?? {}),
          record.pendingDeliverableDraft ? JSON.stringify(record.pendingDeliverableDraft) : null
        ]
      );

      await client.query("delete from task_steps where task_id = $1", [record.task.id]);
      await client.query("delete from approvals where task_id = $1", [record.task.id]);
      await client.query("delete from deliverables where task_id = $1", [record.task.id]);

      for (const step of record.steps) {
        await client.query(
          `
            insert into task_steps (id, task_id, role_id, label, status)
            values ($1, $2, $3, $4, $5)
          `,
          [step.id, step.taskId, step.roleId, step.label, step.status]
        );
      }

      for (const approval of record.approvals) {
        await client.query(
          `
            insert into approvals (id, task_id, team_instance_id, title, stage, summary, status, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
          `,
          [
            approval.id,
            approval.taskId,
            approval.teamInstanceId,
            approval.title,
            approval.stage,
            approval.summary,
            approval.status,
            approval.createdAt
          ]
        );
      }

      for (const deliverable of record.deliverables) {
        await client.query(
          `
            insert into deliverables (id, task_id, title, type, summary, content, created_at)
            values ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
          `,
          [
            deliverable.id,
            deliverable.taskId,
            deliverable.title,
            deliverable.type,
            deliverable.summary,
            deliverable.content ? JSON.stringify(deliverable.content) : null,
            deliverable.createdAt
          ]
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAuditLogs(): Promise<AuditLogEntry[]> {
    const { rows } = await this.pool.query<AuditRow>(
      `
        select id, entity_type, entity_id, action, actor_label, created_at::text
        from audit_logs
        order by created_at desc
      `
    );

    return rows.map(mapAuditRow);
  }

  async appendAuditLog(entry: AuditLogEntry): Promise<void> {
    await this.pool.query(
      `
        insert into audit_logs (id, entity_type, entity_id, action, actor_label, created_at)
        values ($1, $2, $3, $4, $5, $6::timestamptz)
        on conflict (id) do nothing
      `,
      [entry.id, entry.entityType, entry.entityId, entry.action, entry.actorLabel, entry.createdAt]
    );
  }

  private async scalarCount(tableName: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(`select count(*)::text as count from ${tableName}`);
    return Number(rows[0]?.count ?? 0);
  }

  private async fetchTaskRows(): Promise<TaskRow[]> {
    const { rows } = await this.pool.query<TaskRow>(
      `
        select
          id,
          team_instance_id,
          title,
          business_goal,
          deliverable_type,
          constraints,
          status,
          current_role_id,
          created_at::text,
          updated_at::text,
          step_outputs,
          pending_deliverable_draft
        from tasks
        order by updated_at desc
      `
    );

    return rows;
  }

  private async hydrateTaskRecords(taskRows: TaskRow[]): Promise<InternalTaskRecord[]> {
    const taskIds = taskRows.map((row) => row.id);

    if (taskIds.length === 0) {
      return [];
    }

    const [stepResult, approvalResult, deliverableResult, auditResult] = await Promise.all([
      this.pool.query<StepRow>(
        `
          select id, task_id, role_id, label, status
          from task_steps
          where task_id = any($1::text[])
          order by id asc
        `,
        [taskIds]
      ),
      this.pool.query<ApprovalRow>(
        `
          select id, task_id, team_instance_id, title, stage, summary, status, created_at::text
          from approvals
          where task_id = any($1::text[])
          order by created_at desc
        `,
        [taskIds]
      ),
      this.pool.query<DeliverableRow>(
        `
          select id, task_id, title, type, summary, content, created_at::text
          from deliverables
          where task_id = any($1::text[])
          order by created_at desc
        `,
        [taskIds]
      ),
      this.pool.query<AuditRow>(
        `
          select id, entity_type, entity_id, action, actor_label, created_at::text
          from audit_logs
          where entity_type = 'task' and entity_id = any($1::text[])
          order by created_at desc
        `,
        [taskIds]
      )
    ]);

    const auditLogs = auditResult.rows.map(mapAuditRow);

    return taskRows.map((taskRow) =>
      mapTaskRecord(
        taskRow,
        stepResult.rows.filter((row) => row.task_id === taskRow.id),
        approvalResult.rows.filter((row) => row.task_id === taskRow.id),
        deliverableResult.rows.filter((row) => row.task_id === taskRow.id),
        auditLogs
      )
    );
  }
}

export function createPersistenceFromEnv(
  env: PersistenceEnv = process.env
): AppPersistence {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return new MemoryPersistence("DATABASE_URL is not set, using in-memory persistence.");
  }

  const pool = new Pool({
    connectionString: databaseUrl
  });

  return new PostgresPersistence(pool);
}

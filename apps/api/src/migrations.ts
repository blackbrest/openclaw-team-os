import type { Pool } from "pg";

type MigrationDefinition = {
  id: string;
  name: string;
  up: string;
};

type MigrationRow = {
  id: string;
};

export type MigrationRunResult = {
  applied: MigrationDefinition[];
  pending: MigrationDefinition[];
  alreadyApplied: MigrationDefinition[];
};

const migrations: MigrationDefinition[] = [
  {
    id: "0001_initial_schema",
    name: "Initial Team OS schema",
    up: `
      create table if not exists team_instances (
        id text primary key,
        organization_id text not null,
        template_id text not null,
        name text not null,
        status text not null
      );

      create table if not exists team_budgets (
        team_instance_id text primary key references team_instances(id) on delete cascade,
        monthly_limit_cny integer not null,
        monthly_spent_cny integer not null,
        task_limit_cny integer not null,
        pause_on_limit boolean not null
      );

      create table if not exists tasks (
        id text primary key,
        team_instance_id text not null references team_instances(id) on delete cascade,
        title text not null,
        business_goal text not null,
        deliverable_type text not null,
        status text not null,
        current_role_id text,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        step_outputs jsonb not null default '{}'::jsonb,
        pending_deliverable_draft jsonb
      );

      create table if not exists task_steps (
        id text primary key,
        task_id text not null references tasks(id) on delete cascade,
        role_id text not null,
        label text not null,
        status text not null
      );

      create table if not exists approvals (
        id text primary key,
        task_id text not null references tasks(id) on delete cascade,
        team_instance_id text not null,
        title text not null,
        stage text not null,
        summary text not null,
        status text not null,
        created_at timestamptz not null
      );

      create table if not exists deliverables (
        id text primary key,
        task_id text not null references tasks(id) on delete cascade,
        title text not null,
        type text not null,
        summary text not null,
        created_at timestamptz not null
      );

      create table if not exists audit_logs (
        id text primary key,
        entity_type text not null,
        entity_id text not null,
        action text not null,
        actor_label text not null,
        created_at timestamptz not null
      );

      create index if not exists idx_tasks_team_instance_id on tasks(team_instance_id);
      create index if not exists idx_task_steps_task_id on task_steps(task_id);
      create index if not exists idx_approvals_task_id on approvals(task_id);
      create index if not exists idx_approvals_team_instance_id on approvals(team_instance_id);
      create index if not exists idx_deliverables_task_id on deliverables(task_id);
      create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
    `
  },
  {
    id: "0002_identity_and_sessions",
    name: "Organizations, members, invitations, and sessions",
    up: `
      create table if not exists organizations (
        id text primary key,
        name text not null,
        created_at timestamptz not null
      );

      create table if not exists organization_members (
        id text primary key,
        user_id text not null,
        organization_id text not null references organizations(id) on delete cascade,
        name text not null,
        email text not null,
        role text not null,
        status text not null,
        created_at timestamptz not null
      );

      create table if not exists organization_invitations (
        id text primary key,
        organization_id text not null references organizations(id) on delete cascade,
        email text not null,
        role text not null,
        status text not null,
        invited_by_name text not null,
        created_at timestamptz not null,
        accepted_at timestamptz
      );

      create table if not exists user_sessions (
        token text primary key,
        member_id text not null references organization_members(id) on delete cascade,
        organization_id text not null references organizations(id) on delete cascade,
        created_at timestamptz not null,
        expires_at timestamptz
      );

      create unique index if not exists idx_org_members_unique_email
        on organization_members(organization_id, email);
      create index if not exists idx_org_members_org_id
        on organization_members(organization_id);
      create index if not exists idx_org_invitations_org_id
        on organization_invitations(organization_id);
      create index if not exists idx_org_invitations_email
        on organization_invitations(email);
      create index if not exists idx_user_sessions_org_id
        on user_sessions(organization_id);
      create index if not exists idx_user_sessions_member_id
        on user_sessions(member_id);
    `
  },
  {
    id: "0003_task_constraints_and_deliverable_content",
    name: "Task constraints and structured deliverable content",
    up: `
      alter table tasks
        add column if not exists constraints jsonb not null default '{}'::jsonb;

      alter table deliverables
        add column if not exists content jsonb;
    `
  }
];

async function ensureMigrationTable(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      name text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function listAppliedMigrationIds(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<MigrationRow>(
    "select id from schema_migrations order by id asc"
  );

  return new Set(rows.map((row) => row.id));
}

export async function runPendingMigrations(pool: Pool): Promise<MigrationRunResult> {
  await ensureMigrationTable(pool);

  const appliedIds = await listAppliedMigrationIds(pool);
  const alreadyApplied = migrations.filter((migration) => appliedIds.has(migration.id));
  const pending = migrations.filter((migration) => !appliedIds.has(migration.id));
  const applied: MigrationDefinition[] = [];

  if (pending.length === 0) {
    return {
      applied,
      pending,
      alreadyApplied
    };
  }

  const client = await pool.connect();

  try {
    for (const migration of pending) {
      await client.query("begin");
      await client.query(migration.up);
      await client.query(
        `
          insert into schema_migrations (id, name, applied_at)
          values ($1, $2, now())
        `,
        [migration.id, migration.name]
      );
      await client.query("commit");
      applied.push(migration);
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return {
    applied,
    pending: [],
    alreadyApplied
  };
}

export function getDefinedMigrations(): MigrationDefinition[] {
  return [...migrations];
}

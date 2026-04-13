import type {
  DeliverableContent,
  DomainEvent,
  RuntimeMode,
  RuntimeRoleId,
  RuntimeStatusPayload
} from "@openclaw-team-os/domain";

export interface RuntimeExecutionRequest {
  executionId: string;
  organizationId: string;
  teamInstanceId: string;
  taskId: string;
  title?: string;
  businessGoal: string;
  deliverableType?: string;
  constraints?: Record<string, unknown>;
  rolePlan: Array<{
    roleId: RuntimeRoleId;
    stepId: string;
    label: string;
  }>;
}

export interface RuntimeDeliverableDraft {
  title: string;
  type: string;
  summary: string;
  content?: DeliverableContent;
}

export interface RuntimeStepOutput {
  summary: string;
  previewLines?: string[];
  raw?: Record<string, unknown>;
}

export interface RuntimeExecutionStartedEvent
  extends DomainEvent<{
    taskId: string;
    executionId: string;
    adapterMode: RuntimeMode;
  }> {
  type: "runtime.execution_started";
}

export interface RuntimeStepStartedEvent
  extends DomainEvent<{
    taskId: string;
    stepId: string;
    roleId: RuntimeRoleId;
    label: string;
  }> {
  type: "runtime.step_started";
}

export interface RuntimeStepCompletedEvent
  extends DomainEvent<{
    taskId: string;
    stepId: string;
    roleId: RuntimeRoleId;
    label: string;
    output?: RuntimeStepOutput;
  }> {
  type: "runtime.step_completed";
}

export interface RuntimeApprovalRequiredEvent
  extends DomainEvent<{
    taskId: string;
    stepId: string;
    roleId: RuntimeRoleId;
    label: string;
    approvalTitle: string;
    approvalSummary: string;
    previewLines?: string[];
    deliverableDraft: RuntimeDeliverableDraft;
  }> {
  type: "runtime.approval_required";
}

export interface RuntimeExecutionFailedEvent
  extends DomainEvent<{
    taskId: string;
    executionId: string;
    message: string;
  }> {
  type: "runtime.execution_failed";
}

export type RuntimeExecutionEvent =
  | RuntimeExecutionStartedEvent
  | RuntimeStepStartedEvent
  | RuntimeStepCompletedEvent
  | RuntimeApprovalRequiredEvent
  | RuntimeExecutionFailedEvent;

export interface RuntimeAdapter {
  readonly status: RuntimeStatusPayload;
  execute(
    request: RuntimeExecutionRequest,
    onEvent: (event: RuntimeExecutionEvent) => void
  ): Promise<void>;
}

export interface RuntimeAdapterFactoryResult {
  adapter: RuntimeAdapter;
  status: RuntimeStatusPayload;
}

export interface OpenClawAdapterEnv {
  OPENCLAW_RUNTIME_MODE?: string;
  OPENCLAW_GATEWAY_URL?: string;
  OPENCLAW_GATEWAY_TOKEN?: string;
  OPENCLAW_GATEWAY_SESSION_KEY?: string;
  OPENCLAW_LLM_TASK_PROVIDER?: string;
  OPENCLAW_LLM_TASK_MODEL?: string;
  OPENCLAW_LLM_TASK_THINKING?: string;
  OPENCLAW_LLM_TASK_MAX_TOKENS?: string;
}

interface OpenClawToolsInvokeEnvelope {
  ok?: boolean;
  result?: {
    details?: {
      json?: unknown;
    };
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
  error?: {
    message?: string;
    code?: string;
  };
}

interface LlmTaskResearchResult {
  researchSummary: string;
  audiencePains: string[];
  sourceIdeas: string[];
  insights: string[];
}

interface LlmTaskPlanResult {
  strategySummary: string;
  coreAngle: string;
  outline: string[];
  messagePillars: string[];
}

interface LlmTaskWriterResult {
  deliverableSummary: string;
  approvalSummary: string;
  drafts: Array<{
    title: string;
    hook: string;
    body: string;
  }>;
  publishNotes: string[];
}

const DEFAULT_SESSION_KEY = "main";
const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_THINKING = "low";
const DEFAULT_MAX_TOKENS = 1200;

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["researchSummary", "audiencePains", "sourceIdeas", "insights"],
  properties: {
    researchSummary: { type: "string" },
    audiencePains: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5
    },
    sourceIdeas: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5
    },
    insights: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 6
    }
  }
} as const;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["strategySummary", "coreAngle", "outline", "messagePillars"],
  properties: {
    strategySummary: { type: "string" },
    coreAngle: { type: "string" },
    outline: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 8
    },
    messagePillars: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5
    }
  }
} as const;

const WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["deliverableSummary", "approvalSummary", "drafts", "publishNotes"],
  properties: {
    deliverableSummary: { type: "string" },
    approvalSummary: { type: "string" },
    drafts: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "hook", "body"],
        properties: {
          title: { type: "string" },
          hook: { type: "string" },
          body: { type: "string" }
        }
      }
    },
    publishNotes: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 6
    }
  }
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createMockStatus(note?: string): RuntimeStatusPayload {
  const status: RuntimeStatusPayload = {
    mode: "mock",
    label: "Mock runtime adapter",
    ready: true
  };

  if (note) {
    status.note = note;
  }

  return status;
}

export function createRuntimeAdapterFromEnv(
  env: OpenClawAdapterEnv = process.env
): RuntimeAdapterFactoryResult {
  const requestedMode = env.OPENCLAW_RUNTIME_MODE === "openclaw-llm-task" ? "openclaw-llm-task" : "mock";

  if (requestedMode === "mock") {
    const adapter = new MockRuntimeAdapter();
    return {
      adapter,
      status: adapter.status
    };
  }

  const gatewayUrl = env.OPENCLAW_GATEWAY_URL?.trim();
  const gatewayToken = env.OPENCLAW_GATEWAY_TOKEN?.trim();

  if (!gatewayUrl || !gatewayToken) {
    const adapter = new MockRuntimeAdapter(
      "OPENCLAW_RUNTIME_MODE=openclaw-llm-task was requested, but gateway URL or token is missing. Falling back to mock runtime."
    );

    return {
      adapter,
      status: adapter.status
    };
  }

  const adapter = new OpenClawLlmTaskRuntimeAdapter({
    gatewayUrl,
    gatewayToken,
    sessionKey: env.OPENCLAW_GATEWAY_SESSION_KEY?.trim() || DEFAULT_SESSION_KEY,
    provider: env.OPENCLAW_LLM_TASK_PROVIDER?.trim() || DEFAULT_PROVIDER,
    model: env.OPENCLAW_LLM_TASK_MODEL?.trim() || DEFAULT_MODEL,
    thinking: env.OPENCLAW_LLM_TASK_THINKING?.trim() || DEFAULT_THINKING,
    maxTokens: Number(env.OPENCLAW_LLM_TASK_MAX_TOKENS ?? DEFAULT_MAX_TOKENS)
  });

  return {
    adapter,
    status: adapter.status
  };
}

export class MockRuntimeAdapter implements RuntimeAdapter {
  readonly status: RuntimeStatusPayload;

  constructor(note?: string) {
    this.status = createMockStatus(note);
  }

  async execute(
    request: RuntimeExecutionRequest,
    onEvent: (event: RuntimeExecutionEvent) => void
  ): Promise<void> {
    onEvent({
      type: "runtime.execution_started",
      organizationId: request.organizationId,
      occurredAt: nowIso(),
      data: {
        taskId: request.taskId,
        executionId: request.executionId,
        adapterMode: "mock"
      }
    });

    for (const step of request.rolePlan.slice(0, 3)) {
      onEvent({
        type: "runtime.step_started",
        organizationId: request.organizationId,
        occurredAt: nowIso(),
        data: {
          taskId: request.taskId,
          stepId: step.stepId,
          roleId: step.roleId,
          label: step.label
        }
      });

      await wait(500);

      onEvent({
        type: "runtime.step_completed",
        organizationId: request.organizationId,
        occurredAt: nowIso(),
        data: {
          taskId: request.taskId,
          stepId: step.stepId,
          roleId: step.roleId,
          label: step.label,
          output: {
            summary: `${step.label} 已完成，当前仍使用 mock runtime 进行演示。`
          }
        }
      });
    }

    const approvalStep = request.rolePlan[3];

    if (approvalStep) {
      onEvent({
        type: "runtime.approval_required",
        organizationId: request.organizationId,
        occurredAt: nowIso(),
        data: {
          taskId: request.taskId,
          stepId: approvalStep.stepId,
          roleId: approvalStep.roleId,
          label: approvalStep.label,
          approvalTitle: `审批 ${request.title ?? "任务草稿"}`,
          approvalSummary: "初稿已完成，需要确认品牌语气、主张和发布角度。",
          deliverableDraft: {
            title: `${request.title ?? "任务"} 交付包`,
            type: request.deliverableType ?? "social_content_pack",
            summary: "Mock runtime 已生成可直接使用的内容草稿、审核备注与发布建议。"
          },
          previewLines: ["Mock draft 1", "Mock draft 2", "Mock draft 3"]
        }
      });
    }
  }
}

interface OpenClawLlmTaskAdapterOptions {
  gatewayUrl: string;
  gatewayToken: string;
  sessionKey: string;
  provider: string;
  model: string;
  thinking: string;
  maxTokens: number;
}

class OpenClawToolsInvokeClient {
  constructor(
    private readonly gatewayUrl: string,
    private readonly gatewayToken: string,
    private readonly sessionKey: string
  ) {}

  async invokeLlmTask<T>(
    prompt: string,
    input: Record<string, unknown>,
    schema: Record<string, unknown>,
    options: Pick<OpenClawLlmTaskAdapterOptions, "provider" | "model" | "thinking" | "maxTokens">
  ): Promise<T> {
    const requestBody: Record<string, unknown> = {
      tool: "llm-task",
      action: "json",
      sessionKey: this.sessionKey,
      args: {
        provider: options.provider,
        model: options.model,
        thinking: options.thinking,
        maxTokens: options.maxTokens,
        prompt,
        input,
        schema
      }
    };

    const response = await fetch(this.buildToolsInvokeUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.gatewayToken}`
      },
      body: JSON.stringify(requestBody)
    });

    const payload = (await response.json()) as OpenClawToolsInvokeEnvelope;

    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.error?.message ??
          `OpenClaw tools/invoke failed with status ${response.status}.`
      );
    }

    const detailsJson = payload.result?.details?.json;

    if (detailsJson !== undefined) {
      return detailsJson as T;
    }

    const firstText = payload.result?.content?.find((item) => item.type === "text")?.text;

    if (firstText) {
      return JSON.parse(firstText) as T;
    }

    throw new Error("OpenClaw llm-task did not return structured JSON.");
  }

  private buildToolsInvokeUrl(): string {
    return `${this.gatewayUrl.replace(/\/$/, "")}/tools/invoke`;
  }
}

export class OpenClawLlmTaskRuntimeAdapter implements RuntimeAdapter {
  readonly status: RuntimeStatusPayload;
  private readonly client: OpenClawToolsInvokeClient;

  constructor(private readonly options: OpenClawLlmTaskAdapterOptions) {
    this.client = new OpenClawToolsInvokeClient(
      options.gatewayUrl,
      options.gatewayToken,
      options.sessionKey
    );

    const status: RuntimeStatusPayload = {
      mode: "openclaw-llm-task",
      label: "OpenClaw Gateway + llm-task",
      ready: true
    };

    if (options.gatewayUrl) {
      status.gatewayUrl = options.gatewayUrl;
    }

    if (options.sessionKey) {
      status.sessionKey = options.sessionKey;
    }

    if (options.provider) {
      status.provider = options.provider;
    }

    if (options.model) {
      status.model = options.model;
    }

    this.status = status;
  }

  async execute(
    request: RuntimeExecutionRequest,
    onEvent: (event: RuntimeExecutionEvent) => void
  ): Promise<void> {
    try {
      onEvent({
        type: "runtime.execution_started",
        organizationId: request.organizationId,
        occurredAt: nowIso(),
        data: {
          taskId: request.taskId,
          executionId: request.executionId,
          adapterMode: "openclaw-llm-task"
        }
      });

      const researcherStep = request.rolePlan.find((step) => step.roleId === "researcher");
      const plannerStep = request.rolePlan.find((step) => step.roleId === "planner");
      const writerStep = request.rolePlan.find((step) => step.roleId === "writer");
      const reviewerStep = request.rolePlan.find((step) => step.roleId === "reviewer");

      if (!researcherStep || !plannerStep || !writerStep || !reviewerStep) {
        throw new Error("Role plan is missing one of researcher/planner/writer/reviewer steps.");
      }

      const research = await this.runStructuredStep<LlmTaskResearchResult>({
        request,
        step: researcherStep,
        schema: RESEARCH_SCHEMA as Record<string, unknown>,
        prompt:
          "You are the Researcher in an AI growth and content operations team. Return concise market research that helps a Planner and Writer produce high-signal social content. Stay practical and avoid filler.",
        input: {
          title: request.title ?? "Untitled task",
          businessGoal: request.businessGoal,
          deliverableType: request.deliverableType ?? "social_content_pack",
          constraints: request.constraints ?? {}
        },
        onEvent
      });

      const plan = await this.runStructuredStep<LlmTaskPlanResult>({
        request,
        step: plannerStep,
        schema: PLAN_SCHEMA as Record<string, unknown>,
        prompt:
          "You are the Planner in an AI growth and content operations team. Turn the research into a clear content angle, message pillars, and a concrete outline the Writer can execute immediately.",
        input: {
          title: request.title ?? "Untitled task",
          businessGoal: request.businessGoal,
          constraints: request.constraints ?? {},
          research
        },
        onEvent
      });

      const writer = await this.runStructuredStep<LlmTaskWriterResult>({
        request,
        step: writerStep,
        schema: WRITER_SCHEMA as Record<string, unknown>,
        prompt:
          "You are the Writer in an AI growth and content operations team. Produce polished but editable draft assets. Keep output strategic, brand-safe, and easy for a human approver to review.",
        input: {
          title: request.title ?? "Untitled task",
          businessGoal: request.businessGoal,
          deliverableType: request.deliverableType ?? "social_content_pack",
          constraints: request.constraints ?? {},
          research,
          plan
        },
        onEvent
      });

      onEvent({
        type: "runtime.approval_required",
        organizationId: request.organizationId,
        occurredAt: nowIso(),
        data: {
          taskId: request.taskId,
          stepId: reviewerStep.stepId,
          roleId: reviewerStep.roleId,
          label: reviewerStep.label,
          approvalTitle: `审批 ${request.title ?? "任务草稿"}`,
          approvalSummary: writer.approvalSummary,
          deliverableDraft: {
            title: `${request.title ?? "任务"} 交付包`,
            type: request.deliverableType ?? "social_content_pack",
            summary: writer.deliverableSummary
          },
          previewLines: writer.drafts.map((draft) => `${draft.title}: ${draft.hook}`)
        }
      });
    } catch (error) {
      onEvent({
        type: "runtime.execution_failed",
        organizationId: request.organizationId,
        occurredAt: nowIso(),
        data: {
          taskId: request.taskId,
          executionId: request.executionId,
          message: error instanceof Error ? error.message : "Unknown runtime execution failure."
        }
      });
    }
  }

  private async runStructuredStep<T>(params: {
    request: RuntimeExecutionRequest;
    step: RuntimeExecutionRequest["rolePlan"][number];
    prompt: string;
    input: Record<string, unknown>;
    schema: Record<string, unknown>;
    onEvent: (event: RuntimeExecutionEvent) => void;
  }): Promise<T> {
    params.onEvent({
      type: "runtime.step_started",
      organizationId: params.request.organizationId,
      occurredAt: nowIso(),
      data: {
        taskId: params.request.taskId,
        stepId: params.step.stepId,
        roleId: params.step.roleId,
        label: params.step.label
      }
    });

    const result = await this.client.invokeLlmTask<T>(params.prompt, params.input, params.schema, {
      provider: this.options.provider,
      model: this.options.model,
      thinking: this.options.thinking,
      maxTokens: this.options.maxTokens
    });

    const output = this.toRuntimeStepOutput(result);

    params.onEvent({
      type: "runtime.step_completed",
      organizationId: params.request.organizationId,
      occurredAt: nowIso(),
      data: {
        taskId: params.request.taskId,
        stepId: params.step.stepId,
        roleId: params.step.roleId,
        label: params.step.label,
        output
      }
    });

    return result;
  }

  private toRuntimeStepOutput(result: unknown): RuntimeStepOutput {
    const record =
      result && typeof result === "object" ? (result as Record<string, unknown>) : ({} as Record<string, unknown>);
    const summaryCandidates = [
      record.approvalSummary,
      record.deliverableSummary,
      record.strategySummary,
      record.researchSummary
    ];

    const summary = summaryCandidates.find((value) => typeof value === "string");
    const previewLines = this.extractPreviewLines(record);

    const output: RuntimeStepOutput = {
      summary: typeof summary === "string" ? summary : "Structured output generated by OpenClaw llm-task.",
      raw: record
    };

    if (previewLines.length > 0) {
      output.previewLines = previewLines;
    }

    return output;
  }

  private extractPreviewLines(result: Record<string, unknown>): string[] {
    const drafts = Array.isArray(result.drafts) ? result.drafts : [];

    if (drafts.length > 0) {
      return drafts
        .map((draft) => {
          if (draft && typeof draft === "object" && "title" in draft) {
            return String(draft.title);
          }

          return null;
        })
        .filter((value): value is string => Boolean(value));
    }

    const outline = Array.isArray(result.outline) ? result.outline : [];

    if (outline.length > 0) {
      return outline.map((item) => String(item));
    }

    const insights = Array.isArray(result.insights) ? result.insights : [];

    return insights.map((item) => String(item));
  }
}

import { ulid } from "ulid";

import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
  ApprovalItem,
  ApprovalStatus,
  AuditLogEntry,
  BudgetSummary,
  CreateOrganizationInput,
  CreateOrganizationResult,
  CreateVideoGenerationInput,
  CreateInvitationInput,
  CreateTaskInput,
  CreateTeamInstanceInput,
  DashboardPayload,
  Deliverable,
  DeliverableContent,
  DeliverableVideoScene,
  DomainEvent,
  MePayload,
  OrgChartNode,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRecord,
  RuntimeStatusPayload,
  SessionRecord,
  Task,
  TaskDetailPayload,
  TaskStep,
  TaskStatus,
  TeamInstanceSummary,
  TeamTemplateDetail,
  TeamTemplateSummary,
  UpdateTeamInstanceInput,
  VideoGenerationSession
} from "@openclaw-team-os/domain";
import {
  createRuntimeAdapterFromEnv,
  type RuntimeDeliverableDraft,
  type RuntimeExecutionEvent,
  type RuntimeExecutionRequest
} from "@openclaw-team-os/runtime-adapter";

import type { RequestContext } from "./auth.js";
import { createPersistenceFromEnv, type AppPersistence } from "./persistence.js";
import type { InternalTaskRecord, PersistenceSeedBundle } from "./store-types.js";
import { createRemoteVideoProviderFromEnv, type RemoteVideoProvider } from "./video-provider.js";

type Listener = (event: DomainEvent) => void;

type StoredVideoGenerationState = {
  sessions?: Record<string, VideoGenerationSession>;
};

const seededTemplate: TeamTemplateDetail = {
  id: "tpl_growth_team",
  name: "AI 增长与内容运营组",
  tagline: "把研究、策划、写作、审核和分发装进一支 AI 团队。",
  scenarioType: "growth_ops",
  roleCount: 5,
  estimatedCostRange: "¥80 - ¥200 / task",
  estimatedTurnaround: "15 - 40 min",
  official: true,
  description:
    "适合 2-20 人团队快速完成内容增长任务，内建研究、策划、写作、审核与分发协作链路。",
  approvalStages: ["draft_review", "final_publish"],
  budgetDefaults: {
    monthlyLimitCny: 3000,
    taskLimitCny: 200
  },
  roles: [
    {
      id: "researcher",
      title: "研究员",
      summary: "收集竞品、用户洞察与高相关素材。"
    },
    {
      id: "planner",
      title: "内容策划",
      summary: "把研究结果转成选题与结构方案。"
    },
    {
      id: "writer",
      title: "文案写手",
      summary: "生成可直接修改和审批的内容初稿。"
    },
    {
      id: "reviewer",
      title: "审核员",
      summary: "检查风险、事实和品牌一致性。"
    },
    {
      id: "publisher",
      title: "分发助理",
      summary: "在审批完成后准备分发素材包。"
    }
  ],
  sampleDeliverables: ["5 条小红书文案草稿", "选题建议清单", "发布前审核备注"]
};

const defaultTeamId = "team_growth_ops";
const defaultOrgId = "org_openclaw_studio";
const defaultOrgName = "OpenClaw Studio";
const defaultMemberId = "member_wang_liang";
const defaultUserId = "user_wang_liang";
const defaultUserName = "Wang Liang";
const defaultUserEmail = "demo@example.com";
const defaultAdminSessionToken = "demo-org-admin-token";

function nowIso(): string {
  return new Date().toISOString();
}

function createAuditEntry(
  entityType: string,
  entityId: string,
  action: string,
  actorLabel: string
): AuditLogEntry {
  return {
    id: ulid(),
    entityType,
    entityId,
    action,
    actorLabel,
    createdAt: nowIso()
  };
}

function createOrgChart(taskStatus: TaskStatus): OrgChartNode[] {
  return [
    {
      id: "node_manager",
      roleId: "manager",
      title: "Manager",
      summary: "协调任务与岗位节奏。",
      status: taskStatus === "running" ? "running" : "idle"
    },
    {
      id: "node_researcher",
      roleId: "researcher",
      title: "Researcher",
      summary: "收集高信号研究素材。",
      status: taskStatus === "running" ? "running" : "idle"
    },
    {
      id: "node_planner",
      roleId: "planner",
      title: "Planner",
      summary: "生成内容方案和切题结构。",
      status: taskStatus === "running" ? "running" : "idle"
    },
    {
      id: "node_writer",
      roleId: "writer",
      title: "Writer",
      summary: "完成文稿初稿和多版本表达。",
      status: taskStatus === "running" ? "running" : "idle"
    },
    {
      id: "node_reviewer",
      roleId: "reviewer",
      title: "Reviewer",
      summary: "在关键节点触发人工审批。",
      status: taskStatus === "waiting_approval" ? "waiting_approval" : "idle"
    },
    {
      id: "node_publisher",
      roleId: "publisher",
      title: "Publisher",
      summary: "输出可分发素材包。",
      status: "idle"
    }
  ];
}

function readVideoGenerationState(record: InternalTaskRecord): StoredVideoGenerationState {
  const raw = record.stepOutputs.videoGeneration;

  if (raw && typeof raw === "object") {
    return raw as StoredVideoGenerationState;
  }

  return {};
}

function getStoredVideoGenerationSession(
  record: InternalTaskRecord,
  deliverableId?: string
): VideoGenerationSession | undefined {
  const state = readVideoGenerationState(record);
  const sessions = state.sessions ?? {};

  if (deliverableId) {
    return sessions[deliverableId];
  }

  return Object.values(sessions).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function setStoredVideoGenerationSession(
  record: InternalTaskRecord,
  session: VideoGenerationSession
): void {
  const state = readVideoGenerationState(record);
  const sessions = state.sessions ?? {};

  record.stepOutputs.videoGeneration = {
    sessions: {
      ...sessions,
      [session.deliverableId]: session
    }
  } satisfies StoredVideoGenerationState;
}

type ShortDramaTaskMeta = {
  workflowType: "short_drama";
  targetDurationSeconds: number;
  preferredVideoProvider: string;
  unitName: string;
  unitMode: "writer" | "studio";
};

function detectShortDramaMeta(task: Task): ShortDramaTaskMeta | undefined {
  const constraints = task.constraints ?? {};
  const workflowType =
    constraints.workflowType === "short_drama" ||
    constraints.recruitCategoryId === "ai-short-drama" ||
    String(constraints.clientModuleId ?? "").includes("short-drama") ||
    /短剧|分镜|镜头|出片|霸总/u.test(`${task.title}\n${task.businessGoal}`);

  if (!workflowType) {
    return undefined;
  }

  const targetDurationSeconds = resolveShortDramaDuration(task, constraints);
  const preferredVideoProvider =
    typeof constraints.preferredVideoProvider === "string" &&
    constraints.preferredVideoProvider.trim()
      ? constraints.preferredVideoProvider.trim()
      : "Seedance 2.0";
  const unitName =
    typeof constraints.clientUnitName === "string" && constraints.clientUnitName.trim()
      ? constraints.clientUnitName.trim()
      : task.title.replace(/\s*任务$/, "") || "AI 短剧制作单位";
  const unitMode =
    constraints.shortDramaUnitMode === "studio" ||
    String(constraints.clientModuleId ?? "").includes("studio-team")
      ? "studio"
      : "writer";

  return {
    workflowType: "short_drama",
    targetDurationSeconds,
    preferredVideoProvider,
    unitName,
    unitMode
  };
}

function resolveShortDramaDuration(task: Task, constraints: Record<string, unknown>): number {
  const fromConstraint =
    typeof constraints.targetDurationSeconds === "number"
      ? constraints.targetDurationSeconds
      : Number.NaN;
  if (Number.isFinite(fromConstraint) && fromConstraint > 0) {
    return Math.max(15, Math.min(90, Math.round(fromConstraint)));
  }

  const text = `${task.title}\n${task.businessGoal}`;
  const match = text.match(/(\d+)\s*(?:秒|s|sec|seconds?)/i);

  if (match) {
    return Math.max(15, Math.min(90, Number(match[1])));
  }

  return 30;
}

function buildShortDramaDeliverableDraft(task: Task): RuntimeDeliverableDraft {
  const meta = detectShortDramaMeta(task);

  if (!meta) {
    return {
      title: `${task.title} 交付包`,
      type: task.deliverableType,
      summary: "已生成可直接使用的内容草稿、审核备注与发布建议。"
    };
  }

  const packageContent = buildShortDramaContent(task, meta);

  return {
    title: `${meta.targetDurationSeconds} 秒短剧出片包`,
    type: task.deliverableType || "short_drama_video_pack",
    summary: buildShortDramaSummary(packageContent),
    content: packageContent
  };
}

function buildShortDramaSummary(content: DeliverableContent): string {
  const hook = content.sections.find((section) => section.id === "hook")?.body;
  const beat = content.sections.find((section) => section.id === "beats")?.lines?.[0];
  const shotCount = content.videoHandoff?.scenes.length ?? 0;
  const duration = content.videoHandoff?.durationSeconds ?? 30;

  return [
    `${content.headline ?? "短剧交付包"}已准备完成。`,
    hook ? `剧情钩子：${hook}` : null,
    beat ? `首幕节奏：${beat}` : null,
    `当前包含 ${shotCount} 个镜头提示词，可继续接力到 ${content.videoHandoff?.provider ?? "视频生成器"}。`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildShortDramaApprovalSummary(task: Task): string {
  const content = buildShortDramaDeliverableDraft(task).content;
  const hook = content?.sections.find((section) => section.id === "hook")?.body;
  const ending = content?.sections.find((section) => section.id === "beats")?.lines?.[2];
  const provider = content?.videoHandoff?.provider ?? "视频生成器";

  return [
    `已拆出 ${content?.videoHandoff?.durationSeconds ?? 30} 秒短剧脚本、分镜和 ${provider} 接力提示词。`,
    hook ? `当前钩子：${hook}` : null,
    ending ? `结尾动作：${ending}` : null,
    "请重点确认人设关系、台词力度和最后反转是否足够抓人。"
  ]
    .filter(Boolean)
    .join(" ");
}

function buildShortDramaContent(task: Task, meta: ShortDramaTaskMeta): DeliverableContent {
  const concept = buildDramaConcept(task.businessGoal);
  const sceneDurations = allocateSceneDurations(meta.targetDurationSeconds);
  const scenes = buildDramaScenes(concept, sceneDurations);
  const visualStyle = "竖屏都市豪门风，高对比冷白商务灯，近景情绪特写，节奏快，镜头切换利落";
  const masterPrompt = [
    `${meta.targetDurationSeconds} 秒中文竖屏短剧，9:16，${visualStyle}。`,
    `题材：${concept.themeLabel}。`,
    `主角：${concept.heroineName}、${concept.heroName}。`,
    `剧情核心：${concept.hook}.`,
    ...scenes.map(
      (scene, index) =>
        `镜头 ${index + 1}（${scene.durationSeconds}s）：${scene.prompt}`
    )
  ].join(" ");
  const characterLines = [
    `女主｜${concept.heroineName}｜${concept.heroineProfile}`,
    `男主 / 对手｜${concept.heroName}｜${concept.heroProfile}`,
    ...concept.supportingCast.map((cast) => `${cast.name}｜${cast.role}｜${cast.function}`)
  ];
  const handoffLines =
    meta.unitMode === "studio"
      ? [
          `当前由 ${meta.unitName} 负责先锁定人物设定，再把分镜与镜头包装成可直接出片的结构。`,
          "先检查角色一致性、服装和场景气质，再提交视频生成。",
          "如果对白张力不够，应回退给编导线先重写，而不是硬做视频。"
        ]
      : [
          `当前由 ${meta.unitName} 负责剧情钩子、人物关系、对白与分镜节奏。`,
          "本轮结果通过后，应交给 AI 短剧制作团队锁定人物与视觉一致性。",
          "分镜必须能直接支撑后续视频生成，避免只停留在梗概层。"
        ];

  return {
    kind: "short_drama_pack",
    headline: `${meta.targetDurationSeconds} 秒${concept.themeLabel}短剧出片包`,
    sections: [
      {
        id: "hook",
        title: "剧情钩子",
        body: concept.hook
      },
      {
        id: "characters",
        title: "人物定稿",
        lines: characterLines
      },
      {
        id: "beats",
        title: "30 秒三幕结构",
        lines: [
          `起：${concept.openingBeat}`,
          `承：${concept.turnBeat}`,
          `合：${concept.payoffBeat}`
        ]
      },
      {
        id: "dialogue",
        title: "关键对白",
        lines: concept.dialogue
      },
      {
        id: "shots",
        title: "分镜清单",
        lines: scenes.map(
          (scene) => `${scene.title} · ${scene.durationSeconds}s · ${scene.visualGoal}`
        )
      },
      {
        id: "director-note",
        title: "导演提示",
        lines: [
          `当前更适合由 ${meta.unitName} 先锁定剧情节奏，再进入镜头包装。`,
          "前 5 秒必须立刻抛出压迫感或身份错位，保证用户继续看。",
          "最后 3 秒必须给出反转或关系升级，方便后续连续剧集扩写。"
        ]
      },
      {
        id: "pipeline",
        title: "接棒顺序",
        lines: handoffLines
      }
    ],
    nextActions: [
      "先人工确认人物关系、角色设定和反转力度，再继续推进。",
      "确认分镜与人物稳定后，再把下方视频提示词包投喂到视频生成器。",
      "拿到样片后先审人物一致性和尾钩，再决定是否继续整包生成。"
    ],
    videoHandoff: {
      provider: meta.preferredVideoProvider,
      mode: "manual_handoff",
      status: "ready",
      note:
        "当前客户端先输出可直接接力的视频提示词包，便于手动投喂到视频生成器完成首版出片。",
      durationSeconds: meta.targetDurationSeconds,
      aspectRatio: "9:16",
      visualStyle,
      masterPrompt,
      negativePrompt:
        "避免多余人物、避免字幕水印、避免现代搞笑表演、避免低清晰度、避免肢体畸形",
      scenes
    }
  };
}

function buildDramaConcept(goal: string) {
  const normalizedGoal = goal.toLowerCase();

  if (normalizedGoal.includes("霸总") || normalizedGoal.includes("总裁")) {
    return {
      themeLabel: "霸总反转",
      heroineName: "沈知意",
      heroineProfile: "被压着打的秘书，外冷内韧，表面克制但底层很强",
      heroName: "陆承洲",
      heroProfile: "冷面总裁，控制欲强，关键时刻明确站在女主这边",
      supportingCast: [
        {
          name: "项目经理",
          role: "甩锅反派",
          function: "制造公开羞辱，把女主推入最低点"
        },
        {
          name: "关键客户",
          role: "反转触发者",
          function: "只认女主方案，当场掀翻原有权力关系"
        }
      ],
      hook: "被当众羞辱的秘书正准备辞职，冷面霸总却在电梯里突然拉住她，说出一句“今晚，你跟我走。”",
      openingBeat: "女主在会议室被项目经理甩锅，情绪压到最低点。",
      turnBeat: "男主在众人面前维持冷酷，转身却替女主挡下最大风险，并把她带去见真正客户。",
      payoffBeat: "客户开口只认女主的方案，男主低声说“你不是替身，你是我的底牌。”",
      dialogue: [
        "项目经理：这锅你自己背，别拖团队下水。",
        "沈知意：方案是我做的，锅也该由真正拍板的人背。",
        "陆承洲：跟我走，今晚只谈结果。",
        "客户：我只看她的方案，换别人我就不签。"
      ]
    };
  }

  return {
    themeLabel: "职场反转",
    heroineName: "林夏",
    heroineProfile: "被边缘化的策划，表面平静，内心一直在找反击机会",
    heroName: "周既白",
    heroProfile: "关键掌权人，出手克制但精准，改变全场节奏",
    supportingCast: [
      {
        name: "同事",
        role: "压制者",
        function: "不断否定主角，制造强烈压迫氛围"
      },
      {
        name: "客户",
        role: "真相揭示者",
        function: "临场改口，把主角重新推回舞台中心"
      }
    ],
    hook: "被边缘化的策划刚准备离场，最难搞的客户却点名要她留下。",
    openingBeat: "主角在公开场合被否定，离开前只想体面收场。",
    turnBeat: "关键人物临场改口，把所有人节奏打乱，也把主角重新推回中心。",
    payoffBeat: "主角用一句反击拿回主动权，顺手埋下下一集冲突。",
    dialogue: [
      "同事：这个案子轮不到你说话。",
      "林夏：那就等结果出来以后再说。",
      "周既白：让她继续讲，今天的方案只听她的。",
      "客户：能签这单的人，从来不是你。"
    ]
  };
}

function allocateSceneDurations(totalSeconds: number): number[] {
  const base = [4, 4, 5, 5, 5, 7];

  if (totalSeconds === 30) {
    return base;
  }

  const ratio = totalSeconds / 30;
  const scaled = base.map((value) => Math.max(2, Math.round(value * ratio)));
  const diff = totalSeconds - scaled.reduce((sum, value) => sum + value, 0);
  const lastIndex = scaled.length - 1;
  if (lastIndex >= 0) {
    scaled[lastIndex] = (scaled[lastIndex] ?? 0) + diff;
  }

  return scaled;
}

function buildDramaScenes(
  concept: ReturnType<typeof buildDramaConcept>,
  sceneDurations: number[]
): DeliverableVideoScene[] {
  const sceneTemplates = [
    {
      id: "scene-hook",
      title: "镜头 1 · 压迫开场",
      visualGoal: "会议室压迫感、女主被当众点名",
      dialogue: "项目经理：这锅你自己背。",
      prompt:
        `都市公司会议室，${concept.heroineName}被众人围视，桌面文件被甩开，情绪紧绷，镜头快速推进脸部特写`
    },
    {
      id: "scene-break",
      title: "镜头 2 · 电梯拦截",
      visualGoal: "男主强势介入，身份反差拉满",
      dialogue: `${concept.heroName}：跟我走。`,
      prompt:
        `冷色调电梯口，${concept.heroName}抬手按住即将关闭的电梯门，侧脸冷峻，${concept.heroineName}回头惊讶`
    },
    {
      id: "scene-tension",
      title: "镜头 3 · 车内交锋",
      visualGoal: "两人冲突升级，台词有刺",
      dialogue: `${concept.heroineName}：你凭什么替我决定？`,
      prompt:
        `商务车后排，雨夜霓虹扫过玻璃，${concept.heroineName}克制怒意，${concept.heroName}沉声逼近，近景对切`
    },
    {
      id: "scene-reveal",
      title: "镜头 4 · 客户反转",
      visualGoal: "第三方抛出反转信息",
      dialogue: "客户：我只认她的方案。",
      prompt:
        `高级会所包间，客户起身直视${concept.heroineName}，众人神情骤变，男主微微侧目，反差强烈`
    },
    {
      id: "scene-payoff",
      title: "镜头 5 · 低声底牌",
      visualGoal: "情感和权力同时收束",
      dialogue: `${concept.heroName}：你不是替身，你是我的底牌。`,
      prompt:
        `走廊尽头，${concept.heroName}贴近低语，${concept.heroineName}怔住，镜头慢推，背景虚化，情绪拉满`
    },
    {
      id: "scene-tag",
      title: "镜头 6 · 尾钩",
      visualGoal: "留出下一集悬念",
      dialogue: `${concept.heroineName}：那你最好别后悔。`,
      prompt:
        `竖屏特写，${concept.heroineName}转身离开前回眸，眼神从委屈变成锋利，画面定格在高跟鞋停步瞬间`
    }
  ];

  return sceneTemplates.map((scene, index) => ({
    ...scene,
    durationSeconds: sceneDurations[index] ?? 4
  }));
}

function toMePayload(member: OrganizationMember, organizationName: string): MePayload {
  return {
    user: {
      id: member.userId,
      name: member.name,
      email: member.email
    },
    currentOrganization: {
      id: member.organizationId,
      name: organizationName,
      role: member.role
    }
  };
}

function buildSeedBundle(runtimeStatus: RuntimeStatusPayload): PersistenceSeedBundle {
  const seededTaskId = ulid();
  const seededApprovalId = ulid();
  const seededAt = nowIso();
  const organization: OrganizationRecord = {
    id: defaultOrgId,
    name: defaultOrgName,
    createdAt: seededAt
  };
  const member: OrganizationMember = {
    id: defaultMemberId,
    userId: defaultUserId,
    organizationId: defaultOrgId,
    name: defaultUserName,
    email: defaultUserEmail,
    role: "org_admin",
    status: "active",
    createdAt: seededAt
  };
  const session: SessionRecord = {
    token: defaultAdminSessionToken,
    memberId: defaultMemberId,
    organizationId: defaultOrgId,
    createdAt: seededAt
  };

  const seededTask: Task = {
    id: seededTaskId,
    teamInstanceId: defaultTeamId,
    title: "Launch Narrative 内容验证",
    businessGoal: "整理一组适合小红书的 Team OS 叙事内容，并等待审批。",
    deliverableType: "social_content_pack",
    status: "waiting_approval",
    currentRoleId: "reviewer",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const seededSteps: TaskStep[] = [
    {
      id: ulid(),
      taskId: seededTaskId,
      roleId: "researcher",
      label: "收集竞品和用户洞察",
      status: "completed"
    },
    {
      id: ulid(),
      taskId: seededTaskId,
      roleId: "planner",
      label: "输出选题与结构方案",
      status: "completed"
    },
    {
      id: ulid(),
      taskId: seededTaskId,
      roleId: "writer",
      label: "撰写首轮文案",
      status: "completed"
    },
    {
      id: ulid(),
      taskId: seededTaskId,
      roleId: "reviewer",
      label: "等待人工审核",
      status: "waiting_approval"
    }
  ];

  const seededApproval: ApprovalItem = {
    id: seededApprovalId,
    taskId: seededTaskId,
    teamInstanceId: defaultTeamId,
    title: "审批首轮文案草稿",
    stage: "draft_review",
    summary: "已生成 5 条可发布草稿，等待你确认品牌语气与重点。",
    status: "pending",
    createdAt: nowIso()
  };

  const seededDeliverable: Deliverable = {
    id: ulid(),
    taskId: seededTaskId,
    title: "选题建议清单",
    type: "strategy_note",
    summary: "沉淀 3 个可复制的增长选题方向。",
    createdAt: nowIso()
  };

  const taskRecord: InternalTaskRecord = {
    task: seededTask,
    steps: seededSteps,
    approvals: [seededApproval],
    deliverables: [seededDeliverable],
    auditTrail: [],
    stepOutputs: {},
    pendingDeliverableDraft: {
      title: "Launch Narrative 内容验证 交付包",
      type: "social_content_pack",
      summary:
        runtimeStatus.mode === "mock"
          ? "当前仍在 mock 持久化与 runtime 流程下运行。"
          : "真实 OpenClaw Gateway 输出将会在审批通过后沉淀为最终交付包。"
    }
  };

  return {
    organizations: [organization],
    members: [member],
    invitations: [],
    sessions: [session],
    teamInstances: [
      {
        team: {
          id: defaultTeamId,
          organizationId: defaultOrgId,
          templateId: seededTemplate.id,
          name: "AI 增长与内容运营组",
          status: "active"
        },
        budget: {
          monthlyLimitCny: 3000,
          monthlySpentCny: 486,
          taskLimitCny: 200,
          pauseOnLimit: true
        }
      }
    ],
    taskRecords: [taskRecord],
    auditLogs: [
      createAuditEntry("team_instance", defaultTeamId, "team.hired", "System"),
      createAuditEntry("task", seededTaskId, "task.created", defaultUserName),
      createAuditEntry("task", seededTaskId, "task.waiting_approval", "AI Reviewer")
    ]
  };
}

export class AppStore {
  private readonly listeners = new Set<Listener>();
  private readonly runtime;
  private readonly runtimeStatus: RuntimeStatusPayload;
  private readonly persistence: AppPersistence;
  private readonly videoProvider: RemoteVideoProvider;

  private readonly teamTemplates = [seededTemplate];

  constructor() {
    const runtimeSetup = createRuntimeAdapterFromEnv();
    this.runtime = runtimeSetup.adapter;
    this.runtimeStatus = runtimeSetup.status;
    this.persistence = createPersistenceFromEnv();
    this.videoProvider = createRemoteVideoProviderFromEnv();
  }

  async init(): Promise<void> {
    await this.persistence.init(buildSeedBundle(this.runtimeStatus));
  }

  async resolveRequestContext(
    fallbackContext: RequestContext,
    sessionToken?: string
  ): Promise<RequestContext | undefined> {
    if (sessionToken) {
      return this.persistence.getSessionContext(sessionToken);
    }

    await this.ensureContextPrincipal(fallbackContext);
    return fallbackContext;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getMe(context: RequestContext): MePayload {
    return context;
  }

  getRuntimeStatus(): RuntimeStatusPayload {
    return this.runtimeStatus;
  }

  listTeamTemplates(): TeamTemplateSummary[] {
    return this.teamTemplates.map(
      ({ description, approvalStages, budgetDefaults, roles, sampleDeliverables, ...summary }) =>
        summary
    );
  }

  getTeamTemplate(templateId: string): TeamTemplateDetail | undefined {
    return this.teamTemplates.find((template) => template.id === templateId);
  }

  async listOrganizationMembers(
    organizationId: string,
    context: RequestContext
  ): Promise<OrganizationMember[] | undefined> {
    if (organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    return this.persistence.listOrganizationMembers(organizationId);
  }

  async listOrganizationInvitations(
    organizationId: string,
    context: RequestContext
  ): Promise<OrganizationInvitation[] | undefined> {
    if (organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    return this.persistence.listOrganizationInvitations(organizationId);
  }

  async createOrganizationInvitation(
    organizationId: string,
    input: CreateInvitationInput,
    context: RequestContext
  ): Promise<OrganizationInvitation | undefined> {
    if (
      organizationId !== context.currentOrganization.id ||
      context.currentOrganization.role !== "org_admin"
    ) {
      return undefined;
    }

    const invitation: OrganizationInvitation = {
      id: ulid(),
      organizationId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      status: "pending",
      invitedByName: context.user.name,
      createdAt: nowIso()
    };

    await this.persistence.upsertInvitation(invitation);
    await this.recordAudit("organization", organizationId, "invitation.created", context.user.name);

    return invitation;
  }

  async createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationResult> {
    const createdAt = nowIso();
    const organization: OrganizationRecord = {
      id: `org_${ulid().toLowerCase()}`,
      name: input.organizationName.trim(),
      createdAt
    };
    const member: OrganizationMember = {
      id: `member_${ulid().toLowerCase()}`,
      userId: `user_${ulid().toLowerCase()}`,
      organizationId: organization.id,
      name: input.adminName.trim(),
      email: input.adminEmail.trim().toLowerCase(),
      role: "org_admin",
      status: "active",
      createdAt
    };
    const session: SessionRecord = {
      token: `sess_${ulid().toLowerCase()}`,
      memberId: member.id,
      organizationId: organization.id,
      createdAt
    };

    await this.persistence.upsertOrganization(organization);
    await this.persistence.upsertOrganizationMember(member);
    await this.persistence.upsertSession(session);
    await this.recordAudit("organization", organization.id, "organization.created", member.name);

    return {
      organization,
      member,
      session,
      me: toMePayload(member, organization.name)
    };
  }

  async acceptInvitation(
    invitationId: string,
    input: AcceptInvitationInput
  ): Promise<AcceptInvitationResult | undefined> {
    const invitation = await this.persistence.getInvitation(invitationId);

    if (!invitation || invitation.status !== "pending") {
      return undefined;
    }

    const organization = await this.persistence.getOrganization(invitation.organizationId);

    if (!organization) {
      return undefined;
    }

    const existingMember = await this.persistence.findOrganizationMemberByEmail(
      invitation.organizationId,
      invitation.email
    );
    const member: OrganizationMember =
      existingMember ?? {
        id: ulid(),
        userId: `user_${ulid().toLowerCase()}`,
        organizationId: invitation.organizationId,
        name: input.name.trim(),
        email: invitation.email,
        role: invitation.role,
        status: "active",
        createdAt: nowIso()
      };

    if (!existingMember) {
      await this.persistence.upsertOrganizationMember(member);
    }

    const acceptedInvitation: OrganizationInvitation = {
      ...invitation,
      status: "accepted",
      acceptedAt: nowIso()
    };
    await this.persistence.upsertInvitation(acceptedInvitation);

    const session: SessionRecord = {
      token: `sess_${ulid().toLowerCase()}`,
      memberId: member.id,
      organizationId: member.organizationId,
      createdAt: nowIso()
    };
    await this.persistence.upsertSession(session);
    await this.recordAudit("organization", invitation.organizationId, "invitation.accepted", member.name);

    return {
      invitation: acceptedInvitation,
      member,
      session,
      me: toMePayload(member, organization.name)
    };
  }

  async listTeamInstances(context: RequestContext): Promise<TeamInstanceSummary[]> {
    return this.listOrganizationTeamInstances(context.currentOrganization.id);
  }

  async createTeamInstance(
    input: CreateTeamInstanceInput,
    context: RequestContext
  ): Promise<TeamInstanceSummary> {
    const team: TeamInstanceSummary = {
      id: ulid(),
      organizationId: context.currentOrganization.id,
      templateId: input.templateId,
      name: input.name,
      status: "active"
    };

    await this.persistence.upsertTeamInstance(team);
    await this.persistence.upsertBudget(team.id, {
      monthlyLimitCny: input.budgetPolicy.monthlyLimitCny,
      monthlySpentCny: 0,
      taskLimitCny: input.budgetPolicy.taskLimitCny,
      pauseOnLimit: input.budgetPolicy.pauseOnLimit
    });
    await this.recordAudit("team_instance", team.id, "team.hired", context.user.name);

    return team;
  }

  async updateTeamInstance(
    teamInstanceId: string,
    input: UpdateTeamInstanceInput,
    context: RequestContext
  ): Promise<TeamInstanceSummary | undefined> {
    const existing = await this.persistence.getTeamInstance(teamInstanceId);

    if (!existing || existing.organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    const updated: TeamInstanceSummary = {
      ...existing,
      ...(input.name ? { name: input.name } : {}),
      ...(input.status ? { status: input.status } : {})
    };

    await this.persistence.upsertTeamInstance(updated);
    await this.recordAudit("team_instance", updated.id, "team.updated", context.user.name);

    return updated;
  }

  async getDashboard(
    teamInstanceId: string,
    context: RequestContext
  ): Promise<DashboardPayload | undefined> {
    const team = await this.persistence.getTeamInstance(teamInstanceId);

    if (!team || team.organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    const taskRecords = (await this.persistence.listTaskRecords()).filter(
      (record) => record.task.teamInstanceId === teamInstanceId
    );
    const tasks = taskRecords
      .map((record) => record.task)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const approvals = taskRecords
      .flatMap((record) => record.approvals)
      .filter((approval) => approval.status === "pending")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const deliverables = taskRecords
      .flatMap((record) => record.deliverables)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestTaskStatus = tasks[0]?.status ?? "queued";
    const budgetSummary =
      (await this.persistence.getBudget(teamInstanceId)) ?? {
        monthlyLimitCny: 3000,
        monthlySpentCny: 0,
        taskLimitCny: 200,
        pauseOnLimit: true
      };

    return {
      team,
      summary: {
        activeTasks: tasks.filter((task) =>
          ["queued", "running", "waiting_approval"].includes(task.status)
        ).length,
        pendingApprovals: approvals.length,
        monthlySpendCny: budgetSummary.monthlySpentCny,
        completedThisWeek: tasks.filter((task) => task.status === "completed").length
      },
      orgChart: createOrgChart(latestTaskStatus),
      todayProgress: [
        "研究员已完成一轮竞品拆解。",
        "写手已交付 5 条首轮文案草稿。",
        "审核员正在等待人工审批。"
      ],
      pendingApprovals: approvals,
      recentTasks: tasks.slice(0, 5),
      recentDeliverables: deliverables.slice(0, 5),
      budgetSummary,
      runtime: this.runtimeStatus
    };
  }

  async createTask(
    teamInstanceId: string,
    input: CreateTaskInput,
    context: RequestContext
  ): Promise<{ taskId: string } | undefined> {
    const team = await this.persistence.getTeamInstance(teamInstanceId);

    if (!team || team.organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    const taskId = ulid();
    const steps: TaskStep[] = [
      {
        id: ulid(),
        taskId,
        roleId: "researcher",
        label: "研究市场与素材",
        status: "pending"
      },
      {
        id: ulid(),
        taskId,
        roleId: "planner",
        label: "生成内容结构方案",
        status: "pending"
      },
      {
        id: ulid(),
        taskId,
        roleId: "writer",
        label: "撰写首轮内容草稿",
        status: "pending"
      },
      {
        id: ulid(),
        taskId,
        roleId: "reviewer",
        label: "提交审批",
        status: "pending"
      }
    ];

    const task: Task = {
      id: taskId,
      teamInstanceId,
      title: input.title,
      businessGoal: input.businessGoal,
      deliverableType: input.deliverableType,
      constraints: input.constraints ?? {},
      status: "queued",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const record: InternalTaskRecord = {
      task,
      steps,
      approvals: [],
      deliverables: [],
      auditTrail: [],
      stepOutputs: {}
    };

    await this.persistence.upsertTaskRecord(record);
    await this.recordAudit("task", taskId, "task.created", context.user.name);
    this.publish("task.created", {
      taskId,
      teamInstanceId
    }, team.organizationId);

    const runtimeRequest: RuntimeExecutionRequest = {
      executionId: ulid(),
      organizationId: team.organizationId,
      teamInstanceId,
      taskId,
      title: input.title,
      businessGoal: input.businessGoal,
      deliverableType: input.deliverableType,
      rolePlan: steps.map((step) => ({
        roleId: step.roleId,
        stepId: step.id,
        label: step.label
      }))
    };

    if (input.constraints) {
      runtimeRequest.constraints = input.constraints;
    }

    void this.runtime.execute(runtimeRequest, (event) => {
      void this.handleRuntimeEvent(event);
    });

    return { taskId };
  }

  async getTask(taskId: string, context: RequestContext): Promise<TaskDetailPayload | undefined> {
    const resolved = await this.getTaskRecordForContext(taskId, context);

    if (!resolved) {
      return undefined;
    }

    const { record } = resolved;

    const budgetSummary =
      (await this.persistence.getBudget(record.task.teamInstanceId)) ?? {
        monthlyLimitCny: 3000,
        monthlySpentCny: 0,
        taskLimitCny: 200,
        pauseOnLimit: true
      };

    const detail: TaskDetailPayload = {
      task: record.task,
      steps: record.steps,
      approvals: record.approvals,
      deliverables: record.deliverables,
      auditTrail: record.auditTrail,
      budgetSummary
    };

    const videoGeneration = getStoredVideoGenerationSession(record);

    if (videoGeneration) {
      detail.videoGeneration = videoGeneration;
    }

    return detail;
  }

  async getTaskVideoGeneration(
    taskId: string,
    deliverableId: string | undefined,
    context: RequestContext
  ): Promise<VideoGenerationSession | undefined> {
    const resolved = await this.getTaskRecordForContext(taskId, context);

    if (!resolved) {
      return undefined;
    }

    const { record } = resolved;
    const existingSession = getStoredVideoGenerationSession(record, deliverableId);

    if (!existingSession) {
      return undefined;
    }

    if (!this.videoProvider.status.ready) {
      return existingSession;
    }

    if (
      existingSession.status === "completed" ||
      existingSession.status === "failed"
    ) {
      return existingSession;
    }

    const refreshedSession = await this.videoProvider.refreshSession(existingSession);
    setStoredVideoGenerationSession(record, refreshedSession);
    await this.persistence.upsertTaskRecord(record);

    return refreshedSession;
  }

  async createTaskVideoGeneration(
    taskId: string,
    input: CreateVideoGenerationInput,
    context: RequestContext
  ): Promise<VideoGenerationSession | undefined> {
    const resolved = await this.getTaskRecordForContext(taskId, context);

    if (!resolved) {
      return undefined;
    }

    const { record } = resolved;
    const deliverable =
      (input.deliverableId
        ? record.deliverables.find((item) => item.id === input.deliverableId)
        : record.deliverables.find((item) => item.content?.videoHandoff)) ?? record.deliverables[0];

    if (!deliverable?.content?.videoHandoff) {
      throw new Error("Current task does not have a structured video handoff package yet.");
    }

    const existingSession = getStoredVideoGenerationSession(record, deliverable.id);

    if (existingSession) {
      if (this.videoProvider.status.ready) {
        const refreshed = await this.videoProvider.refreshSession(existingSession);
        setStoredVideoGenerationSession(record, refreshed);
        await this.persistence.upsertTaskRecord(record);
        return refreshed;
      }

      return existingSession;
    }

    if (!this.videoProvider.status.ready) {
      throw new Error(this.videoProvider.status.note ?? "Remote video generation is not configured.");
    }

    const createdSession = await this.videoProvider.submitSceneBatch(
      taskId,
      deliverable.id,
      deliverable.content.videoHandoff
    );
    setStoredVideoGenerationSession(record, createdSession);
    await this.persistence.upsertTaskRecord(record);
    await this.recordAudit("task", taskId, "video_generation.started", context.user.name);
    this.publish(
      "video_generation.started",
      {
        taskId,
        deliverableId: deliverable.id,
        sessionId: createdSession.id,
        clipCount: createdSession.clips.length
      },
      context.currentOrganization.id
    );

    return createdSession;
  }

  async listApprovals(
    context: RequestContext,
    status: ApprovalStatus | "all" = "pending"
  ): Promise<ApprovalItem[]> {
    const teamIds = new Set(
      (await this.listOrganizationTeamInstances(context.currentOrganization.id)).map((team) => team.id)
    );
    const records = await this.persistence.listTaskRecords();

    return records
      .flatMap((record) => record.approvals)
      .filter((approval) => teamIds.has(approval.teamInstanceId))
      .filter((approval) => status === "all" || approval.status === status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async approveApproval(
    approvalId: string,
    context: RequestContext
  ): Promise<ApprovalItem | undefined> {
    const records = await this.persistence.listTaskRecords();
    const record = records.find((entry) => entry.approvals.some((approval) => approval.id === approvalId));
    const approval = record?.approvals.find((item) => item.id === approvalId);

    if (!record || !approval) {
      return undefined;
    }

    const team = await this.persistence.getTeamInstance(record.task.teamInstanceId);

    if (!team || team.organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    approval.status = "approved";
    record.task.status = "running";
    record.task.currentRoleId = "publisher";
    record.task.updatedAt = nowIso();

    const reviewStep = record.steps.find((step) => step.roleId === "reviewer");
    if (reviewStep) {
      reviewStep.status = "completed";
    }

    await this.persistence.upsertTaskRecord(record);
    await this.recordAudit("approval", approval.id, "approval.approved", context.user.name);

    this.publish("approval.resolved", {
      approvalId: approval.id,
      taskId: approval.taskId,
      status: approval.status
    }, team.organizationId);
    this.publish("task.status_changed", {
      taskId: record.task.id,
      teamInstanceId: record.task.teamInstanceId,
      previousStatus: "waiting_approval",
      currentStatus: record.task.status
    }, team.organizationId);

    setTimeout(() => {
      void this.finalizeApprovedTask(record.task.id);
    }, 900);

    return approval;
  }

  async rejectApproval(
    approvalId: string,
    context: RequestContext
  ): Promise<ApprovalItem | undefined> {
    const records = await this.persistence.listTaskRecords();
    const record = records.find((entry) => entry.approvals.some((approval) => approval.id === approvalId));
    const approval = record?.approvals.find((item) => item.id === approvalId);

    if (!record || !approval) {
      return undefined;
    }

    const team = await this.persistence.getTeamInstance(record.task.teamInstanceId);

    if (!team || team.organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    approval.status = "rejected";
    record.task.status = "rejected";
    record.task.updatedAt = nowIso();
    await this.persistence.upsertTaskRecord(record);
    await this.recordAudit("approval", approval.id, "approval.rejected", context.user.name);

    this.publish("approval.resolved", {
      approvalId: approval.id,
      taskId: approval.taskId,
      status: approval.status
    }, team.organizationId);
    this.publish("task.status_changed", {
      taskId: record.task.id,
      teamInstanceId: record.task.teamInstanceId,
      previousStatus: "waiting_approval",
      currentStatus: record.task.status
    }, team.organizationId);

    return approval;
  }

  async getOrganizationBudget(
    organizationId: string,
    context: RequestContext
  ): Promise<BudgetSummary | undefined> {
    if (organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    const team = (await this.listOrganizationTeamInstances(context.currentOrganization.id))[0];
    const defaultBudget: BudgetSummary = {
      monthlyLimitCny: 3000,
      monthlySpentCny: 0,
      taskLimitCny: 200,
      pauseOnLimit: true
    };

    if (!team) {
      return defaultBudget;
    }

    return (await this.persistence.getBudget(team.id)) ?? defaultBudget;
  }

  async updateOrganizationBudget(
    organizationId: string,
    changes: Partial<Pick<BudgetSummary, "monthlyLimitCny" | "taskLimitCny" | "pauseOnLimit">>,
    context: RequestContext
  ): Promise<BudgetSummary | undefined> {
    if (organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    const team = (await this.listOrganizationTeamInstances(context.currentOrganization.id))[0];

    if (!team) {
      return undefined;
    }

    const currentBudget = await this.persistence.getBudget(team.id);

    if (!currentBudget) {
      return undefined;
    }

    const nextBudget: BudgetSummary = {
      ...currentBudget,
      ...changes
    };

    await this.persistence.upsertBudget(team.id, nextBudget);
    await this.recordAudit("organization", organizationId, "budget.updated", context.user.name);

    return nextBudget;
  }

  async listAuditLogs(context: RequestContext): Promise<AuditLogEntry[]> {
    const teams = await this.listOrganizationTeamInstances(context.currentOrganization.id);
    const teamIds = new Set(teams.map((team) => team.id));
    const records = (await this.persistence.listTaskRecords()).filter((record) =>
      teamIds.has(record.task.teamInstanceId)
    );
    const taskIds = new Set(records.map((record) => record.task.id));
    const approvalIds = new Set(
      records.flatMap((record) => record.approvals.map((approval) => approval.id))
    );
    const auditLogs = await this.persistence.listAuditLogs();

    return auditLogs.filter((entry) => {
      if (entry.entityType === "organization") {
        return entry.entityId === context.currentOrganization.id;
      }

      if (entry.entityType === "team_instance") {
        return teamIds.has(entry.entityId);
      }

      if (entry.entityType === "task") {
        return taskIds.has(entry.entityId);
      }

      if (entry.entityType === "approval") {
        return approvalIds.has(entry.entityId);
      }

      return false;
    });
  }

  private async finalizeApprovedTask(taskId: string): Promise<void> {
    const record = await this.persistence.getTaskRecord(taskId);

    if (!record) {
      return;
    }

    const pendingDraft = record.pendingDeliverableDraft ?? buildShortDramaDeliverableDraft(record.task);
    const deliverable: Deliverable = {
      id: ulid(),
      taskId: record.task.id,
      title: pendingDraft?.title ?? `${record.task.title} 交付包`,
      type: pendingDraft?.type ?? record.task.deliverableType,
      summary:
        pendingDraft?.summary ?? "已生成可直接使用的内容草稿、审核备注与发布建议。",
      ...(pendingDraft?.content ? { content: pendingDraft.content } : {}),
      createdAt: nowIso()
    };

    record.deliverables.unshift(deliverable);
    delete record.pendingDeliverableDraft;
    record.task.status = "completed";
    record.task.currentRoleId = "publisher";
    record.task.updatedAt = nowIso();

    await this.bumpBudget(record.task.teamInstanceId, 42);
    await this.persistence.upsertTaskRecord(record);
    await this.recordAudit("task", record.task.id, "task.completed", "AI Publisher");
    const organizationId = await this.getOrganizationIdForTeam(record.task.teamInstanceId);

    this.publish("deliverable.created", {
      deliverableId: deliverable.id,
      taskId: record.task.id
    }, organizationId);
    this.publish("task.status_changed", {
      taskId: record.task.id,
      teamInstanceId: record.task.teamInstanceId,
      previousStatus: "running",
      currentStatus: "completed"
    }, organizationId);
  }

  private async handleRuntimeEvent(event: RuntimeExecutionEvent): Promise<void> {
    const { taskId } = event.data as { taskId?: string };

    if (!taskId) {
      return;
    }

    const record = await this.persistence.getTaskRecord(taskId);

    if (!record) {
      return;
    }

    if (event.type === "runtime.execution_started") {
      record.task.status = "running";
      record.task.updatedAt = nowIso();
      await this.persistence.upsertTaskRecord(record);
      await this.recordAudit("task", taskId, "runtime.execution_started", "OpenClaw Runtime");
      const organizationId = await this.getOrganizationIdForTeam(record.task.teamInstanceId);
      this.publish("task.status_changed", {
        taskId,
        teamInstanceId: record.task.teamInstanceId,
        previousStatus: "queued",
        currentStatus: "running"
      }, organizationId);
      return;
    }

    if (event.type === "runtime.step_started") {
      const step = record.steps.find((item) => item.id === event.data.stepId);
      if (step) {
        step.status = "running";
        record.task.currentRoleId = event.data.roleId;
        record.task.updatedAt = nowIso();
        await this.persistence.upsertTaskRecord(record);
      }
      return;
    }

    if (event.type === "runtime.step_completed") {
      const step = record.steps.find((item) => item.id === event.data.stepId);
      if (step) {
        step.status = "completed";
        record.task.updatedAt = nowIso();
      }

      if (event.data.output) {
        record.stepOutputs[event.data.stepId] = event.data.output;
      }

      await this.persistence.upsertTaskRecord(record);
      await this.bumpBudget(record.task.teamInstanceId, 18);
      return;
    }

    if (event.type === "runtime.approval_required") {
      const step = record.steps.find((item) => item.id === event.data.stepId);
      if (step) {
        step.status = "waiting_approval";
      }

      const deliverableDraft = detectShortDramaMeta(record.task)
        ? buildShortDramaDeliverableDraft(record.task)
        : (event.data.deliverableDraft as RuntimeDeliverableDraft);
      const previewLines =
        deliverableDraft.content?.videoHandoff?.scenes.map((scene) => scene.title) ??
        event.data.previewLines;
      const approvalSummary = detectShortDramaMeta(record.task)
        ? buildShortDramaApprovalSummary(record.task)
        : event.data.approvalSummary;

      const approval: ApprovalItem = {
        id: ulid(),
        taskId: record.task.id,
        teamInstanceId: record.task.teamInstanceId,
        title: event.data.approvalTitle,
        stage: "draft_review",
        summary:
          previewLines && previewLines.length > 0
            ? `${approvalSummary} 预览：${previewLines.slice(0, 3).join(" / ")}`
            : approvalSummary,
        status: "pending",
        createdAt: nowIso()
      };

      record.approvals.unshift(approval);
      record.pendingDeliverableDraft = deliverableDraft;
      record.task.status = "waiting_approval";
      record.task.currentRoleId = "reviewer";
      record.task.updatedAt = nowIso();

      await this.persistence.upsertTaskRecord(record);
      await this.recordAudit("task", record.task.id, "task.waiting_approval", "AI Reviewer");
      const organizationId = await this.getOrganizationIdForTeam(record.task.teamInstanceId);

      this.publish("approval.created", {
        approvalId: approval.id,
        taskId: record.task.id,
        teamInstanceId: record.task.teamInstanceId
      }, organizationId);
      this.publish("task.status_changed", {
        taskId: record.task.id,
        teamInstanceId: record.task.teamInstanceId,
        previousStatus: "running",
        currentStatus: "waiting_approval"
      }, organizationId);
      return;
    }

    if (event.type === "runtime.execution_failed") {
      record.task.status = "failed";
      record.task.updatedAt = nowIso();
      await this.persistence.upsertTaskRecord(record);
      await this.recordAudit("task", record.task.id, "runtime.execution_failed", "OpenClaw Runtime");
      const organizationId = await this.getOrganizationIdForTeam(record.task.teamInstanceId);
      this.publish("task.status_changed", {
        taskId: record.task.id,
        teamInstanceId: record.task.teamInstanceId,
        previousStatus: "running",
        currentStatus: "failed",
        message: event.data.message
      }, organizationId);
    }
  }

  private async bumpBudget(teamInstanceId: string, amountCny: number): Promise<void> {
    const current = await this.persistence.getBudget(teamInstanceId);

    if (!current) {
      return;
    }

    const nextBudget: BudgetSummary = {
      ...current,
      monthlySpentCny: current.monthlySpentCny + amountCny
    };

    await this.persistence.upsertBudget(teamInstanceId, nextBudget);

    if (nextBudget.monthlySpentCny >= nextBudget.monthlyLimitCny) {
      const organizationId = await this.getOrganizationIdForTeam(teamInstanceId);
      this.publish("budget.alert_triggered", {
        teamInstanceId,
        monthlySpentCny: nextBudget.monthlySpentCny,
        monthlyLimitCny: nextBudget.monthlyLimitCny
      }, organizationId);
    }
  }

  private async recordAudit(
    entityType: string,
    entityId: string,
    action: string,
    actorLabel: string
  ): Promise<void> {
    await this.persistence.appendAuditLog(
      createAuditEntry(entityType, entityId, action, actorLabel)
    );
  }

  private async ensureContextPrincipal(context: RequestContext): Promise<void> {
    const existingOrganization = await this.persistence.getOrganization(context.currentOrganization.id);

    if (!existingOrganization) {
      await this.persistence.upsertOrganization({
        id: context.currentOrganization.id,
        name: context.currentOrganization.name,
        createdAt: nowIso()
      });
    }

    const existingMember = await this.persistence.findOrganizationMemberByUserId(
      context.currentOrganization.id,
      context.user.id
    );

    if (!existingMember) {
      await this.persistence.upsertOrganizationMember({
        id: ulid(),
        userId: context.user.id,
        organizationId: context.currentOrganization.id,
        name: context.user.name,
        email: context.user.email,
        role: context.currentOrganization.role,
        status: "active",
        createdAt: nowIso()
      });
    }
  }

  private async getTaskRecordForContext(
    taskId: string,
    context: RequestContext
  ): Promise<
    | {
        record: InternalTaskRecord;
        team: TeamInstanceSummary;
      }
    | undefined
  > {
    const record = await this.persistence.getTaskRecord(taskId);

    if (!record) {
      return undefined;
    }

    const team = await this.persistence.getTeamInstance(record.task.teamInstanceId);

    if (!team || team.organizationId !== context.currentOrganization.id) {
      return undefined;
    }

    return {
      record,
      team
    };
  }

  private async listOrganizationTeamInstances(organizationId: string): Promise<TeamInstanceSummary[]> {
    return (await this.persistence.listTeamInstances()).filter(
      (team) => team.organizationId === organizationId
    );
  }

  private async getOrganizationIdForTeam(teamInstanceId: string): Promise<string> {
    const team = await this.persistence.getTeamInstance(teamInstanceId);
    return team?.organizationId ?? defaultOrgId;
  }

  private publish(type: string, data: Record<string, unknown>, organizationId: string): void {
    const event: DomainEvent = {
      type,
      organizationId,
      occurredAt: nowIso(),
      data
    };

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

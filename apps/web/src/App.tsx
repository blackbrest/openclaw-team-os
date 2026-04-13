import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SVGProps
} from "react";

import { APP_NAME, APP_TAGLINE, DEFAULT_API_BASE_URL } from "@openclaw-team-os/config";
import type {
  ApprovalItem,
  BudgetSummary,
  DashboardPayload,
  Deliverable,
  DeliverableContent,
  DeliverableContentSection,
  DeliverableVideoHandoff,
  MePayload,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
  ProjectChatExecutionDraft,
  ProjectChatReplyInput,
  Task,
  TeamInstanceSummary,
  TeamTemplateSummary,
  VideoGenerationSession
} from "@openclaw-team-os/domain";
import { createApiClient } from "@openclaw-team-os/sdk";

const SESSION_STORAGE_KEY = "openclaw-team-os.session-token";
const CHARACTER_LIBRARY_STORAGE_PREFIX = "openclaw-team-os.short-drama-character-library";
const SCENE_REVIEW_STORAGE_PREFIX = "openclaw-team-os.short-drama-scene-review";
const DISPATCH_PROJECT_STORAGE_PREFIX = "openclaw-team-os.dispatch-projects";
const DISPATCH_ACTIVE_PROJECT_STORAGE_PREFIX = "openclaw-team-os.dispatch-active-project";
const DEMO_ADMIN_SESSION = "demo-org-admin-token";
const STORED_UNIT_PREFIX = "catalog:";
const HAS_CONFIGURED_FALLBACK_IDENTITY = Boolean(
  import.meta.env.VITE_SESSION_TOKEN ||
    import.meta.env.VITE_USER_ID ||
    import.meta.env.VITE_USER_NAME ||
    import.meta.env.VITE_ORG_ID
);

type AccessView = "demo" | "create" | "session" | "invite";
type WorkspaceView =
  | "overview"
  | "recruit"
  | "employees"
  | "teams"
  | "dispatch"
  | "approvals"
  | "settings";
type RecruitCategoryId = "all" | "game-creation" | "app-design" | "ai-short-drama";
type RecruitFocusId =
  | "all"
  | "prototype"
  | "visual-design"
  | "growth-content"
  | "story-production"
  | "full-service";
type RecruitKind = "employee" | "team";
type AccentTone = "teal" | "cyan" | "amber";
type ShortDramaStageId = "intake" | "characters" | "storyboard" | "video" | "review";
type ProjectCategoryId = Exclude<RecruitCategoryId, "all">;
type ProjectExecutionMode = RecruitKind;
type BudgetPolicyDraft = Pick<BudgetSummary, "monthlyLimitCny" | "taskLimitCny" | "pauseOnLimit">;

interface RecruitCategory {
  id: RecruitCategoryId;
  title: string;
  summary: string;
}

interface RecruitFocus {
  id: RecruitFocusId;
  title: string;
  summary: string;
}

interface RecruitModule {
  id: string;
  kind: RecruitKind;
  title: string;
  strap: string;
  categoryIds: RecruitCategoryId[];
  focusIds: RecruitFocusId[];
  signalWords: string[];
  summary: string;
  outputs: string[];
  costLabel: string;
  cycleLabel: string;
  starterTask: string;
  budgetPolicy: {
    monthlyLimitCny: number;
    taskLimitCny: number;
    pauseOnLimit: boolean;
  };
  accent: AccentTone;
}

interface ClientUnit extends TeamInstanceSummary {
  displayName: string;
  kind: RecruitKind | "legacy";
  module?: RecruitModule;
  outputs: string[];
  costLabel: string;
  cycleLabel: string;
  starterTask: string;
  accent: AccentTone;
}

interface ShortDramaProjectDraft {
  premise: string;
  durationSeconds: number;
  hook: string;
  mustHaveMoments: string;
  heroine: string;
  hero: string;
  supportingCast: string;
  continuityRule: string;
}

interface ResultFeedItem {
  id: string;
  taskId: string;
  title: string;
  summary: string;
  tone: "good" | "warm";
  statusLabel: string;
  createdAt: string;
  sourceKind: "deliverable" | "draft";
  deliverable?: Deliverable;
}

interface ShortDramaStageDefinition {
  id: ShortDramaStageId;
  title: string;
  summary: string;
  owner: string;
}

interface ShortDramaCharacterCard {
  id: string;
  name: string;
  role: string;
  summary: string;
}

interface ShortDramaCharacterAsset extends ShortDramaCharacterCard {
  sourceLabel: string;
  createdAt: string;
}

interface ShortDramaTimelineScene {
  id: string;
  title: string;
  durationSeconds: number;
  startSecond: number;
  endSecond: number;
  visualGoal: string;
  prompt: string;
  dialogue?: string;
  clip?: VideoGenerationSession["clips"][number];
}

interface ShortDramaSceneReviewDecision {
  sceneId: string;
  status: "approved" | "rework" | "hold";
  note: string;
  updatedAt: string;
}

type ProjectChatChannelKind = "all-hands" | "lead" | "direct" | "group";

interface ProjectChatChannel {
  id: string;
  name: string;
  kind: ProjectChatChannelKind;
  memberUnitIds: string[];
}

interface ProjectChatMessage {
  id: string;
  channelId: string;
  authorKind: "ceo" | "lead" | "employee" | "system";
  authorLabel: string;
  body: string;
  createdAt: string;
}

type ProjectAssignmentPriority = "high" | "medium" | "low";
type ProjectAssignmentStatus = "todo" | "in_progress" | "review" | "blocked" | "done";

interface ProjectAssignment {
  id: string;
  ownerUnitId: string;
  assignedByUnitId: string;
  title: string;
  summary: string;
  deliverable: string;
  priority: ProjectAssignmentPriority;
  status: ProjectAssignmentStatus;
  latestReport?: string;
  lastReportAt?: string;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectAssignmentReport {
  id: string;
  assignmentId: string;
  authorUnitId: string;
  summary: string;
  status: ProjectAssignmentStatus;
  createdAt: string;
}

interface ProjectExecutionArtifact {
  id: string;
  assignmentId: string;
  ownerUnitId: string;
  stageId: string;
  stageTitle: string;
  title: string;
  summary: string;
  sections: ProjectChatExecutionDraft["sections"];
  nextActions: string[];
  needsReview: boolean;
  status: "draft" | "updated";
  createdAt: string;
  updatedAt: string;
}

type ProjectFlowStatus = "active" | "ready" | "upcoming" | "missing";

interface ShortDramaPipelineStep {
  id: string;
  title: string;
  ownerRole: string;
  summary: string;
  moduleIds: string[];
}

interface DispatchProjectWorkflowState {
  intentDraft: string;
  taskGoal: string;
  shortDramaStage: ShortDramaStageId;
  shortDramaDraft: ShortDramaProjectDraft;
  leadUnitId: string;
  memberUnitIds: string[];
  activeChannelId: string;
  channels: ProjectChatChannel[];
  messages: ProjectChatMessage[];
  assignments: ProjectAssignment[];
  reports: ProjectAssignmentReport[];
  outputs: ProjectExecutionArtifact[];
  selectedAssignmentId: string;
}

interface DispatchProject {
  id: string;
  name: string;
  description: string;
  categoryId: ProjectCategoryId;
  executionMode: ProjectExecutionMode;
  unitId: string;
  hasAccessPassword: boolean;
  createdAt: string;
  updatedAt: string;
  workflow: DispatchProjectWorkflowState;
}

interface DispatchProjectDraft {
  name: string;
  categoryId: ProjectCategoryId;
  description: string;
  memberUnitIds: string[];
  leadUnitId: string;
}

interface ProjectAssignmentDraft {
  ownerUnitId: string;
  title: string;
  summary: string;
  deliverable: string;
  priority: ProjectAssignmentPriority;
}

type DispatchRecommendation =
  | {
      kind: "unit";
      unit: ClientUnit;
      matches: string[];
      score: number;
    }
  | {
      kind: "module";
      module: RecruitModule;
      matches: string[];
      score: number;
    };

type IconName = "overview" | "recruit" | "employees" | "teams" | "dispatch" | "approvals" | "settings";
type CatalogGlyphName =
  | "all"
  | "game-creation"
  | "app-design"
  | "ai-short-drama"
  | "design-bot"
  | "game-dev-bot"
  | "art-bot"
  | "ops-copy-bot"
  | "short-drama-writer-bot"
  | "game-production-team"
  | "creative-studio-team"
  | "growth-content-team"
  | "short-drama-studio-team";

const recruitCategories: RecruitCategory[] = [
  {
    id: "all",
    title: "全部方向",
    summary: "直接查看当前全部可招聘 AI 员工。"
  },
  {
    id: "game-creation",
    title: "游戏创作",
    summary: "适合玩法设计、原型开发、美术设定和整包制作。"
  },
  {
    id: "app-design",
    title: "应用设计",
    summary: "适合产品界面、品牌视觉、活动页和应用表达。"
  },
  {
    id: "ai-short-drama",
    title: "AI短剧制作",
    summary: "适合剧情开发、角色定稿、场景设计、视频生成与后期成片。"
  }
];

const shortDramaStageDefinitions: ShortDramaStageDefinition[] = [
  {
    id: "intake",
    title: "剧情立项",
    summary: "先把题材、时长、强钩子和必须发生的反转写清楚。",
    owner: "CEO / AI 编剧"
  },
  {
    id: "characters",
    title: "人物定稿",
    summary: "锁定主角、副角和一致性规则，避免后面人物长相与气质漂移。",
    owner: "AI 角色设计师"
  },
  {
    id: "storyboard",
    title: "剧本分镜",
    summary: "由编导线拆对白、镜头、转场节奏，再交给制作线接棒。",
    owner: "AI 编剧 / AI 导演"
  },
  {
    id: "video",
    title: "视频制作",
    summary: "用已经定稿的人物与分镜直接生成样片或整包视频。",
    owner: "AI 视频生成师 / AI 剪辑师"
  },
  {
    id: "review",
    title: "审片导出",
    summary: "集中检查人物一致性、台词节奏和最后 3 秒钩子是否成立。",
    owner: "你 / 审批人"
  }
];

const shortDramaReviewChecklist = [
  "主角和副角的脸、服装、气质是否稳定一致",
  "对白是否和分镜节奏匹配，没有信息堆积",
  "反转点是否出现在前 5 秒或最后 3 秒",
  "转场是否自然，没有莫名跳轴或场景断裂"
];

const recruitFocuses: RecruitFocus[] = [
  {
    id: "all",
    title: "全部目标",
    summary: "直接查看当前方向下全部可招聘单元。"
  },
  {
    id: "prototype",
    title: "原型开发",
    summary: "适合玩法拆解、功能方案和最小可做验证。"
  },
  {
    id: "visual-design",
    title: "视觉设计",
    summary: "适合品牌界面、视觉基准和素材风格。"
  },
  {
    id: "growth-content",
    title: "内容增长",
    summary: "适合文案、活动物料和持续内容生产。"
  },
  {
    id: "story-production",
    title: "短剧脚本",
    summary: "适合剧情钩子、分镜和镜头节奏拆解。"
  },
  {
    id: "full-service",
    title: "整包交付",
    summary: "适合直接招聘整支团队承接跨角色任务。"
  }
];

const recruitModules: RecruitModule[] = [
  {
    id: "design-bot",
    kind: "employee",
    title: "AI 产品设计师",
    strap: "Product / UI / Motion",
    categoryIds: ["app-design"],
    focusIds: ["visual-design"],
    signalWords: ["界面", "ui", "视觉", "品牌", "活动页", "landing page", "页面", "设计系统"],
    summary: "负责产品界面、主流程页面、动效基调和关键交互表达。",
    outputs: ["界面稿", "主流程方案", "关键页视觉"],
    costLabel: "¥80 / task 起",
    cycleLabel: "5-20 min",
    starterTask: "为一款 AI 团队客户端设计招聘工作区的首屏界面与视觉方向。",
    budgetPolicy: {
      monthlyLimitCny: 2000,
      taskLimitCny: 160,
      pauseOnLimit: true
    },
    accent: "teal"
  },
  {
    id: "game-dev-bot",
    kind: "employee",
    title: "AI 游戏研发",
    strap: "Gameplay / Tools / Prototyping",
    categoryIds: ["game-creation"],
    focusIds: ["prototype"],
    signalWords: ["玩法", "原型", "开发", "系统", "战斗", "roguelike", "塔防", "demo", "工具"],
    summary: "处理游戏原型、交互逻辑、工具脚本和玩法验证。",
    outputs: ["玩法原型", "开发方案", "技术拆解"],
    costLabel: "¥120 / task 起",
    cycleLabel: "10-35 min",
    starterTask: "为一款轻量策略游戏拆分核心玩法系统，并输出最小可做原型方案。",
    budgetPolicy: {
      monthlyLimitCny: 2600,
      taskLimitCny: 220,
      pauseOnLimit: true
    },
    accent: "cyan"
  },
  {
    id: "art-bot",
    kind: "employee",
    title: "AI 3D 美术师",
    strap: "Concept / Asset / Style",
    categoryIds: ["game-creation"],
    focusIds: ["visual-design"],
    signalWords: ["3d", "角色", "场景", "美术", "资产", "风格", "概念图", "设定"],
    summary: "处理角色气质、场景风格、资产清单和美术基准输出。",
    outputs: ["风格板", "资产清单", "角色/场景设定"],
    costLabel: "¥100 / task 起",
    cycleLabel: "8-30 min",
    starterTask: "为一款赛博风格塔防游戏整理角色、场景和 UI 的统一美术基准。",
    budgetPolicy: {
      monthlyLimitCny: 2400,
      taskLimitCny: 180,
      pauseOnLimit: true
    },
    accent: "amber"
  },
  {
    id: "ops-copy-bot",
    kind: "employee",
    title: "AI 运营文案师",
    strap: "Campaign / Social / Store",
    categoryIds: ["game-creation", "app-design"],
    focusIds: ["growth-content"],
    signalWords: ["文案", "活动", "商店", "社区", "小红书", "增长", "宣发", "标题", "脚本"],
    summary: "处理活动文案、商店文案、社区公告和多版本传播素材。",
    outputs: ["活动文案", "商店描述", "社区更新稿"],
    costLabel: "¥60 / task 起",
    cycleLabel: "4-12 min",
    starterTask: "围绕一款新上线游戏输出首周运营活动文案与 3 条商店描述版本。",
    budgetPolicy: {
      monthlyLimitCny: 1800,
      taskLimitCny: 120,
      pauseOnLimit: true
    },
    accent: "teal"
  },
  {
    id: "short-drama-writer-bot",
    kind: "employee",
    title: "AI 编剧",
    strap: "Script / Plot / Dialogue",
    categoryIds: ["ai-short-drama"],
    focusIds: ["story-production"],
    signalWords: ["短剧", "剧情", "对白", "分镜", "镜头", "剧本", "反转", "人物关系"],
    summary: "负责短剧故事 premise、人物关系、对白节奏和剧情反转设计。",
    outputs: ["剧情大纲", "对白草稿", "分场结构"],
    costLabel: "¥90 / task 起",
    cycleLabel: "8-18 min",
    starterTask: "围绕一支 60 秒 AI 短剧，输出三幕结构、关键对白和 8 个镜头的分镜脚本。",
    budgetPolicy: {
      monthlyLimitCny: 2200,
      taskLimitCny: 150,
      pauseOnLimit: true
    },
    accent: "amber"
  },
  {
    id: "game-planner-bot",
    kind: "employee",
    title: "AI 游戏策划",
    strap: "System / Level / Economy",
    categoryIds: ["game-creation"],
    focusIds: ["prototype"],
    signalWords: ["策划", "关卡", "数值", "系统", "成长", "留存", "循环"],
    summary: "负责核心循环、关卡结构、数值节奏和中期版本规划。",
    outputs: ["系统规划", "关卡节奏", "数值草案"],
    costLabel: "¥110 / task 起",
    cycleLabel: "8-25 min",
    starterTask: "为一款小体量策略游戏设计首周可验证的核心循环与三段关卡节奏。",
    budgetPolicy: {
      monthlyLimitCny: 2400,
      taskLimitCny: 180,
      pauseOnLimit: true
    },
    accent: "cyan"
  },
  {
    id: "level-design-bot",
    kind: "employee",
    title: "AI 关卡设计师",
    strap: "Level / Encounter / Progression",
    categoryIds: ["game-creation"],
    focusIds: ["prototype"],
    signalWords: ["关卡", "遭遇", "路线", "节奏", "教程", "流程", "地图", "战斗段落"],
    summary: "负责关卡流程、遭遇设计、引导节奏和章节推进结构。",
    outputs: ["关卡草图", "遭遇脚本", "流程节奏"],
    costLabel: "¥90 / task 起",
    cycleLabel: "7-18 min",
    starterTask: "为一款轻量动作游戏拆出第一章的关卡路线、遭遇节奏和教学段落。",
    budgetPolicy: {
      monthlyLimitCny: 2100,
      taskLimitCny: 150,
      pauseOnLimit: true
    },
    accent: "teal"
  },
  {
    id: "tech-art-bot",
    kind: "employee",
    title: "AI 技术美术师",
    strap: "Tech Art / FX / Pipeline",
    categoryIds: ["game-creation"],
    focusIds: ["prototype", "visual-design"],
    signalWords: ["技术美术", "特效", "材质", "shader", "性能", "管线", "美术流程"],
    summary: "负责视觉表现与制作效率之间的平衡，处理特效、材质和资产管线建议。",
    outputs: ["特效规范", "材质规则", "资产流程"],
    costLabel: "¥95 / task 起",
    cycleLabel: "8-20 min",
    starterTask: "为一款 3D 小体量项目整理特效、材质和性能之间的技术美术基准。",
    budgetPolicy: {
      monthlyLimitCny: 2200,
      taskLimitCny: 160,
      pauseOnLimit: true
    },
    accent: "amber"
  },
  {
    id: "brand-visual-bot",
    kind: "employee",
    title: "AI 品牌视觉设计师",
    strap: "Brand / Campaign / KV",
    categoryIds: ["app-design"],
    focusIds: ["visual-design"],
    signalWords: ["品牌", "主视觉", "海报", "KV", "宣传图", "活动包装"],
    summary: "负责应用品牌视觉、KV 方向、宣传主图和活动包装基调。",
    outputs: ["品牌板", "KV 方向", "活动视觉"],
    costLabel: "¥85 / task 起",
    cycleLabel: "6-18 min",
    starterTask: "围绕一款 AI 工具产品输出品牌主视觉和活动 KV 方向。",
    budgetPolicy: {
      monthlyLimitCny: 2000,
      taskLimitCny: 160,
      pauseOnLimit: true
    },
    accent: "amber"
  },
  {
    id: "interaction-bot",
    kind: "employee",
    title: "AI 交互设计师",
    strap: "UX / Flow / Wireframe",
    categoryIds: ["app-design"],
    focusIds: ["prototype", "visual-design"],
    signalWords: ["交互", "流程", "线框", "信息架构", "表单", "导航"],
    summary: "负责应用信息架构、操作路径、页面关系和交互节奏优化。",
    outputs: ["线框图", "交互流", "信息架构"],
    costLabel: "¥75 / task 起",
    cycleLabel: "5-16 min",
    starterTask: "为一款 AI 协作应用梳理 onboarding 到项目协作的交互流。",
    budgetPolicy: {
      monthlyLimitCny: 1800,
      taskLimitCny: 140,
      pauseOnLimit: true
    },
    accent: "teal"
  },
  {
    id: "user-research-bot",
    kind: "employee",
    title: "AI 用户研究师",
    strap: "Research / Interview / JTBD",
    categoryIds: ["app-design"],
    focusIds: ["prototype", "growth-content"],
    signalWords: ["研究", "访谈", "用户", "需求", "JTBD", "洞察", "痛点", "反馈"],
    summary: "负责梳理目标用户、使用场景、真实痛点和需求优先级。",
    outputs: ["用户洞察", "访谈提纲", "需求优先级"],
    costLabel: "¥70 / task 起",
    cycleLabel: "6-16 min",
    starterTask: "围绕一款 AI 协作产品输出核心用户画像、任务场景和首版优先级建议。",
    budgetPolicy: {
      monthlyLimitCny: 1800,
      taskLimitCny: 120,
      pauseOnLimit: true
    },
    accent: "cyan"
  },
  {
    id: "design-system-bot",
    kind: "employee",
    title: "AI 设计系统设计师",
    strap: "System / Token / Component",
    categoryIds: ["app-design"],
    focusIds: ["visual-design"],
    signalWords: ["设计系统", "组件", "token", "规范", "样式", "组件库", "品牌一致性"],
    summary: "负责组件规则、设计 token、界面一致性和跨页面复用标准。",
    outputs: ["组件清单", "设计 token", "界面规范"],
    costLabel: "¥88 / task 起",
    cycleLabel: "6-18 min",
    starterTask: "为一款桌面客户端产品整理颜色、组件和页面结构的首版设计系统规则。",
    budgetPolicy: {
      monthlyLimitCny: 2000,
      taskLimitCny: 150,
      pauseOnLimit: true
    },
    accent: "teal"
  },
  {
    id: "growth-design-bot",
    kind: "employee",
    title: "AI 增长设计师",
    strap: "Growth / Creative / Conversion",
    categoryIds: ["app-design"],
    focusIds: ["growth-content", "visual-design"],
    signalWords: ["增长", "转化", "素材", "投放", "活动", "banner", "拉新", "转化率"],
    summary: "负责活动创意、增长素材、转化页面和实验版位表达。",
    outputs: ["增长素材", "转化页方案", "实验创意"],
    costLabel: "¥82 / task 起",
    cycleLabel: "6-16 min",
    starterTask: "围绕一款 AI 效率工具输出拉新活动页面和三组增长创意素材方向。",
    budgetPolicy: {
      monthlyLimitCny: 1900,
      taskLimitCny: 140,
      pauseOnLimit: true
    },
    accent: "amber"
  },
  {
    id: "short-drama-director-bot",
    kind: "employee",
    title: "AI 导演",
    strap: "Direction / Pace / Shot",
    categoryIds: ["ai-short-drama"],
    focusIds: ["story-production"],
    signalWords: ["导演", "调度", "节奏", "镜头", "场面", "转场"],
    summary: "负责剧情节奏、镜头推进、段落重心和导演意图统一。",
    outputs: ["导演阐述", "镜头节奏", "调度说明"],
    costLabel: "¥95 / task 起",
    cycleLabel: "8-20 min",
    starterTask: "围绕一支 30 秒霸总短剧，整理镜头节奏、情绪曲线和转场逻辑。",
    budgetPolicy: {
      monthlyLimitCny: 2200,
      taskLimitCny: 150,
      pauseOnLimit: true
    },
    accent: "cyan"
  },
  {
    id: "short-drama-character-bot",
    kind: "employee",
    title: "AI 角色设计师",
    strap: "Character / Costume / Consistency",
    categoryIds: ["ai-short-drama"],
    focusIds: ["visual-design", "story-production"],
    signalWords: ["角色", "人设", "服装", "造型", "一致性", "角色圣经"],
    summary: "负责主角、副角的人设、造型、服装与形象一致性规则。",
    outputs: ["角色设定", "服装清单", "一致性规则"],
    costLabel: "¥90 / task 起",
    cycleLabel: "8-18 min",
    starterTask: "为一支职场霸总题材 AI 短剧定稿女主、男主与反派的人设和造型规则。",
    budgetPolicy: {
      monthlyLimitCny: 2100,
      taskLimitCny: 150,
      pauseOnLimit: true
    },
    accent: "amber"
  },
  {
    id: "short-drama-scene-bot",
    kind: "employee",
    title: "AI 场景设计师",
    strap: "Scene / Set / Lighting",
    categoryIds: ["ai-short-drama"],
    focusIds: ["visual-design", "story-production"],
    signalWords: ["场景", "空间", "灯光", "布景", "环境", "镜头空间"],
    summary: "负责短剧场景气质、空间连续性、布景元素和光线基调。",
    outputs: ["场景设定", "空间说明", "光线规则"],
    costLabel: "¥85 / task 起",
    cycleLabel: "6-18 min",
    starterTask: "为一支现代职场短剧定稿会议室、电梯和办公室的空间与灯光气质。",
    budgetPolicy: {
      monthlyLimitCny: 2000,
      taskLimitCny: 140,
      pauseOnLimit: true
    },
    accent: "teal"
  },
  {
    id: "short-drama-video-bot",
    kind: "employee",
    title: "AI 视频生成师",
    strap: "Video / Prompt / Render",
    categoryIds: ["ai-short-drama"],
    focusIds: ["full-service", "story-production"],
    signalWords: ["视频生成", "提示词", "出片", "渲染", "镜头包", "样片"],
    summary: "负责把人物与分镜转成可投喂视频模型的镜头提示词和出片参数。",
    outputs: ["镜头提示词", "出片参数", "样片清单"],
    costLabel: "¥100 / task 起",
    cycleLabel: "10-24 min",
    starterTask: "把已定稿的短剧人物与分镜整理成 5 秒样片与 30 秒整片的出片提示词。",
    budgetPolicy: {
      monthlyLimitCny: 2400,
      taskLimitCny: 170,
      pauseOnLimit: true
    },
    accent: "cyan"
  },
  {
    id: "short-drama-voice-bot",
    kind: "employee",
    title: "AI 配音师",
    strap: "Voice / Emotion / Timing",
    categoryIds: ["ai-short-drama"],
    focusIds: ["story-production"],
    signalWords: ["配音", "台词", "情绪", "语速", "声音", "音色"],
    summary: "负责角色配音设定、台词情绪、语气区分和对白时间控制。",
    outputs: ["配音设定", "台词节奏", "情绪说明"],
    costLabel: "¥70 / task 起",
    cycleLabel: "5-14 min",
    starterTask: "为女主、男主和反派设计差异化配音气质，并拆分关键对白的语速与情绪。",
    budgetPolicy: {
      monthlyLimitCny: 1700,
      taskLimitCny: 120,
      pauseOnLimit: true
    },
    accent: "teal"
  },
  {
    id: "short-drama-editor-bot",
    kind: "employee",
    title: "AI 剪辑师",
    strap: "Edit / Rhythm / Final Cut",
    categoryIds: ["ai-short-drama"],
    focusIds: ["full-service", "story-production"],
    signalWords: ["剪辑", "卡点", "节奏", "混剪", "包装", "终版"],
    summary: "负责短剧镜头节奏、卡点、信息密度控制和终版包装建议。",
    outputs: ["剪辑节奏", "终版建议", "包装说明"],
    costLabel: "¥80 / task 起",
    cycleLabel: "6-16 min",
    starterTask: "围绕 30 秒职场反转短剧，输出前 3 秒钩子、反转点和最后 3 秒留钩子的剪辑节奏。",
    budgetPolicy: {
      monthlyLimitCny: 1800,
      taskLimitCny: 130,
      pauseOnLimit: true
    },
    accent: "amber"
  },
  {
    id: "game-production-team",
    kind: "team",
    title: "游戏制作团队",
    strap: "策划 + 美术 + 开发",
    categoryIds: ["game-creation"],
    focusIds: ["prototype", "full-service"],
    signalWords: ["游戏", "原型", "玩法", "demo", "制作计划", "关卡", "系统", "首周", "版本"],
    summary: "直接接手一条游戏制作任务，适合做原型、演示版本和内容包。",
    outputs: ["制作拆解", "里程碑建议", "跨角色交付包"],
    costLabel: "¥180 / task 起",
    cycleLabel: "20-45 min",
    starterTask: "围绕一款 3 人团队可做的 Roguelike 游戏，输出玩法定位、首月制作计划和原型优先级。",
    budgetPolicy: {
      monthlyLimitCny: 4000,
      taskLimitCny: 280,
      pauseOnLimit: true
    },
    accent: "cyan"
  },
  {
    id: "creative-studio-team",
    kind: "team",
    title: "创意素材团队",
    strap: "创意 + 设计 + 文案",
    categoryIds: ["app-design"],
    focusIds: ["visual-design", "full-service"],
    signalWords: ["海报", "商店页", "创意素材", "主视觉", "活动页", "kv", "卖点", "包装"],
    summary: "适合品牌页、商店页、活动页和素材批量生产。",
    outputs: ["页面方向", "活动素材清单", "创意包"],
    costLabel: "¥150 / task 起",
    cycleLabel: "15-35 min",
    starterTask: "为一款新游戏准备商店首屏创意、卖点标题和宣传素材方向。",
    budgetPolicy: {
      monthlyLimitCny: 3200,
      taskLimitCny: 240,
      pauseOnLimit: true
    },
    accent: "amber"
  },
  {
    id: "growth-content-team",
    kind: "team",
    title: "内容增长团队",
    strap: "研究 + 策划 + 文案",
    categoryIds: ["game-creation", "app-design"],
    focusIds: ["growth-content", "full-service"],
    signalWords: ["增长", "内容", "发布", "传播", "选题", "社媒", "小红书", "转化", "账号"],
    summary: "适合持续输出社媒、宣发与增长内容，是当前后端最稳定的团队包。",
    outputs: ["内容草稿", "选题策略", "发布建议"],
    costLabel: "¥80 / task 起",
    cycleLabel: "15-40 min",
    starterTask: "围绕 OpenClaw Team OS 输出 5 条适合小红书的内容草稿，语气专业但轻松。",
    budgetPolicy: {
      monthlyLimitCny: 3000,
      taskLimitCny: 200,
      pauseOnLimit: true
    },
    accent: "teal"
  },
  {
    id: "short-drama-studio-team",
    kind: "team",
    title: "AI 短剧制作团队",
    strap: "编剧 + 分镜 + 包装",
    categoryIds: ["ai-short-drama"],
    focusIds: ["story-production", "full-service"],
    signalWords: ["短剧", "出片", "分镜", "剧情", "栏目的", "连续内容", "镜头", "包装"],
    summary: "直接承接短剧选题、剧本、分镜和出片包装方案，适合做连续内容栏目。",
    outputs: ["剧情包", "镜头清单", "出片包装建议"],
    costLabel: "¥170 / task 起",
    cycleLabel: "18-38 min",
    starterTask: "围绕职场反转题材，输出一支 90 秒 AI 短剧的剧情梗概、分镜清单和出片节奏建议。",
    budgetPolicy: {
      monthlyLimitCny: 3600,
      taskLimitCny: 260,
      pauseOnLimit: true
    },
    accent: "cyan"
  }
];

const workspaceMeta: Record<
  WorkspaceView,
  {
    title: string;
    subtitle: string;
    icon: IconName;
  }
> = {
  overview: {
    title: "组织总览",
    subtitle: "从 AI 编制、审批和消耗看当前组织是否准备好进入实际工作。",
    icon: "overview"
  },
  recruit: {
    title: "招聘",
    subtitle: "直接招聘 AI 员工，按业务分类逐步搭建你的公司编制。",
    icon: "recruit"
  },
  employees: {
    title: "员工",
    subtitle: "单体 Bot 员工列表，适合按专业角色直接分配工作。",
    icon: "employees"
  },
  teams: {
    title: "团队",
    subtitle: "团队能力当前已隐藏。",
    icon: "teams"
  },
  dispatch: {
    title: "任务台",
    subtitle: "围绕项目组织员工协作、聊天、汇报与产出推进。",
    icon: "dispatch"
  },
  approvals: {
    title: "审批",
    subtitle: "把需要人工确认的节点集中在一个工作区里处理。",
    icon: "approvals"
  },
  settings: {
    title: "设置",
    subtitle: "预算、成员、邀请和 session 这些低频能力都收在这里。",
    icon: "settings"
  }
};

const workspaceRailSummary: Record<WorkspaceView, string> = {
  overview: "组织状态与下一步",
  recruit: "招聘目录与补位",
  employees: "员工档案与技能",
  teams: "已隐藏",
  dispatch: "项目协作与汇报",
  approvals: "关键节点拍板",
  settings: "组织与预算控制"
};

const accessOptions: Array<{
  id: AccessView;
  title: string;
  eyebrow: string;
  summary: string;
}> = [
  {
    id: "demo",
    title: "Demo",
    eyebrow: "最快进入",
    summary: "直接进入演示工作区，最快体验完整桌面流。"
  },
  {
    id: "create",
    title: "新组织",
    eyebrow: "正式开始",
    summary: "创建正式 Studio，自动生成管理员 session。"
  },
  {
    id: "session",
    title: "Session",
    eyebrow: "已有凭证",
    summary: "继续使用现有组织上下文，直接回到工作区。"
  },
  {
    id: "invite",
    title: "邀请加入",
    eyebrow: "团队协作",
    summary: "协作成员与审批人快速加入当前组织。"
  }
];

function readInitialSessionToken(): string {
  if (typeof window === "undefined") {
    return import.meta.env.VITE_SESSION_TOKEN ?? "";
  }

  return window.localStorage.getItem(SESSION_STORAGE_KEY) ?? import.meta.env.VITE_SESSION_TOKEN ?? "";
}

function previewToken(token: string): string {
  if (token.length <= 12) {
    return token;
  }

  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

function isAuthErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("valid session token is required") ||
    normalized.includes("request failed with 401") ||
    normalized.includes("unauthorized")
  );
}

function currency(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTaskStatus(status: string): string {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "执行中";
    case "waiting_approval":
      return "待审批";
    case "completed":
      return "已完成";
    case "failed":
      return "执行失败";
    default:
      return status;
  }
}

function buildGeneratedBrief(unit: ClientUnit): string {
  const outputChecklist = unit.outputs.map((output, index) => `${index + 1}. ${output}`).join("\n");
  const executionHint =
    unit.kind === "team"
      ? "请按多角色协作方式拆解任务，并明确每个阶段由谁负责。"
      : "请以单岗位执行方式完成任务，并说明哪些地方需要补位协同。";

  return [
    `${unit.displayName} 本轮任务 Brief`,
    "",
    `业务目标：${unit.starterTask}`,
    `执行方向：${unit.module?.strap ?? "通用执行单元"}`,
    "",
    "请按以下结构输出首轮结果：",
    "1. 先复述目标，并给出本轮成功判断标准。",
    `2. 优先产出以下内容：\n${outputChecklist}`,
    `3. ${executionHint}`,
    "4. 标出关键假设、风险点，以及我下一步最该审批或补充的信息。",
    "",
    "交付要求：",
    "- 结论先行，避免空泛描述。",
    "- 输出要能直接进入下一步制作或发布。",
    "- 如果目标过大，请主动拆成首轮最值得执行的版本。"
  ].join("\n");
}

function deriveIntentSeed(rawText: string): string {
  const businessGoalMatch = rawText.match(/业务目标[:：]\s*(.+)/);

  if (businessGoalMatch?.[1]) {
    return businessGoalMatch[1].trim();
  }

  return rawText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function buildCompletedBrief(intent: string, unit: ClientUnit): string {
  const outputChecklist = unit.outputs.map((output, index) => `${index + 1}. ${output}`).join("\n");
  const executionHint =
    unit.kind === "team"
      ? "请按团队协作方式拆成阶段，并明确每一轮需要哪个角色接棒。"
      : "请按单岗位交付方式完成，并说明哪些环节需要我额外补人或补信息。";

  return [
    `${unit.displayName} 结构化任务单`,
    "",
    `业务目标：${intent}`,
    `推荐执行单位：${unit.displayName}`,
    `推荐原因：该单位更擅长 ${unit.outputs.join("、")} 这类交付。`,
    "",
    "请按以下结构执行：",
    "1. 先复述目标，并给出本轮任务边界。",
    `2. 输出这轮最值得先做的结果：\n${outputChecklist}`,
    `3. ${executionHint}`,
    "4. 给出风险、依赖和建议的下一步动作。",
    "",
    "交付标准：",
    "- 尽量直接给可用结果，而不是泛泛建议。",
    "- 如果范围过大，先拆出首轮最关键的部分。",
    "- 标出需要我审批或拍板的地方。"
  ].join("\n");
}

type RecruitGridConfig = {
  cardWidth: number,
  columns: number,
  gutter: number,
  maxWidth: number,
};

function resolveRecruitGridConfig(viewportWidth: number): RecruitGridConfig {
  const columns =
    viewportWidth >= 2500
      ? 7
      : viewportWidth >= 2200
        ? 6
        : viewportWidth >= 1680
          ? 5
          : viewportWidth >= 1380
            ? 4
            : viewportWidth >= 1100
              ? 3
              : viewportWidth >= 760
                ? 2
                : 1;
  const gutter =
    columns >= 5
      ? viewportWidth >= 2500
        ? 208
        : viewportWidth >= 2200
          ? 188
          : viewportWidth >= 1920
            ? 164
            : 132
      : columns === 4
        ? 88
        : columns === 3
          ? 44
          : columns === 2
            ? 28
            : 0;
  const gap = 16;
  const railWidth = viewportWidth >= 1100 ? 208 : 0;
  const usableWidth = Math.max(320, viewportWidth - railWidth - gutter * 2);
  const computedCardWidth =
    columns === 1
      ? Math.floor(usableWidth)
      : Math.floor((usableWidth - gap * (columns - 1)) / columns);
  const cardWidth =
    columns >= 5
      ? Math.max(272, Math.min(308, computedCardWidth))
      : columns === 4
        ? Math.max(286, Math.min(320, computedCardWidth))
        : columns === 3
          ? Math.max(304, Math.min(340, computedCardWidth))
          : columns === 2
            ? Math.max(320, Math.min(420, computedCardWidth))
            : Math.max(288, Math.min(viewportWidth - 56, 420));

  return {
    cardWidth,
    columns,
    gutter,
    maxWidth: columns * cardWidth + (columns - 1) * gap,
  };
}

function recruitGridStyle(config: RecruitGridConfig): CSSProperties {
  return {
    ["--recruit-card-width" as const]: `${config.cardWidth}px`,
    ["--recruit-columns" as const]: String(config.columns),
  } as CSSProperties;
}

function recruitWorkspaceStyle(config: RecruitGridConfig): CSSProperties {
  return {
    ["--recruit-workspace-max" as const]: `${config.maxWidth}px`,
  } as CSSProperties;
}

function readViewportWidth(): number {
  if (typeof window === "undefined") {
    return 1680;
  }

  return Math.round(window.visualViewport?.width ?? window.innerWidth);
}

function isShortDramaModule(module?: RecruitModule): boolean {
  return Boolean(module?.categoryIds.includes("ai-short-drama"));
}

function isShortDramaUnit(unit?: ClientUnit | null): boolean {
  return Boolean(unit && isShortDramaModule(unit.module));
}

function createShortDramaProjectDraft(seed?: Partial<ShortDramaProjectDraft>): ShortDramaProjectDraft {
  return {
    premise: "30 秒霸总反转短剧片段，女主在压迫场景里完成身份翻盘。",
    durationSeconds: 30,
    hook: "开场 3 秒抛出压迫感，结尾 3 秒必须给出身份反转或关系升级。",
    mustHaveMoments: "会议室压迫、电梯拦截、第三方反转、结尾留钩子。",
    heroine: "沈知意｜被压着打的秘书，外冷内韧，情绪克制但底层很强。",
    hero: "陆承洲｜冷面总裁，压迫感强，关键时刻明确站在女主这一边。",
    supportingCast: "项目经理｜甩锅反派；关键客户｜当场认出女主价值，触发剧情翻盘。",
    continuityRule:
      "人物服装、发型和气质必须稳定；男主保持黑西装冷白光，女主保持职业感与强撑状态。",
    ...seed
  };
}

function resolveProjectChannelName(channel: ProjectChatChannel, units: ClientUnit[]): string {
  if (channel.kind === "direct" || channel.kind === "lead") {
    const targetUnit = units.find((unit) => unit.id === channel.memberUnitIds[0]);
    const targetName = targetUnit?.displayName ?? channel.name;

    if (channel.kind === "lead") {
      return `主管 · ${targetName}`;
    }

    return targetName;
  }

  return channel.name;
}

function buildProjectChannels(memberUnitIds: string[], leadUnitId: string, units: ClientUnit[]): ProjectChatChannel[] {
  const uniqueMemberUnitIds = Array.from(new Set(memberUnitIds));
  const lead = units.find((unit) => unit.id === leadUnitId);

  return [
    {
      id: "all-hands",
      name: "项目总群",
      kind: "all-hands",
      memberUnitIds: uniqueMemberUnitIds
    },
    ...(leadUnitId
      ? [
          {
            id: "lead-room",
            name: lead?.displayName ?? "项目主管",
            kind: "lead",
            memberUnitIds: [leadUnitId]
          } satisfies ProjectChatChannel
        ]
      : []),
    ...uniqueMemberUnitIds.map((unitId) => {
      const unit = units.find((entry) => entry.id === unitId);
      return {
        id: `direct:${unitId}`,
        name: unit?.displayName ?? "员工",
        kind: "direct" as const,
        memberUnitIds: [unitId]
      };
    })
  ];
}

function buildProjectBootstrapMessages(
  projectName: string,
  leadUnitId: string,
  memberUnitIds: string[],
  units: ClientUnit[],
  channels: ProjectChatChannel[]
): ProjectChatMessage[] {
  const now = new Date().toISOString();
  const lead = units.find((unit) => unit.id === leadUnitId);
  const leadLabel = lead?.displayName ?? "项目主管";
  const memberLabels = memberUnitIds
    .map((unitId) => units.find((unit) => unit.id === unitId)?.displayName)
    .filter(Boolean)
    .join("、");

  return channels.map((channel, index) => ({
    id: createLocalRecordId("message"),
    channelId: channel.id,
    authorKind: "system",
    authorLabel: "系统",
    body:
      channel.id === "all-hands"
        ? `项目 ${projectName} 已创建。${leadLabel} 已被任命为项目主管，当前参与员工包括：${memberLabels || "待补充"}。后续项目进展默认先向项目主管汇报。`
        : channel.id === "lead-room"
          ? `你现在正在和项目主管 ${leadLabel} 沟通。请把阶段目标、风险和审批点优先同步到这里。`
          : `${resolveProjectChannelName(channel, units)} 已加入项目 ${projectName}。你可以直接单聊，也可以回到项目总群统一推进。`,
    createdAt: new Date(Date.parse(now) + index).toISOString()
  }));
}

function buildProjectBootstrapAssignments(
  categoryId: ProjectCategoryId,
  leadUnitId: string,
  units: ClientUnit[]
): ProjectAssignment[] {
  const now = Date.now();
  const assignmentSeeds: Partial<Record<string, { title: string; summary: string; deliverable: string; priority: ProjectAssignmentPriority }>> = {
    "game-planner-bot": {
      title: "拆核心循环与版本目标",
      summary: "先把玩法核心循环、首周内容目标和验证指标拆清楚，再交给研发和美术同步。",
      deliverable: "系统规划与版本目标",
      priority: "high"
    },
    "game-dev-bot": {
      title: "实现最小玩法原型",
      summary: "基于策划结论搭出可验证的最小原型，明确开发风险与最小交付范围。",
      deliverable: "玩法原型与技术拆解",
      priority: "high"
    },
    "level-design-bot": {
      title: "完成首章关卡路线",
      summary: "拆出第一章路线、遭遇节奏与教学段落，保证新手期可被快速验证。",
      deliverable: "关卡草图与遭遇脚本",
      priority: "medium"
    },
    "tech-art-bot": {
      title: "建立视觉与性能基准",
      summary: "补齐材质、特效和资产流程规则，避免后面开发与美术互相卡住。",
      deliverable: "技术美术规范",
      priority: "medium"
    },
    "art-bot": {
      title: "定角色与场景风格板",
      summary: "先锁风格板和核心资产方向，让研发与策划都有统一视觉参考。",
      deliverable: "风格板与资产清单",
      priority: "medium"
    },
    "design-bot": {
      title: "产出核心界面方向",
      summary: "围绕主流程整理关键页面结构和首屏视觉方向，给交互与品牌视觉做锚点。",
      deliverable: "关键界面方案",
      priority: "high"
    },
    "interaction-bot": {
      title: "梳理主流程与导航",
      summary: "先把 IA、关键交互路径和页面关系梳清，再反向约束界面复杂度。",
      deliverable: "交互流与 IA",
      priority: "high"
    },
    "brand-visual-bot": {
      title: "定品牌视觉基调",
      summary: "补齐品牌主视觉、活动包装和宣传主图的统一方向。",
      deliverable: "品牌视觉板与 KV",
      priority: "medium"
    },
    "user-research-bot": {
      title: "梳理用户洞察",
      summary: "明确目标用户、核心场景和关键痛点，为后续设计和增长提供优先级依据。",
      deliverable: "用户洞察与需求优先级",
      priority: "medium"
    },
    "design-system-bot": {
      title: "建立设计系统规则",
      summary: "把组件、token 和界面规范拉齐，确保后续页面不会越做越散。",
      deliverable: "设计系统规则",
      priority: "medium"
    },
    "growth-design-bot": {
      title: "准备增长转化素材",
      summary: "围绕拉新和转化目标准备活动版位、创意方向和实验方案。",
      deliverable: "增长素材与转化方案",
      priority: "medium"
    },
    "ops-copy-bot": {
      title: "输出首轮文案包",
      summary: "准备活动文案、商店描述或宣发内容，为上线和增长补齐文案侧交付。",
      deliverable: "文案包",
      priority: "low"
    },
    "short-drama-writer-bot": {
      title: "完成第一版剧情与对白",
      summary: "先把三幕结构、关键反转和对白节奏拆清楚，再交给导演和角色线继续推进。",
      deliverable: "剧情大纲与对白草稿",
      priority: "high"
    },
    "short-drama-director-bot": {
      title: "拆镜头与节奏推进",
      summary: "基于剧情定稿镜头推进、段落重心和转场节奏，承担项目主管的统筹工作。",
      deliverable: "镜头清单与导演阐述",
      priority: "high"
    },
    "short-drama-character-bot": {
      title: "完成人物定稿",
      summary: "锁定主角、副角的造型与一致性规则，避免后面人物形象漂移。",
      deliverable: "角色设定与一致性规则",
      priority: "high"
    },
    "short-drama-scene-bot": {
      title: "补齐场景与灯光基调",
      summary: "定稿主场景、空间连续性和光线规则，为视频生成准备统一场景语言。",
      deliverable: "场景设定与灯光规则",
      priority: "medium"
    },
    "short-drama-video-bot": {
      title: "整理出片提示词",
      summary: "把人物设定和分镜清单转成可投喂视频模型的镜头提示词与参数。",
      deliverable: "视频提示词与出片参数",
      priority: "medium"
    },
    "short-drama-voice-bot": {
      title: "设计角色配音节奏",
      summary: "定角色音色、情绪和语速节奏，为成片对白提供声音规则。",
      deliverable: "配音设定与情绪说明",
      priority: "low"
    },
    "short-drama-editor-bot": {
      title: "规划成片节奏与包装",
      summary: "围绕钩子、反转点和收尾节奏给出剪辑与包装建议。",
      deliverable: "剪辑节奏与包装建议",
      priority: "medium"
    }
  };

  const categoryFallbacks: Record<ProjectCategoryId, { title: string; summary: string; deliverable: string }> = {
    "game-creation": {
      title: "推进本轮游戏制作任务",
      summary: "围绕当前项目目标补齐自己职能线的关键交付，并优先向项目主管汇报。",
      deliverable: "本轮专业交付"
    },
    "app-design": {
      title: "推进本轮应用设计任务",
      summary: "围绕当前项目目标补齐自己职能线的关键交付，并优先向项目主管汇报。",
      deliverable: "本轮设计交付"
    },
    "ai-short-drama": {
      title: "推进本轮短剧制作任务",
      summary: "围绕当前项目目标补齐自己职能线的关键交付，并优先向项目主管汇报。",
      deliverable: "本轮短剧交付"
    }
  };

  return units.map((unit, index) => {
    const seed = (unit.module?.id && assignmentSeeds[unit.module.id]) || undefined;
    const fallback = categoryFallbacks[categoryId];
    const createdAt = new Date(now + index * 1_000).toISOString();

    return {
      id: createLocalRecordId("assignment"),
      ownerUnitId: unit.id,
      assignedByUnitId: leadUnitId,
      title: seed?.title ?? `${unit.displayName} 本轮任务`,
      summary: seed?.summary ?? fallback.summary,
      deliverable: seed?.deliverable ?? fallback.deliverable,
      priority: seed?.priority ?? "medium",
      status: "todo",
      reportCount: 0,
      createdAt,
      updatedAt: createdAt
    } satisfies ProjectAssignment;
  });
}

function normalizeDispatchProject(project: DispatchProject, units: ClientUnit[]): DispatchProject {
  const fallbackLeadUnitId = project.workflow?.leadUnitId || project.unitId || "";
  const fallbackMemberUnitIds = Array.from(
    new Set([
      ...(project.workflow?.memberUnitIds ?? []),
      ...(project.unitId ? [project.unitId] : []),
      ...(fallbackLeadUnitId ? [fallbackLeadUnitId] : [])
    ])
  );
  const channels =
    project.workflow?.channels?.length
      ? project.workflow.channels
      : buildProjectChannels(fallbackMemberUnitIds, fallbackLeadUnitId, units);
  const activeChannelId =
    project.workflow?.activeChannelId && channels.some((channel) => channel.id === project.workflow.activeChannelId)
      ? project.workflow.activeChannelId
      : channels[0]?.id ?? "";
  const messages =
    project.workflow?.messages?.length
      ? project.workflow.messages
      : buildProjectBootstrapMessages(project.name, fallbackLeadUnitId, fallbackMemberUnitIds, units, channels);
  const projectUnits = fallbackMemberUnitIds
    .map((unitId) => units.find((unit) => unit.id === unitId) ?? null)
    .filter((unit): unit is ClientUnit => Boolean(unit));
  const assignments =
    project.workflow?.assignments?.length
      ? project.workflow.assignments
      : buildProjectBootstrapAssignments(project.categoryId, fallbackLeadUnitId, projectUnits);
  const outputs = project.workflow?.outputs ?? [];
  const selectedAssignmentId =
    assignments[0]?.id ?? "";

  return {
    ...project,
    executionMode: "employee",
    unitId: fallbackLeadUnitId || fallbackMemberUnitIds[0] || project.unitId,
    workflow: {
      ...project.workflow,
      intentDraft: project.workflow?.intentDraft ?? deriveIntentSeed(project.description),
      taskGoal: project.workflow?.taskGoal ?? project.description,
      shortDramaStage: project.workflow?.shortDramaStage ?? "intake",
      shortDramaDraft: project.workflow?.shortDramaDraft ?? createShortDramaProjectDraft(),
      leadUnitId: fallbackLeadUnitId,
      memberUnitIds: fallbackMemberUnitIds,
      activeChannelId,
      channels,
      messages,
      assignments,
      reports: project.workflow?.reports ?? [],
      outputs,
      selectedAssignmentId
    }
  };
}

function createDispatchProjectRecord(draft: DispatchProjectDraft, unit: ClientUnit, projectUnits: ClientUnit[] = [unit]): DispatchProject {
  const now = new Date().toISOString();
  const seedGoal = deriveIntentSeed(draft.description.trim() || draft.name.trim() || unit.starterTask);
  const shortDramaSeed = draft.description.trim() || seedGoal || draft.name.trim();
  const leadUnitId = draft.leadUnitId || unit.id;
  const memberUnitIds = Array.from(new Set([...(draft.memberUnitIds ?? []), unit.id, leadUnitId]));
  const channels = buildProjectChannels(memberUnitIds, leadUnitId, projectUnits);
  const assignments = buildProjectBootstrapAssignments(draft.categoryId, leadUnitId, projectUnits);

  return {
    id: createLocalRecordId("project"),
    name: draft.name.trim(),
    description: draft.description.trim(),
    categoryId: draft.categoryId,
    executionMode: "employee",
    unitId: leadUnitId,
    hasAccessPassword: false,
    createdAt: now,
    updatedAt: now,
    workflow: {
      intentDraft: seedGoal,
      taskGoal: draft.description.trim() || unit.starterTask,
      shortDramaStage: "intake",
      leadUnitId,
      memberUnitIds,
      activeChannelId: channels[0]?.id ?? "",
      channels,
      messages: buildProjectBootstrapMessages(draft.name.trim(), leadUnitId, memberUnitIds, projectUnits, channels),
      assignments,
      reports: [],
      outputs: [],
      selectedAssignmentId: assignments[0]?.id ?? "",
      shortDramaDraft: createShortDramaProjectDraft({
        ...(shortDramaSeed ? { premise: shortDramaSeed } : {}),
        durationSeconds: extractTargetDurationFromText(shortDramaSeed) ?? 30
      })
    }
  };
}

function buildShortDramaWorkflowBrief(draft: ShortDramaProjectDraft, unit: ClientUnit): string {
  const isStudioLine = unit.module?.id === "short-drama-studio-team";
  const laneInstruction = isStudioLine
    ? "你负责把人物设定定稿，并承接编导线结果完成镜头包装、人物一致性和视频生成交接。"
    : "你负责剧情钩子、人物关系、对白节奏、分镜拆解与转场逻辑，不要跳过剧情搭建直接谈出片。";

  return [
    `${unit.displayName} 短剧项目任务单`,
    "",
    `项目目标：${draft.premise}`,
    `目标时长：${draft.durationSeconds} 秒`,
    `当前职能线：${unit.displayName}`,
    "",
    "一、项目立项",
    `- 强钩子：${draft.hook}`,
    `- 必须发生的剧情节点：${draft.mustHaveMoments}`,
    "",
    "二、人物定稿",
    `- 女主：${draft.heroine}`,
    `- 男主 / 对手：${draft.hero}`,
    `- 副角与推动人物：${draft.supportingCast}`,
    `- 一致性规则：${draft.continuityRule}`,
    "",
    "三、执行要求",
    `- ${laneInstruction}`,
    "- 输出时必须显式区分：人物设定、三幕节奏、关键对白、镜头清单、转场说明。",
    "- 如果你是编导线，最后要给出可以交给制作线继续出片的接力说明。",
    "- 如果你是制作线，必须先确认人物设定与镜头逻辑，再进入视频生成步骤。",
    "",
    "四、最终交付",
    "- 先给本轮结论，再给结构化内容，不要空泛描述。",
    "- 标出需要我审批的节点，以及是否可以直接进入视频制作。",
    "- 如果当前信息不足，请优先提出缺失项，而不是强行出片。"
  ].join("\n");
}

function deriveShortDramaSuggestedStage(
  unit: ClientUnit | null,
  deliverable?: Deliverable,
  session?: VideoGenerationSession
): ShortDramaStageId {
  if (session?.status === "completed" || session?.status === "partial") {
    return "review";
  }

  if (session) {
    return "video";
  }

  if (deliverable?.content?.kind === "short_drama_pack") {
    return "storyboard";
  }

  if (unit?.module?.id === "short-drama-studio-team") {
    return "characters";
  }

  return "intake";
}

function parseShortDramaCharacterCards(lines: string[]): ShortDramaCharacterCard[] {
  return lines
    .map((line, index) => {
      const [name = "", role = "", summary = ""] = line.split("｜").map((item) => item.trim());
      const normalizedName = name || `角色 ${index + 1}`;

      return {
        id: `${normalizedName}-${index}`,
        name: normalizedName,
        role: role || "角色设定",
        summary: summary || line
      };
    })
    .filter((item) => item.name.trim());
}

function buildShortDramaTimeline(
  handoff?: DeliverableVideoHandoff,
  session?: VideoGenerationSession
): ShortDramaTimelineScene[] {
  if (!handoff) {
    return [];
  }

  let cursor = 0;

  return handoff.scenes.map((scene) => {
    const clip = session?.clips.find((item) => item.sceneId === scene.id);
    const timelineScene = {
      id: scene.id,
      title: scene.title,
      durationSeconds: scene.durationSeconds,
      startSecond: cursor,
      endSecond: cursor + scene.durationSeconds,
      visualGoal: scene.visualGoal,
      prompt: scene.prompt,
      ...(scene.dialogue ? { dialogue: scene.dialogue } : {}),
      ...(clip ? { clip } : {})
    } satisfies ShortDramaTimelineScene;

    cursor += scene.durationSeconds;
    return timelineScene;
  });
}

function characterLibraryStorageKey(organizationId: string): string {
  return `${CHARACTER_LIBRARY_STORAGE_PREFIX}:${organizationId || "local"}`;
}

function sceneReviewStorageKey(organizationId: string, taskId: string, deliverableId: string): string {
  return `${SCENE_REVIEW_STORAGE_PREFIX}:${organizationId || "local"}:${taskId}:${deliverableId}`;
}

function dispatchProjectStorageKey(organizationId: string): string {
  return `${DISPATCH_PROJECT_STORAGE_PREFIX}:${organizationId || "local"}`;
}

function dispatchActiveProjectStorageKey(organizationId: string): string {
  return `${DISPATCH_ACTIVE_PROJECT_STORAGE_PREFIX}:${organizationId || "local"}`;
}

function createLocalRecordId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDispatchProjectDraft(seed?: Partial<DispatchProjectDraft>): DispatchProjectDraft {
  return {
    name: "",
    categoryId: "ai-short-drama",
    description: "",
    memberUnitIds: [],
    leadUnitId: "",
    ...seed
  };
}

function createProjectAssignmentDraft(seed?: Partial<ProjectAssignmentDraft>): ProjectAssignmentDraft {
  return {
    ownerUnitId: "",
    title: "",
    summary: "",
    deliverable: "",
    priority: "medium",
    ...seed
  };
}

function projectCategoryLabel(categoryId: ProjectCategoryId): string {
  return recruitCategories.find((category) => category.id === categoryId)?.title ?? categoryId;
}

function projectAssignmentPriorityLabel(priority: ProjectAssignmentPriority): string {
  switch (priority) {
    case "high":
      return "高优先级";
    case "medium":
      return "中优先级";
    case "low":
      return "低优先级";
  }
}

function projectAssignmentStatusLabel(status: ProjectAssignmentStatus): string {
  switch (status) {
    case "todo":
      return "待开始";
    case "in_progress":
      return "进行中";
    case "review":
      return "待主管查看";
    case "blocked":
      return "已阻塞";
    case "done":
      return "已完成";
  }
}

function projectAssignmentStatusTone(status: ProjectAssignmentStatus): "neutral" | "good" | "warm" {
  switch (status) {
    case "done":
      return "good";
    case "review":
    case "blocked":
      return "warm";
    default:
      return "neutral";
  }
}

function buildProjectLeadSummary(project: DispatchProject, units: ClientUnit[]) {
  const assignments = project.workflow.assignments ?? [];
  const reports = [...(project.workflow.reports ?? [])].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );
  const blockedAssignments = assignments.filter((assignment) => assignment.status === "blocked");
  const reviewAssignments = assignments.filter((assignment) => assignment.status === "review");
  const inProgressAssignments = assignments.filter((assignment) => assignment.status === "in_progress");
  const completedAssignments = assignments.filter((assignment) => assignment.status === "done");
  const recentReport = reports[0] ?? null;
  const recentReporter =
    recentReport ? units.find((unit) => unit.id === recentReport.authorUnitId)?.displayName ?? "员工" : null;

  return {
    completedCount: completedAssignments.length,
    inProgressCount: inProgressAssignments.length,
    blockedCount: blockedAssignments.length,
    reviewCount: reviewAssignments.length,
    headline: blockedAssignments.length
      ? `${blockedAssignments.length} 个任务阻塞，主管需要优先拆风险。`
      : reviewAssignments.length
        ? `${reviewAssignments.length} 个任务进入待主管查看。`
        : completedAssignments.length
          ? `${completedAssignments.length} 个任务已完成，项目正在稳定推进。`
          : "项目已建立，接下来由主管继续拆任务。",
    detail: recentReport
      ? `${recentReporter} 最新汇报：${recentReport.summary}`
      : "当前还没有员工汇报，建议主管先派发第一轮任务。"
  };
}

type ProjectChatIntent = "availability" | "discussion" | "progress" | "execution";

function classifyProjectChatIntent(text: string): ProjectChatIntent {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  if (/在吗|在不在|收到吗|hello|hi|ping/.test(normalized) && normalized.length <= 16) {
    return "availability";
  }

  if (/进展|到哪了|什么情况|卡在哪|汇报|同步一下|做完了吗|状态/.test(normalized)) {
    return "progress";
  }

  if (/开始执行|开始做|现在开始|立刻开始|马上开始|先做|请做|请先做|推进|产出|输出|整理|给我出|负责完成/.test(normalized)) {
    return "execution";
  }

  return "discussion";
}

function summarizeProjectChatRequest(text: string): string {
  const lead = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/[。！？!?；;\n]/)[0]
    ?.trim();

  if (!lead) {
    return "当前目标";
  }

  return lead.length > 28 ? `${lead.slice(0, 28)}…` : lead;
}

function deriveEmployeeExecutionSteps(unit: ClientUnit | null): string[] {
  switch (unit?.module?.id) {
    case "short-drama-director-bot":
      return ["先拆镜头推进与段落重心", "再确认各岗位接棒顺序和风险节点"];
    case "short-drama-writer-bot":
      return ["先把 premise、三幕结构和反转点写稳", "再补关键对白和结尾钩子"];
    case "short-drama-character-bot":
      return ["先锁主角与副角的人设", "再统一服装、造型和一致性规则"];
    case "short-drama-scene-bot":
      return ["先定核心场景和空间关系", "再统一布景元素与光线气质"];
    case "short-drama-video-bot":
      return ["先整理镜头提示词与出片参数", "再生成样片并回报风险"];
    case "short-drama-voice-bot":
      return ["先定角色音色和情绪节奏", "再细化对白配音方案"];
    case "short-drama-editor-bot":
      return ["先拉齐钩子与反转节奏", "再做终版包装与成片建议"];
    case "design-bot":
      return ["先梳理界面层级与关键页面", "再补视觉方向和组件规则"];
    case "game-dev-bot":
      return ["先搭可验证的最小原型", "再拆技术风险和下一步开发范围"];
    default:
      return ["先确认目标和交付边界", "再按岗位能力拆出本轮可落地内容"];
  }
}

function buildConversationDrivenAssignment(
  text: string,
  ownerUnit: ClientUnit,
  leadUnitId: string,
  now: string
): ProjectAssignment {
  const summary = summarizeProjectChatRequest(text);
  const trimmedTitle = summary.replace(/^(请|先|现在|马上|立刻|帮我|你来|开始执行|开始)/, "").trim();
  const title = trimmedTitle || `${ownerUnit.displayName} 对话任务`;
  const priority: ProjectAssignmentPriority = /马上|立刻|紧急|今天内|尽快/.test(text) ? "high" : "medium";

  return {
    id: createLocalRecordId("assignment"),
    ownerUnitId: ownerUnit.id,
    assignedByUnitId: leadUnitId,
    title,
    summary: text.trim(),
    deliverable: ownerUnit.outputs[0] ?? "本轮交付",
    priority,
    status: "in_progress",
    reportCount: 0,
    createdAt: now,
    updatedAt: now
  };
}

function deriveExecutionDraftStageMeta(unit: ClientUnit | null): {
  stageId: string;
  stageTitle: string;
  deliverableLabel: string;
  sectionTitles: string[];
} {
  switch (unit?.module?.id) {
    case "short-drama-director-bot":
      return {
        stageId: "direction",
        stageTitle: "导演统筹",
        deliverableLabel: "导演统筹稿",
        sectionTitles: ["导演判断", "镜头推进", "接棒安排"]
      };
    case "short-drama-writer-bot":
      return {
        stageId: "script",
        stageTitle: "剧本对白",
        deliverableLabel: "剧本对白稿",
        sectionTitles: ["剧情 premise", "三幕结构", "关键对白"]
      };
    case "short-drama-character-bot":
      return {
        stageId: "character",
        stageTitle: "角色定稿",
        deliverableLabel: "角色定稿包",
        sectionTitles: ["主副角设定", "服装与造型", "一致性规则"]
      };
    case "short-drama-scene-bot":
      return {
        stageId: "scene",
        stageTitle: "场景设定",
        deliverableLabel: "场景设定稿",
        sectionTitles: ["核心场景", "空间关系", "光线与布景"]
      };
    case "short-drama-video-bot":
      return {
        stageId: "video",
        stageTitle: "视频生成",
        deliverableLabel: "视频生成包",
        sectionTitles: ["镜头提示词", "出片参数", "样片验证"]
      };
    case "short-drama-voice-bot":
      return {
        stageId: "voice",
        stageTitle: "配音录入",
        deliverableLabel: "配音方案稿",
        sectionTitles: ["角色音色", "情绪节奏", "对白试音建议"]
      };
    case "short-drama-editor-bot":
      return {
        stageId: "edit",
        stageTitle: "剪辑成片",
        deliverableLabel: "剪辑包装稿",
        sectionTitles: ["节奏方案", "包装建议", "终版风险"]
      };
    default:
      return {
        stageId: "generic",
        stageTitle: "阶段推进",
        deliverableLabel: "阶段草稿",
        sectionTitles: ["本轮判断", "执行路径", "下一步交接"]
      };
  }
}

function buildLocalExecutionDraft(
  text: string,
  unit: ClientUnit,
  leadName: string
): ProjectChatExecutionDraft {
  const summary = summarizeProjectChatRequest(text);
  const stageMeta = deriveExecutionDraftStageMeta(unit);
  const [firstSectionTitle = "本轮判断", secondSectionTitle = "执行路径", thirdSectionTitle = "下一步交接"] =
    stageMeta.sectionTitles;
  let sections: ProjectChatExecutionDraft["sections"];
  let nextActions: string[];
  let summaryText: string;

  switch (stageMeta.stageId) {
    case "direction":
      summaryText = `${unit.displayName} 已进入导演统筹阶段，会先拆节奏重心、镜头推进和岗位接棒顺序。`;
      sections = [
        {
          title: firstSectionTitle,
          bullets: [`本轮导演判断围绕「${summary}」建立冲突重心。`, "优先让前三秒就出现关系和冲突。"]
        },
        {
          title: secondSectionTitle,
          bullets: ["先拆开场钩子、中段对撞、结尾反扣。", "镜头推进以近景冲突和快切反应为主。"]
        },
        {
          title: thirdSectionTitle,
          bullets: [`先向项目主管 ${leadName} 汇报统筹稿。`, "确认后交给编剧和角色设计继续接棒。"]
        }
      ];
      nextActions = ["输出导演统筹稿。", "主管确认后进入剧本与角色阶段。"];
      break;
    case "script":
      summaryText = `${unit.displayName} 已开始写第一轮剧本对白，会先稳 premise、人物关系和反转句。`;
      sections = [
        {
          title: firstSectionTitle,
          bullets: [`本轮剧情围绕「${summary}」统一 premise。`, "先锁人物诉求和必须发生的正面对撞。"]
        },
        {
          title: secondSectionTitle,
          bullets: ["按开场钩子、关系升级、结尾反转拆成三段。", "每一段都保留可直接转镜头的动作/对白点。"]
        },
        {
          title: thirdSectionTitle,
          bullets: ["先写开场钩子对白和结尾反杀对白。", `完成后先交 ${leadName} 审看，再同步导演。`]
        }
      ];
      nextActions = ["输出一版对白草稿。", "主管确认后转导演和配音继续推进。"];
      break;
    case "character":
      summaryText = `${unit.displayName} 已进入角色定稿，会先锁辨识度和一致性规则。`;
      sections = [
        {
          title: firstSectionTitle,
          bullets: ["主角、副角、反派先拉开气质差异。", `角色设定都要服务于「${summary}」这一核心冲突。`]
        },
        {
          title: secondSectionTitle,
          bullets: ["先定主角服装或道具识别点。", "副角与反派避免抢同一视觉重心。"]
        },
        {
          title: thirdSectionTitle,
          bullets: ["统一发型、主色、饰品与表情控制。", `先交 ${leadName} 审看，再放给视频生成使用。`]
        }
      ];
      nextActions = ["输出主副角角色卡。", "主管确认后交场景和视频岗位。"];
      break;
    case "scene":
      summaryText = `${unit.displayName} 已开始搭第一轮场景方案，会先锁核心空间和光线基调。`;
      sections = [
        {
          title: firstSectionTitle,
          bullets: ["优先锁 1-2 个最能承载冲突的核心空间。", `场景必须直接服务「${summary}」的戏剧表达。`]
        },
        {
          title: secondSectionTitle,
          bullets: ["先明确人物进出和对撞发生的位置。", "避免背景切换过多造成镜头连续性问题。"]
        },
        {
          title: thirdSectionTitle,
          bullets: ["先定主光、辅光和关键布景符号。", `完成后先向 ${leadName} 汇报再交视频岗位。`]
        }
      ];
      nextActions = ["输出场景板与空间说明。", "主管确认后进入视频样片阶段。"];
      break;
    case "video":
      summaryText = `${unit.displayName} 已开始整理视频生成包，会先做第一轮样片和参数验证。`;
      sections = [
        {
          title: firstSectionTitle,
          bullets: ["先整理开场钩子、主冲突和结尾反扣三个关键镜头。", `镜头提示词都围绕「${summary}」保持统一。`]
        },
        {
          title: secondSectionTitle,
          bullets: ["先锁角色一致性、画幅比例和运动方式。", "第一轮优先低成本样片验证，再决定整段出片。"]
        },
        {
          title: thirdSectionTitle,
          bullets: ["优先验证角色稳定性和表情表现。", `样片结果先向 ${leadName} 回报，再批量推进。`]
        }
      ];
      nextActions = ["输出样片与参数说明。", "主管确认后进入整段视频生成。"];
      break;
    case "voice":
      summaryText = `${unit.displayName} 已开始配音方案，会先拆角色音色与情绪节奏。`;
      sections = [
        {
          title: firstSectionTitle,
          bullets: ["主角与反派先拉开年龄感和控制感差异。", `声音设计要强化「${summary}」的情绪对撞。`]
        },
        {
          title: secondSectionTitle,
          bullets: ["开场语速更快，中段压情绪，结尾反转留停顿。", "对白节奏以可直接卡剪辑点为准。"]
        },
        {
          title: thirdSectionTitle,
          bullets: ["先做关键对白试音，再补完整台词轨。", `试音通过后再向 ${leadName} 汇报完整录制方案。`]
        }
      ];
      nextActions = ["输出角色声线方案。", "主管确认后同步给剪辑师。"];
      break;
    case "edit":
      summaryText = `${unit.displayName} 已开始做第一轮剪辑包装，会先稳住前三秒钩子和结尾反扣。`;
      sections = [
        {
          title: firstSectionTitle,
          bullets: ["前三秒直接见冲突，不做慢启动铺垫。", `整段节奏围绕「${summary}」的强情绪推进。`]
        },
        {
          title: secondSectionTitle,
          bullets: ["重点补强标题卡、音效点和反转时的节奏停顿。", "结尾必须留下追更欲望。"]
        },
        {
          title: thirdSectionTitle,
          bullets: ["优先关注信息过载、镜头重复和情绪断档。", `成片建议先汇报给 ${leadName} 再决定是否发给 CEO。`]
        }
      ];
      nextActions = ["输出粗剪节奏稿。", "主管确认后进入终版包装。"];
      break;
    default: {
      const steps = deriveEmployeeExecutionSteps(unit);
      const [firstStep = "先确认目标和交付边界", secondStep = "再按岗位能力拆出本轮可落地内容"] = steps;
      summaryText = `${unit.displayName} 已围绕「${summary}」启动第一轮执行，当前会先从 ${firstStep} 切入。`;
      sections = [
        {
          title: firstSectionTitle,
          bullets: [`本轮要点围绕「${summary}」展开。`, `${unit.displayName} 会先判断当前目标是否足够可执行。`]
        },
        {
          title: secondSectionTitle,
          bullets: [firstStep, secondStep]
        },
        {
          title: thirdSectionTitle,
          bullets: [`先向项目主管 ${leadName} 汇报阶段结果。`, "需要 CEO 拍板时再升级到主管频道。"]
        }
      ];
      nextActions = [`${unit.displayName} 输出第一轮 ${stageMeta.stageTitle} 草稿。`, `${leadName} 审看后决定是否推进下一阶段。`];
    }
  }

  return {
    stageId: stageMeta.stageId,
    stageTitle: stageMeta.stageTitle,
    deliverableTitle: `${unit.displayName} · ${stageMeta.deliverableLabel}`,
    summary: summaryText,
    sections,
    nextActions,
    needsReview: true
  };
}

function buildProjectExecutionArtifact(
  draft: ProjectChatExecutionDraft,
  assignment: ProjectAssignment,
  ownerUnitId: string,
  now: string
): ProjectExecutionArtifact {
  return {
    id: createLocalRecordId("artifact"),
    assignmentId: assignment.id,
    ownerUnitId,
    stageId: draft.stageId,
    stageTitle: draft.stageTitle,
    title: draft.deliverableTitle,
    summary: draft.summary,
    sections: draft.sections,
    nextActions: draft.nextActions,
    needsReview: draft.needsReview,
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
}

function mapExecutionDraftStageToProjectStage(stageId: string): ShortDramaStageId | null {
  switch (stageId) {
    case "direction":
      return "intake";
    case "character":
      return "characters";
    case "script":
    case "scene":
      return "storyboard";
    case "video":
    case "voice":
      return "video";
    case "edit":
      return "review";
    default:
      return null;
  }
}

function updateProjectExecutionArtifactFromReport(
  artifact: ProjectExecutionArtifact,
  report: ProjectAssignmentReport
): ProjectExecutionArtifact {
  return {
    ...artifact,
    summary: report.summary,
    nextActions: artifact.nextActions.map((action, index) =>
      index === 0 ? `已同步最新回报：${report.summary}` : action
    ),
    status: "updated",
    updatedAt: report.createdAt
  };
}

function buildEmployeeProgressReply(
  project: DispatchProject,
  unit: ClientUnit,
  leadName: string
): string {
  const ownedAssignments = project.workflow.assignments.filter((assignment) => assignment.ownerUnitId === unit.id);
  const latestReport =
    project.workflow.reports.find((report) => report.authorUnitId === unit.id) ??
    null;

  if (!ownedAssignments.length) {
    return `${unit.displayName}：我这边还没有收到正式派工。你如果只是想先讨论方向，我可以先给建议；如果要我开工，直接告诉我“开始执行 + 目标/交付/时间”，我会先判断再开始，并同步给项目主管 ${leadName}。`;
  }

  const inProgressCount = ownedAssignments.filter((assignment) => assignment.status === "in_progress").length;
  const blockedCount = ownedAssignments.filter((assignment) => assignment.status === "blocked").length;
  const reviewCount = ownedAssignments.filter((assignment) => assignment.status === "review").length;
  const doneCount = ownedAssignments.filter((assignment) => assignment.status === "done").length;
  const latestAssignment = [...ownedAssignments].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  )[0];

  const snapshot = [
    inProgressCount ? `${inProgressCount} 项执行中` : null,
    reviewCount ? `${reviewCount} 项待主管查看` : null,
    blockedCount ? `${blockedCount} 项阻塞` : null,
    doneCount ? `${doneCount} 项已完成` : null
  ]
    .filter(Boolean)
    .join("，");

  return `${unit.displayName}：我先同步一下当前状态。${snapshot || "目前还在待启动阶段"}。最近一条重点是「${
    latestReport?.summary ?? latestAssignment?.title ?? "暂无最新进展"
  }」。如果你要我直接推进下一步，给我一句明确执行指令就行，我会按这条继续往下做。`;
}

function buildEmployeeDiscussionReply(
  text: string,
  unit: ClientUnit,
  leadName: string
): string {
  const summary = summarizeProjectChatRequest(text);
  const steps = deriveEmployeeExecutionSteps(unit);

  return `${unit.displayName}：我先理解一下，你现在更在意的是「${summary}」。从我的岗位看，我会优先 ${steps[0]}，然后 ${steps[1]}。如果你现在只是想聊方向，我可以继续帮你细化；如果你要我正式开工，直接说“开始执行”，我就会把它转成当前任务并同步给项目主管 ${leadName}。`;
}

function buildEmployeeExecutionReply(
  text: string,
  unit: ClientUnit,
  leadName: string
): string {
  const summary = summarizeProjectChatRequest(text);
  const steps = deriveEmployeeExecutionSteps(unit);

  return `${unit.displayName}：我已经判断过你的要求，当前执行目标是「${summary}」。我现在开始推进，先 ${steps[0]}，再 ${steps[1]}。执行中的阶段进展会先同步给项目主管 ${leadName}，你在这里也能随时追问我。`;
}

function buildLeadChannelReply(
  project: DispatchProject,
  intent: ProjectChatIntent,
  leadName: string,
  body: string,
  units: ClientUnit[]
): string {
  if (intent === "availability") {
    return `${leadName}：我在。你可以直接把目标、优先级或者风险告诉我；如果要我正式开工拆任务，直接说“开始执行”，我会先判断再分派。`;
  }

  if (intent === "progress") {
    const summary = buildProjectLeadSummary(project, units);
    return `${leadName}：我先给你一个主管视角的汇总。${summary.headline}${summary.detail ? ` ${summary.detail}` : ""}`;
  }

  if (intent === "execution") {
    const summary = summarizeProjectChatRequest(body);
    return `${leadName}：我理解你的要求是「${summary}」。我现在会先拆负责人、交付物和风险节点，再把第一轮任务分发给对应员工。后续你主要看我这里的汇总，不需要逐个追员工。`;
  }

  return `${leadName}：我先理解一下，你现在是在讨论「${summarizeProjectChatRequest(body)}」。如果你想先聊方案，我可以先给你拆路径；如果已经确定，就直接告诉我“开始执行”，我再正式拉起这轮推进。`;
}

function buildGroupChannelReply(
  intent: ProjectChatIntent,
  leadName: string,
  body: string,
  groupMembers: string
): string {
  if (intent === "availability") {
    return `${leadName}：总群在线。当前参与成员有 ${groupMembers || "项目成员"}，你可以继续点名某位员工，也可以让我先统一协调。`;
  }

  if (intent === "progress") {
    return `${leadName}：我会先在群里拉齐一次最新进度，再把阻塞点和下一步动作汇总给你。`;
  }

  if (intent === "execution") {
    return `${leadName}：收到，这条我会先判断涉及哪些岗位，再把任务拆到群内相关员工。你真正需要盯的是节点、风险和最终结果，我会在这里统一回你。`;
  }

  return `${leadName}：我先理解你的意思是「${summarizeProjectChatRequest(body)}」。如果这条还在讨论阶段，我们先在群里对齐；如果你要正式开始，就直接说“开始执行”，我来带大家进入推进。`;
}

const shortDramaPipelineSteps: ShortDramaPipelineStep[] = [
  {
    id: "direction",
    title: "导演统筹",
    ownerRole: "AI 导演 / 项目主管",
    summary: "负责节奏拆解、任务接棒顺序和阶段性汇报。",
    moduleIds: ["short-drama-director-bot"]
  },
  {
    id: "script",
    title: "剧本对白",
    ownerRole: "AI 编剧",
    summary: "负责 premise、人物关系、对白节奏和反转设计。",
    moduleIds: ["short-drama-writer-bot"]
  },
  {
    id: "character",
    title: "角色定稿",
    ownerRole: "AI 角色设计师",
    summary: "锁定主角、副角的人设、服装与形象一致性。",
    moduleIds: ["short-drama-character-bot"]
  },
  {
    id: "scene",
    title: "场景设定",
    ownerRole: "AI 场景设计师",
    summary: "统一场景气质、空间连续性、布景元素和光线规则。",
    moduleIds: ["short-drama-scene-bot"]
  },
  {
    id: "video",
    title: "视频生成",
    ownerRole: "AI 视频生成师",
    summary: "把人物、分镜和镜头参数转成可执行的视频生成包。",
    moduleIds: ["short-drama-video-bot"]
  },
  {
    id: "voice",
    title: "配音录入",
    ownerRole: "AI 配音师",
    summary: "定义角色音色、情绪和对白节奏，补齐声音层信息。",
    moduleIds: ["short-drama-voice-bot"]
  },
  {
    id: "edit",
    title: "剪辑成片",
    ownerRole: "AI 剪辑师",
    summary: "围绕钩子、反转点和收尾节奏完成终版包装。",
    moduleIds: ["short-drama-editor-bot"]
  }
];

function shortDramaStageToPipelineIndex(stageId: ShortDramaStageId): number {
  switch (stageId) {
    case "intake":
      return 0;
    case "characters":
      return 2;
    case "storyboard":
      return 1;
    case "video":
      return 4;
    case "review":
      return 6;
  }
}

function formatProjectFlowStatus(status: ProjectFlowStatus): string {
  switch (status) {
    case "active":
      return "当前推进";
    case "ready":
      return "可接棒";
    case "missing":
      return "缺岗位";
    case "upcoming":
      return "待接入";
  }
}

function projectFlowStatusTone(status: ProjectFlowStatus): "good" | "neutral" | "warm" {
  switch (status) {
    case "active":
    case "ready":
      return "good";
    case "missing":
      return "warm";
    default:
      return "neutral";
  }
}

function buildDispatchProjectMarker(projectName: string): string {
  return `【项目：${projectName.trim()}】`;
}

function stripDispatchProjectMarker(projectName: string, text: string): string {
  const marker = buildDispatchProjectMarker(projectName);

  if (!text.startsWith(marker)) {
    return text;
  }

  return text.slice(marker.length).trimStart();
}

function textBelongsToProject(text: string | undefined, project: DispatchProject): boolean {
  const normalizedText = (text ?? "").toLowerCase();
  const normalizedName = project.name.trim().toLowerCase();
  const normalizedMarker = buildDispatchProjectMarker(project.name).toLowerCase();

  return normalizedText.includes(normalizedName) || normalizedText.includes(normalizedMarker);
}

function taskBelongsToProject(task: Task, project: DispatchProject): boolean {
  return textBelongsToProject(task.title, project) || textBelongsToProject(task.businessGoal, project);
}

function approvalBelongsToProject(approval: ApprovalItem, project: DispatchProject): boolean {
  return textBelongsToProject(approval.title, project) || textBelongsToProject(approval.summary, project);
}

function deliverableBelongsToProject(deliverable: Deliverable, project: DispatchProject, tasks?: Task[]): boolean {
  return (
    textBelongsToProject(deliverable.title, project) ||
    textBelongsToProject(deliverable.summary, project) ||
    Boolean(tasks?.some((task) => task.id === deliverable.taskId && taskBelongsToProject(task, project)))
  );
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function mergeCharacterAssets(
  current: ShortDramaCharacterAsset[],
  incoming: ShortDramaCharacterAsset[]
): ShortDramaCharacterAsset[] {
  const assetMap = new Map<string, ShortDramaCharacterAsset>();

  [...incoming, ...current].forEach((asset) => {
    const normalizedKey = `${asset.name.trim().toLowerCase()}::${asset.role.trim().toLowerCase()}`;

    if (!assetMap.has(normalizedKey)) {
      assetMap.set(normalizedKey, asset);
    }
  });

  return Array.from(assetMap.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function extractTargetDurationFromText(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(?:秒|s|sec|seconds?)/i);

  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);

  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.max(15, Math.min(90, value));
}

function resolveDeliverableType(unit: ClientUnit): string {
  if (unit.module?.categoryIds.includes("ai-short-drama")) {
    return "short_drama_video_pack";
  }

  return "bot_delivery_pack";
}

function buildTaskConstraints(unit: ClientUnit, businessGoal: string): Record<string, unknown> {
  const constraints: Record<string, unknown> = {
    clientUnitName: unit.displayName
  };

  if (unit.module) {
    constraints.clientModuleId = unit.module.id;
    constraints.clientModuleTitle = unit.module.title;
    constraints.recruitCategoryId = unit.module.categoryIds[0] ?? "all";
    constraints.recruitFocusIds = unit.module.focusIds;
  }

  if (unit.module?.categoryIds.includes("ai-short-drama")) {
    constraints.workflowType = "short_drama";
    constraints.preferredVideoProvider = "视频生成器";
    constraints.shortDramaUnitMode =
      unit.module.id === "short-drama-studio-team" ? "studio" : "writer";
    constraints.targetDurationSeconds = extractTargetDurationFromText(businessGoal) ?? 30;
  }

  return constraints;
}

function buildApprovalDigest(approval: ApprovalItem) {
  const segments = approval.summary
    .split(/[。！？\n]/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lead = segments[0] ?? "当前草稿已经形成，等待你做人工判断。";
  const fallbackRisk =
    approval.stage === "draft_review"
      ? "方向已经成型，但范围和优先级仍需要你拍板。"
      : "当前节点涉及继续执行前的人为判断。";
  const risk =
    segments.find((segment) =>
      ["风险", "问题", "需要", "确认", "预算", "修改", "聚焦", "视觉", "剧情"].some((keyword) =>
        segment.includes(keyword)
      )
    ) ?? fallbackRisk;
  const nextAction =
    approval.stage === "draft_review"
      ? "如果方向正确，建议批准，让系统继续推进正式交付。"
      : "如果当前内容已经足够清晰，建议批准；否则驳回并要求系统聚焦重做。";

  return {
    lead,
    risk,
    nextAction
  };
}

function scoreModuleAgainstIntent(module: RecruitModule, intent: string) {
  const normalizedIntent = intent.trim().toLowerCase();
  if (!normalizedIntent) {
    return {
      matches: [],
      score: 0
    };
  }

  const matches = module.signalWords.filter((keyword) => normalizedIntent.includes(keyword.toLowerCase()));
  let score = matches.length * 5;

  if (normalizedIntent.includes(module.title.toLowerCase())) {
    score += 4;
  }

  if (normalizedIntent.includes(module.strap.toLowerCase())) {
    score += 2;
  }

  return {
    matches: Array.from(new Set(matches)).slice(0, 3),
    score
  };
}

function extractSummaryLines(summary: string): string[] {
  return summary
    .split(/\n|(?<=[。！？])/u)
    .map((line) => line.replace(/^[\-\d.\s]+/, "").trim())
    .filter(Boolean);
}

function flattenSectionLines(section?: DeliverableContentSection): string[] {
  if (!section) {
    return [];
  }

  const lines = [...(section.lines ?? [])];

  if (section.body) {
    lines.unshift(section.body);
  }

  return lines.filter(Boolean);
}

function buildVideoHandoffExportText(handoff: DeliverableVideoHandoff): string {
  return [
    `${handoff.provider} 接力包`,
    `模式：${handoff.mode}`,
    `状态：${handoff.status}`,
    `时长：${handoff.durationSeconds} 秒`,
    `画幅：${handoff.aspectRatio}`,
    `风格：${handoff.visualStyle}`,
    `说明：${handoff.note}`,
    "",
    "主提示词：",
    handoff.masterPrompt,
    "",
    handoff.negativePrompt ? `负面提示词：${handoff.negativePrompt}` : "",
    "",
    "镜头清单：",
    ...handoff.scenes.map(
      (scene, index) =>
        `${index + 1}. ${scene.title} (${scene.durationSeconds}s)\n视觉目标：${scene.visualGoal}\n提示词：${scene.prompt}${
          scene.dialogue ? `\n对白：${scene.dialogue}` : ""
        }`
    )
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStructuredDeliverableExportText(content: DeliverableContent): string {
  return [
    content.headline ?? "结构化交付包",
    "",
    ...content.sections.flatMap((section) => [
      section.title,
      ...flattenSectionLines(section),
      ""
    ]),
    ...(content.nextActions?.length
      ? ["下一步：", ...content.nextActions.map((action, index) => `${index + 1}. ${action}`), ""]
      : []),
    ...(content.videoHandoff ? [buildVideoHandoffExportText(content.videoHandoff)] : [])
  ].join("\n");
}

function videoSessionKey(taskId: string, deliverableId: string): string {
  return `${taskId}:${deliverableId}`;
}

function formatVideoGenerationStatus(status: VideoGenerationSession["status"]): string {
  switch (status) {
    case "submitted":
      return "已提交";
    case "processing":
      return "生成中";
    case "partial":
      return "部分完成";
    case "completed":
      return "已完成";
    case "failed":
      return "生成失败";
    default:
      return "待提交";
  }
}

function videoGenerationStatusTone(
  status: VideoGenerationSession["status"]
): "neutral" | "good" | "warm" {
  switch (status) {
    case "completed":
      return "good";
    case "failed":
    case "partial":
      return "warm";
    default:
      return "neutral";
  }
}

function formatVideoClipStatus(status: NonNullable<VideoGenerationSession["clips"][number]["status"]>): string {
  switch (status) {
    case "submitted":
      return "排队中";
    case "processing":
      return "生成中";
    case "succeeded":
      return "已回传";
    case "failed":
      return "失败";
    default:
      return "待提交";
  }
}

function videoClipStatusTone(
  status: NonNullable<VideoGenerationSession["clips"][number]["status"]>
): "neutral" | "good" | "warm" {
  switch (status) {
    case "succeeded":
      return "good";
    case "failed":
      return "warm";
    default:
      return "neutral";
  }
}

function reviewDecisionTone(status: ShortDramaSceneReviewDecision["status"]): "neutral" | "good" | "warm" {
  switch (status) {
    case "approved":
      return "good";
    case "rework":
      return "warm";
    default:
      return "neutral";
  }
}

function formatReviewDecisionStatus(status: ShortDramaSceneReviewDecision["status"]): string {
  switch (status) {
    case "approved":
      return "通过";
    case "rework":
      return "重做";
    default:
      return "搁置";
  }
}

function buildResultInspector(item: ResultFeedItem) {
  const content = item.deliverable?.content;

  if (content?.kind === "short_drama_pack") {
    const hookSection = content.sections.find((section) => section.id === "hook");
    const beatSection = content.sections.find((section) => section.id === "beats");
    const highlights = [...flattenSectionLines(hookSection), ...flattenSectionLines(beatSection)].slice(0, 4);

    return {
      lead: content.headline ?? item.title,
      highlights,
      operatorNote:
        item.sourceKind === "deliverable"
          ? "这轮短剧结果已经整理成可出片包，可以直接继续做视频接力。"
          : "当前还是待审批草稿，先看剧情节奏和角色关系，再决定是否继续出片。",
      nextMove:
        item.sourceKind === "deliverable"
          ? "优先复制视频接力包，送入视频生成器；如果还要扩集数，再把结果带回任务台继续写下一集。"
          : "如果剧情和结尾钩子已经成立，优先去审批；如果还不够抓人，就让系统重做更强的反转。"
    };
  }

  const lines = extractSummaryLines(item.summary);
  const lead = lines[0] ?? item.summary;
  const highlights = lines.slice(1, 4);
  const operatorNote =
    item.sourceKind === "deliverable"
      ? "这份结果已经进入正式交付，可直接复用到下一轮任务。"
      : "这份结果仍处于待审批状态，方向可以先看，但执行前最好先人工拍板。";
  const nextMove =
    item.sourceKind === "deliverable"
      ? "如果要继续推进，建议直接把当前结果带回任务输入区，生成下一轮执行单。"
      : "如果方向基本正确，优先去审批；如果还不够聚焦，再让系统基于这份草稿重做。";

  return {
    lead,
    highlights,
    operatorNote,
    nextMove
  };
}

function recommendDispatchTarget(
  intent: string,
  units: ClientUnit[],
  categoryId?: RecruitCategoryId
): DispatchRecommendation | null {
  const normalizedIntent = deriveIntentSeed(intent).trim();

  if (!normalizedIntent) {
    return null;
  }

  const unitCandidates = units
    .filter((unit) => unit.module)
    .map((unit) => {
      const { matches, score } = scoreModuleAgainstIntent(unit.module!, normalizedIntent);
      return {
        kind: "unit" as const,
        unit,
        matches,
        score
      };
    })
    .sort((left, right) => right.score - left.score);

  const moduleCandidates = recruitModules
    .filter((module) => !categoryId || categoryId === "all" || module.categoryIds.includes(categoryId))
    .map((module) => {
      const { matches, score } = scoreModuleAgainstIntent(module, normalizedIntent);
      return {
        kind: "module" as const,
        module,
        matches,
        score
      };
    })
    .sort((left, right) => right.score - left.score);

  const bestUnit = unitCandidates[0];
  const bestModule = moduleCandidates[0];

  if (bestUnit && bestUnit.score > 0 && (!bestModule || bestUnit.score >= bestModule.score)) {
    return bestUnit;
  }

  if (bestModule && bestModule.score > 0) {
    return bestModule;
  }

  return null;
}

function taskStatusTone(status: string): "neutral" | "good" | "warm" {
  switch (status) {
    case "completed":
      return "good";
    case "waiting_approval":
      return "warm";
    default:
      return "neutral";
  }
}

function toBudgetFormValues(budget?: BudgetPolicyDraft) {
  return {
    monthlyLimitCny: String(budget?.monthlyLimitCny ?? 3000),
    taskLimitCny: String(budget?.taskLimitCny ?? 200),
    pauseOnLimit: budget?.pauseOnLimit ?? true
  };
}

function parseBudgetForm(values: {
  monthlyLimitCny: string;
  taskLimitCny: string;
  pauseOnLimit: boolean;
}): BudgetPolicyDraft {
  return {
    monthlyLimitCny: Number(values.monthlyLimitCny) || 0,
    taskLimitCny: Number(values.taskLimitCny) || 0,
    pauseOnLimit: values.pauseOnLimit
  };
}

function buildStoredUnitName(module: RecruitModule, displayName = module.title): string {
  return `${STORED_UNIT_PREFIX}${module.id}::${displayName}`;
}

function parseStoredUnitName(name: string): {
  catalogId?: string;
  displayName: string;
} {
  if (!name.startsWith(STORED_UNIT_PREFIX)) {
    return {
      displayName: name
    };
  }

  const encoded = name.slice(STORED_UNIT_PREFIX.length);
  const separatorIndex = encoded.indexOf("::");

  if (separatorIndex === -1) {
    return {
      catalogId: encoded,
      displayName: encoded
    };
  }

  return {
    catalogId: encoded.slice(0, separatorIndex),
    displayName: encoded.slice(separatorIndex + 2) || encoded.slice(0, separatorIndex)
  };
}

function deriveModuleSkills(module?: RecruitModule): string[] {
  if (!module) {
    return ["通用执行", "任务协同"];
  }

  return module.strap
    .split(/[+/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function deriveResponsibilityLines(source: {
  kind: RecruitKind | "legacy";
  outputs: string[];
  cycleLabel: string;
  costLabel: string;
},
options: {
  includeExecutionMeta?: boolean;
} = {}): string[] {
  const { includeExecutionMeta = true } = options;
  const leadOutput = source.outputs[0] ?? "首轮交付";
  const supportOutput = source.outputs[1] ?? source.outputs[0] ?? "执行结果";

  const lines = [
    `负责输出 ${leadOutput}，并把方向收敛成可继续执行的版本。`,
    source.kind === "team"
      ? `负责协调 ${supportOutput} 等跨角色结果，避免任务只停留在单点建议。`
      : `负责独立完成 ${supportOutput} 相关专业内容，并在必要时提示你补位协同。`
  ];

  if (includeExecutionMeta) {
    lines.push(`默认交付节奏约 ${source.cycleLabel}，当前预算基线为 ${source.costLabel}。`);
  }

  return lines;
}

function deriveUnitResponsibilities(unit: ClientUnit): string[] {
  return deriveResponsibilityLines(unit);
}

function getCatalogGlyphForUnit(unit: ClientUnit): CatalogGlyphName {
  if (unit.module) {
    return unit.module.id as CatalogGlyphName;
  }

  return unit.kind === "team" || unit.kind === "legacy" ? "game-production-team" : "all";
}

function formatUnitStatusLabel(status: ClientUnit["status"]): string {
  switch (status) {
    case "active":
      return "在编";
    case "paused":
      return "已暂停";
  }
}

function unitStatusTone(status: ClientUnit["status"]): "good" | "warm" | "neutral" {
  switch (status) {
    case "active":
      return "good";
    case "paused":
      return "warm";
  }
}

function iconStrokeProps(props: SVGProps<SVGSVGElement>) {
  return {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    ...props
  };
}

function WorkspaceIcon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  switch (name) {
    case "overview":
      return (
        <svg {...iconStrokeProps(props)}>
          <path d="M4 13.5 12 5l8 8.5" />
          <path d="M6.5 11.5V20h11v-8.5" />
        </svg>
      );
    case "recruit":
      return (
        <svg {...iconStrokeProps(props)}>
          <path d="M12 4v16" />
          <path d="M4 12h16" />
          <circle cx="18" cy="6" r="2.5" />
        </svg>
      );
    case "employees":
      return (
        <svg {...iconStrokeProps(props)}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M6 19c1.5-2.8 4-4.2 6-4.2s4.5 1.4 6 4.2" />
        </svg>
      );
    case "teams":
      return (
        <svg {...iconStrokeProps(props)}>
          <circle cx="8" cy="9" r="2.5" />
          <circle cx="16" cy="9" r="2.5" />
          <path d="M4.8 18c.8-1.8 2.2-3 3.8-3" />
          <path d="M19.2 18c-.8-1.8-2.2-3-3.8-3" />
          <path d="M8 18c1.1-2.2 2.5-3.2 4-3.2 1.5 0 2.9 1 4 3.2" />
        </svg>
      );
    case "dispatch":
      return (
        <svg {...iconStrokeProps(props)}>
          <path d="m4 12 15-7-4 14-3.5-4.5L4 12Z" />
          <path d="M11.5 14.5 19 5" />
        </svg>
      );
    case "approvals":
      return (
        <svg {...iconStrokeProps(props)}>
          <path d="M7 4h8l4 4v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
          <path d="m9 13 2 2 4-4" />
          <path d="M15 4v4h4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...iconStrokeProps(props)}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.8 7.8 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6c-.6.2-1.1.5-1.7 1l-2.4-1-2 3.5L5.1 11A7 7 0 0 0 5 12c0 .3 0 .7.1 1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.3 2.6h4l.3-2.6c.6-.2 1.2-.5 1.7-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" />
        </svg>
      );
  }
}

function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <path d="M12 4.8a4.6 4.6 0 0 1 4.6 4.6v2.2c0 1.1.3 2.2.9 3.1l.8 1.2H5.7l.8-1.2c.6-.9.9-2 .9-3.1V9.4A4.6 4.6 0 0 1 12 4.8Z" />
      <path d="M9.8 18a2.5 2.5 0 0 0 4.4 0" />
    </svg>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <path d="M4.8 7.5h8.4" />
      <path d="M15.8 7.5h3.4" />
      <path d="M10.8 16.5h8.4" />
      <path d="M4.8 16.5h3.4" />
      <circle cx="13.2" cy="7.5" r="2" />
      <circle cx="8.8" cy="16.5" r="2" />
    </svg>
  );
}

function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <path d="M7 12h10" />
      <path d="m13 8 4 4-4 4" />
    </svg>
  );
}

function UserCardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5.5 18.2c1.5-2.6 3.8-3.9 6.5-3.9s5 1.3 6.5 3.9" />
    </svg>
  );
}

function ReceiptIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <path d="M7 5.5h10v13l-2.2-1.5-2.1 1.5-2.1-1.5-2.1 1.5L7 18.5Z" />
      <path d="M9.5 9.2h5" />
      <path d="M9.5 12.2h5" />
    </svg>
  );
}

function GiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <path d="M6 10.5h12v8H6Z" />
      <path d="M12 10.5v8" />
      <path d="M5 7.5h14v3H5Z" />
      <path d="M12 7.5c-2.2 0-3.5-.7-3.5-1.9S9.6 3.8 11 4.6c.7.4 1 1.2 1 2.9Z" />
      <path d="M12 7.5c2.2 0 3.5-.7 3.5-1.9s-1.1-1.8-2.5-1c-.7.4-1 1.2-1 2.9Z" />
    </svg>
  );
}

function TicketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <path d="M6 7h12v3a1.8 1.8 0 0 0 0 4v3H6v-3a1.8 1.8 0 0 0 0-4Z" />
      <path d="M12 7v10" strokeDasharray="2.2 2.2" />
    </svg>
  );
}

function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <rect x="4.8" y="6.5" width="14.4" height="11" rx="2.2" />
      <path d="m6.4 8.4 5.6 4.6 5.6-4.6" />
    </svg>
  );
}

function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconStrokeProps(props)}>
      <rect x="9" y="7" width="9" height="11" rx="2" />
      <path d="M6 15V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function CatalogGlyph({ name, ...props }: { name: CatalogGlyphName } & SVGProps<SVGSVGElement>) {
  switch (name) {
    case "all":
      return (
        <svg {...iconStrokeProps(props)}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "game-creation":
    case "game-dev-bot":
    case "game-production-team":
      return (
        <svg {...iconStrokeProps(props)}>
          <path d="M7 10.5 9.5 8h5L17 10.5v4L14.5 17h-5L7 14.5Z" />
          <path d="M9 12h2" />
          <path d="M10 11v2" />
          <circle cx="14.5" cy="11.5" r=".8" fill="currentColor" stroke="none" />
          <circle cx="15.8" cy="12.8" r=".8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "app-design":
    case "design-bot":
    case "creative-studio-team":
      return (
        <svg {...iconStrokeProps(props)}>
          <rect height="12" rx="2.5" width="14" x="5" y="6" />
          <path d="M9 10h6" />
          <path d="M9 14h3" />
        </svg>
      );
    case "ai-short-drama":
    case "short-drama-writer-bot":
    case "short-drama-studio-team":
      return (
        <svg {...iconStrokeProps(props)}>
          <path d="M7 7h10v10H7Z" />
          <path d="m7 10 10-6" />
          <path d="m7 14 10-6" />
        </svg>
      );
    case "art-bot":
      return (
        <svg {...iconStrokeProps(props)}>
          <path d="M12 5c3.9 0 7 2.8 7 6.2 0 2.4-1.9 3.8-3.5 3.8H14l-2 2-2-2H8.5C6.9 15 5 13.6 5 11.2 5 7.8 8.1 5 12 5Z" />
          <circle cx="9" cy="10" r=".8" fill="currentColor" stroke="none" />
          <circle cx="12" cy="8.7" r=".8" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10" r=".8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "ops-copy-bot":
    case "growth-content-team":
      return (
        <svg {...iconStrokeProps(props)}>
          <path d="M6 7h12v10H6Z" />
          <path d="M9 10h6" />
          <path d="M9 13h4" />
          <path d="M18 9h2" />
          <path d="M18 13h2" />
        </svg>
      );
  }
}

function RecruitBotAvatar({
  accent,
  ...props
}: {
  accent: AccentTone;
} & SVGProps<SVGSVGElement>) {
  const palette =
    accent === "amber"
      ? {
          shell: "#ffcf85",
          shellShadow: "#ffb95a",
          panel: "#fff0cc",
          stroke: "#9a5a11"
        }
      : accent === "cyan"
        ? {
            shell: "#7ce3ff",
            shellShadow: "#3dbcf6",
            panel: "#dff7ff",
            stroke: "#0b5574"
          }
        : {
            shell: "#74f0d1",
            shellShadow: "#22c7b5",
            panel: "#dbfff6",
            stroke: "#0f6b63"
          };

  return (
    <svg viewBox="0 0 96 96" {...props}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M48 18v9" stroke={palette.stroke} strokeWidth="4" />
        <circle cx="48" cy="14" fill={palette.shell} r="4.5" stroke={palette.stroke} strokeWidth="3" />
        <path d="M28 37h-7" stroke={palette.stroke} strokeWidth="4" />
        <path d="M75 37h-7" stroke={palette.stroke} strokeWidth="4" />
        <rect
          fill={palette.shell}
          height="38"
          rx="18"
          stroke={palette.stroke}
          strokeWidth="3.2"
          width="48"
          x="24"
          y="28"
        />
        <path
          d="M30 32c3.2-4.1 10.2-6.2 18-6.2 8.8 0 16.3 2.8 19 8.2"
          stroke={palette.shellShadow}
          strokeOpacity=".45"
          strokeWidth="2.5"
        />
        <circle cx="39" cy="45" fill={palette.stroke} r="4" />
        <circle cx="57" cy="45" fill={palette.stroke} r="4" />
        <path d="M39 55c2.6 2.6 15.4 2.6 18 0" stroke={palette.stroke} strokeWidth="3" />
        <rect
          fill={palette.panel}
          height="12"
          rx="6"
          stroke={palette.stroke}
          strokeWidth="2.6"
          width="20"
          x="38"
          y="60"
        />
        <circle cx="31" cy="28" fill={palette.panel} r="3.5" stroke={palette.stroke} strokeWidth="2.4" />
        <circle cx="65" cy="28" fill={palette.panel} r="3.5" stroke={palette.stroke} strokeWidth="2.4" />
      </g>
    </svg>
  );
}

function SurfaceSection({
  title,
  subtitle,
  action,
  children
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface-section">
      <header className="surface-section-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action ? <div className="surface-section-action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

function MetricPanel({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-panel">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function StatusPill({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warm";
}) {
  return <span className={`status-pill status-pill-${tone}`}>{children}</span>;
}

function EmptyPanel({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-panel">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      {action ? <div className="empty-panel-action">{action}</div> : null}
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [templates, setTemplates] = useState<TeamTemplateSummary[]>([]);
  const [teamInstances, setTeamInstances] = useState<TeamInstanceSummary[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [organizationBudget, setOrganizationBudget] = useState<BudgetSummary | null>(null);
  const [sessionToken, setSessionToken] = useState(readInitialSessionToken);
  const [sessionTokenDraft, setSessionTokenDraft] = useState(readInitialSessionToken);
  const [accessView, setAccessView] = useState<AccessView>("demo");
  const [activeView, setActiveView] = useState<WorkspaceView>("recruit");
  const [recruitCategoryId, setRecruitCategoryId] = useState<RecruitCategoryId>("all");
  const [recruitFocusId, setRecruitFocusId] = useState<RecruitFocusId>("all");
  const [viewportWidth, setViewportWidth] = useState(readViewportWidth);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [dispatchProjects, setDispatchProjects] = useState<DispatchProject[]>([]);
  const [activeDispatchProjectId, setActiveDispatchProjectId] = useState("");
  const [dispatchProjectSearch, setDispatchProjectSearch] = useState("");
  const [isProjectCreateModalOpen, setIsProjectCreateModalOpen] = useState(false);
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);
  const [dispatchProjectDraft, setDispatchProjectDraft] = useState<DispatchProjectDraft>(() =>
    createDispatchProjectDraft()
  );
  const [projectSettingsDraft, setProjectSettingsDraft] = useState<DispatchProjectDraft>(() =>
    createDispatchProjectDraft()
  );
  const [projectMessageDraft, setProjectMessageDraft] = useState("");
  const [isProjectReplying, setIsProjectReplying] = useState(false);
  const [projectGroupDraftName, setProjectGroupDraftName] = useState("");
  const [projectGroupDraftMemberIds, setProjectGroupDraftMemberIds] = useState<string[]>([]);
  const [projectAssignmentDraft, setProjectAssignmentDraft] = useState<ProjectAssignmentDraft>(() =>
    createProjectAssignmentDraft()
  );
  const [selectedProjectAssignmentId, setSelectedProjectAssignmentId] = useState("");
  const [projectReportDraft, setProjectReportDraft] = useState("");
  const [projectReportStatus, setProjectReportStatus] = useState<ProjectAssignmentStatus>("in_progress");
  const [unitNameDraft, setUnitNameDraft] = useState("");
  const [intentDraft, setIntentDraft] = useState("");
  const [taskGoal, setTaskGoal] = useState("");
  const [shortDramaStage, setShortDramaStage] = useState<ShortDramaStageId>("intake");
  const [shortDramaDraft, setShortDramaDraft] = useState<ShortDramaProjectDraft>(() =>
    createShortDramaProjectDraft()
  );
  const [organizationNameDraft, setOrganizationNameDraft] = useState("New Team OS Studio");
  const [organizationAdminNameDraft, setOrganizationAdminNameDraft] = useState("Founder");
  const [organizationAdminEmailDraft, setOrganizationAdminEmailDraft] = useState("founder@example.com");
  const [invitationId, setInvitationId] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("approver");
  const [latestIssuedSessionToken, setLatestIssuedSessionToken] = useState("");
  const [budgetDraft, setBudgetDraft] = useState(() => toBudgetFormValues());
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [isAcceptingInvitation, setIsAcceptingInvitation] = useState(false);
  const [isCreatingInvitation, setIsCreatingInvitation] = useState(false);
  const [isUpdatingBudget, setIsUpdatingBudget] = useState(false);
  const [isHiringModuleId, setIsHiringModuleId] = useState("");
  const [hireConfirmModule, setHireConfirmModule] = useState<RecruitModule | null>(null);
  const [isRenamingUnitId, setIsRenamingUnitId] = useState("");
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workspaceUnlocked, setWorkspaceUnlocked] = useState(
    () => Boolean(readInitialSessionToken()) || HAS_CONFIGURED_FALLBACK_IDENTITY
  );
  const dispatchComposerRef = useRef<HTMLFormElement | null>(null);
  const deliveryFeedRef = useRef<HTMLDivElement | null>(null);
  const [selectedResultId, setSelectedResultId] = useState("");
  const [highlightedDeliveryTaskId, setHighlightedDeliveryTaskId] = useState("");
  const [selectedReviewSceneId, setSelectedReviewSceneId] = useState("");
  const [characterAssets, setCharacterAssets] = useState<ShortDramaCharacterAsset[]>([]);
  const [sceneReviewDecisions, setSceneReviewDecisions] = useState<Record<string, ShortDramaSceneReviewDecision>>(
    {}
  );
  const [videoSessions, setVideoSessions] = useState<Record<string, VideoGenerationSession>>({});
  const [isSubmittingVideoTaskId, setIsSubmittingVideoTaskId] = useState("");
  const [isRefreshingVideoTaskId, setIsRefreshingVideoTaskId] = useState("");
  const lastLoadedUnitIdRef = useRef("");
  const initializedBudgetOrgIdRef = useRef("");
  const missingVideoSessionKeysRef = useRef<Set<string>>(new Set());
  const loadingVideoSessionKeysRef = useRef<Set<string>>(new Set());
  const accountMenuCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setViewportWidth(readViewportWidth());
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(
    () => () => {
      if (accountMenuCloseTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(accountMenuCloseTimerRef.current);
      }
    },
    []
  );

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const auth = {
    ...(sessionToken ? { sessionToken } : {}),
    ...(!sessionToken && import.meta.env.VITE_USER_ID ? { userId: import.meta.env.VITE_USER_ID } : {}),
    ...(!sessionToken && import.meta.env.VITE_USER_NAME ? { userName: import.meta.env.VITE_USER_NAME } : {}),
    ...(!sessionToken && import.meta.env.VITE_USER_EMAIL
      ? { userEmail: import.meta.env.VITE_USER_EMAIL }
      : {}),
    ...(!sessionToken && import.meta.env.VITE_ORG_ID ? { orgId: import.meta.env.VITE_ORG_ID } : {}),
    ...(!sessionToken && import.meta.env.VITE_ORG_NAME ? { orgName: import.meta.env.VITE_ORG_NAME } : {}),
    ...(!sessionToken && import.meta.env.VITE_ORG_ROLE
      ? {
          orgRole: import.meta.env.VITE_ORG_ROLE as MePayload["currentOrganization"]["role"]
        }
      : {})
  };
  const client = createApiClient({
    baseUrl: apiBaseUrl,
    auth
  });
  const streamUrl = client.streamUrl();
  const catalogById = Object.fromEntries(recruitModules.map((module) => [module.id, module]));

  const units: ClientUnit[] = teamInstances.map((team) => {
    const parsed = parseStoredUnitName(team.name);
    const module = parsed.catalogId ? catalogById[parsed.catalogId] : undefined;

    return {
      ...team,
      accent: module?.accent ?? "cyan",
      costLabel: module?.costLabel ?? "通用 Team OS 预算",
      cycleLabel: module?.cycleLabel ?? "10-30 min",
      displayName: parsed.displayName,
      kind: module?.kind ?? "legacy",
      ...(module ? { module } : {}),
      outputs: module?.outputs ?? ["通用执行单元"],
      starterTask:
        module?.starterTask ?? "请为这个执行单元安排一个具体业务目标，并生成第一轮交付方案。"
    };
  });

  const projectCategoryOptions = recruitCategories.filter(
    (category): category is RecruitCategory & { id: ProjectCategoryId } => category.id !== "all"
  );
  const normalizedDispatchProjects = dispatchProjects.map((project) => normalizeDispatchProject(project, units));
  const activeDispatchProject =
    normalizedDispatchProjects.find((project) => project.id === activeDispatchProjectId) ?? null;
  const activeUnit =
    units.find((unit) => unit.id === selectedUnitId) ?? (activeDispatchProject ? null : units[0] ?? null);
  const employeeUnits = units.filter((unit) => unit.kind === "employee");
  const teamUnits = units.filter((unit) => unit.kind === "team" || unit.kind === "legacy");
  const activeProjectUnit =
    activeDispatchProject ? units.find((unit) => unit.id === activeDispatchProject.unitId) ?? null : null;
  const activeProjectLead =
    activeDispatchProject ? units.find((unit) => unit.id === activeDispatchProject.workflow.leadUnitId) ?? null : null;
  const activeProjectMembers = activeDispatchProject
    ? activeDispatchProject.workflow.memberUnitIds
        .map((unitId) => units.find((unit) => unit.id === unitId) ?? null)
        .filter((unit): unit is ClientUnit => Boolean(unit))
    : [];
  const activeProjectChannels = activeDispatchProject?.workflow.channels ?? [];
  const activeProjectAssignments = activeDispatchProject?.workflow.assignments ?? [];
  const activeProjectReports = activeDispatchProject?.workflow.reports ?? [];
  const activeProjectOutputs = activeDispatchProject?.workflow.outputs ?? [];
  const activeProjectOutputsSorted = [...activeProjectOutputs].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
  const activeProjectMemberRows = activeProjectMembers.map((member) => {
    const memberAssignments = activeProjectAssignments.filter((assignment) => assignment.ownerUnitId === member.id);
    const memberReports = activeProjectReports.filter((report) => report.authorUnitId === member.id);
    const latestMemberReport = [...memberReports].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    )[0] ?? null;
    const isLead = activeProjectLead?.id === member.id;

    return {
      member,
      isLead,
      managerLabel: isLead ? "直接向 CEO 汇报" : activeProjectLead?.displayName ?? "项目主管",
      assignmentCount: memberAssignments.length,
      reportCount: memberReports.length,
      latestReport: latestMemberReport?.summary ?? "",
      latestStatus:
        memberAssignments.find((assignment) => assignment.status === "blocked")?.status ??
        memberAssignments.find((assignment) => assignment.status === "review")?.status ??
        memberAssignments[0]?.status ??
        "todo"
    };
  });
  const shortDramaPipelineCards = activeDispatchProject?.categoryId === "ai-short-drama"
    ? shortDramaPipelineSteps.map((step, index) => {
        const owners = activeProjectMembers.filter((member) =>
          step.moduleIds.includes(member.module?.id ?? "")
        );
        const ownerIds = new Set(owners.map((member) => member.id));
        const stepAssignments = activeProjectAssignments.filter((assignment) => ownerIds.has(assignment.ownerUnitId));
        const stepReports = activeProjectReports.filter((report) =>
          stepAssignments.some((assignment) => assignment.id === report.assignmentId)
        );
        const stepOutputs = activeProjectOutputs.filter((artifact) => artifact.stageId === step.id);
        const latestStepReport = [...stepReports].sort(
          (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
        )[0] ?? null;
        const latestStepOutput = [...stepOutputs].sort(
          (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        )[0] ?? null;
        const currentPipelineIndex = shortDramaStageToPipelineIndex(shortDramaStage);
        const stepStatus: ProjectFlowStatus = !owners.length
          ? "missing"
          : index === currentPipelineIndex
            ? "active"
            : index < currentPipelineIndex
              ? "ready"
              : "upcoming";

        return {
          ...step,
          owners,
          assignmentCount: stepAssignments.length,
          reportCount: stepReports.length,
          latestReport: latestStepReport?.summary ?? latestStepOutput?.summary ?? "",
          status: stepStatus
        };
      })
    : [];
  const activeProjectChannel =
    activeDispatchProject?.workflow.channels.find(
      (channel) => channel.id === activeDispatchProject.workflow.activeChannelId
    ) ?? activeDispatchProject?.workflow.channels[0] ?? null;
  const activeProjectChannelMessages = activeDispatchProject
    ? activeDispatchProject.workflow.messages.filter(
        (message) => message.channelId === activeDispatchProject.workflow.activeChannelId
      )
    : [];
  const selectedProjectAssignment =
    activeProjectAssignments.find((assignment) => assignment.id === selectedProjectAssignmentId) ??
    activeProjectAssignments[0] ??
    null;
  const selectedProjectAssignmentOwner =
    selectedProjectAssignment
      ? units.find((unit) => unit.id === selectedProjectAssignment.ownerUnitId) ?? null
      : null;
  const selectedProjectAssignmentReports = selectedProjectAssignment
    ? activeProjectReports.filter((report) => report.assignmentId === selectedProjectAssignment.id)
    : [];
  const projectLeadSummary = activeDispatchProject ? buildProjectLeadSummary(activeDispatchProject, units) : null;
  const activeProjectAssignmentIdsKey = activeProjectAssignments.map((assignment) => assignment.id).join("|");
  const activeProjectMemberIdsKey = activeProjectMembers.map((member) => member.id).join("|");
  const inspectedEmployee = employeeUnits.find((unit) => unit.id === selectedUnitId) ?? employeeUnits[0] ?? null;
  const inspectedTeam = teamUnits.find((unit) => unit.id === selectedUnitId) ?? teamUnits[0] ?? null;
  const activeUnitApprovals = activeUnit
    ? approvals.filter((approval) => approval.teamInstanceId === activeUnit.id)
    : [];
  const projectScopedTasks = activeDispatchProject
    ? (dashboard?.recentTasks ?? []).filter((task) => taskBelongsToProject(task, activeDispatchProject))
    : dashboard?.recentTasks ?? [];
  const projectScopedApprovals = activeDispatchProject
    ? activeUnitApprovals.filter((approval) => approvalBelongsToProject(approval, activeDispatchProject))
    : activeUnitApprovals;
  const recentDeliveryFeed: ResultFeedItem[] = [
    ...((activeDispatchProject
      ? (dashboard?.recentDeliverables ?? []).filter((deliverable) =>
          deliverableBelongsToProject(deliverable, activeDispatchProject, dashboard?.recentTasks ?? [])
        )
      : dashboard?.recentDeliverables ?? [])).map((deliverable) => ({
      id: deliverable.id,
      taskId: deliverable.taskId,
      title: deliverable.title,
      summary: deliverable.summary,
      tone: "good" as const,
      statusLabel: "正式交付",
      createdAt: deliverable.createdAt,
      sourceKind: "deliverable" as const,
      deliverable
    })),
    ...projectScopedApprovals.map((approval) => ({
      id: `draft-${approval.id}`,
      taskId: approval.taskId,
      title: approval.title.replace(/^审批\s*/, "待审批草稿 · "),
      summary: approval.summary,
      tone: "warm" as const,
      statusLabel: "待审批草稿",
      createdAt: approval.createdAt,
      sourceKind: "draft" as const
    }))
  ].slice(0, 5);
  const selectedResultFeedItem =
    recentDeliveryFeed.find((item) => item.id === selectedResultId) ?? recentDeliveryFeed[0] ?? null;
  const selectedStructuredDeliverable =
    selectedResultFeedItem?.sourceKind === "deliverable" ? selectedResultFeedItem.deliverable : undefined;
  const activeVideoSession =
    selectedStructuredDeliverable?.id
      ? videoSessions[videoSessionKey(selectedStructuredDeliverable.taskId, selectedStructuredDeliverable.id)]
      : undefined;
  const shortDramaUnits = units.filter((unit) => isShortDramaUnit(unit));
  const isShortDramaActive = isShortDramaUnit(activeUnit);
  const shortDramaContent =
    selectedStructuredDeliverable?.content?.kind === "short_drama_pack"
      ? selectedStructuredDeliverable.content
      : null;
  const shortDramaSectionMap = Object.fromEntries(
    (shortDramaContent?.sections ?? []).map((section) => [section.id, section])
  ) as Record<string, DeliverableContentSection>;
  const shortDramaBriefPreview =
    activeUnit && isShortDramaUnit(activeUnit)
      ? buildShortDramaWorkflowBrief(shortDramaDraft, activeUnit)
      : "";
  const shortDramaCharacterCards = parseShortDramaCharacterCards(
    flattenSectionLines(shortDramaSectionMap.characters)
  );
  const shortDramaTimeline = buildShortDramaTimeline(shortDramaContent?.videoHandoff, activeVideoSession);
  const selectedReviewScene =
    shortDramaTimeline.find((scene) => scene.id === selectedReviewSceneId) ?? shortDramaTimeline[0] ?? null;
  const selectedReviewDecision = selectedReviewScene
    ? sceneReviewDecisions[selectedReviewScene.id] ?? null
    : null;
  const pendingApprovalCount = approvals.length;
  const currentOrganizationId = me?.currentOrganization.id ?? "";
  const currentOrganizationName = me?.currentOrganization.name ?? "未接入组织";
  const currentRole = me?.currentOrganization.role ?? "operator";
  const canResolveApprovals = currentRole === "org_admin" || currentRole === "approver";
  const canCreateTask = currentRole === "org_admin" || currentRole === "operator";
  const canInvite = currentRole === "org_admin";
  const hiredModuleIds = new Set(units.flatMap((unit) => (unit.module ? [unit.module.id] : [])));
  const directoryUnit =
    activeView === "employees" ? inspectedEmployee : activeView === "teams" ? inspectedTeam : null;
  const isRenameDirty = Boolean(
    directoryUnit && unitNameDraft.trim() && unitNameDraft.trim() !== directoryUnit.displayName
  );
  const filteredDispatchProjects = normalizedDispatchProjects.filter((project) => {
    const normalizedQuery = dispatchProjectSearch.trim().toLowerCase();
    const assignedUnitName = units.find((unit) => unit.id === project.unitId)?.displayName ?? "";

    if (!normalizedQuery) {
      return true;
    }

    return [project.name, project.description, projectCategoryLabel(project.categoryId), assignedUnitName]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const dispatchProjectUnitCandidates = units.filter((unit) => {
    const matchesCategory = unit.module?.categoryIds.includes(dispatchProjectDraft.categoryId) ?? false;
    return matchesCategory && unit.kind === "employee";
  });

  useEffect(() => {
    if (!activeDispatchProject) {
      setIsProjectSettingsModalOpen(false);
      setSelectedProjectAssignmentId("");
      setProjectAssignmentDraft(createProjectAssignmentDraft());
      setProjectReportDraft("");
      setProjectReportStatus("in_progress");
      return;
    }

    const preferredOwner =
      activeProjectMembers.find((member) => member.id !== activeProjectLead?.id) ?? activeProjectMembers[0] ?? null;

    setSelectedProjectAssignmentId((current) => {
      if (current && activeProjectAssignments.some((assignment) => assignment.id === current)) {
        return current;
      }

      if (
        activeDispatchProject.workflow.selectedAssignmentId &&
        activeProjectAssignments.some(
          (assignment) => assignment.id === activeDispatchProject.workflow.selectedAssignmentId
        )
      ) {
        return activeDispatchProject.workflow.selectedAssignmentId;
      }

      return activeProjectAssignments[0]?.id ?? "";
    });

    setProjectAssignmentDraft((current) => {
      const nextOwnerUnitId =
        current.ownerUnitId && activeProjectMembers.some((member) => member.id === current.ownerUnitId)
          ? current.ownerUnitId
          : preferredOwner?.id ?? activeProjectLead?.id ?? "";

      if (current.ownerUnitId === nextOwnerUnitId) {
        return current;
      }

      return {
        ...current,
        ownerUnitId: nextOwnerUnitId
      };
    });
  }, [
    activeDispatchProject,
    activeProjectAssignmentIdsKey,
    activeProjectLead?.id,
    activeProjectMemberIdsKey
  ]);

  const loadData = useEffectEvent(async (preferredUnitId?: string) => {
    try {
      setError(null);

      const [mePayload, templatePayload, unitPayload, approvalPayload] = await Promise.all([
        client.getMe(),
        client.getTeamTemplates(),
        client.getTeamInstances(),
        client.getApprovals()
      ]);
      const [membersPayload, invitationsPayload, budgetPayload] = await Promise.all([
        client.getOrganizationMembers(mePayload.currentOrganization.id),
        client.getOrganizationInvitations(mePayload.currentOrganization.id),
        client.getBudget(mePayload.currentOrganization.id).catch(() => null)
      ]);

      const requestedUnitId = preferredUnitId ?? selectedUnitId;
      const nextSelectedUnitId =
        unitPayload.find((unit) => unit.id === requestedUnitId)?.id ?? unitPayload[0]?.id ?? "";
      const dashboardPayload = nextSelectedUnitId ? await client.getDashboard(nextSelectedUnitId) : null;

      setMe(mePayload);
      setTemplates(templatePayload);
      setTeamInstances(unitPayload);
      setApprovals(approvalPayload);
      setMembers(membersPayload);
      setInvitations(invitationsPayload);
      setOrganizationBudget(budgetPayload);
      setDashboard(dashboardPayload);
      setSelectedUnitId(nextSelectedUnitId);
      lastLoadedUnitIdRef.current = nextSelectedUnitId;

      if (initializedBudgetOrgIdRef.current !== mePayload.currentOrganization.id) {
        setBudgetDraft(toBudgetFormValues(budgetPayload ?? undefined));
        initializedBudgetOrgIdRef.current = mePayload.currentOrganization.id;
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load workspace data.";

      setMe(null);
      setTemplates([]);
      setTeamInstances([]);
      setApprovals([]);
      setMembers([]);
      setInvitations([]);
      setDashboard(null);
      setOrganizationBudget(null);

      if (sessionToken && isAuthErrorMessage(message)) {
        setSessionToken("");
        setSessionTokenDraft("");
        setWorkspaceUnlocked(HAS_CONFIGURED_FALLBACK_IDENTITY);
        setAccessView("create");
        setNotice(
          "上一次 session 已失效，已返回接入入口。当前如果使用的是内存模式，请重新创建组织。"
        );
        setError(null);
        return;
      }

      setError(message);
    }
  });

  const loadVideoGeneration = useEffectEvent(
    async (
      taskId: string,
      deliverableId: string,
      options: {
        surfaceError?: boolean;
      } = {}
    ) => {
      const sessionKey = videoSessionKey(taskId, deliverableId);

      if (
        missingVideoSessionKeysRef.current.has(sessionKey) ||
        loadingVideoSessionKeysRef.current.has(sessionKey)
      ) {
        return;
      }

      try {
        loadingVideoSessionKeysRef.current.add(sessionKey);
        const session = await client.getTaskVideoGeneration(taskId, deliverableId);

        if (!session) {
          missingVideoSessionKeysRef.current.add(sessionKey);
          setVideoSessions((current) => {
            const next = { ...current };
            delete next[sessionKey];
            return next;
          });
          return;
        }

        missingVideoSessionKeysRef.current.delete(sessionKey);
        setVideoSessions((current) => ({
          ...current,
          [sessionKey]: session
        }));
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Unable to load video generation status.";
        const isMissing = message.includes("Video generation session") || message.includes("not found");

        if (isMissing) {
          missingVideoSessionKeysRef.current.add(sessionKey);
          setVideoSessions((current) => {
            const next = { ...current };
            delete next[sessionKey];
            return next;
          });
          return;
        }

        if (options.surfaceError) {
          setError(message);
        }
      } finally {
        loadingVideoSessionKeysRef.current.delete(sessionKey);
      }
    }
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (sessionToken) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, sessionToken);
      return;
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [sessionToken]);

  useEffect(() => {
    if (!currentOrganizationId) {
      setDispatchProjects([]);
      setActiveDispatchProjectId("");
      return;
    }

    const storedProjects = readStoredJson<DispatchProject[]>(dispatchProjectStorageKey(currentOrganizationId), []);
    const storedActiveProjectId = readStoredJson<string>(
      dispatchActiveProjectStorageKey(currentOrganizationId),
      ""
    );

    setDispatchProjects(storedProjects);
    setActiveDispatchProjectId(
      storedProjects.some((project) => project.id === storedActiveProjectId) ? storedActiveProjectId : ""
    );
  }, [currentOrganizationId]);

  useEffect(() => {
    if (!currentOrganizationId) {
      return;
    }

    writeStoredJson(dispatchProjectStorageKey(currentOrganizationId), dispatchProjects);
  }, [currentOrganizationId, dispatchProjects]);

  useEffect(() => {
    if (!dispatchProjects.length) {
      return;
    }

    setDispatchProjects((current) => {
      const normalized = current.map((project) => normalizeDispatchProject(project, units));
      const hasChanged = JSON.stringify(normalized) !== JSON.stringify(current);
      return hasChanged ? normalized : current;
    });
  }, [units]);

  useEffect(() => {
    if (!currentOrganizationId) {
      return;
    }

    writeStoredJson(dispatchActiveProjectStorageKey(currentOrganizationId), activeDispatchProjectId);
  }, [activeDispatchProjectId, currentOrganizationId]);

  useEffect(() => {
    if (!projectCategoryOptions.some((category) => category.id === dispatchProjectDraft.categoryId)) {
      setDispatchProjectDraft((current) => ({
        ...current,
        categoryId: projectCategoryOptions[0]?.id ?? "ai-short-drama"
      }));
      return;
    }

    if (
      dispatchProjectUnitCandidates.length &&
      !dispatchProjectUnitCandidates.some((unit) => dispatchProjectDraft.memberUnitIds.includes(unit.id))
    ) {
      setDispatchProjectDraft((current) => ({
        ...current,
        memberUnitIds: dispatchProjectUnitCandidates[0] ? [dispatchProjectUnitCandidates[0].id] : [],
        leadUnitId: dispatchProjectUnitCandidates[0]?.id ?? ""
      }));
    }
  }, [
    dispatchProjectDraft.categoryId,
    dispatchProjectDraft.leadUnitId,
    dispatchProjectDraft.memberUnitIds,
    dispatchProjectUnitCandidates,
    projectCategoryOptions,
    units
  ]);

  useEffect(() => {
    if (!currentOrganizationId) {
      setCharacterAssets([]);
      return;
    }

    setCharacterAssets(readStoredJson<ShortDramaCharacterAsset[]>(characterLibraryStorageKey(currentOrganizationId), []));
  }, [currentOrganizationId]);

  useEffect(() => {
    if (!currentOrganizationId) {
      return;
    }

    writeStoredJson(characterLibraryStorageKey(currentOrganizationId), characterAssets);
  }, [characterAssets, currentOrganizationId]);

  useEffect(() => {
    if (!currentOrganizationId || !selectedStructuredDeliverable) {
      setSceneReviewDecisions({});
      return;
    }

    setSceneReviewDecisions(
      readStoredJson<Record<string, ShortDramaSceneReviewDecision>>(
        sceneReviewStorageKey(
          currentOrganizationId,
          selectedStructuredDeliverable.taskId,
          selectedStructuredDeliverable.id
        ),
        {}
      )
    );
  }, [currentOrganizationId, selectedStructuredDeliverable?.id, selectedStructuredDeliverable?.taskId]);

  useEffect(() => {
    if (!currentOrganizationId || !selectedStructuredDeliverable) {
      return;
    }

    writeStoredJson(
      sceneReviewStorageKey(currentOrganizationId, selectedStructuredDeliverable.taskId, selectedStructuredDeliverable.id),
      sceneReviewDecisions
    );
  }, [
    currentOrganizationId,
    sceneReviewDecisions,
    selectedStructuredDeliverable?.id,
    selectedStructuredDeliverable?.taskId
  ]);

  useEffect(() => {
    if (!workspaceUnlocked) {
      return;
    }

    void loadData();
  }, [streamUrl, workspaceUnlocked]);

  useEffect(() => {
    if (!workspaceUnlocked || !selectedUnitId || lastLoadedUnitIdRef.current === selectedUnitId) {
      return;
    }

    void loadData(selectedUnitId);
  }, [selectedUnitId, workspaceUnlocked]);

  useEffect(() => {
    if (activeDispatchProject) {
      setSelectedResultId("");
      setHighlightedDeliveryTaskId("");
      setProjectMessageDraft("");
      setProjectGroupDraftName("");
      setProjectGroupDraftMemberIds([]);
      return;
    }

    if (activeUnit?.id) {
      setTaskGoal(activeUnit.starterTask);
      setSelectedResultId("");
      setHighlightedDeliveryTaskId("");
      return;
    }

    setTaskGoal("");
    setSelectedResultId("");
    setHighlightedDeliveryTaskId("");
  }, [activeDispatchProject?.id, activeUnit?.id]);

  useEffect(() => {
    if (!activeDispatchProject) {
      return;
    }

    setSelectedUnitId(activeDispatchProject.workflow.leadUnitId || activeDispatchProject.unitId);
    setIntentDraft(activeDispatchProject.workflow.intentDraft);
    setTaskGoal(activeDispatchProject.workflow.taskGoal);
    setShortDramaStage(activeDispatchProject.workflow.shortDramaStage);
    setShortDramaDraft(activeDispatchProject.workflow.shortDramaDraft);
    setSelectedResultId("");
    setHighlightedDeliveryTaskId("");
    setProjectMessageDraft("");
    setProjectGroupDraftName("");
    setProjectGroupDraftMemberIds(activeDispatchProject.workflow.memberUnitIds);
  }, [activeDispatchProject?.id, activeDispatchProject?.unitId]);

  useEffect(() => {
    if (!activeDispatchProject) {
      return;
    }

    if (!selectedUnitId || selectedUnitId === activeDispatchProject.workflow.leadUnitId) {
      return;
    }

    const selectedProjectUnit = units.find((unit) => unit.id === selectedUnitId);

    setDispatchProjects((current) =>
      current.map((project) =>
        project.id === activeDispatchProject.id
          ? {
              ...project,
              unitId: selectedUnitId,
              executionMode: "employee",
              updatedAt: new Date().toISOString()
            }
          : project
      )
    );
  }, [activeDispatchProject, selectedUnitId, units]);

  useEffect(() => {
    if (!activeDispatchProject) {
      return;
    }

    setDispatchProjects((current) =>
      current.map((project) =>
        project.id === activeDispatchProject.id
          ? {
              ...project,
              updatedAt: new Date().toISOString(),
              workflow: {
                ...project.workflow,
                intentDraft,
                taskGoal,
                shortDramaStage,
                shortDramaDraft
              }
            }
          : project
      )
    );
  }, [activeDispatchProject?.id, intentDraft, shortDramaDraft, shortDramaStage, taskGoal]);

  useEffect(() => {
    if (!isShortDramaActive || !activeUnit) {
      return;
    }

    setShortDramaDraft((current) => {
      if (current.premise.trim()) {
        return current;
      }

      const seedGoal = deriveIntentSeed(taskGoal || activeUnit.starterTask);
      return createShortDramaProjectDraft({
        premise: seedGoal || current.premise,
        durationSeconds: extractTargetDurationFromText(seedGoal || activeUnit.starterTask) ?? current.durationSeconds
      });
    });
  }, [activeUnit, isShortDramaActive, taskGoal]);

  useEffect(() => {
    if (!isShortDramaActive) {
      return;
    }

    setShortDramaStage(
      deriveShortDramaSuggestedStage(activeUnit, selectedStructuredDeliverable, activeVideoSession)
    );
  }, [activeUnit, activeVideoSession, isShortDramaActive, selectedStructuredDeliverable]);

  useEffect(() => {
    if (!selectedStructuredDeliverable?.content?.videoHandoff) {
      return;
    }

    void loadVideoGeneration(selectedStructuredDeliverable.taskId, selectedStructuredDeliverable.id);
  }, [selectedStructuredDeliverable?.id, selectedStructuredDeliverable?.taskId, loadVideoGeneration]);

  useEffect(() => {
    if (!shortDramaTimeline.length) {
      setSelectedReviewSceneId("");
      return;
    }

    if (!shortDramaTimeline.some((scene) => scene.id === selectedReviewSceneId)) {
      setSelectedReviewSceneId(shortDramaTimeline[0]!.id);
    }
  }, [selectedReviewSceneId, shortDramaTimeline]);

  useEffect(() => {
    const focusStillAvailable = recruitModules.some((module) => {
      const matchesCategory = recruitCategoryId === "all" || module.categoryIds.includes(recruitCategoryId);
      const matchesFocus = recruitFocusId === "all" || module.focusIds.includes(recruitFocusId);
      return matchesCategory && matchesFocus;
    });

    if (!focusStillAvailable) {
      setRecruitFocusId("all");
    }
  }, [recruitCategoryId, recruitFocusId]);

  useEffect(() => {
    setUnitNameDraft(directoryUnit?.displayName ?? "");
  }, [directoryUnit?.id, directoryUnit?.displayName]);

  useEffect(() => {
    if (!hireConfirmModule || typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isHiringModuleId) {
        setHireConfirmModule(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hireConfirmModule, isHiringModuleId]);

  useEffect(() => {
    if (!isProjectCreateModalOpen || typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProjectCreateModalOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProjectCreateModalOpen]);

  useEffect(() => {
    if (activeView === "employees" && employeeUnits.length && !employeeUnits.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(employeeUnits[0]!.id);
      return;
    }

    if (activeView === "teams") {
      setActiveView("recruit");
    }
  }, [activeView, employeeUnits, selectedUnitId, teamUnits]);

  useEffect(() => {
    if (!workspaceUnlocked) {
      return;
    }

    const source = new EventSource(streamUrl);
    const refresh = () => {
      startTransition(() => {
        void loadData(activeUnit?.id);
      });
    };

    source.addEventListener("task.created", refresh);
    source.addEventListener("task.status_changed", refresh);
    source.addEventListener("approval.created", refresh);
    source.addEventListener("approval.resolved", refresh);
    source.addEventListener("deliverable.created", refresh);

    return () => {
      source.close();
    };
  }, [activeUnit?.id, streamUrl, workspaceUnlocked]);

  function resetWorkspaceState() {
    setMe(null);
    setTemplates([]);
    setTeamInstances([]);
    setApprovals([]);
    setMembers([]);
    setInvitations([]);
    setDashboard(null);
    setOrganizationBudget(null);
    setSelectedUnitId("");
    setDispatchProjects([]);
    setActiveDispatchProjectId("");
    setDispatchProjectSearch("");
    setIsProjectCreateModalOpen(false);
    setDispatchProjectDraft(createDispatchProjectDraft());
    setVideoSessions({});
    missingVideoSessionKeysRef.current.clear();
    loadingVideoSessionKeysRef.current.clear();
    lastLoadedUnitIdRef.current = "";
    initializedBudgetOrgIdRef.current = "";
  }

  async function enterWorkspaceWithSession(nextToken: string, successNotice: string) {
    try {
      setIsSigningIn(true);
      setError(null);
      setNotice(null);

      if (nextToken) {
        const nextClient = createApiClient({
          baseUrl: apiBaseUrl,
          auth: {
            sessionToken: nextToken
          }
        });
        await nextClient.getMe();
      } else if (!HAS_CONFIGURED_FALLBACK_IDENTITY) {
        throw new Error("当前没有可用的默认身份，请输入 session token 或直接使用 demo admin。");
      }

      setSessionToken(nextToken);
      setSessionTokenDraft(nextToken);
      setWorkspaceUnlocked(Boolean(nextToken) || HAS_CONFIGURED_FALLBACK_IDENTITY);
      setAccessView("demo");
      setNotice(successNotice);
    } catch (authError) {
      setWorkspaceUnlocked(false);
      resetWorkspaceState();
      setError(authError instanceof Error ? authError.message : "Unable to enter workspace.");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleUseDemoSession() {
    await enterWorkspaceWithSession(DEMO_ADMIN_SESSION, "已切换到 demo admin。");
  }

  async function handleSessionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextToken = sessionTokenDraft.trim();
    if (!nextToken) {
      setError("请输入 session token。");
      return;
    }

    await enterWorkspaceWithSession(nextToken, `已加载 session ${previewToken(nextToken)}。`);
  }

  async function handleCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsCreatingOrganization(true);
      setError(null);
      setNotice(null);

      const result = await client.createOrganization({
        organizationName: organizationNameDraft,
        adminName: organizationAdminNameDraft,
        adminEmail: organizationAdminEmailDraft
      });

      resetWorkspaceState();
      setLatestIssuedSessionToken(result.session.token);
      setSessionToken(result.session.token);
      setSessionTokenDraft(result.session.token);
      setWorkspaceUnlocked(true);
      setActiveView("recruit");
      setAccessView("demo");
      setNotice(`组织 ${result.organization.name} 已创建，已切换到 admin session。`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Organization creation failed.");
    } finally {
      setIsCreatingOrganization(false);
    }
  }

  async function handleAcceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsAcceptingInvitation(true);
      setError(null);
      setNotice(null);

      const result = await client.acceptInvitation(invitationId.trim(), {
        name: inviteeName.trim()
      });

      resetWorkspaceState();
      setLatestIssuedSessionToken(result.session.token);
      setSessionToken(result.session.token);
      setSessionTokenDraft(result.session.token);
      setWorkspaceUnlocked(true);
      setInvitationId("");
      setInviteeName("");
      setAccessView("demo");
      setNotice(`邀请已接受，已切换到 ${result.me.user.name} 的 session。`);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Invitation acceptance failed.");
    } finally {
      setIsAcceptingInvitation(false);
    }
  }

  async function handleCreateInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!me) {
      return;
    }

    try {
      setIsCreatingInvitation(true);
      setError(null);
      setNotice(null);

      const invitation = await client.createOrganizationInvitation(me.currentOrganization.id, {
        email: inviteEmail.trim(),
        role: inviteRole
      });

      setInviteEmail("");
      setInviteRole("approver");
      setNotice(`邀请已创建：${invitation.id}`);
      await loadData(activeUnit?.id);
    } catch (invitationError) {
      setError(invitationError instanceof Error ? invitationError.message : "Invitation creation failed.");
    } finally {
      setIsCreatingInvitation(false);
    }
  }

  async function handleUpdateBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!me) {
      return;
    }

    try {
      setIsUpdatingBudget(true);
      setError(null);
      setNotice(null);

      const nextBudget = parseBudgetForm(budgetDraft);
      await client.updateBudget(me.currentOrganization.id, nextBudget);
      setBudgetDraft(toBudgetFormValues(nextBudget));
      setNotice("组织预算已更新。");
      await loadData(activeUnit?.id);
    } catch (budgetError) {
      setError(budgetError instanceof Error ? budgetError.message : "Budget update failed.");
    } finally {
      setIsUpdatingBudget(false);
    }
  }

  function handleOpenHireConfirm(module: RecruitModule) {
    setError(null);
    setNotice(null);
    setHireConfirmModule(module);
  }

  function handleOpenProjectCreateModal() {
    const preferredCategory =
      activeUnit?.module?.categoryIds.find((categoryId): categoryId is ProjectCategoryId => categoryId !== "all") ??
      projectCategoryOptions[0]?.id ??
      "ai-short-drama";
    const preferredCandidates = units.filter((unit) => {
      const matchesCategory = unit.module?.categoryIds.includes(preferredCategory) ?? false;
      return matchesCategory && unit.kind === "employee";
    });
    const initialMemberUnitIds = preferredCandidates[0] ? [preferredCandidates[0].id] : [];
    const initialLeadUnitId = preferredCandidates[0]?.id ?? "";

    setDispatchProjectDraft(
      createDispatchProjectDraft({
        categoryId: preferredCategory,
        memberUnitIds: initialMemberUnitIds,
        leadUnitId: initialLeadUnitId,
        description: activeUnit?.starterTask ?? ""
      })
    );
    setProjectGroupDraftName("");
    setProjectGroupDraftMemberIds([]);
    setError(null);
    setNotice(null);
    setIsProjectCreateModalOpen(true);
  }

  function handleOpenProjectSettings() {
    if (!activeDispatchProject) {
      return;
    }

    setProjectSettingsDraft(
      createDispatchProjectDraft({
        name: activeDispatchProject.name,
        categoryId: activeDispatchProject.categoryId,
        description: activeDispatchProject.description,
        memberUnitIds: activeDispatchProject.workflow.memberUnitIds,
        leadUnitId: activeDispatchProject.workflow.leadUnitId
      })
    );
    setError(null);
    setNotice(null);
    setIsProjectSettingsModalOpen(true);
  }

  function handleSelectDispatchProject(projectId: string) {
    const project = dispatchProjects.find((entry) => entry.id === projectId);

    setActiveView("dispatch");
    setActiveDispatchProjectId(projectId);
    setSelectedResultId("");
    setHighlightedDeliveryTaskId("");

    if (project) {
      setSelectedUnitId(project.unitId);
    }
  }

  function handleReturnToProjectList() {
    setActiveView("dispatch");
    setActiveDispatchProjectId("");
    setSelectedResultId("");
    setHighlightedDeliveryTaskId("");
  }

  function handleProjectComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function handleCloseHireConfirm() {
    if (isHiringModuleId) {
      return;
    }

    setHireConfirmModule(null);
  }

  async function handleHireModule(module: RecruitModule) {
    if (!me) {
      setError("请先进入一个组织后再招聘。");
      return;
    }

    if (!templates[0]) {
      setError("当前还没有可用模板，请先确认后端模板种子已加载。");
      return;
    }

    try {
      setIsHiringModuleId(module.id);
      setError(null);
      setNotice(null);

      const approverUserIds = members
        .filter((member) => member.role === "org_admin" || member.role === "approver")
        .map((member) => member.userId);

      const unit = await client.createTeamInstance({
        organizationId: me.currentOrganization.id,
        templateId: templates[0].id,
        name: buildStoredUnitName(module),
        budgetPolicy: module.budgetPolicy,
        approvalPolicy: {
          enabled: true,
          approverUserIds,
          requiredStages: ["draft_review"]
        }
      });

      setSelectedUnitId(unit.id);
      setTaskGoal(module.starterTask);
      if (isShortDramaModule(module)) {
        setShortDramaDraft(
          createShortDramaProjectDraft({
            premise: deriveIntentSeed(module.starterTask),
            durationSeconds: extractTargetDurationFromText(module.starterTask) ?? 30
          })
        );
      }
      setHireConfirmModule(null);
      setNotice(`${module.title} 已加入编制。`);
      await loadData(unit.id);
    } catch (hireError) {
      setError(hireError instanceof Error ? hireError.message : "Hire action failed.");
    } finally {
      setIsHiringModuleId("");
    }
  }

  function updateDispatchProject(projectId: string, updater: (project: DispatchProject) => DispatchProject) {
    setDispatchProjects((current) =>
      current.map((project) => (project.id === projectId ? updater(normalizeDispatchProject(project, units)) : project))
    );
  }

  function handleSelectProjectChannel(channelId: string) {
    if (!activeDispatchProject) {
      return;
    }

    updateDispatchProject(activeDispatchProject.id, (project) => ({
      ...project,
      updatedAt: new Date().toISOString(),
      workflow: {
        ...project.workflow,
        activeChannelId: channelId
      }
    }));
  }

function buildProjectAutoReply(
  project: DispatchProject,
  channel: ProjectChatChannel,
  unitsInProject: ClientUnit[],
  body: string
): {
  messages: ProjectChatMessage[];
  assignment: ProjectAssignment | undefined;
  artifact: ProjectExecutionArtifact | undefined;
} {
    const lead =
      unitsInProject.find((unit) => unit.id === project.workflow.leadUnitId) ??
      units.find((unit) => unit.id === project.workflow.leadUnitId) ??
      null;
    const leadName = lead?.displayName ?? "项目主管";
    const intent = classifyProjectChatIntent(body);
    const now = Date.now();
    const directTarget =
      channel.kind === "direct" || channel.kind === "lead"
        ? unitsInProject.find((unit) => unit.id === channel.memberUnitIds[0]) ?? null
        : null;
    const groupMembers = channel.memberUnitIds
      .map((unitId) => unitsInProject.find((unit) => unit.id === unitId)?.displayName)
      .filter(Boolean)
      .join("、");
    let assignment: ProjectAssignment | undefined;
    let artifact: ProjectExecutionArtifact | undefined;
    let bodyText = "";

    if (channel.kind === "direct" && directTarget) {
      if (intent === "availability") {
        bodyText = `${directTarget.displayName}：我在。你是想先讨论方向，还是要我现在开始执行？如果要我正式开工，直接告诉我目标、交付内容和时间要求，我会先判断再开始，并同步给项目主管 ${leadName}。`;
      } else if (intent === "progress") {
        bodyText = buildEmployeeProgressReply(project, directTarget, leadName);
      } else if (intent === "execution") {
        assignment = buildConversationDrivenAssignment(body, directTarget, project.workflow.leadUnitId, new Date(now).toISOString());
        bodyText = buildEmployeeExecutionReply(body, directTarget, leadName);
        artifact = buildProjectExecutionArtifact(
          buildLocalExecutionDraft(body, directTarget, leadName),
          assignment,
          directTarget.id,
          new Date(now).toISOString()
        );
      } else {
        bodyText = buildEmployeeDiscussionReply(body, directTarget, leadName);
      }
    } else if (channel.kind === "lead" && directTarget) {
      if (intent === "execution") {
        assignment = buildConversationDrivenAssignment(body, directTarget, project.workflow.leadUnitId, new Date(now).toISOString());
      }
      bodyText = buildLeadChannelReply(project, intent, leadName, body, unitsInProject);
    } else {
      bodyText = buildGroupChannelReply(intent, leadName, body, groupMembers);
    }

    const messages: ProjectChatMessage[] = [
      {
        id: createLocalRecordId("message"),
        channelId: channel.id,
        authorKind: channel.kind === "direct" && directTarget ? "employee" : "lead",
        authorLabel: channel.kind === "direct" && directTarget ? directTarget.displayName : leadName,
        body: bodyText,
        createdAt: new Date(now + 1_000).toISOString()
      }
    ];

    if (assignment && channel.kind === "direct" && directTarget && project.workflow.leadUnitId) {
      messages.push({
        id: createLocalRecordId("message"),
        channelId: "lead-room",
        authorKind: "employee",
        authorLabel: directTarget.displayName,
        body: `${directTarget.displayName} 已根据 CEO 的明确指令开始执行「${assignment.title}」，后续我会先把阶段进展同步到这里。`,
        createdAt: new Date(now + 2_000).toISOString()
      });
    }

    return { messages, assignment, artifact };
  }

  function buildProjectChatReplyInput(
    project: DispatchProject,
    channel: ProjectChatChannel,
    unitsInProject: ClientUnit[],
    body: string
  ): ProjectChatReplyInput {
    const lead =
      unitsInProject.find((unit) => unit.id === project.workflow.leadUnitId) ??
      units.find((unit) => unit.id === project.workflow.leadUnitId) ??
      null;
    const directTarget =
      channel.kind === "direct" || channel.kind === "lead"
        ? unitsInProject.find((unit) => unit.id === channel.memberUnitIds[0]) ?? null
        : null;

    return {
      projectName: project.name,
      projectDescription: project.description,
      projectCategoryId: project.categoryId,
      channelKind: channel.kind,
      channelName: resolveProjectChannelName(channel, units),
      leadUnitId: project.workflow.leadUnitId,
      leadName: lead?.displayName ?? "项目主管",
      ...(directTarget
        ? {
            currentTargetUnitId: directTarget.id,
            currentTargetName: directTarget.displayName,
            currentTargetRoleLabel: directTarget.module?.strap ?? directTarget.name ?? "AI 员工",
            currentTargetSummary: directTarget.module?.summary ?? ""
          }
        : {}),
      members: unitsInProject.map((unit) => ({
        id: unit.id,
        displayName: unit.displayName,
        roleLabel: unit.module?.strap ?? unit.name,
        summary: unit.module?.summary ?? unit.starterTask,
        outputs: unit.outputs
      })),
      assignments: project.workflow.assignments.map((assignment) => ({
        ownerUnitId: assignment.ownerUnitId,
        title: assignment.title,
        status: assignment.status,
        ...(assignment.latestReport ? { latestReport: assignment.latestReport } : {}),
        updatedAt: assignment.updatedAt
      })),
      recentMessages: project.workflow.messages
        .filter((message) => message.channelId === channel.id)
        .slice(-8)
        .map((message) => ({
          authorKind: message.authorKind,
          authorLabel: message.authorLabel,
          body: message.body,
          createdAt: message.createdAt
        })),
      userMessage: body
    };
  }

  async function handleSendProjectMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeDispatchProject || !activeProjectChannel || !projectMessageDraft.trim() || isProjectReplying) {
      return;
    }

    const now = new Date().toISOString();
    const trimmed = projectMessageDraft.trim();
    const projectId = activeDispatchProject.id;
    const activeChannelId = activeProjectChannel.id;
    const currentProject = normalizeDispatchProject(activeDispatchProject, units);
    const unitsInProject = currentProject.workflow.memberUnitIds
      .map((unitId) => units.find((unit) => unit.id === unitId) ?? null)
      .filter((unit): unit is ClientUnit => Boolean(unit));
    const currentChannel =
      currentProject.workflow.channels.find((entry) => entry.id === activeChannelId) ??
      currentProject.workflow.channels[0]!;

    setIsProjectReplying(true);

    try {
      const modelReply = await client.createProjectChatReply(
        buildProjectChatReplyInput(currentProject, currentChannel, unitsInProject, trimmed)
      );

      updateDispatchProject(projectId, (project) => {
        const normalizedProject = normalizeDispatchProject(project, units);
        const channel =
          normalizedProject.workflow.channels.find((entry) => entry.id === activeChannelId) ??
          normalizedProject.workflow.channels[0]!;
        const directTarget =
          channel.kind === "direct" || channel.kind === "lead"
            ? unitsInProject.find((unit) => unit.id === channel.memberUnitIds[0]) ?? null
            : null;
        const assignment =
          modelReply.shouldStartExecution && directTarget && channel.kind === "direct"
            ? buildConversationDrivenAssignment(
                trimmed,
                directTarget,
                normalizedProject.workflow.leadUnitId,
                now
              )
            : undefined;
        const artifact =
          modelReply.shouldStartExecution &&
          directTarget &&
          channel.kind === "direct" &&
          assignment &&
          modelReply.executionDraft
            ? buildProjectExecutionArtifact(modelReply.executionDraft, assignment, directTarget.id, now)
            : undefined;
        const nextMessages: ProjectChatMessage[] = [
          ...normalizedProject.workflow.messages,
          {
            id: createLocalRecordId("message"),
            channelId: channel.id,
            authorKind: "ceo",
            authorLabel: "CEO",
            body: trimmed,
            createdAt: now
          },
          {
            id: createLocalRecordId("message"),
            channelId: channel.id,
            authorKind: channel.kind === "direct" && directTarget ? "employee" : "lead",
            authorLabel:
              channel.kind === "direct" && directTarget
                ? directTarget.displayName
                : units.find((unit) => unit.id === normalizedProject.workflow.leadUnitId)?.displayName ?? "项目主管",
            body: modelReply.reply,
            createdAt: new Date(Date.parse(now) + 1_000).toISOString()
          }
        ];

        if (assignment && directTarget) {
          nextMessages.push({
            id: createLocalRecordId("message"),
            channelId: "lead-room",
            authorKind: "employee",
            authorLabel: directTarget.displayName,
            body: `${directTarget.displayName} 已根据 CEO 的明确指令开始执行「${assignment.title}」，后续我会先把阶段进展同步到这里。`,
            createdAt: new Date(Date.parse(now) + 2_000).toISOString()
          });
        }

        return {
          ...normalizedProject,
          updatedAt: now,
          workflow: {
            ...normalizedProject.workflow,
            shortDramaStage:
              artifact && normalizedProject.categoryId === "ai-short-drama"
                ? mapExecutionDraftStageToProjectStage(artifact.stageId) ?? normalizedProject.workflow.shortDramaStage
                : normalizedProject.workflow.shortDramaStage,
            messages: nextMessages,
            assignments: assignment
              ? [assignment, ...normalizedProject.workflow.assignments]
              : normalizedProject.workflow.assignments,
            outputs: artifact ? [artifact, ...normalizedProject.workflow.outputs] : normalizedProject.workflow.outputs,
            selectedAssignmentId: assignment?.id ?? normalizedProject.workflow.selectedAssignmentId
          }
        };
      });

      setProjectMessageDraft("");
      setNotice(
        modelReply.shouldStartExecution
          ? "已记录为正式执行指令，当前员工会开始推进并同步给项目主管。"
          : "消息已发送，当前员工会先理解你的意图，再像真实同事一样回复。"
      );
    } catch {
      updateDispatchProject(projectId, (project) => {
        const normalizedProject = normalizeDispatchProject(project, units);
        const channel =
          normalizedProject.workflow.channels.find((entry) => entry.id === activeChannelId) ??
          normalizedProject.workflow.channels[0]!;
        const fallbackReply = buildProjectAutoReply(normalizedProject, channel, unitsInProject, trimmed);
        const nextMessages = [
          ...normalizedProject.workflow.messages,
          {
            id: createLocalRecordId("message"),
            channelId: channel.id,
            authorKind: "ceo" as const,
            authorLabel: "CEO",
            body: trimmed,
            createdAt: now
          },
          ...fallbackReply.messages
        ];

        return {
          ...normalizedProject,
          updatedAt: now,
          workflow: {
            ...normalizedProject.workflow,
            shortDramaStage:
              fallbackReply.artifact && normalizedProject.categoryId === "ai-short-drama"
                ? mapExecutionDraftStageToProjectStage(fallbackReply.artifact.stageId) ??
                  normalizedProject.workflow.shortDramaStage
                : normalizedProject.workflow.shortDramaStage,
            messages: nextMessages,
            assignments: fallbackReply.assignment
              ? [fallbackReply.assignment, ...normalizedProject.workflow.assignments]
              : normalizedProject.workflow.assignments,
            outputs: fallbackReply.artifact
              ? [fallbackReply.artifact, ...normalizedProject.workflow.outputs]
              : normalizedProject.workflow.outputs,
            selectedAssignmentId: fallbackReply.assignment?.id ?? normalizedProject.workflow.selectedAssignmentId
          }
        };
      });

      setProjectMessageDraft("");
      setNotice("当前已回退到本地规则回复，建议后续接入真实模型配置。");
    } finally {
      setIsProjectReplying(false);
    }
  }

  function handleCreateProjectGroup() {
    if (!activeDispatchProject) {
      return;
    }

    const name = projectGroupDraftName.trim();
    const memberUnitIds = Array.from(new Set(projectGroupDraftMemberIds)).filter(Boolean);

    if (!name) {
      setError("先填写群组名称。");
      return;
    }

    if (!memberUnitIds.length) {
      setError("至少选择一位员工加入群组。");
      return;
    }

    updateDispatchProject(activeDispatchProject.id, (project) => {
      const normalizedProject = normalizeDispatchProject(project, units);
      const newChannel: ProjectChatChannel = {
        id: createLocalRecordId("group"),
        name,
        kind: "group",
        memberUnitIds
      };
      const joinedNames = memberUnitIds
        .map((unitId) => units.find((unit) => unit.id === unitId)?.displayName)
        .filter(Boolean)
        .join("、");

      return {
        ...normalizedProject,
        updatedAt: new Date().toISOString(),
        workflow: {
          ...normalizedProject.workflow,
          activeChannelId: newChannel.id,
          channels: [...normalizedProject.workflow.channels, newChannel],
          messages: [
            ...normalizedProject.workflow.messages,
            {
              id: createLocalRecordId("message"),
              channelId: newChannel.id,
              authorKind: "system",
              authorLabel: "系统",
              body: `群组 ${name} 已创建，当前成员包括：${joinedNames}。后续相关进展会优先同步到项目主管。`,
              createdAt: new Date().toISOString()
            }
          ]
        }
      };
    });

    setProjectGroupDraftName("");
    setProjectGroupDraftMemberIds([]);
    setError(null);
  }

  function handleSelectProjectAssignment(assignmentId: string) {
    setSelectedProjectAssignmentId(assignmentId);
    setProjectReportDraft("");
    setProjectReportStatus("in_progress");

    if (!activeDispatchProject) {
      return;
    }

    updateDispatchProject(activeDispatchProject.id, (project) => ({
      ...project,
      workflow: {
        ...project.workflow,
        selectedAssignmentId: assignmentId
      }
    }));
  }

  function handleCreateProjectAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeDispatchProject || !activeProjectLead) {
      return;
    }

    const ownerUnit =
      activeProjectMembers.find((member) => member.id === projectAssignmentDraft.ownerUnitId) ?? null;
    const title = projectAssignmentDraft.title.trim();
    const summary = projectAssignmentDraft.summary.trim();
    const deliverable = projectAssignmentDraft.deliverable.trim();

    if (!ownerUnit) {
      setError("先选择一位员工作为任务负责人。");
      return;
    }

    if (!title) {
      setError("先填写任务标题。");
      return;
    }

    if (!summary) {
      setError("先写清楚这项任务要完成什么。");
      return;
    }

    const now = new Date().toISOString();
    const assignment: ProjectAssignment = {
      id: createLocalRecordId("assignment"),
      ownerUnitId: ownerUnit.id,
      assignedByUnitId: activeProjectLead.id,
      title,
      summary,
      deliverable: deliverable || ownerUnit.outputs[0] || "本轮交付",
      priority: projectAssignmentDraft.priority,
      status: "todo",
      reportCount: 0,
      createdAt: now,
      updatedAt: now
    };

    updateDispatchProject(activeDispatchProject.id, (project) => {
      const normalizedProject = normalizeDispatchProject(project, units);
      const directChannelId = `direct:${ownerUnit.id}`;
      const nextMessages = [
        ...normalizedProject.workflow.messages,
        {
          id: createLocalRecordId("message"),
          channelId: "lead-room",
          authorKind: "lead" as const,
          authorLabel: activeProjectLead.displayName,
          body: `我已向 ${ownerUnit.displayName} 派发任务「${title}」。目标：${summary}。交付要求：${assignment.deliverable}。`,
          createdAt: now
        },
        {
          id: createLocalRecordId("message"),
          channelId: directChannelId,
          authorKind: "lead" as const,
          authorLabel: activeProjectLead.displayName,
          body: `请优先推进任务「${title}」。交付要求：${assignment.deliverable}。完成后先向我汇报，再决定是否同步给 CEO。`,
          createdAt: new Date(Date.parse(now) + 1_000).toISOString()
        }
      ];

      return {
        ...normalizedProject,
        updatedAt: now,
        workflow: {
          ...normalizedProject.workflow,
          assignments: [assignment, ...normalizedProject.workflow.assignments],
          messages: nextMessages,
          selectedAssignmentId: assignment.id
        }
      };
    });

    setSelectedProjectAssignmentId(assignment.id);
    setProjectAssignmentDraft(
      createProjectAssignmentDraft({
        ownerUnitId: ownerUnit.id,
        priority: projectAssignmentDraft.priority
      })
    );
    setProjectReportDraft("");
    setProjectReportStatus("in_progress");
    setError(null);
    setNotice(`项目主管已向 ${ownerUnit.displayName} 派发任务。`);
  }

  function handleSubmitProjectReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeDispatchProject || !selectedProjectAssignment || !activeProjectLead) {
      return;
    }

    const summary = projectReportDraft.trim();

    if (!summary) {
      setError("先写一段进展回报。");
      return;
    }

    const ownerUnit =
      activeProjectMembers.find((member) => member.id === selectedProjectAssignment.ownerUnitId) ?? null;

    if (!ownerUnit) {
      setError("当前任务负责人不存在，请重新选择项目员工。");
      return;
    }

    const now = new Date().toISOString();
    const report: ProjectAssignmentReport = {
      id: createLocalRecordId("report"),
      assignmentId: selectedProjectAssignment.id,
      authorUnitId: ownerUnit.id,
      summary,
      status: projectReportStatus,
      createdAt: now
    };

    updateDispatchProject(activeDispatchProject.id, (project) => {
      const normalizedProject = normalizeDispatchProject(project, units);
      const nextAssignments = normalizedProject.workflow.assignments.map((assignment) =>
        assignment.id === selectedProjectAssignment.id
          ? {
              ...assignment,
              status: projectReportStatus,
              latestReport: summary,
              lastReportAt: now,
              reportCount: assignment.reportCount + 1,
              updatedAt: now
            }
          : assignment
      );
      const existingArtifact = normalizedProject.workflow.outputs.find(
        (artifact) => artifact.assignmentId === selectedProjectAssignment.id
      );
      const nextStageId = existingArtifact?.stageId ?? deriveExecutionDraftStageMeta(ownerUnit).stageId;
      const nextOutputs = existingArtifact
        ? normalizedProject.workflow.outputs.map((artifact) =>
            artifact.assignmentId === selectedProjectAssignment.id
              ? updateProjectExecutionArtifactFromReport(artifact, report)
              : artifact
          )
        : [
            buildProjectExecutionArtifact(
              buildLocalExecutionDraft(selectedProjectAssignment.summary, ownerUnit, activeProjectLead.displayName),
              selectedProjectAssignment,
              ownerUnit.id,
              now
            ),
            ...normalizedProject.workflow.outputs
          ].map((artifact) =>
            artifact.assignmentId === selectedProjectAssignment.id
              ? updateProjectExecutionArtifactFromReport(artifact, report)
              : artifact
          );
      const directChannelId = `direct:${ownerUnit.id}`;
      const nextMessages = [
        ...normalizedProject.workflow.messages,
        {
          id: createLocalRecordId("message"),
          channelId: directChannelId,
          authorKind: "employee" as const,
          authorLabel: ownerUnit.displayName,
          body: `关于「${selectedProjectAssignment.title}」的进展回报：${summary}`,
          createdAt: now
        },
        {
          id: createLocalRecordId("message"),
          channelId: "lead-room",
          authorKind: "employee" as const,
          authorLabel: ownerUnit.displayName,
          body: `汇报任务「${selectedProjectAssignment.title}」：${summary}`,
          createdAt: new Date(Date.parse(now) + 1_000).toISOString()
        },
        ...(projectReportStatus === "review"
          ? [
              {
                id: createLocalRecordId("message"),
                channelId: "all-hands",
                authorKind: "lead" as const,
                authorLabel: activeProjectLead.displayName,
                body: `任务「${selectedProjectAssignment.title}」已进入待主管查看，后续我会判断是否升级汇报给 CEO。`,
                createdAt: new Date(Date.parse(now) + 2_000).toISOString()
              }
            ]
          : [])
      ];

      return {
        ...normalizedProject,
        updatedAt: now,
        workflow: {
          ...normalizedProject.workflow,
          shortDramaStage:
            normalizedProject.categoryId === "ai-short-drama"
              ? mapExecutionDraftStageToProjectStage(nextStageId) ??
                normalizedProject.workflow.shortDramaStage
              : normalizedProject.workflow.shortDramaStage,
          assignments: nextAssignments,
          reports: [report, ...normalizedProject.workflow.reports],
          outputs: nextOutputs,
          messages: nextMessages,
          selectedAssignmentId: selectedProjectAssignment.id
        }
      };
    });

    setProjectReportDraft("");
    setProjectReportStatus(
      projectReportStatus === "done" ? "done" : projectReportStatus === "blocked" ? "blocked" : "in_progress"
    );
    setError(null);
    setNotice(`${ownerUnit.displayName} 已向项目主管回报进展。`);
  }

  function handleToggleProjectMember(unitId: string) {
    setDispatchProjectDraft((current) => {
      const memberUnitIds = current.memberUnitIds.includes(unitId)
        ? current.memberUnitIds.filter((entry) => entry !== unitId)
        : [...current.memberUnitIds, unitId];
      const nextLeadUnitId = memberUnitIds.includes(current.leadUnitId)
        ? current.leadUnitId
        : memberUnitIds[0] ?? "";

      return {
        ...current,
        memberUnitIds,
        leadUnitId: nextLeadUnitId
      };
    });
  }

  function handleSelectProjectLead(unitId: string) {
    setDispatchProjectDraft((current) => ({
      ...current,
      leadUnitId: unitId,
      memberUnitIds: current.memberUnitIds.includes(unitId) ? current.memberUnitIds : [...current.memberUnitIds, unitId]
    }));
  }

  function handleCreateDispatchProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = dispatchProjectDraft.name.trim();
    const description = dispatchProjectDraft.description.trim();
    const memberUnits = dispatchProjectDraft.memberUnitIds
      .map((unitId) => units.find((entry) => entry.id === unitId) ?? null)
      .filter((entry): entry is ClientUnit => Boolean(entry));
    const leadUnit =
      memberUnits.find((entry) => entry.id === dispatchProjectDraft.leadUnitId) ?? memberUnits[0] ?? null;

    if (!name) {
      setError("先填写项目名称。");
      return;
    }

    if (!description) {
      setError("请补充项目说明，方便后续直接进入工作流。");
      return;
    }

    if (!memberUnits.length) {
      setError("请至少选择一位项目员工。");
      return;
    }

    if (!leadUnit) {
      setError("请指定项目主管。");
      return;
    }

    const nextProject = createDispatchProjectRecord(
      {
        ...dispatchProjectDraft,
        leadUnitId: leadUnit.id,
        memberUnitIds: memberUnits.map((entry) => entry.id)
      },
      leadUnit,
      memberUnits
    );

    setDispatchProjects((current) => [nextProject, ...current]);
    setIsProjectCreateModalOpen(false);
    setDispatchProjectDraft(createDispatchProjectDraft());
    setDispatchProjectSearch("");
    setActiveDispatchProjectId(nextProject.id);
    setSelectedUnitId(leadUnit.id);
    setNotice(`项目 ${nextProject.name} 已创建。`);
    setError(null);
  }

  function handleSaveProjectSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeDispatchProject) {
      return;
    }

    const name = projectSettingsDraft.name.trim();
    const description = projectSettingsDraft.description.trim();
    const memberUnits = activeDispatchProject.workflow.memberUnitIds
      .map((unitId) => units.find((entry) => entry.id === unitId) ?? null)
      .filter((entry): entry is ClientUnit => Boolean(entry));
    const leadUnit =
      memberUnits.find((entry) => entry.id === projectSettingsDraft.leadUnitId) ?? memberUnits[0] ?? null;

    if (!name) {
      setError("先填写项目名称。");
      return;
    }

    if (!description) {
      setError("请补充项目说明。");
      return;
    }

    if (!leadUnit) {
      setError("请指定项目主管。");
      return;
    }

    const now = new Date().toISOString();

    updateDispatchProject(activeDispatchProject.id, (project) => {
      const normalizedProject = normalizeDispatchProject(project, units);
      const systemChannels = buildProjectChannels(
        normalizedProject.workflow.memberUnitIds,
        leadUnit.id,
        memberUnits
      );
      const groupChannels = normalizedProject.workflow.channels.filter((channel) => channel.kind === "group");
      const nextChannels = [...systemChannels, ...groupChannels];
      const nextActiveChannelId = nextChannels.some(
        (channel) => channel.id === normalizedProject.workflow.activeChannelId
      )
        ? normalizedProject.workflow.activeChannelId
        : nextChannels[0]?.id ?? "";

      return {
        ...normalizedProject,
        name,
        description,
        unitId: leadUnit.id,
        updatedAt: now,
        workflow: {
          ...normalizedProject.workflow,
          leadUnitId: leadUnit.id,
          intentDraft: deriveIntentSeed(description),
          taskGoal: description,
          channels: nextChannels,
          activeChannelId: nextActiveChannelId,
          messages: [
            ...normalizedProject.workflow.messages,
            {
              id: createLocalRecordId("message"),
              channelId: "all-hands",
              authorKind: "system",
              authorLabel: "系统",
              body: `项目设置已更新。当前项目主管为 ${leadUnit.displayName}，项目说明已同步到最新版本。`,
              createdAt: now
            }
          ]
        }
      };
    });

    setSelectedUnitId(leadUnit.id);
    setIsProjectSettingsModalOpen(false);
    setError(null);
    setNotice(`项目 ${name} 的设置已更新。`);
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeUnit) {
      setError("请先选择一位员工。");
      return;
    }

    const businessGoal = isShortDramaUnit(activeUnit) ? shortDramaBriefPreview : taskGoal;

    if (!businessGoal.trim()) {
      setError("先把当前阶段要执行的目标写清楚。");
      return;
    }

    try {
      setIsSubmittingTask(true);
      setError(null);
      setNotice(null);

      const projectScopedBusinessGoal = activeDispatchProject
        ? `${buildDispatchProjectMarker(activeDispatchProject.name)}\n${businessGoal}`
        : businessGoal;
      const taskTitle = activeDispatchProject
        ? `${activeDispatchProject.name} · ${activeUnit.displayName} 任务`
        : `${activeUnit.displayName} 任务`;

      await client.createTask(activeUnit.id, {
        title: taskTitle,
        businessGoal: projectScopedBusinessGoal,
        deliverableType: resolveDeliverableType(activeUnit),
        constraints: buildTaskConstraints(activeUnit, projectScopedBusinessGoal)
      });
      setTaskGoal(businessGoal);
      if (isShortDramaUnit(activeUnit)) {
        setShortDramaStage("storyboard");
      }
      await loadData(activeUnit.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Task creation failed.");
    } finally {
      setIsSubmittingTask(false);
    }
  }

  async function handleRenameUnit(unit: ClientUnit) {
    const nextName = unitNameDraft.trim();

    if (!nextName) {
      setError("名称不能为空。");
      return;
    }

    try {
      setIsRenamingUnitId(unit.id);
      setError(null);
      setNotice(null);
      await client.updateTeamInstance(unit.id, {
        name: unit.module ? buildStoredUnitName(unit.module, nextName) : nextName
      });
      setNotice(`${unit.kind === "team" ? "团队" : "员工"}名称已更新。`);
      await loadData(unit.id);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Unit rename failed.");
    } finally {
      setIsRenamingUnitId("");
    }
  }

  function handleSmartRoute() {
    const scopedUnits = activeDispatchProject
      ? units.filter((unit) => unit.module?.categoryIds.includes(activeDispatchProject.categoryId) ?? false)
      : units;
    const recommendation = recommendDispatchTarget(
      intentDraft || taskGoal,
      scopedUnits,
      activeDispatchProject?.categoryId
    );

    if (!recommendation) {
      setError("先写一句话目标，再让系统帮你推荐执行单位。");
      return;
    }

    setError(null);

    if (recommendation.kind === "unit") {
      setSelectedUnitId(recommendation.unit.id);
      if (!taskGoal.trim()) {
        setTaskGoal(deriveIntentSeed(intentDraft) || recommendation.unit.starterTask);
      }
      setNotice(`AI 已将当前任务匹配到 ${recommendation.unit.displayName}。`);
      return;
    }

    setRecruitCategoryId(recommendation.module.categoryIds[0] ?? "all");
    setRecruitFocusId(recommendation.module.focusIds[0] ?? "all");
    setActiveView("recruit");
    setNotice(`这类任务更适合先招聘 ${recommendation.module.title}。`);
  }

  function handleCompleteBrief() {
    const intent = deriveIntentSeed(intentDraft || taskGoal);
    if (!intent) {
      setError("先写一句话任务目标，再补全成结构化 Brief。");
      return;
    }

    const scopedUnits = activeDispatchProject
      ? units.filter((unit) => unit.module?.categoryIds.includes(activeDispatchProject.categoryId) ?? false)
      : units;
    const recommendation = recommendDispatchTarget(intent, scopedUnits, activeDispatchProject?.categoryId);
    const recommendedUnit =
      recommendation?.kind === "unit" ? recommendation.unit : activeUnit ?? scopedUnits[0] ?? null;

    if (!recommendedUnit) {
      setError("当前还没有可用执行员工，请先招聘至少一位员工。");
      return;
    }

    setError(null);
    setSelectedUnitId(recommendedUnit.id);
    setTaskGoal(buildCompletedBrief(intent, recommendedUnit));
    setNotice(
      recommendation?.kind === "unit" && recommendation.unit.id !== activeUnit?.id
        ? `已切换到 ${recommendedUnit.displayName}，并补全成结构化 Brief。`
        : "已将一句话目标补全成结构化 Brief。"
    );
  }

  async function handleApprove(approvalId: string) {
    try {
      setError(null);
      setNotice(null);
      await client.approveApproval(approvalId, "通过，继续执行。");
      setNotice("审批已通过。");
      await loadData(activeUnit?.id);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Approval failed.");
    }
  }

  async function handleReject(approvalId: string) {
    try {
      setError(null);
      setNotice(null);
      await client.rejectApproval(approvalId, "请调整为更聚焦的执行方案。");
      setNotice("审批已驳回。");
      await loadData(activeUnit?.id);
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "Rejection failed.");
    }
  }

  async function handleCopyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(successMessage);
    } catch {
      setError("当前环境不支持自动复制，请稍后重试。");
    }
  }

  function handleSaveCharactersToLibrary(cards: ShortDramaCharacterCard[], sourceLabel: string) {
    if (!cards.length) {
      setError("当前还没有可收纳的人物设定。");
      return;
    }

    const now = new Date().toISOString();
    const nextAssets = cards.map((card, index) => ({
      ...card,
      id: `${card.name}-${sourceLabel}-${index}-${now}`,
      sourceLabel,
      createdAt: now
    })) satisfies ShortDramaCharacterAsset[];

    setCharacterAssets((current) => mergeCharacterAssets(current, nextAssets));
    setError(null);
    setNotice(`已收纳 ${cards.length} 张角色资产。`);
  }

  function handleApplyCharacterAsset(
    asset: ShortDramaCharacterAsset,
    target: "heroine" | "hero" | "supportingCast"
  ) {
    setShortDramaDraft((current) => {
      if (target === "supportingCast") {
        const nextSupportingCast = current.supportingCast.trim()
          ? `${current.supportingCast}\n${asset.name}｜${asset.role}｜${asset.summary}`
          : `${asset.name}｜${asset.role}｜${asset.summary}`;

        return {
          ...current,
          supportingCast: nextSupportingCast
        };
      }

      return {
        ...current,
        [target]: `${asset.name}｜${asset.summary}`
      };
    });
    setNotice(`已将 ${asset.name} 带入当前人物定稿。`);
    setError(null);
  }

  function handleUpdateSceneDecision(
    sceneId: string,
    patch: Partial<ShortDramaSceneReviewDecision> & Pick<ShortDramaSceneReviewDecision, "status">
  ) {
    setSceneReviewDecisions((current) => ({
      ...current,
      [sceneId]: {
        sceneId,
        status: patch.status,
        note: patch.note ?? current[sceneId]?.note ?? "",
        updatedAt: new Date().toISOString()
      }
    }));
  }

  function handleUpdateSceneReviewNote(sceneId: string, note: string) {
    setSceneReviewDecisions((current) => ({
      ...current,
      [sceneId]: {
        sceneId,
        status: current[sceneId]?.status ?? "hold",
        note,
        updatedAt: new Date().toISOString()
      }
    }));
  }

  async function handleStartVideoGeneration(deliverable: Deliverable) {
    try {
      setIsSubmittingVideoTaskId(deliverable.taskId);
      setError(null);
      setNotice(null);
      missingVideoSessionKeysRef.current.delete(
        videoSessionKey(deliverable.taskId, deliverable.id)
      );
      const session = await client.createTaskVideoGeneration(deliverable.taskId, {
        deliverableId: deliverable.id
      });
      setVideoSessions((current) => ({
        ...current,
        [videoSessionKey(deliverable.taskId, deliverable.id)]: session
      }));
      if (isShortDramaActive) {
        setShortDramaStage("video");
      }
      setNotice(`已提交 ${session.clips.length} 个分镜到 ${session.providerModel}。`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Video generation could not be started."
      );
    } finally {
      setIsSubmittingVideoTaskId("");
    }
  }

  async function handleRefreshVideoGeneration(deliverable: Deliverable) {
    try {
      setIsRefreshingVideoTaskId(deliverable.taskId);
      setError(null);
      const session = await client.getTaskVideoGeneration(deliverable.taskId, deliverable.id);

      if (!session) {
        setNotice("当前还没有视频生成任务，请先点击“提交到视频生成器”。");
        return;
      }

      setVideoSessions((current) => ({
        ...current,
        [videoSessionKey(deliverable.taskId, deliverable.id)]: session
      }));
      if (isShortDramaActive && (session.status === "completed" || session.status === "partial")) {
        setShortDramaStage("review");
      }
      setNotice(`已刷新 ${session.providerModel} 视频状态。`);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : "Video generation status refresh failed."
      );
    } finally {
      setIsRefreshingVideoTaskId("");
    }
  }

  function handleClearSession() {
    setSessionToken("");
    setSessionTokenDraft("");
    setLatestIssuedSessionToken("");
    resetWorkspaceState();
    setWorkspaceUnlocked(HAS_CONFIGURED_FALLBACK_IDENTITY);
    setAccessView("demo");
    setActiveView("recruit");
    setNotice(
      HAS_CONFIGURED_FALLBACK_IDENTITY
        ? "已清除 session token，当前退回到环境配置身份。"
        : "已清除 session token，请重新选择一种接入方式。"
    );
    setError(null);
  }

  function cancelAccountMenuClose() {
    if (accountMenuCloseTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(accountMenuCloseTimerRef.current);
      accountMenuCloseTimerRef.current = null;
    }
  }

  function openAccountMenu() {
    cancelAccountMenuClose();
    setIsAccountMenuOpen(true);
  }

  function scheduleAccountMenuClose() {
    cancelAccountMenuClose();

    if (typeof window === "undefined") {
      setIsAccountMenuOpen(false);
      return;
    }

    accountMenuCloseTimerRef.current = window.setTimeout(() => {
      setIsAccountMenuOpen(false);
      accountMenuCloseTimerRef.current = null;
    }, 140);
  }

  function handleOpenSettingsFromMenu() {
    setActiveView("settings");
    setIsAccountMenuOpen(false);
  }

  function handleMenuPlaceholder(label: string) {
    setError(null);
    setNotice(`${label}功能即将开放。`);
    setIsAccountMenuOpen(false);
  }

  function handleAccountMenuBlur(nextTarget: EventTarget | null, currentTarget: HTMLDivElement) {
    if (nextTarget instanceof Node && currentTarget.contains(nextTarget)) {
      return;
    }

    scheduleAccountMenuClose();
  }

  function renderAccessPanel() {
    const activeAccessOption = accessOptions.find((option) => option.id === accessView) ?? accessOptions[0]!;

    return (
      <main className="studio-access-shell">
        <header className="studio-access-topbar">
          <div className="studio-access-brand">
            <div className="brand-badge" title={APP_NAME}>
              <span>TO</span>
            </div>
            <strong>{APP_NAME}</strong>
          </div>
          <div className="studio-access-chip-row">
            <span className="studio-access-chip">短剧工作流</span>
            <span className="studio-access-chip">Bot 员工</span>
            <span className="studio-access-chip accent">Studio Client</span>
          </div>
        </header>

        <section className="studio-access-main">
          <section className="studio-access-hero">
            <div className="studio-access-hero-copy">
              <span className="studio-access-eyebrow">TEAM OS STUDIO</span>
              <h1>
                <span>OpenClaw</span>
                <span>Team OS</span>
              </h1>
              <p>进入你的 AI 制作工作台，先开始工作，再逐步补齐员工、项目与审查流程。</p>
            </div>

            <div className="studio-access-highlight-grid">
              <article className="studio-access-highlight">
                <span>Recruit</span>
                <strong>先补位再开工</strong>
                <p>先招聘 Bot 员工，再把项目和任务交给正确的主管与员工。</p>
              </article>
              <article className="studio-access-highlight">
                <span>Project</span>
                <strong>围绕项目推进</strong>
                <p>每个方向先立项目，再进入对应工作流，不把内容散落在主界面。</p>
              </article>
              <article className="studio-access-highlight">
                <span>Review</span>
                <strong>结果统一收口</strong>
                <p>人物、分镜、视频和审批节点都在统一工作台里集中审阅。</p>
              </article>
            </div>

            <div className="studio-access-hero-footer">
              <div className="studio-access-hero-rule" />
              <p>面向 Studio Client 的统一入口。支持 Demo、正式组织、Session 接入与邀请协作。</p>
            </div>
          </section>

          <section className="studio-access-console">
            <header className="studio-access-console-head">
              <div>
                <span className="studio-access-console-kicker">{activeAccessOption.eyebrow}</span>
                <h2>进入客户端</h2>
                <p>{activeAccessOption.summary}</p>
              </div>
            </header>

            <div className="studio-access-banners">
              {error ? <div className="banner error">{error}</div> : null}
              {notice ? <div className="banner notice">{notice}</div> : null}
            </div>

            <div className="studio-access-mode-grid">
              {accessOptions.map((option, index) => (
                <button
                  className={accessView === option.id ? "studio-access-mode-card active" : "studio-access-mode-card"}
                  key={option.id}
                  onClick={() => setAccessView(option.id)}
                  type="button"
                >
                  <span className="studio-access-mode-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="studio-access-mode-copy">
                    <span>{option.eyebrow}</span>
                    <strong>{option.title}</strong>
                    <p>{option.summary}</p>
                  </div>
                </button>
              ))}
            </div>

            <section className="studio-access-worksurface">
              <header className="studio-access-panel-head">
                <div>
                  <span className="studio-access-panel-kicker">Current Access</span>
                  <strong>{activeAccessOption.title}</strong>
                  <p>{activeAccessOption.summary}</p>
                </div>
              </header>

              {accessView === "demo" ? (
                <div className="studio-access-form studio-access-form-compact">
                  <div className="studio-access-note">
                    <strong>推荐先用 Demo Admin</strong>
                    <p>最快进入新 UI，直接体验左侧功能导航、招聘目录和短剧项目流。</p>
                  </div>
                  <button
                    className="studio-access-submit"
                    disabled={isSigningIn}
                    onClick={handleUseDemoSession}
                    type="button"
                  >
                    {isSigningIn ? "进入中..." : "进入客户端"}
                  </button>
                </div>
              ) : null}

              {accessView === "create" ? (
                <form className="studio-access-form" onSubmit={handleCreateOrganization}>
                  <div className="studio-access-note">
                    <strong>创建正式组织</strong>
                    <p>会自动生成管理员 session，进入后即可开始招聘和发起任务。</p>
                  </div>
                  <label className="studio-access-field">
                    <span>组织名称</span>
                    <input
                      onChange={(event) => setOrganizationNameDraft(event.target.value)}
                      value={organizationNameDraft}
                    />
                  </label>
                  <label className="studio-access-field">
                    <span>管理员名称</span>
                    <input
                      onChange={(event) => setOrganizationAdminNameDraft(event.target.value)}
                      value={organizationAdminNameDraft}
                    />
                  </label>
                  <label className="studio-access-field">
                    <span>管理员邮箱</span>
                    <input
                      onChange={(event) => setOrganizationAdminEmailDraft(event.target.value)}
                      type="email"
                      value={organizationAdminEmailDraft}
                    />
                  </label>
                  <button className="studio-access-submit" disabled={isCreatingOrganization} type="submit">
                    {isCreatingOrganization ? "创建中..." : "创建组织并进入"}
                  </button>
                </form>
              ) : null}

              {accessView === "session" ? (
                <form className="studio-access-form studio-access-form-compact" onSubmit={handleSessionSubmit}>
                  <div className="studio-access-note">
                    <strong>已有组织凭证</strong>
                    <p>适合继续使用已有工作区，保留当前组织上下文。</p>
                  </div>
                  <label className="studio-access-field">
                    <span>Session Token</span>
                    <input
                      onChange={(event) => setSessionTokenDraft(event.target.value)}
                      value={sessionTokenDraft}
                    />
                  </label>
                  <button className="studio-access-submit" disabled={isSigningIn} type="submit">
                    {isSigningIn ? "验证中..." : "进入当前组织"}
                  </button>
                </form>
              ) : null}

              {accessView === "invite" ? (
                <form className="studio-access-form studio-access-form-compact" onSubmit={handleAcceptInvitation}>
                  <div className="studio-access-note">
                    <strong>邀请加入团队</strong>
                    <p>适合审批人或协作成员快速进入现有组织。</p>
                  </div>
                  <label className="studio-access-field">
                    <span>Invitation Id</span>
                    <input onChange={(event) => setInvitationId(event.target.value)} value={invitationId} />
                  </label>
                  <label className="studio-access-field">
                    <span>你的名字</span>
                    <input onChange={(event) => setInviteeName(event.target.value)} value={inviteeName} />
                  </label>
                  <button className="studio-access-submit" disabled={isAcceptingInvitation} type="submit">
                    {isAcceptingInvitation ? "加入中..." : "接受邀请并进入"}
                  </button>
                </form>
              ) : null}
            </section>
          </section>
        </section>
      </main>
    );
  }

  function renderOverviewView() {
    const recommendedModules = recruitModules
      .filter((module) => module.kind === "employee" && !hiredModuleIds.has(module.id))
      .slice(0, 4);

    return (
      <div className="workspace-stack">
        <div className="metrics-grid">
          <MetricPanel
            detail="围绕业务分类持续补齐 AI 员工编制。"
            label="已招聘员工"
            value={String(employeeUnits.length)}
          />
          <MetricPanel
            detail="每个项目需要明确一位主管负责统筹推进。"
            label="进行中项目"
            value={String(dispatchProjects.length)}
          />
          <MetricPanel
            detail="审批工作区只保留需要人工判断的节点。"
            label="待审批"
            value={String(pendingApprovalCount)}
          />
          <MetricPanel
            detail="当前优先展示组织级预算，不再把预算放在主路径里。"
            label="本月消耗"
            value={currency(organizationBudget?.monthlySpentCny ?? 0)}
          />
        </div>

        <SurfaceSection
          subtitle="客户端的第一入口应该是招聘，不是教程。以下是当前最适合补齐编制的 AI 单位。"
          title="推荐招聘"
        >
          <div className="module-grid">
            {recommendedModules.map((module) => (
              <article className="module-card compact" data-accent={module.accent} key={module.id}>
                <div className="module-card-top">
                  <div>
                    <span className="module-strap">{module.strap}</span>
                    <h3>{module.title}</h3>
                  </div>
                  <StatusPill tone={module.kind === "team" ? "warm" : "good"}>
                    员工
                  </StatusPill>
                </div>
                <p>{module.summary}</p>
                <button
                  className="secondary-button"
                  disabled={Boolean(isHiringModuleId)}
                  onClick={() => handleOpenHireConfirm(module)}
                  type="button"
                >
                  立即招聘
                </button>
              </article>
            ))}
          </div>
        </SurfaceSection>

        <SurfaceSection
          action={
            activeUnit ? (
              <button className="ghost-button" onClick={() => setActiveView("dispatch")} type="button">
                去任务台
              </button>
            ) : null
          }
          subtitle="总览不再承担复杂流程，而是帮助你判断当前应该补编制、派任务还是处理审批。"
          title="当前工作焦点"
        >
          {activeUnit ? (
            <div className="focus-grid">
              <article className="focus-card">
                <span className="focus-label">当前激活单位</span>
                <strong>{activeUnit.displayName}</strong>
                <p>{activeUnit.module?.summary ?? "当前使用的是通用 Team OS 单位。"}</p>
                <div className="chip-row">
                  <StatusPill tone="neutral">员工</StatusPill>
                  <StatusPill tone="neutral">{activeUnit.module?.categoryIds[0] ? projectCategoryLabel(activeUnit.module.categoryIds[0] as ProjectCategoryId) : "通用"}</StatusPill>
                </div>
              </article>
              <article className="focus-card">
                <span className="focus-label">最近交付</span>
                <strong>{dashboard?.recentDeliverables[0]?.title ?? "还没有交付物"}</strong>
                <p>
                  {dashboard?.recentDeliverables[0]?.summary ??
                    "先招聘一个执行单位，再在任务台发起第一项任务。"}
                </p>
              </article>
            </div>
          ) : (
            <EmptyPanel
              action={
                <button className="primary-button" onClick={() => setActiveView("recruit")} type="button">
                  去招聘工作区
                </button>
              }
              body="当前组织还没有任何 AI 员工。先从招聘工作区补齐第一批编制。"
              title="当前没有在编单位"
            />
          )}
        </SurfaceSection>
      </div>
    );
  }

  function renderRecruitView() {
    const visibleRecruitModules = recruitModules.filter((module) => module.kind === "employee");
    const matchesCategory = (module: RecruitModule) =>
      recruitCategoryId === "all" || module.categoryIds.includes(recruitCategoryId);
    const employeeModules = visibleRecruitModules.filter(
      (module) => module.kind === "employee" && matchesCategory(module)
    );
    const activeCategory =
      recruitCategories.find((category) => category.id === recruitCategoryId) ?? recruitCategories[0]!;
    const recruitGrid = resolveRecruitGridConfig(viewportWidth);

    return (
      <div
        className="workspace-stack recruit-workspace-stack"
        style={recruitWorkspaceStyle(recruitGrid)}
      >
        <SurfaceSection
          subtitle="先按方向查看当前可招聘的 AI 员工。"
          title="方向分类"
        >
          <div className="category-strip">
            {recruitCategories.map((category) => {
              const count =
                category.id === "all"
                  ? visibleRecruitModules.length
                  : visibleRecruitModules.filter((module) => module.categoryIds.includes(category.id)).length;

              return (
                <button
                  className={recruitCategoryId === category.id ? "category-chip active" : "category-chip"}
                  key={category.id}
                  onClick={() => setRecruitCategoryId(category.id)}
                  type="button"
                >
                  <div className="catalog-heading">
                    <span className="catalog-icon">
                      <CatalogGlyph height={20} name={category.id} width={20} />
                    </span>
                    <strong>{category.title}</strong>
                  </div>
                  <span>{category.summary}</span>
                  <em>{count} 个可招聘单元</em>
                </button>
              );
            })}
          </div>
        </SurfaceSection>

        <SurfaceSection
          action={
            <div className="chip-row">
              <StatusPill tone="good">{employeeUnits.length} 位员工</StatusPill>
            </div>
          }
          subtitle={`当前方向：${activeCategory.title}`}
          title="招聘 Bot 员工"
        >
          {employeeModules.length ? (
            <div className="module-grid recruit-module-grid" style={recruitGridStyle(recruitGrid)}>
              {employeeModules.map((module) => {
                const hired = hiredModuleIds.has(module.id);
                const visibleOutputs = module.outputs.slice(0, 2);

                return (
                  <article
                    className="module-card recruit-card"
                    data-accent={module.accent}
                    data-kind={module.kind}
                    key={module.id}
                  >
                    <div className="recruit-card-copy">
                      <div className="recruit-card-headline">
                        <span className="module-strap single-line">{module.strap}</span>
                        <StatusPill tone="good">{hired ? "已在编" : "可招聘"}</StatusPill>
                      </div>
                      <h3>{module.title}</h3>
                      <div className="recruit-card-body">
                        <p>{module.summary}</p>
                        <div className="chip-row">
                          {visibleOutputs.map((output) => (
                            <span className="soft-chip" key={output}>
                              {output}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      aria-label={`招聘${module.title}`}
                      className={`${hired ? "ghost-button" : "primary-button"} module-card-cta`}
                      disabled={Boolean(isHiringModuleId) || hired}
                      onClick={() => handleOpenHireConfirm(module)}
                      type="button"
                    >
                      {isHiringModuleId === module.id ? "招聘中..." : hired ? "已在编" : "招聘"}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyPanel
              body={`当前分类“${activeCategory.title}”下还没有可招聘的 AI 员工。可以先切换分类，或继续补充岗位目录。`}
              title="这一类暂时没有员工单元"
            />
          )}
        </SurfaceSection>
      </div>
    );
  }

  function renderUnitsView(unitKind: "employee" | "team") {
    if (unitKind === "team") {
      return (
        <EmptyPanel
          action={
            <button className="primary-button" onClick={() => setActiveView("recruit")} type="button">
              去招聘员工
            </button>
          }
          body="团队工作区当前已隐藏，先按员工编制组织项目，再由项目主管带队推进。"
          title="团队功能暂时隐藏"
        />
      );
    }

    const list = unitKind === "employee" ? employeeUnits : teamUnits;
    const emptyTitle = unitKind === "employee" ? "还没有 Bot 员工" : "还没有 Bot 团队";
    const emptyBody =
      unitKind === "employee"
        ? "先去招聘工作区补一个设计师员工、游戏研发员工或 3D 美术员工。"
        : "先去招聘工作区补一个游戏制作团队、创意素材团队或内容增长团队。";
    const unit = directoryUnit ?? list[0] ?? null;

    if (!list.length) {
      return (
        <EmptyPanel
          action={
            <button className="primary-button" onClick={() => setActiveView("recruit")} type="button">
              去招聘
            </button>
          }
          body={emptyBody}
          title={emptyTitle}
        />
      );
    }

    if (unitKind === "employee") {
      return (
        <div className="workspace-stack employee-directory-stack">
          <section className="employee-directory-grid" aria-label="员工卡片列表">
            {list.map((entry) => {
              const cardSkills = deriveModuleSkills(entry.module).slice(0, 4);
              const responsibilities = deriveUnitResponsibilities(entry).slice(0, 2);
              const latestTaskTitle =
                activeUnit?.id === entry.id ? dashboard?.recentTasks[0]?.title ?? "暂时还没有任务" : "选中员工后查看";
              const latestDeliverableTitle =
                activeUnit?.id === entry.id
                  ? dashboard?.recentDeliverables[0]?.title ?? "等待首轮交付"
                  : "选中员工后查看";
              const isSelected = selectedUnitId === entry.id;

              return (
                <article
                  className={isSelected ? "employee-directory-card active" : "employee-directory-card"}
                  data-accent={entry.accent}
                  key={entry.id}
                  onClick={() => setSelectedUnitId(entry.id)}
                >
                  <div className="employee-directory-card-top">
                    <div className="catalog-heading employee-directory-card-heading">
                      <span className="employee-directory-avatar-shell" aria-hidden="true">
                        <RecruitBotAvatar
                          accent={entry.accent}
                          className="employee-directory-avatar-graphic"
                          height={28}
                          width={28}
                        />
                      </span>
                      <div>
                        <span className="module-strap">{entry.module?.strap ?? "Legacy Unit"}</span>
                        <h3>{entry.displayName}</h3>
                      </div>
                    </div>
                    <div className="employee-directory-card-pills">
                      <StatusPill tone={unitStatusTone(entry.status)}>{formatUnitStatusLabel(entry.status)}</StatusPill>
                    </div>
                  </div>

                  <p className="employee-directory-card-summary">
                    {entry.module?.summary ?? "当前单位来自旧版 Team OS 数据，可继续用于派发任务。"}
                  </p>

                  <div className="employee-directory-card-section">
                    <span>核心技能</span>
                    <div className="chip-row">
                      {cardSkills.map((skill) => (
                        <span className="soft-chip" key={skill}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="employee-directory-card-section">
                    <span>职责重点</span>
                    <ul className="employee-directory-list">
                      {responsibilities.map((responsibility) => (
                        <li key={responsibility}>{responsibility}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="employee-directory-activity">
                    <article>
                      <span>最近任务</span>
                      <strong>{latestTaskTitle}</strong>
                    </article>
                    <article>
                      <span>最近交付</span>
                      <strong>{latestDeliverableTitle}</strong>
                    </article>
                  </div>

                  {isSelected ? (
                    <div className="employee-directory-rename" onClick={(event) => event.stopPropagation()}>
                      <input
                        aria-label="员工名称"
                        onChange={(event) => setUnitNameDraft(event.target.value)}
                        value={unitNameDraft}
                      />
                      <button
                        className="secondary-button"
                        disabled={!isRenameDirty || isRenamingUnitId === entry.id}
                        onClick={() => handleRenameUnit(entry)}
                        type="button"
                      >
                        {isRenamingUnitId === entry.id ? "保存中..." : "保存名称"}
                      </button>
                    </div>
                  ) : null}

                  <div className="unit-card-actions employee-directory-actions">
                    <button
                      className="primary-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedUnitId(entry.id);
                        setTaskGoal(entry.starterTask);
                        setActiveView("dispatch");
                      }}
                      type="button"
                    >
                      去派任务
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      );
    }

    if (!unit) {
      return null;
    }

    const skills = deriveModuleSkills(unit.module);
    const responsibilities = deriveUnitResponsibilities(unit);
    const kindLabel = unit.kind === "team" || unit.kind === "legacy" ? "团队" : "员工";
    const latestTaskTitle =
      activeUnit?.id === unit.id ? dashboard?.recentTasks[0]?.title ?? "暂时还没有任务" : "切换为当前单位后查看";
    const latestDeliverableTitle =
      activeUnit?.id === unit.id
        ? dashboard?.recentDeliverables[0]?.title ?? "等待首轮交付"
        : "切换为当前单位后查看";

    return (
      <div className="workspace-stack">
        <div className="directory-shell">
          <aside className="directory-panel">
            <div className="directory-panel-header">
              <div>
                <span className="module-strap">Team Directory</span>
                <h2>团队目录</h2>
                <p>按整包能力查看在编 Bot 团队。</p>
              </div>
              <button className="ghost-button" onClick={() => setActiveView("recruit")} type="button">
                继续招聘
              </button>
            </div>

            <div className="directory-list">
              {list.map((entry) => (
                <button
                  className={unit.id === entry.id ? "directory-list-item active" : "directory-list-item"}
                  data-accent={entry.accent}
                  key={entry.id}
                  onClick={() => setSelectedUnitId(entry.id)}
                  type="button"
                >
                  <div className="directory-list-item-top">
                    <div className="catalog-heading">
                      <span className="catalog-icon compact">
                        <CatalogGlyph height={18} name={getCatalogGlyphForUnit(entry)} width={18} />
                      </span>
                      <div>
                        <span className="module-strap">{entry.module?.strap ?? "Legacy Unit"}</span>
                        <strong>{entry.displayName}</strong>
                      </div>
                    </div>
                    <StatusPill tone={unitStatusTone(entry.status)}>{formatUnitStatusLabel(entry.status)}</StatusPill>
                  </div>
                  <p>{entry.module?.summary ?? "当前单位来自旧版 Team OS 数据，可继续用于派发任务。"}</p>
                  <div className="chip-row">
                    {deriveModuleSkills(entry.module)
                      .slice(0, 3)
                      .map((skill) => (
                        <span className="soft-chip" key={skill}>
                          {skill}
                        </span>
                      ))}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="unit-inspector" data-accent={unit.accent}>
            <div className="unit-inspector-header">
              <div className="unit-inspector-identity">
                <span className="unit-inspector-icon">
                  <CatalogGlyph height={28} name={getCatalogGlyphForUnit(unit)} width={28} />
                </span>
                <div>
                  <span className="module-strap">{unit.module?.strap ?? "Legacy Unit"}</span>
                  <h3>{unit.displayName}</h3>
                  <p>{unit.module?.summary ?? "当前单位来自旧版 Team OS 数据，可继续用于派发任务。"}</p>
                </div>
              </div>
              <div className="chip-row">
                <StatusPill tone={unit.kind === "employee" ? "good" : "warm"}>{kindLabel}</StatusPill>
                <StatusPill tone={unitStatusTone(unit.status)}>{formatUnitStatusLabel(unit.status)}</StatusPill>
              </div>
            </div>

            <div className="unit-inspector-grid">
              <article className="unit-meta-card">
                <span>名称与节奏</span>
                <div className="unit-rename-row">
                  <input
                    aria-label={`${kindLabel}名称`}
                    onChange={(event) => setUnitNameDraft(event.target.value)}
                    value={unitNameDraft}
                  />
                  <button
                    className="secondary-button"
                    disabled={!isRenameDirty || isRenamingUnitId === unit.id}
                    onClick={() => handleRenameUnit(unit)}
                    type="button"
                  >
                    {isRenamingUnitId === unit.id ? "保存中..." : "保存名称"}
                  </button>
                </div>
                <div className="unit-inline-meta">
                  <strong>{unit.costLabel}</strong>
                  <strong>{unit.cycleLabel}</strong>
                </div>
              </article>

              <article className="unit-meta-card">
                <span>核心技能</span>
                <div className="chip-row">
                  {skills.map((skill) => (
                    <span className="soft-chip" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </article>

              <article className="unit-meta-card">
                <span>职责</span>
                <ul className="unit-detail-list">
                  {responsibilities.map((responsibility) => (
                    <li key={responsibility}>{responsibility}</li>
                  ))}
                </ul>
              </article>

              <article className="unit-meta-card">
                <span>交付能力</span>
                <div className="chip-row">
                  {unit.outputs.map((output) => (
                    <span className="soft-chip" key={output}>
                      {output}
                    </span>
                  ))}
                </div>
              </article>
            </div>

            <div className="unit-activity-strip">
              <article className="unit-activity-card">
                <span>最近任务</span>
                <strong>{latestTaskTitle}</strong>
              </article>
              <article className="unit-activity-card">
                <span>最近交付</span>
                <strong>{latestDeliverableTitle}</strong>
              </article>
            </div>

            <div className="unit-card-actions">
              <button
                className="primary-button"
                onClick={() => {
                  setSelectedUnitId(unit.id);
                  setTaskGoal(unit.starterTask);
                  setActiveView("dispatch");
                }}
                type="button"
              >
                去派任务
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  setSelectedUnitId(unit.id);
                  setActiveView("overview");
                }}
                type="button"
              >
                设为当前单位
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderShortDramaDispatchView() {
    if (!shortDramaUnits.length) {
      return (
        <EmptyPanel
          action={
            <button className="primary-button" onClick={() => setActiveView("recruit")} type="button">
              去招聘短剧职能线
            </button>
          }
          body="短剧工作流至少需要编导、角色、场景或视频等关键岗位。建议先招聘 AI 编剧与 AI 导演，再补齐其他职能线。"
          title="当前还没有短剧执行单位"
        />
      );
    }

    const writerUnit = shortDramaUnits.find((unit) => unit.module?.id === "short-drama-writer-bot") ?? null;
    const studioUnit = shortDramaUnits.find((unit) => unit.module?.id === "short-drama-studio-team") ?? null;
    const activeLaneUnit = isShortDramaActive ? activeUnit : writerUnit ?? studioUnit ?? shortDramaUnits[0] ?? null;
    const selectedResult = selectedResultFeedItem;
    const characterLines = flattenSectionLines(shortDramaSectionMap.characters);
    const beatLines = flattenSectionLines(shortDramaSectionMap.beats);
    const dialogueLines = flattenSectionLines(shortDramaSectionMap.dialogue);
    const shotLines = flattenSectionLines(shortDramaSectionMap.shots);
    const directorLines = flattenSectionLines(shortDramaSectionMap["director-note"]);
    const pipelineLines = flattenSectionLines(shortDramaSectionMap.pipeline);
    const nextActions = shortDramaContent?.nextActions ?? [];
    const latestTask = projectScopedTasks[0] ?? null;
    const latestApproval = projectScopedApprovals[0] ?? null;
    const routeRecommendation = recommendDispatchTarget(shortDramaDraft.premise, shortDramaUnits, "ai-short-drama");
    const canSubmitShortDramaTask = Boolean(
      activeLaneUnit && canCreateTask && shortDramaDraft.premise.trim()
    );
    const activeStageDefinition =
      shortDramaStageDefinitions.find((stage) => stage.id === shortDramaStage) ?? shortDramaStageDefinitions[0]!;
    const intakeCompletedFields = [
      shortDramaDraft.premise,
      String(shortDramaDraft.durationSeconds),
      shortDramaDraft.hook,
      shortDramaDraft.mustHaveMoments
    ].filter((value) => value.trim()).length;
    const durationPresetLabel =
      shortDramaDraft.durationSeconds === 5
        ? "样片验证"
        : shortDramaDraft.durationSeconds === 15
          ? "快节奏片段"
          : shortDramaDraft.durationSeconds === 30
            ? "标准短剧"
            : "完整版";
    const intakeRecommendationLabel = routeRecommendation
      ? routeRecommendation.kind === "unit"
        ? routeRecommendation.unit.displayName
        : routeRecommendation.module.title
      : "继续补充立项";

    const stageStatus = (stageId: ShortDramaStageId) => {
      switch (stageId) {
        case "intake":
          return shortDramaDraft.premise.trim() && shortDramaDraft.hook.trim() ? "done" : "active";
        case "characters":
          return characterLines.length || shortDramaDraft.heroine.trim() ? "done" : "upcoming";
        case "storyboard":
          return shortDramaContent ? "done" : "upcoming";
        case "video":
          return activeVideoSession ? "done" : shortDramaContent?.videoHandoff ? "active" : "upcoming";
        case "review":
          return activeVideoSession?.status === "completed" || activeVideoSession?.status === "partial"
            ? "done"
            : "upcoming";
      }
    };

    return (
      <div className="workspace-stack">
        {activeDispatchProject ? renderDispatchProjectHeader(activeDispatchProject) : null}
        <SurfaceSection
          subtitle="短剧不再按通用任务派发去理解，而是按阶段推进：立项、人物、分镜、视频、审片。"
          title="短剧项目工作流"
        >
          <div className="short-drama-lane-grid">
            {shortDramaUnits.map((unit) => {
              const isActive = activeLaneUnit?.id === unit.id;
              const isStudioLine = unit.module?.id === "short-drama-studio-team";

              return (
                <button
                  className={isActive ? "lane-card active" : "lane-card"}
                  data-accent={unit.accent}
                  key={unit.id}
                  onClick={() => setSelectedUnitId(unit.id)}
                  type="button"
                >
                  <div className="lane-card-top">
                    <div className="catalog-heading">
                      <span className="catalog-icon">
                        <CatalogGlyph height={20} name={getCatalogGlyphForUnit(unit)} width={20} />
                      </span>
                      <div>
                        <span className="module-strap">{isStudioLine ? "Production Line" : "Script Line"}</span>
                        <strong>{unit.displayName}</strong>
                      </div>
                    </div>
                    <StatusPill tone={isStudioLine ? "warm" : "good"}>
                      {isStudioLine ? "整包制作" : "编导拆解"}
                    </StatusPill>
                  </div>
                  <p>
                    {isStudioLine
                      ? "负责人物定稿、视觉一致性、镜头包装和视频生成接力。"
                      : "负责剧情钩子、对白节奏、三幕结构、分镜拆解和转场逻辑。"}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="short-drama-stage-strip">
            {shortDramaStageDefinitions.map((stage) => {
              const status = stageStatus(stage.id);

              return (
                <button
                  className={shortDramaStage === stage.id ? "stage-chip active" : "stage-chip"}
                  data-status={status}
                  key={stage.id}
                  onClick={() => setShortDramaStage(stage.id)}
                  type="button"
                >
                  <span>{stage.owner}</span>
                  <strong>{stage.title}</strong>
                  <em>{stage.summary}</em>
                </button>
              );
            })}
          </div>
        </SurfaceSection>

        <div className="short-drama-workflow-grid">
          <div className="short-drama-workbench-column">
            <SurfaceSection
              action={
                <div className="short-drama-section-meta">
                  <span>当前负责人</span>
                  <strong>{activeStageDefinition.owner}</strong>
                </div>
              }
              subtitle={activeStageDefinition.summary}
              title={activeStageDefinition.title}
            >
            {shortDramaStage === "intake" ? (
              <div className="short-drama-stage-stack">
                <div className="short-drama-intake-shell">
                  <div className="short-drama-intake-editor">
                    <label className="short-drama-main-field">
                      <span>一句话剧情</span>
                      <textarea
                        onChange={(event) => {
                          const value = event.target.value;
                          setShortDramaDraft((current) => ({ ...current, premise: value }));
                          setIntentDraft(value);
                        }}
                        placeholder="例如：30 秒霸总反转短剧，秘书在被当众甩锅后完成身份翻盘。"
                        value={shortDramaDraft.premise}
                      />
                    </label>

                    <div className="short-drama-intake-summary-grid">
                      <article className="short-drama-intake-summary-card">
                        <span>立项完整度</span>
                        <strong>{intakeCompletedFields}/4</strong>
                        <p>一句话剧情、时长、强钩子、必出桥段。</p>
                      </article>
                      <article className="short-drama-intake-summary-card">
                        <span>当前时长</span>
                        <strong>{shortDramaDraft.durationSeconds} 秒</strong>
                        <p>{durationPresetLabel}</p>
                      </article>
                      <article className="short-drama-intake-summary-card">
                        <span>建议承接</span>
                        <strong>{intakeRecommendationLabel}</strong>
                        <p>
                          {routeRecommendation
                            ? routeRecommendation.kind === "unit"
                              ? "可以直接进入执行链。"
                              : "建议先补齐执行编制。"
                            : "先把立项约束写完整。"}
                        </p>
                      </article>
                    </div>
                  </div>

                  <aside className="short-drama-intake-sidebar">
                    <article className="short-drama-side-panel short-drama-side-panel-compact">
                      <label className="short-drama-side-panel-field">
                        <span>目标时长</span>
                        <select
                          onChange={(event) =>
                            setShortDramaDraft((current) => ({
                              ...current,
                              durationSeconds: Number(event.target.value) || 30
                            }))
                          }
                          value={String(shortDramaDraft.durationSeconds)}
                        >
                          <option value="5">5 秒样片</option>
                          <option value="15">15 秒快节奏片段</option>
                          <option value="30">30 秒标准短剧</option>
                          <option value="60">60 秒完整版</option>
                        </select>
                        <span className="short-drama-field-hint">先定节奏，再决定镜头密度和反转位置。</span>
                      </label>
                    </article>
                    <label className="short-drama-side-panel">
                      <span>强钩子</span>
                      <textarea
                        onChange={(event) =>
                          setShortDramaDraft((current) => ({ ...current, hook: event.target.value }))
                        }
                        value={shortDramaDraft.hook}
                      />
                      <span className="short-drama-field-hint">
                        建议把冲突放进前 3 秒，把反转或关系升级留到结尾。
                      </span>
                    </label>
                    <label className="short-drama-side-panel short-drama-side-panel-wide">
                      <span>必须出现的反转 / 场景</span>
                      <textarea
                        onChange={(event) =>
                          setShortDramaDraft((current) => ({
                            ...current,
                            mustHaveMoments: event.target.value
                          }))
                        }
                        value={shortDramaDraft.mustHaveMoments}
                      />
                      <span className="short-drama-field-hint">
                        把一定要拍出来的桥段写成短语，后续更容易直接转成分镜。
                      </span>
                    </label>
                  </aside>
                </div>

                {routeRecommendation ? (
                  <article className="route-card short-drama-route-card">
                    <div className="route-card-top">
                      <div>
                        <span className="module-strap">当前建议</span>
                        <h3>
                          {routeRecommendation.kind === "unit"
                            ? `先由 ${routeRecommendation.unit.displayName} 承接`
                            : `先招聘 ${routeRecommendation.module.title}`}
                        </h3>
                      </div>
                      <StatusPill tone={routeRecommendation.kind === "unit" ? "good" : "warm"}>
                        {routeRecommendation.kind === "unit" ? "可直接进入" : "需要补位"}
                      </StatusPill>
                    </div>
                    <div className="short-drama-route-body">
                      <p>
                        {routeRecommendation.kind === "unit"
                          ? "当前剧情目标已经足够明确，可以直接进入短剧执行链。"
                          : "当前组织里还缺少合适的短剧职能线，先补招聘会更顺。"}
                      </p>
                      <div className="short-drama-route-meta">
                        <span className="short-drama-route-label">
                          {routeRecommendation.matches.length ? "匹配信号" : "推进建议"}
                        </span>
                        {routeRecommendation.matches.length ? (
                          <div className="chip-row">
                            {routeRecommendation.matches.map((match) => (
                              <span className="soft-chip" key={match}>
                                命中：{match}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="short-drama-route-note">补足目标后，系统会给出更稳定的承接建议。</p>
                        )}
                      </div>
                    </div>
                  </article>
                ) : (
                  <article className="short-drama-route-empty">
                    <span className="module-strap">分流提示</span>
                    <strong>先写清楚目标，再决定交给谁</strong>
                    <p>把剧情一句话、时长、开场钩子和必出桥段补完整，系统会更稳定地推荐编导线或制作线。</p>
                  </article>
                )}

                <div className="dispatch-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      if (writerUnit) {
                        setSelectedUnitId(writerUnit.id);
                        setShortDramaStage("storyboard");
                      }
                    }}
                    type="button"
                  >
                    交给编导线
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => setShortDramaStage("characters")}
                    type="button"
                  >
                    下一步：人物定稿
                  </button>
                </div>
              </div>
            ) : null}

            {shortDramaStage === "characters" ? (
              <div className="short-drama-stage-stack">
                <div className="short-drama-character-grid">
                  <label>
                    女主
                    <textarea
                      onChange={(event) =>
                        setShortDramaDraft((current) => ({ ...current, heroine: event.target.value }))
                      }
                      value={shortDramaDraft.heroine}
                    />
                  </label>
                  <label>
                    男主 / 对手
                    <textarea
                      onChange={(event) =>
                        setShortDramaDraft((current) => ({ ...current, hero: event.target.value }))
                      }
                      value={shortDramaDraft.hero}
                    />
                  </label>
                  <label>
                    副角与推动人物
                    <textarea
                      onChange={(event) =>
                        setShortDramaDraft((current) => ({
                          ...current,
                          supportingCast: event.target.value
                        }))
                      }
                      value={shortDramaDraft.supportingCast}
                    />
                  </label>
                  <label>
                    一致性规则
                    <textarea
                      onChange={(event) =>
                        setShortDramaDraft((current) => ({
                          ...current,
                          continuityRule: event.target.value
                        }))
                      }
                      value={shortDramaDraft.continuityRule}
                    />
                  </label>
                </div>

                {shortDramaCharacterCards.length ? (
                  <>
                    <div className="section-inline-actions">
                      <span className="subdued-copy">当前交付里已经有可复用的人物定稿。</span>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          handleSaveCharactersToLibrary(
                            shortDramaCharacterCards,
                            shortDramaContent?.headline ?? "短剧人物定稿"
                          )
                        }
                        type="button"
                      >
                        收纳为角色资产
                      </button>
                    </div>
                    <div className="character-card-grid">
                      {shortDramaCharacterCards.map((card) => (
                        <article className="character-card" key={card.id}>
                          <span className="module-strap">{card.role}</span>
                          <strong>{card.name}</strong>
                          <p>{card.summary}</p>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="subdued-copy">
                    这一阶段先把角色圣经写清楚，再交给 AI 短剧制作团队，避免后续镜头里人物脸和气质飘掉。
                  </p>
                )}

                <article className="asset-library-card">
                  <div className="surface-section-header compact">
                    <div>
                      <h3>角色资产库</h3>
                      <p>把已经定稿的人物收进资产库，下一集或下一条短剧可以直接复用。</p>
                    </div>
                  </div>

                  {characterAssets.length ? (
                    <div className="character-card-grid compact">
                      {characterAssets.slice(0, 6).map((asset) => (
                        <article className="character-card compact" key={asset.id}>
                          <span className="module-strap">{asset.role}</span>
                          <strong>{asset.name}</strong>
                          <p>{asset.summary}</p>
                          <div className="chip-row">
                            <span className="soft-chip">{asset.sourceLabel}</span>
                          </div>
                          <div className="dispatch-actions">
                            <button
                              className="ghost-button"
                              onClick={() => handleApplyCharacterAsset(asset, "heroine")}
                              type="button"
                            >
                              设为女主
                            </button>
                            <button
                              className="ghost-button"
                              onClick={() => handleApplyCharacterAsset(asset, "hero")}
                              type="button"
                            >
                              设为男主
                            </button>
                            <button
                              className="ghost-button"
                              onClick={() => handleApplyCharacterAsset(asset, "supportingCast")}
                              type="button"
                            >
                              加到副角
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="subdued-copy">当前还没有角色资产，先从已定稿人物里收纳第一批角色卡。</p>
                  )}
                </article>

                <div className="dispatch-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      const nextSceneOwner =
                        shortDramaUnits.find((unit) => unit.module?.id === "short-drama-scene-bot") ?? studioUnit;
                      if (nextSceneOwner) {
                        setSelectedUnitId(nextSceneOwner.id);
                      }
                    }}
                    type="button"
                  >
                    切到场景 / 制作线
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => setShortDramaStage("storyboard")}
                    type="button"
                  >
                    下一步：剧本分镜
                  </button>
                </div>
              </div>
            ) : null}

            {shortDramaStage === "storyboard" ? (
              <div className="short-drama-stage-stack">
                <article className="brief-preview-card">
                  <div className="list-card-top">
                    <strong>当前任务单预览</strong>
                    <StatusPill tone={activeLaneUnit?.kind === "team" ? "warm" : "good"}>
                      {activeLaneUnit?.displayName ?? "未选择职能线"}
                    </StatusPill>
                  </div>
                  <pre>{shortDramaBriefPreview}</pre>
                </article>

                {shortDramaContent ? (
                  <div className="review-pillars">
                    <article className="review-pillar">
                      <strong>三幕结构</strong>
                      <ul className="result-list">
                        {beatLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </article>
                    <article className="review-pillar">
                      <strong>关键对白</strong>
                      <ul className="result-list">
                        {dialogueLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </article>
                    <article className="review-pillar">
                      <strong>分镜清单</strong>
                      <ul className="result-list">
                        {shotLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </article>
                  </div>
                ) : (
                  <p className="subdued-copy">
                    编导线这一阶段的目标是先拿到三幕结构、关键对白和镜头拆解，而不是直接跳去出片。
                  </p>
                )}

                <div className="dispatch-actions">
                  <button
                    className="primary-button"
                    disabled={!canSubmitShortDramaTask || isSubmittingTask}
                    onClick={() => {
                      dispatchComposerRef.current?.requestSubmit();
                    }}
                    type="button"
                  >
                    {isSubmittingTask ? "提交中..." : `发送给${activeLaneUnit?.displayName ?? "当前职能线"}`}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      if (writerUnit) {
                        setSelectedUnitId(writerUnit.id);
                      }
                    }}
                    type="button"
                  >
                    使用编导线
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => setShortDramaStage("video")}
                    type="button"
                  >
                    下一步：视频制作
                  </button>
                </div>
              </div>
            ) : null}

            {shortDramaStage === "video" ? (
              <div className="short-drama-stage-stack">
                {shortDramaContent?.videoHandoff ? (
                  <>
                    <article className="short-drama-hero">
                      <div>
                        <span className="module-strap">视频接力</span>
                        <h4>{shortDramaContent.videoHandoff.provider}</h4>
                        <p>{shortDramaContent.videoHandoff.note}</p>
                      </div>
                      <div className="chip-row">
                        <StatusPill tone="good">{shortDramaContent.videoHandoff.durationSeconds} 秒</StatusPill>
                        <StatusPill tone="neutral">{shortDramaContent.videoHandoff.aspectRatio}</StatusPill>
                        <StatusPill tone="warm">
                          {shortDramaContent.videoHandoff.status === "ready"
                            ? "可以开始出片"
                            : shortDramaContent.videoHandoff.status}
                        </StatusPill>
                      </div>
                    </article>

                    {selectedStructuredDeliverable ? (
                      <article className="video-run-card">
                        <div className="video-run-header">
                          <div>
                            <span className="module-strap">自动生成</span>
                            <h4>视频生成控制台</h4>
                            <p>先生成样片，再看人物一致性和钩子强度，没问题再继续放量。</p>
                          </div>
                          <div className="video-run-actions">
                            <button
                              className="primary-button"
                              disabled={isSubmittingVideoTaskId === selectedStructuredDeliverable.taskId}
                              onClick={() => handleStartVideoGeneration(selectedStructuredDeliverable)}
                              type="button"
                            >
                              {isSubmittingVideoTaskId === selectedStructuredDeliverable.taskId
                                ? "提交中..."
                                : activeVideoSession
                                  ? "重新提交"
                                  : "提交到视频生成器"}
                            </button>
                            <button
                              className="ghost-button"
                              disabled={
                                !activeVideoSession ||
                                isRefreshingVideoTaskId === selectedStructuredDeliverable.taskId
                              }
                              onClick={() => handleRefreshVideoGeneration(selectedStructuredDeliverable)}
                              type="button"
                            >
                              {isRefreshingVideoTaskId === selectedStructuredDeliverable.taskId
                                ? "刷新中..."
                                : "刷新状态"}
                            </button>
                          </div>
                        </div>

                        {activeVideoSession ? (
                          <>
                            <div className="chip-row">
                              <StatusPill tone={videoGenerationStatusTone(activeVideoSession.status)}>
                                {formatVideoGenerationStatus(activeVideoSession.status)}
                              </StatusPill>
                              <StatusPill tone="neutral">{activeVideoSession.providerModel}</StatusPill>
                              <StatusPill tone="neutral">{activeVideoSession.clips.length} 个片段</StatusPill>
                            </div>
                            <p className="video-run-note">{activeVideoSession.note}</p>
                            <div className="video-scene-list">
                              {activeVideoSession.clips.map((clip) => (
                                <article className="video-scene-card" key={clip.id}>
                                  <div className="list-card-top">
                                    <strong>{clip.sceneTitle}</strong>
                                    <StatusPill tone={videoClipStatusTone(clip.status)}>
                                      {formatVideoClipStatus(clip.status)}
                                    </StatusPill>
                                  </div>
                                  <p>{clip.prompt}</p>
                                  <div className="video-run-item-meta">
                                    <span>{clip.durationSeconds} 秒</span>
                                    {clip.providerTaskId ? <span>ID: {clip.providerTaskId}</span> : null}
                                  </div>
                                  {clip.errorMessage ? <em>{clip.errorMessage}</em> : null}
                                </article>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="video-run-note">
                            当前已经具备出片条件，但还没提交视频生成任务。建议先跑 5 秒样片，再决定是否整包生成。
                          </p>
                        )}
                      </article>
                    ) : null}
                  </>
                ) : (
                  <EmptyPanel
                    body="先让编导线或制作线产出分镜与接力包，视频阶段才有可执行内容。"
                    title="当前还没有视频接力包"
                  />
                )}
              </div>
            ) : null}

            {shortDramaStage === "review" ? (
              <div className="short-drama-stage-stack">
                {shortDramaTimeline.length ? (
                  <>
                    <div className="timeline-strip">
                      {shortDramaTimeline.map((scene, index) => (
                        <button
                          className={selectedReviewScene?.id === scene.id ? "timeline-chip active" : "timeline-chip"}
                          key={scene.id}
                          onClick={() => setSelectedReviewSceneId(scene.id)}
                          type="button"
                        >
                          <span>{`镜头 ${index + 1}`}</span>
                          <strong>{scene.title}</strong>
                          <em>
                            {scene.startSecond}s - {scene.endSecond}s
                          </em>
                          <StatusPill tone={videoClipStatusTone(scene.clip?.status ?? "pending")}>
                            {formatVideoClipStatus(scene.clip?.status ?? "pending")}
                          </StatusPill>
                          {sceneReviewDecisions[scene.id] ? (
                            <StatusPill tone={reviewDecisionTone(sceneReviewDecisions[scene.id]!.status)}>
                              {formatReviewDecisionStatus(sceneReviewDecisions[scene.id]!.status)}
                            </StatusPill>
                          ) : null}
                        </button>
                      ))}
                    </div>

                    {selectedReviewScene ? (
                      <article className="timeline-inspector">
                        <div className="timeline-inspector-top">
                          <div>
                            <span className="module-strap">
                              {selectedReviewScene.startSecond}s - {selectedReviewScene.endSecond}s
                            </span>
                            <h4>{selectedReviewScene.title}</h4>
                          </div>
                          <StatusPill tone={videoClipStatusTone(selectedReviewScene.clip?.status ?? "pending")}>
                            {formatVideoClipStatus(selectedReviewScene.clip?.status ?? "pending")}
                          </StatusPill>
                        </div>

                        {selectedReviewScene.clip?.videoUrl ? (
                          <video className="review-video-player wide" controls src={selectedReviewScene.clip.videoUrl} />
                        ) : (
                          <div className="review-video-placeholder wide">当前片段还没有可播放视频</div>
                        )}

                        <div className="timeline-detail-grid">
                          <article className="review-pillar">
                            <strong>镜头目标</strong>
                            <p>{selectedReviewScene.visualGoal}</p>
                          </article>
                          <article className="review-pillar">
                            <strong>镜头提示词</strong>
                            <p>{selectedReviewScene.prompt}</p>
                          </article>
                          {selectedReviewScene.dialogue ? (
                            <article className="review-pillar">
                              <strong>对白</strong>
                              <p>{selectedReviewScene.dialogue}</p>
                            </article>
                          ) : null}
                        </div>

                        <article className="scene-review-card">
                          <div className="scene-review-header">
                            <div>
                              <span className="module-strap">镜头决策</span>
                              <h5>逐镜头审片动作</h5>
                            </div>
                            {selectedReviewDecision ? (
                              <StatusPill tone={reviewDecisionTone(selectedReviewDecision.status)}>
                                {formatReviewDecisionStatus(selectedReviewDecision.status)}
                              </StatusPill>
                            ) : null}
                          </div>
                          <div className="dispatch-actions">
                            <button
                              className="secondary-button"
                              onClick={() =>
                                handleUpdateSceneDecision(selectedReviewScene.id, { status: "approved" })
                              }
                              type="button"
                            >
                              通过
                            </button>
                            <button
                              className="ghost-button"
                              onClick={() =>
                                handleUpdateSceneDecision(selectedReviewScene.id, { status: "rework" })
                              }
                              type="button"
                            >
                              重做
                            </button>
                            <button
                              className="ghost-button"
                              onClick={() =>
                                handleUpdateSceneDecision(selectedReviewScene.id, { status: "hold" })
                              }
                              type="button"
                            >
                              搁置
                            </button>
                          </div>
                          <label className="scene-review-note">
                            审片备注
                            <textarea
                              onChange={(event) =>
                                handleUpdateSceneReviewNote(selectedReviewScene.id, event.target.value)
                              }
                              placeholder="例如：男主这一镜脸不稳定，建议重做并收紧景别。"
                              value={selectedReviewDecision?.note ?? ""}
                            />
                          </label>
                        </article>
                      </article>
                    ) : null}
                  </>
                ) : (
                  <p className="subdued-copy">当前还没有可审查的视频样片，先去视频制作阶段提交生成。</p>
                )}

                <article className="review-checklist-card">
                  <span className="module-strap">审片清单</span>
                  <div className="review-pillars">
                    {shortDramaReviewChecklist.map((item) => (
                      <article className="review-pillar" key={item}>
                        <strong>{item}</strong>
                      </article>
                    ))}
                  </div>
                </article>
              </div>
            ) : null}
            </SurfaceSection>
          </div>

          <div className="short-drama-review-column">
            <SurfaceSection
              action={
                <StatusPill tone={selectedResult ? selectedResult.tone : "neutral"}>
                  {selectedResult ? "已载入审查内容" : "等待首轮结果"}
                </StatusPill>
              }
              subtitle="这里展示当前阶段最需要你审的内容，而不是把结果缩进右下角。"
              title="阶段审查台"
            >
            {selectedResult ? (
              <div className="short-drama-stage-stack">
                <article className="result-inspector cinematic">
                  <div className="result-inspector-top">
                    <div>
                      <span className="module-strap">
                        {selectedResult.statusLabel} · {formatDateTimeLabel(selectedResult.createdAt)}
                      </span>
                      <h3>{selectedResult.title}</h3>
                    </div>
                    <StatusPill tone={selectedResult.tone}>
                      {selectedResult.sourceKind === "deliverable" ? "正式结果" : "待审批草稿"}
                    </StatusPill>
                  </div>

                  {shortDramaContent ? (
                    <>
                      <div className="review-pillars">
                        <article className="review-pillar">
                          <strong>人物定稿</strong>
                          <div className="character-card-grid compact">
                            {(shortDramaCharacterCards.length
                              ? shortDramaCharacterCards
                              : parseShortDramaCharacterCards([shortDramaDraft.heroine, shortDramaDraft.hero])
                            ).map((card) => (
                              <article className="character-card compact" key={card.id}>
                                <span className="module-strap">{card.role}</span>
                                <strong>{card.name}</strong>
                                <p>{card.summary}</p>
                              </article>
                            ))}
                          </div>
                        </article>
                        <article className="review-pillar">
                          <strong>分镜节奏</strong>
                          <ul className="result-list">
                            {shotLines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </article>
                      </div>

                      <div className="result-block-grid short-drama-grid">
                        <article className="result-block short-drama-block">
                          <span>导演提示</span>
                          <ul className="result-list">
                            {directorLines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </article>
                        <article className="result-block short-drama-block">
                          <span>接棒顺序</span>
                          <ul className="result-list">
                            {pipelineLines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </article>
                        <article className="result-block short-drama-block">
                          <span>下一步动作</span>
                          <ul className="result-list">
                            {nextActions.map((action) => (
                              <li key={action}>{action}</li>
                            ))}
                          </ul>
                        </article>
                      </div>

                      {shortDramaContent.videoHandoff ? (
                        <article className="video-handoff-card">
                          <div className="video-handoff-header">
                            <div>
                              <span className="module-strap">Prompt Pack</span>
                              <h4>镜头接力清单</h4>
                            </div>
                            <div className="video-handoff-actions">
                              <button
                                className="secondary-button"
                                onClick={() =>
                                  handleCopyText(
                                    buildVideoHandoffExportText(shortDramaContent.videoHandoff!),
                                    "视频接力包已复制。"
                                  )
                                }
                                type="button"
                              >
                                复制接力包
                              </button>
                            </div>
                          </div>
                          <div className="video-scene-list">
                            {shortDramaContent.videoHandoff.scenes.map((scene) => (
                              <article className="video-scene-card" key={scene.id}>
                                <div className="list-card-top">
                                  <strong>{scene.title}</strong>
                                  <StatusPill tone="neutral">{scene.durationSeconds}s</StatusPill>
                                </div>
                                <p>{scene.visualGoal}</p>
                                <div className="video-scene-copy">
                                  <strong>提示词</strong>
                                  <p>{scene.prompt}</p>
                                  {scene.dialogue ? <em>对白：{scene.dialogue}</em> : null}
                                </div>
                              </article>
                            ))}
                          </div>
                        </article>
                      ) : null}
                    </>
                  ) : (
                    <p className="subdued-copy">{selectedResult.summary}</p>
                  )}

                    <div className="result-inspector-actions">
                    {shortDramaCharacterCards.length ? (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          handleSaveCharactersToLibrary(
                            shortDramaCharacterCards,
                            shortDramaContent?.headline ?? "短剧人物定稿"
                          )
                        }
                        type="button"
                      >
                        收纳角色资产
                      </button>
                    ) : null}
                    {latestApproval ? (
                      <button className="secondary-button" onClick={() => setActiveView("approvals")} type="button">
                        去审批
                      </button>
                    ) : null}
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setTaskGoal(shortDramaBriefPreview || selectedResult.summary);
                        setShortDramaStage("storyboard");
                      }}
                      type="button"
                    >
                      带回当前任务单
                    </button>
                  </div>
                </article>
              </div>
            ) : (
              <EmptyPanel
                body="先发起第一轮短剧任务，结果会在这里以大画布方式集中审查。"
                title="阶段审查台还没有内容"
              />
            )}
            </SurfaceSection>
          </div>
        </div>

        <div className="short-drama-support-grid">
          <SurfaceSection
            action={<StatusPill tone="neutral">{projectScopedTasks.length ? `${projectScopedTasks.length} 条` : "等待创建"}</StatusPill>}
            subtitle="保留紧凑时间线，不再和审查区抢主空间。"
            title="最近任务"
          >
            {projectScopedTasks.length ? (
              <div className="stacked-list">
                {projectScopedTasks.map((task, index) => (
                  <article className={index === 0 ? "list-card list-card-highlighted" : "list-card"} key={task.id}>
                    <div className="list-card-top">
                      <div>
                        {index === 0 ? <span className="module-strap">最近更新</span> : null}
                        <strong>{task.title}</strong>
                      </div>
                      <StatusPill tone={taskStatusTone(task.status)}>{formatTaskStatus(task.status)}</StatusPill>
                    </div>
                    <p>
                      {activeDispatchProject
                        ? stripDispatchProjectMarker(activeDispatchProject.name, task.businessGoal)
                        : task.businessGoal}
                    </p>
                    <div className="list-card-actions">
                      <button
                        className="ghost-button"
                        onClick={() =>
                          setTaskGoal(
                            activeDispatchProject
                              ? stripDispatchProjectMarker(activeDispatchProject.name, task.businessGoal)
                              : task.businessGoal
                          )
                        }
                        type="button"
                      >
                        复用任务单
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <article className="short-drama-support-empty">
                <span className="module-strap">时间线</span>
                <strong>还没有短剧任务记录</strong>
                <p>发起第一轮任务后，最近任务会按时间顺序收在这里，便于回看和复用。</p>
              </article>
            )}
          </SurfaceSection>

          <SurfaceSection
            action={<StatusPill tone={latestApproval ? "warm" : "good"}>{latestApproval ? "待处理" : "已清空"}</StatusPill>}
            subtitle="把需要你拍板的点留在这里，不再到处找审批入口。"
            title="当前待拍板"
          >
            {latestApproval ? (
              <article className="approval-card short-drama-approval-card">
                <div className="list-card-top">
                  <div>
                    <span className="module-strap">{latestApproval.stage}</span>
                    <h3>{latestApproval.title}</h3>
                  </div>
                  <StatusPill tone="warm">待审批</StatusPill>
                </div>
                <p>{latestApproval.summary}</p>
                <div className="approval-actions">
                  <button className="primary-button" disabled={!canResolveApprovals} onClick={() => handleApprove(latestApproval.id)} type="button">
                    批准
                  </button>
                  <button className="ghost-button" disabled={!canResolveApprovals} onClick={() => handleReject(latestApproval.id)} type="button">
                    驳回
                  </button>
                </div>
              </article>
            ) : (
              <article className="short-drama-support-empty">
                <span className="module-strap">审批状态</span>
                <strong>当前没有待审批节点</strong>
                <p>可以继续推进下一阶段；一旦有需要你拍板的结果，会优先汇总到这里。</p>
              </article>
            )}
          </SurfaceSection>
        </div>

        <form className="dispatch-form visually-hidden" onSubmit={handleTaskSubmit} ref={dispatchComposerRef}>
          <label>
            任务目标
            <textarea onChange={(event) => setTaskGoal(event.target.value)} value={taskGoal} />
          </label>
        </form>
      </div>
    );
  }

  function handleSelectProjectStage(stageId: ShortDramaStageId) {
    if (!activeDispatchProject) {
      return;
    }

    setShortDramaStage(stageId);
    updateDispatchProject(activeDispatchProject.id, (project) => ({
      ...project,
      updatedAt: new Date().toISOString(),
      workflow: {
        ...project.workflow,
        shortDramaStage: stageId
      }
    }));
  }

  function renderDispatchProjectHeader(project: DispatchProject) {
    const summary = buildProjectLeadSummary(project, units);

    return (
      <section className="project-shell-header">
        <div className="project-shell-header-copy">
          <div className="project-shell-header-topline">
            <span className="project-shell-kicker">任务台 / 当前项目</span>
            <span className="project-shell-category">{projectCategoryLabel(project.categoryId)}</span>
          </div>
          <div className="project-shell-header-main">
            <div>
              <h1 className="project-shell-title">{project.name}</h1>
              <p className="project-shell-description">{project.description}</p>
            </div>
            <div className="project-shell-actions">
              <button className="ghost-button project-settings-trigger" onClick={handleOpenProjectSettings} type="button">
                <SettingsIcon height={16} width={16} />
                项目设置
              </button>
              <button className="ghost-button" onClick={handleReturnToProjectList} type="button">
                返回项目列表
              </button>
            </div>
          </div>
        </div>

        <div className="project-shell-meta-grid">
          <article className="project-shell-meta-card">
            <span>项目主管</span>
            <strong>{activeProjectLead?.displayName ?? activeProjectUnit?.displayName ?? "待指定"}</strong>
          </article>
          <article className="project-shell-meta-card">
            <span>协作员工</span>
            <strong>{project.workflow.memberUnitIds.length} 位</strong>
          </article>
          <article className="project-shell-meta-card">
            <span>主管派工</span>
            <strong>{project.workflow.assignments.length} 项</strong>
          </article>
          <article className="project-shell-meta-card">
            <span>项目进度</span>
            <strong>{summary.blockedCount ? `${summary.blockedCount} 项阻塞` : `${summary.reviewCount} 项待看`}</strong>
          </article>
          <article className="project-shell-meta-card">
            <span>最近更新</span>
            <strong>{formatDateTimeLabel(project.updatedAt)}</strong>
          </article>
        </div>
      </section>
    );
  }

  function renderDispatchProjectHub() {
    return (
      <div className="workspace-stack">
        <SurfaceSection
          action={
            <div className="dispatch-project-toolbar">
              <label className="dispatch-project-search">
                <span className="visually-hidden">搜索项目名称</span>
                <input
                  onChange={(event) => setDispatchProjectSearch(event.target.value)}
                  placeholder="搜索项目名称"
                  value={dispatchProjectSearch}
                />
              </label>
              <button
                className="dispatch-project-create-button"
                onClick={handleOpenProjectCreateModal}
                type="button"
              >
                <span className="dispatch-project-create-button-label">创建项目</span>
              </button>
            </div>
          }
          subtitle="先建立项目，再把员工拉进项目总群、主管频道和专项群组里推进工作。"
          title="项目中心"
        >
          {filteredDispatchProjects.length ? (
            <div className="dispatch-project-grid">
              {filteredDispatchProjects.map((project) => {
                const lead =
                  units.find((unit) => unit.id === project.workflow.leadUnitId) ??
                  units.find((unit) => unit.id === project.unitId) ??
                  null;
                const summary = buildProjectLeadSummary(project, units);

                return (
                  <button
                    className="dispatch-project-card"
                    key={project.id}
                    onClick={() => handleSelectDispatchProject(project.id)}
                    type="button"
                  >
                    <div className="dispatch-project-card-top">
                      <span className="module-strap">{projectCategoryLabel(project.categoryId)}</span>
                      <StatusPill tone="good">{project.workflow.memberUnitIds.length} 位员工</StatusPill>
                    </div>
                    <strong>{project.name}</strong>
                    <p>{project.description}</p>
                    <div className="dispatch-project-card-meta">
                      <span>主管：{lead?.displayName ?? "待指定"}</span>
                      <span>派工：{project.workflow.assignments.length} 项</span>
                      <span>阻塞：{summary.blockedCount} 项</span>
                      <span>更新于：{formatDateTimeLabel(project.updatedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyPanel
              action={
                <button className="primary-button" onClick={handleOpenProjectCreateModal} type="button">
                  创建第一个项目
                </button>
              }
              body="项目会承接员工编制、主管指派、单聊、群组和项目汇报。先创建第一个项目。"
              title="当前还没有项目"
            />
          )}
        </SurfaceSection>
      </div>
    );
  }

  function renderProjectCreateModal() {
    if (!isProjectCreateModalOpen) {
      return null;
    }

    const selectedProjectMembers = dispatchProjectDraft.memberUnitIds
      .map((unitId) => dispatchProjectUnitCandidates.find((candidate) => candidate.id === unitId) ?? null)
      .filter((candidate): candidate is ClientUnit => Boolean(candidate));

    return (
      <div className="project-create-overlay" onClick={() => setIsProjectCreateModalOpen(false)} role="presentation">
        <section
          aria-labelledby="project-create-title"
          aria-modal="true"
          className="project-create-dialog"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="project-create-header">
            <div>
              <span className="project-create-kicker">Project Setup</span>
              <h2 id="project-create-title">创建项目</h2>
            </div>
            <button
              aria-label="关闭创建项目弹窗"
              className="project-create-close"
              onClick={() => setIsProjectCreateModalOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>

          <form className="project-create-form" onSubmit={handleCreateDispatchProject}>
            <div className="project-create-stack">
              <label className="project-create-field project-create-field-hero">
                <span>
                  项目名称
                  <em className="project-required-mark">*</em>
                </span>
                <input
                  onChange={(event) =>
                    setDispatchProjectDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="例如：霸总反转短剧第一集"
                  required
                  value={dispatchProjectDraft.name}
                />
              </label>

              <section className="project-create-group">
                <div className="project-create-section">
                  <div className="project-create-section-head">
                    <strong>
                      方向选择
                      <em className="project-required-mark">*</em>
                    </strong>
                    <p>先定业务线</p>
                  </div>
                  <div className="project-direction-grid">
                    {projectCategoryOptions.map((category, index) => (
                      <button
                        className={
                          dispatchProjectDraft.categoryId === category.id
                            ? "project-direction-chip active"
                            : "project-direction-chip"
                        }
                        key={category.id}
                        onClick={() =>
                          setDispatchProjectDraft((current) => ({
                            ...current,
                            categoryId: category.id
                          }))
                        }
                        type="button"
                      >
                        <span className="project-direction-chip-top">
                          <span className="project-direction-chip-index">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span aria-hidden="true" className="project-direction-chip-orb" />
                        </span>
                        <strong>{category.title}</strong>
                        <span className="project-direction-chip-summary">{category.summary}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="project-create-group">
                <div className="project-create-section">
                  <div className="project-create-section-head">
                    <strong>
                      选择项目员工
                      <em className="project-required-mark">*</em>
                    </strong>
                    <p>先选成员，再定主管</p>
                  </div>
                  {dispatchProjectUnitCandidates.length ? (
                    <div className="project-unit-grid">
                      {dispatchProjectUnitCandidates.map((candidate) => {
                        const selected = dispatchProjectDraft.memberUnitIds.includes(candidate.id);

                        return (
                          <button
                            className={selected ? "project-unit-card active" : "project-unit-card"}
                            key={candidate.id}
                            onClick={() => handleToggleProjectMember(candidate.id)}
                            type="button"
                          >
                            <div className="project-unit-card-top">
                              <span className="module-strap">{candidate.module?.strap ?? "AI Employee"}</span>
                              {selected ? <StatusPill tone="good">已加入</StatusPill> : null}
                            </div>
                            <strong>{candidate.displayName}</strong>
                            <p>{candidate.module?.summary ?? "当前员工来自旧版数据，可继续承接项目工作。"}</p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="project-create-inline-empty">
                      <p>当前方向还没有在编员工。先去招聘补齐岗位，再回来创建项目。</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="project-create-group">
                <div className="project-create-section">
                  <div className="project-create-section-head">
                    <strong>
                      指定项目主管
                      <em className="project-required-mark">*</em>
                    </strong>
                    <p>成员默认向主管汇报</p>
                  </div>
                  {selectedProjectMembers.length ? (
                    <div className="project-unit-grid">
                      {selectedProjectMembers.map((candidate) => {
                        const isLead = dispatchProjectDraft.leadUnitId === candidate.id;

                        return (
                          <button
                            className={isLead ? "project-unit-card active" : "project-unit-card"}
                            key={`lead-${candidate.id}`}
                            onClick={() => handleSelectProjectLead(candidate.id)}
                            type="button"
                          >
                            <div className="project-unit-card-top">
                              <span className="module-strap">{candidate.module?.strap ?? "Lead Candidate"}</span>
                              <StatusPill tone={isLead ? "good" : "neutral"}>
                                {isLead ? "项目主管" : "设为主管"}
                              </StatusPill>
                            </div>
                            <strong>{candidate.displayName}</strong>
                            <p>负责拆任务、收进展、统一向 CEO 汇报风险与下一步动作。</p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="project-create-inline-empty">
                      <p>先选择项目员工，才能指定项目主管。</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="project-create-group">
                <label className="project-create-field project-create-field-large">
                  <span>项目说明</span>
                  <textarea
                    onChange={(event) =>
                      setDispatchProjectDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="例如：先由 AI 编剧出三幕剧情和对白，再由 AI 导演拆分镜，最后交给视频生成与剪辑职能线出样片。"
                    value={dispatchProjectDraft.description}
                  />
                </label>
                <div className="project-create-note">
                  <p>汇报路径固定为：CEO → 项目主管 → 项目员工。项目创建后，你可以继续新建专项群组和单聊频道。</p>
                </div>
              </section>
            </div>

            <div className="project-create-actions">
              <button
                aria-label="创建项目"
                className="dispatch-project-create-button project-create-submit-button"
                type="submit"
              >
                <span className="dispatch-project-create-button-label">创建项目</span>
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  function renderProjectSettingsModal() {
    if (!isProjectSettingsModalOpen || !activeDispatchProject) {
      return null;
    }

    return (
      <div
        className="project-create-overlay"
        onClick={() => setIsProjectSettingsModalOpen(false)}
        role="presentation"
      >
        <section
          aria-labelledby="project-settings-title"
          aria-modal="true"
          className="project-create-dialog project-settings-dialog"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="project-create-header">
            <div>
              <span className="project-create-kicker">Project Settings</span>
              <h2 id="project-settings-title">项目设置</h2>
            </div>
            <button
              aria-label="关闭项目设置弹窗"
              className="project-create-close"
              onClick={() => setIsProjectSettingsModalOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>

          <form className="project-create-form" onSubmit={handleSaveProjectSettings}>
            <div className="project-create-stack">
              <label className="project-create-field project-create-field-hero">
                <span>项目名称</span>
                <input
                  onChange={(event) =>
                    setProjectSettingsDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="填写项目名称"
                  value={projectSettingsDraft.name}
                />
              </label>

              <label className="project-create-field project-create-field-large">
                <span>项目说明</span>
                <textarea
                  onChange={(event) =>
                    setProjectSettingsDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="同步最新项目目标、范围与协作说明"
                  value={projectSettingsDraft.description}
                />
              </label>

              <section className="project-create-group">
                <div className="project-create-section">
                  <div className="project-create-section-head">
                    <strong>项目主管</strong>
                    <p>主管负责汇总项目风险、进展和下一步动作</p>
                  </div>

                  <label className="project-task-form-field">
                    <span>当前主管</span>
                    <select
                      onChange={(event) =>
                        setProjectSettingsDraft((current) => ({ ...current, leadUnitId: event.target.value }))
                      }
                      value={projectSettingsDraft.leadUnitId}
                    >
                      {activeProjectMembers.map((member) => (
                        <option key={`project-settings-lead-${member.id}`} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="project-settings-member-list">
                    {activeProjectMembers.map((member) => {
                      const isLead = projectSettingsDraft.leadUnitId === member.id;

                      return (
                        <span className={isLead ? "soft-chip project-settings-chip active" : "soft-chip"} key={member.id}>
                          {member.displayName}
                          {isLead ? " · 项目主管" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            <div className="project-create-actions project-settings-actions">
              <button
                className="ghost-button"
                onClick={() => setIsProjectSettingsModalOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                aria-label="保存项目设置"
                className="dispatch-project-create-button project-create-submit-button"
                type="submit"
              >
                <span className="dispatch-project-create-button-label">保存设置</span>
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  function renderDispatchView() {
    if (!employeeUnits.length) {
      return (
        <EmptyPanel
          action={
            <button className="primary-button" onClick={() => setActiveView("recruit")} type="button">
              先去招聘员工
            </button>
          }
          body="任务台现在围绕员工制项目协作展开。先招聘员工，再创建项目并指定主管。"
          title="当前还没有可协作的员工编制"
        />
      );
    }

    if (!activeDispatchProject) {
      return renderDispatchProjectHub();
    }

    const projectMembers = activeProjectMembers;
    const sortedChannelMessages = [...activeProjectChannelMessages].sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
    );
    const visibleGroupChannels = activeProjectChannels.filter((channel) => channel.kind === "group");
    const shortDramaStages =
      activeDispatchProject.categoryId === "ai-short-drama" ? shortDramaStageDefinitions : [];
    const progressPreviewOutputs = activeProjectOutputsSorted.slice(0, 3);
    const activeConversationTitle = activeProjectChannel
      ? resolveProjectChannelName(activeProjectChannel, units)
      : "项目总群";
    const activeConversationKindLabel = activeProjectChannel
      ? activeProjectChannel.kind === "all-hands"
        ? "项目总群"
        : activeProjectChannel.kind === "lead"
          ? "主管汇总"
          : activeProjectChannel.kind === "group"
            ? "专项群组"
            : "员工单聊"
      : "项目总群";
    const activeConversationSubtitle =
      activeProjectChannel?.kind === "all-hands"
        ? "CEO 在这里统一对齐目标与优先级，项目主管会继续向成员拆解任务。"
        : activeProjectChannel?.kind === "lead"
          ? `${activeProjectLead?.displayName ?? "项目主管"} 会在这里向你同步当前风险、进度和下一步动作。`
          : activeProjectChannel?.kind === "group"
            ? "这个专项群组用于集中处理某个子任务，阶段结论仍会回流给项目主管。"
            : "当前是员工直连会话，员工会先向项目主管同步进展，再决定是否升级到 CEO。";

    return (
      <div className="workspace-stack project-workspace-stack">
        {renderDispatchProjectHeader(activeDispatchProject)}

        <div className="project-shell-layout">
          <aside className="project-sidebar-column">
            <section className="project-panel project-sidebar-panel">
              <div className="project-panel-header">
                <div>
                  <span className="project-panel-kicker">Conversation</span>
                  <h2>项目成员</h2>
                  <p>左侧优先保留成员入口，像 Discord 一样随时切换到对应对象。</p>
                </div>
              </div>

              <div className="project-sidebar-section">
                <span className="project-sidebar-label">固定入口</span>
                <div className="project-sidebar-list">
                  <button
                    className={activeProjectChannel?.id === "all-hands" ? "project-sidebar-button active" : "project-sidebar-button"}
                    onClick={() => handleSelectProjectChannel("all-hands")}
                    type="button"
                  >
                    <span aria-hidden="true" className="project-sidebar-channel-glyph">
                      #
                    </span>
                    <span className="project-sidebar-copy">
                      <strong>项目总群</strong>
                      <em>CEO 统一下达方向和优先级</em>
                    </span>
                  </button>

                  {activeProjectChannels.some((channel) => channel.id === "lead-room") ? (
                    <button
                      className={activeProjectChannel?.id === "lead-room" ? "project-sidebar-button active" : "project-sidebar-button"}
                      onClick={() => handleSelectProjectChannel("lead-room")}
                      type="button"
                    >
                      <span aria-hidden="true" className="project-sidebar-channel-glyph">
                        !
                      </span>
                      <span className="project-sidebar-copy">
                        <strong>主管汇总</strong>
                        <em>{activeProjectLead?.displayName ?? "项目主管"} 统一向你汇报</em>
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="project-sidebar-section">
                <span className="project-sidebar-label">成员列表</span>
                <div className="project-sidebar-list">
                  {projectMembers.map((member) => {
                    const directChannel = activeProjectChannels.find((channel) => channel.id === `direct:${member.id}`);
                    const isLead = activeProjectLead?.id === member.id;

                    if (!directChannel) {
                      return null;
                    }

                    return (
                      <button
                        className={activeProjectChannel?.id === directChannel.id ? "project-sidebar-button active" : "project-sidebar-button"}
                        key={`member-channel-${member.id}`}
                        onClick={() => handleSelectProjectChannel(directChannel.id)}
                        type="button"
                      >
                        <span className="project-sidebar-avatar" aria-hidden="true">
                          <RecruitBotAvatar accent={member.accent} height={22} width={22} />
                        </span>
                        <span className="project-sidebar-copy">
                          <strong>{member.displayName}</strong>
                          <em>{isLead ? "项目主管" : "AI 员工"}</em>
                        </span>
                        {isLead ? <span className="project-sidebar-tag">主管</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {visibleGroupChannels.length ? (
                <div className="project-sidebar-section">
                  <span className="project-sidebar-label">专项群组</span>
                  <div className="project-sidebar-list">
                    {visibleGroupChannels.map((channel) => (
                      <button
                        className={activeProjectChannel?.id === channel.id ? "project-sidebar-button active" : "project-sidebar-button"}
                        key={channel.id}
                        onClick={() => handleSelectProjectChannel(channel.id)}
                        type="button"
                      >
                        <span aria-hidden="true" className="project-sidebar-channel-glyph">
                          @
                        </span>
                        <span className="project-sidebar-copy">
                          <strong>{channel.name}</strong>
                          <em>{channel.memberUnitIds.length} 位成员</em>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </aside>

          <section className="project-conversation-column">
            <section className="project-panel project-conversation-panel">
              <div className="project-panel-header project-conversation-header">
                <div>
                  <span className="project-panel-kicker">{activeConversationKindLabel}</span>
                  <h2>{activeConversationTitle}</h2>
                  <p>{activeConversationSubtitle}</p>
                </div>
                <div className="project-conversation-header-side">
                  {activeProjectLead ? <span className="soft-chip">主管 · {activeProjectLead.displayName}</span> : null}
                  <StatusPill tone="good">{activeConversationKindLabel}</StatusPill>
                </div>
              </div>

              <div className="project-chat-thread project-chat-thread-discord">
                {sortedChannelMessages.length ? (
                  sortedChannelMessages.map((message) => (
                    <article
                      className={`project-chat-message project-chat-message-discord ${message.authorKind === "ceo" ? "is-ceo" : ""} ${message.authorKind === "system" ? "is-system" : ""}`}
                      key={message.id}
                    >
                      <div className={`project-chat-message-avatar project-chat-message-avatar-${message.authorKind}`}>
                        {message.authorKind === "system" ? "#" : message.authorLabel.slice(0, 1)}
                      </div>
                      <div className="project-chat-message-body">
                        <div className="project-chat-message-top">
                          <strong>{message.authorLabel}</strong>
                          <span>
                            {message.authorKind === "ceo"
                              ? "CEO"
                              : message.authorKind === "lead"
                                ? "项目主管"
                                : message.authorKind === "employee"
                                  ? "员工"
                                  : "系统"}
                          </span>
                          <em>{formatDateTimeLabel(message.createdAt)}</em>
                        </div>
                        <p>{message.body}</p>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="project-chat-empty">
                    <strong>当前频道还没有消息</strong>
                    <p>你可以直接给主管或相关员工下达目标，系统会把后续汇报关系自动串起来。</p>
                  </div>
                )}
              </div>

              <form className="project-chat-composer project-chat-composer-discord" onSubmit={handleSendProjectMessage}>
                <label className="project-chat-composer-field">
                  <span>发送给当前会话</span>
                  <textarea
                    disabled={isProjectReplying}
                    onChange={(event) => setProjectMessageDraft(event.target.value)}
                    onKeyDown={handleProjectComposerKeyDown}
                    placeholder={
                      isProjectReplying
                        ? "当前员工正在理解并组织回复…"
                        : "例如：这周先把角色设定与第一版对白做出来，风险统一汇总给项目主管。"
                    }
                    value={projectMessageDraft}
                  />
                </label>
                <div className="project-chat-composer-actions project-chat-composer-actions-discord">
                  <span>Enter 发送，Shift + Enter 换行。员工默认先向项目主管汇报，你不需要盯每个成员的所有细节。</span>
                  <button className="primary-button" disabled={isProjectReplying} type="submit">
                    {isProjectReplying ? "思考中…" : "发送消息"}
                  </button>
                </div>
              </form>
            </section>
          </section>

          <aside className="project-progress-column">
            <section className="project-panel project-progress-panel">
              <div className="project-panel-header">
                <div>
                  <span className="project-panel-kicker">Progress Preview</span>
                  <h2>项目进度预览</h2>
                  <p>{projectLeadSummary?.headline ?? "项目已建立，接下来由主管继续推进。"}</p>
                </div>
              </div>

              {projectLeadSummary ? (
                <>
                  <div className="project-progress-metrics">
                    <article className="project-progress-metric">
                      <span>完成</span>
                      <strong>{projectLeadSummary.completedCount}</strong>
                    </article>
                    <article className="project-progress-metric">
                      <span>进行中</span>
                      <strong>{projectLeadSummary.inProgressCount}</strong>
                    </article>
                    <article className="project-progress-metric">
                      <span>待查看</span>
                      <strong>{projectLeadSummary.reviewCount}</strong>
                    </article>
                    <article className="project-progress-metric">
                      <span>阻塞</span>
                      <strong>{projectLeadSummary.blockedCount}</strong>
                    </article>
                  </div>

                  <div className="project-progress-note">
                    <strong>主管最新汇总</strong>
                    <p>{projectLeadSummary.detail}</p>
                  </div>
                </>
              ) : null}

              <div className="project-progress-block">
                <div className="project-progress-block-head">
                  <strong>成员状态</strong>
                  <span>{activeProjectMemberRows.length} 位在编</span>
                </div>
                <div className="project-progress-roster">
                  {activeProjectMemberRows.map((row) => (
                    <article className="project-progress-roster-item" key={`progress-${row.member.id}`}>
                      <div>
                        <strong>{row.member.displayName}</strong>
                        <p>{row.latestReport || (row.isLead ? "主管本人，直接向 CEO 汇报。" : `当前向 ${row.managerLabel} 汇报。`)}</p>
                      </div>
                      <StatusPill tone={row.isLead ? "good" : projectAssignmentStatusTone(row.latestStatus)}>
                        {row.isLead ? "主管" : projectAssignmentStatusLabel(row.latestStatus)}
                      </StatusPill>
                    </article>
                  ))}
                </div>
              </div>

              {shortDramaPipelineCards.length ? (
                <div className="project-progress-block">
                  <div className="project-progress-block-head">
                    <strong>短剧流水线</strong>
                    <span>{shortDramaPipelineCards.length} 个阶段</span>
                  </div>
                  <div className="project-short-drama-pipeline">
                    {shortDramaPipelineCards.map((step, index) => (
                      <article className="project-short-drama-step" data-status={step.status} key={step.id}>
                        <div className="project-short-drama-step-top">
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <StatusPill tone={projectFlowStatusTone(step.status)}>
                            {formatProjectFlowStatus(step.status)}
                          </StatusPill>
                        </div>
                        <strong>{step.title}</strong>
                        <p>{step.summary}</p>
                        <div className="project-short-drama-step-meta">
                          <span>岗位：{step.ownerRole}</span>
                          <span>
                            在编：
                            {step.owners.length ? step.owners.map((owner) => owner.displayName).join("、") : "待招聘"}
                          </span>
                        </div>
                        <em>{step.latestReport || "当前还没有这一环节的阶段回报。"}</em>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="project-progress-block">
                <div className="project-progress-block-head">
                  <strong>最近产出</strong>
                  <span>{activeProjectOutputsSorted.length ? `${activeProjectOutputsSorted.length} 项` : "等待首轮产出"}</span>
                </div>

                {progressPreviewOutputs.length ? (
                  <div className="project-output-list">
                    {progressPreviewOutputs.map((artifact) => {
                      const owner =
                        projectMembers.find((member) => member.id === artifact.ownerUnitId) ??
                        units.find((unit) => unit.id === artifact.ownerUnitId) ??
                        null;

                      return (
                        <article className="project-output-card project-output-card-compact" key={artifact.id}>
                          <div className="project-output-card-top">
                            <div>
                              <span className="module-strap">{artifact.stageTitle}</span>
                              <strong>{artifact.title}</strong>
                            </div>
                            <StatusPill tone={artifact.needsReview ? "warm" : "good"}>
                              {artifact.needsReview ? "待看" : "推进中"}
                            </StatusPill>
                          </div>
                          <p>{artifact.summary}</p>
                          <div className="project-output-meta">
                            <span>负责人：{owner?.displayName ?? "待分配"}</span>
                            <span>{formatDateTimeLabel(artifact.updatedAt)}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="project-chat-empty compact">
                    <strong>还没有阶段产出</strong>
                    <p>等第一轮执行启动后，这里会先显示最近的项目产出预览。</p>
                  </div>
                )}
              </div>
            </section>

            <section className="project-panel">
              <div className="project-panel-header">
                <div>
                  <span className="project-panel-kicker">Groups</span>
                  <h2>专项群组</h2>
                  <p>把专项沟通从项目总群里拆出去，但仍然保留在当前项目上下文中。</p>
                </div>
              </div>

              <div className="project-group-builder">
                <label className="project-create-field">
                  <span>群组名称</span>
                  <input
                    onChange={(event) => setProjectGroupDraftName(event.target.value)}
                    placeholder="例如：角色设定群"
                    value={projectGroupDraftName}
                  />
                </label>
                <div className="project-member-toggle-list">
                  {projectMembers.map((member) => {
                    const selected = projectGroupDraftMemberIds.includes(member.id);
                    return (
                      <button
                        className={selected ? "project-member-chip active" : "project-member-chip"}
                        key={`group-${member.id}`}
                        onClick={() =>
                          setProjectGroupDraftMemberIds((current) =>
                            current.includes(member.id)
                              ? current.filter((entry) => entry !== member.id)
                              : [...current, member.id]
                          )
                        }
                        type="button"
                      >
                        {member.displayName}
                      </button>
                    );
                  })}
                </div>
                <button className="primary-button" onClick={handleCreateProjectGroup} type="button">
                  创建群组
                </button>
              </div>
            </section>

            <section className="project-panel">
              <div className="project-panel-header">
                <div>
                  <span className="project-panel-kicker">Assignments</span>
                  <h2>{`主管派工${activeProjectAssignments.length ? ` · ${activeProjectAssignments.length}` : ""}`}</h2>
                  <p>主管负责拆任务、分发给员工，再由员工把进展回报给主管。</p>
                </div>
              </div>

              <div className="project-inspector-stack">
                <form className="project-task-form" onSubmit={handleCreateProjectAssignment}>
                  <div className="project-task-form-grid">
                    <label className="project-task-form-field">
                      <span>负责人</span>
                      <select
                        onChange={(event) =>
                          setProjectAssignmentDraft((current) => ({ ...current, ownerUnitId: event.target.value }))
                        }
                        value={projectAssignmentDraft.ownerUnitId}
                      >
                        <option value="">选择员工</option>
                        {projectMembers.map((member) => (
                          <option key={`assignment-owner-${member.id}`} value={member.id}>
                            {member.displayName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="project-task-form-field">
                      <span>优先级</span>
                      <select
                        onChange={(event) =>
                          setProjectAssignmentDraft((current) => ({
                            ...current,
                            priority: event.target.value as ProjectAssignmentPriority
                          }))
                        }
                        value={projectAssignmentDraft.priority}
                      >
                        <option value="high">高优先级</option>
                        <option value="medium">中优先级</option>
                        <option value="low">低优先级</option>
                      </select>
                    </label>
                  </div>

                  <label className="project-task-form-field">
                    <span>任务标题</span>
                    <input
                      onChange={(event) =>
                        setProjectAssignmentDraft((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="例如：完成第一版分镜脚本"
                      value={projectAssignmentDraft.title}
                    />
                  </label>

                  <label className="project-task-form-field project-task-form-field-large">
                    <span>任务说明</span>
                    <textarea
                      onChange={(event) =>
                        setProjectAssignmentDraft((current) => ({ ...current, summary: event.target.value }))
                      }
                      placeholder="例如：围绕当前 premise 输出 8 镜头节奏版，并标出反转点与最后 3 秒钩子。"
                      value={projectAssignmentDraft.summary}
                    />
                  </label>

                  <label className="project-task-form-field">
                    <span>交付要求</span>
                    <input
                      onChange={(event) =>
                        setProjectAssignmentDraft((current) => ({ ...current, deliverable: event.target.value }))
                      }
                      placeholder="例如：分镜脚本、对白草稿、风险说明"
                      value={projectAssignmentDraft.deliverable}
                    />
                  </label>

                  <button className="primary-button" type="submit">
                    由主管派工
                  </button>
                </form>

                <div className="project-assignment-list">
                  {activeProjectAssignments.map((assignment) => {
                    const owner =
                      projectMembers.find((member) => member.id === assignment.ownerUnitId) ??
                      units.find((unit) => unit.id === assignment.ownerUnitId) ??
                      null;
                    const isSelected = selectedProjectAssignment?.id === assignment.id;

                    return (
                      <button
                        className={isSelected ? "project-assignment-card active" : "project-assignment-card"}
                        key={assignment.id}
                        onClick={() => handleSelectProjectAssignment(assignment.id)}
                        type="button"
                      >
                        <div className="project-assignment-card-top">
                          <strong>{assignment.title}</strong>
                          <StatusPill tone={projectAssignmentStatusTone(assignment.status)}>
                            {projectAssignmentStatusLabel(assignment.status)}
                          </StatusPill>
                        </div>
                        <p>{assignment.summary}</p>
                        <div className="project-assignment-card-meta">
                          <span>负责人：{owner?.displayName ?? "待定"}</span>
                          <span>{projectAssignmentPriorityLabel(assignment.priority)}</span>
                          <span>{assignment.reportCount} 次汇报</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="project-panel">
              <div className="project-panel-header">
                <div>
                  <span className="project-panel-kicker">Reports</span>
                  <h2>{selectedProjectAssignment ? `员工回报 · ${selectedProjectAssignment.title}` : "员工回报"}</h2>
                  <p>员工回报默认先给主管，主管再决定是否升级同步给 CEO。</p>
                </div>
              </div>

              {selectedProjectAssignment && selectedProjectAssignmentOwner ? (
                <div className="project-inspector-stack">
                  <article className="project-report-summary-card">
                    <div className="project-report-summary-top">
                      <strong>{selectedProjectAssignmentOwner.displayName}</strong>
                      <StatusPill tone={projectAssignmentStatusTone(selectedProjectAssignment.status)}>
                        {projectAssignmentStatusLabel(selectedProjectAssignment.status)}
                      </StatusPill>
                    </div>
                    <p>{selectedProjectAssignment.summary}</p>
                    <div className="project-assignment-card-meta">
                      <span>交付：{selectedProjectAssignment.deliverable}</span>
                      <span>
                        最近汇报：
                        {selectedProjectAssignment.lastReportAt
                          ? formatDateTimeLabel(selectedProjectAssignment.lastReportAt)
                          : "暂无"}
                      </span>
                    </div>
                  </article>

                  <form className="project-task-form" onSubmit={handleSubmitProjectReport}>
                    <div className="project-task-form-grid">
                      <label className="project-task-form-field">
                        <span>当前状态</span>
                        <select
                          onChange={(event) =>
                            setProjectReportStatus(event.target.value as ProjectAssignmentStatus)
                          }
                          value={projectReportStatus}
                        >
                          <option value="todo">待开始</option>
                          <option value="in_progress">进行中</option>
                          <option value="review">待主管查看</option>
                          <option value="blocked">已阻塞</option>
                          <option value="done">已完成</option>
                        </select>
                      </label>

                      <label className="project-task-form-field">
                        <span>汇报对象</span>
                        <input readOnly value={activeProjectLead?.displayName ?? "项目主管"} />
                      </label>
                    </div>

                    <label className="project-task-form-field project-task-form-field-large">
                      <span>本轮回报</span>
                      <textarea
                        onChange={(event) => setProjectReportDraft(event.target.value)}
                        placeholder="例如：剧情大纲已完成，剩余对白细化 30%；当前风险是女主人设还没完全锁定。"
                        value={projectReportDraft}
                      />
                    </label>

                    <button className="primary-button" type="submit">
                      代员工提交回报
                    </button>
                  </form>

                  <div className="project-report-history">
                    {selectedProjectAssignmentReports.length ? (
                      selectedProjectAssignmentReports.slice(0, 4).map((report) => (
                        <article className="project-report-history-item" key={report.id}>
                          <div className="project-report-history-top">
                            <strong>{selectedProjectAssignmentOwner.displayName}</strong>
                            <StatusPill tone={projectAssignmentStatusTone(report.status)}>
                              {projectAssignmentStatusLabel(report.status)}
                            </StatusPill>
                          </div>
                          <p>{report.summary}</p>
                          <span>{formatDateTimeLabel(report.createdAt)}</span>
                        </article>
                      ))
                    ) : (
                      <div className="project-chat-empty compact">
                        <strong>当前还没有进展回报</strong>
                        <p>先由主管派发任务，再让员工在这里汇报阶段进展与阻塞。</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyPanel body="先选中一张派工单，再查看对应员工的回报历史。" title="还没有选中派工单" />
              )}
            </section>

            {shortDramaStages.length ? (
              <section className="project-panel">
                <div className="project-panel-header">
                  <div>
                    <span className="project-panel-kicker">Stages</span>
                    <h2>短剧推进阶段</h2>
                    <p>短剧项目按主管视角拆成稳定的推进环节，当前阶段会同步显示在这里。</p>
                  </div>
                </div>

                <div className="project-stage-list">
                  {shortDramaStages.map((stage) => {
                    const isActive = shortDramaStage === stage.id;
                    return (
                      <button
                        className={isActive ? "project-stage-button active" : "project-stage-button"}
                        key={stage.id}
                        onClick={() => handleSelectProjectStage(stage.id)}
                        type="button"
                      >
                        <div>
                          <strong>{stage.title}</strong>
                          <p>{stage.summary}</p>
                        </div>
                        <span>{stage.owner}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    );
  }

  function renderApprovalsView() {
    if (!approvals.length) {
      return (
        <EmptyPanel
          action={
            <button className="ghost-button" onClick={() => setActiveView("dispatch")} type="button">
              去任务台
            </button>
          }
          body="当前没有需要人工处理的审批项。审批区现在只保留关键节点。"
          title="审批区已清空"
        />
      );
    }

    return (
      <div className="workspace-stack">
        <div className="approval-grid">
          {approvals.map((approval) => (
            <article className="approval-card" key={approval.id}>
              {(() => {
                const digest = buildApprovalDigest(approval);

                return (
                  <>
                    <div className="list-card-top">
                      <div>
                        <span className="module-strap">{approval.stage}</span>
                        <h3>{approval.title}</h3>
                      </div>
                      <StatusPill tone="warm">待审批</StatusPill>
                    </div>
                    <p>{approval.summary}</p>
                    <div className="approval-digest">
                      <div className="approval-digest-item">
                        <span>本轮摘要</span>
                        <strong>{digest.lead}</strong>
                      </div>
                      <div className="approval-digest-item">
                        <span>潜在风险</span>
                        <strong>{digest.risk}</strong>
                      </div>
                      <div className="approval-digest-item">
                        <span>建议动作</span>
                        <strong>{digest.nextAction}</strong>
                      </div>
                    </div>
                    <div className="approval-actions">
                      <button
                        className="primary-button"
                        disabled={!canResolveApprovals}
                        onClick={() => handleApprove(approval.id)}
                        type="button"
                      >
                        批准
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canResolveApprovals}
                        onClick={() => handleReject(approval.id)}
                        type="button"
                      >
                        驳回
                      </button>
                    </div>
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      </div>
    );
  }

  function renderSettingsView() {
    return (
      <div className="workspace-stack">
        <div className="two-column-grid">
          <SurfaceSection subtitle="这些信息应该留在设置区，而不是占据主工作流。" title="组织与 Session">
            <div className="stacked-list">
              <article className="list-card">
                <strong>{currentOrganizationName}</strong>
                <p>当前角色：{currentRole}</p>
              </article>
              <article className="list-card">
                <strong>当前 Session</strong>
                <p>{sessionToken ? previewToken(sessionToken) : "使用环境身份或 demo fallback"}</p>
              </article>
              {latestIssuedSessionToken ? (
                <article className="list-card">
                  <strong>最新下发 Session</strong>
                  <p>{previewToken(latestIssuedSessionToken)}</p>
                </article>
              ) : null}
              <button className="ghost-button" onClick={handleClearSession} type="button">
                清除当前 Session
              </button>
            </div>
          </SurfaceSection>

          <SurfaceSection subtitle="把预算控制收在设置里，不再打断主使用路径。" title="组织预算">
            <form className="access-form compact" onSubmit={handleUpdateBudget}>
              <label>
                月预算上限（CNY）
                <input
                  onChange={(event) =>
                    setBudgetDraft((current) => ({ ...current, monthlyLimitCny: event.target.value }))
                  }
                  value={budgetDraft.monthlyLimitCny}
                />
              </label>
              <label>
                单任务预算上限（CNY）
                <input
                  onChange={(event) =>
                    setBudgetDraft((current) => ({ ...current, taskLimitCny: event.target.value }))
                  }
                  value={budgetDraft.taskLimitCny}
                />
              </label>
              <label className="checkbox-row">
                <input
                  checked={budgetDraft.pauseOnLimit}
                  onChange={(event) =>
                    setBudgetDraft((current) => ({ ...current, pauseOnLimit: event.target.checked }))
                  }
                  type="checkbox"
                />
                达到阈值时暂停
              </label>
              <button className="primary-button" disabled={isUpdatingBudget} type="submit">
                {isUpdatingBudget ? "保存中..." : "保存预算"}
              </button>
            </form>
          </SurfaceSection>
        </div>

        <div className="two-column-grid">
          <SurfaceSection subtitle="邀请能力只保留在设置区，避免前台流程太复杂。" title="邀请成员">
            <form className="access-form compact" onSubmit={handleCreateInvitation}>
              <label>
                邮箱
                <input onChange={(event) => setInviteEmail(event.target.value)} value={inviteEmail} />
              </label>
              <label>
                角色
                <select
                  onChange={(event) => setInviteRole(event.target.value as OrganizationRole)}
                  value={inviteRole}
                >
                  <option value="approver">approver</option>
                  <option value="operator">operator</option>
                  <option value="org_admin">org_admin</option>
                </select>
              </label>
              <button className="primary-button" disabled={!canInvite || isCreatingInvitation} type="submit">
                {isCreatingInvitation ? "创建中..." : "创建邀请"}
              </button>
            </form>
          </SurfaceSection>

          <SurfaceSection subtitle="设置页只展示必要的人和状态，不再铺成长流程。" title="组织编制">
            <div className="stacked-list">
              <article className="list-card">
                <strong>{members.length} 位组织成员</strong>
                <p>其中 {members.filter((member) => member.role !== "operator").length} 位可参与审批</p>
              </article>
              <article className="list-card">
                <strong>{invitations.length} 个邀请</strong>
                <p>低频管理能力保留在设置区，主工作区不再打扰用户。</p>
              </article>
              <article className="list-card">
                <strong>{employeeUnits.length} 位在编员工</strong>
                <p>当前版本围绕员工、项目主管和项目协作推进，不再通过团队包组织工作流。</p>
              </article>
            </div>
          </SurfaceSection>
        </div>
      </div>
    );
  }

  function renderActiveWorkspace() {
    switch (activeView) {
      case "overview":
        return renderOverviewView();
      case "recruit":
        return renderRecruitView();
      case "employees":
        return renderUnitsView("employee");
      case "teams":
        return (
          <EmptyPanel
            action={
              <button className="primary-button" onClick={() => setActiveView("recruit")} type="button">
                去招聘员工
              </button>
            }
            body="团队工作区当前已隐藏，先按员工制推进项目协作。"
            title="团队功能暂时隐藏"
          />
        );
      case "dispatch":
        return renderDispatchView();
      case "approvals":
        return renderApprovalsView();
      case "settings":
        return renderSettingsView();
    }
  }

  function renderHireConfirmModal() {
    if (!hireConfirmModule) {
      return null;
    }

    const module = hireConfirmModule;
    const categoryTitles = module.categoryIds.map(
      (categoryId) => recruitCategories.find((category) => category.id === categoryId)?.title ?? categoryId
    );
    const focusTitles = module.focusIds.map(
      (focusId) => recruitFocuses.find((focus) => focus.id === focusId)?.title ?? focusId
    );
    const responsibilities = deriveResponsibilityLines(module, {
      includeExecutionMeta: false
    });
    const approverCount = members.filter(
      (member) => member.role === "org_admin" || member.role === "approver"
    ).length;
    const kindLabel = module.kind === "team" ? "团队档案" : "员工档案";
    const isSubmittingHire = isHiringModuleId === module.id;
    const approvalTags = approverCount ? ["草稿审批", `${approverCount}位审批人`] : ["草稿审批已开启"];
    const visibleKeywords = module.signalWords.slice(0, 6);
    const visibleOutputs = module.outputs.slice(0, 3);

    return (
      <div
        className="recruit-confirm-overlay"
        onClick={handleCloseHireConfirm}
        role="presentation"
      >
        <section
          aria-labelledby="recruit-confirm-title"
          aria-modal="true"
          className="recruit-confirm-dialog"
          data-accent={module.accent}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="recruit-confirm-hero">
            <div className="recruit-confirm-topbar">
              <span className="module-strap recruit-confirm-strap">{module.strap}</span>
              <StatusPill tone={module.kind === "team" ? "warm" : "good"}>{kindLabel}</StatusPill>
            </div>

            <div className="recruit-confirm-header">
              <div className="recruit-confirm-avatar-shell">
                <RecruitBotAvatar
                  accent={module.accent}
                  aria-hidden="true"
                  className="recruit-confirm-avatar-graphic"
                  height={72}
                  width={72}
                />
              </div>
              <div className="recruit-confirm-copy">
                <div className="recruit-confirm-headline">
                  <div className="recruit-confirm-identity">
                    <div className="recruit-confirm-title-row">
                      <h2 id="recruit-confirm-title">{module.title}</h2>
                    </div>
                    <p className="recruit-confirm-summary">{module.summary}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="recruit-confirm-divider" />

          <div className="recruit-confirm-overview">
            <div className="recruit-confirm-meta-strip">
              <article className="recruit-confirm-meta-item">
                <em>适用方向</em>
                <div className="recruit-confirm-meta-tags">
                  {categoryTitles.map((title) => (
                    <span className="recruit-confirm-meta-tag" key={title}>
                      {title}
                    </span>
                  ))}
                </div>
              </article>
              <article className="recruit-confirm-meta-item">
                <em>目标聚焦</em>
                <div className="recruit-confirm-meta-tags">
                  {focusTitles.map((title) => (
                    <span className="recruit-confirm-meta-tag" key={title}>
                      {title}
                    </span>
                  ))}
                </div>
              </article>
              <article className="recruit-confirm-meta-item">
                <em>审批方式</em>
                <div className="recruit-confirm-meta-tags">
                  {approvalTags.map((tag) => (
                    <span className="recruit-confirm-meta-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            </div>
          </div>

          {error ? <div className="banner error recruit-confirm-banner">{error}</div> : null}

          <div className="recruit-confirm-body">
            <section className="recruit-confirm-pane recruit-confirm-pane-primary">
              <div className="recruit-confirm-section-head">
                <span>优先职责</span>
                <p>确认后会优先补上一名可直接派活的专业岗位。</p>
              </div>
              <ul className="recruit-confirm-list">
                {responsibilities.map((item) => (
                  <li key={item}>
                    <em aria-hidden="true" className="recruit-confirm-item-marker" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="recruit-confirm-pane recruit-confirm-pane-support">
              <div className="recruit-confirm-section-head">
                <span>默认交付物</span>
                <p>第一轮最容易直接拿到的结果。</p>
              </div>
              <div className="recruit-confirm-output-list">
                {visibleOutputs.map((output) => (
                  <article className="recruit-confirm-output-item" key={output}>
                    <span aria-hidden="true" className="recruit-confirm-item-marker" />
                    <strong>{output}</strong>
                  </article>
                ))}
              </div>
              <div className="recruit-confirm-keyword-line">
                <span className="recruit-confirm-sidebar-label">擅长任务</span>
                <strong>{visibleKeywords.join(" · ")}</strong>
              </div>
            </section>
          </div>

          <div className="recruit-confirm-actions">
            <div className="recruit-confirm-action-row">
              <button
                className="ghost-button"
                disabled={Boolean(isHiringModuleId)}
                onClick={handleCloseHireConfirm}
                type="button"
              >
                再想想
              </button>
              <button
                className="primary-button module-card-cta recruit-confirm-submit"
                disabled={Boolean(isHiringModuleId)}
                onClick={() => void handleHireModule(module)}
                type="button"
              >
                {isSubmittingHire ? "招聘中..." : "确认招聘"}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!workspaceUnlocked) {
    return renderAccessPanel();
  }

  if (!me && !error) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <h1>{APP_NAME}</h1>
          <p>正在进入客户端工作区...</p>
        </div>
      </main>
    );
  }

  const studioNavigation: WorkspaceView[] = ["overview", "recruit", "employees", "dispatch"];
  const governanceNavigation: WorkspaceView[] = ["approvals", "settings"];
  const activeStageDefinition =
    shortDramaStageDefinitions.find((stage) => stage.id === shortDramaStage) ?? {
      id: "intake",
      title: "剧情立项",
      summary: "确定项目目标、时长和钩子。",
      owner: "编导线"
    };
  const workspaceBadges: Partial<Record<WorkspaceView, string>> = {
    employees: employeeUnits.length ? String(employeeUnits.length) : "",
    approvals: pendingApprovalCount ? String(pendingApprovalCount) : ""
  };
  const userInvitationCode =
    me?.user.id.replace(/\D/g, "").slice(-6).padStart(6, "0") || "348546";
  const topbarAvatarLabel = me?.user.name?.slice(0, 1).toUpperCase() ?? "U";
  const visibleWorkspaceNotice =
    notice &&
    (/已创建，已切换到 admin session。/.test(notice) ||
      /已切换到 demo admin。/.test(notice) ||
      /已接受，已切换到 .+ 的 session。/.test(notice))
      ? null
      : notice;
  const workspaceSurfaceStyle: CSSProperties = {
    alignContent: "start",
    gridAutoRows: "max-content"
  };
  const workspaceShellStyle: CSSProperties = {
    alignContent: "start",
    alignItems: "start",
    gridAutoRows: "max-content",
    gridTemplateRows: "max-content max-content",
    minHeight: 0
  };
  const isProjectWorkspace = activeView === "dispatch" && Boolean(activeDispatchProject);

  return (
    <div className="client-shell">
      <header className="workspace-topbar flat-topbar flat-topbar-global">
        <div className="topbar-left">
          <div className="topbar-brand-badge" title={APP_NAME}>
            <span>TO</span>
          </div>
        </div>
        <div className="topbar-right">
          {activeView === "dispatch" && activeDispatchProject?.categoryId === "ai-short-drama" ? (
            <span className="topbar-stage-pill">阶段 · {activeStageDefinition.title}</span>
          ) : null}
          <button
            className="topbar-icon-button"
            onClick={() => setActiveView("approvals")}
            title="通知"
            type="button"
          >
            <BellIcon height={18} width={18} />
            {pendingApprovalCount ? (
              <span className="topbar-icon-badge">{Math.min(pendingApprovalCount, 9)}</span>
            ) : null}
          </button>
          <button
            className="topbar-icon-button"
            onClick={() => setActiveView("settings")}
            title="设置"
            type="button"
          >
            <SettingsIcon height={18} width={18} />
          </button>
          <div
            className={isAccountMenuOpen ? "topbar-account is-open" : "topbar-account"}
            onBlurCapture={(event) => handleAccountMenuBlur(event.relatedTarget, event.currentTarget)}
            onFocusCapture={openAccountMenu}
            onMouseEnter={openAccountMenu}
            onMouseLeave={scheduleAccountMenuClose}
          >
            <button
              aria-expanded={isAccountMenuOpen}
              aria-haspopup="menu"
              className="topbar-account-trigger"
              type="button"
            >
              <div className="topbar-avatar">{topbarAvatarLabel}</div>
              <ChevronDownIcon className="topbar-account-chevron" height={16} width={16} />
            </button>
            <div className="topbar-account-menu" role="menu">
              <div className="topbar-account-panel">
                <div className="account-profile-card">
                  <button className="account-profile-main" onClick={handleOpenSettingsFromMenu} type="button">
                    <div className="account-profile-avatar">{topbarAvatarLabel}</div>
                    <div className="account-profile-copy">
                      <strong>{me?.user.name ?? "Unknown user"}</strong>
                      <span>ID:{me?.user.id ?? "unknown-user"}</span>
                    </div>
                    <ArrowRightIcon className="account-profile-arrow" height={16} width={16} />
                  </button>
                  <button
                    aria-label="复制用户 ID"
                    className="account-copy-chip"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!me?.user.id) {
                        return;
                      }

                      void handleCopyText(me.user.id, "用户 ID 已复制。");
                      setIsAccountMenuOpen(false);
                    }}
                    type="button"
                  >
                    <CopyIcon height={15} width={15} />
                  </button>
                </div>

                <div className="account-membership-card">
                  <div>
                    <strong>个人版会员</strong>
                    <p>提升算力，优先体验更完整的 Bot 工作流。</p>
                  </div>
                  <button
                    className="account-membership-cta"
                    onClick={() => handleMenuPlaceholder("个人版会员")}
                    type="button"
                  >
                    立即开通
                  </button>
                </div>

                <div className="account-menu-list">
                  <button className="account-menu-item" onClick={handleOpenSettingsFromMenu} type="button">
                    <span className="account-menu-item-left">
                      <UserCardIcon height={18} width={18} />
                      <span>个人资料</span>
                    </span>
                    <span className="account-menu-tag">填写问卷领算力</span>
                  </button>

                  <button
                    className="account-menu-item"
                    onClick={() => handleMenuPlaceholder("我的订单")}
                    type="button"
                  >
                    <span className="account-menu-item-left">
                      <ReceiptIcon height={18} width={18} />
                      <span>我的订单</span>
                    </span>
                  </button>

                  <button
                    className="account-menu-item account-menu-item-code"
                    onClick={() => {
                      void handleCopyText(userInvitationCode, `邀请码 ${userInvitationCode} 已复制。`);
                      setIsAccountMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="account-menu-item-left">
                      <GiftIcon height={18} width={18} />
                      <span>我的邀请码</span>
                    </span>
                    <span className="account-menu-code">
                      {userInvitationCode}
                      <CopyIcon height={15} width={15} />
                    </span>
                  </button>

                  <button
                    className="account-menu-item"
                    onClick={() => handleMenuPlaceholder("会员兑换码")}
                    type="button"
                  >
                    <span className="account-menu-item-left">
                      <TicketIcon height={18} width={18} />
                      <span>会员兑换码</span>
                    </span>
                  </button>

                  <button
                    className="account-menu-item"
                    onClick={() => handleMenuPlaceholder("意见反馈")}
                    type="button"
                  >
                    <span className="account-menu-item-left">
                      <MailIcon height={18} width={18} />
                      <span>意见反馈</span>
                    </span>
                  </button>
                </div>

                <button
                  className="account-logout-button"
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    handleClearSession();
                  }}
                  type="button"
                >
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <aside className="client-rail holopix-rail">
        <div className="rail-nav">
          <span className="rail-section-label">Studio</span>
          {studioNavigation.map((item) => (
            <button
              aria-label={workspaceMeta[item].title}
              className={activeView === item ? "rail-button rail-button-wide active" : "rail-button rail-button-wide"}
              key={item}
              onClick={() => (item === "dispatch" ? handleReturnToProjectList() : setActiveView(item))}
              title={workspaceMeta[item].title}
              type="button"
            >
              <span className="rail-button-icon">
                <WorkspaceIcon name={workspaceMeta[item].icon} />
              </span>
              <span className="rail-button-copy">
                <strong>{workspaceMeta[item].title}</strong>
                <em>{workspaceRailSummary[item]}</em>
              </span>
              {workspaceBadges[item] ? <span className="rail-button-badge">{workspaceBadges[item]}</span> : null}
            </button>
          ))}
          {normalizedDispatchProjects.length ? (
            <>
              <div className="rail-divider rail-divider-vertical" />
              <span className="rail-section-label">任务台项目</span>
              <div className="rail-project-list">
                {normalizedDispatchProjects.map((project) => (
                  <button
                    className={
                      activeView === "dispatch" && activeDispatchProjectId === project.id
                        ? "rail-project-button active"
                        : "rail-project-button"
                    }
                    key={project.id}
                    onClick={() => handleSelectDispatchProject(project.id)}
                    title={project.name}
                    type="button"
                  >
                    <span className="rail-project-icon">
                      <CatalogGlyph height={14} name={project.categoryId} width={14} />
                    </span>
                    <span className="rail-project-copy">
                      <strong>{project.name}</strong>
                      <em>{projectCategoryLabel(project.categoryId)}</em>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div className="rail-divider rail-divider-vertical" />
          <span className="rail-section-label">Governance</span>
          {governanceNavigation.map((item) => (
            <button
              aria-label={workspaceMeta[item].title}
              className={activeView === item ? "rail-button rail-button-wide active" : "rail-button rail-button-wide"}
              key={item}
              onClick={() => setActiveView(item)}
              title={workspaceMeta[item].title}
              type="button"
            >
              <span className="rail-button-icon">
                <WorkspaceIcon name={workspaceMeta[item].icon} />
              </span>
              <span className="rail-button-copy">
                <strong>{workspaceMeta[item].title}</strong>
                <em>{workspaceRailSummary[item]}</em>
              </span>
              {workspaceBadges[item] ? <span className="rail-button-badge">{workspaceBadges[item]}</span> : null}
            </button>
          ))}
        </div>

        <div className="rail-bottom">
          <div className="rail-user-card">
            <div className="rail-user-avatar">{me?.user.name?.slice(0, 1) ?? "U"}</div>
            <div>
              <strong>{me?.user.name ?? "Unknown user"}</strong>
              <span>{currentRole}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="workspace-shell" style={workspaceShellStyle}>
        <main className="workspace-surface" style={workspaceSurfaceStyle}>
          {!isProjectWorkspace ? (
            <header className={`workspace-page-hero workspace-page-hero-${activeView}`}>
              <div className="workspace-page-hero-copy">
                <h1 className="workspace-page-title">{workspaceMeta[activeView].title}</h1>
                <p className="workspace-page-subtitle">{workspaceMeta[activeView].subtitle}</p>
              </div>
            </header>
          ) : null}

          {error ? <div className="banner error">{error}</div> : null}
          {visibleWorkspaceNotice ? <div className="banner notice">{visibleWorkspaceNotice}</div> : null}

          <div
            className={`workspace-page workspace-page-${activeView} workspace-page-open${isProjectWorkspace ? " workspace-page-project-active" : ""}`}
          >
            {renderActiveWorkspace()}
          </div>
        </main>
      </div>
      {renderProjectCreateModal()}
      {renderProjectSettingsModal()}
      {renderHireConfirmModal()}
    </div>
  );
}

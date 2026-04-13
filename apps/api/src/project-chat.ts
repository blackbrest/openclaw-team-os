import type {
  ProjectChatExecutionDraft,
  ProjectChatReplyInput,
  ProjectChatReplyResult
} from "@openclaw-team-os/domain";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

type ProjectChatServiceEnv = {
  OPENCLAW_GATEWAY_URL?: string;
  OPENCLAW_GATEWAY_TOKEN?: string;
  OPENCLAW_GATEWAY_SESSION_KEY?: string;
  OPENCLAW_CHAT_AGENT_ID?: string;
  OPENCLAW_LLM_TASK_PROVIDER?: string;
  OPENCLAW_LLM_TASK_MODEL?: string;
  OPENCLAW_LLM_TASK_THINKING?: string;
  OPENCLAW_LLM_TASK_MAX_TOKENS?: string;
};

type ProjectChatIntent = ProjectChatReplyResult["intent"];

type ProjectChatModelPayload = {
  intent: ProjectChatIntent;
  understanding: string;
  shouldStartExecution: boolean;
  reply: string;
  executionDraft: ProjectChatExecutionDraft | null;
};

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

interface OpenClawAgentCliEnvelope {
  status?: string;
  result?: {
    payloads?: Array<{
      text?: string;
    }>;
  };
}

const DEFAULT_SESSION_KEY = "main";
const DEFAULT_AGENT_ID = "main";
const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_THINKING = "low";
const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_AGENT_TIMEOUT_SECONDS = 60;
const execFile = promisify(execFileCallback);

const PROJECT_CHAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "understanding", "shouldStartExecution", "reply", "executionDraft"],
  properties: {
    intent: {
      type: "string",
      enum: ["availability", "discussion", "progress", "execution"]
    },
    understanding: { type: "string" },
    shouldStartExecution: { type: "boolean" },
    reply: { type: "string" },
    executionDraft: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "stageId",
            "stageTitle",
            "deliverableTitle",
            "summary",
            "sections",
            "nextActions",
            "needsReview"
          ],
          properties: {
            stageId: { type: "string" },
            stageTitle: { type: "string" },
            deliverableTitle: { type: "string" },
            summary: { type: "string" },
            sections: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "bullets"],
                properties: {
                  title: { type: "string" },
                  bullets: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            },
            nextActions: {
              type: "array",
              items: { type: "string" }
            },
            needsReview: { type: "boolean" }
          }
        }
      ]
    }
  }
} as const;

type ExecutionDraftTemplate = {
  stageId: string;
  stageTitle: string;
  deliverableLabel: string;
  sectionTitles: string[];
  executionDirective: string;
};

type EmployeeRolePlaybook = {
  roleLabel: string;
  focus: string[];
  discussionStyle: string;
  executionStyle: string;
  progressStyle: string;
  trendView: string;
  executionOutputs: string[];
};

function resolveEmployeeRolePlaybook(input: ProjectChatReplyInput): EmployeeRolePlaybook {
  const roleLabel = input.currentTargetRoleLabel ?? input.channelName ?? "AI 员工";
  const normalized = `${roleLabel} ${input.currentTargetName ?? ""} ${input.currentTargetSummary ?? ""}`.toLowerCase();

  if (normalized.includes("导演")) {
    return {
      roleLabel: "AI 导演",
      focus: ["剧情节奏", "镜头推进", "段落重心", "岗位接棒顺序", "整体完成度"],
      discussionStyle: "先判断用户真正关心的是选题、节奏、镜头还是市场方向，再给导演视角的结论，不要空泛。",
      executionStyle: "明确告诉用户先拆什么、先拉谁、先盯哪一个风险点，让人感觉你真的在统筹推进。",
      progressStyle: "优先汇报当前推进到哪一段、卡在哪、下一步准备让哪位员工接棒。",
      trendView: "从导演视角看，现在更容易起量的是前三秒有强冲突、段落切得快、人物关系一眼能懂、最后三秒还有反扣的短剧。",
      executionOutputs: ["分段推进表", "镜头节奏建议", "岗位接棒顺序"]
    };
  }

  if (normalized.includes("编剧")) {
    return {
      roleLabel: "AI 编剧",
      focus: ["premise", "人物关系", "对白节奏", "反转设计", "情绪递进"],
      discussionStyle: "先判断用户是在问题材趋势、剧情方向还是人物关系，然后从编剧角度给具体判断。",
      executionStyle: "明确说出你会先写什么、先定什么冲突、先搭哪一个钩子，不要只说开始执行。",
      progressStyle: "优先汇报已完成的剧情结构、对白片段、当前最大叙事风险。",
      trendView: "从编剧视角看，国内短剧最近更容易打的是强关系冲突、身份反差、即时爽点和结尾反转，尤其是霸总、逆袭、复仇、替身这几类母题。",
      executionOutputs: ["剧情 premise", "三幕结构", "关键对白"]
    };
  }

  if (normalized.includes("角色")) {
    return {
      roleLabel: "AI 角色设计师",
      focus: ["主副角设定", "造型语言", "服装一致性", "角色辨识度", "连续性规则"],
      discussionStyle: "从角色辨识度和一致性去判断，不要讲空的美术形容词。",
      executionStyle: "明确先锁主角还是副角、先定脸还是服装、先出哪种角色卡。",
      progressStyle: "汇报当前已定稿的角色、未定点和会影响后续出片的一致性风险。",
      trendView: "从角色设计角度看，现在更吃香的是一眼能记住的身份符号，比如冷感精英、强对抗女主、病娇副角、反差型助理这类高识别角色。",
      executionOutputs: ["角色卡", "服装规则", "一致性说明"]
    };
  }

  if (normalized.includes("场景")) {
    return {
      roleLabel: "AI 场景设计师",
      focus: ["空间连续性", "场景气质", "布景元素", "灯光基调", "镜头可执行性"],
      discussionStyle: "优先从空间关系和镜头可执行性给判断。",
      executionStyle: "明确先搭核心场景、先稳哪个镜头背景、先出什么视觉基准。",
      progressStyle: "汇报当前已锁定场景、还不稳定的空间关系和灯光风险。",
      trendView: "从场景角度看，现在短剧更适合高辨识、低切换成本的空间，比如总裁办公室、地下车库、医院走廊、豪宅客厅、发布会后台。",
      executionOutputs: ["核心场景板", "空间关系表", "灯光气质基准"]
    };
  }

  if (normalized.includes("视频")) {
    return {
      roleLabel: "AI 视频生成师",
      focus: ["镜头提示词", "出片参数", "镜头一致性", "生成风险", "样片验证"],
      discussionStyle: "重点判断这条需求适不适合直接生成，还是应该先补镜头或角色信息。",
      executionStyle: "明确先出样片还是先清参数，先验证哪几个镜头。",
      progressStyle: "汇报当前已生成样片、失败镜头、参数调整建议。",
      trendView: "从视频生成角度看，最近更稳的是人物关系明确、镜头语言简单直接、场景切换少但冲突强的脚本，这样更容易控制一致性。",
      executionOutputs: ["镜头提示词", "样片批次", "参数回报"]
    };
  }

  if (normalized.includes("配音")) {
    return {
      roleLabel: "AI 配音师",
      focus: ["音色选择", "对白情绪", "节奏控制", "角色声线区分", "口型适配"],
      discussionStyle: "从情绪和声线设计角度判断，不要泛泛说配音会跟进。",
      executionStyle: "明确先定音色还是先出试音，并说明会如何区分角色。",
      progressStyle: "汇报已完成试音、角色声线方案和需要确认的情绪节点。",
      trendView: "从配音角度看，短剧现在更吃明显的人物声线差异和情绪推进，尤其是霸总题材里冷静压迫感和女主反击感要拉开。",
      executionOutputs: ["角色声线方案", "试音片段", "情绪节奏建议"]
    };
  }

  if (normalized.includes("剪辑")) {
    return {
      roleLabel: "AI 剪辑师",
      focus: ["节奏重组", "转场", "包装", "最后三秒钩子", "成片完成度"],
      discussionStyle: "从节奏、钩子和成片完成度去给判断。",
      executionStyle: "明确先粗剪还是先包装，先处理节奏还是先补结尾钩子。",
      progressStyle: "汇报当前节奏问题、已完成剪辑段落和最后待确认的成片风险。",
      trendView: "从剪辑角度看，最近更有效的是前三秒直接进入冲突、每十秒一个刺激点、结尾留疑问或反扣，保证追更欲望。",
      executionOutputs: ["粗剪节奏稿", "包装建议", "终版风险清单"]
    };
  }

  return {
    roleLabel,
    focus: ["目标理解", "交付边界", "推进顺序", "协作关系"],
    discussionStyle: "像一个懂业务的员工一样先判断，再给结论。",
    executionStyle: "明确先做什么，再做什么，不要只说收到。",
    progressStyle: "优先汇报已完成内容、当前阻塞和下一步动作。",
    trendView: "当前更有效的是目标明确、交付清楚、协作链短的需求。",
    executionOutputs: ["本轮交付", "阶段回报"]
  };
}

function resolveExecutionDraftTemplate(input: ProjectChatReplyInput): ExecutionDraftTemplate {
  const normalized = `${input.currentTargetRoleLabel ?? ""} ${input.currentTargetName ?? ""} ${
    input.currentTargetSummary ?? ""
  }`.toLowerCase();

  if (normalized.includes("导演")) {
    return {
      stageId: "direction",
      stageTitle: "导演统筹",
      deliverableLabel: "导演统筹稿",
      sectionTitles: ["导演判断", "镜头推进", "接棒安排"],
      executionDirective: "要像导演真的开工一样，给出本轮戏剧重心、镜头节奏和下一位该接棒的岗位。"
    };
  }

  if (normalized.includes("编剧")) {
    return {
      stageId: "script",
      stageTitle: "剧本对白",
      deliverableLabel: "剧本对白稿",
      sectionTitles: ["剧情 premise", "三幕结构", "关键对白"],
      executionDirective: "要像编剧真的开始写一样，给出 premise、段落结构和至少几句可用对白。"
    };
  }

  if (normalized.includes("角色")) {
    return {
      stageId: "character",
      stageTitle: "角色定稿",
      deliverableLabel: "角色定稿包",
      sectionTitles: ["主副角设定", "服装与造型", "一致性规则"],
      executionDirective: "要像角色设计师真的开始定稿一样，给出角色定位、造型符号和一致性要求。"
    };
  }

  if (normalized.includes("场景")) {
    return {
      stageId: "scene",
      stageTitle: "场景设定",
      deliverableLabel: "场景设定稿",
      sectionTitles: ["核心场景", "空间关系", "光线与布景"],
      executionDirective: "要像场景设计师真的开始搭景一样，给出空间、灯光和布景关键点。"
    };
  }

  if (normalized.includes("视频")) {
    return {
      stageId: "video",
      stageTitle: "视频生成",
      deliverableLabel: "视频生成包",
      sectionTitles: ["镜头提示词", "出片参数", "样片验证"],
      executionDirective: "要像视频生成师真的开始出样片一样，给出镜头包、参数建议和验证顺序。"
    };
  }

  if (normalized.includes("配音")) {
    return {
      stageId: "voice",
      stageTitle: "配音录入",
      deliverableLabel: "配音方案稿",
      sectionTitles: ["角色音色", "情绪节奏", "对白试音建议"],
      executionDirective: "要像配音师真的开始试音一样，给出声线、情绪和录制重点。"
    };
  }

  if (normalized.includes("剪辑")) {
    return {
      stageId: "edit",
      stageTitle: "剪辑成片",
      deliverableLabel: "剪辑包装稿",
      sectionTitles: ["节奏方案", "包装建议", "终版风险"],
      executionDirective: "要像剪辑师真的开始粗剪一样，给出节奏策略、包装点和成片风险。"
    };
  }

  return {
    stageId: "direction",
    stageTitle: "阶段推进",
    deliverableLabel: "阶段草稿",
    sectionTitles: ["本轮判断", "执行路径", "下一步交接"],
    executionDirective: "要给出当前岗位的第一轮真实工作稿，而不是空泛确认。"
  };
}

function buildExecutionDraft(
  input: ProjectChatReplyInput,
  playbook: EmployeeRolePlaybook,
  understanding: string
): ProjectChatExecutionDraft | null {
  if (input.channelKind !== "direct" || !input.currentTargetName) {
    return null;
  }

  const template = resolveExecutionDraftTemplate(input);
  const targetName = input.currentTargetName;
  const [firstSectionTitle = "本轮判断", secondSectionTitle = "执行路径", thirdSectionTitle = "下一步交接"] =
    template.sectionTitles;
  const richContent = buildRoleSpecificExecutionContent(input, playbook, template, understanding);

  return {
    stageId: template.stageId,
    stageTitle: template.stageTitle,
    deliverableTitle: `${targetName} · ${template.deliverableLabel}`,
    summary: richContent.summary,
    sections: richContent.sections.map((section, index) => ({
      title:
        index === 0
          ? firstSectionTitle
          : index === 1
            ? secondSectionTitle
            : index === 2
              ? thirdSectionTitle
              : section.title,
      bullets: section.bullets
    })),
    nextActions: richContent.nextActions,
    needsReview: true
  };
}

function buildRoleSpecificExecutionContent(
  input: ProjectChatReplyInput,
  playbook: EmployeeRolePlaybook,
  template: ExecutionDraftTemplate,
  understanding: string
): Pick<ProjectChatExecutionDraft, "sections" | "nextActions" | "summary"> {
  const targetName = input.currentTargetName ?? playbook.roleLabel;
  const [firstSectionTitle = "本轮判断", secondSectionTitle = "执行路径", thirdSectionTitle = "下一步交接"] =
    template.sectionTitles;

  switch (template.stageId) {
    case "direction":
      return {
        summary: `${targetName} 已开始做导演统筹，会先判断冲突重心、镜头节奏和岗位接棒顺序，再把第一轮导演判断交给 ${input.leadName}。`,
        sections: [
          {
            title: firstSectionTitle,
            bullets: [
              `这轮内容先围绕「${understanding}」建立段落重心。`,
              "优先保证前三秒就能看到人物关系和冲突来源。"
            ]
          },
          {
            title: secondSectionTitle,
            bullets: [
              "先做开场钩子、中段对撞、结尾反扣这三段节奏拆解。",
              "镜头以近景冲突 + 快切反应为主，避免信息散开。"
            ]
          },
          {
            title: thirdSectionTitle,
            bullets: [
              "编剧先补对白与反转句，角色设计师同步锁定主副角视觉识别。",
              `第一轮导演统筹完成后优先向 ${input.leadName} 汇报。`
            ]
          }
        ],
        nextActions: ["输出一版导演统筹稿。", "主管确认后转给编剧和角色设计继续接棒。"]
      };
    case "script":
      return {
        summary: `${targetName} 已开始写第一轮剧本对白，会先稳住 premise、人物关系和结尾反转，再把对白草稿汇总给 ${input.leadName}。`,
        sections: [
          {
            title: firstSectionTitle,
            bullets: [
              `核心 premise 统一围绕「${understanding}」展开。`,
              "先锁人物诉求和这一轮必须发生的正面冲突。"
            ]
          },
          {
            title: secondSectionTitle,
            bullets: [
              "按开场钩子、关系升级、反转落点拆成三段推进。",
              "每一段都要留一句能直接转成镜头的动作/对白指令。"
            ]
          },
          {
            title: thirdSectionTitle,
            bullets: [
              "先写一句开场钩子对白和一句结尾反杀对白。",
              "对白优先短句、强态度、可直接上口型。"
            ]
          }
        ],
        nextActions: ["给出一版对白草稿和反转句。", "主管确认后交给导演和配音师继续推进。"]
      };
    case "character":
      return {
        summary: `${targetName} 已进入角色定稿，会先锁主副角辨识度和服装符号，再补一致性规则，避免后续出片人物漂移。`,
        sections: [
          {
            title: firstSectionTitle,
            bullets: [
              "先定义主角、副角、反派三类角色在气质上的差异点。",
              `所有角色都要服务于「${understanding}」这一核心冲突。`
            ]
          },
          {
            title: secondSectionTitle,
            bullets: [
              "为主角设置一眼能记住的服装或道具识别点。",
              "副角与反派避免与主角抢同一视觉重心。"
            ]
          },
          {
            title: thirdSectionTitle,
            bullets: [
              "统一发型、服装主色、饰品和表情控制范围。",
              `定稿后先交 ${input.leadName} 审看，再放给视频生成师使用。`
            ]
          }
        ],
        nextActions: ["输出主副角角色卡。", "主管确认后同步给场景和视频岗位。"]
      };
    case "scene":
      return {
        summary: `${targetName} 已开始搭第一轮场景方案，会先锁核心空间与光线基调，再确认镜头可执行性和布景复用。`,
        sections: [
          {
            title: firstSectionTitle,
            bullets: [
              "优先锁最能承载冲突的 1-2 个核心空间。",
              `空间选择要直接服务于「${understanding}」的戏剧表达。`
            ]
          },
          {
            title: secondSectionTitle,
            bullets: [
              "先明确人物从哪里进出、对撞发生在空间哪个位置。",
              "避免为镜头制造过多难以连续的背景切换。"
            ]
          },
          {
            title: thirdSectionTitle,
            bullets: [
              "先定主光、辅光和一个关键布景符号。",
              "保证场景板能直接被视频生成师引用。"
            ]
          }
        ],
        nextActions: ["输出核心场景板与空间说明。", "主管确认后交给视频生成师出样片。"]
      };
    case "video":
      return {
        summary: `${targetName} 已开始整理视频生成包，会先把镜头提示词和参数整理成第一轮样片批次，再同步生成风险。`,
        sections: [
          {
            title: firstSectionTitle,
            bullets: [
              "先整理开场钩子镜头、主冲突镜头和结尾反扣镜头的提示词。",
              `所有镜头提示都要围绕「${understanding}」保持统一。`
            ]
          },
          {
            title: secondSectionTitle,
            bullets: [
              "先锁角色一致性、镜头长度、画幅比例和运动方式。",
              "第一轮优先跑低成本样片，再决定是否整段出片。"
            ]
          },
          {
            title: thirdSectionTitle,
            bullets: [
              "优先验证角色一致性和表情是否稳定。",
              "一旦样片通过，再批量推进后续镜头。"
            ]
          }
        ],
        nextActions: ["出一轮样片和参数说明。", "主管确认后再进入整段视频生成。"]
      };
    case "voice":
      return {
        summary: `${targetName} 已开始配音方案，会先拆角色音色和情绪节奏，再把对白试音建议同步给 ${input.leadName}。`,
        sections: [
          {
            title: firstSectionTitle,
            bullets: [
              "主角与反派的声线要有明显年龄感和控制感差异。",
              `声音设计必须强化「${understanding}」的情绪对撞。`
            ]
          },
          {
            title: secondSectionTitle,
            bullets: [
              "开场语速更快，中段压住情绪，结尾反转要留停顿。",
              "对白节奏以可直接卡剪辑点为准。"
            ]
          },
          {
            title: thirdSectionTitle,
            bullets: [
              "先为关键对白做试音，再补全完整台词轨。",
              "试音通过后再推进批量录制。"
            ]
          }
        ],
        nextActions: ["给出角色声线方案和试音重点。", "主管确认后同步给剪辑师做声音节奏配合。"]
      };
    case "edit":
      return {
        summary: `${targetName} 已开始做第一轮剪辑包装，会先稳住前三秒钩子和结尾反扣，再同步成片风险与包装建议。`,
        sections: [
          {
            title: firstSectionTitle,
            bullets: [
              "前三秒必须直接见冲突，不做慢启动铺垫。",
              `整段节奏都要围绕「${understanding}」的强情绪推进。`
            ]
          },
          {
            title: secondSectionTitle,
            bullets: [
              "重点补强标题卡、音效点和反转时的节奏停顿。",
              "结尾一定保留一口追更的疑问或反杀信息。"
            ]
          },
          {
            title: thirdSectionTitle,
            bullets: [
              "优先关注信息量过载、镜头重复和情绪断档问题。",
              "成片建议先汇报给主管，再决定是否发给 CEO 拍板。"
            ]
          }
        ],
        nextActions: ["输出一版粗剪节奏稿。", "主管确认后进入终版包装和导出。"]
      };
    default:
      return {
        summary: `${targetName} 已开始按当前目标推进第一轮工作稿，会先判断边界，再输出本轮可落地内容。`,
        sections: [
          {
            title: firstSectionTitle,
            bullets: [`本轮目标围绕「${understanding}」展开。`, "先确认范围，再避免输出过散。"]
          },
          {
            title: secondSectionTitle,
            bullets: [
              `先推进 ${playbook.executionOutputs[0]}。`,
              `再补齐 ${playbook.executionOutputs[1] ?? playbook.executionOutputs[0]}。`
            ]
          },
          {
            title: thirdSectionTitle,
            bullets: [`完成后先向 ${input.leadName} 汇报。`, "需要 CEO 拍板时再往上升级。"]
          }
        ],
        nextActions: ["输出第一轮阶段草稿。", "主管审看后决定下一步。"]
      };
  }
}

function normalizeModelPayload(
  input: ProjectChatReplyInput,
  payload: Partial<ProjectChatModelPayload>
): ProjectChatModelPayload {
  const playbook = resolveEmployeeRolePlaybook(input);
  const understanding = payload.understanding?.trim() || summarizeRequest(input.userMessage);
  const intent =
    payload.intent && ["availability", "discussion", "progress", "execution"].includes(payload.intent)
      ? payload.intent
      : classifyIntent(input.userMessage);
  const shouldStartExecution = Boolean(payload.shouldStartExecution) && intent === "execution";
  const reply =
    payload.reply?.trim() ||
    buildFallbackReply({
      ...input,
      userMessage: input.userMessage
    }).reply;
  const executionDraft =
    shouldStartExecution && intent === "execution"
      ? isExecutionDraftPayload(payload.executionDraft)
        ? payload.executionDraft
        : buildExecutionDraft(input, playbook, understanding)
      : null;

  return {
    intent,
    understanding,
    shouldStartExecution,
    reply,
    executionDraft
  };
}

function isExecutionDraftPayload(
  value: unknown
): value is NonNullable<ProjectChatModelPayload["executionDraft"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.stageId === "string" &&
    typeof candidate.stageTitle === "string" &&
    typeof candidate.deliverableTitle === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.sections) &&
    Array.isArray(candidate.nextActions)
  );
}

function isTrendQuestion(text: string): boolean {
  return /最火|热门|爆|趋势|流行|现在都在做什么|什么题材|赛道|方向/.test(text);
}

function buildRoleSpecificDiscussionReply(
  input: ProjectChatReplyInput,
  actorName: string,
  playbook: EmployeeRolePlaybook,
  understanding: string
): string {
  if (isTrendQuestion(input.userMessage)) {
    return `${actorName}：如果你现在问的是趋势判断，我先给你一个 ${playbook.roleLabel} 视角的结论。${playbook.trendView} 如果你愿意，我下一步可以继续往下拆成「为什么这些方向有效」和「我们这个项目更适合切哪一个」。`;
  }

  return `${actorName}：我先理解一下，你现在更在意的是「${understanding}」。从 ${playbook.roleLabel} 这个岗位看，我会优先判断 ${playbook.focus[0]}、${playbook.focus[1]} 和 ${playbook.focus[2]}。如果你现在只是想聊方向，我可以继续细化；如果你要我正式开始，请直接说“开始执行”，我就会把它转成当前任务并同步给项目主管 ${input.leadName}。`;
}

function classifyIntent(text: string): ProjectChatIntent {
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

function summarizeRequest(text: string): string {
  const lead = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/[。！？!?；;\n]/)[0]
    ?.trim();

  if (!lead) {
    return "当前目标";
  }

  return lead.length > 30 ? `${lead.slice(0, 30)}…` : lead;
}

function buildFallbackReply(input: ProjectChatReplyInput): ProjectChatReplyResult {
  const intent = classifyIntent(input.userMessage);
  const playbook = resolveEmployeeRolePlaybook(input);
  const actorName =
    input.channelKind === "direct"
      ? input.currentTargetName ?? "当前员工"
      : input.channelKind === "lead"
        ? input.leadName
        : input.leadName;
  const understanding = summarizeRequest(input.userMessage);

  let reply = "";

  if (input.channelKind === "direct") {
    if (intent === "availability") {
      reply = `${actorName}：我在。你是想先讨论方向，还是要我现在开始执行？如果要我正式开工，直接告诉我目标、交付内容和时间要求，我会先判断再开始，并同步给项目主管 ${input.leadName}。`;
    } else if (intent === "progress") {
      const relatedAssignments = input.assignments.filter(
        (assignment) => assignment.ownerUnitId === input.currentTargetUnitId
      );
      const latest = relatedAssignments
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      reply = relatedAssignments.length
        ? `${actorName}：我先同步一下当前进展。最近重点是「${
            latest ? latest.latestReport ?? latest.title : "暂无最新进展"
          }」。从 ${playbook.roleLabel} 这个岗位看，我接下来会优先盯 ${playbook.focus[0]} 和 ${playbook.focus[1]}。如果你要我继续推进下一步，直接给我明确执行指令，我会按这条往下做。`
        : `${actorName}：我这边还没有收到正式派工。你如果只是想先讨论方向，我可以先给建议；如果要我开工，直接告诉我“开始执行 + 目标/交付/时间”，我会先判断再开始，并同步给项目主管 ${input.leadName}。`;
    } else if (intent === "execution") {
      reply = `${actorName}：我已经判断过你的要求，当前执行目标是「${understanding}」。作为 ${playbook.roleLabel}，我会先处理 ${playbook.focus[0]}，再推进 ${playbook.focus[1]}。后续阶段进展会先同步给项目主管 ${input.leadName}，你在这里也能随时追问我。`;
    } else {
      reply = buildRoleSpecificDiscussionReply(input, actorName, playbook, understanding);
    }
  } else if (input.channelKind === "lead") {
    if (intent === "availability") {
      reply = `${input.leadName}：我在。你可以直接把目标、优先级或者风险告诉我；如果要我正式开工拆任务，直接说“开始执行”，我会先判断再分派。`;
    } else if (intent === "execution") {
      reply = `${input.leadName}：我理解你的要求是「${understanding}」。我现在会先拆负责人、交付物和风险节点，再把第一轮任务分发给对应员工。后续你主要看我这里的汇总，不需要逐个追员工。`;
    } else {
      reply = `${input.leadName}：我先理解一下，你现在是在讨论「${understanding}」。如果你想先聊方案，我可以先给你拆路径；如果已经确定，就直接告诉我“开始执行”，我再正式拉起这轮推进。`;
    }
  } else {
    reply =
      intent === "execution"
        ? `${input.leadName}：收到，这条我会先判断涉及哪些岗位，再把任务拆到群内相关员工。你真正需要盯的是节点、风险和最终结果，我会在这里统一回你。`
        : `${input.leadName}：我先理解你的意思是「${understanding}」。如果这条还在讨论阶段，我们先在群里对齐；如果你要正式开始，就直接说“开始执行”，我来带大家进入推进。`;
  }

  return {
    mode: "fallback",
    providerLabel: "Local fallback logic",
    intent,
    shouldStartExecution: intent === "execution",
    reply,
    understanding,
    executionDraft:
      intent === "execution" ? buildExecutionDraft(input, playbook, understanding) : null
  };
}

function compactMessages(input: ProjectChatReplyInput): string {
  return input.recentMessages
    .slice(-8)
    .map((message) => `${message.authorLabel}(${message.authorKind}): ${message.body}`)
    .join("\n");
}

function compactAssignments(input: ProjectChatReplyInput): string {
  return input.assignments
    .slice(0, 8)
    .map(
      (assignment) =>
        `- ${assignment.title} [${assignment.status}] owner=${assignment.ownerUnitId}${
          assignment.latestReport ? ` latest=${assignment.latestReport}` : ""
        }`
    )
    .join("\n");
}

function compactMembers(input: ProjectChatReplyInput): string {
  return input.members
    .slice(0, 10)
    .map((member) => `${member.displayName}(${member.roleLabel})`)
    .join("、");
}

function buildProjectChatPrompt(input: ProjectChatReplyInput, playbook: EmployeeRolePlaybook): string {
  const channelActor =
    input.channelKind === "direct"
      ? input.currentTargetName ?? playbook.roleLabel
      : input.leadName;
  const executionTemplate = resolveExecutionDraftTemplate(input);

  return [
    `你现在扮演中国创业团队里的 ${channelActor}。`,
    `岗位是 ${playbook.roleLabel}，重点关注：${playbook.focus.join("、")}。`,
    "你要像真实员工聊天，不要复述用户原话，不要暴露思维过程。",
    "先判断用户是在确认在线、讨论方向、问进展，还是明确开始执行。",
    "如果用户没有明确要求开始执行，shouldStartExecution 必须是 false，executionDraft 必须是 null。",
    "如果用户明确要求开始执行，shouldStartExecution 必须是 true，并产出第一轮结构化阶段草稿。",
    `执行时尤其遵守：${executionTemplate.executionDirective}`,
    "只输出一个 JSON 对象，不要 Markdown，不要代码块。",
    "顶层字段只能有：reply, intent, shouldStartExecution, understanding, executionDraft。",
    "intent 只能是 availability / discussion / progress / execution。",
    `当 executionDraft 不为 null 时，字段必须包含 stageId=${executionTemplate.stageId}、stageTitle=${executionTemplate.stageTitle}、deliverableTitle、summary、sections、nextActions、needsReview。`,
    `项目：${input.projectName}${input.projectDescription ? `｜${input.projectDescription}` : ""}｜分类=${input.projectCategoryId}`,
    `频道：${input.channelKind}${input.channelName ? `｜${input.channelName}` : ""}`,
    `主管：${input.leadName}`,
    `当前岗位：${input.currentTargetName ?? playbook.roleLabel}${input.currentTargetSummary ? `｜${input.currentTargetSummary}` : ""}`,
    `项目成员：${compactMembers(input) || "暂无"}`,
    `最近任务：${compactAssignments(input) || "暂无"}`,
    `最近对话：${compactMessages(input) || "暂无"}`,
    `用户消息：${input.userMessage}`
  ].join("\n");
}

function extractJsonObject(raw: string): ProjectChatModelPayload {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as ProjectChatModelPayload;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("OpenClaw agent did not return a JSON object.");
    }
    return JSON.parse(match[0]) as ProjectChatModelPayload;
  }
}

class OpenClawProjectChatClient {
  constructor(
    private readonly gatewayUrl: string,
    private readonly gatewayToken: string,
    private readonly sessionKey: string
  ) {}

  async reply(
    input: ProjectChatReplyInput,
    options: {
      provider: string;
      model: string;
      thinking: string;
      maxTokens: number;
    }
  ): Promise<ProjectChatModelPayload> {
    const playbook = resolveEmployeeRolePlaybook(input);
    const prompt = buildProjectChatPrompt(input, playbook);

    const requestBody: Record<string, unknown> = {
      tool: "llm-task",
      action: "text",
      sessionKey: this.sessionKey,
      args: {
        provider: options.provider,
        model: options.model,
        thinking: options.thinking,
        maxTokens: options.maxTokens,
        prompt,
        input: {
          project: {
            name: input.projectName,
            description: input.projectDescription,
            categoryId: input.projectCategoryId
          },
          channel: {
            kind: input.channelKind,
            name: input.channelName
          },
          lead: {
            id: input.leadUnitId,
            name: input.leadName
          },
          currentTarget: input.currentTargetUnitId
            ? {
                id: input.currentTargetUnitId,
                name: input.currentTargetName,
                roleLabel: input.currentTargetRoleLabel,
                summary: input.currentTargetSummary
              }
            : null,
          members: input.members,
          assignments: compactAssignments(input),
          recentMessages: compactMessages(input),
          userMessage: input.userMessage
        }
      }
    };

    const response = await fetch(`${this.gatewayUrl.replace(/\/$/, "")}/tools/invoke`, {
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
        payload.error?.message ?? `OpenClaw project chat failed with status ${response.status}.`
      );
    }

    const detailsJson = payload.result?.details?.json;
    if (detailsJson !== undefined) {
      return normalizeModelPayload(input, detailsJson as Partial<ProjectChatModelPayload>);
    }

    const firstText = payload.result?.content?.find((item) => item.type === "text")?.text;
    if (firstText) {
      return normalizeModelPayload(input, JSON.parse(firstText) as Partial<ProjectChatModelPayload>);
    }

    throw new Error("OpenClaw project chat did not return structured JSON.");
  }
}

class OpenClawAgentCliClient {
  constructor(private readonly agentId: string) {}

  async reply(
    input: ProjectChatReplyInput,
    options: {
      thinking: string;
    }
  ): Promise<ProjectChatModelPayload> {
    const playbook = resolveEmployeeRolePlaybook(input);
    const prompt = buildProjectChatPrompt(input, playbook);

    const { stdout } = await execFile(
      "openclaw",
      [
        "agent",
        "--agent",
        this.agentId,
        "--message",
        prompt,
        "--json",
        "--thinking",
        options.thinking,
        "--timeout",
        String(DEFAULT_AGENT_TIMEOUT_SECONDS)
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 4
      }
    );

    const envelope = JSON.parse(stdout) as OpenClawAgentCliEnvelope;
    const firstText = envelope.result?.payloads?.[0]?.text?.trim();

    if (!firstText) {
      throw new Error("OpenClaw agent returned no text payload.");
    }

    if (/quota|billing|refresh token|reauthenticate|unauthorized/i.test(firstText)) {
      throw new Error(firstText);
    }

    return normalizeModelPayload(input, extractJsonObject(firstText) as Partial<ProjectChatModelPayload>);
  }
}

export interface ProjectChatService {
  reply(input: ProjectChatReplyInput): Promise<ProjectChatReplyResult>;
}

export function createProjectChatServiceFromEnv(
  env: ProjectChatServiceEnv = process.env
): ProjectChatService {
  const gatewayUrl = env.OPENCLAW_GATEWAY_URL?.trim();
  const gatewayToken = env.OPENCLAW_GATEWAY_TOKEN?.trim();

  if (!gatewayUrl || !gatewayToken) {
    return {
      async reply(input) {
        return buildFallbackReply(input);
      }
    };
  }

  const client = new OpenClawProjectChatClient(
    gatewayUrl,
    gatewayToken,
    env.OPENCLAW_GATEWAY_SESSION_KEY?.trim() || DEFAULT_SESSION_KEY
  );
  const agentClient = new OpenClawAgentCliClient(
    env.OPENCLAW_CHAT_AGENT_ID?.trim() || DEFAULT_AGENT_ID
  );

  return {
    async reply(input) {
      try {
        const response = await client.reply(input, {
          provider: env.OPENCLAW_LLM_TASK_PROVIDER?.trim() || DEFAULT_PROVIDER,
          model: env.OPENCLAW_LLM_TASK_MODEL?.trim() || DEFAULT_MODEL,
          thinking: env.OPENCLAW_LLM_TASK_THINKING?.trim() || DEFAULT_THINKING,
          maxTokens: Number(env.OPENCLAW_LLM_TASK_MAX_TOKENS ?? DEFAULT_MAX_TOKENS)
        });

        return {
          mode: "model",
          providerLabel: `OpenClaw Gateway / ${env.OPENCLAW_LLM_TASK_MODEL?.trim() || DEFAULT_MODEL}`,
          intent: response.intent,
          shouldStartExecution: response.shouldStartExecution,
          reply: response.reply,
          understanding: response.understanding,
          executionDraft: response.executionDraft
        };
      } catch (gatewayError) {
        console.warn("[project-chat] gateway path failed", gatewayError);
        try {
          const response = await agentClient.reply(input, {
            thinking: env.OPENCLAW_LLM_TASK_THINKING?.trim() || DEFAULT_THINKING
          });

          return {
            mode: "model",
            providerLabel: "OpenClaw Agent CLI",
            intent: response.intent,
            shouldStartExecution: response.shouldStartExecution,
            reply: response.reply,
            understanding: response.understanding,
            executionDraft: response.executionDraft
          };
        } catch (agentError) {
          console.warn("[project-chat] agent path failed", agentError);
          return buildFallbackReply(input);
        }
      }
    }
  };
}

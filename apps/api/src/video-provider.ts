import { ulid } from "ulid";

import type {
  DeliverableVideoHandoff,
  DeliverableVideoScene,
  VideoGenerationClip,
  VideoGenerationClipStatus,
  VideoGenerationSession
} from "@openclaw-team-os/domain";

const DEFAULT_MODELARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const DEFAULT_MODELARK_VIDEO_MODEL = "seedance-1-5-pro-251215";
const DEFAULT_MODELARK_RESOLUTION = "720p";

const DEFAULT_SHORTAPI_BASE_URL = "https://api.shortapi.ai";
const DEFAULT_SHORTAPI_VIDEO_MODEL = "bytedance/seedance-2.0/text-to-video";
const DEFAULT_SHORTAPI_VIDEO_MODE = "std";

type ProviderPayload = Record<string, unknown>;

export interface RemoteVideoProviderStatus {
  ready: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  note?: string;
}

export interface RemoteVideoProvider {
  readonly status: RemoteVideoProviderStatus;
  submitSceneBatch(
    taskId: string,
    deliverableId: string,
    handoff: DeliverableVideoHandoff
  ): Promise<VideoGenerationSession>;
  refreshSession(session: VideoGenerationSession): Promise<VideoGenerationSession>;
}

interface VideoProviderEnv {
  VIDEO_PROVIDER?: string;
  VIDEO_SCENE_LIMIT?: string;
  ARK_API_KEY?: string;
  MODELARK_BASE_URL?: string;
  MODELARK_VIDEO_MODEL?: string;
  MODELARK_VIDEO_RESOLUTION?: string;
  SHORTAPI_KEY?: string;
  SHORTAPI_BASE_URL?: string;
  SHORTAPI_VIDEO_MODEL?: string;
  SHORTAPI_VIDEO_MODE?: string;
  SHORTAPI_CREATE_RETRIES?: string;
  SHORTAPI_CREATE_RETRY_DELAY_MS?: string;
}

interface RemoteTaskDescriptor {
  id: string;
  status?: VideoGenerationClipStatus;
}

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toModelArkClipStatus(providerStatus?: string): VideoGenerationClipStatus {
  switch ((providerStatus ?? "").toLowerCase()) {
    case "queued":
      return "submitted";
    case "running":
      return "processing";
    case "succeeded":
      return "succeeded";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "pending";
  }
}

function sceneDurationToModelDuration(durationSeconds: number): number {
  if (durationSeconds <= 4) {
    return 4;
  }

  if (durationSeconds <= 8) {
    return 5;
  }

  return Math.min(12, durationSeconds);
}

function buildScenePrompt(scene: DeliverableVideoScene, handoff: DeliverableVideoHandoff): string {
  return [
    `请生成一个 ${scene.durationSeconds} 秒的中文竖屏剧情镜头。`,
    `整体风格：${handoff.visualStyle}。`,
    `镜头标题：${scene.title}。`,
    `视觉目标：${scene.visualGoal}。`,
    `镜头提示：${scene.prompt}。`,
    scene.dialogue ? `角色对白：${scene.dialogue}。` : null,
    "保持人物一致、镜头连贯、情绪张力明显，适合后续拼接成 30 秒短剧片段。"
  ]
    .filter(Boolean)
    .join(" ");
}

function parseModelArkError(payload: ProviderPayload | undefined, status: number): string {
  const error = asRecord(payload?.error);
  const message =
    asString(error?.message) ??
    asString(payload?.message) ??
    `ModelArk request failed with status ${status}.`;

  return message;
}

function parseShortApiError(payload: ProviderPayload | undefined, status: number): string {
  const code = asNumber(payload?.code);

  if (code === 3000) {
    return "ShortAPI 当前返回上游服务不稳定（code 3000），当前视频模型暂时不可用，请稍后重试。";
  }

  return (
    asString(payload?.info) ??
    asString(payload?.message) ??
    asString(asRecord(payload?.error)?.message) ??
    `ShortAPI request failed with status ${status}.`
  );
}

function humanizeShortApiModel(model: string): string {
  const normalized = model.toLowerCase();

  if (normalized.includes("seedance-2.0")) {
    return "ShortAPI Seedance 2.0";
  }

  if (normalized.includes("vidu-q3")) {
    return "ShortAPI Vidu Q3";
  }

  if (normalized.includes("veo-3")) {
    return "ShortAPI Veo 3";
  }

  return `ShortAPI ${model}`;
}

function buildShortApiArgs(
  model: string,
  prompt: string,
  handoff: DeliverableVideoHandoff,
  durationSeconds: number,
  mode: string
): Record<string, unknown> {
  const normalized = model.toLowerCase();
  const duration = sceneDurationToModelDuration(durationSeconds);

  if (normalized.includes("vidu/vidu-q3/text-to-video")) {
    return {
      prompt,
      mode,
      duration: String(Math.max(1, duration)),
      aspect_ratio: handoff.aspectRatio,
      resolution: "720p",
      generate_audio: false
    };
  }

  if (normalized.includes("google/veo-3/text-to-video")) {
    const veoDuration = duration <= 4 ? "4" : duration <= 6 ? "6" : "8";

    return {
      prompt,
      mode,
      duration: veoDuration,
      aspect_ratio: handoff.aspectRatio,
      resolution: "720p"
    };
  }

  return {
    prompt,
    duration,
    aspect_ratio: handoff.aspectRatio,
    mode
  };
}

function extractModelArkVideoUrl(payload: ProviderPayload | undefined): string | undefined {
  const content = asRecord(payload?.content);
  return asString(content?.video_url) ?? asString(content?.videoUrl) ?? asString(content?.file_url);
}

function extractModelArkPreviewImageUrl(payload: ProviderPayload | undefined): string | undefined {
  const content = asRecord(payload?.content);
  return asString(content?.last_frame_url) ?? asString(content?.lastFrameUrl);
}

function findFirstUrl(
  value: unknown,
  matcher: (key: string, url: string) => boolean,
  fallbackMatcher?: (url: string) => boolean,
  keyPath = ""
): string | undefined {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      const key = keyPath.split(".").at(-1) ?? "";

      if (matcher(key, value) || (fallbackMatcher ? fallbackMatcher(value) : false)) {
        return value;
      }
    }

    return undefined;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findFirstUrl(item, matcher, fallbackMatcher, `${keyPath}[${index}]`);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  for (const [key, nested] of Object.entries(record)) {
    const nextPath = keyPath ? `${keyPath}.${key}` : key;
    const found = findFirstUrl(nested, matcher, fallbackMatcher, nextPath);

    if (found) {
      return found;
    }
  }

  return undefined;
}

function extractShortApiVideoUrl(payload: ProviderPayload | undefined): string | undefined {
  const data = asRecord(payload?.data) ?? payload;

  return (
    findFirstUrl(
      data,
      (key, url) =>
        /video|file|media|play|result|output|src|oss/i.test(key) &&
        /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(url),
      (url) => /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(url)
    ) ?? findFirstUrl(data, (key) => /video|play|media/i.test(key))
  );
}

function extractShortApiPreviewImageUrl(payload: ProviderPayload | undefined): string | undefined {
  const data = asRecord(payload?.data) ?? payload;

  return findFirstUrl(
    data,
    (key, url) =>
      /cover|poster|thumb|image|frame|preview/i.test(key) &&
      /\.(png|jpe?g|webp)(\?|$)/i.test(url),
    (url) => /\.(png|jpe?g|webp)(\?|$)/i.test(url)
  );
}

function deriveSessionStatus(clips: VideoGenerationClip[]): VideoGenerationSession["status"] {
  if (clips.length === 0) {
    return "idle";
  }

  const statuses = new Set(clips.map((clip) => clip.status));

  if (statuses.size === 1 && statuses.has("succeeded")) {
    return "completed";
  }

  if (statuses.has("processing")) {
    return "processing";
  }

  if (statuses.has("submitted") || statuses.has("pending")) {
    return "submitted";
  }

  if (statuses.has("failed") && statuses.has("succeeded")) {
    return "partial";
  }

  if (statuses.has("failed")) {
    return "failed";
  }

  return "submitted";
}

function toVideoGenerationClip(
  clip: Omit<VideoGenerationClip, "providerTaskId" | "videoUrl" | "previewImageUrl" | "errorMessage"> & {
    providerTaskId?: string | undefined;
    videoUrl?: string | undefined;
    previewImageUrl?: string | undefined;
    errorMessage?: string | undefined;
  }
): VideoGenerationClip {
  return {
    id: clip.id,
    sceneId: clip.sceneId,
    sceneTitle: clip.sceneTitle,
    prompt: clip.prompt,
    durationSeconds: clip.durationSeconds,
    ...(clip.providerTaskId ? { providerTaskId: clip.providerTaskId } : {}),
    status: clip.status,
    ...(clip.videoUrl ? { videoUrl: clip.videoUrl } : {}),
    ...(clip.previewImageUrl ? { previewImageUrl: clip.previewImageUrl } : {}),
    ...(clip.errorMessage ? { errorMessage: clip.errorMessage } : {}),
    createdAt: clip.createdAt,
    updatedAt: clip.updatedAt
  };
}

abstract class BaseRemoteVideoProvider implements RemoteVideoProvider {
  abstract readonly status: RemoteVideoProviderStatus;

  protected abstract assertReady(): void;
  protected getScenesToSubmit(handoff: DeliverableVideoHandoff): DeliverableVideoScene[] {
    return handoff.scenes;
  }
  protected abstract createTask(
    prompt: string,
    handoff: DeliverableVideoHandoff,
    durationSeconds: number
  ): Promise<RemoteTaskDescriptor>;
  protected abstract getTask(taskId: string): Promise<ProviderPayload>;
  protected abstract toClipStatus(payload: ProviderPayload): VideoGenerationClipStatus;
  protected abstract extractVideoUrl(payload: ProviderPayload): string | undefined;
  protected abstract extractPreviewImageUrl(payload: ProviderPayload): string | undefined;
  protected abstract extractErrorMessage(payload: ProviderPayload): string | undefined;

  async submitSceneBatch(
    taskId: string,
    deliverableId: string,
    handoff: DeliverableVideoHandoff
  ): Promise<VideoGenerationSession> {
    this.assertReady();

    const createdAt = nowIso();
    const clips: VideoGenerationClip[] = [];
    const scenes = this.getScenesToSubmit(handoff);

    for (const scene of scenes) {
      const prompt = buildScenePrompt(scene, handoff);
      const remoteTask = await this.createTask(prompt, handoff, scene.durationSeconds);

      clips.push(
        toVideoGenerationClip({
          id: ulid(),
          sceneId: scene.id,
          sceneTitle: scene.title,
          prompt,
          durationSeconds: scene.durationSeconds,
          providerTaskId: remoteTask.id,
          status: remoteTask.status ?? "submitted",
          createdAt,
          updatedAt: createdAt
        })
      );
    }

    return {
      id: ulid(),
      taskId,
      deliverableId,
      provider: this.status.provider,
      providerModel: this.status.model,
      mode: "scene_batch",
      status: deriveSessionStatus(clips),
      note: `已把 ${clips.length} 个分镜提交到 ${this.status.model}，等待回传视频片段。`,
      createdAt,
      updatedAt: createdAt,
      submittedAt: createdAt,
      clips
    };
  }

  async refreshSession(session: VideoGenerationSession): Promise<VideoGenerationSession> {
    this.assertReady();

    const refreshedClips = await Promise.all(
      session.clips.map(async (clip) => {
        if (!clip.providerTaskId || clip.status === "succeeded" || clip.status === "failed") {
          return clip;
        }

        const payload = await this.getTask(clip.providerTaskId);
        const nextStatus = this.toClipStatus(payload);

        return toVideoGenerationClip({
          id: clip.id,
          sceneId: clip.sceneId,
          sceneTitle: clip.sceneTitle,
          prompt: clip.prompt,
          durationSeconds: clip.durationSeconds,
          ...(clip.providerTaskId ? { providerTaskId: clip.providerTaskId } : {}),
          status: nextStatus,
          ...(this.extractVideoUrl(payload) ? { videoUrl: this.extractVideoUrl(payload) } : {}),
          ...(this.extractPreviewImageUrl(payload)
            ? { previewImageUrl: this.extractPreviewImageUrl(payload) }
            : {}),
          ...(this.extractErrorMessage(payload)
            ? { errorMessage: this.extractErrorMessage(payload) }
            : {}),
          createdAt: clip.createdAt,
          updatedAt: nowIso()
        });
      })
    );

    const status = deriveSessionStatus(refreshedClips);
    const updatedAt = nowIso();

    return {
      ...session,
      status,
      updatedAt,
      note:
        status === "completed"
          ? "全部分镜片段都已回传，可以开始拼接成完整短剧。"
          : status === "failed"
            ? "视频生成失败，请检查配额、模型可用性或提示词。"
            : "视频任务仍在生成中，可以稍后刷新状态。",
      ...(status === "completed" ? { completedAt: updatedAt } : {}),
      clips: refreshedClips
    };
  }
}

export class ModelArkVideoProvider extends BaseRemoteVideoProvider {
  readonly status: RemoteVideoProviderStatus;
  private readonly apiKey: string | undefined;
  private readonly resolution: string;

  constructor(env: VideoProviderEnv = process.env) {
    super();

    this.apiKey = env.ARK_API_KEY?.trim();
    this.resolution = env.MODELARK_VIDEO_RESOLUTION?.trim() || DEFAULT_MODELARK_RESOLUTION;
    const baseUrl = env.MODELARK_BASE_URL?.trim() || DEFAULT_MODELARK_BASE_URL;
    const model = env.MODELARK_VIDEO_MODEL?.trim() || DEFAULT_MODELARK_VIDEO_MODEL;

    this.status = {
      ready: Boolean(this.apiKey),
      provider: "ModelArk Video",
      model,
      baseUrl
    };

    if (!this.apiKey) {
      this.status.note = "ARK_API_KEY is not configured, so remote video generation is unavailable.";
    }
  }

  protected assertReady(): void {
    if (!this.apiKey) {
      throw new Error("ARK_API_KEY is required before remote video generation can start.");
    }
  }

  protected async createTask(
    prompt: string,
    handoff: DeliverableVideoHandoff,
    durationSeconds: number
  ): Promise<RemoteTaskDescriptor> {
    const response = await fetch(`${this.status.baseUrl.replace(/\/$/, "")}/contents/generations/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.status.model,
        content: [
          {
            type: "text",
            text: prompt
          }
        ],
        ratio: handoff.aspectRatio,
        resolution: this.resolution,
        duration: sceneDurationToModelDuration(durationSeconds),
        camera_fixed: true,
        watermark: false
      })
    });

    const payload = (await response.json().catch(() => ({}))) as ProviderPayload;

    if (!response.ok) {
      throw new Error(parseModelArkError(payload, response.status));
    }

    const taskId = asString(payload.id);

    if (!taskId) {
      throw new Error("ModelArk create task response did not include a task id.");
    }

    return {
      id: taskId,
      status: toModelArkClipStatus(asString(payload.status))
    };
  }

  protected async getTask(taskId: string): Promise<ProviderPayload> {
    const response = await fetch(
      `${this.status.baseUrl.replace(/\/$/, "")}/contents/generations/tasks/${taskId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }
    );

    const payload = (await response.json().catch(() => ({}))) as ProviderPayload;

    if (!response.ok) {
      throw new Error(parseModelArkError(payload, response.status));
    }

    return payload;
  }

  protected toClipStatus(payload: ProviderPayload): VideoGenerationClipStatus {
    return toModelArkClipStatus(asString(payload.status));
  }

  protected extractVideoUrl(payload: ProviderPayload): string | undefined {
    return extractModelArkVideoUrl(payload);
  }

  protected extractPreviewImageUrl(payload: ProviderPayload): string | undefined {
    return extractModelArkPreviewImageUrl(payload);
  }

  protected extractErrorMessage(payload: ProviderPayload): string | undefined {
    return asString(asRecord(payload.error)?.message);
  }
}

export class ShortApiVideoProvider extends BaseRemoteVideoProvider {
  readonly status: RemoteVideoProviderStatus;
  private readonly apiKey: string | undefined;
  private readonly mode: string;
  private readonly createRetries: number;
  private readonly retryDelayMs: number;
  private readonly sceneLimit: number | undefined;
  private readonly model: string;

  constructor(env: VideoProviderEnv = process.env) {
    super();

    this.apiKey = env.SHORTAPI_KEY?.trim();
    const model = env.SHORTAPI_VIDEO_MODEL?.trim() || DEFAULT_SHORTAPI_VIDEO_MODEL;
    this.model = model;
    this.mode =
      env.SHORTAPI_VIDEO_MODE?.trim() ||
      (model.toLowerCase().includes("vidu/vidu-q3/text-to-video") ? "pro" : DEFAULT_SHORTAPI_VIDEO_MODE);
    this.createRetries = Math.max(1, Math.min(8, asNumber(env.SHORTAPI_CREATE_RETRIES) ?? 4));
    this.retryDelayMs = Math.max(
      1000,
      Math.min(30000, asNumber(env.SHORTAPI_CREATE_RETRY_DELAY_MS) ?? 4000)
    );
    this.sceneLimit = asNumber(env.VIDEO_SCENE_LIMIT);
    const baseUrl = env.SHORTAPI_BASE_URL?.trim() || DEFAULT_SHORTAPI_BASE_URL;

    this.status = {
      ready: Boolean(this.apiKey),
      provider: humanizeShortApiModel(model),
      model,
      baseUrl
    };

    if (!this.apiKey) {
      this.status.note = "SHORTAPI_KEY is not configured, so ShortAPI video generation is unavailable.";
    }
  }

  protected assertReady(): void {
    if (!this.apiKey) {
      throw new Error("SHORTAPI_KEY is required before ShortAPI video generation can start.");
    }
  }

  protected getScenesToSubmit(handoff: DeliverableVideoHandoff): DeliverableVideoScene[] {
    if (!this.sceneLimit || this.sceneLimit <= 0) {
      return handoff.scenes;
    }

    return handoff.scenes.slice(0, this.sceneLimit);
  }

  protected async createTask(
    prompt: string,
    handoff: DeliverableVideoHandoff,
    durationSeconds: number
  ): Promise<RemoteTaskDescriptor> {
    let lastError = "ShortAPI create task failed.";

    for (let attempt = 1; attempt <= this.createRetries; attempt += 1) {
      const response = await fetch(`${this.status.baseUrl.replace(/\/$/, "")}/api/v1/job/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          args: buildShortApiArgs(this.model, prompt, handoff, durationSeconds, this.mode)
        })
      });

      const payload = (await response.json().catch(() => ({}))) as ProviderPayload;
      const code = asNumber(payload.code);

      if (response.ok && (code === undefined || code === 0)) {
        const data = asRecord(payload.data) ?? payload;
        const taskId = asString(data.job_id) ?? asString(data.id);

        if (!taskId) {
          throw new Error("ShortAPI create task response did not include a job id.");
        }

        return {
          id: taskId,
          status: "submitted"
        };
      }

      lastError = parseShortApiError(payload, response.status);

      if (code === 3000 && attempt < this.createRetries) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
        continue;
      }

      throw new Error(lastError);
    }

    throw new Error(lastError);
  }

  protected async getTask(taskId: string): Promise<ProviderPayload> {
    const response = await fetch(
      `${this.status.baseUrl.replace(/\/$/, "")}/api/v1/job/query?id=${encodeURIComponent(taskId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }
    );

    const payload = (await response.json().catch(() => ({}))) as ProviderPayload;

    if (!response.ok || asNumber(payload.code) === 1) {
      throw new Error(parseShortApiError(payload, response.status));
    }

    return payload;
  }

  protected toClipStatus(payload: ProviderPayload): VideoGenerationClipStatus {
    const data = asRecord(payload.data) ?? payload;
    const numericStatus = asNumber(data.status);
    const stringStatus = asString(data.status);
    const videoUrl = extractShortApiVideoUrl(payload);
    const errorMessage = this.extractErrorMessage(payload);

    if (videoUrl) {
      return "succeeded";
    }

    if (errorMessage) {
      return "failed";
    }

    if (stringStatus) {
      switch (stringStatus.toLowerCase()) {
        case "queued":
        case "submitted":
          return "submitted";
        case "processing":
        case "running":
        case "pending":
          return "processing";
        case "succeeded":
        case "success":
        case "completed":
        case "done":
          return "succeeded";
        case "failed":
        case "error":
        case "cancelled":
          return "failed";
        default:
          return "processing";
      }
    }

    switch (numericStatus) {
      case 0:
        return "pending";
      case 1:
        return "processing";
      case 2:
        return "succeeded";
      case 3:
      case 4:
        return "failed";
      default:
        return "processing";
    }
  }

  protected extractVideoUrl(payload: ProviderPayload): string | undefined {
    return extractShortApiVideoUrl(payload);
  }

  protected extractPreviewImageUrl(payload: ProviderPayload): string | undefined {
    return extractShortApiPreviewImageUrl(payload);
  }

  protected extractErrorMessage(payload: ProviderPayload): string | undefined {
    const data = asRecord(payload.data) ?? payload;

    return (
      asString(data.error) ??
      asString(asRecord(data.error)?.message) ??
      asString(payload.info) ??
      asString(payload.message)
    );
  }
}

export function createRemoteVideoProviderFromEnv(
  env: VideoProviderEnv = process.env
): RemoteVideoProvider {
  const explicitProvider = env.VIDEO_PROVIDER?.trim().toLowerCase();
  const hasShortApi = Boolean(env.SHORTAPI_KEY?.trim());
  const hasModelArk = Boolean(env.ARK_API_KEY?.trim());

  if (explicitProvider === "shortapi") {
    return new ShortApiVideoProvider(env);
  }

  if (explicitProvider === "modelark") {
    return new ModelArkVideoProvider(env);
  }

  if (hasShortApi) {
    return new ShortApiVideoProvider(env);
  }

  if (hasModelArk) {
    return new ModelArkVideoProvider(env);
  }

  return new ShortApiVideoProvider(env);
}

export function summarizeShortApiSkill(): {
  model: string;
  createEndpoint: string;
  queryEndpoint: string;
  requiredArgs: string[];
  optionalArgs: string[];
} {
  return {
    model: DEFAULT_SHORTAPI_VIDEO_MODEL,
    createEndpoint: `${DEFAULT_SHORTAPI_BASE_URL}/api/v1/job/create`,
    queryEndpoint: `${DEFAULT_SHORTAPI_BASE_URL}/api/v1/job/query?id=$JOB_ID`,
    requiredArgs: ["prompt"],
    optionalArgs: ["mode", "duration", "aspect_ratio"]
  };
}

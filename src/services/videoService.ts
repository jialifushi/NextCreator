import { invoke } from "@tauri-apps/api/core";
import type { VideoGenerationParams, VideoGenerationResponse } from "@/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { isTauriEnvironment } from "@/services/fileStorageService";
import { toast } from "@/stores/toastStore";

// 任务阶段类型
export type VideoTaskStage = "queued" | "in_progress" | "completed" | "failed";

// 进度回调参数
export interface VideoProgressInfo {
  progress: number;
  stage: VideoTaskStage;
  taskId: string;
}

// Tauri 后端请求参数
interface TauriVideoCreateParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  seconds?: string;
  size?: string;
  inputImage?: string;  // base64
}

interface TauriVideoStatusParams {
  baseUrl: string;
  apiKey: string;
  taskId: string;
}

// Tauri 后端响应
interface TauriVideoTaskResult {
  success: boolean;
  taskId?: string;
  status?: string;
  progress?: number;
  error?: string;
}

interface TauriVideoContentResult {
  success: boolean;
  videoData?: string;  // base64
  error?: string;
}

// 获取 API 配置
function getApiConfig() {
  const { settings } = useSettingsStore.getState();
  const providerId = settings.nodeProviders.videoGenerator;

  if (!providerId) {
    throw new Error("请先在供应商管理中配置视频节点的供应商");
  }

  const provider = settings.providers.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error("供应商不存在，请重新配置");
  }

  if (!provider.apiKey) {
    throw new Error("供应商 API Key 未配置");
  }

  // 视频服务直接使用 baseUrl，移除末尾斜杠即可
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");

  return {
    apiKey: provider.apiKey,
    baseUrl,
  };
}

// 创建视频生成任务
export async function createVideoTask(params: VideoGenerationParams): Promise<VideoGenerationResponse> {
  try {
    // 检查是否在 Tauri 环境
    if (!isTauriEnvironment()) {
      return { error: "此功能仅在桌面应用中可用" };
    }

    const { apiKey, baseUrl } = getApiConfig();

    const tauriParams: TauriVideoCreateParams = {
      baseUrl,
      apiKey,
      model: params.model,
      prompt: params.prompt,
      seconds: params.seconds,
      size: params.size,
      inputImage: params.inputImage,
    };

    console.log("[videoService] Creating video task via Tauri backend...");
    const result = await invoke<TauriVideoTaskResult>("video_create_task", { params: tauriParams });

    if (!result.success) {
      return { error: result.error || "创建任务失败" };
    }

    return {
      taskId: result.taskId,
      status: result.status as VideoGenerationResponse["status"],
      progress: result.progress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建视频任务失败";
    return { error: message };
  }
}

// 获取视频任务状态
export async function getVideoTaskStatus(taskId: string): Promise<VideoGenerationResponse> {
  try {
    // 检查是否在 Tauri 环境
    if (!isTauriEnvironment()) {
      return { error: "此功能仅在桌面应用中可用" };
    }

    const { apiKey, baseUrl } = getApiConfig();

    const tauriParams: TauriVideoStatusParams = {
      baseUrl,
      apiKey,
      taskId,
    };

    const result = await invoke<TauriVideoTaskResult>("video_get_status", { params: tauriParams });

    if (!result.success) {
      return { error: result.error || "获取状态失败" };
    }

    return {
      taskId: result.taskId,
      status: result.status as VideoGenerationResponse["status"],
      progress: result.progress,
      error: result.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取任务状态失败";
    return { error: message };
  }
}

// 获取视频内容 URL（不下载完整内容，返回可播放的 URL）
// 注意：由于走后端代理，此函数不再适用，使用 getVideoContentBlobUrl 代替
export function getVideoContentUrl(taskId: string): string {
  const { baseUrl } = getApiConfig();
  // 返回占位 URL，实际使用 getVideoContentBlobUrl
  return `${baseUrl}/v1/videos/${taskId}/content`;
}

// 获取视频内容并创建 Blob URL（用于预览）
export async function getVideoContentBlobUrl(taskId: string): Promise<{ url?: string; error?: string }> {
  try {
    // 检查是否在 Tauri 环境
    if (!isTauriEnvironment()) {
      return { error: "此功能仅在桌面应用中可用" };
    }

    const { apiKey, baseUrl } = getApiConfig();

    const tauriParams: TauriVideoStatusParams = {
      baseUrl,
      apiKey,
      taskId,
    };

    console.log("[videoService] Fetching video content via Tauri backend...");
    const result = await invoke<TauriVideoContentResult>("video_get_content", { params: tauriParams });

    if (!result.success || !result.videoData) {
      return { error: result.error || "获取视频失败" };
    }

    // 将 base64 转换为 Blob URL
    const byteCharacters = atob(result.videoData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    return { url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取视频内容失败";
    return { error: message };
  }
}

// 下载视频文件
export async function downloadVideo(taskId: string, filename?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 检查是否在 Tauri 环境
    if (!isTauriEnvironment()) {
      return { success: false, error: "此功能仅在桌面应用中可用" };
    }

    const { apiKey, baseUrl } = getApiConfig();
    const defaultFileName = filename || `sora-video-${Date.now()}.mp4`;

    const tauriParams: TauriVideoStatusParams = {
      baseUrl,
      apiKey,
      taskId,
    };

    console.log("[videoService] Downloading video via Tauri backend...");
    const result = await invoke<TauriVideoContentResult>("video_get_content", { params: tauriParams });

    if (!result.success || !result.videoData) {
      const errorMsg = result.error || "下载视频失败";
      toast.error(`下载失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    // 将 base64 转换为 Uint8Array
    const byteCharacters = atob(result.videoData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const bytes = new Uint8Array(byteNumbers);

    // 使用 Tauri 保存对话框
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      defaultPath: defaultFileName,
      filters: [{ name: "视频", extensions: ["mp4", "webm", "mov"] }],
    });

    if (filePath) {
      await writeFile(filePath, bytes);
      toast.success(`视频已保存到: ${filePath.split("/").pop()}`);
      return { success: true };
    } else {
      // 用户取消了保存
      return { success: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "下载视频失败";
    toast.error(`下载失败: ${message}`);
    return { success: false, error: message };
  }
}

// 轮询任务状态直到完成
export async function pollVideoTask(
  taskId: string,
  onProgress?: (info: VideoProgressInfo) => void,
  maxAttempts: number = 120, // 最多轮询 10 分钟（5秒间隔）
  interval: number = 5000
): Promise<VideoGenerationResponse> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const statusResult = await getVideoTaskStatus(taskId);

    if (statusResult.error) {
      return statusResult;
    }

    const stage = statusResult.status as VideoTaskStage;

    onProgress?.({
      progress: statusResult.progress || 0,
      stage,
      taskId,
    });

    if (stage === "completed") {
      // 任务完成，返回 taskId 供后续获取视频内容
      return {
        taskId,
        status: "completed",
        progress: 100,
      };
    }

    if (stage === "failed") {
      return { error: statusResult.error || "视频生成失败" };
    }

    // 等待后继续轮询
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  return { error: "任务超时，请稍后重试" };
}

// 完整的视频生成流程
export async function generateVideo(
  params: VideoGenerationParams,
  onProgress?: (info: VideoProgressInfo) => void
): Promise<VideoGenerationResponse> {
  // 1. 创建任务
  const createResult = await createVideoTask(params);

  if (createResult.error || !createResult.taskId) {
    return { error: createResult.error || "创建任务失败" };
  }

  const taskId = createResult.taskId;

  onProgress?.({
    progress: 0,
    stage: "queued",
    taskId,
  });

  // 2. 轮询等待完成
  return await pollVideoTask(taskId, onProgress);
}

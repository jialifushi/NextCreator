import { invoke } from "@tauri-apps/api/core";
import type { LLMModelType, Provider } from "@/types";
import { useSettingsStore } from "@/stores/settingsStore";

// LLM 节点类型
type LLMNodeType = "llm" | "llmContent";

// 检测是否在 Tauri 环境中
const isTauri = () => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// LLM 生成参数
export interface LLMGenerationParams {
  prompt: string;
  model: LLMModelType;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  files?: Array<{ data: string; mimeType: string; fileName?: string }>; // 文件数据（base64）
  responseJsonSchema?: Record<string, unknown>; // 结构化输出的 JSON Schema
}

// LLM 响应
export interface LLMResponse {
  content?: string;
  error?: string;
}

// Tauri 后端请求参数
interface TauriLLMParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  files?: Array<{ data: string; mimeType: string; fileName?: string }>; // 文件数据（base64）
  responseJsonSchema?: Record<string, unknown>; // 结构化输出的 JSON Schema
}

// Tauri 后端响应
interface TauriLLMResult {
  success: boolean;
  content?: string;
  error?: string;
}

// 获取供应商配置
function getProviderConfig(nodeType: LLMNodeType) {
  const { settings } = useSettingsStore.getState();
  const providerId = settings.nodeProviders[nodeType];

  if (!providerId) {
    throw new Error(`请先在供应商管理中配置 ${nodeType === "llm" ? "PPT 内容生成" : "LLM 内容生成"}节点的供应商`);
  }

  const provider = settings.providers.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error("供应商不存在，请重新配置");
  }

  if (!provider.apiKey) {
    throw new Error("供应商 API Key 未配置");
  }

  return provider;
}

// 根据协议获取对应的 Tauri 命令名称
function getCommandByProtocol(protocol: string): string {
  switch (protocol) {
    case "google":
      return "gemini_generate_text";
    case "openai":
      return "openai_chat_completion";
    case "claude":
      return "claude_chat_completion";
    default:
      return "gemini_generate_text";
  }
}

// 根据协议获取正确的 baseUrl
function getBaseUrlByProtocol(baseUrl: string, protocol: string): string {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  switch (protocol) {
    case "google":
      return cleanUrl + "/v1beta";
    case "openai":
    case "claude":
      return cleanUrl;  // OpenAI 和 Claude 的 Rust 后端会自动添加 /v1
    default:
      return cleanUrl + "/v1beta";
  }
}

// 通过 Tauri 后端代理发送 LLM 请求
async function invokeLLMByProtocol(params: TauriLLMParams, provider: Provider): Promise<LLMResponse> {
  const protocol = provider.protocol || "google";
  const command = getCommandByProtocol(protocol);

  console.log(`[llmService] invokeLLMByProtocol called, protocol: ${protocol}, command: ${command}`);

  try {
    const startTime = Date.now();
    const result = await invoke<TauriLLMResult>(command, { params });
    const elapsed = Date.now() - startTime;

    console.log("[llmService] Tauri backend response received in", elapsed, "ms");

    if (!result.success) {
      return { error: result.error || "请求失败" };
    }

    return { content: result.content };
  } catch (error) {
    console.error("[llmService] Tauri invoke error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

// 文本生成（PPT 内容生成节点使用）
export async function generateText(params: LLMGenerationParams): Promise<LLMResponse> {
  try {
    const provider = getProviderConfig("llm");

    // 检查是否在 Tauri 环境
    if (!isTauri()) {
      return { error: "此功能仅在桌面应用中可用" };
    }

    const baseUrl = getBaseUrlByProtocol(provider.baseUrl, provider.protocol || "google");
    const requestParams: TauriLLMParams = {
      baseUrl,
      apiKey: provider.apiKey,
      model: params.model,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      files: params.files,
      responseJsonSchema: params.responseJsonSchema,
    };

    return await invokeLLMByProtocol(requestParams, provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败";
    return { error: message };
  }
}

// LLM 内容生成（LLM 内容生成节点使用）
export async function generateLLMContent(params: LLMGenerationParams): Promise<LLMResponse> {
  try {
    const provider = getProviderConfig("llmContent");

    // 检查是否在 Tauri 环境
    if (!isTauri()) {
      return { error: "此功能仅在桌面应用中可用" };
    }

    const baseUrl = getBaseUrlByProtocol(provider.baseUrl, provider.protocol || "google");
    const requestParams: TauriLLMParams = {
      baseUrl,
      apiKey: provider.apiKey,
      model: params.model,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      files: params.files,
      responseJsonSchema: params.responseJsonSchema,
    };

    return await invokeLLMByProtocol(requestParams, provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败";
    return { error: message };
  }
}

// 验证 JSON 输出
export function validateJsonOutput(content: string): { valid: boolean; data?: unknown; error?: string } {
  try {
    const data = JSON.parse(content);
    return { valid: true, data };
  } catch {
    return { valid: false, error: "输出不是有效的 JSON 格式" };
  }
}

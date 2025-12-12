import { invoke } from "@tauri-apps/api/core";
import type { LLMModelType } from "@/types";
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
  onStream?: (chunk: string) => void; // 流式回调
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

// 通过 Tauri 后端代理发送请求
async function invokeLLM(params: TauriLLMParams): Promise<LLMResponse> {
  console.log("[llmService] invokeLLM called, sending to Tauri backend...");

  try {
    const startTime = Date.now();
    const result = await invoke<TauriLLMResult>("gemini_generate_text", { params });
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

// 通过 HTTP 直接请求 Gemini API（仅用于浏览器端）
async function fetchLLMDirect(params: TauriLLMParams, onStream?: (chunk: string) => void): Promise<LLMResponse> {
  try {
    const baseUrl = params.baseUrl || "https://generativelanguage.googleapis.com/v1beta";

    // 构建 parts 数组
    type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
    const parts: Part[] = [];

    // 添加文本内容
    if (params.systemPrompt) {
      parts.push({ text: `系统指令：${params.systemPrompt}\n\n用户请求：${params.prompt}` });
    } else {
      parts.push({ text: params.prompt });
    }

    // 添加文件内容（base64）
    if (params.files && params.files.length > 0) {
      for (const file of params.files) {
        parts.push({
          inline_data: {
            mime_type: file.mimeType,
            data: file.data,
          },
        });
      }
    }

    // 构建请求体
    const contents: Array<{ role: string; parts: Part[] }> = [
      {
        role: "user",
        parts,
      },
    ];

    // 构建生成配置
    const generationConfig: Record<string, unknown> = {};
    if (params.temperature !== undefined) {
      generationConfig.temperature = params.temperature;
    }
    if (params.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = params.maxTokens;
    }
    // 结构化输出配置
    if (params.responseJsonSchema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = params.responseJsonSchema;
    }

    // 如果有流式回调，使用流式 API
    if (onStream) {
      const url = `${baseUrl}/models/${params.model}:streamGenerateContent?alt=sse&key=${params.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          generationConfig: Object.keys(generationConfig).length > 0 ? generationConfig : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        return { error: errorMessage };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return { error: "无法读取响应流" };
      }

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === "[DONE]") continue;
            try {
              const data = JSON.parse(jsonStr);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                fullContent += text;
                onStream(fullContent);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      return { content: fullContent };
    }

    // 非流式请求
    const url = `${baseUrl}/models/${params.model}:generateContent?key=${params.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        generationConfig: Object.keys(generationConfig).length > 0 ? generationConfig : undefined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      return { error: errorMessage };
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) {
      return { error: "无有效响应" };
    }

    let content = "";
    for (const part of candidate.content.parts) {
      if (part.text) {
        content += part.text;
      }
    }

    return { content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败";
    return { error: message };
  }
}

// 文本生成（PPT 内容生成节点使用）
export async function generateText(params: LLMGenerationParams): Promise<LLMResponse> {
  try {
    const provider = getProviderConfig("llm");

    const requestParams: TauriLLMParams = {
      baseUrl: provider.baseUrl || "https://generativelanguage.googleapis.com/v1beta",
      apiKey: provider.apiKey,
      model: params.model,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      files: params.files,
      responseJsonSchema: params.responseJsonSchema,
    };

    // 在 Tauri 环境中使用后端代理
    if (isTauri()) {
      return await invokeLLM(requestParams);
    }

    // Web 环境使用直接请求
    return await fetchLLMDirect(requestParams, params.onStream);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败";
    return { error: message };
  }
}

// LLM 内容生成（LLM 内容生成节点使用）
export async function generateLLMContent(params: LLMGenerationParams): Promise<LLMResponse> {
  try {
    const provider = getProviderConfig("llmContent");

    const requestParams: TauriLLMParams = {
      baseUrl: provider.baseUrl || "https://generativelanguage.googleapis.com/v1beta",
      apiKey: provider.apiKey,
      model: params.model,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      files: params.files,
    };

    // 在 Tauri 环境中使用后端代理（不支持流式）
    if (isTauri()) {
      return await invokeLLM(requestParams);
    }

    // Web 环境使用直接请求（支持流式）
    return await fetchLLMDirect(requestParams, params.onStream);
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

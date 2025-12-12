import { memo, useCallback, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { MessageSquareText, Play, AlertCircle, Copy, Check, ChevronDown, ChevronUp, FileUp, Eye, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useFlowStore } from "@/stores/flowStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { generateLLMContent } from "@/services/llmService";
import { useLoadingDots } from "@/hooks/useLoadingDots";
import type { LLMContentNodeData } from "@/types";

// 定义节点类型
type LLMContentNode = Node<LLMContentNodeData>;

// 预设模型选项
const presetModels = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
];

export const LLMContentNode = memo(({ id, data, selected }: NodeProps<LLMContentNode>) => {
  const { updateNodeData, getConnectedInputData, getConnectedFilesWithInfo } = useFlowStore();
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [showFullPreview, setShowFullPreview] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 省略号加载动画
  const dots = useLoadingDots(data.status === "loading");

  // 保存生成时的画布 ID
  const canvasIdRef = useRef<string | null>(null);

  // 检查是否是自定义模型
  const isCustomModel = !presetModels.some((m) => m.value === data.model);

  /**
   * 更新节点数据，同时更新 canvasStore
   */
  const updateNodeDataWithCanvas = useCallback(
    (nodeId: string, nodeData: Partial<LLMContentNodeData>) => {
      const { activeCanvasId } = useCanvasStore.getState();
      const targetCanvasId = canvasIdRef.current;

      // 始终更新 flowStore
      updateNodeData<LLMContentNodeData>(nodeId, nodeData);

      // 如果目标画布不是当前活跃画布，也需要更新 canvasStore
      if (targetCanvasId && targetCanvasId !== activeCanvasId) {
        const canvasStore = useCanvasStore.getState();
        const canvas = canvasStore.canvases.find((c) => c.id === targetCanvasId);

        if (canvas) {
          const updatedNodes = canvas.nodes.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                data: { ...node.data, ...nodeData },
              };
            }
            return node;
          });

          useCanvasStore.setState((state) => ({
            canvases: state.canvases.map((c) =>
              c.id === targetCanvasId ? { ...c, nodes: updatedNodes, updatedAt: Date.now() } : c
            ),
          }));
        }
      }
    },
    [updateNodeData]
  );

  // 执行生成（支持流式）
  const handleGenerate = useCallback(async () => {
    const { prompt, files } = getConnectedInputData(id);
    const { activeCanvasId } = useCanvasStore.getState();

    // 记录当前画布 ID
    canvasIdRef.current = activeCanvasId;

    if (!prompt && files.length === 0) {
      updateNodeDataWithCanvas(id, {
        status: "error",
        error: "请连接提示词节点或文件上传节点",
      });
      return;
    }

    updateNodeDataWithCanvas(id, {
      status: "loading",
      error: undefined,
      outputContent: "",
    });

    try {
      const response = await generateLLMContent({
        prompt: prompt || "请分析这个文件的内容",
        model: data.model,
        systemPrompt: data.systemPrompt || undefined,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        files: files.length > 0 ? files : undefined,
        onStream: (content) => {
          // 流式更新内容
          updateNodeDataWithCanvas(id, {
            outputContent: content,
          });
        },
      });

      if (response.content) {
        updateNodeDataWithCanvas(id, {
          status: "success",
          outputContent: response.content,
          error: undefined,
        });
      } else if (response.error) {
        updateNodeDataWithCanvas(id, {
          status: "error",
          error: response.error,
        });
      } else {
        updateNodeDataWithCanvas(id, {
          status: "error",
          error: "未返回内容",
        });
      }
    } catch {
      updateNodeDataWithCanvas(id, {
        status: "error",
        error: "生成失败",
      });
    }
  }, [id, data.model, data.systemPrompt, data.temperature, data.maxTokens, updateNodeDataWithCanvas, getConnectedInputData]);

  // 复制内容
  const handleCopy = useCallback(() => {
    if (data.outputContent) {
      navigator.clipboard.writeText(data.outputContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data.outputContent]);

  // 选择预设模型
  const handleSelectModel = (value: string) => {
    updateNodeData<LLMContentNodeData>(id, { model: value });
    setShowModelDropdown(false);
    setCustomModel("");
  };

  // 使用自定义模型
  const handleCustomModelSubmit = () => {
    if (customModel.trim()) {
      updateNodeData<LLMContentNodeData>(id, { model: customModel.trim() });
      setShowModelDropdown(false);
    }
  };

  // 获取显示的模型名称
  const getDisplayModelName = () => {
    const preset = presetModels.find((m) => m.value === data.model);
    return preset ? preset.label : data.model;
  };

  return (
    <div
      className={`
        w-[320px] rounded-xl bg-base-100 shadow-lg border-2 transition-all
        ${selected ? "border-primary shadow-primary/20" : "border-base-300"}
      `}
    >
      {/* 输入端口 - prompt 类型 */}
      <Handle
        type="target"
        position={Position.Left}
        id="input-prompt"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
        style={{ top: "30%" }}
      />

      {/* 输入端口 - file 类型 */}
      <Handle
        type="target"
        position={Position.Left}
        id="input-file"
        className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white"
        style={{ top: "70%" }}
      />

      {/* 节点头部 */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-t-lg">
        <div className="flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-white" />
          <span className="text-sm font-medium text-white">{data.label}</span>
        </div>
        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white">LLM</span>
      </div>

      {/* 节点内容 */}
      <div className="p-3 space-y-3 nodrag">
        {/* 已连接文件指示器 */}
        {(() => {
          const connectedFiles = getConnectedFilesWithInfo(id);
          if (connectedFiles.length === 0) return null;
          return (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-orange-500/10 rounded-lg">
              <FileUp className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs text-orange-600">
                {connectedFiles.length} 个文件已连接
              </span>
            </div>
          );
        })()}

        {/* 模型选择 - 优化样式 */}
        <div className="relative" ref={dropdownRef}>
          <label className="text-xs text-base-content/60 mb-1 block">模型</label>
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 bg-base-200 hover:bg-base-300 rounded-lg text-sm transition-colors border border-base-300"
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className={isCustomModel ? "text-primary font-medium" : ""}>
              {getDisplayModelName()}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showModelDropdown ? "rotate-180" : ""}`} />
          </button>

          {/* 下拉菜单 */}
          {showModelDropdown && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-lg shadow-xl overflow-hidden">
              {/* 预设模型 */}
              {presetModels.map((model) => (
                <button
                  key={model.value}
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-base-200 transition-colors flex items-center justify-between ${
                    data.model === model.value ? "bg-primary/10 text-primary" : ""
                  }`}
                  onClick={() => handleSelectModel(model.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span>{model.label}</span>
                  {data.model === model.value && <Check className="w-4 h-4" />}
                </button>
              ))}

              {/* 分隔线 */}
              <div className="border-t border-base-300 my-1" />

              {/* 自定义模型输入 */}
              <div className="p-2">
                <label className="text-xs text-base-content/60 mb-1 block">自定义模型</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    className="input input-sm input-bordered flex-1 text-sm"
                    placeholder="输入模型名称..."
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCustomModelSubmit();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleCustomModelSubmit}
                    onPointerDown={(e) => e.stopPropagation()}
                    disabled={!customModel.trim()}
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 系统提示词 */}
        <div>
          <label className="text-xs text-base-content/60 mb-1 block">系统提示词</label>
          <textarea
            className="textarea textarea-bordered w-full h-16 text-sm resize-none"
            placeholder="可选：设置 AI 角色或行为..."
            value={data.systemPrompt || ""}
            onChange={(e) =>
              updateNodeData<LLMContentNodeData>(id, {
                systemPrompt: e.target.value,
              })
            }
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        {/* 高级设置折叠 */}
        <div>
          <button
            className="btn btn-ghost btn-xs w-full justify-between"
            onClick={() => setShowSettings(!showSettings)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="text-xs text-base-content/60">高级设置</span>
            {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showSettings && (
            <div className="space-y-3 mt-2 p-3 bg-base-200 rounded-lg">
              {/* Temperature */}
              <div>
                <label className="text-xs text-base-content/60 mb-1 block">
                  温度: {data.temperature.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={data.temperature}
                  onChange={(e) =>
                    updateNodeData<LLMContentNodeData>(id, {
                      temperature: parseFloat(e.target.value),
                    })
                  }
                  className="range range-xs range-primary"
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>

              {/* Max Tokens */}
              <div>
                <label className="text-xs text-base-content/60 mb-1 block">最大输出 Tokens</label>
                <input
                  type="number"
                  className="input input-sm input-bordered w-full"
                  value={data.maxTokens}
                  min={100}
                  max={65536}
                  step={100}
                  onChange={(e) =>
                    updateNodeData<LLMContentNodeData>(id, {
                      maxTokens: parseInt(e.target.value) || 8192,
                    })
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
        </div>

        {/* 生成按钮 */}
        <button
          className={`btn btn-sm w-full gap-2 ${data.status === "loading" ? "btn-disabled" : "btn-primary"}`}
          onClick={handleGenerate}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={data.status === "loading"}
        >
          {data.status === "loading" ? (
            <span>生成中{dots}</span>
          ) : (
            <>
              <Play className="w-4 h-4" />
              生成内容
            </>
          )}
        </button>

        {/* 错误信息 */}
        {data.status === "error" && data.error && (
          <div className="flex items-center gap-2 text-error text-xs">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{data.error}</span>
          </div>
        )}

        {/* 输出内容预览 - 简洁摘要，点击查看详情 */}
        {data.outputContent && (
          <div
            className="bg-base-200 rounded-lg p-3 cursor-pointer hover:bg-base-300 transition-colors"
            onClick={() => setShowFullPreview(true)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* 摘要文字，限制3行 */}
            <p className="text-sm text-base-content line-clamp-3 mb-2">
              {data.outputContent.replace(/[#*`>\-\[\]]/g, '').slice(0, 200)}
            </p>
            {/* 查看详情按钮 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-base-content/50">
                {data.outputContent.length > 200 ? `${data.outputContent.length} 字符` : ''}
              </span>
              <div className="flex items-center gap-1 text-xs text-primary">
                <Eye className="w-3 h-3" />
                <span>查看详情</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 输出端口 - prompt 类型（可连接到其他节点的提示词输入） */}
      <Handle
        type="source"
        position={Position.Right}
        id="output-prompt"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />

      {/* 全屏预览弹窗 - 使用 Portal 渲染到 body */}
      {showFullPreview && data.outputContent && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onClick={() => setShowFullPreview(false)}
        >
          <div
            className="bg-base-100 rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-base-300 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquareText className="w-5 h-5 text-primary" />
                <span className="font-medium">内容预览</span>
                <span className="text-xs text-base-content/50 ml-2">
                  {data.model}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-ghost btn-sm gap-1"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  <span className="text-xs">{copied ? "已复制" : "复制"}</span>
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-circle"
                  onClick={() => setShowFullPreview(false)}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* 弹窗内容 */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-base max-w-none">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                    h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4">{children}</h3>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1.5">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    code: ({ children, className }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                      ) : (
                        <code className="block bg-base-200 p-4 rounded-lg text-sm font-mono overflow-x-auto">{children}</code>
                      );
                    },
                    pre: ({ children }) => <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto mb-4">{children}</pre>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-primary pl-4 italic opacity-80 my-4">{children}</blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="table table-zebra w-full">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => <th className="bg-base-200 font-bold">{children}</th>,
                    td: ({ children }) => <td>{children}</td>,
                  }}
                >
                  {data.outputContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

LLMContentNode.displayName = "LLMContentNode";

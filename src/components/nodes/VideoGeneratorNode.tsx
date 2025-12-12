import { memo, useCallback, useState, useEffect } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Video, Play, AlertCircle, Square, Download, Clock, CheckCircle2, Eye } from "lucide-react";
import { useFlowStore } from "@/stores/flowStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { createVideoTask, getVideoContentBlobUrl, downloadVideo, type VideoTaskStage } from "@/services/videoService";
import { taskManager } from "@/services/taskManager";
import { useLoadingDots } from "@/hooks/useLoadingDots";
import type { VideoGeneratorNodeData, VideoModelType } from "@/types";

// 定义节点类型
type VideoGeneratorNode = Node<VideoGeneratorNodeData>;

// 时长选项
const secondsOptions = [
  { value: "5", label: "5 秒" },
  { value: "10", label: "10 秒" },
  { value: "15", label: "15 秒" },
  { value: "20", label: "20 秒" },
];

// 任务阶段配置
const stageConfig: Record<VideoTaskStage, { label: string; color: string; icon: React.ComponentType<{ className?: string }> | null }> = {
  queued: { label: "排队中", color: "text-warning", icon: Clock },
  in_progress: { label: "生成中", color: "text-info", icon: null }, // 使用文字动画
  completed: { label: "已完成", color: "text-success", icon: CheckCircle2 },
  failed: { label: "失败", color: "text-error", icon: AlertCircle },
};

export const VideoGeneratorNode = memo(({ id, data, selected }: NodeProps<VideoGeneratorNode>) => {
  const { updateNodeData, getConnectedInputData } = useFlowStore();
  const activeCanvasId = useCanvasStore((state) => state.activeCanvasId);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // 省略号加载动画
  const dots = useLoadingDots(data.status === "loading" || previewState === "loading");

  const model: VideoModelType = "sora-2";

  // 清理函数 - 清理预览 URL
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // 打开预览（加载视频并显示弹窗）
  const handleOpenPreview = useCallback(async () => {
    if (!data.taskId || previewState === "loading") return;

    setPreviewState("loading");
    setPreviewError(null);

    const result = await getVideoContentBlobUrl(data.taskId);

    if (result.url) {
      setPreviewUrl(result.url);
      setPreviewState("ready");
    } else {
      setPreviewError(result.error || "加载视频失败");
      setPreviewState("idle");
    }
  }, [data.taskId, previewState]);

  // 关闭预览（卸载视频释放内存）
  const handleClosePreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewState("idle");
    setPreviewError(null);
  }, [previewUrl]);

  const handleGenerate = useCallback(async () => {
    const { prompt, images } = getConnectedInputData(id);
    // Sora 只支持单张图片输入，取第一张
    const image = images[0];

    if (!prompt) {
      updateNodeData<VideoGeneratorNodeData>(id, {
        status: "error",
        error: "请连接提示词节点",
      });
      return;
    }

    if (!activeCanvasId) {
      updateNodeData<VideoGeneratorNodeData>(id, {
        status: "error",
        error: "画布未初始化",
      });
      return;
    }

    // 清理旧的预览
    handleClosePreview();

    // 重置状态
    updateNodeData<VideoGeneratorNodeData>(id, {
      status: "loading",
      error: undefined,
      progress: 0,
      taskId: undefined,
      taskStage: "queued",
    });

    try {
      // 1. 创建任务
      const createResult = await createVideoTask({
        prompt,
        model,
        seconds: data.seconds,
        inputImage: image,
      });

      if (createResult.error || !createResult.taskId) {
        updateNodeData<VideoGeneratorNodeData>(id, {
          status: "error",
          error: createResult.error || "创建任务失败",
          taskStage: "failed",
        });
        return;
      }

      const taskId = createResult.taskId;

      // 更新节点的 taskId
      updateNodeData<VideoGeneratorNodeData>(id, {
        taskId,
        taskStage: "queued",
      });

      // 2. 注册到全局任务管理器，由管理器负责轮询和状态同步
      taskManager.registerVideoTask(taskId, id, activeCanvasId);

    } catch {
      updateNodeData<VideoGeneratorNodeData>(id, {
        status: "error",
        error: "生成失败",
        taskStage: "failed",
      });
    }
  }, [id, model, data.seconds, activeCanvasId, updateNodeData, getConnectedInputData, handleClosePreview]);

  const handleStop = useCallback(() => {
    // 取消任务管理器中的任务
    if (activeCanvasId) {
      taskManager.cancelTask(id, activeCanvasId);
    }
    updateNodeData<VideoGeneratorNodeData>(id, {
      status: "idle",
      error: undefined,
      progress: 0,
      taskStage: undefined,
    });
  }, [id, activeCanvasId, updateNodeData]);

  const handleDownload = useCallback(async () => {
    if (!data.taskId) return;
    await downloadVideo(data.taskId);
  }, [data.taskId]);

  // 获取当前阶段配置
  const currentStage = data.taskStage ? stageConfig[data.taskStage] : null;
  const StageIcon = currentStage?.icon;

  // 节点样式配置
  const headerGradient = "bg-gradient-to-r from-cyan-500 to-blue-500";
  const outputHandleColor = "!bg-blue-500";

  return (
    <>
      <div
        className={`
          w-[220px] rounded-xl bg-base-100 shadow-lg border-2 transition-all
          ${selected ? "border-primary shadow-primary/20" : "border-base-300"}
        `}
      >
        {/* 输入端口 - prompt 类型（上方） */}
        <Handle
          type="target"
          position={Position.Left}
          id="input-prompt"
          style={{ top: "30%" }}
          className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
        />
        {/* 输入端口 - image 类型（下方） */}
        <Handle
          type="target"
          position={Position.Left}
          id="input-image"
          style={{ top: "70%" }}
          className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
        />

        {/* 节点头部 */}
        <div className={`flex items-center justify-between px-3 py-2 ${headerGradient} rounded-t-lg`}>
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-white" />
            <span className="text-sm font-medium text-white">{data.label}</span>
          </div>
          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white">SORA</span>
        </div>

        {/* 节点内容 */}
        <div className="p-2 space-y-2 nodrag">
          {/* 配置选项 */}
          <div>
            <label className="text-xs text-base-content/60 mb-0.5 block">视频时长</label>
            <div className="flex gap-1">
              {secondsOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`
                    btn btn-xs flex-1
                    ${ (data.seconds || "10") === opt.value
                      ? "btn-info"
                      : "btn-ghost bg-base-200"
                    }
                  `}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateNodeData<VideoGeneratorNodeData>(id, {
                      seconds: opt.value as VideoGeneratorNodeData["seconds"],
                    });
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 任务状态显示 */}
          {data.status === "loading" && currentStage && (
            <div className="space-y-2">
              {/* 阶段状态 */}
              <div className={`flex items-center gap-2 text-xs ${currentStage.color}`}>
                {data.taskStage === "in_progress" ? (
                  <span className="font-medium">生成中{dots}</span>
                ) : StageIcon ? (
                  <>
                    <StageIcon className="w-3.5 h-3.5" />
                    <span className="font-medium">{currentStage.label}</span>
                  </>
                ) : (
                  <span className="font-medium">{currentStage.label}</span>
                )}
                {data.taskId && (
                  <span className="text-base-content/40 text-[10px] ml-auto truncate max-w-[80px]">
                    {data.taskId}
                  </span>
                )}
              </div>

              {/* 进度条 */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-base-content/60">
                  <span>进度</span>
                  <span>{data.progress || 0}%</span>
                </div>
                <progress
                  className={`progress w-full h-2 ${
                    data.taskStage === "queued" ? "progress-warning" : "progress-info"
                  }`}
                  value={data.progress || 0}
                  max="100"
                />
              </div>
            </div>
          )}

          {/* 生成/停止按钮 */}
          {data.status === "loading" ? (
            <button
              className="btn btn-sm btn-error w-full gap-2"
              onClick={handleStop}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Square className="w-4 h-4" />
              停止生成
            </button>
          ) : (
            <button
              className="btn btn-sm btn-info w-full gap-2"
              onClick={handleGenerate}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Play className="w-4 h-4" />
              生成视频
            </button>
          )}

          {/* 错误信息 */}
          {data.status === "error" && data.error && (
            <div className="flex items-center gap-2 text-error text-xs">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{data.error}</span>
            </div>
          )}

          {/* 视频完成后的操作区域 */}
          {data.status === "success" && (
            <div className="space-y-2">
              {/* 完成状态提示 */}
              <div className="flex items-center gap-2 text-xs text-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-medium">视频生成完成</span>
              </div>

              {/* 预览加载错误 */}
              {previewError && (
                <div className="flex items-center gap-2 text-error text-xs">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{previewError}</span>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  className={`btn btn-xs btn-outline flex-1 gap-1 ${previewState === "loading" ? "btn-disabled" : ""}`}
                  onClick={handleOpenPreview}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={previewState === "loading"}
                >
                  {previewState === "loading" ? (
                    <span>加载中{dots}</span>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" />
                      预览
                    </>
                  )}
                </button>
                <button
                  className="btn btn-xs btn-outline flex-1 gap-1"
                  onClick={handleDownload}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Download className="w-3 h-3" />
                  下载
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 输出端口 - video 类型 */}
        <Handle
          type="source"
          position={Position.Right}
          id="output-video"
          className={`!w-3 !h-3 ${outputHandleColor} !border-2 !border-white`}
        />
      </div>

      {/* 预览弹窗 */}
      {previewState === "ready" && previewUrl && (
        <VideoPreviewModal
          videoUrl={previewUrl}
          taskId={data.taskId}
          onClose={handleClosePreview}
        />
      )}
    </>
  );
});

VideoGeneratorNode.displayName = "VideoGeneratorNode";

// 视频预览弹窗组件
interface VideoPreviewModalProps {
  videoUrl: string;
  taskId?: string;
  onClose: () => void;
}

function VideoPreviewModal({ videoUrl, taskId, onClose }: VideoPreviewModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const downloadDots = useLoadingDots(isDownloading);

  // 进入动画
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // 关闭时先播放退出动画
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // 处理 ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // 下载视频
  const handleDownload = useCallback(async () => {
    if (!taskId || isDownloading) return;

    setIsDownloading(true);
    await downloadVideo(taskId);
    setIsDownloading(false);
  }, [taskId, isDownloading]);

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center
        transition-all duration-200 ease-out
        ${isVisible && !isClosing ? "bg-black/80" : "bg-black/0"}
      `}
      onClick={handleClose}
    >
      <div
        className={`
          relative max-w-4xl max-h-[90vh] p-4
          transition-all duration-200 ease-out
          ${isVisible && !isClosing
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-4"
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <video
          src={videoUrl}
          className="max-w-full max-h-[80vh] rounded-lg"
          controls
          autoPlay
        />
        <div className="flex justify-center gap-2 mt-4">
          <button
            className={`btn btn-sm btn-primary gap-2 ${isDownloading ? "btn-disabled" : ""}`}
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <span>下载中{downloadDots}</span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                下载视频
              </>
            )}
          </button>
          <button className="btn btn-sm" onClick={handleClose}>
            关闭
          </button>
        </div>
        {/* 提示信息 */}
        <p
          className={`
            text-center text-xs text-white/50 mt-2
            transition-all duration-200 ease-out
            ${isVisible && !isClosing ? "opacity-100" : "opacity-0"}
          `}
        >
          点击背景、按 ESC 或关闭按钮关闭窗口
        </p>
      </div>
    </div>
  );
}

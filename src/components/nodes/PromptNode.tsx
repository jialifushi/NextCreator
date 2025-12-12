import { memo, useState, useRef } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { useFlowStore } from "@/stores/flowStore";
import type { PromptNodeData } from "@/types";

// 定义节点类型
type PromptNode = Node<PromptNodeData>;

// 提示词输入节点
export const PromptNode = memo(({ id, data, selected }: NodeProps<PromptNode>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);

  // 使用本地状态管理输入，避免 IME 输入问题
  const [localPrompt, setLocalPrompt] = useState(data.prompt || "");
  const isComposingRef = useRef(false);

  return (
    <div
      className={`
        min-w-[280px] rounded-xl bg-base-100 shadow-lg border-2 transition-all
        ${selected ? "border-primary shadow-primary/20" : "border-base-300"}
      `}
    >
      {/* 节点头部 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-t-lg">
        <MessageSquare className="w-4 h-4 text-white" />
        <span className="text-sm font-medium text-white">{data.label}</span>
      </div>

      {/* 节点内容 */}
      <div className="p-3 nodrag">
        <textarea
          className="textarea textarea-bordered w-full min-h-[100px] text-sm resize-none focus:outline-none focus:border-primary"
          placeholder="输入提示词描述..."
          value={localPrompt}
          onChange={(e) => {
            setLocalPrompt(e.target.value);
            // 仅在非 IME 组合状态时更新 store
            if (!isComposingRef.current) {
              updateNodeData<PromptNodeData>(id, { prompt: e.target.value });
            }
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            // IME 输入完成后，同步到 store
            updateNodeData<PromptNodeData>(id, { prompt: e.currentTarget.value });
          }}
          onBlur={() => {
            // 失焦时确保数据同步
            updateNodeData<PromptNodeData>(id, { prompt: localPrompt });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>

      {/* 输出端口 - prompt 类型 */}
      <Handle
        type="source"
        position={Position.Right}
        id="output-prompt"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
});

PromptNode.displayName = "PromptNode";

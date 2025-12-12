import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { CustomNode, CustomEdge, ImageGeneratorNodeData, ImageInputNodeData } from "@/types";
import { tauriStorage } from "@/utils/tauriStorage";
import { readImage, isTauriEnvironment } from "@/services/fileStorageService";

// 画布数据结构
export interface CanvasData {
  id: string;
  name: string;
  nodes: CustomNode[];
  edges: CustomEdge[];
  createdAt: number;
  updatedAt: number;
}

// 侧边栏视图类型
export type SidebarView = "canvases" | "nodes";

interface CanvasStore {
  // 画布列表
  canvases: CanvasData[];
  // 当前激活的画布 ID
  activeCanvasId: string | null;
  // 侧边栏当前视图
  sidebarView: SidebarView;

  // 画布操作
  createCanvas: (name?: string) => string;
  deleteCanvas: (id: string) => void;
  renameCanvas: (id: string, name: string) => void;
  switchCanvas: (id: string) => void;
  duplicateCanvas: (id: string) => string;

  // 更新当前画布的节点和边
  updateCanvasData: (nodes: CustomNode[], edges: CustomEdge[]) => void;

  // 获取当前画布
  getActiveCanvas: () => CanvasData | null;

  // 侧边栏视图切换
  setSidebarView: (view: SidebarView) => void;
}

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set, get) => ({
      canvases: [],
      activeCanvasId: null,
      sidebarView: "canvases",

      createCanvas: (name) => {
        const id = uuidv4();
        const now = Date.now();
        const canvasCount = get().canvases.length;
        const newCanvas: CanvasData = {
          id,
          name: name || `画布 ${canvasCount + 1}`,
          nodes: [],
          edges: [],
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          canvases: [...state.canvases, newCanvas],
          activeCanvasId: id,
        }));

        return id;
      },

      deleteCanvas: (id) => {
        const { canvases, activeCanvasId } = get();
        const filtered = canvases.filter((c) => c.id !== id);

        // 如果删除的是当前画布，切换到另一个画布
        let newActiveId = activeCanvasId;
        if (activeCanvasId === id) {
          newActiveId = filtered.length > 0 ? filtered[0].id : null;
        }

        set({
          canvases: filtered,
          activeCanvasId: newActiveId,
        });
      },

      renameCanvas: (id, name) => {
        set((state) => ({
          canvases: state.canvases.map((c) =>
            c.id === id ? { ...c, name, updatedAt: Date.now() } : c
          ),
        }));
      },

      switchCanvas: (id) => {
        set({ activeCanvasId: id });
      },

      duplicateCanvas: (id) => {
        const canvas = get().canvases.find((c) => c.id === id);
        if (!canvas) return "";

        const newId = uuidv4();
        const now = Date.now();
        const newCanvas: CanvasData = {
          ...canvas,
          id: newId,
          name: `${canvas.name} (副本)`,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          canvases: [...state.canvases, newCanvas],
          activeCanvasId: newId,
        }));

        return newId;
      },

      updateCanvasData: (nodes, edges) => {
        const { activeCanvasId } = get();
        if (!activeCanvasId) return;

        set((state) => ({
          canvases: state.canvases.map((c) =>
            c.id === activeCanvasId
              ? { ...c, nodes, edges, updatedAt: Date.now() }
              : c
          ),
        }));
      },

      getActiveCanvas: () => {
        const { canvases, activeCanvasId } = get();
        return canvases.find((c) => c.id === activeCanvasId) || null;
      },

      setSidebarView: (view) => {
        set({ sidebarView: view });
      },
    }),
    {
      name: "next-creator-canvases",
      storage: createJSONStorage(() => tauriStorage),
      partialize: (state) => {
        // 在 Tauri 环境中，清除有文件路径的节点的 base64 数据以减少存储大小
        // 在浏览器环境中，保留所有数据
        if (!isTauriEnvironment()) {
          return {
            canvases: state.canvases,
            activeCanvasId: state.activeCanvasId,
          };
        }

        const canvasesForStorage = state.canvases.map((canvas) => ({
          ...canvas,
          nodes: canvas.nodes.map((node) => {
            // 图片生成节点：有文件路径时清理 base64
            if (
              (node.type === "imageGeneratorProNode" ||
                node.type === "imageGeneratorFastNode") &&
              (node.data as ImageGeneratorNodeData).outputImagePath
            ) {
              return {
                ...node,
                data: {
                  ...node.data,
                  outputImage: undefined,
                },
              };
            }

            // 图片输入节点：有文件路径时同樣只持久化路徑
            if (
              node.type === "imageInputNode" &&
              (node.data as ImageInputNodeData).imagePath
            ) {
              return {
                ...node,
                data: {
                  ...node.data,
                  imageData: undefined,
                },
              };
            }

            return node;
          }),
        }));

        return {
          canvases: canvasesForStorage,
          activeCanvasId: state.activeCanvasId,
        };
      },
      onRehydrateStorage: () => async (state) => {
        // 在加载后，从文件恢复图片数据
        if (!state || !isTauriEnvironment()) return;

        const updatedCanvases = await Promise.all(
          state.canvases.map(async (canvas) => {
            const updatedNodes = await Promise.all(
              canvas.nodes.map(async (node) => {
                // 图片生成节点：如有文件路径且缺失 base64，從文件恢復
                if (
                  (node.type === "imageGeneratorProNode" ||
                    node.type === "imageGeneratorFastNode") &&
                  (node.data as ImageGeneratorNodeData).outputImagePath &&
                  !(node.data as ImageGeneratorNodeData).outputImage
                ) {
                  try {
                    const path = (node.data as ImageGeneratorNodeData).outputImagePath!;
                    const imageData = await readImage(path);
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        outputImage: imageData,
                      },
                    };
                  } catch {
                    console.warn("从文件恢复图片失败:", node.id);
                    return node;
                  }
                }

                // 图片输入节点：如有文件路径且缺失 base64，從文件恢復
                if (
                  node.type === "imageInputNode" &&
                  (node.data as ImageInputNodeData).imagePath &&
                  !(node.data as ImageInputNodeData).imageData
                ) {
                  try {
                    const path = (node.data as ImageInputNodeData).imagePath!;
                    const imageData = await readImage(path);
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        imageData,
                      },
                    };
                  } catch {
                    console.warn("从文件恢复图片失败:", node.id);
                    return node;
                  }
                }

                return node;
              })
            );

            return {
              ...canvas,
              nodes: updatedNodes,
            };
          })
        );

        // 更新状态
        useCanvasStore.setState({ canvases: updatedCanvases as CanvasData[] });
      },
    }
  )
);

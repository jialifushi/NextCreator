import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppSettings, SettingsState, Provider, NodeProviderMapping } from "@/types";
import { tauriStorage } from "@/utils/tauriStorage";

// 默认设置
const defaultSettings: AppSettings = {
  providers: [],
  nodeProviders: {},
  theme: "light",
};

interface SettingsStore extends SettingsState {
  // 基础设置
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
  openSettings: () => void;
  closeSettings: () => void;

  // 供应商 CRUD
  addProvider: (provider: Omit<Provider, "id">) => string;
  updateProvider: (id: string, updates: Partial<Omit<Provider, "id">>) => void;
  removeProvider: (id: string) => void;
  getProviderById: (id: string) => Provider | undefined;

  // 节点供应商映射
  setNodeProvider: (nodeType: keyof NodeProviderMapping, providerId: string | undefined) => void;
  getNodeProvider: (nodeType: keyof NodeProviderMapping) => Provider | undefined;

  // 供应商面板状态
  isProviderPanelOpen: boolean;
  openProviderPanel: () => void;
  closeProviderPanel: () => void;
}

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      isSettingsOpen: false,
      isProviderPanelOpen: false,

      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      resetSettings: () =>
        set({ settings: defaultSettings }),

      openSettings: () =>
        set({ isSettingsOpen: true }),

      closeSettings: () =>
        set({ isSettingsOpen: false }),

      // 供应商 CRUD
      addProvider: (provider) => {
        const id = generateId();
        set((state) => ({
          settings: {
            ...state.settings,
            providers: [...state.settings.providers, { ...provider, id }],
          },
        }));
        return id;
      },

      updateProvider: (id, updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            providers: state.settings.providers.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          },
        })),

      removeProvider: (id) =>
        set((state) => {
          // 移除供应商时，同时清除相关的节点映射
          const newNodeProviders = { ...state.settings.nodeProviders };
          for (const key of Object.keys(newNodeProviders) as (keyof NodeProviderMapping)[]) {
            if (newNodeProviders[key] === id) {
              delete newNodeProviders[key];
            }
          }

          return {
            settings: {
              ...state.settings,
              providers: state.settings.providers.filter((p) => p.id !== id),
              nodeProviders: newNodeProviders,
            },
          };
        }),

      getProviderById: (id) => {
        return get().settings.providers.find((p) => p.id === id);
      },

      // 节点供应商映射
      setNodeProvider: (nodeType, providerId) =>
        set((state) => ({
          settings: {
            ...state.settings,
            nodeProviders: {
              ...state.settings.nodeProviders,
              [nodeType]: providerId,
            },
          },
        })),

      getNodeProvider: (nodeType) => {
        const state = get();
        const providerId = state.settings.nodeProviders[nodeType];
        if (!providerId) return undefined;
        return state.settings.providers.find((p) => p.id === providerId);
      },

      // 供应商面板状态
      openProviderPanel: () =>
        set({ isProviderPanelOpen: true }),

      closeProviderPanel: () =>
        set({ isProviderPanelOpen: false }),
    }),
    {
      name: "next-creator-settings",
      storage: createJSONStorage(() => tauriStorage),
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);

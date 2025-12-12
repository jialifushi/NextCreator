import { useState } from "react";
import { X, Save, RotateCcw, Server } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { Select } from "@/components/ui/Select";
import type { AppSettings } from "@/types";

export function SettingsPanel() {
  const {
    settings,
    isSettingsOpen,
    closeSettings,
    updateSettings,
    resetSettings,
    openProviderPanel,
  } = useSettingsStore();
  const [localTheme, setLocalTheme] = useState<AppSettings["theme"]>(settings.theme);

  if (!isSettingsOpen) return null;

  const handleSave = () => {
    updateSettings({ theme: localTheme });
    closeSettings();
  };

  const handleReset = () => {
    resetSettings();
    setLocalTheme(useSettingsStore.getState().settings.theme);
  };

  const handleOpenProviders = () => {
    closeSettings();
    openProviderPanel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
          <h2 className="text-lg font-semibold">设置</h2>
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={closeSettings}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 供应商管理入口 */}
          <div
            className="flex items-center justify-between p-4 bg-base-200 rounded-xl cursor-pointer hover:bg-base-300 transition-colors"
            onClick={handleOpenProviders}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-medium">供应商管理</div>
                <div className="text-sm text-base-content/50">
                  配置 API 供应商和节点分配
                </div>
              </div>
            </div>
            <div className="text-base-content/30">→</div>
          </div>

          {/* 分隔线 */}
          <div className="divider"></div>

          {/* 主题 */}
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">主题</span>
            </label>
            <Select
              value={localTheme}
              options={[
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
                { value: "system", label: "跟随系统" },
              ]}
              onChange={(value) => setLocalTheme(value as AppSettings["theme"])}
            />
          </div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-base-300 bg-base-200/50">
          <button className="btn btn-ghost gap-2" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={closeSettings}>
              取消
            </button>
            <button className="btn btn-primary gap-2" onClick={handleSave}>
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

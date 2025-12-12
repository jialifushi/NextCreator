import { useState } from "react";
import {
  X,
  Save,
  RotateCcw,
  Server,
  Github,
  ExternalLink,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettingsStore } from "@/stores/settingsStore";
import { Select } from "@/components/ui/Select";
import type { AppSettings } from "@/types";
import {
  checkForUpdates,
  getCurrentVersion,
  GITHUB_REPO,
  PROJECT_INFO,
  type UpdateInfo,
} from "@/services/updateService";

export function SettingsPanel() {
  const {
    settings,
    isSettingsOpen,
    closeSettings,
    updateSettings,
    resetSettings,
    openProviderPanel,
  } = useSettingsStore();
  const [localTheme, setLocalTheme] = useState<AppSettings["theme"]>(
    settings.theme
  );
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

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

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    setUpdateInfo(null);

    try {
      const info = await checkForUpdates();
      setUpdateInfo(info);
    } catch (error) {
      setUpdateError(
        error instanceof Error ? error.message : "检测更新失败，请稍后重试"
      );
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleOpenGitHub = async () => {
    await openUrl(GITHUB_REPO.url);
  };

  const handleOpenRelease = async () => {
    if (updateInfo?.releaseUrl) {
      await openUrl(updateInfo.releaseUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col">
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
              onChange={(value) =>
                setLocalTheme(value as AppSettings["theme"])
              }
            />
          </div>

          {/* 分隔线 */}
          <div className="divider"></div>

          {/* 关于与更新 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-base-content/70" />
              <span className="font-medium">关于</span>
            </div>

            {/* 项目信息卡片 */}
            <div className="bg-base-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">
                    {PROJECT_INFO.name}
                  </span>
                  <span className="badge badge-primary badge-sm">
                    v{getCurrentVersion()}
                  </span>
                </div>
              </div>

              <p className="text-sm text-base-content/70">
                {PROJECT_INFO.description}
              </p>

              <div className="flex items-center gap-4 text-xs text-base-content/50">
                <span>作者: {PROJECT_INFO.author}</span>
                <span>许可证: {PROJECT_INFO.license}</span>
              </div>
            </div>

            {/* GitHub 仓库链接 */}
            <div
              className="flex items-center justify-between p-3 bg-base-200 rounded-xl cursor-pointer hover:bg-base-300 transition-colors"
              onClick={handleOpenGitHub}
            >
              <div className="flex items-center gap-3">
                <Github className="w-5 h-5" />
                <div>
                  <div className="text-sm font-medium">GitHub 仓库</div>
                  <div className="text-xs text-base-content/50">
                    {GITHUB_REPO.owner}/{GITHUB_REPO.repo}
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-base-content/30" />
            </div>

            {/* 检测更新按钮 */}
            <button
              className={`btn btn-outline w-full gap-2 ${
                isCheckingUpdate ? "loading" : ""
              }`}
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
            >
              <RefreshCw
                className={`w-4 h-4 ${isCheckingUpdate ? "animate-spin" : ""}`}
              />
              {isCheckingUpdate ? "正在检测..." : "检测更新"}
            </button>

            {/* 更新结果显示 */}
            {updateInfo && (
              <div
                className={`p-4 rounded-xl ${
                  updateInfo.hasUpdate
                    ? "bg-warning/10 border border-warning/20"
                    : "bg-success/10 border border-success/20"
                }`}
              >
                {updateInfo.hasUpdate ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-warning" />
                      <span className="font-medium text-warning">
                        发现新版本
                      </span>
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-base-content/70">当前版本:</span>
                        <span>v{updateInfo.currentVersion}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-base-content/70">最新版本:</span>
                        <span className="text-warning font-medium">
                          v{updateInfo.latestVersion}
                        </span>
                      </div>
                      {updateInfo.publishedAt && (
                        <div className="flex justify-between">
                          <span className="text-base-content/70">发布时间:</span>
                          <span>
                            {new Date(updateInfo.publishedAt).toLocaleDateString(
                              "zh-CN"
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      className="btn btn-warning btn-sm w-full gap-2"
                      onClick={handleOpenRelease}
                    >
                      <ExternalLink className="w-4 h-4" />
                      前往下载
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <span className="text-success">已是最新版本</span>
                  </div>
                )}
              </div>
            )}

            {/* 错误显示 */}
            {updateError && (
              <div className="p-4 rounded-xl bg-error/10 border border-error/20">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-error" />
                  <span className="text-error text-sm">{updateError}</span>
                </div>
              </div>
            )}
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

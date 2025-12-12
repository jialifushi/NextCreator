import { useState, useEffect } from "react";
import { X, Plus, Pencil, Trash2, Save, Server } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import type { Provider, NodeProviderMapping } from "@/types";

// 节点类型配置
const nodeTypeConfig: { key: keyof NodeProviderMapping; label: string; description: string }[] = [
  { key: "imageGeneratorPro", label: "NanoBanana Pro", description: "高质量图片生成 / PPT 页面图片生成" },
  { key: "imageGeneratorFast", label: "NanoBanana", description: "快速图片生成节点" },
  { key: "videoGenerator", label: "视频生成", description: "Sora 视频生成节点" },
  { key: "llmContent", label: "LLM 内容生成", description: "大语言模型内容生成节点" },
  { key: "llm", label: "PPT 大纲生成", description: "PPT 内容节点的大纲生成部分" },
];

export function ProviderPanel() {
  const {
    settings,
    isProviderPanelOpen,
    closeProviderPanel,
    addProvider,
    updateProvider,
    removeProvider,
    setNodeProvider,
  } = useSettingsStore();

  // 本地状态：节点供应商映射
  const [localNodeProviders, setLocalNodeProviders] = useState<NodeProviderMapping>({});

  // 编辑/添加供应商的弹窗状态
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);

  // 同步初始值
  useEffect(() => {
    if (isProviderPanelOpen) {
      setLocalNodeProviders(settings.nodeProviders || {});
    }
  }, [isProviderPanelOpen, settings.nodeProviders]);

  if (!isProviderPanelOpen) return null;

  // 确保 providers 数组存在
  const providers = settings.providers || [];

  // 保存节点配置
  const handleSave = () => {
    // 更新节点供应商映射
    for (const { key } of nodeTypeConfig) {
      setNodeProvider(key, localNodeProviders[key]);
    }
    closeProviderPanel();
  };

  // 删除供应商
  const handleDeleteProvider = (id: string) => {
    if (confirm("确定要删除此供应商吗？相关节点配置也会被清除。")) {
      removeProvider(id);
      // 同时清除本地状态中的映射
      const newLocalNodeProviders = { ...localNodeProviders };
      for (const key of Object.keys(newLocalNodeProviders) as (keyof NodeProviderMapping)[]) {
        if (newLocalNodeProviders[key] === id) {
          delete newLocalNodeProviders[key];
        }
      }
      setLocalNodeProviders(newLocalNodeProviders);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">供应商管理</h2>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={closeProviderPanel}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 - 可滚动 */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 供应商列表区域 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider">
              供应商列表
            </h3>

            {/* 供应商卡片列表 */}
            {providers.length === 0 ? (
              <div className="text-center py-8 text-base-content/50">
                <Server className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>暂无供应商</p>
                <p className="text-sm">点击下方按钮添加</p>
              </div>
            ) : (
              <div className="space-y-2">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-3 bg-base-200 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{provider.name}</div>
                      <div className="text-sm text-base-content/50 truncate">
                        {provider.baseUrl}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={() => setEditingProvider(provider)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn btn-ghost btn-xs btn-square text-error"
                        onClick={() => handleDeleteProvider(provider.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 添加供应商按钮 */}
            <button
              className="btn btn-outline btn-sm w-full gap-2"
              onClick={() => setIsAddingProvider(true)}
            >
              <Plus className="w-4 h-4" />
              添加供应商
            </button>
          </div>

          {/* 分隔线 */}
          <div className="divider"></div>

          {/* 节点配置区域 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider">
              节点配置
            </h3>

            {providers.length === 0 ? (
              <div className="text-center py-4 text-base-content/50 text-sm">
                请先添加供应商
              </div>
            ) : (
              <div className="space-y-3">
                {nodeTypeConfig.map(({ key, label, description }) => (
                  <div key={key} className="form-control">
                    <label className="label py-1">
                      <span className="label-text font-medium">{label}</span>
                    </label>
                    <Select
                      value={localNodeProviders[key] || ""}
                      placeholder="未配置"
                      options={[
                        { value: "", label: "未配置" },
                        ...providers.map((provider) => ({
                          value: provider.id,
                          label: provider.name,
                        })),
                      ]}
                      onChange={(value) =>
                        setLocalNodeProviders({
                          ...localNodeProviders,
                          [key]: value || undefined,
                        })
                      }
                    />
                    <label className="label py-0.5">
                      <span className="label-text-alt text-base-content/50">
                        {description}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-base-300 bg-base-200/50">
          <button className="btn btn-ghost" onClick={closeProviderPanel}>
            取消
          </button>
          <button className="btn btn-primary gap-2" onClick={handleSave}>
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>

      {/* 添加/编辑供应商弹窗 */}
      {(isAddingProvider || editingProvider) && (
        <ProviderEditModal
          provider={editingProvider}
          onSave={(data) => {
            if (editingProvider) {
              updateProvider(editingProvider.id, data);
            } else {
              addProvider(data);
            }
            setEditingProvider(null);
            setIsAddingProvider(false);
          }}
          onClose={() => {
            setEditingProvider(null);
            setIsAddingProvider(false);
          }}
        />
      )}
    </div>
  );
}

// 供应商编辑弹窗组件
interface ProviderEditModalProps {
  provider: Provider | null;
  onSave: (data: Omit<Provider, "id">) => void;
  onClose: () => void;
}

function ProviderEditModal({ provider, onSave, onClose }: ProviderEditModalProps) {
  const [name, setName] = useState(provider?.name || "");
  const [apiKey, setApiKey] = useState(provider?.apiKey || "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || "");

  const isEditing = !!provider;
  const canSave = name.trim() && apiKey.trim() && baseUrl.trim();

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-base-100 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-base-300">
          <h3 className="font-semibold">
            {isEditing ? "编辑供应商" : "添加供应商"}
          </h3>
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单 */}
        <div className="p-5 space-y-4">
          {/* 名称 */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text font-medium">名称</span>
            </label>
            <Input
              placeholder="例如：我的 API 服务"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* API Key */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text font-medium">API Key</span>
            </label>
            <Input
              isPassword
              placeholder="输入 API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          {/* Base URL */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text font-medium">Base URL</span>
            </label>
            <Input
              placeholder="例如：https://example.com/v1beta"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-base-300 bg-base-200/50">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!canSave}
          >
            {isEditing ? "保存" : "添加"}
          </button>
        </div>
      </div>
    </div>
  );
}

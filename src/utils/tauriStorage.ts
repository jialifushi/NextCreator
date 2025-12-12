/**
 * Tauri Store 存储适配器
 * 用于 Zustand persist 中间件，在 Tauri 环境使用 tauri-plugin-store
 * 浏览器环境降级到 localStorage
 */

import { isTauriEnvironment } from "@/services/fileStorageService";

// Store 实例缓存
let storeInstance: Awaited<ReturnType<typeof import("@tauri-apps/plugin-store").load>> | null = null;

// 获取或创建 Store 实例
async function getStore() {
  if (!isTauriEnvironment()) {
    return null;
  }

  if (!storeInstance) {
    const { load } = await import("@tauri-apps/plugin-store");
    // 使用 load 函数加载或创建 store 文件
    storeInstance = await load("app-data.json", { autoSave: true, defaults: {} });
  }

  return storeInstance;
}

// 获取数据
async function getItem(key: string): Promise<string | null> {
  try {
    const store = await getStore();

    if (store) {
      // Tauri 环境：从 store 读取
      const value = await store.get<string>(key);
      return value ?? null;
    } else {
      // 浏览器环境：降级到 localStorage
      return localStorage.getItem(key);
    }
  } catch (error) {
    console.error("Storage getItem error:", error);
    // 出错时尝试 localStorage
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

// 设置数据
async function setItem(key: string, value: string): Promise<void> {
  try {
    const store = await getStore();

    if (store) {
      // Tauri 环境：写入 store
      await store.set(key, value);
      // autoSave 已启用，无需手动 save
    } else {
      // 浏览器环境：降级到 localStorage
      localStorage.setItem(key, value);
    }
  } catch (error) {
    console.error("Storage setItem error:", error);
    // 出错时尝试 localStorage
    try {
      localStorage.setItem(key, value);
    } catch {
      // 忽略
    }
  }
}

// 删除数据
async function removeItem(key: string): Promise<void> {
  try {
    const store = await getStore();

    if (store) {
      // Tauri 环境：从 store 删除
      await store.delete(key);
    } else {
      // 浏览器环境：降级到 localStorage
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error("Storage removeItem error:", error);
    // 出错时尝试 localStorage
    try {
      localStorage.removeItem(key);
    } catch {
      // 忽略
    }
  }
}

// 导出符合 Zustand StateStorage 接口的对象
export const tauriStorage = {
  getItem,
  setItem,
  removeItem,
};

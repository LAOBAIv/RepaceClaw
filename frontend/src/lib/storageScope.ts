/**
 * storageScope.ts - Plan C 存储作用域统一工具
 *
 * 职责分两层：
 * 1. tab 级隔离：auth / tabId / 当前 tab 生命周期
 * 2. user 级命名：persist key / BroadcastChannel 名称 / 调试清理
 *
 * 规则：
 * - auth 存在 sessionStorage，实现不同 tab 可登录不同账号
 * - sessionStorage 天然按 tab 隔离，因此 persist key 不需要包含 tabId
 * - persist key 必须包含 userId，防止跨用户串号
 */

const TAB_ID_KEY = 'repaceclaw-tab-id';
const AUTH_STORE_KEY = 'repaceclaw-auth';

/**
 * 生成 tabId
 * 格式: tab-{timestamp}-{random}
 */
export function generateTabId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `tab-${timestamp}-${random}`;
}

/**
 * 获取当前 tabId
 * - 如果 sessionStorage 中存在，直接返回
 * - 如果不存在，生成新的 tabId 并存储
 */
export function getOrCreateTabId(): string {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = generateTabId();
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return tabId;
}

/**
 * 获取当前 tabId（仅读取，不创建）
 */
export function getTabId(): string | null {
  return sessionStorage.getItem(TAB_ID_KEY);
}

/**
 * 获取当前用户 ID
 * 优先读 sessionStorage（Day 1 auth 迁移后）
 * 兜底读 localStorage（兼容历史数据）
 */
export function getCurrentUserId(): string | null {
  try {
    let authData = sessionStorage.getItem(AUTH_STORE_KEY);
    if (!authData) authData = localStorage.getItem(AUTH_STORE_KEY);
    if (!authData) return null;
    const parsed = JSON.parse(authData);
    return parsed?.state?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * 生成 tab 级作用域 key
 * 格式: store:{userId}:{tabId}:{key}
 * 用于少量必须按 tab 强隔离的临时键
 */
export function scopeKey(key: string): string {
  const userId = getCurrentUserId() || 'anon';
  const tabId = getOrCreateTabId();
  return `store:${userId}:${tabId}:${key}`;
}

/**
 * 生成用户级作用域 key（不含 tabId）
 * 格式: store:{userId}:{key}
 * 用于跨 tab 共享的数据命名
 */
export function userScopeKey(key: string): string {
  const userId = getCurrentUserId() || 'anon';
  return `store:${userId}:${key}`;
}

/**
 * Zustand persist store 统一 key 生成
 * 格式: rc:{storeName}:{userId}
 */
export function getScopedKey(storeName: string): string {
  const userId = getCurrentUserId();
  return userId ? `rc:${storeName}:${userId}` : `rc:${storeName}:anonymous`;
}

/**
 * BroadcastChannel 频道名（同浏览器多 tab 同步用）
 */
export function getSyncChannel(userId: string): string {
  return `rc-sync-${userId}`;
}

/**
 * 清理当前用户的历史 localStorage 缓存
 * 用于从旧版 localStorage 方案迁移到 Plan C
 */
export function clearUserData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('wb-') || key.startsWith('repaceclaw-conversations-') || key.startsWith('repaceclaw-') || key.startsWith('rc:'))) {
      if (key !== AUTH_STORE_KEY) keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * 清除所有 rc: 前缀 storage（调试 / 退出时兜底清理）
 */
export function clearAllRcStorage(): void {
  for (const storage of [sessionStorage, localStorage]) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith('rc:')) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  }
}

/**
 * 完全清理 sessionStorage
 * 用于退出登录
 */
export function clearAllSessionData(): void {
  sessionStorage.clear();
}

/**
 * 初始化 tab 会话
 * 在登录成功后调用，确保 tabId 已生成
 */
export function initTabSession(): string {
  return getOrCreateTabId();
}